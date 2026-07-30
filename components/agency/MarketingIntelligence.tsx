"use client";

// ── Central de Inteligência de Marketing (por projeto) ───────────────────────
// Consolida numa aba só tudo que a agência sabe do cliente: brand board,
// personas, território de conteúdo, posicionamento, redes e plano de tráfego.
// Puxa SÓ dado real de /api/projects/[id]/marketing. Onde o dado não existe,
// mostra estado honesto ("não informado" / "conecte") — nunca inventa número.

import { useEffect, useState } from "react";

interface MarketingData {
  project: { id: string; name: string };
  hasRequest: boolean;
  hasArtifacts: boolean;
  businessName: string | null;
  segment: string | null;
  services: string[];
  objectives: string[];
  brandBoard: {
    brandName: string | null; tagline: string | null; palette: string[];
    typography: string | null; photoStyle: string | null; gridLayout: string | null;
    storyTemplate: string | null; moodboard: string | null; brandSafety: string | null;
    values: string[]; updatedAt: string | null;
  } | null;
  brandPersona: { tone: string | null; advantage: string | null; moodboard: string | null; values: string[] };
  buyerPersona: { audience: string | null; objectives: string[] };
  territory: { pillars: string[]; themes: string[]; formats: string[] };
  positioning: { statement: string | null; uniqueValue: string | null; advantage: string | null };
  social: { handle: string | null; frequency: string | null; postsPerMonth: number | null; mainCTA: string | null; platforms: string[] };
  connections: { platform: string; name: string; status: string; lastSyncedAt: string | null }[];
  traffic: { budget: string | null; platforms: string[]; objectives: string[]; targeting: string | null; adFormats: string[]; kpis: string[] } | null;
  kpis: { strategic: string[]; traffic: string[]; organic: string[]; paid: string[]; tracking: string[]; cadence: string | null };
  posts: { caption: string; networks: string[]; format: string; pillar: string | null; scheduledFor: string | null; status: string }[];
}

// Small PT color-name → hex map so the brand palette renders real swatches.
const COLOR_HEX: Record<string, string> = {
  preto: "#111111", branco: "#FFFFFF", vermelho: "#D22730", "vermelho cazza": "#C0202B",
  azul: "#1E4FD8", "azul marinho": "#0B1F4D", verde: "#1E9E5A", amarelo: "#F5C518",
  cinza: "#8A8F98", dourado: "#C9A24B", ouro: "#C9A24B", rosa: "#E85C9A", roxo: "#6B3FA0",
  laranja: "#E8722C", bege: "#E7DCC8", marrom: "#6B4A2B", turquesa: "#1FB7A6",
};
function swatchFor(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s) || s.startsWith("rgb")) return raw.trim();
  for (const [name, hex] of Object.entries(COLOR_HEX)) if (s.includes(name)) return hex;
  return null;
}

function Panel({ title, hint, children, empty }: { title: string; hint?: string; children?: React.ReactNode; empty?: string }) {
  return (
    <section className="bg-white rounded-[14px] border border-[var(--border)] shadow-[0_1px_3px_rgba(7,10,31,0.04)] overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-5 py-3.5 border-b border-[var(--border)]">
        <h3 className="text-[14.5px] font-semibold tracking-[-0.015em] text-[var(--text-primary)]">{title}</h3>
        {hint && <span className="text-[11px] text-[var(--text-muted)] shrink-0">{hint}</span>}
      </div>
      <div className="p-5">
        {empty ? <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">{empty}</p> : children}
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1">{label}</div>
      {value && value.trim()
        ? <p className="text-[13.5px] text-[var(--text-primary)] leading-relaxed">{value}</p>
        : <p className="text-[13px] text-[var(--text-subtle)] italic">não informado</p>}
    </div>
  );
}

function Chips({ items, tone = "neutral", empty = "não informado" }: { items: string[]; tone?: "neutral" | "accent"; empty?: string }) {
  if (!items.length) return <p className="text-[13px] text-[var(--text-subtle)] italic">{empty}</p>;
  const cls = tone === "accent" ? "bg-[var(--accent-light)] text-[var(--navy)]" : "bg-[var(--accent)] text-[var(--text-secondary)]";
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => <span key={i} className={`text-[12px] font-medium px-2.5 py-1 rounded-full ${cls}`}>{it}</span>)}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1.5">{children}</div>;
}

