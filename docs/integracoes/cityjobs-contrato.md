# Contrato de integração — City Jobs → Dioli

> **Status:** RASCUNHO C0, `plataforma` → PM. Vai para
> `docs/integracoes/cityjobs-contrato.md` na branch da frente.
> **Papéis:** City Jobs é dono da vaga, da seleção, do pagamento e da arte.
> A Dioli publica no Instagram do próprio City Jobs, cuida de token,
> renovação e alarme. City Jobs entrega o post **pronto**.
> **Linguagem-alvo:** este documento deve ser implementável por outro time
> sem perguntar nada de volta. Onde a ficha original não fixava um número, a
> decisão tomada está marcada e justificada — ver a seção final.

---

## Índice

1. Autenticação serviço-a-serviço (HMAC-SHA256)
2. Idempotência
3. Endpoints
4. Campos do corpo (`POST /posts`)
5. Especificação de mídia aceita
6. Regras do lado Dioli (o que City Jobs precisa saber, mesmo sem controlar)
7. Respostas e códigos de erro
8. Webhook de volta ao City Jobs
9. Limites
10. Exemplos completos em curl
11. O que a Dioli NÃO faz
12. Decisões tomadas nesta ficha (onde não havia número fixado)

---

## 1. Autenticação serviço-a-serviço (HMAC-SHA256)

Toda chamada — nos dois sentidos, City Jobs → Dioli e o webhook Dioli →
City Jobs — é assinada com o mesmo esquema.

### 1.1 Cabeçalhos exigidos

| Cabeçalho | Formato | Exemplo |
|---|---|---|
| `X-Dioli-Timestamp` | inteiro, segundos desde epoch UTC, como string | `1758999600` |
| `X-Dioli-Assinatura` | `v1=<hex de 64 chars>` | `v1=3f2a...9c1b` |

O prefixo `v1=` existe para o dia em que o esquema mudar: o verificador lê o
prefixo primeiro e recusa qualquer versão que não reconheça, em vez de tentar
validar um hex de outro esquema como se fosse HMAC-SHA256.

### 1.2 A string assinada — EXATA, byte a byte

```
<timestamp>.<corpo>
```

- `<timestamp>` é o **mesmo valor em string** que vai no header
  `X-Dioli-Timestamp` — sem reformatar, sem remover zero à esquerda (não há).
- `<corpo>` é o **corpo BRUTO da requisição**, os bytes exatos que atravessam a
  rede — **não** o objeto re-serializado depois do `JSON.parse`. Reserializar
  antes de assinar/conferir é a causa mais comum de "assinatura inválida"
  entre dois times: a ordem de chaves, espaço em branco e escape de acento
  mudam o byte e não mudam o significado, mas o HMAC não perdoa isso.
  **Cada lado deve capturar o corpo como texto/bytes ANTES de fazer parse.**
- O ponto (`.`) entre os dois é literal, sempre um único caractere.

### 1.3 Cálculo — Node.js

```js
const crypto = require("crypto");

function assinar(timestamp, corpoBruto, segredo) {
  const stringAssinada = `${timestamp}.${corpoBruto}`;
  return crypto.createHmac("sha256", segredo).update(stringAssinada, "utf8").digest("hex");
}

// Ao enviar:
const timestamp = Math.floor(Date.now() / 1000).toString();
const corpoBruto = JSON.stringify(payload); // os bytes que REALMENTE vão no POST
const assinatura = `v1=${assinar(timestamp, corpoBruto, process.env.CITYJOBS_HMAC_SEGREDO)}`;
// headers: { "X-Dioli-Timestamp": timestamp, "X-Dioli-Assinatura": assinatura }
```

### 1.4 Cálculo — bash / openssl

```bash
TIMESTAMP=$(date +%s)
CORPO='{"idExterno":"vaga-123","marca":"cityjobs","formato":"feed_imagem", ...}'
STRING_ASSINADA="${TIMESTAMP}.${CORPO}"
ASSINATURA=$(printf '%s' "$STRING_ASSINADA" \
  | openssl dgst -sha256 -hmac "$CITYJOBS_HMAC_SEGREDO" \
  | sed 's/^.* //')
echo "v1=${ASSINATURA}"
```

`printf '%s'` (não `echo`) para não acrescentar um `\n` que mudaria o hash.

### 1.5 Verificação no lado que recebe (regra dos dois lados)

1. Ler `X-Dioli-Timestamp`. Se `|agora_unix - timestamp| > 300` (5 minutos,
   nos dois sentidos — passado E futuro, porque relógio de servidor desalinha
   nos dois), recusar com `401 timestamp_fora_da_janela` **antes** de tocar na
   assinatura. Isto é a defesa contra replay: uma requisição capturada e
   reenviada mais tarde já não passa aqui.
