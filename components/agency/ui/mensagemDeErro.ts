// ─── mensagemDeErro ───────────────────────────────────────────────────────────
//
// Traduz falha técnica em frase que um humano entende, em português.
//
// Até 05/08/2026 várias telas faziam `setError(String(e))` — e o usuário lia
// "TypeError: Failed to fetch", "HTTP 500", "Generation failed.". Isso não é
// mensagem de erro: é o log vazado na cara de quem usa. No portal, chegava ao
// **cliente pagante**.
//
// §7.3 do DESIGN.md: "mensagem clara do que deu errado E como resolver (sem
// jargão, sem 'Ops!')". O detalhe técnico não some — vira `detalhe`, que a tela
// mostra em letra menor, embaixo, para quem for reportar o problema.
// ─────────────────────────────────────────────────────────────────────────────

export interface ErroHumano {
  /** A frase que o usuário lê. Diz o que houve e o que fazer. */
  mensagem: string;
  /** O texto cru, para diagnóstico. Nunca é a manchete. */
  detalhe?: string;
}

const CRU = /^(TypeError|ReferenceError|SyntaxError|Error):|^HTTP \d{3}$|Failed to fetch|NetworkError|Load failed/i;

export function mensagemDeErro(e: unknown, acao = "concluir a ação"): ErroHumano {
  const cru = e instanceof Error ? e.message : typeof e === "string" ? e : String(e);

  const status = /HTTP (\d{3})/.exec(cru)?.[1];

  if (/Failed to fetch|NetworkError|Load failed|ERR_INTERNET/i.test(cru)) {
    return {
      mensagem: "Sem conexão com o servidor. Verifique a internet e tente de novo.",
      detalhe: cru,
    };
  }
  if (status === "401" || status === "403") {
    return {
      mensagem: "Sua sessão expirou ou você não tem acesso a isto. Entre de novo e repita.",
      detalhe: cru,
    };
  }
  if (status === "404") {
    return { mensagem: "Não encontramos este item — ele pode ter sido removido.", detalhe: cru };
  }
  if (status === "429") {
    return { mensagem: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.", detalhe: cru };
  }
  if (status && status.startsWith("5")) {
    return {
      mensagem: `Não conseguimos ${acao} — o servidor falhou. Tente de novo; se repetir, avise a equipe.`,
      detalhe: cru,
    };
  }

  // Mensagem já escrita para humano (veio da API em português, por exemplo).
  if (cru && !CRU.test(cru) && cru.length < 200) {
    return { mensagem: cru };
  }

  return {
    mensagem: `Não conseguimos ${acao}. Tente de novo em instantes.`,
    detalhe: cru || undefined,
  };
}
