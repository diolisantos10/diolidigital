// reconverter-pecas-para-jpeg.mts — AS PEÇAS VELHAS EM PNG, REGERADAS EM JPEG
// PELO RASTERIZADOR DE HOJE. NÃO PUBLICA NADA.
//
// ── O QUE ISTO CONSERTA (14/08/2026) ────────────────────────────────────────
//
// `/api/meta/prontidao` rodou contra produção às 21h43 de 14/08: 6 posts do
// CityJobs agendados, os 6 com `pronto:false`, e o PRIMEIRO portão que barra
// nos seis é o **Formato do arquivo** — as artes estão gravadas como
// `image/png` e o Instagram só publica JPEG.
//
// A causa já está consertada no código: o rasterizador saiu de PNG para JPEG em
// 08/08 (`design/renderizar.ts` → `MIME_DA_PECA_RENDERIZADA`) e a peça composta
// carrega esse MIME até o banco. O que sobrou é ESTOQUE — peças rasterizadas
// pelo motor velho, ainda penduradas nos posts agendados. Nenhum deploy as
// desbloqueia, porque o arquivo antigo continua sendo o arquivo do post.
//
//   npx tsx scripts/reconverter-pecas-para-jpeg.mts                 (só mede)
//   npx tsx scripts/reconverter-pecas-para-jpeg.mts --aplicar       (troca o contêiner)
//   npx tsx scripts/reconverter-pecas-para-jpeg.mts --aplicar --limite=6
//   npx tsx scripts/reconverter-pecas-para-jpeg.mts --aplicar --redesenhar --carrosseis
//
// `--aplicar` sozinho faz o gesto MÍNIMO: os mesmos pixels, noutro contêiner.
// `--redesenhar` refaz a arte — muda a imagem e não avisa a aprovação do
// cliente, que fica presa ao post. Ver o bloco no `main()`.
//
// Contra PRODUÇÃO: exportar o `DATABASE_URL` de produção na chamada. Sem isso
// ele roda contra o banco local e não diz nada sobre o que está no ar.
//
// ── ⛔ ESTE SCRIPT NÃO PUBLICA, E ISSO É MECANISMO, NÃO PROMESSA ────────────
//
// Reagendar não é publicar, e aqui nem reagendar acontece: **a data marcada de
// cada post não é tocada**. O que muda é o ARQUIVO que o post aponta
// (`SocialPost.mediaUrl` / `mediaUrlsJson`), e nada mais. Quem publica é
// `esteira/publicacao.ts`, chamado pelo despertador, e ele continua atrás de
// todos os doze portões — incluindo `PUBLICACAO_ORGANICA`, que é decisão
// declarada do CEO e **não é tocada por este script nem por nada que ele
// chama**. Não há uma única chamada de plataforma neste caminho, e
// `__tests__/execution/reconverter-para-jpeg.test.ts` reprova se aparecer uma.
//
// ── O QUE ELE NÃO CUSTA ─────────────────────────────────────────────────────
//
// **Nenhuma imagem é comprada.** A foto de cada peça já foi paga e está no
// armazenamento como `fundo-<postId>.png` — o re-render é rasterização local
// (≈1s). Regerar pelo gerador de imagem custaria a fatura de novo E entregaria
// OUTRA foto, o que não é conserto: é outra peça, num calendário já aprovado.

import { prisma } from "@/lib/db/client";
import {
  retratoDoFormato,
  type PecaEmFormatoRecusado,
} from "@/lib/agency/execution/reconversao-de-formato";
import { recomporPecas, type Recomposicao } from "@/lib/agency/execution/artes";
import { recomporCarrosseis } from "@/lib/agency/execution/recompor-carrossel";
import {
  reconverterArquivosParaJpeg,
  type ReconversaoDeArquivos,
} from "@/lib/agency/execution/reconverter-arquivos";

const LIMITE_PADRAO = 20;

function arg(nome: string): string | null {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split("=").slice(1).join("=") : null;
}

function linhaDaPeca(p: PecaEmFormatoRecusado): void {
  console.log(`${"-".repeat(78)}`);
  console.log(
    `POST ${p.postId} · cliente ${p.clientId ?? "(sem)"} · ${p.formato}` +
      ` · ${p.status} · ${p.agendadoPara ?? "sem data"}`,
  );
  for (const m of p.midias) console.log(`    ${m.id} → ${m.mime ?? "(fora do banco de mídia)"}`);
  console.log(`    ${p.motivo}`);
}

/** O relato de uma passada de recomposição, sem enfeitar o que não funcionou. */
function relatarPassada(titulo: string, r: Recomposicao): void {
  console.log(`\n${titulo}`);
  if (r.semRenderizador) {
    console.log(`  ⛔ ${r.semRenderizador}`);
    return;
  }
  console.log(`  regeradas em JPEG: ${r.recompostas.length}${r.recompostas.length ? ` → ${r.recompostas.join(", ")}` : ""}`);
  if (r.semFundo.length) {
    console.log(
      `  sem a foto guardada (${r.semFundo.length}): ${r.semFundo.join(", ")}\n` +
        "     regerar estas exigiria COMPRAR imagem nova — decisão que custa e não é deste script.",
    );
  }
  if (r.bloqueadas.length) {
    console.log(`  pilar bloqueado (${r.bloqueadas.length}): ${r.bloqueadas.join(", ")} — não se dá acabamento no que não pode sair.`);
  }
  for (const f of r.falhas) console.log(`  FALHOU ${f.postId}: ${f.erro}`);
}

