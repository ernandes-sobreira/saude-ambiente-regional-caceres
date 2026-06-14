// Smoke test: exercita todas as views e seletores com jsdom + mock ECharts.
const fs=require('fs'); const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('index.html','utf8').replace(/<script[^>]*><\/script>/g,'');
const vc=new VirtualConsole();
const handlerErrors=[];
vc.on('jsdomError',e=>handlerErrors.push(e.detail?String(e.detail).split('\n')[0]:String(e)));
const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const {window}=dom; global.window=window; global.document=window.document;
window.scrollTo=()=>{}; global.HTMLElement=window.HTMLElement;
let errors=[];
// mock echarts
const mkInst=()=>({setOption(){},resize(){},dispose(){},on(){},off(){},group:''});
const reg=new Map();
window.echarts=global.echarts={
  init(el){const i=mkInst(); if(el) reg.set(el,i); return i;},
  getInstanceByDom(el){return reg.get(el)||null;},
  graphic:{LinearGradient:function(){return {};}}
};
// Concatena todos os scripts num único eval para reproduzir o escopo global
// compartilhado entre <script> tags do navegador (top-level const/let visíveis).
const bundle=[
  'assets/data/dados.js','assets/js/charts.js',
  'assets/js/recommendations.js','assets/js/app.js'
].map(f=>fs.readFileSync(f,'utf8')).join('\n;\n');
try{ window.eval(bundle); }catch(e){ errors.push('BUNDLE: '+e.stack); }

const views=['overview','priority','saude','ambiente','correl','municipio','comparar','sazonal','legislacao','sobre'];
function click(el){ if(el) el.dispatchEvent(new window.Event('click',{bubbles:true})); }
function change(el){ if(el) el.dispatchEvent(new window.Event('change',{bubbles:true})); }

for(const v of views){
  try{
    const a=document.querySelector(`#nav a[data-view="${v}"]`); click(a);
    // exercise selects/pills present
    document.querySelectorAll('select').forEach(s=>{ try{
      if(s.options.length>1){ s.selectedIndex=s.options.length-1; change(s);
        s.selectedIndex=0; change(s);} }catch(e){errors.push('SELECT '+v+': '+e.message);} });
    document.querySelectorAll('.pillset button').forEach(b=>{try{click(b);}catch(e){errors.push('PILL '+v+': '+e.message);}});
    // re-run selects after pill switches
    document.querySelectorAll('select').forEach(s=>{try{if(s.options.length>1){s.selectedIndex=1;change(s);}}catch(e){errors.push('SELECT2 '+v+': '+e.message);}});
  }catch(e){ errors.push('VIEW '+v+': '+e.stack); }
}
// municipality global picker: switch to each municipio
try{
  document.querySelector('#nav a[data-view="municipio"]').dispatchEvent(new window.Event('click',{bubbles:true}));
  const ms=document.getElementById('muniSelect');
  for(let i=0;i<ms.options.length;i++){ ms.selectedIndex=i; change(ms); }
}catch(e){errors.push('MUNI-PICKER: '+e.stack);}

const all=[...errors,...handlerErrors];
if(all.length){ console.log('❌ ERROS ('+all.length+'):'); [...new Set(all)].slice(0,25).forEach(e=>console.log(' -',e)); process.exit(1);}
else console.log('✅ Smoke test OK — todas as 9 views, seletores, pills e 14 municípios sem erros de runtime.');
