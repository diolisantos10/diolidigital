// Porta do menu de 9 itens (CEO, 03 e 04/10/2026). Ver lib/agency/menu/menu-principal.ts.
import PaginaIndiceDoMenu from "@/components/agency/layout/PaginaIndiceDoMenu";

export const dynamic = "force-dynamic";

export default function Page() {
  return <PaginaIndiceDoMenu href="/agency/conversas" subtitulo="Mensagens dos clientes e do WhatsApp da agência." />;
}
