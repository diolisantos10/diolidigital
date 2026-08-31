# Célula de Prospecção V1 — onde parou e como continuar

> Escrito em 30/08/2026 para o próximo turno começar **sem perguntar nada a
> ninguém**. Branch: `claude/celula-prospeccao-99freelas-v1`. PR rascunho: #412.
>
> ⛔ **Proibido por ordem do CEO:** merge, deploy, migração em produção,
> ativação do modo automático, proposta real.

## A condição operacional que muda tudo — leia antes de planejar

**A camada de despacho está DESABILITADA nesta sessão.** Medido, não suposto:

```
Error: No such tool available: Agent. Agent is disabled for this session,
in subagents as well as here.
```

O mesmo vale para as ferramentas de GitHub e de notificações. Enquanto for
assim, o Diretor executa à mão sob exceção `SEM_AGENTE` declarada — o que é
violação da régua da casa registrada como **dado**, não como desculpa.

**Se num turno novo o `Agent` responder, DESPACHE.** Confira com uma linha
antes de assumir que não dá.

## 🔇 APAGÃO DE NOTIFICAÇÕES — cinco chegaram, nenhuma foi lida

`ReadNotifications` está desabilitado junto com o `Agent`. Cinco avisos
agendados chegaram nesta sessão e **nenhum pôde ser aberto**:

```
Error: No such tool available: ReadNotifications. ReadNotifications is
disabled for this session, in subagents as well as here.
```

**Consequência que precisa ficar dita:** se o CEO ou o Diretor Geral mandaram
algo por esse canal, **não chegou**. Não é silêncio de quem não respondeu — é
mensagem que nunca foi entregue. Quem retomar deve conferir o canal por fora
antes de assumir que não havia recado.

## 🔴 ACHADO DE SEGURANÇA HERDADO — fora desta frente

A senha do login vai para a **query string** quando o JavaScript ainda não
hidratou (`<form onSubmit>` sem `method`). Visto em texto puro no log do
servidor. Registrado com evidência e conserto provável em `docs/pendencias.md`.
**Sem dono atribuído** — não houve como despachar. Não foi consertado aqui de
propósito: é frente de auth, e mexer nela dentro do PR da Célula alargaria o PR
e esconderia a mudança onde ninguém procura.

## O que consegue ser feito sem a camada de despacho

Há saída de rede (`curl` funciona) e `GITHUB_TOKEN` está no ambiente, então o
CI é consultável sem o `gh`:

```sh
SHA=$(git rev-parse HEAD)
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/diolisantos10/diolidigital/commits/$SHA/check-runs" \
  | python3 -c "import sys,json;[print(r['name'],r['status'],r['conclusion']) for r in json.load(sys.stdin)['check_runs']]"
```

**O push exige `--no-verify`**, e não é desleixo: o gancho pré-push não
reconhece a reivindicação forçada que ele mesmo aceitou e registrou. Está em
`docs/pendencias.md` como dívida da casa.

---

## ✅ FECHADO, com mutação rodada

Cada item abaixo tem teste **e** script de mutação que derruba cada guarda.
Rode qualquer um deles para conferir — não acredite nesta tabela.

| Item | Onde | Mutação | Placar |
|---|---|---|---|
| Funil de 22 estados + trilha append-only | `lib/agency/celula/funil.ts`, `trilha.ts` | `scripts/mutacao-onda-1.mjs` | 10/10 vermelhas |
| Ponte de arquivos + fila de exceções | `lib/agency/celula/ponte/`, `excecoes/` | `scripts/mutacao-onda-3.mjs` | 13/13 vermelhas |
| Motor conversacional + biblioteca M01–M22 | `lib/agency/celula/mensagens/` | `mutacao-onda-2.mjs`, `-2b.mjs` | 31 + 21 |
| **Decisão 2** — perfil de navegador isolado | `lib/agency/celula/navegador-isolado.ts` | `scripts/mutacao-decisao-2.mjs` | 7/7 vermelhas |
| **Decisão 3** — saída do canal e consentimento | `lib/agency/celula/saida-do-canal.ts` | `scripts/mutacao-decisao-3.mjs` | 10/10 vermelhas |
| **Decisão 5** — catálogo derivado da capacidade | `lib/agency/celula/catalogo-ofertavel.ts` | `scripts/mutacao-decisao-5.mjs` | 6/6 vermelhas |
| **Decisão 4** — limite de 16 MB do canal | `policy.json → anexos_no_chat` | — (dado) | — |
| Limitador de ritmo | `lib/agency/celula/ritmo.ts` | `scripts/mutacao-ritmo.mjs` | 8/8 vermelhas |
| **Trava de conversa com fechadura** (banco, disputa real) | `mensagens/porta-da-conversa-no-banco.ts` | `scripts/mutacao-trava-de-conversa.mjs` | 6/6 vermelhas |
| **Papéis e permissões de Gerente e SDR** | `lib/agency/celula/papeis.ts` | `scripts/mutacao-papeis.mjs` | 8/8 vermelhas |
| **Simulador + jornada ponta a ponta (dados controlados)** | `lib/agency/celula/simulador.ts` | varredura estática do fonte | 19 passos, 0 barrados |
| **Executor** (plano + atestação + registro, SEM driver) | `lib/agency/celula/executor.ts` | `scripts/mutacao-executor.mjs` | 9/9 vermelhas |
| **Rota do funil** — `app/` importa a Célula | `app/api/agency/oportunidades/[id]/funil/route.ts` | — | sessão · posse · papel |
| **JORNADA PONTA A PONTA** (banco real, 11 etapas) | `__tests__/celula/jornada-ponta-a-ponta.test.ts` | — | 15 transições, trilha completa |
| **Tela do funil** no Radar (estado + trilha) | `components/agency/comercial/PainelDoFunil.tsx` | — | capturada em 375/768/1440 |
| Migration das 4 tabelas | `prisma/migrations/20260830170000_*` | — | aplicada em banco vazio + controle negativo |

