"use client";

// Hook for the PM Orchestrator proposal flow: request → approve → apply.
// propose() asks the server for a DRAFT ProjectProposal; apply() commits it via
// the only state-mutating route. The proposal is never applied automatically.

import { useState, useCallback } from "react";

export interface OrchestratorTask {
  title: string;
  description: string;
  department: string;
  priority: "critical" | "high" | "medium" | "low";
  estimatedDays: number;
}

export interface OrchestratorProposal {
  name: string;
  goal: string;
  stage: string;
  tasks: OrchestratorTask[];
  reasoningMode: "openai" | "rule_based";
  model: string;
  warnings: string[];
}

export type OrchestratorStatus =
  | "idle"
  | "proposing"
  | "proposed"
  | "applying"
  | "done"
  | "error"
  | "disabled";

export interface UsePMOrchestrator {
  status: OrchestratorStatus;
  proposal: OrchestratorProposal | null;
  projectId: string | null;
  error: string | null;
  propose: () => Promise<void>;
  apply: (proposal: OrchestratorProposal) => Promise<void>;
  reset: () => void;
}

export function usePMOrchestrator(clientRequestId: string): UsePMOrchestrator {
  const [status, setStatus] = useState<OrchestratorStatus>("idle");
  const [proposal, setProposal] = useState<OrchestratorProposal | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const propose = useCallback(async () => {
    setStatus("proposing");
    setError(null);
    try {
      const res = await fetch("/api/brain/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientRequestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      if (data.enabled === false) {
        setStatus("disabled");
        return;
      }
      setProposal(data.proposal as OrchestratorProposal);
      setStatus("proposed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar proposta.");
      setStatus("error");
    }
  }, [clientRequestId]);

  const apply = useCallback(
    async (toApply: OrchestratorProposal) => {
      setStatus("applying");
      setError(null);
      try {
        const res = await fetch("/api/brain/orchestrate/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientRequestId, proposal: toApply }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        setProjectId((data as { projectId?: string }).projectId ?? null);
        setStatus("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao criar projeto.");
        setStatus("error");
      }
    },
    [clientRequestId],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setProposal(null);
    setProjectId(null);
    setError(null);
  }, []);

  return { status, proposal, projectId, error, propose, apply, reset };
}
