# -*- coding: utf-8 -*-
"""
ETL — Plataforma Saúde & Ambiente | Regional de Saúde de Cáceres (MT)
=====================================================================
Lê os CSVs brutos (saúde SIH/SUS + SIM/DO e ambiente MapBiomas/BR-DWGD),
reconcilia municípios pelo código IBGE, calcula taxas por 100 mil hab.,
correlações saúde×ambiente (Pearson/Spearman), tendências (Theil-Sen/
Mann-Kendall simplificado), sazonalidade e um Índice de Prioridade
composto e transparente. Exporta tudo para assets/data/dados.js como um
objeto global window.DADOS (funciona em file:// e GitHub Pages, sem backend).

Autor: Plataforma construída para a Regional de Saúde de Cáceres.
"""
import pandas as pd, numpy as np, json, unicodedata, os
from scipy import stats

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "data")
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------------------
# 1. MUNICÍPIOS — população IBGE Censo 2022, indexada por NOME (fonte da verdade)
# ---------------------------------------------------------------------------
# IMPORTANTE: os CSVs de origem (saúde e ambiente) usam um esquema de códigos
# que NÃO corresponde ao código IBGE oficial em alguns municípios (Reserva do
# Cabaçal, Rio Branco, Salto do Céu e São José dos Quatro Marcos aparecem
# "deslocados"). Saúde e ambiente são consistentes ENTRE SI e os NOMES estão
# corretos em ambos — por isso fazemos a junção pelo NOME normalizado e
# atribuímos o código IBGE OFICIAL e a população correta a partir do nome.
def normalize(s):
    s=str(s).strip().lower()
    s=''.join(c for c in unicodedata.normalize('NFKD',s) if not unicodedata.combining(c))
    s=s.replace('’',"'").replace('`',"'").replace('´',"'")
    return ' '.join(s.split())

# (código IBGE oficial, nome canônico, população Censo 2022)
MUNIS_CANON = [
    (5101258, "Araputanga", 14786),
    (5102504, "Cáceres", 89478),
    (5103437, "Curvelândia", 4967),
    (5103809, "Figueirópolis d'Oeste", 3112),
    (5103957, "Glória d'Oeste", 2899),
    (5104500, "Indiavaí", 2194),
    (5105002, "Jauru", 8367),
    (5105234, "Lambari d'Oeste", 4724),
    (5105622, "Mirassol d'Oeste", 26785),
    (5106828, "Porto Esperidião", 10204),
    (5107107, "Reserva do Cabaçal", 2062),
    (5107156, "Rio Branco", 4489),
    (5107206, "Salto do Céu", 3679),
    (5107750, "São José dos Quatro Marcos", 17849),
]
POP2022       = {c:p for c,n,p in MUNIS_CANON}
NOME_CANONICO = {c:n for c,n,p in MUNIS_CANON}
NORM2COD      = {normalize(n):c for c,n,p in MUNIS_CANON}
def cod_por_nome(nome):
    return NORM2COD.get(normalize(nome))

# ---------------------------------------------------------------------------
# 2. SAÚDE — internações (SIH, mensal 2010–2025) + óbitos (SIM, anual 2010–2024)
#    Dados por MUNICÍPIO DE RESIDÊNCIA (cobertura completa dos 14 municípios).
# ---------------------------------------------------------------------------
# arquivos de internação (SIH/SUS), mensais
SIH_FILES = ['animais-peconhentos','asma','cardiovascular','causas-externas',
    'dengue','desnutricao','dpoc','gastroenterites','malaria','neoplasias',
    'pneumonia','renal-urinario','respiratorio','transtornos-mentais']
# arquivos de óbitos (SIM/DO), anuais (mes=0 = total do ano). Mapeia nome->grupo SIM.
SIM_FILES = {
    'neoplasias_SIM_anual':'NEOPLASIAS', 'cardiovascular_SIM':'CARDIOVASCULAR',
    'respiratorio_SIM':'RESPIRATORIO', 'renal-urinario_SIM':'RENAL_URINARIO',
    'desnutricao_SIM':'DESNUTRICAO', 'transtornos-mentais_SIM':'TRANSTORNOS_MENTAIS',
    'causas-externas_SIM':'CAUSAS_EXTERNAS', 'infecciosas_SIM':'INFECCIOSAS',
}
# normaliza nomes de grupo (arquivos usam hífens / nomes curtos) -> chave canônica
GROUP_NORM = {
    'DENGUE':'DENGUE', 'MALARIA':'LEISHMANIOSE_MALARIA',
    'GASTROENTERITES':'DIARREICAS_GASTROENTERITES', 'ASMA':'ASMA', 'DPOC':'DPOC',
    'PNEUMONIA':'PNEUMONIA', 'RESPIRATORIO':'RESPIRATORIO', 'CARDIOVASCULAR':'CARDIOVASCULAR',
    'NEOPLASIAS':'NEOPLASIAS', 'RENAL-URINARIO':'RENAL_URINARIO', 'DESNUTRICAO':'DESNUTRICAO',
    'CAUSAS-EXTERNAS':'CAUSAS_EXTERNAS', 'TRANSTORNOS-MENTAIS':'TRANSTORNOS_MENTAIS',
    'ANIMAIS-PECONHENTOS':'ANIMAIS_PECONHENTOS',
}

