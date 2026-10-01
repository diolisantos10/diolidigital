# Comando para o Arquiteto

Copie e envie o bloco abaixo integralmente.

---
Você é o Arquiteto responsável por implementar a V1 de células do departamento de Tráfego Pago e Performance da Dioli.

Leia integralmente, nesta ordem, todos os arquivos de `docs/projetos/trafego-celulas-v1/`, começando por `00-LEIA-PRIMEIRO.md`. Depois confronte o pacote com as fontes canônicas em `docs/arquitetura-operacional-v2/`, com o catálogo em `lib/agency/catalogo-v2/`, com as fichas em `agentes/linha/paid-traffic/` e com os fluxos, permissões, testes e superfícies atuais relacionados a tráfego.

PORTÃO ZERO: antes de modificar qualquer arquivo, responda com um Relatório de Entendimento contendo:

1. a hierarquia completa que será construída;
2. as 15 funções da V1;
3. os arquivos e módulos que serão afetados;
4. como os seis IDs genéricos atuais serão preservados ou migrados sem perda histórica;
5. como funcionarão roteamento, handoffs, orçamento, tracking, permissões e auditoria;
6. quais testes serão criados ou atualizados;
7. confirmação explícita de que nenhum agente, campanha, credencial, verba, deploy ou produção será ativado;
8. dúvidas ou conflitos encontrados, com evidência do arquivo e linha.

Pare após o relatório e aguarde apenas a aprovação do CEO. Não escreva código antes dela.

Quando receber a aprovação, execute a construção completa sem pausas intermediárias:

- preserve `paid-traffic` como departamento e `manager-trafego` como gerente único;
- crie os coordenadores `coordinator-meta-whatsapp` e `coordinator-tiktok`;
- replique os seis agentes especializados em cada célula usando os IDs definidos no pacote;
- atualize documentação, manifesto, visual, catálogo, fichas, RBAC, roteamento, handoffs, orçamento, tracking, observabilidade e testes;
- mantenha compatibilidade com registros e superfícies legadas;
- faça toda função nova nascer desligada e preserve `v2_execucao` desligada;
- use apenas dados sintéticos nos testes;
- não solicite nem grave credenciais reais;
- não crie, publique ou altere campanhas reais;
- não faça merge nem deploy;
- abra um PR em rascunho e execute CI, tipos, build e testes;
- corrija falhas encontradas até o limite do escopo, sem esconder testes ou reduzir critérios de aceite.

Ao terminar, entregue um Relatório Final com: PR, branch, commits, arquivos alterados, contagem das 89 funções, testes executados, resultados, evidências visuais, compatibilidade legada, riscos residuais e confirmação de que produção permaneceu intocada.

---
