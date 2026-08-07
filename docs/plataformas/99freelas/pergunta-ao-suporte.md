# A pergunta ao suporte do 99Freelas — texto congelado

**Estado: NÃO ENVIADA.** Quem envia é o CEO. Nenhum agente desta casa mandou
nada, e nenhum vai mandar sem ordem explícita.

**Por que este arquivo existe:** a resposta a esta pergunta é a UMA COISA que
transforma o veredito 🟠 em 🟢 e troca `HUMAN_GATE` por `ALLOW` no envio de
propostas. Pergunta reescrita de memória três semanas depois vira outra
pergunta — e uma resposta a outra pergunta não autoriza nada.

- **Destinatário:** `suporte@99freelas.com.br`
- **Campo que a resposta preenche:** `policy.json → autorizacao_do_suporte`
- **Assunto sugerido:** Uso de agente de software próprio na nossa conta —
  automação de envio de propostas é permitida?

## O texto, palavra por palavra (ditado pelo CEO em 07/08/2026)

> Pretendemos utilizar um agente de software interno para acessar nossa própria
> conta, identificar projetos compatíveis, analisar o briefing, preparar
> propostas individualizadas e submetê-las respeitando os limites da nossa
> assinatura. É permitido que esse agente também realize automaticamente o
> clique de envio das propostas, sem envio em massa e sem violação das regras de
> contato externo?

## O que fazer com a resposta

1. Arquivar o e-mail (cabeçalho + corpo) em
   `docs/plataformas/99freelas/fontes/resposta-do-suporte-<data>.md`.
2. Preencher `policy.json → autorizacao_do_suporte`:
   `status`, `respondido_em`, `canal`, `remetente` e `evidencia`.
3. **As três metades são obrigatórias juntas.** `status: "autorizado"` sozinho
   NÃO destrava: sem `respondido_em` e sem `evidencia`, o gate ignora — status é
   a parte fácil de escrever com otimismo.
4. Nada mais muda. Não há flag de ambiente, não há `if` no código e não há
   parâmetro de força. É a linha de dado, e só ela.

## Se a resposta for NÃO, ou não vier

`status: "negado"` ou `"sem_resposta"`. O sistema continua exatamente como está
hoje — fazendo tudo menos o clique. **Isso não paralisa a operação:** com 240
conexões/mês, um humano clicando algumas vezes por dia não é gargalo nenhum.

## ⚠️ Quem deve mandar, e por quê

**O melhor remetente é o Gmail do próprio CEO**, não o remetente transacional da
agência. Duas razões, as duas práticas:

1. **A resposta cai na caixa dele**, e não numa caixa que ninguém abre.
2. **O suporte reconhece o titular da conta.** Uma pergunta sobre automação
   vinda de um endereço que não é o do cadastro é a pergunta mais fácil de
   ignorar — ou a mais fácil de responder com "não".

**Diagnóstico do remetente da casa (medido em 07/08/2026):** o domínio
`diolidigital.com.br` **não tem nenhum registro TXT, nenhum MX e nenhum
`resend._domainkey`** — ou seja, não está verificado no Resend. E `dioli.studio`
(o domínio do exemplo no código) **não resolve: NXDOMAIN**. Com isso,
`lib/email/send.ts` cairia no remetente compartilhado
`Dioli Studio <onboarding@resend.dev>`, que **só entrega para o dono da conta
Resend** — o e-mail nunca chegaria ao 99Freelas. Ver `docs/decisoes.md`.
