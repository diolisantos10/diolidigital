// A GARANTIA DE SOMENTE-LEITURA — como TRAVA, não como aviso.
//
// O kit é explícito (`16-raio-x-noturno.md`, item 2 de "Como o Diretor executa"):
// "O raio-x é somente leitura. Nunca envia mensagem, nunca cria pedido, nunca
// toca em pagamento. **Se essa garantia não tiver teste, ela não existe**"
// (guardrail 4: prompt é aviso, código é trava).
//
// Um comentário dizendo "não escreva aqui" é exatamente o tipo de proteção que
// some na terceira alteração feita com pressa. Este teste é o que sobra.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(process.cwd(), "lib", "raio-x");

function arquivosDoRaioX(dir = RAIZ, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, nome.name);
    if (nome.isDirectory()) arquivosDoRaioX(caminho, acc);
    else if (nome.name.endsWith(".ts")) acc.push(caminho);
  }
  return acc;
}

/** `registro.ts` é o ÚNICO que escreve, e escreve em um lugar só: a memória do
 *  próprio raio-x, em `docs/raio-x/coletas/`. Ele não toca no banco. */
const UNICO_ESCRITOR = "registro.ts";

const ESCRITA_NO_BANCO = /prisma\.\w+\.(create|createMany|update|updateMany|delete|deleteMany|upsert|executeRaw)/;
const ESCRITA_EM_DISCO = /writeFileSync|appendFileSync|rmSync|unlinkSync|writeFile\(/;
// Verbos de ENVIO. Não a palavra "whatsapp": a metade de dados CONTA a fila de
// WhatsApp presa, e contar é ler. Proibir o substantivo em vez do verbo seria
// impedir o raio-x de enxergar justamente o que ele existe para enxergar.
const EFEITO_EXTERNO = /sendMail|enviarMensagem|enviarWhatsapp|sendMessage|dispararEmail|fetch\(\s*["'`]https?:/i;
const CHAMADA_DE_IA = /callProvider|chamarProvedor|gerarImagem|generateImage|analisarImagens|transcrever|openai|anthropic/i;

describe("o raio-x é somente leitura", () => {
  const arquivos = arquivosDoRaioX();

  it("varre pelo menos as cinco varreduras e a metade de dados", () => {
    // Se este teste ficar cego (nenhum arquivo lido), os de baixo passariam
    // vazios — que é a própria confusão que o guardrail 1 existe para impedir.
    expect(arquivos.length).toBeGreaterThanOrEqual(8);
  });

  it("não escreve no banco em lugar nenhum", () => {
    const culpados = arquivos.filter((a) => ESCRITA_NO_BANCO.test(readFileSync(a, "utf8")));
    expect(culpados).toEqual([]);
  });

  it("só escreve em disco no registro da própria coleta", () => {
    const culpados = arquivos
      .filter((a) => !a.endsWith(UNICO_ESCRITOR))
      .filter((a) => ESCRITA_EM_DISCO.test(readFileSync(a, "utf8")));
    expect(culpados).toEqual([]);
  });

  it("não manda mensagem nem chama serviço externo", () => {
    const culpados = arquivos.filter((a) => EFEITO_EXTERNO.test(readFileSync(a, "utf8")));
    expect(culpados).toEqual([]);
  });

  it("não chama IA — a coleta é código, ou a comparação com ontem morre", () => {
    // As varreduras CITAM os nomes dos motores pagos (é assim que elas os
    // procuram no código alheio). O que não pode é IMPORTAR um.
    const culpados = arquivos.filter((a) => {
      const texto = readFileSync(a, "utf8");
      const importes = texto.match(/^import .*$/gm) ?? [];
      return importes.some((linha) => CHAMADA_DE_IA.test(linha) || /@\/lib\/ai\//.test(linha));
    });
    expect(culpados).toEqual([]);
  });
});
