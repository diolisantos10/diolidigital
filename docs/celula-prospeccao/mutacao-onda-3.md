# Mutação da Onda 3 — ponte de arquivos e fila de exceções da célula de prospecção

> Laudo do especialista `seguranca`. Fonte de todo número aqui:
> `docs/celula-prospeccao/mutacao-onda-3.json` (rodado em 30/08/2026,
> `scripts/mutacao-onda-3.mjs`, catálogo em
> `docs/celula-prospeccao/mutacao-onda-3-catalogo.json`). Os dois números do
> portão final (189 testes, `tsc` limpo) não estão no JSON da mutação — vêm do
> relato do PM no despacho D3, e estão marcados como tal. Nenhum número deste
> documento é de memória.

## 1. Por que este documento existe

Guarda sem mutação rodada é promessa escrita. Um teste que só confirma que o
código está *como foi escrito* não prova que ele **barra** alguma coisa; só a
mutação — afrouxar a guarda de propósito e checar que a suíte reage — prova
isso. É trava, não aviso. A Onda 3 estende a mesma prova para a ponte de
arquivos com o cliente e para a fila de exceções: são os dois pontos onde a
célula passa a trocar bytes e decisões com gente de fora.

## 2. Como a mutação foi rodada, e por que é confiável

`scripts/mutacao-onda-3.mjs` segue o mesmo corredor de
`scripts/mutacao-onda-1.mjs`, um trecho por vez, em `lib/agency/celula/ponte/*.ts`,
`lib/agency/celula/excecoes/fila.ts` e `lib/agency/celula/funil.ts`:

1. Confere no disco que o trecho `de` existe **exatamente uma vez** no arquivo
   antes de mexer.
2. Aplica o `replace` e **confere no disco** que o texto `para` entrou —
   `replace` sem `assert` não é conserto, é esperança; o script trata isso
   como erro fatal se a substituição não pegar.
3. Roda o(s) arquivo(s) de teste alvo daquela guarda via `vitest run`.
4. **Restaura o arquivo original em `finally`** — inclusive se o passo 3
   estourar — e confere **byte a byte** (`sha256` antes × depois) que o
   arquivo voltou ao estado anterior antes de seguir para a próxima guarda.

**A linha de base (178 testes) roda só os 12 arquivos de
`ALVOS_DA_LINHA_DE_BASE`, nunca a suíte inteira** — e isso é deliberado, não
lacuna de cobertura: no mesmo worktree há **3 testes vermelhos de outra
frente** (`trava-de-conversa`, `trava-de-promessa`), que não têm nada a ver
com a ponte de arquivos nem com a fila de exceções. Se a linha de base
rodasse a suíte completa, o script abortaria por um defeito que não é desta
onda, e a mutação nunca chegaria a acontecer. A linha de base é checada verde
**antes da primeira mutação**, e o script aborta se ela já estiver vermelha —
mutação sobre suíte vermelha não prova nada, só confirma que já estava
quebrado.

## 3. As 13 guardas mutadas

