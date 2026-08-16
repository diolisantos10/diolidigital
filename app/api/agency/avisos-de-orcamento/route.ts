// O AVISO DE ORÇAMENTO QUE FALHOU — visível, e reenviável sem duplicar.
//
// ── O QUE ISTO CONSERTA (16/08/2026) ────────────────────────────────────────
//
// `RESEND_FROM` não existe no Railway (medido). Sem ela, `lib/email/send.ts`
// cai no remetente compartilhado da Resend, que só entrega para o dono da
// própria conta — no dia do deploy, TODO prospect da fila falha o aviso de
// orçamento. Até aqui a falha virava `console.warn` e um
// `avisosQueFalharam.push(...)` que só vivia enquanto durava a rodada do
// relógio: nenhuma fila, nenhum reenvio, evidência apagada no rodízio do log.
//
// `lib/agency/esteira/orcamento-do-briefing.ts` passou a GRAVAR o resultado
// (sucesso incluído) em `ClientRequestDb.avisoOrcamento*`. Esta rota é a
// SUPERFÍCIE dessa gravação:
//
//   GET  — quem está com orçamento entregue no portal e o e-mail que não saiu.
//          "Distinguir os fatos": `falhou` (Resend recusou) e `skipped`
//          (RESEND_API_KEY ausente) aparecem — nunca `sem_canal` (não é
//          falha, é fato: não há e-mail declarado, e o portal já atendeu) e
//          nunca `avisado` (já saiu).
//   POST — reenvia. Só alcança quem está em `falhou`/`skipped` — o mesmo
//          filtro do GET — porque é a garantia de não duplicar: quem já
//          recebeu tem status `avisado` e nunca aparece nas duas listas.
//
// ── POR QUE NÃO HÁ TELA NOVA AQUI ────────────────────────────────────────────
// A ficha deste conserto veda editar página (`app/agency/**`) — só rota nova
// sob `app/api/**`. Esta rota é o degrau que falta para uma tela existente (ou
// um botão futuro) consumir; sem ela não havia ONDE olhar. Curto prazo: quem
// precisa do número hoje faz `GET` autenticado (painel de direção já tem
// sessão) ou `curl` com o segredo de operação — o mesmo padrão de
// `app/api/produto-tecnologia/cadeia/route.ts`.
//
// Autenticação: sessão de equipe restrita a gestão (master/diretor/PM) e ao
// departamento `client-service-sdr` — a MESMA regra da tela, ver a seção "A
// DIVERGÊNCIA FECHADA" abaixo — OU o segredo de operação (`Bearer` com
// `PILOTO_SECRET`/`CRON_SECRET`). Sem segredo configurado, o caminho por
// token nem abre — ausência de chave nunca vira porta aberta.
//
// ── A DIVERGÊNCIA FECHADA — A API AGORA DIZ O MESMO QUE A PÁGINA
// (medida pelo `seguranca` em 16/08/2026, fechada pelo Diretor no mesmo dia) ─
// Até aqui esta rota usava `requireSession()` sem `allowedRoles` — aceitava
// QUALQUER papel interno autenticado, inclusive papéis operacionais como
// `social_staff`, que podiam chamá-la direto por `fetch`/`curl` e disparar
// reenvio de e-mail real a prospect. A TELA que a consome
// (`/agency/avisos-de-orcamento/page.tsx`) sempre foi mais estreita:
// `proxy.ts` + `lib/agency/organizacao/paginas.ts` (`acesso: "dono_e_gestao"`)
// só deixam gestão e `client-service-sdr` renderizarem a página — qualquer
// outro papel nunca via o botão. O Diretor tinha decidido, também em
// 16/08/2026, MANTER a API na amplitude antiga por ora — não apertar papel de
// equipe no meio de um piloto ao vivo sem medir o custo operacional antes.
//
// Ele reabriu essa decisão no MESMO DIA, com o custo medido: é ZERO. A única
// porta para esta rota é a tela, e a tela já era restrita — manter a API mais
// aberta que a única coisa que a chama não protegia operação nenhuma, só
// deixava uma porta lateral que ninguém usa e que a próxima auditoria teria
// de investigar de novo. Por isso `autenticar()` agora chama
// `exigirApiInterna("/agency/avisos-de-orcamento")`
// (`lib/agency/organizacao/guarda.ts`) no lugar de `requireSession()` —
// reusa a MESMA `podeAbrirRota` que a página já usava, então as duas não têm
// como voltar a divergir sem que alguém mude as duas de propósito. O
// caminho por segredo de operação (`PILOTO_SECRET`/`CRON_SECRET`) não muda:
// ele não tem sessão nem papel, continua entrando ANTES desta checagem, e
// segue sendo `{ casaInteira: true }` por decisão própria (ver acima).
//
// ── A FRONTEIRA DO WORKSPACE (16/08/2026, devolução do `seguranca`) ─────────
// `autenticar()` respondia SÓ "existe sessão?" — nunca "esta sessão é dona
// deste dado?". As três consultas abaixo não tinham `workspaceId` nenhum:
// qualquer funcionário logado, de qualquer workspace, via negócio, e-mail e
// motivo de falha de prospects de TODA a base, e o reenvio disparava e-mail
// de verdade para prospect de agência alheia. `autenticar` agora devolve
// também o `escopo` (`EscopoDoAviso`, de `orcamento-do-briefing.ts`) — sessão
// vira `{ workspaceId: session.workspaceId }`, e o segredo de operação vira
// `{ casaInteira: true }` DE PROPÓSITO (decisão e motivo completo no
// cabeçalho de `orcamento-do-briefing.ts`: o segredo é credencial de
// infraestrutura, não de workspace, e já é o mesmo escopo do relógio). As
// três funções da esteira agora exigem esse escopo — sem ele, não compila.
//
// ── O BALDE DOS LEGADOS (16/08/2026) ────────────────────────────────────────
// `avisoOrcamentoStatus IS NULL` não é `falhou` — é "não sabemos": pedidos
// processados por uma versão do relógio (`a2d06fb1`, já em produção) que
// entregava no portal mas não gravava resultado nenhum do e-mail. O `GET`
// mostra esse balde SEPARADO, com a ambiguidade escrita na própria resposta;
// o `POST` só o alcança com o campo explícito `incluirLegados: true` no
// corpo — nunca por padrão. Ver o comentário longo em
// `lib/agency/esteira/orcamento-do-briefing.ts` (seção "O BALDE DOS
// LEGADOS") para o mecanismo completo e o porquê de não haver um quinto
// status gravado por palpite.

