"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/lib/i18n";
import type { AgencyRole } from "@/lib/agency/roles";
import {
  Client,
  Project,
  ProjectProposal,
  OrchestratorBriefing,
  Task,
  Deliverable,
  RevisionEntry,
  Briefing,
  ActivityEvent,
  TaskStatus,
  DeliverableStatus,
  ProjectStage,
  Priority,
  StrategyRoom,
  MOCK_CLIENTS,
  MOCK_PROJECTS,
  MOCK_TASKS,
  MOCK_DELIVERABLES,
  MOCK_BRIEFINGS,
  MOCK_ACTIVITY,
} from "@/lib/agency/mock-data";
import type { MaterialRequest, MaterialRequestStatus } from "@/lib/agency/workspace";
import { generateClientRequirements, MOCK_MATERIAL_REQUESTS } from "@/lib/agency/workspace";
import { inferOwnerAgent } from "@/lib/agency/deliverables";
import { generateStrategyRoomForProject } from "@/lib/agency/strategy-room";
import { isValidProposalPricing } from "@/lib/agency/reporting";

// ─── Brand Update ─────────────────────────────────────────────────────────────
// A pending brand suggestion from the client portal, a manual internal edit,
// or an uploaded Brand Book. NOT applied to BrandBrain until reviewed internally.

export interface BrandUpdate {
  id: string;
  clientId: string;
  field: string;          // keyof BrandBrain | "general" | "brand_book"
  suggestedValue: string;
  currentValue?: string;
  source: "client" | "manual" | "upload" | "parsed";
  status: "pending" | "reviewed" | "applied";
  submittedAt: string;
  note?: string;
  fileName?: string;      // for upload source
}

// ─── QA Test Run ──────────────────────────────────────────────────────────────

export interface QATestRun {
  id: string;
  timestamp: string;
  projectNames: string[];
  flowId: string;
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  blockers: number;
  readiness: "not_ready" | "warnings" | "ready";
}

interface AgencyState {
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  deliverables: Deliverable[];
  briefings: Briefing[];
  activity: ActivityEvent[];

  // Agent handoff
  pendingDesignContract: string | null;
  setPendingDesignContract: (contract: string | null) => void;

  pendingAgentInput: { projectId: string; projectName: string; clientName: string; goal: string; projectType: string } | null;
  setPendingAgentInput: (input: { projectId: string; projectName: string; clientName: string; goal: string; projectType: string } | null) => void;

  addDeliverable: (deliverable: Omit<Deliverable, "id" | "createdAt">) => string;
  createClient: (client: Omit<Client, "id" | "createdAt">) => string;
  updateClient: (id: string, updates: Partial<Client>) => void;

  // Project actions
  createProject: (payload: {
    name: string;
    clientId: string;
    goal: string;
    type: string;
    stage: ProjectStage;
    priority: Priority;
    deadline: string;
    agents: string[];
    initialTasks?: Array<{ title: string; description: string; agentId: string; dueDate: string }>;
    orchestratorBriefing?: OrchestratorBriefing;
  }) => string;
  updateProject: (id: string, updates: Partial<Project>) => void;
  moveProjectStage: (id: string, stage: ProjectStage) => void;
  updateProposal: (id: string, updates: Partial<ProjectProposal>) => void;
  sendProposal: (id: string) => void;
  approveProposal: (id: string) => void;
  rejectProposal: (id: string, reason?: string) => void;
  requestProposalChanges: (id: string, notes: string) => void;

  // Task actions
  updateTaskStatus: (id: string, status: TaskStatus) => void;

  // Deliverable actions
  updateDeliverableStatus: (id: string, status: DeliverableStatus) => void;
  setDeliverableFeedback: (id: string, feedback: string) => void;
  startDeliverableRevision: (id: string) => void;
  resolveDeliverableRevision: (id: string, note?: string) => void;

  // Briefing actions
  createBriefing: (briefing: Omit<Briefing, "id" | "createdAt">) => string;
  updateBriefingStatus: (id: string, status: Briefing["status"]) => void;

  // i18n
  locale: Locale;
  setLocale: (locale: Locale) => void;

  // Material requests (agency → client asks for assets/content)
  materialRequests: MaterialRequest[];
  addMaterialRequest: (req: Omit<MaterialRequest, "id" | "requestedAt">) => string;
  updateMaterialRequestStatus: (id: string, status: MaterialRequestStatus) => void;