/** O relato de uma passada de CONVERSÃO — a que não redesenha nada. */
function relatarConversao(r: ReconversaoDeArquivos): void {
  console.log("\nAPLICANDO · troca do contêiner (não redesenha, não muda a imagem)");
  console.log(
    `  peças convertidas: ${r.convertidas.length}` +
      `${r.convertidas.length ? ` → ${r.convertidas.join(", ")}` : ""}` +
      ` · arquivos reescritos: ${r.arquivosNovos}` +
      `${r.caminhos.length ? ` · por: ${r.caminhos.join(", ")}` : ""}`,
  );
  if (r.semArquivo.length) {
    console.log(
      `  sem o arquivo no armazenamento (${r.semArquivo.length}): ${r.semArquivo.join(", ")}\n` +
        "     não há contêiner para trocar — e inventar um seria produzir peça nova.",
    );
  }
  if (r.bloqueadas.length) {
    console.log(`  pilar bloqueado (${r.bloqueadas.length}): ${r.bloqueadas.join(", ")}`);
  }
  for (const f of r.falhas) console.log(`  FALHOU ${f.postId}: ${f.erro}`);
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes("--aplicar");
  // ── POR QUE REDESENHAR VIROU O CAMINHO EXCEPCIONAL (14/08/2026) ───────────
  //
  // Até aqui `--aplicar` REGERAVA a peça. Duas coisas medidas no mesmo dia
  // mudaram qual é o caminho certo:
  //
  //   • as 6 peças travadas são carrosséis SEM roteiro (`scenesJson`), e o
  //     redesenho para antes de tocar em arquivo quando não há o que escrever;
  //   • quem aprova a peça passou a ser o CLIENTE, peça por peça
  //     (`esteira/aprovacao-da-peca.ts`) — e a aprovação fica presa ao post, não
  //     ao arquivo. Redesenhar troca os pixels de algo já aprovado sem que a
  //     aprovação perceba.
  //
  // Então o padrão passou a ser o gesto mínimo: trocar o contêiner. Redesenhar
  // continua disponível, e agora é preciso PEDIR — porque é uma decisão sobre o
  // trabalho do cliente, não um detalhe de implementação.
  const redesenhar = process.argv.includes("--redesenhar");
  const comCarrosseis = process.argv.includes("--carrosseis");
  const pedido = Number(arg("limite"));
  const limite = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, LIMITE_PADRAO) : LIMITE_PADRAO;

  console.log(`\n${"=".repeat(78)}`);
  console.log("RECONVERSÃO DE PEÇAS PARA JPEG · nada é publicado, nada é reagendado");
  console.log(`${"=".repeat(78)}`);

  const antes = await retratoDoFormato(limite);
  console.log(`\nANTES · medido em ${antes.medidoEm}`);
  console.log(`VEREDITO: ${antes.veredito}\n`);
  for (const p of antes.posts) linhaDaPeca(p);
  for (const p of antes.carrosseis) linhaDaPeca(p);

  if (!aplicar) {
    console.log(
      "\n(medição apenas — NADA foi escrito. Rode com --aplicar para trocar o contêiner dos " +
        "arquivos para JPEG, mantendo a imagem exatamente como está.)\n",
    );
    return;
  }

  if (antes.posts.length === 0 && antes.carrosseis.length === 0) {
    console.log("\nNada a reconverter. Não escrevi nada.\n");
    return;
  }

  if (!redesenhar) {
    // O gesto mínimo: mesmos pixels, contêiner novo. Alcança carrossel e peça
    // única na mesma passada, e não precisa de roteiro nenhum.
    relatarConversao(await reconverterArquivosParaJpeg(limite));
  } else {
    console.log(
      "\n⚠️  --redesenhar: as peças abaixo serão REFEITAS, não reembaladas. A imagem muda, e a " +
        "aprovação do cliente fica presa ao post — ela NÃO percebe a troca. Use só quando a peça " +
        "ainda não foi ao cliente.",
    );
    relatarPassada("APLICANDO · peças únicas (modo `formato-recusado`)", await recomporPecas(limite, "formato-recusado"));

    if (comCarrosseis) {
      relatarPassada("APLICANDO · telas de carrossel (`recomporCarrosseis`)", await recomporCarrosseis(limite));
    } else if (antes.carrosseis.length > 0) {
      console.log(
        `\n⚠️  ${antes.carrosseis.length} carrossel(éis) continuam em formato recusado e NÃO foram tocados — ` +
          "eles são redesenhados tela a tela, por outra função. Rode de novo com --carrosseis.",
      );
    }
  }

  // ── A MEDIÇÃO DEPOIS É OBRIGATÓRIA ────────────────────────────────────────
  // Conserto que se declara consertado sem remedir é exatamente o portão de
  // decoração que esta casa já nomeou: existe, não roda, e cria confiança falsa.
  // Aqui a mesma régua da publicação responde de novo, com o banco já escrito.
  const depois = await retratoDoFormato(limite);
  console.log(`\n${"=".repeat(78)}`);
  console.log(`DEPOIS · medido em ${depois.medidoEm}`);
  console.log(`VEREDITO: ${depois.veredito}\n`);
  for (const p of depois.posts) linhaDaPeca(p);
  for (const p of depois.carrosseis) linhaDaPeca(p);

  console.log(
    "\nO portão do FORMATO é 1 de 12. Passar nele não quer dizer que o post sai — " +
      "rode `npx tsx scripts/prontidao-de-publicacao.mts` para a fila inteira, " +
      "e lembre que `PUBLICACAO_ORGANICA` continua sendo decisão do CEO.\n",
  );
}

main()
  .catch((e) => {
    console.error("\nFALHA AO RECONVERTER:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
