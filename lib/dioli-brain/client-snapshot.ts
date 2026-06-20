// SERVER-ONLY. Never import from client components.
// Reads ClientRequestDb + (optionally) the related Client's BrandBrain from Prisma
// for a clientRequestId and returns a sanitized ClientKnowledgeSnapshot.
//
// Law 2: never invents missing values. A DB field that is null/empty becomes
// `undefined` on the snapshot and its name is recorded in `missingFields[]`.
// No PII keys (email/phone) are ever copied into the snapshot.

import { prisma } from "@/lib/db/client";

export interface ClientKnowledgeSnapshot {
  clientRequestId: string;
  businessName: string;
  segment: string;
  services: string[];
  objectives: string[];
  rawContext: string;
  // BrandBrain fields (from DB, not from UI state)
  brandVoice?: string;
  positioning?: string;
  targetAudience?: string;
  preferredChannels?: string;
  visualStyle?: string;
  colors?: string;
  fonts?: string;
  thingsToAvoid?: string;
  productsToHighlight?: string;
  // Presence flags
  brandBrainComplete: boolean;
  missingFields: string[];
}

// The brand-brain-derived fields we track for completeness. The DB BrandBrain
// model carries a subset; the rest are reserved for richer brand sources and are
// always reported as missing until a source provides them (never invented).
const TRACKED_BRAND_FIELDS = [
  "brandVoice",
  "positioning",
  "targetAudience",
  "preferredChannels",
  "visualStyle",
  "colors",
  "fonts",
  "thingsToAvoid",
  "productsToHighlight",
] as const;

function clean(v: string | null | undefined): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

export async function buildClientSnapshot(
  clientRequestId: string,
): Promise<ClientKnowledgeSnapshot | null> {
  const request = await prisma.clientRequestDb.findUnique({
    where: { id: clientRequestId },
  });
  if (!request) return null;

  // BrandBrain lives on Client (1:1). A request may not be linked to a Client yet.
  const brandBrain = request.clientId
    ? await prisma.brandBrain.findUnique({ where: { clientId: request.clientId } })
    : null;

  // Map DB BrandBrain → snapshot fields. Fields the DB model does not carry stay
  // undefined (never invented). `tone` maps to brandVoice; colors are derived from
  // the two color fields; typography → fonts.
  const colorParts = [clean(brandBrain?.primaryColor), clean(brandBrain?.secondaryColor)].filter(Boolean);

  const mapped: Partial<Record<(typeof TRACKED_BRAND_FIELDS)[number], string>> = {
    brandVoice: clean(brandBrain?.tone),
    positioning: clean(brandBrain?.positioning),
    targetAudience: clean(brandBrain?.targetAudience),
    fonts: clean(brandBrain?.typography),
    colors: colorParts.length > 0 ? colorParts.join(", ") : undefined,
    // preferredChannels / visualStyle / thingsToAvoid / productsToHighlight have no
    // DB column on BrandBrain — left undefined, reported as missing.
  };

  const missingFields = TRACKED_BRAND_FIELDS.filter((f) => !mapped[f]);

  let services: string[] = [];
  let objectives: string[] = [];
  try {
    services = JSON.parse(request.services) as string[];
  } catch {
    services = [];
  }
  try {
    objectives = JSON.parse(request.objectives) as string[];
  } catch {
    objectives = [];
  }

  return {
    clientRequestId: request.id,
    businessName: request.businessName,
    segment: request.segment,
    services: Array.isArray(services) ? services : [],
    objectives: Array.isArray(objectives) ? objectives : [],
    rawContext: request.rawContext,
    brandVoice: mapped.brandVoice,
    positioning: mapped.positioning,
    targetAudience: mapped.targetAudience,
    preferredChannels: mapped.preferredChannels,
    visualStyle: mapped.visualStyle,
    colors: mapped.colors,
    fonts: mapped.fonts,
    thingsToAvoid: mapped.thingsToAvoid,
    productsToHighlight: mapped.productsToHighlight,
    brandBrainComplete: missingFields.length === 0,
    missingFields,
  };
}

// Builds the brandBrain Record used by AIRunContext from a snapshot — only
// includes fields that are actually present (no empty/placeholder keys).
export function snapshotBrandBrain(snapshot: ClientKnowledgeSnapshot): Record<string, string> {
  const out: Record<string, string> = {};
  const pairs: Array<[string, string | undefined]> = [
    ["brandVoice", snapshot.brandVoice],
    ["positioning", snapshot.positioning],
    ["targetAudience", snapshot.targetAudience],
    ["preferredChannels", snapshot.preferredChannels],
    ["visualStyle", snapshot.visualStyle],
    ["colors", snapshot.colors],
    ["fonts", snapshot.fonts],
    ["thingsToAvoid", snapshot.thingsToAvoid],
    ["productsToHighlight", snapshot.productsToHighlight],
  ];
  for (const [k, v] of pairs) {
    if (v) out[k] = v;
  }
  return out;
}
