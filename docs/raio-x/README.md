# O raio-x noturno da Dioli Digital

Protocolo obrigatório da companhia — a doutrina mora no `dioli-brain-kit`
(`docs/16-raio-x-noturno.md`); **este arquivo é a tradução dela para este
código**. O kit dá os cinco padrões; cada Diretor traduz no próprio projeto,
porque "id aceito sem conferir de quem é" é uma coisa em cada produto.

## Como rodar

```sh
npm run raio-x                                   # metade de código
npm run raio-x -- --dados https://<prod>/api/cron/raio-x   # + metade de dados
```

Cada execução grava `docs/raio-x/coletas/AAAA-MM-DD-<metade>.json` e imprime a
comparação com a coleta anterior. **A comparação é metade do valor**: "37
mensagens presas" não diz nada, "37 contra 4 ontem" diz tudo.

## As duas metades — e por que estão separadas

| Metade | Onde roda | Quem faz |
|---|---|---|
| **Coleta** | `lib/raio-x/` — código puro, zero IA | a máquina |
| **Leitura** | uma sessão do Diretor, de manhã | o julgamento |

A coleta não pode usar IA: IA erra diferente toda noite, e duas listas que erram
diferente não se comparam — some exatamente o "piorou desde ontem", que é a
informação. A IA entra depois, para ler a coleta e escrever o relatório do CEO.

## Os cinco padrões, traduzidos para esta casa

| # | Padrão do kit | O que a varredura procura AQUI |
|---|---|---|
| 1 | Trabalho que existe e ninguém vê | `for`/`while` que chama motor pago (imagem, visão, transcrição, provedor, Graph) **sem teto** ou **engolindo o erro** — a forma exata das 1.728 imagens/dia |
| 2 | Id aceito sem conferir de quem é | rota que recebe `clientId`/`params.id` e não passa por `lib/auth/posse-de-workspace`, `workspaceId` no `where`, guarda de portal ou segredo de cron. **`requireSession` não conta**: ele diz quem você é, nunca que é seu |
| 3 | Promessa que o código não cumpre | veredito (`aprovado`, `semAlucinacao`, `verificado`…) gravado como literal + a medida do P0: quantas checagens são `autoCheckable: false` |
| 4 | Estado morto | literal de `status`/`visibility` com escrita e **zero** leitura — a cicatriz do "aprovou e nada publicou" |
| 5 | Porta aberta para a internet | em `proxy.ts`, `/api/` é público: **nenhuma rota é protegida pelo proxy**. A varredura pergunta se a rota tem QUALQUER guarda, e cruza com motor pago / escrita no banco |

## Três coisas que este raio-x nunca faz

1. **Não escreve.** Não toca no banco, não manda mensagem, não cria pedido, não
   chama IA. Isso é trava, não promessa: `__tests__/raio-x/raio-x-nao-escreve.test.ts`
   reprova se um verbo de escrita entrar em `lib/raio-x/`. A única escrita é a
   memória da própria coleta, isolada em `registro.ts`.
2. **Não diz "está tudo bem" quando não olhou.** Varredura que falhou volta
   `status: "cega"` com o motivo, e achado que sumiu por causa dela entra em
   `desconhecidos` — **nunca** em `resolvidos`. Um relatório que anuncia "8
   problemas resolvidos" na noite em que a varredura quebrou é pior do que não
   ter raio-x.
3. **Não nasce sem as duas metades de teste.** Cada varredura tem o teste que
   prova que ela acha o problema plantado E o que prova que ela não inventa
   problema no caso limpo. Varredura só vista achando coisa é indistinguível de
   varredura que alarma sempre — e alarme constante mata a comparação com ontem.

## 15/08/2026 — dez dias cego COM O PAINEL VERDE, e o que foi recuperado

**O raio-x nunca parou de rodar. Ele rodava no lugar errado.** O
`.github/workflows/raio-x-noturno.yml` fazia `checkout` de
`ref: claude/dioli-pm-role-pow56e` — branch congelada em `2f3f9cd` — varria
aquele código velho e empurrava a coleta de volta para lá. Resultado: **8
rodadas agendadas, todas `success`**, e a branch de trabalho com a última coleta
em 05/08.

> **A lição, e ela não é sobre YAML:** o sinal que a casa olhava era "o job
> passou?", e ele dizia sim todos os dias. Rotina cuja saída ninguém consome
> pode ficar verde para sempre. **Job verde não é evidência de que o trabalho
> chegou onde alguém lê** — a evidência é o arquivo aparecer na branch viva.

