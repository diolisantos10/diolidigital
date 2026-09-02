# O apagador de faturamento não é deste produto — verificação de 02/09/2026

> **Cobrança do CEO em 02/09, via Diretor Geral:** *"o valor do mês passado
> ainda está errado, e ainda não foi corrigido"*. O defeito suspeito foi
> descrito como: conector de sincronização financeira (`raia-da-chave.ts`)
> com um único `fetch` sem paginação; resposta truncada chegando com HTTP 200
> e tratada como "não teve venda"; `deleteMany` apagando linhas de faturamento
> real. Caso medido: pedido 20/08–26/08 voltou só com 20 e 26, e os dias 21–25
> foram apagados.
>
> **A ordem foi: confirmar antes de agir.** Confirmei.

## Veredito: o defeito NÃO existe na Dioli Digital

Verificado o **padrão**, não o nome. Tudo medido contra o **deploy**
(`origin/claude/dioli-agency-os-architecture-kk7kp`), não contra cópia local.

| Verificação | Resultado |
|---|---|
| `raia-da-chave.ts` existe? | **Não.** `git ls-tree -r` no deploy não encontra |
| Existe `fetch` paginado de faturamento? | **Não.** Nenhum arquivo do caminho do dinheiro faz busca externa de venda |
| Algum `deleteMany` toca linha de faturamento? | **Não.** Os únicos no caminho do dinheiro são rotas explícitas de reset (`app/api/admin/reset`, `admin/limpar-producao`, `admin/reset-request`) — apagar é a função delas |
| O webhook de pagamento apaga algo? | **Não.** `app/api/self-serve/webhook/route.ts` só cria (`confirmadoEm`). É push, não puxada |
| Existe cron reprocessando janela de dias de pagamento? | **Não.** Os 8 crons em `app/api/cron/` tratam de outros assuntos |
| O `deleteMany` de `financeiro/conceder-isencao.ts` | **É comentário**, não código — cita `admin/reset/route.ts:188` |

## De onde vem a receita AQUI

`lib/agency/financeiro/dre.ts:266-269` — a receita é a soma de
`LancamentoFinanceiro` do tipo `receita` marcados como realizados. A
procedência é declarada no próprio código:

> `procedencia: "lançamentos de receita realizados (manual, contrato ou extrato)"`

**É lançamento manual.** Não há sincronização externa que possa truncar, e
portanto não há o que apagar por truncamento.

⚠️ E o desenho é fail-closed: sem lançamento, a linha vira `nao_lancado`
(**não medido**), nunca `0`. Zero e não-medido não se confundem aqui.

## O que este documento NÃO afirma

- **NÃO afirma que o valor que o CEO vê está certo.** Esta sala **não tem
  acesso ao banco de produção**; nenhum número de faturamento real foi lido.
  Dizer "está certo" seria verde por ausência.
- **NÃO afirma de qual produto é o defeito.** Só que não é deste. O arquivo
  citado e o mecanismo não têm equivalente aqui.
- **NÃO mediu** se existe algum `LancamentoFinanceiro` em produção, nem quantos.

## O que destrava a resposta ao CEO

1. **Ele abre o painel financeiro, vai ao mês passado e diz qual valor
   aparece.** Com esse número dá para comparar contra o que o sistema deveria
   somar. Custa 2 minutos e é o passo que falta.
2. **Confirmar de qual produto é o `raia-da-chave.ts`** — não é deste
   repositório, e a cobrança precisa chegar a quem tem o arquivo.
3. **Acesso de leitura à produção**, sem o qual nenhum prazo de reparo
   histórico é honesto.

---

> Escrito à mão pelo Diretor em 02/09/2026, com **exceção `SEM_AGENTE`
> declarada**: a ferramenta de despacho está desabilitada há 4 dias
> (`Error: No such tool available: Agent`). Nenhum código foi alterado —
> este documento **verifica e registra**, não conserta.
