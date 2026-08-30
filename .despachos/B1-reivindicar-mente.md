# FICHA — a trava de coordenação mente sobre o que fez

## O DEFEITO, PROVADO HOJE (29/08/2026)
`scripts/reivindicar.mts`, caminho `abrir`. Rodei:

    npm run reivindicar -- abrir --rotulo sala-convite-2908 \
      --frente "o beco de quem negocia: proposta ajustada nasce em estado interno e o cliente nao consegue responder" \
      --responsabilidade esteira-beco-da-proposta-ajustada \
      --arquivos lib/agency/execution/negotiate-proposal.ts \
      --mesmo-com-trabalho-em-andamento

Ele RECUSOU, e a última linha impressa foi, literalmente:

> (nada foi escrito, commitado ou empurrado — o disco está como estava.)

**Isso é FALSO.** O que de fato aconteceu:
- criou `reivindicacoes/esteira-beco-da-proposta-ajustada.json`;
- **commitou**: `99977f1`, 2026-08-29T21:40:38Z, "reivindica: o beco de quem negocia…";
- **empurrou** para a branch de deploy `claude/dioli-agency-os-architecture-kk7kp`;
- e só então desfez a cópia **local** — por isso o arquivo NÃO existe no worktree mas existe no remoto.

Confira você mesmo: `git show 99977f1 --stat` e `ls reivindicacoes/esteira-beco-da-proposta-ajustada.json`.

## POR QUE É GRAVE
1. **Quem confia na frase decide errado.** O Diretor leu "nada foi escrito", concluiu que não abriu, e comunicou isso ao CEO. Estava aberta o tempo todo.
2. **A reivindicação some para quem mais precisa dela — o dono.** Existe no remoto e não no disco de quem a abriu; `conferir` e `encerrar` operam sobre o worktree.
3. É a família que esta casa já nomeou: *alarme que mente sobre a causa é pior que alarme nenhum*. Aqui o instrumento que mente é a **própria trava de coordenação**, que existe para impedir trabalho em dobro.

## O QUE EU QUERO
**MEÇA PRIMEIRO.** Leia `scripts/reivindicar.mts` inteiro e diga ONDE a ordem se inverte — qual guarda roda depois da escrita/commit/push. **Não presuma que é onde eu apontei; se eu estiver errado, traga a prova.**

Depois, o conserto, duas metades:
1. **A guarda vem antes do primeiro efeito colateral.** Recusa é recusa: sem arquivo, sem commit, sem push. Mesma regra que `scripts/seed-db.mjs` recebeu hoje — **leia `__tests__/plataforma/seed-recusa-antes-de-destruir.test.ts` como molde**: ele roda o script COMO PROCESSO e compara o estado antes/depois.
2. **Se a ordem não puder mudar**, a mensagem tem de contar a verdade: o que ficou no remoto, onde, e como desfazer. ⛔ O que NÃO vale é seguir afirmando "nada foi escrito" quando algo foi. Prefiro a ordem corrigida; a mensagem honesta é plano B. Diga qual escolheu e por quê.

⚠️ **Não afrouxe a trava.** A recusa está CERTA — reivindicação deve ser aberta de branch alinhada com a base. O defeito é o efeito colateral e a mentira, nunca o "não".

⚠️ A reivindicação `esteira-beco-da-proposta-ajustada` está **viva no remoto** e a frente **já foi entregue** (commit `e08ae2e`). Se puder encerrá-la com segurança, encerre e diga; se não, deixe e diga. **Não a apague à mão.**

## O TESTE
Rode o script COMO PROCESSO contra um repositório git temporário e prove:
1. no caminho que hoje mente: **nenhum commit novo**, **nenhum push** — compare `git log` antes/depois;
2. a saída **não** afirma "nada foi escrito" quando algo foi;
3. o caminho feliz continua gravando, commitando e empurrando.

## RESTRIÇÕES
- Toque **somente** em `scripts/reivindicar.mts` e no teste novo. **Um PR está em voo nesta branch** — não encoste em `lib/`, `app/`, `components/`, `CLAUDE.md`, nem em testes de outras pastas.
- ⛔ **NUNCA dê push de teste para o remoto de verdade.** Use `git init --bare` num diretório descartável como remoto. Sujar `reivindicacoes/` no remoto real seria repetir o defeito em escala maior.
- **Não commite.** O Diretor commita.
- Rode `npx tsc --noEmit` DEPOIS de escrever o teste, nunca antes.

## CRITÉRIO DE ACEITE
1. A medição primeiro: onde a ordem se inverte, arquivo e linha.
2. **Quebre a trava nova de propósito, veja VERMELHO**, desfaça, relate.
3. A saída real das execuções, colada.
4. **Declare o que não conseguiu provar.**
5. Se algum comando for recusado, cole a mensagem exata.
