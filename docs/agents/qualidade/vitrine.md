# Vitrine — qualidade

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.
> Toda entrada carrega proveniência. Se não couber em duas telas, não é vitrine.

---

## O P0 desta casa: 25 das 32 checagens não têm mecanismo

> **Corrigido em 06/08/2026, na Onda 0.** O número antigo — "28 de 31" — estava
> errado **nas duas direções**, e por isso é caso de estudo, não de errata:
> faltava `projections_anchored`, que existia só na segunda lista da casa
> (`quality-canvas.ts`) e **rodava**; e `quality_audit_impartial` estava
> **construído** e declarado `autoCheckable: false`. Ao mesmo tempo, as "3
> executáveis" não executavam nada — `getBlockingChecks` não tinha chamador.
> **Metadado que descreve código em vez de sair dele mente para os dois lados.**
> Por isso o número agora não é a flag: é `mecanismo`, com caminho de arquivo
> que um teste confere que existe (`__tests__/brain/o-numero-do-p0.test.ts`).

Das **32** checagens de `lib/dioli-brain/quality-gates.ts` — agora o registro
**único** da casa —, **7 têm mecanismo** e **25 declaram lacuna** (motivo, dono e
prazo obrigatórios; o tipo não aceita as duas ausências).

Com revisão humana, isso era um checklist. **Sem revisão humana é decoração** — e
as quatro desligadas que mais importam ("sem alucinação", "respeita a marca",
"corresponde ao briefing", "riscos verificados") são exatamente as falhas que
chegam no cliente.

Os quatro degraus para fechar, e onde estão em 04/08/2026:

| # | Degrau | Estado |
|---|---|---|
| 1 | Piso determinístico — afirmação conferida contra a verdade do cliente | ✅ construído (`lib/agency/execution/leitura-do-cliente.ts`) |
| 2 | LLM-judge para os subjetivos, reprovação bloqueante | 🔴 não existe |
| 3 | Default do registry invertido: sem gate executável = REPROVADO | 🔴 não existe |
| 4 | Escada por departamento — sombra até haver evidência | 🔴 não existe |

**Sem gate = reprovado.** Checagem não executável não protege nada.

— promovido em 2026-08-04 pelo Diretor · origem: `docs/pendencias.md` (P0) e a
onda de 04/08 (commits `22b9c0d` → `0037f75`)

---

## Regra que mede um TRECHO tem de emitir só o TRECHO que mediu

O piso de ancoragem foi **reprovado três vezes pela auditoria adversarial, sempre
pelo mesmo defeito de FORMA, não de regra**: media um segmento do texto e emitia o
segmento inteiro.

*"paleta pastel, tipografia serifada, fundos de mármore"* saía inteiro porque uma
das palavras tinha lastro. **Limiar fracionário = fração de texto inventado
entregue sob o rótulo "observado"** — e o adversário calibra o enchimento na
primeira tentativa: *"padaria de forno de mármore italiano"* tem cobertura 0,5.

Hoje a exigência é **total, pedaço por pedaço**:
`COBERTURA_MINIMA_DE_LASTRO = 1` (`lib/agency/execution/leitura-do-cliente.ts:311`).

**Custo de desfazer:** baixar esse número de volta para uma fração reabre o
caminho de a agência afirmar ao cliente, como fato observado, texto que ele nunca
escreveu. Não é ajuste de sensibilidade — é a diferença entre trava e enfeite.

— promovido em 2026-08-04 pelo Diretor · origem: 3ª auditoria adversarial de
04/08/2026 (commits `0a95cca`, `8298b71`)

---

## Todo teste de trava precisa de um caso em que o ADVERSÁRIO escolhe a formatação

O teste do piso passava **porque o próprio teste escrevia as vírgulas** que
separavam os termos — vírgulas que o modelo, na vida real, não escreve. O teste
media um mundo que ele mesmo tinha arrumado.

Pior: **duas vezes o teste foi ajustado para baixo do bug**. Ajustar a expectativa
até o verde é apagar o defeito do relatório, não corrigi-lo.

