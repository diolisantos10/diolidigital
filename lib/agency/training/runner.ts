import { initProspectConvState, processProspectMessage } from "@/lib/agency/prospect-engine";
import { canSubmitProposal, buildHandoffSummary } from "@/lib/agency/sdr-agent";
import type { SimulationScenario, SimulationRun, PersonaAnswers, DynamicScenarioMetadata } from "./types";

const ENGINE_VERSION = "sdr-v1.0.0";
const MAX_TURNS = 14;

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function detectQuestionTopic(text: string): keyof PersonaAnswers {
  const t = text.toLowerCase();
  if (/seu nome|nome do.{0,10}negócio|nome.{0,10}empresa|qual.{0,10}nome/i.test(t))  return "identity";
  if (/e-mail|email|contato.*email|email.*contato/i.test(t))                          return "email";
  if (/whatsapp|telefone|celular|número.{0,10}contato/i.test(t))                      return "phone";
  if (/orçamento|investimento|budget|quanto.{0,10}(tem|você|planejou)|faixa.{0,10}(invest|preço)|estimativa.*está/i.test(t)) return "budget";
  if (/objetivo|resultado|quer.{0,15}(conseguir|alcançar)|principal.*meta|foco.{0,10}(rede|digital)/i.test(t)) return "objective";
  if (/tráfego pago|anúncios|ads|campanhas.{0,10}pag/i.test(t))                      return "traffic";
  if (/identidade visual|logo|marca.*visual|branding/i.test(t))                       return "branding";
  if (/posts|postagens|frequência|vezes.{0,10}semana|quantas.{0,10}(vezes|posts)|ritmo/i.test(t)) return "frequency";
  if (/social media|redes sociais|instagram|facebook|tiktok|linkedin/i.test(t))       return "service";
  return "default";
}

interface RunMeta {
  origin:   "seed" | "dynamic";
  seed?:    string;
  metadata?: DynamicScenarioMetadata;
}

export function runSDRSimulation(scenario: SimulationScenario, runMeta?: RunMeta): SimulationRun {
  const startedAt = new Date().toISOString();
  const id = `run_${uid()}`;
  const origin = runMeta?.origin ?? "seed";

  try {
    let state = initProspectConvState();
    let turnCount = 0;
    let objectionInjected = false;

    state = processProspectMessage(scenario.initialMessage, state);
    turnCount++;

    while (turnCount < MAX_TURNS && !canSubmitProposal(state.conv, state.sdr)) {
      const lastAssistant = [...state.conv.messages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (!lastAssistant) break;

      let userMsg: string;

      if (
        scenario.objectionMessage &&
        !objectionInjected &&
        scenario.objectionAfterTurn !== undefined &&
        turnCount >= scenario.objectionAfterTurn
      ) {
        userMsg = scenario.objectionMessage;
        objectionInjected = true;
      } else if (state.sdr.objection.active && scenario.acceptanceMessage) {
        userMsg = scenario.acceptanceMessage;
      } else {
        const topic = detectQuestionTopic(lastAssistant.text);
        userMsg = scenario.personaAnswers[topic] ?? scenario.personaAnswers.default;
      }

      state = processProspectMessage(userMsg, state);
      turnCount++;
    }

    const completedAt = new Date().toISOString();
    const handoff = state.sdr.qualificationScore >= 4
      ? buildHandoffSummary(state.conv, state.sdr)
      : null;

    return {
      id,
      agentId:          "sdr",
      scenarioId:       scenario.id,
      scenarioName:     scenario.name,
      startedAt,
      completedAt,
      transcript:       state.conv.messages,
      finalScope:       state.conv.scope,
      finalEstimate:    state.conv.estimate,
      finalSdrState:    state.sdr,
      sdrHandoff:       handoff,
      score:            0,
      verdict:          "fail",
      issues:           [],
      recommendations:  [],
      engineVersion:    ENGINE_VERSION,
      status:           "completed",
      scenarioOrigin:   origin,
      scenarioSeed:     runMeta?.seed,
      scenarioMetadata: runMeta?.metadata,
    };
  } catch {
    return {
      id,
      agentId:          "sdr",
      scenarioId:       scenario.id,
      scenarioName:     scenario.name,
      startedAt,
      completedAt:      new Date().toISOString(),
      transcript:       [],
      finalScope:       null,
      finalEstimate:    null,
      finalSdrState:    null,
      sdrHandoff:       null,
      score:            0,
      verdict:          "fail",
      issues:           [{ criterion: "runner_error", description: "Runner threw an exception", severity: "error" }],
      recommendations:  [],
      engineVersion:    ENGINE_VERSION,
      status:           "failed",
      scenarioOrigin:   origin,
      scenarioSeed:     runMeta?.seed,
      scenarioMetadata: runMeta?.metadata,
    };
  }
}