# metadados de cada grupo de doença: rótulo amigável, eixo ambiental associado
GRUPO_META = {
    'DENGUE': dict(label='Dengue', cat='Vetorial / Climática', cor='#e74c3c',
        amb=['precip','temp_media','dias_sem_chuva'],
        desc='Arbovirose transmitida pelo Aedes aegypti. Fortemente sazonal e sensível a temperatura e chuvas (criadouros).'),
    'LEISHMANIOSE_MALARIA': dict(label='Malária / Leishmaniose', cat='Vetorial / Climática', cor='#c0392b',
        amb=['precip','temp_media','floresta'],
        desc='Doenças vetoriais (B50-B64) associadas a ambientes florestais/ribeirinhos, desmatamento e clima.'),
    'DIARREICAS_GASTROENTERITES': dict(label='Diarreicas e Gastroenterites', cat='Hídrica / Saneamento', cor='#16a085',
        amb=['temp_media','disp_agua','precip'],
        desc='Doenças de veiculação hídrica/alimentar (CID A00-A09). Relacionadas a saneamento, água e temperatura.'),
    'ASMA': dict(label='Asma', cat='Respiratória / Ar', cor='#2980b9',
        amb=['pm25','pm10','dias_sem_chuva'],
        desc='Doença respiratória crônica (J45-J46) agravada por material particulado, fumaça de queimadas e ar seco.'),
    'DPOC': dict(label='DPOC e outras respiratórias crônicas', cat='Respiratória / Ar', cor='#8e44ad',
        amb=['pm25','pm10','vpd'],
        desc='Doença Pulmonar Obstrutiva Crônica (J40-J44). Exacerbações ligadas à poluição do ar e queimadas.'),
    'PNEUMONIA': dict(label='Pneumonia', cat='Respiratória / Ar', cor='#2c3e50',
        amb=['pm25','pm10','temp_media'],
        desc='Infecção respiratória aguda (J12-J18). Incidência sobe com poluição do ar e variações climáticas.'),
    'RESPIRATORIO': dict(label='Doenças Respiratórias (geral J00-J99)', cat='Respiratória / Ar', cor='#3498db',
        amb=['pm25','pm10','dias_sem_chuva'],
        desc='Conjunto amplo de doenças do aparelho respiratório. Marcador de qualidade do ar.'),
    'CARDIOVASCULAR': dict(label='Doenças Cardiovasculares', cat='Crônica / Ar+Calor', cor='#d35400',
        amb=['pm25','temp_max','temp_media'],
        desc='Doenças do aparelho circulatório (I00-I99). Material particulado fino (PM2.5) e ondas de calor elevam o risco.'),
    'NEOPLASIAS': dict(label='Neoplasias (câncer)', cat='Crônica', cor='#7f8c8d',
        amb=['pm25','agropecuaria'],
        desc='Tumores (CID C00-D48). Inclui óbitos (SIM) e internações (SIH). Exposição crônica a poluentes e agrotóxicos é fator de longo prazo.'),
    'RENAL_URINARIO': dict(label='Doenças Renais e Urinárias', cat='Crônica / Calor', cor='#f39c12',
        amb=['temp_max','dias_sem_chuva','disp_agua'],
        desc='Doenças do aparelho geniturinário (N00-N39). Calor extremo e desidratação são fatores de risco.'),
    'DESNUTRICAO': dict(label='Desnutrição', cat='Social / Alimentar', cor='#95a5a6',
        amb=['disp_agua','precip'],
        desc='Deficiências nutricionais (E40-E46). Marcador de vulnerabilidade social e segurança alimentar.'),
    'CAUSAS_EXTERNAS': dict(label='Causas Externas', cat='Externa', cor='#34495e',
        amb=['temp_media'],
        desc='Lesões, acidentes e violência (V01-Y98). Relevante para vigilância, embora menos ligada ao clima.'),
    'TRANSTORNOS_MENTAIS': dict(label='Transtornos Mentais', cat='Saúde Mental', cor='#9b59b6',
        amb=['temp_max','dias_sem_chuva'],
        desc='Transtornos mentais e comportamentais (F00-F99). Calor extremo e estresse ambiental são fatores emergentes.'),
    'ANIMAIS_PECONHENTOS': dict(label='Acidentes por Animais Peçonhentos', cat='Ambiental direta', cor='#27ae60',
        amb=['precip','temp_media','floresta'],
        desc='Acidentes por animais peçonhentos (X20-X29). Sazonal, ligado a chuvas, calor e ambiente rural/florestal.'),
}

