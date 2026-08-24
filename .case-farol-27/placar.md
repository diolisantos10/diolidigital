# Cliente falso — placar da rodada

Rodada de 24/08/2026, 19:44:36 · cliente fictício **Farol 27 Padaria & Café [TESTE]**

## 🚫 A casa quebrou em 1 de 18 verificações.

### O que quebrou

**Volume e verba que o cliente declarou têm de aparecer no orçamento; campo zerado não vira preço.**
- O que aconteceu: volume chegou AUSENTE ao escopo e mesmo assim virou preço (R$ 1700–3700, confiança "low")
- A fala exata: `3 posts por semana no feed`

### O que esta rodada NÃO olhou

Não é aprovação — é a lista do que ficou sem medir, e por quê.

- **Nenhuma resposta pode ser barrada pelo guarda — plano B atendendo em silêncio é falha.** — rodada sem SDR ao vivo: não houve guarda para barrar, e silêncio não é aprovação
- **Orçamento acima da verba declarada tem de nomear a diferença, na cara.** — a estimativa (R$ 1700) não passou da verba declarada (R$ 8000) — não há diferença a nomear
- **O briefing aceito pelo cliente tem de virar projeto sozinho — sem ninguém abrir o painel.** — o aceite foi registrado e o caminho automático PAROU: o briefing não é caso normal e espera uma pessoa
- **A aprovação do escopo passa por uma rota autenticada — e é ela que precisa ser exercitada.** — a rota autenticada não rodou em processo; a função foi chamada direto — a camada de autenticação NÃO foi exercida
- **A execução do projeto tem de PRODUZIR — rodar sem estourar não é andar.** — a esteira andou até a produção (1 tentativa(s)) e parou por falta de chave de IA — rodada offline. Produzir de verdade só se mede com `--ao-vivo`.
- **O projeto tem de CHEGAR A `done` — pacote que não fecha é cliente sem entrega.** — rodada offline: sem chave de IA a produção não fecha, e isso não é defeito da casa
- **A peça só está entregue quando o CLIENTE a aprova pela porta dele — nunca por carimbo da casa.** — rodada offline: sem chave de IA nenhuma peça é produzida, então não há o que o cliente aprovar. Aprovação de peça só se mede com `--ao-vivo`.

### Onde a esteira acaba

Isto NÃO é uma etapa faltando — é o limite do que a esteira se propõe a fazer.

- **A esteira termina na peça aprovada pelo cliente — publicar é escolha dele, depois.** — publicar no Instagram/Google não é etapa desta esteira (decisão do CEO, 24/08/2026) e não entra na conta de completude. As travas desses canais seguem de pé — elas impedem vazamento, não marcam etapa.

### O que passou

- Nome dado na porta não pode ser perguntado outra vez, nem na tela nem no painel.
- Cliente que oferece documento não pode ser atropelado com a mesma pergunta.
- A casa não pode dizer a mesma coisa duas vezes seguidas.
- A casa não pode dizer que terminou enquanto o portão de envio está fechado.
- Depois de contar tudo, o cliente tem de conseguir enviar o briefing.
- O orçamento tem de chegar ao cliente depois do briefing enviado.
- O cliente falso não pode disparar e-mail, WhatsApp ou mensagem a pessoa de verdade.
- Briefing aprovado tem de virar projeto — senão o funil para e ninguém vê.
- Projeto criado tem de nascer com tarefas — projeto vazio não vira entrega.
- O portão de direção só pode ser aberto pela ação do CLIENTE — nunca por escrita direta no banco.

### Etapas que não atravessaram

- **aprovacao-pela-rota**: a rota devolveu 401: o cookie de sessão não chega a `cookies()` fora do servidor do Next

### A conversa, como o cliente viu

> **A casa:** Olá, Ana! Seja bem-vindo(a) à Dioli Studio. ⏎ Sou sua consultora de orçamento. Vou te ajudar a montar uma proposta personalizada para o seu negócio — com estimativa de investimento atualizada em tempo real. ⏎ **Para começar, qual é o nome do seu negócio?**

> **Cliente:** Oi! Somos a Farol 27, uma padaria e café na Grande São Paulo — 3 lojas e uma cozinha central, 6 anos de casa.
> **A casa:** Prazer, Ana! E qual é o nome do seu negócio?

> **Cliente:** O negócio se chama Farol 27 — Padaria & Café.
> **A casa:** Ótimo! Agora me conta: o que você está precisando para o **Farol 27**? ⏎ Pode me contar mais? Você está buscando gestão de redes sociais, tráfego pago, criação de identidade visual — ou uma combinação?

