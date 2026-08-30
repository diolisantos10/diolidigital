# FICHA I — o afrouxamento do Guardião deixou um MEIO-TERMO descoberto

O `qualidade` auditou a sua mudança em `lib/marketplaces/99freelas/conformidade.ts`
(a remoção de `instagram`, `insta` e `linkedin` da regra `dado_de_contato`) e o
veredito dele é: **você acertou o problema e errou o tamanho do conserto.**

O falso positivo era real — "12 posts para Instagram" é o produto central desta
casa e não pode disparar a trava. Mas a remoção trocou uma régua larga demais
por uma estreita demais **numa tacada só**, e o meio-termo ficou aberto:

| frase | hoje | por quê |
|---|---|---|
| `"meu instagram é @diolidigital"` | ✅ barrada | pelo padrão de `@handle`, não pela palavra |
| `"me segue no insta"` | ❌ **PASSA** | não tem `@handle`, e o verbo é "segue", não "chama" |
| `"meu perfil no linkedin"` | ❌ **PASSA** | não é `@handle`, não é domínio, e "perfil" ≠ "portfólio" |

A fonte que a própria política cita (`docs/plataformas/99freelas/policy.json`,
`proibicoes_de_conteudo.dado_de_contato` e `link_externo`) diz *"não se pode
adicionar dados de contato e/ou links ao seu perfil ou portfólio"* e *"não se
pode solicitar ou compartilhar dados de contato"*. **Mandar o cliente seguir ou
conferir um perfil fora da plataforma é a conduta que essa regra cobre** — e é
exatamente a frase que um SDR escreve querendo "aquecer" o relacionamento sem
usar a palavra proibida.

## O QUE FAZER
Acrescente um padrão que pegue **a AÇÃO de direcionar o cliente para fora**,
não o nome da plataforma. É essa a distinção que faz a régua caber:
- barra: "me segue no/na ___", "segue a gente no ___", "meu perfil no ___",
  "me acha no ___", "procura por ___ no ___", "dá uma olhada no meu perfil";
- **NÃO barra**: "posts para Instagram", "conteúdo para Instagram e TikTok",
  "gestão de Instagram" — a plataforma como **entrega**, que é o que a casa vende.
Cite a fonte no padrão, no formato dos `PADROES` que já estão lá.

## ⛔ AS DUAS METADES, OBRIGATÓRIAS
Em `__tests__/celula/entrada-hostil.test.ts` (seu arquivo), prove:
1. **barra**: "me segue no insta", "meu perfil no linkedin", "me acha no
   facebook", "dá uma olhada no meu perfil";
2. **NÃO barra**: "preciso de 12 posts para Instagram de uma clínica
   odontológica", "gestão de Instagram e TikTok por 3 meses", "quero reels para
   o Instagram da loja".
Se a metade 2 quebrar, a régua ficou larga de novo e o conserto é pior que o
defeito — "fazer posts para Instagram" é o produto central desta casa.

## E MAIS UMA COISA, QUE O AUDITOR REGISTROU
Você mudou um guardião COMPARTILHADO (a esteira de propostas do 99Freelas já o
usava) **sem parecer escrito**. A trava de plataforma de 03/08 existe para isso.
Escreva `docs/plataformas/99freelas/pareceres/2026-08-30-guardiao-perfil-fora-da-plataforma.md`:
o que mudou, por quê, qual fonte sustenta, e o que passou a ser barrado e o que
deixou de ser. Curto. Sem parecer, a próxima pessoa acha que foi descuido.

## ARQUIVOS QUE SÃO SEUS (e só eles)
- `lib/marketplaces/99freelas/conformidade.ts`
- `__tests__/celula/entrada-hostil.test.ts`
- `docs/plataformas/99freelas/pareceres/2026-08-30-guardiao-perfil-fora-da-plataforma.md` (novo)
⛔ **NÃO toque em `docs/plataformas/99freelas/policy.json`** — outra frente está
escrevendo nele agora. Você não roda npm/npx/node/git — o PM roda o portão.
