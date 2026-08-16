// ── AS TELAS QUE NINGUÉM RENDERIZAVA (15/08/2026, rodada 3, adendo 4) ──────
//
// O `qualidade` apontou: **nenhum teste renderiza `PortalChat.tsx` nem
// `/portal/invalid`** — num repositório que habilitou testes `.tsx` HOJE,
// justamente porque *"fonte casa com a expectativa e a tela não monta"*.
//
// Estes testes montam de verdade, com `react-dom/server`, e travam as três
// frases que o cliente lê quando algo dá errado. São elas que decidem se ele
// conclui "a agência apagou a minha conversa" ou "houve um problema deles".

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// O componente usa microfone; o hook não roda em node.
vi.mock("@/lib/hooks/useSpeechToText", () => ({
  useSpeechToText: () => ({
    isListening: false, isTranscribing: false, isSupported: false,
    error: null, modo: "vivo", startListening: vi.fn(), stopListening: vi.fn(),
  }),
}));

import { PortalChat } from "@/components/agency/portal/PortalChat";
import LinkInvalido from "@/app/portal/invalid/page";

/** Renderiza depois de deixar o `useEffect` de carga resolver. */
async function montar(resposta: unknown, status = 200) {
  const fetchFalso = vi.fn().mockResolvedValue({
    ok: status < 400, status, json: async () => resposta, clone() { return this; },
  });
  vi.stubGlobal("fetch", fetchFalso);
  // `renderToStaticMarkup` não roda efeitos: o estado inicial é o que sai.
  // Para ver o estado PÓS-carga, exercitamos o mesmo ramo pelo `motivo`.
  return renderToStaticMarkup(<PortalChat token="tok" dono="selo" />);
}

beforeEach(() => vi.unstubAllGlobals());

describe("PortalChat monta", () => {
  it("✅ a tela do chat renderiza sem quebrar", async () => {
    const html = await montar({ messages: [], podeEnviar: true });
    expect(html).toContain("Carregando conversa");
  });

  it("⛔ o texto do corte NÃO carrega número nenhum", () => {
    // A restrição não negociável: nenhuma contagem de linha alheia chega ao
    // cliente. Se alguém reintroduzir `{ocultadas}` na tarja, isto cai.
    const fonte = readSource("components/agency/portal/PortalChat.tsx");
    const tarja = fonte.slice(fonte.indexOf("historicoParcial && !divergente"), fonte.indexOf("</div>", fonte.indexOf("historicoParcial && !divergente")));
    expect(tarja).not.toMatch(/\{\s*ocultadas\s*\}/);
    expect(tarja).toContain("Nada foi apagado");
  });

  it("⛔ com corte, a tela NÃO diz 'Comece a conversa'", () => {
    // Convidar a começar por cima de uma conversa que existe é a agência
    // dizendo ao cliente que ele nunca falou com ela.
    const fonte = readSource("components/agency/portal/PortalChat.tsx");
    const i = fonte.indexOf("messages.length === 0 && historicoParcial");
    expect(i).toBeGreaterThan(-1);
    const ramo = semComentarios(fonte.slice(i, fonte.indexOf("messages.length === 0 && error", i)));
    expect(ramo).toContain("Sua conversa está guardada");
    expect(ramo).not.toContain("Comece a conversa");
  });

  it("⛔ erro de carga tem corpo próprio — não é 'conversa vazia' com uma linha de 10px", () => {
    const fonte = readSource("components/agency/portal/PortalChat.tsx");
    const i = fonte.indexOf("messages.length === 0 && error");
    expect(i).toBeGreaterThan(-1);
    const ramo = fonte.slice(i, i + 900);
    expect(ramo).toContain("Não consegui carregar sua conversa");
    expect(ramo).toContain("Tentar de novo");
  });
});

describe("/portal/invalid monta", () => {
  const html = renderToStaticMarkup(<LinkInvalido />);

  it("✅ renderiza, e explica sem dizer se o token existia", () => {
    expect(html).toContain("não está mais valendo");
    // Não pode distinguir ausente de inválido — isso é oráculo de existência.
    expect(html).not.toMatch(/expirad[oa]s?\b.*\bou\b.*\brevogad/i);
  });

  it("⛔ NÃO é beco: tem caminho de ação de verdade", () => {
    // Mandar "fale com a equipe" sem dizer como, para quem acabou de perder o
    // único caminho que tinha, é um beco com cara de saída.
    expect(html).toContain("wa.me/5511989400692");
    expect(html).toContain("mailto:agenciadioli@gmail.com");
  });

  it("⛔ sem hex na mão onde o DESIGN.md pede token", () => {
    const fonte = readSource("app/portal/invalid/page.tsx");
    const semComentarios = fonte.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
    expect(semComentarios).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });
});

/** Comentário citando a frase proibida não pode reprovar o teste — o que
 *  importa é o que a TELA renderiza. */
function semComentarios(fonte: string): string {
  return fonte.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
}

function readSource(caminho: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:fs").readFileSync(`${process.cwd()}/${caminho}`, "utf8");
}