2. Recalcular a assinatura esperada com a MESMA string (`<timestamp>.<corpo
   bruto recebido>`) e o segredo vigente.
3. Comparar em **tempo constante** — nunca `===` ou `Buffer.compare` direto.
   Node: `crypto.timingSafeEqual`. Os dois buffers precisam ter o mesmo
   tamanho antes da chamada (ela lança se os tamanhos diferirem); comparar o
   tamanho antes não reintroduz o vazamento de tempo relevante (é o padrão
   usado por bibliotecas de webhook consolidadas, ex.: Stripe).

```js
function conferir(timestamp, corpoBruto, assinaturaRecebida, segredos /* array, ver 1.6 */) {
  const agora = Math.floor(Date.now() / 1000);
  if (Math.abs(agora - Number(timestamp)) > 300) {
    return { ok: false, motivo: "timestamp_fora_da_janela" };
  }
  const recebida = assinaturaRecebida.replace(/^v1=/, "");
  const recebidaBuf = Buffer.from(recebida, "hex");

  for (const segredo of segredos) {
    const esperada = assinar(timestamp, corpoBruto, segredo);
    const esperadaBuf = Buffer.from(esperada, "hex");
    if (esperadaBuf.length === recebidaBuf.length && crypto.timingSafeEqual(esperadaBuf, recebidaBuf)) {
      return { ok: true };
    }
  }
  return { ok: false, motivo: "assinatura_invalida" };
}
```

### 1.6 Segredo e rotação

- Variável de ambiente: **`CITYJOBS_HMAC_SEGREDO`**.
- Durante troca de segredo: **`CITYJOBS_HMAC_SEGREDO_ANTERIOR`** — o
  verificador testa a assinatura recebida contra os dois segredos presentes
  (loop acima) e aceita se qualquer um bater. Isso permite que quem envia
  troque de segredo sem que as duas pontas precisem trocar no mesmo segundo.
- Depois da janela de rotação combinada (ver decisão §12), remover
  `CITYJOBS_HMAC_SEGREDO_ANTERIOR` — segredo antigo vivo indefinidamente é
  uma porta que ninguém fechou.

---

## 2. Idempotência

- Toda chamada de criação carrega `idExterno` (string, definida pelo City
  Jobs — normalmente o id da vaga + variante, ex.: `vaga-4821-story-1`).
- **Mesma `idExterno`, mesmo corpo** (comparado por hash canônico dos campos
  de negócio — ver §4): a Dioli **não publica de novo**. Devolve o estado
  atual do post já existente, com o mesmo `idExterno`, como se fosse a
  primeira resposta (200, não 202 — replay não é criação).
- **Mesma `idExterno`, corpo diferente**: `409 idexterno_conflitante`. A
  chave já está em uso apontando para outro conteúdo; reenviar com o mesmo id
  e conteúdo novo não sobrescreve silenciosamente.
- Isto é ortogonal à trava de duplicado por conteúdo (§6.3), que compara
  mídia+legenda entre `idExterno` **diferentes**.

---

## 3. Endpoints

### `POST /api/integracoes/cityjobs/posts`

Cria (ou, se `idExterno` já existe com o mesmo corpo, confirma) um post.
Corpo: JSON, ver §4. Resposta: 202 ou 200 (idempotente), ver §7.

### `GET /api/integracoes/cityjobs/posts/{idExterno}`

Consulta o estado atual de um post pelo `idExterno` que o City Jobs usou na
criação. Resposta:

```json
{
  "idExterno": "vaga-4821-story-1",
  "estado": "publicado",
  "agendadoPara": "2026-09-28T13:30:00-03:00",
  "publicadoEm": "2026-09-28T13:31:04-03:00",
  "permalink": "https://www.instagram.com/p/Cxxxxx/",
  "externalPostId": "17888888888888888",
  "motivoFalha": null
}
```

`estado` é um destes: `recebido`, `agendado`, `aguardando_revisao`,
`publicado`, `falhou`, `em_conferencia` — os mesmos nomes do webhook (§8),
para o City Jobs não precisar manter duas tabelas de tradução.

Autenticado com o mesmo esquema HMAC do §1 (GET assina o corpo vazio:
`<timestamp>.` — string assinada com corpo igual a string vazia).

### `GET /api/agency/clients/{id}/integracoes/cityjobs` — PROPOSTO por CJ-J2, 28/09/2026

