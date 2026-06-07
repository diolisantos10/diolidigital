"use client";

import { useState, useRef, useEffect, DragEvent, ChangeEvent } from "react";
import type { RequestAttachment } from "@/lib/agency/client-requests";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-zip",
]);

const ACCEPT_STRING = ".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.svg,.zip";

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_FILES      = 10;

const MIME_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WEBP",
  "image/svg+xml": "SVG",
  "application/zip": "ZIP",
  "application/x-zip-compressed": "ZIP",
  "application/x-zip": "ZIP",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileLabel(mimeType: string, fileName: string): string {
  return MIME_LABEL[mimeType] ?? (fileName.split(".").pop()?.toUpperCase() ?? "FILE");
}

const uid = () => Math.random().toString(36).slice(2, 10);

// ─── Types ─────────────────────────────────────────────────────────────────

interface FileEntry {
  file: File;
  attachment: RequestAttachment;
}

interface FileUploadZoneProps {
  clientId: string;
  onChange: (attachments: RequestAttachment[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FileUploadZone({ clientId, onChange }: FileUploadZoneProps) {
  const [entries,    setEntries]    = useState<FileEntry[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errors,     setErrors]     = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep onChange stable across renders without requiring it as an effect dep
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Notify parent whenever the file list changes
  useEffect(() => {
    onChangeRef.current(entries.map((e) => e.attachment));
  }, [entries]);

  function processFiles(fileList: File[]) {
    const errs: string[] = [];
    const toAdd: FileEntry[] = [];

    setEntries((prev) => {
      for (const file of fileList) {
        if (prev.length + toAdd.length >= MAX_FILES) {
          if (!errs.some((e) => e.includes("Máximo"))) {
            errs.push(`Máximo de ${MAX_FILES} arquivos por solicitação.`);
          }
          break;
        }
        if (!ACCEPTED_MIME_TYPES.has(file.type)) {
          errs.push(`"${file.name}" — tipo de arquivo não suportado.`);
          continue;
        }
        if (file.size > MAX_SIZE_BYTES) {
          errs.push(`"${file.name}" — arquivo muito grande (máx. 25 MB).`);
          continue;
        }
        toAdd.push({
          file,
          attachment: {
            id: `att${uid()}`,
            clientId,
            fileName: file.name,
            fileType: fileLabel(file.type, file.name),
            mimeType: file.type,
            sizeBytes: file.size,
            source: "briefing_room",
            createdAt: new Date().toISOString(),
            storageStatus: "local_only",
          },
        });
      }
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });

    setErrors(errs);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    processFiles(files);
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    processFiles(Array.from(e.dataTransfer.files));
  }

  function remove(id: string) {
    setEntries((prev) => prev.filter((e) => e.attachment.id !== id));
    setErrors([]);
  }

  return (
    <div className="space-y-2.5">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-[10px] px-5 py-6 text-center cursor-pointer transition-all select-none ${
          isDragOver
            ? "border-[#5B5BD6] bg-[#EEF0FF]"
            : "border-[#E5E5E2] bg-white hover:border-[#9B9B95] hover:bg-[#F7F7F6]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          onChange={handleInputChange}
          className="hidden"
          aria-label="Selecionar arquivos"
        />
        <svg
          width="22" height="22" viewBox="0 0 24 24" fill="none"
          className={`mx-auto mb-2 ${isDragOver ? "text-[#5B5BD6]" : "text-[#9B9B95]"}`}
        >
          <path d="M21 15V19A2 2 0 0119 21H5A2 2 0 013 19V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <p className={`text-[13px] font-medium ${isDragOver ? "text-[#5B5BD6]" : "text-[#1A1A1A]"}`}>
          {isDragOver ? "Solte os arquivos aqui" : "Arraste arquivos ou clique para selecionar"}
        </p>
        <p className="text-[11px] text-[#9B9B95] mt-1">
          Envie brand book, logo, fotos, cardápio, referências ou qualquer material útil para o briefing.
        </p>
        <p className="text-[10px] text-[#C0C0BC] mt-0.5">
          PDF, DOC, DOCX, PPT, PPTX, PNG, JPG, WEBP, SVG, ZIP · máx. 25 MB por arquivo · até {MAX_FILES} arquivos
        </p>
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-[8px] px-3 py-2.5 space-y-0.5">
          {errors.map((err, i) => (
            <p key={i} className="text-[12px] text-[#DC2626]">{err}</p>
          ))}
        </div>
      )}

      {/* Selected file list */}
      {entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map(({ attachment }) => (
            <div
              key={attachment.id}
              className="flex items-center gap-3 bg-white border border-[#E5E5E2] rounded-[8px] px-3 py-2.5"
            >
              {/* Type badge */}
              <div className="w-8 h-8 rounded-[6px] bg-[#F0F0ED] flex items-center justify-center shrink-0">
                <span className="text-[8px] font-bold text-[#6B6B65] leading-none">
                  {attachment.fileType}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-[#1A1A1A] truncate">{attachment.fileName}</p>
                <p className="text-[10px] text-[#9B9B95]">{formatBytes(attachment.sizeBytes)}</p>
              </div>

              {/* Status */}
              <span className="h-4 px-1.5 rounded-[3px] bg-[#DCFCE7] text-[9px] font-semibold text-[#16A34A] shrink-0 whitespace-nowrap">
                Anexado
              </span>

              {/* Remove */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(attachment.id); }}
                aria-label={`Remover ${attachment.fileName}`}
                className="text-[#C0C0BC] hover:text-[#DC2626] transition-colors shrink-0 text-[18px] leading-none pb-0.5"
              >
                ×
              </button>
            </div>
          ))}

          <p className="text-[11px] text-[#9B9B95]">
            {entries.length} arquivo{entries.length !== 1 ? "s" : ""} anexado{entries.length !== 1 ? "s" : ""} — Materiais anexados ao briefing.
          </p>
        </div>
      )}
    </div>
  );
}
