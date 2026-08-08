# Oficina — experiencia

> Append-only. O agente escreve aqui. Ao virar o mês, vira `oficina/AAAA-MM.md`.

## 2026-08-07 — sala criada

Sala aberta pelo PM na divisão do elenco (doutrina 21 do `dioli-brain-kit`).
Nenhuma entrada de trabalho ainda: **não medido**, e não zero.

---

## 2026-08-08 — auditoria de percurso do portal do cliente e do painel da agência

**Pedido:** o CEO chamou o painel dos clientes de *"uma coisa tenebrosa"* —
*"uma coisa não conversa com a outra, muita coisa misturada"* — e cobrou dois
requisitos: a imagem da agência está em jogo, e tem que ser **muito fácil**
porque quem usa não é de tecnologia.

**Relatório:** [`2026-08-08-portal-do-cliente.md`](2026-08-08-portal-do-cliente.md)
· somente leitura, nenhum arquivo de código tocado.

### O que eu esperava achar, e não achei

O portal está **melhor do que a fama**. As correções de 07 e 08/08 fecharam os
defeitos caros de verdade: card sem corpo não recebe botão de decisão nas duas
telas (`AprovacoesDoCliente.tsx:299`, `:369`), o card do pacote passou a ser
medido no servidor (`lib/agency/esteira/pacote.ts`), ausência benigna deixou de
virar erro inventado (`EsteiraDoCliente.tsx:106-120`), e o texto de conexão que
distingue *"você resolve"* de *"a Dioli resolve"* (`page.tsx:1481-1495`) é o
melhor texto do produto inteiro. **A redução de 7 para 5 abas resolveu — não
escondeu:** nada foi apagado, os endereços antigos continuam chegando
(`SECAO_DO_DESTINO`), e os dois assuntos que saíram da barra viraram bloco e
seção rotulada.

### O que eu achei, em ordem de gravidade

1. **O painel da agência é o problema, não o portal.** `/agency/dashboard` e
   `/agency/pipeline` leem o `localStorage` do navegador
   (`store/agency-store.ts:1854`), não o banco. `moveProjectStage`
   (`:1215-1226`) não chama API nenhuma — arrastar um projeto de etapa não sai
   daquele navegador. É literalmente "uma coisa não conversa com a outra", e o
   selo "DB / Local" em `/agency/deliverables` é a casa admitindo isso na tela.

2. **Quatro leituras independentes de "em que etapa estamos"** — `lerFase`,
   `etapaLegivel` (`api/portal/projetos:30-38`), `trilhaDoProjetoDireto`
   (`api/portal/esteira:51-87`) e `STATUS_LABEL` (`page.tsx:181-187`). Até três
   podem aparecer juntas na tela do cliente. O cursograma exige uma.

3. **Três interruptores de dois lados no portal:** material enviado (a tela diz
   "recebemos" e descarta o `aindaFaltam` que a rota já devolve,
   `api/media/route.ts:215` × `EnvioDeMaterial.tsx:271`), Meta conectada com zero
   ativos autorizados, e "aprovado por você" sem dizer o que falta para ir ao ar.

4. **14 controles que mentem**, listados um a um no relatório. Os dois que mais
   me incomodam: `progresso ?? 0` escrevendo **"0% do caminho até a entrega"**
   quando a resposta é "não medido" (`EsteiraDoCliente.tsx:272`) — o defeito
   exato que a vitrine desta sala já registra — e o **ponto verde de "online"**
   fixo no chat e no botão flutuante, sem nada medindo presença.

5. **Repetição, e é ela que produz o "totalmente perdido".** Um pedido de
   material aparece **quatro vezes** na mesma sessão; uma decisão pendente é
   anunciada **quatro vezes**. Nenhuma dessas telas é feia — é por isso que a
   nota de aparência nunca as pegou.

### O achado de método que quero guardar

**O teste de jargão do portal existe, e protege menos de um décimo do que
deveria.** Está em `__tests__/esteira/fases.test.ts:137-150` e cobre exatamente
três strings de uma função (`lerFase → paraCliente`). Não cobre **nenhum**
arquivo de `app/portal/` ou `components/portal/`, não cobre `ap.department` (que
vira o título do card e escapa por `?? ap.department`), não cobre as frases
escritas à mão nas duas rotas do portal, e não impediu a **resposta crua da Meta
em inglês, com código numérico**, de ser renderizada na tela de quem paga
(`ConexoesDoCliente.tsx:436-440`).

A lição, que vale além deste caso: **uma trava que existe é lida como uma trava
que cobre.** O cursograma diz "jargão interno é barrado por teste, não por boa
vontade" — e a frase virou verdade sobre o portal inteiro quando era verdade
sobre uma função. Trava com escopo estreito e reputação larga é pior que trava
nenhuma, porque desliga a desconfiança de quem escreve a próxima frase.

### O passo que proponho eliminar

Como manda o item 4 do meu método, toda saída minha carrega esta linha:
**o painel da esteira em Projetos** (`page.tsx:1183`). É cópia byte-a-byte do
que já está no Início, e é ele que faz as duas abas parecerem a mesma tela.

### Para o PM — proposta de entrada de vitrine

Proponho promover, se o Diretor concordar:

> **Trava de escopo estreito com reputação larga.** Uma verificação que existe é
> lida por todo mundo como uma verificação que cobre. O teste de jargão do portal
> protegia três strings de uma função e era citado como se protegesse o portal
> inteiro — e por baixo dele passaram o nome do departamento, a resposta crua da
> Meta em inglês e as frases escritas à mão de duas rotas. **Toda trava declara o
> que NÃO cobre, no mesmo lugar onde é citada.**
> — origem: auditoria de 08/08/2026, `__tests__/esteira/fases.test.ts:137-150`

E, se ainda não estiver dito com estas palavras:

> **Anunciar também precisa de um lugar só.** A regra "um único lugar para
> decidir" salvou Aprovações. Faltou a irmã dela: um pedido de material aparecia
> em quatro lugares na mesma sessão, e uma decisão pendente, em quatro. Repetir o
> anúncio não reforça — ensina a parar de ler a lista.
> — origem: auditoria de 08/08/2026, percurso a 375px
