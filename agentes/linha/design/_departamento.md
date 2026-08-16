# Ficha de departamento — Design e Produção Criativa (`design`)

> Blocos COMUNS às funções deste departamento (regra da casa: não se copia, se
> aponta). Cada função tem ficha própria nesta pasta apontando para cá. Fonte
> de verdade estrutural: `architecture.manifest.json` + `02-DEPARTAMENTOS-E-AGENTES.md`
> — o teste `fichas-da-linha.test.ts` reprova função de catálogo sem ficha.

## Bloco 1 — Missão do departamento

**Transformar estratégia e marca em peças visuais e audiovisuais.** Entrega ao próximo da esteira: arquivos versionados, formatos finais, fontes e vínculo com briefing/brand rules.

## Risco de referência

Alto — a peça chega ao cliente pagante (allowlist na escada). O risco individual de cada função está na ficha dela; o
dono de negócio (CEO) ajusta quando quiser.

## A hierarquia, para não restar dúvida

```
CEO → Diretor → Gerente Geral → **Gerente de Design e Produção Criativa** (`manager-design`) → funções desta pasta
```

Toda demanda deste departamento entra pelo **Gerente de Design e Produção Criativa**, que recebe do Gerente
Geral e distribui aqui dentro. Nenhuma função desta pasta recebe demanda
de fora nem fala com o cliente.

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
| `manager-design` | Gerente de Design e Produção Criativa | Médio |
| `creative-director` | Agente Diretor Criativo | Médio |
| `graphic-designer` | Agente Designer Gráfico | Alto |
| `motion-designer` | Agente Motion Designer | Médio |
| `video-editor` | Agente de Vídeo e Edição | Médio |
| `adaptation-and-resizing` | Agente de Adaptação e Desdobramento | Baixo |
| `creative-library` | Agente de Biblioteca Criativa | Baixo |
