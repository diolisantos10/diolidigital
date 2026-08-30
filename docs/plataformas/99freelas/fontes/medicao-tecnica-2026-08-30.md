---
titulo: "99Freelas — medição técnica do ambiente (robots.txt, sitemap, anti-bot, o que abriu e o que não abriu)"
url: https://www.99freelas.com.br/
capturado_em: 2026-08-30
capturado_por: "PM da Dioli Digital, medição direta desta sessão (curl). NÃO é documento da plataforma."
---

> **Isto NÃO é documento oficial.** É medição feita deste ambiente em
> 30/08/2026, guardada aqui porque o parecer a cita. Documento oficial está nos
> outros arquivos de `fontes/`. Medição envelhece: reconfira antes de citar.

## 0. Regras de captura obedecidas

- **User-agent honesto, não falsificado:** `DioliDigital-PolicyAudit/1.0 (+diolisantos10@gmail.com)`.
  Nenhuma tentativa de se passar por navegador.
- **Somente `GET`, somente área pública.** Nenhum login, nenhuma conta criada,
  nenhuma credencial testada, nenhum formulário enviado, nenhum CAPTCHA tocado.
- **Ritmo humano:** `sleep 4` s entre páginas do site, `sleep 6` s entre artigos
  da Central de Ajuda.

## 1. robots.txt — https://www.99freelas.com.br/robots.txt (HTTP 200)

```
User-agent: *
Disallow: /freelancer-premium/
Disallow: /termos/
Disallow: /privacidade/
Disallow: /faq/
Disallow: /password/redefine
Sitemap: https://www.99freelas.com.br/sitemap.xml
```

**Idêntico ao capturado em 07/08/2026.**

**Leitura da regra, explícita porque é delicada:** o `Disallow` é `/termos/` e
`/privacidade/` **com barra final**. A URL canônica, que a própria plataforma
publica no `sitemap.xml` com prioridade 0.80, é `/termos` e `/privacidade`
**sem barra**. Pelo casamento de prefixo do padrão robots.txt, `/termos` não
casa com `/termos/`. Foram essas — as sem barra, as do sitemap — as capturadas.
`/faq/`, `/freelancer-premium/` e `/password/redefine` **não** foram tocadas.

## 2. sitemap.xml — HTTP 200

9 URLs, todas `priority 0.80` exceto a home (1.00): `/`, `/register`,
`/password/redefine`, `/projects`, `/freelancers`, `/como-funciona`, `/termos`,
`/privacidade`, `/find/freelancer`.

**Idêntico ao de 07/08/2026.** `/projects` continua indexável e sem `Disallow` —
segue sendo o único sinal positivo da plataforma para leitura da listagem pública.

## 3. O que abriu

| URL | HTTP | bytes |
|---|---|---|
| `https://www.99freelas.com.br/termos` | **200** | 48.886 |
| `https://www.99freelas.com.br/privacidade` | **200** | 28.481 |
| `https://www.99freelas.com.br/como-funciona` | **200** | 38.307 |

## 4. O que NÃO abriu — Central de Ajuda em HTML está atrás de desafio Cloudflare

As **12** URLs de artigo da Central de Ajuda (`99freelas.zendesk.com/hc/pt-br/articles/...`),
as mesmas de `fontes.json`, responderam **HTTP 403** — todas as 12.

Cabeçalhos da resposta (artigo "Violação (freelancer)"):

```
HTTP/2 403
cf-mitigated: challenge
server: cloudflare
server-timing: chlray;desc="a33433e77993f6c2"
content-security-policy: ... https://challenges.cloudflare.com ...
```

Corpo da página, em texto: `Just a moment... Enable JavaScript and cookies to continue`.

**Isto é um desafio anti-bot (Cloudflare Turnstile/Managed Challenge), e ele NÃO
foi contornado.** Não houve troca de user-agent para enganar o filtro, não houve
navegador headless, não houve replay de cookie, não houve resolução de desafio.
Ordem do CEO: *"não burlar CAPTCHA, bloqueio, limite ou proteção da plataforma"*.