# rótulos das categorias de óbito (SIM), inclui INFECCIOSAS (sem par no SIH)
OBITO_META = {
    'NEOPLASIAS':'Neoplasias', 'CARDIOVASCULAR':'Cardiovasculares',
    'RESPIRATORIO':'Respiratórias', 'RENAL_URINARIO':'Renais e urinárias',
    'DESNUTRICAO':'Desnutrição', 'TRANSTORNOS_MENTAIS':'Transtornos mentais',
    'CAUSAS_EXTERNAS':'Causas externas', 'INFECCIOSAS':'Infecciosas e parasitárias (A00-B99)',
}

# --- lê internações (SIH) ---
frames=[]
for f in SIH_FILES:
    df=pd.read_csv(os.path.join(RAW,f+'.csv'),sep=';')
    frames.append(df)
H=pd.concat(frames,ignore_index=True)
H['grupo_doenca']=H.grupo_doenca.map(lambda g:GROUP_NORM.get(str(g).strip(),str(g).strip()))
H['cod']=H.municipio.map(cod_por_nome)
nao_mapeados=sorted(H[H.cod.isna()].municipio.unique())
if nao_mapeados: print("AVISO: municípios de saúde não mapeados:", nao_mapeados)
H=H[H.cod.notna()].copy()
H['ano']=H.ano.astype(int); H['mes']=H.mes.astype(int); H['valor']=H.valor.astype(float)
H['cod']=H.cod.astype(int)
# 2026 é parcial (jan-abr) -> mantém para sazonalidade mensal, mas o eixo anual
# usa apenas anos completos (2010–2025)
ANO_MIN_SAUDE, ANO_MAX_SAUDE = 2010, 2025
H_ANUAL = H[H.ano<=ANO_MAX_SAUDE]   # para séries/totais anuais
# H (completo, inclui 2026 parcial) é usado só na climatologia mensal

# --- lê óbitos (SIM), anuais (mes=0) ---
sim_rows=[]
for f,grp in SIM_FILES.items():
    df=pd.read_csv(os.path.join(RAW,f+'.csv'),sep=';')
    df['cod']=df.municipio.map(cod_por_nome)
    df=df[df.cod.notna()].copy()
    df['ano']=df.ano.astype(int); df['valor']=df.valor.astype(float); df['cod']=df.cod.astype(int)
    df['ogrupo']=grp
    sim_rows.append(df[['cod','ano','valor','ogrupo']])
SIM=pd.concat(sim_rows,ignore_index=True)
ANO_MAX_OBITO=int(SIM.ano.max())

# óbitos por município x categoria x ano -> obitos_anual
obitos_anual={}
for (cod,grp),g in SIM.groupby(['cod','ogrupo']):
    obitos_anual.setdefault(int(cod),{})[grp]={int(r.ano):int(r.valor) for _,r in g.iterrows()}


# ---------------------------------------------------------------------------
# 3. AMBIENTE — atmosfera anual (BR-DWGD/MapBiomas) + cobertura do solo
# ---------------------------------------------------------------------------
A=pd.read_csv(os.path.join(RAW,'mapbiomas_atmosfera_municipios_MT_1985_2024.csv'))
A['cod']=A.territorio.map(cod_por_nome)
A=A[A.cod.notna()].copy(); A['cod']=A.cod.astype(int)
A['ano']=A.ano.astype(int); A['valor']=A.valor.astype(float)

