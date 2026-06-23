"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { MOCK_BRAND_ASSETS, AssetType } from "@/lib/agency/mock-data";
import Link from "next/link";

const ASSET_COLORS: Record<AssetType, string> = {
  logo: "bg-[#E6FBFA] text-[#070A1F]",
  color_palette: "bg-[#FEF3C7] text-[#D97706]",
  typography: "bg-[#F0FDF4] text-[#16A34A]",
  tone_of_voice: "bg-[#FFF7ED] text-[#C2410C]",
  visual_reference: "bg-[#F0F0ED] text-[#6B6B65]",
  guidelines: "bg-[#F5F3FF] text-[#7C3AED]",
};

export default function BrandAssetsPage() {
  const { clients } = useAgencyStore();
  const [clientFilter, setClientFilter] = useState("all");

  const filtered = MOCK_BRAND_ASSETS.filter(
    (a) => clientFilter === "all" || a.clientId === clientFilter
  );

  // Group by client
  const grouped = clients.map((client) => ({
    client,
    assets: filtered.filter((a) => a.clientId === client.id),
  })).filter((g) => g.assets.length > 0);

  return (
    <>
      <AgencyHeader
        title="Brand Assets"
        subtitle="Per-client brand materials — logos, colors, typography, voice guidelines"
      />

      {/* Client filter */}
      <div className="flex items-center gap-2 mb-6">
        {[{ id: "all", name: "All Clients" }, ...clients].map((c) => (
          <button
            key={c.id}
            onClick={() => setClientFilter(c.id)}
            className={`h-7 px-3 text-[12px] font-medium rounded-[6px] transition-colors ${
              clientFilter === c.id ? "bg-[#1A1A1A] text-white" : "bg-white border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F0F0ED]"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-8 py-16 text-center">
          <p className="text-[14px] font-medium text-[#1A1A1A]">No assets found</p>
          <p className="text-[13px] text-[#9B9B95] mt-1.5">Brand assets are added per client in their client profile.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ client, assets }) => (
            <div key={client.id}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[5px] bg-[#F0F0ED] flex items-center justify-center text-[10px] font-bold text-[#6B6B65]">
                    {client.name.slice(0, 2).toUpperCase()}
                  </div>
                  <h2 className="text-[14px] font-semibold text-[#1A1A1A]">{client.name}</h2>
                  <span className="text-[12px] text-[#9B9B95]">{assets.length} assets</span>
                </div>
                <Link href={`/agency/clients/${client.id}`} className="text-[12px] text-[#070A1F] hover:underline">
                  View client
                </Link>
              </div>

              <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="divide-y divide-[#F0F0ED]">
                  {assets.map((asset) => (
                    <div key={asset.id} className="flex items-start gap-4 px-5 py-4">
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-[5px] shrink-0 mt-0.5 ${ASSET_COLORS[asset.type]}`}>
                        {asset.type.replace("_", " ").toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[#1A1A1A]">{asset.name}</div>
                        {asset.value && (
                          <div className="text-[12px] text-[#6B6B65] mt-0.5 font-mono">{asset.value}</div>
                        )}
                        {asset.notes && (
                          <div className="text-[11px] text-[#9B9B95] mt-1 italic leading-relaxed">{asset.notes}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
