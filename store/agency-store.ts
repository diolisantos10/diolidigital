"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/lib/i18n";
import {
  Client,
  Project,
  OrchestratorBriefing,
  Task,
  Deliverable,
  Briefing,
  ActivityEvent,
  TaskStatus,
  DeliverableStatus,
  ProjectStage,
  Priority,
  MOCK_CLIENTS,
  MOCK_PROJECTS,
  MOCK_TASKS,
  MOCK_DELIVERABLES,
  MOCK_BRIEFINGS,
  MOCK_ACTIVITY,
} from "@/lib/agency/mock-data";

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

  // Task actions
  updateTaskStatus: (id: string, status: TaskStatus) => void;

  // Deliverable actions
  updateDeliverableStatus: (id: string, status: DeliverableStatus) => void;
  setDeliverableFeedback: (id: string, feedback: string) => void;

  // Briefing actions
  createBriefing: (briefing: Omit<Briefing, "id" | "createdAt">) => string;
  updateBriefingStatus: (id: string, status: Briefing["status"]) => void;

  // i18n
  locale: Locale;
  setLocale: (locale: Locale) => void;

  // System
  addActivity: (event: Omit<ActivityEvent, "id" | "timestamp">) => void;
  resetStore: () => void;
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

      // ── i18n ─────────────────────────────────────────────────────────────
      locale: "pt-BR" as Locale,
      setLocale: (locale) => set({ locale }),

      // ── Agent handoff ─────────────────────────────────────────────────────
      pendingDesignContract: null,
      setPendingDesignContract: (contract) => set({ pendingDesignContract: contract }),

      pendingAgentInput: null,
      setPendingAgentInput: (input) => set({ pendingAgentInput: input }),

      // ── Deliverables (add) ────────────────────────────────────────────────
      addDeliverable: (data) => {
        const id = `d${uid()}`;
        const deliverable: Deliverable = {
          ...data,
          id,
          createdAt: new Date().toISOString().slice(0, 10),
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
        set((s) => ({
          projects: [...s.projects, project],
          tasks: [...s.tasks, ...newTasks],
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
        set((s) => ({
          deliverables: s.deliverables.map((x) => (x.id === id ? { ...x, status } : x)),
        }));
        get().addActivity({
          type: "deliverable_updated",
          message: `"${d.name}" status → ${status}`,
          projectId: d.projectId,
        });
      },

      setDeliverableFeedback: (id, feedback) => {
        const d = get().deliverables.find((x) => x.id === id);
        if (!d) return;
        set((s) => ({
          deliverables: s.deliverables.map((x) =>
            x.id === id ? { ...x, status: "draft" as DeliverableStatus, clientFeedback: feedback } : x
          ),
        }));
        get().addActivity({
          type: "deliverable_updated",
          message: `"${d.name}" — client requested changes`,
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
        locale: s.locale,
      }),
    }
  )
);
