// Layout do segmento /portal — full-bleed de propósito.
//
// Até 03/08/2026 este layout punha um segundo cabeçalho e um contêiner de
// 860px por cima do portal — o cliente via DUAS marcas Dioli empilhadas e a
// tela virava um cartão dentro de outra tela (pior no celular, que é a
// prioridade da casa). O portal novo (Hub v1) traz o próprio cabeçalho de
// marca e a própria navegação; o layout só garante o fundo.

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {children}
    </div>
  );
}