export default function MarketingIntelligence({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [data, setData] = useState<MarketingData | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch(`/api/projects/${projectId}/marketing`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: MarketingData) => { if (alive) { setData(d); setState("ok"); } })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [projectId]);

  if (state === "loading") return <div className="py-16 text-center text-[13px] text-[var(--text-muted)]">Carregando inteligência do projeto…</div>;
  if (state === "error" || !data) return <div className="py-16 text-center text-[13px] text-[var(--danger)]">Não deu para carregar a inteligência do projeto. Tente recarregar.</div>;

  const bb = data.brandBoard;
  const bp = data.brandPersona;
  const buyer = data.buyerPersona;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-wrap items-center gap-2 -mt-1">
        <p className="text-[13px] text-[var(--text-secondary)] flex-1 min-w-[220px]">
          Tudo que a agência sabe sobre <strong className="text-[var(--text-primary)]">{data.businessName || projectName}</strong> num lugar só — marca, público, conteúdo e números.
        </p>
        {data.segment && <span className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-[var(--accent-light)] text-[var(--navy)]">{data.segment}</span>}
      </div>

      {!data.hasArtifacts && (
        <div className="bg-[var(--warning-bg)] border border-[#FDE68A] rounded-[12px] px-5 py-4">
          <p className="text-[13.5px] font-semibold text-[#92400E]">Este projeto ainda não tem inteligência gerada</p>
          <p className="text-[12.5px] text-[#92400E]/80 mt-1 leading-relaxed">Assim que a estratégia, o social, o design e o tráfego forem gerados e aprovados, os painéis abaixo se preenchem sozinhos com os dados reais do cliente.</p>
        </div>
      )}

      {/* Brand Board */}
      <Panel title="Brand Board" hint={bb?.updatedAt ? `atualizado ${new Date(bb.updatedAt).toLocaleDateString("pt-BR")}` : "identidade visual"}
        empty={!bb ? "A identidade visual aparece aqui quando o Design for gerado (ou o Brand Brain do cliente for preenchido)." : undefined}>
        {bb && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-4">
              {(bb.brandName || bb.tagline) && (
                <div className="flex items-baseline gap-2">
                  {bb.brandName && <span className="text-[15px] font-bold text-[var(--text-primary)]">{bb.brandName}</span>}
                  {bb.tagline && <span className="text-[12.5px] text-[var(--text-muted)]">{bb.tagline}</span>}
                </div>
              )}
              <div>
                <Label>Paleta</Label>
                {bb.palette.length ? (
                  <div className="flex flex-wrap gap-2">
                    {bb.palette.map((c, i) => {
                      const hex = swatchFor(c);
                      return (
                        <div key={i} className="inline-flex items-center gap-2 border border-[var(--border)] rounded-full pr-3 pl-1 py-1">
                          <span className="w-5 h-5 rounded-full border border-[var(--border)]" style={{ background: hex ?? "var(--accent)" }} />
                          <span className="text-[12px] font-medium text-[var(--text-secondary)]">{c}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-[13px] text-[var(--text-subtle)] italic">não informado</p>}
              </div>
              <Field label="Tipografia" value={bb.typography} />
              <Field label="Estilo de foto" value={bb.photoStyle} />
            </div>
            <div className="space-y-4">
              <Field label="Moodboard" value={bb.moodboard} />
              <Field label="Feed / grid" value={bb.gridLayout} />
              <Field label="Stories" value={bb.storyTemplate} />
              {bb.brandSafety && (
                <div className="rounded-[10px] bg-[var(--danger-bg)] border border-[#FECACA] px-3 py-2.5">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--danger)] mb-1">Nunca fazer</div>
                  <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed">{bb.brandSafety}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* Personas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Persona da marca">
          <div className="space-y-4">
            <Field label="Tom de voz" value={bp.tone} />
            <Field label="Diferencial / identidade" value={bp.advantage} />
            <div><Label>Valores</Label><Chips items={bp.values} tone="accent" /></div>
          </div>
        </Panel>
        <Panel title="Persona do comprador">
          <div className="space-y-4">
            <Field label="Público-alvo" value={buyer.audience} />
            <div>
              <Label>Objetivos com o público</Label>
              {buyer.objectives.length
                ? <ul className="space-y-1">{buyer.objectives.map((o, i) => <li key={i} className="text-[13px] text-[var(--text-secondary)] flex gap-2"><span className="text-[var(--azure)] shrink-0">—</span>{o}</li>)}</ul>
                : <p className="text-[13px] text-[var(--text-subtle)] italic">não informado</p>}
            </div>
          </div>
        </Panel>
      </div>

      {/* Território de conteúdo */}
      <Panel title="Território de conteúdo" hint={data.territory.pillars.length ? `${data.territory.pillars.length} pilares` : undefined}
        empty={!data.territory.pillars.length && !data.territory.themes.length ? "Os pilares e temas aparecem quando a Estratégia e o Social forem gerados." : undefined}>
        <div className="space-y-4">
          <div><Label>Pilares</Label><Chips items={data.territory.pillars} tone="accent" empty="—" /></div>
          {data.territory.formats.length > 0 && <div><Label>Formatos</Label><Chips items={data.territory.formats} /></div>}
          {data.territory.themes.length > 0 && (
            <div>
              <Label>Temas / calendário</Label>
              <ul className="space-y-1.5">
                {data.territory.themes.map((t, i) => <li key={i} className="text-[13px] text-[var(--text-secondary)] flex gap-2 leading-relaxed"><span className="text-[var(--azure)] shrink-0 mt-0.5">•</span>{t}</li>)}
              </ul>
            </div>
          )}
        </div>
      </Panel>

      {/* Posicionamento & negócio */}
      <Panel title="Posicionamento & negócio">
        <div className="space-y-4">
          <Field label="Posicionamento" value={data.positioning.statement} />
          <Field label="Proposta de valor única" value={data.positioning.uniqueValue} />
          <Field label="Vantagem competitiva" value={data.positioning.advantage} />
          <div className="grid gap-4 sm:grid-cols-2 pt-1">
            <div><Label>Serviços contratados</Label><Chips items={data.services} tone="accent" /></div>
            <div><Label>Objetivos do projeto</Label><Chips items={data.objectives} /></div>
          </div>
        </div>
      </Panel>

      {/* Redes sociais + métricas */}
      <Panel title="Redes sociais & métricas">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Perfil" value={data.social.handle} />
            <Field label="Frequência" value={data.social.frequency} />
            <Field label="Posts/mês" value={data.social.postsPerMonth != null ? String(data.social.postsPerMonth) : null} />
          </div>
          <div><Label>Plataformas</Label><Chips items={data.social.platforms} tone="accent" /></div>
          <div>
            <Label>Contas conectadas</Label>
            {data.connections.length ? (
              <div className="flex flex-wrap gap-2">
                {data.connections.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full bg-[var(--success-bg)] text-[var(--success)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />{c.platform}{c.name ? ` · ${c.name}` : ""}
                  </span>
                ))}
              </div>
            ) : <p className="text-[13px] text-[var(--text-subtle)] italic">nenhuma conta conectada</p>}
          </div>
          <div className="rounded-[10px] bg-[var(--accent-light)] border border-[var(--cyan)]/40 px-4 py-3">
            <p className="text-[12.5px] text-[var(--navy)] leading-relaxed">
              <strong>Números reais de alcance, seguidores e engajamento</strong> aparecem aqui quando a conta do cliente estiver conectada em <em>Ferramentas &amp; Integrações</em>. Sem conexão, não mostramos número — nada de estimativa inventada.
            </p>
          </div>
        </div>
      </Panel>

      {/* Tráfego pago */}
      <Panel title="Plano de tráfego pago" hint="plano, não resultado medido"
        empty={!data.traffic ? "O plano de tráfego aparece quando o Tráfego Pago for gerado." : undefined}>
        {data.traffic && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Orçamento" value={data.traffic.budget} />
              <div><Label>Plataformas</Label><Chips items={data.traffic.platforms} /></div>
            </div>
            <Field label="Segmentação / público" value={data.traffic.targeting} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Objetivos de campanha</Label><Chips items={data.traffic.objectives} tone="accent" /></div>
              <div><Label>Formatos de anúncio</Label><Chips items={data.traffic.adFormats} /></div>
            </div>
            {data.traffic.kpis.length > 0 && (
              <div><Label>Metas de performance (projeção)</Label><Chips items={data.traffic.kpis} /></div>
            )}
          </div>
        )}
      </Panel>

      {/* KPIs & medição */}
      <Panel title="KPIs & medição"
        empty={!data.kpis.strategic.length && !data.kpis.organic.length && !data.kpis.paid.length && !data.kpis.traffic.length ? "Os KPIs aparecem quando a Estratégia e o Analytics forem gerados." : undefined}>
        <div className="grid gap-4 sm:grid-cols-2">
          {data.kpis.strategic.length > 0 && <div><Label>Estratégicos</Label><Chips items={data.kpis.strategic} tone="accent" /></div>}
          {data.kpis.organic.length > 0 && <div><Label>Orgânico</Label><Chips items={data.kpis.organic} /></div>}
          {data.kpis.paid.length > 0 && <div><Label>Pago</Label><Chips items={data.kpis.paid} /></div>}
          {data.kpis.tracking.length > 0 && <div><Label>Rastreamento</Label><Chips items={data.kpis.tracking} /></div>}
        </div>
        {data.kpis.cadence && <p className="text-[12px] text-[var(--text-muted)] mt-4">Cadência de relatório: <span className="font-medium text-[var(--text-secondary)]">{data.kpis.cadence}</span></p>}
      </Panel>

      {/* Calendário de posts (se houver) */}
      {data.posts.length > 0 && (
        <Panel title="Calendário de conteúdo" hint={`${data.posts.length} posts planejados`}>
          <div className="space-y-2">
            {data.posts.slice(0, 8).map((p, i) => (
              <div key={i} className="flex items-center gap-3 border border-[var(--border)] rounded-[10px] px-3.5 py-2.5">
                <span className="text-[10.5px] font-semibold uppercase px-2 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] shrink-0">{p.format}</span>
                <p className="text-[13px] text-[var(--text-primary)] flex-1 min-w-0 truncate">{p.caption || p.pillar || "Post"}</p>
                {p.scheduledFor && <span className="text-[11.5px] text-[var(--text-muted)] shrink-0 mono-num">{new Date(p.scheduledFor).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
