# Case sintético FAROL 27 — o que a máquina fez e onde ela parou

> **Cliente 100% fictício.** Nenhuma conta, credencial, campanha, verba,
> publicação ou dado real foi tocado. Banco descartável próprio
> (`.case-farol-27/farol.db`), `CLIENTE_FALSO=1` ligado (trava de saída de
> e-mail/WhatsApp), contatos em domínio `.invalid` (RFC 2606).
> Prova no banco: `AdCampaign = 0`, `WhatsAppOutbox = 0`, `AIRunLog = 0`.

## Como rodar

```bash
cd <repo>
npm install
npx tsx scripts/case-farol-27.mts        # monta o case do zero, custo R$ 0,00
npm run build
DATABASE_URL="file:$PWD/.case-farol-27/farol.db" \
  AUTH_SECRET="case-farol-27-local-only-secret" CLIENTE_FALSO=1 \
  PORT=3127 node .next/standalone/server.js
```

Ficha do cliente: `/agency/clients/<clienteId>` · login `ceo@case-farol-27.local` / `farol27`
Portal do cliente: `/portal/access/<token>` (o script imprime os dois)

⚠️ **O portal só funciona no build de produção.** Em `next dev` a página fica
presa em "Abrindo seu portal…" com `ERR_CONNECTION_RESET` num chunk. Achado.

## A nota: 42/100

Critério: peso igual para (a) o cliente entra e é entendido; (b) a agência
produz sozinha; (c) o cliente decide pelo portal; (d) a casa se protege
(verba, marca, dado, mensagem); (e) a casa é honesta sobre o que não sabe.
(c), (d) e (e) vão bem. (a) e (b) reprovam — e são as duas que fazem dinheiro.

## Os 12 departamentos

| Departamento | Rodou na máquina? | O que falta |
|---|---|---|
| Atendimento/SDR | **SIM** — 13 turnos, escopo capturado, pedido criado | o escopo sai **errado** (ver falhas) |
| Project Management | **SIM** — projeto e 4 tarefas nasceram sozinhos | não há gerente que confira o escopo antes de produzir |
| Estratégia | tentou e **falhou** — sem chave de IA | nada; é a chave |
| Branding | **NÃO existe especialista de branding** na esteira de produção | departamento inteiro sem executor |
| Social Media | tentou e **falhou** — sem chave de IA | nada; é a chave |
| Design/Produção | tentou e **falhou**; imagem nem chegou a ser tentada | chave de IA + geração de imagem |
| Tráfego (Meta+WhatsApp) | guardião de verba **funciona** (determinístico, sem rede) | nenhuma campanha pôde ser montada (sem conta) |
| Tráfego (TikTok) | **não existe** — `lib/integrations` só tem `meta` e `google` | módulo TikTok inteiro: leitura, criação, guardião de verba |
| Analytics | tentou e **falhou** — sem chave de IA | e não há **nenhum** monitor de integridade de evento |
| Qualidade/Compliance | auditor existe (`quality-auditor.ts`) mas **não rodou**: sem peça produzida não há o que auditar | nada barrou o consentimento ausente dos 6 mil contatos de WhatsApp |
| Financeiro | modelo existe (`DRE`, `LancamentoFinanceiro`); **nada foi lançado** | honorário/mídia não viram lançamento sozinhos |
| Operações/Segurança | trava de saída **funcionou** | — |
| Produto & Tecnologia | superfícies existem; não entra no fluxo do cliente | — |

**Placar:** 3 de 12 rodaram de ponta a ponta na máquina (SDR, PM, e a metade
Meta do Tráfego). 6 falharam por falta de chave de IA. 3 não têm caminho.

## Os 8 eventos