import { NextRequest, NextResponse } from "next/server";
import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
import { prisma } from "@/lib/db/client";
import { segredoConfere } from "@/lib/security/crypto";
import { lerContato } from "@/lib/agency/comercial/contato-do-lead";
import {
  reenviarAvisosQueFalharam,
  contarAvisosLegados,
  reenviarAvisosLegados,
  type LegadoDeAviso,
  type EscopoDoAviso,
} from "@/lib/agency/esteira/orcamento-do-briefing";
import { apenasDoWorkspace } from "@/lib/auth/posse-de-workspace";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";

export const dynamic = "force-dynamic";

// A mesma chave de `paginas.ts` — a rota e a tela leem a MESMA regra
// (`podeAbrirRota`, via `exigirApiInterna`). Ver a seção "A DIVERGÊNCIA
// FECHADA" no cabeçalho deste arquivo.
const ROTA = "/agency/avisos-de-orcamento";

type Autenticado = { quem: string; escopo: EscopoDoAviso };

async function autenticar(request: NextRequest): Promise<Autenticado | { erro: NextResponse }> {
  const cabecalho = request.headers.get("authorization") ?? "";
  const segredo = process.env.PILOTO_SECRET || process.env.CRON_SECRET;
  const doHeader = cabecalho.toLowerCase().startsWith("bearer ") ? cabecalho.slice(7).trim() : null;
  if (segredo && segredoConfere(doHeader, segredo)) {
    // Decisão escrita, não implícita: o segredo de operação não tem sessão,
    // logo não tem workspace — e é "casa inteira" DE PROPÓSITO. O motivo
    // completo (e por que é seguro) está no cabeçalho de
    // `orcamento-do-briefing.ts`. Este caminho continua ANTES da checagem de
    // papel abaixo — ele não tem sessão nem papel, e não pode passar por ela.
    return { quem: "operacao:sala-de-controle", escopo: { casaInteira: true } };
  }
  const guarda = await exigirApiInterna(ROTA);
  if (guarda.erro) return { erro: guarda.erro };
  const { session } = guarda.acesso;
  return { quem: `direcao:${session.userId}`, escopo: { workspaceId: session.workspaceId } };
}