VAR_MAP = {  # chave bruta -> (id curto, rótulo, unidade)
 'atmosphere_annual_mean_air_temperature':('temp_media','Temperatura média do ar','°C'),
 'atmosphere_annual_maximum_air_temperature':('temp_max','Temperatura máxima do ar','°C'),
 'atmosphere_annual_minimum_air_temperature':('temp_min','Temperatura mínima do ar','°C'),
 'atmosphere_annual_mean_surface_temperature':('temp_sup','Temperatura da superfície','°C'),
 'atmosphere_annual_precipitation':('precip','Precipitação anual','mm'),
 'atmosphere_annual_number_of_days_without_rain':('dias_sem_chuva','Dias sem chuva no ano','dias'),
 'atmosphere_annual_number_of_days_with_persistent_rain':('dias_chuva','Dias de chuva persistente','dias'),
 'atmosphere_annual_water_availability':('disp_agua','Disponibilidade de água','mm'),
 'atmosphere_annual_vapor_pressure_deficit':('vpd','Déficit de pressão de vapor','kPa'),
 'atmosphere_annual_inhalable_particulate_matter_pm10':('pm10','Material particulado PM10','µg/m³'),
 'atmosphere_annual_fine_particulate_matter_pm2_5':('pm25','Material particulado PM2.5','µg/m³'),
}
A['vid']=A.chave.map(lambda k: VAR_MAP.get(k,(None,))[0])
A=A[A.vid.notna()]

# cobertura do solo
L=pd.read_csv(os.path.join(RAW,'mapbiomas_cobertura_uso_terra_municipios_MT_1985_2024.csv'))
L.columns=[c.strip().replace('﻿','') for c in L.columns]
L['cod']=L.territorio.map(cod_por_nome)
L=L[L.cod.notna()].copy(); L['cod']=L.cod.astype(int)
L['ano']=L.ano.astype(int); L['area_ha']=L.area_ha.astype(float)

# agrupa as 25 classes em macro-classes interpretáveis
MACRO = {
 'floresta':['Floresta','Formação Florestal','Floresta Alagável','Formação Savânica'],
 'campestre':['Formação Campestre','Vegetação Herbácea e Arbustiva','Campo Alagado e Área Pantanosa'],
 'agua':["Corpo D'Água",'Rio, Lago e Oceano','Aquicultura'],
 'pastagem':['Pastagem'],
 'agricultura':['Agricultura','Lavoura Temporária','Soja','Cana','Algodão (beta)',
                'Outras Lavouras Temporárias','Silvicultura','Mosaico de Usos','Agropecuária'],
 'urbano':['Área Urbanizada'],
 'naoveg':['Afloramento Rochoso','Mineração','Outras Áreas não Vegetadas','Área não Vegetada'],
}
classe2macro={c:m for m,cs in MACRO.items() for c in cs}
L['macro']=L.classe.map(classe2macro).fillna('outros')

# atmosfera MENSAL (para climatologia/sazonalidade ambiental)
M=pd.read_csv(os.path.join(RAW,'mapbiomas_atmosfera_mensal_municipios_MT_1985_2024.csv'))
M['cod']=M.territorio.map(cod_por_nome)
M=M[M.cod.notna()].copy(); M['cod']=M.cod.astype(int)
M['ano']=M.ano.astype(int); M['mes']=M.mes.astype(int); M['valor']=M.valor.astype(float)
VAR_MAP_MENSAL={
 'atmosphere_monthly_mean_air_temperature':'temp_media',
 'atmosphere_monthly_maximum_air_temperature':'temp_max',
 'atmosphere_monthly_minimum_air_temperature':'temp_min',
 'atmosphere_monthly_mean_land_surface_temperature':'temp_sup',
 'atmosphere_monthly_precipitation':'precip',
 'atmosphere_monthly_number_of_days_without_rain':'dias_sem_chuva',
 'atmosphere_monthly_number_of_days_with_persistent_rain':'dias_chuva',
 'atmosphere_monthly_water_availability':'disp_agua',
 'atmosphere_monthly_vapor_pressure_deficit':'vpd',
 'atmosphere_monthly_inhalable_particulate_matter_pm10':'pm10',
 'atmosphere_monthly_fine_particulate_matter_pm2_5':'pm25',
}
M['vid']=M.chave.map(VAR_MAP_MENSAL)
M=M[M.vid.notna()]

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def r2(x): return None if pd.isna(x) else round(float(x),2)
def r3(x): return None if pd.isna(x) else round(float(x),3)

def tendencia(years, vals):
    """Theil-Sen slope + sinal de significância (Spearman ano×valor)."""
    if len(years)<4: return None
    try:
        sl,ic,lo,hi=stats.theilslopes(vals, years)
        rho,p=stats.spearmanr(years, vals)
        return dict(slope=r3(sl), p=r3(p), rho=r2(rho))
    except Exception:
        return None

