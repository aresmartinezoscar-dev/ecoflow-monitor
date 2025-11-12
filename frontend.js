// ======= Config & estado =======
const DB_PATH = "ecoflow_logs";
const MAX_POINTS = 2000;              // tope de puntos para no saturar navegador
const LIVE_INTERVAL_MS = 60_000;      // 1 min (la web solo lee Firebase)
let liveTimer = null;

const state = {
  startTs: Date.now() - 24*3600*1000, // por defecto últimas 24h
  endTs:   Date.now(),
  raw: [],     // registros crudos del rango
};

// ======= Utilidades =======
const $ = (id)=>document.getElementById(id);
const fmt = (n, d=0)=> (n===null||n===undefined||isNaN(n)) ? "—" : Number(n).toFixed(d);
const pad = (x)=> String(x).padStart(2,"0");
const toLocalISO = (ms)=>{
  const d=new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalISO = (s)=> s ? new Date(s).getTime() : null;

function stats(arr){
  const clean = arr.filter(v=>v!==null&&v!==undefined&&!isNaN(v));
  if(!clean.length) return {avg:null,min:null,max:null,last:null};
  const sum = clean.reduce((a,b)=>a+b,0);
  return {avg:sum/clean.length, min:Math.min(...clean), max:Math.max(...clean), last:clean.at(-1)};
}

function autoScale(data, {minPadding=0.05, maxPadding=0.1, hardMin=null, hardMax=null}={}){
  const clean = data.filter(v=>typeof v==='number' && !isNaN(v));
  if(!clean.length) return {min:0, max:1};
  let lo = Math.min(...clean), hi = Math.max(...clean);
  if (lo===hi){ lo -= 1; hi += 1; }
  const span = hi - lo;
  lo -= span*minPadding; hi += span*maxPadding;
  if(hardMin!=null) lo = Math.min(lo, hardMin);
  if(hardMax!=null) hi = Math.max(hi, hardMax);
  return {min:Math.floor(lo), max:Math.ceil(hi)};
}

// ======= Controles de rango =======
function applyQuick(range){
  const now = Date.now();
  const map = { "1h":1, "6h":6, "12h":12, "24h":24, "48h":48 };
  if(range==="7d"){ state.startTs = now - 7*24*3600*1000; state.endTs = now; }
  else { state.startTs = now - (map[range]||24)*3600*1000; state.endTs = now; }
  loadRange();
}

function applyCustom(){
  const s = fromLocalISO($("startDt").value);
  const e = fromLocalISO($("endDt").value);
  if(!s || !e || e<=s){ alert("Rango no válido"); return; }
  state.startTs = s; state.endTs = e;
  loadRange();
}

// ======= Firebase: lectura por rango =======
async function readRange(startTs, endTs){
  $("status").textContent = "Cargando…";
  const ref = db.ref(DB_PATH)
    .orderByChild("ts")
    .startAt(startTs)
    .endAt(endTs);

  const snap = await ref.get(); // una sola lectura
  const val = snap.val() || {};
  const rows = Object.values(val)
    .sort((a,b)=>a.ts-b.ts)
    .slice(-MAX_POINTS);

  $("status").textContent = `Rango: ${new Date(startTs).toLocaleString()} → ${new Date(endTs).toLocaleString()}`;
  return rows;
}

// ======= Charts =======
let socChart, powerChart;

function setupCharts(){
  const socCtx = $("socChart").getContext("2d");
  const powerCtx = $("powerChart").getContext("2d");

  const commonOpts = {
    responsive: true, animation: false, parsing:false, normalized:true,
    scales:{
      x:{type:"time", time:{unit:"hour"}, ticks:{autoSkip:true, maxTicksLimit:12}},
      y:{beginAtZero:false}
    },
    plugins:{
      legend:{display:true, labels:{usePointStyle:true}},
      tooltip:{mode:"index", intersect:false, callbacks:{
        label(ctx){ return `${ctx.dataset.label}: ${fmt(ctx.parsed.y, ctx.dataset._decimals||0)}`; }
      }}
    },
    hover:{mode:"index", intersect:false}
  };

  socChart = new Chart(socCtx, {
    type:"line",
    data:{datasets:[
      {label:"SOC Global", data:[], borderColor:"#37d67a", borderWidth:2, tension:.25, pointRadius:0, _decimals:0},
      {label:"SOC DELTA", data:[], borderColor:"#60a5fa", borderWidth:2, tension:.25, pointRadius:0, _decimals:0},
      {label:"SOC Extra", data:[], borderColor:"#f59e0b", borderWidth:2, tension:.25, pointRadius:0, _decimals:0},
    ]},
    options: JSON.parse(JSON.stringify(commonOpts))
  });

  powerChart = new Chart(powerCtx, {
    type:"line",
    data:{datasets:[
      {label:"Entrada total (W)", data:[], borderColor:"#22c55e", borderWidth:2, tension:.25, pointRadius:0, _decimals:0},
      {label:"Salida total (W)", data:[], borderColor:"#ef4444", borderWidth:2, tension:.25, pointRadius:0, _decimals:0},
    ]},
    options: JSON.parse(JSON.stringify(commonOpts))
  });
}

function updateCharts(rows){
  const toPts = (key)=> rows.map(r=>({x:r.ts, y: r[key]??null}));

  const socG = toPts("soc_global");
  const socD = toPts("soc_delta");
  const socE = toPts("soc_extra");
  const win  = toPts("watts_in");
  const wout = toPts("watts_out");

  socChart.data.datasets[0].data = socG;
  socChart.data.datasets[1].data = socD;
  socChart.data.datasets[2].data = socE;

  powerChart.data.datasets[0].data = win;
  powerChart.data.datasets[1].data = wout;

  // Auto-escala Y según datos
  const sg = socG.map(p=>p.y).filter(v=>v!=null);
  const sd = socD.map(p=>p.y).filter(v=>v!=null);
  const se = socE.map(p=>p.y).filter(v=>v!=null);
  const pw = [...win.map(p=>p.y), ...wout.map(p=>p.y)].filter(v=>v!=null);

  const socScale = autoScale([...sg,...sd,...se], {hardMin:0, hardMax:100});
  const powScale = autoScale(pw, {minPadding:.08, maxPadding:.12, hardMin:0});

  socChart.options.scales.y.suggestedMin = socScale.min;
  socChart.options.scales.y.suggestedMax = socScale.max;
  powerChart.options.scales.y.suggestedMin = powScale.min;
  powerChart.options.scales.y.suggestedMax = powScale.max;

  socChart.update(); powerChart.update();
}

// ======= KPIs + tabla =======
function updateKPIs(rows){
  const g = rows.map(r=>r.soc_global);
  const d = rows.map(r=>r.soc_delta);
  const e = rows.map(r=>r.soc_extra);
  const wi= rows.map(r=>r.watts_in);
  const wo= rows.map(r=>r.watts_out);

  const Sg=stats(g), Sd=stats(d), Se=stats(e);

  $("socGlobalVal").textContent = fmt(Sg.last,0);
  $("socGlobalAvg").textContent = fmt(Sg.avg,1);
  $("socGlobalMin").textContent = fmt(Sg.min,0);
  $("socGlobalMax").textContent = fmt(Sg.max,0);

  $("socDeltaVal").textContent = fmt(Sd.last,0);
  $("socDeltaAvg").textContent = fmt(Sd.avg,1);
  $("socDeltaMin").textContent = fmt(Sd.min,0);
  $("socDeltaMax").textContent = fmt(Sd.max,0);

  $("socExtraVal").textContent = fmt(Se.last,0);
  $("socExtraAvg").textContent = fmt(Se.avg,1);
  $("socExtraMin").textContent = fmt(Se.min,0);
  $("socExtraMax").textContent = fmt(Se.max,0);

  $("count").textContent = rows.length;
  $("lastTs").textContent = rows.length ? new Date(rows.at(-1).ts).toLocaleString() : "—";

  // tabla
  const tb = $("dataTable").querySelector("tbody");
  tb.innerHTML = "";
  rows.slice(-500).forEach(r=>{
    const tr=document.createElement("tr");
    const cells=[
      new Date(r.ts).toLocaleString(),
      fmt(r.soc_global,0), fmt(r.soc_delta,0), fmt(r.soc_extra,0),
      fmt(r.watts_in,0), fmt(r.watts_out,0)
    ];
    cells.forEach(v=>{
      const td=document.createElement("td"); td.textContent=v; tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
}

// ======= Export CSV =======
function exportCSV(){
  const rows = state.raw;
  if(!rows.length){ alert("Sin datos para exportar"); return; }
  const headers = ["ts","iso","soc_global","soc_delta","soc_extra","watts_in","watts_out"];
  const lines = [headers.join(",")];
  rows.forEach(r=>{
    lines.push([r.ts,new Date(r.ts).toISOString(),r.soc_global,r.soc_delta,r.soc_extra,r.watts_in,r.watts_out].join(","));
  });
  const blob = new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "ecoflow_export.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ======= Carga principal =======
async function loadRange(){
  $("startDt").value = toLocalISO(state.startTs);
  $("endDt").value   = toLocalISO(state.endTs);
  const rows = await readRange(state.startTs, state.endTs);
  state.raw = rows;
  updateKPIs(rows);
  updateCharts(rows);
}

// ======= Live toggle =======
function setLive(enabled){
  if(liveTimer){ clearInterval(liveTimer); liveTimer=null; }
  if(enabled){
    liveTimer = setInterval(()=>{
      // “Últimas X horas/días”: mover ventana al presente
      const dur = state.endTs - state.startTs;
      state.endTs = Date.now(); state.startTs = state.endTs - dur;
      loadRange();
    }, LIVE_INTERVAL_MS);
  }
}

// ======= Tema =======
$("themeBtn").addEventListener("click", ()=>{
  document.body.classList.toggle("theme-dark");
});

// ======= Eventos UI =======
document.querySelectorAll(".chip").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".chip").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    applyQuick(btn.dataset.range);
  });
});

$("applyBtn").addEventListener("click", applyCustom);
$("exportBtn").addEventListener("click", exportCSV);
$("liveToggle").addEventListener("change", e=> setLive(e.target.checked));

// ======= Init =======
window.addEventListener("load", ()=>{
  setupCharts();
  // por defecto últimas 24h
  $("startDt").value = toLocalISO(state.startTs);
  $("endDt").value   = toLocalISO(state.endTs);
  loadRange();
});
