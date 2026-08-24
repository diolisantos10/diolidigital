// roteiro-farol.ts — o cliente fictício FAROL 27 no formato que a MÁQUINA já lê.
//
// Não é um case escrito à mão: é o mesmo `Roteiro` que `lib/agency/cliente-falso`
// consome. Quem conduz a conversa é o motor de perguntas da casa; aqui só moram
// os FATOS que o cliente sabe sobre o próprio negócio.
//
// ⚠️ TODO NÚMERO AQUI É **DECLARADO PELO CLIENTE, NÃO AUDITADO**. Nada nesta
// lista foi conferido contra plataforma, extrato ou painel. Ver `NAO_AUDITADO`.
//
// ⚠️ UMA PREMISSA CONSERVADORA, REGISTRADA: o caso do CEO não informa a verba de
// HONORÁRIOS (só a verba de mídia, R$ 30 mil/60 dias). Sem um número, a etapa
// comercial não pode ser medida. Adotou-se R$ 8.000/mês como premissa declarada
// pelo cliente — marcada como premissa, nunca como fato do caso.

import type { Roteiro } from "../cliente-falso/roteiro";
import { MARCA_DO_CLIENTE_FALSO, DOMINIO_DO_CLIENTE_FALSO } from "../cliente-falso/trava-de-saida";

export const NAO_AUDITADO = "declarado pelo cliente, não auditado";

/** Os números que o cliente declarou. Nenhum foi conferido. */
export const DECLARADO_NAO_AUDITADO = {
  faturamentoMensalBRL: 420_000,
  ticketMedioBRL: 38,
  mixPresencialPct: 65,
  mixDeliveryPct: 25,
  mixEncomendasPct: 10,
  instagramSeguidores: 18_400,
  instagramEngajamentoPct: "<1% (estimado pelo próprio cliente)",
  tiktokSeguidores: 780,
  whatsappContatos: 6_000,
  verbaDeMidiaBRL: 30_000,
  verbaDeMidiaDias: 60,
  honorariosMensaisBRL: 8_000, // ⚠️ PREMISSA, não fato do caso
} as const;

/** O que o cliente NÃO tem. Cada item é uma lacuna que vira pendência. */
export const LACUNAS_DO_CLIENTE = [
  "brand book",
  "vetor confirmado do logo",
  "regras de aplicação da marca",
  "paleta documentada",
  "tom de voz definido",
  "moodboard",
  "personas",
  "biblioteca de assets",
  "histórico de versões da marca",
  "tracking validado (site antigo sem medição confiável)",
  "comprovação de consentimento dos ~6 mil contatos de WhatsApp",
  "número oficial de WhatsApp confirmado para CTA",
] as const;

export const ARQUIVO_DO_FAROL = "briefing-farol-27.pdf";

