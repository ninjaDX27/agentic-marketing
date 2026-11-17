"use strict";
const state = { trends: [], ideas: [], top: [], sources: [], activeIdea: null, ai: false, brief: "" };
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
    +'<span>'+esc(t.source)+'</span><span>·</span><span>'+esc(date(t.published))+'</span></div>'
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
async function loadTrends(){
  const query=new URLSearchParams({
    q:$("search").value,platform:$("platform-filter").value,days:$("date-filter").value,
    saved:$("saved-only").checked?"true":"false"
  });
  const data=await api("/api/trends?"+query.toString());
  state.trends=data.items||[];
  $("result-count").textContent=state.trends.length+" sinais encontrados";
  $("trend-list").innerHTML=state.trends.length?state.trends.map(t=>signalCard(t,true)).join("")
    :'<div class="empty">Sem resultados para estes filtros. Experimenta alargar o intervalo.</div>';
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
function openGenerate(id){
  const trend=state.trends.concat(state.top).find(t=>t.id===Number(id));
  if(!trend)return notify("Não foi possível encontrar a tendência.");
  $("generate-id").value=trend.id;$("generate-title").textContent=trend.title;
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
    if(generate){openGenerate(generate.dataset.generate);return;}
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
