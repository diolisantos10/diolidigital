// Dublê da escada de exposição para os testes que NÃO são sobre ela.
//
// Existe para não deixar a escada ser "mockada de qualquer jeito": um
// `findMany: vi.fn()` solto devolve `undefined`, `garantirEscada` estoura, o
// filtro cai no fail-closed e o teste fica vermelho por um motivo que não é o
// dele. Aqui a escada é a de VERDADE — só os dados vêm prontos, com o
// departamento no degrau que aquele teste está afirmando.

// Importa de `degraus` (puro) e NUNCA de `registro`: aquele arrasta o cliente
// do banco, e num arquivo de teste que dubla `@/lib/db/client` isso produz um
// "Cannot access 'db' before initialization" que não tem nada a ver com o teste.
import { departamentosDaCasa, type Degrau } from "@/lib/agency/escada/degraus";

/** Todas as casas num degrau só. Use `wide` quando o teste é sobre outra coisa
 *  e a entrega LEGÍTIMA precisa atravessar sem atrito. */
export function escadaToda(degrau: Degrau, clientes: string[] = []) {
  return departamentosDaCasa().map((departmentId) => ({
    departmentId, degrau, clientesLiberados: JSON.stringify(clientes),
  }));
}
