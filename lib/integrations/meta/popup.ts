// A JANELA DO OAUTH NUNCA PODE FALAR JSON.
//
// Raio-x de 05/08/2026, depois de o CEO testar e dizer "não está funcionando":
// três becos do fluxo de conexão respondiam `{"error":"..."}` — JSON cru, dentro
// de um popup, para um dono de negócio. Pior: nenhum deles avisava a aba que
// abriu a janela, então o portal ficava esperando para sempre, sem erro na tela.
//
// Falha invisível é o pior tipo de falha: o cliente conclui que o sistema não
// funciona, e a agência não fica sabendo que ele tentou.
//
// Este módulo é a saída única do popup: SEMPRE HTML legível, SEMPRE um
// postMessage para quem abriu, sucesso ou fracasso.

/** Escapa para dentro de texto HTML. */
function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type CargaDoPopup = {
  type: "meta_auth_success" | "meta_auth_error";
  /** Frase para o CLIENTE ler. Nunca código, nunca nome de variável. */
  error?: string;
  summary?: string;
  /** Pista curta para a AGÊNCIA achar o ponto exato. Não é para o cliente. */
  etapa?: string;
};

/**
 * A página que o popup mostra e o recado que ele manda para o portal.
 *
 * `titulo` e `detalhe` são o que o cliente lê. `carga` é o que a aba recebe —
 * e ela SEMPRE sai, mesmo quando a janela fica aberta porque não havia opener.
 */
export function paginaDePopup(opts: {
  ok: boolean;
  titulo: string;
  detalhe: string;
  /** O que o cliente pode fazer agora. Erro sem saída é erro pela metade. */
  oQueFazer?: string;
  carga: CargaDoPopup;
}): Response {
  const json = JSON.stringify(opts.carga).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const cor = opts.ok ? "#0E9E96" : "#B91C1C";
  return new Response(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(opts.titulo)}</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#F7F6F3;color:#141413">
<div style="max-width:420px;margin:0 auto;padding:40px 24px;text-align:center">
  <h1 style="color:${cor};font-size:19px;line-height:1.25;margin:0 0 10px">${escapar(opts.titulo)}</h1>
  <p style="color:#57534E;font-size:14.5px;line-height:1.55;margin:0">${escapar(opts.detalhe)}</p>
  ${opts.oQueFazer ? `<p style="color:#57534E;font-size:14px;line-height:1.55;margin:14px 0 0"><b>O que fazer:</b> ${escapar(opts.oQueFazer)}</p>` : ""}
  <button onclick="window.close()" style="margin-top:22px;height:44px;padding:0 20px;border:0;border-radius:10px;background:#070A1F;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Fechar esta janela</button>
</div>
<script>
var carga = ${json};
try {
  if (window.opener && typeof window.opener.postMessage === "function") {
    window.opener.postMessage(carga, window.location.origin);
    if (carga.type === "meta_auth_success") setTimeout(function(){ window.close(); }, 900);
  }
} catch (e) {}
</script>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

/** Os becos conhecidos deste fluxo, com a frase que o cliente entende. */
export function popupDeFalha(
  motivo: "sem_acesso" | "app_nao_configurado" | "sem_paginas" | "recusado" | "erro",
  detalheTecnico?: string,
): Response {
  const mapa: Record<string, { titulo: string; detalhe: string; oQueFazer: string }> = {
    sem_acesso: {
      titulo: "Seu acesso ao portal expirou",
      detalhe: "O link que abriu esta janela não vale mais.",
      oQueFazer: "Feche esta janela, atualize a página do portal e clique em conectar de novo.",
    },
    app_nao_configurado: {
      titulo: "A conexão ainda não está liberada do nosso lado",
      detalhe: "O aplicativo da Dioli na Meta ainda não está configurado para receber conexões.",
      oQueFazer: "Não é nada do seu lado — avise a Dioli. Já estamos sabendo.",
    },
    sem_paginas: {
      titulo: "Não encontramos nenhuma Página nesta conta",
      detalhe:
        "Você entrou, mas esta conta do Facebook não administra nenhuma Página com Instagram profissional vinculado — ou você não marcou a Página na tela de permissões.",
      oQueFazer:
        "Tente de novo e, na tela da Meta, marque a Página do seu negócio e o Instagram dela. Se o Instagram for pessoal, ele precisa virar conta profissional antes.",
    },
    recusado: {
      titulo: "A conexão foi cancelada",
      detalhe: "A Meta não devolveu a autorização — ou a janela foi fechada antes do fim.",
      oQueFazer: "Pode tentar de novo quando quiser. Nada foi alterado na sua conta.",
    },
    erro: {
      titulo: "Não conseguimos concluir a conexão",
      detalhe: "A Meta recusou o pedido no meio do caminho.",
      oQueFazer: "Tente de novo em alguns minutos. Se continuar, avise a Dioli — já registramos o ocorrido.",
    },
  };
  const m = mapa[motivo]!;
  return paginaDePopup({
    ok: false,
    titulo: m.titulo,
    detalhe: m.detalhe,
    oQueFazer: m.oQueFazer,
    carga: { type: "meta_auth_error", error: m.titulo, etapa: detalheTecnico ?? motivo },
  });
}
