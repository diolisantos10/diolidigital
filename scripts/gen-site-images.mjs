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
  "Fotografia documental autêntica, luz natural de dia, cores realistas e suaves, " +
  "aparência acessível e cotidiana (NÃO corporativa, NÃO glamourosa, sem cara de banco de imagem). " +
  "Brasil, pequeno negócio real, pessoas diversas e naturais, momento espontâneo. ";

const SHOTS = [
  ["salao", "Uma cabeleireira dona de um pequeno salão de bairro atendendo uma cliente, sorrindo, ambiente simples e acolhedor."],
  ["padaria", "Um casal dono de uma padaria de bairro atrás do balcão com pães e cafezinho, avental, atendimento caloroso."],
  ["loja", "Uma pequena lojista conferindo o celular ao lado da maquininha de cartão no balcão da sua loja de roupas de bairro."],
  ["atelie", "Uma costureira/artesã trabalhando em sua máquina de costura num ateliê pequeno e organizado, tecidos coloridos ao redor."],
  ["foodtruck", "Um jovem empreendedor servindo um cliente na janela de um food truck de rua ao entardecer, clima descontraído."],
  ["oficina", "Um mecânico dono de uma pequena oficina de bairro conversando com um cliente ao lado do carro, mãos de trabalho, ambiente real."],
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
