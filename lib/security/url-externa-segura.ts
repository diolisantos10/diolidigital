// url-externa-segura.ts — ANTES DE BUSCAR QUALQUER URL QUE UM HUMANO DIGITOU,
// PERGUNTE PARA ONDE ELA REALMENTE APONTA. SSRF, fechado uma vez, aqui.
//
// ─── O ACHADO (27/09/2026, revisão de segurança da leva do Radar/Story) ─────
//
// `metadadosDaMidiaDeStory` (`lib/integrations/meta/midia-de-story.ts`) recebe
// `mediaUrl` do CORPO de `POST /api/meta/publish` — preenchido por
// `master`, `project_manager` OU `social_staff`, sem passar por aprovação de
// cliente — e faz `fetch(url, { method: "HEAD" })` nela, sem NENHUMA
// verificação de destino. Uma URL como `http://169.254.169.254/latest/meta-data/`
// (o endereço de metadado de nuvem AWS/GCP) ou `http://localhost:PORTA/rota-interna`
// é HEAD-ada pelo próprio servidor da casa, a partir de dentro da rede onde ele
// roda — a classe de vulnerabilidade que rouba credencial de nuvem em quem
// hospeda em AWS/GCP/Railway com metadado habilitado.
//
// ─── O QUE ESTA TRAVA FECHA, E O QUE ELA NÃO FECHA ──────────────────────────
//
// Fecha: esquema fora de http(s); host literal de loop-back/rede
// privada/link-local (IPv4 e IPv6, incluindo o endereço de metadado de nuvem
// 169.254.169.254 e o mapeamento IPv4-em-IPv6); hostname que RESOLVE (DNS) para
// um desses endereços; redirecionamento HTTP para um destino não checado (o
// `fetch` da chamada precisa usar `redirect: "manual"` — ver o comentário no
// ponto de uso).
//
// NÃO fecha "DNS rebinding" fino (o nome resolve para um IP público no instante
// desta checagem e para um IP privado no instante em que o `fetch` de verdade
// conecta, com um servidor de DNS malicioso e TTL baixíssimo). Fechar isso por
// completo exige resolver o DNS e reusar o MESMO endereço já resolvido na
// conexão (dispatcher fixado por IP) — fora do escopo desta correção pequena.
// Registrado como lacuna conhecida, não escondido.

import { promises as dns } from "node:dns";
import net from "node:net";

export type VereditoDeUrlExterna = { ok: true } | { ok: false; motivo: string };

const ESQUEMAS_PERMITIDOS = new Set(["http:", "https:"]);

/** Hostnames que, mesmo sem serem um IP literal, apontam para a própria
 *  máquina — nunca chegam a passar por `dns.lookup` porque o SO os resolve por
 *  fora do DNS de rede (`/etc/hosts`, resolvedor local). */
function apontaParaAPropriaMaquina(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local");
}

/** IPv4 — faixas privadas, de loop-back, link-local (inclui o endereço de
 *  metadado de nuvem 169.254.169.254), CGNAT, multicast e reservadas. Formato
 *  estranho falha FECHADO — nunca "provavelmente é público". */
function ipv4EhPrivadoOuReservado(ip: string): boolean {
  const partes = ip.split(".").map(Number);
  if (partes.length !== 4 || partes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = partes as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 — loop-back
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 — link-local, ONDE MORA O METADADO DE NUVEM
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0 && partes[2] === 0) return true; // 192.0.0.0/24 — reservado IETF
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 — CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 — benchmark
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reservado + broadcast
  return false;
}

/**
 * Expande um IPv6 válido — aceitando a compressão `::` e um sufixo
 * dotted-decimal de IPv4 embutido (`::ffff:1.2.3.4`) — para 8 hextetos
 * numéricos (0..65535). `null` se o formato não bater com o esperado.
 *
 * ─── POR QUE ISTO EXISTE (achado do `pm`, 27/09/2026) ───────────────────────
 *
 * `new URL("http://[::ffff:169.254.169.254]/x").hostname` não devolve a forma
 * com pontos — o serializador de host do WHATWG URL normaliza o mapeamento
 * IPv4-em-IPv6 para a forma HEXADECIMAL (`::ffff:a9fe:a9fe`). Um regex que só
 * reconhece `::ffff:a.b.c.d` deixa passar exatamente essa forma, que é a que
 * qualquer `new URL(...)` desta casa produz de verdade — a régua barrava um
 * texto que nunca aparece e deixava passar o que aparece sempre. Expandir
 * para hextetos e comparar por VALOR (não por string) fecha as duas formas
 * com a mesma checagem, em vez de colecionar regex por formato.
 */
function hextetosIPv6(ip: string): number[] | null {
  const secoes = ip.split("::");
  if (secoes.length > 2) return null; // "::" não pode aparecer duas vezes

  const paraGrupos = (secao: string): number[] | null => {
    if (secao === "") return [];
    const pedacos = secao.split(":");
    const grupos: number[] = [];
    for (let i = 0; i < pedacos.length; i++) {
      const pedaco = pedacos[i]!;
      if (i === pedacos.length - 1 && pedaco.includes(".")) {
        // sufixo IPv4 embutido (só é válido como os DOIS últimos hextetos).
        const partesIp = pedaco.split(".").map(Number);
        if (partesIp.length !== 4 || partesIp.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
        grupos.push(
          ((partesIp[0]! << 8) | partesIp[1]!) >>> 0,
          ((partesIp[2]! << 8) | partesIp[3]!) >>> 0,
        );
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(pedaco)) return null;
        grupos.push(parseInt(pedaco, 16));
      }
    }
    return grupos;
  };

  const esquerda = paraGrupos(secoes[0]!);
  const direita = secoes.length === 2 ? paraGrupos(secoes[1]!) : [];
  if (esquerda === null || direita === null) return null;

  if (secoes.length === 1) {
    return esquerda.length === 8 ? esquerda : null;
  }
  const faltando = 8 - esquerda.length - direita.length;
  if (faltando < 0) return null; // "::" tem de substituir ao menos um grupo
  return [...esquerda, ...Array(faltando).fill(0), ...direita];
}

