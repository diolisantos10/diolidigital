import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// POR QUE ESTE TESTE EXISTE
//
// Na tela de confirmação do briefing — a última coisa que o prospect vê — havia
// um botão "Voltar ao início" que chamava `setSubmitted(false)`. Ou seja: ele
// devolvia a pessoa AO PRÓPRIO BRIEFING que ela acabara de enviar. O CEO, em
// 16/08/2026, com todas as letras: *"não faz o menor sentido."*
//
// O estrago passava do rótulo. Como `entrou` e `contatoDaPorta` não eram
// resetados junto, a porta de contato era pulada e o visitante caía num chat EM
// BRANCO, sob o mesmo cadastro, um segundo depois de ler "Recebemos seu
// briefing" — o convite perfeito para refazer tudo. E refazer significa, hoje,
// um segundo briefing, um cadastro-irmão e UMA SEGUNDA FATURA DE IA: o defeito
// que `docs/pendencias.md` (16/08) registra como "dinheiro real, sem dono", sem
// nenhum freio por contato.
//
// Este teste é de FONTE, e isso é escolha declarada: esta casa não tem
// `@testing-library` nem `jsdom` instalados (medido em 16/08), e adicionar
// dependência de render para travar um destino de link custaria mais do que
// protege. O precedente da casa é o mesmo — há testes que reprovam o ARQUIVO
// que perdeu uma linha obrigatória (ver `logger: false` do imapflow). Sem gate
// executável, a regra volta a ser um comentário que a próxima refatoração
// apaga sem ninguém perceber.
// ─────────────────────────────────────────────────────────────────────────────

const CAMINHO = join(process.cwd(), "app/briefing/page.tsx");
const ARQUIVO = readFileSync(CAMINHO, "utf8");

/**
 * O CÓDIGO, SEM OS COMENTÁRIOS — e isto não é preciosismo.
 *
 * O comentário que explica o conserto cita, de propósito, o que foi consertado:
 * a chamada `setSubmitted(false)` e o rótulo antigo. Uma busca ingênua no
 * arquivo inteiro acusaria o próprio registro histórico como se fosse o defeito
 * vivo — e a saída fácil seria apagar a explicação para o teste passar, ou seja,
 * jogar fora a única memória de por que a regra existe.
 *
 * Só caem os comentários de bloco (`/* … *​/`, que é a forma dos comentários de
 * JSX) e as linhas que COMEÇAM com `//`. `https://wa.me/…` fica de pé.
 */
const FONTE = ARQUIVO
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((linha) => !linha.trim().startsWith("//"))
  .join("\n");

describe("a confirmação do briefing devolve a pessoa AO SITE, não ao briefing", () => {
  it("não existe mais nada que remonte o formulário a partir da confirmação", () => {
    // `setSubmitted(false)` era o mecanismo exato da volta ao formulário vazio.
    // Ele não tem outro uso legítimo nesta tela: o único caminho de ida é
    // `setSubmitted(true)`, no fim do envio.
    expect(FONTE).not.toContain("setSubmitted(false)");
  });

  it("o botão leva à home, onde mora o Hero do site", () => {
    expect(FONTE).toMatch(/<Link\s+href="\/"/);
  });

  it("não ancora no id do SVG decorativo", () => {
    // `id="hero"` em `app/page.tsx` pertence ao `OrbitMotif`, um SVG DENTRO do
    // mockup. Ancorar nele pousaria o visitante no meio da seção e cortaria o
    // título no celular — o Hero é o topo da página, e `/` já chega nele.
    expect(FONTE).not.toContain('href="/#hero"');
    expect(FONTE).not.toContain("href={`/#hero`}");
  });

  it("o rótulo nomeia o destino em vez de um 'início' que ninguém sabe de quê", () => {
    // "Voltar ao início" não diz se o início é o do formulário ou o do site.
    // Rótulo que promete o que o botão não entrega é o mesmo defeito com outra
    // roupa — foi por isso que o rótulo entrou no mesmo conserto do destino.
    expect(FONTE).not.toContain("Voltar ao início");
    expect(FONTE).toContain("Voltar para o site da Dioli");
  });

  it("a referência do envio é impressa ANTES dos botões", () => {
    // Um dos botões agora TIRA a pessoa da página. Referência impressa depois
    // da saída é referência que ninguém lê.
    const posReferencia = FONTE.indexOf("Referência: {submittedId}");
    const posBotao = FONTE.indexOf("Voltar para o site da Dioli");
    expect(posReferencia).toBeGreaterThan(-1);
    expect(posBotao).toBeGreaterThan(-1);
    expect(posReferencia).toBeLessThan(posBotao);
  });

  // ── A OUTRA METADE: a mudança não pode ter levado embora o que funcionava ──
  // Trava que só prova o conserto deixa passar o estrago de carona. Estas duas
  // afirmam que a tela continua inteira.

  it("a saída pelo WhatsApp continua na tela", () => {
    expect(FONTE).toContain("Falar com a Dioli no WhatsApp");
    // ⚠️ O NÚMERO NÃO É MAIS PROCURADO AQUI, e a troca é deliberada.
    //
    // Até 16/08/2026 esta linha exigia o literal `https://wa.me/5511989400692`
    // dentro da página. O número estava repetido em OITO arquivos, e no mesmo
    // dia descobriu-se que este botão abria o WhatsApp **sem texto nenhum** —
    // a pessoa acabava de contar o negócio inteiro ao SDR e caía numa caixa
    // vazia. O conserto passou o link para a fonte única
    // (`comercial/link-do-whatsapp.ts`), que monta número E mensagem.
    //
    // Exigir o literal aqui teria travado exatamente o conserto: um teste que
    // fixa a IMPLEMENTAÇÃO em vez do COMPORTAMENTO vira cadeado contra a
    // melhoria. O que esta tela deve garantir é que a saída existe e leva o
    // contexto — quem prova o número e o texto é
    // `__tests__/briefing/whatsapp-comeca-a-conversa.test.ts`.
    expect(FONTE).toContain("linkDoBriefing");
  });

  it("o par de cor do botão do WhatsApp continua sendo token, não hex na mão", () => {
    // Em 16/08/2026 o CEO não conseguiu ler este botão: *"está preto sobre
    // preto."* A causa era `--text-primary` (cor de TEXTO) usada como FUNDO —
    // token que não vira junto com o tema é hex com nome de token. O par
    // `--primary`/`--primary-foreground` é o que a casa mantém invertido nos
    // dois temas, e é ele que tem de continuar aqui.
    expect(FONTE).toContain("bg-[var(--primary)]");
    expect(FONTE).toContain("text-[var(--primary-foreground)]");
  });
});
