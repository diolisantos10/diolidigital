# Parecer `google` — Drive DO CLIENTE, lido por conta de serviço dedicada

**Data:** 27/09/2026 · **Pedido por:** `pm`, formalizando por escrito um parecer
que já foi dado em conversa no mesmo dia e está registrado em
`docs/decisoes.md` (entrada "O ROTEIRO DO SOCIAL MEDIA AUTOMATIZADO", bloco
"Material de referência obrigatório por marca"). Este arquivo não muda o
veredito já decidido pelo CEO — só o registra no padrão da pasta, com as
fontes e as condições por escrito.

**Contexto:** a pasta a ler é do **cliente** (marca com brand book, logos,
fotos de produto, referências, entrada de material), não a pasta da agência.
O acesso é para alimentar a esteira de produção de social media (bloco 1B do
roteiro de cinco fases), com o material entrando via conta de serviço
dedicada, sem o cliente precisar reabrir o Picker a cada arquivo novo.

---

## VEREDITO: ✅ **PODE COM AJUSTE** — decisão do CEO, 27/09/2026, aceitando risco residual de conformidade conscientemente, não um atalho barato

Este não é o mesmo veredito do parecer de 08/08
(`2026-08-08-drive-conta-de-servico.md`, 🛑 NÃO PODE). É outro caso, com outro
dono da decisão e outro peso de risco — a diferença está detalhada na seção
"Diferença para o parecer de 08/08" abaixo. O mecanismo técnico (conta de
serviço + `drive.readonly` + *expansive access*) é o mesmo; o que muda é quem
é o dono do dado, quem autoriza, e quem decide aceitar o risco que sobra.

---

## 1. O escopo continua sendo restrito — isso NÃO mudou, e o AJUSTE não finge que mudou

`drive.readonly` está na tabela de **escopos restritos** de
`fontes/drive-api-escopos.md` (capturada 07/08/2026). A isenção "Somente dados
de propriedade do serviço" (`fontes/google-oauth2-escopos-restritos.md`,
capturada 07/08/2026) continua **não se aplicando**: a pasta pertence a uma
Conta do Google do cliente, não à própria conta de serviço. Essa é a mesma
leitura do parecer de 08/08 e **não foi invalidada** — é herdada, não
recalculada.

O que o **AJUSTE** faz não é fechar essa lacuna de isenção — é aceitar o
risco residual **com controles que reduzem a superfície dele**, porque desta
vez existe (a) consentimento real e por escrito do titular do dado (o
cliente, não a agência) e (b) uma decisão explícita do dono do negócio,
informado do risco, e não uma tentativa de evitar o processo de verificação
por conveniência.

## 2. As condições do PODE COM AJUSTE — uma por uma, contra fonte ou contra lacuna declarada

1. **Conta de serviço dedicada, só `drive.readonly`, sem delegação de
   domínio.** `fontes/google-service-accounts.md` e
   `fontes/workspace-create-credentials.md` (ambas 08/08/2026) descrevem o
   compartilhamento direto de pasta com o e-mail da conta de serviço, sem
   necessidade de "domain-wide delegation" — exatamente o desenho aqui. Sem
   `sub` no JWT é o que impede a conta de "se passar" por qualquer usuário do
   domínio do cliente — ela só alcança o que foi compartilhado com ela
   diretamente.
2. **`GOOGLE_SA_JSON` provisionada pelo CEO; ausente → recusa clara, antes de
   qualquer rede.** Não é opcional — é a mesma régua de "sem gate =
   reprovado" desta casa aplicada à credencial: enquanto ela não existir, o
   código tem que dizer isso, não simular sucesso nem falhar tarde.
3. **`files.list` com filtro de pasta e cadência de 15–60 min por cliente,
   escalonado, sem `watch`.** A cadência mínima e o motivo (rajada de leitura
   é a mesma assinatura que restringiu a conta de anúncios da Meta em
   03/08) já estão na cartilha e no parecer de 08/08 (§5, "Ritmo"), com base
   em `fontes/ads-abuso-da-rede.md` e `fontes/drive-api-cotas.md` (ambas
   capturadas 07–08/08/2026). `changes.list` com `pageToken` incremental seria
   o desenho mais barato em cota, mas **não é obrigatório para o veredito** —
   é otimização; o que é condição é não varrer em rajada e não usar `watch`
   (push notification), que exige endpoint público e canal registrado, fora
   do escopo deste desenho.
