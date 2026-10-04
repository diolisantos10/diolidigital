// O texto de dentro do PDF — o que a IA do cofre (só texto) consegue ler de
// um brand book. PDF montado à mão, byte a byte: sem arquivo de fixture.

import { describe, it, expect } from "vitest";
import { textoDoPdf } from "@/lib/ai/texto-do-pdf";

function pdfCom(texto: string): Buffer {
  const conteudo = `BT /F1 24 Tf 72 720 Td (${texto}) Tj ET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let corpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(corpo.length);
    corpo += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = corpo.length;
  corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) corpo += `${String(o).padStart(10, "0")} 00000 n \n`;
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(corpo, "latin1");
}

describe("textoDoPdf", () => {
  it("tira o texto de um PDF de verdade", async () => {
    const t = await textoDoPdf(pdfCom("Paleta Vermelho C8102E"));
    expect(t).toContain("Paleta Vermelho C8102E");
  });

  it("arquivo que não é PDF devolve null — nunca lança", async () => {
    expect(await textoDoPdf(Buffer.from("isto nao e um pdf"))).toBeNull();
  });
});
