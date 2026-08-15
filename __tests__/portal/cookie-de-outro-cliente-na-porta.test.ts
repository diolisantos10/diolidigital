// ── O COOKIE DE OUTRO CLIENTE MORRE NA PORTA (15/08/2026) ───────────────────
//
// `dioli_portal` é UM cookie por navegador, com `path:"/"` e 180 dias, e guarda
// UM cliente. Quem abre o portal de dois clientes no mesmo navegador — o CEO
// abre todos — fica com a credencial de um preso ao domínio inteiro. A partir
// daí qualquer chamada que não leve token explícito resolve pelo cliente
// errado.
//
// A página já trocava o token por cookie (`POST /api/portal/session`), mas isso
// é best-effort: roda dentro de um `useEffect`, a falha é engolida num
// `catch {}`, e as primeiras cargas de dados já saíram antes. O cookie velho
// sobrevive à visita nova.
//
// O `proxy.ts` fecha isso na PORTA, antes de a página renderizar. Uma camada
// só — não doze cópias dentro das rotas, que é o defeito nº 2 do incidente do
// Drive (ver o fim de `app/api/messages/conversa.ts`).
//
// ⚠️ É `proxy.ts`, não `middleware.ts`: no Next.js 16 os dois no mesmo
// repositório são ERRO DE BUILD ("Please use ./proxy.ts only"). Descoberto
// construindo, não lendo.

import { describe, it, expect } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { proxy } from "@/proxy";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";

function visita(caminho: string, cookie?: string): NextRequest {
  const r = new NextRequest(`http://localhost${caminho}`);
  if (cookie) r.cookies.set(PORTAL_COOKIE, cookie);
  return r;
}
/** O cookie foi mandado APAGAR? (valor vazio + maxAge 0 no mesmo path). */
function mandouApagar(res: NextResponse): boolean {
  const c = res.cookies.get(PORTAL_COOKIE);
  return !!c && c.value === "" && c.maxAge === 0 && c.path === "/";
}

describe("token no caminho diferente do cookie", () => {
  it("⛔ apaga o cookie do OUTRO cliente — ele não atravessa a visita", async () => {
    const res = await proxy(visita("/portal/access/tok-do-beta", "tok-do-alfa"));
    expect(mandouApagar(res)).toBe(true);
  });

  it("⛔ e apaga no MESMO path do cookie original", async () => {
    // `path` errado faz o navegador apagar outro cookie (ou nenhum) e o velho
    // continua viajando — a trava pareceria funcionar e não funcionaria.
    const res = await proxy(visita("/portal/access/tok-do-beta", "tok-do-alfa"));
    expect(res.cookies.get(PORTAL_COOKIE)?.path).toBe("/");
  });
});

describe("a outra metade — não inventa problema no caso limpo", () => {
  it("✅ mesmo token no caminho e no cookie → não mexe em nada", async () => {
    const res = await proxy(visita("/portal/access/tok-do-alfa", "tok-do-alfa"));
    expect(res.cookies.get(PORTAL_COOKIE)).toBeUndefined();
  });

  it("✅ /portal/access/me NUNCA é tocado — lá o cookie É a credencial", async () => {
    // Apagar aqui deslogaria todo cliente a cada visita ao portal.
    const res = await proxy(visita("/portal/access/me", "tok-do-alfa"));
    expect(res.cookies.get(PORTAL_COOKIE)).toBeUndefined();
  });

  it("✅ primeira visita, sem cookie nenhum → nada a apagar", async () => {
    const res = await proxy(visita("/portal/access/tok-do-beta"));
    expect(res.cookies.get(PORTAL_COOKIE)).toBeUndefined();
  });

  it("✅ nunca GRAVA cookie — só pode tirar acesso, nunca dar", async () => {
    // Gravar exigiria validar o token, e gravar sem validar é o bug que esta
    // casa já documentou: "cookie de token podre se esconde por 180 dias".
    for (const [caminho, cookie] of [
      ["/portal/access/tok-do-beta", "tok-do-alfa"],
      ["/portal/access/tok-do-beta", undefined],
      ["/portal/access/me", "tok-do-alfa"],
    ] as const) {
      const c = (await proxy(visita(caminho, cookie))).cookies.get(PORTAL_COOKIE);
      expect(c?.value ?? "").toBe("");
    }
  });
});
