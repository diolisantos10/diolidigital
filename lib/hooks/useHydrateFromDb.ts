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

      // DB is the source of truth, but REPLACE only when the DB actually has
      // rows for that entity — so real DB data supersedes stale local/pilot
      // data, while an empty (or failed) response never WIPES local rows that
      // may not have written through yet. Prevents the "successful-but-empty
      // response deletes unsynced data" data-loss path.
      const pick = <D, T>(db: D[] | null, adapt: () => T[], local: T[]): T[] =>
        db && db.length > 0 ? adapt() : local;
      useAgencyStore.setState((s) => ({
        clients:      pick(clients,      () => clients!.map(dbClientToMock),          s.clients),
        projects:     pick(projects,     () => projects!.map(dbProjectToMock),        s.projects),
        tasks:        pick(tasks,        () => tasks!.map(dbTaskToMock),              s.tasks),
        deliverables: pick(deliverables, () => deliverables!.map(dbDeliverableToMock), s.deliverables),
      }));
    })();
  }, []);
}
