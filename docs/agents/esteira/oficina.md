# Oficina — esteira

> Registro de bancada. O que foi feito, o que foi decidido e o que ficou aberto.
> Escrito pelo especialista; quem promove para a vitrine é o PM.

---

## 2026-08-06 · A régua de recompra (30/60/90)

**O buraco:** cliente compra no balcão, recebe a peça e some. Não havia segundo
contato de espécie nenhuma — nem automático, nem fila, nem lembrete.

**O que entrou**

- `lib/agency/esteira/recompra.ts` — a régua inteira, sem IA.
- `app/api/cron/recompra/route.ts` — o gatilho de tempo (Bearer `CRON_SECRET`,
  mesmo padrão de `cron/radar`).
- `lib/agency/esteira/avisos.ts:24` — `TipoDeAviso` ganhou `"recompra"`.
- `__tests__/esteira/recompra.test.ts` — 23 casos, cada trava com as duas metades.

**As decisões que valem mais que o código**

1. **A régua não fala com a Meta.** Ela produz RASCUNHO na fila humana
   (`GET /api/avisos`) e escreve na conversa do portal. Motivo por escrito em
   `recompra.ts:31-43`: a política do WhatsApp exige opt-in registrado do
   destinatário (`docs/plataformas/meta/fontes/whatsapp-politica-de-mensagens.md`,
   §1) e esta casa **não tem coluna onde registrar isso** — sem prova não há
   autorização. Fora da janela de 24h só sai Modelo aprovado (mesma fonte, §2 +
   `whatsapp-modelos.md`), e um toque de 30 dias está sempre fora da janela por
   definição. Não existe template de marketing aprovado nesta casa.
   **Ligar o disparo automático exige parecer do especialista `meta` + template.**

2. **A idempotência é a CHAVE PRIMÁRIA**, não uma consulta prévia.
   `idDoToque()` monta `recompra-<marco>-<sha256(clientId|entregaId|marco)>` e o
   `ClientNotice` nasce com esse id. A segunda passada do cron estoura P2002 e
   vira no-op — inclusive a mensagem do portal, que fica *depois* do create de
   propósito: um único ponto de trava para os dois efeitos.

3. **A janela de tolerância (15 dias) é o que impede o massacre da estreia.**
   `marcoDevido(dias)` só devolve marco se `M <= dias <= M+15`. Sem ela, ligar a
   régua num banco com histórico dispararia os três toques em dias seguidos para
   clientes de um ano atrás. É função pura do tempo — não precisa de estado, logo
   não pode divergir dele.

4. **Preço só quando DUAS tabelas concordam.** `precoParaOferecer()` exige o
   número em `SELF_SERVE_CATALOG` **e** autorização de `podeFechar()` de
   `comercial/negociacao.ts`. Item sem linha na tabela de piso (reel, banner,
   identidade, packs) sai **sem número**. E a régua não dá desconto em marco
   nenhum: desconto que sai sozinho ensina a carteira que o preço cheio era
   encenação.

5. **A régua termina.** O toque de 90 dias diz, no texto, que é o último. Régua
   que não termina é perseguição — e a política da Meta manda respeitar pedido de
   parar mesmo fora do WhatsApp.

**A corrente, andada inteira**

`balcao/producao.ts` cria `Project{type:"balcao", clientRequestId}` →
`execution/run-execution.ts:870` chama `esteira/marcos.ts:apresentar` →
`marcos.ts:201` carimba `visibility:"compartilhado"` → **é essa a âncora que a
régua lê**. Se a escada de exposição reter a peça (departamento em SOMBRA), a
visibilidade fica `interno` e a régua corretamente não dispara: ele não recebeu.

**O que ficou aberto**

- O cron precisa de agendamento externo (Railway). Não existe arquivo de registro
  de crons no repo — `cron/radar` e `cron/execute` também dependem disso.
- Texto barrado pela trava de promessa de resultado não vira `ClientNotice`: sai
  só como linha de `parados` na resposta do cron. É fail-closed correto, mas a
  visibilidade é fraca — depende de alguém ler a resposta do cron.
- O canal e-mail não existe na casa. Com opt-in de WhatsApp registrável, ou com
  e-mail transacional, a régua ganha braço automático sem mudar de desenho.
