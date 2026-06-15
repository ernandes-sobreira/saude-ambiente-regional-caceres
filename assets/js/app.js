/* ============================================================
   app.js — roteador + views da plataforma
   ============================================================ */
(() => {
const D = window.DADOS;
const G = D.meta.grupos;
const VARS = D.meta.variaveis_amb;
const NOMES = D.meta.nomes;
const MUNIS = [...D.meta.municipios].sort((a,b)=>a.nome.localeCompare(b.nome,'pt'));
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const ANOS_SAUDE = []; for(let a=D.resumo.ano_min;a<=D.resumo.ano_max;a++) ANOS_SAUDE.push(a);
const content = document.getElementById('content');
const fmt = RECO.fmt, fmt0 = RECO.fmt0;
const f0 = n => n==null?'—':Math.round(n).toLocaleString('pt-BR');
const catClass = c => ({'Crítica':'b-crit','Alta':'b-alta','Média':'b-media','Baixa':'b-baixa'}[c]||'b-baixa');
const catColor = c => ({'Crítica':'#c0142c','Alta':'#e8590c','Média':'#e6a700','Baixa':'#1b9e5a'}[c]||'#1b9e5a');
const covIcon = m => m.saude_limitada ? `<span title="Dados de saúde limitados: este município não possui hospital com registro de internações (SIH). Apenas óbitos por neoplasia (SIM, por residência) estão disponíveis. A leitura prioriza a dimensão ambiental." style="cursor:help;color:#e6a700;font-size:13px">⚠️ dados parciais</span>` : '';

const state = { view:'overview', cod: D.meta.municipios[0].cod };

const TITLES = {
  overview:['Visão Geral Regional','Panorama da Regional de Saúde de Cáceres'],
  priority:['Prioridades & Decisão','Índice composto e recomendações para gestão pública'],
  saude:['Saúde','Internações, óbitos, séries anuais e mensais por agravo'],
  ambiente:['Ambiente & Clima','Atmosfera, qualidade do ar e uso da terra'],
  correl:['Saúde × Ambiente','Correlações estatísticas e relações de causa provável'],
  municipio:['Perfil do Município','Diagnóstico completo de saúde e ambiente'],
  comparar:['Comparar','Municípios, anos e meses — confronto direto'],
  sazonal:['Sazonalidade','Padrões mensais de saúde e clima'],
  legislacao:['Marcos Legais','Legislação e diretrizes que regem saúde e ambiente'],
  sobre:['Sobre & Metodologia','Fontes, métodos e limitações dos dados'],
};

/* ---------- séries util ---------- */
function serieSaudeAnual(cod,grupo,sis){ // sis: 'sih'|'sim'|undefined(=total)
  const d=(D.saude_anual[cod]||{})[grupo]||{};
  return ANOS_SAUDE.map(a=>{const v=d[a]; if(!v) return 0; return sis?(v[sis]||0):((v.sih||0)+(v.sim||0));});
}
function ambSerie(cod,vid,anos){
  const d=(D.amb_anual[cod]||{})[vid]||{};
  const ks=anos||Object.keys(d).map(Number).sort((a,b)=>a-b);
  return {anos:ks, vals:ks.map(a=>d[a]??null)};
}
function totalMuniGrupo(cod){ // soma total recente por município (todos grupos)
  let t=0; for(const g in G) t+=RECO.totalRecente(cod,g); return t;
}
function grupoOptions(sel,val){ Object.keys(G).forEach(g=>{const o=document.createElement('option');o.value=g;o.textContent=G[g].label;sel.appendChild(o);}); if(val)sel.value=val; }

// ---- agregadores genéricos de saúde por escopo ----
// scope: cod (>0) ou 0 = regional (soma de todos). grupo:'' = todos. sis:'sih'|'sim'|'' (ambos)
function codsDoEscopo(scope){ return scope? [scope] : D.meta.municipios.map(m=>m.cod); }
function gruposDoFiltro(grupo){ return grupo? [grupo] : Object.keys(G); }
function valSis(v,sis){ if(!v) return 0; return sis==='sih'?(v.sih||0):sis==='sim'?(v.sim||0):((v.sih||0)+(v.sim||0)); }
function saudeAnualEscopo(scope,grupo,sis){ // -> {ano:val}
  const out={};
  for(const cod of codsDoEscopo(scope)) for(const g of gruposDoFiltro(grupo)){
    const d=(D.saude_anual[cod]||{})[g]||{};
    for(const a in d) out[a]=(out[a]||0)+valSis(d[a],sis);
  }
  return out;
}
function saudeMensalClimEscopo(scope,grupo){ // -> [12] média mensal somada no escopo
  const arr=Array(12).fill(0);
  for(const cod of codsDoEscopo(scope)) for(const g of gruposDoFiltro(grupo)){
    const s=(D.saude_sazonal[cod]||{})[g]; if(!s) continue;
    s.forEach((v,i)=>arr[i]+=(v||0));
  }
  return arr.map(v=>+v.toFixed(1));
}
function saudeHeatAnoMes(scope,grupo){ // -> grid {'ano-mes':val}
  const grid={};
  for(const cod of codsDoEscopo(scope)) for(const g of gruposDoFiltro(grupo)){
    (((D.saude_mensal[cod]||{})[g])||[]).forEach(([y,mo,v])=>{grid[y+'-'+mo]=(grid[y+'-'+mo]||0)+v;});
  }
  return grid;
}
function totalEscopoGrupo(scope,grupo,sis,anos){ // soma em anos (array) ou todos
  const s=saudeAnualEscopo(scope,grupo,sis);
  return Object.keys(s).filter(a=>!anos||anos.includes(+a)).reduce((t,a)=>t+s[a],0);
}
function popEscopo(scope){ return scope? D.meta.pop[scope] : D.resumo.pop_total; }
function nomeEscopo(scope){ return scope? NOMES[scope] : 'Regional (14 municípios)'; }
// ambiente mensal climatologia no escopo (média entre municípios)
function ambMensalClimEscopo(scope,vid){
  const cods=codsDoEscopo(scope); const acc=Array(12).fill(0),cnt=Array(12).fill(0);
  for(const cod of cods){ const s=(D.amb_sazonal[cod]||{})[vid]; if(!s)continue;
    s.forEach((v,i)=>{if(v!=null){acc[i]+=v;cnt[i]++;}}); }
  return acc.map((v,i)=>cnt[i]?+(v/cnt[i]).toFixed(2):null);
}
function ambAnualEscopo(scope,vid){ // média entre municípios -> {ano:val}
  const cods=codsDoEscopo(scope); const acc={},cnt={};
  for(const cod of cods){ const d=(D.amb_anual[cod]||{})[vid]||{};
    for(const a in d){acc[a]=(acc[a]||0)+d[a];cnt[a]=(cnt[a]||0)+1;} }
  const out={}; for(const a in acc) out[a]=+(acc[a]/cnt[a]).toFixed(2); return out;
}
function obitosAnualEscopo(scope,ogrupo){ // óbitos SIM somados no escopo -> {ano:val}
  const out={};
  for(const cod of codsDoEscopo(scope)){ const d=(D.obitos_anual[cod]||{})[ogrupo]||{};
    for(const a in d) out[a]=(out[a]||0)+d[a]; }
  return out;
}
// helper de pílulas (toggle) reutilizável
function pillset(id,opts,active){ // opts:[{v,label}]
  return `<div class="pillset" id="${id}">${opts.map(o=>`<button data-v="${o.v}" class="${o.v===active?'active':''}">${o.label}</button>`).join('')}</div>`;
}
function bindPills(id,cb){ const el=document.getElementById(id); if(!el)return;
  el.querySelectorAll('button').forEach(b=>b.onclick=()=>{el.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');cb(b.dataset.v);}); }
function muniOptions(sel,incRegional,sel0){ if(incRegional)sel.add(new Option('Regional (todos)','0'));
  D.meta.municipios.forEach(m=>sel.add(new Option(m.nome+(m.saude_limitada?' ⚠️':''),m.cod)));
  if(sel0!=null)sel.value=sel0; }

/* ================= NAV ================= */
function setView(v, opts={}){
  state.view=v;
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.view===v));
  const [t,c]=TITLES[v]; document.getElementById('pageTitle').textContent=t;
  document.getElementById('pageCrumb').textContent=c;
  document.getElementById('globalMuni').style.display = (v==='municipio')?'flex':'none';
  CH.clearAll();
  content.innerHTML='<div class="fade-in"></div>';
  const root=content.firstChild;
  ({overview:renderOverview,priority:renderPriority,saude:renderSaude,municipio:renderMunicipio,
    comparar:renderComparar,sazonal:renderSazonal,correl:renderCorrel,
    ambiente:renderAmbiente,legislacao:renderLegislacao,sobre:renderSobre}[v])(root);
  window.scrollTo(0,0);
  closeSidebar();
}
document.getElementById('nav').addEventListener('click',e=>{
  const a=e.target.closest('a'); if(a){e.preventDefault();setView(a.dataset.view);}
});
const muniSelect=document.getElementById('muniSelect');
MUNIS.forEach(m=>{const o=document.createElement('option');o.value=m.cod;o.textContent=m.nome;muniSelect.appendChild(o);});
muniSelect.value=state.cod;
muniSelect.addEventListener('change',()=>{state.cod=+muniSelect.value; if(state.view==='municipio') setView('municipio');});
// mobile menu
const sb=document.getElementById('sidebar'), bd=document.getElementById('backdrop');
function closeSidebar(){sb.classList.remove('open');bd.classList.remove('show');}
document.getElementById('menuToggle').addEventListener('click',()=>{sb.classList.toggle('open');bd.classList.toggle('show');});
bd.addEventListener('click',closeSidebar);

/* ================= componentes ================= */
function kpi(label,value,unit,foot,ico,bg){
  return `<div class="card hover"><div class="card-head"><div class="kpi" style="flex:1">
    <div class="kpi-label">${ico?`<span>${ico}</span>`:''}${label}</div>
    <div class="kpi-value">${value}${unit?`<small> ${unit}</small>`:''}</div>
    ${foot?`<div class="kpi-foot">${foot}</div>`:''}
  </div>${bg?`<div class="ico-badge" style="background:${bg}22;color:${bg}">${ico}</div>`:''}</div></div>`;
}
function trendTxt(t){
  if(!t) return '<span class="trend-flat">— estável</span>';
  const dir = t.slope>0?'up':t.slope<0?'down':'flat';
  const sig = (t.p!=null && t.p<0.05)?' (significativa)':'';
  if(dir==='up') return `<span class="trend-up">▲ tendência de alta${sig}</span>`;
  if(dir==='down') return `<span class="trend-down">▼ tendência de queda${sig}</span>`;
  return '<span class="trend-flat">— estável</span>';
}
function chartCard(title,sub,id,cls='',extra=''){
  return `<div class="card"><div class="card-head"><div><h3>${title}</h3>${sub?`<div class="card-sub">${sub}</div>`:''}</div>${extra}</div><div id="${id}" class="chart ${cls}"></div></div>`;
}

/* ================================================================
   1. VISÃO GERAL REGIONAL
   ================================================================ */
function renderOverview(root){
  const r=D.resumo;
  const tdTemp=r.tend_temp;
  const deltaT = (r.temp_2024!=null&&r.temp_1985!=null)?(r.temp_2024-r.temp_1985):null;
  const topD = D.ranking_doencas[0];
  const critCount = D.meta.municipios.filter(m=>m.categoria==='Crítica'||m.categoria==='Alta').length;

  root.innerHTML = `
  <div class="grid g4" style="margin-bottom:18px">
    ${kpi('População da regional', f0(r.pop_total),'hab', `${r.n_municipios} municípios · IBGE Censo 2022`,'👥','#0e7c7b')}
    ${kpi('Internações (SIH/SUS)', f0(r.total_internacoes),'', `${r.ano_min}–${r.ano_max} · ${r.n_grupos} grupos · por residência`,'🏥','#1c6dd0')}
    ${kpi('Óbitos registrados (SIM)', f0(r.total_obitos),'', `8 categorias · ${r.ano_min}–${r.ano_max_obito}`,'🕯️','#6741d9')}
    ${kpi('Municípios em prioridade alta+', critCount,'', `de ${r.n_municipios} · necessitam atenção reforçada`,'🎯','#e8590c')}
  </div>

  <div class="grid g4" style="margin-bottom:18px">
    ${kpi('Aquecimento desde 1985', deltaT!=null?('+'+deltaT.toFixed(1)):'—','°C', trendTxt(tdTemp),'🌡️','#e8590c')}
    ${kpi('Temperatura média atual', fmt(r.temp_2024),'°C', `em ${r.amb_ano_max}`,'☀️','#e6a700')}
    ${kpi('Tendência de precipitação', r.tend_precip&&r.tend_precip.slope!=null?(r.tend_precip.slope>0?'▲':'▼'):'—','', trendTxt(r.tend_precip),'🌧️','#1c6dd0')}
    ${kpi('Principal agravo da regional', topD.label.split(' ')[0],'', `${f0(topD.recente)} casos recentes`, '📈','#d6336c')}
  </div>

  <div class="grid g2">
    <div class="card span2">
      <div class="card-head"><div><h3>🎯 Ranking de prioridade dos municípios</h3>
        <div class="card-sub">Índice composto (carga de saúde + tendência + pressão ambiental). Clique para ver o perfil completo.</div></div></div>
      <div class="rank-list" id="rankMunis"></div>
    </div>
  </div>

  <div class="grid g2" style="margin-top:18px">
    ${chartCard('🏥 Principais agravos de saúde da regional','Total de internações/óbitos recentes (2020–'+r.ano_max+') por grupo','chTopDoencas','lg')}
    ${chartCard('🌫️ Qualidade do ar na regional','PM2.5 médio anual vs. padrões CONAMA e OMS','chArRegional','lg')}
  </div>

  <div class="grid g2" style="margin-top:18px">
    ${chartCard('📈 Evolução climática regional','Temperatura média e precipitação ('+r.amb_ano_min+'–'+r.amb_ano_max+')','chClimaReg','')}
    ${chartCard('🦟 Evolução dos principais agravos','Séries anuais regionais ('+r.ano_min+'–'+r.ano_max+')','chSaudeReg','')}
  </div>

  <div class="footnote">⚠️ <b>Leitura para gestores:</b> o índice de prioridade é uma ferramenta de triagem comparativa entre municípios da regional, não um diagnóstico clínico. Combine sempre com conhecimento local e vigilância em campo.</div>
  `;

  // ranking
  const rk=document.getElementById('rankMunis');
  [...D.meta.municipios].sort((a,b)=>b.prioridade-a.prioridade).forEach((m,i)=>{
    const pri=D.prioridade[m.cod];
    const div=document.createElement('div');div.className='rank-row';
    div.innerHTML=`<div class="pos ${i<3?'p'+(i+1):''}">${i+1}</div>
      <div class="rk-name">${m.nome} ${covIcon(m)}<small>${f0(m.pop)} hab · ${pri.agravamento}% agravos em alta${pri.pm25!=null?' · PM2.5 '+fmt(pri.pm25):''}</small></div>
      <div class="rank-bar"><div style="width:${m.prioridade}%;background:${catColor(m.categoria)}"></div></div>
      <span class="badge ${catClass(m.categoria)}">${m.categoria}</span>
      <div class="rk-score" style="color:${catColor(m.categoria)}">${m.prioridade}</div>`;
    div.onclick=()=>{state.cod=m.cod;muniSelect.value=m.cod;setView('municipio');};
    rk.appendChild(div);
  });

  // top doenças
  const rd=D.ranking_doencas.filter(d=>d.recente>0).slice(0,10).reverse();
  CH.bar('chTopDoencas', rd.map(d=>d.label), [{name:'Casos recentes',
    data:rd.map(d=>({value:d.recente,itemStyle:{color:d.cor}}))}],
    {horizontal:true, legend:false, label:true, labelFmt:p=>f0(p.value)});

  // ar regional
  const ar=D.reg_amb.pm25||{}; const aAnos=Object.keys(ar).map(Number).sort((a,b)=>a-b);
  CH.line('chArRegional', aAnos, [{name:'PM2.5 (µg/m³)',data:aAnos.map(a=>ar[a]),color:'#e8590c',area:true}],
    {yname:'µg/m³', legend:false, smooth:true});
  // add CONAMA/OMS marklines via re-mount
  const arInst=echarts.getInstanceByDom(document.getElementById('chArRegional'));
  if(arInst) arInst.setOption({series:[{markLine:{silent:true,symbol:'none',data:[
    {yAxis:D.meta.referencias.CONAMA_PM25,label:{formatter:'CONAMA '+D.meta.referencias.CONAMA_PM25,color:'#c0142c',position:'insideEndTop',fontSize:10},lineStyle:{color:'#c0142c',type:'dashed'}},
    {yAxis:D.meta.referencias.OMS_PM25,label:{formatter:'OMS '+D.meta.referencias.OMS_PM25,color:'#1b9e5a',position:'insideEndBottom',fontSize:10},lineStyle:{color:'#1b9e5a',type:'dashed'}}]}}]});

  // clima regional (temp + precip dual axis)
  const tA=D.reg_amb.temp_media||{}, pA=D.reg_amb.precip||{};
  const cAnos=Object.keys(tA).map(Number).sort((a,b)=>a-b);
  CH.line('chClimaReg', cAnos, [
    {name:'Temperatura média (°C)',data:cAnos.map(a=>tA[a]),color:'#e8590c',yAxisIndex:0},
    {name:'Precipitação (mm)',data:cAnos.map(a=>pA[a]),color:'#1c6dd0',yAxisIndex:1}
  ], {y2:true,yname:'°C',y2name:'mm',scale:true});

  // saúde regional top 4
  const top4=D.ranking_doencas.slice(0,4);
  CH.line('chSaudeReg', ANOS_SAUDE, top4.map(d=>({
    name:d.label.length>22?d.label.slice(0,20)+'…':d.label,
    data:ANOS_SAUDE.map(a=>(D.reg_saude[d.grupo]||{})[a]||0), color:d.cor})), {});
}

/* ================================================================
   2. PRIORIDADES & DECISÃO
   ================================================================ */
function renderPriority(root){
  const W=D.meta.pesos_indice;
  root.innerHTML=`
  <div class="section-desc">O <b>Índice de Prioridade</b> classifica os municípios para apoiar a alocação de recursos. Combina três eixos normalizados (0–100): carga de saúde (taxa por 100 mil hab.), tendência de agravamento e pressão ambiental (qualidade do ar, aquecimento e perda florestal).</div>

  <div class="toolbar">
    <div class="stat-inline">
      <div class="si"><b>${Math.round(W.carga*100)}%</b> Carga de saúde</div>
      <div class="si"><b>${Math.round(W.tend*100)}%</b> Agravamento</div>
      <div class="si"><b>${Math.round(W.amb*100)}%</b> Pressão ambiental</div>
    </div>
  </div>

  <div class="grid g2" style="margin-bottom:18px">
    ${chartCard('🎯 Índice de prioridade por município','Composição dos três eixos (empilhado)','chPriStack','lg')}
    ${chartCard('🗺️ Carga de saúde × Pressão ambiental','Cada bolha é um município (tamanho = população)','chPriScatter','lg')}
  </div>

  <div class="card" style="margin-bottom:18px">
    <div class="card-head"><div><h3>📋 Matriz de prioridade detalhada</h3>
      <div class="card-sub">Clique no cabeçalho para ordenar. Clique na linha para abrir o perfil do município.</div></div></div>
    <div class="scroll-x"><table class="data" id="tblPri"></table></div>
  </div>

  <div class="card">
    <div class="card-head"><div><h3>🧭 Recomendações para o município prioritário</h3>
    <div class="card-sub" id="recoNomeP"></div></div>
    <select id="recoSelP"></select></div>
    <div id="recoBoxP"></div>
  </div>
  `;

  // stacked priority
  const ms=[...D.meta.municipios].sort((a,b)=>b.prioridade-a.prioridade);
  CH.bar('chPriStack', ms.map(m=>m.nome), [
    {name:'Carga saúde',data:ms.map(m=>+( (D.prioridade[m.cod].n_carga||0)*0.40).toFixed(1)),color:'#1c6dd0'},
    {name:'Agravamento',data:ms.map(m=>+((D.prioridade[m.cod].agravamento||0)*0.20).toFixed(1)),color:'#e6a700'},
    {name:'Pressão ambiental',data:ms.map(m=>+((D.prioridade[m.cod].n_amb||0)*0.40).toFixed(1)),color:'#e8590c'},
  ], {stack:true, rotate:40});

  // scatter carga x ambiente
  const pts=D.meta.municipios.map(m=>{const p=D.prioridade[m.cod];
    return {value:[p.n_carga||0,p.n_amb||0,m.pop],nome:m.nome,cat:m.categoria};});
  const scInst=echarts.init(document.getElementById('chPriScatter'));
  scInst.setOption({textStyle:{fontFamily:'Inter,sans-serif'},
    grid:{left:54,right:24,top:18,bottom:48,containLabel:true},
    tooltip:{backgroundColor:'rgba(19,33,43,.94)',borderWidth:0,textStyle:{color:'#fff'},padding:[9,13],extraCssText:'border-radius:9px',
      formatter:p=>`<b>${p.data.nome}</b> (${p.data.cat})<br>Carga saúde: ${p.data.value[0]}<br>Pressão ambiental: ${p.data.value[1]}<br>Pop: ${f0(p.data.value[2])}`},
    xAxis:{type:'value',name:'Carga de saúde (norm.)',nameLocation:'middle',nameGap:28,nameTextStyle:{color:'#7b8f9a'},axisLine:{lineStyle:{color:'#cfd9de'}},splitLine:{lineStyle:{color:'#eef2f4'}}},
    yAxis:{type:'value',name:'Pressão ambiental (norm.)',nameTextStyle:{color:'#7b8f9a'},axisLine:{lineStyle:{color:'#cfd9de'}},splitLine:{lineStyle:{color:'#eef2f4'}}},
    series:[{type:'scatter',data:pts,
      symbolSize:d=>Math.max(14,Math.min(54,Math.sqrt(d[2])/3)),
      itemStyle:{color:p=>catColor(p.data.cat),opacity:.78,borderColor:'#fff',borderWidth:1.5},
      label:{show:true,formatter:p=>p.data.nome,position:'right',fontSize:10,color:'#445a66'}}]});
  CH.mount; // noop to keep instances; manual track:
  scInst.group='p'; // ensure resize handled
  window.addEventListener('resize',()=>{try{scInst.resize()}catch(e){}});

  // table
  buildPriTable();
  // reco selector
  const sel=document.getElementById('recoSelP');
  ms.forEach(m=>{const o=document.createElement('option');o.value=m.cod;o.textContent=m.nome+' ('+m.categoria+')';sel.appendChild(o);});
  sel.value=ms[0].cod;
  const renderReco=()=>{
    const cod=+sel.value;
    document.getElementById('recoNomeP').innerHTML=RECO.diagnostico(cod);
    document.getElementById('recoBoxP').innerHTML=RECO.recomendacoes(cod).map(r=>
      `<div class="reco ${r.nivel}"><div class="r-tag">${r.tag}</div><div class="r-title">${r.title}</div><div class="r-text">${r.text}</div></div>`).join('');
  };
  sel.onchange=renderReco; renderReco();
}
function buildPriTable(sortKey='score',asc=false){
  const ms=[...D.meta.municipios].map(m=>({m,p:D.prioridade[m.cod]}));
  const keyf={nome:x=>x.m.nome,score:x=>x.p.score,carga:x=>x.p.carga_100k,
    agr:x=>x.p.agravamento,amb:x=>x.p.n_amb,pm25:x=>x.p.pm25??-1,pop:x=>x.m.pop};
  ms.sort((a,b)=>{const va=keyf[sortKey](a),vb=keyf[sortKey](b);
    if(typeof va==='string') return asc?va.localeCompare(vb):vb.localeCompare(va);
    return asc?va-vb:vb-va;});
  const t=document.getElementById('tblPri');
  const H=[['nome','Município'],['pop','População'],['score','Índice'],['carga','Carga /100k'],['agr','% agravos↑'],['amb','Pressão amb.'],['pm25','PM2.5'],['cat','Classe']];
  t.innerHTML=`<thead><tr>${H.map(h=>`<th data-k="${h[0]}">${h[1]}</th>`).join('')}</tr></thead><tbody>${
    ms.map(({m,p})=>`<tr data-cod="${m.cod}" style="cursor:pointer">
      <td><b>${m.nome}</b> ${m.saude_limitada?'<span title="Dados de saúde limitados (sem hospital local; apenas óbitos por neoplasia)." style="cursor:help">⚠️</span>':''}</td><td class="num">${f0(m.pop)}</td>
      <td class="num" style="color:${catColor(m.categoria)}">${p.score}</td>
      <td class="num">${f0(p.carga_100k)}</td><td class="num">${p.agravamento}%</td>
      <td class="num">${p.n_amb??'—'}</td><td class="num">${p.pm25!=null?fmt(p.pm25):'—'}</td>
      <td><span class="badge ${catClass(m.categoria)}">${m.categoria}</span></td></tr>`).join('')}</tbody>`;
  t.querySelectorAll('th').forEach(th=>th.onclick=()=>buildPriTable(th.dataset.k, sortKey===th.dataset.k?!asc:false));
  t.querySelectorAll('tr[data-cod]').forEach(tr=>tr.onclick=()=>{state.cod=+tr.dataset.cod;muniSelect.value=tr.dataset.cod;setView('municipio');});
}

/* ================================================================
   SAÚDE (aba dedicada) — totalmente interativa
   ================================================================ */
const stSaude={scope:0, grupo:'', sis:'', gran:'anual'};
function renderSaude(root){
  root.innerHTML=`
  <div class="toolbar">
    <label class="muted">Escopo:</label><select id="sdScope"></select>
    <label class="muted">Agravo:</label><select id="sdGrupo"></select>
    <label class="muted">Dado:</label>${pillset('sdSis',[{v:'',label:'Internações+Óbitos'},{v:'sih',label:'Internações (SIH)'},{v:'sim',label:'Óbitos (SIM)'}],stSaude.sis)}
    <div class="grow"></div>
    <label class="muted">Período:</label>${pillset('sdGran',[{v:'anual',label:'Anual'},{v:'mensal',label:'Mensal'}],stSaude.gran)}
  </div>
  <div id="sdLimit"></div>
  <div class="grid g4" id="sdKpis" style="margin-bottom:18px"></div>
  <div class="grid g2">
    ${chartCard('📈 Série temporal','','sdSerie','lg',`<span id="sdSerieTag" class="tag-cat"></span>`)}
    ${chartCard('🏥 Ranking de municípios','Casos no período por município (clique para abrir o perfil)','sdRank','lg')}
  </div>
  <div class="grid g2" style="margin-top:18px">
    ${chartCard('🧬 Composição por agravo','Participação de cada grupo (escopo selecionado)','sdDonut','lg')}
    ${chartCard('🗓️ Sazonalidade / Heatmap','Padrão temporal do agravo selecionado','sdHeat','lg')}
  </div>
  <div class="card" style="margin-top:18px"><div class="card-head"><div><h3>🕯️ Óbitos (SIM) por categoria</h3>
    <div class="card-sub">Mortalidade anual por residência (${D.resumo.ano_min}–${D.resumo.ano_max_obito}) · inclui doenças infecciosas/parasitárias</div></div></div>
    <div id="sdObito" class="chart lg"></div></div>
  <div class="card" style="margin-top:18px">
    <div class="card-head"><div><h3>📋 Tabela de agravos (escopo selecionado)</h3>
    <div class="card-sub">Clique no cabeçalho para ordenar</div></div></div>
    <div class="scroll-x"><table class="data" id="sdTbl"></table></div>
  </div>`;
  const scope=document.getElementById('sdScope'); muniOptions(scope,true,stSaude.scope);
  const grupo=document.getElementById('sdGrupo'); grupo.add(new Option('Todos os agravos','')); grupoOptions(grupo,stSaude.grupo);
  scope.onchange=()=>{stSaude.scope=+scope.value;draw();};
  grupo.onchange=()=>{stSaude.grupo=grupo.value;draw();};
  bindPills('sdSis',v=>{stSaude.sis=v;draw();});
  bindPills('sdGran',v=>{stSaude.gran=v;draw();});
  function draw(){
    if(!document.getElementById('sdKpis'))return;
    const {scope:sc,grupo:gp,sis,gran}=stSaude;
    // aviso de cobertura
    const lim=sc && D.meta.municipios.find(m=>m.cod===sc)?.saude_limitada;
    document.getElementById('sdLimit').innerHTML = lim?
      `<div class="alert warn" style="margin-bottom:16px"><div class="a-ico">⚠️</div><div class="a-body"><b>${NOMES[sc]} não possui hospital com registro de internações (SIH).</b> Apenas óbitos por neoplasia (SIM, por residência) estão disponíveis — internações ocorrem em Cáceres/Mirassol. Veja a regional para o quadro completo.</div></div>`:'';
    // KPIs
    const totSih=totalEscopoGrupo(sc,gp,'sih'), totSim=totalEscopoGrupo(sc,gp,'sim');
    const totSel=totalEscopoGrupo(sc,gp,sis);
    const recente=totalEscopoGrupo(sc,gp,sis,[2020,2021,2022,2023,2024]);
    const taxa=recente/popEscopo(sc)*100000/5; // média anual recente por 100k
    // principal agravo do escopo
    let topG=null,topV=-1; for(const g in G){const v=totalEscopoGrupo(sc,g,sis,[2020,2021,2022,2023,2024]); if(v>topV){topV=v;topG=g;}}
    document.getElementById('sdKpis').innerHTML=
      kpi('Internações (SIH)',f0(totSih),'',`${D.resumo.ano_min}–${D.resumo.ano_max} · ${nomeEscopo(sc)}`,'🏥','#1c6dd0')+
      kpi('Óbitos (SIM)',f0(totSim),'','neoplasias','🕯️','#6741d9')+
      kpi('Taxa anual recente',f0(taxa),'/100k hab','média 2020–'+D.resumo.ano_max,'📊','#0e7c7b')+
      kpi('Principal agravo',G[topG]?G[topG].label.split(' ')[0]:'—','',`${f0(topV)} casos recentes`,'📈','#d6336c');
    // série temporal
    const tagEl=document.getElementById('sdSerieTag');
    const ie=echarts.getInstanceByDom(document.getElementById('sdSerie')); if(ie)ie.dispose();
    if(gran==='anual'){
      tagEl.textContent='anual';
      if(gp){ const s=saudeAnualEscopo(sc,gp,sis);
        CH.line('sdSerie',ANOS_SAUDE,[{name:G[gp].label,data:ANOS_SAUDE.map(a=>s[a]||0),color:G[gp].cor,area:true}],{legend:false});
      } else { // todos: top 5 agravos
        const tops=Object.keys(G).map(g=>({g,t:totalEscopoGrupo(sc,g,sis)})).sort((a,b)=>b.t-a.t).slice(0,5);
        CH.line('sdSerie',ANOS_SAUDE,tops.map(o=>({name:G[o.g].label,color:G[o.g].cor,data:(()=>{const s=saudeAnualEscopo(sc,o.g,sis);return ANOS_SAUDE.map(a=>s[a]||0);})()})),{});
      }
    } else { // mensal: climatologia
      tagEl.textContent='climatologia mensal';
      if(gp){ CH.bar('sdSerie',MESES,[{name:G[gp].label,data:saudeMensalClimEscopo(sc,gp),color:G[gp].cor}],{legend:false,label:true,labelFmt:p=>fmt(p.value)});
      } else { const tops=Object.keys(G).map(g=>({g,t:totalEscopoGrupo(sc,g,sis)})).sort((a,b)=>b.t-a.t).slice(0,5);
        CH.line('sdSerie',MESES,tops.map(o=>({name:G[o.g].label,color:G[o.g].cor,data:saudeMensalClimEscopo(sc,o.g)})),{}); }
    }
    // ranking municípios
    const ir=echarts.getInstanceByDom(document.getElementById('sdRank')); if(ir)ir.dispose();
    const rk=D.meta.municipios.map(m=>({m,v:totalEscopoGrupo(m.cod,gp,sis)})).filter(o=>o.v>0).sort((a,b)=>b.v-a.v);
    CH.bar('sdRank',rk.map(o=>o.m.nome),[{name:'Casos',data:rk.map(o=>({value:o.v,itemStyle:{color:catColor(o.m.categoria)}}))}],{horizontal:true,legend:false,label:true,labelFmt:p=>f0(p.value)});
    const rkInst=echarts.getInstanceByDom(document.getElementById('sdRank'));
    if(rkInst)rkInst.on('click',p=>{const m=rk[rk.length-1-p.dataIndex]||rk[p.dataIndex]; const mm=rk.find(o=>o.m.nome===p.name); if(mm){state.cod=mm.m.cod;muniSelect.value=mm.m.cod;setView('municipio');}});
    // donut composição
    const id=echarts.getInstanceByDom(document.getElementById('sdDonut')); if(id)id.dispose();
    const comp=Object.keys(G).map(g=>({name:G[g].label,value:totalEscopoGrupo(sc,g,sis),itemStyle:{color:G[g].cor}})).filter(o=>o.value>0).sort((a,b)=>b.value-a.value);
    CH.donut('sdDonut',comp);
    // heatmap
    const ih=echarts.getInstanceByDom(document.getElementById('sdHeat')); if(ih)ih.dispose();
    if(gp){ const grid=saudeHeatAnoMes(sc,gp); const cells=[];
      ANOS_SAUDE.forEach((y,yi)=>{for(let mo=1;mo<=12;mo++)cells.push([mo-1,yi,grid[y+'-'+mo]||0]);});
      CH.heatmap('sdHeat',MESES,ANOS_SAUDE.map(String),cells,{inverse:true,bottom:50,tip:p=>`${MESES[p.data[0]]}/${ANOS_SAUDE[p.data[1]]}<br><b>${p.data[2]}</b> casos`});
    } else { // todos: mês x agravo (climatologia)
      const gs=Object.keys(G); const cells=[];
      gs.forEach((g,gi)=>{const s=saudeMensalClimEscopo(sc,g);for(let mi=0;mi<12;mi++)cells.push([mi,gi,s[mi]]);});
      CH.heatmap('sdHeat',MESES,gs.map(g=>G[g].label.length>18?G[g].label.slice(0,17)+'…':G[g].label),cells,{inverse:true,bottom:50,tip:p=>`${G[gs[p.data[1]]].label} · ${MESES[p.data[0]]}<br><b>${p.data[2]}</b>/mês`});
    }
    // óbitos por categoria (empilhado por ano)
    const obCats=Object.keys(D.meta.obito_grupos);
    const anosOb=[]; for(let a=D.resumo.ano_min;a<=D.resumo.ano_max_obito;a++)anosOb.push(a);
    const obi=echarts.getInstanceByDom(document.getElementById('sdObito')); if(obi)obi.dispose();
    CH.bar('sdObito',anosOb.map(String),obCats.map((oc,i)=>({name:D.meta.obito_grupos[oc],color:CH.PAL[i%12],
      data:anosOb.map(a=>obitosAnualEscopo(sc,oc)[a]||0)})),{stack:true});
    // tabela
    buildSaudeTbl(sc,sis);
  }
  draw();
}
let sdSort={k:'recente',asc:false};
function buildSaudeTbl(sc,sis){
  const rows=Object.keys(G).map(g=>{const s=saudeAnualEscopo(sc,g,sis);const anos=Object.keys(s).map(Number);
    const total=anos.reduce((t,a)=>t+s[a],0); const recente=[2020,2021,2022,2023,2024].reduce((t,a)=>t+(s[a]||0),0);
    const t=RECO.tendencia(s); return {g,label:G[g].label,cat:G[g].cat,cor:G[g].cor,total,recente,tend:t};}).filter(r=>r.total>0);
  const kf={label:r=>r.label,total:r=>r.total,recente:r=>r.recente,tend:r=>r.tend.pct};
  rows.sort((a,b)=>{const va=kf[sdSort.k](a),vb=kf[sdSort.k](b);return typeof va==='string'?(sdSort.asc?va.localeCompare(vb):vb.localeCompare(va)):(sdSort.asc?va-vb:vb-va);});
  const t=document.getElementById('sdTbl'); if(!t)return;
  const H=[['label','Agravo'],['total','Total ('+D.resumo.ano_min+'–'+D.resumo.ano_max+')'],['recente','Recente (2020+)'],['tend','Tendência']];
  t.innerHTML=`<thead><tr>${H.map(h=>`<th data-k="${h[0]}">${h[1]}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r=>`<tr><td><span class="dot" style="background:${r.cor};margin-right:7px"></span><b>${r.label}</b> <span class="tag-cat">${r.cat}</span></td>
      <td class="num">${f0(r.total)}</td><td class="num">${f0(r.recente)}</td>
      <td>${r.tend.dir==='up'?`<span class="trend-up">▲ +${r.tend.pct}%</span>`:r.tend.dir==='down'?`<span class="trend-down">▼ ${r.tend.pct}%</span>`:'<span class="trend-flat">— estável</span>'}</td></tr>`).join('')}</tbody>`;
  t.querySelectorAll('th').forEach(th=>th.onclick=()=>{sdSort={k:th.dataset.k,asc:sdSort.k===th.dataset.k?!sdSort.asc:false};buildSaudeTbl(sc,sis);});
}

/* ================================================================
   3. PERFIL DO MUNICÍPIO
   ================================================================ */
function renderMunicipio(root){
  const cod=state.cod, nome=NOMES[cod], pri=D.prioridade[cod];
  const m=D.meta.municipios.find(x=>x.cod===cod);
  const top=RECO.topDoencas(cod,8);
  const alertas=RECO.alertas(cod);
  const recos=RECO.recomendacoes(cod);
  const cob=D.cobertura[cod]||{};
  const ambKeys=Object.keys(D.amb_anual[cod]||{});

  root.innerHTML=`
  <div class="card" style="margin-bottom:18px;border-left:5px solid ${catColor(m.categoria)}">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:18px;justify-content:space-between">
      <div><div style="font-size:23px;font-weight:800;letter-spacing:-.02em">${nome}</div>
        <div class="muted" style="font-size:13px;margin-top:3px">${f0(m.pop)} habitantes (Censo 2022) · Cód. IBGE ${cod}</div></div>
      <div style="text-align:center"><div class="muted" style="font-size:12px;font-weight:600">ÍNDICE DE PRIORIDADE</div>
        <div style="font-size:34px;font-weight:800;color:${catColor(m.categoria)};line-height:1">${pri.score}</div>
        <span class="badge ${catClass(m.categoria)}">${m.categoria}</span></div>
    </div>
    <div class="card-sub" style="margin-top:14px;font-size:13.5px;color:#445a66">${RECO.diagnostico(cod)}</div>
  </div>
  ${m.saude_limitada?`<div class="alert warn" style="margin-bottom:18px"><div class="a-ico">⚠️</div><div class="a-body"><b>Cobertura de saúde limitada.</b> Este município não possui hospital com registros de internação (SIH/SUS) — pacientes são internados em Cáceres ou Mirassol d'Oeste. Apenas <b>óbitos por neoplasia</b> (SIM/DO, por município de residência) estão disponíveis. Por isso, a análise de saúde é parcial e o índice de prioridade reflete principalmente a <b>dimensão ambiental</b>. Use os dados de saúde da regional como referência complementar.</div></div>`:''}

  <div class="grid g4" style="margin-bottom:18px">
    ${kpi('Internações recentes', f0(totalMuniGrupo(cod)),'', '2020–'+D.resumo.ano_max,'🏥','#1c6dd0')}
    ${kpi('Carga por 100 mil hab.', f0(pri.carga_100k),'', 'taxa anual média recente','📊','#0e7c7b')}
    ${kpi('PM2.5 mais recente', pri.pm25!=null?fmt(pri.pm25):'—','µg/m³', arBadge(pri.pm25,'pm25'),'🌫️','#e8590c')}
    ${kpi('Agravos em alta', pri.agravamento+'%','', 'dos grupos monitorados','📈','#d6336c')}
  </div>

  <div class="grid g2">
    <div class="card"><div class="card-head"><div><h3>🚨 Alertas e sinais de risco</h3>
      <div class="card-sub">Síntese automática a partir dos dados de saúde e ambiente</div></div></div>
      ${alertas.map(a=>`<div class="alert ${a.t}"><div class="a-ico">${a.ico}</div><div class="a-body">${a.html}</div></div>`).join('')}
    </div>
    ${chartCard('🏥 Principais agravos','Internações/óbitos recentes por grupo','chMuniTop','lg')}
  </div>

  <div class="grid g2" style="margin-top:18px">
    ${chartCard('📈 Evolução dos agravos','Séries anuais ('+D.resumo.ano_min+'–'+D.resumo.ano_max+')','chMuniSaude','',
      `<select id="selMuniDis"></select>`)}
    ${chartCard('🌡️ Clima local','Temperatura e precipitação ('+D.resumo.amb_ano_min+'–'+D.resumo.amb_ano_max+')','chMuniClima','')}
  </div>

  <div class="grid g2" style="margin-top:18px">
    ${chartCard('📅 Sazonalidade dos agravos','Heatmap mês × grupo (média mensal histórica)','chMuniSeason','lg')}
    ${chartCard('🌳 Uso e cobertura da terra','Evolução das macroclasses (ha) '+D.resumo.amb_ano_min+'–'+D.resumo.amb_ano_max,'chMuniLand','lg')}
  </div>

  <div class="card" style="margin-top:18px">
    <div class="card-head"><div><h3>🔗 Relações saúde × ambiente detectadas</h3>
    <div class="card-sub">Correlações anuais (Pearson). Verde/vermelho = relação negativa/positiva. Correlação ≠ causalidade.</div></div></div>
    <div id="chMuniCorr" class="chart lg"></div>
  </div>

  <div class="card" style="margin-top:18px">
    <div class="card-head"><div><h3>🧭 O que fazer — recomendações de ação</h3>
    <div class="card-sub">Indicações orientadas por dados e marcos legais (CONAMA, OMS, Código Florestal, etc.)</div></div></div>
    ${recos.map(r=>`<div class="reco ${r.nivel}"><div class="r-tag">${r.tag}</div><div class="r-title">${r.title}</div><div class="r-text">${r.text}</div></div>`).join('')}
  </div>
  `;

  // top doenças
  const td=top.filter(d=>d.recente>0).slice(0,10).reverse();
  CH.bar('chMuniTop', td.map(d=>d.label), [{name:'Casos',
    data:td.map(d=>({value:d.recente,itemStyle:{color:d.cor}}))}],
    {horizontal:true,legend:false,label:true,labelFmt:p=>f0(p.value)});

  // evolução com seletor
  const sel=document.getElementById('selMuniDis');
  top.slice(0,8).forEach(d=>{const o=document.createElement('option');o.value=d.grupo;o.textContent=d.label;sel.appendChild(o);});
  const drawDis=()=>{
    const g=sel.value; if(!g||!G[g]) return;
    const sih=serieSaudeAnual(cod,g,'sih'), sim=serieSaudeAnual(cod,g,'sim');
    const series=[{name:'Internações (SIH)',data:sih,color:G[g].cor,area:true}];
    if(sim.some(v=>v>0)) series.push({name:'Óbitos (SIM)',data:sim,color:'#c0142c'});
    const inst=echarts.getInstanceByDom(document.getElementById('chMuniSaude'));
    if(inst) inst.dispose();
    CH.line('chMuniSaude',ANOS_SAUDE,series,{});
  };
  sel.onchange=drawDis; drawDis();

  // clima local
  const tA=ambSerie(cod,'temp_media'), pA=ambSerie(cod,'precip');
  CH.line('chMuniClima', tA.anos, [
    {name:'Temp. média (°C)',data:tA.vals,color:'#e8590c',yAxisIndex:0},
    {name:'Precipitação (mm)',data:pA.anos.map((a,i)=>pA.vals[i]),color:'#1c6dd0',yAxisIndex:1}
  ],{y2:true,yname:'°C',y2name:'mm',scale:true});

  // sazonalidade heatmap (mês x grupo)
  const groups=top.slice(0,9).map(d=>d.grupo);
  const sazData=[];
  groups.forEach((g,gi)=>{const arr=(D.saude_sazonal[cod]||{})[g]||[];
    for(let mi=0;mi<12;mi++) sazData.push([mi,gi,arr[mi]??0]);});
  CH.heatmap('chMuniSeason', MESES, groups.map(g=>G[g].label.length>16?G[g].label.slice(0,15)+'…':G[g].label),
    sazData, {showLabel:false, inverse:true, bottom:50,
      tip:p=>`${G[groups[p.data[1]]].label} · ${MESES[p.data[0]]}<br>Média: <b>${p.data[2]}</b> internações/mês`});

  // uso da terra
  const macros=Object.keys(cob); const lAnos=new Set();
  macros.forEach(mc=>Object.keys(cob[mc]).forEach(a=>lAnos.add(+a)));
  const yrs=[...lAnos].sort((a,b)=>a-b);
  const macLabel={floresta:'Floresta',campestre:'Campestre/Pantanal',agua:'Água',pastagem:'Pastagem',agricultura:'Agricultura',urbano:'Urbano',naoveg:'Não vegetado',outros:'Outros'};
  const macColor={floresta:'#1b7340',campestre:'#74c476',agua:'#1c6dd0',pastagem:'#e6a700',agricultura:'#e8590c',urbano:'#c0142c',naoveg:'#8a8a8a',outros:'#cccccc'};
  const order=['floresta','campestre','agua','pastagem','agricultura','urbano','naoveg','outros'].filter(x=>macros.includes(x));
  CH.bar('chMuniLand', yrs.filter((y,i)=>i%5===0||y===yrs[yrs.length-1]),
    order.map(mc=>({name:macLabel[mc],color:macColor[mc],
      data:yrs.filter((y,i)=>i%5===0||y===yrs[yrs.length-1]).map(y=>Math.round((cob[mc][y]||0)))})),
    {stack:true, yname:'ha', barWidth:34});

  // correlação heatmap
  const corr=D.correl[cod]||{};
  const cg=Object.keys(corr); const cv=['temp_media','temp_max','pm25','pm10','precip','dias_sem_chuva','disp_agua','vpd'].filter(v=>cg.some(g=>corr[g][v]));
  if(cg.length && cv.length){
    const cdata=[];
    cg.forEach((g,gi)=>cv.forEach((v,vi)=>{const o=corr[g][v]; cdata.push([vi,gi,o?o.r:null]);}));
    CH.corrHeatmap('chMuniCorr', cv.map(v=>VARS[v].label), cg.map(g=>G[g].label.length>18?G[g].label.slice(0,17)+'…':G[g].label),
      cdata, {tip:p=>{const o=(corr[cg[p.data[1]]]||{})[cv[p.data[0]]];
        return `${G[cg[p.data[1]]].label} × ${VARS[cv[p.data[0]]].label}<br>r = <b>${p.data[2]==null?'—':p.data[2]}</b>${o&&o.p!=null?' · p='+o.p:''}${o?' · n='+o.n+' anos':''}`;}});
  } else { document.getElementById('chMuniCorr').innerHTML='<div class="loader" style="height:100%"><div class="muted">Dados insuficientes para correlação neste município.</div></div>'; }
}
function arBadge(v,tipo){
  const s=RECO.arStatus(v,tipo); if(!s) return 'sem dado';
  const cls={ok:'trend-down',info:'trend-flat',warn:'trend-up',crit:'trend-up'}[s.classe];
  return `<span class="${cls}">${s.nivel}</span>`;
}

/* ================================================================
   4. COMPARAR
   ================================================================ */
function renderComparar(root){
  root.innerHTML=`
  <div class="toolbar">
    <div class="pillset" id="cmpMode">
      <button data-m="munis" class="active">Comparar municípios</button>
      <button data-m="anos">Comparar anos</button>
      <button data-m="meses">Comparar meses</button>
    </div>
  </div>
  <div id="cmpBody"></div>`;
  const body=document.getElementById('cmpBody');
  const modes={munis:cmpMunis, anos:cmpAnos, meses:cmpMeses};
  document.querySelectorAll('#cmpMode button').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('#cmpMode button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); CH.clearAll(); modes[b.dataset.m](body);});
  cmpMunis(body);
}

// card de confronto A vs B
function vsHead(nomeA,valA,nomeB,valB,unit,fmtf){
  const fa=fmtf?fmtf(valA):f0(valA), fb=fmtf?fmtf(valB):f0(valB);
  const aWin=(valA||0)>=(valB||0);
  const delta=(valA!=null&&valB!=null&&valB!==0)?((valA-valB)/Math.abs(valB)*100):null;
  return `<div class="card"><div style="display:flex;align-items:stretch;gap:0">
    <div style="flex:1;text-align:center;padding:8px;border-radius:10px;background:${aWin?'#0e7c7b11':'transparent'}">
      <div class="kpi-label" style="justify-content:center">${nomeA}</div>
      <div class="kpi-value" style="color:#0e7c7b">${fa}<small> ${unit||''}</small></div></div>
    <div style="display:grid;place-items:center;padding:0 14px;font-weight:800;color:#7b8f9a">VS</div>
    <div style="flex:1;text-align:center;padding:8px;border-radius:10px;background:${!aWin?'#e8590c11':'transparent'}">
      <div class="kpi-label" style="justify-content:center">${nomeB}</div>
      <div class="kpi-value" style="color:#e8590c">${fb}<small> ${unit||''}</small></div></div>
  </div>${delta!=null?`<div style="text-align:center;margin-top:8px;font-size:12.5px;color:#445a66">${nomeA} é <b>${delta>=0?'+'+delta.toFixed(0):delta.toFixed(0)}%</b> em relação a ${nomeB}</div>`:''}</div>`;
}

/* ---- Município A vs Município B ---- */
const stM={a:0,b:0,grupo:'',gran:'anual',met:'total'};
function cmpMunis(body){
  if(!stM.a){const top=[...D.meta.municipios].sort((x,y)=>y.prioridade-x.prioridade);stM.a=top[0].cod;stM.b=top[1].cod;}
  stM.grupo=stM.grupo||D.ranking_doencas[0].grupo;
  body.innerHTML=`
  <div class="toolbar">
    <label class="muted">Município A:</label><select id="cmA"></select>
    <label class="muted">Município B:</label><select id="cmB"></select>
    <label class="muted">Agravo:</label><select id="cmG"></select>
    <div class="grow"></div>
    <label class="muted">Métrica:</label>${pillset('cmMet',[{v:'total',label:'Casos'},{v:'taxa',label:'Taxa /100k'}],stM.met)}
    <label class="muted">Período:</label>${pillset('cmGran',[{v:'anual',label:'Anual'},{v:'mensal',label:'Mensal'}],stM.gran)}
  </div>
  <div id="cmVs" style="margin-bottom:18px"></div>
  <div class="grid g2">
    ${chartCard('📈 Série comparada A vs B','','cmLines','lg')}
    ${chartCard('🕸️ Perfil multi-agravo (taxa /100k)','Confronto entre os dois municípios','cmRadar','lg')}
  </div>
  <div class="card" style="margin-top:18px"><div class="card-head"><div><h3>🏥 Todos os agravos: A vs B</h3>
    <div class="card-sub">Casos no período por grupo de doença</div></div></div><div id="cmBars" class="chart lg"></div></div>`;
  const A=document.getElementById('cmA'),B=document.getElementById('cmB'),g=document.getElementById('cmG');
  muniOptions(A,false,stM.a); muniOptions(B,false,stM.b); grupoOptions(g,stM.grupo);
  A.onchange=()=>{stM.a=+A.value;draw();}; B.onchange=()=>{stM.b=+B.value;draw();}; g.onchange=()=>{stM.grupo=g.value;draw();};
  bindPills('cmMet',v=>{stM.met=v;draw();}); bindPills('cmGran',v=>{stM.gran=v;draw();});
  function draw(){
    if(!document.getElementById('cmVs'))return;
    const {a,b,grupo,gran,met}=stM; const taxa=met==='taxa';
    const totA=totalEscopoGrupo(a,grupo,''), totB=totalEscopoGrupo(b,grupo,'');
    const vA=taxa?totA/D.meta.pop[a]*100000:totA, vB=taxa?totB/D.meta.pop[b]*100000:totB;
    document.getElementById('cmVs').innerHTML=vsHead(NOMES[a],vA,NOMES[b],vB,taxa?'/100k':'casos',taxa?(x=>f0(x)):null)
      .replace('<div class="card">','<div class="card"><div class="card-sub" style="margin-bottom:10px">'+G[grupo].label+' · '+(taxa?'taxa por 100 mil hab. (período)':'casos totais no período')+'</div>');
    // séries
    const il=echarts.getInstanceByDom(document.getElementById('cmLines')); if(il)il.dispose();
    if(gran==='anual'){ const sa=saudeAnualEscopo(a,grupo,''),sb=saudeAnualEscopo(b,grupo,'');
      CH.line('cmLines',ANOS_SAUDE,[{name:NOMES[a],color:'#0e7c7b',data:ANOS_SAUDE.map(y=>sa[y]||0)},{name:NOMES[b],color:'#e8590c',data:ANOS_SAUDE.map(y=>sb[y]||0)}],{});
    } else { CH.line('cmLines',MESES,[{name:NOMES[a],color:'#0e7c7b',data:saudeMensalClimEscopo(a,grupo)},{name:NOMES[b],color:'#e8590c',data:saudeMensalClimEscopo(b,grupo)}],{}); }
    // radar
    const ir=echarts.getInstanceByDom(document.getElementById('cmRadar')); if(ir)ir.dispose();
    const keyG=['RESPIRATORIO','DENGUE','CARDIOVASCULAR','DIARREICAS_GASTROENTERITES','PNEUMONIA','RENAL_URINARIO'];
    const maxByG={}; keyG.forEach(k=>{maxByG[k]=Math.max(totalEscopoGrupo(a,k,'')/D.meta.pop[a]*100000,totalEscopoGrupo(b,k,'')/D.meta.pop[b]*100000,1);});
    CH.radar('cmRadar',keyG.map(k=>({name:G[k].label.split(' ')[0],max:+maxByG[k].toFixed(0)})),
      [{name:NOMES[a],value:keyG.map(k=>+(totalEscopoGrupo(a,k,'')/D.meta.pop[a]*100000).toFixed(1))},
       {name:NOMES[b],value:keyG.map(k=>+(totalEscopoGrupo(b,k,'')/D.meta.pop[b]*100000).toFixed(1))}]);
    // bars todos agravos
    const ib=echarts.getInstanceByDom(document.getElementById('cmBars')); if(ib)ib.dispose();
    const gs=D.ranking_doencas.map(d=>d.grupo);
    CH.bar('cmBars',gs.map(k=>G[k].label),[
      {name:NOMES[a],color:'#0e7c7b',data:gs.map(k=>{const t=totalEscopoGrupo(a,k,'');return taxa?+(t/D.meta.pop[a]*100000).toFixed(1):t;})},
      {name:NOMES[b],color:'#e8590c',data:gs.map(k=>{const t=totalEscopoGrupo(b,k,'');return taxa?+(t/D.meta.pop[b]*100000).toFixed(1):t;})}],{rotate:40});
  }
  draw();
}

/* ---- Ano A vs Ano B ---- */
const stA={a:0,b:0,scope:0,gran:'anual',grupo:''};
function cmpAnos(body){
  if(!stA.a){stA.a=ANOS_SAUDE[0];stA.b=ANOS_SAUDE[ANOS_SAUDE.length-1];}
  stA.grupo=stA.grupo||D.ranking_doencas[0].grupo;
  body.innerHTML=`
  <div class="toolbar">
    <label class="muted">Ano A:</label><select id="anA"></select>
    <label class="muted">Ano B:</label><select id="anB"></select>
    <label class="muted">Escopo:</label><select id="anScope"></select>
    <div class="grow"></div>
    <label class="muted">Visão:</label>${pillset('anGran',[{v:'anual',label:'Agravos + Ambiente'},{v:'mensal',label:'Perfil mensal'}],stA.gran)}
  </div>
  <div class="grid g4" id="anKpis" style="margin-bottom:18px"></div>
  <div id="anArea"></div>`;
  const aA=document.getElementById('anA'),aB=document.getElementById('anB'),sc=document.getElementById('anScope');
  ANOS_SAUDE.forEach(y=>{aA.add(new Option(y,y));aB.add(new Option(y,y));}); aA.value=stA.a; aB.value=stA.b;
  muniOptions(sc,true,stA.scope);
  aA.onchange=()=>{stA.a=+aA.value;draw();}; aB.onchange=()=>{stA.b=+aB.value;draw();}; sc.onchange=()=>{stA.scope=+sc.value;draw();};
  bindPills('anGran',v=>{stA.gran=v;draw();});
  const totAnoG=(scope,grupo,ano)=>{const s=saudeAnualEscopo(scope,grupo,'');return s[ano]||0;};
  const mesAnoG=(scope,grupo,ano)=>{const arr=Array(12).fill(0);
    for(const cod of codsDoEscopo(scope)){(((D.saude_mensal[cod]||{})[grupo])||[]).forEach(([y,mo,v])=>{if(y===ano)arr[mo-1]+=v;});}return arr;};
  function draw(){
    if(!document.getElementById('anKpis'))return;
    const {a:yA,b:yB,scope,gran,grupo}=stA;
    const grupos=D.ranking_doencas.filter(d=>d.recente>0||totAnoG(scope,d.grupo,yA)+totAnoG(scope,d.grupo,yB)>0);
    const totA=grupos.reduce((t,d)=>t+totAnoG(scope,d.grupo,yA),0), totB=grupos.reduce((t,d)=>t+totAnoG(scope,d.grupo,yB),0);
    const tA=ambAnualEscopo(scope,'temp_media')[yA], tB=ambAnualEscopo(scope,'temp_media')[yB];
    const pmA=ambAnualEscopo(scope,'pm25')[yA], pmB=ambAnualEscopo(scope,'pm25')[yB];
    const chg=totA?((totB-totA)/totA*100):0;
    document.getElementById('anKpis').innerHTML=
      kpi('Casos '+yA,f0(totA),'',nomeEscopo(scope),'📋','#94a3b8')+
      kpi('Casos '+yB,f0(totB),'',(chg>=0?'+':'')+chg.toFixed(0)+'% vs '+yA,'📋','#0e7c7b')+
      kpi('Temp. '+yA+' → '+yB,(tA!=null?fmt(tA):'—')+' → '+(tB!=null?fmt(tB):'—'),'°C',(tA!=null&&tB!=null?((tB-tA>=0?'+':'')+(tB-tA).toFixed(1)+'°C'):''),'🌡️','#e8590c')+
      kpi('PM2.5 '+yA+' → '+yB,(pmA!=null?fmt(pmA):'—')+' → '+(pmB!=null?fmt(pmB):'—'),'µg/m³','',(pmB>pmA?'🔺':'🔻'),'#6741d9');
    const area=document.getElementById('anArea');
    if(gran==='anual'){
      area.innerHTML=`<div class="grid g2">
        ${chartCard('🏥 Agravos: '+yA+' vs '+yB,'Casos por grupo','anBar','lg')}
        ${chartCard('🌎 Ambiente: '+yA+' vs '+yB,'Indicadores ambientais','anAmb','lg')}</div>`;
      CH.bar('anBar',grupos.map(d=>d.label),[
        {name:String(yA),color:'#94a3b8',data:grupos.map(d=>totAnoG(scope,d.grupo,yA))},
        {name:String(yB),color:'#0e7c7b',data:grupos.map(d=>totAnoG(scope,d.grupo,yB))}],{rotate:40});
      const vars=['temp_media','temp_max','pm25','precip','dias_sem_chuva'];
      CH.bar('anAmb',vars.map(v=>VARS[v].label),[
        {name:String(yA),color:'#94a3b8',data:vars.map(v=>ambAnualEscopo(scope,v)[yA]??null)},
        {name:String(yB),color:'#e8590c',data:vars.map(v=>ambAnualEscopo(scope,v)[yB]??null)}],{rotate:22});
    } else {
      area.innerHTML=`<div class="toolbar"><label class="muted">Agravo:</label><select id="anGrupo"></select></div>
        <div class="card">${'<div class="card-head"><div><h3>📅 Perfil mensal: '+yA+' vs '+yB+'</h3><div class="card-sub">Casos por mês no escopo selecionado</div></div></div>'}<div id="anMes" class="chart lg"></div></div>`;
      const gg=document.getElementById('anGrupo'); grupoOptions(gg,grupo);
      const drawMes=()=>{stA.grupo=gg.value;
        const im=echarts.getInstanceByDom(document.getElementById('anMes')); if(im)im.dispose();
        CH.line('anMes',MESES,[{name:String(yA),color:'#94a3b8',data:mesAnoG(scope,gg.value,yA)},
          {name:String(yB),color:'#0e7c7b',data:mesAnoG(scope,gg.value,yB),area:true}],{});};
      gg.onchange=drawMes; drawMes();
    }
  }
  draw();
}

/* ---- Mês A vs Mês B ---- */
const stMes={a:0,b:6,scope:0,grupo:''};
function cmpMeses(body){
  stMes.grupo=stMes.grupo||'DENGUE';
  body.innerHTML=`
  <div class="toolbar">
    <label class="muted">Mês A:</label><select id="meA"></select>
    <label class="muted">Mês B:</label><select id="meB"></select>
    <label class="muted">Escopo:</label><select id="meScope"></select>
    <label class="muted">Agravo:</label><select id="meG"></select>
  </div>
  <div id="meVs" style="margin-bottom:18px"></div>
  <div class="grid g4" id="meEnv" style="margin-bottom:18px"></div>
  <div class="grid g2">
    ${chartCard('🏥 Agravos no mês A vs mês B','Casos médios (climatologia mensal)','meBars','lg')}
    ${chartCard('🌎 Condições ambientais: mês A vs mês B','Climatologia mensal das variáveis','meAmb','lg')}
  </div>`;
  const mA=document.getElementById('meA'),mB=document.getElementById('meB'),sc=document.getElementById('meScope'),g=document.getElementById('meG');
  MESES.forEach((m,i)=>{mA.add(new Option(m,i));mB.add(new Option(m,i));}); mA.value=stMes.a; mB.value=stMes.b;
  muniOptions(sc,true,stMes.scope); grupoOptions(g,stMes.grupo);
  mA.onchange=()=>{stMes.a=+mA.value;draw();}; mB.onchange=()=>{stMes.b=+mB.value;draw();};
  sc.onchange=()=>{stMes.scope=+sc.value;draw();}; g.onchange=()=>{stMes.grupo=g.value;draw();};
  function draw(){
    if(!document.getElementById('meVs'))return;
    const {a:mi,b:mj,scope,grupo}=stMes;
    const saz=saudeMensalClimEscopo(scope,grupo);
    document.getElementById('meVs').innerHTML=vsHead(MESES[mi],saz[mi],MESES[mj],saz[mj],'casos/mês',x=>fmt(x))
      .replace('<div class="card">','<div class="card"><div class="card-sub" style="margin-bottom:10px">'+G[grupo].label+' · média mensal histórica em '+nomeEscopo(scope)+'</div>');
    // env KPIs
    const envv=['temp_media','precip','pm25','dias_sem_chuva'];
    document.getElementById('meEnv').innerHTML=envv.map(v=>{const c=ambMensalClimEscopo(scope,v);
      const va=c[mi],vb=c[mj];
      return kpi(VARS[v].label,(va!=null?fmt(va):'—')+' / '+(vb!=null?fmt(vb):'—'),VARS[v].unidade,MESES[mi]+' vs '+MESES[mj],'🌎','#0e7c7b');}).join('');
    // bars agravos A vs B
    const gs=D.ranking_doencas.map(d=>d.grupo);
    const ib=echarts.getInstanceByDom(document.getElementById('meBars')); if(ib)ib.dispose();
    CH.bar('meBars',gs.map(k=>G[k].label),[
      {name:MESES[mi],color:'#0e7c7b',data:gs.map(k=>saudeMensalClimEscopo(scope,k)[mi])},
      {name:MESES[mj],color:'#e8590c',data:gs.map(k=>saudeMensalClimEscopo(scope,k)[mj])}],{rotate:40});
    // env A vs B
    const ia=echarts.getInstanceByDom(document.getElementById('meAmb')); if(ia)ia.dispose();
    const vars=['temp_media','temp_max','pm25','pm10','precip','dias_sem_chuva'];
    CH.bar('meAmb',vars.map(v=>VARS[v].label),[
      {name:MESES[mi],color:'#0e7c7b',data:vars.map(v=>ambMensalClimEscopo(scope,v)[mi])},
      {name:MESES[mj],color:'#e8590c',data:vars.map(v=>ambMensalClimEscopo(scope,v)[mj])}],{rotate:22});
  }
  draw();
}

/* ================================================================
   5. SAZONALIDADE (regional)
   ================================================================ */
function renderSazonal(root){
  root.innerHTML=`
  <div class="section-desc">Os padrões sazonais revelam <b>quando</b> agir. Dengue e doenças vetoriais concentram-se no período chuvoso/quente; doenças respiratórias sobem na estação seca (queimadas e ar seco). Antecipar campanhas ao pico é mais eficaz e barato.</div>
  <div class="grid g2">
    ${chartCard('📅 Climatologia mensal — todos os agravos','Média histórica de internações por mês (regional)','szAll','xl')}
    ${chartCard('🦟 Sazonalidade de doenças vetoriais e hídricas','Dengue, malária/leishmaniose, diarreicas e animais peçonhentos','szVet','lg')}
  </div>
  <div class="grid g2" style="margin-top:18px">
    ${chartCard('🫁 Sazonalidade de doenças respiratórias','Asma, DPOC, pneumonia e respiratório geral','szResp','lg')}
    ${chartCard('🗓️ Heatmap ano × mês (agravo selecionado)','','szHeat','lg',`<select id="szGrupo"></select>`)}
  </div>`;

  const sazReg=g=>{const arr=Array(12).fill(0);D.meta.municipios.forEach(m=>{const s=(D.saude_sazonal[m.cod]||{})[g]||[];s.forEach((v,i)=>arr[i]+=(v||0));});return arr.map(v=>+v.toFixed(1));};
  // heatmap all groups x month
  const grupos=D.ranking_doencas.filter(d=>d.recente>0).map(d=>d.grupo);
  const data=[];
  grupos.forEach((g,gi)=>{const s=sazReg(g);for(let mi=0;mi<12;mi++)data.push([mi,gi,s[mi]]);});
  CH.heatmap('szAll',MESES,grupos.map(g=>G[g].label.length>20?G[g].label.slice(0,19)+'…':G[g].label),data,
    {inverse:true,showLabel:false,bottom:50,left:8,
     tip:p=>`${G[grupos[p.data[1]]].label} · ${MESES[p.data[0]]}<br>Média regional: <b>${p.data[2]}</b>/mês`});

  CH.line('szVet',MESES,[
    {name:'Dengue',data:sazReg('DENGUE'),color:G.DENGUE.cor},
    {name:'Malária/Leish.',data:sazReg('LEISHMANIOSE_MALARIA'),color:G.LEISHMANIOSE_MALARIA.cor},
    {name:'Diarreicas',data:sazReg('DIARREICAS_GASTROENTERITES'),color:G.DIARREICAS_GASTROENTERITES.cor},
    {name:'Animais peçonhentos',data:sazReg('ANIMAIS_PECONHENTOS'),color:G.ANIMAIS_PECONHENTOS.cor}],{});
  CH.line('szResp',MESES,[
    {name:'Asma',data:sazReg('ASMA'),color:G.ASMA.cor},
    {name:'DPOC',data:sazReg('DPOC'),color:G.DPOC.cor},
    {name:'Pneumonia',data:sazReg('PNEUMONIA'),color:G.PNEUMONIA.cor},
    {name:'Respiratório',data:sazReg('RESPIRATORIO'),color:G.RESPIRATORIO.cor}],{});

  const sel=document.getElementById('szGrupo'); grupoOptions(sel,'DENGUE');
  const drawHeat=()=>{
    const g=sel.value; const grid={};
    D.meta.municipios.forEach(m=>{(((D.saude_mensal[m.cod]||{})[g])||[]).forEach(([y,mo,v])=>{grid[y+'-'+mo]=(grid[y+'-'+mo]||0)+v;});});
    const cells=[]; ANOS_SAUDE.forEach((y,yi)=>{for(let mo=1;mo<=12;mo++)cells.push([mo-1,yi,grid[y+'-'+mo]||0]);});
    CH.heatmap('szHeat',MESES,ANOS_SAUDE.map(String),cells,{inverse:true,bottom:50,
      tip:p=>`${MESES[p.data[0]]}/${ANOS_SAUDE[p.data[1]]}<br><b>${p.data[2]}</b> casos`});
  };
  sel.onchange=drawHeat; drawHeat();
}

/* ================================================================
   6. SAÚDE × AMBIENTE (correlações anuais E sazonais mensais)
   ================================================================ */
function pearson(xs,ys){ // arrays alinhados, ignora pares com null
  const X=[],Y=[]; for(let i=0;i<xs.length;i++){if(xs[i]!=null&&ys[i]!=null){X.push(+xs[i]);Y.push(+ys[i]);}}
  const n=X.length; if(n<4) return null;
  const mx=X.reduce((a,b)=>a+b,0)/n, my=Y.reduce((a,b)=>a+b,0)/n;
  let sxy=0,sxx=0,syy=0; for(let i=0;i<n;i++){const dx=X[i]-mx,dy=Y[i]-my;sxy+=dx*dy;sxx+=dx*dx;syy+=dy*dy;}
  if(sxx===0||syy===0) return null;
  return {r:+(sxy/Math.sqrt(sxx*syy)).toFixed(2), n};
}
const ENV_CORR=['temp_media','temp_max','pm25','pm10','precip','dias_sem_chuva','disp_agua','vpd'];
const stCo={scope:0,gran:'mensal'};
function renderCorrel(root){
  root.innerHTML=`
  <div class="section-desc">Quantifica as <b>relações estatísticas</b> entre agravos e variáveis ambientais (correlação de Pearson). No modo <b>Sazonal mensal</b>, comparamos o padrão dos 12 meses (ex.: o pico de dengue acompanha o pico de chuva?); no modo <b>Anual</b>, comparamos as séries ano a ano. +1 (vermelho) ou −1 (azul) = associação forte. <b>Correlação não prova causalidade.</b></div>
  <div class="toolbar">
    <label class="muted">Escopo:</label><select id="coScope"><option value="0">Regional (agregado)</option></select>
    <div class="grow"></div>
    <label class="muted">Tipo de relação:</label>${pillset('coGran',[{v:'mensal',label:'📅 Sazonal mensal (12 meses)'},{v:'anual',label:'📈 Anual (ano a ano)'}],stCo.gran)}
  </div>
  <div class="card" style="margin-bottom:18px">
    <div class="card-head"><div><h3>🔗 Matriz de correlação saúde × ambiente</h3>
    <div class="card-sub" id="coSub"></div></div></div>
    <div id="coHeat" class="chart xl"></div>
    <div class="legend-row"><span><span class="dot" style="background:#c0142c"></span> Correlação positiva (sobem juntos)</span>
      <span><span class="dot" style="background:#eef2f4;border:1px solid #ccc"></span> Sem relação</span>
      <span><span class="dot" style="background:#1c6dd0"></span> Correlação negativa (sentido oposto)</span></div>
  </div>
  <div class="grid g2">
    <div class="card"><div class="card-head"><div><h3>🏆 Relações mais fortes</h3>
      <div class="card-sub">|r| ≥ 0,5 ordenadas por magnitude</div></div></div>
      <div class="scroll-x"><table class="data" id="coTbl"></table></div></div>
    <div class="card"><div class="card-head"><div><h3>📉 Explorar relação</h3>
      <div class="card-sub" id="coScSub">Cada ponto é um mês</div></div>
      <div style="display:flex;gap:8px"><select id="coG"></select><select id="coV"></select></div></div>
      <div id="coScatter" class="chart lg"></div>
      <div id="coDual" class="chart sm" style="margin-top:8px"></div></div>
  </div>`;
  const scope=document.getElementById('coScope');
  D.meta.municipios.forEach(m=>scope.add(new Option(m.nome,m.cod)));
  scope.value=stCo.scope;
  scope.onchange=()=>{stCo.scope=+scope.value;drawAll();};
  bindPills('coGran',v=>{stCo.gran=v;drawAll();});

  // matriz de correlação no modo atual -> {grupo:{var:{r,n}}}
  function matriz(scope,gran){
    const M={}; const grupos=Object.keys(G);
    grupos.forEach(g=>{ M[g]={};
      ENV_CORR.forEach(v=>{
        let c;
        if(gran==='mensal'){ c=pearson(saudeMensalClimEscopo(scope,g), ambMensalClimEscopo(scope,v)); }
        else { // anual: usa precomputado quando regional/município
          const pre = scope? ((D.correl[scope]||{})[g]||{})[v] : (D.correl_reg[g]||{})[v];
          c = pre? {r:pre.r,n:pre.n} : null;
        }
        if(c) M[g][v]=c;
      });
    });
    return M;
  }
  function drawAll(){
    if(!document.getElementById('coHeat'))return;
    const {scope:sc,gran}=stCo;
    document.getElementById('coSub').textContent = (gran==='mensal'?'Correlação do padrão mensal (climatologia, n=12 meses)':'Correlação das séries anuais')+' · '+nomeEscopo(sc);
    document.getElementById('coScSub').textContent = gran==='mensal'?'Cada ponto é um mês (climatologia)':'Cada ponto é um ano';
    const C=matriz(sc,gran);
    const grps=Object.keys(C).filter(g=>ENV_CORR.some(v=>C[g][v]));
    const cells=[]; grps.forEach((g,gi)=>ENV_CORR.forEach((v,vi)=>{const o=C[g][v];cells.push([vi,gi,o?o.r:null]);}));
    const inst=echarts.getInstanceByDom(document.getElementById('coHeat')); if(inst)inst.dispose();
    CH.corrHeatmap('coHeat',ENV_CORR.map(v=>VARS[v].label),grps.map(g=>G[g].label),cells,
      {bottom:70,left:8,tip:p=>{const o=(C[grps[p.data[1]]]||{})[ENV_CORR[p.data[0]]];
        return `${G[grps[p.data[1]]].label} × ${VARS[ENV_CORR[p.data[0]]].label}<br>r = <b>${p.data[2]==null?'—':p.data[2]}</b>${o?' · n='+o.n:''}`;}});
    const rows=[]; grps.forEach(g=>ENV_CORR.forEach(v=>{const o=C[g][v];if(o&&o.r!=null&&Math.abs(o.r)>=0.5)rows.push({g,v,...o});}));
    rows.sort((a,b)=>Math.abs(b.r)-Math.abs(a.r));
    document.getElementById('coTbl').innerHTML=`<thead><tr><th>Agravo</th><th>Variável ambiental</th><th>r</th><th>n</th></tr></thead><tbody>${
      rows.slice(0,18).map(r=>`<tr><td>${G[r.g].label}</td><td>${VARS[r.v].label}</td>
        <td class="num" style="color:${r.r>0?'#c0142c':'#1c6dd0'}">${r.r}</td><td class="num">${r.n}</td></tr>`).join('')||'<tr><td colspan="4" class="muted">Nenhuma relação forte (|r|≥0,5).</td></tr>'}</tbody>`;
    const cg=document.getElementById('coG'),cv=document.getElementById('coV');
    cg.innerHTML='';cv.innerHTML='';
    grps.forEach(g=>cg.add(new Option(G[g].label,g))); ENV_CORR.forEach(v=>cv.add(new Option(VARS[v].label,v)));
    if(rows.length){cg.value=rows[0].g;cv.value=rows[0].v;}
    drawScatter();
  }
  function drawScatter(){
    const {scope:sc,gran}=stCo; const g=document.getElementById('coG').value, v=document.getElementById('coV').value;
    if(!g||!v||!G[g]||!VARS[v]) return;
    const si=echarts.getInstanceByDom(document.getElementById('coScatter')); if(si)si.dispose();
    const di=echarts.getInstanceByDom(document.getElementById('coDual')); if(di)di.dispose();
    if(gran==='mensal'){
      const sa=saudeMensalClimEscopo(sc,g), am=ambMensalClimEscopo(sc,v);
      const pts=[]; for(let i=0;i<12;i++) if(sa[i]!=null&&am[i]!=null) pts.push([am[i],sa[i],MESES[i]]);
      CH.scatter('coScatter',pts,{xname:VARS[v].label+' ('+VARS[v].unidade+')',yname:G[g].label+' (casos/mês)',color:G[g].cor});
      // dual de apoio: padrão mensal lado a lado
      CH.line('coDual',MESES,[{name:G[g].label,color:G[g].cor,data:sa,yAxisIndex:0},
        {name:VARS[v].label,color:'#1c6dd0',data:am,yAxisIndex:1}],{y2:true,yname:'casos',y2name:VARS[v].unidade,scale:true});
    } else {
      let sd={},amb={};
      if(sc){ const d=(D.saude_anual[sc]||{})[g]||{}; for(const a in d)sd[a]=(d[a].sih||0)+(d[a].sim||0); amb=(D.amb_anual[sc]||{})[v]||{}; }
      else { sd=D.reg_saude[g]||{}; amb=D.reg_amb[v]||{}; }
      const anos=Object.keys(sd).filter(a=>amb[a]!=null).map(Number).sort((a,b)=>a-b);
      CH.scatter('coScatter',anos.map(a=>[amb[a],sd[a],String(a)]),{xname:VARS[v].label+' ('+VARS[v].unidade+')',yname:G[g].label,color:G[g].cor});
      CH.line('coDual',anos.map(String),[{name:G[g].label,color:G[g].cor,data:anos.map(a=>sd[a]),yAxisIndex:0},
        {name:VARS[v].label,color:'#1c6dd0',data:anos.map(a=>amb[a]),yAxisIndex:1}],{y2:true,yname:'casos',y2name:VARS[v].unidade,scale:true});
    }
  }
  document.getElementById('coG').onchange=drawScatter;
  document.getElementById('coV').onchange=drawScatter;
  drawAll();
}

/* ================================================================
   7. AMBIENTE & CLIMA
   ================================================================ */
function renderAmbiente(root){
  root.innerHTML=`
  <div class="toolbar"><label class="muted">Escopo:</label>
    <select id="amScope"><option value="0">Regional (média)</option></select>
    <label class="muted">Variável:</label><select id="amVar"></select>
    <div class="grow"></div>
    <label class="muted">Período:</label>${pillset('amGran',[{v:'anual',label:'Anual (1985–2024)'},{v:'mensal',label:'Climatologia mensal'}],'anual')}
  </div>
  <div class="grid g4" id="amKpis" style="margin-bottom:18px"></div>
  <div class="card" style="margin-bottom:18px"><div class="card-head"><div><h3 id="amExpTitle">🔎 Explorador de variável</h3>
    <div class="card-sub" id="amExpSub"></div></div></div><div id="amExplore" class="chart lg"></div></div>
  <div class="grid g2">
    ${chartCard('🌫️ Qualidade do ar — PM2.5 e PM10','vs. padrões CONAMA 491/2018 e diretrizes OMS 2021','amAr','lg')}
    ${chartCard('🌡️ Temperatura do ar','Média, máxima e mínima anuais','amTemp','lg')}
  </div>
  <div class="grid g2" style="margin-top:18px">
    ${chartCard('🌧️ Disponibilidade hídrica','Precipitação, disponibilidade de água e dias sem chuva','amAgua','lg')}
    ${chartCard('🌳 Uso e cobertura da terra','Composição mais recente (ha)','amLandDonut','lg')}
  </div>
  <div class="card" style="margin-top:18px">
    <div class="card-head"><div><h3>📉 Transformação da paisagem (1985 → ${D.resumo.amb_ano_max})</h3>
    <div class="card-sub">Evolução das macroclasses de uso da terra — base para entender pressões ambientais</div></div></div>
    <div id="amLandArea" class="chart xl"></div>
  </div>`;
  const scope=document.getElementById('amScope');
  D.meta.municipios.forEach(m=>scope.add(new Option(m.nome,m.cod)));
  const varSel=document.getElementById('amVar');
  Object.keys(VARS).forEach(v=>varSel.add(new Option(VARS[v].label+' ('+VARS[v].unidade+')',v)));
  varSel.value='pm25';
  const amState={gran:'anual'};
  const ref=D.meta.referencias;
  const drawExplore=()=>{
    if(!document.getElementById('amExplore'))return;
    const sc=+scope.value||0; const v=varSel.value; const meta=VARS[v];
    document.getElementById('amExpTitle').textContent='🔎 '+meta.label;
    const ix=echarts.getInstanceByDom(document.getElementById('amExplore')); if(ix)ix.dispose();
    if(amState.gran==='anual'){
      document.getElementById('amExpSub').textContent=`${nomeEscopo(sc)} · série anual (${D.resumo.amb_ano_min}–${D.resumo.amb_ano_max})`;
      const d=ambAnualEscopo(sc,v); const anos=Object.keys(d).map(Number).sort((a,b)=>a-b);
      CH.line('amExplore',anos,[{name:meta.label,data:anos.map(a=>d[a]),color:'#0e7c7b',area:true}],{yname:meta.unidade,legend:false});
    } else {
      const clim=ambMensalClimEscopo(sc,v);
      const temClim=clim.some(x=>x!=null);
      document.getElementById('amExpSub').textContent= temClim?`${nomeEscopo(sc)} · climatologia mensal (média histórica)`:'Sem climatologia mensal para esta variável';
      CH.bar('amExplore',MESES,[{name:meta.label,data:clim.map(x=>x==null?0:x),color:'#0e7c7b'}],{legend:false,label:true,labelFmt:p=>fmt(p.value)});
    }
  };
  varSel.onchange=drawExplore; bindPills('amGran',g=>{amState.gran=g;drawExplore();});
  const draw=()=>{
    if(!document.getElementById('amKpis'))return;
    drawExplore();
    const cod=+scope.value||0;
    const get=vid=>{ if(cod)return (D.amb_anual[cod]||{})[vid]||{};
      const out={}; const tmp={}; D.meta.municipios.forEach(m=>{const d=(D.amb_anual[m.cod]||{})[vid]||{};for(const a in d){tmp[a]=tmp[a]||[];tmp[a].push(d[a]);}});
      for(const a in tmp)out[a]=tmp[a].reduce((x,y)=>x+y,0)/tmp[a].length; return out;};
    const yrsOf=o=>Object.keys(o).map(Number).sort((a,b)=>a-b);
    const last=o=>{const k=yrsOf(o);return k.length?o[k[k.length-1]]:null;};
    const pm25=get('pm25'),pm10=get('pm10'),tm=get('temp_media'),tmax=get('temp_max'),tmin=get('temp_min'),
      pr=get('precip'),da=get('disp_agua'),dsc=get('dias_sem_chuva');
    const s25=RECO.arStatus(last(pm25),'pm25');
    document.getElementById('amKpis').innerHTML=
      kpi('PM2.5 atual',fmt(last(pm25)),'µg/m³',s25?s25.nivel:'','🌫️',s25?({ok:'#1b9e5a',info:'#1c6dd0',warn:'#e8590c',crit:'#c0142c'}[s25.classe]):'#888')+
      kpi('Temp. média atual',fmt(last(tm)),'°C','','🌡️','#e8590c')+
      kpi('Precipitação atual',f0(last(pr)),'mm/ano','','🌧️','#1c6dd0')+
      kpi('Dias sem chuva',f0(last(dsc)),'dias/ano','','🏜️','#e6a700');
    // ar
    const ya=yrsOf(pm25);
    const arInst=echarts.getInstanceByDom(document.getElementById('amAr'));if(arInst)arInst.dispose();
    CH.line('amAr',ya,[{name:'PM2.5',data:ya.map(a=>pm25[a]),color:'#e8590c'},{name:'PM10',data:ya.map(a=>pm10[a]??null),color:'#6741d9'}],{yname:'µg/m³'});
    const ai=echarts.getInstanceByDom(document.getElementById('amAr'));
    if(ai)ai.setOption({series:[{markLine:{silent:true,symbol:'none',data:[
      {yAxis:ref.CONAMA_PM25,label:{formatter:'CONAMA PM2.5',color:'#c0142c',fontSize:10},lineStyle:{color:'#c0142c',type:'dashed'}},
      {yAxis:ref.OMS_PM25,label:{formatter:'OMS PM2.5',color:'#1b9e5a',fontSize:10},lineStyle:{color:'#1b9e5a',type:'dashed'}}]}},{}]});
    // temp
    const yt=yrsOf(tm);
    const ti=echarts.getInstanceByDom(document.getElementById('amTemp'));if(ti)ti.dispose();
    CH.line('amTemp',yt,[{name:'Máxima',data:yt.map(a=>tmax[a]??null),color:'#e8590c'},
      {name:'Média',data:yt.map(a=>tm[a]),color:'#e6a700'},{name:'Mínima',data:yt.map(a=>tmin[a]??null),color:'#1c6dd0'}],{yname:'°C',scale:true});
    // agua
    const yw=yrsOf(pr);
    const wi=echarts.getInstanceByDom(document.getElementById('amAgua'));if(wi)wi.dispose();
    CH.line('amAgua',yw,[{name:'Precipitação (mm)',data:yw.map(a=>pr[a]),color:'#1c6dd0',yAxisIndex:0},
      {name:'Disp. água (mm)',data:yw.map(a=>da[a]??null),color:'#16a085',yAxisIndex:0},
      {name:'Dias sem chuva',data:yw.map(a=>dsc[a]??null),color:'#e6a700',yAxisIndex:1}],{y2:true,yname:'mm',y2name:'dias',scale:true});
    drawLand(cod);
  };
  const macLabel={floresta:'Floresta',campestre:'Campestre/Pantanal',agua:'Água',pastagem:'Pastagem',agricultura:'Agricultura',urbano:'Urbano',naoveg:'Não vegetado',outros:'Outros'};
  const macColor={floresta:'#1b7340',campestre:'#74c476',agua:'#1c6dd0',pastagem:'#e6a700',agricultura:'#e8590c',urbano:'#c0142c',naoveg:'#8a8a8a',outros:'#cccccc'};
  const order=['floresta','campestre','agua','pastagem','agricultura','urbano','naoveg','outros'];
  const drawLand=(cod)=>{
    const agg={}; const set=cod?[cod]:D.meta.municipios.map(m=>m.cod);
    set.forEach(c=>{const cob=D.cobertura[c]||{};for(const mc in cob)for(const y in cob[mc]){agg[mc]=agg[mc]||{};agg[mc][y]=(agg[mc][y]||0)+cob[mc][y];}});
    const yrsSet=new Set(); Object.values(agg).forEach(o=>Object.keys(o).forEach(y=>yrsSet.add(+y)));
    const yrs=[...yrsSet].sort((a,b)=>a-b); const lastY=yrs[yrs.length-1];
    const macros=order.filter(mc=>agg[mc]);
    // donut última composição
    const di=echarts.getInstanceByDom(document.getElementById('amLandDonut'));if(di)di.dispose();
    CH.donut('amLandDonut',macros.map(mc=>({name:macLabel[mc],value:Math.round(agg[mc][lastY]||0),itemStyle:{color:macColor[mc]}})));
    // area evolution
    const ai=echarts.getInstanceByDom(document.getElementById('amLandArea'));if(ai)ai.dispose();
    CH.line('amLandArea',yrs,macros.map(mc=>({name:macLabel[mc],color:macColor[mc],area:true,width:1.5,
      data:yrs.map(y=>Math.round(agg[mc][y]||0))})),{yname:'ha',smooth:false});
    const li=echarts.getInstanceByDom(document.getElementById('amLandArea'));
    if(li)li.setOption({series:macros.map(()=>({stack:'t'}))});
  };
  scope.onchange=draw; draw();
}

/* ================================================================
   8. MARCOS LEGAIS
   ================================================================ */
function renderLegislacao(root){
  const ref=D.meta.referencias;
  root.innerHTML=`
  <div class="section-desc">Marcos legais e diretrizes técnicas que fundamentam decisões de saúde pública e gestão ambiental na regional. Use-os para embasar planos, justificar investimentos e cobrar metas.</div>
  <div class="card" style="margin-bottom:18px;background:linear-gradient(135deg,#0e7c7b08,#1b9e5a08)">
    <h3>🌫️ Padrões de qualidade do ar (referência rápida)</h3>
    <div class="card-sub">Médias anuais — material particulado</div>
    <div class="scroll-x"><table class="data">
      <thead><tr><th>Poluente</th><th>CONAMA 491/2018 (PI-1)</th><th>CONAMA 491/2018 (final)</th><th>OMS 2021</th></tr></thead>
      <tbody>
        <tr><td><b>PM2.5</b> (fino)</td><td class="num">20 µg/m³</td><td class="num">${ref.CONAMA_PM25} µg/m³</td><td class="num" style="color:#1b9e5a">${ref.OMS_PM25} µg/m³</td></tr>
        <tr><td><b>PM10</b> (inalável)</td><td class="num">40 µg/m³</td><td class="num">${ref.CONAMA_PM10} µg/m³</td><td class="num" style="color:#1b9e5a">${ref.OMS_PM10} µg/m³</td></tr>
      </tbody></table></div>
    <div class="hint"><span class="i">ℹ️</span> O padrão final brasileiro equivale à diretriz da OMS de 2005; a diretriz da OMS de 2021 é de 2 a 4× mais restritiva, refletindo evidências de danos à saúde mesmo em concentrações baixas.</div>
  </div>
  <div class="grid g2">${D.meta.legislacao.map(l=>`
    <div class="law"><div class="l-head"><span class="l-sigla">${l.sigla}</span><span class="l-tema">${l.tema}</span></div>
      <div class="l-resumo">${l.resumo}</div>
      ${l.url?`<div style="margin-top:9px"><a href="${l.url}" target="_blank" rel="noopener">Acessar texto oficial ↗</a></div>`:''}</div>`).join('')}</div>
  `;
}

/* ================================================================
   9. SOBRE & METODOLOGIA
   ================================================================ */
function renderSobre(root){
  const r=D.resumo,W=D.meta.pesos_indice;
  root.innerHTML=`
  <div class="grid g2">
    <div class="card"><h3>🎯 Objetivo</h3><div class="card-sub">Para que serve</div>
      <p style="font-size:14px;color:#445a66;line-height:1.6">Plataforma de inteligência territorial que integra dados de <b>saúde</b> (internações e óbitos) e <b>ambiente</b> (clima, qualidade do ar e uso da terra) dos ${r.n_municipios} municípios da Regional de Saúde de Cáceres (MT). Destina-se a <b>gestores públicos</b>, <b>técnicos de saúde</b>, <b>cientistas</b> e à <b>comunidade</b>, apoiando decisões baseadas em evidência sobre onde e como atuar.</p></div>
    <div class="card"><h3>🗂️ Fontes de dados</h3><div class="card-sub">Origem e período</div>
      <table class="data"><tbody>
        <tr><td><b>Internações</b> (mensal, por residência)</td><td>SIH/SUS (DATASUS)</td><td class="num">${r.ano_min}–${r.ano_max}</td></tr>
        <tr><td><b>Óbitos</b> (anual, por residência)</td><td>SIM/DO (DATASUS)</td><td class="num">${r.ano_min}–${r.ano_max_obito}</td></tr>
        <tr><td><b>Clima / atmosfera</b></td><td>MapBiomas · BR-DWGD</td><td class="num">${r.amb_ano_min}–${r.amb_ano_max}</td></tr>
        <tr><td><b>Uso da terra</b></td><td>MapBiomas Coleção 9</td><td class="num">${r.amb_ano_min}–${r.amb_ano_max}</td></tr>
        <tr><td><b>População</b></td><td>IBGE Censo 2022</td><td class="num">2022</td></tr>
      </tbody></table></div>
  </div>
  <div class="card" style="margin-top:18px"><h3>🧮 Índice de Prioridade — metodologia</h3>
    <div class="card-sub">Composto transparente, normalizado 0–100 entre os municípios da regional</div>
    <p style="font-size:14px;color:#445a66;line-height:1.6">Combina três eixos, cada um normalizado (mín–máx) entre os ${r.n_municipios} municípios:</p>
    <div class="grid g3" style="margin:14px 0">
      <div class="reco"><div class="r-tag">Peso ${Math.round(W.carga*100)}%</div><div class="r-title">Carga de saúde</div><div class="r-text">Taxa média recente (2020–${r.ano_max}) de internações/óbitos por <b>100 mil habitantes</b>, somando todos os grupos.</div></div>
      <div class="reco warn"><div class="r-tag">Peso ${Math.round(W.tend*100)}%</div><div class="r-title">Agravamento</div><div class="r-text">Proporção de grupos de doença com <b>tendência de alta</b> significativa (regressão sobre a série anual).</div></div>
      <div class="reco crit"><div class="r-tag">Peso ${Math.round(W.amb*100)}%</div><div class="r-title">Pressão ambiental</div><div class="r-text">Combina PM2.5/PM10 vs. OMS, <b>aquecimento</b> (tendência de temperatura) e <b>perda florestal</b> (1985→${r.amb_ano_max}).</div></div>
    </div>
    <div class="alert warn"><div class="a-ico">🏥</div><div class="a-body"><b>Cobertura dos dados de saúde:</b> as internações (SIH/SUS) são registradas no município do <b>hospital</b>. Apenas 6 municípios da regional possuem hospital com registros amplos (Cáceres, Mirassol d'Oeste, Araputanga, Jauru, Rio Branco e Salto do Céu). Os demais 7 municípios aparecem essencialmente com <b>óbitos por neoplasia</b> (SIM/DO, por residência), pois seus pacientes são internados nos polos regionais. Municípios com cobertura parcial são sinalizados com ⚠️ e seu índice reflete sobretudo a dimensão ambiental.</div></div>
    <div class="alert info"><div class="a-ico">⚠️</div><div class="a-body"><b>Outras limitações:</b> o índice é uma ferramenta de triagem <b>comparativa</b> entre municípios, não um diagnóstico clínico ou epidemiológico definitivo. Os dados do SIH/SUS refletem internações (não incidência total). As correlações são <b>contemporâneas e anuais</b> — não estabelecem causalidade nem captam defasagens temporais. Recomenda-se combinar com vigilância local, dados de atenção primária e estudos dedicados.</div></div>
  </div>
  <div class="card" style="margin-top:18px"><h3>📐 Métodos estatísticos</h3>
    <ul style="font-size:14px;color:#445a66;line-height:1.8;margin-left:18px">
      <li><b>Correlação de Pearson e Spearman</b> entre séries anuais de saúde e variáveis ambientais (n = nº de anos com dados).</li>
      <li><b>Tendências</b> estimadas por regressão linear / Theil-Sen, com significância via Spearman (ano × valor).</li>
      <li><b>Taxas</b> por 100 mil habitantes usando população do Censo 2022 (denominador fixo).</li>
      <li><b>Climatologia mensal</b>: média histórica por mês para revelar sazonalidade.</li>
      <li><b>Macroclasses de uso da terra</b> agregadas a partir de 25 classes do MapBiomas.</li>
      <li><b>Reconciliação de municípios pelo NOME:</b> os arquivos de origem trazem códigos IBGE inconsistentes para 4 municípios (Reserva do Cabaçal, Rio Branco, Salto do Céu e São José dos Quatro Marcos aparecem deslocados). Saúde e ambiente são coerentes entre si pelo nome, então a junção é feita por nome normalizado e o código IBGE oficial e a população são reatribuídos corretamente.</li>
    </ul>
  </div>
  <div class="footnote">Plataforma construída para a Regional de Saúde de Cáceres (MT). Todo o processamento é reproduzível (script ETL em <code>etl/build_data.py</code>). Dados de domínio público; uso recomendado com responsabilidade técnica.</div>
  `;
}

/* ================= boot ================= */
setView('overview');
})();
