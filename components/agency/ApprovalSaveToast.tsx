"use client";

// Fixed-position feedback for the department approval flow:
// shows a "saving" state while the artifact is persisted, and a blocking
// error when persistence fails (approval did NOT complete).

export default function ApprovalSaveToast({
  saving,
  error,
  onDismiss,
}: {
  saving: boolean;
  error: string | null;
  onDismiss: () => void;
}) {
  if (!saving && !error) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[100] max-w-[380px]">
      {saving && (
        <div className="flex items-center gap-2.5 bg-[#1C1C1C] border border-white/[0.1] rounded-[10px] px-4 py-3 shadow-xl">
          <div className="w-3.5 h-3.5 rounded-full border-2 border-[#5B5BD6] border-t-transparent animate-spin shrink-0" />
          <span className="text-[12px] text-[#C0C0BA]">Salvando aprovação no banco…</span>
        </div>
      )}
      {error && !saving && (
        <div className="bg-[#2A1212] border border-[#DC2626]/40 rounded-[10px] px-4 py-3 shadow-xl">
          <div className="flex items-start gap-2.5">
            <span className="text-[#DC2626] text-[13px] leading-none mt-0.5">✗</span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-[#FCA5A5]">Aprovação NÃO concluída</p>
              <p className="text-[11px] text-[#D0A0A0] mt-1 leading-relaxed">{error}</p>
              <p className="text-[11px] text-[#D0A0A0] mt-1">Nada foi alterado — tente aprovar novamente.</p>
            </div>
            <button
              onClick={onDismiss}
              className="ml-auto shrink-0 text-[#8A6060] hover:text-[#FCA5A5] text-[14px] leading-none"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
