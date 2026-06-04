"use client";

import { useState, useEffect, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import type { StrategyRoom } from "@/lib/agency/mock-data";
import { dbStrategyRoomToMock, type DbStrategyRoom } from "@/lib/db/adapters";

export type DataSource = "db" | "local";

export interface UseDbStrategyRoomsResult {
  strategyRooms: StrategyRoom[];
  source: DataSource;
  loading: boolean;
  getRoom: (projectId: string) => StrategyRoom | undefined;
  /** Generate (or regenerate) a Strategy Room for a project. Persists to DB
   *  when connected, always keeps the local store in sync as fallback. */
  generate: (projectId: string) => void;
  clear: (projectId: string) => void;
  refetch: () => void;
}

export function useDbStrategyRooms(): UseDbStrategyRoomsResult {
  const {
    strategyRooms: storeRooms,
    generateStrategyRoom: storeGenerate,
    clearStrategyRoom: storeClear,
  } = useAgencyStore();

  const [dbRooms, setDbRooms] = useState<StrategyRoom[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource]   = useState<DataSource>("local");

  const fetchFromDb = useCallback(() => {
    setLoading(true);
    fetch("/api/strategy-rooms")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DbStrategyRoom[]) => {
        const rooms = data
          .map(dbStrategyRoomToMock)
          .filter((r): r is StrategyRoom => r !== null);
        setDbRooms(rooms);
        setSource("db");
      })
      .catch(() => setSource("local"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchFromDb(); }, [fetchFromDb]);

  // Merge: DB-first, then store rooms whose project isn't already in DB
  const dbProjectIds = new Set((dbRooms ?? []).map((r) => r.projectId));
  const strategyRooms = [
    ...(dbRooms ?? []),
    ...storeRooms.filter((r) => !dbProjectIds.has(r.projectId)),
  ];

  const getRoom = useCallback(
    (projectId: string) => strategyRooms.find((r) => r.projectId === projectId),
    [strategyRooms]
  );

  const generate = useCallback((projectId: string) => {
    // Always generate into the local store (keeps store consumers + activity working)
    storeGenerate(projectId);
    const room = useAgencyStore.getState().strategyRooms.find((r) => r.projectId === projectId);
    if (source === "db" && room) {
      // Optimistic local DB-state update
      setDbRooms((prev) => [room, ...(prev ?? []).filter((r) => r.projectId !== projectId)]);
      fetch("/api/strategy-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, room }),
      }).catch(() => fetchFromDb());
    }
  }, [source, storeGenerate, fetchFromDb]);

  const clear = useCallback((projectId: string) => {
    storeClear(projectId);
    if (source === "db") {
      setDbRooms((prev) => (prev ? prev.filter((r) => r.projectId !== projectId) : prev));
      fetch(`/api/strategy-rooms/${projectId}`, { method: "DELETE" }).catch(() => fetchFromDb());
    }
  }, [source, storeClear, fetchFromDb]);

  return { strategyRooms, source, loading, getRoom, generate, clear, refetch: fetchFromDb };
}