| Guarda | Arquivo | Afrouxado (de → para, resumido) | Veredicto | Testes que caíram |
|---|---|---|---|---|
| **M11** · destinatário divergente bloqueia o envio (prova nº 14) | `ponte/saida.ts` | checagem `eixosDivergentes.length > 0` → `if (false)` (a divergência nunca dispara, T1 vira decoração) | ✅ VERMELHO_COMO_ESPERADO | `destinatarioDeclarado divergente → BLOQUEIA, com motivo legível e pedido de exceção` · `oportunidadeId divergente → BLOQUEIA — arquivo do cliente A não chega ao cliente B (prova nº 14)` · `clienteId/projetoId divergente → BLOQUEIA` · `fail-closed: destino SEM destinatarioDeclarado (ausente/vazio) → BLOQUEIA` · `fail-closed: destino SEM clienteId nem projetoId → BLOQUEIA` · `destinatário divergente → BLOQUEIA com o pedido de exceção de T1` |
| **M12** · o endereço interno nunca sai numa mensagem ao cliente | `ponte/endereco-interno.ts` | `if (caminhoInterno && alvo.includes(caminhoInterno))` → `if (false && ...)` (a varredura do caminho interno nunca dispara) | ✅ VERMELHO_COMO_ESPERADO | `caminho interno do arquivo aparecendo no texto → BLOQUEIA` |
| **M13** · arquivo suspeito vai para quarentena e não entra no projeto | `ponte/quarentena.ts` | `if (achadosDeRecusa.length > 0)` → `if (false)` (recusa direta nunca dispara) | ✅ VERMELHO_COMO_ESPERADO | `MIME fora da lista fechada → recusado, abre exceção 'arquivo_recusado'` · `tamanho acima do teto → recusado` · `extensão dupla perigosa (nota.pdf.exe) → recusado` · `nome com travessia de diretório (../) → recusado` · `nome com NUL byte → recusado` · `nome com caractere Unicode de sobrescrita de direção (RTL override, U+202E) → recusado` · `marca de executável (MZ) nos primeiros bytes, mesmo com MIME/extensão de PDF → recusado` |
| **M14** · versão nova não sobrescreve a anterior | `ponte/armazem.ts` | `versao = (ultima?.versao ?? 0) + 1` → `versao = ultima?.versao ?? 1` (nunca incrementa) | ✅ VERMELHO_COMO_ESPERADO | `VERSÃO NOVA É LINHA NOVA: duas gravações da mesma linhagem geram DUAS linhas, e a v1 continua legível byte a byte` (falha por colisão com a constraint `@@unique([linhagemId, versao])` do banco — ver §4) |
| **M15** · confirmação de recebimento exige integridade conferida (T4) | `ponte/entrada.ts` | `if (estado !== UNICO_ESTADO_QUE_CONFIRMA)` → `if (false)` (confirma em qualquer estado, mesmo sem varredura concluída) | ✅ VERMELHO_COMO_ESPERADO | `estado 'recebido' → RECUSA a confirmação` · `estado 'em_quarentena' → RECUSA a confirmação` |
| **M16** · `caminhoInterno` é derivado do id, nunca vem de fora | `ponte/endereco-interno.ts` | regex `[^a-zA-Z0-9_-]` → `/xxNADAxx/g` (a sanitização nunca casa nada, qualquer caractere sobrevive, inclusive `../`) | ✅ VERMELHO_COMO_ESPERADO | `sanitiza workspaceId, id e extensão — nenhum caractere fora de [a-zA-Z0-9_-] sobrevive` · `nunca produz travessia de diretório mesmo com entrada adversarial pesada` |
| **M17** · CAPTCHA / sessão expirada / bloqueio param a automação (trava 2) | `excecoes/fila.ts` | `if (CASOS_QUE_INTERROMPEM_A_AUTOMACAO.has(caso) && (estado === "aberta" \|\| estado === "em_tratamento"))` → `if (false)` (nenhum caso interrompe mais) | ✅ VERMELHO_COMO_ESPERADO | os 5 casos (`captcha`, `sessao_expirada`, `confirmacao_de_seguranca`, `mensagem_bloqueada`, `possivel_violacao_de_politica`) em estado `aberta` · os mesmos 5 em `em_tratamento` · `um caso bloqueador no meio de vários outros ainda bloqueia (não é só o primeiro item)` |
| **M18** · exceção vencida grita | `excecoes/fila.ts` | `if (prazoEm.getTime() >= agora.getTime()) continue` → `if (true) continue` (nunca conta nada como vencida) | ✅ VERMELHO_COMO_ESPERADO | `uma exceção 'aberta' com prazoEm no passado é vencida, com vencidaHaMinutos correto` · `'em_tratamento' também pode vencer` · `item com caso/responsavel/prioridade ilegíveis, mas id/prazoEm/estado legíveis, AINDA é reportado como vencido — com esses campos null` · `com vencidas, o grito não silencia: total, por caso, por responsável e a mais antiga` |
| **M19** · o CEO não pode ser responsável na fila (trava 1) | `excecoes/fila.ts` | `if (ehTentativaDeAtribuirAoCeo(entrada.responsavel))` → `if (false)` (checagem específica do CEO nunca dispara) | ✅ VERMELHO_COMO_ESPERADO | `responsável 'ceo' é rejeitado com o motivo específico da trava` · `responsável 'dono' e o e-mail do CEO também são rejeitados como tentativa de atribuir ao CEO` |
| **M20** · os 5 campos obrigatórios de uma exceção não têm default | `excecoes/fila.ts` | `if (!textoUtilValido(entrada.acaoRecomendada))` → `if (false)` (ação recomendada vira opcional) | ✅ VERMELHO_COMO_ESPERADO | `ação recomendada ausente, vazia ou curta demais não entra` |
| **M21** · trilha de eventos append-only — `EventoDoArquivoDaCelula` | `ponte/armazem.ts` | injeta `tx.eventoDoArquivoDaCelula.updateMany({...detalhe: "reescrita"})` logo após o `.create` do evento | ✅ VERMELHO_COMO_ESPERADO | `não existe .update / .updateMany / .delete / .deleteMany / .upsert sobre eventoDoArquivoDaCelula` |
| **M22** · trilha de eventos append-only — `EventoDaExcecaoDaCelula` | `excecoes/armazem.ts` | injeta `tx.eventoDaExcecaoDaCelula.updateMany({...detalhe: "reescrita"})` logo após o `.create` do evento | ✅ VERMELHO_COMO_ESPERADO | `não existe .update / .updateMany / .delete / .deleteMany / .upsert sobre eventoDaExcecaoDaCelula` |
| **M23** · `perdida → retomar` legal e `perdida → ganha` ilegal | `funil.ts` | `perdida: ["retomar", "excecao_operacional"]` → `perdida: ["ganha", "excecao_operacional"]` (inverte a linha da tabela) | ✅ VERMELHO_COMO_ESPERADO | `2a. perdida DEIXOU de ser terminal: perdida → retomar é legal, perdida → ganha continua ilegal` · `2d. perdida → retomar SEM justificativa continua rejeitada` · `2e. perdida → retomar COM justificativa é aceita pelo juiz puro` · `4. aprovada é a ÚNICA origem que alcança ganha` |