| # | Evento | Veredito | Prova |
|---|---|---|---|
| 1 | WhatsApp ausente | **máquina** | `semPii` apaga sequências de 8+ dígitos antes de o texto chegar ao modelo; 0 das 32 peças tem número; `MaterialRequest` aberto; CTA foi para o direct. ⚠️ **mas** `Client.phone` guardou o WhatsApp de contato da Ana como se fosse número da loja — a casa não distingue os dois |
| 2 | Conflito de logo | **à mão** | dois `BrandUpdate` gravados, consolidação suspensa por mim. Não existe comparador de ativos de marca nem estado "consolidação suspensa" |
| 3 | Peça desalinhada (recusar/refazer) | **máquina** | `reprovarPeca()` exigiu motivo (mín. 12 chars) e autor, gravou volta 1, e transformou o motivo em **proibição do cliente** (`otario`) |
| 4 | Ajuste simples (pedir ajustes) | **máquina** | `refazerPorPedidoDoCliente()` achou a entrega certa, gravou a proibição, tentou refazer, **não conseguiu por falta de IA e ESCALOU em vez de fingir** |
| 5 | Cancelamento de uma entrega | **máquina** | decisão canônica `cancel` exige comentário; aprovação → `cancelled`, entrega → `cancelled`; as outras 10 seguem vivas |
| 6 | Risco de verba (teto do TikTok) | **à mão** | `conferirOrcamento({900, teto 150})` recusou **antes de qualquer rede** — mas é o guardião da **Meta**. Para TikTok não existe nada; reusei o da Meta à mão |
| 7 | Falha de tracking | **à mão** | não existe nada que compare eventos esperados × recebidos. Detectei, alertei, tentei recuperar (impossível) e marquei o dado como não confiável — tudo à mão |
| 8 | Handoff sem aceite | **máquina** | `HandoffV2` nasceu `aguardando_recebimento` e ficou; e o aceite de quem não escreve no destino foi **recusado** pela máquina |

**4 pela máquina, 4 à mão, 0 não tratados.**

## As falhas que este case encontrou

1. **O escopo sai errado, e é o defeito mais caro.** A Ana abriu dizendo
   *"queremos reposicionar a marca e lançar o Clube"* e pediu 3 posts/semana,
   stories e 8 vídeos. O escopo gravado foi:
   `wantsSocialMedia: false`, `branding.requested: false`, `wantsRebrand: false`,
   `services: ["paid_traffic"]`. **A casa vendeu só tráfego pago.**
2. **O orçamento saiu R$ 500–1.200/mês**, com confiança `"high"`, para um
   cliente que declarou R$ 8.000/mês. Não é caro demais — é **barato demais**,
   e "high" é confiança em cima de um escopo que perdeu 2/3 do trabalho.
   A verificação `declarado-chega-ao-orcamento` **quebrou**.
3. **`businessName` virou `"Farol"`** no escopo — o nome do negócio foi cortado.
4. **Sem chave de IA a agência entrega ZERO.** A esteira foi até a produção,
   tentou 7 tarefas e devolveu `failed` em todas. Não é degradação: é parada.
   A chave é lida do banco cifrado (Integrações → IAs); aqui não havia nenhuma.
5. **Não existe branding na produção.** `TODOS_OS_ESPECIALISTAS` tem 14
   especialistas em 6 departamentos: strategy, social-media, design,
   paid-traffic, analytics, financeiro. Branding, Qualidade, Operações,
   Produto & Tecnologia, PM e SDR não têm executor.
6. **O Modo Básico / Modo Avançado do portal não está nesta base** — vive num
   branch não mesclado (`agent/portal-cliente-modos-basico-avancado`). Ana e
   Lucas veem exatamente a mesma tela.
7. **Portal quebrado em `next dev`** (funciona em produção).
8. **Contagem divergente no portal:** o cabeçalho diz "3 decisões pendentes" e
   a lista mostra 2.
9. **A rota autenticada de aprovação de escopo não pôde ser exercida** em
   processo (401) — a camada de autenticação segue sem medição fora do navegador.

## Gargalos e riscos residuais

- **A chave de IA é ponto único de falha absoluto.** Sem ela não há agência.
- **Nada barra o consentimento ausente** dos ~6 mil contatos de WhatsApp. Hoje
  isso é uma linha de texto num documento, não uma trava de código
  (guardrail 4: prompt é aviso, código é trava).
- **TikTok não existe como sistema** — só como palavra em prompt.
- **Nenhum monitor de integridade de medição.** Perder evento é invisível.
- **Ficha de cliente sem separação entre telefone de contato e número público.**

## A pergunta

**A Dioli está pronta para receber cliente real? Não. 42/100.**

O que falta para os 100, em ordem de dano:
1. **Consertar o escopo do SDR** (perde branding e social media, corta o nome
   do negócio, precifica só tráfego) — sem isso a agência vende errado no
   primeiro contato, e nenhum conserto depois recupera a margem.
2. **Chave de IA com saldo, e um plano B declarado para quando ela cair.**
3. **Especialista de Branding e de Qualidade na esteira de produção.**
4. **Módulo TikTok com guardião de verba próprio.**
5. **Monitor de integridade de eventos de medição.**
6. **Trava de código para consentimento de base de contatos.**
7. Mesclar o Modo Básico/Avançado do portal.
8. Separar telefone de contato de número público na ficha.
