"use client";

import type {
  Deliverable,
  PreviewSection,
  PreviewPost,
  PreviewFrame,
  PreviewCalendarEntry,
  PreviewAdCopy,
  PreviewAudience,
  PreviewCampaign,
  PreviewDesignSpec,
} from "@/lib/agency/mock-data";

interface Props {
  deliverable: Deliverable;
  mode: "internal" | "portal";
  collapsed?: boolean;
}

// ─── Primitive renderers ──────────────────────────────────────────────────────

function SectionBlock({ s, mode }: { s: PreviewSection; mode: "internal" | "portal" }) {
  return (
    <div className="rounded-[8px] border border-[#E5E5E2] bg-[#FAFAF9] px-4 py-3 space-y-2">
      <div className="text-[12px] font-semibold text-[#1A1A1A]">{s.title}</div>
      <p className="text-[12px] text-[#4B4B45] leading-relaxed whitespace-pre-line">{s.body}</p>
      {s.items && s.items.length > 0 && (
        <ul className="space-y-1 pl-1">
          {s.items.map((item, i) => (
            <li key={i} className="text-[11px] text-[#6B6B65] flex gap-2 leading-relaxed">
              <span className="text-[#9B9B95] shrink-0">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {mode === "internal" && s.notes && (
        <div className="mt-1 text-[11px] text-[#9B9B95] italic border-t border-[#F0F0ED] pt-2">{s.notes}</div>
      )}
    </div>
  );
}

function PostBlock({ p, mode }: { p: PreviewPost; mode: "internal" | "portal" }) {
  return (
    <div className="rounded-[8px] border border-[#E5E5E2] bg-[#FAFAF9] px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-[#EEF0FF] text-[10px] font-bold text-[#5B5BD6] flex items-center justify-center shrink-0">{p.order}</span>
        <span className="text-[11px] font-semibold text-[#6B6B65] bg-[#F0F0ED] px-2 py-0.5 rounded-full">{p.format}</span>
      </div>
      <p className="text-[12px] text-[#4B4B45] leading-relaxed whitespace-pre-line">{p.caption}</p>
      <p className="text-[11px] text-[#9B9B95] leading-relaxed">{p.hashtags}</p>
      {mode === "internal" && p.notes && (
        <div className="text-[11px] text-[#9B9B95] italic border-t border-[#F0F0ED] pt-2">{p.notes}</div>
      )}
    </div>
  );
}

function FrameBlock({ f, mode }: { f: PreviewFrame; mode: "internal" | "portal" }) {
  return (
    <div className="rounded-[8px] border border-[#E5E5E2] bg-[#FAFAF9] px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-[#EEF0FF] text-[10px] font-bold text-[#5B5BD6] flex items-center justify-center shrink-0">{f.order}</span>
        <span className="text-[12px] font-semibold text-[#1A1A1A]">{f.description}</span>
      </div>
      {f.copy && (
        <p className="text-[12px] text-[#4B4B45] leading-relaxed whitespace-pre-line bg-white border border-[#F0F0ED] rounded-[6px] px-3 py-2">{f.copy}</p>
      )}
      {f.cta && (
        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#FF6B2C]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B2C]" />
          CTA: {f.cta}
        </div>
      )}
    </div>
  );
}

function CalendarEntryBlock({ e, mode }: { e: PreviewCalendarEntry; mode: "internal" | "portal" }) {
  return (
    <div className="rounded-[8px] border border-[#E5E5E2] bg-[#FAFAF9] px-4 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-[12px] font-semibold text-[#1A1A1A]">{e.title}</div>
          <div className="flex gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-[#9B9B95]">{e.week}{e.day ? ` · ${e.day}` : ""}</span>
            <span className="text-[10px] font-medium text-[#5B5BD6] bg-[#EEF0FF] px-1.5 py-0.5 rounded-full">{e.format}</span>
          </div>
        </div>
      </div>
      <p className="text-[12px] text-[#4B4B45] leading-relaxed">{e.caption}</p>
      {mode === "internal" && e.notes && (
        <div className="text-[11px] text-[#9B9B95] italic border-t border-[#F0F0ED] pt-2">{e.notes}</div>
      )}
    </div>
  );
}

function AdCopyBlock({ a }: { a: PreviewAdCopy }) {
  return (
    <div className="rounded-[8px] border border-[#E5E5E2] bg-[#FAFAF9] px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-[#1A1A1A]">{a.label}</span>
        {a.format && (
          <span className="text-[10px] text-[#9B9B95] bg-[#F0F0ED] px-1.5 py-0.5 rounded-full">{a.format}</span>
        )}
      </div>
      <div className="space-y-1">
        <div className="text-[12px] font-semibold text-[#1A1A1A] leading-snug">{a.headline}</div>
        <p className="text-[12px] text-[#4B4B45] leading-relaxed whitespace-pre-line">{a.body}</p>
      </div>
      <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#FF6B2C]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B2C]" />
        CTA: {a.cta}
      </div>
    </div>
  );
}

function AudienceBlock({ a }: { a: PreviewAudience }) {
  return (
    <div className="rounded-[8px] border border-[#E5E5E2] bg-[#FAFAF9] px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="text-[12px] font-semibold text-[#1A1A1A]">{a.name}</div>
        <span className="text-[10px] font-medium text-[#16A34A] bg-[#F0FDF4] border border-[#BBF7D0] px-1.5 py-0.5 rounded-full shrink-0">{a.size}</span>
      </div>
      <p className="text-[12px] text-[#4B4B45] leading-relaxed">{a.description}</p>
      <div className="text-[11px] text-[#6B6B65]"><span className="font-medium">Interesses:</span> {a.interests}</div>
      {a.behaviors && (
        <div className="text-[11px] text-[#6B6B65]"><span className="font-medium">Comportamentos:</span> {a.behaviors}</div>
      )}
    </div>
  );
}

function CampaignBlock({ c }: { c: PreviewCampaign }) {
  return (
    <div className="rounded-[8px] border border-[#E5E5E2] bg-[#FAFAF9] px-4 py-3 space-y-3">
      <div>
        <div className="text-[12px] font-semibold text-[#1A1A1A] font-mono">{c.name}</div>
        <div className="text-[11px] text-[#6B6B65] mt-0.5">{c.objective}</div>
        <div className="text-[11px] font-medium text-[#16A34A] mt-0.5">Orçamento: {c.budget}</div>
      </div>
      <div className="space-y-2">
        {c.adsets.map((as, i) => (
          <div key={i} className="bg-white border border-[#F0F0ED] rounded-[6px] px-3 py-2 space-y-1">
            <div className="text-[11px] font-semibold text-[#1A1A1A]">{as.name}</div>
            <div className="text-[11px] text-[#6B6B65]">{as.audience}</div>
            <div className="text-[11px] text-[#9B9B95]">Placements: {as.placements}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DesignSpecBlock({ s }: { s: PreviewDesignSpec; mode: "internal" | "portal" }) {
  return (
    <div className="rounded-[8px] border border-[#E5E5E2] bg-[#FAFAF9] px-4 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="text-[12px] font-semibold text-[#1A1A1A]">{s.name}</div>
        <span className="text-[10px] font-medium text-[#6B6B65] bg-[#F0F0ED] px-1.5 py-0.5 rounded-full shrink-0 font-mono">{s.format}</span>
      </div>
      <p className="text-[12px] text-[#4B4B45] leading-relaxed">{s.description}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DeliverablePreview({ deliverable: d, mode }: Props) {
  const pc = d.previewContent;
  if (!pc) return null;

  const hasContent =
    pc.summary ||
    (pc.sections?.length ?? 0) > 0 ||
    (pc.posts?.length ?? 0) > 0 ||
    (pc.frames?.length ?? 0) > 0 ||
    (pc.entries?.length ?? 0) > 0 ||
    (pc.adCopies?.length ?? 0) > 0 ||
    (pc.audiences?.length ?? 0) > 0 ||
    (pc.campaigns?.length ?? 0) > 0 ||
    (pc.designSpecs?.length ?? 0) > 0;

  if (!hasContent) return null;

  return (
    <div className="space-y-4">
      {pc.summary && (
        <p className="text-[12px] text-[#6B6B65] leading-relaxed bg-[#F7F7F6] rounded-[8px] px-4 py-3 border border-[#E5E5E2]">
          {pc.summary}
        </p>
      )}

      {pc.sections && pc.sections.length > 0 && (
        <div className="space-y-2">
          {pc.sections.map((s, i) => <SectionBlock key={i} s={s} mode={mode} />)}
        </div>
      )}

      {pc.entries && pc.entries.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9B9B95]">Publicações planejadas</div>
          {pc.entries.map((e, i) => <CalendarEntryBlock key={i} e={e} mode={mode} />)}
        </div>
      )}

      {pc.posts && pc.posts.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9B9B95]">Posts ({pc.posts.length})</div>
          {pc.posts.map((p, i) => <PostBlock key={i} p={p} mode={mode} />)}
        </div>
      )}

      {pc.frames && pc.frames.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9B9B95]">Telas ({pc.frames.length})</div>
          {pc.frames.map((f, i) => <FrameBlock key={i} f={f} mode={mode} />)}
        </div>
      )}

      {pc.adCopies && pc.adCopies.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9B9B95]">Copy de anúncios ({pc.adCopies.length})</div>
          {pc.adCopies.map((a, i) => <AdCopyBlock key={i} a={a} />)}
        </div>
      )}

      {pc.audiences && pc.audiences.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9B9B95]">Públicos-alvo ({pc.audiences.length})</div>
          {pc.audiences.map((a, i) => <AudienceBlock key={i} a={a} />)}
        </div>
      )}

      {pc.campaigns && pc.campaigns.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9B9B95]">Campanhas ({pc.campaigns.length})</div>
          {pc.campaigns.map((c, i) => <CampaignBlock key={i} c={c} />)}
        </div>
      )}

      {pc.designSpecs && pc.designSpecs.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9B9B95]">Especificações de design ({pc.designSpecs.length})</div>
          {pc.designSpecs.map((s, i) => <DesignSpecBlock key={i} s={s} mode={mode} />)}
        </div>
      )}
    </div>
  );
}
