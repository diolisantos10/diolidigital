// Os ícones da Central de Trabalho — os mesmos traços do protótipo aprovado.
//
// Ficam aqui, e não espalhados no componente, por um motivo concreto: o mapa da
// agência e a gaveta do cliente resolvem o ícone a partir do REGISTRO de
// departamentos (`icone: "social" | "design" | …`). Departamento novo entra por
// configuração e já vem com desenho — sem nenhum `if` novo na tela.

import type { IconeDeDepartamento } from "@/lib/agency/organizacao/departamentos";

export type NomeDeIcone =
  | "home" | "check" | "calendar" | "users" | "folder" | "box" | "approve"
  | "message" | "grid" | "map" | "search" | "bell" | "chevron" | "arrow"
  | "spark" | "clock" | "alert" | "eye" | "close" | "send" | "briefcase"
  | IconeDeDepartamento;

const TRACOS: Record<NomeDeIcone, React.ReactNode> = {
  home: <><path d="M3 10.2 12 3l9 7.2"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/></>,
  check: <><rect x="3" y="3" width="18" height="18" rx="5"/><path d="m7.5 12 3 3 6-6"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18"/></>,
  users: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6M15 15c3.1.2 4.7 1.9 5 5"/></>,
  folder: <path d="M3 6.5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
  box: <><path d="m4 7 8-4 8 4v10l-8 4-8-4z"/><path d="m4 7 8 4 8-4M12 11v10"/></>,
  approve: <><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/><path d="m7.5 12 3 3 6-6"/></>,
  message: <path d="M4 4h16v12H8l-4 4z"/>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15m6-12v15"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M9.5 21h5"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  spark: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
  alert: <><path d="M12 3 2.5 20h19z"/><path d="M12 9v4m0 3h.01"/></>,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  send: <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M9 7V4h6v3m-12 5h18"/></>,

  // ── Departamentos ────────────────────────────────────────────────────────
  atendimento: <><path d="M4 13a8 8 0 0 1 16 0"/><rect x="2.5" y="13" width="4" height="6" rx="2"/><rect x="17.5" y="13" width="4" height="6" rx="2"/><path d="M20 19v1a2 2 0 0 1-2 2h-3"/></>,
  pm: <><rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M8 9h8M8 13h5"/></>,
  brand: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2m10-10h-2M4 12H2"/></>,
  social: <><circle cx="7" cy="12" r="3"/><circle cx="17" cy="6" r="2"/><circle cx="17" cy="18" r="2"/><path d="m9.6 10.5 5.5-3.2m-5.5 6.2 5.5 3.2"/></>,
  design: <><path d="m4 20 4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10z"/><path d="m13 6 5 5M4 20l1-5 4 4z"/></>,
  ads: <><path d="m3 11 15-6v14L3 13z"/><path d="M7 14v5h4"/></>,
  strategy: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3m9 6h-3m-6 9v-3M3 12h3"/></>,
  analytics: <path d="M4 20V10m5 10V4m6 16v-7m5 7V7"/>,
  quality: <><path d="m12 3 7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
  financeiro: <><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><circle cx="12" cy="12" r="3"/><path d="M6 9v6m12-6v6"/></>,
  system: <><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21m6.4-15.4-1.8 1.8M7.4 16.6l-1.8 1.8M21 12h-2.5M5.5 12H3m15.4 6.4-1.8-1.8M7.4 7.4 5.6 5.6"/></>,
};

export function Icone({ nome, tamanho = 18 }: { nome: NomeDeIcone; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRACOS[nome]}
    </svg>
  );
}