  // QA Test History
  testRuns: QATestRun[];
  addTestRun: (run: Omit<QATestRun, "id">) => void;
  clearTestHistory: () => void;

  // Strategy Room
  strategyRooms: StrategyRoom[];
  generateStrategyRoom: (projectId: string) => void;
  updateStrategyRoom: (projectId: string, updates: Partial<StrategyRoom>) => void;
  clearStrategyRoom: (projectId: string) => void;

  // Role simulation (internal testing only — no real auth)
  currentRole: AgencyRole;
  setCurrentRole: (role: AgencyRole) => void;

  // Brand Updates (pending suggestions from client / upload / manual / parsed)
  brandUpdates: BrandUpdate[];
  addBrandUpdate: (update: Omit<BrandUpdate, "id" | "submittedAt">) => string;
  reviewBrandUpdate: (id: string) => void;
  applyBrandUpdate: (id: string) => void;
  applyAllPendingBrandUpdates: (clientId: string) => void;
  dismissBrandUpdate: (id: string) => void;

  // System
  addActivity: (event: Omit<ActivityEvent, "id" | "timestamp">) => void;
  resetStore: () => void;
  loadPilotData: () => void;
  clearAllData: () => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const useAgencyStore = create<AgencyState>()(
  persist(
    (set, get) => ({
      clients: MOCK_CLIENTS,
      projects: MOCK_PROJECTS,
      tasks: MOCK_TASKS,
      deliverables: MOCK_DELIVERABLES,
      briefings: MOCK_BRIEFINGS,
      activity: MOCK_ACTIVITY,
      materialRequests: MOCK_MATERIAL_REQUESTS,
      testRuns: [],
      strategyRooms: [],
      currentRole: "master" as AgencyRole,
      brandUpdates: [],

      // ── i18n ─────────────────────────────────────────────────────────────
      locale: "pt-BR" as Locale,
      setLocale: (locale) => set({ locale }),

      // ── Role simulation ───────────────────────────────────────────────────
      setCurrentRole: (role) => set({ currentRole: role }),

      // ── Brand Updates ─────────────────────────────────────────────────────
      addBrandUpdate: (update) => {
        const id = `bu${uid()}`;
        const entry: BrandUpdate = { ...update, id, submittedAt: new Date().toISOString() };
        set((s) => ({ brandUpdates: [entry, ...s.brandUpdates] }));
        if (update.source === "client") {
          get().addActivity({
            type: "brand_update_submitted",
            message: `Cliente enviou sugestão de atualização de marca`,
            clientId: update.clientId,
          });
        } else {
          get().addActivity({
            type: "brand_update_submitted",
            message: `Atualização de marca enviada`,
            clientId: update.clientId,
          });
        }
        return id;
      },
      reviewBrandUpdate: (id) =>
        set((s) => ({
          brandUpdates: s.brandUpdates.map((u) => u.id === id ? { ...u, status: "reviewed" } : u),
        })),
      applyBrandUpdate: (id) => {
        const update = get().brandUpdates.find((u) => u.id === id);
        set((s) => {
          const upd = s.brandUpdates.find((u) => u.id === id);
          if (!upd || upd.source === "upload" || upd.field === "general" || upd.field === "brand_book") {
            return {
              brandUpdates: s.brandUpdates.map((u) => u.id === id ? { ...u, status: "applied" } : u),
            };
          }
          const clients = s.clients.map((c) => {
            if (c.id !== upd.clientId) return c;
            return {
              ...c,
              brandBrain: { ...(c.brandBrain ?? {}), [upd.field]: upd.suggestedValue } as typeof c.brandBrain,
            };
          });
          return {
            clients,
            brandUpdates: s.brandUpdates.map((u) => u.id === id ? { ...u, status: "applied" } : u),
          };
        });
        if (update) {
          get().addActivity({
            type: "brand_update_applied",
            message: `Atualização de marca aplicada ao Brand Hub`,
            clientId: update.clientId,
          });
        }
      },
      dismissBrandUpdate: (id) =>
        set((s) => ({ brandUpdates: s.brandUpdates.filter((u) => u.id !== id) })),
      applyAllPendingBrandUpdates: (clientId) =>
        set((s) => {
          const pending = s.brandUpdates.filter(
            (u) => u.clientId === clientId && u.status === "pending" &&
            u.source !== "upload" && u.field !== "general" && u.field !== "brand_book"
          );
          if (pending.length === 0) return {};
          let clients = s.clients;
          for (const update of pending) {
            clients = clients.map((c) =>
              c.id !== update.clientId ? c :
              { ...c, brandBrain: { ...(c.brandBrain ?? {}), [update.field]: update.suggestedValue } as typeof c.brandBrain }
            );
          }
          const appliedIds = new Set(pending.map((u) => u.id));
          return {
            clients,
            brandUpdates: s.brandUpdates.map((u) =>
              appliedIds.has(u.id) ? { ...u, status: "applied" } :
              (u.clientId === clientId && u.status === "pending") ? { ...u, status: "applied" } : u
            ),
          };
        }),

      // ── Agent handoff ─────────────────────────────────────────────────────
      pendingDesignContract: null,
      setPendingDesignContract: (contract) => set({ pendingDesignContract: contract }),

      pendingAgentInput: null,
      setPendingAgentInput: (input) => set({ pendingAgentInput: input }),

      // ── Deliverables (add) ────────────────────────────────────────────────
      addDeliverable: (data) => {
        const id = `d${uid()}`;
        const now = new Date().toISOString();
        const version = data.version ?? 1;
        const deliverable: Deliverable = {
          ...data,
          id,
          version,
          createdAt: new Date().toISOString().slice(0, 10),
          ownerAgentId: data.ownerAgentId ?? inferOwnerAgent(data.type).id,
          revisionStatus: data.revisionStatus ?? "none",
          updatedAt: now,
          revisionHistory: data.revisionHistory ?? [
            { version, status: data.status, author: "agent", timestamp: now, note: "Entrega criada" },
          ],
        };
        set((s) => ({ deliverables: [...s.deliverables, deliverable] }));
        get().addActivity({
          type: "deliverable_updated",
          message: `"${data.name}" saved to project`,
          projectId: data.projectId,
        });
        return id;
      },

      // ── Clients ──────────────────────────────────────────────────────────
      createClient: (data) => {
        const id = `c${uid()}`;
        const client: Client = {
          ...data,
          id,
          createdAt: new Date().toISOString().slice(0, 10),
        };
        set((s) => ({ clients: [...s.clients, client] }));
        get().addActivity({ type: "client_created", message: `New client "${data.name}" added`, clientId: id });
        return id;
      },

      updateClient: (id, updates) => {
        set((s) => ({
          clients: s.clients.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        }));
      },

      // ── Projects ──────────────────────────────────────────────────────────
      createProject: (payload) => {
        const id = `p${uid()}`;
        const project: Project = {
          id,
          name: payload.name,
          clientId: payload.clientId,
          goal: payload.goal,
          type: payload.type,
          stage: payload.stage,
          priority: payload.priority,
          deadline: payload.deadline,
          agents: payload.agents,
          createdAt: new Date().toISOString().slice(0, 10),
          ...(payload.orchestratorBriefing ? { orchestratorBriefing: payload.orchestratorBriefing } : {}),
        };
        const newTasks: Task[] = (payload.initialTasks ?? []).map((t) => ({
          id: `t${uid()}`,
          projectId: id,
          title: t.title,
          description: t.description,
          agentId: t.agentId,
          status: "pending" as TaskStatus,
          dueDate: t.dueDate,
        }));
        const services = payload.orchestratorBriefing?.services ?? [];
        const autoRequests: MaterialRequest[] = services.length > 0
          ? generateClientRequirements(services, payload.clientId, id).map((r) => ({
              ...r,
              id: `mr${uid()}`,
              requestedAt: new Date().toISOString(),
            }))
          : [];
        set((s) => ({
          projects: [...s.projects, project],
          tasks: [...s.tasks, ...newTasks],
          materialRequests: [...s.materialRequests, ...autoRequests],
        }));
        get().addActivity({
          type: "project_created",
          message: `Project "${payload.name}" created via Orchestrator`,
          projectId: id,
          clientId: payload.clientId,
        });
        return id;
      },

      updateProject: (id, updates) => {
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        }));
      },

      moveProjectStage: (id, stage) => {
        const project = get().projects.find((p) => p.id === id);
        if (!project) return;
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, stage } : p)),
        }));
        get().addActivity({
          type: "project_stage_changed",
          message: `"${project.name}" moved to ${stage.charAt(0).toUpperCase() + stage.slice(1)}`,
          projectId: id,
        });
      },

      updateProposal: (id, updates) => {
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== id) return p;
            const base: ProjectProposal = p.proposal ?? {
              scope: "", deliverables: [], timeline: "", pricing: "", status: "draft",
            };
            return { ...p, proposal: { ...base, ...updates } };
          }),
        }));
      },

      sendProposal: (id) => {
        const project = get().projects.find((p) => p.id === id);
        if (!project) return;
        // Store-level safety net: never let a proposal reach the client without a real price,
        // even if the UI guard is bypassed.
        if (!isValidProposalPricing(project.proposal?.pricing)) {
          if (typeof console !== "undefined") {
            console.warn(`sendProposal blocked for "${project.name}": invalid or missing pricing.`);
          }
          return;
        }
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, stage: "proposal_sent" as ProjectStage, proposal: p.proposal ? { ...p.proposal, status: "sent" as ProjectProposal["status"] } : { scope: "", deliverables: [], timeline: "", pricing: "", status: "sent" as ProjectProposal["status"] } }
              : p
          ),
        }));
        get().addActivity({
          type: "proposal_sent",
          message: `Proposta enviada ao cliente para "${project.name}"`,
          projectId: id,
        });
      },

      approveProposal: (id) => {
        const project = get().projects.find((p) => p.id === id);
        if (!project?.proposal || project.proposal.status !== "sent") return;
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, stage: "approved" as ProjectStage, proposal: p.proposal ? { ...p.proposal, status: "approved" as ProjectProposal["status"] } : p.proposal }
              : p
          ),
        }));
        get().addActivity({
          type: "proposal_approved",
          message: `Cliente aprovou proposta de "${project.name}"`,
          projectId: id,
        });
      },

      rejectProposal: (id, reason) => {
        const project = get().projects.find((p) => p.id === id);
        if (!project?.proposal) return;
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  proposal: p.proposal
                    ? { ...p.proposal, status: "rejected" as ProjectProposal["status"], ...(reason ? { rejectionReason: reason } : {}) }
                    : p.proposal,
                }
              : p
          ),
        }));
        get().addActivity({
          type: "proposal_rejected",
          message: `Cliente rejeitou proposta de "${project.name}"`,
          projectId: id,
        });
      },

      requestProposalChanges: (id, notes) => {
        const project = get().projects.find((p) => p.id === id);
        if (!project) return;
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, proposal: p.proposal ? { ...p.proposal, status: "changes_requested" as ProjectProposal["status"], requestedChanges: notes } : p.proposal }
              : p
          ),
        }));
        get().addActivity({
          type: "project_stage_changed",
          message: `Client requested proposal changes for "${project.name}"`,
          projectId: id,
        });
      },

      // ── Tasks ─────────────────────────────────────────────────────────────
      updateTaskStatus: (id, status) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return;
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
        }));
        if (status === "done") {
          get().addActivity({
            type: "task_updated",
            message: `"${task.title}" marked as done`,
            projectId: task.projectId,
          });
        }
      },

      // ── Deliverables ──────────────────────────────────────────────────────
      updateDeliverableStatus: (id, status) => {
        const d = get().deliverables.find((x) => x.id === id);
        if (!d) return;
        const now = new Date().toISOString();
        const entry: RevisionEntry = {
          version: d.version ?? 1,
          status,
          author: "internal",
          timestamp: now,
          note: `Status alterado para ${status}`,
        };
        // Approving/delivering, or sending a reworked draft back to review, resolves any open revision.
        const wasInRevision = d.revisionStatus === "revision_requested" || d.revisionStatus === "in_revision";
        const revisionStatus =
          status === "approved" || status === "delivered"
            ? "resolved"
            : status === "in_review" && wasInRevision
            ? "resolved"
            : d.revisionStatus ?? "none";
        set((s) => ({
          deliverables: s.deliverables.map((x) =>
            x.id === id
              ? { ...x, status, revisionStatus, updatedAt: now, revisionHistory: [...(x.revisionHistory ?? []), entry] }
              : x
          ),
        }));
        get().addActivity({
          type: status === "approved" ? "deliverable_approved" : "deliverable_updated",
          message: status === "approved"
            ? `"${d.name}" aprovada pelo cliente`
            : `"${d.name}" status → ${status}`,
          projectId: d.projectId,
        });
      },

      setDeliverableFeedback: (id, feedback) => {
        const d = get().deliverables.find((x) => x.id === id);
        if (!d) return;
        const now = new Date().toISOString();
        const ownerAgentId = d.ownerAgentId ?? inferOwnerAgent(d.type).id;
        const entry: RevisionEntry = {
          version: d.version ?? 1,
          status: "draft",
          feedback,
          author: "client",
          timestamp: now,
          note: "Cliente solicitou alterações",
        };
        set((s) => ({
          deliverables: s.deliverables.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: "draft" as DeliverableStatus,
                  revisionStatus: "revision_requested",
                  clientFeedback: feedback,
                  lastFeedback: feedback,
                  ownerAgentId,
                  updatedAt: now,
                  revisionHistory: [...(x.revisionHistory ?? []), entry],
                }
              : x
          ),
        }));
        get().addActivity({
          type: "change_requested",
          message: `"${d.name}" — cliente solicitou alterações`,
          projectId: d.projectId,
        });
      },

      // Owner agent picks up the revision work (draft → actively being reworked).
      startDeliverableRevision: (id) => {
        const d = get().deliverables.find((x) => x.id === id);
        if (!d) return;
        const now = new Date().toISOString();
        const ownerAgentId = d.ownerAgentId ?? inferOwnerAgent(d.type).id;
        const entry: RevisionEntry = {
          version: d.version ?? 1,
          status: d.status,
          author: "internal",
          timestamp: now,
          note: "Revisão iniciada",
        };
        set((s) => ({
          deliverables: s.deliverables.map((x) =>
            x.id === id
              ? { ...x, revisionStatus: "in_revision", ownerAgentId, updatedAt: now, revisionHistory: [...(x.revisionHistory ?? []), entry] }
              : x
          ),
        }));
        get().addActivity({
          type: "deliverable_updated",
          message: `"${d.name}" — revisão iniciada`,
          projectId: d.projectId,
        });
      },

      // Revision resolved → bump version and send the new version back to client review.
      resolveDeliverableRevision: (id, note) => {
        const d = get().deliverables.find((x) => x.id === id);
        if (!d) return;
        const now = new Date().toISOString();
        const newVersion = (d.version ?? 1) + 1;
        const entry: RevisionEntry = {
          version: newVersion,
          status: "in_review",
          author: "internal",
          timestamp: now,
          note: note?.trim() || "Nova versão enviada para revisão do cliente",
        };
        set((s) => ({
          deliverables: s.deliverables.map((x) =>
            x.id === id
              ? {
                  ...x,
                  version: newVersion,
                  status: "in_review" as DeliverableStatus,
                  revisionStatus: "resolved",
                  clientFeedback: undefined,
                  updatedAt: now,
                  revisionHistory: [...(x.revisionHistory ?? []), entry],
                }
              : x
          ),
        }));
        get().addActivity({
          type: "deliverable_updated",
          message: `"${d.name}" — nova versão v${newVersion} para revisão`,
          projectId: d.projectId,
        });
      },

      // ── Briefings ─────────────────────────────────────────────────────────
      createBriefing: (data) => {
        const id = `b${uid()}`;
        const briefing: Briefing = {
          ...data,
          id,
          createdAt: new Date().toISOString().slice(0, 10),
        };
        set((s) => ({ briefings: [...s.briefings, briefing] }));
        get().addActivity({
          type: "briefing_created",
          message: `New briefing submitted for project`,
          projectId: data.projectId,
        });
        return id;
      },

      updateBriefingStatus: (id, status) => {
        set((s) => ({
          briefings: s.briefings.map((b) => (b.id === id ? { ...b, status } : b)),
        }));
      },

      // ── Material Requests ─────────────────────────────────────────────────
      addMaterialRequest: (data) => {
        const id = `mr${uid()}`;
        const req: MaterialRequest = {
          ...data,
          id,
          requestedAt: new Date().toISOString(),
        };
        set((s) => ({ materialRequests: [...s.materialRequests, req] }));
        return id;
      },

      updateMaterialRequestStatus: (id, status) => {
        set((s) => ({
          materialRequests: s.materialRequests.map((r) =>
            r.id === id ? { ...r, status } : r
          ),
        }));
      },

      // ── QA Test History ───────────────────────────────────────────────────
      addTestRun: (data) => {
        const id = `qa${uid()}`;
        set((s) => ({ testRuns: [{ ...data, id }, ...s.testRuns].slice(0, 50) }));
      },

      clearTestHistory: () => {
        set({ testRuns: [] });
      },

      // ── Strategy Room ─────────────────────────────────────────────────────
      generateStrategyRoom: (projectId) => {
        const state = get();
        const project = state.projects.find((p) => p.id === projectId);
        if (!project) return;
        const client = state.clients.find((c) => c.id === project.clientId);
        if (!client) return;
        const briefing = state.briefings.find((b) => b.projectId === projectId);
        const materialRequests = state.materialRequests.filter((r) => r.projectId === projectId);
        const room = generateStrategyRoomForProject(project, client, briefing, materialRequests);
        set((s) => ({
          strategyRooms: [
            ...s.strategyRooms.filter((r) => r.projectId !== projectId),
            room,
          ],
        }));
        get().addActivity({
          type: "strategy_room_generated",
          message: `Strategy Room gerado para "${project.name}"`,
          projectId,
        });
      },

      updateStrategyRoom: (projectId, updates) => {
        set((s) => ({
          strategyRooms: s.strategyRooms.map((r) =>
            r.projectId === projectId ? { ...r, ...updates } : r
          ),
        }));
      },

      clearStrategyRoom: (projectId) => {
        set((s) => ({
          strategyRooms: s.strategyRooms.filter((r) => r.projectId !== projectId),
        }));
      },

      // ── Activity ──────────────────────────────────────────────────────────
      addActivity: (event) => {
        const entry: ActivityEvent = {
          ...event,
          id: `ev${uid()}`,
          timestamp: new Date().toISOString(),
        };
        set((s) => ({ activity: [entry, ...s.activity].slice(0, 50) }));
      },

      // ── Reset ─────────────────────────────────────────────────────────────
      resetStore: () => {
        set({
          clients: MOCK_CLIENTS,
          projects: MOCK_PROJECTS,
          tasks: MOCK_TASKS,
          deliverables: MOCK_DELIVERABLES,
          briefings: MOCK_BRIEFINGS,
          activity: MOCK_ACTIVITY,
          materialRequests: MOCK_MATERIAL_REQUESTS,
          strategyRooms: [],
        });
      },

      // ── Load Dioli Digital pilot data ───────────────────────────────────────
      // Restores the Dioli Digital pilot (client c4, project p7 + its deliverables
      // and tasks) without wiping the rest of the workspace. Idempotent.
      loadPilotData: () => {
        set((s) => {
          const pilotClient = MOCK_CLIENTS.find((c) => c.id === "c4");
          const pilotProject = MOCK_PROJECTS.find((p) => p.id === "p7");
          const pilotDeliverables = MOCK_DELIVERABLES.filter((d) => d.projectId === "p7");
          const pilotTasks = MOCK_TASKS.filter((t) => t.projectId === "p7");
          const pilotMaterials = MOCK_MATERIAL_REQUESTS.filter((m) => m.projectId === "p7");
          return {
            clients: s.clients.some((c) => c.id === "c4") || !pilotClient ? s.clients : [...s.clients, pilotClient],
            projects: s.projects.some((p) => p.id === "p7") || !pilotProject ? s.projects : [...s.projects, pilotProject],
            deliverables: [...s.deliverables.filter((d) => d.projectId !== "p7"), ...pilotDeliverables],
            tasks: [...s.tasks.filter((t) => t.projectId !== "p7"), ...pilotTasks],
            materialRequests: [...s.materialRequests.filter((m) => m.projectId !== "p7"), ...pilotMaterials],
          };
        });
      },

      // ── Clear all local data ─────────────────────────────────────────────────
      // Wipes the entire workspace. Use before handing the build to a fresh pilot.
      clearAllData: () => {
        set({
          clients: [],
          projects: [],
          tasks: [],
          deliverables: [],
          briefings: [],
          activity: [],
          materialRequests: [],
          testRuns: [],
          strategyRooms: [],
          brandUpdates: [],
          currentRole: "master",
        });
      },
    }),
    {
      name: "agency-os-v1",
      partialize: (s) => ({
        clients: s.clients,
        projects: s.projects,
        tasks: s.tasks,
        deliverables: s.deliverables,
        briefings: s.briefings,
        activity: s.activity,
        materialRequests: s.materialRequests,
        locale: s.locale,
        testRuns: s.testRuns,
        strategyRooms: s.strategyRooms,
        currentRole: s.currentRole,
        brandUpdates: s.brandUpdates,
      }),
    }
  )
);
