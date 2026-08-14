// O estado CARREGANDO da página do cliente.
//
// Não é tela branca e não é "pulo" de layout: o esqueleto tem a altura do
// cabeçalho, do pulso e das abas que vêm depois, para a página não saltar
// quando o dado chega. Regra dos três estados obrigatórios — carregando, vazio
// e erro — e esta é a que ninguém lembra de fazer, porque em rede rápida
// ninguém a vê.

import "@/components/agency/command-center/dioli.css";

export default function Loading() {
  return (
    <div className="dioliOS">
      <main className="projectPage clientWorkspace">
        <div className="loadingBlock" aria-busy="true" aria-live="polite">
          <span className="srOnly">Carregando o cliente…</span>
          <i /><i /><i /><i /><i />
        </div>
      </main>
    </div>
  );
}
