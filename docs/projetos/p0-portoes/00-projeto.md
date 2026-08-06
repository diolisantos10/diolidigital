# P0 — Os portões: projeto

> Auditoria do agente de qualidade, 06/08/2026, contra o CÓDIGO e não contra a
> prosa dos documentos. Registrado pelo Diretor.

## Conclusão em 5 bullets

- **O número "28 de 31" era otimista. O correto é 31 de 31.** As três checagens
  marcadas `autoCheckable: true` também não rodam: `lib/dioli-brain/quality-gates.ts`
  é importado por **dois** lugares — uma tela (`app/agency/brain/page.tsx:12`) e o
  teste que conta o P0. `getBlockingChecks` (`quality-gates.ts:298`) **não tem
  chamador**. O registry não barra nada; desenha uma lista numa página.
- **O que protege o cliente hoje são dois mecanismos que não estão nesse registry**
  — o piso determinístico (`run-execution.ts:567`) e o juiz LLM (`:620`). Os dois
  são bons. Nenhum sabe que as 31 existem.
- **O portão de Design teria APROVADO as 36 telas idênticas, com nota máxima.**
  `design_visual_consistency` (`quality-gates.ts:164`) **premia igualdade**. Não
  existe nenhuma medida de dispersão em lugar nenhum do repositório. A checagem que
  faltava não está desligada: **não existe**.
- **O default já é fail-closed no avaliador certo — e para no meio.**
  `quality-canvas.ts:227`: bloqueante não verificado vira `WARNING`, deveria ser
  `BLOCKED`.
- **16 das 31 são código puro, e 6 dessas já estão construídas** — só não foram
  declaradas. A primeira onda é fiação, não invenção.

## O achado que reordena tudo: três sistemas, e o do P0 está desligado

| Sistema | Onde | Roda em quê | Barra? |
|---|---|---|---|
| Registry das 31 | `lib/dioli-brain/quality-gates.ts` | nada | **NÃO** |
| Avaliador de canvas | `quality-canvas.ts:194` | canvases do Brain | sim, mas fora do caminho da entrega |
| Caminho da entrega | `run-execution.ts:567` e `:620` | a peça que vai ao cliente | **SIM** — é o que existe de verdade |

**Deriva de registry:** o avaliador que roda tem a própria lista de 8 globais
(`quality-canvas.ts:145`) e os ids **não batem** com os do registry —
`clear_client_value` vs `client_value_clear`, `approval_need_checked` vs
`approval_verified`, e `projections_anchored` que só existe num dos dois.

> Registry que ninguém consulta e cujos ids divergem do avaliador não é portão
> desligado: é **um segundo documento se passando por código**.

## As 31, por classe

| Classe | Quantas | Quais |
|---|---|---|
| **(a) determinística** | 16 | 1, 6, 7, 8, 11, 12, 15, 17, 18, 21, 22, 25, 26, 28, 30, 31 |
| **(b) LLM-judge** | 10 | 2, 3, 4, 10, 13, 14, 16, 23, 24, 29 |
| **(c) medida nova** | 3 | 9, 19, 20 — **mais `design_dispersao_minima`, que não existe** |
| **(d) impossível como está escrita** | 2 | 5 (risco "endereçado") e 27 (dependências "mapeadas") |

As duas (d) exigem provar que um conjunto está **completo**, sem registro contra
o qual conferir. Voltam decompostas ou não voltam — **checagem que promete
completude e entrega amostra é a família da frase fixa de 06/08.**

