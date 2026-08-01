import type { Metadata } from "next";
import { PaginaLegal, Secao } from "@/components/legal/PaginaLegal";

export const metadata: Metadata = {
  title: "Termos de Serviço",
  description: "As regras de uso dos serviços e da plataforma da Dioli Digital.",
};

// O campo "URL dos Termos de Serviço" no painel da Meta apontava para
// facebook.com — o endereço de outra empresa. Isto aqui é o nosso.

const ul = "list-disc space-y-1.5 pl-5";

export default function TermosPage() {
  return (
    <PaginaLegal
      titulo="Termos de Serviço"
      resumo="As regras de uso da plataforma e dos serviços da Dioli Digital. Escrito para ser entendido, não para se proteger de você."
      atualizadoEm="1º de agosto de 2026"
    >
      <Secao titulo="O que oferecemos">
        <p>
          Serviços de marketing digital — estratégia, conteúdo, design, tráfego pago e análise de
          resultados — apoiados por uma plataforma própria onde você acompanha o projeto, recebe as
          entregas e aprova o que vai ao ar.
        </p>
      </Secao>

      <Secao titulo="Uso de inteligência artificial">
        <p>
          Parte do nosso trabalho é produzida com inteligência artificial. A gente considera isso uma
          vantagem e não esconde. O que garantimos:
        </p>
        <ul className={ul}>
          <li>Todo material passa por revisão automática de qualidade antes de chegar a você.</li>
          <li><strong>Nada é publicado sem a sua aprovação.</strong> Você é sempre quem decide.</li>
          <li>Quando falta um dado seu, a peça vem marcada como &ldquo;preciso confirmar&rdquo; — não preenchemos por chute.</li>
        </ul>
      </Secao>

      <Secao titulo="Suas responsabilidades">
        <ul className={ul}>
          <li>Fornecer informações verdadeiras sobre o seu negócio.</li>
          <li>Ter direito sobre os materiais que envia (logo, fotos, textos, música).</li>
          <li>Revisar e aprovar o que vai ao ar em nome da sua marca.</li>
          <li>Não usar nossos serviços para conteúdo ilegal, enganoso ou que viole as regras das plataformas.</li>
        </ul>
      </Secao>

      <Secao titulo="Contas conectadas">
        <p>
          Se você conectar Instagram, Facebook ou WhatsApp, autoriza a Dioli a publicar e responder em seu
          nome dentro do escopo contratado. Essa autorização pode ser revogada por você a qualquer momento,
          direto nas configurações da Meta ou pedindo pra gente — sem precisar de motivo.
        </p>
      </Secao>

      <Secao titulo="Propriedade do que produzimos">
        <p>
          O material entregue e aprovado é <strong>seu</strong>, para usar como quiser, inclusive depois do
          fim do contrato. A plataforma, o método e as ferramentas continuam nossos. Podemos exibir o
          trabalho em nosso portfólio — se você não quiser, é só avisar, e não exibimos.
        </p>
      </Secao>

      <Secao titulo="Pagamento e cancelamento">
        <p>
          Valores, escopo e prazos são os da proposta que você aprovou. Sem multa escondida: o cancelamento
          respeita o que já foi produzido no período em curso, e o trabalho entregue até ali continua seu.
        </p>
      </Secao>

      <Secao titulo="Limites do que podemos prometer">
        <p>
          A gente se compromete com o trabalho, não com resultado garantido. Alcance, engajamento e vendas
          dependem de fatores fora do nosso controle — algoritmo, mercado, concorrência e a operação do seu
          próprio negócio. Quem promete número certo em marketing está vendendo, não trabalhando.
        </p>
        <p>
          Também não respondemos por indisponibilidade das plataformas de terceiros (Meta, Google) nem por
          mudanças de regra que elas façam.
        </p>
      </Secao>

      <Secao titulo="Lei aplicável">
        <p>
          Estes termos seguem a lei brasileira. Qualquer questão será tratada no foro da comarca de São
          Paulo/SP — mas a nossa primeira via de solução é sempre uma conversa.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
