// ─── DE MENSAGEM CRUA (RFC 822) PARA TEXTO LEGÍVEL ───────────────────────────
//
// A caixa da agência devolve a mensagem INTEIRA, como ela trafega: cabeçalhos,
// fronteiras de multipart, quoted-printable, base64, charset declarado no meio
// do `Content-Type`. O resto da casa (`extrairDeTexto`, `registrarOportunidade`)
// só sabe ler TEXTO. Este arquivo é a ponte, e ele é deliberadamente pequeno.
//
// ── POR QUE ESTE PEDAÇO É NOSSO, E O PROTOCOLO NÃO ──────────────────────────
// O cliente IMAP é de terceiro (`imapflow`) porque falar IMAP com o Gmail é um
// protocolo com estado que NÃO dá para exercitar aqui — a porta 993 não sai
// desta máquina. Já o parsing de MIME é função pura: entra `Buffer`, sai
// `string`. Isso a gente testa com mensagem real gravada em arquivo, sem rede,
// e é por isso que ele mora aqui em vez de puxar mais uma dependência.
//
// ── O QUE ELE NÃO FAZ, DE PROPÓSITO ─────────────────────────────────────────
// Não decodifica anexo, não segue `message/rfc822` aninhado além do primeiro
// nível útil, não trata `charset` exótico (big5, shift_jis). Nada disso aparece
// num alerta de marketplace brasileiro, e cada um seria mais superfície para um
// texto que vem de fora. Quando não sabe, devolve o que conseguir ler em UTF-8 —
// nunca lança.

/** O teto do que se aceita de uma mensagem. Alerta de marketplace tem alguns KB;
 *  1 MB já é uma thread inteira encaminhada por engano. O corte acontece ANTES
 *  do parsing — não adianta limitar depois de já ter materializado 40 MB. */
export const MENSAGEM_MAX_BYTES = 1024 * 1024;

export interface MensagemCrua {
  cabecalhos: Map<string, string[]>;
  corpo: string;
}

/**
 * Separa cabeçalhos de corpo e desdobra as linhas continuadas (a linha que
 * começa com espaço/tab pertence ao cabeçalho anterior — é assim que um assunto
 * longo trafega, e quem não desdobrar lê metade do assunto).
 *
 * Nomes de cabeçalho viram minúsculas. O mesmo nome pode aparecer várias vezes
 * (`Received`), então o valor é sempre uma lista.
 */
export function separarCabecalhos(cru: string): MensagemCrua {
  const normalizado = cru.replace(/\r\n?/g, "\n");
  const corte = normalizado.indexOf("\n\n");
  const blocoCabecalho = corte >= 0 ? normalizado.slice(0, corte) : normalizado;
  const corpo = corte >= 0 ? normalizado.slice(corte + 2) : "";

  const cabecalhos = new Map<string, string[]>();
  let atual: string | null = null;
  for (const linha of blocoCabecalho.split("\n")) {
    if (/^[ \t]/.test(linha) && atual) {
      const lista = cabecalhos.get(atual)!;
      lista[lista.length - 1] += ` ${linha.trim()}`;
      continue;
    }
    const m = /^([!-9;-~]+):[ \t]*(.*)$/.exec(linha);
    if (!m) continue;
    atual = m[1].toLowerCase();
    const lista = cabecalhos.get(atual) ?? [];
    lista.push(m[2]);
    cabecalhos.set(atual, lista);
  }
  return { cabecalhos, corpo };
}

export function cabecalho(m: MensagemCrua, nome: string): string | null {
  const v = m.cabecalhos.get(nome.toLowerCase());
  return v && v.length ? v[0].trim() : null;
}

// ── RFC 2047: "=?utf-8?B?...?=" ──────────────────────────────────────────────

/**
 * Decodifica assunto/nome codificado. Um assunto que chega como
 * `=?UTF-8?Q?Novo_projeto:_gest=C3=A3o_de_tr=C3=A1fego?=` vira texto legível.
 *
 * Importa porque o assunto do alerta É o título do projeto na maioria das
 * plataformas — e um título ilegível na fila de triagem é uma oportunidade que
 * ninguém abre.
 */
export function decodificarPalavras(valor: string): string {
  if (!valor.includes("=?")) return valor;
  return valor
    // Espaço entre duas palavras codificadas não é espaço de verdade (RFC 2047).
    .replace(/\?=[ \t]+=\?/g, "?==?")
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (todo, charset: string, tipo: string, dado: string) => {
      try {
        const bytes =
          tipo.toLowerCase() === "b"
            ? Buffer.from(dado, "base64")
            : Buffer.from(dado.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_s, h: string) =>
                String.fromCharCode(parseInt(h, 16)),
              ), "binary");
        return bytes.toString(codificacaoDeCharset(charset));
      } catch {
        // Cabeçalho quebrado não derruba a leitura da caixa: devolve como veio.
        return todo;
      }
    });
}

/** `<abc@mail.gmail.com>` ou `Fulano <fulano@x.com>` → `fulano@x.com`, minúsculo.
 *  Sem endereço reconhecível devolve string vazia — nunca um chute. */
