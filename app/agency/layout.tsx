import AgencySidebar from "@/components/agency/layout/AgencySidebar";

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#F7F7F6]">
      <AgencySidebar />
      <main className="flex-1 ml-[220px] min-h-screen">
        <div className="max-w-[1200px] mx-auto px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
