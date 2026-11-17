"use strict";
const state = { trends: [], ideas: [], top: [], sources: [], activeIdea: null, selectedTrendId: null, ai: false, brief: "" };
const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);
const number = (x) => Number.isFinite(Number(x)) ? Number(x) : 0;
const date = (x) => x ? new Intl.DateTimeFormat("pt-PT", {day:"2-digit",month:"short",year:"numeric"}).format(new Date(x)) : "Por atualizar";
const PLATFORM_LABELS = ["Instagram","TikTok","LinkedIn","YouTube","Facebook","Threads","Geral"];
const pages = {
 dashboard:["OVERVIEW","O teu radar de social media","Do sinal à estratégia. Descobre, analisa e cria."],
 explorer:["TREND EXPLORER","Explorar oportunidades","Fontes verificáveis, filtros e prioridade explicável."],
 studio:["CONTENT STUDIO","Da tendência à publicação","Cria, edita e gere a produção editorial."],
 planner:["CONTENT PLANNER","Calendário editorial","Organiza as publicações por data e acompanha estados."],
 sources:["DATA SOURCES","Fontes e transparência","O que estamos a recolher e com que limitações."]
};

async function api(path, method="GET", body){
  const opts={method,headers:{}};
  if(body!==undefined){opts.headers["Content-Type"]="application/json";opts.body=JSON.stringify(body);}
  const response=await fetch(path,opts);
  if(!response.ok){
    const msg=await response.json().catch(()=>({detail:"O pedido falhou."}));
    throw new Error(typeof msg.detail==="string" ? msg.detail : "Erro HTTP "+response.status);
  }
  const type=response.headers.get("content-type")||"";
  return type.includes("json") ? response.json() : response.text();
}
let toastTimer;
function notify(message){
  const element=$("toast");element.textContent=message;element.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>element.hidden=true,4200);
}
function errorText(err){notify("Erro: "+(err?.message||String(err)));}
function navigate(page){
  if(!pages[page])return;
  document.querySelectorAll(".page").forEach(node=>node.classList.toggle("active",node.id===page));
  document.querySelectorAll(".nav").forEach(node=>node.classList.toggle("active",node.dataset.page===page));
  $("crumb").textContent=pages[page][0];$("page-title").textContent=pages[page][1];$("subtitle").textContent=pages[page][2];
  if(page==="explorer")loadTrends().catch(errorText);
  if(page==="studio" || page==="planner")loadIdeas().catch(errorText);
  if(page==="sources")loadSources().catch(errorText);
}
function signalCard(t,detailed=false){
  const score=number(t.score);
  const factors=t.factors||{};
  const tags=(t.platforms||["Geral"]).map(p=>'<span class="tag">'+esc(p)+'</span>').join("");
  const factorText="Atualidade "+number(factors.atualidade)+"/40 · Fonte "+number(factors.fonte)+"/30 · Relevância "+number(factors.relevancia)+"/20 · Aplicabilidade "+number(factors.aplicabilidade)+"/10";
  return '<article class="signal">'
    +'<div class="signal-head"><h3>'+esc(t.title)+'</h3><span class="score '+(score<75?"mid":"")+'" title="Prioridade editorial, não viralidade">'+score+'/100</span></div>'
    +(detailed?'<p>'+esc(t.summary||"Sem resumo disponível.")+'</p>':"")
    +'<div class="signal-meta">'+tags+(t.demo?'<span class="tag demo">DEMO</span>':"")
    +'<span>'+esc(t.source)+'</span><span>·</span><span>'+(t.source_type==='Manual'?'Registado ':'Publicado ')+esc(date(t.published))+'</span></div>'
    +(detailed?'<div class="factors">'+esc(factorText)+'</div>':"")
    +'<div class="signal-actions"><div><button class="micro" data-generate="'+number(t.id)+'">✦ Criar conteúdo</button>'
    +'<button class="micro" data-save="'+number(t.id)+'">'+(t.saved?"★ Guardado":"☆ Guardar")+'</button></div>'
    +'<a class="mini-link" href="'+esc(t.url)+'" target="_blank" rel="noopener noreferrer">Fonte original ↗</a></div></article>';
}
async function loadDashboard(){
  const data=await api("/api/dashboard");
  $("stat-total").textContent=data.stats.total;
  $("stat-weekly").textContent=data.stats.weekly;
  $("stat-priority").textContent=data.stats.priority;
  $("stat-ideas").textContent=data.stats.ideas;
  $("sync-time").textContent=date(data.stats.last_sync);
  state.top=data.top||[];
  $("top-trends").innerHTML=state.top.length?state.top.map(t=>signalCard(t)).join(""):'<div class="empty">Ainda não há notícias. Experimenta Atualizar fontes.</div>';
  const selected=state.top.filter(t=>!t.demo).slice(0,5);
  const lines=selected.length?selected.map((t,i)=>(i+1)+". "+t.title+" ("+t.source+", "+date(t.published)+")\n"+t.url):
      ["Sem sinais reais. Os exemplos DEMO são apenas para experimentar o painel.", "Usa Atualizar fontes para tentar recolher artigos reais."];
  state.brief="RADAR SOCIAL AI — BRIEFING EDITORIAL\n"+new Date().toLocaleDateString("pt-PT")+"\n\n"+lines.join("\n\n")
      +"\n\nNota: prioridade editorial não equivale a viralidade. Validar cada fonte antes de publicar.";
  $("briefing").textContent=state.brief;
}

