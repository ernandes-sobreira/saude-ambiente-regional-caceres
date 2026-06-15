# 🌿 Painel Saúde & Ambiente — Regional de Saúde de Cáceres (MT)

Plataforma interativa de **inteligência territorial** que integra dados de
**saúde** (internações e óbitos) e **ambiente** (clima, qualidade do ar e uso
da terra) dos **14 municípios** da Regional de Saúde de Cáceres, no sudoeste de
Mato Grosso. Foi concebida para **apoiar a decisão pública** — gestores,
técnicos da saúde, cientistas e a comunidade.

> Inspirada na lógica de painéis como o IPS-Brasil, mas dedicada às relações
> **saúde × ambiente** da regional, com estatística aplicada e recomendações
> orientadas por marcos legais (CONAMA, OMS, Código Florestal, Marco do
> Saneamento, etc.).

## ✨ O que a plataforma faz

| Seção | Descrição |
|---|---|
| **Visão Geral Regional** | KPIs da regional, ranking de prioridade dos municípios, principais agravos, qualidade do ar e tendências climáticas. |
| **Prioridades & Decisão** | Índice de Prioridade composto, matriz detalhada ordenável e recomendações de ação por município. |
| **Perfil do Município** | Escolha um município e veja **tudo**: agravos, evolução, sazonalidade, clima local, uso da terra, correlações e *o que fazer*. |
| **Comparar** | Compare **municípios**, **anos** e **meses** lado a lado (barras, radar, séries, KPIs). |
| **Sazonalidade** | Climatologia mensal e heatmaps ano × mês — revela *quando* agir. |
| **Saúde × Ambiente** | Matriz de **correlações** (Pearson), tabela das relações mais fortes e dispersão interativa. |
| **Ambiente & Clima** | PM2.5/PM10 vs. CONAMA/OMS, temperatura, água e transformação da paisagem (1985→2024). |
| **Marcos Legais** | Referência rápida de padrões de qualidade do ar e legislação aplicável. |
| **Sobre & Metodologia** | Fontes, métodos estatísticos, pesos do índice e limitações. |

## 📊 Dados

- **Internações (SIH/SUS)** — DATASUS, **por município de residência**,
  **mensal**, 2010–2025 (dados até abr/2026 usados na climatologia), 14 grupos
  de agravos (CID-10). Cobertura completa dos 14 municípios.
- **Óbitos (SIM/DO)** — DATASUS, por residência, **anual**, 2010–2024,
  8 categorias (inclui doenças infecciosas/parasitárias A00-B99).
- **Atmosfera/Clima** — MapBiomas / BR-DWGD, 1985–2024, anual e **mensal**
  (temperatura, precipitação, PM2.5, PM10, déficit de pressão de vapor, dias sem
  chuva, disponibilidade de água).
- **Uso e cobertura da terra** — MapBiomas Coleção 9, 1985–2024 (25 classes
  agregadas em macroclasses).
- **População** — IBGE Censo 2022 (para taxas por 100 mil habitantes).

> **Análises mensais:** a plataforma usa as internações mensais e a climatologia
> mensal do clima para revelar relações sazonais (ex.: dengue × chuva ao longo
> dos 12 meses). Os óbitos (SIM) são anuais.
>
> **Nota de reconciliação:** os arquivos de origem trazem códigos IBGE
> inconsistentes para alguns municípios; a junção é feita pelo **nome
> normalizado**, reatribuindo o código IBGE oficial e a população.

## 🧮 Índice de Prioridade

Composto transparente, normalizado 0–100 entre os municípios:

- **40% Carga de saúde** — taxa recente por 100 mil hab. (todos os grupos).
- **20% Agravamento** — proporção de agravos com tendência de alta.
- **40% Pressão ambiental** — PM2.5/PM10 vs. OMS, aquecimento e perda florestal.

## 🏗️ Arquitetura

Site **estático**, sem backend — roda direto no navegador e em GitHub Pages.

```
.
├── index.html                 # shell da aplicação (SPA)
├── assets/
│   ├── css/style.css          # design system
│   ├── js/
│   │   ├── echarts.min.js     # biblioteca de gráficos (vendorizada, offline)
│   │   ├── charts.js          # fábrica de gráficos (tema unificado)
│   │   ├── recommendations.js # motor de apoio à decisão (alertas/ações)
│   │   └── app.js             # roteador + 9 views
│   └── data/dados.js          # dados pré-processados (window.DADOS)
├── data/raw/                  # CSVs brutos (saúde + ambiente)
└── etl/
    ├── build_data.py          # ETL: processa CSVs → assets/data/dados.js
    └── _smoketest.js          # teste de fumaça (jsdom) de todas as views
```

## 🚀 Como usar

**Visualizar** (basta abrir no navegador):

```bash
# opção 1: abrir index.html diretamente, ou
python3 -m http.server 8080   # e acessar http://localhost:8080
```

**Reprocessar os dados** (após atualizar os CSVs em `data/raw/`):

```bash
pip install pandas numpy scipy
python3 etl/build_data.py
```

**Testar** (verifica todas as views sem erros de runtime):

```bash
npm install        # instala jsdom
npm test
```

## 📜 Marcos legais de referência

CONAMA 491/2018 (qualidade do ar) · Diretrizes OMS 2021 · Código Florestal
(Lei 12.651/2012) · SNUC (Lei 9.985/2000) · PNMC (Lei 12.187/2009) · Marco do
Saneamento (Lei 11.445/2007) · Portaria GM/MS 888/2021 (potabilidade da água).

## ⚠️ Limitações

Ferramenta de **triagem comparativa** e apoio à decisão — não substitui
diagnóstico clínico/epidemiológico. Correlações são anuais e contemporâneas
(não provam causalidade). Combine sempre com vigilância local e conhecimento de
campo.

---
*Dados de domínio público. Plenamente reprodutível via `etl/build_data.py`.*
