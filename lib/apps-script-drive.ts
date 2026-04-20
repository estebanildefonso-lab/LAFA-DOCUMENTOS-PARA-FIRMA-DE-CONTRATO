import type { CsvLogRow } from "@/lib/google-drive";
import type { DocumentType, DriveUploadResult, ValidationResult } from "@/lib/types";

type AppsScriptResponse = {
  ok?: boolean;
  subido?: boolean;
  archivo_id?: string | null;
  archivo_nombre?: string | null;
  enlace?: string | null;
  carpeta_id?: string | null;
  log_registrado?: boolean;
  log_archivo_id?: string | null;
  error?: string;
};

type AppsScriptProcessParams = {
  folio: string;
  candidateName: string;
  documentType: DocumentType;
  documentTitle: string;
  fileName: string;
  mimeType: string;
  fileBuffer: Buffer;
  validation: ValidationResult;
  logRow: CsvLogRow;
};

function appsScriptConfigured() {
  return Boolean(process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL && process.env.GOOGLE_APPS_SCRIPT_SECRET);
}

function normalizeAppsScriptUrl(url: string) {
  return url.trim();
}

function toDriveResult(payload: AppsScriptResponse): DriveUploadResult {
  if (!payload.ok) {
    return {
      subido: false,
      error: payload.error || "Apps Script no pudo procesar el documento."
    };
  }

  return {
    subido: Boolean(payload.subido),
    archivo_id: payload.archivo_id || undefined,
    archivo_nombre: payload.archivo_nombre || undefined,
    enlace: payload.enlace || undefined,
    carpeta_id: payload.carpeta_id || undefined,
    error: payload.subido ? undefined : "El documento no fue aprobado; no se guarda en aprobados."
  };
}

export async function processDocumentWithAppsScript(params: AppsScriptProcessParams) {
  if (!appsScriptConfigured()) {
    return {
      drive: {
        subido: false,
        error: "GOOGLE_APPS_SCRIPT_WEBHOOK_URL o GOOGLE_APPS_SCRIPT_SECRET no estan configuradas."
      },
      log: {
        registrado: false,
        error: "Apps Script no esta configurado."
      }
    };
  }

  const shouldUpload =
    params.validation.puede_continuar && params.validation.estado_validacion === "aprobado";

  try {
    const response = await fetch(normalizeAppsScriptUrl(process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL as string), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        secret: process.env.GOOGLE_APPS_SCRIPT_SECRET,
        shouldUpload,
        folio: params.folio,
        fecha: params.logRow.fecha,
        nombreCandidato: params.candidateName,
        documentType: params.documentType,
        tipoDocumento: params.validation.tipo_documento || params.documentTitle,
        fileName: `${params.documentTitle} - ${params.fileName}`,
        mimeType: params.mimeType || "application/octet-stream",
        fileBase64: shouldUpload ? params.fileBuffer.toString("base64") : "",
        resultado: params.validation.estado_validacion,
        score: params.validation.score_confianza,
        motivos: params.validation.motivos,
        observaciones: params.validation.observaciones
      })
    });

    const text = await response.text();
    let payload: AppsScriptResponse;

    try {
      payload = JSON.parse(text) as AppsScriptResponse;
    } catch {
      payload = {
        ok: false,
        error: text.slice(0, 500) || "Apps Script devolvio una respuesta no JSON."
      };
    }

    const drive = toDriveResult(payload);

    return {
      drive,
      log: {
        registrado: Boolean(payload.ok && payload.log_registrado),
        archivo_id: payload.log_archivo_id || undefined,
        error: payload.ok ? undefined : payload.error || "No se pudo registrar el log en Apps Script."
      }
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo contactar el webhook de Apps Script.";

    return {
      drive: {
        subido: false,
        error: message
      },
      log: {
        registrado: false,
        error: message
      }
    };
  }
}
