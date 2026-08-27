// UMA FONTE SÓ PARA O NOME DA EMPRESA — 27/08/2026.
//
// `lib/marca.ts` já prometia este arquivo pelo nome ("o teste
// `__tests__/marca/uma-fonte-so.test.ts` fica vermelho se o nome velho voltar")
// e ele **não existia**. Comentário que aponta para uma trava inexistente é
// pior que comentário nenhum: a próxima pessoa lê, acredita, e não confere.
//
// ─── O QUE ESTE TESTE MEDE, E O QUE ELE DELIBERADAMENTE NÃO MEDE ────────────
//
// O irmão (`o-email-com-a-cara-da-casa.test.ts`) mede a SAÍDA — o HTML que
// chega ao cliente. Este mede a FONTE, e só nos arquivos que produzem texto
// que o cliente lê. A lição de 26/08 vale: teste que varre o repositório
// inteiro mede a árvore em que roda e reprova por um comentário. Por isso a
// lista abaixo é EXPLÍCITA e curta — quem acrescentar uma superfície que fala
// com o cliente acrescenta o arquivo aqui.
//
// ⚠️ FICA DECLARADO O QUE ESTA RÉGUA NÃO ALCANÇA:
//   • `lib/agency/mock-data.ts` — "Dioli Studio" é um CLIENTE FICTÍCIO de
//     demonstração ali. Não chega a cliente nenhum.
//   • `RESEND_FROM` — o nome no campo "De:" da caixa de entrada é variável de
//     ambiente do Railway. **Código nenhum pode consertá-la**; ela é do CEO.
//     Um teste verde aqui NÃO prova que o remetente está certo lá.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { NOME_APOSENTADO, NOME_DA_EMPRESA, WHATSAPP_DIGITOS } from "@/lib/marca";
import { WHATSAPP_DA_DIOLI } from "@/lib/agency/comercial/link-do-whatsapp";

/** Os arquivos que produzem texto lido POR CLIENTE. */
const SUPERFICIES_DE_CLIENTE = [
  "lib/email/molde.ts",
  "lib/email/templates.ts",
  "lib/email/send.ts",
  "lib/agency/prospect-engine.ts",
  "components/agency/briefing/PublicBriefingRoom.tsx",
];

/** Tira comentários e o `import` da constante — o que sobra é o que roda.
 *  Nomear o nome aposentado num comentário é DOCUMENTAR a recusa; escrevê-lo
 *  numa string é o defeito. */
function codigoQueRoda(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*\*.*$/gm, "");
}

describe("o nome velho não volta por superfície de cliente", () => {
  it.each(SUPERFICIES_DE_CLIENTE)("%s", (arquivo) => {
    const codigo = codigoQueRoda(readFileSync(arquivo, "utf8"));
    // A exceção nomeada: `lib/marca.ts` é o único lugar do mundo onde o nome
    // aposentado pode ser escrito — é a constante que este teste usa para
    // caçá-lo. Ela não está na lista acima justamente por isso.
    expect(codigo, `${arquivo} ressuscitou "${NOME_APOSENTADO}"`).not.toContain(NOME_APOSENTADO);
  });

  it("o e-mail não digita nem o nome CERTO — ele importa de lib/marca.ts", () => {
    // Escrever "Dioli Digital" à mão hoje é a semente do "Dioli Studio" de
    // amanhã: foi assim que o nome velho sobreviveu em dois rodapés ao mesmo
    // tempo, cada um com a sua época.
    for (const arquivo of ["lib/email/molde.ts", "lib/email/templates.ts"]) {
      const codigo = codigoQueRoda(readFileSync(arquivo, "utf8"));
      expect(codigo, `${arquivo} escreveu o nome à mão`).not.toContain(NOME_DA_EMPRESA);
    }
  });
});

describe("o tamanho declarado do logo bate com a arte de verdade", () => {
  /** Lê largura e altura do cabeçalho IHDR de um PNG. 8 bytes de assinatura,
   *  4 de tamanho do chunk, 4 do tipo "IHDR", e então dois uint32 big-endian. */
  function dimensoesDoPng(caminho: string): { largura: number; altura: number } {
    const b = readFileSync(caminho);
    return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
  }

  it("o e-mail não estica o logo", async () => {
    // O defeito que este teste nasceu para pegar: o molde declarava 150 × 34
    // (proporção 4,41) sobre um arquivo de 512 × 130 (proporção 3,94). Cliente
    // de e-mail EXIGE width/height no `<img>` — sem eles o layout pula e a
    // linha do `alt` colapsa —, então a saída não é remover os atributos: é
    // fazer os dois números descreverem a arte que existe.
    const { LOGO_LARGURA, LOGO_ALTURA, LOGO_BRANCO_URL } = await import("@/lib/marca");

    // O arquivo é o MESMO que a URL pública serve: `public/brand/<nome>`.
    const nomeDoArquivo = LOGO_BRANCO_URL.split("/brand/")[1];
    expect(nomeDoArquivo, "a URL do logo precisa apontar para public/brand/").toBeTruthy();

    const arte = dimensoesDoPng(`public/brand/${nomeDoArquivo}`);
    const proporcaoDaArte = arte.largura / arte.altura;
    const proporcaoDeclarada = LOGO_LARGURA / LOGO_ALTURA;

    // Tolerância de meio pixel na altura renderizada — é o arredondamento
    // inevitável de encaixar uma proporção real em pixels inteiros. Mais que
    // isso já é distorção que o olho vê.
    const alturaIdeal = LOGO_LARGURA / proporcaoDaArte;
    expect(
      Math.abs(LOGO_ALTURA - alturaIdeal),
      `declarado ${LOGO_LARGURA}×${LOGO_ALTURA} (${proporcaoDeclarada.toFixed(2)}) para uma arte ${arte.largura}×${arte.altura} (${proporcaoDaArte.toFixed(2)}) — o logo sai esticado`,
    ).toBeLessThanOrEqual(0.5);
  });
});

describe("o número do WhatsApp também tem uma fonte só", () => {
  it("a marca NÃO redigita o número — ela lê do comercial", () => {
    // O número já viveu em oito arquivos ao mesmo tempo (ver
    // `lib/agency/comercial/link-do-whatsapp.ts`). O e-mail é a superfície que
    // ninguém consegue corrigir depois de enviada: um número velho num botão
    // de WhatsApp é um cliente falando com o vazio.
    expect(WHATSAPP_DIGITOS).toBe(WHATSAPP_DA_DIOLI);

    const marca = codigoQueRoda(readFileSync("lib/marca.ts", "utf8"));
    // Ele aparece uma vez só em `lib/marca.ts`: dentro do formato LEGÍVEL,
    // que é outra grafia. Os dígitos crus não podem estar escritos ali.
    expect(marca, "lib/marca.ts redigitou os dígitos do WhatsApp").not.toContain(WHATSAPP_DA_DIOLI);
  });

  it("o formato legível e os dígitos descrevem o MESMO número", () => {
    // O clássico: consertaram o texto e esqueceram o href (ou o contrário).
    const legivel = codigoQueRoda(readFileSync("lib/marca.ts", "utf8"))
      .match(/WHATSAPP_LEGIVEL = "([^"]+)"/)?.[1];
    expect(legivel).toBeDefined();
    expect(legivel!.replace(/\D/g, "")).toBe(WHATSAPP_DIGITOS.slice(2));
  });
});
