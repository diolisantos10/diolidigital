@AGENTS.md

# 🧠 Regras de IA — a fonte é o Dioli Brain Kit

As regras de agentes de IA deste projeto **não moram aqui**. Elas moram em
[`diolisantos10/dioli-brain-kit`](https://github.com/diolisantos10/dioli-brain-kit)
— um manual só, para todos os produtos Dioli. Cópia espalhada diverge: aprende-se
algo novo, atualiza-se um repositório e esquece-se os outros, e em três meses
ninguém sabe qual versão vale.

Leitura obrigatória antes de mexer em `lib/dioli-brain/`:

| Arquivo do kit | Para quê |
|---|---|
| `docs/01-filosofia.md` | A Regra de Ouro e os 10 princípios |
| `docs/06-incidentes.md` | As histórias que produziram cada regra — leia antes de simplificar qualquer uma |
| `docs/07-memoria-de-agente.md` | As duas camadas de agente |

## O perfil de risco DESTA casa: 100% IA, sem revisão humana

**Decisão do CEO (31/07/2026): o piloto roda 100% IA. Não existe checagem humana
antes do entregável chegar ao cliente.**

Isso põe esta casa **no mesmo perfil de risco do Foocci** — na verdade, num mais
exposto: lá o erro é uma frase numa conversa; aqui é uma peça, um plano de mídia
ou um post publicado em nome de um cliente pagante. **O kit inteiro vale aqui, e
vale agora.**

Em particular, os quatro que não são opcionais:

1. **Verdade ancorada + ausência de informação não é informação.** Sem o dado do
   cliente, o departamento escreve "preciso confirmar" e escala — nunca preenche
   por inferência. Sem revisor humano, um dado inventado vira entregável.
2. **Sem gate = reprovado.** Checagem não executável não protege nada.
3. **Trava, não aviso.** Para o que causa dano real (nome de cliente, número,
   promessa comercial), exija mecanismo — prompt é sugestão.
4. **A escada.** Departamento novo nasce em SOMBRA e sobe com evidência. Rodar
   100% IA **não** significa pular a escada: significa que a escada é a única
   proteção que sobrou.

> ### ⚠️ Buraco aberto e conhecido — prioridade do piloto
>
> **Os quality gates não protegem nada hoje.** Das 31 checagens em
> `lib/dioli-brain/quality-gates.ts`, **28 são `autoCheckable: false`** — texto
> descrevendo o que um humano deveria conferir. **Só 3 rodam.**
>
> Com revisão humana isso era um checklist. **Sem revisão humana é decoração:**
> "sem alucinação", "respeita a marca", "corresponde ao briefing" e "riscos
> verificados" são exatamente as falhas que chegam no cliente, e nenhuma delas é
> verificada por código.
>
> **Além disso:** a ancoragem de verdade ainda depende de contexto montado no
> cliente (ver o cabeçalho de `lib/dioli-brain/reason.ts` — "Phase 2 will add
> ClientKnowledgeSnapshot"). Enquanto o servidor não ler a verdade do banco por
> conta própria, o raciocínio confia no que lhe entregam.
>
> **O que precisa existir antes de o piloto rodar sem gente olhando:**
> 1. Piso determinístico: afirmação contra `ClientKnowledgeSnapshot`
>    (nome, número, prazo, serviço contratado) — o equivalente do
>    claim-vs-snapshot do Foocci;
> 2. LLM-judge para os subjetivos (marca, briefing, valor ao cliente), com
>    reprovação bloqueante e indisponibilidade não-bloqueante;
> 3. Default do registry invertido: departamento sem gate executável = REPROVADO;
> 4. Escada por departamento — sombra até haver evidência.

# 🎨 Regras permanentes de design (interface / UX / UI)

Estas regras valem para **todo** trabalho de interface neste projeto. Não são opcionais.

1. **Seguir o `DESIGN.md`.** Todo trabalho de interface (tela nova ou alteração) deve
   seguir o manual em [`DESIGN.md`](DESIGN.md): tokens, tipografia, componentes,
   referências (Linear, Attio, Stripe, Vercel) e estados obrigatórios. Nunca use cores
   hex "na mão" quando existe token; nunca recrie um componente que já existe.

2. **Responsivo obrigatório.** Toda tela criada ou alterada deve ser verificada em
   **3 tamanhos** — celular **375px**, tablet e desktop — tirando um screenshot de cada
   com o Playwright. A maioria dos usuários acessa pelo **celular**, então o mobile é
   prioridade, não sobra.
   - Ferramenta pronta no repo: `node scripts/shot.mjs <rota> <nome>` (captura os 3 tamanhos).
   - Rodar o app localmente: ver comando abaixo.

3. **Auto-revisão obrigatória.** Após qualquer mudança visual: tirar screenshot,
   se autoavaliar de **0 a 10** em **hierarquia, tipografia, espaçamento e consistência**,
   e só apresentar o resultado ao usuário quando estiver **8+** em todas. Se estiver abaixo,
   **iterar sozinho** (ajustar e re-screenshotar) antes de mostrar. Ao apresentar,
   mostrar o **antes e depois**.

## Como rodar e ver o app localmente

```sh
# 1. Banco local (uma vez): cria .env, provisiona SQLite e semeia
echo 'DATABASE_URL="file:./dev.db"' > .env
echo 'JWT_SECRET=dev-secret-local-only' >> .env
npx prisma db push && node scripts/seed-db.mjs   # login: master@dioli.studio

# 2. Subir o servidor de desenvolvimento
npm run dev            # http://localhost:3000

# 3. Screenshot em 3 tamanhos (celular/tablet/desktop)
node scripts/shot.mjs /auth/signin signin
```

## Componentes shadcn/ui

- Base instalada (Base UI), tematizada para a marca em `app/globals.css`.
- Adicionar componente: `npx shadcn@latest add <nome>` (ex.: `dialog`, `input`, `select`).
- Preferir shadcn para primitivas com acessibilidade difícil (diálogos, menus, tooltips).