/** IPv6 — loop-back, link-local (`fe80::/10`), unique-local (`fc00::/7`), e o
 *  mapeamento/tradução IPv4-em-IPv6 em QUALQUER forma que ele apareça (dotted
 *  ou hexadecimal, `::ffff:a.b.c.d` ou `::ffff:0:a.b.c.d` — RFC 2765/6052 —
 *  e o prefixo NAT64 bem-conhecido `64:ff9b::/96`), reaplicando a régua de
 *  IPv4 sobre os últimos 32 bits. */
function ipv6EhPrivadoOuReservado(ip: string): boolean {
  const normalizado = ip.toLowerCase();
  if (normalizado === "::1" || normalizado === "::") return true;
  if (
    normalizado.startsWith("fe8") || normalizado.startsWith("fe9") ||
    normalizado.startsWith("fea") || normalizado.startsWith("feb")
  ) {
    return true; // fe80::/10 — link-local
  }
  if (normalizado.startsWith("fc") || normalizado.startsWith("fd")) return true; // fc00::/7 — unique-local

  const hextetos = hextetosIPv6(normalizado);
  // Formato que não sei expandir: recusa por não saber para onde aponta —
  // nunca "provavelmente é público" (mesma régua do IPv4 acima).
  if (hextetos === null) return true;

  const ehIPv4Mapeado = hextetos.slice(0, 5).every((h) => h === 0) && hextetos[5] === 0xffff;
  const ehIPv4Traduzido = // ::ffff:0:a.b.c.d — RFC 2765
    hextetos.slice(0, 4).every((h) => h === 0) && hextetos[4] === 0xffff && hextetos[5] === 0;
  const ehNat64 = // 64:ff9b::/96 — prefixo bem-conhecido, RFC 6052
    hextetos[0] === 0x0064 && hextetos[1] === 0xff9b && hextetos.slice(2, 6).every((h) => h === 0);

  if (ehIPv4Mapeado || ehIPv4Traduzido || ehNat64) {
    const a = (hextetos[6]! >> 8) & 0xff;
    const b = hextetos[6]! & 0xff;
    const c = (hextetos[7]! >> 8) & 0xff;
    const d = hextetos[7]! & 0xff;
    return ipv4EhPrivadoOuReservado(`${a}.${b}.${c}.${d}`);
  }
  return false;
}

function enderecoEhPrivadoOuReservado(ip: string): boolean {
  return net.isIPv6(ip) ? ipv6EhPrivadoOuReservado(ip) : ipv4EhPrivadoOuReservado(ip);
}

/**
 * A URL pode ser buscada pelo SERVIDOR da casa (HEAD, GET) sem risco de SSRF?
 * `ok: false` é a resposta padrão de qualquer dúvida — formato estranho, DNS
 * que não resolve, endereço privado — porque "não sei para onde isto aponta"
 * nunca pode virar "então busca".
 *
 * Nunca lança.
 */
export async function confereUrlExternaSegura(urlBruta: string): Promise<VereditoDeUrlExterna> {
  let url: URL;
  try {
    url = new URL(urlBruta);
  } catch {
    return { ok: false, motivo: "URL malformada" };
  }
  if (!ESQUEMAS_PERMITIDOS.has(url.protocol)) {
    return { ok: false, motivo: `esquema "${url.protocol}" não é permitido — só http/https` };
  }

  // `URL.hostname` devolve um IPv6 literal ENTRE COLCHETES ("[::1]") — regra
  // do WHATWG URL, não capricho. `net.isIP` e `dns.lookup` não reconhecem os
  // colchetes: sem tirá-los, todo IPv6 literal cai (errado) no ramo de DNS.
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (apontaParaAPropriaMaquina(hostname)) {
    return { ok: false, motivo: `host "${hostname}" aponta para a própria máquina — recusado` };
  }

  if (net.isIP(hostname)) {
    if (enderecoEhPrivadoOuReservado(hostname)) {
      return { ok: false, motivo: `endereço "${hostname}" é privado/reservado — recusado` };
    }
    return { ok: true };
  }

  let enderecos: Array<{ address: string }>;
  try {
    enderecos = await dns.lookup(hostname, { all: true });
  } catch {
    return { ok: false, motivo: `não consegui resolver o host "${hostname}" — recusado por não saber para onde aponta` };
  }
  if (enderecos.length === 0) {
    return { ok: false, motivo: `host "${hostname}" não resolveu para nenhum endereço — recusado` };
  }
  for (const { address } of enderecos) {
    if (enderecoEhPrivadoOuReservado(address)) {
      return {
        ok: false,
        motivo: `host "${hostname}" resolve para um endereço privado/reservado (${address}) — recusado`,
      };
    }
  }
  return { ok: true };
}
