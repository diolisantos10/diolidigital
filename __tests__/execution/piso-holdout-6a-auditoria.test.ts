// O GATE DA 6ª AUDITORIA — corpus de VALIDAÇÃO CEGA, executável.
//
// A crítica de método que reprovou a 5ª rodada, e ela é a razão deste arquivo:
// "uma rodada de redução de falso positivo sem nenhum aperto do lado do falso
// negativo, medindo 0% de FN no corpus da própria autora, é exatamente o formato
// em que o alarme vira carimbo". Medir o próprio corpus mede o autor, não o
// detector.
//
// Os dois corpora abaixo são HOLDOUT: 8 verticais que não existiam quando as
// regras foram escritas (borracharia, coworking, livraria, clínica de vacinação,
// bicicletaria, escola de música, hortifruti, despachante), com briefing em
// prosa E em bullet, horário partido, horário que cruza a meia-noite, negação
// explícita de área, gênero e número variados, verba vs. preço.
//
// Foram medidos ANTES de qualquer correção baseada neles:
//   • Corpus C, primeira medição: FP 10,3% · FN 10,8%
//   • Corpus D, primeira medição: FP  0,0% · FN  5,4%
// O que este arquivo trava é que as duas taxas fiquem em ZERO daqui para frente.
// Um número que sobe aqui é regressão, não ruído.

import { describe, it, expect } from "vitest";
import {
  extrairVerdadeOperacional,
  conferirPisoDeVerdade,
  separarValoresInformados,
  type VerdadeDoCliente,
} from "@/lib/agency/execution/piso-de-verdade";

type Caso = { texto: string; rotulo: "LEGIT" | "INVENT"; nota: string };
type Vertical = {
  nome: string;
  businessName: string;
  briefing: string;
  briefingJson?: Record<string, unknown>;
  telefones: string[];
  casos: Caso[];
};

