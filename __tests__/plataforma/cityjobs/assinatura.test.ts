// A régua HMAC do City Jobs — as DUAS metades: assinatura válida passa, e
// tudo que deveria recusar recusa (corpo alterado, timestamp fora da janela,
// segredo antigo depois da rotação terminar, replay).

import { describe, it, expect } from "vitest";
import {
  assinar,
  cabecalhoDaAssinatura,
  conferirAssinatura,
  segredosVigentes,
  JANELA_DO_TIMESTAMP_S,
} from "@/lib/integracoes/cityjobs/assinatura";

const SEGREDO = "segredo-de-teste-32-bytes-ok"; // segredo-permitido: fixture de HMAC do teste, não é credencial real
const ENV = { CITYJOBS_HMAC_SEGREDO: SEGREDO };

function agoraEmSegundos(): number {
  return Math.floor(Date.now() / 1000);
}

describe("assinatura válida passa", () => {
  it("aceita a assinatura calculada com o segredo vigente", () => {
    const corpo = '{"idExterno":"vaga-1"}';
    const ts = String(agoraEmSegundos());
    const assinatura = cabecalhoDaAssinatura(ts, corpo, SEGREDO);
    const veredito = conferirAssinatura({
      timestampHeader: ts,
      corpoBruto: corpo,
      assinaturaHeader: assinatura,
      env: ENV,
    });
    expect(veredito).toEqual({ ok: true });
  });

  it("GET assina o corpo vazio — string vazia, não omitido", () => {
    const ts = String(agoraEmSegundos());
    const assinatura = cabecalhoDaAssinatura(ts, "", SEGREDO);
    expect(conferirAssinatura({ timestampHeader: ts, corpoBruto: "", assinaturaHeader: assinatura, env: ENV }))
      .toEqual({ ok: true });
  });
});

describe("corpo alterado → recusa", () => {
  it("um único byte diferente já muda o HMAC", () => {
    const ts = String(agoraEmSegundos());
    const assinatura = cabecalhoDaAssinatura(ts, '{"idExterno":"vaga-1"}', SEGREDO);
    const veredito = conferirAssinatura({
      timestampHeader: ts,
      corpoBruto: '{"idExterno":"vaga-2"}', // corpo diferente do assinado
      assinaturaHeader: assinatura,
      env: ENV,
    });
    expect(veredito).toEqual({ ok: false, motivo: "assinatura_invalida" });
  });
});

describe("timestamp fora da janela → recusa", () => {
  it("passado além de 5 minutos", () => {
    const passado = agoraEmSegundos() - (JANELA_DO_TIMESTAMP_S + 60);
    const ts = String(passado);
    const corpo = "{}";
    const assinatura = cabecalhoDaAssinatura(ts, corpo, SEGREDO);
    expect(conferirAssinatura({ timestampHeader: ts, corpoBruto: corpo, assinaturaHeader: assinatura, env: ENV }))
      .toEqual({ ok: false, motivo: "timestamp_fora_da_janela" });
  });

  it("futuro além de 5 minutos — relógio desalinhado também não passa", () => {
    const futuro = agoraEmSegundos() + (JANELA_DO_TIMESTAMP_S + 60);
    const ts = String(futuro);
    const corpo = "{}";
    const assinatura = cabecalhoDaAssinatura(ts, corpo, SEGREDO);
    expect(conferirAssinatura({ timestampHeader: ts, corpoBruto: corpo, assinaturaHeader: assinatura, env: ENV }))
      .toEqual({ ok: false, motivo: "timestamp_fora_da_janela" });
  });

  it("dentro da janela (299s) passa", () => {
    const dentro = agoraEmSegundos() - (JANELA_DO_TIMESTAMP_S - 1);
    const ts = String(dentro);
    const corpo = "{}";
    const assinatura = cabecalhoDaAssinatura(ts, corpo, SEGREDO);
    expect(conferirAssinatura({ timestampHeader: ts, corpoBruto: corpo, assinaturaHeader: assinatura, env: ENV }))
      .toEqual({ ok: true });
  });
});