**O retrato do P0 em uma linha:** `quality_audit_impartial` (#30) **está
construído** (`quality-auditor.ts:78`) e declarado `autoCheckable: false`;
`pm_task_owner` e `pm_deadline` estão declarados `true` e não têm leitor. **A
flag está errada nas duas direções.**

## Ordem de implementação

**O critério não é meu — está no código, na voz do CEO**
(`piso-de-verdade.ts:250`): *"quem revisa é o cliente. Ele julga muito bem o que
enxerga — gosto, marca, tom. E não tem como julgar o que não consegue conferir."*
**O que o cliente não consegue revisar sozinho vem primeiro.**

| Onda | O quê | Por quê |
|---|---|---|
| **0** | Fundir os dois registries e ligá-lo ao caminho da entrega | enquanto as 31 forem enfeite, marcar `autoCheckable: true` não muda um bit do que chega ao cliente |
| **1** | Inverter o default (`quality-canvas.ts:227`) | construir portão com default aberto é construir o defeito junto |
| **2** | As 6 (a) já construídas: 1, 11, 12, 22, 30, 31 | dado inventado e promessa de resultado são o dano **irreversível e jurídico** |
| **3** | `design_dispersao_minima` (nova) | é a única falha desta lista **já ocorrida e devolvida duas vezes** |
| **4** | As 10 (a) restantes | código puro, sem dependência de provedor |
| **5** | LLM-judge para as 10 (b) | custa por peça, e aqui o cliente é um segundo revisor real |
| **6** | (c) restantes e decomposição das (d) | exigem estrutura de dados nova |

## O default invertido — e o que ele quebra

O mecanismo: **registry único com `runner` obrigatório**, ou `semMecanismo:
{motivo, dono, prazo}` declarado. O tipo não permite as duas ausências.
Departamento sem entrada = `BLOCKED`. Checagem que estoura, dá timeout ou devolve
`undefined` é `UNVERIFIED`, e `UNVERIFIED` bloqueante **barra**.

**No dia 1, oito de oito departamentos param** — nenhum tem gate executável ligado
à entrega. Por isso **a inversão não entra sozinha**: entra com a escada, e todo
departamento nasce em SOMBRA, onde o `BLOCKED` é registrado e não barra. O
relatório de "quantas peças teriam sido barradas" é a evidência que autoriza subir.

Sem escada, isto desliga a agência num commit.

## O juiz: reprovação bloqueia, indisponibilidade não

**Já existe e está certo** (`quality-auditor.ts`). Três estados — `aprovado`,
`reprovado`, `nao_auditado` — e a distinção nunca é feita por `!== "reprovado"`,
que é como "ninguém olhou" volta a contar como aprovado com outra roupa. Veredito
ilegível vira `resposta_invalida`, não `pass`. E a degradação é **assimétrica**:
se o árbitro acabou sendo o próprio autor, a reprovação vale (um problema
apontado é um problema) e a aprovação vira `nao_auditado`.

**O que falta:** o juiz não emite veredito **por checagem**, então não alimenta o
registry; e `nao_auditado` precisa de teto — indisponibilidade não pode parar a
operação, mas indisponibilidade **crônica** é fail-open com cara de resiliência.

## A escada

`department-maturity.ts` já existe, mas mede **construção**, não **permissão de
publicar**. E usa `qualityGatePassRate ≥ 70%` — limiar fracionário, proibido
abaixo. São escadas diferentes e não se confundem.

| Degrau | Pode | Portão | Evidência para subir |
|---|---|---|---|
| **SOMBRA** | produz; nada sai sem o Diretor | registra, não barra | ≥30 entregas medidas · zero falso negativo · **e a taxa de falso positivo medida** |
| **ALLOWLIST** | sai sozinho para clientes nomeados | barra de verdade | ≥100 sem incidente que chegue ao cliente |
| **WIDE** | sai para todos | barra | decisão do CEO registrada em `docs/decisoes.md` |

**Descer é automático; subir é decisão.** Incidente que chega ao cliente devolve o
departamento a SOMBRA no ato. Sombra é obrigatória **inclusive para quem já
produz** — Social e Design entregam hoje e nunca foram medidos.

## O que NÃO fazer

- **Não marcar `autoCheckable: true` sem runner.** Metadado que descreve código em
  vez de sair dele envelhece igual à frase fixa de 06/08.
- **Não conferir por prompt.** *"Um LLM julgando outro LLM tem o mesmo ponto cego
  dos dois"* (`piso-de-verdade.ts:7`).
- **Não usar limiar fracionário.** Fração de exigência é fração de invenção
  entregue sob rótulo de verificado. "≥60% das telas diferentes" autoriza 40%
  idênticas.
- **Não deixar o teste alimentar o próprio teste.** O teste do piso passava porque
  ele mesmo escrevia as vírgulas que o modelo não escreve.
- **Não ajustar a expectativa até o verde** — é apagar o defeito do relatório.
- **Não esquecer a metade que prova que o legítimo passa.** Portão de dispersão
  rigoroso demais reprova o carrossel que **deve** ter identidade visual, e alarme
  falso recorrente treina o time a ignorar o alarme.
- **Não medir dispersão por hash.** Um pixel de diferença muda o hash e não muda
  nada para o olho. A métrica é perceptual, e o corpus de teste já existe: as 36
  telas de 06/08.
- **Não criar um segundo juiz.** Duplicar o mecanismo duplica o defeito.

## O que a auditoria NÃO conferiu (declarado)

Leu 1–902 de 1300 linhas de `piso-de-verdade.ts`; **não executou a suíte**; **não
abriu as 36 imagens** — a afirmação de que eram visualmente idênticas vem do
enunciado do CEO e de `docs/pendencias.md`, não de medição; não mediu o custo por
peça do LLM-judge.
