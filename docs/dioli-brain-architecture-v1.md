# Dioli Brain — Architecture v1

> **THIS IS NOT A REBUILD.**
>
> This document defines a re-architecture layer over the existing Dioli Agência product.
> Every module that already works continues to work. Nothing is deleted.
> The Brain is a governance and reasoning layer that wraps — and gradually replaces — the loose
> collection of intelligence engines, department configs and training pipelines that currently
> operate without a shared cognitive standard.

---

## 1. Definition of Dioli Brain

Dioli Brain is the central operating intelligence of Dioli Agência.

It is NOT:
- An AI model
- A single API endpoint
- A chatbot or copilot

It IS:
- The shared reasoning framework that every department uses to process client intent
- The governance layer that decides what is allowed, what needs approval, and what gets learned
- The institutional memory that accumulates evidence, training, and quality signals over time
- The architecture that turns a collection of AI tools into a coherent agency mind

---

## 2. Central Thesis

> The AI is not the product.
> The Brain is the product.

AI models are engines — interchangeable, improvable, replaceable.
The Dioli Brain is the operating intelligence that remains constant regardless of which engine is used.

Departments are professional scopes — bounded contexts with specific permissions, tools and deliverables.
Agents are not independent brains. Every agent reasons through the same Brain logic, restricted to its department scope.

This means:
- Changing the AI model does not change the agency's reasoning quality
- Adding a new department does not require a new reasoning philosophy
- Training data from one department makes every department smarter
- Quality standards are universal, not per-agent inventions

---

## 3. Architecture Layers

```
┌─────────────────────────────────────────────────┐
│               CEO / Business Owner               │
│          Vision · Standards · Approvals          │
└──────────────────────┬──────────────────────────┘
                       │ commands
┌──────────────────────▼──────────────────────────┐
│           Brain Director / Brain Architect        │
│    Audits · Routes · Rejects · Versions Brain    │
└──────────────────────┬──────────────────────────┘
                       │ governs
┌──────────────────────▼──────────────────────────┐
│                  Dioli Brain                     │
│  Cognitive Flow · Knowledge Base · Quality Gate  │
└──┬──────────────┬───────────────┬───────────────┘
   │              │               │
   ▼              ▼               ▼
Departments    Training        Evidence
(scopes)       Center          Layer
   │              │               │
   ▼              ▼               ▼
AI Engine      Quality &       Proof of
Router         Simulation      Value
```

---

## 4. CEO / Business Owner

Role: Strategic authority. Sets vision, quality bar, and structural Brain changes.

Responsibilities:
- Define what the agency optimises for (revenue, quality, speed, client satisfaction)
- Approve structural Brain changes (new departments, policy shifts)
- Set the minimum quality bar across all departments
- Be the final escalation point for critical approvals

Rules:
- Can issue commands that override department defaults
- Cannot be bypassed by agents
- Must approve any change to Brain governance rules

---

## 5. Brain Director / Brain Architect

Role: Turns CEO commands into architecture. The quality gatekeeper.

Responsibilities:
- Audit agent reasoning output for consistency with Brain logic
- Approve, reject, or backlog BrainChangeRequests
- Prevent direct self-modification (no agent changes the Brain directly)
- Enforce the Quality Gate across all departments
- Maintain reasoning consistency across department boundaries
- Version the Brain when approved changes are applied

Rules:
- No agent modifies the Brain directly. Period.
- Every suggestion goes through BrainChangeRequest → review → approval → versioned apply
- Rejection is logged with rationale for future training

In the current system: this role is fulfilled by the human (Diego + PM).
Future: the Brain Director becomes an auditing layer the system exposes in the UI.

---

## 6. Dioli Brain

The shared reasoning engine. Not a model — a framework.

Core functions:
1. Interpret client intention (not just their words)
2. Retrieve relevant context from the Knowledge Base
3. Route work to the correct department scope
4. Validate output against the Quality Gate
5. Record learning (approved → BrainChangeRequest → training)
6. Measure result (evidence, metric, proof)
7. Generate evidence

