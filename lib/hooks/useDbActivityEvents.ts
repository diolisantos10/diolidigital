"use client";

import { useState, useEffect, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import type { ActivityEvent } from "@/lib/agency/mock-data";
import { dbActivityEventToMock, type DbActivityEvent } from "@/lib/db/adapters";

export type DataSource = "db" | "local";

export interface UseDbActivityEventsResult {
  events: ActivityEvent[];
  source: DataSource;
  loading: boolean;
  create: (event: Omit<ActivityEvent, "id" | "timestamp">) => Promise<void>;
  refetch: () => void;
}

export function useDbActivityEvents(options?: { clientId?: string; projectId?: string; limit?: number }): UseDbActivityEventsResult {
  const { activity: storeActivity, addActivity } = useAgencyStore();

  const [dbEvents, setDbEvents] = useState<ActivityEvent[] | null>(null);
  const [loading, setLoading]   = useState(true);
  const [source, setSource]     = useState<DataSource>("local");

  const params = new URLSearchParams();
  if (options?.clientId)  params.set("clientId",  options.clientId);
  if (options?.projectId) params.set("projectId", options.projectId);
  if (options?.limit)     params.set("limit", String(options.limit));
  const url = `/api/activity-events${params.toString() ? `?${params}` : ""}`;

  const fetchFromDb = useCallback(() => {
    setLoading(true);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DbActivityEvent[]) => {
        setDbEvents(data.map(dbActivityEventToMock));
        setSource("db");
      })
      .catch(() => setSource("local"))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => { fetchFromDb(); }, [fetchFromDb]);

  // When DB is available, use DB events. Fall back to filtered store events.
  const events: ActivityEvent[] = dbEvents !== null
    ? dbEvents
    : storeActivity
        .filter((e) => {
          if (options?.clientId  && e.clientId  !== options.clientId)  return false;
          if (options?.projectId && e.projectId !== options.projectId) return false;
          return true;
        })
        .slice(0, options?.limit ?? 50);

  const create = useCallback(async (event: Omit<ActivityEvent, "id" | "timestamp">) => {
    // Always add to local store
    addActivity(event);
    // Also write to DB if connected
    if (source === "db") {
      try {
        const res = await fetch("/api/activity-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
        });
        if (res.ok) {
          const raw: DbActivityEvent = await res.json();
          const newEvent = dbActivityEventToMock(raw);
          setDbEvents((prev) => (prev ? [newEvent, ...prev] : [newEvent]));
        }
      } catch { /* local add already done */ }
    }
  }, [source, addActivity]);

  return { events, source, loading, create, refetch: fetchFromDb };
}
