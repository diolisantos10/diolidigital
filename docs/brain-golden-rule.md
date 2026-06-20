# Dioli Brain — The Golden Rule

The Brain is how every department reasons. This document is the canonical reference
for its two inviolable Laws, the single gateway all reasoning flows through, the
environment flags that activate AI, and how to add a new AI-backed department.

## The 2 Laws (inviolable)

**Law 1 — Every department reasons through the Brain.**
Every department/agent reasons through the Brain using real AI when configured.
The rule-based engine is a *fallback only*, never the primary brain. AI off or AI
failure falls back to rule-based transparently — the system never crashes and the
caller always receives the same canvas type.

**Law 2 — Reasoning is thought, not power.**
AI proposes; it never auto-applies state mutations. Every mutation (a project, a task,
a brand-brain change) requires explicit human approval. The Brain never invents facts:
it uses the Knowledge Base (DB truth) as its source. Missing data is reported as
`missingContext` / `missingFields`, never fabricated. No PII is placed in snapshots.

## The Gateway Principle

**All department reasoning flows through `reasonAsDepartment()`.**

- Client surfaces call `reasonAsDepartment(dept, context)` (`lib/dioli-brain/reason.ts`),
  which POSTs to `/api/brain/reason`.
- The server route (`app/api/brain/reason/route.ts`) always runs the rule-based engine
  first (producing the full canvas structure), then *overlays* AI narrative fields when
  AI is configured and enabled for that department.
- A **coherence guard** sits between the AI validator and the overlay: even shape-valid
  AI output is rejected if any narrative string is empty/whitespace/`"N/A"`/≤10 chars or
  any required array is empty. Rejected output leaves the rule-based canvas untouched and
  records a warning. This enforces Law 2 — AI never degrades the truth.
- No department reasons by calling an engine directly in the UI pipeline. New reasoning
  paths must go through the gateway.

The PM Orchestrator (`/api/brain/orchestrate`) follows the same shape for project/task
proposals: it reasons (AI or rule-based) and returns a **DRAFT** proposal. The only route
that mutates state is `/api/brain/orchestrate/apply`, gated behind explicit human approval.

## Flag Reference

| Env var | Values | Effect |
|---------|--------|--------|
| `OPENAI_API_KEY` | secret string | When set, AI is *configured*. Absent → rule-based everywhere. |
| `OPENAI_MODEL` | model id (default `gpt-4o-mini`) | Model used by the OpenAI adapter. |
| `BRAIN_AI_DEPARTMENTS` | `strategy,social,design,traffic,analytics,quality` or `all` | Comma-separated allowlist of departments where AI overlay is enabled. A dept absent from the list always runs rule-based even when a key is present. |
| `BRAIN_PM_AUTOPILOT` | `true` / unset | Enables the PM Orchestrator. When unset/false, `/api/brain/orchestrate` returns `{ enabled: false }` and the UI button is hidden. Never auto-applies — approval is always required. |
| `BRAIN_AI_PROVIDER` | `openai` (default) \| `claude` \| `gemini` | Selects the active AI provider adapter from the provider registry. `claude`/`gemini` are stubs (report not-configured) until implemented. |
| `CLAUDE_API_KEY` | secret string | Reserved for the Claude provider adapter (stub in current phase). |
| `GEMINI_API_KEY` | secret string | Reserved for the Gemini provider adapter (stub in current phase). |

### Activation example

```
OPENAI_API_KEY=sk-...
BRAIN_AI_DEPARTMENTS=strategy,social,design,traffic,analytics,quality
BRAIN_PM_AUTOPILOT=true
BRAIN_AI_PROVIDER=openai
```

## How to add a new AI department

1. **Add a prompt builder** in `lib/agency/intelligence/openai-schemas.ts`:
   `buildXMessages(ctx: AIRunContext): OpenAIMessages` returning a system prompt that
   asks for a flat JSON object, plus a `validateXOutput(raw): XIntelligenceOutput | null`
   validator that guarantees the shape matches the existing `*IntelligenceOutput` type.
2. **Wire it into the gateway** (`app/api/brain/reason/route.ts`): in the AI-enhancement
   block, add a case for the department that builds the `AIRunContext` from the
   `ClientKnowledgeSnapshot` + prior canvases, calls the active provider, validates,
   runs a coherence check, and overlays only narrative fields onto the rule-based canvas.
   Never overwrite structural fields the quality gate depends on.
3. **Enable it** by adding the department id to `BRAIN_AI_DEPARTMENTS`.

The provider itself is pluggable — to add a new model vendor, register an adapter in
`lib/ai/provider-registry.ts` (implement `isConfigured`, `call`, `modelId`) and select it
with `BRAIN_AI_PROVIDER`. Nothing else changes.
