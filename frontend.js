// ======= Config & estado =======
const DB_PATH = "ecoflow_logs";
const MAX_POINTS = 2000;
const LIVE_INTERVAL_MS = 60_000;

const TABLE_PAGE_SIZE_DEFAULT = 25;
const TABLE_PAGE_SIZE_MAX = 50;

let liveTimer = null;

const state = {
  startTs: Date.now() - 24*3600*1000,
  endTs:   Date.now(),
  raw: [],            // datos limpios (duplicados congelados a null)
  focusDataset: null, // índice de serie en foco o null
  tablePageSize: TABLE_PAGE_SIZE_DEFAULT,
  tablePage: 0,
  tableFiltered: []   // subconjunto tras filtro de día y limpieza
};

// ======= Utils =======
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

function hardMinMax(values, {floor0=false}={}){
  const clean = values.filter(v=>typeof v==='number' && !isNaN(v));
  if(!clean.length) return {min:0, max:1};
  let lo = Math.min(...clean), hi = Math.max(...clean);
  if (lo===hi){ lo -= 1; hi += 1; }
  if (floor0) lo = Math.min(0, lo);
  return {min:lo, max:hi};
}

// Plugin: solo ticks min y max en Y
const minMaxTicksPlugin = {
  id: 'minMaxTicks',
  afterBuildTicks(scale) {
    if (scale.axis !== 'y') return;
    const ticks = scale.ticks;
    if (ticks && ticks.length >= 2) {
      scale.ticks = [ticks[0], ticks[ticks.length-1]];
    }
  }
};
Chart.register(minMaxTicksPlugin);

// ======= Rango principal (gráficas/KPIs) =======
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

// ======= Limpieza: duplicados consecutivos (internet caído) =======
function markDuplicateSamplesAsNull(rows){
  if(!rows.length) return [];
  const keys = ["soc_global","soc_delta","soc_extra","watts_in","watts_out"];
  let lastValues = null;

  return rows.map(row=>{
    const cur = keys.map(k=>row[k]);
    if(lastValues && keys.every((k,idx)=>cur[idx]===lastValues[idx])){
      const copy = {...row};
      keys.forEach(k=>{ copy[k] = null; });
      return copy;
    }else{
      lastValues = cur;
      return row;
    }
  });
}

// ======= Firebase =======
async function readRange(startTs, endTs){
  $("status").textContent = "Cargando…";
  const ref = db.ref(DB_PATH).orderByChild("ts").startAt(startTs).endAt(endTs);
  const snap = await ref.get();
  const val = snap.val() || {};
  const rows = Object.values(val).sort((a,b)=>a.ts-b.ts).slice(-MAX_POINTS);
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
      legend:{
        display:true,
        labels:{usePointStyle:true},
        onClick(e, legendItem){
          const index = legendItem.datasetIndex;
          if(state.focusDataset === index){ state.focusDataset = null; }
          else { state.focusDataset = index; }
          applyFocusStyles();
        }
      },
      tooltip:{mode:"index", intersect:false, callbacks:{
        label(ctx){ return `${ctx.dataset.label}: ${fmt(ctx.parsed.y, ctx.dataset._decimals||0)}`; }
      }}
    },
    hover:{mode:"index", intersect:false}
  };

  socChart = new Chart(socCtx, {
    type:"line",
    data:{datasets:[
      {label:"SOC Global", data:[], borderColor:"#16a34a", borderWidth:2, tension:.25, pointRadius:0, _baseWidth:2, _decimals:0},
      {label:"SOC DELTA", data:[],  borderColor:"#2563eb", borderWidth:2, tension:.25, pointRadius:0, _baseWidth:2, _decimals:0},
      {label:"SOC Extra", data:[],   borderColor:"#d97706", borderWidth:2, tension:.25, pointRadius:0, _baseWidth:2, _decimals:0},
    ]},
    options: JSON.parse(JSON.stringify(commonOpts))
  });

  powerChart = new Chart(powerCtx, {
    type:"line",
    data:{datasets:[
      {label:"Entrada total (W)", data:[], borderColor:"#22c55e", borderWidth:2, tension:.25, pointRadius:0, _baseWidth:2, _decimals:0},
      {label:"Salida total (W)",  data:[], borderColor:"#ef4444", borderWidth:2, tension:.25, pointRadius:0, _baseWidth:2, _decimals:0},
    ]},
    options: JSON.parse(JSON.stringify(commonOpts))
  });
}

