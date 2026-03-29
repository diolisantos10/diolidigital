// Translations interface — all leaf values are string or typed functions
export interface Translations {
  nav: {
    home: string;
    group: {
      work: string;
      clients: string;
      intelligence: string;
      agents: string;
      library: string;
      system: string;
    };
    projects: string;
    pipeline: string;
    tasks: string;
    clients: string;
    brandAssets: string;
    orchestrator: string;
    agents: string;
    socialMedia: string;
    designAgent: string;
    deliverables: string;
    briefings: string;
    settings: string;
  };
  common: {
    save: string;
    cancel: string;
    confirm: string;
    delete: string;
    edit: string;
    create: string;
    back: string;
    open: string;
    view: string;
    run: string;
    export: string;
    copy: string;
    reset: string;
    send: string;
    generate: string;
    generating: string;
    viewAll: string;
    noActivity: string;
    loading: string;
  };
  dashboard: {
    title: string;
    derivedFrom: string;
    today: string;
    allClear: string;
    allClearSub: string;
    activeProjects: string;
    noActiveProjects: string;
    outputs: string;
    allDeliverables: string;
    noOutputs: string;
    alerts: string;
    recentActivity: string;
    noActivity: string;
    openProject: string;
    runAgent: string;
    viewProject: string;
    resolve: string;
    review: string;
    planProject: string;
    overdueBy: (n: number) => string;
    dUntilDeadline: (n: number) => string;
    noOutputsAttached: string;
    noAgentsAssigned: string;
    hasBlockedTasks: string;
    runSocialAgent: (name: string) => string;
    runDesignAgent: (name: string) => string;
    noOutputsSaved: (name: string) => string;
    blockedTasks: (n: number, name: string) => string;
    reviewDeliverable: (name: string, project: string) => string;
    noTasksOrchestrator: (name: string) => string;
    isOverdue: (name: string) => string;
  };
  project: {
    stages: {
      briefing: string;
      planning: string;
      production: string;
      review: string;
      completed: string;
    };
    status: {
      overdue: string;
      urgent: string;
    };
    labels: {
      deadline: string;
      daysLeft: (n: number) => string;
      daysOverdue: (n: number) => string;
      client: string;
      goal: string;
      type: string;
      stage: string;
      priority: string;
      agents: string;
    };
    tabs: {
      overview: string;
      execution: string;
      tasks: string;
      pipeline: string;
      deliverables: string;
      briefing: string;
    };
    execution: {
      stageControl: string;
      agentPipeline: string;
      outputs: string;
      runAgent: string;
      moveHere: string;
      notStarted: string;
      inProgress: string;
      done: string;
      posts: string;
      design: string;
      campaigns: string;
      other: string;
      noDeliverables: string;
    };
  };
  agents: {
    social: {
      title: string;
      subtitle: string;
      inputLabel: string;
      generateBtn: string;
    };
    design: {
      title: string;
      subtitle: string;
      inputLabel: string;
      generateBtn: string;
    };
    sendToDesign: string;
    saveToProject: string;
    savedToProject: string;
    exportPackage: string;
  };
  settings: {
    title: string;
    subtitle: string;
    language: string;
    languageDesc: string;
    workspaceOverview: string;
    dataPersistence: string;
    persistenceActive: string;
    persistenceDesc: string;
    platform: string;
    workspaceActions: string;
    resetData: string;
    resetDataDesc: string;
    areYouSure: string;
    labels: {
      system: string;
      version: string;
      techStack: string;
      storage: string;
      environment: string;
      clients: string;
      projects: string;
      tasks: string;
      deliverables: string;
      briefings: string;
    };
  };
}

