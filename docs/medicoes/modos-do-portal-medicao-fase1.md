# Modos Básico/Avançado do Portal — a medição do buraco

> Fase 1 (custo zero), 26/08/2026. **Medido, declarado, NÃO construído.**

## 1. A medida

Varredura por `básico`, `basico`, `avançado`, `avancado`, `modoBasico`,
`modoAvancado` em `app/`, `lib/`, `components/`, `docs/`, `BACKLOG.md`,
`HANDOFF.md` e `CLAUDE.md`:

| onde | ocorrências relevantes |
|---|---|
| código (`.ts`, `.tsx`) | **zero** |
| documentação da casa | **zero** |
| backlog / handoff | **zero** |

As únicas ocorrências das palavras estão em documentação **de terceiros**
copiada para `docs/plataformas/` (modo de consentimento do Google Analytics,
modos dev/live da Meta) e em `docs/precos.md`, onde "básico" é adjetivo de
faixa de mercado. **Nenhuma delas é o Portal.**

## 2. O tamanho do buraco, dito com precisão

O buraco **não é uma implementação faltando: é uma especificação que não
existe.** Não há em lugar nenhum desta árvore:

- o que cada modo mostraria ou esconderia;
- quem escolhe o modo — o cliente, o plano contratado, ou o PM;
- se o modo é preferência da pessoa ou consequência do contrato;
- o que acontece com quem já está no portal quando o modo muda.

O que EXISTE hoje é um portal só, com dezoito superfícies servidas por
`app/api/portal/` (esteira, aprovações, briefing, marca, materiais, pedidos,
projetos, métricas, conexões, mensagens, transcrição, vista, Drive, ativos da
Meta, sessão, e a porta por token em `app/portal/access/[token]`) — e nenhuma
delas pergunta em que modo o cliente está.

## 3. Por que NÃO foi construído nesta fase

A ordem da Fase 1 é explícita: *"só construa se for barato e seguro"*. Não é
nem um nem outro, e a razão não é tamanho — é ausência de origem.

**Construir dois modos sem especificação é escolher, por conta própria, o que
o cliente vê e o que o cliente deixa de ver.** Um "modo básico" inventado por
quem escreve o código esconde superfícies por palpite. E esconder do cliente é
exatamente a classe de dano que esta casa vem pagando caro:

- a barra que dizia 0% com a proposta escrita (8ª volta);
- o "pacote inteiro pronto para você" com três entregas sem material (08/08);
- o pedido de material que nunca tinha sido enviado, cobrado na cara do
  cliente (24/08).

Todos foram a tela dizendo uma coisa e o estado sendo outra. Um modo que
esconde superfícies é a mesma família de defeito, com um interruptor.

E a decisão de "o que o cliente de cada plano enxerga" é **comercial**: ela
mexe no que o Ritmo (R$ 290) entrega contra o Conteúdo (R$ 790). Preço e
escopo são do CEO — a tabela acabou de ser fechada por delegação expressa, e
inventar uma segunda diferença entre planos aqui a reabriria pela porta dos
fundos.

## 4. O que ele precisa para sair do papel

Três respostas do CEO, e nenhuma delas custa dinheiro:

1. **O modo é do PLANO ou da PESSOA?** Se do plano, é regra comercial e
   deriva de `planos.ts`. Se da pessoa, é preferência e mora no perfil.
2. **O que o modo básico ESCONDE**, superfície por superfície, das dezoito
   que existem. Lista, não princípio — princípio vira palpite no código.
3. **O modo básico esconde ou SIMPLIFICA?** Esconder tira a informação;
   simplificar troca a linguagem. São produtos diferentes com o mesmo nome.

Enquanto as três não existirem, isto continua sendo **buraco de escopo
declarado**, não dívida técnica — e a diferença importa: dívida técnica tem
conserto conhecido; buraco de escopo não tem sequer pergunta respondida.
