# Pendências — o que está aberto

> Última atualização: 01/08/2026, na montagem do PM.
>
> Lista curta e viva. Cada linha diz **o que quebra se ninguém mexer** — não só o
> nome da tarefa. Atualize ao concluir ou repriorizar.

---

## 🔴 P0 — o piloto roda sem rede embaixo

**Decisão do CEO (31/07/2026): o piloto roda 100% IA, sem revisão humana.** Nada
disto abaixo é teórico — é o que está entre um erro do modelo e um cliente pagante.

### 1. Os quality gates não protegem nada
Das **31** checagens em `lib/dioli-brain/quality-gates.ts`, **28 são
`autoCheckable: false`** — texto descrevendo o que um humano deveria conferir.
**Só 3 rodam.**

Com revisão humana era um checklist. Sem revisão humana é **decoração** — e as
quatro desligadas que mais importam são exatamente as falhas que chegam no
cliente: *sem alucinação*, *respeita a marca*, *corresponde ao briefing*, *riscos
verificados*.

**O que precisa existir:**
1. Piso determinístico — afirmação conferida contra `ClientKnowledgeSnapshot`
   (nome, número, prazo, serviço contratado)
2. LLM-judge para os subjetivos, com reprovação **bloqueante** e indisponibilidade
   **não-bloqueante**
3. Default do registry invertido — departamento sem gate executável = **REPROVADO**
4. Escada por departamento — sombra até haver evidência

> **Nota de procedência:** esta pendência esteve arquivada por engano no
> repositório do Foocci até 01/08/2026. Conferido: o Foocci não tem nenhuma
> ocorrência de `autoCheckable`. Uma pendência na casa errada não é etiqueta
> trocada — é uma pendência que ninguém pega.

### 2. A verdade do cliente é montada no cliente
`reason.ts` ainda depende de contexto entregue de fora — o próprio cabeçalho diz
*"Phase 2 will add ClientKnowledgeSnapshot"*. Enquanto o servidor não ler a verdade
do banco por conta própria, o raciocínio confia no que lhe entregam.

### 3. Escada por departamento não existe
Departamento novo deveria nascer em SOMBRA e subir com evidência. Rodar 100% IA
**não** significa pular a escada — significa que a escada é a única proteção que
sobrou.

---

## 🟠 O pipeline quebra no meio

Documentado em `BACKLOG.md` e ainda aberto:

```
Briefing → Proposta → Projeto + Tarefas          ✅ conectado
   → [QUEBRA] a tarefa não aciona o agente
   → o canvas não vira deliverable
   → o portal do cliente fica vazio               ❌
```

Decorrências verdadeiras hoje:

- O portal **só** mostra conteúdo se alguém criou o Deliverable **na mão**
- O fluxo aprovar → publicar no portal **nunca foi testado ponta a ponta**
- Vários departamentos produzem por **template, com zero IA**. O que existe de IA
  real é a extração do briefing e a geração de imagem no Design

---

## 🟡 Fila normal

| O que | Por que importa |
|---|---|
| Gemini é stub | `lib/ai/gemini-provider.ts` não está implementado — o registry oferece um provedor que não existe |
| Canvas nunca vira documento entregável | O motor produz, o cliente não recebe |
| Sem `middleware.ts` | Sessão validada em cada layout e handler — fácil esquecer um |

---

## 🧍 Fora do código — depende de gente

- **Compilar e arquivar os chats antigos.** Ver `docs/arquivo/README.md` para o
  protocolo. **Nenhum chat é fechado antes de exportado e minerado.**
- **Definir se o piloto sobe antes ou depois do P0 acima.** É decisão do CEO, e
  hoje a resposta honesta é: sem os gates, sobe sem proteção.

---

## ⏳ Aguardando terceiro — nada a configurar

### HTTPS do domínio raiz `diolidigital.com.br`
O `www` está no ar e responde HTTP/2 200. O **apex** (sem www) depende do Railway
emitir o certificado Let's Encrypt, o que é automático depois de o DNS estabilizar.

Já feito no painel de DNS: `A` do apex → `69.46.46.22`, `MX` legado **removido**,
`TXT` de verificação adicionado, `CNAME` `www` → `g68qzvs8.up.railway.app`.

**Como confirmar** — de uma máquina normal, **não de dentro de um ambiente de
agente**: abrir `https://diolidigital.com.br` e ver o cadeado, ou
`curl -I https://diolidigital.com.br` devolver `HTTP/2 200`.

Se passar de ~2h, conferir no painel do Railway se o apex e o `www` estão listados
como **duas entradas separadas** de custom domain.

> Origem: `HANDOFF.md` §7.1 e §8.1 (commit `3f888f1`), minerado em 01/08/2026.