> ⚠️ Este endpoint **não existe ainda** e não estava nesta ficha original —
> nasceu porque a interface (CJ-J2) precisou de um bloco "Fonte externa: City
> Jobs" na aba Social Media (equipe/CEO), e os dois endpoints acima só
> respondem post a post (`{idExterno}`), nunca a saúde agregada da conexão.
> `components/agency/clients/FonteExternaCityJobs.tsx` já chama exatamente
> esta rota e trata o 404 de hoje como "indisponível", não como erro — quando
> o endpoint existir, o bloco funciona sem mudança nenhuma na tela.

Diferente dos dois endpoints acima: este é **interno da agência**, protegido
por **sessão** (o mesmo `verifySession()` do resto de `/api/agency/clients`),
nunca por HMAC — quem chama é o navegador da equipe, não o City Jobs.

Resposta (`200`):

```json
{
  "segredoConfigurado": true,
  "webhookConfigurado": true,
  "ultimoPostRecebidoEm": "2026-09-28T13:31:04-03:00",
  "ultimosErrosWebhook": [
    { "ocorridoEm": "2026-09-27T10:02:11-03:00", "motivo": "assinatura_invalida na 3ª tentativa" }
  ]
}
```

- `segredoConfigurado` — `!!process.env.CITYJOBS_HMAC_SEGREDO` no servidor.
- `webhookConfigurado` — `!!process.env.CITYJOBS_WEBHOOK_URL`.
- `ultimoPostRecebidoEm` — `MAX(criadoEm)` de `PostExterno` para este cliente, ou `null`.
- `ultimosErrosWebhook` — últimos `EventoDeWebhook.ultimoErro` não nulos deste cliente, mais recentes primeiro, até 5.
- Cliente que não é o City Jobs (sem `PostExterno` nenhum vinculado) → `404`,
  que é exatamente o que o bloco já espera hoje.

---

## 4. Campos do corpo (`POST /posts`)

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `idExterno` | string | sim | chave de idempotência, ver §2 |
| `marca` | string (slug) | sim | identifica a conta/perfil de destino no lado Dioli |
| `formato` | `"story" \| "feed_imagem" \| "carrossel"` | sim | |
| `midia` | ver abaixo | sim | URL https assinada OU multipart |
| `legenda` | string | condicional | usada em `feed_imagem`/`carrossel`; **ignorada em `story`** — a Meta não aceita legenda em story, e a Dioli não simula uma sobrepondo texto na imagem |
| `prioridade` | `"paga" \| "selecionada"` | sim | governa aprovação automática vs. revisão — ver §6.1 |
| `risco` | `"sem_risco" \| "com_risco"` | sim | idem |
| `horarioDesejado` | string, ISO 8601 **com fuso** (ex.: `2026-09-28T13:30:00-03:00`) | sim | horário pretendido; a Dioli pode ajustar por ritmo/rampa (§6) e devolve o horário real em `agendadoPara` |
| `validadePlano` | string, `AAAA-MM-DD` | sim para `prioridade: "paga"` | data-fim do plano pago; a vaga é repostada 1x/dia até essa data, respeitado o teto (§6.2) |
| `metadados` | objeto livre, até 4 KB serializado | não | devolvido sem alteração em todo evento de webhook — uso do City Jobs para correlacionar com seu próprio sistema |

### `midia`

Duas formas, **mutuamente exclusivas**:

- **URL https assinada:**
  ```json
  "midia": { "tipo": "url", "url": "https://cdn.cityjobs.example.com/vaga-4821.jpg?sig=..." }
  ```
  Domínios permitidos são **declarados e cadastrados previamente** pela
  Dioli (allowlist) — URL de domínio fora da lista é recusada em `400
  campo_invalido` com `campo: "midia.url"`, sem tentar baixar. A Dioli busca
  o arquivo, confere a especificação (§5) e só então segue.
- **Upload multipart:** `multipart/form-data`, campo `arquivo`. Neste modo o
  corpo assinado (§1) é o **JSON dos demais campos**, enviado como uma parte
  separada nomeada `payload` (`Content-Type: application/json` dentro da
  parte) — o binário da mídia nunca entra na string assinada, porque HMAC
  sobre payload de até 100 MB seria caro dos dois lados sem ganho de
  segurança adicional (a integridade do arquivo já é garantida por HTTPS +
  cheque de formato em §5).
- **`carrossel`**: `midia` vira uma **lista de 2 a 10** itens, cada um em
  uma das duas formas acima. Lista com 0, 1 ou mais de 10 itens →
  `400 campo_invalido` (`campo: "midia"`).

---

## 5. Especificação de mídia aceita

Verificada **na entrada**, antes de qualquer chamada à Meta — mídia fora de
spec nunca sai da Dioli para a Meta, e o motivo aparece na resposta e no
webhook `falhou` (nunca "erro genérico da Meta" quando o defeito é nosso lado
não ter conferido antes).

