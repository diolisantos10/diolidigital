"use client";

import { useState } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import {
  PRODUCTION_TEMPLATES,
  type ProductionTemplate,
  type TemplateId,
} from "@/lib/agency/production-templates";
import { DEPARTMENT_DEFS } from "@/lib/agency/departments";

// Derived from DEPARTMENT_DEFS — single source of truth for slugs/labels/colors.
const DEPT_LABEL: Record<string, string> = Object.fromEntries(
  DEPARTMENT_DEFS.map((d) => [d.id, d.name])
);

const DEPT_COLOR: Record<string, string> = Object.fromEntries(
  DEPARTMENT_DEFS.map((d) => [d.id, d.color])
);

type Step = 1 | 2 | 3 | 4 | 5;

interface WizardState {
  templateId: TemplateId | null;
  clientName: string;
  industry: string;
  email: string;
  tone: string;
  values: string;
  targetAudience: string;
  positioning: string;
  selectedDepts: string[];
  deadline: string;
  projectName: string;
}

const DEFAULT_DEADLINE = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
})();

function StepIndicator({ step }: { step: Step }) {
  const steps = [
    "Template",
    "Brand Hub",
    "Serviços",
    "Revisão",
  ];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((label, i) => {
        const num = (i + 1) as Step;
        const active = step === num;
        const done = step > num;
        return (
          <div key={i} className="flex items-center flex-1">
            <div className="flex items-center gap-2 shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-colors ${
                  done
                    ? "bg-[#16A34A] text-white"
                    : active
                    ? "bg-[#5B5BD6] text-white"
                    : "bg-[#E8E8E3] text-[#9B9B95]"
                }`}
              >
                {done ? "✓" : num}
              </div>
              <span className={`text-[12px] font-medium ${active ? "text-[#1A1A1A]" : done ? "text-[#6B6B65]" : "text-[#9B9B95]"}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-3 ${done ? "bg-[#16A34A]" : "bg-[#E8E8E3]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function NewProductionPage() {
  const { createClient, createProject, addMaterialRequest, addActivity } = useAgencyStore();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const [wizard, setWizard] = useState<WizardState>({
    templateId: null,
    clientName: "",
    industry: "",
    email: "",
    tone: "",
    values: "",
    targetAudience: "",
    positioning: "",
    selectedDepts: [],
    deadline: DEFAULT_DEADLINE,
    projectName: "",
  });

  const template = wizard.templateId
    ? PRODUCTION_TEMPLATES.find((t) => t.id === wizard.templateId) ?? null
    : null;

  function selectTemplate(t: ProductionTemplate) {
    setWizard((prev) => ({
      ...prev,
      templateId: t.id,
      industry: t.industry,
      tone: t.starterBrandHub.tone,
      values: t.starterBrandHub.values.join(", "),
      targetAudience: t.starterBrandHub.targetAudience,
      positioning: t.starterBrandHub.positioning,
      selectedDepts: t.departments,
      projectName: `${t.name} — ${t.projectType.charAt(0).toUpperCase() + t.projectType.slice(1)}`,
    }));
  }

  function setField<K extends keyof WizardState>(key: K, val: WizardState[K]) {
    setWizard((prev) => ({ ...prev, [key]: val }));
  }

  function toggleDept(deptId: string) {
    setWizard((prev) => ({
      ...prev,
      selectedDepts: prev.selectedDepts.includes(deptId)
        ? prev.selectedDepts.filter((d) => d !== deptId)
        : [...prev.selectedDepts, deptId],
    }));
  }

  async function handleCreate() {
    if (!template) return;
    setLoading(true);

    const clientId = createClient({
      name: wizard.clientName || template.name,
      industry: wizard.industry,
      email: wizard.email || undefined,
      status: "active",
      brandBrain: {
        businessSummary: `${wizard.clientName || template.name} — ${wizard.industry}`,
        positioning: wizard.positioning,
        targetAudience: wizard.targetAudience,
        toneOfVoice: wizard.tone,
        visualStyle: "",
        brandRules: "",
        productsToHighlight: "",
        thingsToAvoid: "",
        preferredChannels: "",
        strategicNotes: "",
      },
    } as Parameters<typeof createClient>[0]);

    const projectId = createProject({
      name: wizard.projectName || `${wizard.clientName || template.name} — Produção`,
      clientId,
      goal: template.strategyFocus.join(". "),
      type: template.projectType,
      stage: "briefing" as const,
      priority: "high" as const,
      deadline: wizard.deadline,
      agents: template.agents,
    });

    for (const mr of template.materialRequests) {
      addMaterialRequest({
        projectId,
        clientId,
        type: mr.type,
        description: mr.description,
        status: "pending",
        title: mr.type,
      } as Parameters<typeof addMaterialRequest>[0]);
    }

    addActivity({
      type: "project_created",
      message: `Nova produção criada via wizard: "${wizard.projectName || template.name}"`,
      projectId,
      clientId,
    });

    setCreatedClientId(clientId);
    setCreatedProjectId(projectId);
    setLoading(false);
    setStep(5);
  }

  const canProceedStep1 = wizard.templateId !== null;
  const canProceedStep2 = wizard.clientName.trim().length > 0;
  const canProceedStep3 = wizard.selectedDepts.length > 0;
  const canCreate = canProceedStep2 && canProceedStep3 && wizard.deadline;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/agency/departments"
          className="inline-flex items-center gap-1.5 text-[12px] text-[#9B9B95] hover:text-[#6B6B65] transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Departamentos
        </Link>
      </div>

      <AgencyHeader
        title="Nova Linha de Produção"
        subtitle="Configure um novo cliente e inicie a linha de produção da agência em poucos passos."
      />

      {step < 5 && <StepIndicator step={step} />}

      {/* Step 1: Template */}
      {step === 1 && (
        <div>
          <h2 className="text-[16px] font-semibold text-[#1A1A1A] mb-1">Escolha o tipo de cliente</h2>
          <p className="text-[13px] text-[#9B9B95] mb-5">Selecione o template mais próximo ao perfil do cliente.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {PRODUCTION_TEMPLATES.map((t) => {
              const selected = wizard.templateId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t)}
                  className={`text-left p-5 rounded-[12px] border-2 transition-all ${
                    selected
                      ? "border-[#5B5BD6] bg-[#EEF0FF]"
                      : "border-[#E8E8E3] bg-white hover:border-[#C8C8C3]"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-[15px] font-semibold text-[#1A1A1A]">{t.name}</div>
                      <div className="text-[11px] text-[#9B9B95] mt-0.5">{t.industry}</div>
                    </div>
                    <div
                      className="w-3 h-3 rounded-full mt-1 shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                  </div>
                  <p className="text-[12px] text-[#6B6B65] leading-relaxed mb-3">{t.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {t.departments.map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium bg-[#F0F0ED] text-[#6B6B65]"
                      >
                        {DEPT_LABEL[d] ?? d}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 text-[11px] text-[#9B9B95]">
                    {t.suggestedDeliverables.length} entregas · {t.materialRequests.length} materiais
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="h-10 px-6 rounded-[8px] bg-[#5B5BD6] text-white text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#4A4AC5] transition-colors"
            >
              Próximo →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Client + Brand Hub */}
      {step === 2 && template && (
        <div>
          <h2 className="text-[16px] font-semibold text-[#1A1A1A] mb-1">Cliente & Brand Hub</h2>
          <p className="text-[13px] text-[#9B9B95] mb-5">Dados do cliente e posicionamento inicial da marca.</p>
          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-6 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-[11px] font-semibold text-[#6B6B65] uppercase tracking-wide mb-1.5">
                  Nome do cliente *
                </label>
                <input
                  type="text"
                  value={wizard.clientName}
                  onChange={(e) => setField("clientName", e.target.value)}
                  placeholder={template.name}
                  className="w-full h-10 px-3 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#1A1A1A] outline-none focus:border-[#5B5BD6] focus:ring-1 focus:ring-[#5B5BD6]/20"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#6B6B65] uppercase tracking-wide mb-1.5">
                  Setor / Indústria
                </label>
                <input
                  type="text"
                  value={wizard.industry}
                  onChange={(e) => setField("industry", e.target.value)}
                  className="w-full h-10 px-3 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#1A1A1A] outline-none focus:border-[#5B5BD6] focus:ring-1 focus:ring-[#5B5BD6]/20"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#6B6B65] uppercase tracking-wide mb-1.5">
                  E-mail do cliente
                </label>
                <input
                  type="email"
                  value={wizard.email}
                  onChange={(e) => setField("email", e.target.value)}
                  className="w-full h-10 px-3 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#1A1A1A] outline-none focus:border-[#5B5BD6] focus:ring-1 focus:ring-[#5B5BD6]/20"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#6B6B65] uppercase tracking-wide mb-1.5">
                  Nome do projeto
                </label>
                <input
                  type="text"
                  value={wizard.projectName}
                  onChange={(e) => setField("projectName", e.target.value)}
                  className="w-full h-10 px-3 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#1A1A1A] outline-none focus:border-[#5B5BD6] focus:ring-1 focus:ring-[#5B5BD6]/20"
                />
              </div>
            </div>

            <div className="border-t border-[#F0F0ED] pt-5">
              <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-3">
                Brand Hub Inicial
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-[#6B6B65] mb-1">Tom de voz</label>
                  <input
                    type="text"
                    value={wizard.tone}
                    onChange={(e) => setField("tone", e.target.value)}
                    className="w-full h-10 px-3 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#1A1A1A] outline-none focus:border-[#5B5BD6] focus:ring-1 focus:ring-[#5B5BD6]/20"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#6B6B65] mb-1">Valores (separados por vírgula)</label>
                  <input
                    type="text"
                    value={wizard.values}
                    onChange={(e) => setField("values", e.target.value)}
                    className="w-full h-10 px-3 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#1A1A1A] outline-none focus:border-[#5B5BD6] focus:ring-1 focus:ring-[#5B5BD6]/20"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-[#6B6B65] mb-1">Público-alvo</label>
                  <input
                    type="text"
                    value={wizard.targetAudience}
                    onChange={(e) => setField("targetAudience", e.target.value)}
                    className="w-full h-10 px-3 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#1A1A1A] outline-none focus:border-[#5B5BD6] focus:ring-1 focus:ring-[#5B5BD6]/20"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-[#6B6B65] mb-1">Posicionamento</label>
                  <textarea
                    value={wizard.positioning}
                    onChange={(e) => setField("positioning", e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#1A1A1A] outline-none focus:border-[#5B5BD6] focus:ring-1 focus:ring-[#5B5BD6]/20 resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="h-10 px-5 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#6B6B65] hover:bg-[#F7F7F6] transition-colors"
            >
              ← Voltar
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!canProceedStep2}
              className="h-10 px-6 rounded-[8px] bg-[#5B5BD6] text-white text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#4A4AC5] transition-colors"
            >
              Próximo →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Services / Departments */}
      {step === 3 && template && (
        <div>
          <h2 className="text-[16px] font-semibold text-[#1A1A1A] mb-1">Serviços & Departamentos</h2>
          <p className="text-[13px] text-[#9B9B95] mb-5">Selecione os departamentos que irão trabalhar neste cliente.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {DEPARTMENT_DEFS.filter((d) => d.id !== "operations").map((dept) => {
              const inTemplate = template.departments.includes(dept.id);
              const selected = wizard.selectedDepts.includes(dept.id);
              return (
                <button
                  key={dept.id}
                  onClick={() => toggleDept(dept.id)}
                  className={`text-left p-4 rounded-[10px] border-2 transition-all ${
                    selected
                      ? "border-[#5B5BD6] bg-[#EEF0FF]"
                      : "border-[#E8E8E3] bg-white hover:border-[#C8C8C3]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-[6px] flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                        style={{ backgroundColor: dept.color }}
                      >
                        {dept.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium text-[#1A1A1A]">{dept.name}</div>
                        {inTemplate && (
                          <div className="text-[10px] text-[#9B9B95]">Recomendado para este template</div>
                        )}
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      selected ? "border-[#5B5BD6] bg-[#5B5BD6]" : "border-[#D0D0CC]"
                    }`}>
                      {selected && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {template && wizard.selectedDepts.length > 0 && (
            <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5 mb-4">
              <div className="text-[12px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-3">
                Entregas sugeridas ({template.suggestedDeliverables.filter(d => wizard.selectedDepts.includes(d.department)).length})
              </div>
              <div className="space-y-1.5">
                {template.suggestedDeliverables
                  .filter((d) => wizard.selectedDepts.includes(d.department))
                  .map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px] text-[#6B6B65]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5B5BD6] shrink-0" />
                      {d.name}
                      <span className="text-[10px] text-[#9B9B95]">({d.type})</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-5 mb-6">
            <label className="block text-[11px] font-semibold text-[#6B6B65] uppercase tracking-wide mb-1.5">
              Prazo do projeto *
            </label>
            <input
              type="date"
              value={wizard.deadline}
              onChange={(e) => setField("deadline", e.target.value)}
              className="w-full sm:w-64 h-10 px-3 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#1A1A1A] outline-none focus:border-[#5B5BD6]"
            />
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="h-10 px-5 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#6B6B65] hover:bg-[#F7F7F6] transition-colors"
            >
              ← Voltar
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={!canProceedStep3}
              className="h-10 px-6 rounded-[8px] bg-[#5B5BD6] text-white text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#4A4AC5] transition-colors"
            >
              Revisar →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review + Create */}
      {step === 4 && template && (
        <div>
          <h2 className="text-[16px] font-semibold text-[#1A1A1A] mb-1">Revisão</h2>
          <p className="text-[13px] text-[#9B9B95] mb-5">Confirme os dados antes de criar a linha de produção.</p>

          <div className="bg-white rounded-[12px] border border-[#E8E8E3] p-6 mb-4 space-y-4">
            <div className="grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <div className="text-[11px] text-[#9B9B95] uppercase tracking-wide mb-0.5">Cliente</div>
                <div className="font-medium text-[#1A1A1A]">{wizard.clientName || template.name}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#9B9B95] uppercase tracking-wide mb-0.5">Setor</div>
                <div className="font-medium text-[#1A1A1A]">{wizard.industry}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#9B9B95] uppercase tracking-wide mb-0.5">Projeto</div>
                <div className="font-medium text-[#1A1A1A]">{wizard.projectName || `${wizard.clientName} — Produção`}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#9B9B95] uppercase tracking-wide mb-0.5">Prazo</div>
                <div className="font-medium text-[#1A1A1A]">
                  {wizard.deadline ? new Date(wizard.deadline).toLocaleDateString("pt-BR") : "—"}
                </div>
              </div>
            </div>

            <div className="border-t border-[#F0F0ED] pt-4">
              <div className="text-[11px] text-[#9B9B95] uppercase tracking-wide mb-2">Departamentos</div>
              <div className="flex flex-wrap gap-1.5">
                {wizard.selectedDepts.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium text-white"
                    style={{ backgroundColor: DEPT_COLOR[d] ?? "#6B6B65" }}
                  >
                    {DEPT_LABEL[d] ?? d}
                  </span>
                ))}
              </div>
            </div>

            <div className="border-t border-[#F0F0ED] pt-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  {
                    label: "Entregas",
                    value: template.suggestedDeliverables.filter((d) =>
                      wizard.selectedDepts.includes(d.department)
                    ).length,
                  },
                  { label: "Materiais a solicitar", value: template.materialRequests.length },
                  { label: "Agentes", value: template.agents.length },
                ].map((s) => (
                  <div key={s.label} className="bg-[#F7F7F6] rounded-[8px] p-3">
                    <div className="text-[20px] font-semibold text-[#5B5BD6]">{s.value}</div>
                    <div className="text-[11px] text-[#9B9B95] mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-[#F0F0ED] pt-4">
              <div className="text-[11px] text-[#9B9B95] uppercase tracking-wide mb-2">
                Pacote de proposta
              </div>
              <div className="text-[13px] text-[#6B6B65]">{template.proposalPackage}</div>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(3)}
              className="h-10 px-5 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#6B6B65] hover:bg-[#F7F7F6] transition-colors"
            >
              ← Voltar
            </button>
            <button
              onClick={handleCreate}
              disabled={!canCreate || loading}
              className="h-10 px-6 rounded-[8px] bg-[#5B5BD6] text-white text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#4A4AC5] transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Criando…
                </>
              ) : (
                "Criar Linha de Produção →"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Success */}
      {step === 5 && template && (
        <div className="bg-white rounded-[16px] border border-[#E8E8E3] p-10 text-center max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#16A34A]">
              <path d="M5 12l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="text-[20px] font-semibold text-[#1A1A1A] mb-2">Linha de produção criada!</h2>
          <p className="text-[13px] text-[#6B6B65] leading-relaxed mb-6">
            Cliente <strong>{wizard.clientName || template.name}</strong> e projeto criados com sucesso.
            Materiais solicitados, Brand Hub configurado e departamentos atribuídos.
          </p>
          <div className="flex flex-col gap-2.5">
            {createdProjectId && (
              <Link
                href={`/agency/projects/${createdProjectId}`}
                className="w-full h-10 rounded-[8px] bg-[#5B5BD6] text-white text-[13px] font-medium hover:bg-[#4A4AC5] transition-colors flex items-center justify-center gap-2"
              >
                Abrir Projeto →
              </Link>
            )}
            {createdClientId && (
              <Link
                href={`/agency/clients/${createdClientId}`}
                className="w-full h-10 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#6B6B65] hover:bg-[#F7F7F6] transition-colors flex items-center justify-center"
              >
                Ver Cliente
              </Link>
            )}
            <Link
              href="/agency/departments"
              className="w-full h-10 rounded-[8px] border border-[#E8E8E3] text-[13px] text-[#6B6B65] hover:bg-[#F7F7F6] transition-colors flex items-center justify-center"
            >
              Ver Departamentos
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
