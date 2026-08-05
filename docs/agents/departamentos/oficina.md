# Oficina — departamentos

> Registro de trabalho do especialista de departamentos. O que foi mexido, por
> quê, e o que ficou aberto. Quem promove para a vitrine é o Diretor.

---

## 2026-08-05 · madrugada — o raio-x do Brain, 9 achados

Território: `lib/agency/execution/` (artes, run-execution, quality-auditor,
especialistas) + `app/api/cron/execute/route.ts` + testes.

### 1. Vazamento de dinheiro — `artes.ts`

`baixarImagem` falhando fazia `continue` **sem** `marcarErro`. O contador de
tentativas mora no `lastError`, então nunca subia: a peça voltava a cada 5
minutos, para sempre, pagando uma imagem por rodada e nunca entregando.

- Conserto: todo caminho de saída **depois da chamada paga** gasta tentativa
  (download, guardar fundo, guardar arte).
- Teto novo: `MAX_IMAGENS_POR_CLIENTE_POR_DIA = 40`, contado no banco pelos
  arquivos `fundo-*` do dia (uma geração paga = um `fundo-*`), fail-**closed**
  quando o contador não pode ser lido.
- Teto de telas de carrossel (6) conferido **antes** da primeira chamada — cada
  tela é uma imagem paga.

### 2. O título nunca passava pelo piso

`deliverableMarkdown` não inclui o título, e o título vira o `name` do
`Deliverable` — o primeiro campo do portal. O piso agora confere
`título + corpo`.

### 3. O juiz era o autor em 11 de 14 entregas

`escolherArbitro(autor)` nunca devolve o provedor do autor. E como
`preferredProvider` é preferência (não trava), o veredito é conferido contra o
provedor **real** da resposta: caiu de volta no mesmo modelo → **aprovação vira
`nao_auditado`**, **reprovação continua valendo**. Assimetria deliberada.

### 4. `cicloId = null` por falha de leitura

`null` também é a chave do pacote inicial: com o banco tossindo no mês 5, o motor
comparava contra o mês 1 e gravava `done`. **Achado importante:** o `.catch` de
verdade está em `lib/agency/esteira/ciclos.ts:118` — `cicloAberto` engole o erro
e devolve `null` sozinho. Como esteira é território de outra frente, o motor
passou a **ler o ciclo direto** (mesma consulta, tratamento oposto do erro).

### 5. `executionAttempts` era contador de vida

Agora zera na passada que fecha o pacote: o número responde à pergunta do cron
("há quantas passadas seguidas este projeto não fecha?"). Nota: `mes.ts:621` já
zerava na virada de ciclo, mas em `.catch` best-effort — não era garantia.

### 6. A correção era re-roll cego

`pedidoDeRefacao` põe a **versão anterior em JSON** na frente do modelo, junto do
parecer. Vale para as três correções (contrato, piso, Qualidade). E nenhuma
correção pode desfazer uma trava anterior: contrato e piso são reconferidos
antes de a versão nova ser promovida.

### 7. `conferirContrato(esp, data)`

Dez especialistas ganharam contrato conferível no JSON. **Mínimo bloqueia**
(é o que o cliente comprou); **máximo só onde custa** (peças de social, telas de
carrossel, interesses da Meta) — barrar entrega boa por excesso seria trocar
dano por dano.

### 8. Fail-opens fechados

- Kit de marca fora do `try/catch` mudo; `entregarKit` devolve `{ok, erro}`, é
  idempotente e **retenta a partir dos arquivos que já existem** (o
  `produzirKitDeMarca` idempotente devolvia lista vazia e matava a retentativa).
- Trava anti-concorrência agora é `updateMany` com o estado no WHERE.
- `createApprovalRequest` com catch próprio → vira pendência, não silêncio.

### 9. Recusa ≠ falha transitória

`skipped` (transitório) e `recusados` (piso/contrato) são listas separadas. Duas
passadas seguidas só com recusas → `executionStatus: "blocked"`, que o cron e o
despertador não pegam. Sai de `blocked` na virada de ciclo ou quando o cliente
manda material.

### O que ficou aberto

- **`lib/agency/esteira/ciclos.ts:118`** — `cicloAberto` engole erro de banco e
  devolve `null`. Contornado, não consertado. É de outra frente.
- **`despertador.ts:68-70`** não conhece `blocked` (não precisa — ele filtra por
  `running`/`failed`/`pending`), mas ninguém **relata** projetos em `blocked`.
- **"3 regras do que nunca usar"** (identidade visual) segue sem trava: mora em
  campo de texto livre, não é contável no JSON.
- **Sem orçamento comercial por cliente.** O teto de 40 é segurança, não
  contrato — e a geração que falha antes de salvar o fundo sai do bolso sem
  entrar na contagem (limitada pelas 3 tentativas).