| Formato | Tipo de arquivo | Especificação |
|---|---|---|
| `story` (imagem) | JPEG | proporção 9:16, até **8 MB** |
| `story` (vídeo) | MP4 ou MOV, codec H264 ou HEVC | 3–60 segundos, até **100 MB** |
| `feed_imagem` | JPEG | (sem proporção fixa nesta ficha; a Dioli valida contra o mesmo padrão já usado no restante da esteira — ver nota §12); teto de tamanho: ver a nota abaixo |
| `carrossel` | JPEG por item | mesma regra do feed, aplicada a cada um dos 2–10 itens |

⚠️ **Decisão desta leva (CJ-J1, 28/09/2026) sobre o teto de tamanho de
`feed_imagem`/`carrossel`:** a ficha C0 já registrava a proporção como
pendente (nota §12, item 2); o TAMANHO também não estava fixado. Reusei o
teto de **8 MB da imagem de story** como valor de trabalho — mesmo espírito
da ordem "o MESMO conferidor de story/feed" — em vez de inventar um número
novo sem fonte. Isto é interpretação desta ficha, não contrato fechado:
peça pequena o bastante para não incomodar (o teto está 8× acima de uma
foto JPEG comum), mas fica registrado para o PM/CEO confirmar junto com a
proporção pendente.

⚠️ **Upload multipart (§4) ainda NÃO implementado nesta leva.** O endpoint
aceita hoje só `midia.tipo: "url"`. Um envio multipart recebe `415` com
mensagem própria, nunca um erro genérico. Ver `docs/pendencias.md`.

**PNG, WEBP, GIF, MPO/JPS e qualquer contêiner de vídeo fora de MP4/MOV são
recusados na entrada** — é regra da própria Meta (só aceita JPEG puro para
imagem), não limite adicional da Dioli.

Recusa: `422 midia_fora_de_spec`, com `motivo` nomeando o arquivo, o formato
que ele é e o formato exigido (o mesmo padrão de mensagem que
`lib/integrations/meta/formato-de-midia.ts` já usa internamente: nomear as
duas metades — o que chegou e o que era esperado — para quem lê a resposta
não precisar adivinhar qual lado tem o defeito).

---

## 6. Regras do lado Dioli — o que o City Jobs precisa saber

O City Jobs não opera estas regras, mas o comportamento do sistema só faz
sentido conhecendo-as.

### 6.1 Aprovação automática vs. revisão humana

- **`prioridade: "paga"` + `risco: "sem_risco"`** → aprovação automática.
  A Dioli agenda sem intervenção humana. O carimbo de auditoria gravado
  internamente é **`regra-da-marca:cityjobs_paga_sem_risco`** (aparece em
  log interno da Dioli, não no payload do webhook).
- **`risco: "com_risco"`** (com qualquer prioridade) → espera revisão
  humana da Dioli antes de agendar. Estado retornado: `aguardando_revisao`.
  Não há prazo de SLA fixado nesta ficha — pendência a resolver com o
  responsável de operação antes de publicar a versão final (ver §12).

### 6.2 Teto diário e ritmo (rampa)

> ⚠️ **Os números abaixo vêm do parecer da plataforma Meta
> (`.despacho/M4-meta-cityjobs.out`, concluído em 27/09/2026) e são
> apresentados aqui como valores de trabalho, não como contrato fechado** —
> a ficha original pedia marcador de "número a confirmar" porque, no momento
> em que foi escrita, presumia o parecer ainda em curso. O parecer terminou
> antes. Ver a justificativa completa em §12, item 1: por que decidi usar os
> números em vez do marcador literal.

- **Teto pleno do plano:** até **15 stories/dia** + até **2 posts de
  feed/dia** por marca = 17 publicações/dia. Isto fica em ~34% do teto que a
  própria Meta aplica (`quota_total = 50` publicações/24h, mesmo endpoint
  para todos os formatos — conferido ao vivo pela Dioli antes de cada
  publicação; contagem inclui stories).
- **Rampa de aquecimento** (marca nova, sem histórico de story): teto reduz
  nos primeiros dias corridos a partir do **primeiro** story publicado:

  | Dias desde o 1º story | Teto de stories/dia |
  |---|---|
  | 1–7 | 3 |
  | 8–14 | 6 |
  | 15–21 | 10 |
  | 22+ | 15 (pleno) |

  ✅ **Atualizado nesta leva (CJ-J1, 28/09/2026): os 4 degraus estão
  codificados.** `tetoDeStoriesDoDia` (`lib/agency/esteira/publicacao.ts`)
  passou a aceitar uma lista de degraus configurável
  (`Client.pacoteJson.stories.rampaDegraus`, ver
  `lib/agency/esteira/pacote-da-marca.ts`) — a marca City Jobs declara os 4
  do parecer (`RAMPA_DE_STORIES_CITYJOBS`, em
  `lib/integracoes/cityjobs/regras.ts`); marca sem `rampaDegraus` continua
  no degrau único de sempre (3/dia por 7 dias, depois `porDiaMax`), byte a
  byte igual ao comportamento anterior. **Pendência operacional:** o pacote
  do cliente City Jobs precisa ter `stories.rampaDegraus` de fato GRAVADO no
  banco para os degraus valerem — o código aceita a configuração, não a
  cria sozinho. Ver `docs/pendencias.md`.
