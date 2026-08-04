// Layout do segmento /portal — full-bleed de propósito.
//
// Até 03/08/2026 este layout punha um segundo cabeçalho e um contêiner de
// 860px por cima do portal — o cliente via DUAS marcas Dioli empilhadas e a
// tela virava um cartão dentro de outra tela (pior no celular, que é a
// prioridade da casa). O portal novo (Hub v1) traz o próprio cabeçalho de
// marca e a própria navegação; o layout só garante o fundo.
//
// O layout também é o único que sabe que existe um elemento FIXO por cima do
// portal — o botão "Fale com seu PM". `.portal-shell` (app/globals.css) reserva
// o espaço dele no fim da área rolável (altura + deslocamento + respiro +
// safe-area do iOS), para que nada do fim do conteúdo fique coberto. Reservar
// aqui, uma vez, evita o remendo de padding aba por aba.

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    // O fundo acompanha a superfície do portal (--bg-elevated): com o espaço
    // reservado no fim, um fundo diferente do da página viraria uma faixa de
    // cor visível embaixo do rodapé.
    <div className="portal-shell min-h-screen" style={{ background: "var(--bg-elevated)" }}>
      {children}
    </div>
  );
}
