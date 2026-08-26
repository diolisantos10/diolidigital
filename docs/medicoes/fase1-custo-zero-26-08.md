# Fase 1 — a lista de graça, zerada

> 26/08/2026. Ordem do CEO: *"vai rodando trezentos testes que não gastam nos
> itens que não gastam"*. **Custo: US$ 0,00.** Nenhuma chamada de IA, nenhuma
> chamada à Meta, nenhuma publicação, nenhuma mensagem a pessoa real. As duas
> propostas reais paradas há dez dias continuam intocadas.
>
> Linha de base: `e3a1a43` no ar, 482 arquivos / 6.745 testes.
> Fecho: **488 arquivos / 6.802 testes**, verdes — **6 arquivos e 57 testes novos**.

---

## 1. A lista, item por item

| # | item | estado |
|---|---|---|
| 1 | a barra do portal que regredia | ✅ zerado — **e a prova achou 2 defeitos novos** |
| 2 | o contrato do gerador na refação | ✅ zerado (já fechado; exercitado por mutação nas duas pontas) |
| 3 | conferência do arquivo em feed e carrossel | ✅ **medido** — e catraca nova sobre a prosa |
| 4 | a régua nova reprovando peça quebrada | ✅ zerado + **1 dívida medida e declarada** |
| 5 | a fala em segunda pessoa do SDR | ✅ zerado — caminho exercitado de propósito |
| 6 | a cortesia da retratação | ✅ zerado — pela rota, não pelo arquivo-fonte |
| 7 | ninguém empurra no branch de deploy | ⚠️ trava local instalada; **a de servidor não deu** |
| 8 | a trava do preço | ✅ **já era teste, não alarme** — conferido por mutação |
| 9 | `tsc --noEmit` como catraca | ✅ zerado — **e ela já pegou o próprio autor** |
| 10 | modos Básico/Avançado do Portal | ✅ medido e declarado, **não construído** |
| 11 | varredura larga | ✅ 3 rotas de zero teste, cobertas |

---

## 2. Quem estava certo (item 3)

Dois auditores discordaram sobre `PRODUTOS_CANONICOS`. **Medido: o segundo
estava certo.** São dois produtos (story e feed), o feed declara `produtoId`,
passa pela corrente visual e pela conferência dos bytes, e o desvio de
`producao-de-pedido.ts` é por PRESENÇA de produto (`if (produto)`), nunca por id.

O que **nenhum dos dois** tinha medido: cinco atendimentos entregam PEÇA, têm
PREÇO e não passam pela conferência. Três se defendem por escrito — *"a venda
já está fechada pela régua de capacidade"*. **Prosa não fecha venda.** A
catraca nova confere a frase contra `conferirOferta`, atendimento por
atendimento, com uma exceção nomeada: quem não entrega ARQUIVO (pacote do mês
é agenda; tráfego é campanha pausada).

---

## 3. Os cinco defeitos novos

### 🔴 1. A barra caía de 63% para 50% — o conserto da 10ª volta era parcial

O piso derivado dos carimbos cobria os carimbos e **parava neles**. O degrau
`revisao_interna` (63%) não saía de carimbo nenhum: saía de CONTAGEM
(`tarefas.entregues === tarefas.total`, ou `execucao === "done"`). O **mesmo**
reinício de contêiner que produziu o defeito de 08:55 leva a barra de 63% para
50%, pelo mesmo caminho, sem nada ficar vermelho.

Conserto: `producaoConcluidaEm` — carimbo que **já estava gravado no banco**
(`executionFinishedAt` com `executionError` vazio) e que ninguém lia.

### 🔴 2. A barra caía de 50% para 38% quando o cliente RESPONDIA

O ramo do material devolve **antes** do portão de direção, e `aguardando_cliente`
herdava a posição da PRODUÇÃO. Um projeto sem direção aprovada lia 50% só por
ter pedido aberto; o cliente respondia, o pedido fechava, e a leitura caía para
o portão de direção. **Ele fazia a parte dele e a barra andava para trás.**

Passa a herdar o DESENHO: antes da direção o número é o honesto (25%), e depois
quem segura os 50% é o piso do carimbo — que é o trabalho do piso.

### 🔴 3. O gancho pre-push engolia o código de saída do `conferir`

`npx tsx ... conferir` sem `|| exit 1`: o veredito dele morria na linha
seguinte. **Catraca que não confere o código de saída é catraca que aprova
tudo.**

### 🔴 4. `meta-ativos` — a rota do pior incidente, sem uma régua

06/08/2026: um clique no portal e a agência passou a alcançar 14 contas de
anúncio e as contas pessoais do CEO. A rota que nasceu desse incidente tinha
**zero testes**. As três regras do cabeçalho dela agora são exercitadas uma a
uma — derivação pelo token nos três verbos, "conecte primeiro" que não vira
lista vazia mentirosa, e allowlist de tipo no DELETE.

### 🔴 5. `conectar-meta` — a segurança morava num argumento