4. **Guardar só o que a esteira usa; apagar no fim do contrato.** Sem fonte
   do Google aqui — é regra da casa (minimização de dados), não exigência da
   plataforma. Ver divergência de implementação abaixo: **não há mecanismo
   automático hoje.**
5. **Link da pasta + autorização escrita do cliente com data.** É o
   consentimento do titular do dado — a peça que falta na análise de 08/08 e
   que aqui existe. Não é o fluxo de consentimento OAuth do Google (a conta de
   serviço não passa por tela de consentimento — `fontes/google-service-accounts.md`),
   mas é consentimento real, documentado e datado, coerente com o espírito da
   Política de Dados do Usuário (`fontes/politica-de-dados-do-usuario.md` —
   uso limitado e finalidade declarada).
6. **Plano B: Picker `drive.file`.** Já existe e continua valendo para quem
   não compartilhar a pasta raiz ou revogar a autorização — não é substituído,
   é alternativa.
7. **Onboarding: compartilhar a RAIZ, não restringir subpastas.** Decorre de
   `fontes/drive-api-expansive-access.md` (capturada 08/08/2026): quem tem
   acesso a uma pasta tem acesso a tudo dentro dela — compartilhar só
   subpastas obrigaria repetir o compartilhamento a cada subpasta nova.

---

## 3. Diferença para o parecer de 08/08 — por que o veredito muda com o mesmo mecanismo técnico

| | 08/08 (`drive-conta-de-servico.md`) | 27/09 (este) |
|---|---|---|
| **Dono da pasta** | `agenciadioli@gmail.com` — a própria agência | O cliente, com autorização escrita e datada |
| **Motivo do pedido** | Conveniência ("não quero ficar autorizando") | Peça central do roteiro de produto (esteira de social automatizada, bloco 1B) |
| **Quem decide aceitar o risco** | Ninguém ainda — o parecer levantou 3 saídas e devolveu ao CEO | O CEO, no mesmo dia, com o risco explicitado |
| **Isenção de verificação** | Não se aplica (mesma leitura aqui) | Não se aplica (herdado, não recalculado) |
| **Consentimento do titular do dado** | Não existe consentimento formal de terceiro — é a própria conta do CEO | Existe: autorização escrita e datada do cliente |
| **Controles técnicos exigidos** | Não especificados (parecer de viabilidade/custo) | Lista fechada de 7 condições (cadência, minimização, sem watch, apagar no fim do contrato) |
| **Veredito** | 🛑 NÃO PODE como atalho barato | ✅ PODE COM AJUSTE, risco residual aceito conscientemente |

**O que NÃO muda:** o risco documentado em 08/08 (§3 daquele parecer) —
"fora de conformidade com a Política de Dados do Usuário... em caso de
fiscalização, o Google pode revogar acesso ao escopo ou desativar o
projeto" — continua valendo tecnicamente. Este parecer não afirma o
contrário. A diferença é que agora existe decisão informada do dono do
negócio e consentimento do dono do dado, o que muda quem responde pelo risco,
não o risco em si.

---

## 4. Implementação (`lib/integrations/google/drive-conta-de-servico.ts`) contra o parecer — só leitura, sem execução

Conferido linha a linha contra as 7 condições acima. **4 batem, 2 divergem, 1
está fora do escopo deste arquivo por desenho.**

**Batem:**
- ✅ Escopo único e fixo `ESCOPO_LEITURA = drive.readonly`; nenhum outro
  escopo aparece no arquivo; sem `sub` no JWT (linha 197, comentário na
  linha 20).
- ✅ `GOOGLE_SA_JSON` ausente recusa com `FRASE_SEM_CREDENCIAL`, sempre a
  mesma frase, **antes de qualquer `fetch`** — em `credencialDaContaDeServico`,
  `conferirPastaDaMarca` e `importarMaterialDaPasta`, os três checam a
  credencial primeiro.
