/* ============================================================
   charts.js — fábrica de gráficos ECharts (tema unificado)
   ============================================================ */
const CH = (() => {
  const FONT = "Inter, sans-serif";
  const PAL = ['#0e7c7b','#e8590c','#1c6dd0','#6741d9','#1b9e5a','#d6336c',
               '#e6a700','#0a5f5e','#9b59b6','#2c3e50','#16a085','#c0392b'];
  const AX = { axisLine:{lineStyle:{color:'#cfd9de'}}, axisLabel:{color:'#5a6e78',fontSize:11},
               axisTick:{show:false}, splitLine:{lineStyle:{color:'#eef2f4'}} };
  const instances = [];

  function base(){
    return {
      color: PAL,
      textStyle:{fontFamily:FONT},
      grid:{left:48,right:24,top:40,bottom:42,containLabel:true},
      tooltip:{ trigger:'axis', backgroundColor:'rgba(19,33,43,.94)', borderWidth:0,
        textStyle:{color:'#fff',fontSize:12.5,fontFamily:FONT}, padding:[9,13],
        extraCssText:'border-radius:9px;box-shadow:0 6px 22px rgba(0,0,0,.25)' },
      legend:{ top:6, right:10, icon:'roundRect', itemWidth:11, itemHeight:11,
        textStyle:{color:'#445a66',fontSize:11.5}, itemGap:14 }
    };
  }

  function mount(el, option){
    if(typeof el==='string') el=document.getElementById(el);
    if(!el) return null;
    const ch = echarts.init(el, null, {renderer:'canvas'});
    ch.setOption(option);
    instances.push(ch);
    return ch;
  }
  function resizeAll(){ instances.forEach(c=>{try{c.resize()}catch(e){}}); }
  function clearAll(){ instances.forEach(c=>{try{c.dispose()}catch(e){}}); instances.length=0; }
  window.addEventListener('resize', ()=>resizeAll());

  /* ---------- Linha temporal ---------- */
  function line(el, x, series, opt={}){
    const o = Object.assign(base(), {
      grid:{left:50,right:opt.right||24,top:series.length>1?44:24,bottom:40,containLabel:true},
      xAxis:{type:'category',data:x,boundaryGap:false,...AX},
      yAxis:{type:'value',name:opt.yname||'',nameTextStyle:{color:'#7b8f9a',fontSize:11},...AX,
             ...(opt.y2?{}:{}),scale:!!opt.scale},
      series: series.map((s,i)=>({
        name:s.name, type:'line', data:s.data, smooth:opt.smooth!==false?.35:false,
        symbol:'circle', symbolSize:opt.symbol||5, showSymbol:s.data.length<40,
        lineStyle:{width:s.width||2.4, color:s.color}, itemStyle:{color:s.color},
        areaStyle: s.area? {color:new echarts.graphic.LinearGradient(0,0,0,1,[
            {offset:0,color:(s.color||PAL[i])+'55'},{offset:1,color:(s.color||PAL[i])+'05'}])} : null,
        markLine: s.markLine, yAxisIndex:s.yAxisIndex||0,
        emphasis:{focus:'series'}
      }))
    });
    if(opt.legend===false) delete o.legend;
    if(opt.y2){
      o.yAxis=[o.yAxis, {type:'value',name:opt.y2name||'',nameTextStyle:{color:'#7b8f9a',fontSize:11},...AX,scale:true,splitLine:{show:false}}];
    }
    if(opt.markArea) o.series[0].markArea = opt.markArea;
    return mount(el,o);
  }

  /* ---------- Barras ---------- */
  function bar(el, cats, series, opt={}){
    const horiz = opt.horizontal;
    const o = Object.assign(base(),{
      grid:{left:horiz?8:50,right:24,top:series.length>1?44:18,bottom:horiz?12:60,containLabel:true},
      tooltip:{...base().tooltip, trigger:'axis', axisPointer:{type:'shadow'}},
      xAxis: horiz?{type:'value',...AX}:{type:'category',data:cats,...AX,axisLabel:{...AX.axisLabel,interval:0,rotate:opt.rotate||(cats.length>6?38:0)}},
      yAxis: horiz?{type:'category',data:cats,...AX,axisLabel:{...AX.axisLabel}}:{type:'value',name:opt.yname||'',nameTextStyle:{color:'#7b8f9a',fontSize:11},...AX},
      series: series.map(s=>({
        name:s.name, type:'bar', data:s.data, stack:opt.stack?'t':null,
        barMaxWidth:opt.barWidth||38, barGap:'18%',
        itemStyle:{color:s.color, borderRadius: horiz?[0,6,6,0]:(opt.stack?0:[6,6,0,0])},
        label: opt.label?{show:true,position:horiz?'right':'top',color:'#5a6e78',fontSize:11,formatter:opt.labelFmt}:null,
        emphasis:{focus:'series'}
      }))
    });
    if(opt.legend===false||series.length<2) delete o.legend;
    if(opt.colorByPoint && series.length===1){
      o.series[0].itemStyle = {borderRadius: horiz?[0,6,6,0]:[6,6,0,0]};
      o.series[0].data = series[0].data.map((v,i)=>({value: (v&&v.value!==undefined)?v.value:v, itemStyle:{color:(series[0].colors||PAL)[i%PAL.length]}}));
    }
    return mount(el,o);
  }

  /* ---------- Heatmap genérico ---------- */
  function heatmap(el, xCats, yCats, data, opt={}){
    // data: [[xIdx,yIdx,value],...]
    const vals = data.map(d=>d[2]).filter(v=>v!=null);
    const min = opt.min!=null?opt.min:Math.min(...vals,0);
    const max = opt.max!=null?opt.max:Math.max(...vals,1);
    const o = {
      textStyle:{fontFamily:FONT},
      tooltip:{position:'top',backgroundColor:'rgba(19,33,43,.94)',borderWidth:0,
        textStyle:{color:'#fff',fontSize:12.5},padding:[9,13],
        extraCssText:'border-radius:9px',
        formatter: opt.tip || (p=>`${yCats[p.data[1]]} · ${xCats[p.data[0]]}<br><b>${p.data[2]??'—'}</b>`)},
      grid:{left:opt.left||8,right:18,top:14,bottom:opt.bottom||60,containLabel:true},
      xAxis:{type:'category',data:xCats,splitArea:{show:true},
        axisLabel:{color:'#5a6e78',fontSize:11,interval:0,rotate:opt.rotate||0},axisLine:{show:false},axisTick:{show:false}},
      yAxis:{type:'category',data:yCats,splitArea:{show:true},
        axisLabel:{color:'#445a66',fontSize:11.5},axisLine:{show:false},axisTick:{show:false},inverse:opt.inverse},
      visualMap:{min,max,calculable:true,orient:'horizontal',left:'center',bottom:opt.vmBottom??8,
        itemHeight:120,itemWidth:14,textStyle:{color:'#5a6e78',fontSize:11},
        inRange:{color: opt.colors || ['#e6f4f3','#9fd9d4','#3fb3ad','#0e7c7b','#0a4f4e']}},
      series:[{type:'heatmap',data,label:{show:opt.showLabel,fontSize:10,color:'#13212b',
        formatter:opt.labelFmt||(p=>p.data[2]??'')},
        itemStyle:{borderColor:'#fff',borderWidth:1.5},
        emphasis:{itemStyle:{shadowBlur:8,shadowColor:'rgba(0,0,0,.3)'}}}]
    };
    return mount(el,o);
  }

  /* ---------- Heatmap de correlação (diverging) ---------- */
  function corrHeatmap(el, xCats, yCats, data, opt={}){
    return heatmap(el,xCats,yCats,data,{
      min:-1,max:1,showLabel:true,
      labelFmt:p=>p.data[2]==null?'':p.data[2].toFixed(2),
      colors:['#1c6dd0','#7fb3e8','#eef2f4','#f3a0b8','#c0142c'],
      tip:opt.tip, rotate:opt.rotate||32, bottom:opt.bottom||66, left:opt.left||8, vmBottom:0
    });
  }

  /* ---------- Scatter com regressão ---------- */
  function scatter(el, points, opt={}){
    // points: [[x,y,label],...]
    const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
    let line=null;
    if(points.length>2){
      const n=xs.length, sx=xs.reduce((a,b)=>a+b,0), sy=ys.reduce((a,b)=>a+b,0);
      const sxy=xs.reduce((a,_,i)=>a+xs[i]*ys[i],0), sxx=xs.reduce((a,b)=>a+b*b,0);
      const b=(n*sxy-sx*sy)/(n*sxx-sx*sx||1), a=(sy-b*sx)/n;
      const xmin=Math.min(...xs),xmax=Math.max(...xs);
      line=[[xmin,a+b*xmin],[xmax,a+b*xmax]];
    }
    const o=Object.assign(base(),{
      grid:{left:54,right:24,top:18,bottom:46,containLabel:true},
      tooltip:{trigger:'item',backgroundColor:'rgba(19,33,43,.94)',borderWidth:0,
        textStyle:{color:'#fff',fontSize:12.5},padding:[9,13],extraCssText:'border-radius:9px',
        formatter:p=>p.seriesType==='scatter'?`${p.data[2]||''}<br>${opt.xname||'x'}: <b>${(+p.data[0]).toFixed(2)}</b><br>${opt.yname||'y'}: <b>${(+p.data[1]).toFixed(1)}</b>`:''},
      xAxis:{type:'value',name:opt.xname||'',nameLocation:'middle',nameGap:28,nameTextStyle:{color:'#7b8f9a',fontSize:12},scale:true,...AX},
      yAxis:{type:'value',name:opt.yname||'',nameTextStyle:{color:'#7b8f9a',fontSize:12},scale:true,...AX},
      series:[
        {type:'scatter',data:points,symbolSize:opt.size||12,
         itemStyle:{color:opt.color||'#0e7c7b',opacity:.78,borderColor:'#fff',borderWidth:1}},
        ...(line?[{type:'line',data:line,showSymbol:false,smooth:false,
         lineStyle:{color:opt.color||'#e8590c',width:2,type:'dashed'},tooltip:{show:false}}]:[])
      ]
    });
    delete o.legend;
    return mount(el,o);
  }

  /* ---------- Radar ---------- */
  function radar(el, indicators, series){
    const o={textStyle:{fontFamily:FONT},color:PAL,
      legend:{top:4,textStyle:{color:'#445a66',fontSize:11.5},icon:'roundRect',itemWidth:11,itemHeight:11},
      tooltip:{backgroundColor:'rgba(19,33,43,.94)',borderWidth:0,textStyle:{color:'#fff',fontSize:12.5},padding:[9,13],extraCssText:'border-radius:9px'},
      radar:{indicator:indicators,radius:'66%',center:['50%','55%'],
        axisName:{color:'#445a66',fontSize:11},splitLine:{lineStyle:{color:'#e3eaed'}},
        splitArea:{areaStyle:{color:['#fafcfc','#f2f7f7']}},axisLine:{lineStyle:{color:'#dde6e9'}}},
      series:[{type:'radar',data:series.map(s=>({name:s.name,value:s.value,
        areaStyle:{opacity:.16},lineStyle:{width:2.2},symbolSize:5}))}]
    };
    return mount(el,o);
  }

  /* ---------- Donut ---------- */
  function donut(el, data, opt={}){
    const o={textStyle:{fontFamily:FONT},color:opt.colors||PAL,
      tooltip:{trigger:'item',backgroundColor:'rgba(19,33,43,.94)',borderWidth:0,
        textStyle:{color:'#fff',fontSize:12.5},padding:[9,13],extraCssText:'border-radius:9px',
        formatter:p=>`${p.name}<br><b>${(+p.value).toLocaleString('pt-BR')}</b> (${p.percent}%)`},
      legend:{type:'scroll',orient:'vertical',right:6,top:'middle',textStyle:{color:'#445a66',fontSize:11.5},itemWidth:11,itemHeight:11,icon:'circle'},
      series:[{type:'pie',radius:['52%','78%'],center:['33%','52%'],avoidLabelOverlap:true,
        itemStyle:{borderColor:'#fff',borderWidth:2,borderRadius:4},
        label:{show:false},labelLine:{show:false},
        data:data}]
    };
    return mount(el,o);
  }

  return {mount,line,bar,heatmap,corrHeatmap,scatter,radar,donut,resizeAll,clearAll,PAL};
})();
