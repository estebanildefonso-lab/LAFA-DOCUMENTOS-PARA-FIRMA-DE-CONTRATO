"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ALLOWED_FILE_TYPES,
  DOCUMENTS,
  MAX_FILE_SIZE_BYTES,
  formatCandidateName,
  namesMatchIgnoringOrder,
  normalizeForFolio
} from "@/lib/documents";
import type {
  CandidateData,
  DocumentType,
  DriveUploadResult,
  ProcessDocumentResponse,
  ValidationResult,
  ValidationStatus
} from "@/lib/types";

type StepId = "bienvenida" | "consentimiento" | "datos" | "documentos" | "resumen";

type DocumentState = {
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  validation?: ValidationResult;
  drive?: DriveUploadResult;
  error?: string;
  isProcessing?: boolean;
  processedAt?: string;
};

type StoredFlow = {
  folio: string;
  consentAccepted: boolean;
  candidate: CandidateData;
  officialCandidateName?: string;
  documentStates: Partial<Record<DocumentType, DocumentState>>;
  currentDocumentIndex: number;
};

const STORAGE_KEY = "documentos-contratacion-flow-v1";

const initialCandidate: CandidateData = {
  apellidoPaterno: "",
  apellidoMaterno: "",
  nombres: ""
};

const steps: { id: StepId; label: string }[] = [
  { id: "bienvenida", label: "Inicio" },
  { id: "consentimiento", label: "Consentimiento" },
  { id: "datos", label: "Datos" },
  { id: "documentos", label: "Documentos" },
  { id: "resumen", label: "Resumen" }
];

function makeFolio(candidate?: CandidateData) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  const namePart = candidate ? normalizeForFolio(formatCandidateName(candidate)).slice(0, 18) : "";
  return ["DPC", date, time, namePart, suffix].filter(Boolean).join("-");
}

function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowedFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const extensionAllowed = [".pdf", ".jpg", ".jpeg", ".png", ".webp"].some((extension) =>
    lowerName.endsWith(extension)
  );
  return ALLOWED_FILE_TYPES.includes(file.type) || extensionAllowed;
}

function getStatusLabel(status?: ValidationStatus) {
  if (status === "aprobado") return "Aprobado";
  if (status === "rechazado") return "No aprobado";
  if (status === "requiere_revision") return "Requiere revision";
  return "Pendiente";
}

function getStatusClasses(status?: ValidationStatus) {
  if (status === "aprobado") return "border-ok/30 bg-green-50 text-ok";
  if (status === "rechazado") return "border-danger/30 bg-red-50 text-danger";
  if (status === "requiere_revision") return "border-warn/30 bg-amber-50 text-warn";
  return "border-line bg-surface text-muted";
}

function getStatusDotClasses(status?: ValidationStatus) {
  if (status === "aprobado") return "bg-ok";
  if (status === "rechazado") return "bg-danger";
  if (status === "requiere_revision") return "bg-warn";
  return "bg-line";
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none">
      <path
        d="M12 16V4m0 0 4 4m-4-4-4 4M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none">
      <path
        d="M4 8h3l2-3h6l2 3h3v11H4z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.5" r="3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/lafa-logo.svg"
        alt="LAFA"
        className={compact ? "h-10 w-auto" : "h-16 w-auto"}
      />
      {!compact ? (
        <div className="hidden border-l border-line pl-4 sm:block">
          <p className="text-xs font-bold uppercase tracking-wide text-brand">Contratacion</p>
          <p className="text-sm font-black text-ink">Documentos digitales</p>
        </div>
      ) : null}
    </div>
  );
}

