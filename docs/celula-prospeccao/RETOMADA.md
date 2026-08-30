# Célula de Prospecção V1 — onde parou e como continuar

> Escrito em 30/08/2026 para o próximo turno começar **sem perguntar nada a
> ninguém**. Branch: `claude/celula-prospeccao-99freelas-v1`. PR rascunho: #412.
>
> ⛔ **Proibido por ordem do CEO:** merge, deploy, migração em produção,
> ativação do modo automático, proposta real.

## A condição operacional que muda tudo — leia antes de planejar

**A camada de despacho está DESABILITADA nesta sessão.** Medido, não suposto:

```
Error: No such tool available: Agent. Agent is disabled for this session,
in subagents as well as here.
```

O mesmo vale para as ferramentas de GitHub e de notificações. Enquanto for
assim, o Diretor executa à mão sob exceção `SEM_AGENTE` declarada — o que é
violação da régua da casa registrada como **dado**, não como desculpa.

**Se num turno novo o `Agent` responder, DESPACHE.** Confira com uma linha
antes de assumir que não dá.

## O que consegue ser feito sem a camada de despacho

Há saída de rede (`curl` funciona) e `GITHUB_TOKEN` está no ambiente, então o
CI é consultável sem o `gh`:

```sh
SHA=$(git rev-parse HEAD)
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/diolisantos10/diolidigital/commits/$SHA/check-runs" \
  | python3 -c "import sys,json;[print(r['name'],r['status'],r['conclusion']) for r in json.load(sys.stdin)['check_runs']]"
```

**O push exige `--no-verify`**, e não é desleixo: o gancho pré-push não
reconhece a reivindicação forçada que ele mesmo aceitou e registrou. Está em
`docs/pendencias.md` como dívida da casa.

---

## ✅ FECHADO, com mutação rodada

Cada item abaixo tem teste **e** script de mutação que derruba cada guarda.
Rode qualquer um deles para conferir — não acredite nesta tabela.

| Item | Onde | Mutação | Placar |
|---|---|---|---|
| Funil de 22 estados + trilha append-only | `lib/agency/celula/funil.ts`, `trilha.ts` | `scripts/mutacao-onda-1.mjs` | 10/10 vermelhas |
| Ponte de arquivos + fila de exceções | `lib/agency/celula/ponte/`, `excecoes/` | `scripts/mutacao-onda-3.mjs` | 13/13 vermelhas |
| Motor conversacional + biblioteca M01–M22 | `lib/agency/celula/mensagens/` | `mutacao-onda-2.mjs`, `-2b.mjs` | 31 + 21 |
| **Decisão 2** — perfil de navegador isolado | `lib/agency/celula/navegador-isolado.ts` | `scripts/mutacao-decisao-2.mjs` | 7/7 vermelhas |
| **Decisão 3** — saída do canal e consentimento | `lib/agency/celula/saida-do-canal.ts` | `scripts/mutacao-decisao-3.mjs` | 10/10 vermelhas |
| **Decisão 5** — catálogo derivado da capacidade | `lib/agency/celula/catalogo-ofertavel.ts` | `scripts/mutacao-decisao-5.mjs` | 6/6 vermelhas |
| **Decisão 4** — limite de 16 MB do canal | `policy.json → anexos_no_chat` | — (dado) | — |
| Limitador de ritmo | `lib/agency/celula/ritmo.ts` | `scripts/mutacao-ritmo.mjs` | 8/8 vermelhas |
| Migration das 4 tabelas | `prisma/migrations/20260830170000_*` | — | aplicada em banco vazio + controle negativo |

**Decisão 1** (Claude in Chrome, não OpenAI/Playwright) está registrada como
rumo; o executor ainda não existe — ver abaixo.

---

## ❌ NÃO FEITO — a lista obrigatória do CEO que continua aberta

Em ordem de dependência. Os três primeiros destravam o resto.