export function enderecoDe(valor: string | null): string {
  if (!valor) return "";
  const entreSinais = /<([^>]+)>/.exec(valor);
  const bruto = (entreSinais ? entreSinais[1] : valor).trim();
  const m = /[^\s<>,;:"']+@[^\s<>,;:"']+/.exec(bruto);
  return m ? m[0].toLowerCase() : "";
}

// ── Corpo ────────────────────────────────────────────────────────────────────

/**
 * O texto útil da mensagem.
 *
 * Preferência: `text/plain` > `text/html` convertido. Alerta de marketplace
 * quase sempre manda as duas partes, e a de texto é a que não traz lixo de
 * layout — mas há plataforma que manda só HTML, e recusar essa mensagem seria
 * perder a oportunidade por causa do formato.
 */
export function textoDaMensagem(cru: Buffer | string): { texto: string; html: boolean } {
  const s = typeof cru === "string" ? cru : cru.toString("binary");
  const parte = melhorParte(s, 0);
  if (!parte) return { texto: "", html: false };
  return parte;
}

const PROFUNDIDADE_MAX = 6;

function melhorParte(cru: string, profundidade: number): { texto: string; html: boolean } | null {
  if (profundidade > PROFUNDIDADE_MAX) return null;
  const m = separarCabecalhos(cru);
  // ⚠️ DUAS FORMAS DO MESMO CABEÇALHO, e a distinção não é preciosismo: o NOME
  // do tipo é insensível a caixa, mas o valor de `boundary` **não é**. Ler a
  // fronteira do texto já minusculado faz `boundary="LIMITE"` virar `--limite`,
  // que não casa com nenhuma linha da mensagem — e a mensagem inteira volta
  // vazia, em silêncio. Foi assim que o primeiro alerta multipart deste arquivo
  // sumiu, e o teste pegou o que a leitura de código não pegaria.
  const tipoCru = cabecalho(m, "content-type") ?? "text/plain";
  const tipo = tipoCru.toLowerCase();

  if (tipo.startsWith("multipart/")) {
    const fronteira = parametro(tipoCru, "boundary");
    if (!fronteira) return null;
    const partes = fatiarPorFronteira(m.corpo, fronteira);
    // `multipart/alternative` manda do mais pobre para o mais rico: o texto puro
    // vem primeiro. Varre-se duas vezes de propósito — primeiro atrás de texto,
    // e só então aceitando HTML. Sem isso, uma parte HTML numa posição anterior
    // venceria o texto puro que existia logo abaixo.
    for (const p of partes) {
      const r = melhorParte(p, profundidade + 1);
      if (r && !r.html && r.texto.trim()) return r;
    }
    for (const p of partes) {
      const r = melhorParte(p, profundidade + 1);
      if (r && r.texto.trim()) return r;
    }
    return null;
  }

  if (!tipo.startsWith("text/")) return null;

  const codificacao = (cabecalho(m, "content-transfer-encoding") ?? "7bit").toLowerCase().trim();
  const charset = parametro(tipoCru, "charset") ?? "utf-8";
  const decodificado = decodificarCorpo(m.corpo, codificacao, charset);

  if (tipo.startsWith("text/html")) return { texto: htmlParaTexto(decodificado), html: true };
  return { texto: decodificado, html: false };
}

function parametro(contentType: string, nome: string): string | null {
  const m = new RegExp(`${nome}\\s*=\\s*"([^"]+)"|${nome}\\s*=\\s*([^;\\s]+)`, "i").exec(contentType);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function fatiarPorFronteira(corpo: string, fronteira: string): string[] {
  const marca = `--${fronteira}`;
  // ⚠️ `(?:--)` e não `(--)`: `String.split` com grupo de CAPTURA intercala os
  // grupos capturados no resultado, e a lista de partes passaria a ter
  // `undefined` no meio. Grupo não-capturante é o mecanismo.
  const pedacos = corpo.split(new RegExp(`^${escapar(marca)}(?:--)?[ \\t]*$`, "m"));
  // O primeiro pedaço é o preâmbulo (texto para cliente que não fala MIME) e o
  // último costuma ser o epílogo. Nenhum dos dois é parte.
  return pedacos.slice(1).map((p) => (p ?? "").replace(/^\n/, ""));
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** utf-8 é o caso normal; latin-1/windows-1252 ainda aparecem em e-mail
 *  brasileiro antigo. Charset desconhecido cai em utf-8 — errar o acento é
 *  muito melhor que descartar a mensagem. */
function codificacaoDeCharset(charset: string): BufferEncoding {
  const c = charset.toLowerCase().replace(/["']/g, "").trim();
  if (c.includes("8859-1") || c.includes("windows-1252") || c === "latin1") return "latin1";
  if (c.includes("ascii")) return "ascii";
  return "utf8";
}

function decodificarCorpo(corpo: string, codificacao: string, charset: string): string {
  const enc = codificacaoDeCharset(charset);
  try {
    if (codificacao === "base64") {
      return Buffer.from(corpo.replace(/\s+/g, ""), "base64").toString(enc);
    }
    if (codificacao === "quoted-printable") {
      const semSoftBreak = corpo.replace(/=\r?\n/g, "");
      const bytes = Buffer.from(
        semSoftBreak.replace(/=([0-9A-Fa-f]{2})/g, (_s, h: string) => String.fromCharCode(parseInt(h, 16))),
        "binary",
      );
      return bytes.toString(enc);
    }
    // 7bit / 8bit / binary: os bytes estão crus. `binary` acima os preservou.
    return Buffer.from(corpo, "binary").toString(enc);
  } catch {
    return corpo;
  }
}

/**
 * HTML → texto, o suficiente para a extração por regex funcionar.
 *
 * ⚠️ O resultado NUNCA é renderizado: ele vira `textoBruto` e é lido por regex.
 * Não há caminho de XSS aqui, e é por isso que não se precisa de um sanitizador
 * de verdade. Se algum dia alguém quiser MOSTRAR este HTML numa tela, este
 * comentário é o aviso de que este arquivo não é o lugar de fazê-lo.
 *
 * Mesma forma da que já roda em `/api/agency/oportunidades/email` — as duas
 * portas têm que ler o mesmo e-mail do mesmo jeito.
 */
export function htmlParaTexto(html: string): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
