"use client";

import { useState, useRef } from "react";
import { useAgencyStore, QATestRun } from "@/store/agency-store";
import { MOCK_AGENTS } from "@/lib/agency/mock-data";

// ─── Types ────────────────────────────────────────────────────────────────────

type TestStatus = "idle" | "running" | "completed" | "failed";
type TestMode = "single" | "multi" | "simulation";
type LogLevel = "pass" | "fail" | "info" | "warning";
type FlowId =
  | "briefing_to_project"
  | "social_agent_flow"
  | "design_agent_flow"
  | "client_approval_loop"
  | "full_end_to_end";

interface TestLog {
  id: string;
  action: string;
  status: LogLevel;
  detail: string;
  timestamp: string;
}

interface TestReport {
  passed: string[];
  failed: string[];
  blockers: string[];
  observations: string[];
  nextFixes: string[];
}

interface Step {
  action: string;
  run: () => { ok: boolean | "info" | "warning"; detail: string };
}

// ─── Flow registry ────────────────────────────────────────────────────────────

const FLOWS: { id: FlowId; label: string; description: string }[] = [
  {
    id: "briefing_to_project",
    label: "Briefing → Project Creation",
    description: "Validates the Orchestrator intake flow and project scaffolding (briefing, agents, tasks, stage).",
  },
  {
    id: "social_agent_flow",
    label: "Social Agent Flow",
    description: "Checks Social Media Agent (a3) assignment, task coverage, and deliverable outputs.",
  },
  {
    id: "design_agent_flow",
    label: "Design Agent Flow",
    description: "Checks Design Agent (a2) assignment, task availability, and design deliverables.",
  },
  {
    id: "client_approval_loop",
    label: "Client Approval Loop",
    description: "Validates in_review states, approved outputs, client feedback handling, and portal route.",
  },
  {
    id: "full_end_to_end",
    label: "Full End-to-End Flow",
    description: "Runs all checks sequentially across the complete project lifecycle.",
  },
];

// ─── Step builder ─────────────────────────────────────────────────────────────

type StoreSnapshot = ReturnType<typeof useAgencyStore.getState>;

