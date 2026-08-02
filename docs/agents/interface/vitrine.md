# Vitrine — interface

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.
> Toda entrada carrega proveniência. Se não couber em duas telas, não é vitrine.

---

## Componente novo nasce tokenizado — é assim que a deriva visual fecha

Os componentes da Esteira (`EsteiraDoProjeto.tsx`, `FaixaDaEsteira.tsx`,
`FilaDeAvisos.tsx`, `portal/EsteiraDoCliente.tsx`) foram escritos com hex solto e
depois convertidos para os tokens do `DESIGN.md`.

A lição é a ordem, não a conversão: **tokenizar depois custa uma passada inteira
de QA**. Componente que nasce com hex abre divergência visual no mesmo dia, e
fechar exige revisitar tela por tela.

As Fases 1–6 do redesign terminaram justamente com uma passada de tokenização das
páginas de cliente (login, briefing, vitrine) — trabalho que não existiria se elas
tivessem nascido certas.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF.md` §4.1, §4.2 e §5.3
(commit `3f888f1`)

---

## Estado honesto vence preenchimento bonito

Quando o dado não existe, a tela mostra **"não informado"** ou **"conecte"** — não
inventa, não estima, não esconde o bloco.

Foi a regra adotada na Inteligência de Marketing e vale para toda superfície que
mostra dado de cliente. O motivo é assimétrico: **ausência o dono vê e corrige;
número inventado ele usa.**

Isso torna o estado vazio um dos três estados obrigatórios com peso de requisito,
não de acabamento — especialmente no **portal do cliente**, onde tela vazia é o
cliente achando que não recebeu nada.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF.md` §4.3 e §5.1
(commit `3f888f1`) · decisão registrada em `docs/decisoes.md`

---

## O brand book vence o `DESIGN.md` em caso de conflito

`docs/brand/Dioli_Digital_Brand_Book_v1.pdf` é a autoridade final sobre identidade
visual. O `DESIGN.md` é a fonte única de verdade **de implementação** (tokens,
componentes, estados) — mas onde os dois divergirem sobre marca, vale o brand book.

Marca pública: **Dioli Digital** — *estúdio digital com IA*, sistema de design
"HUMANTECH".

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF.md` §0 (commit `3f888f1`)
