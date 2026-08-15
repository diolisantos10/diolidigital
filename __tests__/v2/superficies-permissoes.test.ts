// SUPERFÍCIES DO M4 — a permissão provada nas funções puras que servem as
// três camadas (menu, página e API leem a MESMA regra do inventário).

import { describe, it, expect } from "vitest";
import { PAGINAS, resolverPagina, podeAbrirRota } from "@/lib/agency/organizacao/paginas";
import { PERFIL_DO_PAPEL, AGENCY_ROLE_OPTIONS } from "@/lib/agency/roles";
import { filtrarFila, departamentosDaFila, type ItemDeFila } from "@/lib/agency/v2-superficies/fila";

const PERFIL_CLIENTE = { autoridade: "client" as const, departamentos: [] };

describe("PM Command Center no inventário — a mesma linha serve tela e API", () => {
  it("a rota existe, com dono project-management e leitura para todo interno", () => {
    const pagina = resolverPagina("/agency/pm-command");
    expect(pagina).not.toBeNull();
    expect(pagina!.dono).toBe("project-management");
    expect(pagina!.acesso).toBe("todos_internos");
  });

  it("TODOS os 7 papéis internos abrem; o cliente NUNCA", () => {
    for (const { id } of AGENCY_ROLE_OPTIONS) {
      expect(podeAbrirRota(PERFIL_DO_PAPEL[id], "/agency/pm-command"), id).toBe(true);
    }
    expect(podeAbrirRota(PERFIL_CLIENTE, "/agency/pm-command")).toBe(false);
  });

  it("segmento e query não contornam a resolução", () => {
    expect(resolverPagina("/agency/pm-command/qualquer-coisa")?.href).toBe("/agency/pm-command");
    expect(resolverPagina("/agency/pm-command?x=1")?.href).toBe("/agency/pm-command");
  });

  it("nenhuma página do inventário ficou sem dono ou sem nível de acesso", () => {
    for (const p of PAGINAS) {
      expect(p.dono, p.href).toBeTruthy();
      expect(p.acesso, p.href).toBeTruthy();
    }
  });
});

describe("a fila da Central — recorte derivado do perfil, nunca de parâmetro", () => {
  const itens: ItemDeFila[] = [
    { id: "t1", titulo: "post do cliente A", departamentoId: "social-media", estadoCanonico: "production", prazo: new Date("2026-08-20"), bloqueado: false },
    { id: "t2", titulo: "peça de design", departamentoId: "design", estadoCanonico: "production", prazo: new Date("2026-08-18"), bloqueado: false },
    { id: "t3", titulo: "campanha", departamentoId: "paid-traffic", estadoCanonico: "production", prazo: null, bloqueado: true },
  ];

  it("direção vê tudo", () => {
    expect(departamentosDaFila(PERFIL_DO_PAPEL.master)).toBe("todos");
    expect(filtrarFila(PERFIL_DO_PAPEL.diretor, itens)).toHaveLength(3);
  });

  it("staff vê só a própria mesa — social não vê design nem tráfego", () => {
    const fila = filtrarFila(PERFIL_DO_PAPEL.social_staff, itens);
    expect(fila.map((i) => i.id)).toEqual(["t1"]);
  });

  it("design_staff alcança design (e branding, pelo perfil legado) — não tráfego", () => {
    const fila = filtrarFila(PERFIL_DO_PAPEL.design_staff, itens);
    expect(fila.map((i) => i.departamentoId)).toContain("design");
    expect(fila.map((i) => i.departamentoId)).not.toContain("paid-traffic");
  });

  it("bloqueado aparece PRIMEIRO — o que trava não se esconde; depois, prazo", () => {
    const fila = filtrarFila(PERFIL_DO_PAPEL.master, itens);
    expect(fila.map((i) => i.id)).toEqual(["t3", "t2", "t1"]);
  });

  it("perfil de cliente não vê fila nenhuma", () => {
    expect(filtrarFila(PERFIL_CLIENTE, itens)).toHaveLength(0);
  });
});
