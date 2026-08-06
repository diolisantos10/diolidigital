# Oficina — qualidade

> Registro de bancada. O que foi construído, o que foi conferido e **o que ficou
> aberto**. A vitrine é curada pelo Diretor; aqui é onde o trabalho é anotado.

---

## 06/08/2026 — A escada de exposição: sombra → allowlist → wide

**Por que ela vinha antes da inversão do default.** A Onda 1 do P0
("departamento sem gate executável = REPROVADO") estava parada de propósito:
entrando sozinha, para 8 de 8 departamentos no dia 1. A escada é o que torna a
inversão gradual — e é a única peça do kit que ainda não existia em código.

### O que foi construído

| Peça | Onde | O que faz |
|---|---|---|
| A regra | `lib/agency/escada/degraus.ts` | degraus, critério de subida em NÚMERO, `decidirEntrega`, `departamentoDoAgente`. Sem prisma: é regra, não estado. |
| O estado | `lib/agency/escada/registro.ts` + `DepartmentLadder` / `DepartmentLadderRecord` | degrau por departamento **no banco**, com quem, quando e a prova congelada. |
| A trava | `esteira/marcos.ts`, `esteira/mes.ts`, `esteira/producao-de-pedido.ts` | as TRÊS portas de visibilidade da casa passaram a consultar a escada antes de carimbar `visibility: "compartilhado"`. |
| O contador | `execution/run-execution.ts` | cada peça produzida vira registro — **inclusive as barradas**. |
| A tela | `app/agency/escada/page.tsx` + `app/api/agency/escada/route.ts` | degrau de cada departamento e **quanto falta, em número**, para subir. |

### As decisões que custam caro para desfazer

1. **O degrau mora no banco, não numa constante.** Constante não registra quem
   subiu, quando e com qual número — e sem essa prova "subir" vira opinião com
   cara de configuração.

2. **Fail-closed em TRÊS lugares, não em um:** default da coluna, `degrauDeclarado`
   (qualquer texto que não seja exatamente um dos três vira sombra) e
   `departamentoDoAgente` (executor desconhecido = sem departamento = retido).
   Um ponto único de fail-closed é um ponto único de esquecimento.

3. **Subir exige número; descer não exige nada.** Assimetria deliberada, a mesma
   de `leitura-do-cliente.ts`: descer errado represa uma entrega; subir errado
   publica peça errada em nome de cliente pagante. **Não existe parâmetro de
   força em `subirDegrau`** — um `{ forcar: true }` vira o caminho normal na
   primeira sexta-feira apertada.

4. **`sem_arbitro` não conta como aprovada.** Verde não é prova, e
   "ninguém olhou" menos ainda: sem esta regra, um provedor fora do ar por uma
   semana promoveria o departamento a `wide` sem uma única auditoria.

5. **O denominador inclui as barradas.** Contar só `Deliverable` daria histórico
   impecável ao departamento que inventa dado — peça barrada no piso de verdade
   **nunca vira entrega**.

6. **A semeadura não para a casa e não inventa degrau.** Departamento que já
   entregava nasce em `allowlist` **com exatamente os clientes que já atendia**
   (derivado do banco, não de opinião); quem nunca entregou nasce em `sombra`.
   **`wide` nunca é semeado.**

7. **`try/catch` e não `.catch()` no contador.** Não são a mesma coisa: sem a
   tabela, o acesso à propriedade estoura ANTES de existir promessa, e a exceção
   síncrona passa por cima do `.catch` e derruba a produção. Um contador de
   evidência não pode ser capaz de parar a agência. (Foi exatamente o que
   aconteceu na bancada: 46 testes vermelhos.)

### O que foi conferido

- `__tests__/qualidade/escada-de-exposicao.test.ts` — 41 casos, **com as duas
  metades**: sombra/allowlist não chegam ao cliente **e** wide chega sem atrito;
  9 grafias adversariais de degrau (`"WIDE"`, `"widee"`, `" wide"`, `"true"`);
  JSON de allowlist corrompido = lista vazia, não "todos"; banco fora do ar
  retém tudo.
- `__tests__/execution/run-execution.test.ts` — a fiação: peça aprovada vira
  registro `aprovada`; peça barrada no piso **não** vira `Deliverable` e **vira**
  registro `barrada_piso`.
- `marcos`, `mes` e `passagem-do-pedido` — a metade legítima: com o departamento
  em `wide`, a entrega atravessa sem atrito (`__tests__/_escada.ts`).
- Suíte inteira: 2119 testes verdes. `npx tsc --noEmit` limpo fora dos arquivos
  em curso do agente `plataforma`.
- Tela renderizada de verdade em 375/768/1440 (login real, base local semeada):
  9 departamentos, todos em sombra — porque a base local não tem histórico de
  entrega. Cada card mostra o número exato que falta.

### O que ficou aberto (dito com todas as letras)

- **Entrega antiga com `ownerAgentId` nulo é retida.** É fail-closed correto e é
  um falso positivo real: numa base com legado, essas peças param de ser
  compartilhadas e viram `escada_reteve_entrega`. Não foi aberta exceção de
  propósito — legado que passa por ser legado é a porta que o executor novo usa
  sem querer. **Quem for ligar em produção confere o log dessas retenções na
  primeira apresentação.**
- **`financeiro` produz entrega e não está nos 8 do Brain.** A escada usa a
  UNIÃO das duas listas; as duas listas continuarem divergindo é dívida de
  `departamentos`.
- **Não há botão de subir na tela.** Subir passa pela rota, que confere a
  evidência. Falta o `interface` desenhar a ação — a dívida é de UI, não de
  mecanismo.
- **A promoção é manual (chamada de rota).** Não há rotina que suba sozinho
  quando a evidência fecha. Deliberado por ora: a primeira subida da casa tem que
  ser olhada por alguém.
