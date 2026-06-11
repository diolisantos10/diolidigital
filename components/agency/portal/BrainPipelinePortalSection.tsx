"use client";

import { useEffect, useState } from "react";

interface PipelineStep {
  id: string;
  departmentKey: string;
  department: string;
  approvedAt: string;
  version: number;
}

interface RequestData {
  id: string;
  businessName: string;
  status: string;
  services: string[];
  createdAt: string;
  pipeline: PipelineStep[];
}

const DEPT_ORDER = ["strategy", "social", "design", "traffic", "analytics", "quality"];
const DEPT_NAMES: Record<string, string> = {
  strategy:  "Estratégia",
  social:    "Social Media",
  design:    "Design",
  traffic:   "Tráfego Pago",
  analytics: "Analytics",
  quality:   "Revisão de Qualidade",
};
const STATUS_LABEL: Record<string, string> = {
  new:               "Recebido",
  waiting_strategy:  "Diagnóstico estratégico",
  waiting_social:    "Planejamento de conteúdo",
  waiting_design:    "Desenvolvimento visual",
  waiting_traffic:   "Configuração de tráfego",
  waiting_analytics: "Configuração de analytics",
  waiting_quality:   "Revisão final de qualidade",
  in_progress:       "Em execução",
  completed:         "Concluído",
};

export function BrainPipelinePortalSection({ clientId }: { clientId: string }) {
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [loaded,   setLoaded]   = useState(false);

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/brain/portal-data?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: RequestData[] | null) => {
        setRequests(Array.isArray(data) ? data.filter(Boolean) : []);
      })
      .catch(() => setRequests([]))
      .finally(() => setLoaded(true));
  }, [clientId]);

  if (!loaded || requests.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Acompanhamento de Projeto</h2>
        <span className="h-5 px-2 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[10px] font-semibold flex items-center">
          ✦ Dioli Brain
        </span>
      </div>
      <div className="space-y-4">
        {requests.map((req) => {
          const completedDepts = new Set(req.pipeline.map((p) => p.departmentKey));
          const doneCount = DEPT_ORDER.filter((d) => completedDepts.has(d)).length;
          const statusLabel = STATUS_LABEL[req.status] ?? req.status;

          return (
            <div key={req.id} className="bg-white border border-[#E5E5E2] rounded-[12px] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#F0F0ED] flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-[#1A1A1A]">{req.businessName}</p>
                  <p className="text-[11px] text-[#6B6B65] mt-0.5">{statusLabel}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-[#9B9B95]">
                    {doneCount}/{DEPT_ORDER.length} etapas
                  </p>
                  <div className="w-20 h-1.5 bg-[#F0F0ED] rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full bg-[#5B5BD6] rounded-full transition-all"
                      style={{ width: `${(doneCount / DEPT_ORDER.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 space-y-2">
                {DEPT_ORDER.map((key, idx) => {
                  const step = req.pipeline.find((p) => p.departmentKey === key);
                  const done = completedDepts.has(key);
                  return (
                    <div key={key} className="flex items-center gap-2.5">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                        done ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F0F0ED] text-[#9B9B95]"
                      }`}>
                        {done ? "✓" : idx + 1}
                      </div>
                      <span className={`text-[12px] ${done ? "text-[#1A1A1A]" : "text-[#9B9B95]"}`}>
                        {DEPT_NAMES[key] ?? key}
                      </span>
                      {step?.approvedAt && (
                        <span className="ml-auto text-[10px] text-[#9B9B95] shrink-0">
                          {new Date(step.approvedAt).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
