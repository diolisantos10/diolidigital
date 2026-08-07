// O ELENCO DE QUEM CONSTRÓI O PRODUTO — declarado, não varrido do disco.
//
// Por que declarado em TypeScript versionado, e não lido de `.claude/agents/`
// em tempo de execução: em produção o Next roda a partir de `.next/standalone`,
// e nem `.claude/` nem `docs/` estão lá. Uma varredura de disco devolveria lista
// VAZIA em produção — que a tela leria como "este projeto não tem agentes".
// Ausência de informação não é informação: a lista mora no bundle.
//
// ─── OS CINCO ESSENCIAIS ─────────────────────────────────────────────────────
//
// `qualidade`, `cerebro`, `interface`, `experiencia`, `seguranca` vêm com todo
// projeto e NÃO PODEM SER APAGADOS (doutrina 21 do `dioli-brain-kit`, adotada
// por ordem do CEO em 07/08/2026). A constituição deles é única e mora no kit:
// `docs/23-constituicao-dos-essenciais.md`. Regra não se copia, se aponta.
//
// `__tests__/agentes/elenco-obrigatorio.test.ts` reprova a remoção de qualquer
// um dos cinco. É trava, não lembrete.

import type { Vinculo } from "./tipos";

export interface MembroDoElenco {
  slug: string;
  nome: string;
  area: string;
  /** Uma frase, em linguagem de dono. É a pergunta que este agente responde. */
  funcao: string;
  vinculo: Vinculo;
  /** Sem `Write` nem `Edit` no perfil. É trava de ferramenta, não promessa. */
  somenteLeitura: boolean;
  /** Data em que o perfil entrou no repositório (`git log --diff-filter=A`).
   *  `null` seria "não registrado" — nenhum é hoje, mas o tipo permite. */
  noArDesde: string | null;
}

/** Os cinco que não podem faltar. A lista é a régua do teste. */
export const ESSENCIAIS = ["qualidade", "cerebro", "interface", "experiencia", "seguranca"] as const;

export const ELENCO: MembroDoElenco[] = [
  // ── Os cinco Essenciais ────────────────────────────────────────────────────
  {
    slug: "qualidade",
    nome: "Qualidade",
    area: "Auditoria",
    funcao: "Duvida do trabalho dos outros: isto está conforme o que foi prometido?",
    vinculo: "essencial",
    somenteLeitura: true,
    noArDesde: "2026-08-01",
  },
  {
    slug: "cerebro",
    nome: "Cérebro",
    area: "Verdade",
    funcao: "Responde pela verdade: podemos afirmar isto, e com base em quê?",
    vinculo: "essencial",
    somenteLeitura: false,
    noArDesde: "2026-08-01",
  },
  {
    slug: "interface",
    nome: "Interface",
    area: "Design",
    funcao: "Como a tela fica: token, hierarquia, responsivo e os três estados.",
    vinculo: "essencial",
    somenteLeitura: false,
    noArDesde: "2026-08-01",
  },
  {
    slug: "experiencia",
    nome: "Experiência",
    area: "Design",
    funcao: "Se a tela funciona: esta tela deveria existir, e a pessoa consegue usá-la?",
    vinculo: "essencial",
    somenteLeitura: true,
    noArDesde: "2026-08-07",
  },
  {
    slug: "seguranca",
    nome: "Segurança",
    area: "Segurança",
    funcao: "Quem consegue entrar sem ser convidado, e alcançar o que não é dele.",
    vinculo: "essencial",
    somenteLeitura: false,
    noArDesde: "2026-08-07",
  },

  // ── Especialistas de domínio — o que ESTE produto faz ──────────────────────
  {
    slug: "pm",
    nome: "Project Manager",
    area: "Direção",
    funcao: "Faz a agência trabalhar: distribui, cobra, audita e varre a fila.",
    vinculo: "dominio",
    somenteLeitura: false,
    noArDesde: "2026-08-06",
  },
  {
    slug: "departamentos",
    nome: "Departamentos",
    area: "Entrega",
    funcao: "O que o cliente recebe: peça, roteiro, criativo, plano.",
    vinculo: "dominio",
    somenteLeitura: false,
    noArDesde: "2026-08-01",
  },
  {
    slug: "esteira",
    nome: "Esteira comercial",
    area: "Comercial",
    funcao: "O caminho do dinheiro: briefing, proposta, projeto, entrega, portal.",
    vinculo: "dominio",
    somenteLeitura: false,
    noArDesde: "2026-08-01",
  },
  {
    slug: "plataforma",
    nome: "Plataforma",
    area: "Fundação",
    funcao: "A fundação: login, banco, migration, deploy e provedores de IA.",
    vinculo: "dominio",
    somenteLeitura: false,
    noArDesde: "2026-08-01",
  },
  {
    slug: "meta",
    nome: "Meta",
    area: "Trava de plataforma",
    funcao: "Diz o que pode e o que não pode na Meta, antes de qualquer escrita.",
    vinculo: "dominio",
    somenteLeitura: false,
    noArDesde: "2026-08-02",
  },
  {
    slug: "google",
    nome: "Google",
    area: "Trava de plataforma",
    funcao: "Diz o que pode e o que não pode no Google, antes de qualquer escrita.",
    vinculo: "dominio",
    somenteLeitura: false,
    noArDesde: "2026-08-03",
  },
  {
    slug: "tiktok",
    nome: "TikTok",
    area: "Trava de plataforma",
    funcao: "Diz o que pode e o que não pode no TikTok, antes de qualquer escrita.",
    vinculo: "dominio",
    somenteLeitura: false,
    noArDesde: "2026-08-03",
  },
];
