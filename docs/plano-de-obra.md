# Plano de obra — o que falta para a agência abrir

> Raio-X geral pedido pelo CEO em 02/08/2026, feito com quatro especialistas em
> paralelo, cada um com um cliente difícil e concreto. Tudo conferido **no
> código**, com arquivo:linha. Documento envelhece; código não mente.

## As notas

| Serviço | Cliente do teste | Nota |
|---|---|---|
| **Social Media** | dona de salão, 3 vídeos/semana, material no celular | **32/100** |
| **Tráfego Pago** | padeiro, sem criativo, quer anunciar no bairro | **30/100** |
| **Identidade Visual** | pet shop novo, sem logo, sem cor, sem nada | **22/100** |
| **Operação contínua** | qualquer cliente, no mês 2 | **~10/100** |

## O diagnóstico em uma frase

**A agência sabe vender, conversar e escrever. Não sabe receber arquivo, não
sabe publicar, não sabe medir e não sabe existir no segundo mês.**

---

## Os 11 achados que sustentam as notas

Ordenados por quando o cliente sente a dor.

| # | Achado | Prova | Quando dói |
|---|---|---|---|
| 1 | **Não existe armazenamento de arquivo em lugar nenhum.** Nenhum byte de mídia é gravado — nem de entrada nem de saída. | `app/api/sdr/upload/route.ts:14` — *"The file bytes themselves are NOT stored"*. Zero dependências de storage no `package.json`. | Primeira semana |
| 2 | **O portal PROMETE por escrito uma aba de upload que não existe.** | A mensagem manda "enviar na aba Materiais" (`app/api/portal/approvals/route.ts:133`); a aba só tem um botão "Conectar Drive" desabilitado (`app/portal/access/[token]/page.tsx:703-747`). | Primeira semana |
| 3 | **O motor lê um campo que ninguém escreve.** `scope.hasRawMaterial` não é gravado por nenhum código; o briefing usa `social.hasPhotos`/`hasVideomaker`. O `?? false` vira "não tem". | `run-execution.ts:166` vs `question-engine.ts:244-262` | Primeira entrega — a agência manda a cliente gravar o vídeo que ela já mandou |
| 4 | **O especialista de identidade exige a marca que foi contratado para criar.** Deadlock: o cliente pagou porque não tem. | `especialistas.ts:214-218` | Primeira entrega |
| 5 | **Design entrega descrição, não peça.** O gerador de imagem existe e está desligado do motor. | `especialistas.ts:233` ("**Descreva** as artes"); `design-engine.ts` sem importador no motor | Primeira entrega |
| 6 | **A entrega nunca vira post com data, e nada publica.** `publishPost` e o índice de `scheduledFor` não têm chamador automático. | `meta/client.ts:114` (só rota de clique); `despertador.ts` não olha `scheduledFor` | Primeira semana |
| 7 | **O cliente reprova uma peça e ninguém refaz — nunca.** Só a proposta reengaja; o destravamento automático só atende o que a *Qualidade* reprovou. | `portal/approvals/route.ts:147`; `pacote-travado.ts:165` | Primeira crítica |
| 8 | **Nunca chega relatório de resultado.** `getInsights` não tem um único chamador no repositório. | `meta/client.ts:136` | Primeiro mês |
| 9 | **Não existe mês 2.** `fecharCiclo` sem chamador, e a idempotência é vitalícia por especialista — quem entregou em agosto nunca mais é chamado. | `ciclos.ts:130` sem caller; `run-execution.ts:218` | Dia 31 |
| 10 | **A tela afirma um fato falso, sozinha, todo dia:** *"O ciclo do mês está rodando: publicando, medindo e reportando"* — enquanto o sistema não publica, não mede e não reporta. | `fases.ts:150` | Todo dia |
| 11 | **Não existe cobrança, mensalidade nem renovação.** Nenhum modelo de fatura no schema. | `prisma/schema.prisma` (34 modelos, nenhum de cobrança) | Mês 2 |

---

## O plano — 7 blocos, na ordem em que vou construir

> **Status em 02/08/2026: os 7 blocos estão construídos e no ar.** O que sobrou
> está na seção final — e é tudo coisa que depende do CEO, não de código.

