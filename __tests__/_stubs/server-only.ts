// `server-only` é um pacote que o Next resolve por condição de exportação: no
// bundle do navegador ele lança, no servidor ele é vazio. Fora do Next — que é
// onde o vitest roda — ele simplesmente não existe em `node_modules`, e
// qualquer arquivo que o importe fica INTESTÁVEL.
//
// Isso importa aqui porque `lib/agency/organizacao/guarda.ts` marca-se como
// server-only DE PROPÓSITO (é a camada que decide acesso; ela não pode vazar
// para o navegador) e é exatamente o que os testes negativos precisam exercitar.
// Sem este apelido, a escolha certa de segurança custaria o teste dela mesma.
export {};
