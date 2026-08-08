-- A máquina de conformidade entra no caminho que a TELA usa (08/08/2026).
--
-- Até aqui a proposta que o operador copiava em /agency/oportunidades não
-- passava pelo Compliance Validator, não aplicava o piso do Pricing Engine e
-- não contava conexão: os três existiam em lib/marketplaces/, verdes em teste,
-- e nenhum era chamado pelo app. Estas quatro colunas são o que a tela precisa
-- para mostrar o julgamento em vez de mostrar um texto limpo por fora.
--
-- Só ADD COLUMN, e todas anuláveis. Nada é reescrito, nada é apagado, nenhuma
-- tabela é reconstruída: linha antiga fica com NULL, que aqui quer dizer
-- "ninguém julgou esta" — e é verdade, não é zero.

-- NULL = ninguém julgou. FALSE = julgou e REPROVOU (e `propostaTexto` fica NULL
-- de propósito: proposta barrada não pode ficar copiável).
ALTER TABLE "Oportunidade" ADD COLUMN "conformidadeOk" BOOLEAN;

-- Os motivos, em JSON `[{regra,trecho,fonte}]`. Guardar só "reprovou" obrigaria
-- o operador a adivinhar o quê — e adivinhar num texto que ele ia mandar ao
-- cliente.
ALTER TABLE "Oportunidade" ADD COLUMN "conformidadeAchados" TEXT;

-- TRUE quando o rascunho do modelo trazia link ou contato e o código tirou.
-- Reincidência do gerador é o sinal que antecede a conta banida; apagar o erro
-- sem contar é justamente esconder esse sinal.
ALTER TABLE "Oportunidade" ADD COLUMN "propostaHigienizada" BOOLEAN;

-- O retorno inteiro do Pricing Engine em JSON: piso da casa, piso da categoria
-- da plataforma, qual venceu, taxa e a oferta final que o cliente vê.
ALTER TABLE "Oportunidade" ADD COLUMN "precoDetalhe" TEXT;
