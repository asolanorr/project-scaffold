"use client";

import { Button } from "@repo/ui/components/base/buttons/button";
import { AlertCircle, File as FileIcon, RefreshCw, UploadCloud, X } from "@repo/ui/icons";
import { cx } from "@repo/ui/utils/cx";
import type { ChangeEvent, DragEvent } from "react";
import { useId, useRef, useState } from "react";

/**
 * The result of asking the server to prepare an upload: where to PUT the
 * bytes, and the id to confirm with once they have arrived.
 */
export type UploadTicket = {
  fileId: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
};

/**
 * A step that can fail without throwing. `message` is already the string to
 * show — this component has no locale and no knowledge of error codes; the
 * caller translates whatever its server action returned before handing the
 * result back.
 */
export type StepResult<T> = { ok: true; data: T } | { ok: false; message: string };

export type FileUploadLabels = {
  /** The dropzone's main instruction. */
  dropzone: string;
  /** The clickable word inside the dropzone instruction, e.g. "click to browse". */
  browse: string;
  /** Shown under the instruction — typically the accepted types and size limit. */
  hint?: string;
  uploading: string;
  confirming: string;
  success: string;
  retry: string;
  /** Accessible label for the button that removes the current file. */
  remove: string;
  /** Accessible label for the button that cancels an upload in progress. */
  cancel: string;
  /** Fallback when a step fails with no message. */
  errorGeneric: string;
  /** Screen-reader progress text. */
  percentUploaded: (percent: number) => string;
};

export const defaultFileUploadLabels: FileUploadLabels = {
  dropzone: "Drag and drop a file, or",
  browse: "click to browse",
  uploading: "Uploading…",
  confirming: "Finishing up…",
  success: "Uploaded",
  retry: "Try again",
  remove: "Remove file",
  cancel: "Cancel upload",
  errorGeneric: "Something went wrong.",
  percentUploaded: (percent) => `${percent}% uploaded`,
};

type Phase = "idle" | "uploading" | "confirming" | "success" | "error";

type SelectedFile = {
  file: File;
};

export type FileUploadProps<TFile> = {
  /**
   * Step 1: declare the file to the server — its name, declared type and
   * size — and get back where to put the bytes. Never the bytes themselves;
   * this component PUTs them straight to `uploadUrl`, and the server never
   * sees them until confirm reads them back.
   */
  onRequestUpload: (file: File) => Promise<StepResult<UploadTicket>>;
  /**
   * Step 3, after the PUT finishes: tell the server the bytes arrived, so it
   * can verify the object and flip the row to ready.
   */
  onConfirmUpload: (fileId: string) => Promise<StepResult<TFile>>;
  /** Called once a file is uploaded and confirmed. */
  onUploaded?: (file: TFile) => void;
  /** Forwarded to the native file input — the caller's own allowlist. */
  accept?: string;
  /**
   * Rejected before any network call. The caller's own ceiling; this
   * component has no opinion of its own on what "too large" means.
   */
  maxSizeBytes?: number;
  disabled?: boolean;
  labels?: Partial<FileUploadLabels>;
  className?: string;
};

/**
 * A single-file upload: pick or drop a file, watch it go straight to object
 * storage with a progress bar, then wait the moment it takes the server to
 * confirm it. Knows nothing about Supabase, Storage, or what "confirm" does
 * on the other end — `onRequestUpload` and `onConfirmUpload` are the only
 * contact with a backend, and both are plain functions the caller wires to
 * its own server actions.
 *
 * The browser uploads directly to the signed URL (an `XMLHttpRequest`, not
 * `fetch` — only `XMLHttpRequest` reports upload progress), so the bytes
 * never pass through this app's server.
 */
