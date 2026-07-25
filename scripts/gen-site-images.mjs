// ─── Gerador de imagens humanizadas do site (OpenAI gpt-image-1 → dall-e-3) ────
// Uso:  OPENAI_API_KEY=sk-... node scripts/gen-site-images.mjs
// Salva PNGs em public/img/humanos/. NÃO faz commit da chave (só das imagens).
//
// Fotos "democráticas": cotidiano de pequenos empresários brasileiros, diversos,
// luz natural, sem cara corporativa/fancy, sem banco de imagem genérico.

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error("✗ Falta OPENAI_API_KEY. Rode: OPENAI_API_KEY=sk-... node scripts/gen-site-images.mjs");
  process.exit(1);
}

const OUT = "public/img/humanos";
const URL = "https://api.openai.com/v1/images/generations";

const BASE =
  "Fotografia moderna, luminosa e limpa, estética contemporânea acessível — referência de marca " +
  "fintech/startup (tipo Nubank): moderno, minimalista, caloroso e próximo. NÃO corporativo de " +
  "arranha-céu, NÃO de luxo, mas também NÃO precário nem amador — um meio-termo classe média. " +
  "Luz natural suave, cores realistas com leve tom limpo/frio, ambiente organizado e convidativo. " +
  "Brasil, empreendedorismo real e moderno. FOCO no ambiente/lugar; pessoas só em contexto ao fundo, " +
  "nunca retrato de atendimento em primeiro plano. ";

const SHOTS = [
  ["estudio", "Um pequeno estúdio/escritório moderno e claro: mesa de madeira clara com notebook aberto, caderno e um café, plantas e luz natural pela janela. Sem pessoas em primeiro plano."],
  ["coworking", "Interior de um coworking moderno e aconchegante: mesas de madeira, plantas, iluminação natural, uma ou duas pessoas desfocadas ao fundo trabalhando, clima descontraído e acessível."],
  ["loja", "Interior de uma pequena loja/boutique moderna e bem organizada: prateleiras limpas, iluminação agradável, plantas, estética contemporânea e acolhedora — nem luxuosa, nem precária. Sem pessoas em primeiro plano."],
  ["fintech", "Close moderno de mãos segurando um celular com um app de gestão/pagamentos na tela, sobre uma mesa clara com cartão e cafezinho ao lado — estética fintech acessível, luz suave e limpa."],
  ["cafe", "Interior de uma cafeteria de bairro moderna e clara: balcão de madeira, quadro de menu minimalista, plantas e luz natural — convidativa e contemporânea. Sem pessoas em primeiro plano."],
  ["fachada", "Fachada de um pequeno negócio de bairro moderno e convidativo, vista da calçada ao entardecer: vitrine de vidro limpa, plantas, luz quente por dentro, arquitetura contemporânea simples. Letreiro liso SEM nenhum texto ou palavra legível. Estética clean, atual e acessível — classe média, nem luxo, nem precário."],
];

const SIZE = "1536x1024"; // landscape
const TIMEOUT = 120_000;

async function gen(model, prompt, size, quality) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, size, quality, n: 1 }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      const msg = e?.error?.message || `HTTP ${res.status}`;
      const access = (res.status === 400 || res.status === 403) && /gpt-image|verif|access|allowed/i.test(msg);
      return { ok: false, msg, access };
    }
    const data = await res.json();
    const it = data.data?.[0];
    const buf = it?.b64_json
      ? Buffer.from(it.b64_json, "base64")
      : it?.url
      ? Buffer.from(await (await fetch(it.url)).arrayBuffer())
      : null;
    return buf ? { ok: true, buf } : { ok: false, msg: "resposta sem imagem" };
  } catch (err) {
    return { ok: false, msg: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(t);
  }
}

if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

for (const [name, scene] of SHOTS) {
  const prompt = BASE + scene;
  process.stdout.write(`• ${name} … `);
  let r = await gen("gpt-image-1", prompt, SIZE, "high");
  if (!r.ok && r.access) {
    process.stdout.write("(fallback dall-e-3) ");
    r = await gen("dall-e-3", prompt.slice(0, 4000), "1792x1024", "hd");
  }
  if (r.ok) {
    await writeFile(`${OUT}/${name}.png`, r.buf);
    console.log("ok");
  } else {
    console.log("FALHOU:", r.msg);
  }
}
console.log("\n✔ Concluído. Imagens em", OUT);
