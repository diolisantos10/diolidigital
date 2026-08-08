# Parecer `google` — Drive DA AGÊNCIA, pasta-raiz mapeada por cliente

**Data:** 08/08/2026 · **Pedido por:** `pm` (frente "não quero ficar autorizando")
**Situação:** app OAuth **publicado**, projeto `dioli-digital` (`87784856270`),
escopos concedidos hoje: `openid email profile`, `drive.file`, `business.manage`.

> ⚠️ **Declaração de procedência deste parecer.** A ferramenta de despacho de
> subagente não estava disponível na sessão em que ele foi produzido. Ele foi
> escrito pelo `pm` seguindo a carta do especialista (`.claude/agents/google.md`)
> e a biblioteca capturada, com conferência ao vivo das fontes oficiais. **Não
> substitui a revisão do `google` quando ele voltar a estar disponível** — e o
> veredito abaixo é conservador justamente por isso.

---

## VEREDITO: 🛑 **NÃO PODE** como especificado — e a decisão sobe ao CEO

### `drive.file` basta para "ler a pasta inteira e o que for acrescentado depois"? **NÃO.**

Não é "não sei". É **a melhor evidência disponível diz que não**, e **nenhuma
fonte oficial diz que sim**. Pela regra da casa — *a casa não aposta em
comportamento não documentado* — isso é um NÃO, não um "vamos tentar".

---

## 1. O que as fontes dizem, uma por uma

| Fonte | O que diz sobre pasta |
|---|---|
| `fontes/drive-api-escopos.md` (capturado 07/08) | `drive.file` = "criar novos arquivos do Drive ou **modificar arquivos que você abre** com um app ou que o usuário compartilha com um app ao usar a API Google Picker". Acesso **por arquivo**. **Nenhuma frase sobre pasta.** |
| `fontes/drive-picker-visao-geral.md` | Descreve o Picker. **Nenhuma frase sobre pasta.** |
| `picker.docsview` (referência, conferida ao vivo 08/08) | `setSelectFolderEnabled(enabled)`: *"Allows the user to select a folder in Google Drive."* Diz que **dá para selecionar**. **Não diz o que a seleção concede.** |
| `guides/limited-expansive-access` (conferida ao vivo 08/08) | *"Every user who has access to a folder also has access to all items inside the folder (…) called **expansive access**."* — ⚠️ **isto é o modelo de COMPARTILHAMENTO entre USUÁRIOS, não a semântica do escopo OAuth de um app.** Não vale como resposta. |
| Release notes da Drive API e do Picker (conferidas ao vivo 08/08) | **Nada** sobre `drive.file` passar a cobrir descendentes de pasta. |
| Comunidade oficial (Eric Koleda, Google, 11/06/2019) — já citado no parecer de 07/08 | *"Unfortunately the drive.file scope doesn't give you access to files within a folder that was picked."* |

**Conferi hoje, ao vivo:** `api-specific-auth`, `picker/guides/overview`,
`picker/guides/web`, `picker/reference/picker.docsview`, `api/guides/folder`,
`api/guides/limited-expansive-access`, `api/guides/pending-access` e as duas
páginas de release notes. **A lacuna declarada em 07/08 continua aberta em
08/08** — o Google não documentou o comportamento em treze meses.

> **Esta é a mesma conclusão do parecer de 07/08**
> (`2026-08-07-drive-do-cliente.md`, §2), e o código já a implementa:
> `escolha-de-material.ts` recusa pasta com motivo `e_uma_pasta`.
> **O que mudou hoje NÃO foi a resposta — foi de quem é o Drive.** E é isso que
> abre as saídas da §3.

---

## 2. Por que isto vira decisão do CEO, e não escolha do PM

O caminho óbvio para "aponta a pasta e esquece" é **`drive.readonly`**.

- É escopo **RESTRITO** (`fontes/drive-api-escopos.md`, seção "Escopos restritos").
- Restrito ⇒ **verificação de app obrigatória**, **avaliação de segurança de
  terceiros** (porque esta casa **guarda os bytes** no próprio volume) e
  **reverificação ANUAL** (`google-oauth-verificacao-do-app.md`).
- O app **já está publicado**. Acrescentar escopo restrito **reabre a
  verificação** — o mesmo alerta já registrado para o Analytics em
  `docs/plataformas/google/o-que-depende-do-ceo.md`, item 2.

**Custo: semanas a meses, com auditoria, e recorrente todo ano.** O despacho do
PM dizia, com todas as letras: *"Se exigir escopo restrito, PARE e me traga."*
**É este o ponto. Parei aqui.**

---

## 3. As TRÊS saídas — e duas delas não custam verificação

Levantadas porque a premissa mudou: **o material é da agência, não do cliente.**
Nenhuma delas foi construída. Todas dependem de decisão do CEO.

### Saída A — `drive.readonly` (o caminho direto)
Entrega exatamente o pedido. **Preço: reabre a verificação do app publicado**,
com avaliação de segurança e reverificação anual. **Recomendação: não**, pelo
mesmo motivo de 07/08 — custo desproporcional.

### Saída B — a casa passa a CRIAR os arquivos ⭐ *a mais barata*
`drive.file` concede acesso **permanente** aos arquivos que **o próprio app
cria** — é a primeira metade da definição do escopo, e ela **é documentada**
(`fontes/drive-api-escopos.md`: *"Criar novos arquivos do Drive…"*).

- O material entra por uma **tela da Dioli** (arrasta e solta), e a casa faz o
  upload para a subpasta certa via `files.create` com `parents`.
