# Parecer — SEGURANÇA: fechar o meio-termo do Guardião (`conformidade.ts`)

**Data:** 30/08/2026 · **Autor:** Essencial `seguranca` · **Origem:** laudo do
`qualidade` sobre a Onda 2, ficha
`docs/celula-prospeccao/despachos/I-o-meio-termo-do-guardiao.md`.

---

> ## 🟢 CONSERTADO — trava compartilhada, mudança pequena, as duas metades provadas

## O que estava errado

Na Onda 2 (ficha B), removi `instagram`, `insta` e `linkedin` da regra
`dado_de_contato` em `lib/marketplaces/99freelas/conformidade.ts`, porque a
palavra nua "Instagram" — usada como **plataforma de entrega** — disparava a
trava por engano em propostas normais ("12 posts para Instagram"). Correto:
esse é o produto central desta casa e não podia ser barrado.

**Errado foi o tamanho do conserto.** Tirar a palavra inteira abriu um
meio-termo: frases que mandam o cliente **seguir/achar/conferir um perfil
fora da plataforma** — sem citar `@handle` nem a palavra da rede sozinha —
passaram a **passar**: `"me segue no insta"`, `"meu perfil no linkedin"`.

## Por que isso é a mesma proibição, com outro verbo

A fonte (`docs/plataformas/99freelas/policy.json`,
`proibicoes_de_conteudo.dado_de_contato` + `link_externo`, que cita o Termos
de Uso) proíbe *"adicionar dados de contato e/ou links ao seu perfil ou
portfólio"* e *"solicitar ou compartilhar dados de contato"*. Mandar o
cliente seguir ou conferir um perfil fora da plataforma **é a conduta que
essa regra cobre** — a frase natural de um SDR "aquecendo" relacionamento
sem usar a palavra proibida.

## O que mudou

Acrescentei em `PADROES` (mesmo arquivo, mesmo formato dos padrões
existentes, fonte nomeada) cinco entradas que pegam a **AÇÃO** de direcionar
para fora, não o nome da rede: `me segue no/na X`, `segue a gente no/na X`,
`nos segue no/na X`, `meu perfil no/na X`, `me acha/encontra no/na X`,
`procura por mim/a gente/nós no/na X`, `dá uma olhada no meu perfil` /
`olha/confere meu perfil`. Todas exigem o verbo de direcionamento — nenhuma
depende da palavra "Instagram"/"insta"/"linkedin" para disparar, e nenhuma
aparece numa proposta comum de entrega ("posts", "gestão", "reels").

## As duas metades, provadas em `__tests__/celula/entrada-hostil.test.ts`

1. **Barra:** `"me segue no insta"`, `"meu perfil no linkedin"`, `"me acha no
   facebook"`, `"dá uma olhada no meu perfil"` — as quatro exigidas pela
   ficha.
2. **Não barra:** `"preciso de 12 posts para Instagram de uma clínica
   odontológica"`, `"gestão de Instagram e TikTok por 3 meses"`, `"quero
   reels para o Instagram da loja"` — a metade gêmea, o produto central desta
   casa continua liberado.

## Ponto de reversão

Mudança em arquivo de código, coberta por teste automatizado, sem toque em
`policy.json`, sem toque em integração nem pagamento — **reversível em
minutos com `git revert`**. Não amplio autonomia própria; não ajo sobre
produção nem sobre credencial.

## Por que isto é um parecer, e não só um commit

`lib/marketplaces/99freelas/conformidade.ts` é um **guardião compartilhado**
— a esteira de propostas do 99Freelas já o usa. A regra de 03/08 (trava de
plataforma) exige parecer escrito para toda escrita que toque plataforma de
terceiro, e a ficha B mudou este mesmo arquivo sem um. Este parecer cobre a
lacuna retroativamente para a ficha B e cobre a mudança da ficha I.

## Quem consegue fazer o quê, hoje vs. antes

- **Antes desta correção:** um SDR (humano ou IA) podia escrever "me segue
  no insta" ou "meu perfil no linkedin" numa proposta e o Guardião deixava
  passar — violação real da política do marketplace, sem barreira.
- **Depois:** essas frases são barradas com achado nomeado (`dado_de_contato`)
  e fonte citada; propor "posts/gestão/reels para Instagram" continua
  liberado sem fricção.

## Devolutiva ao Diretor

- Falso positivo real (Onda 2) ficou corrigido; meio-termo que ele abriu
  (achado do `qualidade`) está fechado.
- Mudança é só em `lib/marketplaces/99freelas/conformidade.ts` +
  `__tests__/celula/entrada-hostil.test.ts` + este parecer. `policy.json` não
  foi tocado, por instrução da ficha.
- **Falta rodar o portão:** eu não executo `npx tsc --noEmit` nem
  `vitest` — isso é do PM. Os testes novos estão escritos e as duas metades
  descritas acima; preciso que o PM rode o portão e confirme verde antes de
  considerar a ficha encerrada.
- Nada aqui toca pagamento ou integração de parceiro — não há trava humana
  pendente nesta mudança.

**Registro de oficina e proposta de vitrine:** ver `docs/agents/seguranca/oficina.md`.
