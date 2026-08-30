# Laudo de Qualidade — Onda 2 da Célula de Prospecção (99Freelas)

**Auditor:** `qualidade` (somente leitura). Não executei `npm`/`npx`/`node`/`git`
de escrita — as afirmações de portão (`tsc`, `vitest`) na ficha são conferidas
por leitura de código e de artefato, nunca reproduzidas por mim.

## CONCLUSAO — NAO PASSA hoje, por um motivo concreto e recem-achado

Achei, no proprio repositorio, um artefato que a ficha H nao me deu:
`docs/celula-prospeccao/despachos/G2-o-guardiao-do-motor-nao-tem-teste.md`. Ele
registra que uma rodada de mutacao POSTERIOR a de `mutacao-onda-2.md` achou uma
guarda do MOTOR (`proxima-mensagem.ts`, etapa 10, o Guardiao de conteudo sobre
o texto FINAL montado) que nao derrubava nenhum dos 19 testes da suite quando
desligada. O conserto (5 testes novos) ja foi escrito, mas esta NAO COMMITADO
(`git status --short`: `lib/agency/celula/mensagens/proxima-mensagem.ts` e
`__tests__/celula/proxima-mensagem.test.ts` aparecem como `M`, modificados na
arvore de trabalho) e eu nao posso rodar `tsc`/`vitest` para confirmar que ele
agora passa nem que a mutacao agora cai. Nao existe `mutacao-onda-2.json` (so
o `.md` em prosa) nem log de rodada nova. Pela regra da casa, verificacao
prevista sem resultado registrado e reprovacao — e aqui a propria casa ja
registrou, por escrito, que a verificacao FALHOU numa rodada, e o conserto
esta sem prova de que passou.

## Os 8 criterios, um a um

**1. `tsc` limpo, testes verdes, mutacao com cada guarda caindo pelo motivo certo.**
-> **NAO CUMPRE.**
- Os 6 modulos-ficha (`biblioteca`, `anti-generico`, `entrada-hostil`,
  `trava-de-conversa`, `objecoes`, `compromisso`) TEM mutacao registrada e
  legivel em `docs/celula-prospeccao/mutacao-onda-2.md:20-38` — quase todas as
  linhas vermelhas, com uma excecao investigada e resolvida (linha 31 -> linha
  34, documentado nas linhas 39-56 do mesmo arquivo). Essa parte esta bem
  feita.
- Mas o MOTOR que costura tudo (`lib/agency/celula/mensagens/
  proxima-mensagem.ts`) nao esta na tabela de mutacao nenhuma — nem uma
  linha. Quando alguem finalmente rodou mutacao nele, achou a etapa 10
  (Guardiao) furada: `docs/celula-prospeccao/despachos/
  G2-o-guardiao-do-motor-nao-tem-teste.md:1-10` cita literalmente
  `FALHA motor/guardiao-no-texto-final — Tests 19 passed (19)` com
  `if (!conformidade.ok)` trocado por `if (false)`.
- O conserto (`__tests__/celula/proxima-mensagem.test.ts`, bloco
  `describe("GUARDIAO...")`, 5 testes incluindo a metade gemea) existe NA
  ARVORE DE TRABALHO, nao no commit (`08669ad`) — `git diff 08669ad` mostra o
  bloco inteiro como adicao nao commitada. Sem eu poder rodar o portao, e sem
  log/resultado de mutacao gravado para esta rodada, nao ha evidencia de que
  ele hoje passa.
- As demais guardas do motor — `unica_pergunta` (contagem de `?`) e
  `resposta_obrigatoria` — tambem nao aparecem em NENHUMA tabela de mutacao.
  Tem teste direto e causal (`__tests__/celula/proxima-mensagem.test.ts:191,169`),
  mas sem mutacao confirmada, mesmo padrao que acabou de falhar uma vez no
  Guardiao — a casa ja provou que "parece coberto" nao e o mesmo que "a
  mutacao cai".

**2. Mensagem identica a uma ja enviada e BLOQUEADA.** -> **CUMPRE.**
- `lib/agency/celula/mensagens/trava-de-conversa.ts:208-216`
  (`verificarMensagemDuplicada`) + `lib/agency/celula/mensagens/
  anti-generico.ts:146-157` (`texto_repetido`, por impressao digital).
- Teste do caso plantado: `__tests__/celula/trava-de-conversa.test.ts:97`
  ("bloqueia texto identico a ultima enviada..."). Metade gemea:
  `trava-de-conversa.test.ts:112` ("mensagem NOVA passa"). Tambem
  `__tests__/celula/anti-generico.test.ts:13` e twin `:129`.
