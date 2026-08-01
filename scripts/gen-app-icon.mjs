// ─── Ícone 1024×1024 do app da Meta ───────────────────────────────────────────
// Uso:  node scripts/gen-app-icon.mjs
// Salva em public/brand/dioli-app-icon-1024.png
//
// A Meta exige um ícone de 1024×1024 para liberar o App Review, e recusa PNG com
// transparência em alguns fluxos. Este script desenha a marca em vetor e rasteriza
// com fundo sólido — nada de esticar um PNG pequeno, que é como ícone borrado
// chega na loja.
//
// A geometria é a mesma do app/icon.svg — um anel grande e um pequeno —, mas o
// enquadramento NÃO é: no favicon a marca é assimétrica de propósito, e ampliada
// para 1024 num quadrado ela desaba para o canto inferior esquerdo. Aqui a marca
// é medida (caixa real, contando a espessura do traço), centralizada no quadrado
// e reduzida para deixar respiro nas bordas — que é como ícone de app é lido, em
// cima de fundos que não controlamos.

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import sharp from "sharp";

const TAM = 1024;
const NAVY = "#070A1F";
const BRANCO = "#FFFFFF";
const OUT_DIR = "public/brand";
const OUT = `${OUT_DIR}/dioli-app-icon-1024.png`;

// A marca, nas coordenadas originais de 64×64 do app/icon.svg.
const aneis = [
  { cx: 24, cy: 34, r: 13, w: 4.4 },
  { cx: 49, cy: 27, r: 7,  w: 3.8 },
];

// Caixa real da marca: o raio externo de um traçado é r + metade da espessura.
// Ignorar isso deixa o desenho encostado na borda de um lado só.
const lim = aneis.map((a) => ({
  x0: a.cx - (a.r + a.w / 2), x1: a.cx + (a.r + a.w / 2),
  y0: a.cy - (a.r + a.w / 2), y1: a.cy + (a.r + a.w / 2),
}));
const x0 = Math.min(...lim.map((l) => l.x0));
const x1 = Math.max(...lim.map((l) => l.x1));
const y0 = Math.min(...lim.map((l) => l.y0));
const y1 = Math.max(...lim.map((l) => l.y1));

/** Quanto do quadrado a marca ocupa. 72% é o respiro padrão de ícone de app:
 *  menos que isso some no tamanho pequeno, mais que isso encosta na borda. */
const OCUPACAO = 0.72;
const escala = (TAM * OCUPACAO) / Math.max(x1 - x0, y1 - y0);
// Leva o centro da marca para o centro do quadrado.
const dx = TAM / 2 - ((x0 + x1) / 2) * escala;
const dy = TAM / 2 - ((y0 + y1) / 2) * escala;

const svg = `<svg width="${TAM}" height="${TAM}" viewBox="0 0 ${TAM} ${TAM}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${TAM}" height="${TAM}" fill="${NAVY}"/>
  <g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${escala.toFixed(4)})">
${aneis.map((a) => `    <circle cx="${a.cx}" cy="${a.cy}" r="${a.r}" stroke="${BRANCO}" stroke-width="${a.w}" fill="none"/>`).join("\n")}
  </g>
</svg>`;

if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

const png = await sharp(Buffer.from(svg))
  .flatten({ background: NAVY }) // sem canal alfa — a Meta implica com transparência
  .png({ compressionLevel: 9 })
  .toBuffer();

await writeFile(OUT, png);

const meta = await sharp(png).metadata();
console.log(`✓ ${OUT} — ${meta.width}×${meta.height}, ${(png.length / 1024).toFixed(0)} KB, alfa: ${meta.hasAlpha}`);