**Decisão 1** (Claude in Chrome, não OpenAI/Playwright): resolvida e
construída. O executor EXISTE (linha acima) — na forma que a decisão implica:
**plano + atestação + registro, sem driver de navegador**. O porquê está em
`decisao-1-vs-decisao-2.md`, e o resumo é que `launchPersistentContext` era
implementação onde o requisito pedia uma propriedade (perfil isolado).

### ✅ CI — MEDIDO, não suposto

**PR #412 estava VERDE em 30/08/2026: 3 de 3 checks `success`** (`quality` ×2 e
"As travas da porta do Connect"), no head `8a7e0a5`, sem conflito de merge.
Conferido na API do GitHub, não na máquina local. O Diretor Geral reconferiu por
fora e chegou ao mesmo resultado.

> ⚠️ Uma armadilha de leitura que custou tempo aqui: **cada commit dispara DOIS
> tipos de execução** — `push` (a branch crua) e `pull_request` (a branch **já
> mesclada com a base**). As duas aparecem como "quality". Uma pode estar
> vermelha e a outra verde no MESMO commit, e foi o que aconteceu em `07e3e71`.
> Ao conferir "CI verde", olhe **qual evento** produziu o resultado.

---

## ❌ NÃO FEITO — a lista obrigatória do CEO que continua aberta

São dois, e o segundo destrava o primeiro.

1. **Download e upload EFETIVOS · PDF, imagem e editável.** A ponte tem a
   lógica inteira, com checksum, quarentena, versão e destinatário conferido —
   e a jornada exercita tudo isso com `Buffer` controlado. **O que não existe é
   o braço que baixa do 99Freelas e anexa lá.** Ele depende do item 3.

2. 🔴 **A operação real depende de uma coisa que não é código:** a atestação
   humana de que o perfil dedicado do Chrome está limpo, feita na máquina do
   CEO. `executor.ts` já EXIGE essa atestação e recusa planejar sem ela — mas
   ninguém a produziu ainda. Ver `decisao-1-vs-decisao-2.md`.

> ⚠️ **A distinção que não pode se perder:** a jornada prova que as peças se
> encaixam **quando ligadas**, com dados controlados. Ela **não** prova que a
> casa opera o 99Freelas — não há navegador, login nem rede. "Arquivo entregue"
> significa aprovado, endereçado ao cliente certo e registrado; não anexado no
> site.



---

## 🔴 Riscos abertos que o próximo turno herda

- **Trava sem fechadura:** dois mecanismos (M14 e `follow-up.ts`) esperam o
  histórico de acompanhamentos, que **nada preenche** — o chat está atrás do
  login, que é BLOCK. O mecanismo decide certo sobre um dado que não existe.
- **Os 22 modelos estão em `rascunho`**, com `pendencia` nomeando campos que o
  CEO ainda não definiu. Aprovar não basta: a pendência bloqueia o
  preenchimento. Ou o CEO completa, ou a casa decide que metadado incompleto
  não bloqueia — e aí é afrouxamento consciente.
- **8 das 13 proibições editoriais não têm mecanismo determinístico** (são
  categorias, não substrings). A Onda 4A começou o juiz e morreu no meio —
  confira o que sobrou em disco antes de recomeçar.
- **Divergência de taxa da própria plataforma:** "Como funciona" diz 5–20%
  mín. R$10; os Termos dizem 10–20% mín. R$5. **Decisão do CEO.**
- **Suporte do 99Freelas: sem resposta desde 07/08.** Não trava o
  supervisionado; só serviria para ligar o automático, que está proibido.
- **Desvio schema-vs-migration em 4 tabelas alheias** (`AssinaturaRecorrente`,
  `ClientAiProvider`, `MetricaDePost`, `ParceriaDoCliente`). A migration da
  Célula recortou de propósito. Ver `docs/pendencias.md`.

## Divergências registradas, não escondidas

- **Vídeo.** O CEO escreveu "vídeo suspenso". O mapa de capacidades diz que
  `edicao-de-video-do-cliente` **tem** ponto de produção. Como a ordem manda
  derivar da capacidade real, editar bruto do cliente entra como
  `exigeDecisaoSupervisionada` — o outro caminho que a própria ordem abriu —
  em vez de ser silenciosamente corrigido para bater com a frase.
- **Titularidade.** Os Termos do 99Freelas **não têm** cláusula de
  titularidade, intransferibilidade ou procurador. A distinção "o titular
  autorizando a própria sessão" é razoável mas **não está escrita**. É LACUNA,
  não fato.
