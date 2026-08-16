// A ORDEM DO PACOTE DO SDR VIROU REGRA DE DOIS LUGARES — e os dois lugares
// precisam concordar, sempre, ou a trava para de proteger em silêncio.
//
// ── O RISCO QUE ESTE TESTE FECHA ────────────────────────────────────────────
//
// O conserto de 16/08 inverteu a ordem do JSON que o SDR devolve: `scope`
// (os dados do briefing) é escrito ANTES de `reply` (a fala). O motivo: quando
// o teto de tokens corta a resposta no meio, o corte cai no ÚLTIMO campo que
// estava sendo escrito. Com `scope` primeiro, o dado do cliente já está
// fechado no texto quando o corte acontece — só a fala se perde, e a fala se
// pede de novo; o dado, não.
//
// O PR #178 fez o system prompt do SDR passar a receber, em runtime, um bloco
// de regras lido direto da ficha do cargo (`regras-da-ficha.ts`), que se
// declara autoridade SOBRE o prompt base: "em conflito com qualquer instrução
// acima, ESTAS REGRAS VALEM". Isso é correto para regras de comportamento —
// mas cria um perigo específico para uma garantia estrutural como a ordem do
// JSON: se um dia alguém editar a ficha e escrever (ou reordenar) algo que
// implique `reply` antes de `scope`, a ficha teria autoridade DECLARADA sobre
// o prompt base, o `max_tokens` continuaria igual, o guarda de código
// (`falaConfiavel` em app/api/sdr/chat/route.ts) continuaria igual, e NADA no
// teste que só olha o prompt base acusaria o problema. O corte voltaria a
// cair em cima do dado do cliente, e os testes que hoje existem (que testam
// `repararJsonTruncado`, não a ficha nem o prompt montado) continuariam
// verdes.
//
// Por isso a regra da ordem passou a existir TAMBÉM dentro dos marcadores
// REGRAS-DO-CARGO da ficha (ver `agentes/linha/client-service-sdr/
// conversational-sdr.md`, regra 7), e este teste prova as duas metades:
// que a regra está na ficha, com a ordem certa e sem a ordem inversa; e que
// ela sobrevive na montagem final do prompt — o texto que o modelo de fato
// recebe, não um pedaço isolado.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { trechoEntreMarcadores } from "@/lib/agency/catalogo-v2/regras-da-ficha";
// `sistemaDoSdr` deixou de morar na rota (despacho `esteira`, 16/08 — segunda
// rodada): arquivo de rota do Next só admite os exports que o framework
// reconhece, e uma função exportada a mais passa no `tsc`/`vitest` mas quebra
// o `npm run build`. A montagem do prompt agora é módulo comum.
import { sistemaDoSdr } from "@/lib/agency/comercial/prompt-do-sdr";

const CAMINHO_DA_FICHA = join(
  process.cwd(),
  "agentes/linha/client-service-sdr/conversational-sdr.md",
);
const FICHA = readFileSync(CAMINHO_DA_FICHA, "utf8");

/**
 * A checagem em si, como função pura — reutilizada pelo caso real e pelo caso
 * plantado, para que as duas metades do teste usem exatamente a mesma régua.
 *
 * Exige, no texto entre os marcadores da ficha:
 *   1. as duas palavras-chave presentes — com crase, entre aspas retas, ou em
 *      prosa solta ("o campo scope", "a fala (reply)"). Uma reescrita legítima
 *      da regra não é obrigada a citar os nomes de campo entre crases: exigir
 *      isso é regra implícita que ninguém escreveu em lugar nenhum, e barra
 *      texto correto. `\bscope\b`/`\breply\b` acham a palavra em qualquer uma
 *      das formas, sem depender de pontuação ao redor;
 *   2. `scope` mencionado ANTES de `reply` como ordem exigida do pacote — não
 *      basta as palavras existirem soltas em qualquer lugar do texto.
 */
