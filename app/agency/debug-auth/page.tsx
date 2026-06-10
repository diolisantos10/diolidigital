// Internal diagnostic page — master-only, never expose to clients.
// Navigte to /agency/debug-auth after login to verify session state.
import { headers, cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DebugAuthPage() {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);

  const sessionCookie = cookieStore.get("dioli-session");
  const session = await getSession();

  const diag = {
    cookiePresent: Boolean(sessionCookie),
    cookieLength: sessionCookie?.value?.length ?? 0,
    sessionValid: Boolean(session),
    email: session?.email ?? null,
    role: session?.role ?? null,
    userId: session?.userId ?? null,
    workspaceId: session?.workspaceId ?? null,
    authSecretSet: Boolean(process.env.AUTH_SECRET),
    nodeEnv: process.env.NODE_ENV,
    host: headerStore.get("host"),
    xForwardedProto: headerStore.get("x-forwarded-proto"),
    xForwardedHost: headerStore.get("x-forwarded-host"),
    xRailwayEdge: headerStore.get("x-railway-edge"),
    secFetchDest: headerStore.get("sec-fetch-dest"),
    secFetchMode: headerStore.get("sec-fetch-mode"),
  };

  const allOk = diag.cookiePresent && diag.sessionValid && diag.authSecretSet;

  return (
    <div className="max-w-[700px]">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Auth Diagnostics</h1>
        <span className="text-[10px] font-bold tracking-wide text-[#9B9B95] bg-[#F0F0ED] px-2 py-0.5 rounded-full uppercase">
          Internal
        </span>
      </div>

      <div
        className={`mb-6 px-4 py-3 rounded-[8px] border text-[13px] font-medium ${
          allOk
            ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]"
            : "bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]"
        }`}
      >
        {allOk
          ? "✓ Session is valid — authenticated as " + diag.email
          : "✗ Session problem detected — see details below"}
      </div>

      <div className="bg-white rounded-[10px] border border-[#E5E5E2] overflow-hidden">
        <table className="w-full text-[13px]">
          <tbody>
            {Object.entries(diag).map(([key, val]) => {
              const isOk =
                key === "cookiePresent" || key === "sessionValid" || key === "authSecretSet"
                  ? val === true
                  : true;
              const isBad =
                key === "cookiePresent" || key === "sessionValid" || key === "authSecretSet"
                  ? val === false
                  : false;

              return (
                <tr key={key} className="border-b border-[#F0F0ED] last:border-0">
                  <td className="px-4 py-2.5 text-[#6B6B65] font-mono w-[240px]">{key}</td>
                  <td
                    className={`px-4 py-2.5 font-mono ${
                      isOk ? "text-[#166534]" : isBad ? "text-[#DC2626] font-semibold" : "text-[#1A1A1A]"
                    }`}
                  >
                    {val === null ? (
                      <span className="text-[#9B9B95]">null</span>
                    ) : val === false ? (
                      <span className="text-[#DC2626]">false ✗</span>
                    ) : val === true ? (
                      <span className="text-[#166534]">true ✓</span>
                    ) : (
                      String(val)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[11px] text-[#9B9B95]">
        Remove this page before making the app public. File: app/agency/debug-auth/page.tsx
      </p>
    </div>
  );
}