const CORPUS_C: Vertical[] = [
  // 1 ─ BORRACHARIA (briefing em BULLETS, verba em chave de JSON)
  {
    nome: "borracharia",
    businessName: "Borracharia do Zé",
    briefing:
      "Borracharia do Zé, na Vila Matilde\n" +
      "• Expediente: segunda a sábado, das 8h30 às 18h\n" +
      "• Serviços: troca de pneu, alinhamento, balanceamento e conserto de câmara\n" +
      "• Atendemos na Vila Matilde, na Penha e em Itaquera\n" +
      "• Socorro na estrada: não fazemos em rodovia\n" +
      "• Pagamento: Pix, dinheiro e cartão em até 3x\n" +
      "• Troca de pneu fica pronta em 40 minutos\n" +
      "• Contato pelo WhatsApp\n" +
      "• Alinhamento a partir de R$ 70,00",
    briefingJson: { monthlyBudget: "R$ 900" },
    telefones: ["11944443333"],
    casos: [
      { texto: "Expediente das 8h30 às 18h, de segunda a sábado.", rotulo: "LEGIT", nota: "briefing com meia hora" },
      { texto: "Atendemos ate as 17h30 sem hora marcada.", rotulo: "LEGIT", nota: "dentro da janela" },
      { texto: "Abrimos as 7h.", rotulo: "INVENT", nota: "antes de 8h30" },
      { texto: "Abrimos aos domingos.", rotulo: "INVENT", nota: "domingo fora" },
      { texto: "Quinta-feira tem fila curta. Venha das 8h30 às 18h.", rotulo: "LEGIT", nota: "quinta dentro de seg-sáb" },
      { texto: "Atendemos na Penha e em Itaquera.", rotulo: "LEGIT", nota: "áreas do briefing" },
      { texto: "Ficamos na Vila Matilde e atendemos em Itaquera e na Penha.", rotulo: "LEGIT", nota: "3 áreas, verbo colado no meio" },
      { texto: "Atendemos em Guaianases.", rotulo: "INVENT", nota: "bairro fora" },
      { texto: "Fazemos socorro em rodovia.", rotulo: "INVENT", nota: "cliente NEGOU rodovia" },
      { texto: "Atendemos em toda a zona leste.", rotulo: "INVENT", nota: "universal" },
      { texto: "Sua troca de pneu fica pronta em 40 minutos.", rotulo: "LEGIT", nota: "prazo do briefing" },
      { texto: "Sua troca de pneu fica pronta em 10 minutos.", rotulo: "INVENT", nota: "prazo inventado" },
      { texto: "Seu alinhamento fica pronto no mesmo dia.", rotulo: "INVENT", nota: "prazo imediato não atestado" },
      { texto: "Parcelamos em até 3x.", rotulo: "LEGIT", nota: "parcelas do briefing" },
      { texto: "Parcelamos em até 6x.", rotulo: "INVENT", nota: "acima do informado" },
      { texto: "Aceitamos boleto.", rotulo: "INVENT", nota: "pagamento inventado" },
      { texto: "Também fazemos troca de óleo.", rotulo: "INVENT", nota: "serviço inventado" },
      { texto: "Também fazemos conserto de câmara.", rotulo: "LEGIT", nota: "serviço do briefing" },
      { texto: "Alinhamento a partir de R$ 70,00.", rotulo: "LEGIT", nota: "preço do briefing" },
      { texto: "Alinhamento por R$ 900,00.", rotulo: "INVENT", nota: "verba (chave JSON) virando preço" },
      { texto: "Investimos R$ 850,00 em anúncios da região.", rotulo: "LEGIT", nota: "prestação de contas" },
      { texto: "Investimos R$ 850,00 no seu pacote de manutenção.", rotulo: "INVENT", nota: "colagem de moldura de gasto" },
      { texto: "Pneu bom é pneu que te leva de volta pra casa.", rotulo: "LEGIT", nota: "sem fato" },
      { texto: "Chame no WhatsApp e mande sua localização.", rotulo: "LEGIT", nota: "canal do briefing" },
      { texto: "Chame no Telegram.", rotulo: "INVENT", nota: "canal inventado" },
    ],
  },

  // 2 ─ COWORKING
  {
    nome: "coworking",
    businessName: "Hub Colmeia",
    briefing:
      "Hub Colmeia, coworking na Vila Olímpia. Acesso das 7h às 22h, de segunda a sexta. Sábado das 9h às 14h. " +
      "Estações fixas, salas de reunião e endereço fiscal. Não temos unidade fora da Vila Olímpia. " +
      "Pagamento por boleto ou Pix. Plano contratado é liberado em 1 dia. " +
      "Site hubcolmeia.com.br. Verba de mídia de R$ 2.600 mensais. Estação fixa a partir de R$ 690,00.",
    telefones: ["11988882222"],
    casos: [
      { texto: "Acesso das 7h às 22h, de segunda a sexta.", rotulo: "LEGIT", nota: "briefing" },
      { texto: "Atendimento ate as 21h para visita guiada.", rotulo: "LEGIT", nota: "dentro da janela" },
      { texto: "Acesso 24 horas para membros.", rotulo: "INVENT", nota: "24h não atestado" },
      { texto: "Abrimos aos domingos.", rotulo: "INVENT", nota: "domingo fora" },
      { texto: "Sábado das 9h às 14h.", rotulo: "LEGIT", nota: "briefing" },
      { texto: "Seu plano fica liberado em 1 dia.", rotulo: "LEGIT", nota: "prazo do briefing" },
      { texto: "Seu plano fica liberado na mesma hora.", rotulo: "INVENT", nota: "prazo imediato inventado" },
      { texto: "Também temos unidade em Pinheiros.", rotulo: "INVENT", nota: "cliente NEGOU unidade fora da Vila Olímpia" },
      { texto: "Nova unidade em Moema!", rotulo: "INVENT", nota: "filial inventada" },
      { texto: "Aceitamos boleto e Pix.", rotulo: "LEGIT", nota: "pagamento do briefing" },
      { texto: "Parcelamos em até 12x no cartão.", rotulo: "INVENT", nota: "pagamento e parcelas inventados" },
      { texto: "Acesse hubcolmeia.com.br e agende sua visita.", rotulo: "LEGIT", nota: "site atestado" },
      { texto: "Acesse hubcolmeiacoworking.com.br.", rotulo: "INVENT", nota: "domínio prefixado/inventado" },
      { texto: "Também fazemos day use para visitantes.", rotulo: "INVENT", nota: "serviço inventado" },
      { texto: "Estação fixa a partir de R$ 690,00.", rotulo: "LEGIT", nota: "preço do briefing" },
      { texto: "Estação fixa por R$ 2.600,00.", rotulo: "INVENT", nota: "verba virando preço" },
      { texto: "Trabalhar perto de gente boa rende mais.", rotulo: "LEGIT", nota: "sem fato" },
    ],
  },

  // 3 ─ LIVRARIA
  {
    nome: "livraria",
    businessName: "Livraria Página Viva",
    briefing:
      "Livraria Página Viva, em Pinheiros. Loja aberta de segunda a domingo, das 10h às 22h. " +
      "Livros novos, usados e sebo. Entregamos em Pinheiros, na Vila Madalena e em Perdizes, raio de 4 km. " +
      "Pix, cartão e dinheiro. Pedido separado em 2 horas. Instagram @paginaviva. " +
      "Verba de mídia R$ 1.400. Livro usado a partir de R$ 15,00.",
    telefones: ["11966665555"],
    casos: [
      { texto: "Loja aberta todos os dias, das 10h às 22h.", rotulo: "LEGIT", nota: "seg-dom é a semana inteira" },
      { texto: "Atendimento ate as 21h45 na véspera de Natal.", rotulo: "LEGIT", nota: "dentro da janela" },
      { texto: "Abrimos as 8h.", rotulo: "INVENT", nota: "antes de 10h" },
      { texto: "Entregamos na Vila Madalena e em Perdizes.", rotulo: "LEGIT", nota: "áreas do briefing" },
      { texto: "Entregamos num raio de 4 km.", rotulo: "LEGIT", nota: "raio do briefing" },
      { texto: "Entregamos num raio de 15 km.", rotulo: "INVENT", nota: "raio acima" },
      { texto: "Entregamos em todo o centro expandido.", rotulo: "INVENT", nota: "cobertura não atestada" },
      { texto: "Seu pedido fica pronto em 2 horas.", rotulo: "LEGIT", nota: "prazo do briefing" },
      { texto: "Seu pedido fica pronto em 20 minutos.", rotulo: "INVENT", nota: "prazo inventado" },
      { texto: "Sua encomenda fica pronta em 2 horas.", rotulo: "LEGIT", nota: "mesmo prazo, gênero feminino" },
      { texto: "Também fazemos clube de assinatura.", rotulo: "INVENT", nota: "serviço inventado" },
      { texto: "Siga no Instagram @paginaviva.", rotulo: "LEGIT", nota: "handle atestado" },
      { texto: "Siga no Instagram @paginavivalivros.", rotulo: "INVENT", nota: "handle inventado" },
      { texto: "Livro usado a partir de R$ 15,00.", rotulo: "LEGIT", nota: "preço do briefing" },
      { texto: "Livro usado por R$ 1.400,00.", rotulo: "INVENT", nota: "verba virando preço" },
      { texto: "Ler é o jeito mais barato de viajar.", rotulo: "LEGIT", nota: "sem fato" },
      { texto: "Fale conosco no (11) 96666-5555.", rotulo: "LEGIT", nota: "telefone atestado" },
      { texto: "Fale conosco no (11) 96666-1234.", rotulo: "INVENT", nota: "telefone inventado" },
      { texto: "Garantimos 100% de satisfação na leitura.", rotulo: "INVENT", nota: "promessa de resultado" },
    ],
  },

  // 4 ─ CLÍNICA DE VACINAÇÃO (horário partido, plural/gênero)
  {
    nome: "vacinacao",
    businessName: "Clínica Imuniza",
    briefing:
      "Clínica Imuniza, no Ipiranga. Consultas de segunda a sexta, das 8h às 12h e das 14h às 18h. " +
      "Vacinas de rotina, viagem e campanha de gripe. Atendemos no Ipiranga e no Cambuci. " +
      "Não atendemos a domicílio. Pix, cartão e convênio não aceito. " +
      "Carteira de vacinação emitida em 1 dia. Verba de mídia R$ 1.700. Vacina de gripe por R$ 130,00.",
    telefones: ["11922224444"],
    casos: [
      { texto: "Consultas das 8h às 12h e das 14h às 18h.", rotulo: "LEGIT", nota: "duas janelas" },
      { texto: "Atendimento ate as 11h para vacina de rotina.", rotulo: "LEGIT", nota: "dentro da 1a janela" },
      { texto: "Atendimento ate as 17h.", rotulo: "LEGIT", nota: "dentro da 2a janela" },
      { texto: "Consultas ate as 13h.", rotulo: "INVENT", nota: "13h cai no intervalo de almoço, fora das duas janelas" },
      { texto: "Consultas todos os dias ate meia-noite.", rotulo: "INVENT", nota: "o caso literal da auditoria" },
      { texto: "Atendemos no Cambuci.", rotulo: "LEGIT", nota: "área do briefing" },
      { texto: "Atendemos a domicílio.", rotulo: "INVENT", nota: "cliente NEGOU domicílio" },
      { texto: "Sua carteira de vacinação fica pronta em 1 dia.", rotulo: "LEGIT", nota: "prazo do briefing" },
      { texto: "Sua carteira de vacinação fica pronta na hora.", rotulo: "LEGIT", nota: "'na hora' foi tirado do padrão de propósito — DIVIDA CONHECIDA" },
      { texto: "Seu laudo fica pronto em 2 horas.", rotulo: "INVENT", nota: "prazo inventado" },
      { texto: "Também fazemos exame de sangue.", rotulo: "INVENT", nota: "serviço inventado" },
      { texto: "Aceitamos Pix e cartão.", rotulo: "LEGIT", nota: "pagamento do briefing" },
      { texto: "Vacina de gripe por R$ 130,00.", rotulo: "LEGIT", nota: "preço do briefing" },
      { texto: "Vacina de gripe por R$ 1.700,00.", rotulo: "INVENT", nota: "verba virando preço" },
      { texto: "Proteger quem você ama começa com uma picadinha.", rotulo: "LEGIT", nota: "sem fato" },
    ],
  },
];

