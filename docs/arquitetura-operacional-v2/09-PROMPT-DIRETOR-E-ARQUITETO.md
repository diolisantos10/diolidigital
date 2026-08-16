# Prompt para o Diretor Delegar ao Arquiteto

Copie e envie exatamente o bloco abaixo.

---

Você recebeu a pasta `docs/arquitetura-operacional-v2`, fonte de verdade da nova departamentalização e esteira operacional da Dioli Agency OS.

Neste primeiro momento, **não programe, não altere banco, não crie páginas e não modifique permissões**.

Sua primeira tarefa é executar integralmente o `08-PORTAO-ZERO-LEITURA.md`. Leia todos os arquivos na ordem indicada pelo `00-README.md`, examine a esteira original em `source/` e o manifesto canônico.

Depois, crie `RELATORIO-DE-ENTENDIMENTO.md` com:

- sua explicação do modelo ponta a ponta;
- a função dos 12 departamentos e seus agentes;
- o papel do Project Manager;
- os handoffs, estados, aprovações, recusas, bloqueios e recuperações;
- o modelo de permissões;
- os conflitos encontrados no sistema atual;
- o mapeamento preliminar do legado para a V2;
- o plano de construção e rollback;
- dúvidas, riscos e decisões que dependem do CEO.

Não presuma que o código atual é a fonte de verdade. O objetivo é substituir estruturas conflitantes por um catálogo canônico, uma máquina de estados e uma política de acesso. Não crie uma terceira estrutura paralela.

Após entregar o relatório, aguarde a frase explícita do CEO: **“Entendimento aprovado. Pode iniciar o Marco 1.”** Somente então siga o `10-BACKLOG-DE-CONSTRUCAO.md`.

Durante a implementação:

- preserve dados e use migração aditiva;
- aplique permissão no servidor, não apenas na interface;
- garanta idempotência, auditoria, retentativa e recuperação;
- mantenha portal e painel interno na mesma verdade;
- execute todos os cenários de `07-CRITERIOS-DE-ACEITE.md`;
- apresente evidências ao final de cada marco antes de avançar.

O trabalho não está concluído quando a tela parece correta; está concluído quando fluxo, dados, permissões, falhas, testes, observabilidade e rollback funcionam juntos.

---