**Placar: 13 mutadas, 13 VERMELHO_COMO_ESPERADO, 0 CONTINUOU_VERDE_A_GUARDA_E_DECORATIVA,
0 ALVO_NAO_ENCONTRADO. Restauração byte a byte (`sha256` antes × depois)
conferida nas 13.** Em todas, os testes citados em `porqueCaiu` do JSON batem
com o que o catálogo (`mutacao-onda-3-catalogo.json`) declarou em `espera` —
é essa coincidência entre "o que se esperava quebrar" e "o que quebrou" que
prova que a guarda caiu pelo motivo certo, e não por efeito colateral.

**O portão do PM depois de tudo — número relatado no despacho D3, não no
JSON da mutação:** 189 testes verdes (os 12 arquivos da linha de base desta
onda + `trilha-e-append-only` e `trilha-sobrevive-ao-reinicio`, que são
guardas da Onda 1, no mesmo worktree) e `npx tsc --noEmit` limpo.

## 4. O que a mutação NÃO cobre — leitura honesta

Este é o bullet mais importante do documento.

- **A mutação prova que a guarda é observada por um teste; não prova que a
  regra de negócio por trás dela esteja certa.** Se um par errado estivesse
  na tabela de transições, na lista de MIME aceitos, no conjunto de casos que
  interrompem a automação, ou em qualquer outra regra codificada, desde o
  início, os testes concordariam com o erro — eles verificam que o código
  respeita o que está escrito, não que o que está escrito é a decisão
  correta.
