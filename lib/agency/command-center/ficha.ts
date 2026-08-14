// A ficha do cliente, vazia. Vive fora de `carregar-cliente.ts` de propósito:
// é função pura, sem Prisma e sem `server-only`, e por isso pode ser importada
// pelo componente de tela sem arrastar o banco junto.
//
// Toda linha nasce `null`. O componente desenha "— não informado" — nunca em
// branco e nunca um traço solto. Campo vazio desenhado igual a um preenchido é
// a tela mentindo por omissão; é a mesma regra dura da `FichaDeMarca`.

export type ClientSheetData = {
  responsible: { name: string | null; role: string | null };
  origin: { label: string | null; note: string | null };
  agent: { label: string; note: string };
  relationship: { label: string; note: string | null };
  company: { term: string; value: string | null }[];
  contact: { term: string; value: string | null }[];
  briefing: { summary: string | null; pain: string | null; goal: string | null; audience: string | null };
  governance: { term: string; value: string }[];
  lastReview: string | null;
};

export function fichaVazia(name: string): ClientSheetData {
  return {
    responsible:  { name: null, role: null },
    origin:       { label: null, note: null },
    agent:        { label: "Agente Project Manager", note: "Interlocutor único da agência" },
    relationship: { label: "Sem contrato registrado", note: null },
    company:      [{ term: "Nome da marca", value: name }],
    contact:      [{ term: "E-mail", value: null }, { term: "Telefone", value: null }],
    briefing:     { summary: null, pain: null, goal: null, audience: null },
    governance: [
      { term: "Quem fala com o cliente", value: "Agente Project Manager" },
      { term: "Quem recebe o cascata",   value: "Agentes especialistas" },
      { term: "Aprovação final",          value: "Responsável do cliente" },
      { term: "Registro oficial",         value: "Chat + histórico do portal" },
    ],
    lastReview: null,
  };
}
