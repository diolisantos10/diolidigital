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
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 space-y-2">
      <div className="text-[12px] font-semibold text-[var(--text-primary)]">{s.title}</div>
      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">{s.body}</p>
      {s.items && s.items.length > 0 && (
        <ul className="space-y-1 pl-1">
          {s.items.map((item, i) => (
            <li key={i} className="text-[11px] text-[var(--text-secondary)] flex gap-2 leading-relaxed">
              <span className="text-[var(--text-muted)] shrink-0">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {mode === "internal" && s.notes && (
        <div className="mt-1 text-[11px] text-[var(--text-muted)] italic border-t border-[var(--border)] pt-2">{s.notes}</div>
      )}
    </div>
  );
}

function PostBlock({ p, mode }: { p: PreviewPost; mode: "internal" | "portal" }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-[var(--accent-light)] text-[10px] font-bold text-[var(--navy)] flex items-center justify-center shrink-0">{p.order}</span>
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] bg-[var(--accent)] px-2 py-0.5 rounded-full">{p.format}</span>
      </div>
      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">{p.caption}</p>
      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{p.hashtags}</p>
      {mode === "internal" && p.notes && (
        <div className="text-[11px] text-[var(--text-muted)] italic border-t border-[var(--border)] pt-2">{p.notes}</div>
      )}
    </div>
  );
}

function FrameBlock({ f, mode }: { f: PreviewFrame; mode: "internal" | "portal" }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-[var(--accent-light)] text-[10px] font-bold text-[var(--navy)] flex items-center justify-center shrink-0">{f.order}</span>
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">{f.description}</span>
      </div>
      {f.copy && (
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-line bg-white border border-[var(--border)] rounded-[6px] px-3 py-2">{f.copy}</p>
      )}
      {f.cta && (
        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--teal-text)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#12B5AC]" />
          CTA: {f.cta}
        </div>
      )}
    </div>
  );
}

function CalendarEntryBlock({ e, mode }: { e: PreviewCalendarEntry; mode: "internal" | "portal" }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-[12px] font-semibold text-[var(--text-primary)]">{e.title}</div>
          <div className="flex gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-[var(--text-muted)]">{e.week}{e.day ? ` · ${e.day}` : ""}</span>
            <span className="text-[10px] font-medium text-[var(--navy)] bg-[var(--accent-light)] px-1.5 py-0.5 rounded-full">{e.format}</span>
          </div>
        </div>
      </div>
      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{e.caption}</p>
      {mode === "internal" && e.notes && (
        <div className="text-[11px] text-[var(--text-muted)] italic border-t border-[var(--border)] pt-2">{e.notes}</div>
      )}
    </div>
  );
}

function AdCopyBlock({ a }: { a: PreviewAdCopy }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--text-primary)]">{a.label}</span>
        {a.format && (
          <span className="text-[10px] text-[var(--text-muted)] bg-[var(--accent)] px-1.5 py-0.5 rounded-full">{a.format}</span>
        )}
      </div>
      <div className="space-y-1">
        <div className="text-[12px] font-semibold text-[var(--text-primary)] leading-snug">{a.headline}</div>
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">{a.body}</p>
      </div>
      <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--teal-text)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#12B5AC]" />
        CTA: {a.cta}
      </div>
    </div>
  );
}

function AudienceBlock({ a }: { a: PreviewAudience }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="text-[12px] font-semibold text-[var(--text-primary)]">{a.name}</div>
        <span className="text-[10px] font-medium text-[var(--success)] bg-[#F0FDF4] border border-[#BBF7D0] px-1.5 py-0.5 rounded-full shrink-0">{a.size}</span>
      </div>
      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{a.description}</p>
      <div className="text-[11px] text-[var(--text-secondary)]"><span className="font-medium">Interesses:</span> {a.interests}</div>
      {a.behaviors && (
        <div className="text-[11px] text-[var(--text-secondary)]"><span className="font-medium">Comportamentos:</span> {a.behaviors}</div>
      )}
    </div>
  );
}

function CampaignBlock({ c }: { c: PreviewCampaign }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 space-y-3">
      <div>
        <div className="text-[12px] font-semibold text-[var(--text-primary)] font-mono">{c.name}</div>
        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">{c.objective}</div>
        <div className="text-[11px] font-medium text-[var(--success)] mt-0.5">Orçamento: {c.budget}</div>
      </div>
      <div className="space-y-2">
        {c.adsets.map((as, i) => (
          <div key={i} className="bg-white border border-[var(--border)] rounded-[6px] px-3 py-2 space-y-1">
            <div className="text-[11px] font-semibold text-[var(--text-primary)]">{as.name}</div>
            <div className="text-[11px] text-[var(--text-secondary)]">{as.audience}</div>
            <div className="text-[11px] text-[var(--text-muted)]">Placements: {as.placements}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DesignSpecBlock({ s }: { s: PreviewDesignSpec; mode: "internal" | "portal" }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="text-[12px] font-semibold text-[var(--text-primary)]">{s.name}</div>
        <span className="text-[10px] font-medium text-[var(--text-secondary)] bg-[var(--accent)] px-1.5 py-0.5 rounded-full shrink-0 font-mono">{s.format}</span>
      </div>
      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{s.description}</p>
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
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed bg-[var(--bg)] rounded-[8px] px-4 py-3 border border-[var(--border)]">
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
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Publicações planejadas</div>
          {pc.entries.map((e, i) => <CalendarEntryBlock key={i} e={e} mode={mode} />)}
        </div>
      )}

      {pc.posts && pc.posts.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Posts ({pc.posts.length})</div>
          {pc.posts.map((p, i) => <PostBlock key={i} p={p} mode={mode} />)}
        </div>
      )}

      {pc.frames && pc.frames.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Telas ({pc.frames.length})</div>
          {pc.frames.map((f, i) => <FrameBlock key={i} f={f} mode={mode} />)}
        </div>
      )}

      {pc.adCopies && pc.adCopies.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Copy de anúncios ({pc.adCopies.length})</div>
          {pc.adCopies.map((a, i) => <AdCopyBlock key={i} a={a} />)}
        </div>
      )}

      {pc.audiences && pc.audiences.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Públicos-alvo ({pc.audiences.length})</div>
          {pc.audiences.map((a, i) => <AudienceBlock key={i} a={a} />)}
        </div>
      )}

      {pc.campaigns && pc.campaigns.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Campanhas ({pc.campaigns.length})</div>
          {pc.campaigns.map((c, i) => <CampaignBlock key={i} c={c} />)}
        </div>
      )}

      {pc.designSpecs && pc.designSpecs.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Especificações de design ({pc.designSpecs.length})</div>
          {pc.designSpecs.map((s, i) => <DesignSpecBlock key={i} s={s} mode={mode} />)}
        </div>
      )}
    </div>
  );
}
