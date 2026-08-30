# FICHA F — A TRAVA DE PROMESSA: DATA PROMETIDA EXIGE COMPROMISSO REGISTRADO

Leia antes: `docs/celula-prospeccao/despachos/COMUM.md`. Ele vale inteiro.

## POR QUE ESTA FICHA EXISTE (aprendido apanhando, 29/08/2026)
Nosso SDR disse **"trago ainda hoje" QUATRO vezes** sem ter o número e sem
mecanismo por trás. O CEO viu e disse que teríamos perdido o cliente.
Já houve o irmão desse defeito em 27/08 (*"eu finalizo o orçamento e envio"* —
e nada disparou), e a casa o matou em
`lib/agency/comercial/promessa-que-a-maquina-nao-cumpre.ts`.
**Aquele arquivo barra a promessa vaga. Este exige o compromisso da promessa
com DATA.** São irmãos, não duplicatas — e você vai IMPORTAR aquele, não
reescrevê-lo.

## OBJETIVO EM UMA FRASE
Mensagem que promete data **não sai** sem um compromisso registrado no mesmo
ato, com dono e prazo.

## ARQUIVOS QUE SÃO SEUS (e só eles)
- `lib/agency/celula/mensagens/compromisso.ts` (novo)
- `__tests__/celula/trava-de-promessa.test.ts` (novo)

## 1. RECONHECER A PROMESSA DE DATA
```ts
export interface PromessaDeData { trecho: string; forma: string; }
export function promessasDeData(texto: string): PromessaDeData[];
```
Reconhece o compromisso temporal em primeira pessoa da casa: *"ainda hoje",
"até amanhã", "até sexta", "em 24 horas", "até o fim do dia", "na segunda",
"até dia 12", "em 2 dias", "ainda esta semana", "amanhã cedo"* — combinado com
verbo de entrega ("envio", "mando", "trago", "retorno", "te passo", "entrego",
"finalizo").

O que **NÃO** se barra, e a diferença é a alma da régua:
- data do CLIENTE ("preciso até sexta") — é pergunta dele, não promessa nossa;
- prazo de ESCOPO já contratado e sustentado por registro ("o pacote entrega em
  5 dias úteis") quando vier com compromisso;
- passado ("mandei ontem").
Régua larga demais barra a casa de conversar, e régua que barra conversa
legítima é desligada na primeira reclamação — aí não protege nada.
**Importe e componha com `temPromessaSolta` / `promessasSoltas` do arquivo de
27/08.** Não reescreva aquelas regras.

## 2. O COMPROMISSO — interface aqui, persistência por PORTA INJETADA
```ts
export interface Compromisso {
  id: string;
  conversaId: string;
  oQueFoiPrometido: string;
  /** Quem responde por cumprir. NUNCA "sistema", "ia", "agente", vazio. */
  dono: string;
  /** O prazo prometido, ISO. Tem de ser FUTURO em relação a `agora`. */
  prazo: string;
  criadoEm: string;
  /** O trecho exato da mensagem que gerou a promessa. */
  trechoDaPromessa: string;
}

export interface PortaDeCompromissos {
  registrar: (c: Omit<Compromisso, "id" | "criadoEm">) => Promise<{ ok: true; id: string } | { ok: false; motivo: string }>;
}
```

## 3. ⛔ A TRAVA — "NO MESMO ATO" É LITERAL
```ts
export type VereditoDaPromessa =
  | { ok: true; texto: string; compromissosCriados: string[] }
  | { ok: false; motivo: string };

export async function liberarTextoComPromessa(p: {
  texto: string;
  conversaId: string;
  dono: string | null;
  prazo: string | null;
  agora?: Date;
  porta: PortaDeCompromissos;
}): Promise<VereditoDaPromessa>;
```
Regras, cada uma com teste:
- Texto **sem** promessa de data ⇒ passa, sem criar compromisso nenhum.
- Texto **com** promessa e `dono` ausente/`"sistema"`/`"ia"`/vazio ⇒ **BLOQUEIO**.
- Texto **com** promessa e `prazo` ausente, inválido ou **no passado** ⇒ BLOQUEIO.
- Texto com promessa, dono e prazo válidos ⇒ chama `porta.registrar` **antes de
  liberar o texto**. Se o registro FALHAR, a frase **não sai**. Este é o ponto
  inteiro da ficha: promessa sem registro é a promessa de 29/08 outra vez.
- Uma promessa por trecho: duas promessas no mesmo texto ⇒ dois compromissos, e
  se qualquer um falhar, nada sai.
- A ordem importa e é testável: **registrar primeiro, liberar depois.** Prove com
  a ordem das chamadas do mock que o texto nunca é liberado antes do registro.

## 4. A LIGAÇÃO COM OS MODELOS QUE PROMETEM DATA
A ordem do CEO nomeia **M15, M16, M18 e M19** como modelos que prometem data.
Exporte `MODELOS_QUE_PROMETEM_DATA = ["M15","M16","M18","M19"] as const` com o
comentário de que a lista veio da ordem do CEO, e uma função
`exigeCompromisso(codigoDoModelo, texto)` que devolve `true` se o código está na
lista **ou** se o texto disparou `promessasDeData`. **O texto manda**: um modelo
fora da lista que prometa data também é barrado. Lista é atalho, não é a trava.

## CRITÉRIO DE ACEITE
1. Promessa de data sem compromisso registrado ⇒ BLOQUEADA.
2. Compromisso com dono "sistema"/"ia"/vazio ⇒ BLOQUEADO.
3. Prazo no passado ⇒ BLOQUEADO.
4. Falha ao registrar ⇒ o texto NÃO sai.
5. Registro acontece ANTES da liberação — provado pela ordem das chamadas.
6. Modelo fora de M15/M16/M18/M19 que promete data também é barrado.
7. As metades gêmeas: texto sem promessa passa limpo; texto com promessa, dono
   e prazo válidos passa e cria o compromisso.
