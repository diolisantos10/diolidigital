# A porta da frente — capturas de 16/08/2026

Tela: `/agency/leads` ("Quem bateu na porta"). Capturadas com
`scripts/shot-logado.mjs` contra o app rodando local, autenticado, em
**375 / 768 / 1440**.

| Arquivo | O que prova |
|---|---|
| `porta-{mobile,tablet,desktop}.png` | **A fila cheia.** Placar com os dois baldes separados, as duas filas não misturadas, o selo de quem passou do prazo |
| `porta-aberto-{mobile,desktop}.png` | **Pista NÃO é contato.** Cartão aberto do Sushi Cazza: o motivo de não haver contato, o `@sushicazzaoficial` rotulado como pista, escopo e "preciso confirmar" |
| `porta-vazio-{mobile,tablet,desktop}.png` | **Vazio é boa notícia**, e o texto diz isso. O placar de zeros some de propósito |
| `porta-erro-{mobile,tablet,desktop}.png` | **"Esta fila NÃO é zero, é desconhecida."** O 503 foi injetado por interceptação; note que a seção alimentada pelo outro endpoint continua na tela — as duas leituras falham separadas |

Os dados são **fixture local**, reproduzindo os casos reais de 08/08 (Sushi
Cazza 51 dias, Beatriz 28, Camila sem fechar o briefing) mais o CityJobs e um
lead do dia. **Nenhum dado de produção foi tocado.**