- **Nenhuma rota HTTP e nenhuma tela existem nesta onda.** A ponte de
  arquivos e a fila de exceções só são exercitadas por chamada direta de
  teste. A trava existe; a porta por onde alguém de fora (cliente, integração,
  automação) a alcançaria ainda não foi construída.
- **O byte nunca é gravado em disco — LACUNA DECLARADA do conserto B2.**
  `caminhoInterno` passou a ser derivado do id com segurança (M16 prova a
  sanitização e a ausência de travessia de diretório), mas não existe
  `writeFile` nem equivalente: o armazém decide *onde* o arquivo ficaria,
  nunca escreve o conteúdo.
- **Ninguém executa o expurgo de retenção.** O campo `retencaoAteEm` é
  gravado (conserto B2), mas não há rotina que leia esse campo e apague nada
  quando o prazo vence. A guarda de gravação existe; a de expurgo, não.
- **A costura entre a ponte e a fila de exceções não existe.** A ponte
  devolve `PedidoDeExcecao` como **dado** quando bloqueia algo (destinatário
  divergente, arquivo recusado); ninguém consome esse dado para de fato abrir
  uma exceção na fila. As duas guardas foram provadas isoladamente; a
  costura entre elas não foi construída, então não pode ser mutada.
- **O gate de Qualidade não é verificado por `aprovarParaEnvio`.** Nada nesta
  onda impede que uma mensagem/arquivo saia para o cliente sem ter passado
  pelo `qualidade`.
- **Não há antivírus real.** A varredura de `quarentena.ts` (M13) é
  estrutural — MIME, extensão, tamanho, marca de executável (MZ), nome — e
  isso é tudo o que ela é. Nenhum motor de assinatura de malware roda aqui.
- **A atomicidade da versão (M14) é provada contra SQLite, não contra o
  motor de produção.** E mais que isso: a mutação prova a não-sobrescrita de
  versão **por efeito da constraint `@@unique([linhagemId, versao])` do
  banco** — o `porqueCaiu` de M14 mostra a segunda gravação colidindo com o
  banco, não uma trava de aplicação isolada checando antes de gravar. Se essa
  constraint sumir do schema um dia, a mutação para de provar o que promete,
  e nada nesta onda perceberia.
- **As três lacunas de escopo registradas no despacho D2, e que não somem
  agora que o placar deu 13/13:**
  - **M12 mutou só 1 dos 4 padrões de `contemEnderecoInterno`** — o texto que
    aparece direto. Os outros três padrões que o próprio módulo de detecção
    de endereço interno declara (id do arquivo isolado, prefixo de
    diretório, link assinado) **seguem sem mutação própria**: têm código,
    mas nenhum teste de mutação provou que eles barram de verdade.
  - **M20 mutou só 1 dos 5 campos obrigatórios de uma exceção**
    (`acaoRecomendada`). Os outros quatro campos que a guarda "os 5 campos
    obrigatórios não têm default" promete (o próprio título da guarda diz
    "5") não têm mutação própria nesta onda.
  - **M14 prova a não-sobrescrita de versão pela constraint do banco, não por
    trava de aplicação isolada** — repetido aqui de propósito, porque é ao
    mesmo tempo item da tabela e lacuna de escopo: é fácil ler "✅
    VERMELHO_COMO_ESPERADO" e concluir que existe uma trava de código
    verificando duplicidade antes de gravar. Não existe; quem trava é o
    banco.

## 5. O que o portão do PM achou, e que a mutação não teria achado sozinha

Esta é a parte mais útil do dia — porque nenhum dos três achados abaixo sai
de rodar `mutacao-onda-3.mjs`. Mutação prova que uma guarda que já existe
barra; ela não descobre guarda que deveria existir e não existe, nem prosa
que mente sobre o código.

