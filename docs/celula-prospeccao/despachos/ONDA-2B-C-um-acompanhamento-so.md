# ONDA 2B — FICHA C · A TRAVA DO M14: UM ACOMPANHAMENTO, E SEIS MOTIVOS PARA NENHUM

## Objetivo em uma frase
Construir a trava que garante a ordem dura do CEO sobre o modelo M14
(ACOMPANHAMENTO SEM RESPOSTA): **no máximo UM acompanhamento automático por
oportunidade, com intervalo configurável, e nenhum quando qualquer uma de seis
condições valer.**

## A ordem do CEO, literal
> Apenas **UM acompanhamento automático por oportunidade**, intervalo
> configurável. **NÃO enviar se:** o cliente recusou · o projeto encerrou · outra
> pessoa foi contratada · o cliente pediu para não receber · já houve
> acompanhamento · a plataforma bloqueou.

Cada uma dessas seis é uma trava, cada uma vira teste, e cada uma vai receber
mutação depois (quem roda a mutação sou eu, o PM — você não precisa rodar nada).

## Arquivos que são SEUS neste despacho (e só estes)
1. `lib/agency/celula/mensagens/acompanhamento.ts` — **criar**.
2. `__tests__/celula/acompanhamento-unico.test.ts` — **criar**.
3. `docs/plataformas/99freelas/policy.json` — editar **apenas** para acrescentar
   um bloco novo `acompanhamento` (ver abaixo).

## O que você NÃO pode fazer
- **NÃO toque em**: `lib/agency/celula/ponte/`, `lib/agency/celula/excecoes/`,
  `lib/agency/celula/funil.ts`, `prisma/schema.prisma`,
  `lib/agency/celula/mensagens/biblioteca.ts`, `lib/agency/celula/mensagens/tipos.ts`,
  `docs/plataformas/99freelas/mensagens.json` — todos têm outra frente escrevendo
  neles AGORA. Colidir aí destrói trabalho em voo.
- **Em `policy.json`: NÃO toque em `autorizacao_do_suporte`, em
  `auto_submission_allowed` nem em nenhum campo já existente.** Você só
  ACRESCENTA um bloco novo. Outro despacho está olhando esse arquivo.
- **Não persista nada.** Banco é da Onda 3. Seu módulo é PURO: recebe o estado,
  devolve a decisão.

---

## O QUE CONSTRUIR

### `lib/agency/celula/mensagens/acompanhamento.ts`

```ts
/** O que se sabe sobre a oportunidade na hora de decidir o acompanhamento. */
export interface EstadoDaOportunidade {
  referencia: string;
  /** Quando a agência mandou a última mensagem (a proposta, tipicamente). */
  ultimaMensagemDaAgenciaEm: Date | null;
  /** Quantos acompanhamentos AUTOMÁTICOS já saíram para esta oportunidade. */
  acompanhamentosJaEnviados: number | null;
  clienteRecusou: boolean | null;
  projetoEncerrado: boolean | null;
  outraPessoaContratada: boolean | null;
  clientePediuParaNaoReceber: boolean | null;
  plataformaBloqueou: boolean | null;
  /** `true` quando o cliente falou depois da última mensagem da agência. */
  clienteRespondeu: boolean | null;
}

export interface DecisaoDeAcompanhamento {
  pode: boolean;
  /** Todos os motivos de bloqueio, nomeados. Nunca um só quando há vários. */
  motivos: string[];
  /** O texto curto para o humano. Nunca vazio, nem no caminho feliz. */
  motivo: string;
  horasDesdeAUltimaMensagem: number | null;
  intervaloHoras: number;
}

export function podeAcompanhar(
  estado: EstadoDaOportunidade,
  agora?: Date,
  plataforma?: string,
): DecisaoDeAcompanhamento
```

### As regras, todas elas

1. **`null` é DESCONHECIDO, e desconhecido BLOQUEIA.** Lei desta casa: *ausência
   de informação não é informação*. Campo `null` → bloqueio com motivo dizendo
   qual campo está desconhecido. Isto vale para os seis booleanos, para
   `acompanhamentosJaEnviados` e para `ultimaMensagemDaAgenciaEm`.
2. **`acompanhamentosJaEnviados >= 1` → BLOQUEIA.** O teto é UM, e é a ordem
   literal do CEO. `>= 1`, não `> 1`.
3. **`acompanhamentosJaEnviados` negativo → BLOQUEIA** (dado corrompido não vira
   permissão).
4. As seis condições, cada uma com o seu próprio motivo em português, citando o
   que o CEO escreveu.
