// ─── A FECHADURA DA TRAVA DE CONVERSA — a implementação real, no banco ─────
//
// Até 30/08/2026 `PortaDaConversa` era SÓ INTERFACE: o motor da próxima
// mensagem rodava apenas com substituto de teste. Isso é a doença crônica
// desta casa — trava sem fechadura — e neste caso era grave, porque o CEO
// nomeou a trava de conversa como CRITÉRIO DE CONCLUSÃO:
//
//   "não concluído se dois agentes podem responder ao mesmo tempo"
//   "não concluído se o histórico não sobreviver ao reinício"
//
// ── POR QUE A RESERVA É UM `create`, E NÃO UM "LEIA E DEPOIS GRAVE" ───────
// O jeito natural seria: ler a conversa, ver se tem dono, e se não tiver,
// gravar o meu nome. Esse jeito está errado, e o erro não aparece em teste
// sequencial — só com dois agentes de verdade. Entre o "ver que está livre" e
// o "gravar meu nome" cabe o outro agente inteiro, fazendo as duas coisas.
// Os dois leem "livre", os dois gravam, e os dois acham que têm a trava.
//
// Aqui `conversaId` é CHAVE PRIMÁRIA de `TravaDaConversaDaCelula`. O segundo
// `create` falha por unicidade, e quem decide é o BANCO, não o nosso código.
// É o mesmo desenho de `RateLimitBucket`, adotado pelo mesmo motivo: "ler e
// depois escrever deixa duas requisições simultâneas passarem pelo mesmo
// '9 de 10'".
//
// ── TRAVA VENCIDA É TOMADA, NÃO ESPERADA ──────────────────────────────────
// Um processo que morre segurando a trava prenderia a conversa para sempre —
// e "nenhum estado prende trabalho para sempre" é regra desta casa. A tomada
// da trava vencida também é atômica: um `updateMany` CONDICIONADO a
// `expiraEm < agora`. Se dois agentes tentarem tomar a mesma trava vencida no
// mesmo instante, o banco entrega `count: 1` a um só.

import { prisma } from "@/lib/db/client";
import type {
  PortaDaConversa,
  EstadoDaConversa,
} from "@/lib/agency/celula/mensagens/trava-de-conversa";

/**
 * Lê o estado da conversa, de forma DEFENSIVA.
 *
 * O JSON no banco pode estar corrompido, ter sido gravado por uma versão
 * anterior, ou vir vazio. Em qualquer desses casos devolvemos `null`, que o
 * motor trata como "conversa inexistente" e BLOQUEIA. Um estado remendado com
 * defaults seria pior que nenhum: o motor decidiria "esta pergunta ainda não
 * foi feita" sobre um histórico que na verdade não conseguimos ler, e a
 * pergunta repetida — que a trava existe para impedir — sairia.
 */
function estadoDeclarado(conversaId: string, bruto: unknown): EstadoDaConversa | null {
  if (typeof bruto !== "string" || bruto.trim() === "") return null;
  let cru: unknown;
  try {
    cru = JSON.parse(bruto);
  } catch {
    return null;
  }
  if (cru === null || typeof cru !== "object") return null;
  const o = cru as Record<string, unknown>;

  const lista = (v: unknown): string[] | null =>
    Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;

  const perguntas = lista(o.perguntasJaFeitas);
  const modelos = lista(o.modelosJaUsados);
  if (perguntas === null || modelos === null) return null;
  if (typeof o.etapa !== "string" || o.etapa === "") return null;

  const respostas =
    o.respostasRecebidas !== null &&
    typeof o.respostasRecebidas === "object" &&
    !Array.isArray(o.respostasRecebidas)
      ? (o.respostasRecebidas as Record<string, string>)
      : null;
  if (respostas === null) return null;

  const arquivos = Array.isArray(o.arquivos) ? o.arquivos : null;
  if (arquivos === null) return null;

  return {
    conversaId,
    ultimaRecebida: (o.ultimaRecebida ?? null) as EstadoDaConversa["ultimaRecebida"],
    ultimaEnviada: (o.ultimaEnviada ?? null) as EstadoDaConversa["ultimaEnviada"],
    agenteResponsavel: typeof o.agenteResponsavel === "string" ? o.agenteResponsavel : null,
    etapa: o.etapa,
    perguntasJaFeitas: perguntas,
    respostasRecebidas: respostas,
    arquivos: arquivos as EstadoDaConversa["arquivos"],
    proximaAcao: typeof o.proximaAcao === "string" ? o.proximaAcao : null,
    modelosJaUsados: modelos,
  };
}

