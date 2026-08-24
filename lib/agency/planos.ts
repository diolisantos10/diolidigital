// OS PLANOS DA CASA — fonte única.
//
// Decidido pelo CEO em 05/08/2026 (ver `docs/precos.md`). Esta lista é a fonte
// da página pública `/planos` e de qualquer proposta que a esteira emitir. Preço
// de plano escrito em dois lugares vira dois preços diferentes na semana em que
// um deles muda — e o cliente sempre acha o menor.
//
// A REGRA QUE SUSTENTA A BASE DA TABELA: gente entra a partir do Presença.
// Abaixo disso a operação é máquina, e é só por isso que R$ 49 e R$ 297 fecham.
// Se a publicação do Ritmo virar nossa, o degrau quebra.
//
// O QUE NÃO PODE ENTRAR AQUI:
//   • serviço que a casa não entrega hoje com código rodando em produção. Desde
//     24/08/2026 isso não é só um aviso escrito: `so-vende-o-que-produz.test.ts`
//     passa cada linha de `inclui` pela régua de `capacidade-de-producao.ts` e
//     quebra se alguém prometer capacidade sem caminho de produção;
//   • vídeo (gravação, edição ou geração) — decisão do CEO: é o item de maior
//     custo real e sai da mensalidade, sempre;
//   • a tabela por serviço. Ela é interna, para cliente de carteira — não vai
//     para página pública.

export type Plano = {
  id: "pulso" | "ritmo" | "presenca" | "conteudo" | "crescimento";
  nome: string;
  preco: number;
  /** Cobrada uma vez, na entrada. `null` = isenta. */
  implantacao: number | null;
  paraQuem: string;
  /** O que muda em relação ao degrau de baixo — a frase que vende o degrau. */
  salto: string;
  /** Escopo numerado. Numerado de propósito: é o que vai para o contrato. */
  inclui: string[];
  /** O que NÃO está incluído. É esta lista que evita briga no terceiro mês. */
  naoInclui: string[];
  /** Meses de permanência mínima. */
  permanencia: number;
  /** Preço da peça além do contratado, em reais. `null` = não se aplica. */
  pecaExtra: number | null;
  /** O degrau que deve receber metade da carteira. */
  destaque?: boolean;
};

export const PECA_EXTRA = 180;