function ProgressBar({ currentStep }: { currentStep: StepId }) {
  const activeIndex = steps.findIndex((step) => step.id === currentStep);
  const progress = ((activeIndex + 1) / steps.length) * 100;

  return (
    <div className="sticky top-0 z-20 w-full overflow-hidden border-b border-line bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="mx-auto max-w-5xl min-w-0">
        <div className="flex items-center justify-between gap-3">
          <LogoMark compact />
          <p className="shrink-0 rounded-full border border-line bg-paper px-3 py-1 text-xs font-bold text-muted">
            Paso {activeIndex + 1} de {steps.length}
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 grid min-w-0 grid-cols-5 gap-1 text-[10px] font-semibold text-muted">
          {steps.map((step, index) => (
            <span
              key={step.id}
              className={`min-w-0 truncate ${index <= activeIndex ? "text-ink" : ""}`}
            >
              {step.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  autoComplete
}: {
  id: keyof CandidateData;
  label: string;
  value: string;
  onChange: (id: keyof CandidateData, value: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-semibold text-ink">{label}</span>
      <input
        id={id}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(id, event.target.value)}
        className="mt-2 w-full rounded-lg border border-line bg-surface px-4 py-3 text-base text-ink shadow-sm transition focus:border-brand"
        placeholder={label}
      />
    </label>
  );
}

function ValidationPanel({ result }: { result: ValidationResult }) {
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${getStatusClasses(result.estado_validacion)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{getStatusLabel(result.estado_validacion)}</p>
          <p className="mt-1 text-sm">Confianza: {Math.round(result.score_confianza * 100)}%</p>
        </div>
        <span className="rounded-full border border-current px-2 py-1 text-xs font-semibold">
          {result.puede_continuar ? "Puede subir" : "No subido"}
        </span>
      </div>
      {result.nombre_detectado ? (
        <p className="mt-3 text-sm">
          Nombre detectado: <span className="font-semibold">{result.nombre_detectado}</span>
        </p>
      ) : null}
      {result.curp_detectada ? (
        <p className="mt-2 text-sm">
          CURP detectada: <span className="font-semibold">{result.curp_detectada}</span>
        </p>
      ) : null}
      {result.motivos.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {result.motivos.map((motivo) => (
            <li key={motivo}>- {motivo}</li>
          ))}
        </ul>
      ) : null}
      {result.observaciones ? <p className="mt-3 text-sm">{result.observaciones}</p> : null}
    </div>
  );
}

export function DocumentWizard() {
  const [step, setStep] = useState<StepId>("bienvenida");
  const [folio, setFolio] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [candidate, setCandidate] = useState<CandidateData>(initialCandidate);
  const [officialCandidateName, setOfficialCandidateName] = useState("");
  const [documentStates, setDocumentStates] = useState<
    Partial<Record<DocumentType, DocumentState>>
  >({});
  const [files, setFiles] = useState<Partial<Record<DocumentType, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<DocumentType, string>>>({});
  const previewsRef = useRef<Partial<Record<DocumentType, string>>>({});
  const [currentDocumentIndex, setCurrentDocumentIndex] = useState(0);
  const [formError, setFormError] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);

  const currentDocument = DOCUMENTS[currentDocumentIndex];
  const registeredCandidateName = useMemo(() => formatCandidateName(candidate), [candidate]);
  const candidateName = officialCandidateName || registeredCandidateName;
  const completedCount = DOCUMENTS.filter((document) => documentStates[document.id]?.validation)
    .length;
  const approvedCount = DOCUMENTS.filter(
    (document) => documentStates[document.id]?.validation?.estado_validacion === "aprobado"
  ).length;

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredFlow;
        setFolio(parsed.folio || makeFolio());
        setConsentAccepted(Boolean(parsed.consentAccepted));
        setCandidate(parsed.candidate || initialCandidate);
        setOfficialCandidateName(parsed.officialCandidateName || "");
        setDocumentStates(parsed.documentStates || {});
        setCurrentDocumentIndex(parsed.currentDocumentIndex || 0);
      } catch {
        setFolio(makeFolio());
      }
    } else {
      setFolio(makeFolio());
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const payload: StoredFlow = {
      folio,
      consentAccepted,
      candidate,
      officialCandidateName,
      documentStates,
      currentDocumentIndex
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [
    candidate,
    consentAccepted,
    currentDocumentIndex,
    documentStates,
    folio,
    isHydrated,
    officialCandidateName
  ]);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach((preview) => {
        if (preview) URL.revokeObjectURL(preview);
      });
    };
  }, []);

  function updateCandidate(id: keyof CandidateData, value: string) {
    setCandidate((current) => ({ ...current, [id]: value }));
    setOfficialCandidateName("");
    setFormError("");
  }

  function goTo(nextStep: StepId) {
    setFormError("");
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePersonalSubmit() {
    const missing = Object.entries(candidate)
      .filter(([, value]) => !value.trim())
      .map(([key]) => key);

    if (missing.length) {
      setFormError("Completa apellido paterno, apellido materno y nombre(s).");
      return;
    }

    if (!folio.includes(normalizeForFolio(registeredCandidateName).slice(0, 8))) {
      setFolio(makeFolio(candidate));
    }
    goTo("documentos");
  }

  function handleFileChange(documentType: DocumentType, fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    if (!isAllowedFile(file)) {
      setDocumentStates((current) => ({
        ...current,
        [documentType]: {
          ...current[documentType],
          error: "Formato no permitido. Usa PDF, JPG, PNG o WEBP."
        }
      }));
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setDocumentStates((current) => ({
        ...current,
        [documentType]: {
          ...current[documentType],
          error: "El archivo supera 10 MB. Sube una version mas ligera."
        }
      }));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const previousPreview = previews[documentType];
    if (previousPreview) URL.revokeObjectURL(previousPreview);

    setFiles((current) => ({ ...current, [documentType]: file }));
    setPreviews((current) => ({ ...current, [documentType]: previewUrl }));
    setDocumentStates((current) => ({
      ...current,
      [documentType]: {
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size
      }
    }));
  }

  async function processCurrentDocument() {
    const file = files[currentDocument.id];
    if (!file) {
      setDocumentStates((current) => ({
        ...current,
        [currentDocument.id]: {
          ...current[currentDocument.id],
          error: "Selecciona un archivo antes de validar."
        }
      }));
      return;
    }

    setDocumentStates((current) => ({
      ...current,
      [currentDocument.id]: {
        ...current[currentDocument.id],
        isProcessing: true,
        error: undefined
      }
    }));

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folio", folio);
      formData.append("documentType", currentDocument.id);
      formData.append("candidate", JSON.stringify(candidate));
      if (officialCandidateName) {
        formData.append("officialCandidateName", officialCandidateName);
      }

      const response = await fetch("/api/documents/validate-and-upload", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as ProcessDocumentResponse | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "No se pudo validar el documento.");
      }

      if (
        currentDocument.id === "ine" &&
        payload.validation.nombre_detectado &&
        namesMatchIgnoringOrder(registeredCandidateName, payload.validation.nombre_detectado)
      ) {
        setOfficialCandidateName(payload.validation.nombre_detectado.trim());
      }

      setDocumentStates((current) => ({
        ...current,
        [currentDocument.id]: {
          ...current[currentDocument.id],
          validation: payload.validation,
          drive: payload.drive,
          isProcessing: false,
          processedAt: new Date().toISOString()
        }
      }));
    } catch (error) {
      setDocumentStates((current) => ({
        ...current,
        [currentDocument.id]: {
          ...current[currentDocument.id],
          isProcessing: false,
          error:
            error instanceof Error
              ? error.message
              : "Ocurrio un problema al validar. Intenta otra vez."
        }
      }));
    }
  }

  function resetFlow() {
    Object.values(previews).forEach((preview) => {
      if (preview) URL.revokeObjectURL(preview);
    });
    const nextFolio = makeFolio();
    setStep("bienvenida");
    setFolio(nextFolio);
    setConsentAccepted(false);
    setCandidate(initialCandidate);
    setOfficialCandidateName("");
    setDocumentStates({});
    setFiles({});
    setPreviews({});
    setCurrentDocumentIndex(0);
    setFormError("");
    window.localStorage.removeItem(STORAGE_KEY);
  }

  function renderWelcome() {
    return (
      <section className="px-4 py-6 sm:py-12">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <LogoMark />
              <p className="mt-8 text-sm font-bold uppercase tracking-wide text-brand">
                Portal seguro de carga y validacion
              </p>
              <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight text-ink sm:text-5xl">
                DOCUMENTOS PARA CONTRATACIÓN
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-muted">
                Completa tus datos, sube cada documento y recibe una validacion clara antes de que
                el archivo aprobado se envie a Google Drive.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-2 rounded-lg border border-line bg-surface p-3 shadow-sm sm:max-w-md">
                <div>
                  <p className="text-xl font-black text-ink">6</p>
                  <p className="text-xs font-semibold text-muted">Documentos</p>
                </div>
                <div>
                  <p className="text-xl font-black text-brand">IA</p>
                  <p className="text-xs font-semibold text-muted">Revision</p>
                </div>
                <div>
                  <p className="text-xl font-black text-ink">CSV</p>
                  <p className="text-xs font-semibold text-muted">Registro</p>
                </div>
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => goTo("consentimiento")}
                  className="rounded-lg bg-brand px-5 py-3 text-base font-bold text-white shadow-soft transition hover:bg-copper"
                >
                  Comenzar
                </button>
                <button
                  type="button"
                  onClick={() => goTo("documentos")}
                  disabled={!candidateName}
                  className="rounded-lg border border-line bg-surface px-5 py-3 text-base font-bold text-ink transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continuar captura
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-5 shadow-soft">
              <p className="text-sm font-black uppercase tracking-wide text-ink">Flujo principal</p>
              <div className="mt-4 space-y-3">
                {steps.slice(1).map((item, index) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-50 text-sm font-black text-brand">
                      {index + 1}
                    </span>
                    <span className="text-sm text-muted">{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-medium text-copper">
                Puedes avanzar aunque un documento falle; el resultado quedara registrado y podras
                subir los demas.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderConsent() {
    return (
      <section className="px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-line bg-surface p-5 shadow-soft">
          <LogoMark compact />
          <h2 className="mt-5 text-2xl font-black text-ink">Consentimiento</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Autorizo el uso de mis documentos para validar informacion de contratacion y guardar
            los archivos aprobados en la carpeta asignada de Google Drive.
          </p>
          <label className="mt-6 flex items-start gap-3 rounded-lg border border-line bg-paper p-4">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(event) => setConsentAccepted(event.target.checked)}
              className="mt-1 size-5 accent-brand"
            />
            <span className="text-sm font-medium text-ink">
              Acepto continuar con la revision automatizada de documentos.
            </span>
          </label>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => goTo("bienvenida")}
              className="rounded-lg border border-line bg-surface px-4 py-3 font-bold text-ink"
            >
              Regresar
            </button>
            <button
              type="button"
              onClick={() => goTo("datos")}
              disabled={!consentAccepted}
              className="flex-1 rounded-lg bg-brand px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continuar
            </button>
          </div>
        </div>
      </section>
    );
  }

  function renderPersonalData() {
    return (
      <section className="px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-line bg-surface p-5 shadow-soft">
          <LogoMark compact />
          <h2 className="mt-5 text-2xl font-black text-ink">Datos personales</h2>
          <p className="mt-2 text-sm text-muted">
            Estos datos se compararan contra los documentos donde aplique.
          </p>
          <div className="mt-6 space-y-4">
            <Field
              id="apellidoPaterno"
              label="Apellido paterno"
              value={candidate.apellidoPaterno}
              onChange={updateCandidate}
              autoComplete="family-name"
            />
            <Field
              id="apellidoMaterno"
              label="Apellido materno"
              value={candidate.apellidoMaterno}
              onChange={updateCandidate}
              autoComplete="additional-name"
            />
            <Field
              id="nombres"
              label="Nombre(s)"
              value={candidate.nombres}
              onChange={updateCandidate}
              autoComplete="given-name"
            />
          </div>
          {formError ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-danger">
              {formError}
            </p>
          ) : null}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => goTo("consentimiento")}
              className="rounded-lg border border-line bg-surface px-4 py-3 font-bold text-ink"
            >
              Regresar
            </button>
            <button
              type="button"
              onClick={handlePersonalSubmit}
              className="flex-1 rounded-lg bg-brand px-4 py-3 font-bold text-white transition hover:bg-copper"
            >
              Guardar y subir documentos
            </button>
          </div>
        </div>
      </section>
    );
  }

  function renderFilePreview() {
    const preview = previews[currentDocument.id];
    const state = documentStates[currentDocument.id];
    const fileType = files[currentDocument.id]?.type || state?.fileType || "";

    if (!preview) {
      return (
        <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-line bg-paper p-6 text-center text-sm text-muted">
          La vista previa aparecera aqui.
        </div>
      );
    }

    if (fileType.startsWith("image/")) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={`Vista previa de ${currentDocument.title}`}
          className="h-auto max-h-[420px] w-full rounded-lg border border-line object-contain"
        />
      );
    }

    return (
      <object
        data={preview}
        type="application/pdf"
        className="h-[420px] w-full rounded-lg border border-line bg-surface"
      >
        <p className="p-4 text-sm text-muted">PDF seleccionado: {state?.fileName}</p>
      </object>
    );
  }

  function renderDocuments() {
    const state = documentStates[currentDocument.id];
    const currentFile = files[currentDocument.id];
    const isLast = currentDocumentIndex === DOCUMENTS.length - 1;
    const documentButtons = DOCUMENTS.map((document, index) => {
      const itemState = documentStates[document.id];
      const isActive = index === currentDocumentIndex;

      return (
        <button
          key={document.id}
          type="button"
          onClick={() => setCurrentDocumentIndex(index)}
          className={`w-32 shrink-0 rounded-lg border px-3 py-3 text-left transition sm:w-36 lg:w-full ${
            isActive
              ? "border-brand bg-orange-50 shadow-sm"
              : "border-line bg-surface hover:border-brand/50"
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-black text-ink">
            <span
              className={`size-2 rounded-full ${getStatusDotClasses(
                itemState?.validation?.estado_validacion
              )}`}
            />
            {document.shortTitle}
          </span>
          <span
            className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${getStatusClasses(
              itemState?.validation?.estado_validacion
            )}`}
          >
            {getStatusLabel(itemState?.validation?.estado_validacion)}
          </span>
        </button>
      );
    });

    return (
      <section className="w-full overflow-hidden px-4 py-6">
        <div className="mx-auto grid max-w-5xl min-w-0 gap-5 lg:grid-cols-[0.75fr_1.25fr]">
          <aside className="order-1 min-w-0 lg:order-1">
            <div className="min-w-0 rounded-lg border border-line bg-surface p-4 shadow-sm">
              <p className="text-sm font-black text-ink">Avance de documentos</p>
              <p className="mt-1 text-sm text-muted">
                {completedCount} de {DOCUMENTS.length} revisados
              </p>
              <div className="-mx-4 mt-4 max-w-[100vw] overflow-x-auto px-4 pb-2 lg:mx-0 lg:max-w-none lg:overflow-visible lg:px-0 lg:pb-0">
                <div className="flex w-max max-w-none gap-2 lg:block lg:w-full lg:space-y-2">
                  {documentButtons}
                </div>
              </div>
            </div>
          </aside>

          <div className="order-2 min-w-0 rounded-lg border border-line bg-surface p-5 shadow-soft lg:order-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-brand">
                  Documento {currentDocumentIndex + 1} de {DOCUMENTS.length}
                </p>
                <h2 className="mt-1 text-2xl font-black text-ink">{currentDocument.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{currentDocument.description}</p>
              </div>
              <span className="w-fit rounded-full border border-line bg-paper px-3 py-1 text-xs font-bold text-muted">
                Max. 10 MB
              </span>
            </div>

            <p className="mt-4 rounded-lg border border-line bg-paper p-3 text-sm font-medium text-muted">
              Regla: {currentDocument.rule}
            </p>

            <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="flex min-h-24 min-w-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-brand/60 bg-orange-50 px-4 py-5 text-center text-brand transition hover:bg-orange-100">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(event) => handleFileChange(currentDocument.id, event.target.files)}
                  className="sr-only"
                />
                <UploadIcon />
                <span className="mt-2 block text-sm font-black">Cargar archivo</span>
                <span className="mt-1 block text-xs text-muted">PDF, JPG, PNG o WEBP</span>
              </label>

              <label className="flex min-h-24 min-w-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-line bg-paper px-4 py-5 text-center text-ink transition hover:border-brand hover:bg-orange-50">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => handleFileChange(currentDocument.id, event.target.files)}
                  className="sr-only"
                />
                <CameraIcon />
                <span className="mt-2 block text-sm font-black">Tomar fotografia</span>
                <span className="mt-1 block text-xs text-muted">Usar camara del telefono</span>
              </label>
            </div>

            {state?.fileName ? (
              <div className="mt-4 rounded-lg border border-line bg-paper p-3 text-sm text-muted">
                <p className="font-semibold text-ink">{state.fileName}</p>
                <p>{formatBytes(state.fileSize)}</p>
              </div>
            ) : null}

            <div className="mt-5">{renderFilePreview()}</div>

            {state?.error ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-danger">
                {state.error}
              </p>
            ) : null}

            {state?.validation ? (
              <div className="mt-4">
                <ValidationPanel result={state.validation} />
                <p className="mt-3 rounded-lg border border-line bg-paper p-3 text-sm text-muted">
                  Drive:{" "}
                  {state.drive?.subido
                    ? `Archivo subido (${state.drive.archivo_nombre || "sin nombre"})`
                    : state.drive?.error || "No se subio a carpeta final de aprobados."}
                </p>
              </div>
            ) : null}

            <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr]">
              <button
                type="button"
                onClick={processCurrentDocument}
                disabled={!currentFile || state?.isProcessing}
                className="rounded-lg bg-brand px-4 py-3 font-bold text-white transition hover:bg-copper disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state?.isProcessing ? "Validando..." : "Validar documento"}
              </button>
              <button
                type="button"
                onClick={() =>
                  isLast
                    ? goTo("resumen")
                    : setCurrentDocumentIndex((current) => Math.min(current + 1, DOCUMENTS.length - 1))
                }
                className="rounded-lg border border-line bg-surface px-4 py-3 font-bold text-ink transition hover:border-brand"
              >
                {isLast ? "Ver resumen" : "Continuar con otro documento"}
              </button>
            </div>

            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  currentDocumentIndex === 0
                    ? goTo("datos")
                    : setCurrentDocumentIndex((current) => Math.max(current - 1, 0))
                }
                className="rounded-lg border border-line bg-surface px-4 py-3 text-sm font-bold text-ink"
              >
                Regresar
              </button>
              <button
                type="button"
                onClick={() => goTo("resumen")}
                className="rounded-lg border border-line bg-paper px-4 py-3 text-sm font-bold text-muted"
              >
                Ir a resumen
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderSummary() {
    return (
      <section className="px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-lg border border-line bg-surface p-5 shadow-soft">
            <LogoMark compact />
            <p className="mt-5 text-sm font-bold uppercase tracking-wide text-brand">Resumen final</p>
            <h2 className="mt-2 text-3xl font-black text-ink">Folio {folio}</h2>
            <p className="mt-3 text-sm text-muted">
              Candidato: <span className="font-bold text-ink">{candidateName || "Sin nombre"}</span>
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-line bg-paper p-4">
                <p className="text-2xl font-black text-ink">{completedCount}</p>
                <p className="text-sm text-muted">Documentos revisados</p>
              </div>
              <div className="rounded-lg border border-line bg-paper p-4">
                <p className="text-2xl font-black text-ok">{approvedCount}</p>
                <p className="text-sm text-muted">Aprobados</p>
              </div>
              <div className="rounded-lg border border-line bg-paper p-4">
                <p className="text-2xl font-black text-warn">{DOCUMENTS.length - completedCount}</p>
                <p className="text-sm text-muted">Pendientes</p>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {DOCUMENTS.map((document) => {
              const state = documentStates[document.id];
              return (
                <div key={document.id} className="rounded-lg border border-line bg-surface p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-bold text-ink">{document.title}</p>
                      <p className="mt-1 text-sm text-muted">{state?.fileName || "Sin archivo"}</p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getStatusClasses(
                        state?.validation?.estado_validacion
                      )}`}
                    >
                      {getStatusLabel(state?.validation?.estado_validacion)}
                    </span>
                  </div>
                  {state?.validation ? (
                    <p className="mt-3 text-sm text-muted">
                      {state.validation.observaciones || state.validation.motivos.join(", ")}
                    </p>
                  ) : null}
                  {state?.drive?.subido ? (
                    <p className="mt-2 text-sm font-semibold text-ok">Subido a Google Drive.</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => goTo("documentos")}
              className="rounded-lg border border-line bg-surface px-4 py-3 font-bold text-ink"
            >
              Volver a documentos
            </button>
            <button
              type="button"
              onClick={resetFlow}
              className="rounded-lg bg-ink px-4 py-3 font-bold text-white transition hover:bg-accent"
            >
              Nueva captura
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!isHydrated) {
    return (
      <main className="min-h-screen px-4 py-10">
        <div className="mx-auto max-w-md rounded-lg border border-line bg-surface p-5 text-center shadow-soft">
          <LogoMark compact />
          <p className="mt-4 font-bold text-ink">Preparando formulario...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <ProgressBar currentStep={step} />
      {step === "bienvenida" ? renderWelcome() : null}
      {step === "consentimiento" ? renderConsent() : null}
      {step === "datos" ? renderPersonalData() : null}
      {step === "documentos" ? renderDocuments() : null}
      {step === "resumen" ? renderSummary() : null}
    </main>
  );
}
