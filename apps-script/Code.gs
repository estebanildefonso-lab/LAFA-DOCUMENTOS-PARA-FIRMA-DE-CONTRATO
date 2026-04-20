const SECRET = "PEGA_AQUI_EL_MISMO_SECRET_DE_RAILWAY";
const SCRIPT_VERSION = "csv-por-candidato-v2-2026-04-20";
const APPROVED_FOLDER_ID = "1c-ZnEzPKntiSt8mOTwgXjs7k_US_LtCX";
const LOG_FOLDER_ID = "1zW32uufou3i6BU2tb-RLJIZ2w0Ti7PeQ";
const LOG_FILE_NAME = "documentos-contratacion-log.csv";
const DOCUMENT_COLUMNS = {
  acta_nacimiento: "AN",
  curp: "CURP",
  rfc: "RFC",
  nss: "NSS",
  comprobante_domicilio: "DOM",
  estado_cuenta_bancario: "BANCO"
};
const CSV_HEADER = buildCandidateHeader();

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.secret !== SECRET) {
      return jsonResponse({
        ok: false,
        error: "No autorizado",
        version: SCRIPT_VERSION,
        expected_secret_length: SECRET.length
      });
    }

    const approvedFolder = DriveApp.getFolderById(APPROVED_FOLDER_ID);
    const logFolder = DriveApp.getFolderById(LOG_FOLDER_ID);
    const shouldUpload = body.shouldUpload === true;
    let uploadedFile = null;

    if (shouldUpload) {
      const candidateFolder = getOrCreateFolder(
        approvedFolder,
        sanitizeName(body.folio + " - " + body.nombreCandidato)
      );
      const bytes = Utilities.base64Decode(body.fileBase64);
      const blob = Utilities.newBlob(bytes, body.mimeType, sanitizeName(body.fileName));
      uploadedFile = candidateFolder.createFile(blob);
    }

    const logFile = upsertCandidateCsvLog(logFolder, {
      folio: body.folio,
      fecha: body.fecha,
      nombreCandidato: body.nombreCandidato,
      documentType: body.documentType,
      tipoDocumento: body.tipoDocumento,
      archivo: body.fileName,
      resultado: body.resultado,
      score: body.score,
      motivos: Array.isArray(body.motivos) ? body.motivos.join(" | ") : "",
      observaciones: body.observaciones || "",
      subidoADrive: uploadedFile ? "si" : "no",
      enlace: uploadedFile ? uploadedFile.getUrl() : ""
    });

    return jsonResponse({
      ok: true,
      subido: Boolean(uploadedFile),
      archivo_id: uploadedFile ? uploadedFile.getId() : null,
      archivo_nombre: uploadedFile ? uploadedFile.getName() : null,
      enlace: uploadedFile ? uploadedFile.getUrl() : null,
      carpeta_id: uploadedFile ? uploadedFile.getParents().next().getId() : null,
      log_registrado: true,
      log_archivo_id: logFile.getId()
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: String(error)
    });
  }
}

function doGet() {
  return jsonResponse({
    ok: true,
    version: SCRIPT_VERSION,
    expected_secret_length: SECRET.length,
    approved_folder_id: APPROVED_FOLDER_ID,
    log_folder_id: LOG_FOLDER_ID
  });
}

function getOrCreateFolder(parentFolder, name) {
  const folders = parentFolder.getFoldersByName(name);

  if (folders.hasNext()) {
    return folders.next();
  }

  return parentFolder.createFolder(name);
}

