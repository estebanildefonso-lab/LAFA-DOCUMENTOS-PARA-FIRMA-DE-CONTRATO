export type DocumentType =
  | "acta_nacimiento"
  | "curp"
  | "rfc"
  | "nss"
  | "comprobante_domicilio"
  | "estado_cuenta_bancario";

export type ValidationStatus = "aprobado" | "rechazado" | "requiere_revision";

export type CandidateData = {
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombres: string;
};

export type ValidationResult = {
  tipo_documento: string;
  estado_validacion: ValidationStatus;
  score_confianza: number;
  puede_continuar: boolean;
  motivos: string[];
  nombre_detectado: string | null;
  observaciones: string;
};

export type DriveUploadResult = {
  subido: boolean;
  archivo_id?: string;
  archivo_nombre?: string;
  enlace?: string;
  carpeta_id?: string;
  error?: string;
};

export type ProcessDocumentResponse = {
  folio: string;
  validation: ValidationResult;
  drive: DriveUploadResult;
  log: {
    registrado: boolean;
    archivo_id?: string;
    error?: string;
  };
};
