// oportunidade-ganha.ts — TRABALHO GANHO VIRA CLIENTE NA BASE (raio-x de
// 03/10, aplicado em 04/10/2026 por ordem do CEO).
//
// Antes: a oportunidade ia até "enviada" e parava ali. Ganhou o trabalho, e
// alguém tinha de lembrar de cadastrar o cliente à mão — o que some é a
// ligação entre a proposta e a conta.
//
// Agora: marcar "ganha" cria o Client (uma vez só — idempotente pelo
// `clienteId` gravado na oportunidade) e devolve o id. Nada de inventar dado:
// nome = título do trabalho (editável depois), descrição = a da oportunidade,
// sem e-mail/telefone (a plataforma não entrega contato; isso vira pergunta).

import { prisma } from "@/lib/db/client";

const NOME_MAX = 80;

export async function clienteDaOportunidadeGanha(
  workspaceId: string,
  oportunidadeId: string,
): Promise<{ ok: true; clienteId: string; criado: boolean } | { ok: false; motivo: string }> {
  const op = await prisma.oportunidade.findFirst({
    where: { id: oportunidadeId, workspaceId },
    select: { titulo: true, descricao: true, clienteId: true, plataforma: true },
  });
  if (!op) return { ok: false, motivo: "oportunidade não encontrada" };

  if (op.clienteId) {
    const existe = await prisma.client.findFirst({ where: { id: op.clienteId, workspaceId }, select: { id: true } });
    if (existe) return { ok: true, clienteId: existe.id, criado: false };
  }

  const nome = (op.titulo || "Cliente da oportunidade").trim().slice(0, NOME_MAX);
  const cliente = await prisma.client.create({
    data: {
      workspaceId,
      name: nome,
      descricao: `Trabalho ganho em ${op.plataforma}. ${op.descricao ?? ""}`.trim().slice(0, 2000),
      status: "active",
      tipo: "cliente",
    },
    select: { id: true },
  });
  await prisma.oportunidade.updateMany({ where: { id: oportunidadeId, workspaceId }, data: { clienteId: cliente.id } });
  return { ok: true, clienteId: cliente.id, criado: true };
}
