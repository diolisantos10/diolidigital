import json, sys, io

SRC = "/home/user/diolidigital/docs/plataformas/99freelas/perguntas-por-servico.json"

with io.open(SRC, "r", encoding="utf-8") as f:
    texto = f.read()

REPLACEMENTS = [
    ("objetivo.oQueColhe",
     "qual e o objetivo principal dele",
     "qual é o objetivo principal dele",
     4),
    ("objetivo.comoSePergunta (FILA exata)",
     "Me conta: qual e o objetivo principal do negocio agora -- trazer cliente novo, vender mais para quem ja e cliente, ou aparecer mais?",
     "Me conta: qual é o objetivo principal do negócio agora — trazer cliente novo, vender mais para quem já é cliente, ou aparecer mais?",
     4),
    ("modalidade.oQueColhe",
     "se e gestao mensal, projeto pontual ou parceria continua",
     "se é gestão mensal, projeto pontual ou parceria contínua",
     1),
    ("canais_sociais.oQueColhe",
     "em quais redes sociais o negocio esta",
     "em quais redes sociais o negócio está",
     1),
    ("material_pronto.oQueColhe",
     "se ele ja tem fotos, videos ou logo prontos",
     "se ele já tem fotos, vídeos ou logo prontos",
     3),
    ("prazo.oQueColhe",
     "o prazo para comecar",
     "o prazo para começar",
     4),
    ("prazo.comoSePergunta (FILA exata)",
     "E para quando voce quer isso de pe -- proximas semanas, este mes, sem pressa?",
     "E para quando você quer isso de pé — próximas semanas, este mês, sem pressa?",
     4),
    ("publico_alvo.oQueColhe",
     "quem e o publico do negocio",
     "quem é o público do negócio",
     2),
    ("publico_alvo.comoSePergunta (FILA exata)",
     "Quem e o cliente tipico de voces? Me descreve em uma frase.",
     "Quem é o cliente típico de vocês? Me descreve em uma frase.",
     2),
    ("concorrentes.oQueColhe",
     "concorrentes ou referencias que ele admira",
     "concorrentes ou referências que ele admira",
     1),
    ("budget_range.comoSePergunta (bloco de negociacao exato)",
     "Pra eu ja montar a proposta certa pro seu momento: quanto voce pensa em investir por mes -- ate R$ 150, entre R$ 150 e R$ 500, entre R$ 500 e R$ 1.500, entre R$ 1.500 e R$ 5.000, ou acima disso?",
     "Pra eu já montar a proposta certa pro seu momento: quanto você pensa em\ninvestir por mês — até R$ 150, entre R$ 150 e R$ 500, entre R$ 500 e R$ 1.500,\nentre R$ 1.500 e R$ 5.000, ou acima disso?",
     1),
]

erros = []
for nome, old, new, esperado in REPLACEMENTS:
    achou = texto.count(old)
    if achou != esperado:
        erros.append(f"{nome}: esperava {esperado} ocorrencia(s) de {old!r}, achei {achou}")
        continue
    texto = texto.replace(old, new)

if erros:
    print("FALHOU -- nao escrevi nada:")
    for e in erros:
        print(" -", e)
    sys.exit(1)

try:
    dado = json.loads(texto)
except Exception as e:
    print(f"FALHOU -- JSON invalido depois das trocas: {e}")
    sys.exit(1)

with io.open("/home/user/diolidigital/.fix_perguntas_output.json", "w", encoding="utf-8") as f:
    f.write(texto)

print("OK -- gravado em .fix_perguntas_output.json")
