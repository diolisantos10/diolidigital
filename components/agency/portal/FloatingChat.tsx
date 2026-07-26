"use client";

// Client ↔ team chat drawer, opened from a single entry point (the header
// button in the portal). WhatsApp-style: a card on desktop, full-screen on
// mobile, with an online/manager header. Text, voice and attachments.

import { PortalChat } from "./PortalChat";

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
  token?: string;
  clientRequestId?: string;
  authorName?: string;
  teamLabel?: string;
}

export function ChatDrawer({ open, onClose, token, clientRequestId, authorName, teamLabel = "Equipe Dioli" }: ChatDrawerProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 sm:inset-auto sm:bottom-5 sm:right-5 z-50 flex flex-col bg-white sm:w-[400px] sm:h-[580px] sm:max-h-[85vh] sm:rounded-[18px] overflow-hidden shadow-[0_16px_50px_rgba(7,10,31,0.4)] border border-black/5">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 flex items-center gap-3" style={{ background: "linear-gradient(135deg,#0B0F2A,#070A1F)" }}>
        <span className="flex items-center justify-center w-9 h-9 rounded-full" style={{ background: "rgba(154,245,240,0.15)" }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H8l-3.5 3V14H4a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="#9AF5F0" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-white leading-tight">{teamLabel}</p>
          <p className="text-[11px] text-[var(--cyan)] flex items-center gap-1.5 leading-tight mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" /> online · responde rápido
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar conversa"
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          style={{ touchAction: "manipulation" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <PortalChat token={token} clientRequestId={clientRequestId} authorName={authorName} bare />
    </div>
  );
}