function setAlpha(hex, alpha){
  if(/^#([0-9a-f]{6})$/i.test(hex)){
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return hex;
}

function applyFocusStyles(){
  [socChart, powerChart].forEach(chart=>{
    chart.data.datasets.forEach((ds, idx)=>{
      const focused = (state.focusDataset === null) || (state.focusDataset === idx);
      ds.borderWidth = focused ? (ds._baseWidth*2) : ds._baseWidth;
      ds.borderColor = setAlpha(ds.borderColor, focused ? 1 : 0.25);
    });
    chart.update();
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

  const sg = socG.map(p=>p.y).filter(v=>v!=null);
  const sd = socD.map(p=>p.y).filter(v=>v!=null);
  const se = socE.map(p=>p.y).filter(v=>v!=null);
  const pw = [...win.map(p=>p.y), ...wout.map(p=>p.y)].filter(v=>v!=null);

  const socMinMax = hardMinMax([...sg,...sd,...se]);
  const powMinMax = hardMinMax(pw, {floor0:true});

  socChart.options.scales.y.min = Math.floor(socMinMax.min);
  socChart.options.scales.y.max = Math.ceil(socMinMax.max);

  powerChart.options.scales.y.min = Math.floor(powMinMax.min);
  powerChart.options.scales.y.max = Math.ceil(powMinMax.max);

  socChart.update(); powerChart.update();
  applyFocusStyles();
}

// ======= KPIs =======
function updateKPIs(rows){
  const g = rows.map(r=>r.soc_global);
  const d = rows.map(r=>r.soc_delta);
  const e = rows.map(r=>r.soc_extra);

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
}

// ======= Tabla + filtro de día + paginación =======
function recomputeTableFiltered(){
  const rows = state.raw;
  if(!rows.length){
    state.tableFiltered = [];
    return;
  }

  const dateStr = $("tableDate").value;
  let subset = rows;

  if(dateStr){
    const start = new Date(dateStr + "T00:00").getTime();
    const end   = start + 24*3600*1000;
    subset = rows.filter(r=> r.ts>=start && r.ts<end);
  }

  // quitar filas totalmente nulas (duplicados)
  subset = subset.filter(r=> !(
    r.soc_global==null && r.soc_delta==null && r.soc_extra==null &&
    r.watts_in==null && r.watts_out==null
  ));

  state.tableFiltered = subset;
}

function updateTable(){
  recomputeTableFiltered();
  const subset = state.tableFiltered;
  const tb = $("dataTable").querySelector("tbody");
  tb.innerHTML = "";

  const total = subset.length;
  $("count").textContent = total;

  if(!total){
    $("lastTs").textContent = "—";
    $("pageInfo").textContent = "0 de 0";
    $("prevPageBtn").disabled = true;
    $("nextPageBtn").disabled = true;
    return;
  }

  const size = state.tablePageSize;
  const pages = Math.max(1, Math.ceil(total / size));

  if(state.tablePage >= pages) state.tablePage = pages-1;
  if(state.tablePage < 0) state.tablePage = 0;

  const startIndex = state.tablePage * size;
  const endIndex   = Math.min(startIndex + size, total);
  const visible = subset.slice(startIndex, endIndex);

  $("lastTs").textContent = new Date(visible.at(-1).ts).toLocaleString();
  $("pageInfo").textContent = `${startIndex+1}–${endIndex} de ${total}`;

  $("prevPageBtn").disabled = (state.tablePage === 0);
  $("nextPageBtn").disabled = (state.tablePage >= pages-1);

  visible.forEach(r=>{
    const tr=document.createElement("tr");
    const cells=[
      new Date(r.ts).toLocaleString(),
      fmt(r.soc_global,0), fmt(r.soc_delta,0), fmt(r.soc_extra,0),
      fmt(r.watts_in,0), fmt(r.watts_out,0)
    ];
    cells.forEach(v=>{
      const td=document.createElement("td");
      td.textContent=v;
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
}

// ======= Export XLSX (todo el rango limpio) =======
function exportXLSX(){
  const rows = state.raw;
  if(!rows.length){ alert("Sin datos para exportar"); return; }

  const sheetData = [
    ["ts","iso","soc_global","soc_delta","soc_extra","watts_in","watts_out"]
  ];
  rows.forEach(r=>{
    sheetData.push([
      r.ts,
      new Date(r.ts).toISOString(),
      r.soc_global, r.soc_delta, r.soc_extra,
      r.watts_in, r.watts_out
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, "ecoflow");
  XLSX.writeFile(wb, "ecoflow_export.xlsx");
}

// ======= Lectura y refresco =======
async function loadRange(){
  $("startDt").value = toLocalISO(state.startTs);
  $("endDt").value   = toLocalISO(state.endTs);

  let rows = await readRange(state.startTs, state.endTs);
  rows = markDuplicateSamplesAsNull(rows);
  state.raw = rows;
  state.tablePage = 0; // resetea paginación

  updateKPIs(rows);
  updateCharts(rows);
  updateTable();
}

function setLive(enabled){
  if(liveTimer){ clearInterval(liveTimer); liveTimer=null; }
  if(enabled){
    liveTimer = setInterval(()=>{
      const dur = state.endTs - state.startTs;
      state.endTs = Date.now(); state.startTs = state.endTs - dur;
      loadRange();
    }, LIVE_INTERVAL_MS);
  }
}

// ======= Tema =======
$("themeBtn").addEventListener("click", ()=>{
  document.body.classList.toggle("theme-light");
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
$("exportXlsxBtn").addEventListener("click", exportXLSX);
$("liveToggle").addEventListener("change", e=> setLive(e.target.checked));

// Filtros/paginación tabla
$("tableApplyBtn").addEventListener("click", ()=>{
  state.tablePage = 0;
  updateTable();
});
$("tableTodayBtn").addEventListener("click", ()=>{
  const today = new Date();
  const iso = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
  $("tableDate").value = iso;
  state.tablePage = 0;
  updateTable();
});
$("tableClearBtn").addEventListener("click", ()=>{
  $("tableDate").value = "";
  state.tablePage = 0;
  updateTable();
});

$("pageSizeInput").addEventListener("change", ()=>{
  let val = parseInt($("pageSizeInput").value,10);
  if(isNaN(val) || val <= 0) val = TABLE_PAGE_SIZE_DEFAULT;
  if(val > TABLE_PAGE_SIZE_MAX) val = TABLE_PAGE_SIZE_MAX;
  $("pageSizeInput").value = val;
  state.tablePageSize = val;
  state.tablePage = 0;
  updateTable();
});

$("prevPageBtn").addEventListener("click", ()=>{
  state.tablePage--;
  updateTable();
});
$("nextPageBtn").addEventListener("click", ()=>{
  state.tablePage++;
  updateTable();
});

// ======= Init =======
window.addEventListener("load", ()=>{
  $("startDt").value = toLocalISO(state.startTs);
  $("endDt").value   = toLocalISO(state.endTs);
  $("pageSizeInput").value = TABLE_PAGE_SIZE_DEFAULT;
  setupCharts();
  loadRange();
});
