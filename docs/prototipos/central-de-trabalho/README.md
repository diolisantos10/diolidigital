# Central de Trabalho — contrato visual aprovado

Status: **aprovado para implementação** em 14/08/2026.

Referência navegável: https://dioli-central-de-trabalho.jaunty-hinny-1384.chatgpt.site

## O que esta pasta entrega

Esta é a fonte visual integral do mockup aprovado para o dashboard mestre interno da Dioli Digital. Ela inclui:

- dashboard comum a todos os agentes;
- visão global dos clientes para todos os departamentos;
- seletor de experiência por função;
- prioridades, métricas e fluxo individual;
- leitura multidisciplinar por cliente;
- mapa de departamentalização com o Project Manager como elo central;
- chat com o Project Manager;
- gaveta de panorama do cliente;
- comportamento responsivo;
- tipografia revisada para leitura confortável.

## Arquivos

- `app/page.tsx`: tela, dados demonstrativos e interações do protótipo;
- `app/globals.css`: contrato visual completo, incluindo a revisão de legibilidade aprovada;
- `app/layout.tsx`: metadados e estrutura raiz do protótipo;
- `public/brand/*`: assinaturas visuais usadas na interface;
- `package.json`: dependências da referência executável.

## Destino de implementação no produto

A tela oficial da plataforma vive em `/agency/dashboard`.

Ao integrar:

1. Preserve o `AgencyShell` e os controles de autenticação existentes.
2. Transplante a composição visual e a hierarquia deste protótipo para o dashboard oficial.
3. Substitua os dados demonstrativos por dados reais do store, banco e permissões atuais.
4. Não duplique sidebar, topbar ou autenticação.
5. Todos os agentes podem visualizar o panorama geral de todos os clientes.
6. Edição e execução continuam limitadas ao departamento e à função do agente.
7. Master e Diretor mantêm visão e ação amplas.
8. O Project Manager distribui, conecta e resolve dependências entre departamentos.
9. Não reduzir novamente as fontes de apoio: a revisão em `globals.css` é parte da aprovação.

## Decisões de linguagem

- Chamar as funções operacionais de **agentes**.
- Não enfatizar inteligência artificial na interface.
- Usar linguagem clara para perfis que vão de um pequeno empresário a um gerente de marketing.
- Tratar cliente como cliente; projeto é uma iniciativa específica dentro do cliente.

## Critério de aceite

A implementação é aceita quando reproduz fielmente a aparência e as interações da referência, mantém a tipografia ampliada, usa dados reais e respeita o controle de acesso por função sem retirar a leitura global de clientes.
