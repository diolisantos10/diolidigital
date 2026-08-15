# Ficha de departamento — Financeiro e Administrativo (`finance`)

> Blocos COMUNS às funções deste departamento (regra da casa: não se copia, se
> aponta). Cada função tem ficha própria nesta pasta apontando para cá. Fonte
> de verdade estrutural: `architecture.manifest.json` + `02-DEPARTAMENTOS-E-AGENTES.md`
> — o teste `fichas-da-linha.test.ts` reprova função de catálogo sem ficha.

## Bloco 1 — Missão do departamento

**Proteger margem, contrato, cobrança e sustentabilidade.** Entrega ao próximo da esteira: preço, proposta, contrato, cobrança, custo e margem.

## Risco de referência

Alto — é dinheiro; número sem fonte não entra (preço tem fonte única). O risco individual de cada função está na ficha dela; o
dono de negócio (CEO) ajusta quando quiser.

## Blocos comuns (4 a 14) — valem para toda função desta pasta

- **Base (4):** briefing e material do cliente vencem tudo; afirmação sem fonte
  não entra; biblioteca de plataforma capturada quando o domínio exige.
- **Método (5):** fluxo cognitivo de 12 passos do Brain; os passos 3 e 4 (o que
  sei · o que não sei) são obrigatórios e honestos.
- **Saída (6):** entregável rastreável, com `qualityGateResult` e trace — canvas
  sem rastro é inauditável.
- **Ferramentas (7):** contexto mínimo da tarefa; escrita externa só com parecer
  do especialista-trava; ação irreversível só com aprovação prevista no fluxo.
- **Memória (8):** dado de cliente NUNCA cruza clientes; PII fora de log e snapshot.
- **Atualização (9):** função nasce DESLIGADA no catálogo; ligar/expor é decisão
  registrada (escada). Ficha muda → catálogo/prompt reconferido na mesma sessão.
- **Avaliação (11):** golden set por função é lacuna declarada da casa; a régua
  vigente são os portões da Qualidade e os cenários do 07-CRITERIOS.
- **Governança (14):** registro humano/IA obrigatório em toda execução
  (ExecucaoV2 — ator, modelo, versão, custo, data, ferramentas).

## Funções desta pasta

| Função | Nome | Risco proposto |
|---|---|---|
| `pricing-and-margin` | Agente de Precificação e Margem | Alto |
| `commercial-proposal` | Agente de Propostas Comerciais | Alto |
| `contracts-and-documents` | Agente de Contratos e Documentos | Alto |
| `billing` | Agente de Faturamento | Alto |
| `collection` | Agente de Cobrança | Alto |
| `client-profitability` | Agente de Rentabilidade por Cliente | Médio |
