import { createSign, randomUUID } from "crypto";
import type { DocumentType, DriveUploadResult, ValidationResult } from "@/lib/types";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const LOG_FILE_NAME = "documentos-contratacion-log.csv";
const CSV_HEADER = [
  "folio",
  "fecha",
  "nombre_candidato",
  "tipo_documento",
  "archivo",
  "resultado",
  "score",
  "motivos",
  "observaciones",
  "subido_a_drive"
].join(",");

export type CsvLogRow = {
  folio: string;
  fecha: string;
  nombreCandidato: string;
  documentType: DocumentType;
  tipoDocumento: string;
  archivo: string;
  resultado: string;
  score: number;
  motivos: string[];
  observaciones: string;
  subidoADrive: boolean;
};

type DriveFile = {
  id: string;
  name?: string;
  webViewLink?: string;
};

function getPrivateKey() {
  return process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

function hasDriveCredentials() {
  return Boolean(process.env.GOOGLE_CLIENT_EMAIL && getPrivateKey());
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sanitizeDriveName(value: string) {
  return value.replace(/[\\/:*?"<>|#{}%~&]/g, "-").replace(/\s+/g, " ").trim().slice(0, 160);
}

function csvCell(value: string | number | boolean) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function rowToCsv(row: CsvLogRow) {
  return [
    row.folio,
    row.fecha,
    row.nombreCandidato,
    row.tipoDocumento,
    row.archivo,
    row.resultado,
    row.score.toFixed(2),
    row.motivos.join(" | "),
    row.observaciones,
    row.subidoADrive ? "si" : "no"
  ]
    .map(csvCell)
    .join(",");
}

async function getAccessToken() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!clientEmail || !privateKey) {
    throw new Error("Credenciales de Google Drive incompletas.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: DRIVE_SCOPE,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now
    })
  );
  const unsignedToken = `${header}.${claimSet}`;
  const signature = createSign("RSA-SHA256").update(unsignedToken).sign(privateKey);
  const assertion = `${unsignedToken}.${base64Url(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    throw new Error(`No se pudo autenticar con Google: ${await response.text()}`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("Google no devolvio access_token.");
  }
  return payload.access_token;
}

async function driveFetch<T>(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

async function driveUploadFetch<T>(path: string, init: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(`${DRIVE_UPLOAD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

function multipartBody(metadata: Record<string, unknown>, contentType: string, content: Buffer) {
  const boundary = `dpc_${randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
        metadata
      )}\r\n`
    ),
    Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--`)
  ]);

  return {
    body,
    contentType: `multipart/related; boundary=${boundary}`
  };
}

async function findFolder(parentId: string, name: string) {
  const query = [
    "mimeType='application/vnd.google-apps.folder'",
    `name='${escapeDriveQuery(name)}'`,
    `'${escapeDriveQuery(parentId)}' in parents`,
    "trashed=false"
  ].join(" and ");

  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name)",
    pageSize: "1",
    spaces: "drive"
  });

  const payload = await driveFetch<{ files: DriveFile[] }>(`/files?${params.toString()}`);
  return payload.files[0];
}

async function createFolder(parentId: string, name: string) {
  return driveFetch<DriveFile>("/files?fields=id,name", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId]
    })
  });
}

async function ensureCandidateFolder(folio: string, candidateName: string) {
  const rootFolderId = process.env.GOOGLE_DRIVE_APPROVED_FOLDER_ID;
  if (!rootFolderId) {
    throw new Error("GOOGLE_DRIVE_APPROVED_FOLDER_ID no esta configurada.");
  }

  const folderName = sanitizeDriveName(`${folio} - ${candidateName || "Candidato"}`);
  const existing = await findFolder(rootFolderId, folderName);
  if (existing) return existing;
  return createFolder(rootFolderId, folderName);
}

export async function uploadApprovedDocument(params: {
  folio: string;
  candidateName: string;
  documentTitle: string;
  fileName: string;
  mimeType: string;
  fileBuffer: Buffer;
  validation: ValidationResult;
}): Promise<DriveUploadResult> {
  if (!hasDriveCredentials()) {
    return {
      subido: false,
      error: "Google Drive no esta configurado."
    };
  }

  if (!params.validation.puede_continuar || params.validation.estado_validacion !== "aprobado") {
    return {
      subido: false,
      error: "El documento no fue aprobado; no se guarda en la carpeta final."
    };
  }

  try {
    const folder = await ensureCandidateFolder(params.folio, params.candidateName);
    const metadata = {
      name: sanitizeDriveName(`${params.documentTitle} - ${params.fileName}`),
      parents: [folder.id]
    };
    const multipart = multipartBody(
      metadata,
      params.mimeType || "application/octet-stream",
      params.fileBuffer
    );

    const uploaded = await driveUploadFetch<DriveFile>(
      "/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          "Content-Type": multipart.contentType
        },
        body: multipart.body
      }
    );

    return {
      subido: true,
      archivo_id: uploaded.id,
      archivo_nombre: uploaded.name,
      enlace: uploaded.webViewLink,
      carpeta_id: folder.id
    };
  } catch (error) {
    return {
      subido: false,
      error: error instanceof Error ? error.message : "No se pudo subir el archivo a Drive."
    };
  }
}

async function findLogFile(logFolderId: string) {
  const query = [
    `name='${escapeDriveQuery(process.env.GOOGLE_DRIVE_LOG_FILE_NAME || LOG_FILE_NAME)}'`,
    `'${escapeDriveQuery(logFolderId)}' in parents`,
    "trashed=false"
  ].join(" and ");

  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name)",
    pageSize: "1",
    spaces: "drive"
  });

  const payload = await driveFetch<{ files: DriveFile[] }>(`/files?${params.toString()}`);
  return payload.files[0];
}

async function createLogFile(logFolderId: string, content: string) {
  const metadata = {
    name: process.env.GOOGLE_DRIVE_LOG_FILE_NAME || LOG_FILE_NAME,
    mimeType: "text/csv",
    parents: [logFolderId]
  };
  const multipart = multipartBody(metadata, "text/csv; charset=utf-8", Buffer.from(content));

  return driveUploadFetch<DriveFile>("/files?uploadType=multipart&fields=id,name", {
    method: "POST",
    headers: {
      "Content-Type": multipart.contentType
    },
    body: multipart.body
  });
}

async function downloadTextFile(fileId: string) {
  const token = await getAccessToken();
  const response = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.text();
}

async function updateTextFile(fileId: string, content: string) {
  const uploaded = await driveUploadFetch<DriveFile>(
    `/files/${fileId}?uploadType=media&fields=id,name`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "text/csv; charset=utf-8"
      },
      body: Buffer.from(content)
    }
  );
  return uploaded;
}

export async function appendValidationLog(row: CsvLogRow) {
  if (!hasDriveCredentials()) {
    return {
      registrado: false,
      error: "Google Drive no esta configurado."
    };
  }

  const rowCsv = rowToCsv(row);
  const logFolderId = process.env.GOOGLE_DRIVE_LOG_FOLDER_ID;
  const configuredFileId = process.env.GOOGLE_DRIVE_LOG_FILE_ID;

  if (!logFolderId && !configuredFileId) {
    return {
      registrado: false,
      error: "Configura GOOGLE_DRIVE_LOG_FOLDER_ID o GOOGLE_DRIVE_LOG_FILE_ID."
    };
  }

  try {
    if (configuredFileId) {
      const current = await downloadTextFile(configuredFileId);
      const next = current.trim()
        ? `${current.trimEnd()}\n${rowCsv}\n`
        : `${CSV_HEADER}\n${rowCsv}\n`;
      const file = await updateTextFile(configuredFileId, next);
      return {
        registrado: true,
        archivo_id: file.id
      };
    }

    const existing = await findLogFile(logFolderId as string);
    if (!existing) {
      const file = await createLogFile(logFolderId as string, `${CSV_HEADER}\n${rowCsv}\n`);
      return {
        registrado: true,
        archivo_id: file.id
      };
    }

    const current = await downloadTextFile(existing.id);
    const next = current.trim()
      ? `${current.trimEnd()}\n${rowCsv}\n`
      : `${CSV_HEADER}\n${rowCsv}\n`;
    const file = await updateTextFile(existing.id, next);

    return {
      registrado: true,
      archivo_id: file.id
    };
  } catch (error) {
    return {
      registrado: false,
      error: error instanceof Error ? error.message : "No se pudo registrar el log CSV."
    };
  }
}
