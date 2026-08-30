# FICHA E2 — CONSERTO: a pergunta ficou com DOIS textos

Você escreveu `lib/agency/celula/mensagens/perguntas-por-servico.ts` e
`docs/plataformas/99freelas/perguntas-por-servico.json`. O PM rodou o portão:
**19 dos seus 73 testes estão VERMELHOS.**

E eles estão vermelhos pelo motivo CERTO. Você mesmo escreveu a régua na sua
suíte — *"oQueColhe é idêntico a `O_QUE_A_PERGUNTA_DE_IA_COLHE` quando o id
existe lá"* — e o seu JSON não a cumpre. **O teste está certo; o dado está
errado.** É exatamente o defeito que a ficha mandou evitar: a mesma pergunta
com dois textos em dois arquivos é a mesma pergunta feita duas vezes, e é isso
que a trava de conversa existe para impedir.

## O QUE CONSERTAR — o dado, não o teste
Para todo `id` que já existe em `lib/agency/comercial/pergunta-repetida.ts`:
- `oQueColhe` deve ser **literalmente** `O_QUE_A_PERGUNTA_DE_IA_COLHE[id]`;
- `comoSePergunta` deve ser **literalmente** `COMO_SE_PERGUNTA_AO_CLIENTE[id]`
  (ou a fala exata de `PERGUNTAS_DA_FILA`, quando for esse o caso do teste).
Ids afetados, pelos testes: `objetivo`, `modalidade`, `canais_sociais`,
`material_pronto`, `prazo`, `publico_alvo`, `concorrentes`, `budget_range`.

## ⚠️ A EXCEÇÃO QUE VOCÊ MESMO ACHOU, E ELA É BOA
`COMO_SE_PERGUNTA_AO_CLIENTE.canal_de_contato` cita WhatsApp/e-mail e por isso
**violaria o Guardião** no 99Freelas — os Termos proíbem dado de contato antes
da garantia de pagamento. Você acertou em não usar esse id.
O que está errado é só o **teste**, que hoje exige a régua e ao mesmo tempo
espera `/e-?mail|whats/` no texto que você não usa. Reescreva ESSE teste para
o que ele realmente quer provar: **`canal_de_contato` não aparece em nenhuma
pergunta desta biblioteca, e o motivo está escrito no arquivo com a fonte**
(`docs/plataformas/99freelas/policy.json`, `proibicoes_de_conteudo.dado_de_contato`).
Deixe o porquê num comentário — daqui a três meses ninguém lembra.

## ⛔ O QUE NÃO FAZER
- **Não afrouxe nenhum dos outros 18 testes para eles ficarem verdes.** Conserte
  o JSON. Teste afrouxado para caber no dado é a trava desligada.
- Não toque em `lib/agency/comercial/pergunta-repetida.ts` — ele é a fonte, e é
  de outra frente.
- Não toque em nenhum arquivo fora dos seus dois + o seu teste.

## NOTA OPERACIONAL (sua, e ela vale)
Você relatou que o Bash bloqueou heredoc com `{` + aspas e `sed -i` dentro de
`docs/plataformas/99freelas/`, e que contornou com placeholder `@Q@` e `mv`.
Use o mesmo contorno. **Confira o arquivo depois de escrever** — `replace` sem
`assert` não é conserto, é esperança: um script que imprime "ok" está falando
do script, não do arquivo.

## ARQUIVOS QUE SÃO SEUS (e só eles)
- `docs/plataformas/99freelas/perguntas-por-servico.json`
- `lib/agency/celula/mensagens/perguntas-por-servico.ts`
- `__tests__/celula/perguntas-por-servico.test.ts`
Você não roda npm/npx/node/git — o PM roda o portão.
