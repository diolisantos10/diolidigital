"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAgencyStore } from "@/store/agency-store";
import type { Project } from "@/lib/agency/mock-data";
import { dbProjectToMock, type DbProject } from "@/lib/db/adapters";

export type DataSource = "db" | "local" | "mixed";

export interface UseDbProjectsResult {
  projects: Project[];
  loading: boolean;
  source: DataSource;
  dbCount: number;
  refetch: () => void;
}

export function useDbProjects(): UseDbProjectsResult {
  const storeProjects = useAgencyStore((s) => s.projects);
  const [dbProjects, setDbProjects] = useState<Project[] | null>(null);
  const [loading, setLoading]       = useState(true);

  const fetchFromDb = useCallback(() => {
    setLoading(true);
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DbProject[]) => setDbProjects(data.map(dbProjectToMock)))
      .catch(() => setDbProjects(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchFromDb(); }, [fetchFromDb]);

  // Always merge: DB projects take priority; local-only projects are appended.
  // This ensures that projects created in the Zustand store (e.g. via the
  // "Criar projeto" flow) are visible even when the DB is empty.
  const merged = useMemo<Project[]>(() => {
    if (!dbProjects) return storeProjects;
    const dbIds = new Set(dbProjects.map((p) => p.id));
    return [...dbProjects, ...storeProjects.filter((p) => !dbIds.has(p.id))];
  }, [dbProjects, storeProjects]);

  const source: DataSource =
    !dbProjects ? "local"
    : dbProjects.length > 0 && storeProjects.some((p) => !dbProjects.some((d) => d.id === p.id)) ? "mixed"
    : dbProjects.length > 0 ? "db"
    : "local";

  return {
    projects: merged,
    loading,
    source,
    dbCount: dbProjects?.length ?? 0,
    refetch: fetchFromDb,
  };
}
