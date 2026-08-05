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