function trechoExigeScopeAntesDeReply(trecho: string): boolean {
  const normalizado = trecho.toLowerCase();
  const posScope = normalizado.search(/\bscope\b/);
  const posReply = normalizado.search(/\breply\b/);
  if (posScope === -1 || posReply === -1) return false;
  return posScope < posReply;
}

/**
 * Recorta, dentro do trecho REGRAS-DO-CARGO, só o PARÁGRAFO DA ORDEM — âncora
 * na frase "A ordem dentro do pacote não é livre" (texto estável da ficha)
 * até o próximo item numerado em negrito ("\n\n**8.", por exemplo) ou o fim
 * do trecho, se for o último parágrafo.
 *
 * Por quê: `trechoExigeScopeAntesDeReply` mede a PRIMEIRA ocorrência de cada
 * palavra-chave. Aplicada ao bloco REGRAS-DO-CARGO inteiro (9 regras, ~80
 * linhas), isso é frágil por coincidência de posição — o mesmo acidente que
 * `sistemaDoSdr()` já sofreu e que motivou recortar a partir de "REGRAS DA
 * SUA FICHA DE CARGO" (ver o teste "a garantia sobrevive na montagem final").
 * Se um dia uma regra anterior (2, 5, o que for) citar "reply" antes de a
 * regra 7 aparecer, medir o bloco inteiro reprovaria mesmo com a regra da
 * ordem intacta e correta. Medir só o parágrafo da ordem elimina esse ruído.
 *
 * Fail-closed: se a âncora não existir no trecho, devolve `null` — quem
 * chama decide reprovar com mensagem, nunca segue adiante com recorte vazio.
 */
const ANCORA_PARAGRAFO_DA_ORDEM = "A ordem dentro do pacote não é livre";

function trechoDoParagrafoDaOrdem(trecho: string): string | null {
  const inicio = trecho.indexOf(ANCORA_PARAGRAFO_DA_ORDEM);
  if (inicio === -1) return null;
  const resto = trecho.slice(inicio);
  const fimRelativo = resto.search(/\n\n\*\*\d+\./);
  return fimRelativo === -1 ? resto : resto.slice(0, fimRelativo);
}