export const en: Translations = {
  nav: {
    home: "Home",
    group: {
      work: "WORK",
      clients: "CLIENTS",
      intelligence: "INTELLIGENCE",
      agents: "AGENTS",
      library: "LIBRARY",
      system: "SYSTEM",
    },
    projects: "Projects",
    pipeline: "Pipeline",
    tasks: "Tasks",
    clients: "Clients",
    brandAssets: "Brand Assets",
    orchestrator: "Orchestrator",
    agents: "Agents",
    socialMedia: "Social Media",
    designAgent: "Design Agent",
    deliverables: "Deliverables",
    briefings: "Briefings",
    settings: "Settings",
  },
  common: {
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    delete: "Delete",
    edit: "Edit",
    create: "Create",
    back: "Back",
    open: "Open",
    view: "View",
    run: "Run",
    export: "Export",
    copy: "Copy",
    reset: "Reset",
    send: "Send",
    generate: "Generate",
    generating: "Generating…",
    viewAll: "View all",
    noActivity: "No activity yet",
    loading: "Loading…",
  },
  dashboard: {
    title: "Command Dashboard",
    derivedFrom: "Derived from project state",
    today: "Today",
    allClear: "All clear",
    allClearSub: "No actions pending. Projects are on track.",
    activeProjects: "Active Projects",
    noActiveProjects: "No active projects",
    outputs: "Outputs",
    allDeliverables: "All deliverables",
    noOutputs: "No outputs yet",
    alerts: "Alerts",
    recentActivity: "Recent Activity",
    noActivity: "No activity yet",
    openProject: "Open project",
    runAgent: "Run agent",
    viewProject: "View project",
    resolve: "Resolve",
    review: "Review",
    planProject: "Plan project",
    overdueBy: (n) => `overdue by ${n} day${n !== 1 ? "s" : ""}`,
    dUntilDeadline: (n) => `${n}d until deadline`,
    noOutputsAttached: "no outputs attached",
    noAgentsAssigned: "no agents assigned",
    hasBlockedTasks: "has blocked tasks",
    runSocialAgent: (name) => `Run Social Media Agent for ${name}`,
    runDesignAgent: (name) => `Run Design Agent for ${name}`,
    noOutputsSaved: (name) => `No outputs saved for ${name}`,
    blockedTasks: (n, name) => `${n} blocked task${n > 1 ? "s" : ""} in ${name}`,
    reviewDeliverable: (name, project) => `Review "${name}" — ${project}`,
    noTasksOrchestrator: (name) => `${name} has no tasks — run Orchestrator`,
    isOverdue: (name) => `${name} is overdue`,
  },
  project: {
    stages: {
      briefing: "Briefing",
      planning: "Planning",
      production: "Production",
      review: "Review",
      completed: "Completed",
    },
    status: {
      overdue: "OVERDUE",
      urgent: "URGENT",
    },
    labels: {
      deadline: "Deadline",
      daysLeft: (n) => `${n}d left`,
      daysOverdue: (n) => `${Math.abs(n)}d overdue`,
      client: "Client",
      goal: "Goal",
      type: "Type",
      stage: "Stage",
      priority: "Priority",
      agents: "Agents",
    },
    tabs: {
      overview: "Overview",
      execution: "Execution",
      tasks: "Tasks",
      pipeline: "Pipeline",
      deliverables: "Deliverables",
      briefing: "Briefing",
    },
    execution: {
      stageControl: "Stage Control",
      agentPipeline: "Agent Pipeline",
      outputs: "Outputs",
      runAgent: "Run",
      moveHere: "Move here",
      notStarted: "Not started",
      inProgress: "In progress",
      done: "Done",
      posts: "Posts",
      design: "Design",
      campaigns: "Campaigns",
      other: "Other",
      noDeliverables: "No deliverables saved yet.",
    },
  },
  agents: {
    social: {
      title: "Social Media Agent",
      subtitle: "Generate structured social media strategy from a brand brief",
      inputLabel: "Brand Brief",
      generateBtn: "Generate Strategy",
    },
    design: {
      title: "Design Agent",
      subtitle: "Generate visual execution instructions from a design contract",
      inputLabel: "Design Contract",
      generateBtn: "Generate Visual Briefs",
    },
    sendToDesign: "Send to Design Agent",
    saveToProject: "Save to Project",
    savedToProject: "Saved to Project",
    exportPackage: "Export Package",
  },
  settings: {
    title: "Settings",
    subtitle: "Platform configuration and workspace management",
    language: "Language",
    languageDesc: "Choose your preferred interface language",
    workspaceOverview: "Workspace Overview",
    dataPersistence: "Data Persistence",
    persistenceActive: "localStorage persistence active",
    persistenceDesc:
      "All data is stored in your browser's localStorage under the key agency-os-v1. Data persists across page refreshes and browser sessions on this device.",
    platform: "Platform",
    workspaceActions: "Workspace Actions",
    resetData: "Reset Demo Data",
    resetDataDesc:
      "Restore all data to the original mock dataset. This cannot be undone.",
    areYouSure: "Are you sure?",
    labels: {
      system: "System",
      version: "Version",
      techStack: "Tech Stack",
      storage: "Storage",
      environment: "Environment",
      clients: "Clients",
      projects: "Projects",
      tasks: "Tasks",
      deliverables: "Deliverables",
      briefings: "Briefings",
    },
  },
};
