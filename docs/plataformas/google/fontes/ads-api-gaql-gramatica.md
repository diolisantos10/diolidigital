---
titulo: "Google Ads API — GAQL: gramática da linguagem"
url: https://developers.google.com/google-ads/api/docs/query/grammar?hl=pt-br
capturado_em: 2026-10-02
hash: e0df11470cee254e
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Gramática da linguagem de consulta do Google Ads

Esta página contém a referência da gramática da linguagem de consulta do Google Ads. Para detalhes sobre a estrutura da consulta, consulte Estrutura da consulta.

Referência de gramática

Confira a referência de gramática da linguagem de consulta do Google Ads (na notação de expressão regular):

Query            -> SelectClause FromClause? WhereClause? OrderByClause?
                    LimitClause? ParametersClause?
SelectClause     -> SELECT FieldName ("," FieldName)*
FromClause       -> FROM ResourceName
WhereClause      -> WHERE Condition (AND Condition)*
OrderByClause    -> ORDER BY Ordering ("," Ordering)*
LimitClause      -> LIMIT PositiveInteger
ParametersClause -> PARAMETERS Literal "=" Value ("," Literal "=" Value)*

Condition        -> FieldName IS NULL
                  | FieldName IS NOT NULL
                  | FieldName BETWEEN Value AND Value
                  | FieldName Operator Value
Operator         -> "=" | "!=" | ">" | ">=" | "<" | "<=" | IN | NOT IN
                  | LIKE | NOT LIKE | CONTAINS ANY | CONTAINS ALL
                  | CONTAINS NONE | DURING
                  | REGEXP_MATCH | NOT REGEXP_MATCH
Value            -> Literal | LiteralList | Number | NumberList | String
                  | StringList | Function
Ordering         -> FieldName (ASC | DESC)?

FieldName        -> [a-z]([a-zA-Z0-9._])*
ResourceName     -> [a-z]([a-zA-Z0-9_])*

StringList       -> "(" String ("," String)* ")"
LiteralList      -> "(" Literal ("," Literal)* ")"
NumberList       -> "(" Number ("," Number)* ")"

PositiveInteger  -> [1-9]([0-9])*
Number           -> -?[0-9]+(\.[0-9]+)?
String           -> ("'" SingleQuoteChar* "'") | ('"' DoubleQuoteChar* '"')
SingleQuoteChar  -> [^'\\\r\n] | EscapeSequence
DoubleQuoteChar  -> [^"\\\r\n] | EscapeSequence
EscapeSequence   -> "\\" ("\\" | "'" | '"' | "n" | "r" | "t")
Literal          -> [a-zA-Z]([a-zA-Z0-9_])*

Function         -> LAST_14_DAYS | LAST_30_DAYS | LAST_7_DAYS
                  | LAST_BUSINESS_WEEK | LAST_MONTH | LAST_WEEK_MON_SUN
                  | LAST_WEEK_SUN_SAT | THIS_MONTH | THIS_WEEK_MON_TODAY
                  | THIS_WEEK_SUN_TODAY | TODAY | YESTERDAY

? indica um elemento opcional.
* significa zero ou mais; + significa um ou mais.
(...) indica um agrupamento, enquanto "(" e ")" indicam parênteses literais.
[a-z0-9] significa intervalos de caracteres, e [^...] significa qualquer caractere, exceto os listados.
| significa "ou".
Regras e limitações

O FromClause é obrigatório ao consultar GoogleAdsService e precisa ser omitido ao consultar GoogleAdsFieldService.

O WhereClause só permite combinar condições com AND. O OR lógico não é compatível. Use o operador IN ou REGEXP_MATCH.

O operador REGEXP_MATCH usa a sintaxe RE2.

Para corresponder a um literal [, ], % ou _ usando o operador LIKE, coloque o caractere entre colchetes. Por exemplo, a condição a seguir corresponde a todos os valores campaign.name que começam com [Earth_to_Mars]:

campaign.name LIKE '[[]Earth[_]to[_]Mars[]]%'

O operador LIKE só pode ser usado em um campo de string, não em uma matriz.

Anterior
Visão geral
Avançar
Estrutura da consulta
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-09-30 UTC.