**Regra:** toda trava tem no mínimo um caso em que a entrada vem no formato que o
atacante (ou o modelo desleixado) escolheria — sem separadores, tudo colado, com
acento faltando, em maiúsculas.

— promovido em 2026-08-04 pelo Diretor · origem: 2ª e 3ª auditorias de 04/08/2026

---

## Frase de guarda no fim de um texto que será truncado é frase que some

A ressalva mora no fim porque é ali que ela se lê. **O corte para caber num limite
também começa pelo fim** — então ele come exatamente a ressalva.

Aconteceu **duas vezes no mesmo dia, em arquivos diferentes**: de manhã em
`blocoComGuarda` (`lib/agency/execution/leitura-do-cliente.ts:665`) e à tarde em
`trechoComRessalva` (`lib/agency/esteira/mes.ts:284`) — ali, a ressalva do
relatório era cortada da mensagem que ia ao cliente. O documento interno avisava;
o cliente não era avisado.

**Quem trunca reserva o espaço da guarda antes de cortar o corpo.**

> Subiu como proposta de regra de companhia ao Diretor Geral do Cérebro — a lição
> não atravessou o corredor sozinha. Ver `docs/decisoes.md`.

— promovido em 2026-08-04 pelo Diretor · origem: as ondas da manhã e da tarde de
04/08/2026 (commits `571e4f8`, `0037f75`)

---

## Telemetria de trava é parte da trava

O log do piso de ancoragem **descrevia a regra antiga** depois que a regra mudou.
Um operador lendo aquele log auditaria com confiança um mecanismo que não existia
mais.

Log de trava não é enfeite de depuração: é o único jeito de alguém de fora
confirmar que a trava está fazendo o que diz. Mudou a régua, muda o que ela
publica (`lib/agency/execution/leitura-do-cliente.ts:515`).

— promovido em 2026-08-04 pelo Diretor · origem: 2ª auditoria de 04/08/2026

---

## Assimetria deliberada entre AFIRMAR e NEGAR

Derrubar uma afirmação negativa pode usar régua mais frouxa do que autorizar uma
positiva. **Isso não é inconsistência — é o custo do erro sendo diferente nos dois
sentidos.**

Descartar um termo verdadeiro produz uma lacuna honesta ("não consegui observar
isto"). Aprovar um termo falso produz uma mentira entregue ao cliente com selo de
observação. O piso erra de propósito para o lado da lacuna
(`leitura-do-cliente.ts:335`).

Quem for "harmonizar os limiares" está prestes a desfazer uma escolha, não uma
inconsistência.

— promovido em 2026-08-04 pelo Diretor · origem: auditoria de 04/08/2026

---

## ⚠️ A trava confere PALAVRA, não FRASE — o buraco que fica aberto

O piso garante que cada palavra veio do texto real do cliente. **Ele não impede a
recombinação.** "bancada de mármore" + "bolo rosa" → *"bancada de mármore rosa"*
sai como observado, com todas as palavras verdadeiras e o fato falso.

**Fechar isso depende do LLM-judge que não existe** (degrau 2 do P0).

**Contenção barata já nomeada pela auditoria:** parar de rotular *composição* como
"observado" — o mesmo tratamento que o `tom` já recebe hoje
(`leitura-do-cliente.ts:739`, onde tom é declarado como hipótese porque é
interpretação, não observação).

**E o preço do rigor está do outro lado:** o tamanho mínimo de palavra é 5
(`leitura-do-cliente.ts:291`), então "bolo", "pão", "café" e "doce" no singular
não casam com o plural — e sob exigência total um pedaço derruba o termo inteiro.
O piloto vai dizer "não consegui observar o estilo" com frequência alta. Correção
nomeada e de baixo risco: **baixar para 4 — não para 3**, senão "coros" ancoraria
"cor".

— promovido em 2026-08-04 pelo Diretor · origem: 4ª auditoria de 04/08/2026
(commit `0037f75`)