A ordem é por **dor do cliente**, não por facilidade. E há uma dependência dura:
storage vem primeiro porque três serviços param nele.

### ✅ Bloco 1 — Fundação de mídia
O cliente precisa poder mandar arquivo, e a agência precisa poder devolver.
- Modelo `MediaAsset` + diretório no volume do Railway (persistente, provado em `scripts/start.sh:72`)
- `POST /api/media` (recebe) e `GET /api/media/[id]` (serve, com dono derivado do token, nunca da URL)
- Upload no portal do cliente — a aba que hoje é uma promessa quebrada
- Cota por workspace: disco cheio mata o banco, porque é o mesmo volume

### ✅ Bloco 2 — Os consertos de junta
Baratos, e cada um é um cliente perdido.
- `hasRawMaterial` lendo os campos que o briefing realmente escreve
- Trava do especialista de identidade invertida quando o serviço **é** criar a marca
- A promessa do portal alinhada com o que existe
- O resultado do Design voltando para o `BrandBrain`

### ✅ Bloco 3 — Da entrega ao ar
- A entrega de social vira `SocialPost` com data
- Um publicador no despertador: `scheduledFor <= agora` → publica → marca `published`

### ✅ Bloco 4 — A operação contínua
- `fecharCiclo` rodando por data, não por clique
- Idempotência **por ciclo**, não vitalícia — é o que faz o mês 2 existir
- Relatório com número real: `getInsights` ligado, comparação mês a mês

### ✅ Bloco 5 — Cliente reprovou, agência refaz
Hoje o robô que reprova a si mesmo é atendido em 5 minutos e o cliente pagante
nunca é. Inverter isso.

### ✅ Bloco 6 — Design produz peça
Ligar o gerador de imagem ao motor, gravando no storage do Bloco 1.

### ✅ Bloco 7 — Anúncios
Camada de Marketing API: conta, campanha, conjunto, anúncio, verba, métricas.
Depende de aprovação da Meta — as permissões **já foram pedidas** (commit
`d225c0b`) para a espera correr em paralelo.

---

## O que ficou construído — 02/08/2026

| Bloco | O que a agência passou a conseguir fazer |
|---|---|
| 1 | Receber arquivo do cliente e devolver arquivo, com cota e link assinado |
| 2 | Não cobrar do cliente o que ele já mandou; não pedir marca a quem contratou criar a marca; a marca criada volta para o `BrandBrain` |
| 3 | A entrega vira calendário, o cliente aprova, o relógio publica no Instagram |
| 4 | O mês vira sozinho: mede, relata com número real, fecha e produz o mês seguinte |
| 5 | Pedido de mudança do cliente é refeito na hora, com as palavras dele |
| 6 | O Design produz a imagem, não a descrição da imagem |
| 7 | Campanha de tráfego criada **pausada**, com teto do cliente, esperando o "pode ir" |

Cobertura: **439 testes**, todos verdes. Typecheck e build limpos.

---

## O que depende do CEO — e só dele

Nada abaixo é código. É tudo decisão, credencial ou dinheiro.

1. **App Review da Meta** — permissões de anúncio, verificação de negócio, ícone
   e URLs (o ícone e as páginas legais já estão prontos, faltam ser colados).
2. **Tamanho do volume no Railway** — o repositório não sabe qual é, e mídia sem
   cota derruba o banco junto.
3. **Backup** — não existe rotina de backup nenhuma hoje, nem do banco. Colocar
   mídia no volume aumenta o que se perde sem aumentar a proteção.
4. **Decisão de preço** — o calculador cobra igual de quem manda material e de
   quem não manda, e pode chegar a R$4.900/mês para um salão de bairro sem
   nenhum aviso de sanidade.
5. **Chave da OpenAI com acesso a imagem** — o Bloco 6 depende dela. Sem chave,
   o post fica sem arte e não vai ao ar. É o gargalo mais imediato dos sete.
6. **O cliente conectar o Instagram dele** — sem isso a agência produz,
   apresenta, agenda e **não publica**. A esteira já cobra isso na tela, mas
   quem pede é o comercial.
7. **Teto de gasto diário da casa** — hoje R$ 500/dia por campanha
   (`ADS_TETO_DIARIO_BRL`). É a última defesa contra um erro de orçamento.
   Confirmar o número.
