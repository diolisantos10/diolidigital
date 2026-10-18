# Auditoria preliminar das logos

## Veredito

O cabecalho atual do Portal do Cliente esta incorreto: a marca da Dioli aparece como o texto `O°`, enquanto o Brand Book define um simbolo formado por dois aneis proprios. Um glifo de grau nao preserva espessura, proporcao, centro, espacamento ou relacao entre os dois circulos.

## Fonte visual conferida

- `docs/brand/Dioli_Digital_Brand_Book_v1.pdf`
- Brand Book anexado pelo CEO, versao 1.0, pagina 7 - Identidade Visual.

Os dois PDFs sao byte a byte o mesmo arquivo. SHA-256 confirmado em 15/08/2026:

```text
64a4a502f74d5f8ff0d651fc089f5ea559bd568091ee485295b064505669f38f
```

O Brand Book define:

- dois circulos minimalistas;
- anel maior a esquerda;
- anel menor a direita;
- proporcao e espacamento fixos;
- versao navy para fundo claro e branca para fundo escuro;
- assinatura completa `Dioli DIGITAL` quando o contexto pedir lockup.

## Ocorrencias confirmadas

### Erro de implementacao

`app/portal/access/[token]/page.tsx` usa:

```tsx
<i aria-hidden>O°</i>
<b>Dioli</b>
```

Isso deve ser substituido por `components/brand/DioliLogo.tsx` ou pelo componente oficial que resultar da auditoria final.

A busca atual encontrou essa ocorrencia de `O°` na interface de producao. A auditoria final ainda deve procurar logos em imagem, CSS, e-mail e arquivos gerados, porque uma busca textual nao detecta distorcao de asset.

### Assets que exigem cuidado

- `docs/brand/logo/1.svg` ate `7.svg`: alguns incluem imagem raster embutida, fundo e viewBox de exportacao. Nao sao fonte recomendada de runtime.
- `docs/brand/logo/dioli-logo-horizontal-clean.svg`: deve ser tratado como derivado antigo ate validacao.
- `public/brand/dioli-mark-navy.svg`, `dioli-mark-white.svg`, `dioli-logo-h-navy.svg` e `dioli-logo-h-white.svg`: sao os candidatos atuais de runtime, mas precisam ser comparados com o asset mestre mais recente enviado pelo CEO.

## Regra de fonte oficial

Quando o CEO enviar os assets, registrar nesta ordem:

1. nome e data do pacote recebido;
2. arquivo mestre escolhido;
3. hash SHA-256;
4. versoes derivadas autorizadas;
5. superficies atualizadas;
6. assets antigos descontinuados, sem apaga-los antes do inventario.

Se o pacote mais recente divergir do Brand Book v1.0, o arquiteto deve parar e pedir decisao. Nao escolher silenciosamente.

## Checklist visual

- O anel maior e perfeitamente circular.
- O anel menor mantem a proporcao oficial.
- Os dois centros e a distancia entre aneis batem com o mestre.
- A espessura do contorno nao varia por tamanho.
- O logo nao e esticado por CSS.
- `object-fit: contain` em qualquer caixa responsiva.
- Area de respiro respeitada.
- Navy somente em fundo claro; branco somente em fundo escuro.
- Nenhum avatar, inicial ou circulo generico substitui a marca da agencia.
- Texto `Dioli` nao e composto em fonte aproximada quando o lockup oficial estiver disponivel.

## Criterio de aceite

O PR deve conter uma tabela de antes/depois com todas as superficies encontradas. A auditoria so fecha quando cada superficie aponta para um asset aprovado e nao resta nenhuma ocorrencia de marca criada com texto (`O°`, `Oo`, `O o` ou equivalentes).
