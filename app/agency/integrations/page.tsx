"use client";

import { useState } from "react";
import Link from "next/link";
import { useAgencyStore } from "@/store/agency-store";
import {
  MOCK_INTEGRATIONS,
  AGENT_AI_CONFIGS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  MODE_LABELS,
  MODE_COLORS,
  AGENT_LABELS,
  AGENT_ID_LABELS,
  PROVIDER_OPTIONS,
  PROVIDER_INTEGRATION_MAP,
  computeIntegrationReadiness,
  type IntegrationCategory,
  type Integration,
  type AgentId,
  type AssignedAgent,
} from "@/lib/agency/integrations";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ReadinessRing({ score }: { score: number }) {
  const color = score >= 70 ? "#16A34A" : score >= 40 ? "#D97706" : "#DC2626";
  const label = score >= 70 ? "Bom" : score >= 40 ? "Em progresso" : "Inicial";
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center border-4 shrink-0"
        style={{ borderColor: color }}
      >
        <span className="text-[18px] font-bold" style={{ color }}>{score}%</span>
      </div>
      <div>
        <div className="text-[13px] font-semibold" style={{ color }}>{label}</div>
        <div className="text-[11px] text-[#9B9B95] mt-0.5">Integrações prontas / total</div>
      </div>
    </div>
  );
}

function CategoryIcon({ cat }: { cat: IntegrationCategory }) {
  const icons: Record<IntegrationCategory, string> = {
    ai_provider:  "🤖",
    design_tool:  "🎨",
    ads_platform: "📢",
    storage:      "☁️",
    automation:   "⚙️",
    analytics:    "📊",
    publishing:   "📤",
  };
  return <span>{icons[cat] ?? "🔌"}</span>;
}

function TestBadge({ status, at }: { status: string; at?: string }) {
  if (status === "pass") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[#DCFCE7] text-[#16A34A]">
        ✓ Teste OK{at ? ` · ${new Date(at).toLocaleDateString("pt-BR")}` : ""}
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[#FEE2E2] text-[#DC2626]">
        ✗ Falhou
      </span>
    );
  }
  return (
    <span className="text-[10px] text-[#C0C0BA]">Não testado</span>
  );
}

// ─── Config Panel ─────────────────────────────────────────────────────────────

type ConfigPanelProps = {
  integration: Integration;
  onClose: () => void;
};

