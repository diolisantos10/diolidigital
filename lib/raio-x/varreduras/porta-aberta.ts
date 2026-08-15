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

/** A GUARDA DA V2 — calibração de 15/08/2026.
 *
 *  `lib/agency/organizacao/guarda.ts` nasceu depois da lista acima e é hoje a
 *  porta das rotas internas: `exigirApiInterna` devolve **401** sem sessão e
 *  **403** para quem não é interno ou não alcança a rota; `exigirCapacidade` e
 *  `exigirAdministracao` passam por ela antes de estreitar mais. Negam de
 *  verdade — foi conferido função a função, não aceito de palavra.
 *
 *  A varredura não conhecia esse vocabulário e acusava **6 rotas** de "sem
 *  guarda", 2 delas "que ESCREVEM no banco". Seis alarmes falsos numa lista de
 *  onze é o número que ensina o CEO a não ler o relatório. */
const GUARDA_DA_ORGANIZACAO = /exigirApiInterna|exigirAdministracao|exigirCapacidade|exigirAcessoInterno/;

/** ⚠️ E AQUI ESTÁ A METADE QUE IMPEDE ISTO DE SER AFROUXAMENTO.
 *
 *  `exigirApiInterna` **não barra sozinha**: ela devolve `{ acesso, erro }` e
 *  quem chama tem de fazer `if (erro) return erro`. Uma rota que chama a guarda
 *  e ignora o `erro` fica indistinguível de uma rota protegida para qualquer
 *  varredura que só procure o nome da função — e é exatamente esse o jeito mais
 *  fácil de a proteção sumir numa alteração feita com pressa.
 *
 *  Então reconhecer a guarda **exige as duas coisas**: chamá-la e devolver o
 *  erro. Chamar sem devolver não vira "protegida": vira achado próprio, ALTO,
 *  porque é pior que não ter guarda nenhuma (parece protegida numa revisão). */
const DEVOLVE_A_NEGATIVA = /return\s+[A-Za-z_$][\w$]*\.erro\b|return\s+erro\b/;

/** A guarda das rotas que TÊM que ser públicas e mesmo assim gastam: o
 *  `/briefing` chama Claude e Whisper sem login, por desenho. Limite por IP é
 *  guarda de verdade — mas é a MAIS FRACA da casa (o contador vive na memória do
 *  processo, some no deploy e não atravessa réplica). Por isso não zera o
 *  achado: rebaixa. Some da lista de "sem guarda" e entra como vigilância. */
const LIMITE_PUBLICO = /rateLimited|chaveDeRotaPublica/;

/** O teto que MORA NO BANCO (`lib/security/limite-no-banco.ts`) — o conserto de
 *  06/08/2026 para as quatro rotas públicas pagas. Ele atravessa deploy e
 *  réplica e é fail-closed, então NÃO é a mesma coisa que o contador em memória.
 *  Continua aparecendo no relatório de propósito: rota pública que gasta chave
 *  paga merece ser olhada para sempre. O que muda é a gravidade e o texto — o
 *  raio-x não deixa de contar nada, e mentir sobre a defesa seria pior que o
 *  achado. */
const LIMITE_DURAVEL = /limiteExcedido|consumirVaga/;

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
  let comLimiteDuravel = 0;
  let comGuardaDaOrganizacao = 0;
  let guardaIgnorada = 0;

  for (const { caminho, texto } of rotas) {
    if (PUBLICAS_POR_CONTRATO.includes(caminho)) continue;

    // A guarda da V2 é reconhecida SÓ quando o erro dela volta para o cliente.
    if (GUARDA_DA_ORGANIZACAO.test(texto)) {
      if (DEVOLVE_A_NEGATIVA.test(texto)) {
        comGuardaDaOrganizacao++;
        continue;
      }
      guardaIgnorada++;
      achados.push({
        padrao: "porta-aberta",
        chave: `guarda-ignorada:${caminho}`,
        titulo: "Rota CHAMA a guarda interna e não devolve o erro dela",
        evidencia: `${caminho} chama exigirApiInterna/exigirCapacidade/exigirAdministracao mas não há "return <guarda>.erro" — a guarda calcula a negativa e ninguém a entrega, então a requisição segue em frente. Parece protegida numa revisão; não está`,
        local: caminho,
        gravidade: "alto",
      });
      continue;
    }

    if (GUARDA.test(texto)) continue;

    const pago = MOTOR_PAGO.test(texto);
    const escreve = ESCREVE.test(texto);
    const banco = TOCA_BANCO.test(texto);
    if (!pago && !banco) continue; // rota sem guarda que não encosta em nada é ruído

    const duravel = LIMITE_DURAVEL.test(texto);
    const soLimite = !duravel && LIMITE_PUBLICO.test(texto);
    if (duravel) comLimiteDuravel++;
    else if (soLimite) apenasComLimite++;
    else semGuarda++;

    const oQueFaz = pago ? "chama motor pago" : escreve ? "grava no banco" : "consulta o banco";

    achados.push({
      padrao: "porta-aberta",
      chave: `porta-aberta:${caminho}`,
      titulo: duravel
        ? "Rota pública paga com teto de ritmo NO BANCO (sobrevive a deploy e a réplica)"
        : soLimite
          ? "Rota pública paga protegida só por limite por IP (contador na memória do processo)"
          : pago
            ? "Rota sem guarda encostada em motor pago"
            : escreve
              ? "Rota sem guarda que ESCREVE no banco"
              : "Rota sem guarda que lê dado do banco",
      evidencia: duravel
        ? `${caminho} é pública por desenho e ${oQueFaz}; a defesa é limiteExcedido (contador em RateLimitBucket, atômico e fail-closed). Continua listada porque rota pública que gasta merece vigilância permanente`
        : soLimite
          ? `${caminho} é pública por desenho e ${oQueFaz}; a única defesa é rateLimited, que não sobrevive a deploy nem a segunda réplica`
          : `${caminho} não referencia nenhuma guarda (sessão, portal, cron ou assinatura) e ${oQueFaz}`,
      local: caminho,
      gravidade: duravel ? "baixo" : soLimite ? "medio" : pago || escreve ? "alto" : "medio",
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
      rotasPublicasPagasComLimiteNoBanco: comLimiteDuravel,
      rotasSemGuardaQueImportam: achados.length,
      rotasComGuardaDaOrganizacao: comGuardaDaOrganizacao,
      rotasQueChamamAGuardaEIgnoram: guardaIgnorada,
    },
  };
}
