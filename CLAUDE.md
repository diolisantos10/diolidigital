@AGENTS.md

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
