import { verifySession } from "@/lib/auth/dal";
import { AgencyShell } from "@/components/agency/layout/AgencyShell";

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession(); // redirects to /auth/signin if no valid session
  const userInfo = { name: session.name, role: session.role, workspaceId: session.workspaceId };

  return <AgencyShell userInfo={userInfo}>{children}</AgencyShell>;
}