/**
 * A porta de verdade. `agora` é injetável para o teste não depender do relógio
 * da máquina — teste que depende de relógio é teste que falha às 23h59.
 */
export function portaDaConversaNoBanco(
  db: typeof prisma = prisma,
  agora: () => Date = () => new Date(),
): PortaDaConversa {
  return {
    async ler(conversaId) {
      const linha = await db.conversaDaCelula.findUnique({ where: { conversaId } });
      if (!linha) return null;
      return estadoDeclarado(conversaId, linha.estado);
    },

    async reservar({ conversaId, agente, expiraEm }) {
      const limite = new Date(expiraEm);
      if (Number.isNaN(limite.getTime())) return false;

      // 1ª tentativa: a trava não existe. O `create` é a corrida, e quem a
      // perde recebe erro de unicidade do BANCO — não um `if` nosso.
      try {
        await db.travaDaConversaDaCelula.create({
          data: { conversaId, agente, expiraEm: limite },
        });
        return true;
      } catch {
        // Já existe alguém. Pode ser trava viva (então não é nossa) ou trava
        // VENCIDA de um processo que morreu (então é tomável).
      }

      // 2ª tentativa: tomar a vencida, de forma atômica. A condição
      // `expiraEm < agora` está no WHERE, e não numa leitura anterior — se
      // dois agentes tentarem ao mesmo tempo, só um recebe `count: 1`.
      const tomada = await db.travaDaConversaDaCelula.updateMany({
        where: { conversaId, expiraEm: { lt: agora() } },
        data: { agente, expiraEm: limite },
      });
      if (tomada.count === 1) return true;

      // 3ª hipótese: a trava é MINHA e estou renovando. Também condicional —
      // renovar a trava de outro agente seria roubá-la.
      const renovada = await db.travaDaConversaDaCelula.updateMany({
        where: { conversaId, agente },
        data: { expiraEm: limite },
      });
      return renovada.count === 1;
    },

    async liberar({ conversaId, agente }) {
      // `deleteMany` com o agente no WHERE: só solta o que é seu. Um
      // `delete({ where: { conversaId } })` deixaria qualquer agente liberar a
      // trava de qualquer outro — que é o mesmo que não ter trava.
      await db.travaDaConversaDaCelula.deleteMany({ where: { conversaId, agente } });
    },
  };
}

/**
 * Grava o estado da conversa. Fica aqui, e não na porta, de propósito: a
 * `PortaDaConversa` que o motor recebe é de LEITURA e TRAVA. Quem escreve
 * histórico é o fluxo que processa a mensagem, e separar as duas evita que um
 * caminho de leitura ganhe, sem querer, poder de reescrever o passado.
 */
export async function gravarEstadoDaConversa(
  p: { workspaceId: string; estado: EstadoDaConversa },
  db: typeof prisma = prisma,
): Promise<void> {
  const dados = {
    workspaceId: p.workspaceId,
    estado: JSON.stringify(p.estado),
    agenteResponsavel: p.estado.agenteResponsavel,
    etapa: p.estado.etapa,
  };
  await db.conversaDaCelula.upsert({
    where: { conversaId: p.estado.conversaId },
    create: { conversaId: p.estado.conversaId, ...dados },
    update: dados,
  });
}
