# Ficha de despacho — Perguntas ao cliente também no PORTAL

**De:** Diretor · **Para:** `pm` · **Data:** 04/10/2026 (noite) · **Ordem do CEO** (canal central)

## Objetivo (uma frase)
O cliente vê, no portal dele, só os fatos que a agência não deduz (cardápio,
preços, endereço, horário, @ das redes) e responde cada um ali mesmo; a
resposta cai na ficha única e a pergunta some.

## Definição de pronto
1. Rota NOVA `app/api/portal/perguntas/route.ts`:
   - `GET` → `{ perguntas, abertas }` usando `perguntasAoCliente(lerFichaUnica(clientId))`
     de `lib/agency/esteira/perguntas-ao-cliente.ts` (já existe — NÃO duplicar regra).
   - `POST { fato, resposta }` → grava na ficha única com `gravarFichaUnica` de
     `lib/agency/esteira/ficha-unica.ts`:
     - `endereco` → campo `endereco`; `horario` → campo `horario`;
     - `arroba` → ACRESCENTA uma linha em `canais` (não apaga o que havia);
     - `cardapio` e `precos` → ACRESCENTAM linhas em `produtos` (não apagam).
     - resposta vazia ou > 2000 caracteres → 400. `fato` fora dos 5 → 400.
   - Autenticação e posse IGUAIS a `app/api/portal/marca/route.ts`
     (`tokenDoPortal` + `validatePortalAccess`; o `clientId` vem do token,
     NUNCA do corpo nem da query). Copie o padrão daquela rota.
2. Componente NOVO `components/portal/cliente/PerguntasPendentes.tsx` ("use client"):
   - lista só as perguntas abertas; cada uma com a pergunta em texto, um
     campo de resposta e botão "Enviar" (altura mínima 44px — celular primeiro);
   - ao enviar, chama o POST e some da lista; sem perguntas abertas, o
     componente NÃO renderiza nada (retorna null);
   - estados: carregando, erro com frase humana, vazio = null.
   - Use os tokens de cor do `DESIGN.md` (nada de hex na mão quando há token).
3. Montar o componente no TOPO da aba "Visão Geral" (`inicio`) do portal,
   em `app/portal/access/[token]/page.tsx`. Não remover nada do portal.
4. Teste NOVO `__tests__/portal/perguntas-no-portal.test.ts`, com prisma
   mockado (veja `__tests__/esteira/perguntas-ao-cliente.test.ts` e testes de
   rotas do portal em `__tests__/portal/` como referência), cobrindo:
   - sem token válido → 401/403 e nada gravado;
   - `clientId` no corpo é IGNORADO (vale o do token);
   - `arroba` acrescenta em `canais` sem apagar a linha anterior;
   - `fato` inválido → 400;
   - GET devolve só as abertas.
   ⚠️ Mock com assinatura: `vi.fn(async (): Promise<...> => ...)` — sem isso o
   `tsc` do CI barra (`never[]`). Ver CLAUDE.md, seção "tsc --noEmit DEPOIS".

## Restrições — o que NÃO fazer
- Não mexer em post, calendário, publicação, plano B (ordem do CEO: esquecer posts).
- Não mandar mensagem a ninguém (WhatsApp/e-mail). Só tela e rota.
- Não criar migration (os campos já existem na ficha única, coluna `extra`).
- Não alterar `perguntas-ao-cliente.ts` além do necessário; se alterar, manter
  os testes de `__tests__/esteira/perguntas-ao-cliente.test.ts` verdes.
- Não commitar, não dar push: o Diretor roda o portão e commita.

## Critério de aceite
`npx tsc --noEmit` limpo e `npx vitest run __tests__/portal __tests__/esteira/perguntas-ao-cliente.test.ts`
verde (o Diretor roda). Devolver: lista de arquivos criados/alterados, com
uma linha do que cada um faz.
