# Permissões e Acessos

## Regra geral

Permissão deve ser aplicada em quatro camadas: navegação, componente, API/action e consulta/mutação no servidor. Esconder botão não é controle de acesso.

## Papéis estruturais

| Papel | Visualização | Edição |
|---|---|---|
| Master/CEO | tudo | tudo |
| Diretor | tudo | tudo, exceto segredos reservados ao Master |
| Project Manager | todos os clientes e departamentos | projetos, tarefas, handoffs, comunicação e aprovações operacionais |
| Membro de departamento | overview de todos os clientes | somente dados, tarefas e entregas do próprio departamento |
| Qualidade | entregas e referências necessárias | pareceres, gates e devoluções; não altera criação silenciosamente |
| Financeiro | contratos e dados financeiros necessários | preço, proposta, cobrança e margem |
| Operações/Sistemas | saúde técnica e integrações | integrações, credenciais, recovery e incidentes |
| Produto & Tecnologia | todos os clientes e contexto aprovado das áreas | interfaces, APIs, arquitetura, componentes e código da plataforma |
| Cliente | apenas sua organização | solicitações, materiais, aprovações, integrações e conta conforme regra do portal |

## Clientes para toda a equipe interna

Todos os departamentos podem consultar:

- ficha técnica e contatos;
- briefing aprovado;
- visão geral e momento da marca;
- resultados consolidados;
- projetos, prazos e marcos;
- atividade dos departamentos;
- Brand Hub e regras aprovadas;
- integrações por status, sem exibir segredos.

Somente o departamento responsável edita seu conteúdo. Dados sensíveis de preço, margem, contrato, credencial e pessoas respeitam escopo próprio.

## Matriz resumida

| Área | Master/Diretor | PM | Próprio departamento | Outros departamentos | Cliente |
|---|---:|---:|---:|---:|---:|
| Overview do cliente | editar | editar operação | visualizar | visualizar | visualizar próprio |
| Estratégia | editar | coordenar | editar | visualizar | visualizar aprovado |
| Brand Hub | editar | coordenar lacunas | Branding edita | visualizar | responder/enviar materiais |
| Social | editar | coordenar | Social edita | visualizar | visualizar/aprovar |
| Design | editar | coordenar | Design edita | visualizar | visualizar/aprovar |
| Produto & Tecnologia | editar | coordenar por OS | Produto & Tecnologia edita código e especificações | visualizar contexto | não acessa ferramentas internas |
| Tráfego | editar | coordenar | Tráfego edita | visualizar | visualizar resultados |
| Analytics | editar | coordenar | Analytics edita | visualizar | visualizar resultados |
| Qualidade | editar/override | visualizar status | Qualidade decide | visualizar parecer | não vê parecer interno sensível |
| Financeiro | editar | visualizar escopo | Financeiro edita | sem margem | contratos/faturas próprias |
| Integrações | editar técnico | visualizar/cobrar | Operações monitora | status | cliente conecta/desconecta |

Produto & Tecnologia não ganha permissão para editar conteúdo de Branding, Social, Design ou Tráfego. A área consulta o contexto necessário e escreve somente nos artefatos técnicos da plataforma. No painel do cliente, permanece em modo de leitura.

## Requisitos técnicos

- `department_id`, `role_id`, `organization_id` e `client_scope` devem ser verificados no servidor.
- Negar por padrão: capacidade não declarada não é permitida.
- Toda mutação sensível gera audit log.
- Tokens e credenciais nunca aparecem no overview.
- Impersonação exige Master/Diretor, motivo e registro.
- Agente de IA recebe apenas o contexto mínimo para sua tarefa.
