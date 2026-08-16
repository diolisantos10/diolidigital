// ── O CENSO DO HISTÓRICO AMBÍGUO ────────────────────────────────────────────
//
// O `qualidade` barrou o merge com uma pergunta que não tinha resposta: **um P0
// cujo custo declarado é "esconder histórico" não se mescla sem o número.**
// Este script é a medida. **SOMENTE LEITURA** — não migra, não carimba, não
// apaga.
//
// ⚠️ A PRIMEIRA VERSÃO DESTE SCRIPT TRANQUILIZAVA, e isso era o pior defeito
// da operação: ela contava só o que a cerca JÁ bloqueia, então uma solicitação
// re-apontada com histórico 100% legado aparecia como **zero**. Como o carimbo
// de dono começou agora, em produção ela tenderia a devolver 0 — que seria
// lido como "não há contaminação" justamente no caso mais exposto.
//
// A conta agora é a MESMA da cerca (`censoDeHistoricoAmbiguo`), e o número
// principal é `semDonoEscrito`: o **universo de risco**, não o custo da trava.
//
// Rodar:
//   DATABASE_URL="file:./dev.db"      npx tsx scripts/censo-de-historico-ambiguo.mts
//   DATABASE_URL="<url de produção>"  npx tsx scripts/censo-de-historico-ambiguo.mts
//
// Sem acesso ao banco (o de produção mora num volume dentro do contêiner), a
// mesma conta sai por `GET /api/admin/censo-de-historico-ambiguo`.

import { censoDeHistoricoAmbiguo } from "../lib/agency/portal/solicitacao-que-mudou-de-dono";

async function main() {
  const censo = await censoDeHistoricoAmbiguo();
  console.log(JSON.stringify(censo, null, 2));
  console.log(
    `\n🔴 NÚMERO PRINCIPAL — semDonoEscrito = ${censo.semDonoEscrito}`
    + "\n   É o universo de RISCO: toda mensagem anterior ao carimbo de dono cai aqui."
    + `\n\n   mensagensOcultadasPelaCerca = ${censo.mensagensOcultadasPelaCerca}`
    + "\n   É o CUSTO da trava, não o risco. ZERO aqui NÃO significa 'não há"
    + "\n   contaminação' — significa que não há evidência de troca de dono.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