# ===========================================================================
# 4. SÉRIES DE SAÚDE (anual e mensal) por município e grupo
# ===========================================================================
# internações anuais (SIH) — soma mensal por ano (anos completos 2010–2025)
ha = (H_ANUAL.groupby(['cod','grupo_doenca','ano'])['valor'].sum().reset_index())
saude_anual={}   # cod -> grupo -> {ano: {sih, sim}}
for (cod,grupo),g in ha.groupby(['cod','grupo_doenca']):
    d={}
    for _,r in g.iterrows():
        d[int(r.ano)]={'sih':int(r.valor),'sim':0}
    saude_anual.setdefault(int(cod),{})[grupo]=d
# óbitos anuais (SIM) somados ao campo .sim dos grupos correspondentes
for cod,gd in obitos_anual.items():
    for ogrupo,serie in gd.items():
        if ogrupo not in GRUPO_META: continue   # INFECCIOSAS não tem par no SIH
        for a,v in serie.items():
            saude_anual.setdefault(cod,{}).setdefault(ogrupo,{}).setdefault(a,{'sih':0,'sim':0})
            saude_anual[cod][ogrupo][a]['sim']=int(v)

# mensal (climatologia/sazonalidade) — média por mês ao longo dos anos (inclui 2026 parcial)
hm=(H.groupby(['cod','grupo_doenca','mes'])['valor'].mean().reset_index())
saude_sazonal={}
for (cod,grupo),g in hm.groupby(['cod','grupo_doenca']):
    arr=[0.0]*12
    for _,r in g.iterrows(): arr[int(r.mes)-1]=r2(r.valor)
    saude_sazonal.setdefault(int(cod),{})[grupo]=arr

# mensal completo (heatmap ano×mês) por município x grupo — anos completos
hfull=(H_ANUAL.groupby(['cod','grupo_doenca','ano','mes'])['valor'].sum().reset_index())

# ===========================================================================
# 5. SÉRIES AMBIENTAIS anuais por município x variável
# ===========================================================================
amb_anual={}
for (cod,vid),g in A.groupby(['cod','vid']):
    amb_anual.setdefault(int(cod),{})[vid]={int(r.ano):r2(r.valor) for _,r in g.iterrows()}

# climatologia mensal ambiental: cod -> vid -> [12 médias mensais]
amb_sazonal={}
mclim=M.groupby(['cod','vid','mes'])['valor'].mean().reset_index()
for (cod,vid),g in mclim.groupby(['cod','vid']):
    arr=[None]*12
    for _,r in g.iterrows(): arr[int(r.mes)-1]=r2(r.valor)
    amb_sazonal.setdefault(int(cod),{})[vid]=arr

# cobertura do solo: macro-classe -> {ano: area_ha} e composição % recente
land=(L.groupby(['cod','macro','ano'])['area_ha'].sum().reset_index())
cobertura={}
for (cod,macro),g in land.groupby(['cod','macro']):
    cobertura.setdefault(int(cod),{})[macro]={int(r.ano):round(float(r.area_ha),1) for _,r in g.iterrows()}

# ===========================================================================
# 6. CORRELAÇÕES saúde × ambiente (anual, contemporânea) por município
#    Matriz: linhas=grupos de doença, colunas=variáveis ambientais
# ===========================================================================
ENV_COLS=['temp_media','temp_max','pm25','pm10','precip','dias_sem_chuva','disp_agua','vpd']
def serie_saude_anual(cod,grupo):
    d=saude_anual.get(cod,{}).get(grupo,{})
    return {a:(v['sih']+v['sim']) for a,v in d.items()}

correl={}      # cod -> {grupo -> {var -> {r,p,rho,n}}}
correl_reg={}  # regional (soma de todos municípios)
# pré-computa séries regionais
reg_saude={}
for grupo in GRUPO_META:
    s={}
    for cod in POP2022:
        for a,v in serie_saude_anual(cod,grupo).items(): s[a]=s.get(a,0)+v
    reg_saude[grupo]=s
reg_amb={}
for vid in ENV_COLS:
    # média ponderada por população seria ideal; usamos média simples regional
    tmp={}
    for cod in POP2022:
        for a,v in amb_anual.get(cod,{}).get(vid,{}).items():
            tmp.setdefault(a,[]).append(v)
    reg_amb[vid]={a:np.mean(vs) for a,vs in tmp.items()}

