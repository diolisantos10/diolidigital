# Quem aprova na agência — e por que nunca é o CEO

> Ordem do CEO, 09/08/2026, dita depois de eu pedir a ele três aprovações no
> mesmo dia que não eram dele. Palavras dele: *"a Dioli é totalmente autônoma
> (…) não precisa da minha aprovação para nada (…) quem aprova os projetos ou
> não é o próprio cliente (…) estou falando isso há milhões de anos."*
>
> O "há milhões de anos" é o que torna este arquivo necessário. Ele repete, a
> sessão morre, e o próximo Diretor volta a perguntar. Regra que só existe na
> conversa não existe.

---

## O ciclo, como ele realmente é

```
cliente manda briefing
   └── agência lê e devolve a PROPOSTA ao cliente
        └── cliente decide: aprova · pede ajuste · reprova (refaz)
             └── volta para a agência
                  └── agência devolve ao cliente
                       └── segue
```

**Quem decide se presta é o cliente.** Não o CEO, não o Diretor.

Por dentro, **Diretor e PM** aprovam ou reprovam o trabalho antes de ele sair —
é controle de qualidade interno, e também não sobe.

---

## O que isso proíbe

1. **Nenhuma fila de aprovação aponta para o CEO.** Se uma tela, um alerta ou um
   relatório pedir a ele para aprovar peça, direção, proposta ou calendário, é
   defeito — não é fluxo.
2. **Nenhum relatório ao CEO lista "esperando sua aprovação"** para coisa da
   esteira. Ele não é etapa.
3. **O Diretor não substitui o cliente.** Peça reprovada pelo cliente não é
   revertida por decisão interna: volta para ajuste.

## O que isso EXIGE do sistema

Se ninguém do lado de dentro aprova, então **o lado de fora precisa ser
alcançado sozinho**. É assim que está construído: o aviso ao cliente sai
automático, e a esteira anda sem mão humana.

`FilaDeAvisos` **não é o fluxo — é a lista de exceções.** Cada item traz
`porQueNaoSaiuSozinho`, e o motivo aparece na tela como *"Não saiu sozinho: …"*.
O caso conhecido nos testes é cliente **sem telefone cadastrado**: sem canal,
não há como alcançar, e o texto fica pronto esperando mão.

> ⚠️ **Erro de leitura registrado — 09/08/2026, meu.** Vi a fila, li *"o texto já
> está pronto, é copiar e mandar"* e concluí que a esteira dependia de gente. Não
> depende. Confundi a saída de emergência com a porta principal, e ainda subi
> isso ao CEO como pendência dele. Ele corrigiu: *"você mesmo me falou que
> incorporou o fluxo dentro da agência (…) aquilo é uma automação, uma esteira de
> serviço, é assim que funciona."*
>
> A lição que fica: **fila de exceção cheia parece processo manual.** Antes de
> chamar de trabalho braçal, leia o motivo — ele está no registro.

**O que continua sendo defeito de verdade:** um aviso que não saiu fica parado
até alguém olhar. Sete dias é longo demais para um item que ninguém prometeu
vigiar. O que falta não é automatizar o envio — já é automático — é **a fila de
exceção cobrar a si mesma**: reenviar quando o canal voltar, e gritar quando o
que falta é cadastro (telefone ausente é conserto de minutos, não de dias).

E o lugar disso é a tela onde a agência se olha, nunca a do CEO.

---

## O teste, antes de pedir qualquer coisa ao CEO

> *"Se isto ficasse parado, quem perde: o cliente, ou o dono do negócio?"*

Cliente perde → é da esteira, e a esteira resolve.
Dono perde (preço, marca, dinheiro, risco irreversível) → aí sim sobe.

Aprovar peça, direção, proposta, calendário e material **é sempre do cliente**.