- **Ritmo entre stories:** intervalo mínimo de **30 minutos**, mais uma
  variação determinística de 0 a 5 minutos por post (nunca abaixo do
  mínimo) — já implementado (`INTERVALO_STORY_PADRAO_MIN`,
  `variacaoDeMinutos`). O City Jobs não controla isso: se pedir um
  `horarioDesejado` que colide com o ritmo mínimo, a Dioli empurra o
  agendamento para o próximo slot livre e devolve o horário real em
  `agendadoPara` — nunca recusa por causa só de ritmo (recusa por ritmo só
  ocorre em `429`, quando a fila do dia já está saturada, §7).
- Excedeu o teto do dia → `429 teto_diario`, com `Retry-After` apontando
  para a próxima meia-noite (fuso da marca).

### 6.3 Trava de duplicado

- **Feed/carrossel:** mesma mídia (mesmo hash de arquivo) **e** mesma
  legenda (byte-idêntica) publicadas dentro de **7 dias** → `409 duplicado`.
- **Stories:** mesma janela de conteúdo idêntico é **3 dias**, com uma
  **exceção etiquetada**: o repost diário de vaga paga (§6.4) atravessa essa
  trava com o motivo interno `repost_vaga_paga_autorizado`.
  ⚠️ **Correção nesta leva (CJ-J1, 28/09/2026):** esta seção dizia que a
  exceção "só funciona porque a legenda do repost muda a cada dia" — mas o
  §4 deste MESMO contrato diz que a Meta **ignora legenda em story** ("a
  Meta não aceita legenda em story, e a Dioli não simula uma sobrepondo
  texto na imagem"). Toda legenda de story sai vazia; duas legendas vazias
  são byte-idênticas entre si, então "a legenda varia" nunca teria efeito
  prático em story — bloquearia o 2º dia de repost sempre. **Para STORY, a
  exceção etiquetada é o mecanismo REAL de travessia** (não a variação de
  legenda) — o código (`lib/integracoes/cityjobs/posts.ts`) já implementa
  assim. Para FEED/CARROSSEL a legenda variada continua sendo o que
  atravessa a trava, exatamente como esta seção sempre descreveu.
- Estes números (7 dias / 3 dias) são **margem da casa**, sem número oficial
  correspondente da Meta — a Meta não pune "repetição" por data, pune padrão
  de conta (ver §12).

### 6.4 Repost de vaga paga

Para `prioridade: "paga"`, a mesma vaga pode ser repostada **1x por dia**,
até a data de `validadePlano`, com três condições que o **City Jobs precisa
cumprir do lado dele** para o repost ser aceito automaticamente:

1. **A legenda nunca pode ser byte-idêntica ao repost anterior** — variar
   algo visível (ex.: "Vaga aberta — dia 2 de 5", ou trocar o CTA). Isso
   também é o que permite o repost atravessar a trava de duplicado (§6.3)
   sem precisar de uma exceção separada.
2. **Teto de repetições = duração do plano contratado.** Um plano de 5 dias
   permite no máximo 5 reposts — nunca indefinido.
3. **O horário do slot varia dentro da janela do dia** — não publicar
   sempre no mesmo minuto.

Se o sistema do City Jobs **não conseguir variar a legenda automaticamente**,
a Dioli aplica a regra mais restritiva: 1x a cada 2 dias em vez de diário,
até existir variação (isto é decisão operacional da Dioli, não requer nada
do City Jobs além de avisar se a legenda vier sempre igual).

⚠️ **Escopo desta leva (CJ-J1, 28/09/2026):** o repost automático diário está
implementado só para `formato: "story"`
(`processarRepostsDeVagasPagas`, `lib/integracoes/cityjobs/posts.ts`,
chamado pelo despertador). Feed/carrossel não repetem sozinhos — conteúdo
de feed é permanente no perfil, e repetir a mesma peça todo dia não tem o
mesmo padrão de risco/benefício que repetir um story efêmero (que some em
24h). Se o City Jobs precisar de repost diário também em feed, é pendência
a confirmar com o PM antes de estender esta função — **não presuma que o
repost cobre feed**.

---

## 7. Respostas e códigos de erro

### Sucesso

- **`200`** — idempotente: `idExterno` já processado com o mesmo corpo;
  devolve o estado atual (mesmo formato do `202` abaixo).
- **`202`** — aceito para processamento:
  ```json
  { "idExterno": "vaga-4821-story-1", "estado": "recebido", "agendadoPara": null }
  ```
  ou, já resolvido para agendamento/revisão na mesma chamada:
  ```json
  { "idExterno": "vaga-4821-story-1", "estado": "agendado", "agendadoPara": "2026-09-28T13:35:00-03:00" }
  ```
  `estado` pode vir `recebido`, `agendado` ou `aguardando_revisao` já nesta
  resposta síncrona.

### Erros

| Código | Motivo estável | Quando |
|---|---|---|
| 400 | `campo_invalido` | corpo malformado ou campo fora do domínio esperado; a resposta inclui `campo` com o nome exato |
| 401 | `assinatura_invalida` | HMAC não bateu com nenhum segredo vigente |
| 401 | `timestamp_fora_da_janela` | `X-Dioli-Timestamp` fora de ±5 min do relógio da Dioli |
| 409 | `idexterno_conflitante` | mesma `idExterno`, corpo diferente (§2) |
| 409 | `duplicado` | trava de conteúdo repetido dentro da janela (§6.3) |
| 413 | (payload/arquivo grande demais) | corpo ou arquivo excede o limite (§9) |
| 415 | (tipo de conteúdo não suportado) | `Content-Type` da requisição não é `application/json` nem `multipart/form-data` com a parte esperada |
| 422 | `midia_fora_de_spec` | arquivo recusado por formato/tamanho/duração (§5); resposta inclui `motivo` legível |
| 429 | `teto_diario` | teto do dia (§6.2) já atingido; `Retry-After` até a próxima meia-noite |
| 429 | `ritmo` | slot mais cedo colide com o intervalo mínimo e a fila do dia está cheia demais para reagendar; `Retry-After` em segundos até o próximo slot livre |
| 503 | `conexao_instagram_indisponivel` | token expirado, revogado, ou a Meta está indisponível — problema temporário do lado da conexão, não do payload |

**Acrescentados nesta leva (CJ-J1, 28/09/2026) — casos de CONFIGURAÇÃO da
Dioli, não de erro do City Jobs. Esta ficha instruía "sem segredo → 503
claro" sem fixar o código; os três abaixo são a decisão tomada, a confirmar
com o PM/CEO como o restante da tabela:**

| Código | Motivo estável | Quando |
|---|---|---|
| 429 | `requisicoes_por_minuto` | mais de 60 requisições/min para esta credencial (§9) — `Retry-After` em segundos |
| 503 | `hmac_nao_configurado` | `CITYJOBS_HMAC_SEGREDO` não está definido nesta instância da Dioli |
| 503 | `cityjobs_client_id_nao_configurado` | `CITYJOBS_CLIENT_ID` não está definido, ou aponta para um cliente que não existe |

Toda resposta de erro segue o mesmo envelope:

```json
{ "erro": "midia_fora_de_spec", "motivo": "arquivo vaga-4821.png: é image/png; o Instagram só aceita JPEG para imagem.", "idExterno": "vaga-4821-story-1" }
```

---

## 8. Webhook de volta ao City Jobs

- URL configurada por env do lado Dioli: **`CITYJOBS_WEBHOOK_URL`**.
- Assinado com o **mesmo esquema HMAC do §1** — mesmos cabeçalhos, mesma
  string assinada, segredo `CITYJOBS_HMAC_SEGREDO` (o mesmo par de segredos
  serve os dois sentidos; não há um segredo separado para o webhook).
- Corpo:

  ```json
  {
    "idEvento": "evt_9f3a...",
    "idExterno": "vaga-4821-story-1",
    "evento": "publicado",
    "ocorridoEm": "2026-09-28T13:31:04-03:00",
    "permalink": "https://www.instagram.com/p/Cxxxxx/",
    "externalPostId": "17888888888888888",
    "motivo": null,
    "metadados": { "...": "eco do que veio na criação" }
  }
  ```

- **Eventos:** `agendado`, `publicado` (com `permalink` e `externalPostId`),
  `falhou` (com `motivo` legível), `em_conferencia` — publicação ficou
  ambígua do lado da Meta (pode ter saído, pode não ter); **a Dioli confere
  à mão** e o City Jobs **não deve reenviar** o post nesse estado — reenviar
  em cima de uma publicação ambígua é o cenário mais provável de duplicar
  uma vaga no ar.
- **Idempotência do lado do City Jobs:** cada evento carrega `idEvento`
  único; reentrega do mesmo evento chega com o mesmo `idEvento`, e o City
  Jobs deve tratá-lo como no-op se já processado.
- **Política de reentrega (proposta da Dioli, a confirmar com o time do City
  Jobs — ver §12):** até 5 tentativas, backoff exponencial (1 min, 5 min, 30
  min, 2h, 12h). Falha após a 5ª tentativa fica registrada para consulta
  manual via `GET /posts/{idExterno}` — o estado real nunca depende só do
  webhook ter chegado.

---

## 9. Limites

| Limite | Valor |
|---|---|
| Corpo JSON (sem mídia embutida) | 256 KB |
| Upload multipart (arquivo de mídia) | 100 MB (teto do maior caso aceito, vídeo de story — ver §5) |
| `metadados` | 4 KB serializado |
| Requisições por minuto por credencial | 60 (margem folgada acima do volume de 17 posts/dia — ver decisão §12) |

---

## 10. Exemplos completos em curl

### Criar story pago

```bash
TIMESTAMP=$(date +%s)
CORPO='{
  "idExterno": "vaga-4821-story-1",
  "marca": "cityjobs",
  "formato": "story",
  "midia": { "tipo": "url", "url": "https://cdn.cityjobs.example.com/vaga-4821-story.jpg?sig=abc123" },
  "prioridade": "paga",
  "risco": "sem_risco",
  "horarioDesejado": "2026-09-28T13:30:00-03:00",
  "validadePlano": "2026-10-03",
  "metadados": { "vagaId": "4821", "empresa": "Foocci" }
}'
ASSINATURA=$(printf '%s' "${TIMESTAMP}.${CORPO}" | openssl dgst -sha256 -hmac "$CITYJOBS_HMAC_SEGREDO" | sed 's/^.* //')

curl -X POST https://app.dioli.digital/api/integracoes/cityjobs/posts \
  -H "Content-Type: application/json" \
  -H "X-Dioli-Timestamp: ${TIMESTAMP}" \
  -H "X-Dioli-Assinatura: v1=${ASSINATURA}" \
  -d "$CORPO"
```

### Criar feed

```bash
TIMESTAMP=$(date +%s)
CORPO='{
  "idExterno": "vaga-4821-feed-1",
  "marca": "cityjobs",
  "formato": "feed_imagem",
  "midia": { "tipo": "url", "url": "https://cdn.cityjobs.example.com/vaga-4821-feed.jpg?sig=def456" },
  "legenda": "Vaga aberta: Analista de Logística — City Jobs. Candidate-se pelo link na bio.",
  "prioridade": "selecionada",
  "risco": "sem_risco",
  "horarioDesejado": "2026-09-28T10:00:00-03:00",
  "metadados": { "vagaId": "4821" }
}'
ASSINATURA=$(printf '%s' "${TIMESTAMP}.${CORPO}" | openssl dgst -sha256 -hmac "$CITYJOBS_HMAC_SEGREDO" | sed 's/^.* //')

curl -X POST https://app.dioli.digital/api/integracoes/cityjobs/posts \
  -H "Content-Type: application/json" \
  -H "X-Dioli-Timestamp: ${TIMESTAMP}" \
  -H "X-Dioli-Assinatura: v1=${ASSINATURA}" \
  -d "$CORPO"
```

### Consultar estado

```bash
TIMESTAMP=$(date +%s)
ASSINATURA=$(printf '%s' "${TIMESTAMP}." | openssl dgst -sha256 -hmac "$CITYJOBS_HMAC_SEGREDO" | sed 's/^.* //')

curl https://app.dioli.digital/api/integracoes/cityjobs/posts/vaga-4821-story-1 \
  -H "X-Dioli-Timestamp: ${TIMESTAMP}" \
  -H "X-Dioli-Assinatura: v1=${ASSINATURA}"
```

### Webhook recebido (o que o City Jobs recebe e como confere)

```bash
# Requisição que a Dioli envia para $CITYJOBS_WEBHOOK_URL:
#
# POST /webhooks/dioli HTTP/1.1
# Content-Type: application/json
# X-Dioli-Timestamp: 1758999664
# X-Dioli-Assinatura: v1=7e21...

CORPO_RECEBIDO='{
  "idEvento": "evt_9f3a7c",
  "idExterno": "vaga-4821-story-1",
  "evento": "publicado",
  "ocorridoEm": "2026-09-28T13:31:04-03:00",
  "permalink": "https://www.instagram.com/p/Cxxxxx/",
  "externalPostId": "17888888888888888",
  "motivo": null,
  "metadados": { "vagaId": "4821", "empresa": "Foocci" }
}'

# O City Jobs confere assim (mesmo algoritmo do §1.5):
TIMESTAMP_RECEBIDO=1758999664
ASSINATURA_ESPERADA=$(printf '%s' "${TIMESTAMP_RECEBIDO}.${CORPO_RECEBIDO}" \
  | openssl dgst -sha256 -hmac "$CITYJOBS_HMAC_SEGREDO" | sed 's/^.* //')
# Comparar "v1=${ASSINATURA_ESPERADA}" contra o header X-Dioli-Assinatura recebido,
# em tempo constante, e conferir a janela de 5 min antes de aceitar o evento.
```

---

## 11. O que a Dioli NÃO faz

- **Não escolhe a vaga.** O que é publicado, quando e para quem é decisão do
  City Jobs; a Dioli publica o que chega dentro da spec e das travas de
  risco/ritmo.
- **Não edita a arte.** A peça (imagem/vídeo) chega pronta; a Dioli só
  confere formato de arquivo (§5), nunca reidenta, corta ou redesenha.
- **Não cobra.** Pagamento do plano, cobrança do cliente final e qualquer
  relação comercial da vaga são inteiramente do City Jobs — a Dioli não
  emite fatura nem sabe valor de plano além do necessário para calcular
  `validadePlano`.

---

## 12. Decisões tomadas nesta ficha (onde não havia número fixado)

A ficha original (`.despacho/C0-contrato.md`) instruía deixar marcadores
«NÚMERO A CONFIRMAR PELO PARECER META» porque, no momento em que foi escrita,
presumia o parecer da Meta ainda em curso. Ao abrir o trabalho encontrei
`.despacho/M4-meta-cityjobs.out`, já concluído (6 minutos antes da própria
ficha). Decidi **usar os números do parecer em vez do marcador literal**,
citando a fonte e marcando o que ainda não está implementado em código —
julguei que um número citado e rotulado serve mais a "outro time implementa
sem perguntar" do que um marcador vazio quando a resposta já existe. Fica
aqui para o PM/Diretor ratificar ou reverter para marcador, se a leitura for
diferente.

Outras lacunas que a ficha não fixava e que precisei decidir para o
documento ficar implementável:

1. **Janela de rotação do segredo** (§1.6): não fixado quanto tempo
   `CITYJOBS_HMAC_SEGREDO_ANTERIOR` fica aceito em paralelo. Sugiro **24h**
   como janela padrão de troca — tempo suficiente para os dois lados
   atualizarem sem downtime, curto o bastante para não virar segredo
   esquecido. Fica como proposta a confirmar com quem provisiona o segredo.
2. **Especificação de proporção do feed** (§5): a ficha fixou spec de story
   com detalhe (9:16, MB, duração) mas não deu proporção/dimensão para
   `feed_imagem`/`carrossel` além de "JPEG". Deixei como "mesmo padrão já
   usado no restante da esteira" e sinalizei que precisa confirmação
   explícita antes da versão final — não inventei um número novo de
   proporção sem fonte.
3. **SLA de revisão humana para `com_risco`** (§6.1): a ficha não define
   prazo. Não decidi um número aqui porque é operacional (depende de quem
   está de plantão do lado Dioli), não técnico — deixei como pendência
   explícita em vez de inventar um SLA que ninguém prometeu.
4. **Envelope de erro padrão** (§7, final): a ficha listava os códigos e
   motivos, não o formato JSON da resposta de erro. Adotei
   `{ erro, motivo, idExterno }` por consistência com o restante da API
   (mesmo padrão de "nomear as duas metades" usado em
   `formato-de-midia.ts`).
5. **Rate limit numérico** (§9, "requisições por minuto"): a ficha pedia o
   limite sem fixar o número. Calculei 60/min como margem folgada acima do
   volume esperado (17 posts/dia = ~0,01/min em regime normal; 60/min cobre
   picos de reenvio e consultas de estado sem soar como número arbitrário
   copiado de outro contrato).
6. **Reentrega do webhook** (§8): a ficha pedia "política de reentrega
   (tentativas e intervalos)" sem fixar os números. Propus 5 tentativas com
   backoff de 1 min/5 min/30 min/2h/12h — espelha o padrão comum de
   webhooks de mercado (Stripe, GitHub) em vez de um número inventado sem
   comparação.

Os números de **teto/rampa/ritmo/trava de duplicado** (§6.2, §6.3) **não**
são decisão minha — são do parecer `meta` (M4), citados com fonte, e alguns
deles (rampa de 4 degraus) ainda não têm código correspondente, o que está
sinalizado explicitamente no corpo do documento para não virar promessa que
o sistema ainda não cumpre.