def corr_pair(saude_dict, amb_dict):
    anos=sorted(set(saude_dict)&set(amb_dict))
    if len(anos)<5: return None
    x=np.array([amb_dict[a] for a in anos],float)
    y=np.array([saude_dict[a] for a in anos],float)
    if np.std(x)==0 or np.std(y)==0: return None
    r,p=stats.pearsonr(x,y); rho,_=stats.spearmanr(x,y)
    return dict(r=r2(r),p=r3(p),rho=r2(rho),n=len(anos))

for cod in POP2022:
    correl[cod]={}
    for grupo in GRUPO_META:
        sd=serie_saude_anual(cod,grupo)
        if sum(sd.values())==0: continue
        row={}
        for vid in ENV_COLS:
            c=corr_pair(sd, amb_anual.get(cod,{}).get(vid,{}))
            if c: row[vid]=c
        if row: correl[cod][grupo]=row

for grupo in GRUPO_META:
    row={}
    for vid in ENV_COLS:
        c=corr_pair(reg_saude[grupo], reg_amb[vid])
        if c: row[vid]=c
    if row: correl_reg[grupo]=row

# ===========================================================================
# 7. ÍNDICE DE PRIORIDADE (composto, transparente) por município
#    Combina: carga de saúde (taxa/100k recente), tendência de agravamento,
#    pressão ambiental (PM2.5/PM10 vs CONAMA/OMS, calor, perda florestal) e
#    vulnerabilidade (acesso/porte). Cada eixo normalizado 0-100.
# ===========================================================================
ANOS_RECENTES=list(range(2020,ANO_MAX_SAUDE+1))
# padrões de referência (CONAMA 491/2018 final = OMS 2005; OMS 2021)
CONAMA_PM25=10.0   # padrão final CONAMA (média anual)  | PI-1=20
CONAMA_PM10=20.0   # padrão final CONAMA (média anual)  | PI-1=40
OMS_PM25=5.0; OMS_PM10=15.0

def carga_saude(cod):
    pop=POP2022[cod]; tot=0
    for grupo in GRUPO_META:
        d=saude_anual.get(cod,{}).get(grupo,{})
        vs=[ (d[a]['sih']+d[a]['sim']) for a in ANOS_RECENTES if a in d]
        if vs: tot+=np.mean(vs)
    return tot/pop*100000  # taxa anual média por 100k

def tend_agravamento(cod):
    """fração de doenças com tendência de alta significativa."""
    up=0; tot=0
    for grupo in GRUPO_META:
        sd=serie_saude_anual(cod,grupo)
        anos=sorted(sd)
        if len(anos)<6: continue
        tot+=1
        t=tendencia(anos,[sd[a] for a in anos])
        if t and t['slope'] and t['slope']>0 and t['rho'] and t['rho']>0.3: up+=1
    return up/tot if tot else 0

def pressao_ambiental(cod):
    aa=amb_anual.get(cod,{})
    def recent(vid):
        d=aa.get(vid,{}); vs=[d[a] for a in range(2018,2025) if a in d]
        return np.mean(vs) if vs else None
    pm25=recent('pm25'); pm10=recent('pm10')
    # razão vs OMS (quanto acima do limite saudável)
    score=0; n=0
    if pm25: score+=min(pm25/OMS_PM25,4)/4; n+=1
    if pm10: score+=min(pm10/OMS_PM10,4)/4; n+=1
    # aquecimento: tendência de temperatura média (1985-2024)
    td=aa.get('temp_media',{}); anos=sorted(td)
    if len(anos)>10:
        t=tendencia(anos,[td[a] for a in anos])
        if t and t['slope']: score+=min(max(t['slope']*40,0),1); n+=1
    # perda florestal 1985->2024
    fl=cobertura.get(cod,{}).get('floresta',{})
    if fl and 1985 in fl and 2024 in fl and fl[1985]>0:
        perda=max((fl[1985]-fl[2024])/fl[1985],0)
        score+=min(perda*2,1); n+=1
    return score/n if n else 0

# normalização min-max entre municípios
cargas={cod:carga_saude(cod) for cod in POP2022}
tends={cod:tend_agravamento(cod) for cod in POP2022}
pres={cod:pressao_ambiental(cod) for cod in POP2022}
def norm(d):
    vs=list(d.values()); lo,hi=min(vs),max(vs)
    return {k:(0 if hi==lo else (v-lo)/(hi-lo)) for k,v in d.items()}
ncarga,ntend,npres=norm(cargas),tends,norm(pres)