const PLATFORM_STYLE = {
 Instagram:["◎","instagram"],TikTok:["♪","tiktok"],LinkedIn:["in","linkedin"],
 YouTube:["▶","youtube"],Facebook:["f","facebook"],Threads:["@","threads"],Geral:["⌁","geral"]
};
function sourceDate(t){
 return (t.source_type==="Manual" ? "Registado " : "Publicado ")+date(t.published);
}
function primaryPlatform(t){
 const names=t.platforms||[];
 return names.find(p=>p!=="Geral"&&PLATFORM_STYLE[p])||"Geral";
}
function selectedTrend(){
 return state.trends.find(t=>t.id===state.selectedTrendId)||null;
}
function trendListCard(t){
 const platform=primaryPlatform(t), [icon,cls]=PLATFORM_STYLE[platform];
 const selected=t.id===state.selectedTrendId;
 return '<article class="signal'+(selected?' selected':'')+'">'
  +'<div class="trend-topline"><button class="trend-entry" data-select="'+number(t.id)+'" aria-pressed="'+selected+'" aria-label="Detalhes: '+esc(t.title)+'">'
  +'<span class="trend-avatar '+cls+'" aria-hidden="true">'+icon+'</span>'
  +'<span class="trend-copy"><span class="trend-title">'+esc(t.title)+'</span>'
  +'<span class="trend-excerpt">'+esc(t.summary||"Consulta a fonte original para conhecer os detalhes.")+'</span></span></button>'
  +'<div class="trend-score-tools"><span class="score '+(number(t.score)<75?"mid":"")+'">'+number(t.score)+'/100</span>'
  +'<button class="trend-star '+(t.saved?"is-saved":"")+'" data-save="'+number(t.id)+'" aria-label="'+(t.saved?"Remover dos guardados":"Guardar tendência")+'" title="'+(t.saved?"Remover dos guardados":"Guardar tendência")+'">'+(t.saved?"★":"☆")+'</button></div></div>'
  +'<div class="trend-foot"><span>'+esc(t.source)+'</span><span>·</span><span>'+esc(date(t.published))+'</span>'
  +(t.demo?'<span class="demo-flag">DEMO</span>':'')
  +'<span class="tag">'+esc(platform)+'</span></div></article>';
}
function scoreBreakdown(t){
 const factors=t.factors||{};
 const items=[["Atualidade","atualidade",40],["Fonte","fonte",30],["Relevância","relevancia",20],["Aplicabilidade","aplicabilidade",10]];
 return '<div class="score-factor-grid"><h3>Fatores da pontuação</h3>'+items.map(([label,key,max])=>{
  const value=Math.max(0,Math.min(max,number(factors[key])));
  return '<div class="score-factor"><label>'+label+'</label>'
    +'<progress value="'+value+'" max="'+max+'" aria-label="'+label+': '+value+' de '+max+'"></progress>'
    +'<b>'+value+'/'+max+'</b></div>';
 }).join('')+'</div>';
}
function insightHypotheses(t){
 const channel=primaryPlatform(t);
 const name=channel==="Geral"?"redes sociais":channel;
 return [
  'Esta notícia pode alterar as decisões de formato, distribuição ou posicionamento de marcas que utilizam '+name+'.',
  'Vale a pena verificar a publicação original e confirmar se a novidade já está disponível em Portugal antes de criar conteúdo.',
  'Uma hipótese de teste: adaptar um conteúdo sobre o tema e acompanhar cliques, alcance e interações, comparando com a linha de base.'
 ];
}
function renderInspector(){
 const t=selectedTrend(), host=$("trend-inspector");
 if(!host)return;
 if(!t){
  host.innerHTML='<div class="empty">Sem sinais para estes filtros. Atualiza as fontes ou alarga o intervalo para começar.</div>';
  return;
 }
 const sc=Math.max(0,Math.min(100,number(t.score)));
 const radius=55,circ=2*Math.PI*radius,dash=circ*sc/100;
 const label=primaryPlatform(t);
 const suggestions=[
  ["LinkedIn","Post: 3 perguntas que esta novidade levanta para quem gere marketing."],
  ["Instagram","Carrossel: o que verificar antes de aplicar esta mudança à tua marca."],
  ["TikTok","Vídeo curto: uma hipótese de teste e o KPI para avaliar o resultado."]
 ];
 const metadata='<div class="inspector-metadata"><strong>'+esc(t.source)+'</strong>'
  +'<span class="tag">'+esc(t.source_type||"Não classificada")+'</span>'
  +'<span>'+esc(sourceDate(t))+'</span>'
  +(t.demo?'<span class="tag demo">DEMO</span>':'')
  +'<a href="'+esc(t.url)+'" target="_blank" rel="noopener noreferrer">Abrir fonte original ↗</a></div>';
 host.innerHTML='<h2 class="inspector-heading">'+esc(t.title)+'</h2>'+metadata
  +'<p class="inspector-summary">'+esc(t.summary||"Sem resumo fornecido. Consulta a fonte original antes de formar conclusões.")+'</p>'
  +'<div class="score-analysis">'
  +'<div class="score-gauge"><svg viewBox="0 0 140 140" role="img" aria-label="Prioridade editorial '+sc+' de 100">'
  +'<circle class="track" cx="70" cy="70" r="'+radius+'"></circle>'
  +'<circle class="fill" cx="70" cy="70" r="'+radius+'" stroke-dasharray="'+dash.toFixed(2)+' '+circ.toFixed(2)+'"></circle></svg>'
  +'<div class="score-center"><strong>'+sc+'<span>/100</span></strong><small>Prioridade<br>editorial</small></div></div>'
  +scoreBreakdown(t)+'</div>'
  +'<p class="analysis-caveat">Pontuação heurística calculada com dados do título, data e origem. Não representa popularidade, impacto comprovado nem verificação independente.</p>'
  +'<section class="inspector-section"><h3>◎ Porque pode importar</h3><p class="subtle">Hipóteses editoriais a validar — não conclusões sobre esta notícia.</p>'
  +'<ul class="hypotheses">'+insightHypotheses(t).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></section>'
  +'<section class="inspector-section"><h3>✧ Ações</h3><div class="inspector-actions">'
  +'<button class="btn primary" data-generate="'+number(t.id)+'">✦ Gerar conteúdo</button>'
  +'<button class="btn outline" data-save="'+number(t.id)+'">'+(t.saved?'★ Guardado':'☆ Guardar')+'</button>'
  +'<button class="btn outline" data-plan="'+number(t.id)+'">▦ Adicionar ao Planner</button>'
  +'<a class="btn outline" href="'+esc(t.url)+'" target="_blank" rel="noopener noreferrer">↗ Fonte original</a>'
  +'</div></section>'
  +'<div class="suggestion-box"><h3>✧ Sugestões de conteúdo</h3>'
  +'<p class="subtle">Modelos editoriais, não conteúdos já validados. Seleciona um canal para criar o rascunho.</p>'
  +suggestions.map(([platform,text])=>'<button class="suggestion-btn" data-generate="'+number(t.id)+'" data-platform="'+esc(platform)+'"><b>'+esc(platform)+'</b><span>'+esc(text)+'</span> →</button>').join('')
  +'</div><div class="disclaimer-bar">ⓘ Prioridade editorial ≠ viralidade · Verifica a fonte original antes de publicar.</div>';
}
function renderTrends(){
 const host=$("trend-list");
 if(!host)return;
 if(state.selectedTrendId===null || !state.trends.some(t=>t.id===state.selectedTrendId)){
   state.selectedTrendId=state.trends.length ? state.trends[0].id : null;
 }
 $("result-count").textContent=state.trends.length+" sinais encontrados · ordenados por prioridade editorial";
 host.innerHTML=state.trends.length?state.trends.map(trendListCard).join("")
   :'<div class="empty">Sem resultados para estes filtros. Experimenta alargar o intervalo.</div>';
 renderInspector();
}
function selectTrend(id){
 if(!state.trends.some(t=>t.id===id))return;
 state.selectedTrendId=id;renderTrends();
 if(window.matchMedia("(max-width:900px)").matches){
   $("trend-inspector").scrollIntoView({behavior:"smooth",block:"start"});
 }
}
async function loadTrends(){
 const query=new URLSearchParams({
   q:$("search").value,platform:$("platform-filter").value,days:$("date-filter").value,
   saved:$("saved-only").checked?"true":"false"
 });
 const data=await api("/api/trends?"+query.toString());
 state.trends=data.items||[];
 renderTrends();
}
async function loadIdeas(){
  const data=await api("/api/ideas");state.ideas=data.items||[];
  $("idea-list").innerHTML=state.ideas.length?state.ideas.map(i=>
    '<button class="idea-item '+(state.activeIdea===i.id?"active":"")+'" data-idea="'+number(i.id)+'">'
    +'<b>'+esc(i.hook)+'</b><small>'+esc(i.platform)+' · '+esc(i.origin)+' · '+esc(date(i.created))+'</small>'
    +'<span class="status">'+esc(i.status)+'</span></button>').join("")
    :'<div class="empty">Ainda não tens rascunhos. Escolhe uma tendência para começar.</div>';
  if(state.activeIdea && !state.ideas.some(i=>i.id===state.activeIdea)){state.activeIdea=null;}
  if(state.activeIdea)editIdea(state.activeIdea);
  renderPlanner();
}
function renderPlanner(){
  const element=$("planner-list");if(!element)return;
  const ordered=[...state.ideas].sort((a,b)=>(a.scheduled_for||"9999").localeCompare(b.scheduled_for||"9999"));
  element.innerHTML=ordered.length?ordered.map(i=>'<button class="idea-item" data-open-editor="'+number(i.id)+'"><b>'
    +esc(i.hook)+'</b><small>'+esc(i.scheduled_for?date(i.scheduled_for+"T12:00:00"):"Sem data marcada")
    +' · '+esc(i.platform)+' · '+esc(i.status)+'</small></button>').join("")
    :'<div class="empty">Não há conteúdos. Gera um rascunho e atribui-lhe uma data.</div>';
}
function editIdea(id){
  const i=state.ideas.find(x=>x.id===Number(id));
  if(!i)return;
  state.activeIdea=i.id;
  $("edit-id").value=i.id;
  $("edit-hook").value=i.hook;
  $("edit-body").value=i.body;
  $("edit-cta").value=i.cta;
  $("edit-status").value=i.status;
  $("edit-scheduled").value=i.scheduled_for||"";
  $("editor-hint").textContent="Fonte: "+i.trend_title+" · "+i.format+" · KPI: "+i.kpi;
  document.querySelectorAll(".idea-item").forEach(n=>n.classList.toggle("active",Number(n.dataset.idea)===i.id));
}
async function loadSources(){
  const data=await api("/api/sources");state.sources=data.items||[];
  $("source-list").innerHTML=state.sources.map(s=>
    '<div class="source"><div><strong>'+esc(s.name)+'</strong><small>'+esc(s.type)
    +' · <a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">Consultar feed ↗</a></small></div>'
    +'<div><span class="status">'+esc(s.result)+'</span><small>'+esc(date(s.checked))+'</small></div></div>').join("");
}
async function refreshAll(){
  await Promise.all([loadDashboard(),loadTrends(),loadIdeas(),loadSources()]);
}
function openGenerate(id, preferredPlatform){
  const trend=state.trends.concat(state.top).find(t=>t.id===Number(id));
  if(!trend)return notify("Não foi possível encontrar a tendência.");
  $("generate-id").value=trend.id;$("generate-title").textContent=trend.title;
  if(preferredPlatform){ $("generate-form").elements.platform.value=preferredPlatform; }
  $("generate-modal").showModal();
}
async function copyText(value){
  if(!value)return notify("Não há texto para copiar.");
  try{await navigator.clipboard.writeText(value);notify("Copiado para a área de transferência.");}
  catch(err){notify("Cópia não permitida no navegador. Seleciona o texto manualmente.");}
}
function installEvents(){
  document.addEventListener("click",async event=>{
    const page=event.target.closest("[data-page]");
    if(page){navigate(page.dataset.page);return;}
    const generate=event.target.closest("[data-generate]");
    if(generate){openGenerate(generate.dataset.generate,generate.dataset.platform);return;}
    const plan=event.target.closest("[data-plan]");
    if(plan){
      const t=state.trends.find(v=>v.id===Number(plan.dataset.plan));
      if(!t)return;
      $("plan-trend-id").value=t.id;
      $("plan-trend-title").textContent=t.title;
      $("plan-platform").value=primaryPlatform(t)==="Geral"?"LinkedIn":primaryPlatform(t);
      $("plan-date").value="";
      $("plan-modal").showModal();
      return;
    }
    const select=event.target.closest("[data-select]");
    if(select){selectTrend(Number(select.dataset.select));return;}
    const saved=event.target.closest("[data-save]");
    if(saved){
      saved.disabled=true;
      try{await api("/api/trends/"+saved.dataset.save+"/save","POST");await Promise.all([loadTrends(),loadDashboard()]);}
      catch(err){errorText(err);}finally{saved.disabled=false;}return;
    }
    const openEditor=event.target.closest("[data-open-editor]");
    if(openEditor){navigate("studio");editIdea(Number(openEditor.dataset.openEditor));return;}
    const idea=event.target.closest("[data-idea]");
    if(idea){editIdea(Number(idea.dataset.idea));return;}
  });
  $("refresh").addEventListener("click",async()=>{
    const button=$("refresh");button.disabled=true;button.textContent="A recolher fontes...";
    try{
      const result=await api("/api/refresh","POST");
      await refreshAll();
      const failed=(result.sources||[]).filter(s=>s.error).length;
      notify(result.added+" notícias novas. Fontes com erro: "+failed+".");
    }catch(err){errorText(err);}finally{button.disabled=false;button.textContent="↻ Atualizar fontes";}
  });
  let timer;
  $("search").addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>loadTrends().catch(errorText),240);});
  ["platform-filter","date-filter","saved-only"].forEach(id=>
    $(id).addEventListener("change",()=>loadTrends().catch(errorText)));
  $("manual-button").addEventListener("click",()=>$("manual-modal").showModal());
  $("close-manual").addEventListener("click",()=>$("manual-modal").close());
  $("close-generate").addEventListener("click",()=>$("generate-modal").close());
  $("close-plan").addEventListener("click",()=>$("plan-modal").close());
  $("plan-form").addEventListener("submit",async ev=>{
    ev.preventDefault();
    const form=ev.currentTarget,button=form.querySelector('[type="submit"]');
    button.disabled=true;
    try{
      const created=await api("/api/ideas","POST",{
        trend_id:Number($("plan-trend-id").value),
        platform:$("plan-platform").value,use_ai:false
      });
      try{
        await api("/api/ideas/"+created.id,"PATCH",{
          scheduled_for:$("plan-date").value,status:"Backlog"
        });
      }catch(error){
        $("plan-modal").close();
        notify("Rascunho criado, mas a data não ficou guardada: "+error.message);
        navigate("studio");
        return;
      }
      $("plan-modal").close();
      navigate("planner");
      await loadIdeas();
      await loadDashboard();
      notify("Conteúdo adicionado ao Planner para "+date($("plan-date").value+"T12:00:00")+".");
    }catch(err){errorText(err);}
    finally{button.disabled=false;}
  });
  $("manual-form").addEventListener("submit",async ev=>{
    ev.preventDefault();
    const form=ev.currentTarget, data=Object.fromEntries(new FormData(form));
    try{
      await api("/api/trends/manual","POST",data);
      form.reset();$("manual-modal").close();await refreshAll();notify("Oportunidade adicionada.");
    }catch(err){errorText(err);}
  });
  $("generate-form").addEventListener("submit",async ev=>{
    ev.preventDefault();
    const form=ev.currentTarget, values=Object.fromEntries(new FormData(form));
    const button=form.querySelector('[type="submit"]');button.disabled=true;
    try{
      const result=await api("/api/ideas","POST",{trend_id:Number(values.trend_id),
        platform:values.platform,use_ai:values.use_ai==="on"});
      $("generate-modal").close();navigate("studio");
      await loadIdeas();editIdea(result.id);await loadDashboard();notify("Rascunho criado no Content Studio.");
    }catch(err){errorText(err);}finally{button.disabled=false;}
  });
  $("editor-form").addEventListener("submit",async ev=>{
    ev.preventDefault();
    const id=Number($("edit-id").value);
    if(!id)return notify("Primeiro, seleciona um rascunho.");
    try{
      await api("/api/ideas/"+id,"PATCH",{hook:$("edit-hook").value,body:$("edit-body").value,
        cta:$("edit-cta").value,status:$("edit-status").value,
        scheduled_for:$("edit-scheduled").value});
      await loadIdeas();notify("Rascunho guardado.");
    }catch(err){errorText(err);}
  });
  $("copy-brief").addEventListener("click",()=>copyText(state.brief));
  $("copy-idea").addEventListener("click",()=>copyText($("edit-hook").value+"\n\n"+$("edit-body").value+"\n\n"+$("edit-cta").value));
}
async function boot(){
  $("today").textContent=new Intl.DateTimeFormat("pt-PT",{day:"2-digit",month:"long",year:"numeric"}).format(new Date());
  installEvents();
  try{
    const c=await api("/api/config");state.ai=c.ai;$("use-ai").disabled=!c.ai;
    if(!c.ai)$("use-ai").parentElement.title="Define OPENAI_API_KEY no servidor para ativar IA.";
    await refreshAll();
  }catch(err){errorText(err);$("briefing").textContent="Não foi possível carregar o backend. Verifica o servidor e a autenticação.";}
}
boot();
