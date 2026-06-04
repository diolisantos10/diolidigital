"use client";

import { useState, useEffect, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import type { Task, TaskStatus } from "@/lib/agency/mock-data";
import { dbTaskToMock, type DbTask } from "@/lib/db/adapters";

export type DataSource = "db" | "local";

// IDs from DB are CUIDs (25+ chars). Store IDs are short strings like "t1".
function isDbId(id: string): boolean { return id.length > 12; }

export interface UseDbTasksResult {
  tasks: Task[];
  dbTasks: Task[];
  source: DataSource;
  dbCount: number;
  loading: boolean;
  updateStatus: (id: string, status: TaskStatus) => void;
  createDbTask: (t: {
    projectId: string;
    title: string;
    description?: string;
    agentId?: string;
    dueDate?: string;
  }) => Promise<Task | null>;
  refetch: () => void;
}

export function useDbTasks(): UseDbTasksResult {
  const { tasks: storeTasks, updateTaskStatus: storeUpdate } = useAgencyStore();
  const [dbTasks, setDbTasks] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource]   = useState<DataSource>("local");

  const fetchFromDb = useCallback(() => {
    setLoading(true);
    fetch("/api/tasks")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DbTask[]) => {
        setDbTasks(data.map(dbTaskToMock));
        setSource("db");
      })
      .catch(() => setSource("local"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchFromDb(); }, [fetchFromDb]);

  // Merge: DB tasks first, then store tasks whose IDs are not already in DB
  const dbIdSet = new Set((dbTasks ?? []).map((t) => t.id));
  const mergedTasks: Task[] = [
    ...(dbTasks ?? []),
    ...storeTasks.filter((t) => !dbIdSet.has(t.id)),
  ];

  const updateStatus = useCallback((id: string, status: TaskStatus) => {
    if (isDbId(id) && source === "db") {
      // Optimistic update in local state
      setDbTasks((prev) =>
        prev ? prev.map((t) => (t.id === id ? { ...t, status } : t)) : prev
      );
      fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).catch(() => fetchFromDb()); // revert on failure
    } else {
      storeUpdate(id, status);
    }
  }, [source, storeUpdate, fetchFromDb]);

  const createDbTask = useCallback(async (t: {
    projectId: string;
    title: string;
    description?: string;
    agentId?: string;
    dueDate?: string;
  }): Promise<Task | null> => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(t),
      });
      if (!res.ok) return null;
      const dbTask: DbTask = await res.json();
      const newTask = dbTaskToMock(dbTask);
      setDbTasks((prev) => (prev ? [newTask, ...prev] : [newTask]));
      if (source !== "db") setSource("db");
      return newTask;
    } catch {
      return null;
    }
  }, [source]);

  return {
    tasks: mergedTasks,
    dbTasks: dbTasks ?? [],
    source,
    dbCount: dbTasks?.length ?? 0,
    loading,
    updateStatus,
    createDbTask,
    refetch: fetchFromDb,
  };
}