function ConfigPanel({ integration, onClose }: ConfigPanelProps) {
  const { integrationConfigs, saveIntegrationConfig } = useAgencyStore();
  const config = integrationConfigs.find((c) => c.integrationId === integration.id);

  const [model, setModel] = useState(config?.selectedModel ?? "");
  const [workspace, setWorkspace] = useState(config?.workspace ?? "");
  const [accountId, setAccountId] = useState(config?.accountId ?? "");
  const [folder, setFolder] = useState(config?.folder ?? "");
  const [webhookUrl, setWebhookUrl] = useState(config?.webhookUrl ?? "");
  const [savedNow, setSavedNow] = useState(false);

  const AI_MODELS: Record<string, string[]> = {
    "int-openai":        ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    "int-openai-images": ["dall-e-3", "dall-e-2"],
    "int-gemini":        ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-pro"],
    "int-claude":        ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5"],
    "int-perplexity":    ["llama-3.1-sonar-large", "llama-3.1-sonar-small"],
  };
  const modelOptions = AI_MODELS[integration.id] ?? [];

  function handleSave() {
    const patch: Parameters<typeof saveIntegrationConfig>[1] = {
      configured: true,
      configuredManually: true,
    };
    if (model) patch.selectedModel = model;
    if (workspace) patch.workspace = workspace;
    if (accountId) patch.accountId = accountId;
    if (folder) patch.folder = folder;
    if (webhookUrl) patch.webhookUrl = webhookUrl;
    saveIntegrationConfig(integration.id, patch);
    setSavedNow(true);
    setTimeout(onClose, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.15)] w-full max-w-[520px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F0ED]">
          <div>
            <div className="text-[14px] font-semibold text-[#1C1C1A]">Configurar {integration.name}</div>
            <div className="text-[11px] text-[#9B9B95] mt-0.5">{CATEGORY_LABELS[integration.category]}</div>
          </div>
          <button onClick={onClose} className="text-[#9B9B95] hover:text-[#1C1C1A] transition-colors text-[20px] leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Purpose */}
          <div className="bg-[#FAFAF9] rounded-[8px] px-4 py-3 border border-[#F0F0ED]">
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Finalidade</div>
            <p className="text-[12px] text-[#1C1C1A]">{integration.purpose}</p>
          </div>

          {/* AI Provider fields */}
          {integration.category === "ai_provider" && (
            <>
              {modelOptions.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold text-[#6B6B65] mb-1.5">Modelo</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full border border-[#E8E8E4] rounded-[7px] px-3 py-2 text-[13px] text-[#1C1C1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#5B5BD6]/30"
                  >
                    <option value="">Selecionar modelo…</option>
                    {modelOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* API Key placeholder — never stores real keys */}
              <div>
                <label className="block text-[11px] font-semibold text-[#6B6B65] mb-1.5">Chave de API</label>
                <input
                  type="password"
                  disabled
                  placeholder="sk-••••••••••••••• (desabilitado em V1)"
                  className="w-full border border-[#E8E8E4] rounded-[7px] px-3 py-2 text-[13px] text-[#C0C0BA] bg-[#FAFAF9] cursor-not-allowed"
                />
                <p className="text-[10px] text-[#9B9B95] mt-1">
                  🔒 Chaves reais serão armazenadas com segurança quando o backend estiver ativo.
                </p>
              </div>
            </>
          )}

          {/* Design tool fields */}
          {integration.category === "design_tool" && (
            <div>
              <label className="block text-[11px] font-semibold text-[#6B6B65] mb-1.5">Workspace / Conta</label>
              <input
                type="text"
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="Ex.: minha-agencia ou ID do workspace"
                className="w-full border border-[#E8E8E4] rounded-[7px] px-3 py-2 text-[13px] text-[#1C1C1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#5B5BD6]/30"
              />
            </div>
          )}

          {/* Ads platform fields */}
          {integration.category === "ads_platform" && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-[#6B6B65] mb-1.5">ID da Conta de Anúncio</label>
                <input
                  type="text"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="Ex.: act_1234567890"
                  className="w-full border border-[#E8E8E4] rounded-[7px] px-3 py-2 text-[13px] text-[#1C1C1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#5B5BD6]/30"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#6B6B65] mb-1.5">Business Account ID</label>
                <input
                  type="text"
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  placeholder="Ex.: 123456789"
                  className="w-full border border-[#E8E8E4] rounded-[7px] px-3 py-2 text-[13px] text-[#1C1C1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#5B5BD6]/30"
                />
              </div>
            </>
          )}

          {/* Storage fields */}
          {integration.category === "storage" && (
            <div>
              <label className="block text-[11px] font-semibold text-[#6B6B65] mb-1.5">Pasta / Workspace</label>
              <input
                type="text"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="Ex.: /Clientes/DigiAgência ou ID do Drive"
                className="w-full border border-[#E8E8E4] rounded-[7px] px-3 py-2 text-[13px] text-[#1C1C1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#5B5BD6]/30"
              />
            </div>
          )}

          {/* Automation / publishing fields */}
          {(integration.category === "automation" || integration.category === "publishing" || integration.category === "analytics") && (
            <div>
              <label className="block text-[11px] font-semibold text-[#6B6B65] mb-1.5">
                {integration.category === "automation" ? "Webhook URL" : "ID da Conta / Propriedade"}
              </label>
              <input
                type="text"
                value={integration.category === "automation" ? webhookUrl : accountId}
                onChange={(e) => integration.category === "automation"
                  ? setWebhookUrl(e.target.value)
                  : setAccountId(e.target.value)
                }
                placeholder={integration.category === "automation"
                  ? "https://hook.make.com/..."
                  : "Ex.: G-XXXXXXXXXX ou UA-XXXXXXXX"
                }
                className="w-full border border-[#E8E8E4] rounded-[7px] px-3 py-2 text-[13px] text-[#1C1C1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#5B5BD6]/30"
              />
            </div>
          )}

          {/* Capabilities */}
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Capacidades</div>
            <ul className="space-y-1">
              {integration.capabilities.map((c) => (
                <li key={c} className="flex items-start gap-1.5 text-[11px] text-[#1C1C1A]">
                  <span className="text-[#16A34A] shrink-0 mt-0.5">✓</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {/* Agents using it */}
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Agentes que usam</div>
            <div className="flex flex-wrap gap-1.5">
              {integration.assignedAgents.map((ag) => (
                <span key={ag} className="text-[11px] bg-[#EEF0FF] text-[#5B5BD6] px-2 py-0.5 rounded font-medium">
                  {AGENT_LABELS[ag]}
                </span>
              ))}
            </div>
          </div>

          {/* Limitations */}
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Limitações V2</div>
            <ul className="space-y-1">
              {integration.limitations.map((l) => (
                <li key={l} className="flex items-start gap-1.5 text-[11px] text-[#6B6B65]">
                  <span className="text-[#D97706] shrink-0 mt-0.5">⚠</span>
                  {l}
                </li>
              ))}
            </ul>
          </div>

          {/* Cost */}
          {integration.costHint && (
            <div className="bg-[#FAFAF9] rounded-[8px] px-4 py-3 border border-[#F0F0ED]">
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Custo estimado</div>
              <div className="text-[12px] text-[#1C1C1A]">{integration.costHint}</div>
            </div>
          )}

          {/* Security notice */}
          <div className="bg-[#F0F4FF] border border-[#DDDDFB] rounded-[8px] px-4 py-3 flex items-start gap-2">
            <span className="text-[14px] shrink-0">🔒</span>
            <p className="text-[11px] text-[#5B5BD6]">
              Chaves reais serão armazenadas com segurança quando o backend estiver ativo.
              Esta configuração é salva localmente como mapeamento operacional.
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#F0F0ED]">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-[#6B6B65] hover:text-[#1C1C1A] transition-colors">
            Cancelar
          </button>
          {savedNow ? (
            <span className="px-4 py-2 bg-[#DCFCE7] text-[#16A34A] rounded-[7px] text-[13px] font-semibold">
              ✓ Salvo!
            </span>
          ) : (
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-[#5B5BD6] text-white rounded-[7px] text-[13px] font-semibold hover:bg-[#4A4AC0] transition-colors"
            >
              Salvar configuração
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Integration Card V2 ──────────────────────────────────────────────────────

type IntegrationCardProps = {
  integration: Integration;
  onConfigure: () => void;
};

function IntegrationCard({ integration, onConfigure }: IntegrationCardProps) {
  const { integrationConfigs, runIntegrationTest } = useAgencyStore();
  const config = integrationConfigs.find((c) => c.integrationId === integration.id);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  const statusStyle = STATUS_COLORS[
    config?.configured ? "configured" : integration.status
  ];
  const priorityStyle = PRIORITY_COLORS[integration.priority];

  async function handleTest() {
    setTesting(true);
    await new Promise((r) => setTimeout(r, 600));
    runIntegrationTest(integration.id);
    setTesting(false);
  }

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-[10px] overflow-hidden">
      {/* Card header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[#1C1C1A]">{integration.name}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${statusStyle.bg} ${statusStyle.text}`}>
              {config?.configured ? "Configurado" : STATUS_LABELS[integration.status]}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${priorityStyle}`}>
              {PRIORITY_LABELS[integration.priority]}
            </span>
          </div>
          <p className="text-[11px] text-[#6B6B65] mt-0.5">{integration.purpose}</p>
          <div className="flex flex-wrap gap-1 mt-1.5 items-center">
            {integration.assignedAgents.slice(0, 3).map((ag) => (
              <span key={ag} className="text-[10px] bg-[#F0F0ED] text-[#6B6B65] px-1.5 py-0.5 rounded">
                {AGENT_LABELS[ag]}
              </span>
            ))}
            {integration.assignedAgents.length > 3 && (
              <span className="text-[10px] text-[#9B9B95]">+{integration.assignedAgents.length - 3}</span>
            )}
            <span className="ml-auto">
              <TestBadge status={config?.lastTestStatus ?? "not_run"} at={config?.lastTestAt} />
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-[#F4F4F0] bg-[#FAFAF9]">
        <button
          onClick={onConfigure}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5B5BD6] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#4A4AC0] transition-colors"
        >
          ⚙ Configurar
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E8E8E4] text-[#6B6B65] text-[12px] font-medium rounded-[6px] hover:bg-[#F0F0ED] transition-colors disabled:opacity-50"
        >
          {testing ? "Testando…" : "⚡ Testar conexão"}
        </button>
        <button
          onClick={() => setDetailsOpen((v) => !v)}
          className="ml-auto text-[12px] text-[#9B9B95] hover:text-[#5B5BD6] transition-colors"
        >
          {detailsOpen ? "Ocultar detalhes ▴" : "Ver detalhes ▾"}
        </button>
      </div>

      {/* Test result message */}
      {config?.lastTestMessage && (
        <div className={`px-4 py-2 text-[11px] border-t ${
          config.lastTestStatus === "pass"
            ? "bg-[#F0FDF4] border-[#DCFCE7] text-[#16A34A]"
            : "bg-[#FFF5F5] border-[#FEE2E2] text-[#DC2626]"
        }`}>
          {config.lastTestMessage}
        </div>
      )}

      {/* Expanded details */}
      {detailsOpen && (
        <div className="px-4 pb-4 space-y-3 border-t border-[#F4F4F0] pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Capacidades</div>
              <ul className="space-y-1">
                {integration.capabilities.map((c) => (
                  <li key={c} className="flex items-start gap-1.5 text-[11px] text-[#1C1C1A]">
                    <span className="text-[#16A34A] shrink-0 mt-0.5">✓</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Limitações V2</div>
              <ul className="space-y-1">
                {integration.limitations.map((l) => (
                  <li key={l} className="flex items-start gap-1.5 text-[11px] text-[#6B6B65]">
                    <span className="text-[#D97706] shrink-0 mt-0.5">⚠</span>
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {integration.costHint && (
            <div className="text-[11px] text-[#6B6B65]">
              <span className="font-semibold text-[#9B9B95]">Custo: </span>{integration.costHint}
            </div>
          )}
          {config?.selectedModel && (
            <div className="text-[11px] text-[#5B5BD6]">
              <span className="font-semibold">Modelo configurado: </span>{config.selectedModel}
            </div>
          )}
          {config?.lastConfiguredAt && (
            <div className="text-[10px] text-[#9B9B95]">
              Configurado em {new Date(config.lastConfiguredAt).toLocaleDateString("pt-BR")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Agent Provider Section ───────────────────────────────────────────────────

function AgentProviderSection() {
  const { integrationConfigs, agentProviderConfigs, updateAgentProviderConfig } = useAgencyStore();

  const isProviderConfigured = (provider: string): boolean => {
    if (provider === "rule_based") return true;
    const intId = PROVIDER_INTEGRATION_MAP[provider as keyof typeof PROVIDER_INTEGRATION_MAP];
    if (!intId) return true;
    return integrationConfigs.find((c) => c.integrationId === intId)?.configured ?? false;
  };

  return (
    <div className="bg-white border border-[#E5E5E2] rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
      <div className="px-5 py-3.5 border-b border-[#F0F0ED]">
        <h2 className="text-[14px] font-semibold text-[#1C1C1A]">IAs dos Agentes</h2>
        <p className="text-[11px] text-[#9B9B95] mt-0.5">Selecione o provedor de IA para cada agente — configure o provedor antes de ativar</p>
      </div>
      <div className="divide-y divide-[#F4F4F0]">
        {agentProviderConfigs.map((ac) => {
          const agentConfig = AGENT_AI_CONFIGS.find((a) => a.agentId === ac.agentId);
          const providerOk = isProviderConfigured(ac.selectedProvider);
          const isExternal = ac.selectedProvider !== "rule_based";
          return (
            <div key={ac.agentId} className="flex items-center gap-4 px-5 py-3 hover:bg-[#FAFAF9] transition-colors">
              <div className="w-[150px] shrink-0">
                <div className="text-[13px] font-semibold text-[#1C1C1A]">{AGENT_ID_LABELS[ac.agentId]}</div>
                {agentConfig && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${MODE_COLORS[agentConfig.currentMode]}`}>
                    {MODE_LABELS[agentConfig.currentMode]}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <select
                  value={ac.selectedProvider}
                  onChange={(e) => updateAgentProviderConfig(ac.agentId, { selectedProvider: e.target.value as typeof ac.selectedProvider })}
                  className="w-full border border-[#E8E8E4] rounded-[7px] px-3 py-1.5 text-[12px] text-[#1C1C1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#5B5BD6]/30"
                >
                  {PROVIDER_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="w-[160px] shrink-0 text-right">
                {!isExternal && (
                  <span className="text-[10px] text-[#16A34A] font-medium">✓ Pronto</span>
                )}
                {isExternal && providerOk && (
                  <span className="text-[10px] text-[#16A34A] font-medium">✓ Provedor configurado</span>
                )}
                {isExternal && !providerOk && (
                  <span className="text-[10px] text-[#D97706] font-medium">⚠ Fornecedor não configurado</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-5 py-3 border-t border-[#F0F0ED] bg-[#FAFAF9]">
        <p className="text-[11px] text-[#9B9B95]">
          Selecionar um provedor não ativa a conexão real. Configure o provedor na seção abaixo e execute o teste de conexão.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { integrationConfigs } = useAgencyStore();
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | "all">("all");
  const [configPanelId, setConfigPanelId] = useState<string | null>(null);

  // Compute readiness from live config
  const liveIntegrations = MOCK_INTEGRATIONS.map((i) => {
    const cfg = integrationConfigs.find((c) => c.integrationId === i.id);
    return cfg?.configured ? { ...i, status: "configured" as const } : i;
  });
  const readiness = computeIntegrationReadiness(liveIntegrations);

  const filteredIntegrations =
    activeCategory === "all"
      ? MOCK_INTEGRATIONS
      : MOCK_INTEGRATIONS.filter((i) => i.category === activeCategory);

  const groupedByCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    integrations: MOCK_INTEGRATIONS.filter((i) => i.category === cat),
  }));

  const panelIntegration = configPanelId
    ? MOCK_INTEGRATIONS.find((i) => i.id === configPanelId) ?? null
    : null;

  return (
    <div className="max-w-[960px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-[22px] font-semibold text-[#1C1C1A] tracking-[-0.02em]">
            Ferramentas &amp; Integrações
          </h1>
          <span className="text-[11px] bg-[#F4F4F0] text-[#9B9B95] px-2 py-0.5 rounded font-medium">V2 — Central Operacional</span>
        </div>
        <p className="text-[13px] text-[#6B6B65]">
          Configure provedores de IA por agente, teste conexões e gerencie ferramentas externas.
        </p>
      </div>

      {/* Readiness Overview */}
      <div className="bg-white border border-[#E5E5E2] rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 mb-6">
        <div className="flex items-start gap-8 flex-wrap">
          <ReadinessRing score={readiness.score} />
          <div className="flex items-center gap-6 flex-wrap">
            <div className="text-center">
              <div className="text-[22px] font-bold text-[#5B5BD6] mono-num">{readiness.configuredCount}</div>
              <div className="text-[11px] text-[#9B9B95] mt-0.5">Configurados</div>
            </div>
            <div className="text-center">
              <div className="text-[22px] font-bold text-[#0891B2] mono-num">{readiness.availableCount}</div>
              <div className="text-[11px] text-[#9B9B95] mt-0.5">Disponíveis</div>
            </div>
            <div className="text-center">
              <div className="text-[22px] font-bold text-[#9B9B95] mono-num">{readiness.plannedCount}</div>
              <div className="text-[11px] text-[#9B9B95] mt-0.5">Planejados</div>
            </div>
            <div className="text-center">
              <div className="text-[22px] font-bold text-[#D97706] mono-num">{readiness.unavailableCount}</div>
              <div className="text-[11px] text-[#9B9B95] mt-0.5">Indisponíveis</div>
            </div>
          </div>
          <div className="flex-1 min-w-[200px] bg-[#FAFAF9] rounded-[8px] px-4 py-3 border border-[#F0F0ED]">
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-1">Próxima prioridade</div>
            <div className="text-[12px] text-[#1C1C1A]">{readiness.topMissing}</div>
          </div>
        </div>
        {readiness.usableToday.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#F0F0ED]">
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-wide mb-2">Disponível hoje</div>
            <div className="flex flex-wrap gap-1.5">
              {readiness.usableToday.map((name) => (
                <span key={name} className="text-[11px] bg-[#DCFCE7] text-[#16A34A] px-2 py-0.5 rounded font-medium">
                  ✓ {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Agent Provider Section */}
      <AgentProviderSection />

      {/* Integration Cards */}
      <div className="bg-white border border-[#E5E5E2] rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-[#F0F0ED]">
          <h2 className="text-[14px] font-semibold text-[#1C1C1A]">Ferramentas Conectáveis</h2>
          <p className="text-[11px] text-[#9B9B95] mt-0.5">{MOCK_INTEGRATIONS.length} integrações · configure, teste e gerencie cada uma</p>
        </div>

        {/* Category filter tabs */}
        <div className="flex items-center gap-1 px-4 py-3 border-b border-[#F0F0ED] overflow-x-auto">
          <button
            onClick={() => setActiveCategory("all")}
            className={`shrink-0 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors ${
              activeCategory === "all" ? "bg-[#1C1C1A] text-white" : "text-[#6B6B65] hover:bg-[#F4F4F0]"
            }`}
          >
            Todos ({MOCK_INTEGRATIONS.length})
          </button>
          {CATEGORY_ORDER.map((cat) => {
            const count = MOCK_INTEGRATIONS.filter((i) => i.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors ${
                  activeCategory === cat ? "bg-[#1C1C1A] text-white" : "text-[#6B6B65] hover:bg-[#F4F4F0]"
                }`}
              >
                <CategoryIcon cat={cat} />
                {CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>

        <div className="p-4">
          {activeCategory === "all" ? (
            <div className="space-y-6">
              {groupedByCategory.map(({ category, integrations }) => (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <CategoryIcon cat={category} />
                    <h3 className="text-[13px] font-semibold text-[#1C1C1A]">{CATEGORY_LABELS[category]}</h3>
                    <span className="text-[11px] text-[#9B9B95]">({integrations.length})</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {integrations.map((int) => (
                      <IntegrationCard
                        key={int.id}
                        integration={int}
                        onConfigure={() => setConfigPanelId(int.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filteredIntegrations.map((int) => (
                <IntegrationCard
                  key={int.id}
                  integration={int}
                  onConfigure={() => setConfigPanelId(int.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Security notice */}
      <div className="bg-[#F0F4FF] border border-[#DDDDFB] rounded-[10px] px-5 py-4 flex items-start gap-3">
        <span className="text-[16px] shrink-0">🔒</span>
        <div>
          <div className="text-[13px] font-semibold text-[#5B5BD6]">Segurança de chaves de API — V2</div>
          <p className="text-[12px] text-[#6B6B65] mt-1">
            Configuração segura de chaves será adicionada com backend. Não insira chaves reais nesta interface.
            Em V2, apenas a geração de imagens via DALL-E 3 está ativa (chave gerenciada pelo servidor).
          </p>
          <Link href="/agency/settings" className="text-[12px] text-[#5B5BD6] font-medium hover:underline mt-1 inline-block">
            Ver diagnóstico completo em Saúde do Sistema →
          </Link>
        </div>
      </div>

      {/* Config Panel modal */}
      {panelIntegration && (
        <ConfigPanel
          integration={panelIntegration}
          onClose={() => setConfigPanelId(null)}
        />
      )}
    </div>
  );
}
