# Vitrine — meta

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.
> Toda entrada carrega proveniência. Se não couber em duas telas, não é vitrine.

---

## Atribuir o ativo do cliente ao nosso Business Manager **não é** o teste que a Meta usa

A pergunta que decidia o cronograma era: *"se o Instagram do cliente estiver
atribuído ao nosso Business Manager, o acesso padrão basta?"* Se bastasse, não
haveria App Review no caminho e a agência poderia publicar hoje.

**Não basta.** O teste publicado pela Meta é outro, e são duas condições que
andam juntas:

1. a conta ser **"adicionada ao app no Painel de Apps"** — não ao Business
   Manager (`fontes/instagram-insights.md:57`);
2. quem concede a permissão ter **função no app ou no portfólio empresarial**
   (`fontes/instagram-visao-geral.md:99-101`).

Para conta de anúncios de terceiro a Meta não deixa margem nenhuma: *"se o app
gerenciar contas de anúncios de outras pessoas, será necessário ter acesso
avançado"* (`fontes/marketing-api-autorizacao-e-niveis.md:73`).

**E existe um segundo portão, independente do App Review:** sem verificação do
negócio concluída, *"os usuários de outras empresas não poderão conceder
permissões a esses apps, e todos os recursos ficarão inativos"*
(`fontes/verificacao-de-negocio.md:20`). Isto morde exatamente no cenário em que
todo mundo confia — *"mas o cliente autorizou"*.

**Custo de desfazer:** tratar atribuição no BM como equivalente é a mesma classe
de erro que restringiu a conta de anúncios da agência em 03/08 — confundir *"a
API deixou"* com *"pode"*.

— promovido em 2026-08-11 pelo Diretor · origem: parecer assinado do especialista
`meta`, §1 · fontes capturadas em 07/08/2026 (commit `cbf3d60`)

---

## App do tipo Business **não tem** modo de desenvolvimento — tem nível de acesso

Três arquivos de código desta casa afirmavam que a publicação estava travada
porque *"o app está em modo de desenvolvimento"*. **Está errado.**

> *"Os apps de empresa não têm modos e se baseiam exclusivamente em níveis de
> acesso."* — `fontes/app-review-publicacao.md:35`

O app da Dioli é do tipo Business (usa Login do Facebook **para Empresas**, que
só aceita `config_id` e recusa `scope` — `lib/integrations/meta/oauth.ts:31-49`).
A alternância dev/live é de app de **consumidor**. Aqui o que governa é **nível
de acesso por permissão**: padrão × avançado.

**Por que isso não é preciosismo:** com o motivo errado escrito no código, quem
fosse destravar procuraria o botão *"ligar modo Ativo"*. Ou não o acharia — ou,
pior, o acharia, o ligaria, veria que nada mudou e concluiria que **a trava é que
está quebrada**. Discutir "ligar o modo Ativo" não destrava nada.

— promovido em 2026-08-11 pelo Diretor · origem: parecer do especialista `meta`,
§0(b) · corrigido em `trava-de-publicacao.ts`, `formato-de-midia.ts` e
`esteira/publicacao.ts` (commit `cbf3d60`)

---

## `DEFAULT_SCOPES` é **inerte** quando existe `config_id` — auditar o código não responde o que o cliente concede

`META_LOGIN_CONFIG_ID` está definida. Com ela, o diálogo do Login para Empresas
**ignora o parâmetro `scope`** e usa a lista da configuração feita no painel
(`oauth.ts:41-46`; a Meta já respondeu `Invalid Scopes: email,
pages_manage_posts, read_insights` — registrado em `config.ts:40-56`).

**Consequência para qualquer auditoria futura:** ler `DEFAULT_SCOPES` no
repositório e concluir "estas são as permissões que o cliente concede" é ler o
arquivo errado. A lista real vive no painel e **só o CEO a enxerga**.

— promovido em 2026-08-11 pelo Diretor · origem: parecer do especialista `meta`,
§3 (commit `cbf3d60`)

---

## O escopo estar no token não diz para **qual ativo** ele vale

Dois enganos empilhados, e eles se parecem o bastante para passar juntos:

1. *"o escopo está no token, então pode"* — o escopo prova que a chamada
   **passaria**, não que é permitida. Foi essa confusão que gerou o 03/08.
2. *"o escopo está no token, então vale para todos os ativos"* — o campo
   `granular_scopes` do `debug_token` mostra que `instagram_content_publish` pode
   valer para o perfil da própria casa e **não valer** para o do cliente, dentro
   do **mesmo token**.

A casa passou a medir isso sem tentar publicar:
`lib/integrations/meta/permissoes-do-token.ts`. É leitura pura — e ela **não
autoriza nada**: permissão concedida pela Meta não é licença da casa, e quem
autoriza publicar em nome de cliente continua sendo o CEO.

**Três estados, nunca dois:** vale · não vale · **não medido**. Credencial
ausente, Meta fora do ar ou token que não abre caem no terceiro.

— promovido em 2026-08-11 pelo Diretor · origem: parecer do especialista `meta`,
§1 (commit `cbf3d60`)