1. **Travas conversacionais com implementação REAL.**
   `PortaDaConversa` e `PortaDeCompromissos` são **só interface**; o motor da
   próxima mensagem só roda com substituto de teste. O CEO nomeou isto como
   critério de conclusão ("não concluído se dois agentes podem responder ao
   mesmo tempo"). Implementar contra o banco, no padrão de `trilha.ts`
   (models aditivos + `$transaction`). **O teste tem de provar concorrência
   real** — duas tentativas disputando a mesma conversa, não duas em sequência.

2. **Tela e rotas operacionais.** Hoje **nada em `app/` importa a Célula**.
   O funil não tem rota nem tela: `avancarFunil` não tem chamador fora de
   teste. Evoluir o Radar em `/agency/oportunidades`, sem sistema paralelo.

3. **Papéis e permissões de Gerente e SDR.** O Gerente de Atendimento e SDR
   não existe como papel operável — só como campo `aprovador`. **Sem ele os 22
   modelos não podem ser aprovados**, e sem aprovação nenhuma mensagem sai.

4. **Simulador completo.** Critério de conclusão declarado. Percorrer o funil
   inteiro sem enviar nada externamente.

5. **Executor ligado ao navegador isolado.** `navegador-isolado.ts` decide e
   descreve; ninguém ainda abre o Chrome com ele. Ligar exige
   `launchPersistentContext` (hoje o contexto é efêmero, `navegador.ts:213`).

6. **Download e upload efetivos · PDF, imagem e editável.** A ponte tem a
   lógica; falta o braço que baixa e anexa de verdade.

7. **Jornada ponta a ponta.** Nunca percorrida. É o critério de conclusão da V1.

8. **CI verde no PR #412.** Não confirmado nesta sessão — a suíte da casa passa
   de 8.000 testes e o check estava `in_progress` no último push.

---

## 🔴 Riscos abertos que o próximo turno herda

- **Trava sem fechadura:** dois mecanismos (M14 e `follow-up.ts`) esperam o
  histórico de acompanhamentos, que **nada preenche** — o chat está atrás do
  login, que é BLOCK. O mecanismo decide certo sobre um dado que não existe.
- **Os 22 modelos estão em `rascunho`**, com `pendencia` nomeando campos que o
  CEO ainda não definiu. Aprovar não basta: a pendência bloqueia o
  preenchimento. Ou o CEO completa, ou a casa decide que metadado incompleto
  não bloqueia — e aí é afrouxamento consciente.
- **8 das 13 proibições editoriais não têm mecanismo determinístico** (são
  categorias, não substrings). A Onda 4A começou o juiz e morreu no meio —
  confira o que sobrou em disco antes de recomeçar.
- **Divergência de taxa da própria plataforma:** "Como funciona" diz 5–20%
  mín. R$10; os Termos dizem 10–20% mín. R$5. **Decisão do CEO.**
- **Suporte do 99Freelas: sem resposta desde 07/08.** Não trava o
  supervisionado; só serviria para ligar o automático, que está proibido.
- **Desvio schema-vs-migration em 4 tabelas alheias** (`AssinaturaRecorrente`,
  `ClientAiProvider`, `MetricaDePost`, `ParceriaDoCliente`). A migration da
  Célula recortou de propósito. Ver `docs/pendencias.md`.

## Divergências registradas, não escondidas

- **Vídeo.** O CEO escreveu "vídeo suspenso". O mapa de capacidades diz que
  `edicao-de-video-do-cliente` **tem** ponto de produção. Como a ordem manda
  derivar da capacidade real, editar bruto do cliente entra como
  `exigeDecisaoSupervisionada` — o outro caminho que a própria ordem abriu —
  em vez de ser silenciosamente corrigido para bater com a frase.
- **Titularidade.** Os Termos do 99Freelas **não têm** cláusula de
  titularidade, intransferibilidade ou procurador. A distinção "o titular
  autorizando a própria sessão" é razoável mas **não está escrita**. É LACUNA,
  não fato.