export const PLANOS: Plano[] = [
  {
    id: "pulso",
    nome: "Pulso",
    preco: 49,
    implantacao: null,
    paraQuem: "Para quem posta sozinho e não faz ideia se está funcionando.",
    salto: "Observa, mede e avisa — não produz.",
    inclui: [
      "Painel de resultados ao vivo: alcance, visualizações, engajamento e seguidores, direto do Instagram",
      "Relatório mensal escrito só com número medido — o que não foi medido é declarado, nunca estimado",
      "Métricas por post: qual peça rendeu e qual não rendeu",
      "Leitura do seu perfil na entrada: temas, tom, formatos e o que mais engaja",
      "Portal próprio, com acesso só seu",
    ],
    naoInclui: ["Nenhuma peça de conteúdo", "Nenhuma publicação", "Google, tráfego e vídeo"],
    permanencia: 0,
    pecaExtra: null,
  },
  {
    id: "ritmo",
    nome: "Ritmo",
    preco: 297,
    implantacao: 390,
    paraQuem: "Para quem quer conteúdo constante e publica ele mesmo.",
    salto: "O degrau que faltava entre medir e contratar uma agência.",
    inclui: [
      "Tudo do Pulso",
      "Pauta do mês: quantos posts, de que tipo, sobre o quê e em que ordem",
      "8 peças por mês — carrossel de até 6 telas ou post único, com a arte pronta",
      "Legenda de cada peça, no seu tom e ancorada no que você informou",
      "Calendário com data e hora, visível no portal",
      "Aprovação no portal vendo imagem e legenda, peça por peça",
      "2 rodadas de ajuste por peça",
    ],
    naoInclui: [
      "A publicação é sua — entregamos pronto e agendado; quem posta é você",
      "Vídeo, em qualquer forma",
      "Ficha do Google e avaliações",
      "Tráfego pago",
    ],
    permanencia: 3,
    pecaExtra: PECA_EXTRA,
  },
  {
    id: "presenca",
    nome: "Presença",
    preco: 790,
    implantacao: 1290,
    paraQuem: "Para o negócio que precisa aparecer no Google e não tem ninguém cuidando disso.",
    salto: "É aqui que entra gente da nossa equipe.",
    inclui: [
      "Tudo do Ritmo, com 10 peças por mês",
      "Nós publicamos no Instagram e no Facebook",
      "Gestão de avaliações: elogio respondido; reclamação vira rascunho e chama gente",
      "Atendimento humano por WhatsApp, em horário comercial",
      "Otimização do ciclo: o que muda no mês seguinte, com base no que aconteceu",
    ],
    naoInclui: [
      "Vídeo, em qualquer forma",
      "Stories",
      "Tráfego pago e verba de mídia",
      "Site e material impresso",
      // 24/08/2026 — auditoria. Estas duas linhas estavam em `inclui` e foram
      // vendidas por R$ 790/mês sem existir uma linha de código que as
      // executasse: `publicarNoGoogle` não tem chamador em produção e não há
      // NENHUMA escrita na ficha do Google no repositório (só `listarLocais`,
      // que lê). Voltam para `inclui` no dia em que o caminho existir — e o
      // teste `so-vende-o-que-produz` avisa quando esse dia chegar.
      "Publicação no perfil do Google (post de novidade, oferta ou evento)",
      "Manutenção da ficha do Google: locais, horários e informações",
    ],
    permanencia: 3,
    pecaExtra: PECA_EXTRA,
    destaque: true,
  },
  {
    id: "conteudo",
    nome: "Conteúdo",
    preco: 1390,
    implantacao: 1900,
    paraQuem: "Para quem já vive do digital e precisa de volume e formato variado.",
    salto: "Mais peça, mais formato e alguém lendo os números todo mês com você.",
    inclui: [
      "Tudo do Presença, com 14 peças por mês",
      "4 sequências de stories por mês, no formato vertical protegido",
      "4 roteiros de reels — cena a cena, prontos para gravar",
      "Plano de medição: o que vamos medir e qual número significa sucesso, combinado antes",
      "Pesquisa de concorrência atualizada a cada ciclo",
      "Reunião mensal de leitura dos números",
      "3 rodadas de ajuste por peça",
    ],
    naoInclui: [
      "A gravação e a edição do vídeo — o roteiro está incluído, o vídeo pronto se compra à parte",
      "Tráfego pago e verba de mídia",
      "Site e material impresso",
    ],
    permanencia: 6,
    pecaExtra: PECA_EXTRA,
  },
  {
    id: "crescimento",
    nome: "Crescimento",
    preco: 2590,
    implantacao: 2900,
    paraQuem: "Para quem vai colocar dinheiro em anúncio.",
    salto: "A campanha desenhada por quem produz o conteúdo — rodando na sua conta.",
    inclui: [
      "Tudo do Conteúdo, com 18 peças por mês",
      "3 criativos de anúncio por mês, em formatos para teste",
      "Estrutura de campanha: objetivo, conjuntos e verba desenhados antes de gastar o primeiro real",
      "Segmentação de público, com o porquê de cada recorte",
      "Copy de anúncio em vários ângulos, não uma frase só",
      "Plano de investimento: quanto colocar, onde e o que esperar",
      "Leitura quinzenal dos resultados e ajuste de rota",
    ],
    naoInclui: [
      "A verba de mídia — sempre fora da mensalidade, paga por você direto à plataforma",
      "A campanha roda na sua conta de anúncios, no seu nome",
      "Gravação e edição de vídeo",
      "Qualquer promessa de faturamento ou de retorno",
    ],
    permanencia: 6,
    pecaExtra: PECA_EXTRA,
  },
];

/** O que fica fora de TODO plano. Não é falta de escopo: o custo destes quatro
 *  não é conteúdo — é hora, processamento ou projeto. */
export const FORA_DE_TODO_PLANO = [
  {
    titulo: "Vídeo",
    texto:
      "Gravação, edição e vídeo gerado por IA. O roteiro está incluído a partir do Conteúdo; o vídeo pronto é sempre orçado à parte.",
  },
  {
    titulo: "Marca",
    texto:
      "Posicionamento, identidade visual e manual de marca. São projeto com começo e fim, não entrega mensal — e podem vir antes do plano.",
  },
  {
    titulo: "Site e página de captura",
    texto: "Projeto próprio, com prazo próprio. Orçado caso a caso.",
  },
  {
    titulo: "Verba de mídia",
    texto:
      "Nunca entra na mensalidade e nunca passa pela nossa conta. Você paga a plataforma direto, na sua conta, no seu nome.",
  },
];

export function precoEmReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}
