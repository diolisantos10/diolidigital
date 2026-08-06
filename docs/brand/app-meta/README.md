# Ícone do app da Meta

`icone-1024.png` — **1024×1024, PNG sem canal alfa, quadrado cheio.**

## Por que ele mora aqui

Em 06/08/2026 o CEO tentou subir vários ícones no painel da Meta e nenhum passou.
A causa era **transparência**: a Meta recusa PNG com canal alfa e não diz por quê
— o botão simplesmente não avança. Os arquivos que ele tinha eram a marca sobre
fundo vazio.

Este foi gerado a partir do SVG oficial (`docs/brand/logo/`), com fundo ciano
chapado, e conferido byte a byte: tipo de cor **2** (RGB sem alfa).

**Também não tem canto arredondado** — a Meta arredonda sozinha; entregar já
arredondado produz borda dupla.

## Como refazer

O gerador é curto e vive no histórico deste commit. Em resumo: renderizar o SVG
centralizado num quadrado de 1024 com fundo `#9BF6F5` e capturar **sem**
`omitBackground` — é essa opção que decide se o alfa entra.

**Confira sempre antes de entregar:** o byte 25 do PNG precisa ser `2`. Se for
`6`, tem alfa e a Meta vai recusar de novo.