**O mesmo defeito estava em `biblioteca-diaria.yml`** (9 noites), e ali custa
mais: é a biblioteca de `docs/plataformas/` que sustenta o parecer da trava de
plataforma. Os dois foram consertados no mesmo PR.

**O conserto e a trava:** os workflows perderam o `ref:` fixo (o `checkout`
passa a seguir o commit que disparou a rodada — para `schedule`, a branch
PADRÃO) e commitam para `${{ github.ref_name }}`, que sobrevive a renomear a
branch. A trava é
`__tests__/rotinas/rotina-nao-aponta-para-branch-fixa.test.ts`: nome de branch
escrito à mão em rotina que commita **reprova o CI**. Comentário no YAML seria
aviso; a lei da casa pede mecanismo.

### O que foi recuperado da branch morta — e o que NÃO foi

| | decisão | por quê |
|---|---|---|
| `*-dados.json` (08 a 15/08) | **importados** | são leitura de **produção**, verdadeira independentemente da branch varrida. É a memória que permite a comparação, e ela mostra `postsAtrasados` subindo 1 → 6 na semana |
| `*-codigo.json` (08 a 15/08) | **descartados** | descrevem `2f3f9cd`, um código que ninguém desenvolve — todos com os mesmos 9.745 bytes. Importá-los envenenaria a linha de base: a comparação de amanhã mediria a distância para uma branch morta, não para ontem |

**06 e 07/08 não existem em nenhuma das duas metades e não vão existir** — o
agendamento só começou em 08/08. Lacuna declarada, não preenchida por estimativa.

## Calibração de 15/08/2026 — o código andou (V2) e a varredura não

O PR anterior fez o raio-x voltar a pousar na branch viva. **Ele ia pousar
gritando errado:** dos **48** achados da primeira varredura na branca viva,
**28 eram ruído** — e ruído não é um defeito menor do instrumento, é o defeito
que o desliga, porque relatório com alarme falso ensina o CEO a não ler o
relatório.

A causa é uma só, e não é descuido: **o vocabulário da casa mudou e o da
varredura não.** Ela passou a acusar como defeito exatamente as travas que a
casa acabou de construir.

| O que a varredura acusou errado | Quantos | Por quê | O conserto |
|---|---|---|---|
| "rota sem guarda" (2 delas "que ESCREVE no banco") | **6** | usam `exigirApiInterna`/`exigirAdministracao` (`lib/agency/organizacao/guarda.ts`), módulo da V2 que nega **401/403** de verdade — conferido função a função, não aceito de palavra. A lista de guardas só conhecia sessão, portal, cron e assinatura | a família `exigir*` entrou na lista **de porta-aberta**, e só de lá |
| "veredito gravado como literal" | **22** | são **uniões discriminadas**: `validarRegistro` devolve `{valido:true}` depois de 8 guardas; `aprovacao-da-peca.ts` devolve `aprovada:true` só depois de provar que quem aprovou foi o cliente no portal — **a trava que o CEO mandou criar em 14/08** | três distinções: declaração de tipo ≠ código · recusa ≠ promessa · o "sim" devolvido no fim de um caminho que tem "não" com motivo ≠ carimbo |
| `/api/v2/retomar` "aceita id sem login" | **1** (meio) | **falso**: a rota tem guarda. Sobra a pergunta legítima — o `correlationId` não é filtrado por posse ali | virou **"posse delegada" (médio)**, o precedente de `/api/meta/publish` |
| "27 de 37" checagens do P0 | — | contagem **textual** de `autoCheckable: false`, que pegava as duas linhas do tipo e duas de comentário. O registro dizia **25 de 33** | o raio-x passou a ler `retratoDosPortoes()`, a **função** |

**Resultado: 48 → 20 achados**, e nenhum defeito foi silenciado — os 20 são os
mesmos de antes, sem o ruído. O que a calibração descarta fica **contado** em
`medidas` (`recusasIgnoradas`, `declaracoesDeTipoIgnoradas`,
`vereditosEmUniaoDiscriminada`): calibração que passe a engolir defeito aparece
como número subindo, em vez de sumir em silêncio.

### O que impediu isto de virar afrouxamento

Cada linha acima virou teste com as duas metades
(`__tests__/raio-x/calibracao-vocabulario-v2.test.ts`), e as três foram
**provadas mordendo no arquivo real** — defeito reintroduzido, reprovação vista,
arquivo restaurado:

- **`exigir*` não vira senha mágica.** Reconhecer a guarda exige **duas** coisas:
  chamá-la **e** devolver o `erro` dela. `exigirApiInterna` devolve
  `{ acesso, erro }` e não barra sozinha — quem chama e ignora o erro fica com
  cara de rota protegida em qualquer revisão de olho. Isso virou achado próprio,
  **alto**, e um teste que reprova o CI (hoje: 7 rotas usam a guarda, 7 devolvem
  o erro).
- **`exigir*` é login, nunca posse.** Ela entrou em `porta-aberta` e em
  `APENAS_AUTENTICACAO`; **não** entrou em `PROVA_DE_POSSE`. Rota com a guarda e
  id sem dono continua sendo achado **alto**.
- **Fingir a união discriminada passa a custar escrevê-la.** O "sim" só é
  perdoado quando está num `return` **e** o mesmo campo tem caminho de recusa
  com motivo. Um `aprovado: true` colado num objeto de resposta continua achado
  **mesmo dentro de um arquivo cheio de recusas legítimas** — provado plantando
  um carimbo no próprio `execucao-v2/registro.ts`, o arquivo dos 11 falsos
  positivos.
- **Um número, um dono.** Há teste que compara o número do raio-x com
  `retratoDosPortoes()` a cada rodada: reintroduzir a contagem de texto reprova
  o CI antes de o relatório mentir.

> ⚠️ **As medidas do P0 mudam de valor nesta noite** (`checagensDeQualidade`
> 37→33, `checagensNaoExecutaveis` 27→25) e vão aparecer como "medida que mudou"
> na comparação. **Não é o P0 andando — é o número passando a ser o certo.**
> Entrou também `checagensBloqueantesSemMecanismo` (**21**), que é o número que
> mede o risco de verdade.

### 🔴 O que a calibração ACHOU ao conferir a camada de baixo — e não é ruído

Reclassificar `/api/v2/retomar` para "posse delegada" obriga a fazer a pergunta
que o rótulo delega: **`retomarProcesso` prova posse do `correlationId`?**
Perguntado, e a resposta é **não**.

- `efeitosParaRetomar` consulta `where: { correlationId, status: {in:[failed,dead]} }`
  — **sem recorte de dono**, e `devolverParaFila` escreve por `id`.
- **`OutboxV2` não tem `workspaceId` nem `clienteId`** (`prisma/schema.prisma`):
  o filtro não foi esquecido na consulta, ele é **impossível** no modelo. Toda a
  camada V2 (`OutboxV2`, `ExecucaoV2`, `BloqueioV2`, `HandoffV2`) está fora da
  fronteira de inquilino que `lib/auth/posse-de-workspace.ts` impõe ao resto da
  casa.
- **O que barra hoje:** só `exigirApiInterna` + `podeRetomar` — é preciso ser
  interno da agência com autoridade de direção ou do departamento
  `project-management`. Não é rota aberta na internet.
- **O que isso permite:** quem tem esse papel devolve à fila efeitos de
  **qualquer** correlação da base, inclusive de outro workspace — e efeito
  devolvido à fila é efeito que **sai** (mensagem, publicação). O
  `correlationId` do ciclo assistido é `assistido:<clienteId>:<registroId>`,
  ou seja **derivável**, não um segredo.

**Não foi consertado neste bloco, de propósito:** este bloco é sobre o
instrumento, e misturar o conserto do achado com a calibração da varredura
embaralha os riscos. **O achado fica na lista todas as noites até alguém
fechar.** Escalado ao Diretor em 15/08/2026.

## Calibração da primeira rodada de verdade (05/08/2026)

A primeira rodada devolveu 28 achados; 6 eram ruído, e o ruído foi consertado no
mesmo dia — porque relatório com ruído ensina o CEO a não ler o relatório.

| O que a varredura acusou errado | Por quê | O conserto |
|---|---|---|
| `// const hasHallucination = false` | era **comentário**: a cicatriz contando o bug já consertado | comentário não é código |
| 4 rotas públicas do `/briefing` | `rateLimited` é guarda, só que a mais fraca da casa | viraram achado **médio** ("só limite por IP"), não "sem guarda" |
| `/api/meta/exclusao-de-dados`, `/api/self-serve/webhook` | verificam **assinatura** (HMAC / `signed_request`) | assinatura entrou na lista de guardas |
| `/api/meta/publish` | confere posse **uma camada abaixo** (`loadConnectionToken(workspaceId, id)`) | virou "posse delegada", médio: confira a função de destino |
| `scope_ready`, `triado` | lidos na TELA, e a varredura só olhava `app` + `lib` — e numa passada só, o veredito dependia da ordem alfabética dos arquivos | duas passadas + `components` |

Cada ajuste virou teste. É essa a diferença entre calibrar e afrouxar.