`tokenDoPortal(request)`, com UM argumento. Quase toda rota do portal passa
DOIS (`?token=` por compatibilidade). Aqui não se passa, e o motivo é o que
esta ponte faz: ela **põe o token na URL** do redirect. Com dois argumentos, um
link `?token=<token alheio>` abriria a conexão da Meta em nome de outra pessoa.
**A diferença entre seguro e furado era um argumento, e nada a guardava.**

---

## 4. As duas dívidas — medidas, declaradas, não escondidas

### O degradê passa pela régua da peça final

`regua-da-peca-final.ts` promete, por escrito, pegar *"o degradê da cor da
marca"*. **Medido: não pega.** Um degradê suave de faixa larga passa pelos
quatro critérios:

| | cores | dominante | textura |
|---|---|---|---|
| peça REAL guardada | 442 | 0,10 | 0,0066 (pior das 12) |
| **degradê** | 46 | 0,044 | **0,0033** |
| pisos | 24 | 0,90 (teto) | 0,0015 |

**Não foi consertado, e o motivo tem número.** A separação boa/degradê é de
**2×**, contra as ordens de grandeza que sustentam os outros critérios (163
cores contra 1). O próprio arquivo já escreve o que acontece com piso rente ao
caso conhecido: *"reprova a próxima peça legítima e acaba desligado por quem
não sabe o que ela protege."*

E há a razão mais dura: **das 12 peças vivas que calibraram os pisos, esta
árvore guarda uma.** Calibrar piso sobre amostra de um é exatamente como se
inventa régua que reprova a casa inteira.

O teste **congela a fronteira com número** e avisa dos dois lados: se alguém
apertar o piso, ele diz de que lado o degradê caiu; se a dívida for paga, ele
fica vermelho cobrando que o degradê volte para a lista de mutantes.

### A proteção de branch não foi instalada

É a única trava de servidor de verdade — exigir PR + o check `quality` para
escrever na branch de deploy. **Esta sessão não tem como instalá-la:** não há
`gh` no ambiente e o conector do GitHub não expõe a API de proteção de branch.
**É trabalho do dono do repositório.**

Instalado no lugar, e declarado como o que é:

* o gancho `pre-push` — barra ANTES, e é furável com `--no-verify` ou por quem
  empurra pela web do GitHub;
* `push-direto-na-branch-de-deploy.yml` — pergunta ao GitHub se o commit tem PR
  associado e grita se não tiver. **É alarme, não trava:** quando ele roda, o
  push já aconteceu. O que ele mata é o silêncio, que é o que fez o furo de
  antes não ter dono.

---

## 5. O buraco do item 10, medido

Varredura por `básico`/`basico`/`avançado`/`avancado`/`modoBasico`/`modoAvancado`
em `app/`, `lib/`, `components/`, `docs/`, `BACKLOG.md`, `HANDOFF.md`,
`CLAUDE.md`: **zero** ocorrências que sejam o Portal.

O buraco **não é implementação faltando: é especificação que não existe.**
Detalhe e as três perguntas ao CEO em `docs/medicoes/modos-do-portal-medicao-fase1.md`.

---

## 6. A varredura larga (item 11)

Referências em `__tests__/` por rota de `app/api/portal/`:

```
approvals 10 · pedidos 10 · messages 7 · projetos 7 · esteira 5 · marca 4 ·
briefing 4 · vista 3 · transcrição 3 · materiais 3 · conexões 2 · sessão 1 ·
drive 1 · métricas 0 · conectar-meta 0 · meta-ativos 0
```

As três de zero são **o que o cliente vê** e **o que dá acesso a conta de
anúncio** — a prioridade que a ordem mandou. As três estão cobertas.

---

## 7. Custo

**US$ 0,00.** Nenhuma chamada de IA foi feita — os caminhos do SDR foram
exercitados com o modelo DUBLADO, dito para devolver justamente a frase errada,
que é o único jeito de ver o guarda trabalhar. Nenhuma chamada à Meta: a camada
de leitura é dublê nos três arquivos novos do portal. Nenhuma imagem nasceu: os
mutantes da peça final derivam, por transformação local, do arquivo real já
guardado no repositório.

---

## 8. O que fica para a Fase 2 — a única rodada paga

Uma volta só, que exercite tudo:

1. **a fila de imagem**, de verdade: uma imagem nascendo e o escorregamento
   OpenAI → Gemini medido no ar;
2. **a refação com peça na mão** — o contrato do gerador exercitado contra o
   modelo, não contra o esquema;
3. **a conferência dos bytes** de uma peça real recém-nascida;
4. **as 12 peças reais de volta na árvore**, para recalibrar a régua da peça
   final e pagar a dívida do degradê;
5. a jornada de **aprovar · ajustar · recusar · cancelar** com peça na mão;
6. **a fala do SDR contra o modelo de verdade** — aqui o GUARDA foi provado; a
   obediência do modelo, não. São perguntas diferentes.

E duas que não dependem de dinheiro, e sim do CEO:

* **proteção de branch** no GitHub (item 7);
* **as três perguntas** dos modos do Portal (item 10).
