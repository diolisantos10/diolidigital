# Duas tabelas de preço vivas — e o cliente foi cotado na que não está no site

> Achado do cliente oculto em PRODUÇÃO, 26/08/2026. **Não consertado: é decisão
> de preço, e preço é do CEO.**

## O que aconteceu, na ordem

1. O cliente oculto (CANTINA DO PORTO TESTE, contato `.invalid`) entrou pela
   porta pública, conversou com o SDR e entregou briefing pedindo **8 posts por
   mês**.
2. A casa devolveu a proposta, no portal dele, pedido
   `cmt9exi95001f0xo74bhonn77`:

   > "Plano Essencial — 2 posts/semana · **R$ 590 por mês**"

3. No mesmo minuto, `https://www.diolidigital.com.br/planos` (HTTP 200,
   119.413 bytes) mostrava **cinco** degraus, e dizia "Cinco degraus" no
   subtítulo:

   | plano na página pública | preço |
   |---|---|
   | Pulso | R$ 49/mês |
   | Ritmo | R$ 297/mês |
   | Presença | R$ 790/mês |
   | Conteúdo | R$ 1.390/mês |
   | Crescimento | R$ 2.590/mês |

**"Plano Essencial" e "R$ 590" não existem em lugar nenhum da página que o
cliente acabou de ler.**

## As duas tabelas, com caminho

| | arquivo | planos |
|---|---|---|
| página pública `/planos` | `lib/agency/planos.ts` | Pulso 49 · Ritmo 297 · Presença 790 · Conteúdo 1.390 · Crescimento 2.590 |
| proposta automática | `lib/agency/live-calculator.ts` | Essencial 590 · Crescimento 990 · Completo 1.790 |

E **"Crescimento" está nas duas**, a R$ 990 de um lado e R$ 2.590 do outro —
2,6× de diferença no mesmo nome.

## Por que isto é grave, nas palavras da própria casa

`lib/agency/planos.ts`, primeira linha:

> "OS PLANOS DA CASA — fonte única. (...) Esta lista é a fonte da página pública
> `/planos` **e de qualquer proposta que a esteira emitir**. Preço de plano
> escrito em dois lugares vira dois preços diferentes na semana em que um deles
> muda — e o cliente sempre acha o menor."

Ela não é a fonte da proposta. Quem cotou foi o outro arquivo.

E a decisão do Diretor Geral de 24/08/2026, citada em
`lib/agency/esteira/caminho-automatico.ts`:

> "A tabela do site é a única viva (decisão do Diretor Geral, 24/08/2026 — duas
> tabelas vivas cobram errado de alguém)."

**A decisão foi tomada e as duas tabelas continuam vivas.**

## O que NÃO foi feito, e por quê

Nada foi consertado no preço. Trocar os números de um arquivo pelos do outro
muda, sozinho, quanto a casa cobra de todo mundo — é decisão do CEO, não
dedução de auditor. O que foi feito: uma nota cruzada nos DOIS arquivos, para
que ninguém edite um sem ver o outro.

## A pergunta que o CEO precisa responder

**Qual das duas tabelas é a real?** Depois disso, a outra sai do ar — e a que
ficar passa a ser lida pelos dois caminhos, de um lugar só.
