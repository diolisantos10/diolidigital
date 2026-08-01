import type { Metadata } from "next";
import { PaginaLegal, Secao } from "@/components/legal/PaginaLegal";

export const metadata: Metadata = {
  title: "Exclusão de dados",
  description: "Como pedir a exclusão dos seus dados da Dioli Digital, incluindo dados vindos da Meta.",
};

// A Meta exige uma URL de instruções de exclusão de dados para aprovar o app.
// A do painel apontava para facebook.com — um endereço que não é nosso e não
// explica nada. Isto aqui é o endereço de verdade.

const ul = "list-disc space-y-1.5 pl-5";

export default function ExclusaoDeDadosPage() {
  return (
    <PaginaLegal
      titulo="Exclusão de dados"
      resumo="Como pedir para apagarmos seus dados — inclusive os que vieram do Instagram, Facebook ou WhatsApp. Sem formulário complicado e sem custo."
      atualizadoEm="1º de agosto de 2026"
    >
      <Secao titulo="Como pedir">
        <p>
          Escreva para{" "}
          <a className="font-medium text-[var(--navy)] underline" href="mailto:agenciadioli@gmail.com?subject=Exclus%C3%A3o%20de%20dados">
            agenciadioli@gmail.com
          </a>{" "}
          com o assunto <strong>&ldquo;Exclusão de dados&rdquo;</strong>, informando o e-mail ou telefone que
          você usou com a gente. Só isso. Não precisa justificar.
        </p>
        <p>
          Confirmamos o recebimento e concluímos em <strong>até 15 dias</strong>. Se algo impedir a exclusão
          imediata — uma obrigação fiscal, por exemplo — explicamos exatamente o quê, por quanto tempo e
          o que foi apagado enquanto isso.
        </p>
      </Secao>

      <Secao titulo="O que é apagado">
        <ul className={ul}>
          <li>Seus dados de contato e os do seu negócio.</li>
          <li>Briefings, propostas, projetos, tarefas e entregas.</li>
          <li>Conversas do portal e histórico de mensagens de WhatsApp com a agência.</li>
          <li>Materiais que você enviou (logo, cores, fotos, textos).</li>
          <li>Os tokens de acesso das suas contas conectadas da Meta.</li>
        </ul>
      </Secao>

      <Secao titulo="Sobre as contas do Instagram, Facebook e WhatsApp">
        <p>
          Quando você conecta uma conta, a Meta nos entrega um <strong>token de acesso</strong>, que fica
          criptografado no nosso banco. Ao excluir seus dados, esse token é apagado e a conexão deixa de
          existir do nosso lado.
        </p>
        <p>
          Duas coisas importantes, para não haver surpresa:
        </p>
        <ul className={ul}>
          <li>
            <strong>Suas contas e publicações não são apagadas.</strong> Elas são suas e ficam na Meta. O que
            some é a nossa autorização de acessá-las.
          </li>
          <li>
            <strong>Você pode revogar por conta própria, sem falar com a gente:</strong> em
            {" "}Facebook → Configurações → Aplicativos e sites, remova &ldquo;Dioli Digital Studio&rdquo;. A
            conexão cai na hora.
          </li>
        </ul>
      </Secao>

      <Secao titulo="O que pode ser mantido, e por quê">
        <p>
          Notas fiscais e registros contábeis são guardados pelo prazo que a lei brasileira exige, mesmo
          após o pedido de exclusão. É a única exceção, ela é legal e não a usamos para mais nada.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
