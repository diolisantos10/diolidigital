"use client";

import { useState } from "react";
import AgencySidebar from "./AgencySidebar";
import { MobileMenuButton } from "./MobileMenuButton";

interface UserInfo {
  name: string;
  role: string;
  workspaceId: string;
}

export function AgencyShell({
  userInfo,
  children,
}: {
  userInfo: UserInfo;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      <AgencySidebar
        userInfo={userInfo}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <MobileMenuButton onClick={() => setMobileOpen(true)} />
      <main className="flex-1 md:ml-[224px] min-h-screen overflow-x-hidden">
        <div className="max-w-[1240px] mx-auto px-4 md:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
