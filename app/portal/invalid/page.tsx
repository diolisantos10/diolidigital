// ─── /portal/invalid — A ROTA QUE NÃO EXISTIA ────────────────────────────────
//
// `app/portal/access/route.ts:40` manda para cá quem abre `/portal/access` sem
// token. Até 29/08/2026 esta página **não existia**: o redirecionamento (307)
// caía no 404 padrão do Next — *"404 · This page could not be found."*, em
// inglês, sem marca, sem uma palavra em português e sem caminho de volta.
// Medido ao vivo, no celular, antes de existir este arquivo:
//
//     curl -o /dev/null -w '%{http_code} -> %{redirect_url}' /portal/access
//     307 -> http://localhost:3000/portal/invalid
//     curl /portal/invalid  →  HTTP 404
//
// Quem chega aqui é quase sempre um cliente pagante que clicou num link
// cortado pelo aplicativo de e-mail. Ele não pode concluir que a agência sumiu.
//
// A página é ESTÁTICA de propósito: sem token, não há nada para consultar, e
// pedir dado ao servidor só adicionaria uma espera antes de uma frase que já
// está pronta. O conteúdo inteiro mora em `AcessoBloqueado`, o mesmo componente
// que o portão do portal usa — duas telas de acesso bloqueado com dois desenhos
// diferentes seriam a mesma notícia contada de dois jeitos.

import type { Metadata } from "next";
import { AcessoBloqueado } from "@/components/portal/cliente/AcessoBloqueado";

export const metadata: Metadata = {
  title: "Este endereço não abre o seu portal · Dioli",
  description: "O link do portal chegou incompleto. Veja como receber um link novo.",
  // Tela de erro não é conteúdo para busca — e um portal de cliente não é
  // conteúdo público em hipótese nenhuma.
  robots: { index: false, follow: false },
};

export default function PortalInvalido() {
  return <AcessoBloqueado motivo="sem-link" contexto="entrada" />;
}