/** Acusa instrução de ordem INVERSA — `"reply"` mandado antes de `"scope"`. */
function trechoMandaReplyAntesDeScope(trecho: string): boolean {
  const normalizado = trecho.replace(/`/g, '"').toLowerCase();
  // Padrão explícito de instrução invertida: "reply" ... "antes" ... "scope"
  // (ou variações próximas), não apenas as palavras em qualquer ordem.
  return /"reply"[^.]{0,40}antes[^.]{0,40}"scope"/i.test(normalizado);
}

describe("ordem do pacote do SDR — a regra plantada é barrada", () => {
  it("ficha SEM a regra da ordem reprova", () => {
    const semRegra = `
      <!-- REGRAS-DO-CARGO:INICIO -->
      **1. Alguma regra qualquer.** Nada aqui fala da ordem do pacote.
      <!-- REGRAS-DO-CARGO:FIM -->
    `;
    const trecho = trechoEntreMarcadores(semRegra);
    expect(trecho).not.toBeNull();
    expect(trechoExigeScopeAntesDeReply(trecho ?? "")).toBe(false);
  });

  it("ficha com a ordem INVERTIDA (reply antes de scope) reprova", () => {
    const invertida = `
      <!-- REGRAS-DO-CARGO:INICIO -->
      **7. O pacote.** Escreva "reply" antes de "scope", sempre.
      <!-- REGRAS-DO-CARGO:FIM -->
    `;
    const trecho = trechoEntreMarcadores(invertida) ?? "";
    expect(trechoMandaReplyAntesDeScope(trecho)).toBe(true);
    expect(trechoExigeScopeAntesDeReply(trecho)).toBe(false);
  });

  // ── A METADE QUE FALTAVA: a trava também precisa provar que NÃO barra ──────
  // redação legítima. Até aqui só existiam casos plantados para REPROVAR
  // (sem a regra, ordem invertida). Sem um caso plantado que PASSA, a régua
  // podia estar apertada demais e ninguém saberia — regra desta casa: toda
  // trava prova as duas metades, barra o problema E não inventa problema no
  // caso limpo.
  it("uma reescrita legítima do parágrafo (outras palavras, mesma ordem, sem crase) PASSA", () => {
    const reescrita = `
      <!-- REGRAS-DO-CARGO:INICIO -->
      **7. O pacote de saída.** A ordem dentro do pacote não é livre: o dado do
      briefing, o campo scope, é sempre escrito antes da fala ao cliente, o
      campo reply. Assim, se a resposta cortar no meio, o que se perde é a
      fala — o dado do cliente já está fechado no texto.
      <!-- REGRAS-DO-CARGO:FIM -->
    `;
    const trecho = trechoEntreMarcadores(reescrita) ?? "";
    const paragrafo = trechoDoParagrafoDaOrdem(trecho);
    expect(paragrafo, "a âncora do parágrafo da ordem precisa existir no caso plantado").not.toBeNull();
    // Nem "scope" nem "reply" estão entre crases ou aspas neste texto — é
    // prosa comum, do jeito que uma reescrita humana realmente escreveria.
    expect(paragrafo).not.toContain('"scope"');
    expect(paragrafo).not.toContain("`scope`");
    expect(trechoExigeScopeAntesDeReply(paragrafo ?? "")).toBe(true);
    expect(trechoMandaReplyAntesDeScope(paragrafo ?? "")).toBe(false);
  });

  it("ficha real de hoje PASSA — regra presente, na ordem certa, sem instrução inversa", () => {
    const trecho = trechoEntreMarcadores(FICHA);
    expect(trecho).not.toBeNull();
    // Medida no PARÁGRAFO DA ORDEM, não no bloco REGRAS-DO-CARGO inteiro — ver
    // o porquê no comentário de `trechoDoParagrafoDaOrdem`.
    const paragrafo = trechoDoParagrafoDaOrdem(trecho ?? "");
    expect(paragrafo, "a âncora do parágrafo da ordem precisa existir na ficha").not.toBeNull();
    expect(trechoExigeScopeAntesDeReply(paragrafo ?? "")).toBe(true);
    expect(trechoMandaReplyAntesDeScope(trecho ?? "")).toBe(false);
  });
});

describe("ordem do pacote do SDR — a ficha real carrega a regra", () => {
  it("o trecho entre os marcadores cita scope e reply, scope primeiro", () => {
    const trecho = trechoEntreMarcadores(FICHA);
    expect(trecho, "a ficha precisa delimitar REGRAS-DO-CARGO").not.toBeNull();
    // Idem: parágrafo da ordem, não o bloco inteiro — mesma razão de cima.
    const paragrafo = trechoDoParagrafoDaOrdem(trecho ?? "");
    expect(paragrafo, "a âncora do parágrafo da ordem precisa existir na ficha").not.toBeNull();
    expect(trechoExigeScopeAntesDeReply(paragrafo ?? "")).toBe(true);
  });

  it("o trecho entre os marcadores NÃO manda a ordem inversa", () => {
    const trecho = trechoEntreMarcadores(FICHA) ?? "";
    expect(trechoMandaReplyAntesDeScope(trecho)).toBe(false);
  });

  it("a regra diz o porquê — sem procedência é a primeira que se relativiza", () => {
    const trecho = trechoEntreMarcadores(FICHA) ?? "";
    // O motivo estrutural (corte cai no último campo escrito) precisa estar
    // articulado, não só a ordem nua.
    expect(trecho).toMatch(/corte/i);
    expect(trecho.toLowerCase()).toContain("último");
  });
});

describe("ordem do pacote do SDR — a garantia sobrevive na montagem final", () => {
  it("sistemaDoSdr() — o texto que o modelo de fato vê — exige scope antes de reply", () => {
    const montado = sistemaDoSdr();

    // ── Por que NÃO se mede `montado` inteiro com `trechoExigeScopeAntesDeReply` ──
    // Essa régua compara a PRIMEIRA ocorrência de cada palavra-chave no texto
    // que recebe. Aplicada ao prompt inteiro (~200 linhas), isso é uma trava
    // frágil: ela passa ou falha por COINCIDÊNCIA DE POSIÇÃO — qualquer menção
    // solta e inofensiva a "reply" antes do bloco FORMATO (ex.: prosa
    // explicando o pacote) derruba o teste mesmo com o prompt correto, e o
    // inverso — um texto com a ordem de fato errada em algum bloco isolado —
    // pode passar se outra ocorrência antiga de "scope" ficar na frente por
    // acaso. Foi exatamente esse acidente que este teste pegou: a linha do
    // bloco PACOTE nomeava "reply" antes de "scope" em prosa, antes de o bloco
    // FORMATO sequer aparecer, e derrubava a asserção mesmo com o JSON do
    // esquema na ordem certa. A régua correta é medir o BLOCO QUE SE DECLARA
    // AUTORIDADE — "REGRAS DA SUA FICHA DE CARGO" em diante — porque é esse
    // bloco que a ficha promete que vale por cima do resto do prompt (ver o
    // teste seguinte, "o bloco da ficha... se declara autoridade").
    const posBlocoDaFicha = montado.indexOf("REGRAS DA SUA FICHA DE CARGO");
    expect(posBlocoDaFicha, "o bloco da ficha precisa existir no montado").toBeGreaterThan(-1);
    const blocoDaFichaNoMontado = montado.slice(posBlocoDaFicha);
    expect(trechoExigeScopeAntesDeReply(blocoDaFichaNoMontado)).toBe(true);

    // A garantia do prompt BASE, em separado: o esquema JSON do bloco FORMATO
    // exige, em texto literal (não por posição), que `scope` seja escrito
    // antes de `reply` — a frase que o modelo lê como instrução, não só a
    // ordem das chaves no exemplo.
    expect(montado).toMatch(/ESCREVA\s+"scope"\s+ANTES\s+DE\s+"reply"/);
    expect(montado).toContain('"scope"');
    expect(montado).toContain('"reply"');
    expect(montado.indexOf('"scope"')).toBeLessThan(montado.lastIndexOf('"reply"'));
  });

  it("o bloco da ficha entra DEPOIS do prompt base e se declara autoridade — por isso a ordem tem de estar nos dois lugares", () => {
    const montado = sistemaDoSdr();
    const posEsquemaBase = montado.indexOf('"scope": {');
    const posBlocoDaFicha = montado.indexOf("REGRAS DA SUA FICHA DE CARGO");
    expect(posEsquemaBase, "o esquema do prompt base precisa existir").toBeGreaterThan(-1);
    expect(posBlocoDaFicha, "o bloco da ficha precisa existir").toBeGreaterThan(-1);
    // O bloco da ficha vem DEPOIS do prompt base no texto montado...
    expect(posBlocoDaFicha).toBeGreaterThan(posEsquemaBase);
    // ...e se declara autoridade sobre tudo que veio antes dele.
    expect(montado).toContain("ESTAS REGRAS VALEM");
    // É exatamente por isso que a regra da ordem não pode morar só no prompt
    // base: uma ficha editada sem a regra da ordem teria a palavra final sobre
    // um prompt base que a mantinha certa — e a garantia furaria em silêncio.
    // A regra tem de estar nos DOIS lugares, e este teste prova os dois.
    const trechoDaFicha = trechoEntreMarcadores(FICHA) ?? "";
    expect(trechoExigeScopeAntesDeReply(trechoDaFicha)).toBe(true);
  });
});