- ✅ Link da pasta + autorização escrita: `conferirPastaDaMarca` e
  `importarMaterialDaPasta` recusam sem rede quando falta `pastaDriveUrl` ou
  `autorizacaoDriveEm` do cliente (linhas 326–332 e 417–423) — testado em
  `__tests__/plataforma/drive-conta-de-servico.test.ts`.
- ✅ Onboarding: `avisoDeOnboarding` (linha 72) diz literalmente para
  compartilhar a **RAIZ** e não restringir subpastas.

**Divergem:**
- ⚠️ **Cadência e filtro incremental.** A condição pede `files.list` com
  `modifiedTime > X` a cada 15–60 min, escalonado por cliente. `listarFilhos`
  (linha 264) monta a query só com `'<id>' in parents and trashed=false` —
  **sem filtro de `modifiedTime`** — e é chamada sob demanda (clique do
  operador em `conferirPastaDaMarca`/`importarMaterialDaPasta`), não por
  rotina agendada. O próprio arquivo já avisa isso no cabeçalho (linhas
  22–24): a vigia periódica é do bloco 1D, ainda não construído. **Não é erro
  deste arquivo — é a condição 3 ainda não coberta por nenhum código**, e
  precisa entrar no desenho do 1D com o filtro incremental, não como
  varredura cheia repetida.
- ⚠️ **Apagar no fim do contrato.** Não há nenhuma chamada a `apagarArquivo`
  (existe em `lib/agency/media/armazenamento.ts:332`) amarrada a encerramento
  de contrato de cliente neste arquivo ou em rotina correlata encontrada.
  Mecanismo genérico existe; **gatilho de negócio não existe**. Hoje, material
  importado da pasta do cliente fica retido indefinidamente, mesmo depois do
  fim do contrato — divergência real, não cosmética.

**Fora do escopo deste arquivo, por desenho (não é divergência):**
- Plano B (Picker `drive.file`) vive em outro módulo (`drive.ts`), não aqui —
  correto, é alternativa paralela, não parte deste fluxo.

---

## 5. Lacunas declaradas

1. **Fontes citadas (`drive-api-expansive-access`, `google-oauth2-escopos-restritos`,
   `drive-api-cotas`, `ads-abuso-da-rede`) foram capturadas em 07–08/08/2026—
   51 dias antes deste parecer, acima do limiar de 30 dias desta casa.** Esta
   sessão tentou reverificar ao vivo (WebFetch) as duas páginas mais decisivas
   — a isenção de verificação restrita e a lista de escopos do Drive — e a
   permissão de WebFetch não estava disponível nesta sessão. **Recomendo**
   rodar `node scripts/biblioteca/capturar.mjs google --diff` antes de tratar
   este parecer como definitivo por mais tempo, especialmente antes de
   estender o alcance da conta de serviço a novos clientes.
2. **Se a verificação de escopo restrito bloqueia tecnicamente a emissão do
   token 2LO/JWT, ou só é fiscalizada por auditoria/denúncia posterior** —
   mesma lacuna aberta no parecer de 08/08 (item 5 das lacunas de lá),
   herdada sem novo teste.
3. **Gatilho de apagamento ao fim do contrato** não é lacuna de biblioteca —
   é lacuna de implementação, registrada na seção 4 acima, e cabe ao `pm`
   decidir se entra no 1B ou vira item próprio.

---

*Fontes citadas, todas em `docs/plataformas/google/fontes/`:
`drive-api-escopos.md` (07/08/2026), `google-oauth2-escopos-restritos.md`
(07/08/2026), `google-service-accounts.md` (08/08/2026),
`workspace-create-credentials.md` (08/08/2026), `drive-api-expansive-access.md`
(08/08/2026), `drive-api-cotas.md` (08/08/2026), `ads-abuso-da-rede.md`
(07/08/2026), `politica-de-dados-do-usuario.md` (07/08/2026). Herdadas, não
recapturadas nesta sessão — ver lacuna 1.*
