// O COFRE: por que definir CREDENTIALS_SECRET deixou de destruir dado.
//
// ── O QUE HAVIA ────────────────────────────────────────────────────────────
// Sem `CREDENTIALS_SECRET`, a chave AES vinha do `DATABASE_URL` (scrypt, salt
// constante e público no arquivo). E `scripts/start.sh` AUTO-DERIVA a
// `DATABASE_URL` do caminho do volume quando ela falta — `file:/data/dioli.db`,
// uma string adivinhável. Os 14 backups ficam NO MESMO volume: quem obtiver um
// backup reconstrói a chave e decifra as chaves de IA, o App Secret da Meta e
// TODOS os tokens de longa duração dos clientes.
//
// ── POR QUE NÃO BASTAVA "EXIGIR A VARIÁVEL E FALHAR ALTO" ───────────────────
// `lib/auth/secret.ts` pode falhar alto porque a chave dele ASSINA. Esta CIFRA.
// Definir a variável trocava a chave e tornava indecifrável tudo que já estava
// no cofre. Está registrado na vitrine da plataforma: "NÃO sete
// CREDENTIALS_SECRET agora — isso torna o cofre indecifrável".
//
// ── O CONSERTO: LEITURA COM DUAS CHAVES ────────────────────────────────────
// Escrita usa sempre a chave nova; leitura tenta a nova e cai na legada. É isto
// que este arquivo tranca — porque é isto que transforma "não mexa nessa
// variável" em "pode definir a variável com segurança".

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  cifradoComChaveLegada,
  estadoDaChaveDeCredenciais,
  keyHint,
} from "@/lib/security/crypto";

const ambienteOriginal = { ...process.env };

beforeEach(() => {
  delete process.env.CREDENTIALS_SECRET;
  process.env.DATABASE_URL = "file:/data/dioli.db"; // exatamente o que o start.sh monta
});

afterEach(() => {
  process.env = { ...ambienteOriginal };
});

describe("o básico continua funcionando", () => {
  it("cifra e decifra o mesmo texto", () => {
    // O texto claro precisa aparecer aqui, senão não há como provar que o
    // cofre devolve o original depois de cifrar.
    // segredo-permitido: chave FALSA de fixture.
    const cifrado = encryptSecret("sk-ant-uma-chave-de-verdade");
    expect(cifrado).not.toContain("sk-ant");
    // segredo-permitido: o mesmo valor falso, do outro lado do cofre.
    expect(decryptSecret(cifrado)).toBe("sk-ant-uma-chave-de-verdade");
  });

  it("texto adulterado não abre — o GCM autentica, não só cifra", () => {
    const cifrado = encryptSecret("segredo");
    const [iv, tag, dados] = cifrado.split(":");
    // ⚠️ A adulteração tem que MUDAR o byte de verdade. A versão antiga trocava
    // o fim por "ff" fixo — e quando o último byte do cifrado JÁ era 0xff
    // (1 chance em 256, por rodada), o "adulterado" era idêntico ao original,
    // abria normalmente e o teste reprovava a suíte na loteria. Foi exatamente
    // assim que a CI do PR #146 falhou com o push do MESMO commit verde.
    // Byte garantidamente diferente = adulteração garantida, zero flake.
    const diferente = dados.slice(-2).toLowerCase() === "ff" ? "00" : "ff";
    const mexido = `${iv}:${tag}:${dados.slice(0, -2)}${diferente}`;
    expect(mexido).not.toBe(cifrado);
    expect(decryptSecret(mexido)).toBeNull();
  });

  it("lixo não derruba — devolve null", () => {
    expect(decryptSecret("nao-e-nada-disso")).toBeNull();
    expect(decryptSecret("")).toBeNull();
  });
});

describe("definir CREDENTIALS_SECRET NÃO apaga o cofre", () => {
  it("o que foi cifrado com a chave legada continua legível depois de definir a nova", () => {
    // 1. O mundo de antes: sem CREDENTIALS_SECRET.
    const antigo = encryptSecret("token-de-longa-duracao-do-cliente");

    // 2. O operador define a variável — o momento que antes destruía tudo.
    process.env.CREDENTIALS_SECRET = "uma-chave-forte-gerada-com-openssl-rand";

    // 3. O segredo antigo AINDA abre.
    expect(decryptSecret(antigo)).toBe("token-de-longa-duracao-do-cliente");
  });

  it("o que é escrito DEPOIS não abre mais com a chave legada — nasce protegido de verdade", () => {
    process.env.CREDENTIALS_SECRET = "uma-chave-forte-gerada-com-openssl-rand";
    const novo = encryptSecret("chave-nova");

    // Volta ao mundo sem a variável: quem só tem o DATABASE_URL não abre.
    delete process.env.CREDENTIALS_SECRET;
    expect(decryptSecret(novo)).toBeNull();
  });

  it("sabe dizer QUAIS segredos ainda dependem da chave fraca", () => {
    const antigo = encryptSecret("velho");
    process.env.CREDENTIALS_SECRET = "uma-chave-forte-gerada-com-openssl-rand";
    const novo = encryptSecret("novo");

    // É a peça que uma varredura de re-cifragem vai precisar — e a resposta
    // honesta para o painel: quantos ainda estão presos à chave legada.
    expect(cifradoComChaveLegada(antigo)).toBe(true);
    expect(cifradoComChaveLegada(novo)).toBe(false);
  });

  it("uma chave forte DIFERENTE não abre o que a outra chave forte fechou", () => {
    process.env.CREDENTIALS_SECRET = "chave-A";
    const cifrado = encryptSecret("segredo");
    process.env.CREDENTIALS_SECRET = "chave-B";
    expect(decryptSecret(cifrado)).toBeNull();
  });
});

describe("o estado da chave é dito com todas as letras", () => {
  it("sem CREDENTIALS_SECRET: NÃO é forte, e o aviso explica o risco do backup", () => {
    const e = estadoDaChaveDeCredenciais();
    expect(e.forte).toBe(false);
    expect(e.origem).toBe("DATABASE_URL");
    expect(e.aviso).toContain("backup");
  });

  it("com CREDENTIALS_SECRET: forte, sem aviso", () => {
    process.env.CREDENTIALS_SECRET = "uma-chave-forte";
    const e = estadoDaChaveDeCredenciais();
    expect(e.forte).toBe(true);
    expect(e.origem).toBe("CREDENTIALS_SECRET");
    expect(e.aviso).toBeNull();
  });
});

describe("a constante 'change-me' saiu do caminho de produção", () => {
  it("em produção, sem NENHUM material, LANÇA em vez de cifrar com uma senha publicada", () => {
    const nodeEnv = process.env.NODE_ENV;
    delete process.env.CREDENTIALS_SECRET;
    delete process.env.DATABASE_URL;
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true });
    try {
      expect(() => encryptSecret("x")).toThrow(/CREDENTIALS_SECRET/);
    } finally {
      Object.defineProperty(process.env, "NODE_ENV", { value: nodeEnv, configurable: true });
    }
  });
});

describe("a dica de chave nunca revela a chave", () => {
  it("mostra só o prefixo e os 4 últimos", () => {
    // segredo-permitido: chave FALSA de fixture.
    const dica = keyHint("sk-ant-api03-ABCDEFGHIJKLMNOPqrst");
    expect(dica).not.toContain("ABCDEFGHIJKLMNOP");
    expect(dica.endsWith("qrst")).toBe(true);
  });
});
