import { getDocumentRequirement, formatCandidateName } from "@/lib/documents";
import type { CandidateData, DocumentType, ValidationResult, ValidationStatus } from "@/lib/types";

type OpenAIValidationParams = {
  documentType: DocumentType;
  candidate: CandidateData;
  fileName: string;
  mimeType: string;
  fileBuffer: Buffer;
};

type RawValidation = Partial<ValidationResult> & {
  motivos?: unknown;
};

type OpenAIErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

const validationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    tipo_documento: { type: "string" },
    estado_validacion: {
      type: "string",
      enum: ["aprobado", "rechazado", "requiere_revision"]
    },
    score_confianza: {
      type: "number",
      minimum: 0,
      maximum: 1
    },
    puede_continuar: { type: "boolean" },
    motivos: {
      type: "array",
      items: { type: "string" }
    },
    nombre_detectado: {
      anyOf: [{ type: "string" }, { type: "null" }]
    },
    observaciones: { type: "string" }
  },
  required: [
    "tipo_documento",
    "estado_validacion",
    "score_confianza",
    "puede_continuar",
    "motivos",
    "nombre_detectado",
    "observaciones"
  ]
};

function inferMimeType(fileName: string, mimeType: string) {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function clampScore(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeStatus(value: unknown): ValidationStatus {
  if (value === "aprobado" || value === "rechazado" || value === "requiere_revision") {
    return value;
  }
  return "requiere_revision";
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function sanitizeValidation(raw: RawValidation, fallbackType: string): ValidationResult {
  const estado = normalizeStatus(raw.estado_validacion);
  const score = clampScore(raw.score_confianza);
  const motivos = normalizeStringList(raw.motivos);
  const puedeContinuar = Boolean(raw.puede_continuar) && estado === "aprobado";

  return {
    tipo_documento:
      typeof raw.tipo_documento === "string" && raw.tipo_documento.trim()
        ? raw.tipo_documento.trim()
        : fallbackType,
    estado_validacion: estado,
    score_confianza: score,
    puede_continuar: puedeContinuar,
    motivos: motivos.length ? motivos : ["Validacion sin motivos detallados."],
    nombre_detectado:
      typeof raw.nombre_detectado === "string" && raw.nombre_detectado.trim()
        ? raw.nombre_detectado.trim()
        : null,
    observaciones:
      typeof raw.observaciones === "string" && raw.observaciones.trim()
        ? raw.observaciones.trim()
        : "Sin observaciones adicionales."
  };
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const maybeOutputText = (payload as { output_text?: unknown }).output_text;
  if (typeof maybeOutputText === "string") return maybeOutputText;

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      return Array.isArray(content) ? content : [];
    })
    .map((content) => {
      if (!content || typeof content !== "object") return "";
      const text = (content as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function buildPrompt(params: OpenAIValidationParams) {
  const requirement = getDocumentRequirement(params.documentType);
  const candidateName = formatCandidateName(params.candidate);
  const today = new Date().toISOString().slice(0, 10);
  const expectedTitle = requirement?.title || params.documentType;
  const checklist = requirement?.validationChecklist || [
    "El archivo debe corresponder al tipo de documento esperado.",
    "Debe ser legible y parecer valido.",
    "Debe cumplir la regla especifica indicada."
  ];
  const notRequired = requirement?.notRequired || [
    "No evalues documentos distintos al tipo esperado.",
    "La ausencia de otros documentos no afecta esta validacion."
  ];

  return [
    "Eres un validador de documentos para contratacion en Mexico.",
    "Analiza el archivo adjunto y responde solo con JSON valido conforme al esquema.",
    "Cada archivo se valida de forma independiente.",
    "No estas validando un expediente completo; estas validando solo el documento actual.",
    "",
    `Fecha actual: ${today}`,
    `Tipo esperado: ${expectedTitle}`,
    `Regla especifica: ${requirement?.rule || "Validar que el documento corresponda."}`,
    `Nombre capturado: ${candidateName}`,
    `Apellido paterno capturado: ${params.candidate.apellidoPaterno}`,
    `Apellido materno capturado: ${params.candidate.apellidoMaterno}`,
    `Nombre(s) capturado(s): ${params.candidate.nombres}`,
    "",
    `Criterios exclusivos para ${expectedTitle}:`,
    ...checklist.map((item) => `- ${item}`),
    "",
    "Cosas que NO debes exigir en este documento:",
    ...notRequired.map((item) => `- ${item}`),
    "",
    "Si el archivo pertenece a otro tipo de documento distinto al tipo esperado, usa rechazado.",
    "Si el archivo parece del tipo esperado pero falta legibilidad o un dato clave, usa requiere_revision.",
    "Usa estado_validacion = aprobado solo si el documento actual cumple sus criterios propios.",
    "Usa puede_continuar = true solo cuando tambien deba subirse a Drive.",
    "No incluyas motivos sobre CURP, RFC, NSS, domicilio o banco salvo que sean parte del tipo esperado actual.",
    "En motivos y observaciones, habla unicamente del documento actual."
  ].join("\n");
}

function localMissingApiKeyResult(documentType: DocumentType): ValidationResult {
  const requirement = getDocumentRequirement(documentType);

  return {
    tipo_documento: requirement?.title || documentType,
    estado_validacion: "requiere_revision",
    score_confianza: 0,
    puede_continuar: false,
    motivos: ["OPENAI_API_KEY no esta configurada en el servidor."],
    nombre_detectado: null,
    observaciones:
      "La aplicacion funciona localmente, pero necesita credenciales de OpenAI para validar documentos reales."
  };
}

function buildOpenAIErrorResult(
  detail: string,
  fallbackType: string,
  status: number
): ValidationResult {
  let parsed: OpenAIErrorPayload | null = null;

  try {
    parsed = JSON.parse(detail) as OpenAIErrorPayload;
  } catch {
    parsed = null;
  }

  const code = parsed?.error?.code;
  const message = parsed?.error?.message || detail;

  if (code === "insufficient_quota") {
    return {
      tipo_documento: fallbackType,
      estado_validacion: "requiere_revision",
      score_confianza: 0,
      puede_continuar: false,
      motivos: ["Tu cuenta o proyecto de OpenAI no tiene cuota o saldo disponible."],
      nombre_detectado: null,
      observaciones:
        "Revisa Billing y Usage en OpenAI. Agrega creditos, metodo de pago o aumenta el limite mensual del proyecto antes de reintentar."
    };
  }

  if (code === "invalid_api_key") {
    return {
      tipo_documento: fallbackType,
      estado_validacion: "requiere_revision",
      score_confianza: 0,
      puede_continuar: false,
      motivos: ["La API key de OpenAI es invalida o fue revocada."],
      nombre_detectado: null,
      observaciones: "Genera una nueva API key, guardala en .env.local y reinicia el servidor."
    };
  }

  if (code === "model_not_found") {
    return {
      tipo_documento: fallbackType,
      estado_validacion: "requiere_revision",
      score_confianza: 0,
      puede_continuar: false,
      motivos: ["El modelo configurado en OPENAI_MODEL no esta disponible para esta cuenta."],
      nombre_detectado: null,
      observaciones: "Cambia OPENAI_MODEL por un modelo disponible para tu proyecto y reinicia el servidor."
    };
  }

  return {
    tipo_documento: fallbackType,
    estado_validacion: "requiere_revision",
    score_confianza: 0,
    puede_continuar: false,
    motivos: [`OpenAI no pudo procesar el documento. Codigo HTTP ${status}.`],
    nombre_detectado: null,
    observaciones: message.slice(0, 500) || "Respuesta no exitosa de OpenAI."
  };
}

export async function validateDocumentWithOpenAI(
  params: OpenAIValidationParams
): Promise<ValidationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const requirement = getDocumentRequirement(params.documentType);

  if (!apiKey) {
    return localMissingApiKeyResult(params.documentType);
  }

  const mimeType = inferMimeType(params.fileName, params.mimeType);
  const base64 = params.fileBuffer.toString("base64");
  const fileData = `data:${mimeType};base64,${base64}`;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const prompt = buildPrompt(params);

  const filePart = mimeType.startsWith("image/")
    ? {
        type: "input_image",
        image_url: fileData
      }
    : {
        type: "input_file",
        filename: params.fileName,
        file_data: fileData
      };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt
            },
            filePart
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "document_validation",
          strict: true,
          schema: validationSchema
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    return buildOpenAIErrorResult(detail, requirement?.title || params.documentType, response.status);
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);

  try {
    return sanitizeValidation(JSON.parse(outputText) as RawValidation, requirement?.title || params.documentType);
  } catch {
    return {
      tipo_documento: requirement?.title || params.documentType,
      estado_validacion: "requiere_revision",
      score_confianza: 0,
      puede_continuar: false,
      motivos: ["La respuesta de OpenAI no tuvo JSON valido."],
      nombre_detectado: null,
      observaciones: outputText.slice(0, 500) || "Sin contenido interpretable."
    };
  }
}
