// Layout do segmento /portal — full-bleed de propósito.
//
// Até 03/08/2026 este layout punha um segundo cabeçalho e um contêiner de
// 860px por cima do portal — o cliente via DUAS marcas Dioli empilhadas e a
// tela virava um cartão dentro de outra tela (pior no celular, que é a
// prioridade da casa). O portal traz o próprio cabeçalho de marca e a própria
// navegação; o layout só garante o fundo e carrega a folha.
//
// 14/08/2026 — a folha da referência aprovada (`portal-cliente.css`) entra
// AQUI, no layout do segmento, e não na página: assim ela vale para as duas
// rotas do portal (o link antigo com token no caminho e a URL limpa `/me`) sem
// duplicar 66 KB de CSS em dois lugares que podem sair de sincronia.
//
// A reserva do botão flutuante (`.portal-shell`, app/globals.css) some daqui: o
// portal novo usa o `.cp-floating-pm` da referência, que já é canto inferior
// direito FORA da coluna de conteúdo (DESIGN.md §6.2) e não cobre o fim da
// rolagem. Reservar espaço para um botão que não está mais lá deixaria uma
// faixa morta embaixo do rodapé.

import "./portal-cliente.css";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
