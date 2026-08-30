# FICHA DE DESPACHO — relatório de mutação da Onda 1 · especialista `seguranca`

**NÃO rode `npm`/`npx`/`git`** — eu (PM) já rodei tudo. Você redige a evidência e
audita uma trava. Não conserte código: se achar defeito, **reporte** e eu despacho
o conserto.

## ENTREGÁVEL 1 — `docs/celula-prospeccao/mutacao-onda-1.md`

**A fonte é `docs/celula-prospeccao/mutacao-onda-1.json`**, gerado por
`scripts/mutacao-onda-1.mjs`, que eu rodei em 30/08/2026. Leia os dois. **Não
invente número nenhum: tudo que entrar no relatório sai desse JSON ou do script.**

O que o JSON contém: para cada guarda, o arquivo mutado, o trecho exato trocado
(`de`/`para`), o estado (`VERMELHO` / `SEGUIU_VERDE`) e a lista de testes que
caíram.

Números medidos, para você conferir contra o JSON e não repetir de memória:
linha de base **38 testes verdes**; **9 guardas mutadas**; **9 ficaram
vermelhas**; **0 seguiram verdes**.

O relatório precisa ter:

1. **Por que este documento existe**, em duas frases: guarda sem mutação rodada é
   promessa escrita, e promessa escrita já falhou nesta casa seis vezes em dois
   dias. Trava, não aviso.
2. **Como a mutação foi rodada**, e por que ela é confiável: o script afrouxa um
   trecho por vez, confere no DISCO que a mutação entrou (`replace` sem `assert`
   não é conserto, é esperança), roda os testes, **restaura em `finally`** e
   confere byte a byte que o arquivo voltou ao original. A linha de base é
   checada verde ANTES da primeira mutação — mutação sobre suíte vermelha não
   prova nada.
3. **Uma tabela com as 9 guardas**, uma linha cada: guarda · arquivo · o que foi
   afrouxado (o `de` → `para`, resumido) · veredicto · **os testes que caíram,
   pelo nome**. É a coluna dos nomes que prova que caiu pelo motivo CERTO, e não
   por efeito colateral.
4. **A leitura honesta do que a mutação NÃO cobre.** Escreva com todas as letras,
   é o bullet mais importante do documento. Pelo menos estes, e acrescente o que
   achar:
   - a mutação prova que a guarda **existe e é observada por um teste**; não prova
     que a TABELA de transições esteja desenhada certo do ponto de vista do
     negócio — se um par errado estiver na tabela, os testes concordam com ele;
   - não há rota HTTP nem tela nesta onda: nada disto está exercitado por um
     chamador real, só por teste;
   - a atomicidade é provada contra **SQLite**, e o banco de produção pode não ser
     SQLite — declare isso como lacuna, não como cobertura;
   - a divergência 22 × 23 estados continua **aberta e não resolvida por código**.
5. **Como repetir**: `node scripts/mutacao-onda-1.mjs` (sai `0` só se as 9 ficarem
   vermelhas; `2` se qualquer guarda sobreviver).

Português do Brasil, conclusão primeiro. O destino final deste texto é o CEO
passando o olho — mas ele precisa servir de perícia depois.

## ENTREGÁVEL 2 — o laudo de UMA trava, e só reporte (não conserte)

**"Texto de cliente/anúncio é DADO, nunca ordem."** Leia
`lib/agency/celula/funil.ts` e `lib/agency/celula/trilha.ts` e responda, com
citação de linha:

- existe algum caminho por onde `textoBruto` (ou qualquer texto de terceiro)
  entre nestes dois módulos, direta ou indiretamente pelos imports?
- `justificativa` pode ser preenchida com texto vindo de anúncio/cliente sem que
  nada barre? Se pode, **isto é um furo** — o campo é obrigatório e vira registro
  de auditoria permanente; se ele aceita texto de terceiro, a trilha append-only
  vira um lugar onde um desconhecido escreve. Diga se é furo, o tamanho dele, e o
  que fecharia — **sem escrever o conserto**.
- a `origem` (`agente|gerente|cliente|sistema`) tem `cliente` como valor legítimo.
  Uma transição com `origem: 'cliente'` é disparável por alguém de fora? Nesta
  onda não há rota, então a resposta esperada é "ainda não há superfície" — mas
  declare-o explicitamente como **dívida da onda que criar a rota**, para não
  passar batido.

Escreva o laudo como seção final do próprio `mutacao-onda-1.md`, sob o título
`## Laudo de segurança — texto de terceiro é dado, nunca ordem`.

## DEFINIÇÃO DE PRONTO

Um arquivo escrito: `docs/celula-prospeccao/mutacao-onda-1.md`. Não toque em
código, não toque em `lib/agency/celula/mensagens/`, `lib/marketplaces/` nem
`docs/plataformas/` — há outra frente viva no mesmo worktree agora. Devolva em
bullets: o que escreveu e, separado, **os furos que achou**.