export function FileUpload<TFile>({
  onRequestUpload,
  onConfirmUpload,
  onUploaded,
  accept,
  maxSizeBytes,
  disabled = false,
  labels: labelOverrides,
  className,
}: FileUploadProps<TFile>) {
  const labels = { ...defaultFileUploadLabels, ...labelOverrides };
  const inputId = useId();

  const [phase, setPhase] = useState<Phase>("idle");
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setDragOver] = useState(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const reset = () => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setPhase("idle");
    setSelected(null);
    setProgress(0);
    setError(null);
  };

  const putToStorage = (file: File, ticket: UploadTicket) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("PUT", ticket.uploadUrl);
      for (const [name, value] of Object.entries(ticket.uploadHeaders)) {
        xhr.setRequestHeader(name, value);
      }
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`upload failed: HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error("upload failed"));
      xhr.onabort = () => reject(new Error("aborted"));
      xhr.send(file);
    });

  // Always restarts at step 1, even on a retry after the PUT step itself
  // failed: a signed URL is not guaranteed to stay valid or correct for the
  // server's own retry semantics (it may invalidate the object or the row on
  // certain failures), so "retry" asks for a fresh one rather than assuming
  // the old one still works. A pending row from an attempt that never
  // reached confirm is abandoned and later purged server-side.
  const run = async (file: File) => {
    setError(null);
    try {
      const requested = await onRequestUpload(file);
      if (!requested.ok) {
        setError(requested.message || labels.errorGeneric);
        setPhase("error");
        return;
      }
      const ticket = requested.data;

      setPhase("uploading");
      setProgress(0);
      await putToStorage(file, ticket);

      setPhase("confirming");
      const confirmed = await onConfirmUpload(ticket.fileId);
      if (!confirmed.ok) {
        setError(confirmed.message || labels.errorGeneric);
        setPhase("error");
        return;
      }

      setPhase("success");
      onUploaded?.(confirmed.data);
    } catch {
      // Abort is a deliberate cancel, handled by whoever called xhr.abort();
      // anything else (network failure, a thrown rejection) is this path.
      if (xhrRef.current === null) return; // cancelled mid-request; reset() already ran
      setError(labels.errorGeneric);
      setPhase("error");
    }
  };

  const selectFile = (file: File) => {
    setSelected({ file });
    if (maxSizeBytes && file.size > maxSizeBytes) {
      setError(labels.errorGeneric);
      setPhase("error");
      return;
    }
    void run(file);
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // same file picked twice must still fire a change
    if (file) selectFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) selectFile(file);
  };

  const cancel = () => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    reset();
  };

  const retry = () => {
    if (!selected) return;
    void run(selected.file);
  };

  if (phase === "idle") {
    return (
      <div className={className}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the input inside is the real control; this is only the drop target */}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cx(
            "flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
            isDragOver ? "border-brand bg-primary_hover" : "border-secondary",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <UploadCloud className="size-8 text-fg-quaternary" />
          <label htmlFor={inputId} className="text-sm text-tertiary">
            {labels.dropzone}{" "}
            <span
              className={cx(
                "font-semibold text-brand-secondary",
                !disabled && "cursor-pointer hover:text-brand-secondary_hover",
              )}
            >
              {labels.browse}
            </span>
          </label>
          {labels.hint && <p className="text-xs text-quaternary">{labels.hint}</p>}
          <input
            id={inputId}
            type="file"
            accept={accept}
            disabled={disabled}
            onChange={onInputChange}
            className="sr-only"
          />
        </div>
      </div>
    );
  }

  const name = selected?.file.name ?? "";

  return (
    <div
      className={cx(
        "flex items-center gap-3 rounded-xl p-4 shadow-xs ring-1 ring-primary",
        className,
      )}
    >
      <FileIcon
        className={cx(
          "size-8 shrink-0",
          phase === "error" ? "text-fg-error-secondary" : "text-fg-quaternary",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-medium text-primary">{name}</p>

        {(phase === "uploading" || phase === "confirming") && (
          <>
            <div
              role="progressbar"
              aria-valuenow={phase === "uploading" ? progress : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={phase === "uploading" ? labels.uploading : labels.confirming}
              className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
            >
              <div
                className={cx(
                  "h-full rounded-full bg-brand-solid transition-[width]",
                  phase === "confirming" && "w-full animate-pulse",
                )}
                style={phase === "uploading" ? { width: `${progress}%` } : undefined}
              />
            </div>
            <p className="text-xs text-tertiary">
              {phase === "uploading" ? labels.percentUploaded(progress) : labels.confirming}
            </p>
          </>
        )}

        {phase === "success" && <p className="text-xs text-success-primary">{labels.success}</p>}

        {phase === "error" && (
          <p className="flex items-center gap-1 text-xs text-error-primary" role="alert">
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      {(phase === "uploading" || phase === "confirming") && (
        <Button
          color="tertiary"
          size="sm"
          iconLeading={<X data-icon="leading" className="size-4" />}
          aria-label={labels.cancel}
          onPress={cancel}
          isDisabled={phase === "confirming"}
        />
      )}
      {phase === "error" && (
        <Button
          color="secondary"
          size="sm"
          iconLeading={<RefreshCw data-icon="leading" className="size-4" />}
          onPress={retry}
        >
          {labels.retry}
        </Button>
      )}
      {(phase === "success" || phase === "error") && (
        <Button
          color="tertiary"
          size="sm"
          iconLeading={<X data-icon="leading" className="size-4" />}
          aria-label={labels.remove}
          onPress={reset}
        />
      )}
    </div>
  );
}
