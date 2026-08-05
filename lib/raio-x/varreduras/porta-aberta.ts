// PADRÃO 5 — Porta aberta para a internet.
//
// O que pescou de verdade, nesta casa: `/api/generate-image` respondia sem
// login, com a chave paga da agência atrás. Milhares de dólares por dia ao
// alcance de qualquer um que descobrisse a URL.
//
// TRADUÇÃO PARA ESTE CÓDIGO, e ela é específica desta casa: em `proxy.ts` o
// prefixo `/api/` está em `PUBLIC_PATHS`. Ou seja, **nenhuma rota de API é
// protegida pelo proxy** — cada uma se defende sozinha ou não se defende. Por
// isso a varredura não pergunta "esta rota é pública?"; pergunta "esta rota tem
// QUALQUER guarda?". Sem guarda + encostando em motor pago, dado de cliente ou
// escrita no banco = achado alto.

import { fontesDoProjeto, type Arquivo } from "../fonte";
import { cega, type Achado, type ResultadoDeVarredura } from "../tipos";

const NOME = "porta-aberta";

// AS GUARDAS DESTA CASA. A lista foi calibrada na primeira rodada de verdade
// (05/08/2026): faltavam duas famílias, e sem elas 6 dos 8 achados eram ruído —
// o que mata o relatório mais rápido do que não ter relatório.
const GUARDA =
  /requireSession|verifySession|getSession|requireRole|segredoConfere|CRON_SECRET|portal-guard|portalGuard|PortalAccess|tokenDoPortal|assertPublic|createHmac|timingSafeEqual|signed_request|x-signature/;

/** A guarda das rotas que TÊM que ser públicas e mesmo assim gastam: o
 *  `/briefing` chama Claude e Whisper sem login, por desenho. Limite por IP é
 *  guarda de verdade — mas é a MAIS FRACA da casa (o contador vive na memória do
 *  processo, some no deploy e não atravessa réplica). Por isso não zera o
 *  achado: rebaixa. Some da lista de "sem guarda" e entra como vigilância. */
const LIMITE_PUBLICO = /rateLimited|chaveDeRotaPublica/;

const MOTOR_PAGO = /gerarImagem|generateImage|analisarImagens|transcrever|callProvider|chamarProvedor|runAgent|openai|anthropic|gemini/i;
const TOCA_BANCO = /prisma\./;
const ESCREVE = /prisma\.\w+\.(create|update|updateMany|delete|deleteMany|upsert)/;

/** Rotas que TÊM que ser públicas, por contrato de produto. Lista explícita:
 *  exceção que não está escrita vira exceção que ninguém revisa. */
const PUBLICAS_POR_CONTRATO = [
  "app/api/health/route.ts",
  "app/api/briefings/publico/route.ts",
  "app/api/self-serve/route.ts",
  "app/api/auth/signin/route.ts",
  "app/api/auth/signout/route.ts",
];

export function varrerPortaAberta(entrada?: Arquivo[]): ResultadoDeVarredura {
  const rotas = (entrada ?? fontesDoProjeto(["app"])).filter((f) => /route\.tsx?$/.test(f.caminho));
  if (rotas.length === 0) return cega(NOME, "porta-aberta", "nenhuma rota lida — varredura não olhou nada");

  const achados: Achado[] = [];
  let semGuarda = 0;
  let apenasComLimite = 0;

  for (const { caminho, texto } of rotas) {
    if (PUBLICAS_POR_CONTRATO.includes(caminho)) continue;
    if (GUARDA.test(texto)) continue;

    const pago = MOTOR_PAGO.test(texto);
    const escreve = ESCREVE.test(texto);
    const banco = TOCA_BANCO.test(texto);
    if (!pago && !banco) continue; // rota sem guarda que não encosta em nada é ruído

    const soLimite = LIMITE_PUBLICO.test(texto);
    if (soLimite) apenasComLimite++;
    else semGuarda++;

    achados.push({
      padrao: "porta-aberta",
      chave: `porta-aberta:${caminho}`,
      titulo: soLimite
        ? "Rota pública paga protegida só por limite por IP (contador na memória do processo)"
        : pago
          ? "Rota sem guarda encostada em motor pago"
          : escreve
            ? "Rota sem guarda que ESCREVE no banco"
            : "Rota sem guarda que lê dado do banco",
      evidencia: soLimite
        ? `${caminho} é pública por desenho e ${pago ? "chama motor pago" : "grava no banco"}; a única defesa é rateLimited, que não sobrevive a deploy nem a segunda réplica`
        : `${caminho} não referencia nenhuma guarda (sessão, portal, cron ou assinatura) e ${
            pago ? "chama motor pago" : escreve ? "grava no banco" : "consulta o banco"
          }`,
      local: caminho,
      gravidade: soLimite ? "medio" : pago || escreve ? "alto" : "medio",
    });
  }

  return {
    varredura: NOME,
    padrao: "porta-aberta",
    status: "rodou",
    achados,
    medidas: {
      rotas: rotas.length,
      rotasSemGuarda: semGuarda,
      rotasPublicasPagasComLimiteApenas: apenasComLimite,
      rotasSemGuardaQueImportam: achados.length,
    },
  };
}
