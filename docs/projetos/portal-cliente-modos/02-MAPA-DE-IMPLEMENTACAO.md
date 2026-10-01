# Mapa de implementacao no repositorio

## Arquivos atuais confirmados

| Arquivo | Papel atual | Mudanca esperada |
| --- | --- | --- |
| `app/portal/access/[token]/page.tsx` | Compoe o portal e as onze abas | Introduzir modo de apresentacao e composicao Basica sem duplicar fetches ou regras de dominio |
| `app/portal/portal-cliente.css` | Folha visual do portal | Criar tokens legiveis e estilos isolados para switch e Basico; preservar Avancado |
| `app/portal/layout.tsx` | Carrega a folha do segmento | Nao precisa mudar salvo necessidade comprovada |
| `lib/agency/portal/vista-do-cliente.ts` | Fronteira segura de dados externos | Preservar; modo nao pode furar a allowlist |
| `components/portal/AprovacoesDoCliente.tsx` | Fluxo real de aprovacao | Reutilizar nos dois modos |
| `components/portal/cliente/MateriaisDaMarca.tsx` | Brand Book, logo e assets | Reutilizar no Basico em Materiais |
| `components/portal/ConexoesDoCliente.tsx` | Integracoes | Resumir no Basico quando houver acao; manter completo no Avancado |
| `components/brand/DioliLogo.tsx` | Carrega os SVGs oficiais | Usar no cabecalho; eliminar marca em texto |
| `public/brand/dioli-*.svg` | Assets de runtime | Validar contra o asset mestre antes do merge |

## Sequencia de obra

### Etapa 0 - leitura e prova de entendimento

Antes de escrever codigo, o arquiteto responde:

1. por que nao serao criados dois portais;
2. onde a preferencia de modo sera salva;
3. quais componentes de dominio serao reutilizados;
4. como a fronteira `VistaDoCliente` sera preservada;
5. qual asset de logo sera a fonte oficial.

Nenhum codigo antes da validacao dessa resposta pelo diretor.

### Etapa 1 - fundacao

- Criar tipo `PortalViewMode = "basic" | "advanced"`.
- Criar componente controlado de switch com `aria-pressed` ou semantica equivalente.
- Implementar leitura segura da preferencia e fallback para `basic`.
- Manter os fetches atuais em um unico nivel pai.

### Etapa 2 - composicao Basica

- Criar componentes apenas de apresentacao para Resumo, Frentes, Pendencias e Proximos Passos.
- Reusar os componentes de dominio nas acoes.
- Limitar o primeiro impacto a tres indicadores.
- Implementar estados vazios honestos.

### Etapa 3 - preservar o Avancado

- Extrair a composicao atual sem alterar comportamento.
- Manter as onze abas, setas laterais, deep links e compatibilidade de URLs antigas.
- Garantir que a troca de modo nao apague a intencao do usuario.

### Etapa 4 - logos

- Substituir `<i aria-hidden>O°</i>` por `DioliLogo` com asset aprovado.
- Nao desenhar os circulos em CSS ou fonte.
- Revisar cabecalho interno, portal, login, e-mails e qualquer superficie que use marca.
- Registrar em tabela cada ocorrencia encontrada, asset anterior e asset final.

### Etapa 5 - testes

Manter toda a suite existente e acrescentar testes para:

- Basico como padrao;
- alternancia e persistencia;
- mesmo objeto de aprovacao nos dois modos;
- ausencia de dado interno;
- deep link para aprovacao;
- upload de Brand Book, logo e assets;
- logo carregada por arquivo, nunca texto;
- navegacao por teclado;
- layout a 375, 768, 1280 e 1440 px.

## Nao fazer

- Nao criar `/portal-basic` e `/portal-advanced`.
- Nao copiar endpoints.
- Nao salvar modo por cliente inteiro.
- Nao esconder informacao interna apenas com CSS.
- Nao copiar numeros do prototipo.
- Nao trocar a identidade Dioli por aproximacao visual.
- Nao fazer merge se a auditoria de logos estiver sem fonte mestre definida.

## Definicao de pronto

Codigo implementado, suite completa verde, build de producao verde, auditoria de logo anexada ao PR, teste manual nos quatro breakpoints e demonstracao gravada dos dois modos usando o mesmo acesso de cliente.
