# Prova visual do kit de marca

Duas folhas. Nenhuma das duas é decoração: portão de código não vê logo torto, e
teste verde não mostra logo branco em fundo branco.

| Folha | O que ela prova |
|---|---|
| [`kit-antes-e-depois.png`](kit-antes-e-depois.png) | O PNG do Brand Book (antes) contra o SVG redesenhado (depois), em fundo claro e escuro, de 64px a 16px. Inclui o teste de **transparência sobre xadrez** — fundo branco embutido apareceria ali. E o teste de escala a 1100px, que é o motivo do vetor existir. |
| [`peca-assinada.png`](peca-assinada.png) | As **duas metades da regra**: a Dioli assinando a peça com o símbolo real (e o tom virando sozinho conforme o fundo), e o cliente sem arquivo de logo continuando com o monograma das iniciais + a falta declarada. |

Regeneráveis a qualquer momento:

```sh
CONFERENCIA_DIR=<pasta> node  scripts/gerar-kit-de-marca.mjs      # o kit + o desvio contra o PNG oficial
CONFERENCIA_DIR=<pasta> node  scripts/conferir-kit-de-marca.mjs   # kit-antes-e-depois.png
CONFERENCIA_DIR=<pasta> npx tsx scripts/conferir-peca-assinada.mts # peca-assinada.png
```

A especificação da marca — geometria, arquivos, quando usar cada um — está em
[`DESIGN.md` §1](../../../DESIGN.md).
