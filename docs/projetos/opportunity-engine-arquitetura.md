# Arquitetura do agente prospector — decisão de engenharia

> O CEO trouxe em 05/08/2026 a proposta de arquitetura escrita pelo ChatGPT
> (Responses API + Agents SDK + Computer Use dirigindo um navegador logado).
> Este documento registra o que foi **adotado**, o que foi **trocado**, e o
> desenho que vale para a obra.

## O que adotei da proposta, sem mexer

1. **O motor é a OpenAI; o corpo é nosso.** Aplicação, painel, regras, catálogo,
   preços, CRM e aprovações vivem no nosso backend. A OpenAI entra como camada
   de inteligência, chamada pelo nosso orquestrador.
2. **Divisão entre probabilístico e determinístico.** O modelo compreende,
   avalia e escreve. Quem decide corte, piso, limite diário e link permitido é
   `if` no nosso código. É a doutrina da casa: prompt é sugestão, código é trava.
3. **Nível 2 — agente supervisionado** no lançamento: ele prepara tudo e para
   antes do envio. O clique é humano.
4. **Conteúdo de plataforma é dado não confiável.** Instrução escrita dentro de
   um projeto nunca vira ordem.
5. **Credencial fora do prompt**, no cofre cifrado que a casa já tem.
6. **Equipe de agentes, não um agente gigante** — cada um com uma
   responsabilidade e um contrato de saída.

## O que troquei — e por que a troca deixa o projeto MAIS rápido

A proposta põe **Computer Use dirigindo um navegador logado** para varrer as
plataformas. Trocamos essa peça por três fontes que já existem e não dependem de
sessão automatizada:

### 1. A caixa de entrada como radar (fonte principal)
99Freelas e Workana **avisam por e-mail** cada projeto novo nas categorias que a
gente segue. O agente lê **a nossa caixa**, não o site deles: chega em tempo
real, sem login, sem captcha, sem navegador para manter de pé.

### 2. Colar a oportunidade (fonte de reforço)
Um campo no painel onde qualquer pessoa cola a URL ou o texto do projeto. Cobre
o que não vem por e-mail e serve a qualquer plataforma nova no mesmo dia — sem
adaptador, sem deploy.

### 3. Envio pela mão do operador, com a proposta pronta
O agente entrega proposta, valor, prazo e as perguntas em um cartão com botão de
copiar. O operador cola e envia. São 20 segundos por proposta, e nenhuma
infraestrutura de navegador precisa existir.

**O ganho:** some do projeto o container, o navegador persistente, o cofre de
cookies de sessão, o tratamento de captcha e a manutenção de seletores que
quebram quando a plataforma muda um botão. O que sobra é o que dá dinheiro — ler,
qualificar, escrever e negociar.

## Os agentes, como ficam

| Agente | O que faz | Onde a decisão é código |
|---|---|---|
| **Radar** | lê o e-mail e o campo de colar, extrai título, descrição, categoria, prazo e orçamento, deduplica | dedup por hash do texto e por URL |
| **Qualificador** | resume a necessidade, aponta o serviço do catálogo, dá nota 0–100 e explica | corte por nota, piso de valor, capacidade da casa |
| **Negociador** | escreve a abordagem, a faixa de investimento e as perguntas que faltam | preço vem da tabela; desconto só até o piso |
| **Fila** | organiza tudo no painel com projeto, nota, valor, mensagem e recomendação | nada sai sem clique humano |
| **Acompanhamento** | lê a resposta do cliente e prepara a réplica | resposta a objeção usa a mesma tabela de piso |

## O orquestrador

Serviço no nosso backend que chama a Responses API, decide qual agente age,
com quais ferramentas, até onde avança, quando para e o que grava. Cada execução
fica registrada com entrada, saída, custo e decisão — é o que permite melhorar a
abordagem com dado em vez de opinião.

## Autonomia, por etapas

- **Lançamento:** prepara tudo, envia nada.
- **Depois de 30 propostas medidas:** envio automático só para nota ≥ 85, valor
  acima do piso, serviço do catálogo, sem link proibido e no máximo 5 por dia.
- **Sempre:** fora do padrão vai para gente.

## Etapas de construção

1. **Radar + Qualificador + Fila** — uma plataforma (99Freelas), sem envio.
2. **Negociador com faixas e pisos** ligado ao painel, com cartão de copiar.
3. **Workana** e as demais, cada uma como configuração de regra — não como código
   novo.
