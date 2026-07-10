"use client";

// Hydrates the Zustand store from the database on first mount of the agency
// shell. Before this, projects/clients/tasks/deliverables lived ONLY in each
// browser's localStorage — so logging in from another browser or device showed
// an empty panel. Now the real, DB-backed data (created by the briefing →
// approval flow) is merged in DB-first, so it appears everywhere.
//
// Merge, not replace: DB rows win by id; local-only rows the browser still
// holds (e.g. unsaved drafts) are kept. Write-through on create/update is a
// separate step — this only fixes the READ side.

import { useEffect, useRef } from "react";
import { useAgencyStore } from "@/store/agency-store";
import {
  dbClientToMock, dbProjectToMock, dbTaskToMock, dbDeliverableToMock,
  type DbClient, type DbProject, type DbTask, type DbDeliverable,
} from "@/lib/db/adapters";

function mergeById<T extends { id: string }>(dbRows: T[], local: T[]): T[] {
  const dbIds = new Set(dbRows.map((r) => r.id));
  return [...dbRows, ...local.filter((l) => !dbIds.has(l.id))];
}

async function fetchJson<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

export function useHydrateFromDb() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    (async () => {
      const [clients, projects, tasks, deliverables] = await Promise.all([
        fetchJson<DbClient>("/api/clients"),
        fetchJson<DbProject>("/api/projects"),
        fetchJson<DbTask>("/api/tasks"),
        fetchJson<DbDeliverable>("/api/deliverables"),
      ]);

      // Nothing came back (offline / all failed) — keep the local store as-is.
      if (!clients.length && !projects.length && !tasks.length && !deliverables.length) return;

      useAgencyStore.setState((s) => ({
        clients:      mergeById(clients.map(dbClientToMock),        s.clients),
        projects:     mergeById(projects.map(dbProjectToMock),      s.projects),
        tasks:        mergeById(tasks.map(dbTaskToMock),            s.tasks),
        deliverables: mergeById(deliverables.map(dbDeliverableToMock), s.deliverables),
      }));
    })();
  }, []);
}
