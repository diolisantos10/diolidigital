# Critérios de Aceite e Testes

## Condições de aprovação

- [ ] Existe um único catálogo importável de 12 departamentos.
- [ ] Todo agente pertence a um departamento e possui capacidades declaradas.
- [ ] Todos os papéis e permissões são negados por padrão.
- [ ] Master/Diretor acessam todas as páginas existentes.
- [ ] Toda equipe interna visualiza o overview de todos os clientes.
- [ ] Cada departamento edita apenas sua área.
- [ ] PM coordena handoffs e comunicação externa.
- [ ] Cliente acessa apenas sua organização.
- [ ] Portal e painel interno usam a mesma verdade de estado.
- [ ] Aprovar, ajustar, recusar/refazer e cancelar estão implementados.
- [ ] Toda transição e override possuem audit log.
- [ ] Nenhum efeito externo depende de execução única sem fila/retentativa.
- [ ] Existe recovery manual idempotente e detector de processos parados.
- [ ] Migração possui rollback executado em ambiente de teste.

## Cenários obrigatórios

1. Duas aprovações simultâneas da mesma direção não duplicam produção.
2. Scheduler roda duas vezes e não duplica tarefa, entrega ou mensagem.
3. Scheduler fica indisponível e retoma pendências ao voltar.
4. Material chega depois do bloqueio e libera apenas tarefas dependentes.
5. Integração externa falha depois da persistência e é reprocessada.
6. Qualidade reprova e o trabalho volta ao agente correto, com motivo.
7. Auditor fica indisponível e o trabalho não é tratado como aprovado.
8. Cliente tenta aprovar pacote vazio ou parcial indevido e é impedido.
9. Cliente pede ajuste, recusa/refaz e cancela; versões permanecem íntegras.
10. Usuário tenta editar outro departamento pela API e recebe negação.
11. Usuário tenta acessar outro cliente alterando URL/ID e recebe negação.
12. Ciclo mensal fecha e abre o seguinte sem reproduzir entrega anterior.
13. Duas mensagens iguais de cobrança não são enviadas.
14. Mudança de escopo exige registro e autorização.
15. Rollback restaura operação sem perda de vínculo.

## Metas de segurança

- zero duplicação em 100 execuções repetidas dos mesmos eventos;
- zero escrita não autorizada nos testes RBAC;
- 100% das transições auditadas;
- 100% dos bloqueios com dono e próxima ação;
- 100% das falhas externas recuperáveis ou encaminhadas à dead-letter queue;
- nenhuma tarefa parada além do SLA sem alerta ao PM;
- divergência zero entre estado mostrado ao cliente e estado interno equivalente.

## Validação de qualidade

A construção não termina ao “abrir a tela”. O marco só é concluído quando código, teste, observabilidade, migração e documentação estão juntos.
