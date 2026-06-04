"use client";

import { useState, useEffect, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import type { Project } from "@/lib/agency/mock-data";
import { dbProjectToMock, type DbProject } from "@/lib/db/adapters";

export type DataSource = "db" | "local";

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
  const [source, setSource]         = useState<DataSource>("local");

  const fetchFromDb = useCallback(() => {
    setLoading(true);
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DbProject[]) => {
        setDbProjects(data.map(dbProjectToMock));
        setSource("db");
      })
      .catch(() => setSource("local"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchFromDb(); }, [fetchFromDb]);

  return {
    projects: dbProjects ?? storeProjects,
    loading,
    source,
    dbCount: dbProjects?.length ?? 0,
    refetch: fetchFromDb,
  };
}