const CORPUS_D: Vertical[] = [
  // 1 ─ LOJA DE BICICLETAS
  {
    nome: "bicicletaria",
    businessName: "Bike Norte",
    briefing:
      "Bike Norte, loja de bicicletas na Casa Verde. Horário: terça a sábado, das 9h às 19h. " +
      "Vendemos bicicletas, peças e acessórios. Fazemos revisão e montagem. " +
      "Entregamos na Casa Verde, na Freguesia do Ó e em Santana. Não entregamos na zona sul. " +
      "Pix, cartão e cartão em até 10x. Revisão completa em 3 dias. Instagram @bikenorte. " +
      "Verba de mídia R$ 1.600. Revisão a partir de R$ 180,00.",
    telefones: ["11933337777"],
    casos: [
      { texto: "Terça a sábado, das 9h às 19h. Venha conhecer a Bike Norte!", rotulo: "LEGIT", nota: "briefing, multi-frase" },
      { texto: "Estamos abertos ate as 18h30 hoje.", rotulo: "LEGIT", nota: "dentro da janela" },
      { texto: "Abrimos segunda também, das 9h às 19h.", rotulo: "INVENT", nota: "segunda fora" },
      { texto: "Sua revisão fica pronta em 3 dias.", rotulo: "LEGIT", nota: "prazo do briefing" },
      { texto: "Sua revisão fica pronta em 24 horas.", rotulo: "INVENT", nota: "prazo inventado" },
      { texto: "Entregamos na Freguesia do Ó e em Santana.", rotulo: "LEGIT", nota: "áreas do briefing" },
      { texto: "Entregamos na zona sul.", rotulo: "INVENT", nota: "cliente NEGOU zona sul" },
      { texto: "Entregamos em toda a capital.", rotulo: "INVENT", nota: "universal" },
      { texto: "Parcelamos em até 10x.", rotulo: "LEGIT", nota: "parcelas do briefing" },
      { texto: "Parcelamos em até 18x sem juros.", rotulo: "INVENT", nota: "acima do informado" },
      { texto: "Também fazemos aluguel de bicicleta por hora.", rotulo: "INVENT", nota: "serviço inventado" },
      { texto: "Também fazemos montagem de bicicleta.", rotulo: "LEGIT", nota: "serviço do briefing" },
      { texto: "Siga no Instagram @bikenorte e veja os lançamentos.", rotulo: "LEGIT", nota: "handle atestado" },
      { texto: "Siga no Instagram @bikenortesp.", rotulo: "INVENT", nota: "handle inventado" },
      { texto: "Revisão a partir de R$ 180,00.", rotulo: "LEGIT", nota: "preço do briefing" },
      { texto: "Revisão por R$ 1.600,00.", rotulo: "INVENT", nota: "verba virando preço" },
      { texto: "Investimos R$ 1.400,00 em anúncios de fim de semana.", rotulo: "LEGIT", nota: "prestação de contas" },
      { texto: "Investimos R$ 1.400,00 no seu kit de revisão.", rotulo: "INVENT", nota: "colagem de moldura de gasto" },
      { texto: "Pedalar é liberdade. A gente cuida do resto.", rotulo: "LEGIT", nota: "sem fato" },
      { texto: "Fale com a gente no (11) 93333-7777.", rotulo: "LEGIT", nota: "telefone atestado" },
      { texto: "Fale com a gente no (11) 93333-0000.", rotulo: "INVENT", nota: "telefone inventado" },
    ],
  },

  // 2 ─ ESCOLA DE MÚSICA
  {
    nome: "escolademusica",
    businessName: "Escola Nota Azul",
    briefing:
      "Escola Nota Azul, no Butantã. Aulas de segunda a sexta, das 9h às 20h, e sábado das 9h às 13h. " +
      "Violão, piano, canto e bateria. Turmas de até 5 alunos e aulas individuais. " +
      "Matrícula liberada em 2 dias. Mensalidade por boleto ou Pix. " +
      "Site notaazul.com.br. Verba de mídia de R$ 1.300 mensais. Mensalidade a partir de R$ 280,00.",
    telefones: ["11955552222"],
    casos: [
      { texto: "Aulas de segunda a sexta, das 9h às 20h.", rotulo: "LEGIT", nota: "briefing" },
      { texto: "Turmas ate as 19h30 para quem estuda de manhã.", rotulo: "LEGIT", nota: "dentro da janela" },
      { texto: "Aulas todos os dias, inclusive domingo.", rotulo: "INVENT", nota: "domingo fora" },
      { texto: "Aulas ate as 22h.", rotulo: "INVENT", nota: "fora da janela" },
      { texto: "Sábado das 9h às 13h.", rotulo: "LEGIT", nota: "briefing" },
      { texto: "Sua matrícula fica pronta em 2 dias.", rotulo: "LEGIT", nota: "prazo do briefing" },
      { texto: "Sua matrícula fica pronta em 2 horas.", rotulo: "INVENT", nota: "o caso literal da auditoria" },
      { texto: "Sua vaga fica liberada no mesmo dia.", rotulo: "INVENT", nota: "prazo imediato inventado" },
      { texto: "Também temos aula de saxofone.", rotulo: "INVENT", nota: "instrumento não ofertado" },
      { texto: "Também temos aula de canto.", rotulo: "LEGIT", nota: "oferta do briefing" },
      { texto: "Mensalidade por boleto ou Pix.", rotulo: "LEGIT", nota: "pagamento do briefing" },
      { texto: "Aceitamos cartão em até 12x.", rotulo: "INVENT", nota: "pagamento e parcelas inventados" },
      { texto: "Acesse notaazul.com.br e agende sua aula experimental.", rotulo: "LEGIT", nota: "site atestado" },
      { texto: "Acesse escolanotaazul.com.br.", rotulo: "INVENT", nota: "domínio prefixado" },
      { texto: "Mensalidade a partir de R$ 280,00.", rotulo: "LEGIT", nota: "preço do briefing" },
      { texto: "Mensalidade a partir de R$ 1.300,00.", rotulo: "INVENT", nota: "verba virando preço" },
      { texto: "Nova unidade no Morumbi!", rotulo: "INVENT", nota: "filial inventada" },
      { texto: "Música é a única língua que todo mundo entende.", rotulo: "LEGIT", nota: "sem fato" },
      { texto: "Garantimos 100% de aprovação no conservatório.", rotulo: "INVENT", nota: "promessa de resultado" },
    ],
  },

  // 3 ─ HORTIFRUTI (delivery, raio, iFood)
  {
    nome: "hortifruti",
    businessName: "Hortifruti Verde Vida",
    briefing:
      "Hortifruti Verde Vida, na Aclimação. Loja aberta todos os dias, das 7h às 21h. " +
      "Frutas, verduras, legumes e ovos caipiras. Delivery na Aclimação, na Liberdade e na Vila Mariana, raio de 3 km. " +
      "Pix, cartão, dinheiro e vale-alimentação. Entrega em 60 minutos. " +
      "Pedidos pelo iFood e WhatsApp. Verba de mídia R$ 1.900. Cesta de frutas por R$ 49,90.",
    telefones: ["11966663333"],
    casos: [
      { texto: "Loja aberta todos os dias, das 7h às 21h.", rotulo: "LEGIT", nota: "briefing" },
      { texto: "Atendemos ate as 20h45 para o delivery.", rotulo: "LEGIT", nota: "dentro da janela" },
      { texto: "Atendemos ate meia-noite.", rotulo: "INVENT", nota: "fora da janela" },
      { texto: "Delivery na Liberdade e na Vila Mariana.", rotulo: "LEGIT", nota: "áreas do briefing" },
      { texto: "Delivery no Paraíso.", rotulo: "INVENT", nota: "bairro fora" },
      { texto: "Delivery num raio de 3 km.", rotulo: "LEGIT", nota: "raio do briefing" },
      { texto: "Delivery num raio de 8 km.", rotulo: "INVENT", nota: "raio acima" },
      { texto: "Sua entrega chega em 60 minutos.", rotulo: "LEGIT", nota: "prazo do briefing" },
      { texto: "Sua entrega chega em 20 minutos.", rotulo: "INVENT", nota: "prazo inventado" },
      { texto: "Peça pelo iFood e receba em casa.", rotulo: "LEGIT", nota: "canal do briefing" },
      { texto: "Peça pelo Rappi.", rotulo: "INVENT", nota: "canal inventado" },
      { texto: "Aceitamos vale-alimentação.", rotulo: "LEGIT", nota: "pagamento do briefing" },
      { texto: "Aceitamos boleto.", rotulo: "INVENT", nota: "pagamento inventado" },
      { texto: "Também fazemos cesta de café da manhã.", rotulo: "INVENT", nota: "serviço inventado" },
      { texto: "Cesta de frutas por R$ 49,90.", rotulo: "LEGIT", nota: "preço do briefing" },
      { texto: "Cesta de frutas por R$ 1.900,00.", rotulo: "INVENT", nota: "verba virando preço" },
      { texto: "Fruta boa é a que chega madura na sua casa.", rotulo: "LEGIT", nota: "sem fato" },
    ],
  },

  // 4 ─ DESPACHANTE
  {
    nome: "despachante",
    businessName: "Despachante Ágil",
    briefing:
      "Despachante Ágil, em Santo Amaro. Expediente de segunda a sexta, das 8h às 17h. " +
      "Transferência de veículo, licenciamento, primeira via de CRLV e recurso de multa. " +
      "Atendemos em Santo Amaro e no Campo Grande. Não atendemos fora da capital. " +
      "Pix e cartão de débito. Transferência concluída em 5 dias úteis. " +
      "WhatsApp para documentos. Verba de mídia R$ 1.050. Transferência a partir de R$ 390,00.",
    telefones: ["11944448888"],
    casos: [
      { texto: "Expediente de segunda a sexta, das 8h às 17h.", rotulo: "LEGIT", nota: "briefing" },
      { texto: "Atendimento ate as 16h para protocolo no mesmo expediente.", rotulo: "LEGIT", nota: "dentro da janela" },
      { texto: "Atendemos aos sábados.", rotulo: "INVENT", nota: "sábado fora" },
      { texto: "Sua transferência fica pronta em 5 dias.", rotulo: "LEGIT", nota: "prazo do briefing" },
      { texto: "Sua transferência fica pronta em 1 dia.", rotulo: "INVENT", nota: "prazo inventado" },
      { texto: "Seu licenciamento sai na hora.", rotulo: "LEGIT", nota: "'na hora' fora do padrão — DIVIDA CONHECIDA" },
      { texto: "Atendemos no Campo Grande.", rotulo: "LEGIT", nota: "área do briefing" },
      { texto: "Atendemos em Diadema.", rotulo: "INVENT", nota: "bairro/cidade fora" },
      { texto: "Atendemos fora da capital.", rotulo: "INVENT", nota: "cliente NEGOU" },
      { texto: "Aceitamos Pix e cartão de débito.", rotulo: "LEGIT", nota: "pagamento do briefing" },
      { texto: "Aceitamos cartão de crédito em 6x.", rotulo: "INVENT", nota: "crédito e parcelas inventados" },
      { texto: "Também fazemos vistoria veicular.", rotulo: "INVENT", nota: "serviço inventado" },
      { texto: "Também fazemos recurso de multa.", rotulo: "LEGIT", nota: "serviço do briefing" },
      { texto: "Transferência a partir de R$ 390,00.", rotulo: "LEGIT", nota: "preço do briefing" },
      { texto: "Transferência por R$ 1.050,00.", rotulo: "INVENT", nota: "verba virando preço" },
      { texto: "Chame no WhatsApp e mande a foto do documento.", rotulo: "LEGIT", nota: "canal do briefing" },
      { texto: "Documento em dia é dor de cabeça a menos.", rotulo: "LEGIT", nota: "sem fato" },
      { texto: "Nosso CNPJ é 12.345.678/0001-90.", rotulo: "INVENT", nota: "documento gerado" },
      { texto: "Fale com a gente: contato@despachanteagil.com.br", rotulo: "INVENT", nota: "e-mail inventado" },
    ],
  },
];