function upsertCandidateCsvLog(logFolder, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const file = getOrCreateLogFile(logFolder);
    const current = file.getBlob().getDataAsString();
    let rows = [];

    if (current.trim()) {
      rows = parseCsv(current);

      if (!hasCandidateHeader(rows[0])) {
        file.makeCopy(buildBackupName(), logFolder);
        rows = [];
      }
    }

    const records = csvRowsToRecords(rows);
    const folio = String(row.folio || "").trim();
    const recordIndex = records.findIndex((record) => record.folio === folio);
    const record = recordIndex >= 0 ? records[recordIndex] : buildBlankCandidateRecord();
    const code = DOCUMENT_COLUMNS[row.documentType] || sanitizeColumnCode(row.tipoDocumento);

    record.folio = folio;
    record.nombre_candidato = row.nombreCandidato || record.nombre_candidato;
    record.fecha_creacion = record.fecha_creacion || row.fecha;
    record.fecha_actualizacion = row.fecha;
    record["estado " + code] = row.resultado || "";
    record["score " + code] = formatScore(row.score);
    record["archivo " + code] = row.archivo || "";
    record["observaciones " + code] = row.observaciones || "";
    record["motivos " + code] = row.motivos || "";
    record["subido_drive " + code] = row.subidoADrive || "no";
    record["link " + code] = row.enlace || record["link " + code] || "";

    if (recordIndex >= 0) {
      records[recordIndex] = record;
    } else {
      records.push(record);
    }

    file.setContent(recordsToCsv(records));
    return file;
  } finally {
    lock.releaseLock();
  }
}

function buildCandidateHeader() {
  const header = ["folio", "fecha_creacion", "fecha_actualizacion", "nombre_candidato"];
  const codes = ["AN", "CURP", "RFC", "NSS", "DOM", "BANCO"];

  codes.forEach(function (code) {
    header.push("estado " + code);
    header.push("score " + code);
    header.push("archivo " + code);
    header.push("observaciones " + code);
    header.push("motivos " + code);
    header.push("subido_drive " + code);
    header.push("link " + code);
  });

  return header;
}

function getOrCreateLogFile(logFolder) {
  const files = logFolder.getFilesByName(LOG_FILE_NAME);

  if (files.hasNext()) {
    return files.next();
  }

  return logFolder.createFile(LOG_FILE_NAME, CSV_HEADER.join(",") + "\n", MimeType.CSV);
}

function buildBlankCandidateRecord() {
  const record = {};

  CSV_HEADER.forEach(function (column) {
    record[column] = "";
  });

  return record;
}

function hasCandidateHeader(headerRow) {
  if (!Array.isArray(headerRow)) {
    return false;
  }

  return ["folio", "fecha_creacion", "fecha_actualizacion", "nombre_candidato", "estado AN", "score AN"]
    .every(function (column) {
      return headerRow.indexOf(column) >= 0;
    });
}

function csvRowsToRecords(rows) {
  if (!rows.length || !hasCandidateHeader(rows[0])) {
    return [];
  }

  const header = rows[0];

  return rows.slice(1)
    .filter(function (row) {
      return row.some(function (cell) {
        return String(cell || "").trim();
      });
    })
    .map(function (row) {
      const record = buildBlankCandidateRecord();

      header.forEach(function (column, index) {
        if (CSV_HEADER.indexOf(column) >= 0) {
          record[column] = row[index] || "";
        }
      });

      return record;
    });
}

function recordsToCsv(records) {
  const lines = [CSV_HEADER.map(csvCell).join(",")];

  records.forEach(function (record) {
    lines.push(CSV_HEADER.map(function (column) {
      return csvCell(record[column] || "");
    }).join(","));
  });

  return lines.join("\n") + "\n";
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    const next = content[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function csvCell(value) {
  const text = String(value || "");

  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return '"' + text.replace(/"/g, '""') + '"';
}

function formatScore(value) {
  const number = Number(value);

  if (!isFinite(number)) {
    return "";
  }

  return number.toFixed(2);
}

function sanitizeColumnCode(value) {
  const code = String(value || "DOC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .slice(0, 20);

  return code || "DOC";
}

function buildBackupName() {
  return LOG_FILE_NAME.replace(/\.csv$/i, "") + "-backup-" + Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMdd-HHmmss"
  ) + ".csv";
}

function sanitizeName(value) {
  return String(value || "archivo")
    .replace(/[\\/:*?"<>|#{}%~&]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