describe("segredo antigo depois da rotação terminar → recusa", () => {
  it("assinado com o segredo ANTERIOR, e só o ATUAL está configurado", () => {
    const ts = String(agoraEmSegundos());
    const corpo = "{}";
    const assinatura = cabecalhoDaAssinatura(ts, corpo, "segredo-antigo-que-ja-caducou");
    const veredito = conferirAssinatura({
      timestampHeader: ts,
      corpoBruto: corpo,
      assinaturaHeader: assinatura,
      env: { CITYJOBS_HMAC_SEGREDO: "segredo-novo-depois-da-rotacao" }, // sem o _ANTERIOR
    });
    expect(veredito).toEqual({ ok: false, motivo: "assinatura_invalida" });
  });

  it("mas DURANTE a rotação (os dois configurados) o antigo ainda vale", () => {
    const ts = String(agoraEmSegundos());
    const corpo = "{}";
    const assinatura = cabecalhoDaAssinatura(ts, corpo, "segredo-antigo-ainda-na-janela");
    const veredito = conferirAssinatura({
      timestampHeader: ts,
      corpoBruto: corpo,
      assinaturaHeader: assinatura,
      env: {
        CITYJOBS_HMAC_SEGREDO: "segredo-novo",
        CITYJOBS_HMAC_SEGREDO_ANTERIOR: "segredo-antigo-ainda-na-janela",
      },
    });
    expect(veredito).toEqual({ ok: true });
  });
});

describe("replay → recusa", () => {
  it("uma requisição capturada e reenviada depois da janela falha, mesmo com assinatura correta", () => {
    // Assina "agora" (do ponto de vista de quem capturou) e confere bem mais
    // tarde — o cenário exato de replay: byte a byte idêntico, só o RELÓGIO
    // de quem confere andou.
    const tsDaCaptura = agoraEmSegundos() - 3600; // 1h atrás
    const corpo = '{"idExterno":"vaga-repetida"}';
    const assinatura = cabecalhoDaAssinatura(String(tsDaCaptura), corpo, SEGREDO);
    const veredito = conferirAssinatura({
      timestampHeader: String(tsDaCaptura),
      corpoBruto: corpo,
      assinaturaHeader: assinatura,
      env: ENV,
    });
    expect(veredito).toEqual({ ok: false, motivo: "timestamp_fora_da_janela" });
  });
});

describe("fail-closed sem segredo configurado", () => {
  it("segredosVigentes devolve lista vazia sem nenhuma env", () => {
    expect(segredosVigentes({})).toEqual([]);
  });

  it("string vazia não conta como segredo", () => {
    expect(segredosVigentes({ CITYJOBS_HMAC_SEGREDO: "   " })).toEqual([]);
  });

  it("conferirAssinatura nunca aceita nada sem segredo — nem assinatura válida por acaso", () => {
    const ts = String(agoraEmSegundos());
    const veredito = conferirAssinatura({
      timestampHeader: ts,
      corpoBruto: "{}",
      assinaturaHeader: "v1=" + "a".repeat(64),
      env: {},
    });
    expect(veredito).toEqual({ ok: false, motivo: "sem_segredo_configurado" });
  });
});

describe("prefixo do esquema", () => {
  it("recusa hex sem o prefixo v1=", () => {
    const ts = String(agoraEmSegundos());
    const corpo = "{}";
    const hex = assinar(ts, corpo, SEGREDO);
    expect(conferirAssinatura({ timestampHeader: ts, corpoBruto: corpo, assinaturaHeader: hex, env: ENV }))
      .toEqual({ ok: false, motivo: "assinatura_invalida" });
  });

  it("recusa cabeçalho ausente", () => {
    const ts = String(agoraEmSegundos());
    expect(conferirAssinatura({ timestampHeader: ts, corpoBruto: "{}", assinaturaHeader: null, env: ENV }))
      .toEqual({ ok: false, motivo: "assinatura_invalida" });
  });
});
