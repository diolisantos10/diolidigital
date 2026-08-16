// GET /api/piloto/diagnostico — o tamanho da sujeira em produção, sem terminal.
//
// ─── POR QUE ESTA ROTA EXISTE ────────────────────────────────────────────────
//
// Em 16/08/2026 duas ferramentas de saneamento foram entregues medidas e
// armadas (`scripts/nome-do-negocio.mts` e `scripts/volume-subestimado.mts`), e
// as duas subiram ao CEO com o mesmo bloqueio escrito: **não há credencial de
// produção neste ambiente**. Três vezes no mesmo dia a medição parou em
// `npx @railway/cli whoami → "Unauthorized"`, e `railway login` é interativo.
//
// Pedir a credencial pela quarta vez seria aceitar o gargalo. O contorno já
// existia nesta casa e é o padrão de `/api/piloto/diario`: uma rota protegida
// por segredo, que **roda DENTRO do container** — onde o `DATABASE_URL` de
// produção é local — e que o CEO ou o Diretor consultam com um `curl`.
//
// Com isso a decisão que sobe ao CEO deixa de ser "você me dá credencial?" (que
// não deveria ser problema dele) e passa a ser "o tamanho é este, corrijo?" —
// que é a decisão dele.
//
// ─── SOMENTE LEITURA. NENHUM CAMINHO DE ESCRITA. NENHUM. ────────────────────
//
// Só `GET`, e o único verbo Prisma que este arquivo conhece é `findMany`. Não é
// zelo: **uma rota que corrige é uma rota que alguém dispara sem querer** — e o
// que estas ferramentas corrigem é nome de cliente e volume contratado, ou seja,
// preço. A correção continua sendo script com duas confirmações independentes, e
// o gatilho continua sendo do CEO.
//
// ─── E NÃO DEVOLVE MAIS DO QUE A PERGUNTA EXIGE ─────────────────────────────
//
// Contagens e ids. **Nenhum briefing inteiro, nenhum nome de prospect, nenhum
// telefone, nenhuma frase da conversa.** A frase original é a prova que a
// ferramenta usa para decidir, e por isso ela existe no relatório do SCRIPT —
// que roda no terminal de quem já tem acesso ao banco. Numa resposta HTTP de
// diagnóstico ela seria PII trafegando sem necessidade: o id basta para o CEO
// dimensionar e decidir.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { segredoConfere } from "@/lib/security/crypto";
import { retratoDoLote as retratoDoVolume, type PedidoGravado } from "@/lib/agency/comercial/volume-subestimado";
import { retratoDoLote as retratoDoNegocio, type LinhaDeNegocio } from "@/lib/agency/comercial/diagnostico-do-negocio";

export const dynamic = "force-dynamic";

/** Teto de linhas lidas. Diagnóstico é para dimensionar, não para exportar. */
const LIMITE = 500;

// ⚠️ ACHADO DO `seguranca` NA REVISÃO DESTA ROTA (16/08/2026) — configuração,
// não código:
//
// O fallback `PILOTO_SECRET || CRON_SECRET` é o padrão herdado do diário. Se
// `PILOTO_SECRET` NÃO estiver configurado em produção — cenário plausível, é
// variável nova —, o segredo que trafega em `?chave=` (e que aparece em log de
// proxy/CDN) passa a ser o **mesmo `CRON_SECRET` que autoriza ESCRITA** em
// `cron/v2`. Antes só o diário carregava esse risco; com esta rota, são duas
// espalhando um segredo de escrita em log de leitura.
//
// **Configurar `PILOTO_SECRET` como variável própria fecha o agravante sem
// mudar uma linha.** O `seguranca` não recomendou trocar `?chave=` por
// só-header: quebraria o uso por `curl`/link, que é a razão desta rota existir,
// e o risco real está no fallback, não no mecanismo.
function autorizado(request: NextRequest): boolean {
  const esperado = process.env.PILOTO_SECRET || process.env.CRON_SECRET;
  // Segredo ausente NUNCA vira rota aberta. O `if (secret)` que só protege
  // quando a variável existe é a família de defeito que o `seguranca` já mediu
  // nesta casa: em produção sem a variável, a porta fica escancarada e ninguém
  // percebe, porque tudo continua funcionando.
  if (!esperado) return false;
  const header = request.headers.get("authorization") ?? "";
  const doHeader = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const daQuery = request.nextUrl.searchParams.get("chave");
  // `segredoConfere` é comparação de tempo constante — a mesma do diário. Não se
  // inventa proteção nova quando a casa já tem uma provada.
  return segredoConfere(doHeader ?? daQuery, esperado);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const esperado = process.env.PILOTO_SECRET || process.env.CRON_SECRET;
  if (!esperado) {
    return NextResponse.json(
      { error: "PILOTO_SECRET não configurado — o diagnóstico fica fechado" },
      { status: 503 },
    );
  }
  if (!autorizado(request)) {
    return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  }

  try {
    const linhas = await prisma.clientRequestDb.findMany({
      select: { id: true, businessName: true, briefingJson: true },
      orderBy: { createdAt: "asc" },
      take: LIMITE,
    });

    // As duas regras já existem, já são puras e já são testadas fora do banco.
    // A rota só chama: uma terceira versão de "o que é sujeira" seria o defeito
    // que esta casa passou o dia inteiro fechando.
    const volume = retratoDoVolume(linhas as unknown as PedidoGravado[]);
    const negocio = retratoDoNegocio(linhas as unknown as LinhaDeNegocio[]);

    return NextResponse.json({
      medido: true,
      lidos: linhas.length,
      volume: {
        confere: volume.conferem,
        subestimado: volume.subestimados,
        // ⚠️ "não recuperável" NÃO é "está certo": é a ausência da conversa
        // gravada. Somar isto com `confere` esconderia o buraco.
        nao_recuperavel: volume.naoRecuperaveis,
        ids_subestimados: volume.mudancas.map((m) => m.id),
      },
      nome_do_negocio: {
        intactos: negocio.naoTocar,
        recuperavel_do_briefing: negocio.recuperar,
        vira_ausencia_declarada: negocio.declarar,
        ids_a_corrigir: negocio.mudancas.map((m) => m.id),
      },
      // O que fazer com o número — para quem lê o JSON não ter de perguntar.
      correcao: "npx tsx scripts/volume-subestimado.mts | scripts/nome-do-negocio.mts (simulam por padrão; escrever exige duas confirmações e é decisão do CEO)",
    });
  } catch (e) {
    console.error("[piloto/diagnostico] erro", e);
    // Falha de leitura NÃO vira zero. "Não há sujeira" e "não consegui olhar"
    // são fatos opostos, e o segundo com cara do primeiro é como esta casa
    // deixou uma fila invisível por sete semanas.
    return NextResponse.json(
      { medido: false, motivo: "o banco não respondeu — estes números NÃO são zero, são desconhecidos" },
      { status: 503 },
    );
  }
}