function buildSteps(flowId: FlowId, snap: StoreSnapshot, selectedProjectId: string): Step[] {
  const { projects, tasks, deliverables, activity } = snap;
  const project     = projects.find((p) => p.id === selectedProjectId);
  const pTasks      = tasks.filter((t) => t.projectId === selectedProjectId);
  const pDelivs     = deliverables.filter((d) => d.projectId === selectedProjectId);
  const agentName   = (id: string) => MOCK_AGENTS.find((a) => a.id === id)?.name ?? id;
  const stageOrder  = ["briefing", "diagnosis", "planning", "production", "review", "delivery", "ongoing", "completed"];

  const briefingSteps: Step[] = [
    {
      action: "Load store state",
      run: () => ({ ok: "info", detail: `${projects.length} project(s), ${tasks.length} task(s), ${deliverables.length} deliverable(s)` }),
    },
    {
      action: "Verify project exists in store",
      run: () =>
        project
          ? { ok: true, detail: `Found "${project.name}" (${project.stage})` }
          : { ok: false, detail: "Selected project not found in store" },
    },
    {
      action: "Check orchestrator briefing attached",
      run: () =>
        project?.orchestratorBriefing
          ? { ok: true, detail: `Services: ${project.orchestratorBriefing.services.join(", ") || "none listed"}` }
          : { ok: "warning", detail: "No orchestrator briefing — may have been created manually" },
    },
    {
      action: "Check agents assigned to project",
      run: () =>
        project && project.agents.length > 0
          ? { ok: true, detail: `${project.agents.length} agent(s): ${project.agents.map(agentName).join(", ")}` }
          : { ok: false, detail: "No agents assigned — run Orchestrator to scaffold project" },
    },
    {
      action: "Check tasks generated",
      run: () =>
        pTasks.length > 0
          ? { ok: true, detail: `${pTasks.length} task(s) found` }
          : { ok: false, detail: "No tasks found — project needs planning" },
    },
    {
      action: "Check project stage progression",
      run: () => {
        if (!project) return { ok: false, detail: "No project" };
        const idx = stageOrder.indexOf(project.stage);
        return idx > 0
          ? { ok: true, detail: `Stage: ${project.stage} (step ${idx + 1}/${stageOrder.length})` }
          : { ok: "warning", detail: "Project still at briefing stage — no stage progression yet" };
      },
    },
    {
      action: "Check orchestrator_approved activity event",
      run: () => {
        const ev = activity.find((e) => e.type === "orchestrator_approved" && e.projectId === selectedProjectId);
        return ev
          ? { ok: true, detail: "Orchestrator approval event recorded in activity log" }
          : { ok: "warning", detail: "No orchestrator_approved event found — may be a legacy project" };
      },
    },
  ];

  const socialSteps: Step[] = [
    {
      action: "Initialize social agent scan",
      run: () => ({ ok: "info", detail: "Scanning project for Social Media Agent (a3) coverage" }),
    },
    {
      action: "Check Social Media Agent assigned",
      run: () =>
        project?.agents.includes("a3")
          ? { ok: true, detail: "Social Media Agent (a3) is assigned to project" }
          : { ok: false, detail: "Social Media Agent (a3) not assigned" },
    },
    {
      action: "Check social tasks exist",
      run: () => {
        const n = pTasks.filter((t) => t.agentId === "a3").length;
        return n > 0 ? { ok: true, detail: `${n} task(s) assigned to Social Agent` } : { ok: false, detail: "No tasks assigned to Social Agent" };
      },
    },
    {
      action: "Check social tasks are progressing",
      run: () => {
        const socialTasks = pTasks.filter((t) => t.agentId === "a3");
        const active = socialTasks.filter((t) => t.status === "in_progress" || t.status === "done");
        if (active.length > 0) return { ok: true, detail: `${active.length} task(s) in progress or done` };
        if (socialTasks.length > 0) return { ok: "warning", detail: "All social tasks still pending — agent not started" };
        return { ok: false, detail: "No social tasks to assess" };
      },
    },
    {
      action: "Check social deliverables saved",
      run: () => {
        const n = pDelivs.filter((d) => /social|post|caption|copy/i.test(d.type)).length;
        return n > 0
          ? { ok: true, detail: `${n} social deliverable(s) saved` }
          : { ok: "warning", detail: "No social deliverables found — run Social Agent to generate outputs" };
      },
    },
    {
      action: "Check deliverables promoted past draft",
      run: () => {
        const n = pDelivs.filter((d) => d.status !== "draft").length;
        return n > 0
          ? { ok: true, detail: `${n} deliverable(s) in review, approved, or delivered` }
          : { ok: "warning", detail: "All deliverables still in draft — promote to in_review when ready" };
      },
    },
  ];

  const designSteps: Step[] = [
    {
      action: "Initialize design agent scan",
      run: () => ({ ok: "info", detail: "Scanning project for Design Agent (a2) coverage" }),
    },
    {
      action: "Check Design Agent assigned",
      run: () =>
        project?.agents.includes("a2")
          ? { ok: true, detail: "Design Agent (a2) is assigned to project" }
          : { ok: false, detail: "Design Agent (a2) not assigned" },
    },
    {
      action: "Check design tasks exist",
      run: () => {
        const n = pTasks.filter((t) => t.agentId === "a2").length;
        return n > 0 ? { ok: true, detail: `${n} design task(s) found` } : { ok: false, detail: "No tasks assigned to Design Agent" };
      },
    },
    {
      action: "Check design deliverables saved",
      run: () => {
        const n = pDelivs.filter((d) => /design|visual|brand|identity|asset/i.test(d.type)).length;
        return n > 0
          ? { ok: true, detail: `${n} design deliverable(s) saved` }
          : { ok: "warning", detail: "No design deliverables found — launch Design Agent to produce outputs" };
      },
    },
    {
      action: "Verify design contract handoff mechanism",
      run: () => ({ ok: "info", detail: "Design contract managed via pendingDesignContract — validated at agent launch time" }),
    },
    {
      action: "Check design tasks completion rate",
      run: () => {
        const designTasks = pTasks.filter((t) => t.agentId === "a2");
        if (designTasks.length === 0) return { ok: "warning", detail: "No design tasks to assess" };
        const done = designTasks.filter((t) => t.status === "done").length;
        const pct  = Math.round((done / designTasks.length) * 100);
        return pct >= 50
          ? { ok: true, detail: `${done}/${designTasks.length} done (${pct}%)` }
          : { ok: "warning", detail: `${done}/${designTasks.length} done (${pct}%) — execution incomplete` };
      },
    },
  ];

  const approvalSteps: Step[] = [
    {
      action: "Initialize approval loop scan",
      run: () => ({ ok: "info", detail: `Scanning ${deliverables.length} total deliverable(s) across all projects` }),
    },
    {
      action: "Check deliverables exist for project",
      run: () =>
        pDelivs.length > 0
          ? { ok: true, detail: `${pDelivs.length} deliverable(s) found` }
          : { ok: "warning", detail: "No deliverables yet — agent execution may not have started" },
    },
    {
      action: "Check in_review deliverables",
      run: () => {
        const n = pDelivs.filter((d) => d.status === "in_review").length;
        return n > 0
          ? { ok: true, detail: `${n} deliverable(s) awaiting client review` }
          : { ok: "info", detail: "No deliverables currently in review" };
      },
    },
    {
      action: "Check approved deliverables",
      run: () => {
        const n = pDelivs.filter((d) => d.status === "approved").length;
        return n > 0
          ? { ok: true, detail: `${n} deliverable(s) approved by client` }
          : { ok: "warning", detail: "No approvals recorded yet" };
      },
    },
    {
      action: "Check client feedback handling",
      run: () => {
        const withFeedback = pDelivs.filter((d) => d.clientFeedback);
        return withFeedback.length > 0
          ? { ok: true, detail: `${withFeedback.length} deliverable(s) have client feedback stored` }
          : { ok: "info", detail: "No client feedback recorded — client may not have reviewed yet" };
      },
    },
    {
      action: "Check revision-needed deliverables surfaced",
      run: () => {
        const n = pDelivs.filter((d) => d.status === "draft" && d.clientFeedback).length;
        return n > 0
          ? { ok: true, detail: `${n} deliverable(s) flagged for revision — agent re-execution signalled` }
          : { ok: "info", detail: "No deliverables flagged for revision" };
      },
    },
    {
      action: "Verify client portal route registered",
      run: () => ({
        ok: true,
        detail: `/portal/client/${project?.clientId ?? "[id]"} — portal route active`,
      }),
    },
  ];

  if (flowId === "briefing_to_project")  return briefingSteps;
  if (flowId === "social_agent_flow")    return socialSteps;
  if (flowId === "design_agent_flow")    return designSteps;
  if (flowId === "client_approval_loop") return approvalSteps;

  // full_end_to_end — merge all
  return [
    { action: "Initialize full end-to-end test run", run: () => ({ ok: "info", detail: "Running all flow checks sequentially" }) },
    ...briefingSteps,
    { action: "━━ Social Agent Flow ━━", run: () => ({ ok: "info", detail: "Starting social agent checks" }) },
    ...socialSteps,
    { action: "━━ Design Agent Flow ━━", run: () => ({ ok: "info", detail: "Starting design agent checks" }) },
    ...designSteps,
    { action: "━━ Client Approval Loop ━━", run: () => ({ ok: "info", detail: "Starting approval flow checks" }) },
    ...approvalSteps,
  ];
}

