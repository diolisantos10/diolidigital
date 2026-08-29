# A triagem que dividiu a rodada 2 — 29/08/2026

A rodada 1 declarou o universo como 152 `route.ts`. **São 188.** Com 45
examinadas, a cobertura era de 24%, e 143 rotas ficaram fora.

Em vez de deixar isso como dívida declarada, as 143 passaram por triagem
mecânica — candidata é a que **lê corpo ou query** E **usa um id de recurso**:

```sh
find app/api -name "route.ts" | sort            # → 188
# candidata = lê `.json()` ou `searchParams`
#             E tem `body.<algo>Id` / `searchParams.get("<algo>Id")`
#             ou `where: { id`
```

- **46 candidatas** → varridas na rodada 2, em dois lotes de 23, despachados em
  paralelo. As listas exatas estão em `lote-A.txt` e `lote-B.txt`, e cada uma
  das 46 tem uma linha com veredito nos documentos
  `../varredura-de-posse-rodada2-lote-A.md` e `-lote-B.md`.
- **97 descartadas** (`descartadas-pela-triagem.txt`): não recebem id de recurso
  pela requisição. **Descartada pela triagem não é rota auditada** — é rota que
  o filtro não pegou. Se o filtro estiver errado, elas voltam.

Estes arquivos existem para que "varremos tudo" seja **conferível**, e não uma
frase. Quem duvidar roda os comandos acima e compara com as listas.
