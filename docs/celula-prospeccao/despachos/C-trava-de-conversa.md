# FICHA C — A TRAVA DE CONVERSA: UM AGENTE POR VEZ

Leia antes: `docs/celula-prospeccao/despachos/COMUM.md`. Ele vale inteiro.

## OBJETIVO EM UMA FRASE
Antes de qualquer agente escrever ou enviar numa conversa, bloquear a conversa,
carregar o estado inteiro dela e impedir os três defeitos que o CEO nomeou:
**mensagem duplicada, dois agentes se contradizendo e pergunta repetida.**

## ARQUIVOS QUE SÃO SEUS (e só eles)
- `lib/agency/celula/mensagens/trava-de-conversa.ts` (novo)
- `__tests__/celula/trava-de-conversa.test.ts` (novo)

## O ESTADO QUE A TRAVA CARREGA (a lista é do CEO, na ordem dele)
última recebida · última enviada · agente responsável · etapa · perguntas já
feitas · respostas recebidas · arquivos · próxima ação · modelo usado antes.

```ts
export interface EstadoDaConversa {
  conversaId: string;
  ultimaRecebida: { em: string; texto: string } | null;
  ultimaEnviada: { em: string; texto: string; codigoDoModelo: string | null } | null;
  agenteResponsavel: string | null;
  etapa: string;
  perguntasJaFeitas: readonly string[];   // ids de `pergunta-repetida.ts`
  respostasRecebidas: Readonly<Record<string, string>>;
  arquivos: readonly { nome: string; recebidoEm: string }[];
  proximaAcao: string | null;
  modelosJaUsados: readonly string[];     // "M01", "M03"...
}
```

## PERSISTÊNCIA ENTRA POR PORTA INJETADA — a Onda 1 liga no banco depois
```ts
export interface PortaDaConversa {
  ler: (conversaId: string) => Promise<EstadoDaConversa | null>;
  /** Reserva ATÔMICA. Devolve false se já existe trava viva de outro agente. */
  reservar: (p: { conversaId: string; agente: string; expiraEm: string }) => Promise<boolean>;
  liberar: (p: { conversaId: string; agente: string }) => Promise<void>;
}
```
Comportamento obrigatório de `reservar`: **a reserva é a trava**. Não escreva
"lê, verifica, depois grava" — esse é o buraco por onde dois agentes entram na
mesma janela. A porta declara reserva atômica e o teste prova que, com a porta
recusando a segunda chamada, o segundo agente é BARRADO.

## A FUNÇÃO PRINCIPAL
```ts
export type VereditoDaTrava =
  | { ok: true; estado: EstadoDaConversa; liberar: () => Promise<void> }
  | { ok: false; motivo: string;
      causa: "conversa_ocupada" | "conversa_inexistente" | "mensagem_duplicada"
           | "pergunta_repetida" | "contradicao_de_agente" | "modelo_ja_usado" };

export async function comATravaDaConversa(...)  // abre, confere, e SEMPRE libera
```
As conferências, cada uma com teste:
- **Conversa ocupada por outro agente ⇒ BLOQUEIO.** Nomeie quem está dentro.
- **Mensagem duplicada:** o texto candidato bate com `ultimaEnviada.texto`
  (comparando por `impressaoDeTexto` de `lib/agency/comercial/oportunidade.ts`)
  ⇒ BLOQUEIO.
- **Pergunta repetida:** use `identificarPergunta` e `vezesJaPerguntada` de
  `lib/agency/comercial/pergunta-repetida.ts` — **não escreva outro contador**,
  aquele nasceu de um defeito medido em produção (a mesma pergunta feita dez
  vezes em vinte turnos). Passou de `LIMITE_DE_INSISTENCIA` ⇒ BLOQUEIO, e o
  motivo aponta `oQueDizerNoLugar`. Pergunta cuja resposta **já está** em
  `respostasRecebidas` ⇒ BLOQUEIO na primeira vez, não na terceira.
- **Contradição de agente:** a mensagem candidata afirma o contrário do que
  `ultimaEnviada` afirmou sobre preço, prazo ou escopo ⇒ BLOQUEIO. Mantenha a
  régua **estreita e explícita** (compare valores declarados, não estilo de
  redação); régua larga aqui barra conversa legítima e é desligada.
- **`maximoDeUsos` do modelo:** modelo já usado além do teto nesta conversa
  ⇒ BLOQUEIO. O teto vem por parâmetro (é da Ficha A), não hardcode.
- **A trava é SEMPRE liberada**, inclusive quando a conferência bloqueia e
  inclusive quando algo lança. Prove isso com teste — trava que vaza deixa a
  conversa morta para sempre.

## O QUE NÃO FAZER
- Não importe Prisma. Não crie `lib/agency/celula/funil.ts`.
- Não implemente o motor de escolha da próxima mensagem (é outra ficha).
- Não implemente comparação com mensagens de OUTRAS conversas (é a Ficha B).

## CRITÉRIO DE ACEITE
1. Segundo agente na mesma conversa ⇒ BLOQUEADO, com o nome do primeiro.
2. Mensagem idêntica à última enviada ⇒ BLOQUEADA.
3. Pergunta já respondida ⇒ BLOQUEADA já na primeira repetição.
4. Contradição de preço/prazo/escopo ⇒ BLOQUEADA.
5. Modelo além do `maximoDeUsos` ⇒ BLOQUEADO.
6. A trava é liberada em TODOS os caminhos, exceção inclusive.
7. As metades gêmeas: conversa livre, mensagem nova, pergunta inédita e
   afirmação coerente **passam**.
