"use client";

// Always-on chat bubble for the client portal — the WhatsApp-style channel the
// client can open from anywhere to talk to their project manager, by text or
// voice. Fixed bottom-right; a card on desktop, near-fullscreen on mobile.

import { useState } from "react";
import { PortalChat } from "./PortalChat";

interface FloatingChatProps {
  token?: string;
  clientRequestId?: string;
  authorName?: string;
  /** Who the client is talking to, shown in the header. */
  teamLabel?: string;
}

export function FloatingChat({ token, clientRequestId, authorName, teamLabel = "Equipe Dioli" }: FloatingChatProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Launcher bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir conversa com a equipe"
          style={{ touchAction: "manipulation" }}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 h-14 pl-4 pr-5 rounded-full text-white shadow-[0_8px_28px_rgba(7,10,31,0.35)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          <span className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(135deg,#0B0F2A,#070A1F)" }} />
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#12B5AC] border-2 border-[#070A1F]" />
          <span className="relative flex items-center justify-center w-8 h-8 rounded-full" style={{ background: "rgba(154,245,240,0.15)" }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H8l-3.5 3V14H4a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="#9AF5F0" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="relative text-[13px] font-semibold hidden sm:block">Falar com a equipe</span>
        </button>
      )}

      {/* Chat drawer */}
      {open && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-5 sm:right-5 z-50 flex flex-col bg-white sm:w-[380px] sm:h-[560px] sm:max-h-[85vh] sm:rounded-[18px] overflow-hidden shadow-[0_16px_50px_rgba(7,10,31,0.4)] border border-black/5">
          {/* Header */}
          <div className="shrink-0 px-4 py-3 flex items-center gap-3" style={{ background: "linear-gradient(135deg,#0B0F2A,#070A1F)" }}>
            <span className="flex items-center justify-center w-9 h-9 rounded-full" style={{ background: "rgba(154,245,240,0.15)" }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H8l-3.5 3V14H4a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="#9AF5F0" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-white leading-tight">{teamLabel}</p>
              <p className="text-[11px] text-[#9AF5F0] flex items-center gap-1.5 leading-tight mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" /> online · responde rápido
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar conversa"
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              style={{ touchAction: "manipulation" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Conversation */}
          <PortalChat token={token} clientRequestId={clientRequestId} authorName={authorName} bare />
        </div>
      )}
    </>
  );
}