Current system mapping:
- SDR Agent → client intention interpreter (first pilot)
- StrategyRoom → multi-specialist reasoning output
- BrandBrain → knowledge base node per client
- Training Center → learning/feedback loop
- System Doctor → operational health signal

---

## 7. AI Engine Router

The Brain is model-agnostic. The engine can change; the Brain cannot.

Purpose: route each department's reasoning request to the most appropriate AI provider
based on capability, cost, latency and quality requirements.

Current state: all departments use `rule_based` or OpenAI (single provider).
Target state: each department has a preferred provider + fallback + capability spec.

See: `lib/dioli-brain/router.ts`

---

## 8. Dioli Knowledge Base

The institutional memory of the agency. Structured, access-controlled, updateable.

Sources:
- Client Brand Brain (per client)
- Briefings and requests
- Project history and deliverables
- Training logs and simulation results
- Quality reviews and evidence
- Approved Brain changes

See: `lib/dioli-brain/knowledge-map.ts`

---

## 9. Agent Departments

Departments are professional scopes, not independent brains.

Each department:
- Inherits the shared Cognitive Flow
- Has a bounded set of permissions and tools
- Produces department-specific deliverables
- Feeds the shared Training Center and Evidence Layer

Initial departments:
1. Client Service / SDR (PILOT — first department fully wired to Brain logic)
2. Strategy
3. Social Media
4. Design
5. Paid Traffic
6. Project Management
7. Analytics (future)
8. Quality (future)

See: `lib/dioli-brain/departments.ts`

---

## 10. Training Center

The feedback loop that improves the Brain over time.

Current state:
- SDR-only training (continuous simulation, batch runner, evaluator)
- BrainChangeRequest model exists but is not surfaced prominently
- Suggestions generated automatically from simulation results
- Daily cap enforced; cron endpoint ready

Future state:
- Every department feeds training signals
- All suggestions go through Brain Director review
- Approved changes version the Brain
- Evidence from real deliverables loops back as training data

See: `lib/dioli-brain/training-policy.ts`

---

## 11. Quality & Simulation

Every department has a Quality Gate. The Laboratory provides synthetic testing.

Current state:
- SDR simulator and evaluator are the most complete
- System Doctor provides operational health
- Department blueprints define quality checklists per step

Future state:
- Quality Gate enforced at every department handoff
- Simulation available for all departments
- Quality signals feed the Evidence Layer

See: `lib/dioli-brain/quality-gates.ts`

---

## 12. Evidence Layer

Proof that the Brain's work creates measurable value.

Examples:
- Campaign reach improved X%
- Creative approved in first round (no revisions)
- Client praised delivery (quote + approval)
- Revenue/leads increased
- Delivery time reduced vs. benchmark

Rule: public proof requires human approval before commercial use.

See: `lib/dioli-brain/evidence.ts`

---

## 13. Mandatory Cognitive Flow

Every department uses the same 12-step reasoning flow. The scope and tools differ; the logic does not.

```
 1. What is the client's real intention?
 2. What context do I need?
 3. What do I know for sure?
 4. What do I not know?
 5. Which department/scope should act?
 6. Which action is allowed?
 7. Does this respect the brand?
 8. Does this improve the client's objective?
 9. Is there risk?
10. Does this need human approval?
11. Should this become training material?
12. How will we measure the result?
```

See: `lib/dioli-brain/cognitive-flow.ts`

---

## 14. How This Applies to the Current Dioli System

The current system has all the building blocks. What it lacks is the connective architecture.

| Current module | Brain role it plays |
|---|---|
| SDR Agent | Client intention interpreter (Step 1–4) |
| Briefing Room | Intake and context capture (Step 2) |
| Brand Brain | Knowledge Base node per client |
| Strategy Room | Multi-specialist reasoning output |
| Training Center | Learning loop (Step 11) |
| Quality Gate / Doctor | Risk and approval check (Steps 9–10) |
| Evidence Layer | Result measurement (Step 12) |
| Department Blueprints | Department scope definitions |
| Operating Model | Input/Output/Handoff contracts |
| BrainChangeRequest | Governance of Brain evolution |

