// AES-256-GCM para segredos guardados (chaves de IA, App Secret da Meta, os
// tokens de longa duração dos clientes). SERVER-ONLY. Nunca importe de um
// componente de cliente.
//
// ── A ARMADILHA QUE ESTE ARQUIVO TINHA, E COMO ELA FOI DESARMADA ────────────
//
// O problema: sem `CREDENTIALS_SECRET`, a chave AES vinha de `DATABASE_URL`
// (scrypt, salt CONSTANTE e público neste arquivo). E `scripts/start.sh`
// auto-deriva a `DATABASE_URL` do caminho do volume quando ela falta — ou seja,
// a "chave" vira `file:/data/dioli.db`, uma string ADIVINHÁVEL. Some a isso que
// os 14 backups ficam NO MESMO VOLUME: quem obtiver um arquivo de backup
// reconstrói a chave em segundos e decifra tudo.
//
// Por que não bastava "exigir CREDENTIALS_SECRET e falhar alto" como faz
// `lib/auth/secret.ts`: aqui a chave não assina, ela CIFRA. Setar a variável
// hoje trocaria a chave e tornaria INDECIFRÁVEL tudo que já foi cifrado com o
// fallback — chaves de IA e tokens da Meta inclusive. Endurecimento que parece
// segurança e é perda de dado. (Está registrado na vitrine da plataforma:
// "NÃO sete CREDENTIALS_SECRET agora".)
//
// O conserto é a LEITURA COM DUAS CHAVES:
//   • escrita → SEMPRE a chave nova (CREDENTIALS_SECRET), quando ela existe;
//   • leitura → tenta a nova; não abrindo, tenta a LEGADA (DATABASE_URL).
// Com isso, setar `CREDENTIALS_SECRET` deixa de destruir dado: o que é antigo
// continua sendo lido, o que é novo já nasce com a chave forte. A armadilha
// vira uma migração que acontece sozinha, no ritmo de cada segredo reescrito.
//
// ⚠️ O QUE AINDA FALTA (não é feito aqui, de propósito): uma varredura de
// re-cifragem que reescreva os segredos antigos com a chave nova. Enquanto ela
// não rodar, um segredo nunca reescrito continua protegido pela chave fraca.
// Isso MEXE EM DADO DE PRODUÇÃO e é decisão do CEO, não de um deploy.

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Compara dois segredos em TEMPO CONSTANTE.
 *
 * `a === b` em JavaScript sai no primeiro byte diferente. Contra um segredo de
 * cabeçalho (CRON_SECRET, ADMIN_TASK_SECRET, verify token da Meta) isso é uma
 * fuga de informação medível: o atacante descobre o segredo byte a byte,
 * pedindo tempo em vez de sorte.
 *
 * O padrão já existia na casa — `lib/integrations/meta/webhooks.ts` e
 * `signed-request.ts` usam `timingSafeEqual`. Este helper é o mesmo padrão num
 * lugar só, para os seis pontos que ainda comparavam com `!==`.
 *
 * Compara o SHA-256 dos dois lados, não os bytes crus: `timingSafeEqual` exige
 * buffers do mesmo tamanho, e sair mais cedo por diferença de comprimento
 * devolveria justamente o sinal de tempo que se quer eliminar. O digest tem
 * sempre 32 bytes.
 *
 * Segredo vazio/ausente NUNCA confere — configuração faltando não vira porta
 * aberta.
 */
export function segredoConfere(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!recebido || !esperado) return false;
  const a = createHash("sha256").update(recebido, "utf8").digest();
  const b = createHash("sha256").update(esperado, "utf8").digest();
  return timingSafeEqual(a, b);
}

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const SALT = "dioli-agency-os::credentials::v1";

let jaAvisou = false;

/** O material LEGADO: o que a casa vinha usando quando não há
 *  `CREDENTIALS_SECRET`. Previsível de propósito — é o que se quer aposentar. */
function materialLegado(): string | null {
  return process.env.DATABASE_URL?.trim() || null;
}

/**
 * O estado da chave, em linguagem de operador. Exportado para o painel poder
 * dizer a verdade em vez de mostrar um "ok" que não significa nada.
 */
export function estadoDaChaveDeCredenciais(): {
  forte: boolean;
  origem: "CREDENTIALS_SECRET" | "DATABASE_URL" | "nenhuma";
  aviso: string | null;
} {
  if (process.env.CREDENTIALS_SECRET?.trim()) {
    return { forte: true, origem: "CREDENTIALS_SECRET", aviso: null };
  }
  if (materialLegado()) {
    return {
      forte: false,
      origem: "DATABASE_URL",
      aviso:
        "CREDENTIALS_SECRET não definido — os segredos (chaves de IA, App Secret da Meta, tokens dos clientes) estão cifrados com uma chave derivada do DATABASE_URL, que o start.sh monta a partir do caminho do volume: uma string ADIVINHÁVEL. Os backups ficam no MESMO volume, então quem obtiver um backup decifra tudo. Definir CREDENTIALS_SECRET agora é SEGURO: a leitura tenta a chave nova e cai na antiga.",
    };
  }
  return { forte: false, origem: "nenhuma", aviso: "Nem CREDENTIALS_SECRET nem DATABASE_URL definidos." };
}

