/* ============================================================
   recommendations.js — motor de apoio à decisão
   Gera alertas, diagnósticos e recomendações de ação a partir
   dos dados, correlações e marcos legais (CONAMA, OMS, etc.).
   ============================================================ */
const RECO = (() => {
  const D = window.DADOS;
  const REF = D.meta.referencias;
  const G = D.meta.grupos;
  const NOMES = D.meta.nomes;

  const fmt = n => n==null?'—':(+n).toLocaleString('pt-BR',{maximumFractionDigits:1});
  const fmt0 = n => n==null?'—':Math.round(+n).toLocaleString('pt-BR');

  // ---- série anual de saúde (sih+sim) ----
  function serieSaude(cod, grupo){
    const d = (D.saude_anual[cod]||{})[grupo]||{};
    const out={}; for(const a in d) out[a]=(d[a].sih||0)+(d[a].sim||0); return out;
  }
  function totalRecente(cod, grupo, anos=[2020,2021,2022,2023,2024]){
    const s=serieSaude(cod,grupo); return anos.reduce((t,a)=>t+(s[a]||0),0);
  }
  // ---- tendência simples (sinal via regressão linear) ----
  function tendencia(serie){
    const anos=Object.keys(serie).map(Number).sort((a,b)=>a-b);
    if(anos.length<5) return {dir:'flat',pct:0};
    const ys=anos.map(a=>serie[a]); const n=anos.length;
    const mx=anos.reduce((a,b)=>a+b,0)/n, my=ys.reduce((a,b)=>a+b,0)/n;
    let num=0,den=0; anos.forEach((x,i)=>{num+=(x-mx)*(ys[i]-my);den+=(x-mx)**2});
    const slope=den?num/den:0;
    const first=ys.slice(0,3).reduce((a,b)=>a+b,0)/3, last=ys.slice(-3).reduce((a,b)=>a+b,0)/3;
    const pct=first?((last-first)/first*100):0;
    return {dir: pct>12?'up':pct<-12?'down':'flat', pct:Math.round(pct), slope};
  }

  // ---- principais doenças de um município (carga recente) ----
  function topDoencas(cod, n=5){
    return Object.keys(G).map(g=>({
      grupo:g, label:G[g].label, cat:G[g].cat, cor:G[g].cor,
      recente: totalRecente(cod,g),
      tend: tendencia(serieSaude(cod,g))
    })).filter(d=>d.recente>0).sort((a,b)=>b.recente-a.recente).slice(0,n);
  }

  // ---- avaliação da qualidade do ar vs CONAMA/OMS ----
  function arStatus(valor, tipo){ // tipo 'pm25'|'pm10'
    if(valor==null) return null;
    const conama = tipo==='pm25'?REF.CONAMA_PM25:REF.CONAMA_PM10;
    const oms = tipo==='pm25'?REF.OMS_PM25:REF.OMS_PM10;
    let nivel, classe;
    if(valor<=oms){ nivel='Dentro da diretriz da OMS'; classe='ok'; }
    else if(valor<=conama){ nivel='Atende CONAMA, acima da OMS'; classe='info'; }
    else if(valor<=conama*2){ nivel='Acima do padrão CONAMA'; classe='warn'; }
    else { nivel='Muito acima do padrão (crítico)'; classe='crit'; }
    return {valor, conama, oms, nivel, classe, razaoOMS:(valor/oms)};
  }

  // ---- correlações relevantes (|r|>=0.5 e p<0.1) para o município ----
  function correlRelevantes(cod, minR=0.5){
    const c=D.correl[cod]||{}; const out=[];
    for(const g in c) for(const v in c[g]){
      const o=c[g][v];
      if(o.r!=null && Math.abs(o.r)>=minR && (o.p==null||o.p<0.1))
        out.push({grupo:g,glabel:G[g].label,var:v,vlabel:(D.meta.variaveis_amb[v]||{}).label||v,
                  r:o.r,p:o.p,n:o.n});
    }
    return out.sort((a,b)=>Math.abs(b.r)-Math.abs(a.r));
  }

  // ===========================================================
  // ALERTAS — síntese de riscos do município
  // ===========================================================
  function alertas(cod){
    const A=[]; const amb=D.amb_anual[cod]||{}; const pri=D.prioridade[cod];
    const recente=y=>{const d=amb[y]||{};return d;};
    const ultimo=v=>{const d=amb[v]||{};const ks=Object.keys(d).map(Number);return ks.length?d[Math.max(...ks)]:null;};

    // prioridade geral
    if(pri.categoria==='Crítica')
      A.push({t:'crit',ico:'🚨',html:`<b>Prioridade Crítica</b> (índice ${pri.score}/100). Município com maior necessidade de intervenção integrada saúde-ambiente da regional.`});
    else if(pri.categoria==='Alta')
      A.push({t:'warn',ico:'⚠️',html:`<b>Prioridade Alta</b> (índice ${pri.score}/100). Requer atenção prioritária e monitoramento reforçado.`});

    // qualidade do ar
    const pm25=ultimo('pm25'), pm10=ultimo('pm10');
    const s25=arStatus(pm25,'pm25'); const s10=arStatus(pm10,'pm10');
    if(s25 && (s25.classe==='warn'||s25.classe==='crit'))
      A.push({t:s25.classe,ico:'🌫️',html:`<b>PM2.5 em ${fmt(pm25)} µg/m³</b> — ${s25.nivel}. ${(s25.razaoOMS).toFixed(1)}× a diretriz da OMS (${REF.OMS_PM25} µg/m³). Risco respiratório e cardiovascular elevado.`});
    else if(s25 && s25.classe==='info')
      A.push({t:'info',ico:'🌫️',html:`<b>PM2.5 em ${fmt(pm25)} µg/m³</b> — atende ao padrão CONAMA, porém acima da diretriz da OMS (${REF.OMS_PM25} µg/m³).`});

    // tendência de aquecimento
    const td=amb['temp_media']||{}; const tt=tendencia(td);
    if(tt.slope>0.02){
      const anos=Object.keys(td).map(Number); const dif=(td[Math.max(...anos)]-td[Math.min(...anos)]);
      A.push({t:'warn',ico:'🌡️',html:`<b>Aquecimento local:</b> temperatura média subiu ~${dif.toFixed(1)}°C desde 1985. Aumenta risco de doenças cardiovasculares, renais e ampliação de vetores.`});
    }
    // perda florestal
    const fl=(D.cobertura[cod]||{}).floresta||{};
    if(fl[1985] && fl[2024] && fl[1985]>0){
      const perda=(fl[1985]-fl[2024])/fl[1985]*100;
      if(perda>15) A.push({t:'warn',ico:'🌳',html:`<b>Perda de cobertura florestal de ${perda.toFixed(0)}%</b> (1985→2024). Reduz regulação climática local e pode favorecer doenças vetoriais e erosão de serviços ecossistêmicos.`});
    }
    // doença em alta
    const top=topDoencas(cod,8).filter(d=>d.tend.dir==='up' && d.recente>15);
    top.slice(0,2).forEach(d=>A.push({t:'warn',ico:'📈',
      html:`<b>${d.label} em alta:</b> +${d.tend.pct}% nos últimos anos (${fmt0(d.recente)} casos recentes). ${G[d.grupo].desc}`}));

    if(!A.length) A.push({t:'ok',ico:'✅',html:'Sem alertas críticos no momento. Manter vigilância de rotina e monitoramento ambiental.'});
    return A;
  }

  // ===========================================================
  // RECOMENDAÇÕES — ações orientadas (o que fazer)
  // ===========================================================
  function recomendacoes(cod){
    const R=[]; const amb=D.amb_anual[cod]||{};
    const ultimo=v=>{const d=amb[v]||{};const ks=Object.keys(d).map(Number);return ks.length?d[Math.max(...ks)]:null;};
    const top=topDoencas(cod,6);
    const correls=correlRelevantes(cod);
    const cats=new Set(top.map(t=>t.cat));

    // Ar / respiratórias
    const pm25=ultimo('pm25'); const s25=arStatus(pm25,'pm25');
    const respUp = top.find(t=>['ASMA','DPOC','PNEUMONIA','RESPIRATORIO'].includes(t.grupo));
    if((s25 && s25.classe!=='ok') || respUp){
      R.push({nivel:s25&&(s25.classe==='crit'||s25.classe==='warn')?'crit':'warn',
        tag:'Qualidade do Ar',
        title:'Vigilância e controle da poluição atmosférica e queimadas',
        text:`Implantar/intensificar monitoramento de material particulado (PM2.5/PM10) e plano de prevenção a queimadas (período seco). Articular Saúde + Meio Ambiente + Bombeiros. Emitir alertas à população sensível (crianças, idosos, cardiopatas, pneumopatas). Referência: <b>Resolução CONAMA 491/2018</b> (PM2.5 ≤ ${REF.CONAMA_PM25} µg/m³) e <b>Diretrizes OMS 2021</b> (≤ ${REF.OMS_PM25} µg/m³).`});
    }
    // Vetoriais / dengue
    const vet = top.find(t=>['DENGUE','LEISHMANIOSE_MALARIA','ANIMAIS_PECONHENTOS'].includes(t.grupo));
    if(vet){
      R.push({nivel: vet.tend.dir==='up'?'warn':'info', tag:'Doenças Vetoriais',
        title:'Manejo integrado de vetores ligado ao calendário climático',
        text:`Antecipar ações de controle vetorial (LIRAa, mutirões, eliminação de criadouros) ao início do período chuvoso/quente, quando há pico sazonal. Integrar dados meteorológicos à vigilância. Foco em <b>${vet.label}</b>.`});
    }
    // Hídricas / saneamento
    const hid = top.find(t=>t.grupo==='DIARREICAS_GASTROENTERITES');
    if(hid){
      R.push({nivel: hid.tend.dir==='up'?'warn':'info', tag:'Saneamento & Água',
        title:'Vigilância da qualidade da água e saneamento básico',
        text:`Reforçar o VIGIAGUA e ações de saneamento. Doenças diarreicas estão entre as principais causas e respondem a água segura e esgotamento sanitário. Referência: <b>Lei 11.445/2007</b> (Marco do Saneamento) e <b>Portaria GM/MS 888/2021</b>.`});
    }
    // Calor / crônicas
    const calor = top.find(t=>['CARDIOVASCULAR','RENAL_URINARIO'].includes(t.grupo));
    const td=amb['temp_media']||{}; const aquece=tendencia(td).slope>0.02;
    if(calor && aquece){
      R.push({nivel:'warn', tag:'Adaptação Climática',
        title:'Plano de proteção a ondas de calor',
        text:`Estabelecer protocolo de resposta a calor extremo: hidratação, ambientes refrescados, atenção a idosos e cardiopatas. Doenças cardiovasculares/renais crescem com o aquecimento observado. Referência: <b>Política Nacional sobre Mudança do Clima (Lei 12.187/2009)</b>.`});
    }
    // Cobertura florestal
    const fl=(D.cobertura[cod]||{}).floresta||{};
    if(fl[1985] && fl[2024] && (fl[1985]-fl[2024])/fl[1985]>0.15){
      R.push({nivel:'info', tag:'Uso da Terra',
        title:'Recuperação e proteção de remanescentes vegetais',
        text:`Priorizar recomposição de APPs e Reserva Legal e proteção de remanescentes florestais, que regulam o clima local e a oferta de água. Referência: <b>Código Florestal (Lei 12.651/2012)</b> e <b>SNUC (Lei 9.985/2000)</b>.`});
    }
    // Correlações fortes detectadas
    if(correls.length){
      const c=correls[0];
      R.push({nivel:'info', tag:'Evidência Estatística Local',
        title:`Relação detectada: ${c.glabel} × ${c.vlabel}`,
        text:`Correlação ${c.r>0?'positiva':'negativa'} (r=${c.r}${c.p!=null?', p='+c.p:''}, n=${c.n} anos) entre <b>${c.glabel}</b> e <b>${c.vlabel}</b>. Sugere monitorar esse fator ambiental como sinal de alerta precoce. <i>Correlação não implica causalidade — usar como hipótese para investigação.</i>`});
    }
    // Saúde mental / desnutrição (vulnerabilidade)
    if(top.find(t=>t.grupo==='TRANSTORNOS_MENTAIS' && t.tend.dir==='up'))
      R.push({nivel:'info',tag:'Saúde Mental',title:'Fortalecer a rede de atenção psicossocial (RAPS)',
        text:'Internações por transtornos mentais em elevação. Ampliar CAPS, atenção primária e ações comunitárias.'});

    if(!R.length) R.push({nivel:'info',tag:'Rotina',title:'Manter vigilância integrada',
      text:'Indicadores sem desvios críticos. Recomenda-se manter o monitoramento de rotina e a integração dos dados de saúde e ambiente.'});
    return R;
  }

  // diagnóstico textual curto
  function diagnostico(cod){
    const pri=D.prioridade[cod]; const top=topDoencas(cod,3);
    const nome=NOMES[cod];
    const lista=top.map(t=>t.label).join(', ');
    return `${nome} apresenta índice de prioridade <b>${pri.score}/100 (${pri.categoria})</b>. `+
      `As principais cargas de internação recentes são: <b>${lista}</b>. `+
      (pri.pm25!=null?`Qualidade do ar (PM2.5) mais recente: <b>${fmt(pri.pm25)} µg/m³</b>. `:'')+
      `${pri.agravamento>0?`Cerca de <b>${pri.agravamento}%</b> dos agravos monitorados mostram tendência de alta.`:''}`;
  }

  return {alertas, recomendacoes, diagnostico, topDoencas, correlRelevantes,
          arStatus, tendencia, serieSaude, totalRecente, fmt, fmt0};
})();