---

## 15. What Already Exists

| Module | Status |
|---|---|
| `lib/agency/departments.ts` | Full department definitions |
| `lib/agency/department-blueprint.ts` | Universal operating blueprint (Design=gold, others=shell) |
| `lib/agency/operating-model.ts` | I/O and handoff contracts |
| `lib/agency/intelligence/*.ts` | Rule-based engines per department |
| `lib/agency/training/*` | SDR simulation, evaluator, batch runner, config |
| `lib/agency/training/training-store-service.ts` | DB persistence for training |
| `lib/agency/sdr-agent.ts` | SDR conversation and handoff logic |
| `lib/agency/orchestration/*` | Auto-task gen, pipeline, dependencies |
| Prisma: `BrainChangeRequest` | Governance model for Brain changes |
| Prisma: `TrainingBatch`, `DbSimulationRun` | Persistent training data |
| Prisma: `BrandBrain` | Per-client knowledge base |
| `/agency/simulations/training` | Training Center UI |
| `/agency/settings` | System Doctor |
| `/briefing` | Public intake / Briefing Room |

---

## 16. What Must Be Remapped

| Current location | Target Brain layer |
|---|---|
| `lib/agency/intelligence/strategy.ts` | Strategy Department scope |
| `lib/agency/intelligence/social.ts` | Social Media Department scope |
| `lib/agency/intelligence/design.ts` | Design Department scope |
| `lib/agency/intelligence/paid-traffic.ts` | Paid Traffic Department scope |
| `lib/agency/sdr-agent.ts` | Client Service / SDR Department scope |
| `lib/agency/briefing-conversation.ts` | Briefing Room → Brain intake |
| `lib/agency/orchestration/auto-tasks.ts` | PM Department scope |
| Training suggestions → `BrainChangeRequest` | Brain Director review queue |
| `lib/agency/system-doctor.ts` | Quality Gate / operational health |

---

## 17. First Pilot Department

**Client Service / SDR Department**

Why: It controls the entrance of every client demand. Before any department acts, the Brain must
capture client intention correctly. SDR is the most critical and the most complete — it already
has a simulator, evaluator, training loop, and handoff model.

What the pilot achieves:
- SDR explicitly adopts the Dioli Cognitive Flow
- SDR handoff includes Brain reasoning output (scope, confidence, flagged risks)
- SDR training logs feed the BrainChangeRequest governance queue
- SDR quality gate is visible in PM review

---

## 18. Risks

| Risk | Mitigation |
|---|---|
| Brain layer adds complexity without value | Start with types/config only; no runtime overhead |
| Existing modules break during re-architecture | Adapter pattern; never modify existing exports directly |
| Over-engineering before validation | Implement incrementally; pilot first; measure before expanding |
| Department configs diverge from Brain | Department adapter maps old → new; single source of truth |
| Training data auto-applies to Brain | BrainChangeRequest status stays `pending`; human approval always required |
| Brain change breaks production | Version the Brain; every change is traceable |

---

## 19. Next Implementation Steps

**Step 1 (done):** Create `lib/dioli-brain/` — pure TypeScript types and config.

**Step 2:** Wire SDR pilot — SDR handoff object includes `brainReasoningOutput` field.

**Step 3:** Surface Brain Director queue — BrainChangeRequests visible in `/agency/brain` page.

**Step 4:** Quality Gate enforcement at department handoff points (blueprint → Brain Gate).

**Step 5:** Evidence Layer — first evidence items from approved deliverables.

**Step 6:** Expand to Strategy department — second pilot.

**Step 7:** AI Engine Router — each department configured for preferred provider.

**Step 8:** Training Center expansion — every department feeds training signals.

**Step 9:** Brain versioning — applied changes are tagged with semantic version.

**Step 10:** Analytics department — closes the measurement loop.
