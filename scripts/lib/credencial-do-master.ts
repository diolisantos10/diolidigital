// A credencial do master para scripts — do AMBIENTE, nunca do código.
//
// 🔴 POR QUE ISTO EXISTE (26/08/2026). Dez scripts desta casa carregavam a
// senha do master em texto puro, colada linha a linha. Cada cópia era uma
// porta: quem lia o repositório tinha a credencial de DONO da agência na mão,
// e cada nova cópia tornava a rotação mais cara — trocar a senha exigia achar
// as dez.
//
// Agora existe um lugar só, e ele lê do ambiente. A ausência da variável não
// vira senha padrão nem tentativa às cegas: o script PARA, dizendo o nome da
// variável que falta. Ausência de chave nunca é porta aberta.
//
// ⚠️ A mensagem nomeia a variável. NUNCA imprima o valor: log é lido, copiado
// e colado.

/** Lê uma senha do ambiente ou para o script com motivo. */
export function exigirSenhaDoAmbiente(nomeDaVariavel: string): string {
  const valor = process.env[nomeDaVariavel];
  if (!valor) {
    throw new Error(
      `${nomeDaVariavel} não está definida. Este script precisa dela para logar ` +
        `e NÃO tem senha padrão — senha em código é porta aberta. Exporte a ` +
        `variável (o valor vive só no painel da hospedagem) e rode de novo.`,
    );
  }
  return valor;
}

/** E-mail e senha do master, prontos para o corpo de `/api/auth/signin`. */
export function credencialDoMaster(): { email: string; password: string } {
  return {
    email: process.env.TEST_EMAIL ?? "master@dioli.studio",
    password: exigirSenhaDoAmbiente("SEED_MASTER_PASSWORD"),
  };
}
