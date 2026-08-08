# Parecer `google` — ESCRITA no Drive da agência (Saída B)

**Data:** 08/08/2026 · **Pedido por:** `pm`, por ordem do Diretor
**Objeto:** o app passar a **criar** arquivos no Drive (`files.create`), para que
`drive.file` conceda acesso permanente ao que a própria casa cria — e o material
deixe de depender do seletor.

> ✅ **Procedência: este parecer foi produzido pelo especialista `google`**, por
> despacho real (`claude --agent google`), lendo a biblioteca capturada. Ele
> **não** é do `pm` — ao contrário do parecer de 08/08 sobre o Drive da agência
> (`2026-08-08-drive-da-agencia.md`), cuja procedência é declarada no próprio
> cabeçalho e cuja "Saída C" produziu uma premissa errada que subiu ao CEO.

---

## VEREDITO: 🟡 **PODE COM AJUSTE**

Os ajustes são de dois tipos: **(a)** requisitos de implementação verificáveis;
**(b)** um **spike de confirmação técnica**, isolado e sem dado de cliente, que
tem que rodar **antes de a tela ser construída**, porque duas peças da tese não
estão confirmadas por fonte — só por leitura estrutural do texto do escopo,
corroborada (não provada) por exemplo oficial do Google.

> **Não é o mesmo "NÃO PODE" do parecer de 08/08.** Aquele caso (ler o conteúdo
> de uma pasta inteira via `drive.file`) tinha **evidência contrária
> documentada**. Este caso tem **ausência de confirmação**, que é outra coisa —
> e por isso vira "testar antes de construir", não "não fazer".

---

## 1. `drive.file` cobre CRIAR e RELER depois?

**Criar: SIM, confirmado, sem condição de Picker.**
`fontes/drive-api-escopos.md`, linha 58:

> *"Criar novos arquivos do Drive **ou** modificar arquivos que você abre com um
> app ou que o usuário compartilha com um app ao usar a API Google Picker ou o
> seletor de arquivos do app."*

O "ou" separa duas cláusulas: **criar** (sem condição) e **modificar
pré-existente** (condicionado ao Picker). A Saída B usa só a primeira metade, e
essa metade é **literal na fonte**, não inferida.

**Reler depois, em sessão futura, sem novo consentimento: NENHUMA FONTE DIZ ISSO
COM ESSAS PALAVRAS.** O que sustenta a prática:

- `drive-api-escopos.md`, linha 115: *"o escopo drive.file funciona com todos os
  recursos REST da API Drive"* — cobre `files.get`.
- `oauth2-tokens-e-expiracao.md`, linha 67: refresh token é para acesso de longo
  prazo — mas fala do **token**, não do vínculo arquivo↔app.
- **Precedente operacional:** a casa já relê, em sessões posteriores, arquivo
  autorizado uma vez pelo Picker (`drive.ts` / `escolha-de-material.ts`).

🔴 **LACUNA:** "acesso permanente a arquivo criado pelo app, entre sessões" é a
leitura mais razoável do texto — **não é fato documentado**.

**Revogação: documentada e total.** `google-oauth2-servidor-web.md`, linha 647:
a revogação *"remove todos os escopos concedidos anteriormente a um projeto,
invalidando todos os tokens"*. **Não existe revogação parcial por arquivo** — se
`agenciadioli@gmail.com` revogar, cai junto o material picked dos clientes **e**
os arquivos que o app criou.

🔴 **LACUNA:** se o vínculo sobrevive à **troca/expiração do refresh token
específico**, nenhuma fonte diz. `oauth2-tokens-e-expiracao.md` (linha 163)
documenta que passar de 100 refresh tokens por Conta/Client ID invalida o mais
antigo **silenciosamente**.

## 2. Escopo extra para pasta? A pasta-raiz feita à mão serve de `parents`?

**Criar pasta com `drive.file`:** sem fonte capturada, mas com corroboração
forte — o guia oficial de pastas (conferido ao vivo, **não está na biblioteca**)
traz o exemplo de criar pasta declarando **exatamente `DriveScopes.DRIVE_FILE`**.
Evidência forte; não é a frase escrita por extenso.

**Usar como `parents` uma pasta que o app NÃO criou (a pasta-raiz da agência,
feita à mão na web): NENHUMA fonte confirma nem nega.**

Leitura mais defensável: `files.create` com `parents` é operação de **criar**
(cláusula sem condição) — a pasta-pai não está sendo modificada, só recebendo um
filho. **Diferente do caso de 07/08, não existe fonte nem relato dizendo que NÃO
funciona.** Mas é leitura, não fonte.

🔴 **É este o ponto que decide se ainda sobra um seletor, e ele não está fechado.**

## 3. Limites — ritmo, tamanho, tipo

Fonte: `fontes/drive-api-cotas.md` (capturada 08/08, fecha a lacuna anterior).

| Item | Valor |
|---|---|
| Por minuto por projeto | 1.000.000 unidades |
| Por minuto por usuário por projeto | 325.000 unidades |
| Por dia por projeto | 1 TB / 400.000.000 unidades |
| `files.get` · `files.list` · `files.download` · `files.update` | 5 · 100 · 200 · 50 |
| **`files.create`** | 🔴 **NÃO LISTADO — LACUNA** |
| Estouro | `403 User rate limit exceeded` ou `429 Rate limit exceeded` |
| Retry | espera exponencial truncada, teto 32–64s |
| Tamanho máx. de arquivo | 5 TB |
| Upload/dia | 750 GB — texto fala de *"usuários do Google Workspace"*, e `agenciadioli@gmail.com` **não é Workspace** 🔴 **LACUNA** |

