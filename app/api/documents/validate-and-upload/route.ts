import { NextResponse } from "next/server";
import {
  ALLOWED_FILE_TYPES,
  DOCUMENTS,
  MAX_FILE_SIZE_BYTES,
  formatCandidateName,
  getDocumentRequirement,
  preferDetectedNameOrder
} from "@/lib/documents";
import { processDocumentWithAppsScript } from "@/lib/apps-script-drive";
import { appendValidationLog, uploadApprovedDocument } from "@/lib/google-drive";
import { validateDocumentWithOpenAI } from "@/lib/openai-validation";
import type { CandidateData, DocumentType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function isDocumentType(value: FormDataEntryValue | null): value is DocumentType {
  return typeof value === "string" && DOCUMENTS.some((document) => document.id === value);
}

function parseCandidate(value: FormDataEntryValue | null): CandidateData | null {
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value) as CandidateData;
    if (
      typeof parsed.apellidoPaterno === "string" &&
      typeof parsed.apellidoMaterno === "string" &&
      typeof parsed.nombres === "string"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function inferMimeType(file: File) {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function isAllowedServerFile(file: File) {
  const mimeType = inferMimeType(file);
  return ALLOWED_FILE_TYPES.includes(mimeType);
}

function shouldUseAppsScriptDriveProvider() {
  return process.env.DRIVE_PROVIDER === "apps_script";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const folioValue = formData.get("folio");
    const documentTypeValue = formData.get("documentType");
    const officialCandidateNameValue = formData.get("officialCandidateName");
    const candidate = parseCandidate(formData.get("candidate"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Archivo requerido." }, { status: 400 });
    }

    if (typeof folioValue !== "string" || !folioValue.trim()) {
      return NextResponse.json({ error: "Folio requerido." }, { status: 400 });
    }

    if (!isDocumentType(documentTypeValue)) {
      return NextResponse.json({ error: "Tipo de documento invalido." }, { status: 400 });
    }

    if (!candidate) {
      return NextResponse.json({ error: "Datos personales invalidos." }, { status: 400 });
    }

    if (!isAllowedServerFile(file)) {
      return NextResponse.json(
        { error: "Formato no permitido. Usa PDF, JPG, PNG o WEBP." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "El archivo supera 10 MB." }, { status: 400 });
    }

    const documentType = documentTypeValue;
    const requirement = getDocumentRequirement(documentType);
    const mimeType = inferMimeType(file);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const capturedCandidateName = formatCandidateName(candidate);
    const officialCandidateName =
      typeof officialCandidateNameValue === "string" && officialCandidateNameValue.trim()
        ? officialCandidateNameValue.trim()
        : "";

    const validation = await validateDocumentWithOpenAI({
      documentType,
      candidate,
      fileName: file.name,
      mimeType,
      fileBuffer
    });
    const candidateName =
      officialCandidateName && documentType !== "ine"
        ? officialCandidateName
        : preferDetectedNameOrder(capturedCandidateName, validation.nombre_detectado);

    const logRow = {
      folio: folioValue,
      fecha: new Date().toISOString(),
      nombreCandidato: candidateName,
      curp: validation.curp_detectada,
      documentType,
      tipoDocumento: validation.tipo_documento,
      archivo: file.name,
      resultado: validation.estado_validacion,
      score: validation.score_confianza,
      motivos: validation.motivos,
      observaciones: validation.observaciones,
      subidoADrive: false
    };

    if (shouldUseAppsScriptDriveProvider()) {
      const { drive, log } = await processDocumentWithAppsScript({
        folio: folioValue,
        candidateName,
        documentType,
        documentTitle: requirement?.shortTitle || validation.tipo_documento,
        fileName: file.name,
        mimeType,
        fileBuffer,
        validation,
        logRow
      });

      return NextResponse.json({
        folio: folioValue,
        validation,
        drive,
        log
      });
    }

    const drive = await uploadApprovedDocument({
      folio: folioValue,
      candidateName,
      documentTitle: requirement?.shortTitle || validation.tipo_documento,
      fileName: file.name,
      mimeType,
      fileBuffer,
      validation
    });

    const log = await appendValidationLog({
      ...logRow,
      subidoADrive: drive.subido
    });

    return NextResponse.json({
      folio: folioValue,
      validation,
      drive,
      log
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo validar ni procesar el documento."
      },
      { status: 500 }
    );
  }
}