/** 32 bytes para aes-256. */
function chave(material: string): Buffer {
  return scryptSync(material, SALT, 32);
}

/**
 * As chaves candidatas para LEITURA, em ordem de preferência.
 * A primeira da lista é também a única usada para ESCREVER.
 *
 * ⚠️ Sem nenhum material, isto LANÇA em produção — mesmo espírito de
 * `lib/auth/secret.ts`. A constante `"...change-me"` que existia aqui era pior
 * que nada: fazia o sistema cifrar com uma senha publicada no repositório e não
 * avisar ninguém. Em produção o `start.sh` garante `DATABASE_URL`, então este
 * caminho só dispara em configuração de fato quebrada — e aí é melhor parar.
 */
function materiais(): string[] {
  const explicito = process.env.CREDENTIALS_SECRET?.trim();
  const legado = materialLegado();

  if (!explicito && !legado) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[crypto] Nem CREDENTIALS_SECRET nem DATABASE_URL definidos — não há material para derivar a chave de cifragem. " +
          "Defina CREDENTIALS_SECRET nas Variables do Railway (gere com: openssl rand -base64 32).",
      );
    }
    // Fora de produção, uma chave de desenvolvimento explícita e sem disfarce.
    return ["dioli-dev-only-credentials-key"];
  }

  if (!explicito && !jaAvisou && process.env.NODE_ENV === "production") {
    jaAvisou = true;
    console.error(`⚠ ${estadoDaChaveDeCredenciais().aviso}`);
  }

  // A ordem É o mecanismo: a chave nova primeiro (é a que escreve), a legada
  // depois (é a que ainda abre o que foi cifrado antes).
  return explicito ? [explicito, legado].filter((m): m is string => !!m) : [legado!];
}

// Devolve "iv:authTag:ciphertext" (tudo hex). Cabe numa coluna de texto.
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  // SEMPRE a primeira chave — escrita nova nunca sai com a chave fraca quando
  // existe uma forte.
  const cipher = createCipheriv(ALGO, chave(materiais()[0]), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Inverso de `encryptSecret`. Devolve null em qualquer falha (adulterado, ou
 * nenhuma das chaves abre).
 *
 * Tenta a chave nova e, não abrindo, a legada. É esta segunda tentativa que
 * torna SEGURO definir `CREDENTIALS_SECRET` numa base que já tem segredos
 * cifrados — antes disso, definir a variável apagava o cofre na prática.
 *
 * A tentativa extra não enfraquece nada: o GCM autentica: chave errada não
 * "quase abre", ela falha na verificação do authTag.
 */
export function decryptSecret(payload: string): string | null {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) return null;

  for (const material of materiais()) {
    try {
      const decipher = createDecipheriv(ALGO, chave(material), Buffer.from(ivHex, "hex"));
      decipher.setAuthTag(Buffer.from(tagHex, "hex"));
      const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
      return decrypted.toString("utf8");
    } catch {
      // Esta chave não abre — tenta a próxima.
    }
  }
  return null;
}

/**
 * Este texto cifrado ainda está preso à chave LEGADA?
 *
 * É a peça que uma varredura de re-cifragem vai precisar — e é também a
 * resposta honesta para o painel: "quantos segredos ainda dependem da chave
 * fraca". Devolve false quando não há chave nova configurada (aí a pergunta
 * não faz sentido).
 */
export function cifradoComChaveLegada(payload: string): boolean {
  if (!process.env.CREDENTIALS_SECRET?.trim()) return false;
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) return false;
  const lista = materiais();
  try {
    const d = createDecipheriv(ALGO, chave(lista[0]), Buffer.from(ivHex, "hex"));
    d.setAuthTag(Buffer.from(tagHex, "hex"));
    Buffer.concat([d.update(Buffer.from(dataHex, "hex")), d.final()]);
    return false; // abriu com a chave nova
  } catch {
    return decryptSecret(payload) !== null; // só abre com a legada
  }
}

// A non-sensitive display hint for a key, e.g. "sk-ant-…a1b2".
export function keyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return "••••";
  const prefix = trimmed.slice(0, Math.min(6, trimmed.indexOf("-") + 1) || 3);
  return `${prefix}…${trimmed.slice(-4)}`;
}