function verdadeDe(v: Vertical): VerdadeDoCliente {
  const { precos, verbas } = separarValoresInformados(v.briefingJson ?? {}, v.briefing);
  return {
    businessName: v.businessName,
    telefones: v.telefones,
    emails: [],
    servicos: [],
    valores: precos,
    verbas,
    operacao: extrairVerdadeOperacional(v.briefing, v.businessName),
  };
}

/** Falso POSITIVO: peça honesta reprovada. Custa a confiança do time no alarme —
 *  e alarme que o time aprendeu a ignorar é alarme desligado. */
function falsosPositivos(corpus: Vertical[]): string[] {
  const out: string[] = [];
  for (const v of corpus) {
    const verdade = verdadeDe(v);
    for (const c of v.casos.filter((x) => x.rotulo === "LEGIT")) {
      const r = conferirPisoDeVerdade(c.texto, verdade);
      if (!r.aprovado) out.push(`[${v.nome}] "${c.texto}" → ${r.violacoes.map((x) => x.id).join(",")}`);
    }
  }
  return out;
}

/** Falso NEGATIVO: invenção publicada em nome do cliente. Sem revisor humano
 *  nesta casa, é o erro que chega ao público dele. */
function falsosNegativos(corpus: Vertical[]): string[] {
  const out: string[] = [];
  for (const v of corpus) {
    const verdade = verdadeDe(v);
    for (const c of v.casos.filter((x) => x.rotulo === "INVENT")) {
      if (conferirPisoDeVerdade(c.texto, verdade).aprovado) out.push(`[${v.nome}] "${c.texto}" (${c.nota})`);
    }
  }
  return out;
}

