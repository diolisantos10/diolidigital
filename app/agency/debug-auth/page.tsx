// Internal diagnostic page — never expose to clients.
// Navigate to /agency/debug-auth after login to verify session state.
import { headers, cookies } from "next/headers";
import { getSession, SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function formatExpiry(exp: number | undefined): string {
  if (!exp) return "unknown";
  const expiresAt = new Date(exp * 1000);
  const now = Date.now();
  const diffMs = expiresAt.getTime() - now;
  if (diffMs <= 0) return `EXPIRED (${expiresAt.toISOString()})`;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return `${diffDays}d ${diffHours}h remaining (expires ${expiresAt.toISOString()})`;
}

export default async function DebugAuthPage() {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);

  const sessionCookie = cookieStore.get(SESSION_COOKIE);
  const session = await getSession();

  const diag: Record<string, unknown> = {
    // Core auth state
    cookiePresent:   Boolean(sessionCookie),
    cookieLength:    sessionCookie?.value?.length ?? 0,
    sessionValid:    Boolean(session),
    authSecretSet:   Boolean(process.env.AUTH_SECRET),
    nodeEnv:         process.env.NODE_ENV,
    // Session payload
    email:           session?.email ?? null,
    role:            session?.role ?? null,
    userId:          session?.userId ? `${session.userId.slice(0, 8)}…` : null,
    workspaceId:     session?.workspaceId ? `${session.workspaceId.slice(0, 8)}…` : null,
    sessionExpiry:   formatExpiry(session?.exp),
    // Request headers (Railway / CDN layer)
    host:            headerStore.get("host"),
    xForwardedProto: headerStore.get("x-forwarded-proto"),
    xForwardedHost:  headerStore.get("x-forwarded-host"),
    xRailwayEdge:    headerStore.get("x-railway-edge"),
    secFetchDest:    headerStore.get("sec-fetch-dest"),
    secFetchMode:    headerStore.get("sec-fetch-mode"),
  };

  const allOk =
    diag.cookiePresent === true &&
    diag.sessionValid === true &&
    diag.authSecretSet === true;

  const boolKeys = new Set(["cookiePresent", "sessionValid", "authSecretSet"]);

  return (
    <div className="max-w-[720px]">
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Auth Diagnostics</h1>
        <span className="text-[10px] font-bold tracking-wide text-[#9B9B95] bg-[#F0F0ED] px-2 py-0.5 rounded-full uppercase">
          Internal
        </span>
      </div>

      <div
        className={`mb-5 px-4 py-3 rounded-[8px] border text-[13px] font-medium ${
          allOk
            ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]"
            : "bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]"
        }`}
      >
        {allOk
          ? `✓ Session valid — authenticated as ${diag.email} (${diag.role})`
          : "✗ Session problem detected — see table below"}
      </div>

      <div className="bg-white rounded-[12px] border border-[#E5E5E2] overflow-hidden text-[13px]">
        <table className="w-full">
          <tbody>
            {Object.entries(diag).map(([key, val]) => {
              const isBoolKey = boolKeys.has(key);
              const bad = isBoolKey && val === false;
              const good = isBoolKey && val === true;
              return (
                <tr key={key} className="border-b border-[#F0F0ED] last:border-0">
                  <td className="px-4 py-2.5 font-mono text-[#6B6B65] w-[220px] shrink-0">{key}</td>
                  <td className={`px-4 py-2.5 font-mono ${bad ? "text-[#DC2626] font-semibold" : good ? "text-[#166534]" : "text-[#1A1A1A]"}`}>
                    {val === null
                      ? <span className="text-[#9B9B95]">null</span>
                      : val === false
                      ? <span className="text-[#DC2626]">false ✗</span>
                      : val === true
                      ? <span className="text-[#166534]">true ✓</span>
                      : String(val)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px]">
        <p className="text-[12px] text-[#92400E] font-semibold mb-1">Required Railway Variables</p>
        <ul className="text-[11px] text-[#78350F] space-y-0.5 font-mono">
          <li>AUTH_SECRET=&lt;openssl rand -base64 32&gt;  ← required</li>
          <li>DATABASE_URL=&lt;...&gt;  ← required</li>
          <li>CRON_SECRET=&lt;...&gt;  ← required if cron enabled</li>
          <li>AUTH_DEBUG=true  ← optional, enables proxy logs</li>
        </ul>
      </div>

      <p className="mt-4 text-[11px] text-[#9B9B95]">
        Remove before going public. File: app/agency/debug-auth/page.tsx
      </p>
    </div>
  );
}