> **Cliente:** Queremos reposicionar a marca e lançar o Clube Farol 27, uma assinatura de café da manhã de R$ 149 por mês. Precisamos de identidade, conteúdo e anúncios.
> **A casa:** Qual é o **principal objetivo** que você quer alcançar com esse trabalho? (ex: mais vendas, mais clientes, autoridade, engajamento)

> **Cliente:** Vender assinaturas do Clube Farol 27 e parar de depender só do balcão.
> **A casa:** Quem é o seu **público-alvo** — o cliente ideal que você quer atingir? (idade, perfil, região, o que buscam)

> **Cliente:** Posso te mandar nosso briefing em PDF, ajuda?
> **A casa:** Pode mandar sim, ajuda muito — é só usar o clipe (📎) aqui embaixo para anexar. ⏎ Voltando ao que eu tinha te perguntado: ⏎ Quem é o seu **público-alvo** — o cliente ideal que você quer atingir? (idade, perfil, região, o que buscam)

> **Cliente:** 📎 Enviei meu briefing: briefing-cantina-da-prova.pdf
> **A casa:** Recebi o **briefing-cantina-da-prova.pdf** — obrigado. Vou considerar o que está nele no seu escopo. ⏎ Voltando ao que eu tinha te perguntado: ⏎ Quem é o seu **público-alvo** — o cliente ideal que você quer atingir? (idade, perfil, região, o que buscam)

> **Cliente:** Moradores e trabalhadores num raio de 3 km das lojas, 25 a 45 anos, e empresas da região que pedem café da manhã corporativo.
> **A casa:** Você imagina esse trabalho como um **contrato mensal** (gestão contínua) ou uma **campanha pontual** (projeto com prazo definido)?

> **Cliente:** Contrato mensal, mas com um projeto de lançamento de 8 semanas dentro.
> **A casa:** Os anúncios seriam em qual plataforma: **Meta (Instagram/Facebook)**, **Google**, ou ambos?

> **Cliente:** Meta e TikTok. A divisão entre os dois a gente não sabe fazer — quem decide é vocês.
> **A casa:** Qual é a verba mensal disponível para os anúncios? (Esse valor vai direto para o Google/Meta — é separado da gestão)

> **Cliente:** R$ 30 mil para 60 dias, ou seja R$ 15 mil por mês de anúncios.
> **A casa:** Onde estão os clientes que você quer alcançar? Me diga a **cidade** (e o raio, se souber — ex: "São Paulo, uns 10 km"). Se você vende para o **Brasil inteiro**, pode dizer também.

> **Cliente:** Grande São Paulo, 3 km em volta de cada uma das 3 lojas.
> **A casa:** Sobre a identidade visual: você **já tem logo/identidade** hoje, ou vamos criar **do zero**?

> **Cliente:** Temos um logo em PNG, mas não temos vetor confirmado nem manual de marca.
> **A casa:** O que você precisa na identidade: **logo, paleta de cores, tipografia, manual de marca completo**? Pode listar o que tiver em mente.

> **Cliente:** Desculpa, não entendi. Pode explicar de outro jeito?
> **A casa:** Tem **concorrentes ou referências** (marcas, perfis) que você admira ou quer usar de inspiração?

> **Cliente:** Gostamos do jeito da Padaria Santa Tereza e do Coffee Lab.
> **A casa:** Para eu fechar o escopo do **Farol 27**: qual faixa de orçamento mensal você tem em mente para a gestão? (só a gestão — a verba de anúncios que você já me passou é à parte)

> **Cliente:** Nosso orçamento é de R$ 8000 por mês para a gestão.
> **A casa:** E para quando você quer começar?

### O que a casa entendeu do cliente

| O que o cliente disse | O que a casa guardou |
|---|---|
| Negócio: Farol 27 | Farol 27 |
| Volume: 3 posts por semana no feed (3/semana) | — vazio —/semana |
| Verba: R$ 8000 por mês | Nosso orçamento é de R$ 8000 por mês para a gestão. |
| Público: famílias do bairro | Moradores e trabalhadores num raio de 3 km das lojas, 25 a 45 anos, e empresas da região que pedem café da manhã corporativo. |

**Orçamento calculado:** R$ 1700–3700/mês · confiança "low"

**Envio:** pedido `cmt7nabzu0003xo7d7xh7z0yz` em "proposal_pending"
**Orçamento entregue ao cliente:** sim
**SDR de IA nesta rodada:** não — só o motor de regras
**Mensagens barradas pela trava de saída:** 4 (nenhuma pessoa de verdade foi contatada)