describe("piso de verdade — corpus de validação cega (holdout)", () => {
  for (const [nome, corpus] of [["C", CORPUS_C], ["D", CORPUS_D]] as const) {
    it(`corpus ${nome}: nenhum falso positivo`, () => {
      expect(falsosPositivos(corpus)).toEqual([]);
    });
    it(`corpus ${nome}: nenhum falso negativo`, () => {
      expect(falsosNegativos(corpus)).toEqual([]);
    });
  }

  it("o corpus é grande o bastante para o número significar alguma coisa", () => {
    const total = [...CORPUS_C, ...CORPUS_D].reduce((n, v) => n + v.casos.length, 0);
    expect(total).toBeGreaterThanOrEqual(140);
  });
});

// ─── A NEGAÇÃO DO CLIENTE, NOS DOIS SENTIDOS ────────────────────────────────
//
// "Não entregamos em Osasco" precisa reprovar a peça que afirma Osasco — e NÃO
// pode contaminar os bairros que a mesma frase afirma depois do "mas". Errar
// contra a palavra do cliente na direção oposta não é o lado seguro: é a mesma
// mentira com o sinal trocado, e vem com um motivo que mente ao especialista
// ("o cliente disse que não atende Pinheiros", quando ele disse o contrário).
describe("área negada pelo cliente", () => {
  const verdade: VerdadeDoCliente = {
    businessName: "Loja Z",
    telefones: [],
    emails: [],
    servicos: [],
    valores: [],
    verbas: [],
    operacao: extrairVerdadeOperacional(
      "Loja Z. Não entregamos em Osasco, mas entregamos em Pinheiros e no Butantã.",
      "Loja Z",
    ),
  };

  it("registra só o que foi negado, e o que veio depois do 'mas' segue atestado", () => {
    expect(verdade.operacao?.areasNegadas).toEqual(["osasco"]);
    expect(verdade.operacao?.areas).toEqual(expect.arrayContaining(["pinheiros", "butanta"]));
  });

  it("reprova a peça que afirma cobertura onde o cliente disse não", () => {
    const r = conferirPisoDeVerdade("Entregamos em Osasco.", verdade);
    expect(r.aprovado).toBe(false);
    expect(r.violacoes.map((v) => v.id)).toContain("area_negada_pelo_cliente");
  });

  it("não barra a peça que cita o bairro real do briefing", () => {
    expect(conferirPisoDeVerdade("Entregamos em Pinheiros.", verdade).aprovado).toBe(true);
  });

  it("pega o lugar negado que não é nome próprio", () => {
    const v2: VerdadeDoCliente = {
      businessName: "Marmoraria N",
      telefones: [],
      emails: [],
      servicos: [],
      valores: [],
      verbas: [],
      operacao: extrairVerdadeOperacional("Marmoraria N. Não instalamos no litoral.", "Marmoraria N"),
    };
    expect(conferirPisoDeVerdade("Instalamos no litoral.", v2).aprovado).toBe(false);
  });
});

