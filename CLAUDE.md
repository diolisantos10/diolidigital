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

## O perfil de risco DESTA casa (não é o do Foocci)

O kit foi extraído do Foocci, onde o agente fala **ao vivo com o cliente final** e
um erro às 21h de sábado não é visto por ninguém. **Aqui é diferente:** os
departamentos produzem entregáveis (canvas, post, peça) que **um humano aprova
antes de chegar ao cliente**. O humano é o portão.

Consequência prática, para não plantar cerimônia à toa:

- **Aplique** os princípios de verdade ancorada, ausência-de-informação-não-é-
  informação, trava-vs-aviso e "agente nunca muda as próprias regras".
- **Não** replique aqui a maquinaria de tempo real do Foocci (crítico por
  mensagem, escada de liberação por telefone, simulação noturna de conversa) sem
  antes existir um agente que fale direto com o cliente, sem revisão humana.
- **Se algum dia um agente daqui falar direto com o cliente final**, o perfil de
  risco vira o do Foocci e o kit inteiro passa a valer. Trate como mudança
  estrutural: aprovação do CEO.

> **Estado conhecido dos quality gates (31/07/2026):** das 31 checagens em
> `lib/dioli-brain/quality-gates.ts`, **3 rodam sozinhas e 28 são item de
> checklist humano** (`autoCheckable: false`). Isso é aceitável enquanto um humano
> aprova todo entregável — mas precisa ser uma **decisão conhecida**, não um
> acidente. Se a revisão humana afrouxar, os 28 viram buraco.

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
