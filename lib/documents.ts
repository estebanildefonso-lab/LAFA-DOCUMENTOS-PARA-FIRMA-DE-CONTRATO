import type { DocumentType } from "@/lib/types";

export type DocumentRequirement = {
  id: DocumentType;
  title: string;
  shortTitle: string;
  description: string;
  rule: string;
  validationChecklist: string[];
  notRequired: string[];
};

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
];

export const DOCUMENTS: DocumentRequirement[] = [
  {
    id: "acta_nacimiento",
    title: "Acta de nacimiento",
    shortTitle: "Acta",
    description: "Sube una copia completa y legible del acta.",
    rule: "Debe parecer acta de nacimiento oficial y el nombre debe coincidir.",
    validationChecklist: [
      "Debe corresponder a un acta de nacimiento, no a otro documento.",
      "Debe verse como formato oficial de Registro Civil o equivalente.",
      "Debe mostrar titulo o texto equivalente a Acta de nacimiento.",
      "Debe contener el nombre completo de la persona y coincidir con los datos capturados.",
      "Debe mostrar datos propios del acta como fecha/lugar de nacimiento, sexo, entidad de registro, oficialia, libro, acta, foja o campos similares.",
      "Debe mostrar nombres de madre, padre o personas progenitoras cuando el formato los incluya.",
      "Debe ser legible en las zonas donde aparece el nombre y los datos principales."
    ],
    notRequired: [
      "No exijas CURP, RFC, NSS, comprobante de domicilio ni datos bancarios en el acta.",
      "No rechaces el acta por no incluir regimen fiscal, QR fiscal, cuenta o CLABE.",
      "La ausencia de otros documentos no afecta esta validacion."
    ]
  },
  {
    id: "curp",
    title: "CURP",
    shortTitle: "CURP",
    description: "Sube el documento oficial de CURP.",
    rule: "Debe ser constancia/documento de CURP, legible, mostrar CURP completa, y el nombre debe coincidir.",
    validationChecklist: [
      "Debe corresponder a una constancia o documento oficial de CURP.",
      "Debe mostrar una CURP de 18 caracteres con formato valido aparente.",
      "Debe extraer la CURP completa en curp_detectada.",
      "Debe contener el nombre completo de la persona y coincidir con los datos capturados aunque el orden sea distinto.",
      "Devuelve nombre_detectado como nombre completo oficial segun la constancia CURP.",
      "Debe ser legible en nombre, CURP y datos principales.",
      "Puede contener codigo QR, codigo de barras o sello, pero no es obligatorio si el documento luce oficial."
    ],
    notRequired: [
      "No exijas RFC, NSS, comprobante de domicilio ni datos bancarios en la CURP.",
      "No rechaces por no mostrar regimen fiscal, cuenta, CLABE o nombres de padres.",
      "La ausencia de otros documentos no afecta esta validacion."
    ]
  },
  {
    id: "rfc",
    title: "RFC",
    shortTitle: "RFC",
    description: "Sube la constancia de situacion fiscal actualizada.",
    rule: "Debe ser constancia fiscal, incluir QR/CIF, regimen de sueldos y salarios, y vigencia no mayor a 3 meses.",
    validationChecklist: [
      "Debe corresponder a Constancia de Situacion Fiscal, Cedula de Identificacion Fiscal o documento equivalente del SAT.",
      "Debe mostrar RFC y nombre o razon social de la persona, con coincidencia contra los datos capturados cuando sea visible.",
      "Debe mostrar QR, codigo CIF o elemento verificable equivalente.",
      "Debe incluir Regimen de Sueldos y Salarios e Ingresos Asimilados a Salarios, o texto claramente equivalente.",
      "Debe tener fecha de emision, generacion o actualizacion no mayor a 3 meses respecto a la fecha actual.",
      "Si la fecha no es legible o no se puede confirmar la vigencia, usa requiere_revision."
    ],
    notRequired: [
      "No exijas NSS, comprobante de domicilio, acta de nacimiento ni datos bancarios en el RFC.",
      "No rechaces por ausencia de padres, cuenta o CLABE.",
      "La ausencia de otros documentos no afecta esta validacion."
    ]
  },
  {
    id: "nss",
    title: "Numero de Seguridad Social",
    shortTitle: "NSS",
    description: "Sube el comprobante oficial de NSS, hoja rosa o comprobante digital del IMSS.",
    rule: "Debe ser comprobante oficial de asignacion/localizacion de NSS; no debe ser cartilla, carnet, credencial, gafete o tarjeta medica del IMSS.",
    validationChecklist: [
      "Debe corresponder a comprobante, asignacion o localizacion del Numero de Seguridad Social.",
      "Acepta la llamada hoja rosa, hoja de afiliacion, comprobante digital, constancia o formato equivalente del IMSS solo si su finalidad principal es comprobar el NSS.",
      "Debe parecer emitido por IMSS, portal oficial IMSS Digital o un formato oficial equivalente.",
      "Debe mostrar NSS, Numero de Seguridad Social o numero de afiliacion, normalmente de 11 digitos.",
      "Debe contener el nombre de la persona y coincidir con los datos capturados cuando sea visible.",
      "Debe ser legible en nombre y numero.",
      "Debe rechazarse si es cartilla del IMSS, carnet de citas, carnet de salud, credencial, tarjeta medica, foto de gafete o documento de atencion medica aunque muestre nombre o NSS.",
      "Senales de cartilla/carnet IMSS que deben rechazarse: Agregado Medico, Unidad Medica, UMF, consultorio, horario, fotografia, identificacion, datos generales, domicilio, lugar y fecha de nacimiento, PREVENIMSS, cedula original, sello digital o secuencia notarial.",
      "Si el documento muestra No. Seg Social o NSS pero su formato principal es de cartilla, carnet, citas o atencion medica, usa rechazado.",
      "Si solo aparece un numero parecido a NSS dentro de otro documento que no es comprobante de asignacion/localizacion, usa rechazado."
    ],
    notRequired: [
      "No exijas CURP, RFC, comprobante de domicilio ni datos bancarios en el NSS.",
      "No rechaces por no mostrar regimen fiscal, QR fiscal, acta o nombres de padres.",
      "No rechaces solo porque el comprobante actual no sea literalmente de color rosa.",
      "La ausencia de otros documentos no afecta esta validacion."
    ]
  },
  {
    id: "comprobante_domicilio",
    title: "Comprobante de domicilio",
    shortTitle: "Domicilio",
    description: "Sube un recibo o comprobante claro.",
    rule: "Debe ser legible, mostrar domicilio y parecer comprobante valido.",
    validationChecklist: [
      "Debe corresponder a un comprobante de domicilio, recibo de servicio, estado de cuenta o documento equivalente que muestre direccion.",
      "Debe mostrar domicilio completo o suficientemente identificable.",
      "Debe mostrar proveedor, institucion, emisor o datos que lo hagan parecer documento real.",
      "Debe ser legible en direccion y datos principales.",
      "El nombre puede no coincidir con el candidato; no lo rechaces solo por eso.",
      "Si hay fecha visible, debe parecer reciente o razonable para uso como comprobante."
    ],
    notRequired: [
      "No exijas CURP, RFC, NSS, acta de nacimiento ni datos bancarios si el documento ya comprueba domicilio.",
      "No rechaces por ausencia de QR fiscal, regimen o nombres de padres.",
      "La ausencia de otros documentos no afecta esta validacion."
    ]
  },
  {
    id: "estado_cuenta_bancario",
    title: "Estado de cuenta bancario",
    shortTitle: "Banco",
    description: "Sube un estado de cuenta o documento bancario.",
    rule: "Debe parecer documento bancario y mostrar cuenta o CLABE.",
    validationChecklist: [
      "Debe corresponder a estado de cuenta, caratula bancaria, constancia bancaria o documento equivalente.",
      "Debe mostrar banco o institucion financiera.",
      "Debe mostrar cuenta, CLABE o numero equivalente para dispersion.",
      "Debe mostrar nombre del titular y debe coincidir con los datos capturados cuando sea visible.",
      "Debe ser legible en nombre, banco y cuenta o CLABE.",
      "No es necesario ver saldos, movimientos o montos; pueden estar ocultos."
    ],
    notRequired: [
      "No exijas CURP, RFC, NSS, acta de nacimiento ni comprobante de domicilio en el documento bancario.",
      "No rechaces por ausencia de regimen fiscal, QR fiscal o nombres de padres.",
      "La ausencia de otros documentos no afecta esta validacion."
    ]
  }
];

