"use client";

import Link from "next/link";
import { SDRSimulator } from "@/components/agency/simulations/SDRSimulator";

export default function SDRSimulatorPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-5 text-[12px] text-[#9B9B95]">
        <Link href="/agency/simulations" className="hover:text-[#6B6B65] transition-colors">
          Laboratório
        </Link>
        <span>/</span>
        <span className="text-[#1A1A1A] font-medium">SDR Agent</span>
        <span className="ml-1 text-[9px] font-bold text-[#C0C0BC] bg-[#F0F0ED] px-1.5 py-0.5 rounded-full tracking-wide">
          INTERNO
        </span>
      </div>

      <SDRSimulator />
    </div>
  );
}
