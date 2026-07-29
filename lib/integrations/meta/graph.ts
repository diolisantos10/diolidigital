// Thin, typed wrapper around the Meta Graph API. SERVER-ONLY.
// Every call goes through here so error handling, timeouts, and the versioned
// base URL are consistent.

import { GRAPH_BASE } from "./config";

const TIMEOUT_MS = 20_000;

export interface GraphError {
  message: string;
  type?: string;
  code?: number;
  fbtrace_id?: string;
}

export class GraphApiError extends Error {
  status: number;
  detail?: GraphError;
  constructor(message: string, status: number, detail?: GraphError) {
    super(message);
    this.name = "GraphApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const raw = await res.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    // non-JSON body
  }
  if (!res.ok) {
    const err = (body as { error?: GraphError } | null)?.error;
    throw new GraphApiError(
      err?.message ?? `Graph API HTTP ${res.status}`,
      res.status,
      err,
    );
  }
  return body as T;
}

function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  // Absolute path (starts with http) is used as-is; otherwise prefix the base.
  const base = path.startsWith("http") ? path : `${GRAPH_BASE}/${path.replace(/^\//, "")}`;
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

// GET a Graph node/edge. Pass the access token as `accessToken`.
export async function graphGet<T = unknown>(
  path: string,
  accessToken: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = buildUrl(path, { ...params, access_token: accessToken });
  const res = await fetchWithTimeout(url, { method: "GET" });
  return parse<T>(res);
}

// POST a JSON body — required by the WhatsApp Cloud API (/{phone}/messages),
// which does not accept form-encoded params for nested structures like
// `template.components`.
export async function graphPostJson<T = unknown>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}/${path.replace(/^\//, "")}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  return parse<T>(res);
}

// POST to a Graph node/edge. Body params are form-encoded (Graph convention).
export async function graphPost<T = unknown>(
  path: string,
  accessToken: string,
  body: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}/${path.replace(/^\//, "")}`;
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...body, access_token: accessToken })) {
    if (v !== undefined && v !== null && v !== "") form.set(k, String(v));
  }
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  return parse<T>(res);
}
