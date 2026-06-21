// assertBrainSafety — CI guard enforcing the Gateway Principle (FOOCCI Law 1).
//
// Every production department page MUST route all reasoning through
// reasonAsDepartment() → POST /api/brain/reason.  Direct engine calls are only
// permitted inside the simulation/sandbox area (explicit whitelist below).
//
// This test BREAKS THE BUILD when a new page imports and calls a brain engine
// function directly, ensuring the whitelist remains the canonical audit trail.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Engine canvas-generator functions that must only be called server-side via the
// gateway route — never imported directly in production pages.
const DIRECT_ENGINE_FNS = [
  "generateStrategyCanvas",
  "generateSocialCanvas",
  "generateDesignCanvas",
  "generateTrafficCanvas",
  "generateAnalyticsCanvas",
  "generateQualityCanvas",
];

// Explicit whitelist: relative path prefixes permitted to call engines directly.
// These are sandbox/training tools — not in the production reasoning pipeline.
// To add a new allowed path, append here and document why (no silent drift).
const GATEWAY_WHITELIST: string[] = [
  "app/agency/simulations/strategy/page.tsx",
  "app/agency/simulations/social/page.tsx",
  "app/agency/simulations/design/page.tsx",
  "app/agency/simulations/traffic/page.tsx",
  "app/agency/simulations/analytics/page.tsx",
  "app/agency/simulations/quality/page.tsx",
  "app/agency/simulations/training/page.tsx",
  "app/agency/simulations/sdr/page.tsx",
  "app/agency/simulations/page.tsx",
];

function getAllTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...getAllTsxFiles(full));
    } else if (full.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

describe("assertBrainSafety — gateway enforcement (FOOCCI Law 1)", () => {
  const cwd = process.cwd();
  const agencyDir = join(cwd, "app/agency");
  const files = getAllTsxFiles(agencyDir);

  it("no production page calls a brain engine canvas-generator directly", () => {
    const violations: string[] = [];

    for (const file of files) {
      const rel = file.slice(cwd.length + 1); // relative to project root
      if (GATEWAY_WHITELIST.includes(rel)) continue;

      const src = readFileSync(file, "utf-8");
      for (const fn of DIRECT_ENGINE_FNS) {
        if (src.includes(fn)) {
          violations.push(`  ${rel}  →  ${fn}()`);
        }
      }
    }

    expect(
      violations,
      `\nDirect engine calls detected outside the whitelist.\n` +
      `Either route through reasonAsDepartment() or add the path to GATEWAY_WHITELIST with justification.\n\n` +
      violations.join("\n"),
    ).toHaveLength(0);
  });

  it("all whitelisted paths exist (no phantom entries)", () => {
    const missing: string[] = [];
    for (const rel of GATEWAY_WHITELIST) {
      try {
        statSync(join(cwd, rel));
      } catch {
        missing.push(rel);
      }
    }
    expect(
      missing,
      `Whitelisted paths no longer exist — remove stale entries:\n${missing.join("\n")}`,
    ).toHaveLength(0);
  });

  it("AI overlay for traffic dept never writes numeric canvas fields", () => {
    // Law 2: AI never invents numbers. Traffic canvas has budgetAllocation (BRL,
    // percentages) and channelBreakdown computed by the rule-based engine; AI may
    // only write interpretive string fields (channelRationale, offerContext, keyRisks).
    const routeSrc = readFileSync(
      join(cwd, "app/api/brain/reason/route.ts"),
      "utf-8",
    );

    // Find the traffic overlay block
    const trafficBlock = routeSrc.slice(
      routeSrc.indexOf('if (dept === "traffic")'),
      routeSrc.indexOf('if (dept === "analytics")'),
    );

    const numericFields = ["budgetBRL", "budgetAllocation", "totalMonthlyBRL", "managementFeeBRL", "mediaBudgetBRL", "channelBreakdown", "funnelBreakdown"];
    for (const field of numericFields) {
      expect(
        trafficBlock,
        `AI overlay must not write numeric field '${field}' in traffic dept`,
      ).not.toContain(`c.${field} =`);
    }
  });

  it("AI overlay for analytics dept never writes numeric canvas fields", () => {
    // Analytics canvas has passCount, warningCount, failCount, estimatedContribution,
    // canvasesApproved — all must stay rule-based. AI only writes keyInsights,
    // alertThresholds (strings), and primaryKPI (string, only when empty).
    const routeSrc = readFileSync(
      join(cwd, "app/api/brain/reason/route.ts"),
      "utf-8",
    );

    const analyticsBlock = routeSrc.slice(
      routeSrc.indexOf('if (dept === "analytics")'),
      routeSrc.indexOf("// quality"),
    );

    const numericFields = ["passCount", "warningCount", "failCount", "estimatedContribution", "canvasesApproved"];
    for (const field of numericFields) {
      expect(
        analyticsBlock,
        `AI overlay must not write numeric field '${field}' in analytics dept`,
      ).not.toContain(`c.${field} =`);
    }
  });
});
