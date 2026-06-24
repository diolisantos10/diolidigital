import { verifySession } from "@/lib/auth/dal";
import AgencySidebar from "@/components/agency/layout/AgencySidebar";

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession(); // redirects to /auth/signin if no valid session
  const userInfo = { name: session.name, role: session.role, workspaceId: session.workspaceId };

  return (
    <div className="flex min-h-screen bg-[#F7F7F6]">
      <AgencySidebar userInfo={userInfo} />
      <main className="flex-1 ml-[220px] min-h-screen">
        <div className="max-w-[1200px] mx-auto px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