- **Aquele arquivo fica legível para sempre**, sem seletor, sem novo
  consentimento, **sem escopo novo, sem verificação**.
- **O que muda para o CEO:** ele para de jogar material pela interface web do
  Drive e passa a jogar por uma tela nossa. A pasta no Drive continua existindo
  e organizada igual.
- ⚠️ **Não resolve o passado:** os ~40 arquivos que **já estão** lá (Marca,
  Referencias) **não foram criados pelo app** e continuam fora do alcance. Para
  eles: um seletor, **uma vez**, ou reenviá-los pela tela nova.
- ⚠️ **É ESCRITA no Drive.** Hoje a casa **não escreve nada** no Google
  (`drive.ts`: *"Nenhuma escrita no Drive do cliente sai daqui. Nem uma."*).
  Ligar isto **exige parecer próprio** — este aqui **não autoriza escrita**.

### Saída C — conta de serviço com a pasta compartilhada
Fonte oficial conferida ao vivo hoje (`workspace/guides/create-credentials`):

> *"If your app only needs to read or write specific files (such as a Google
> Sheet or **a Google Drive folder**), you don't need to assign administrative
> roles or configure domain-wide delegation. You can treat the service
> account's email address as a user account in the document's share settings."*

O CEO compartilharia `Dioli Digital - Material Agencia` com um e-mail de conta
de serviço, **uma vez**. Pelo modelo de *expansive access*, a conta de serviço
passaria a enxergar tudo que está dentro — **inclusive o que entrar depois**.
É, no papel, exatamente o que ele pediu.

🔴 **MAS a isenção de verificação NÃO cobre este caso com clareza**, e é
desonesto dizer que cobre. A letra da isenção
(`google-oauth2-escopos-restritos.md`, linha 156) é:

> *"Se o app usa uma conta de serviço para acessar **apenas os próprios dados** e
> **não acessa dados do usuário (vinculados a uma Conta do Google)**, não é
> necessário enviar para verificação."*

A pasta é de `agenciadioli@gmail.com` — **uma Conta do Google**. Logo o material
**não** é "dados próprios da conta de serviço". **LACUNA: nenhuma fonte capturada
nem conferida diz se compartilhar a pasta de um Gmail com uma conta de serviço
cai dentro ou fora dessa isenção.** Existe ainda a isenção de **"Uso pessoal"**
(linha 141), que plausivelmente se aplica — o app é usado pela própria conta que
é dona do projeto —, mas *plausivelmente* não é fonte.

**Fechar esta lacuna custa uma pergunta ao Google, não semanas.** É o item de
melhor custo/benefício da lista, e é o que eu faria primeiro.

---

## 4. O que NÃO muda, decida o CEO o que decidir

1. **Cliente de fora continua no fluxo dele**, intacto: consentimento próprio,
   `drive.file`, escolha própria pelo Picker. Nada nesta frente o substitui.
2. **Alcance nunca é autorização.** Em B e em C o token/identidade alcança mais
   do que a pasta-raiz. **Só a pasta escolhida entra**, e isso tem que ser
   MECANISMO (a leitura recusa qualquer `fileId` cujo ancestral não seja a raiz
   mapeada), não intenção. Foi "alcance = autorização" que produziu as 19
   conexões da Meta em 03/08.
3. **`Nao usar` é excluída por nome**, e a exclusão precisa de teste com as duas
   metades: barra a pasta proibida **e** não barra `Nao usar Isto Aqui Sim` de
   um cliente que por acaso batize uma pasta assim.
4. **Sem pasta ou sem material, a peça DECLARA a falta.** Nunca inventa.
5. **A leitura declara as ORIGENS consultadas.** Hoje existem duas e o Drive é
   só uma delas: `public/brand/` já tem o logo da Dioli (5 variantes, PNG+SVG) e
   os 6 SVGs do CityJobs. *"Não temos"* nunca pode significar *"não procuramos
   onde já estava"*.

---

## 5. Ritmo — vale para qualquer das saídas

- Varredura recursiva periódica de pasta é **rajada de GET**, a assinatura do que
  restringiu a conta da agência na Meta em 03/08.
- **Exijo `changes.list` com `pageToken` incremental**, não varredura cheia
  repetida. Varredura cheia **só na primeira vez** e quando o operador pedir.
- Cadência mínima **15 minutos**, backoff exponencial em 403/429, e **nenhuma
  chamada ao Google a partir de renderização de tela** (a regra já travada por
  teste em `__tests__/google/retrato-do-admin.test.ts`).
- ⚠️ **LACUNA:** as cotas da Drive API **não estão capturadas** nesta biblioteca
  (há `ads-api-cotas.md` e `analytics-data-api-cotas.md`, não há a do Drive).
  Fechar antes de ligar qualquer rotina.

---

## 6. O que o CEO precisa decidir (uma escolha, três opções)

1. **Saída B** — trocar o hábito: material entra por tela da Dioli. *Sem custo de
   verificação. Exige parecer de ESCRITA no Drive.* ⭐
2. **Saída C** — perguntar ao Google se a conta de serviço isenta este caso.
   *Uma pergunta, dias. Se a resposta for sim, é a saída ideal.*
3. **Saída A** — pagar a verificação restrita. *Semanas a meses + auditoria anual.*

**Nada foi construído nesta frente. Nenhuma chamada à API do Google partiu desta
sessão. Nenhum escopo foi acrescentado ao app.**