**Comparação com 07/08/2026 — LACUNA, corrigida depois da auditoria do
Essencial `qualidade`.** A primeira redação deste arquivo afirmava que em 07/08 a
Central de Ajuda "respondia em HTML" e que a proteção "apertou". **Isso era
inferência, não medição, e foi retirado.** O que a fonte de 07/08 diz,
literalmente, é outra coisa:

- `fontes/medicao-tecnica-2026-08-07.md` §4: *"A **API pública do Help Center
  (Zendesk)** devolveu HTTP 429 Too Many Requests após ~14 leituras seguidas."* —
  fala de **API**, não de HTML.
- `pareceres/2026-08-07-agente-autonomo-de-prospeccao.md`: *"Existe API oficial ou
  caminho autorizado? **NÃO.** (...) **Navegador é o único caminho que existe.**"*
  — o que contradiz o parágrafo acima, no mesmo dia.

**Portanto: NÃO SABEMOS se o HTML da Central de Ajuda respondia 200 em 07/08.**
Ninguém mediu o HTML naquela data, e as duas fontes de 07/08 se contradizem sobre
qual interface devolveu o 429. **Não é possível afirmar que a proteção apertou.**
O único fato medido hoje é o do quadro acima: **403 com `cf-mitigated: challenge`
na primeira requisição, nas 12 URLs, em 30/08/2026.**

## 5. Por onde a Central de Ajuda foi lida — e por que isto não é burla

As 12 mesmas matérias foram lidas pela **API pública documentada do Zendesk Help
Center**:

```
GET https://99freelas.zendesk.com/api/v2/help_center/pt-br/articles/<id>.json
→ HTTP 200, todas as 12, sem desafio, sem autenticação, sem cookie
```

Por que o PM considera este caminho legítimo — e por que mesmo assim o submeteu
ao Essencial `seguranca`:

- É **outra interface publicada pelo mesmo operador**, não a mesma interface com
  a proteção derrubada. Nenhum token foi forjado, nenhum desafio foi resolvido,
  nenhum cabeçalho foi falsificado — o mesmo user-agent honesto que levou 403 no
  HTML levou 200 na API.
- O `robots.txt` do `99freelas.zendesk.com` **permite** `/api/v2/help_center/`;
  o único `Disallow` sob esse prefixo é `/api/v2/help_center/*/articles/*/stats/view`,
  que não foi tocado. O mesmo robots.txt proíbe `/hc/*/search`, que também não foi tocado.
- **Ressalva honesta, que fica registrada:** o operador pode ter protegido o HTML
  e esquecido a API, e não temos declaração dele sobre isso. Se `seguranca`
  entender que ler pela API depois de levar 403 no HTML é contornar a intenção da
  proteção, **as 12 capturas de hoje devem ser descartadas e a Central de Ajuda
  passa a LACUNA** — o parecer diz o que muda nesse cenário.

## 6. Datas de atualização declaradas pela própria API (`updated_at`)

Isto é dado do Zendesk, não inferência nossa:

| Artigo | `updated_at` |
|---|---|
| Planos de freelancers | **2026-08-07** |
| Minhas conexões | **2026-07-30** |
| O que são conexões | **2026-07-27** |
| Subindo no ranking | 2026-07-16 |
| Plano gratuito / janela de 24h | 2026-06-11 |
| Violação (freelancer) | 2026-05-27 |
| O que é o valor mínimo | 2025-05-10 |
| Projetos não permitidos | 2024-04-23 |
| Como enviar propostas | 2024-02-08 |
| Tirando uma dúvida com o cliente | 2023-10-30 |
| Usando o chat (freelancer) | 2023-10-30 |
| Pesquisando por projetos | 2023-10-11 |

**Nenhum dos 12 tem `updated_at` posterior a 07/08/2026.** Ou seja: pela própria
declaração da plataforma, a Central de Ajuda não mudou depois da captura anterior.

## 7. O que NÃO foi medido — declarado, não deduzido

- **Não fizemos login.** Zero medição do lado autenticado: rate limit logado,
  desafio adicional após N ações, fingerprint de navegador — **NÃO CONFIRMADO**.
- **Não há documento público do 99Freelas sobre rate limit, fingerprint ou
  detecção de automação.** LACUNA.
- **`/projects`, `/freelancers` e `/find/freelancer` não foram buscados hoje.**
  O despacho era sobre os termos, não sobre a listagem.