export function getDocumentRequirement(id: DocumentType) {
  return DOCUMENTS.find((document) => document.id === id);
}

export function formatCandidateName(candidate: {
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombres: string;
}) {
  return [candidate.nombres, candidate.apellidoPaterno, candidate.apellidoMaterno]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

export function normalizeNameForComparison(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function nameTokenCounts(value: string) {
  return normalizeNameForComparison(value)
    .split(/\s+/)
    .filter(Boolean)
    .reduce<Record<string, number>>((counts, token) => {
      counts[token] = (counts[token] || 0) + 1;
      return counts;
    }, {});
}

export function namesMatchIgnoringOrder(firstName: string, secondName: string) {
  const firstCounts = nameTokenCounts(firstName);
  const secondCounts = nameTokenCounts(secondName);
  const firstTokens = Object.keys(firstCounts);
  const secondTokens = Object.keys(secondCounts);

  if (!firstTokens.length || firstTokens.length !== secondTokens.length) {
    return false;
  }

  return firstTokens.every((token) => firstCounts[token] === secondCounts[token]);
}

export function preferDetectedNameOrder(candidateName: string, detectedName: string | null) {
  if (!detectedName || !namesMatchIgnoringOrder(candidateName, detectedName)) {
    return candidateName;
  }

  return detectedName.trim();
}

export function normalizeForFolio(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}