- **O `qualidade` (que não escreve, só lê) reprovou a ficha B.** Três
  obrigatórios do próprio despacho B — armazenamento privado, retenção
  configurável e histórico de download — **não existiam nem em código nem em
  lacuna declarada**. Foram consertados no despacho B2, e **só então**
  ganharam mutação própria (M16 é filha direta desse conserto — antes dele,
  `caminhoInterno` vinha de fora sem sanitização e não havia o que mutar de
  forma honesta).
- **A inspeção do PM achou bytes de controle crus dentro do código-fonte de
  `quarentena.ts`** — NUL bytes e caracteres Unicode de sobrescrita/isolamento
  de direção, dentro do próprio regex de detecção de nome perigoso e dentro
  de comentários — **enquanto o comentário logo acima afirmava que estavam
  escritos como escape `\u` explícito "de propósito"**. Três confirmações
  independentes, medidas pelo PM: o `git diff` do arquivo saía como binário
  (`Bin`), a varredura do PM encontrou os bytes, e a própria ferramenta de
  despacho **recusou** transportar o trecho por conter caractere de
  controle. Consertado no despacho B2 — todo caractere de controle virou
  escape `\u` explícito, texto legível, sem mudar o comportamento do regex —
  com teste que varre o próprio arquivo-fonte
  (`ponte-quarentena-sem-byte-cru.test.ts`).
- **A lição, e é a mesma da M10 da Onda 1:** um comentário pode afirmar um
  comportamento que o código não produz, e a mutação **não pega isso** — ela
  prova que a guarda barra, não que a prosa descreve a guarda corretamente.
  Quem pegou foi leitura humana (o `qualidade`, que só lê) e a inspeção do
  PM. É a divisão de papéis funcionando, e vale estar escrito de novo.
- **O PM ajustou uma asserção no portão**, em
  `ponte-caminho-interno-derivado.test.ts`: ela exigia
  `not.toContain("passwd")`, o que não é propriedade de segurança nenhuma
  (qualquer string sem a palavra "passwd" passaria, mesmo carregando `../`
  disfarçado). Foi trocada por uma checagem estritamente mais forte — o
  formato inteiro do caminho
  (`/^celula\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/`), que é o que
  o próprio título do teste prometia. **Registrado aqui como o PM mexendo em
  teste no portão** — a mão foi do PM, não do `seguranca` nem do
  `plataforma`, e isso não fica escondido.

## 6. Como repetir

```
node scripts/mutacao-onda-3.mjs docs/celula-prospeccao/mutacao-onda-3-catalogo.json docs/celula-prospeccao/mutacao-onda-3.json
```

Roda só os 12 arquivos de teste listados em `alvosDaLinhaDeBase` do JSON —
nunca a suíte inteira (motivo no §2). Sai vermelho se qualquer guarda
continuar verde (decorativa) ou se um alvo não for encontrado no arquivo.
Aborta antes de mutar qualquer coisa se a linha de base já estiver vermelha.

---

**Bullets do laudo:**
- 13/13 guardas mutadas ficaram VERMELHO_COMO_ESPERADO; 0 decorativa; 0 alvo
  perdido; restauração byte a byte conferida nas 13.
- Linha de base roda só os 12 arquivos da Onda 3 (178 testes), de propósito —
  há 3 testes vermelhos de outra frente no mesmo worktree que abortariam o
  script sem culpa da ponte/fila.
- Maior achado do dia **não veio da mutação**: bytes de controle crus em
  `quarentena.ts` contradizendo o próprio comentário, achado pela inspeção do
  PM e confirmado três vezes de forma independente.
- Lacunas que seguem abertas, com todas as letras: byte nunca gravado em
  disco, expurgo de retenção não executa, ponte e fila de exceções não estão
  costuradas, gate de Qualidade não verificado no envio, sem rota/tela nesta
  onda, M12 e M20 mutaram só uma fração do que o próprio nome da guarda
  promete, M14 trava pelo banco (constraint), não por aplicação.
- Nada aqui exige decisão do CEO hoje — são lacunas declaradas para as
  próximas ondas, não achado de vulnerabilidade ativa (não há superfície
  externa nesta onda, igual à Onda 1).