type LinhaPendente = {
  id: string;
  businessName: string | null;
  briefingJson: string | null;
  sdrHandoffJson: string | null;
  avisoOrcamentoStatus: string | null;
  avisoOrcamentoDetalhe: string | null;
  avisoOrcamentoEm: string | null;
  avisoOrcamentoTentativas: number | null;
  /** Presentes SÓ para a fronteira de posse decidir de quem é a linha — nunca
   *  aparecem na resposta da rota (ver o `.map` abaixo, que não os inclui). */
  workspaceId: string | null;
  clientId: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await autenticar(request);
  if ("erro" in auth) return auth.erro;

  try {
    // `falhou` e `skipped` são a MESMA lista que o reenvio busca — o painel
    // nunca deveria mostrar algo que o botão de reenviar não alcança.
    // `sem_canal` fica de fora de propósito: não é falha (regra 3 do
    // cabeçalho de `orcamento-do-briefing.ts`), é o portal tendo atendido sem
    // canal para avisar por fora — não há o que "reenviar" ali.
    //
    // A fronteira do workspace (16/08/2026): duas camadas, mesmo padrão de
    // `orcamento-do-briefing.ts` — o `WHERE` já reduz no banco quando há um
    // workspace (`casaInteira` não filtra, de propósito), e `apenasDoWorkspace`
    // reaplica a política completa (órfã-com-cliente incluída) em memória.
    const linhasCruas =
      "casaInteira" in auth.escopo
        ? await prisma.$queryRawUnsafe<LinhaPendente[]>(
            `SELECT id, businessName, briefingJson, sdrHandoffJson, workspaceId, clientId,
                    avisoOrcamentoStatus, avisoOrcamentoDetalhe, avisoOrcamentoEm, avisoOrcamentoTentativas
               FROM ClientRequestDb
              WHERE avisoOrcamentoStatus IN ('falhou', 'skipped')
              ORDER BY avisoOrcamentoEm ASC
              LIMIT 200`,
          )
        : await prisma.$queryRawUnsafe<LinhaPendente[]>(
            `SELECT id, businessName, briefingJson, sdrHandoffJson, workspaceId, clientId,
                    avisoOrcamentoStatus, avisoOrcamentoDetalhe, avisoOrcamentoEm, avisoOrcamentoTentativas
               FROM ClientRequestDb
              WHERE avisoOrcamentoStatus IN ('falhou', 'skipped')
                AND (workspaceId = ? OR workspaceId IS NULL)
              ORDER BY avisoOrcamentoEm ASC
              LIMIT 200`,
            auth.escopo.workspaceId,
          );
    const linhas =
      "casaInteira" in auth.escopo
        ? linhasCruas
        : await apenasDoWorkspace(linhasCruas, auth.escopo.workspaceId);

    const agora = Date.now();
    const pendentes = linhas.map((l) => {
      // Reaproveita a mesma leitura de contato do resto da esteira — nunca um
      // segundo parser de "onde está o e-mail deste lead".
      const contato = lerContato({ briefingJson: l.briefingJson, sdrHandoffJson: l.sdrHandoffJson });
      const em = l.avisoOrcamentoEm ? new Date(l.avisoOrcamentoEm) : null;
      return {
        id: l.id,
        negocio: l.businessName || null,
        status: l.avisoOrcamentoStatus,
        motivo: l.avisoOrcamentoDetalhe,
        contatoEmail: contato.email,
        desde: l.avisoOrcamentoEm,
        // `null`, nunca 0 disfarçado: `em` ausente significa "nunca gravamos
        // quando", que só aconteceria se a coluna tivesse sido escrita fora
        // deste caminho.
        horasEsperando: em ? Math.floor((agora - em.getTime()) / 3_600_000) : null,
        tentativas: l.avisoOrcamentoTentativas ?? 0,
      };
    });

    // O balde de legados é uma pergunta separada — falha nele não deve
    // derrubar a lista de `pendentes`, que já está de pé. Ver o cabeçalho
    // deste arquivo e a seção "O BALDE DOS LEGADOS" na esteira.
    //
    // A ambiguidade vai escrita na própria resposta — quem consumir esta
    // rota não pode ler `legados.total` como se fosse "quantos falharam".
    const AMBIGUIDADE_DOS_LEGADOS =
      "avisoOrcamentoStatus NULL não é 'falhou' — é 'não sabemos'. São pedidos já " +
      "entregues no portal por uma versão do relógio anterior a esta coluna " +
      "existir. Não são reenviados pelo POST padrão — só com o campo explícito " +
      "{ incluirLegados: true } no corpo.";

    let legados: { medido: boolean; total: number; itens: LegadoDeAviso[]; ambiguidade: string; motivo?: string };
    try {
      const l = await contarAvisosLegados(auth.escopo);
      legados = { medido: true, total: l.total, itens: l.itens, ambiguidade: AMBIGUIDADE_DOS_LEGADOS };
    } catch (e2) {
      console.error("[agency/avisos-de-orcamento] GET (legados) error", e2);
      legados = {
        medido: false,
        total: 0,
        itens: [],
        ambiguidade: AMBIGUIDADE_DOS_LEGADOS,
        motivo: "o banco não respondeu — este balde NÃO é zero, é desconhecido",
      };
    }

    // O quarto balde (16/08/2026, tela): `sem_canal` já é gravado por
    // `orcamento-do-briefing.ts` — o prospect não deixou e-mail, o portal
    // JÁ atendeu (ver a regra 3 do cabeçalho de lá), e não há para onde
    // reenviar. Não é falha; é fato. Por isso nunca entrou no `WHERE` de
    // `pendentes` acima nem no do reenvio — e é exatamente por isso que a
    // tela precisa dele separado: sem esta contagem, "sem e-mail" e
    // "silenciosamente ignorado" ficam indistinguíveis para quem olha o
    // painel. Mesma fronteira de workspace em duas camadas das outras duas
    // consultas desta rota; falha aqui não derruba `pendentes` nem `legados`,
    // que já estão de pé.
    const AMBIGUIDADE_SEM_CANAL =
      "avisoOrcamentoStatus = 'sem_canal' não é falha — é fato: o prospect não " +
      "declarou e-mail. O orçamento já foi entregue no portal. Não há botão de " +
      "reenviar aqui porque não há para onde mandar.";
    let semCanal: { medido: boolean; total: number; ambiguidade: string; motivo?: string };
    try {
      const cruSemCanal =
        "casaInteira" in auth.escopo
          ? await prisma.$queryRawUnsafe<{ id: string; workspaceId: string | null; clientId: string | null }[]>(
              `SELECT id, workspaceId, clientId FROM ClientRequestDb WHERE avisoOrcamentoStatus = 'sem_canal' LIMIT 500`,
            )
          : await prisma.$queryRawUnsafe<{ id: string; workspaceId: string | null; clientId: string | null }[]>(
              `SELECT id, workspaceId, clientId FROM ClientRequestDb
                WHERE avisoOrcamentoStatus = 'sem_canal'
                  AND (workspaceId = ? OR workspaceId IS NULL)
                LIMIT 500`,
              auth.escopo.workspaceId,
            );
      const filtradoSemCanal =
        "casaInteira" in auth.escopo ? cruSemCanal : await apenasDoWorkspace(cruSemCanal, auth.escopo.workspaceId);
      semCanal = { medido: true, total: filtradoSemCanal.length, ambiguidade: AMBIGUIDADE_SEM_CANAL };
    } catch (e3) {
      console.error("[agency/avisos-de-orcamento] GET (sem_canal) error", e3);
      semCanal = {
        medido: false,
        total: 0,
        ambiguidade: AMBIGUIDADE_SEM_CANAL,
        motivo: "o banco não respondeu — este balde NÃO é zero, é desconhecido",
      };
    }

    return NextResponse.json({ medido: true, total: pendentes.length, pendentes, legados, semCanal });
  } catch (e) {
    console.error("[agency/avisos-de-orcamento] GET error", e);
    // Falha de leitura NÃO vira lista vazia — mesma lei de `/api/agency/leads`:
    // "não há nada pendente" e "não consegui olhar" são fatos opostos.
    return NextResponse.json(
      { medido: false, motivo: "o banco não respondeu — esta lista NÃO é zero, é desconhecida" },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await autenticar(request);
  if ("erro" in auth) return auth.erro;

  // FAIXA 1 do CSRF — só no caminho de SESSÃO (cookie): reenvia e-mail real a
  // prospect. O caminho por segredo (`casaInteira`) não tem cookie, então não
  // é alvo de CSRF — ver a nota de `deveBloquearMutacaoCrossSite`.
  if (!("casaInteira" in auth.escopo) && deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  // `incluirLegados` é um ATO DELIBERADO e SEPARADO — nunca o padrão. Corpo
  // ausente, malformado ou sem o campo é tratado como "não", nunca como
  // "sim": só um `true` explícito liga o reenvio do balde de legados.
  const corpo = await request.json().catch(() => ({}) as Record<string, unknown>);
  const incluirLegados = corpo?.incluirLegados === true;

  try {
    const r = await reenviarAvisosQueFalharam(auth.escopo);
    const resposta: Record<string, unknown> = { ok: true, pedidoPor: auth.quem, ...r };

    // O reenvio normal SEMPRE roda (comportamento inalterado). Os legados só
    // são tocados quando pedido — e aparecem num campo próprio, nunca
    // somados aos números acima, para quem lê nunca confundir "reenviei os
    // que falharam" com "reenviei os que eu nem sabia se tinham falhado".
    if (incluirLegados) {
      resposta.legados = await reenviarAvisosLegados(auth.escopo);
    }

    return NextResponse.json(resposta);
  } catch (e) {
    console.error("[agency/avisos-de-orcamento] POST error", e);
    return NextResponse.json({ ok: false, motivo: e instanceof Error ? e.message : "erro desconhecido" }, { status: 500 });
  }
}
