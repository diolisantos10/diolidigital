# Test drive do departamento de Branding — 03/10/2026

> Mandato do CEO: fazer os brand books **pela agência** (telas e agentes
> dela), anotar o que não existe ou falha, e estruturar o departamento.
> Marcas: Santioh, Dilee, Queise, Dilix (têm logo) · DDF, Push Vendas (nada).
> Medição feita no **código**. O banco de produção não foi lido.

## O percurso que um cliente página em branco deveria fazer

| # | Etapa | O que existe hoje | O que falta |
|---|---|---|---|
| 1 | **Cadastro** | Novo Cliente: nome, setor, status, site, descrição. | Campo "tem logo/marca? (sim/não/parcial)" e o link da pasta do Drive já no cadastro. |
| 2 | **Briefing de marca** | Ficha de marca com 9 campos na página do cliente. A Base de marca da esteira devolve "lacuna" onde o dono não contou nada. | Um briefing curto de marca (5–6 perguntas fechadas) que abra do cliente, sem passar por SDR, proposta e projeto. |
| 3 | **Pedir o brand book** | Só pela esteira de PROJETO: o serviço contratado precisa conter "identidade/logo/marca/branding" (`run-execution.ts`, `criandoIdentidade`). Cliente cadastrado à mão não tem esse caminho. **Por isso a Sala dos Agentes mostra Branding "Sem uso".** | Botão **"Criar brand book"** na página do cliente, que abre o projeto de branding e dispara a esteira. |
| 4 | **2 ou 3 rotas** | **Não existe.** "Base de marca" (texto) e "Identidade visual" (direção de arte) produzem UMA versão. | O especialista devolve 2–3 rotas: conceito, paleta, par de fontes livres, voz e 3 aplicações. |
| 5 | **Escolha com um toque** | **Não existe.** | Tela que mostra as rotas lado a lado. O CEO escolhe uma (ou mistura) e ela grava na ficha. |
| 6 | **Logo** | `logo.ts`: o símbolo vem da IA de imagem e o nome é composto em **SVG** (letra certa por construção). Entra no "Kit de marca". | Rodar por rota. Para quem já tem logo (Santioh, Dilee, Queise, Dilix), **pular** a geração e usar o logo existente. |
| 7 | **Brand book final** | `montarManual` gera o manual em TEXTO dentro da entrega "Kit de marca" (aparece em Entregas do projeto). | PDF de entrega: a capacidade "arquivo PDF" está declarada **ausente** em `capacidade-de-producao.ts`. |
| 8 | **Assets nos Ativos de Marca** | **Corrigido neste PR:** a tela lia dados de exemplo, estava em inglês e não tinha botão. | O kit gerado entra como material de marca (logo, manual) automaticamente, sem subir à mão. |

## O que falhou no test drive (achados)

1. **Ativos de Marca** mostrava dados de exemplo e "No assets found" em inglês, sem ação. **Corrigido aqui:** clientes do banco, o material real e o envio na mesma tela.
2. **Branding "Sem uso"**: o departamento só roda dentro de um projeto cujo serviço diga "identidade/marca". Não há porta a partir do cliente.
3. **Catálogo vende o que não se produz**: "Identidade básica" (logo + paleta + tipografia, R$ 480) está à venda, e "logotipo do cliente" e "arquivo PDF" estão declarados ausentes.
4. **Rotas e escolha** não existem: a agência entrega uma marca só, sem opção.
5. **Depende de IA:** Base de marca, Identidade visual e símbolo do logo param sem chave. Isso espera o cofre (#108 da Control Room).

## Ordem de construção (um PR por item, sem merge sem o ok do CEO)

1. **Este PR:** Ativos de Marca real + este diagnóstico. Sem IA.
2. **Botão "Criar brand book"** na página do cliente → projeto de branding com `fromScratch` e esteira disparada. Quem tem logo marca "já tem logo" e o logo existente é usado. Sem IA para o caminho; a geração espera o cofre.
3. **Rotas (2–3)** no especialista de Identidade visual + **tela de escolha** com gravação na ficha. A tela não depende de IA; o conteúdo sim.
4. **Kit vira material de marca automaticamente** e o **manual sai em PDF**. Sem IA.
5. **Catálogo honesto:** "Identidade básica" só aparece à venda quando 2–4 estiverem no ar.

## Custo estimado (sem fonte de preço verificada)

Cerca de US$ 2–3 de IA por marca com 3 rotas. Para as 6 marcas: cerca de US$ 12–18.

## Caso real: material de várias marcas numa pasta só (03/10/2026)

O CEO juntou tudo numa pasta "PASTA PARA BRANDING" do Drive da agência, sem
subpasta: brand books de City Jobs, Dioli Digital, Sushi Cazza e FOOCCI (CRM),
logos de Santioh e Queise, `.zip` de logos e 15 imagens sem pista no nome.

| Achado | Estado |
|---|---|
| A importação só lia SUBPASTAS. Arquivo solto na pasta principal era ignorado. | **Corrigido neste PR:** botão "Importar soltos". O tipo é tirado do nome; sem pista, o arquivo entra sem papel e não é recusado. |
| "SANTIOH_logo.png" não era reconhecido como logo (`_` colado na palavra). | **Corrigido neste PR.** |
| `.zip` (CityJobs_Logos_SVG, SANTIOH.zip) não é aceito. | Falta: abrir o zip e importar o conteúdo. |
| Pasta com várias marcas: não há como dizer de qual cliente é cada arquivo. | Falta: triagem por marca (nome do cliente no arquivo; senão, a IA olha a imagem ou pergunta com um toque). |
| Imagens sem pista no nome (1.jpg…6.jpg, "ChatGPT Image…", News.png). | Entram sem papel. Falta a IA olhar a imagem e sugerir (depende do cofre). |
| Esta sessão não tem acesso ao Drive da agência. | Ligar os brand books existentes aos cadastros depende de alguém com acesso subir os PDFs na pasta "Brand book" de cada cliente (ou de compartilhar a pasta com a conta técnica). |
