# Quem produz o quê — levantamento de produtores por categoria

> **Pedido do CEO em 29/08/2026:** *"quais as melhores plataformas pra gente
> integrar na agência, por categoria — quem vai fazer o quê?"*
>
> ⚠️ **ESTE DOCUMENTO NÃO SERVE PARA COMPRAR NADA.** A sessão que o escreveu
> estava **sem acesso à internet** (`WebSearch` e `WebFetch` desabilitados,
> saída literal colada abaixo). Tudo na seção "candidatos" é **memória com data
> de corte**, não fonte verificada. Serve para decidir o RUMO; o fornecedor se
> decide com a biblioteca recapturada.
>
> ```
> Error: No such tool available: WebSearch. WebSearch is disabled for this session.
> ```

---

## 🔴 A decisão que a pergunta reabre — leia antes de tudo

O CEO perguntou **qual plataforma gerará os vídeos dos clientes**. Vídeo foi
**retirado de todos os planos por decisão dele em 25/08/2026**, e o motivo está
escrito em `lib/agency/planos.ts`, no `naoInclui` do plano Conteúdo:

> *"Vídeo e reel NÃO entram em plano nenhum: a casa não grava, não edita e não
> gera vídeo, e o roteiro sozinho é a mesma dívida de D-0A3 — promessa sem
> produtor. O que se tira é a PROMESSA; o produtor não existe para ser tirado."*

**Logo, a pergunta não é uma consulta de fornecedor: é a reabertura dessa
decisão.** Este documento a trata como reabertura e mede o que ela custa.

---

## O que JÁ está ligado — verificado no código em 29/08, não de memória

| Categoria | Produtor de hoje | Onde está | Estado |
|---|---|---|---|
| Raciocínio e texto | **Claude · GPT · Gemini** | `lib/ai/provider-registry.ts` | ✅ os três, com escolha por cliente |
| **Imagem estática** (post, carrossel) | **OpenAI `gpt-image-1`**, reserva **Gemini** | `lib/ai/design-engine.ts:304` e `:340` | ✅ com queda automática |
| Publicação Instagram/Facebook | **Meta** | `lib/integrations/meta/` | ✅ código pronto, permissões pendentes |
| Métricas de Instagram | **Meta** | `lib/integrations/meta/leitura.ts` | ✅ |
| Anúncios | **Meta Ads** | `lib/integrations/meta/ads.ts` | ⚠️ código existe; conta restringida desde 03/08 |
| Ficha e avaliações | **Google Business Profile** | `docs/plataformas/google/` | ⚠️ parcial |
| **Vídeo** | **ninguém** | — | 🔴 **não existe produtor** |
| TikTok | **ninguém** | — | 🔴 zero linha de código |
| Site / impresso | **ninguém** | — | 🔴 não vendido |

---

## Candidatos por categoria — MEMÓRIA, não fonte

Nomes de família, deliberadamente sem versão e sem preço: qualquer número que
esta sessão escrevesse envelheceria sem ninguém saber.

| Categoria | Candidatos a avaliar | O que precisa ser verificado antes de decidir |
|---|---|---|
| Imagem estática | GPT-Image · Gemini Image · família Flux · Ideogram | qualidade de **tipografia dentro da arte** — é onde peça de agência quebra |
| Vídeo gerado | Veo (Google) · Sora (OpenAI) · Runway · Kling · Luma | preço por segundo, duração máxima, **direito de uso comercial** |
| Vídeo com apresentador | HeyGen · Synthesia · D-ID | termos de uso **de imagem de pessoa** |
| Voz / locução | ElevenLabs · voz da OpenAI | preço por minuto, vozes em pt-BR |
| Edição / montagem | Creatomate · Shotstack · FFmpeg próprio | comprar vs. fazer |
| Música / trilha | Biblioteca Comercial do TikTok · Epidemic · Suno | 🔴 **direito autoral — é aqui que agência toma processo** |
| Medição fora da Meta | GA4 · Search Console | nível de acesso exigido |

---

## O critério de escolha desta casa NÃO é "o melhor"

Esta casa roda **100% IA, sem revisão humana antes do cliente**
(decisão do CEO, 31/07/2026). Isso muda o critério de seleção:

1. **Aceita teto de gasto?** Já existe: `lib/ai/teto-de-custo.ts`.
2. **Tem reserva quando cai?** Já existe: `lib/ai/falha-de-provedor.ts` e
   `provedor-fora-de-jogo.ts`. O padrão de imagem já cai de OpenAI para Gemini.
3. **O custo fica registrado?** Já existe: `lib/ai/registro-de-custo.ts`.

**Uma por categoria, mais uma reserva.** Nunca uma só: provedor que cai não
pode derrubar a peça do cliente junto.

---

## O custo real de entrar em vídeo — medido

- **O encaixe de provedor aceita exatamente três hoje.**
  `lib/ai/provider-registry.ts:13` declara
  `type SupportedProvider = "openai" | "claude" | "gemini"` — **união fechada**.
  Somar um produtor de vídeo **é obra**, não plugue: mexe no encaixe, no teto de
  custo e no registro de gasto.
- 🔴 **Vídeo não tem portão de qualidade nenhum nesta casa.** Peça estática tem
  régua; vídeo não tem. Entregar vídeo sem régua e sem revisão humana é
  exatamente o cenário que a doutrina da casa chama de decoração.
- 🔴 **Trilha sonora é o risco jurídico**, não a geração.
- **Escada obrigatória:** produtor novo nasce em **SOMBRA** — produz e não
  entrega — e sobe com evidência. Foi a falta disso que produziu a promessa sem
  produtor retirada em 25/08.

---

## Precisa de decisão do CEO

1. **Vídeo volta a ser vendido?** Se sim, nasce em sombra e não entra em plano
   nenhum antes de provar. Se não, o assunto encerra e a pergunta não volta.
2. **Qual o teto de custo por peça?** Sem teto não se escolhe fornecedor — se
   escolhe promessa.
3. **Autorizar uma sessão COM internet** para transformar a coluna "candidatos"
   em biblioteca verificada, dentro de `docs/plataformas/`, como já se faz para
   Meta, Google e TikTok.

## Declarado e não feito

- Nenhum fornecedor contratado, nenhuma conta criada, nenhuma chave pedida.
- Nenhum preço, prazo ou limite técnico afirmado — **não havia como verificar**.
- A regra da trava de plataforma continua valendo: escrita em Meta, Google ou
  TikTok exige parecer prévio do especialista da plataforma.
- Escrito à mão pelo Diretor, com **exceção `SEM_AGENTE` declarada**: a
  ferramenta de despacho estava desabilitada nesta sessão
  (`Error: No such tool available: Agent`).
