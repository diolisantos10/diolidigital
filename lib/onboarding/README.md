# Dioli Onboarding System

Infraestrutura única de onboarding contextual, reutilizável em qualquer área da
plataforma (Laboratório, CRM, Atendimento, Campanhas, Analytics, Agentes,
Departamentos, Build OS e futuras áreas).

## Padrão de produto (obrigatório)

Todo novo módulo deve ter **as três camadas**:

1. **Tour guiado** — `GuidedTour` + `usePageTour`
2. **Tooltips inteligentes** — `InfoTooltip`
3. **Explique esta tela** — `ExplainScreenDrawer` + builder de explicação

E o par de botões `OnboardingActions` ("Rever tour" / "Explique esta tela") no
header da página.

## Arquitetura

```
lib/onboarding/
  types.ts                  # TourStep, TourDefinition, ScreenExplanation
  storage.ts                # localStorage: tour_completed_[id]
  tours/<pagina>.ts         # 1 arquivo por tela — passos do tour
  explanations/<pagina>.ts  # 1 builder por tela — explicação dinâmica

components/agency/onboarding/
  GuidedTour.tsx            # motor de tour (spotlight + popover + controles)
  InfoTooltip.tsx           # ⓘ clicável
  ExplainScreenDrawer.tsx   # drawer lateral "Explique esta tela"
  OnboardingActions.tsx     # botões padrão do header
```

## Como aplicar em uma nova tela (5 passos)

### 1. Marque os elementos com `data-tour`

```tsx
<div data-tour="crm-pipeline">…</div>
<section data-tour="crm-hot-clients">…</section>
```

### 2. Crie o tour em `lib/onboarding/tours/crm.ts`

```ts
import type { TourDefinition } from "../types";

export const CRM_TOUR: TourDefinition = {
  id: "crm", // persiste como tour_completed_crm
  steps: [
    { target: '[data-tour="crm-pipeline"]', title: "Pipeline", body: "…" },
    { target: '[data-tour="crm-hot-clients"]', title: "Clientes Quentes", body: "…" },
  ],
};
```

### 3. Crie o builder em `lib/onboarding/explanations/crm.ts`

```ts
import type { ScreenExplanation } from "../types";

export function buildCrmExplanation(state: { hotClients: number }): ScreenExplanation {
  return {
    summary: `Você possui ${state.hotClients} clientes quentes.`,
    sections: [{ title: "O que existe nesta tela", items: ["…"] }],
    attention: state.hotClients > 0 ? [`${state.hotClients} clientes quentes sem follow-up.`] : [],
    firstSteps: ["…"],
  };
}
```

O builder é determinístico e roda localmente. Se no futuro um modelo de IA for
configurado, basta trocar a implementação do builder — o contrato
`ScreenExplanation` não muda.

### 4. Conecte na página

```tsx
"use client";
import GuidedTour, { usePageTour } from "@/components/agency/onboarding/GuidedTour";
import ExplainScreenDrawer from "@/components/agency/onboarding/ExplainScreenDrawer";
import OnboardingActions from "@/components/agency/onboarding/OnboardingActions";
import { CRM_TOUR } from "@/lib/onboarding/tours/crm";
import { buildCrmExplanation } from "@/lib/onboarding/explanations/crm";

export default function CrmPage() {
  const { tourOpen, startTour, closeTour } = usePageTour(CRM_TOUR);
  const [explainOpen, setExplainOpen] = useState(false);

  return (
    <div>
      {/* header */}
      <OnboardingActions onStartTour={startTour} onExplain={() => setExplainOpen(true)} />

      {/* …conteúdo com data-tour…  */}

      <GuidedTour tour={CRM_TOUR} open={tourOpen} onClose={closeTour} />
      <ExplainScreenDrawer
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        screenTitle="CRM"
        explanation={buildCrmExplanation({ hotClients })}
      />
    </div>
  );
}
```

### 5. Adicione tooltips nos cards

```tsx
import InfoTooltip from "@/components/agency/onboarding/InfoTooltip";

<InfoTooltip title="Clientes Quentes">
  Leads com alta probabilidade de fechamento nos próximos 7 dias.
</InfoTooltip>
```

## Comportamento

- O tour **inicia automaticamente** na primeira visita (600 ms após o mount).
- "Pular" e "Concluir" persistem `tour_completed_[id] = "true"` — o tour não
  reaparece. "Rever tour" reabre sob demanda.
- O spotlight segue o elemento (scroll/resize) e bloqueia cliques na página
  durante o tour. `Escape` fecha tour, tooltip e drawer.
- Se um `target` não existir no DOM, o passo é exibido centralizado (sem spotlight).

## Implementação de referência

`/agency/simulations/training` — tour de 7 passos (estatísticas, controles,
runs, sugestões, aprovação, batch, alertas), tooltips nos 6 cards de resumo e
drawer com explicação dinâmica do estado da sessão.