**Upload simples vs. resumable** (conferido ao vivo, **não capturado**):
≤ 5 MB simples/multipart; > 5 MB resumable, retomar em `5xx`, **reiniciar sessão
em `4xx`**, sessão expira em **7 dias** de inatividade.

🔴 **Tipo de arquivo proibido: LACUNA TOTAL.** Nenhuma fonte trata restrição de
tipo no **upload**. A casa impõe o próprio allowlist (ajuste 7) — decisão de
engenharia da casa, não citação de regra do Google.

## 4. A cota de armazenamento é de quem?

O arquivo nasce com `parents` dentro do **Meu Drive de
`agenciadioli@gmail.com`** ⇒ **o dono é ela**, e é o **armazenamento dela**
(Gmail comum, 15 GB) que é consumido. **Não é do cliente** e **não é a "unidade
de cota"** da tabela acima — taxa de chamada e armazenamento são coisas
diferentes, e a casa não pode confundi-las.

**Distinguível:** `403` com `reason: storageQuotaExceeded` (*"The user's Drive
storage quota has been exceeded"*) ≠ `rateLimitExceeded`/`userRateLimitExceeded`.
A tela **deve** separar pelo `reason`, nunca só pelo status.

## 5. Escrita reabre a verificação do app? **NÃO** — confirmado

- `drive.file` é **não sensível** (`drive-api-escopos.md`, linha 75) e **já está
  concedido e publicado**.
- `google-oauth-verificacao-do-app.md`: escopo não sensível não obriga verificação.
- Conferido ao vivo (`support.google.com/cloud/answer/13464018`, **não
  capturado**): reverificação é exigida ao **adicionar escopo novo** ou mudar
  nome/logo/redirect URI/homepage/política. **Usar a metade "criar" de um escopo
  que já é seu não é escopo novo.**

✅ **Isto CONFIRMA a afirmação do parecer de 08/08** neste ponto específico, com
fonte melhor do que a citada lá.

---

## Ajustes obrigatórios (verificáveis)

1. **Spike antes de qualquer tela.** Em pasta/arquivo descartáveis dentro do
   Drive de `agenciadioli@gmail.com` — **nunca em pasta de cliente** —:
   `files.create` com `parents=[id da pasta-raiz feita à mão]`. **200 ⇒ a tese
   vive. 403/404 ⇒ a Saída B não sobrevive como está** e passa a exigir seletor
   de pasta uma vez, ou pasta criada pelo próprio app.
2. **O mesmo spike confirma "reler depois":** `files.get` do arquivo criado, em
   execução posterior. 200 confirma; 403/404 derruba.
3. **`files.create` NUNCA a partir de renderização de tela** — estender o teste
   já existente em `__tests__/google/retrato-do-admin.test.ts`.
4. **Upload por tamanho:** ≤ 5 MB simples; > 5 MB resumable, retomada em `5xx`,
   reinício de sessão em `4xx`, nada guardado além de 7 dias.
5. **Backoff obrigatório** em `429` e em `403` de taxa, exponencial truncado,
   teto 32–64s.
6. **Distinguir por `reason`, não por status:** `403 storageQuotaExceeded` →
   *"acabou o espaço no Drive da agência"*; `403`/`429` de taxa → "tente de
   novo", com backoff rodando por trás; `reason` desconhecido → **"quebrou"**,
   nunca fingir sucesso.
7. **Allowlist de MIME** (imagem, PDF, vídeo comum, documento). Nenhum
   executável, script ou compactado sem inspeção.
8. **Cadência de rotina inalterada:** `changes.list` incremental com `pageToken`,
   nunca varredura cheia repetida; mínimo 15 min.
9. **Teste de revogação:** conexão em `revoked`/`expired` recusa **também** os
   arquivos criados pelo app. Nenhum caminho de escrita ignora o estado da
   conexão.
10. **Capturar as 4 fontes hoje só conferidas ao vivo:** guia de pastas, guia de
    upload, guia de erros e a página de mudanças que exigem reverificação. Este
    parecer se apoia em 4 conferências **sem cópia datada com hash** na casa.

## Lacunas declaradas

- Persistência do vínculo arquivo↔app entre sessões: **inferida**.
- `parents` para pasta não criada pelo app: **nem confirmada nem negada** — a
  maior incerteza deste parecer.
- Sobrevivência do vínculo à troca de refresh token: **sem fonte**.
- Custo em unidades de cota de `files.create`: **não listado**.
- Teto de 750 GB/dia para conta Gmail comum: **não confirmado**.
- Tipo de arquivo proibido no upload: **nenhuma fonte**.

---

## Nota do `pm` — por que o spike NÃO rodou nesta sessão

**Não há credencial do Google neste ambiente.** `.env` local tem apenas
`DATABASE_URL`, `JWT_SECRET` e `AUTH_SECRET`; não há `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET` nem `CRON_SECRET`, e o refresh token de
`agenciadioli@gmail.com` vive no banco de **produção**. O spike dos ajustes 1 e
2 exige um desses dois caminhos e **nenhum existe aqui**.

**Nenhuma linha de escrita no Drive foi construída**, em obediência ao ajuste 1:
o especialista exige o spike **antes** da tela, e o `pm` não passa por cima do
parecer que ele mesmo pediu — foi exatamente isso que produziu o erro da rodada
anterior. **A Saída B está aprovada e parada no spike**, que é trabalho de
`plataforma` com credencial de produção.
