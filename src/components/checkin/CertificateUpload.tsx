"use client";

import { useEffect, useId, useRef, useState } from "react";
import { certificateProblem } from "@/lib/checkin/form";

export type UploadedCertificate = { path: string; name: string; type: string; size: number };

type Ticket = { ok: true; path: string; signedUrl: string } | { ok: false; message: string; session?: boolean };

/** Fotos maiores que isso são reduzidas no aparelho (o atestado continua legível). */
const SHRINK_ABOVE = 1.5 * 1024 * 1024;
const MAX_SIDE = 2200;

async function shrinkPhoto(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size <= SHRINK_ABOVE) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // O navegador não decodifica o formato (ex.: HEIC fora do Safari): envia o original.
    return file;
  }
}

function putWithProgress(url: string, file: File, apiKey: string, onProgress: (ratio: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    if (apiKey) xhr.setRequestHeader("apikey", apiKey);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(body);
  });
}

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function CertificateUpload({
  value,
  onChange,
  prepare,
  apiKey,
  onSessionExpired,
  error,
}: {
  value: UploadedCertificate | null;
  onChange: (value: UploadedCertificate | null) => void;
  prepare: (file: { type: string; size: number }) => Promise<Ticket>;
  apiKey: string;
  onSessionExpired: () => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const id = useId();

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = async (original: File) => {
    setProblem(null);
    const first = certificateProblem(original);
    if (first) return setProblem(first);

    setProgress(0);
    const file = await shrinkPhoto(original);
    try {
      const ticket = await prepare({ type: file.type, size: file.size });
      if (!ticket.ok) {
        setProgress(null);
        setProblem(ticket.message);
        if (ticket.session) onSessionExpired();
        return;
      }
      await putWithProgress(ticket.signedUrl, file, apiKey, (r) => setProgress(r));
      setPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
      onChange({ path: ticket.path, name: original.name, type: file.type, size: file.size });
    } catch {
      setProblem("O envio não terminou. Verifique a conexão e tente de novo.");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const message = problem ?? error;
  const uploading = progress !== null;

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        aria-describedby={message ? `${id}-msg` : undefined}
        aria-invalid={!!message}
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(file);
        }}
      />

      {value && !uploading ? (
        <div className="flex animate-panel items-center gap-3 rounded-xl border border-success/40 bg-success/8 p-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- pré-visualização local (blob:)
            <img src={preview} alt="" className="size-14 shrink-0 rounded-lg border border-line bg-surface object-cover" />
          ) : (
            <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-xs font-semibold text-cool-gray">
              {value.type === "application/pdf" ? "PDF" : "IMG"}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-success-ink">
              <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0">
                <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Atestado anexado
            </p>
            <p className="truncate text-xs text-cool-gray">
              {value.name} · {sizeLabel(value.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-brand-dark transition duration-150 hover:bg-brand-subtle focus-visible:outline-2 focus-visible:outline-brand"
          >
            Trocar
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={`group flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition duration-150 ${
            uploading ? "cursor-progress border-brand/50 bg-brand-subtle/40" : message ? "border-danger/60 bg-danger/4" : "border-line hover:border-brand-dark hover:bg-brand-subtle/30 active:bg-brand-subtle/50"
          } [input:focus-visible+&]:outline-2 [input:focus-visible+&]:outline-offset-2 [input:focus-visible+&]:outline-brand`}
        >
          {uploading ? (
            <>
              <span className="text-sm font-semibold text-brand-dark">Enviando… {Math.round((progress ?? 0) * 100)}%</span>
              <span className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <span className="block h-full origin-left rounded-full bg-brand transition-transform duration-150" style={{ transform: `scaleX(${progress ?? 0})` }} />
              </span>
            </>
          ) : (
            <>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7 text-brand transition duration-200 ease-out-expo group-hover:-translate-y-0.5">
                <path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-base font-semibold text-ink">Anexar atestado médico</span>
              <span className="text-xs text-cool-gray">Foto do atestado ou PDF, até 10 MB</span>
            </>
          )}
        </label>
      )}

      {message && (
        <span id={`${id}-msg`} role="alert" className="animate-message text-xs text-danger-ink">
          {message}
        </span>
      )}
    </div>
  );
}