prioridade={}
W=dict(carga=0.40, tend=0.20, amb=0.40)  # pesos documentados
for cod in POP2022:
    score=100*(W['carga']*ncarga[cod]+W['tend']*ntend[cod]+W['amb']*npres[cod])
    cat=('Crítica' if score>=70 else 'Alta' if score>=50 else
         'Média' if score>=30 else 'Baixa')
    prioridade[cod]=dict(
        score=round(score,1), categoria=cat,
        carga_100k=round(cargas[cod],0), n_carga=r2(ncarga[cod]*100),
        agravamento=r2(tends[cod]*100), n_amb=r2(npres[cod]*100),
        pm25=amb_anual.get(cod,{}).get('pm25',{}).get(2024),
        pm10=amb_anual.get(cod,{}).get('pm10',{}).get(2024),
    )

# ranking de doenças regional (carga total + tendência)
ranking_doencas=[]
for grupo,meta in GRUPO_META.items():
    sd=reg_saude[grupo]; anos=sorted(sd)
    total_recente=sum(sd.get(a,0) for a in ANOS_RECENTES)
    t=tendencia(anos,[sd[a] for a in anos]) if len(anos)>5 else None
    ranking_doencas.append(dict(grupo=grupo, label=meta['label'], cat=meta['cat'],
        cor=meta['cor'], total=int(sum(sd.values())),
        recente=int(total_recente), tend=t))
ranking_doencas.sort(key=lambda d:-d['recente'])

# ===========================================================================
# 8. RESUMO REGIONAL
# ===========================================================================
pop_total=sum(POP2022.values())
total_internacoes=int(H_ANUAL['valor'].sum())
# óbitos: soma de todas as categorias SIM, exceto duplicata de animais peçonhentos
total_obitos=int(SIM['valor'].sum())

def tend_clima_regional(vid):
    d=reg_amb[vid]; anos=sorted(d)
    return tendencia(anos,[d[a] for a in anos])

resumo=dict(
    pop_total=pop_total, n_municipios=len(POP2022),
    ano_min=ANO_MIN_SAUDE, ano_max=ANO_MAX_SAUDE, ano_max_obito=ANO_MAX_OBITO,
    amb_ano_min=int(A.ano.min()), amb_ano_max=int(A.ano.max()),
    total_internacoes=total_internacoes, total_obitos=total_obitos,
    n_grupos=len(GRUPO_META),
    temp_2024=r2(reg_amb['temp_media'].get(2024)),
    temp_1985=r2(reg_amb['temp_media'].get(1985)),
    tend_temp=tend_clima_regional('temp_media'),
    tend_pm25=tend_clima_regional('pm25'),
    tend_precip=tend_clima_regional('precip'),
)

# ===========================================================================
# 9. METADADOS (municípios, variáveis, marcos legais)
# ===========================================================================
# cobertura de dados de saúde por município (qtde de grupos com dados e se há SIH)
cobertura_saude={}
for cod in POP2022:
    grupos_com=[g for g in GRUPO_META if saude_anual.get(cod,{}).get(g)]
    tem_sih=False
    for g in GRUPO_META:
        for a,v in saude_anual.get(cod,{}).get(g,{}).items():
            if v.get('sih',0)>0: tem_sih=True; break
        if tem_sih: break
    cobertura_saude[cod]=dict(n_grupos=len(grupos_com), tem_sih=tem_sih,
                              limitada=(len(grupos_com)<3))

municipios=[]
for cod in sorted(POP2022, key=lambda c:-POP2022[c]):
    municipios.append(dict(cod=cod, nome=NOME_CANONICO[cod], pop=POP2022[cod],
                           prioridade=prioridade[cod]['score'],
                           categoria=prioridade[cod]['categoria'],
                           n_grupos=cobertura_saude[cod]['n_grupos'],
                           tem_sih=cobertura_saude[cod]['tem_sih'],
                           saude_limitada=cobertura_saude[cod]['limitada']))

variaveis_amb={v[0]:dict(label=v[1],unidade=v[2]) for v in VAR_MAP.values()}

