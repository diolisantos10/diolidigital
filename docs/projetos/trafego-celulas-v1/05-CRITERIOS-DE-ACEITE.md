# Critérios de Aceite

A construção só pode ser considerada pronta quando todos os itens abaixo estiverem comprovados.

## Catálogo

- [ ] Tráfego Pago possui exatamente 15 funções canônicas na V1.
- [ ] Existe um único `manager-trafego`.
- [ ] Existem dois coordenadores: Meta/WhatsApp e TikTok.
- [ ] Cada coordenador possui os seis agentes especializados previstos.
- [ ] O catálogo total reflete 89 funções, sem duplicidade de ID.
- [ ] IDs genéricos antigos têm estratégia explícita de compatibilidade.

## Hierarquia e permissões

- [ ] Agentes reportam à própria célula.
- [ ] Coordenadores reportam ao Gerente de Tráfego.
- [ ] Gerente de Tráfego reporta ao Gerente Geral/PM.
- [ ] Um coordenador não escreve na outra célula sem permissão registrada.
- [ ] Todos os papéis seguem negação por padrão.
- [ ] Master e Diretor preservam acesso integral.

## Operação

- [ ] Demanda sem plataforma definida não é roteada por suposição.
- [ ] Handoff sem aceite permanece na fila anterior.
- [ ] Verba é controlada por célula e consolidada pelo gerente.
- [ ] Redistribuição entre células deixa auditoria.
- [ ] Tracking por plataforma respeita o contrato transversal de eventos.
- [ ] Recomendações criativas chegam aos departamentos responsáveis via PM.

## Segurança

- [ ] Todas as funções novas nascem desligadas.
- [ ] Nenhuma campanha real, verba ou credencial é usada nos testes.
- [ ] Golden set possui casos normal, recusa e escalada para todas as funções.
- [ ] CI, tipos, build e testes ficam verdes.
- [ ] Nenhum merge ou deploy ocorre sem revisão humana.

## Evidências exigidas no PR

- [ ] diagrama atualizado;
- [ ] lista de arquivos modificados;
- [ ] contagem automática das funções;
- [ ] relatório dos testes;
- [ ] prova de compatibilidade dos IDs legados;
- [ ] screenshots das superfícies internas alteradas;
- [ ] declaração de que produção e campanhas reais permaneceram intocadas.
