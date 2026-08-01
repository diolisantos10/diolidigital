import type { Metadata } from "next";
import { PaginaLegal, Secao } from "@/components/legal/PaginaLegal";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como a Dioli Digital coleta, usa e protege os dados de quem usa nossos serviços.",
};

// Esta página não é enfeite: é o endereço que a Meta exige para aprovar o app
// (App Review) e o que a LGPD exige de qualquer negócio que trate dado pessoal.
// O conteúdo descreve o que o sistema REALMENTE faz — conferido contra o schema
// do banco. Política que promete o que o código não cumpre é pior que nenhuma.

const ul = "list-disc space-y-1.5 pl-5";

export default function PrivacidadePage() {
  return (
    <PaginaLegal
      titulo="Política de Privacidade"
      resumo="O que a gente coleta, por que coleta, com quem compartilha e como você pede para apagar. Em português claro, sem letra miúda."
      atualizadoEm="1º de agosto de 2026"
    >
      <Secao titulo="Quem somos">
        <p>
          Dioli Digital Studio é uma agência de marketing digital. Este documento vale para o nosso site,
          o formulário de briefing, o portal do cliente e o painel interno da agência — tudo em
          diolidigital.com.br. Contato: agenciadioli@gmail.com.
        </p>
      </Secao>

      <Secao titulo="Que dados a gente coleta">
        <p>Só o necessário para atender você. Na prática:</p>
        <ul className={ul}>
          <li><strong>Quando você pede um orçamento:</strong> nome, e-mail, telefone/WhatsApp, nome e segmento do negócio, e o que você nos conta sobre ele (objetivos, serviços desejados, orçamento).</li>
          <li><strong>Quando vira cliente:</strong> os materiais que você envia (logo, cores, fotos, textos), o histórico do projeto e as conversas trocadas no portal.</li>
          <li><strong>Se você conectar Instagram, Facebook ou WhatsApp:</strong> o identificador da conta, o nome de exibição e um token de acesso que a Meta nos entrega. Guardamos o token <strong>criptografado</strong>. Nunca temos e nunca pedimos a sua senha.</li>
          <li><strong>Mensagens de WhatsApp</strong> trocadas com a agência pelo número oficial, para que a conversa não se perca entre atendimentos.</li>
          <li><strong>Dados técnicos mínimos</strong> de acesso, para manter o serviço no ar e seguro.</li>
        </ul>
        <p>
          A gente <strong>não</strong> coleta dado sensível (saúde, religião, opinião política, biometria) e
          <strong> não</strong> vende dado para ninguém, em nenhuma hipótese.
        </p>
      </Secao>

      <Secao titulo="Por que a gente usa esses dados">
        <ul className={ul}>
          <li>Montar sua proposta e executar o trabalho contratado.</li>
          <li>Produzir e publicar conteúdo em seu nome, quando você autoriza.</li>
          <li>Falar com você sobre o andamento do projeto.</li>
          <li>Cumprir obrigações fiscais e legais.</li>
        </ul>
        <p>
          A base legal é a execução do contrato entre nós e, quando não há contrato ainda, o seu
          consentimento ao enviar o formulário — que você pode retirar quando quiser.
        </p>
      </Secao>

      <Secao titulo="Inteligência artificial">
        <p>
          A gente usa inteligência artificial para produzir parte do trabalho (planejamento de conteúdo,
          textos, conceitos visuais, planos de campanha). Para isso, o contexto do seu negócio é enviado
          aos provedores de IA que operam nossa produção. Três compromissos:
        </p>
        <ul className={ul}>
          <li>Não enviamos senhas, tokens nem dados de pagamento para nenhum provedor de IA.</li>
          <li>Usamos contas corporativas cujos termos <strong>não permitem</strong> treinar modelos com o que enviamos.</li>
          <li>Todo material produzido passa por revisão automática de qualidade antes de chegar a você — e você decide o que é aprovado.</li>
        </ul>
      </Secao>

      <Secao titulo="Com quem compartilhamos">
        <p>Apenas com quem é necessário para o serviço funcionar:</p>
        <ul className={ul}>
          <li><strong>Meta</strong> (Instagram, Facebook, WhatsApp) — quando você conecta suas contas e autoriza publicação ou atendimento.</li>
          <li><strong>Provedores de IA</strong> — para produzir o material, como explicado acima.</li>
          <li><strong>Infraestrutura</strong> — o serviço que hospeda o sistema e o banco de dados.</li>
          <li><strong>Autoridades</strong> — só mediante obrigação legal.</li>
        </ul>
      </Secao>

      <Secao titulo="Por quanto tempo guardamos">
        <p>
          Enquanto durar a relação, e por até 5 anos depois do fim do contrato, para atender prazos
          legais e fiscais. Passado isso, os dados são apagados. Você pode pedir a exclusão antes disso —
          veja a seção seguinte.
        </p>
      </Secao>

      <Secao titulo="Seus direitos (LGPD)">
        <p>
          Você pode, a qualquer momento: confirmar se tratamos seus dados, acessá-los, corrigi-los, pedir
          cópia, pedir a exclusão, revogar consentimento e saber com quem compartilhamos. Basta escrever
          para <a className="font-medium text-[var(--navy)] underline" href="mailto:agenciadioli@gmail.com">agenciadioli@gmail.com</a>.
          Respondemos em até 15 dias, sem custo. Para excluir dados vindos da Meta, veja a
          página de <a className="font-medium text-[var(--navy)] underline" href="/exclusao-de-dados">exclusão de dados</a>.
        </p>
      </Secao>

      <Secao titulo="Segurança">
        <p>
          Senhas são guardadas com hash, nunca em texto puro. Tokens de acesso e chaves de integração são
          criptografados no banco (AES-256-GCM). O acesso ao painel é controlado por perfil, e o portal do
          cliente usa link com token próprio, revogável. Nenhum sistema é 100% seguro — se um incidente
          afetar seus dados, avisamos você e a ANPD, como manda a lei.
        </p>
      </Secao>

      <Secao titulo="Mudanças nesta política">
        <p>
          Se mudarmos algo relevante, atualizamos a data no topo e avisamos os clientes ativos pelo portal.
          A versão publicada aqui é sempre a que vale.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
