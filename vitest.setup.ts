// O QUE PRECISA SER ESQUECIDO ENTRE UM TESTE E OUTRO.
//
// ── Por que este arquivo nasceu (27/08/2026) ────────────────────────────────
//
// `lib/ai/provedor-fora-de-jogo.ts` guarda, em memória de PROCESSO, quais
// provedores a casa acabou de ver sem saldo ou com a chave recusada — é o que
// impede a fila de bater 27 vezes em duas horas na mesma porta fechada.
//
// Em produção essa memória DEVE atravessar chamadas: é a razão de ela existir.
// Num arquivo de teste ela atravessaria os CASOS, e aí vira outra coisa —
// `generate-providers.test.ts` provou na hora: dois testes que devolviam 401 e
// 403 de propósito deixavam `claude` e `deepseek` marcados, e três testes
// seguintes passavam a medir a ordem em que foram escritos, não o código.
//
// Teste que depende da ordem é pior que teste nenhum: ele fica verde por
// acidente e vermelho por acidente, e das duas vezes ensina a coisa errada.
//
// Aqui, e não num `beforeEach` copiado em cada arquivo, porque a regra vale
// para a suíte inteira — e uma trava por chamador é a doença que esta casa já
// pagou: quem lembrasse de um arquivo esqueceria dos outros.
import { beforeEach } from "vitest";
import { esquecerProvedoresForaDeJogo } from "@/lib/ai/provedor-fora-de-jogo";

beforeEach(() => {
  esquecerProvedoresForaDeJogo();
});