export const ROTEIRO_FAROL: Roteiro = {
  nomeDoNegocioNaTela: `Farol 27 Padaria & Café ${MARCA_DO_CLIENTE_FALSO}`,
  nomeDoNegocioNaFala: "Farol 27",
  contatoDaPorta: {
    // Ana é a decisora. Contato em domínio `.invalid` (RFC 2606): não existe e
    // nunca existirá — a trava de saída barra o domínio inteiro.
    nome: `Ana Farol ${MARCA_DO_CLIENTE_FALSO}`,
    email: `ana.farol@${DOMINIO_DO_CLIENTE_FALSO}`,
    whatsapp: "5511900000027",
  },
  aberturaEspontanea:
    "Oi! Somos a Farol 27, uma padaria e café na Grande São Paulo — 3 lojas e uma cozinha central, 6 anos de casa.",
  turnoDaOfertaDeDocumento: 5,
  turnoDoAnexo: 6,
  quandoNaoEntende: "Desculpa, não entendi. Pode explicar de outro jeito?",
  fatos: [
    { id: "nome_do_negocio", intencao: "apresenta",
      quandoPerguntam: /nome do seu neg[óo]cio|nome da (sua )?empresa|qual (é|e) o nome/i,
      responde: "O negócio se chama Farol 27 — Padaria & Café." },

    { id: "servico", intencao: "pede_servico",
      quandoPerguntam: /gest[ãa]o de redes sociais, tr[áa]fego pago|est[áa] precisando|buscando gest[ãa]o/i,
      responde: "Queremos reposicionar a marca e lançar o Clube Farol 27, uma assinatura de café da manhã de R$ 149 por mês. Precisamos de identidade, conteúdo e anúncios." },

    { id: "objetivo", intencao: "declara_objetivo",
      quandoPerguntam: /principal objetivo|o que voc[êe] quer alcan[çc]ar/i,
      responde: "Vender assinaturas do Clube Farol 27 e parar de depender só do balcão." },

    { id: "publico", intencao: "declara_publico",
      quandoPerguntam: /p[úu]blico-?alvo|cliente ideal/i,
      responde: "Moradores e trabalhadores num raio de 3 km das lojas, 25 a 45 anos, e empresas da região que pedem café da manhã corporativo." },

    { id: "modo", intencao: "responde_livre",
      quandoPerguntam: /contrato mensal|campanha pontual/i,
      responde: "Contrato mensal, mas com um projeto de lançamento de 8 semanas dentro." },

    { id: "canais", intencao: "responde_livre",
      quandoPerguntam: /quais canais|instagram, facebook, tiktok/i,
      responde: "Instagram, TikTok e WhatsApp." },

    { id: "volume", intencao: "declara_volume",
      quandoPerguntam: /quantas postagens por semana|quantas vezes por semana|publicar no feed|ritmo/i,
      responde: "3 posts por semana no feed" },

    { id: "stories", intencao: "responde_livre",
      quandoPerguntam: /stories/i,
      responde: "Stories sim, uns 3 por semana." },

    { id: "reels", intencao: "responde_livre",
      quandoPerguntam: /reels ou v[íi]deos|quantos por m[êe]s/i,
      responde: "Sim, 8 vídeos curtos por mês para o TikTok." },

    { id: "video", intencao: "responde_livre",
      quandoPerguntam: /gravar e editar|produ[çc][ãa]o do v[íi]deo/i,
      responde: "A gente grava na loja com celular; roteiro e edição queremos de vocês." },

    { id: "fotos", intencao: "responde_livre",
      quandoPerguntam: /fotos|banco de imagens|material visual/i,
      responde: "Temos fotos de loja e de produto, cardápios antigos, embalagens e prints das redes. Brand book a gente não tem." },

    { id: "copy", intencao: "responde_livre",
      quandoPerguntam: /textos \(copy\)|criar os textos|fornecer o conte[úu]do/i,
      responde: "Os textos ficam com vocês — não temos tom de voz definido." },

    { id: "trafego", intencao: "responde_livre",
      quandoPerguntam: /tr[áa]fego pago.*(quer|incluir)|an[úu]ncios no instagram, facebook ou google/i,
      responde: "Sim, queremos anúncios." },

    { id: "plataforma_anuncios", intencao: "responde_livre",
      quandoPerguntam: /an[úu]ncios seriam em qual plataforma|meta \(instagram\/facebook\)/i,
      responde: "Meta e TikTok. A divisão entre os dois a gente não sabe fazer — quem decide é vocês." },

    { id: "verba_anuncios", intencao: "responde_livre",
      quandoPerguntam: /verba mensal dispon[íi]vel para os an[úu]ncios|vai direto para o google/i,
      responde: "R$ 30 mil para 60 dias, ou seja R$ 15 mil por mês de anúncios." },

    { id: "operacao_basica", intencao: "responde_livre",
      quandoPerguntam: /@ do seu instagram|hor[áa]rio e dias|bairros ou cidades/i,
      responde:
        "Nosso Instagram é @farol27cafe. Abrimos todo dia das 6h30 às 20h. "
        + "Atendemos a Grande São Paulo num raio de 3 km de cada loja, e sim, "
        + "atendemos por WhatsApp — mas o número oficial ainda não está confirmado internamente." },

    { id: "area", intencao: "responde_livre",
      quandoPerguntam: /onde est[ãa]o os clientes|cidade|raio/i,
      responde: "Grande São Paulo, 3 km em volta de cada uma das 3 lojas." },

    { id: "identidade", intencao: "responde_livre",
      quandoPerguntam: /identidade visual|j[áa] tem logo|logo\/identidade/i,
      responde: "Temos um logo em PNG, mas não temos vetor confirmado nem manual de marca." },

    { id: "referencias", intencao: "responde_livre",
      quandoPerguntam: /concorrentes ou refer[êe]ncias|inspira[çc][ãa]o/i,
      responde: "Gostamos do jeito da Padaria Santa Tereza e do Coffee Lab." },

    { id: "verba", intencao: "declara_verba",
      quandoPerguntam: /faixa de or[çc]amento|or[çc]amento mensal voc[êe] tem em mente|investimento mensal para a gest/i,
      responde: "Nosso orçamento é de R$ 8000 por mês para a gestão." },

    { id: "prazo", intencao: "declara_prazo",
      quandoPerguntam: /para quando voc[êe] quer come[çc]ar|prazo/i,
      responde: "Queremos começar agora — o lançamento do Clube é em 8 semanas." },
  ],
  declarado: {
    postsPorSemana: 3,
    verbaMensal: 8000,
    fraseDaVerba: "R$ 8000 por mês",
    fraseDoVolume: "3 posts por semana no feed",
  },
};