# Marcos legais e diretrizes (referências para tomada de decisão)
legislacao=[
 dict(sigla='CONAMA 491/2018', tema='Qualidade do Ar',
   resumo='Estabelece padrões nacionais de qualidade do ar. Padrão final: PM2.5 ≤ 10 µg/m³ e PM10 ≤ 20 µg/m³ (média anual), alinhado à OMS 2005. Padrões intermediários (PI-1) iniciais: PM2.5 ≤ 20 e PM10 ≤ 40 µg/m³.',
   url='https://conama.mma.gov.br/'),
 dict(sigla='OMS / WHO 2021', tema='Diretrizes Globais de Qualidade do Ar',
   resumo='Recomenda PM2.5 ≤ 5 µg/m³ e PM10 ≤ 15 µg/m³ (média anual). Limites de 2 a 4× mais restritivos que o padrão brasileiro.',
   url='https://www.who.int/publications/i/item/9789240034228'),
 dict(sigla='Lei 9.985/2000 (SNUC)', tema='Conservação',
   resumo='Sistema Nacional de Unidades de Conservação. Base para proteção de remanescentes florestais que regulam clima local e doenças vetoriais.',
   url='https://www.planalto.gov.br/ccivil_03/leis/l9985.htm'),
 dict(sigla='Lei 12.651/2012 (Código Florestal)', tema='Uso da Terra',
   resumo='Define Áreas de Preservação Permanente (APP) e Reserva Legal. Relevante para a perda de floresta observada e seus efeitos sobre clima e saúde.',
   url='https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12651.htm'),
 dict(sigla='PNMC / Política de Mudança do Clima', tema='Clima',
   resumo='Política Nacional sobre Mudança do Clima (Lei 12.187/2009). Embasa ações de adaptação à elevação de temperatura e eventos extremos.',
   url='https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2009/lei/l12187.htm'),
 dict(sigla='Lei 11.445/2007 (Saneamento)', tema='Saneamento / Água',
   resumo='Marco do saneamento básico. Determinante para doenças diarreicas e de veiculação hídrica.',
   url='https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/lei/l11445.htm'),
 dict(sigla='Portaria GM/MS 888/2021', tema='Potabilidade da Água',
   resumo='Padrões de potabilidade da água para consumo humano. Vigilância da qualidade da água (VIGIAGUA).',
   url='https://bvsms.saude.gov.br/bvs/saudelegis/gm/2021/prt0888_07_05_2021.html'),
]

# ===========================================================================
# 10. EXPORTA
# ===========================================================================
def clean(o):
    if isinstance(o,dict): return {k:clean(v) for k,v in o.items()}
    if isinstance(o,(list,tuple)): return [clean(v) for v in o]
    if isinstance(o,(np.integer,)): return int(o)
    if isinstance(o,(np.floating,)): return None if np.isnan(o) else float(o)
    if isinstance(o,float) and np.isnan(o): return None
    return o

# heatmap mensal completo -> estrutura compacta cod->grupo->[[ano,mes,val],...]
hfull_d={}
for _,r in hfull.iterrows():
    hfull_d.setdefault(int(r.cod),{}).setdefault(r.grupo_doenca,[]).append(
        [int(r.ano),int(r.mes),int(r.valor)])

DADOS=dict(
    meta=dict(municipios=municipios, grupos=GRUPO_META,
              variaveis_amb=variaveis_amb, legislacao=legislacao,
              referencias=dict(CONAMA_PM25=CONAMA_PM25,CONAMA_PM10=CONAMA_PM10,
                               OMS_PM25=OMS_PM25,OMS_PM10=OMS_PM10),
              pesos_indice=W, nomes={c:NOME_CANONICO[c] for c in POP2022},
              pop={c:POP2022[c] for c in POP2022}, obito_grupos=OBITO_META),
    resumo=resumo,
    saude_anual=saude_anual,
    saude_sazonal=saude_sazonal,
    saude_mensal=hfull_d,
    obitos_anual=obitos_anual,
    amb_anual=amb_anual,
    amb_sazonal=amb_sazonal,
    cobertura=cobertura,
    correl=correl, correl_reg=correl_reg,
    prioridade=prioridade,
    ranking_doencas=ranking_doencas,
    reg_saude=reg_saude, reg_amb={k:{a:r2(v) for a,v in d.items()} for k,d in reg_amb.items()},
)
DADOS=clean(DADOS)

js="window.DADOS = "+json.dumps(DADOS,ensure_ascii=False)+";\n"
path=os.path.join(OUT,'dados.js')
with open(path,'w',encoding='utf-8') as f: f.write(js)
print(f"OK -> {path}  ({len(js)/1024:.0f} KB)")
print(f"Municípios: {len(POP2022)} | Grupos: {len(GRUPO_META)} | Pop total: {pop_total:,}")
print(f"Internações: {total_internacoes:,} | Óbitos: {total_obitos:,}")
print("Prioridade (top 5):")
for m in sorted(municipios,key=lambda x:-x['prioridade'])[:5]:
    print(f"  {m['nome']:<28} {m['prioridade']:>5} ({m['categoria']})")
