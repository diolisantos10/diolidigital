// A COPY APROVADA. Transcrita CARACTERE A CARACTERE das 36 telas que estão em
// produção (as que o CEO aprovou no conteúdo: "O conteúdo está 100% APROVADO").
// NADA aqui pode ser reescrito. Esta rodada é de ARTE.
//
// `destaque` = o trecho que hoje já sai em laranja. É marcação de cor, não texto.

export const CARROSSEIS = [
  {
    id: 1,
    pilar: "A comissão é sua sócia",
    telas: [
      { titulo: "Você cozinha.\nVocê entrega.\nVocê paga a conta.", destaque: "conta", realce: "O marketplace fica com até 26,5%", apoio: "de cada pedido que a sua cozinha produz." },
      { titulo: "Faturar R$ 40 mil no app não é colocar R$ 40 mil no caixa.", destaque: "caixa", numero: "R$ 6.080 a R$ 10.600", apoio: "saem em comissão e taxas — antes de você pagar ingrediente, equipe, aluguel e imposto.", nota: "Simulação sobre a faixa de 15,2% a 26,5%. A faixa varia entre entrega própria e entrega do aplicativo; taxas mudam por contrato." },
      { titulo: "Você não precisa abandonar o marketplace.", destaque: "marketplace", apoio: "Precisa parar de pagar comissão para vender de novo a quem já conhece a sua comida." },
      { titulo: "Migrando só 20% desse volume para o seu canal próprio:", numero: "R$ 1.216 a R$ 2.120", apoio: "por mês deixam de virar comissão.", nota: "Simulação sobre a faixa de 15,2% a 26,5%. A faixa varia entre entrega própria e entrega do aplicativo; taxas mudam por contrato." },
      { titulo: "O ciclo do canal próprio", lista: ["Pedido no seu canal", "Cliente reconhecido", "Campanha certa, na hora certa", "Novo pedido — sem comissão"] },
      { titulo: "Faça a conta do seu restaurante em 2 minutos.", destaque: "conta", cta: "QUERO RECUPERAR MINHA MARGEM", site: "foocci.com.br" },
    ],
  },
  {
    id: 2,
    pilar: "O cliente compra de você e pertence ao app",
    telas: [
      { titulo: "Se o cliente só consegue voltar pelo aplicativo, ele não é seu cliente.", destaque: "cliente", apoio: "Você só paga para atendê-lo." },
      { titulo: "Cada recompra intermediada é uma comissão nova.", destaque: "comissão", apoio: "Mesmo quando foi a sua comida que conquistou o cliente." },
      { titulo: "Cardápio, pagamento e QR de mesa — com o seu nome na frente.", apoio: "E cada pedido virando cadastro seu. Nome, preferência, frequência: dado do seu restaurante.", conversa: [["cliente", "Oi! Queria pedir para hoje 🍕"], ["loja", "Que bom te ver de novo!\nSeu cardápio direto, sem taxa de app:"], ["botao", "pedido direto — cardápio do restaurante"]], conversaTopo: "Seu restaurante" },
      { titulo: "Níveis do bronze ao diamante — quem para de comprar, desce.", apoio: "E carteira de cupons que acumula na conta do cliente, sem código para digitar." },
      { titulo: "A campanha dispara enquanto o cliente ainda é recuperável", destaque: "cliente", lista: ["Cliente quente, comprando", "Esfriando: campanha dispara aqui", "Morno → frio: réguas prontas", "16 campanhas — nenhuma depois que ele sumiu"] },
      { titulo: "Comece a construir uma base que é do seu restaurante.", cta: "QUERO MINHA BASE DE CLIENTES", site: "foocci.com.br" },
    ],
  },
  {
    id: 3,
    pilar: "Você está punindo quem compra direto",
    telas: [
      { titulo: "Você está cobrando a taxa do aplicativo de quem pede no seu WhatsApp.", destaque: "WhatsApp", apoio: "Sem perceber. Todo dia." },
      { titulo: "Para cobrir a comissão, o preço do cardápio inteiro sobe.", destaque: "comissão", apoio: "E quem compra direto paga uma taxa que ninguém cobrou dele." },
      { titulo: "Três preços para o mesmo prato.", destaque: "preços", cards: [["Salão", "preço cheio — sem taxa nenhuma"], ["Delivery próprio", "vantagem para quem pede direto"], ["Marketplace", "a taxa do app embutida aqui"]], apoio: "A taxa embutida só onde a taxa existe." },
      { titulo: "Embuta a taxa onde existe taxa.", apoio: "Dê vantagem onde a margem é 100% sua." },
      { titulo: "O cliente aprende qual caminho é mais barato.", destaque: "cliente", apoio: "E esse caminho é o seu." },
      { titulo: "Simule os seus preços por canal.", destaque: "preços", cta: "QUERO PREÇO POR CANAL", site: "foocci.com.br" },
    ],
  },
  {
    id: 4,
    pilar: "WhatsApp que vende sem queimar o número",
    telas: [
      { titulo: "Uma campanha mal feita no WhatsApp derruba o número do seu restaurante.", destaque: "WhatsApp", apoio: "E com ele, o canal que traz pedido direto." },
      { titulo: "Disparo em massa é o caminho mais curto para virar spam.", destaque: "spam", apoio: "E perder o número é perder o balcão digital do restaurante." },
      { titulo: "Proteções que reduzem o risco de bloqueio", lista: ["Silêncio das 21h às 8h", "Teto diário de envios", "24h de descanso por cliente", "Intervalo variável entre mensagens"] },
      { titulo: "Registro imutável de quem já foi contatado.", destaque: "conta", apoio: "Apagar e recriar a campanha não faz ninguém receber duas vezes. E se a taxa de falha sobe, o envio para sozinho." },
      { titulo: "Cada resposta é conferida contra o cardápio real.", apoio: "O que não bate, não sai. E toda madrugada, clientes simulados testam o atendimento inteiro.", conversa: [["cliente", "Vocês têm opção sem lactose? 🙂"], ["loja", "Temos sim! No cardápio de hoje:\n• Penne ao pomodoro — R$ 42\n• Risoto de legumes — R$ 48"], ["selo", "conferido contra o cardápio real"]], conversaTopo: "Seu restaurante" },
      { titulo: "Veja funcionando com o seu cardápio.", cta: "QUERO VER FUNCIONANDO", site: "foocci.com.br" },
    ],
  },
  {
    id: 5,
    pilar: "Faturamento não paga conta, margem paga",
    telas: [
      { titulo: "Seu prato mais vendido pode ser o que mais te dá prejuízo.", destaque: "prato", apoio: "Faturamento não paga conta.\nMargem paga." },
      { titulo: "O queijo subiu. A embalagem subiu. A taxa do cartão subiu.", apoio: "E o seu preço é o do mês passado." },
      { titulo: "Mudou o preço de um insumo?", destaque: "preço", apoio: "O custo de todos os pratos que usam aquele insumo é recalculado na hora." },
      { titulo: "Markup sobre o custo real.", destaque: "custo real", apoio: "Despesa fixa, imposto e taxa de cartão de verdade — não estimativa de guardanapo." },
      { titulo: "Reprecificação automática, com teto.", apoio: "Dentro do limite que você definir, ajusta sozinho. Acima disso, espera a sua aprovação." },
      { titulo: "Descubra quais pratos sustentam o seu restaurante.", destaque: "prato", cta: "QUERO VER MINHA MARGEM", site: "foocci.com.br" },
    ],
  },
  {
    id: 6,
    pilar: "Quatro boletos, nenhuma conversa",
    telas: [
      { titulo: "Quatro sistemas.\nQuatro boletos.\nNenhum conversa com o outro.", destaque: "boletos", apoio: "E quem paga essa conta é a sua margem." },
      { titulo: "Quatro categorias, quatro fornecedores, quatro contratos", lista: ["Cardápio digital", "PDV e comanda", "Atendimento por IA", "Fidelidade e campanhas"] },
      { titulo: "A soma típica chega a", numero: "≈ R$ 700/mês", apoio: "e o dado do pedido morre em um sistema sem chegar ao outro." },
      { titulo: "Um contrato, um fluxo", lista: ["O pedido alimenta a sua lista de clientes", "A lista ativa a campanha certa", "A campanha volta como pedido", "E a ficha do prato diz se a venda deu lucro"] },
      { titulo: "Plano Crescimento", numero: "R$ 429/mês", apoio: "39% menos que a soma dos quatro — e é o único em que o dado atravessa." },
      { titulo: "Peça uma demonstração.", cta: "QUERO UMA DEMONSTRAÇÃO", site: "foocci.com.br" },
    ],
  },
];
