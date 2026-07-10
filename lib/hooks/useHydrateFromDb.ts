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

// Returns the parsed array, or null if the request FAILED (so we can tell an
// empty-but-successful response apart from an error and never wipe local data
// on a network blip).
async function fetchJson<T>(url: string): Promise<T[] | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? (data as T[]) : null;
  } catch {
    return null;
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

      // DB is the single source of truth: each entity that loaded successfully
      // REPLACES the local copy, so stale localStorage (e.g. pilot/demo data
      // loaded in one browser) stops showing and every browser matches. A
      // failed fetch (null) leaves that entity's local data untouched.
      useAgencyStore.setState((s) => ({
        clients:      clients      ? clients.map(dbClientToMock)           : s.clients,
        projects:     projects     ? projects.map(dbProjectToMock)         : s.projects,
        tasks:        tasks         ? tasks.map(dbTaskToMock)              : s.tasks,
        deliverables: deliverables ? deliverables.map(dbDeliverableToMock) : s.deliverables,
      }));
    })();
  }, []);
}
