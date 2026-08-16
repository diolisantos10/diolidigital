// A FALHA DO MOTOR DE ORÇAMENTO VIRA REGISTRO — porque "travou" tem que ser um
// fato lido, não um palpite de relógio.
//
// ─── O DEFEITO ───────────────────────────────────────────────────────────────
//
// `POST /api/brain/client-requests` dispara `runAutoScope` em fire-and-forget:
//
//     runAutoScope(record.id).catch((e) => { console.error(...) });
//
// Quando ele rejeita, o erro vai para o console do servidor **e para lugar
// nenhum mais**. A solicitação fica em `new` para sempre, com zero canvases e
// aparência de fila normal. Ninguém — nem a tela do cliente, nem a fila da
// agência — consegue distinguir "está montando agora" de "morreu há dois dias".
//
// ─── POR QUE NÃO UM `status` NOVO ────────────────────────────────────────────
//
// A saída óbvia seria mover o `status` para algo como `escopo_falhou`. Ela está
// errada, e o motivo é o raio-x: os baldes `briefing-parado-com-contato` e
// `briefing-parado-sem-contato` consultam `status: "new"`. Tirar a solicitação
// de `new` a faria **sumir da fila que cobra a agência** — exatamente o lead que
// mais precisa ser cobrado. Consertar a tela do cliente desligando o alarme da
// casa seria trocar um defeito visível por um silencioso.
//
// Então a falha entra em `briefingJson`, num campo próprio e reservado, e o
// `status` não se mexe. É onde o contato do lead já mora (a rota funde
// `{ contato }` ali desde 08/08), então não é precedente novo — e não custa
// migration numa semana em que `prisma/` está com outra frente.

/** A chave reservada dentro de `briefingJson`. O prefixo `_` diz o que é: campo
 *  do sistema, não coisa que o cliente escreveu. */
const CHAVE = "_falhaDeEscopo";

export interface FalhaDeEscopo {
  motivo: string;
}

/**
 * Reduz um erro qualquer a uma frase que pode ser mostrada ao cliente.
 *
 * NÃO é `String(e)`: a mensagem crua de um erro carrega caminho de arquivo,
 * nome de tabela e às vezes trecho de query. Mostrar isso numa tela pública é
 * entregar o mapa da casa a quem provocar o erro de propósito. O cliente recebe
 * uma frase curta em português; o console do servidor continua recebendo o erro
 * inteiro para quem for consertar.
 */
export function motivoParaOCliente(e: unknown): string {
  const cru = e instanceof Error ? e.message : String(e ?? "");
  if (/not found/i.test(cru)) return "não encontramos seu briefing na hora de montar";
  if (/timeout|ETIMEDOUT|ECONNRESET/i.test(cru)) return "o sistema demorou demais para responder";
  if (/prisma|database|SQLITE|ECONNREFUSED/i.test(cru)) return "nosso banco de dados não respondeu";
  return "uma falha interna no motor de orçamento";
}

/**
 * O `briefingJson` chega em DUAS formas nesta casa, e as duas são legítimas:
 * o Prisma devolve a coluna como `string`, e `client-request-service` já a
 * entrega desserializada em `Record<string, unknown>`. Normalizar aqui, num
 * lugar só, evita a alternativa — cada chamador fazendo o seu `JSON.parse`,
 * que é como nascem os dois leitores que divergem.
 */
type BriefingJson = string | Record<string, unknown> | null | undefined;

function comoObjeto(v: BriefingJson): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const lido = JSON.parse(v);
      if (lido && typeof lido === "object" && !Array.isArray(lido)) return lido as Record<string, unknown>;
    } catch {
      // JSON quebrado no banco não pode fazer o registro da falha se perder — a
      // falha é justamente a informação que ninguém tem. Guarda o original como
      // texto, para não destruir prova, e segue.
      return { _briefingJsonIlegivel: v };
    }
  }
  return {};
}

/**
 * Funde o registro da falha no `briefingJson` já existente, sem perder nada do
 * que estava lá — o contato do lead mora nesse mesmo objeto.
 */
export function gravarFalhaDeEscopo(atual: BriefingJson, motivo: string): Record<string, unknown> {
  return { ...comoObjeto(atual), [CHAVE]: { motivo } satisfies FalhaDeEscopo };
}

/**
 * Lê a falha registrada. Devolve `null` quando não há — e `null` significa
 * "não falhou", nunca "não sei": quem não conseguiu ler o banco não chega aqui.
 */
export function lerFalhaDeEscopo(briefingJson: BriefingJson): FalhaDeEscopo | null {
  const f = comoObjeto(briefingJson)[CHAVE];
  if (f && typeof f === "object" && typeof (f as FalhaDeEscopo).motivo === "string") {
    return { motivo: (f as FalhaDeEscopo).motivo };
  }
  return null;
}
