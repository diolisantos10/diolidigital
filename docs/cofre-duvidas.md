# IA pela Control Room (cofre) — configuração e dúvidas abertas

> Escrito em 04/10/2026, junto do PR que liga a IA do Dioli ao cofre.
> Cliente único: `lib/ai/cofre.ts`. Nenhum valor de segredo neste arquivo.

## Como liga — PAREAMENTO (contrato da Control Room, PR #118, 04/10/2026)

Ninguém cola token. `lib/ai/pareamento-do-cofre.ts`:

1. No boot de **produção**, sem segredo guardado, o Dioli gera o próprio
   segredo (32 bytes, hex), guarda **cifrado no banco** (`CofrePareamento`) e
   pede `POST /api/v1/ai/pareamento/solicitar` com **só o SHA-256** dele.
2. O Diego aprova o pedido do `dioli-digital` com um clique no cofre (o começo
   do hash aparece em `GET /api/agency/cofre/estado` para ele reconhecer).
3. Toda chamada vai ao gateway com `X-Service-Token: <segredo>`. A primeira
   resposta que não seja 401/403 marca **aprovado**.
4. Persistente: deploy novo lê o segredo do banco — **sem clique novo**.
   Pendente: o gateway é sondado no máximo a cada 2 min; as telas dizem
   "aguardando aprovação no cofre". Só um **401 depois de aprovado** gera
   pedido novo (que exige clique novo). Pedido manual: `POST /api/agency/cofre/parear` (master).
5. Prova real: `POST /api/agency/cofre/prova` (master) — um texto e uma imagem,
   devolve só status, modelo e custo.

| Variável (opcional) | O que é |
|---|---|
| `CONTROL_ROOM_URL` | Sobrescreve o endereço do cofre (padrão em `lib/ai/endereco-do-cofre.ts`, a única exceção nomeada da trava de endereço do Railway). |
| `CONTROL_ROOM_CENTRO_CUSTO_PADRAO` | Centro de custo da agência. Sem ele, vai `dioli-digital` (dúvida 5). |
| `CONTROL_ROOM_GATEWAY_PATH` | Padrão: `/api/v1/ai/gateway/execute`. |

O centro de custo **de cada cliente** é preenchido em **Editar cliente → "Centro de custo (Control Room)"**.

## O que passa pelo cofre

- **Texto:** todo `generate()`, que é o que usam calendário, legenda, semana, analista e departamentos. O cofre é tentado primeiro. Se falhar, as chaves diretas entram como reserva.
- **Imagem:** `generateDesign()`, que é a arte da peça e do carrossel. Vai na modalidade `image`, com os produtores diretos como reserva.
- **Leitura de brand book:** o texto do PDF é extraído (`unpdf`) e lido na modalidade `text`.
- **O que NÃO passa pelo cofre:**
  - O árbitro de qualidade (`apenasOPreferido`), para continuar independente do autor.
  - A rota pública do SDR (`chaveJaResolvida`), que é decisão separada.
  - Transcrição e visão (`visao.ts`).

## O que foi conferido contra o servidor real (04/10/2026)

- `POST /gateway/execute` → **404** (página "Não encontrado · Control Room"). Esse caminho não existe.
- `POST /api/v1/ai/gateway/execute` → existe. **O 401 sem token não pôde ser confirmado daqui:** o proxy desta sessão injeta uma credencial de login, e a resposta foi **403** `{"erro":"papel_errado","mensagem":"Esta ação é do CEO."}`.

## Dúvidas para levar à Control Room

1. **Caminho:** o caminho de serviço é mesmo `/api/v1/ai/gateway/execute`? O `/gateway/execute` do contrato dá 404.
2. **Autenticação:**
   - Sem credencial nenhuma, a resposta é 401?
   - A rota aceita sessão humana? Ela respondeu `papel_errado` a um login, quando o contrato diz "nunca cookie".
   - O token de serviço tem papel próprio? Ele passa nessa trava?
3. **Formato da resposta de texto:**
   - Em qual campo vem o texto (`resultado`? `texto`? `resultado.texto`?).
   - Em qual campo vem o nome do modelo, e se vem o uso de tokens e o custo.
   - Hoje o Dioli tenta as formas mais prováveis e, se nenhuma servir, devolve falha declarada (`resposta_ilegivel`).
4. **Imagem:**
   - No pedido: os campos do "payload de imagem". Hoje vão `prompt`, `tamanho` (`square`/`portrait`/`landscape`) e `mensagens`.
   - Na resposta: a imagem vem como URL ou como base64, e em qual campo?
5. **`centroCustoId`:**
   - Existe um por cliente? Quem cria e qual o formato?
   - Há um centro "da agência" para o padrão?
   - O que acontece com um id desconhecido: 422 ou 409?
6. **`payloadRef`:**
   - O que é: referência a um payload guardado ou rastreio livre?
   - Precisa ser único ou é idempotente? Hoje vai `dioli:<agente>:<cliente|casa>:<uuid>`.
7. **`classificacaoDados`:** quais são os valores aceitos? Conteúdo de cliente (brand book, conversa) deveria ir como algo acima de `internal`?
8. **`workClass`:** existe classe além de `routine` para trabalho longo, como a leitura de brand book?
9. **Mensagem `system`:** o papel `system` é aceito dentro de `mensagens`? Hoje vai como primeira mensagem.
10. **Formato JSON e tamanho:** dá para pedir resposta em JSON (`response_format`) e limitar `max_tokens`? O Dioli depende de JSON e hoje só pede pelo texto do prompt.
11. **Limites:**
    - Tamanho máximo do pedido (o brand book vai cortado em 30 mil caracteres).
    - Tempo máximo (o Dioli espera 60 s para texto e 90 s para imagem e leitura).
    - Limite de taxa: vem como 429?
12. **Leitura de imagem:** o gateway aceita imagem ou PDF para LER (visão)? Sem isso, brand book feito só de imagem e logos continuam sem leitura.

## Decisões que ficaram com o CEO

- **SDR público pelo cofre?** Hoje não passa (rota sem sessão, decide quem paga por conta própria).
- **Chaves diretas como reserva:** quando o cofre falha, o Dioli ainda tenta as chaves antigas. Se a regra for "só cofre", basta apagar as chaves em Integrações.
