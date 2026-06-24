"use client";

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="md:hidden fixed top-3.5 left-4 z-50 w-8 h-8 flex items-center justify-center rounded-[7px] bg-[#070A1F] text-white shadow-md"
      aria-label="Abrir menu"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </button>
  );
}
