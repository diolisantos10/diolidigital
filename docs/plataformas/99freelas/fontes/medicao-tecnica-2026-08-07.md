---
titulo: "99Freelas — medição técnica do ambiente (DNS de API, robots.txt, anti-bot)"
url: https://www.99freelas.com.br/
capturado_em: 2026-08-07
capturado_por: medição direta desta sessão (curl + getent), não é documento da plataforma
---

> **Isto NÃO é documento oficial.** É medição feita deste ambiente em
> 07/08/2026, guardada aqui porque o parecer a cita. Documento oficial está nos
> outros arquivos de `fontes/`. Medição envelhece: reconfira antes de citar.

## 1. Não existe host de API/desenvolvedor

| Host | DNS |
|---|---|
| `api.99freelas.com.br` | **não resolve** |
| `developer.99freelas.com.br` | **não resolve** |
| `developers.99freelas.com.br` | **não resolve** |
| `docs.99freelas.com.br` | **não resolve** |
| `ws.99freelas.com.br` | resolve (websocket do chat do próprio site, citado no CSP) |
| `www.99freelas.com.br` | resolve (o site) |

O rodapé do site não tem link de "desenvolvedores"/"API". Busca na Central de
Ajuda por "API" devolve **0 resultados**.

## 2. robots.txt (https://www.99freelas.com.br/robots.txt)

```
User-agent: *
Disallow: /freelancer-premium/
Disallow: /termos/
Disallow: /privacidade/
Disallow: /faq/
Disallow: /password/redefine
Sitemap: https://www.99freelas.com.br/sitemap.xml
```

**Não há `Disallow` para `/projects`.** `/projects` está listado no
`sitemap.xml` com prioridade 0.80 — a plataforma pede que a listagem de
projetos seja indexada.

## 3. Anti-bot presente

`GET /projects` responde `server: cloudflare`, `cf-ray`, `cf-cache-status`.

O `content-security-policy` da própria página autoriza, entre os scripts:

- `https://www.google.com/recaptcha/` e `https://www.gstatic.com/recaptcha/`
- `https://challenges.cloudflare.com/turnstile/v0/api.js`

A página `/login` referencia **reCAPTCHA (4 ocorrências) e Turnstile (2)**.
Ou seja: há desafio anti-bot no caminho de autenticação, de dois fornecedores.

## 4. Limite de taxa observado na Central de Ajuda

A API pública do Help Center (Zendesk) devolveu **HTTP 429 Too Many Requests**
após ~14 leituras seguidas. Não é o rate limit do 99Freelas (é do Zendesk), mas
confirma que leitura em ritmo de máquina é medida e barrada nesse ecossistema.

## 5. O que NÃO foi medido (declarado, não deduzido)

- **Não fizemos login.** Nenhuma medição do lado autenticado: não sei qual é o
  rate limit de `/projects` logado, se há desafio adicional após N ações, nem se
  a plataforma faz fingerprint de navegador. **Não confirmei.**
- **Não há documento público do 99Freelas sobre rate limit, fingerprint ou
  detecção.** A busca da Central de Ajuda por "automação", "robô", "spam" e
  "API" devolve **0 resultados** para cada termo.
