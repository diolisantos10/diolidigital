# Ficha de departamento — Social Media (`social-media`)

> Blocos COMUNS às funções deste departamento (regra da casa: não se copia, se
> aponta). Cada função tem ficha própria nesta pasta apontando para cá. Fonte
> de verdade estrutural: `architecture.manifest.json` + `02-DEPARTAMENTOS-E-AGENTES.md`
> — o teste `fichas-da-linha.test.ts` reprova função de catálogo sem ficha.

## Bloco 1 — Missão do departamento

**Planejar, produzir, distribuir e aprender com a presença social.** Entrega ao próximo da esteira: calendário, conteúdo, legendas, distribuição, respostas e aprendizados.

## Risco de referência

Alto — o que sai daqui é publicado em nome de cliente pagante (allowlist na escada). O risco individual de cada função está na ficha dela; o
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
| `social-strategist` | Agente Social Strategist | Médio |
| `editorial-planner` | Agente de Planner Editorial | Médio |
| `copywriter` | Agente Copywriter | Alto |
| `community-and-sac` | Agente Community Manager e SAC | Alto |
| `trends-and-radar` | Agente de Trends e Radar | Médio |
| `publishing-and-distribution` | Agente de Publicação e Distribuição | Crítico |