// ─── A REGRESSÃO BLOQUEANTE: invenção de preço pela moldura de gasto ─────────
//
// Introduzida por mim na rodada anterior e pega pela auditoria. Duas falhas
// somadas: (i) bastava um verbo de gasto aparecer ANTES do número na mesma
// linha, sem nada exigir que o número fosse de anúncio; (ii) `verdade.valores`
// era cego, então a verba que o cliente informou para PAGAR A AGÊNCIA virava
// preço válido numa peça de vitrine.
describe("moldura de gasto não pode virar preço", () => {
  const verdade: VerdadeDoCliente = {
    businessName: "Buffet Festa Feliz",
    telefones: [],
    emails: [],
    servicos: [],
    valores: [],
    verbas: [2000, 1000],
    operacao: extrairVerdadeOperacional("Buffet Festa Feliz. Verba de mídia de R$ 2.000.", "Buffet Festa Feliz"),
  };

  it("barra preço colado num verbo de gasto sem termo de mídia", () => {
    for (const peca of [
      "Investimos R$ 1.999,00 no seu combo executivo por pessoa.",
      "Investimos R$ 780,00 no seu pacote de beleza.",
      "Pacote noiva por R$ 1.000,00.",
    ]) {
      const r = conferirPisoDeVerdade(peca, verdade);
      expect(r.aprovado, peca).toBe(false);
      expect(r.violacoes.map((v) => v.id)).toContain("valor_inventado");
    }
  });

  it("mantém a prestação de contas do relatório", () => {
    expect(conferirPisoDeVerdade("Investimos R$ 1.200,00 em anúncios.", verdade).aprovado).toBe(true);
    expect(conferirPisoDeVerdade("Investimos R$ 1.900,00 em campanha de fim de ano.", verdade).aprovado).toBe(true);
  });

  it("verba do cliente nunca é lida como preço do negócio dele", () => {
    const { precos, verbas } = separarValoresInformados(
      { monthlyBudget: "R$ 900" },
      "Verba de mídia R$ 1.100. Torta a partir de R$ 85,00.",
    );
    expect(verbas).toContain(900);
    expect(verbas).toContain(1100);
    expect(precos).toContain(85);
    expect(precos).not.toContain(1100);
  });
});