- Mutacao: `mutacao-onda-2.md:29` (`trava-de-conversa/mensagem-duplicada`
  caiu) e `:25` (`anti-generico/texto-identico` caiu).
- Ressalva menor: no motor (`proxima-mensagem.ts:428`) a mesma funcao e
  reusada sem logica nova, mas nao ha teste de integracao especifico para
  essa chamada em `proxima-mensagem.test.ts` — so as funcoes isoladas sao
  mutation-testadas. Nao derruba o CUMPRE porque e a mesma funcao, nao uma
  reimplementacao.

**3. Variavel generica e BLOQUEADA.** -> **CUMPRE.**
- `lib/agency/celula/mensagens/anti-generico.ts:132-144` (`variavel_generica`,
  lida de `docs/plataformas/99freelas/frases-genericas.json`).
- Teste: `__tests__/celula/anti-generico.test.ts:90` ("nomeando a frase"),
  `:104`, `:115` (familia da mesma frase). Metade gemea: `:129` ("o caso
  limpo, especifico e novo, PASSA").
- Mutacao: `mutacao-onda-2.md:24` (`anti-generico/variavel-generica` caiu).

**4. Duas perguntas na mesma mensagem e BLOQUEADO.** -> **CUMPRE, com ressalva de mutacao.**
- Dupla trava: `perguntas-por-servico.ts` nunca devolve lista (assinatura
  `proximaPergunta(): {...} | null`); e a trava estrutural real,
  `lib/agency/celula/mensagens/proxima-mensagem.ts:416-425`
  (`contarPontosDeInterrogacao(texto) > 1`).
- Teste do caso plantado: `__tests__/celula/proxima-mensagem.test.ts:191`
  ("bloqueia quando a RESPOSTA ja contrabandeia uma segunda pergunta").
  Metade gemea: `:216` ("NAO bloqueia quando so ha uma pergunta... (metade
  gemea)").
- Ressalva: esta guarda nao esta em nenhuma tabela de mutacao (ver criterio
  1). O teste e causal por leitura (remover o `if` faria o desfecho virar
  `"enviar"`, o que quebraria a asercao), mas a casa acabou de aprender, no
  mesmo motor, que "parece causal" nao e prova — so mutacao prova.

**5. Desconto sem autorizacao registrada e BLOQUEADO.** -> **CUMPRE.**
- `lib/agency/celula/mensagens/objecoes.ts:274-353` (`podeConceder`), fail
  closed por padrao em `:282-289`.
- Teste do caso plantado: `__tests__/celula/objecoes.test.ts:210`
  ("CRITERIO 2 — desconto sem autorizacao registrada => BLOQUEADO"). Metade
  gemea: `:296` ("CRITERIO 7 — desconto com autorizacao valida... PASSA").
  Integracao no motor: `__tests__/celula/proxima-mensagem.test.ts:254`
  ("escala em vez de conceder desconto sozinha") + twin `:271`.
- Mutacao: `mutacao-onda-2.md:33-34` (`objecoes/piso-do-motor` e
  `objecoes/sem-autorizacao (no ponto certo)`, ambas caíram). A primeira
  tentativa dessa mesma guarda CONTINUOU verde (`:31` e a explicacao em
  `:39-56`) — investigada e provada redundante, nao decorativa. Bom exemplo
  de mutacao bem conduzida, ao contrario do que falta no motor.

**6. Promessa de data sem compromisso registrado e BLOQUEADA.** -> **CUMPRE.**
- `lib/agency/celula/mensagens/compromisso.ts:176-235`
  (`liberarTextoComPromessa`), registra ANTES de liberar (comentario e codigo
  batem: `:213-234`).
- Testes extensos em `__tests__/celula/trava-de-promessa.test.ts` — dono
  ausente/sistema/ia/vazio (`:172,186,199,212`), prazo ausente/invalido/passado
  (`:225,239,252`), sucesso e metade gemea (`:157,265`), falha ao registrar
  barra tudo (`:287,316`). Integracao no motor:
  `proxima-mensagem.test.ts:333` + twin `:356`.
- Mutacao: `mutacao-onda-2.md:35-38`, as 4 linhas do compromisso, todas
  caíram — inclusive `compromisso/reconhece-a-data`, o proprio defeito de
  29/08 que originou esta ficha.
- Achado historico registrado no mesmo arquivo (`:63-68`): a primeira entrega
  de `promessasDeData` NAO reconhecia "ate amanha" por um bug de `\b` ASCII —
  achado pelo portao, nao pela leitura. Isto e evidencia a favor do metodo
  (mutacao/portao pegou o que leitura nao pegaria), nao uma reprovacao do
  estado atual.

**7. Instrucao maliciosa dentro do texto do cliente NAO move nenhuma regra.** -> **CUMPRE COM RESSALVA.**
- No modulo isolado, a prova e forte: `lib/agency/celula/mensagens/
  entrada-hostil.ts:158-166` (`aplicarTextoDoCliente`, devolve o MESMO estado
  congelado, nem inspeciona o texto). Testes:
  `__tests__/celula/entrada-hostil.test.ts:46` (Guardiao barra o caso
  plantado), `:78` ("o estado de regras e o MESMO objeto"), `:105` (sinais
  registrados, nunca obedecidos). Metade gemea completa em `:124-141`.
  Mutacao: `mutacao-onda-2.md:27` (`entrada-hostil/envelope` caiu).
- Mas a prova ponta a ponta — "mesmo que algo ANTES do Guardiao tenha
  obedecido a instrucao hostil, o texto final ainda e barrado" — e
  EXATAMENTE o teste 4 do bloco G2 (`proxima-mensagem.test.ts`, "CRITERIO 7
  do CEO — cliente hostil e a resposta OBEDECEU e devolveu contato => o motor
  BLOQUEIA mesmo assim"). Esse teste e o mesmo trecho NAO COMMITADO do
  criterio 1. A propria ficha G2 admite, por escrito, que antes deste teste
  esse caminho nao tinha prova nenhuma ("Hoje esse caminho nao tem prova" —
  `G2-o-guardiao-do-motor-nao-tem-teste.md:23-27`). Ou seja: no estado
  COMMITADO da onda, o criterio mais citado pelo CEO — "texto de cliente e
  entrada hostil, nunca instrucao" — nao tinha, ate este achado, o teste que
  prova a consequencia mais dura dele. Esta escrito agora; nao esta provado
  como passando.

**8. Modelo em rascunho/pausado/aposentado nao pode ser enviado.** -> **CUMPRE.**
- `lib/agency/celula/mensagens/biblioteca.ts:338-363` (`modeloParaEnvio`, so
  `estado === "aprovado"` sai) + `tipos.ts:9-18` (`EstadoDoModelo` fechado).
- Teste parametrizado, os tres estados de uma vez:
  `__tests__/celula/biblioteca-de-mensagens.test.ts:143`
  (`it.each(["rascunho","pausado","aposentado"])`).
- Mutacao: `mutacao-onda-2.md:22` (`biblioteca/estado-aprovado` caiu),
  nomeando exatamente os tres testes acima mais o teste dos 22 modelos reais.
- Confirmado tambem pelos dados: `docs/plataformas/99freelas/mensagens.json`
  tem 22 modelos, os 22 em `"estado": "rascunho"`, os 22 com `"textoBase": ""`
  e os 22 com `"pendencia"` preenchida (conferido por contagem via grep — 22
  em cada campo). Teste que fecha o ciclo:
  `biblioteca-de-mensagens.test.ts:258` ("nenhum dos 22 modelos M01–M22 e
  entregavel hoje").

## As duas perguntas que so eu ia fazer — respondidas

### 1. O afrouxamento de instagram/insta/linkedin em conformidade.ts — abriu porta?

**Abriu, parcialmente — achado independente, com frase concreta.**
`git diff 01bd7a2 08669ad -- lib/marketplaces/99freelas/conformidade.ts`
mostra a remocao das tres palavras da regra `dado_de_contato` e o acrescimo da
flexao de "pago/paga por fora".

- `"meu instagram e @diolidigital"` — CONTINUA barrada, mas nao pelo motivo
  que a remocao tentou preservar: o padrao de `@handle`
  (`conformidade.ts:75`, `/(?:^|[\s(])@[a-z0-9._]{3,}/gi`) pega o
  `@diolidigital` independente da palavra "instagram" estar na lista ou nao.
- **"me segue no insta" — NAO e barrada.** Nao tem `@handle`, nao tem
  telefone, nao bate em `me\s+chama\s+n[oa]`/`chama\s+n[oa]` (o verbo e
  "segue", nao "chama"). Nenhum padrao da lista de 6 proibicoes cobre esta
  frase hoje.
- **"meu perfil no linkedin" — NAO e barrada.** Mesmo raciocinio: nao e
  `@handle`, nao e dominio (`linkedin.com` seria pego pelo padrao de link,
  mas "meu perfil no linkedin" sem dominio nao e), nao bate em
  `meu\s+portf[oo]lio` (a frase e "perfil", nao "portfolio").
- A fonte citada pela propria politica (`docs/plataformas/99freelas/
  policy.json:81-82`) diz "nao se pode adicionar dados de contato e/ou links
  ao seu perfil ou portfolio" e "nao se pode solicitar ou compartilhar dados
  de contato" — direcionar o cliente para seguir/checar um perfil de rede
  social fora da plataforma e, por essa propria fonte, o tipo de conduta que
  a regra tenta cobrir. As duas frases acima sao plausiveis na boca de um SDR
  querendo "aquecer" o relacionamento fora do 99Freelas sem citar a palavra
  errada.
- Nao encontrei nenhum teste, em `__tests__/marketplaces/99freelas.test.ts`
  nem em `__tests__/celula/`, que exercite "me segue no insta" ou "meu perfil
  no linkedin" — nem para provar que barra, nem para provar que nao barra.
  Nao ha parecer formal do `seguranca` sobre esta mudanca especifica em
  `docs/plataformas/99freelas/pareceres/` (os dois pareceres la sao de
  07/08 e 30/08, sobre outros temas) — so o comentario no codigo-fonte.
- **Veredito da minha leitura independente:** o afrouxamento resolve o falso
  positivo real (12 posts para Instagram), mas troca uma regua larga demais
  por uma regua estreita demais numa tacada so — sem cobrir o meio-termo
  ("me segue", "meu perfil no [rede social]"). Nao e decisao minha corrigir;
  e fato para o CEO decidir se aceita o risco residual ou pede um padrao
  especifico para "direcionar o cliente a seguir/checar perfil fora da
  plataforma", com fonte.

### 2. O fail-closed dos 22 modelos vazios esta mesmo fechado?

**Sim, por DOIS mecanismos independentes — confirmado, sem caminho encontrado
que fure.**
- Em `lerModelo` (`biblioteca.ts:140-146`): `textoBase` vazio so e aceito se
  houver `pendencia` — os 22 tem pendencia, entao entram na biblioteca como
  estruturalmente validos (mas NAO aprovados: `estado: "rascunho"`).
- Em `modeloParaEnvio` (`biblioteca.ts:354-360`): barra qualquer
  `estado !== "aprovado"`, incluindo os 22.
- Unico caminho que eu procurei e que NAO passa por `modeloParaEnvio`: chamar
  `preencher(modelo, variaveis)` (`biblioteca.ts:378`) direto, com um objeto
  de modelo montado a mao em vez de vindo da biblioteca — essa funcao NAO
  confere `estado`. Hoje, dentro do escopo desta onda, o unico chamador de
  `preencher` e `proxima-mensagem.ts:364`, e ele so chega la depois de
  `modeloParaEnvio` ja ter aprovado o modelo (`:320-329`). Nao achei nenhum
  caminho executavel hoje que fure o fail-closed.
- Registro como RISCO DE DESENHO, nao como furo: `preencher` sozinho confia
  em quem chama; se uma onda futura chamar `preencher` sem passar por
  `modeloParaEnvio` antes, a barreira de estado desaparece silenciosamente
  (com `textoBase` vazio e sem variavel obrigatoria, `preencher` devolveria
  `{ok: true, texto: ""}` — um envio de string vazia). Vale um teste de
  "prende o contrato" (`preencher` nao deveria aceitar modelo fora de
  `aprovado`, OU esta invariante devia estar documentada como
  responsabilidade exclusiva de quem chama, com teste que prove isso).

## Onde a regua esta larga demais (risco de falso positivo, a pedido da ficha)

- `verificarContradicao` (`trava-de-conversa.ts:268-380`): a regua E estreita
  de proposito (so compara valor unico de R$, prazo via `extrairPrazo`, e uma
  lista curta e fechada de 5 servicos com verbos explicitos de
  inclusao/exclusao) — nao achei caso plausivel de falso positivo na leitura,
  e ha teste de "valores ambiguos nao disparam"
  (`trava-de-conversa.test.ts:192`). Sem achado aqui.
- `promessasDeData` (`compromisso.ts:117-135`): tambem estreita de proposito,
  com testes explicitos das 3 exclusoes (data do cliente, prazo em terceira
  pessoa, passado) em `trava-de-promessa.test.ts:69,74,78`. Sem achado aqui.
- Conferi tambem a regua nova de `pag(?:ar|amento|o|a)\s+por\s+fora`
  (`conformidade.ts:118`): como exige literalmente "por fora" na sequencia,
  um uso comum como "post pago" (anuncio patrocinado, termo normal de trafego
  pago) NAO dispara por engano. Nao e achado.

## Onde um `motivo` nao diz o que fazer a seguir

Nao achei nenhum. Toda reprovacao lida (`objecoes.ts`, `compromisso.ts`,
`trava-de-conversa.ts`, `anti-generico.ts`, `biblioteca.ts`,
`proxima-mensagem.ts`) devolve motivo em portugues com o proximo passo (o que
confirmar, o que registrar, quem escalar). Consistente com a lei 7 do dominio.

## Onde `estado`/`etapa` esta escrito a mao em vez de vir de um tipo

- `VereditoDaTrava.causa` (`trava-de-conversa.ts:101-108`) e
  `DecisaoDaProximaMensagem` (`proxima-mensagem.ts:105-109`) usam union
  literal de string, nao um enum/tipo compartilhado — mas sao unions
  FECHADOS e exaustivos no proprio arquivo, entao o TypeScript pega
  divergencia em tempo de build. Nao e o "escrito a mao sem tipo" que a
  pergunta teme.
- Achei UM ponto solto: `etapa: "guardiao"` em `proxima-mensagem.ts` (a nova
  etapa do bloco G2) nao esta adicionada a nenhuma uniao de tipo de `etapa`
  — o campo `etapa` em `DecisaoDaProximaMensagem` e `string` livre (`:108`),
  entao "guardiao" nem precisa estar declarado em lugar nenhum para compilar.
  Isto e o padrao ja usado por TODAS as etapas ("preencher_modelo",
  "duplicidade", "contradicao"...), entao nao e regressao desta rodada — e
  uma folga de tipo que ja existia, e cabe registrar porque a pergunta pediu.

## Registro de oficina

- Referencias lidas: `H-laudo-de-qualidade.md`, `COMUM.md`,
  `mutacao-onda-2.md`, os 8 arquivos de `lib/agency/celula/mensagens/`, os 8
  arquivos de `__tests__/celula/` da Onda 2 (ignorando `funil.test.ts`,
  `trilha-*.test.ts`, `excecoes/*`, conforme instruido),
  `lib/marketplaces/99freelas/conformidade.ts` e seu diff contra `01bd7a2`,
  `docs/plataformas/99freelas/mensagens.json`,
  `docs/plataformas/99freelas/policy.json`,
  `docs/plataformas/99freelas/pareceres/`, `git status --short`, `git diff`
  dos arquivos modificados, e o despacho
  `G2-o-guardiao-do-motor-nao-tem-teste.md` — achado por leitura do
  diretorio, nao citado na ficha H.
- Achado que a propria ficha H nao sabia: o G2 (mutacao do motor achando o
  Guardiao furado, conserto escrito mas nao commitado/nao confirmado). Isto
  muda o veredito de "quase pronto" para "nao passa hoje, por um motivo
  especifico e pequeno de fechar": rodar o portao + a mutacao no estado atual
  da arvore de trabalho, registrar o resultado, e commitar.

## O que exige decisao do CEO (ou do PM, nao minha)

- Decidir se o conserto do bloco G2 (nao commitado) deve ser rodado no
  portao e commitado antes de qualquer promocao da Onda 2 — recomendo que
  sim, e o criterio 7 do proprio CEO.
- Decidir se o gap de "me segue no insta" / "meu perfil no linkedin" e risco
  aceitavel ou precisa de um padrao novo com fonte, no Guardiao de conteudo.
- Decidir se `preencher()` deve passar a conferir `estado` por conta propria
  (defesa em profundidade) ou se a responsabilidade de checar `estado` antes
  de chamar `preencher()` fica formalmente documentada como contrato de quem
  chama, com teste que prove a invariante.

## Proposta de vitrine (para o PM avaliar promocao)

- O padrao do arquivo `mutacao-onda-2.md` — registrar a mutacao que
  CONTINUOU verde, investiga-la e explicar por que era redundante (nao
  decorativa) em vez de apaga-la, e o oposto do que geralmente se ve. Vale
  como exemplo de proveniencia de mutacao para o `dioli-brain-kit`
  (`docs/06-incidentes.md`), citando este caso como origem.
