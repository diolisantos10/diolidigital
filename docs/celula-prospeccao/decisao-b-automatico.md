# Caminho B — o automático de 03/09. **Desenhado, não construído.**

> **Decisão tomada pelo CEO**, não hipótese: na quinta-feira 03/09/2026, quando
> o teto de sete dias da cota zera, o agente passa a anexar sozinho, sem o
> clique dele.
>
> ⛔ **Nada aqui está em código, e nada deve entrar antes de quinta.** A ordem
> do Diretor Geral é explícita: B só entra com a fila do caminho A já tendo
> rodado alguns dias **como prova**.

## 1. O que muda tecnicamente

O caminho A já construiu quase tudo o que B precisa. A diferença é **quem
executa o último metro** — e ela é maior do que parece.

| Peça | Caminho A (hoje) | Caminho B (03/09) |
|---|---|---|
| Decidir o que enviar | código | **igual** |
| Conferir destinatário, integridade, aprovação | código | **igual** |
| Montar o pacote com os bytes | código | **igual** |
| Ritmo, allowlist, exceções | código | **igual** |
| **Abrir o navegador e anexar** | **o CEO clica** | **código** |
| **A sessão autenticada** | do CEO, na frente dele | **salva, sem ninguém na frente** |

**O que se constrói:** um driver de navegador com **contexto persistente** —
`launchPersistentContext` do Playwright, ou equivalente — apontando para o
perfil isolado que a decisão 2 já define. Ele lê a fila de prontos, abre o
projeto, anexa, e registra a evidência que o `executor.ts` já exige.

**O que NÃO se reconstrói:** nada das travas. `navegador-isolado.ts`,
`ritmo.ts`, `saida-do-canal.ts`, `papeis.ts`, `pacote-do-operador.ts` e
`fila-diaria.ts` valem iguais. O driver entra **atrás** delas, nunca ao lado.

## 2. O que se abandona — e isto não é detalhe de implementação

**Abandona-se o Claude in Chrome.** Ele exige pessoa na frente por natureza: é
operado de dentro do navegador, sob supervisão de quem está ali. Automático de
verdade é o oposto disso.

Voltar a um robô com sessão salva **desfaz o argumento que sustentava a
segurança do caminho A**. Vale enunciar as três perdas com todas as letras:

1. **Perde-se o humano como último portão.** Hoje, entre a decisão da máquina e
   o cliente, existe um clique de gente que pode não acontecer. Em B, não
   existe. Todo defeito que hoje o CEO pegaria olhando, em B chega ao cliente.
2. **Perde-se a titularidade presencial.** Hoje quem opera a conta é o titular,
   ao vivo. Em B é um processo com a credencial dele. Os Termos do 99Freelas
   **não têm cláusula de titularidade nem de procurador** — a distinção nunca
   esteve escrita (é LACUNA registrada), mas em A ela ao menos era *verdadeira
   de fato*. Em B deixa de ser.
3. **Perde-se a defesa contra "automação que não segue as regras".** Foi
   exatamente essa a frase da Meta ao restringir a conta de anúncios da agência
   em 03/08/2026. Lá, ritmo de máquina sem ninguém no papel de dizer "isso vai
   dar ban".

## 3. 🔴 O risco explícito para a conta do CEO

**A conta do 99Freelas é a pessoal do Dioli.** As Sanções da plataforma dizem,
com todas as letras, que **banimento alcança outras contas do mesmo usuário** e
é permanente.

E a política capturada é clara sobre onde estamos pisando:

> Os Termos **não proíbem** automação — a palavra não aparece no texto — **e
> também não a autorizam.** É silêncio, não permissão. `policy.json` mantém
> `auto_submission_allowed: false` e `browser_automation_allowed: false` por
> **fail closed**, não por suspeita de proibição.

E o pedido de autorização **nunca foi respondido**: `autorizacao_do_suporte`
está em `sem_resposta` desde 07/08.

**Portanto, o risco em uma frase:** ligar B é operar por automação uma conta
pessoal, num canal que não autorizou automação, sem resposta do suporte, com
banimento que alcança as outras contas do titular — e sem o humano que hoje
serve de freio.

**Isso não é impedimento; é o preço, e quem o paga é o CEO.** Ele decidiu, e a
decisão é dele. O que não pode é a decisão ser tomada sem esta frase escrita.

### Três coisas que reduzem o risco sem cancelar B

- **Ligar B só para a AÇÃO MAIS BARATA primeiro** — anexar arquivo numa
  conversa já contratada, onde a relação existe e o cliente espera o arquivo.
  **Não** para primeira abordagem, que é onde spam se parece com spam.
- **Manter o teto de ritmo mais apertado que o de A**, não mais frouxo. A
  tentação é o contrário: "agora que é automático, pode ir mais rápido".
- **Qualquer exceção aberta PARA o automático** — CAPTCHA, sessão expirada,
  bloqueio. Isso já existe em `fila.ts` (`podeSeguirAutomatizando`) e não
  precisa ser reconstruído, precisa ser **ligado ao driver**.

## 4. A MEDIÇÃO que decide se B pode ser ligado

Tirar a pessoa do meio só é defensável se houver **evidência de que a pessoa não
estava consertando nada**. Sem isso, B é uma aposta com a conta do CEO.

**O que medir, e é barato porque a fila já registra:**

| Número | Como sai | O que ele responde |
|---|---|---|
| **Itens liberados por dia** | `liberarEmBloco` → `liberados` | qual o volume real |
| **Itens RECUSADOS pelo bloco** | `liberarEmBloco` → `recusados` | quantas vezes a máquina errou sozinha |
| **Itens que o CEO tirou do bloco** | os prontos que ele **não** selecionou | 🔴 **o número que importa** |
| **Itens impedidos na montagem** | `montarFilaDoDia` → `impedidos` | quanto quebra antes de chegar nele |

O terceiro é o número da decisão: **um item pronto, que passou por todas as
conferências, e que o CEO mesmo assim decidiu não enviar.** Cada um desses é
uma correção que só o humano fez — e é exatamente o que se perde em B.

> ⚠️ **A fila de hoje NÃO registra esse número.** Ela sabe o que foi liberado e
> o que foi recusado pela máquina; não sabe o que o CEO viu e deixou de fora.
> **Registrar isso é a única coisa de código que eu recomendaria fazer ANTES de
> quinta** — é pequeno (guardar os ids prontos apresentados, ao lado dos
> selecionados), e sem ele a medição não existe.

**O critério que eu recomendo, e é do CEO aceitar ou não:**

- **Três dias de fila rodada**, no mínimo — não um dia.
- **Zero item tirado do bloco pelo CEO** nesses dias → a evidência sustenta B.
- **Um ou mais tirados** → cada um precisa de causa nomeada, e a causa vira
  trava em código **antes** de B. Tirar a pessoa sem consertar o que ela pegava
  é transferir o erro para o cliente.

## 5. O que eu recomendo ao Diretor Geral

1. **Manter a data.** A decisão é do CEO e a data é dele.
2. **Ligar o registro da medição ainda no caminho A** — é o único código que
   vale escrever antes de quinta, e sem ele quinta chega sem evidência.
3. **Estreitar o primeiro B** à ação mais barata (anexo em projeto contratado),
   não à abordagem inicial.
4. **Escrever no `policy.json`, no dia em que B ligar, que a casa passou a
   operar por automação sem autorização do canal** — com data e responsável.
   Se a conta cair, a casa precisa saber quando decidiu correr o risco, e não
   descobrir isso reconstruindo o histórico do git.
