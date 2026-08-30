# ONDA 2B — FICHA F · A GUARDA QUE NÃO DERRUBOU O TESTE

## O achado, medido — não é opinião
Rodei as 19 mutações da Onda 2B. **18 caíram. Uma ficou VERDE**, e guarda que
não derruba teste é decoração:

```
FALHA m14/politica-fail-closed — Tests  38 passed (38)
  ⚠️ CONTINUOU_VERDE_A_GUARDA_E_DECORATIVA
```

A mutação afrouxou o fail-closed de `configuracaoDeAcompanhamento` em
`lib/agency/celula/mensagens/acompanhamento.ts`:
```ts
? maximoBruto : 1        →        ? maximoBruto : Infinity
```
Isto é, `maximo_por_oportunidade` ausente ou corrompido passaria a significar
**"acompanhamentos ilimitados"** em vez de "um só". **A suíte inteira continuou
verde.** É exatamente o buraco que a ordem do CEO fecha, e hoje nada o guarda.

## Por que a mutação não caiu — o diagnóstico, para você conferir
Duas razões somadas:
1. O `policy.json` real **tem** `maximo_por_oportunidade: 1`, então o ramo do
   fallback nunca é exercitado pelos testes que usam `"99freelas"`.
2. O único teste que usa plataforma sem política (`"plataforma-inexistente"`)
   **não isola o fallback**: sem política, `intervaloHoras` também vira
   `Infinity` e o bloqueio de intervalo dispara antes — o teste passa por um
   motivo que não é o que ele acha que está provando. Um bloqueio escondendo o
   outro é como uma guarda decorativa sobrevive a uma suíte verde.

## Objetivo em uma frase
Tornar o fail-closed da leitura de política **testável isoladamente** e prová-lo,
de modo que afrouxar `: 1` para `: Infinity` derrube o teste.

## Arquivos que são SEUS (e só estes)
1. `lib/agency/celula/mensagens/acompanhamento.ts`
2. `__tests__/celula/acompanhamento-unico.test.ts`

## O que fazer
1. **Exporte** `configuracaoDeAcompanhamento` e dê a ela uma **porta injetada**,
   o mesmo padrão que `carregarBiblioteca(bruto?)` já usa nesta casa:
   ```ts
   export function configuracaoDeAcompanhamento(
     plataforma: string,
     blocoBruto?: unknown,     // default: lê de politicaDe(plataforma).cru.acompanhamento
   ): ConfiguracaoDeAcompanhamento
   ```
   Exporte também a interface `ConfiguracaoDeAcompanhamento`. **Não mude** a
   assinatura pública de `podeAcompanhar` — os testes que já existem continuam
   valendo sem uma linha editada.
2. **Testes novos, cada um isolando UM fallback** (é o isolamento que faz a
   mutação cair):
   - bloco `{}` → `maximoPorOportunidade === 1`. Afirme o **número**, não "é restritivo".
   - `{ maximo_por_oportunidade: "dois" }` → `1`.
   - `{ maximo_por_oportunidade: null }` → `1`.
   - `{ maximo_por_oportunidade: -3 }` → `1` (negativo não vira permissão).
   - `{ maximo_por_oportunidade: 0 }` → `0`, e diga no comentário do teste o que
     isso significa: zero acompanhamentos permitidos, que é MAIS restritivo, não menos.
   - bloco não-objeto (`"texto"`, `null`, `42`) → `1`.
   - intervalo: `{}` → `Infinity`; só `intervalo_da_casa_horas` → o da casa;
     os dois presentes → **o da plataforma vence**; `intervalo_da_casa_horas: "72"`
     (texto) → `Infinity`.
3. **O teste de ponta que faltava**, e é o que fecha o buraco de verdade: um
   `podeAcompanhar` em que o **intervalo já passou** (nada bloqueia por tempo) e
   `acompanhamentosJaEnviados: 1`, com a política **sem** `maximo_por_oportunidade`
   → tem de BLOQUEAR pelo teto. Se for preciso passar o bloco injetado até
   `podeAcompanhar` para montar esse caso, acrescente **um terceiro parâmetro
   opcional** a ela — sem mudar o comportamento de quem chama com dois.
   Este teste é o que impede o bloqueio de intervalo de esconder o do teto.
4. Corrija o teste `"plataforma sem policy.json conhecido"` para afirmar **por
   qual motivo** ele bloqueia (hoje ele aceita qualquer bloqueio). Teste que não
   nomeia o motivo passa pelo motivo errado, e foi assim que este furo nasceu.

## O que você NÃO pode fazer
- **NÃO toque em** `docs/plataformas/99freelas/policy.json`, `biblioteca.ts`,
  `tipos.ts`, `mensagens.json`, `ponte/`, `excecoes/`, `funil.ts`,
  `prisma/schema.prisma`, nem em nenhum outro teste.
- **NÃO troque o `1` por outro valor.** O conserto é de TESTE e de testabilidade,
  não de política. O fail-closed em 1 está certo — o que falta é a prova.
- Não rode `npm`/`npx`/`node`/`git`. O portão e a mutação são meus.

## Critério de aceite
- Afrouxar `: 1` para `: Infinity` passa a derrubar `acompanhamento-unico.test.ts`.
- Nenhum teste existente editado além do item 4.
- Sem `any`.

## O que devolver
Bullets: o que ficou pronto · se precisou mexer em assinatura pública, qual e por quê.