5. **`clienteRespondeu === true` → BLOQUEIA.** Acompanhar quem já respondeu é
   insistir com quem falou. (Se você achar que isto extrapola a ordem do CEO,
   implemente assim mesmo **e diga no relatório** — é bloqueio a mais, nunca a
   menos, e eu levo ao Diretor.)
6. **Intervalo:** só pode acompanhar se passou pelo menos `intervaloHoras` desde
   `ultimaMensagemDaAgenciaEm`. Antes disso, bloqueia dizendo quantas horas faltam.
7. **Vários motivos ao mesmo tempo → `motivos` traz TODOS.** Devolver só o
   primeiro esconde os outros cinco de quem for consertar.
8. `pode: true` só quando `motivos` está vazio. Escreva a implementação de forma
   que essas duas coisas não possam divergir.

### O intervalo vem de `policy.json`
Espelhe o padrão que `lib/marketplaces/99freelas/follow-up.ts` já usa com
`follow_up` — leia esse arquivo antes de escrever o seu. Bloco a ACRESCENTAR em
`docs/plataformas/99freelas/policy.json`:

```json
"acompanhamento": {
  "_leia_isto": "REGRA DA CASA, não da plataforma. O 99Freelas não publica quantas horas esperar antes de um acompanhamento, e a ordem do CEO diz 'intervalo configurável' sem fixar número. Estes números são da DIOLI e estão declarados como tal — quem trocá-los troca aqui, não no código.",
  "maximo_por_oportunidade": 1,
  "maximo_procedencia": "ordem literal do CEO, 30/08/2026: 'apenas UM acompanhamento automático por oportunidade'.",
  "intervalo_da_casa_horas": 72,
  "intervalo_procedencia": "preciso confirmar com o CEO — a ordem dele diz 'intervalo configurável' e NÃO fixa o número. 72 h é um padrão conservador da casa, escolhido para errar do lado de insistir menos. NÃO é número do CEO nem da plataforma.",
  "intervalo_da_plataforma_horas": null,
  "intervalo_da_plataforma_procedencia": "o 99Freelas não publica prazo de acompanhamento — ausência de informação, não permissão."
}
```
Se `maximo_por_oportunidade` vier ausente ou não for número, **use 1** (o valor
mais restritivo) e não o valor mais permissivo. Fail closed também na leitura de
configuração.

### O risco que este arquivo NÃO fecha — escreva-o no topo, com todas as letras
O chat do 99Freelas está atrás do login, e login é BLOCK nesta rodada. Logo
**nada alimenta `acompanhamentosJaEnviados` sozinho hoje**: a contagem depende
de quem chamar a função passar a verdade. O mecanismo existe; a ENTRADA dele não.
Isso é risco aberto, não recurso pronto — e some do relatório de qualquer um que
não escreva. `lib/marketplaces/99freelas/follow-up.ts` já tem um aviso desses no
cabeçalho; siga o mesmo estilo.

---

## O TESTE — `__tests__/celula/acompanhamento-unico.test.ts`
**Cada trava com as DUAS metades: barra o caso plantado E libera o caso limpo.**

- Um caso **LIMPO** completo: tudo `false`, zero acompanhamentos, 100 h desde a
  proposta → `pode: true`, `motivos: []`.
- Seis testes, um por condição do CEO, cada um virando só aquele campo para
  `true` a partir do caso limpo → `pode: false`, e o motivo **nomeia aquela
  condição**. (Não aceite "bloqueou por algum motivo": afirme QUAL.)
- `acompanhamentosJaEnviados: 1` → bloqueia. `: 0` → passa.
- Cada um dos oito campos em `null`, um por vez → bloqueia por DESCONHECIDO.
- Intervalo: 1 h desde a proposta → bloqueia e diz quantas faltam; 72 h → passa;
  exatamente no limite → declare no teste qual é o comportamento e prove-o.
- Duas condições ao mesmo tempo → `motivos` tem os **dois**.
- `pode === (motivos.length === 0)` para uma bateria de combinações.

## Critério de aceite
- O módulo é puro (sem I/O além de ler a política), sem `any`.
- Todos os motivos em português, cada um nomeando a condição.
- `policy.json` continua JSON válido e nenhum campo antigo mudou.
- O aviso do risco aberto está no topo do arquivo.

## O que devolver
Bullets: o que ficou pronto · o que você bloqueou a mais do que o CEO pediu (item
5) · o que exige decisão do CEO (o número do intervalo é um deles).
