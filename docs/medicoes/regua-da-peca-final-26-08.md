# A régua que faltava — o arquivo que o cliente recebe

> Registro de conserto, 26/08/2026. Achado do cliente oculto de 25/08.

## O vão, em uma frase

O portão de pixel media o **fundo cru**; o cliente recebia a **composição** — e
entre os dois não havia régua nenhuma. Uma peça de 19.207 bytes, sem foto, com
o título cortado e sem assinatura, foi carimbada `compartilhado` e apareceu no
portal.

## Por que mover o portão do fundo seria o conserto errado

Medido nesta árvore, sobre as **12 peças que estavam vivas em produção** em
26/08/2026, com a mesma função que o portão do fundo usa (`medirFundo`):

| medida na peça COMPOSTA | pior | melhor | piso/teto do portão do fundo |
|---|---|---|---|
| cores distintas | 242 | 568 | **≥ 600** |
| fração da cor dominante | 0,483 | 0,177 | **≤ 0,45** |

**O portão do fundo reprovaria TODAS as peças boas da casa.** Está provado em
`__tests__/design/regua-da-peca-final.test.ts` ("o portão do FUNDO CRU
reprovaria a peça boa").

## Onde a separação está: a FAIXA DA FOTO

35%..80% da altura — abaixo do título, acima da assinatura, em todas as
composições da casa.

| amostra | cores | dominante | textura |
|---|---|---|---|
| 12 peças reais (pior caso) | 163 | 0,353 | 0,0066 |
| 12 peças reais (melhor caso) | 532 | 0,079 | 0,0181 |
| **mutante: a foto não entrou** | **1** | **1,000** | **0,0000** |

163 contra 1. É ordem de grandeza, não "por pouco" — que é a condição para a
régua ficar frouxa e mesmo assim ter dente.

## A prova é por mutação, contra arquivo real

`docs/entregas/peca-final-26-08/` guarda os três arquivos, byte a byte:

- `boa-med_1f79e9f3_mt8xj2gu.jpg` — 150.203 bytes, 1080x1350,
  sha256 `1f79e9f3781ea11dc20ff1b58a3704162d1f5b5847b8156e122b68adda67bf8b`.
  Estava viva em produção (HTTP 200 em `/api/media/med_1f79e9f3_mt8xj2gu`).
- `mutante-foto-nao-entrou.jpg` — 72.574 bytes,
  sha256 `8c7afa13a963e9d4508414eb64f1f460121e58419ecb98077acfcd6d9e97b88b`.
  A mesma peça com UMA coisa mudada. As faixas de título e assinatura são
  preservadas byte a byte (inclusive os pixels de foto atrás delas), o que
  torna o mutante **mais difícil** de pegar.
- `mutante-arquivo-raso.jpg` — 8.937 bytes,
  sha256 `fb15fd916181a6f63e9a852ca19ba9a0d7ce3f9f92dc8c029dff8119f48ee577`.

## Onde a régua roda — e por que ali

`lib/agency/execution/artes.ts`, **imediatamente antes de `guardarArquivo`**.
Peça reprovada não ganha arquivo; sem arquivo não há `mediaUrl`; sem `mediaUrl`
ela não aparece no portal. **Nada nesse estado recebe o carimbo porque nada
nesse estado chega a ter arquivo.** Nos dois caminhos que gravam arte de
imagem: a produção e a recomposição.

Que a produção passa por ela está provado em
`__tests__/design/a-regua-alcanca-a-peca.test.ts` — a régua NÃO é dublê ali; o
dublê é tudo em volta.

## O que ela NÃO mede — declarado

1. **Não lê letra de volta da imagem.** "O texto coube?" e "a assinatura está
   lá?" são respondidos contra a lista que o rasterizador conferiu no DOM, não
   por OCR. Ela prova que a letra foi PINTADA — não que ficou legível (isso é
   `legibilidade-do-titulo.ts`) nem que coube na caixa (isso é `renderizarHtml`,
   motivo `texto_cortado`).
2. **Não cobra título nem assinatura que uma trava recusou.** Isso é degradação
   declarada, antiga e com dono. ⚠️ **Dívida:** a marca cujo nome não passa na
   forma da assinatura (medido: seis palavras) continua recebendo arte SEM
   assinatura, e o cliente não lê esse fato — ele mora no `lastError`. O
   conserto é a forma da assinatura, em `trava-de-texto.ts`. Dono: quem mantém
   a trava de texto.
3. **Não vale para vídeo.** O caminho do reel grava `mediaUrl` sem passar aqui.

---

# Correção de rota: `cron-execute` NÃO estava mudo

O primeiro diagnóstico desta rodada foi **errado**, e o registro fica porque o
erro é instrutivo.

O pulso dizia `relógio ausente: cron-execute`, 7 vezes em 24h. A leitura óbvia
era "ninguém chama essa rota". Conferido:

- `.github/workflows/cron-execute.yml` **existe** e dispara por `schedule`;
- **759 execuções** registradas; as **30 últimas, todas `success`**;
- `POST /api/cron/execute` sem token responde **401**, não 503 — logo o
  `CRON_SECRET` está configurado no servidor.

A rota rodava. O que ela nunca fazia era **registrar a própria batida** em
`HeartbeatDoRelogio` — só `cron-v2` gravava a dele. Relógio vivo carimbado de
morto, para sempre.

E havia uma segunda metade: a tolerância era 30 minutos para todos os relógios.
Medido em 26/08 sobre os 30 disparos reais das últimas 20h, o intervalo do
workflow foi **mediana 41,6 min, p90 57,6 min, máximo 67,8 min** — `schedule` do
GitHub é best-effort. Com 30 minutos, o alarme dispararia sobre um relógio
**saudável** em metade das janelas.

Alarme que grita sobre o normal é alarme que ensina a ignorar alarme — a mesma
lição que `instrumentation.ts` já registrou sobre o "crash" que era rodízio de
contêiner.

**Conserto:** a rota grava a batida antes do trabalho (ela responde "fui
chamado", não "recuperei algo"), e a tolerância passa a ser por relógio, com o
número saído da medida. Nenhum relógio novo nasceu.
