# Oficina — agencia (esteira de agência)

> Append-only. O especialista escreve; **quem promove para a vitrine é o Diretor**.
> Sala aberta em 13/08/2026 — não havia `docs/agents/agencia/` neste repositório.
> A sala vizinha do mesmo assunto é `docs/agents/departamentos/` (social-media +
> design), que é de outro agente e **não foi tocada**.

---

## 2026-08-13 — A arte do CityJobs não conversa com a vaga: onde o sinal se perde

**Despacho:** item 19 da lista do CEO. Palavras dele: *"as vagas não têm muito a
ver com a arte que ele está criando. Então só dá essa direção pra ele."*
Elogio + desalinhamento. Nada foi produzido e nada foi publicado.

### O padrão do erro, com a peça na mão

Comparei as quatro peças físicas do repositório
(`docs/entregas/cityjobs-08-08/`, aprovadas e reprovadas) com o texto que cada
uma carrega e com a tabela das seis de 07/08
(`docs/projetos/cityjobs-registro-07-08.md:139-186`).

**A arte prova O CLIENTE; ela nunca prova A PEÇA.** Em toda peça do CityJobs a
imagem responde *"quem é o anunciante?"* — uma plataforma de vagas do Alto Tietê:
estação, avenida, comércio de rua, skyline. Nenhuma responde *"o que está sendo
oferecido aqui?"* — este cargo, neste setor, nesta cidade.

Nas duas aprovadas de 08/08 **isso está certo**, e é por isso que o CEO gostou:
as duas são institucionais (bastidor da região · vaga validada), e institucional
prova a região mesmo. O erro aparece quando **a mesma direção é aplicada a uma
peça que anuncia uma vaga**: sobra cidade e falta trabalho.

O sintoma extremo já estava medido: quando o tema tocava vaga de verdade, o
modelo, sem nenhuma direção sobre o trabalho anunciado, **preencheu o vazio
inventando** — `VAGA $3,500`, `R$6.000`, `Assistents Administrativo · R$ 2000 per
wes`. Três em seis. A trava certa foi feita (`pilares-bloqueados.ts`) e é de
recusa; ela impede o dano e **não** faz a arte conversar com a vaga.

### De onde vem a decisão da imagem — e onde o sinal se perde

Duas portas, e só uma tem a régua da marca:

| | Porta do TEXTO | Porta da IMAGEM |
|---|---|---|
| quem monta | `especialistas.ts:272` ← `run-execution.ts:347` | `artes.ts:1247` (`montarPrompt`) |
| o que recebe da marca | `contratoDeMarca()` inteiro (proibições, léxico, voz, limites) | nada disso |

Na porta da imagem, o post avulso e o **story** recebiam oito sinais: seis são
constantes do CLIENTE (nome, segmento, cores, tom, estilo do feed, estilo visto)
e só dois variam por peça (legenda e pilar). O carrossel recebia mais dois —
`papelDaTela` e `amplitude` (`artes.ts:1568-1569`) — e o post simples **não**.

Consequência exata, medida: o cérebro criativo do CityJobs já dizia, escrito, com
procedência, `NUNCA: banco de imagem genérico sem relação com a região` e
`NUNCA: estética de escritório de tecnologia — coworking, tablet, mármore, café`
(`repertorio-registrado.ts`) — e **essa frase nunca chegou ao gerador de uma peça
avulsa**. Regra escrita que não atravessa a porta.

A escolha da foto REAL (`escolha-de-foto.ts:277`) também não olha a vaga: ela casa
palavra do NOME DO ARQUIVO com a legenda. Está certo para o que ela é, e não
resolve isto — o CityJobs não tem material no Drive.

**NÃO VERIFICADO:** o gerador dos stories que o CEO elogiou é da **plataforma do
CityJobs**, não deste repositório (o contrato exclui stories —
`cityjobs-orcamento.md:43`). Não há uma linha desse gerador aqui, e não há
nenhum campo de vaga no sistema: `SocialPost` tem `caption`, `pillar`, `format` e
nada de cargo, setor ou cidade (`prisma/schema.prisma:1224`). A direção abaixo
vale para as duas produções, mas só a nossa foi ligada em código.

### A direção, escrita como regra

1. Peça que anuncia **uma vaga** prova a vaga: a cena é **o lugar onde aquele
   trabalho acontece**, na **cidade da vaga**.
2. Peça **institucional, de comunidade ou de bastidor** prova a **região** —
   estação, avenida, comércio de rua. É o que o CEO aprovou e continua valendo.
3. Nunca: cidade/estação/skyline em peça de cargo específico · escritório,
   coworking, notebook ou reunião quando o cargo não é de escritório · clichê de
   contratação (currículo na mão, aperto de mão, confete) · pessoa sorrindo sem
   lugar de trabalho reconhecível em volta.
4. Continua valendo: cargo, salário ou nome de empresa **dentro dos pixels** é
   reprovação (`pilares-bloqueados.ts`).

### Onde ela mora, e por quê

No **contrato de marca do CityJobs** — `cerebroDoCityJobs()` em
`lib/agency/design/repertorio-registrado.ts`, como um eixo de amplitude novo
(*"o que a imagem tem de provar"*), com procedência do CEO.

Escolhido por eliminação verificável: as **proibições do cliente** leem TEXTO
(`trava-de-texto.ts`, `regua-do-texto.ts`) e este defeito não está no texto — não
disparariam nunca. Um **documento de manual** é a doença que o próprio despacho
nomeou. O cérebro da marca é o único dos três que a máquina que desenha a peça lê
por peça, via `lerMarca` → `marca.cerebro` → `direcaoDeAmplitude` → prompt.

### O que mudou em código (regra, não peça)

- `lib/agency/execution/artes.ts` — o caminho do post simples e do **story**
  passa a mandar `amplitude: direcaoDeAmplitude(marca.cerebro)` ao `montarPrompt`.
  Uma linha; é a porta que faltava. Vale para **toda marca com cérebro**, não só
  o CityJobs. Cérebro sem amplitude devolve vazio e o prompt não menciona nada.
- `lib/agency/design/repertorio-registrado.ts` — o eixo novo no cérebro do
  CityJobs. Dado, não `if`.
- `__tests__/design/a-arte-conversa-com-a-vaga.test.ts` — 7 testes. Conferido que
  os 2 da fiação **falham sem a correção** (`git stash` do `artes.ts`, 2 vermelhos
  de 7). Suíte inteira: 213 arquivos, 3479 verdes; `tsc --noEmit` limpo.

### O que fica aberto

- **A regra precisa chegar ao gerador de stories do CityJobs**, que é externo.
  Nada neste repositório alcança aquele código. Enquanto não chegar, a metade que
  o CEO reclamou continua igual — o que consertei foi a nossa porta.
- **O sinal da vaga não existe no nosso modelo.** Para a arte conversar com a
  vaga de verdade, `SocialPost` precisaria carregar cargo/setor/cidade. Não
  inventei o campo: sem produtor para ele, seria mais um portão de decoração.
- `conferenciaDePixelDisponivel()` continua `false` — os pilares de vaga seguem
  bloqueados, e com razão.