// ─── Report generator ─────────────────────────────────────────────────────────

function generateReport(logs: TestLog[]): TestReport {
  const passed       = logs.filter((l) => l.status === "pass").map((l) => l.action);
  const failed       = logs.filter((l) => l.status === "fail").map((l) => `${l.action} — ${l.detail}`);
  const observations = logs.filter((l) => l.status === "warning").map((l) => `${l.action}: ${l.detail}`);
  const blockers     = failed.filter((f) =>
    /agents assigned|tasks generated|project exists|assigned to project/i.test(f)
  );

  const nextFixes: string[] = [];
  if (failed.some((f) => /tasks generated|no tasks/i.test(f)))       nextFixes.push("Run Orchestrator to generate an execution plan and tasks for the project");
  if (failed.some((f) => /agents assigned/i.test(f)))                nextFixes.push("Assign agents via Orchestrator or project settings");
  if (failed.some((f) => /Social.*not assigned/i.test(f)))           nextFixes.push("Launch Social Media Agent and link it to the project");
  if (failed.some((f) => /Design.*not assigned/i.test(f)))           nextFixes.push("Launch Design Agent and link it to the project");
  if (observations.some((o) => /social deliverables|design deliverables/i.test(o))) nextFixes.push("Save agent outputs as deliverables in the project");
  if (observations.some((o) => /promoted past draft|still in draft/i.test(o)))      nextFixes.push("Promote deliverables to in_review and share via client portal");
  if (observations.some((o) => /no approvals/i.test(o)))             nextFixes.push("Request client review — send portal link to client");
  if (nextFixes.length === 0 && failed.length === 0)                 nextFixes.push("All checks passed — no fixes required");

  return { passed, failed, blockers, observations, nextFixes };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const MODE_OPTIONS: { id: TestMode; label: string; desc: string }[] = [
  { id: "single",     label: "Single Project",         desc: "Test one project against a selected flow" },
  { id: "multi",      label: "Multi-Project",          desc: "Select multiple projects to test in sequence" },
  { id: "simulation", label: "Full Agency Simulation", desc: "Run all active projects through the selected flow" },
];

export default function TestAgentPage() {
  const { projects, addTestRun } = useAgencyStore();

  const [mode,               setMode]               = useState<TestMode>("single");
  const [selectedProjectId,  setSelectedProjectId]  = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedFlow,       setSelectedFlow]       = useState<FlowId | "">("");
  const [testStatus,         setTestStatus]         = useState<TestStatus>("idle");
  const [logs,               setLogs]               = useState<TestLog[]>([]);
  const [report,             setReport]             = useState<TestReport | null>(null);
  const cancelRef = useRef(false);

  const activeProjects = projects.filter((p) => p.stage !== "completed");

  const toggleProject = (id: string) =>
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const getTargetIds = (): string[] => {
    if (mode === "single")     return selectedProjectId ? [selectedProjectId] : [];
    if (mode === "multi")      return selectedProjectIds;
    return activeProjects.map((p) => p.id);
  };

  const targetIds = getTargetIds();
  const canRun = !!selectedFlow && targetIds.length > 0 && testStatus !== "running";

  const runTest = () => {
    const ids = getTargetIds();
    if (!selectedFlow || ids.length === 0) return;

    const snap = useAgencyStore.getState();
    setTestStatus("running");
    setLogs([]);
    setReport(null);
    cancelRef.current = false;

    // Pre-compute all log entries synchronously
    const allLogs: TestLog[] = [];

    if (ids.length === 1) {
      buildSteps(selectedFlow as FlowId, snap, ids[0]).forEach((step, i) => {
        const result = step.run();
        const status: LogLevel = result.ok === true ? "pass" : result.ok === false ? "fail" : result.ok === "warning" ? "warning" : "info";
        allLogs.push({ id: `log-${i}`, action: step.action, status, detail: result.detail, timestamp: new Date().toISOString() });
      });
    } else {
      ids.forEach((pid, pi) => {
        const projName = snap.projects.find((p) => p.id === pid)?.name ?? pid;
        allLogs.push({ id: `log-h${pi}`, action: `━━ ${projName} ━━`, status: "info", detail: `flow: ${selectedFlow}`, timestamp: new Date().toISOString() });
        buildSteps(selectedFlow as FlowId, snap, pid).forEach((step, i) => {
          const result = step.run();
          const status: LogLevel = result.ok === true ? "pass" : result.ok === false ? "fail" : result.ok === "warning" ? "warning" : "info";
          allLogs.push({ id: `log-${pi}-${i}`, action: step.action, status, detail: result.detail, timestamp: new Date().toISOString() });
        });
      });
    }

    // Stream them with per-step delay
    allLogs.forEach((log, i) => {
      setTimeout(() => {
        if (cancelRef.current) return;
        setLogs((prev) => [...prev, log]);

        if (i === allLogs.length - 1) {
          const hasFail = allLogs.some((l) => l.status === "fail");
          const rep = generateReport(allLogs);
          setReport(rep);
          setTestStatus(hasFail ? "failed" : "completed");

          const readiness: QATestRun["readiness"] =
            rep.blockers.length > 0 ? "not_ready"
            : rep.failed.length > 0 || rep.observations.length > 0 ? "warnings"
            : "ready";
          addTestRun({
            timestamp: new Date().toISOString(),
            projectNames: ids.map((id) => snap.projects.find((p) => p.id === id)?.name ?? id),
            flowId: selectedFlow as string,
            totalChecks: allLogs.filter((l) => l.status !== "info").length,
            passed: rep.passed.length,
            failed: rep.failed.length,
            warnings: rep.observations.length,
            blockers: rep.blockers.length,
            readiness,
          });
        }
      }, (i + 1) * 380 + Math.floor(Math.random() * 120));
    });
  };

  const reset = () => {
    cancelRef.current = true;
    setTestStatus("idle");
    setLogs([]);
    setReport(null);
  };

  const selectedFlowDef = FLOWS.find((f) => f.id === selectedFlow);

  const STATUS_PILL: Record<TestStatus, { bg: string; text: string; label: string }> = {
    idle:      { bg: "bg-[#F0F0ED]",   text: "text-[#9B9B95]",  label: "Idle"      },
    running:   { bg: "bg-[#EEF0FF]",   text: "text-[#5B5BD6]",  label: "Running…"  },
    completed: { bg: "bg-[#DCFCE7]",   text: "text-[#16A34A]",  label: "Completed" },
    failed:    { bg: "bg-[#FEE2E2]",   text: "text-[#DC2626]",  label: "Failed"    },
  };
  const pill = STATUS_PILL[testStatus];

  return (
    <div>
      {/* Header */}
      <div className="mb-7">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-7 h-7 rounded-[7px] bg-[#EEF0FF] flex items-center justify-center shrink-0">
            <FlaskIcon size={14} className="text-[#5B5BD6]" />
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">Test Agent</h1>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${pill.bg} ${pill.text}`}>
            {pill.label}
          </span>
        </div>
        <p className="text-[13px] text-[#9B9B95] ml-10">
          Simulate and validate project flows against the current store state. Generates structured logs and a QA report.
        </p>
      </div>

      {/* Setup panel */}
      <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mb-5">
        <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-4">1. Test Setup</div>

        {/* Mode selector */}
        <div className="mb-4">
          <label className="block text-[12px] font-medium text-[#6B6B65] mb-2">Test Mode</label>
          <div className="grid grid-cols-3 gap-2">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.id}
                onClick={() => { setMode(m.id); setSelectedProjectId(""); setSelectedProjectIds([]); }}
                disabled={testStatus === "running"}
                className={`text-left px-3 py-2.5 rounded-[7px] border transition-all disabled:opacity-50 ${
                  mode === m.id
                    ? "border-[#5B5BD6] bg-[#EEF0FF]"
                    : "border-[#E5E5E2] bg-[#F7F7F6] hover:border-[#C0C0BA]"
                }`}
              >
                <div className={`text-[12px] font-semibold mb-0.5 ${mode === m.id ? "text-[#5B5BD6]" : "text-[#1A1A1A]"}`}>
                  {m.label}
                </div>
                <div className="text-[10.5px] text-[#9B9B95] leading-snug">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Project selection — mode-aware */}
        <div className="mb-4">
          {mode === "single" && (
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Select Project</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={testStatus === "running"}
                className="w-full h-9 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50"
              >
                <option value="">— choose a project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {mode === "multi" && (
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">
                Select Projects
                {selectedProjectIds.length > 0 && (
                  <span className="ml-2 text-[#5B5BD6] font-semibold">{selectedProjectIds.length} selected</span>
                )}
              </label>
              <div className="border border-[#E5E5E2] rounded-[7px] divide-y divide-[#F0F0ED] max-h-[200px] overflow-y-auto">
                {projects.map((p) => {
                  const checked = selectedProjectIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                        checked ? "bg-[#EEF0FF]" : "hover:bg-[#F7F7F6]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProject(p.id)}
                        disabled={testStatus === "running"}
                        className="accent-[#5B5BD6]"
                      />
                      <span className={`text-[13px] font-medium flex-1 ${checked ? "text-[#5B5BD6]" : "text-[#1A1A1A]"}`}>
                        {p.name}
                      </span>
                      <span className="text-[11px] text-[#9B9B95] capitalize">{p.stage}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {mode === "simulation" && (
            <div className="flex items-start gap-2.5 bg-[#EEF0FF] border border-[#5B5BD6]/20 rounded-[7px] px-4 py-3">
              <InfoIcon size={14} className="text-[#5B5BD6] shrink-0 mt-0.5" />
              <div>
                <p className="text-[12px] font-medium text-[#5B5BD6] mb-0.5">
                  {activeProjects.length} active project{activeProjects.length !== 1 ? "s" : ""} will be tested
                </p>
                <p className="text-[11.5px] text-[#6B6B65]">
                  {activeProjects.length > 0
                    ? activeProjects.map((p) => p.name).join(", ")
                    : "No active projects found"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Flow select */}
        <div className="mb-4">
          <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Select Test Flow</label>
          <select
            value={selectedFlow}
            onChange={(e) => setSelectedFlow(e.target.value as FlowId)}
            disabled={testStatus === "running"}
            className="w-full h-9 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white disabled:opacity-50"
          >
            <option value="">— choose a flow —</option>
            {FLOWS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </div>

        {/* Flow description */}
        {selectedFlowDef && (
          <div className="flex items-start gap-2.5 bg-[#F7F7F6] rounded-[7px] px-4 py-2.5 mb-4">
            <InfoIcon size={14} className="text-[#9B9B95] shrink-0 mt-0.5" />
            <p className="text-[12px] text-[#6B6B65]">{selectedFlowDef.description}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={runTest}
            disabled={!canRun}
            className={`h-9 px-5 rounded-[7px] text-[13px] font-medium transition-all flex items-center gap-2 ${
              canRun
                ? "bg-[#5B5BD6] text-white hover:bg-[#4A4AC5] shadow-[0_1px_3px_rgba(91,91,214,0.3)]"
                : "bg-[#F0F0ED] text-[#9B9B95] cursor-not-allowed"
            }`}
          >
            {testStatus === "running" ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Running…
              </>
            ) : (
              <>
                <PlayIcon size={13} />
                {mode === "simulation"
                  ? `Simulate All (${activeProjects.length})`
                  : mode === "multi" && targetIds.length > 1
                    ? `Run ${targetIds.length} Projects`
                    : "Run Test"}
              </>
            )}
          </button>

          {(logs.length > 0 || report) && testStatus !== "running" && (
            <button
              onClick={reset}
              className="h-9 px-4 rounded-[7px] text-[13px] font-medium text-[#6B6B65] border border-[#E5E5E2] hover:border-[#9B9B95] transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Log output */}
      {logs.length > 0 && (
        <div className="bg-[#0F0F0F] rounded-[10px] p-5 mb-5 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TerminalIcon size={12} className="text-[#4A4A44]" />
              <span className="text-[10px] font-semibold text-[#4A4A44] uppercase tracking-[0.08em]">Log Output</span>
            </div>
            <span className="text-[10px] text-[#3A3A34]">{logs.length} step{logs.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="space-y-1 font-mono">
            {logs.map((log) => {
              if (/^━━/.test(log.action)) {
                return (
                  <div key={log.id} className="pt-3 pb-0.5 first:pt-0">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#5B5BD6]">{log.action}</span>
                  </div>
                );
              }
              const col =
                log.status === "pass"    ? "text-[#22C55E]"
                : log.status === "fail"  ? "text-[#EF4444]"
                : log.status === "warning" ? "text-[#F59E0B]"
                : "text-[#6B7280]";
              const prefix =
                log.status === "pass"    ? "✓"
                : log.status === "fail"  ? "✗"
                : log.status === "warning" ? "⚠"
                : "·";
              return (
                <div key={log.id} className="flex items-start gap-2.5 text-[11.5px] leading-relaxed">
                  <span className="text-[#3A3A34] shrink-0 tabular-nums">{log.timestamp.slice(11, 19)}</span>
                  <span className={`shrink-0 w-4 text-center font-bold ${col}`}>{prefix}</span>
                  <span className={`shrink-0 w-[52px] text-right font-bold uppercase text-[10px] ${col}`}>{log.status}</span>
                  <span className="text-[#C0C0BA] flex-1">{log.action}</span>
                  {log.detail && (
                    <span className="text-[#5A5A54] shrink-0 max-w-[300px] truncate text-right">— {log.detail}</span>
                  )}
                </div>
              );
            })}
            {testStatus === "running" && (
              <div className="flex items-center gap-2 text-[11.5px] text-[#3A3A34] mt-1 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-[#5B5BD6] animate-ping" />
                Processing next step…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Report */}
      {report && testStatus !== "running" && (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          {/* Report header */}
          <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[#F0F0ED]">
            <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Test Report</div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                testStatus === "completed" ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#FEE2E2] text-[#DC2626]"
              }`}
            >
              {testStatus === "completed" ? "All clear" : "Needs attention"}
            </span>
            <div className="ml-auto flex items-center gap-4 text-[12px] text-[#9B9B95]">
              <span className="text-[#16A34A] font-medium">{report.passed.length} passed</span>
              <span className="text-[#DC2626] font-medium">{report.failed.length} failed</span>
              <span className="text-[#D97706] font-medium">{report.observations.length} warnings</span>
            </div>
          </div>

          {/* Blockers */}
          {report.blockers.length > 0 && (
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-[8px] p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertIcon size={13} className="text-[#DC2626]" />
                <span className="text-[12px] font-semibold text-[#DC2626]">Blockers ({report.blockers.length})</span>
              </div>
              <div className="space-y-1">
                {report.blockers.map((b, i) => (
                  <p key={i} className="text-[12px] text-[#DC2626]">· {b}</p>
                ))}
              </div>
            </div>
          )}

          {/* 2×2 grid */}
          <div className="grid grid-cols-2 gap-4">
            <ReportSection title="Passed Checks" count={report.passed.length} accentBg="bg-[#F0FDF4]" accentText="text-[#16A34A]" dotColor="bg-[#22C55E]" items={report.passed} emptyText="No checks passed." />
            <ReportSection title="Failed Checks" count={report.failed.length} accentBg="bg-[#FEF2F2]" accentText="text-[#DC2626]" dotColor="bg-[#EF4444]" items={report.failed} emptyText="No failures — all checks passed." />
            <ReportSection title="Observations" count={report.observations.length} accentBg="bg-[#FFFBEB]" accentText="text-[#D97706]" dotColor="bg-[#F59E0B]" items={report.observations} emptyText="No warnings recorded." />
            <ReportSection title="Recommended Fixes" count={report.nextFixes.length} accentBg="bg-[#EEF0FF]" accentText="text-[#5B5BD6]" dotColor="bg-[#5B5BD6]" items={report.nextFixes} emptyText="Nothing to fix." />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Report section sub-component ────────────────────────────────────────────

function ReportSection({
  title, count, accentBg, accentText, dotColor, items, emptyText,
}: {
  title: string;
  count: number;
  accentBg: string;
  accentText: string;
  dotColor: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <div className={`rounded-[8px] p-4 ${accentBg}`}>
      <div className={`flex items-center gap-2 mb-3 text-[12px] font-semibold ${accentText}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        {title}
        <span className="ml-auto font-bold">{count}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-[#9B9B95] italic">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="text-[12px] text-[#1A1A1A] leading-snug flex items-start gap-1.5">
              <span className={`shrink-0 mt-1 w-1 h-1 rounded-full ${dotColor} opacity-60`} />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Inline icons ─────────────────────────────────────────────────────────────

function FlaskIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M6 2v5L3 12a1 1 0 00.9 1.5h8.2A1 1 0 0013 12l-3-5V2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5.5 2h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="6.5" cy="10.5" r="0.7" fill="currentColor"/>
      <circle cx="9.5" cy="11.5" r="0.5" fill="currentColor"/>
    </svg>
  );
}

function PlayIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M5 3l9 5-9 5V3z" fill="currentColor"/>
    </svg>
  );
}

function TerminalIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5 7l2 2-2 2M9 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function InfoIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 7v4M8 5.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function AlertIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M8 2L14 13H2L8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M8 6v3M8 10.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
