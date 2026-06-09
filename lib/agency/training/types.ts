import type { ConvMessage, BriefingScope, LiveEstimate } from "@/lib/agency/briefing-conversation";
import type { SDRHandoff, SDRAgentState } from "@/lib/agency/sdr-agent";

export type SimulationDifficulty = "easy" | "medium" | "hard" | "extreme";
export type SimulationVerdict    = "pass" | "warning" | "fail";
export type SimulationStatus     = "completed" | "failed";
export type ImprovementImpact    = "low" | "medium" | "high" | "critical";
export type ImprovementStatus    = "pending" | "approved" | "rejected" | "applied";
export type IssueSeverity        = "warning" | "error";

export interface PersonaAnswers {
  identity:  string;
  email:     string;
  phone:     string;
  service:   string;
  frequency: string;
  budget:    string;
  objective: string;
  traffic:   string;
  branding:  string;
  default:   string;
}

export interface SimulationScenario {
  id:                   string;
  agentId:              "sdr";
  name:                 string;
  segment:              string;
  difficulty:           SimulationDifficulty;
  persona:              string;
  initialMessage:       string;
  personaAnswers:       PersonaAnswers;
  expectedBehaviors:    string[];
  objectionTypes:       string[];
  budgetRange?:         { min: number; max: number };
  targetServices:       string[];
  objectionMessage?:    string;
  objectionAfterTurn?:  number;
  acceptanceMessage?:   string;
  createdAt:            string;
}

export interface DynamicScenarioMetadata {
  segment:          string;
  businessMaturity: string;
  personaTone:      string;
  budgetProfile:    string;
  objectionProfile: string;
  materialProfile:  string;
  serviceIntent:    string;
}

export interface SimulationIssue {
  criterion:   string;
  description: string;
  severity:    IssueSeverity;
}

export interface SimulationRun {
  id:               string;
  agentId:          "sdr";
  scenarioId:       string;
  scenarioName:     string;
  startedAt:        string;
  completedAt:      string;
  transcript:       ConvMessage[];
  finalScope:       BriefingScope | null;
  finalEstimate:    LiveEstimate  | null;
  finalSdrState:    SDRAgentState | null;
  sdrHandoff:       SDRHandoff    | null;
  score:            number;
  verdict:          SimulationVerdict;
  issues:           SimulationIssue[];
  recommendations:  string[];
  engineVersion:    string;
  status:           SimulationStatus;
  // Provenance
  scenarioOrigin:   "seed" | "dynamic";
  scenarioSeed?:    string;
  scenarioMetadata?: DynamicScenarioMetadata;
}

export interface AgentImprovementSuggestion {
  id:             string;
  agentId:        "sdr";
  sourceRunIds:   string[];
  title:          string;
  problem:        string;
  evidence:       string;
  suggestedChange: string;
  impact:         ImprovementImpact;
  status:         ImprovementStatus;
  createdAt:      string;
  decidedAt?:     string;
}
