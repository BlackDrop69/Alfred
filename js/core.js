
const APP_VERSION="V10.09";
const APP_KEY = "ALFRED_v" + APP_VERSION;

/* =========================================================
   DataStore (IIFE) — Source Unique de Vérité
========================================================= */
(function(){
  "use strict";
  const _isArr = Array.isArray;
  const _isFinite = Number.isFinite;

  const _median = (nums)=>{
    const a=(nums||[]).filter(_isFinite);
    const n=a.length;
    if(!n) return NaN;
    a.sort((x,y)=>x-y);
    const mid=n>>1;
    return (n%2)?a[mid]:(a[mid-1]+a[mid])/2;
  };

  const _monthKey = (iso)=> (typeof iso==="string" && iso.length>=7) ? iso.slice(0,7) : "";
  const _monthIndex = (ym)=>{
    if(!ym || ym.length<7) return NaN;
    const y=parseInt(ym.slice(0,4),10);
    const m=parseInt(ym.slice(5,7),10);
    if(!Number.isFinite(y)||!Number.isFinite(m)) return NaN;
    return (y*12)+(m-1);
  };

  const _toB64 = (str)=>{
    const bytes = new TextEncoder().encode(String(str||""));
    let bin=""; for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]);
    return btoa(bin);
  };
  const _fromB64 = (b64)=>{
    const bin = atob(String(b64||"").trim());
    const bytes = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  };
  const _jsonParse = (s)=>{ try{return JSON.parse(s);}catch(_e){return null;} };

  const _dispatch = (name, detail)=>{
    try{ window.dispatchEvent(new CustomEvent(name,{detail})); }
    catch(e){
      try{ const evt=document.createEvent("CustomEvent"); evt.initCustomEvent(name,true,true,detail); window.dispatchEvent(evt); }catch(_e){}
    }
  };

  const _buildTxByClient = (tx)=>{
    const map=new Map();
    for(const t of (tx||[])){
      if(!t) continue;
      const id = String(t.clientCanon||t.clientNorm||t.rawClient||"").trim();
      if(!id) continue;
      if(!map.has(id)) map.set(id,[]);
      map.get(id).push(t);
    }
    for(const arr of map.values()){
      arr.sort((a,b)=>String(a.dateISO||"").localeCompare(String(b.dateISO||"")));
    }
    return map;
  };

  const _computeClientStats = (txByClient)=>{
    const out=new Map();
    for(const [id,arr] of txByClient.entries()){
      const amounts=[];
      const cntByMonth=new Map();
      for(const t of arr){
        const v=+t.amountHT;
        if(_isFinite(v)) amounts.push(v);
        const mk=_monthKey(String(t.dateISO||""));
        const mi=_monthIndex(mk);
        if(_isFinite(mi)) cntByMonth.set(mi,(cntByMonth.get(mi)||0)+1);
      }
      const medianBasket=_median(amounts);

      let max1M=0;
      for(const c of cntByMonth.values()) if(c>max1M) max1M=c;

      let max3M=0;
      if(cntByMonth.size){
        const keys=Array.from(cntByMonth.keys()).sort((a,b)=>a-b);
        let min=keys[0], max=keys[keys.length-1];
        const W=3;
        let wSum=0;
        for(let k=min;k<min+W;k++) wSum+=(cntByMonth.get(k)||0);
        max3M=Math.max(max3M,wSum);
        for(let start=min+1; start<=max; start++){
          wSum-=(cntByMonth.get(start-1)||0);
          wSum+=(cntByMonth.get(start+W-1)||0);
          if(wSum>max3M) max3M=wSum;
        }
      }

      out.set(id,{clientId:id, nTx:arr.length, medianBasket, maxOrders1M:max1M, maxOrders3M:max3M});
    }
    return out;
  };

  const _store = { dataset:null, txByClient:new Map(), clientStats:new Map(), objectifs:null, globalStats:null };

  const DataStore = {
    setDatasetFromLegacyState(state){
      if(!state) return;
      const tx=_isArr(state.tx)?state.tx:[];
      const clients=_isArr(state.clients)?state.clients:[];
      _store.dataset = { tx, clients, updatedAt: Date.now() };
      _store.txByClient = _buildTxByClient(tx);
      _store.clientStats = _computeClientStats(_store.txByClient);
      try{
        const all=[]; for(const st of _store.clientStats.values()){ if(_isFinite(st.medianBasket)) all.push(st.medianBasket); }
        _store.globalStats = { portfolioMedianBasket: _median(all), nClients:_store.clientStats.size, nTx:tx.length };
      }catch(_e){ _store.globalStats = { nClients:_store.clientStats.size, nTx:tx.length }; }
      _dispatch("datasetReady", DataStore.snapshot());
    },
    clearDataset(){
      _store.dataset=null; _store.txByClient=new Map(); _store.clientStats=new Map(); _store.globalStats=null;
      _dispatch("datasetReady", DataStore.snapshot());
    },
    hasDataset(){ return !!(_store.dataset && _store.dataset.tx && _store.dataset.tx.length); },
    getTx(){ return (_store.dataset && _store.dataset.tx)?_store.dataset.tx:[]; },
    getClients(){ return (_store.dataset && _store.dataset.clients)?_store.dataset.clients:[]; },
    getClientStats(id){ return _store.clientStats.get(String(id||"").trim()) || null; },

    getClientTx(id){ return _store.txByClient.get(String(id||"").trim()) || []; },
    getRFMStats(){ try{ return (window.state && window.state.stats instanceof Map) ? window.state.stats : new Map(); }catch(e){ return new Map(); } },

    setObjectifs(obj){ _store.objectifs=obj||null; _dispatch("objectifsReady", DataStore.snapshot()); },
    hasObjectifs(){ return !!_store.objectifs; },
    getObjectifs(){ return _store.objectifs; },

    importObjectifsFromText(text){
      const raw=String(text||"").trim();
      if(!raw) return {ok:false,error:"empty"};
      let obj=_jsonParse(raw);
      if(obj){ DataStore.setObjectifs(obj); return {ok:true,mode:"json"}; }
      try{
        const decoded=_fromB64(raw);
        obj=_jsonParse(decoded);
        if(obj){ DataStore.setObjectifs(obj); return {ok:true,mode:"base64"}; }
      }catch(_e){}
      return {ok:false,error:"invalid_format"};
    },
    exportObjectifsToBase64(obj){ return _toB64(JSON.stringify(obj||{})); },

    snapshot(){
      return {
        dataset: _store.dataset ? { nTx: (_store.dataset.tx||[]).length, nClients: (_store.dataset.clients||[]).length } : null,
        globalStats: _store.globalStats,
        objectifs: _store.objectifs ? { ok:true } : null
      };
    }
  };

  window.DataStore = DataStore;
})();



/** =========================
 * CONFIG / constantes
 * ========================= */

// --- TF×TD status matrix (same labels as cockpit) ---
const TFTD_STATUS_MATRIX = [
  ["OK","Alerte","Alerte forte"],
  ["Érosion","Risque","Risque élevé"],
  ["Risque volume","Critique","Critique +"]
];

// =====================================================
// POLICY: 100% local file, NO persistent storage
// - Never write to localStorage (persistent)
// - Purge legacy keys from older versions to avoid "ghost" data
// - Keep only in-memory settings for the current page lifetime
// =====================================================
// Persistent storage (LocalStorage) + fallback mémoire
// =====================================================
const __MEM = Object.create(null);
const __LS_PREFIX = "ALFRED_";
const LS = {
  get(k,d){
    try{
      if(window.localStorage){
        const raw = window.localStorage.getItem(__LS_PREFIX + k);
        if(raw==null) return d;
        return JSON.parse(raw);
      }
    }catch(e){}
    try{ return (k in __MEM) ? __MEM[k] : d; }catch(e){ return d; }
  },
  set(k,v){
    try{
      if(window.localStorage){
        window.localStorage.setItem(__LS_PREFIX + k, JSON.stringify(v));
        return;
      }
    }catch(e){}
    try{ __MEM[k]=v; }catch(e){}
  },
  del(k){
    try{
      if(window.localStorage){
        window.localStorage.removeItem(__LS_PREFIX + k);
        return;
      }
    }catch(e){}
    try{ delete __MEM[k]; }catch(e){}
  },
  clearAll(){
    try{
      if(window.localStorage){
        Object.keys(window.localStorage||{}).forEach(key=>{
          if(String(key).startsWith(__LS_PREFIX)) window.localStorage.removeItem(key);
        });
      }
    }catch(e){}
    try{ for(const k in __MEM) delete __MEM[k]; }catch(e){}
  }
};
;





// =====================================================
// Dataset Fingerprint (anti "fantômes" localStorage)
// - Empêche les alias/noMerge de polluer un nouveau CSV
// - Additif : aucun impact sur les moteurs de calcul
// =====================================================
function __dsFnv1a(str){
  let h = 0x811c9dc5;
  for(let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ("00000000" + (h>>>0).toString(16)).slice(-8);
}

function __dsComputeDatasetHash(){
  const q = state.quality || {};
  const tx = state.tx || [];
  const meta = `lines=${q.lines||0}|valid=${q.valid||0}|clients=${q.clients||0}|min=${q.minDate||""}|max=${q.maxDate||""}|tx=${tx.length}`;

  const maxS = 200;
  const step = Math.max(1, Math.floor(tx.length / maxS));
  let sample = "";
  for(let i=0;i<tx.length;i+=step){
    const t = tx[i];
    if(!t) continue;
    const name = (t.clientCanon || t.clientNorm || t.rawClient || "").slice(0,80);
    const d = t.dateISO || "";
    const c = isFinite(t.amountHT) ? Math.round(t.amountHT*100) : 0;
    sample += `|${name}#${d}#${c}`;
    if(sample.length > 12000) break;
  }
  return __dsFnv1a(meta + sample);
}

function __dsBanner(show, msg){
  const el = document.getElementById("datasetBanner");
  if(!el) return;
  if(show){
    const m = document.getElementById("datasetBannerMsg");
    if(m) m.textContent = msg || "Des paramètres (alias/refus) peuvent provenir d’un autre fichier.";
    el.style.display = "block";
  }else{
    el.style.display = "none";
  }
}

function __dsInitBannerOnce(){
  if(state.ui && state.ui.__dsBannerInit) return;
  state.ui = state.ui || {};
  state.ui.__dsBannerInit = true;

  const btnKeep = document.getElementById("datasetBtnKeep");
  const btnReset = document.getElementById("datasetBtnReset");
  const btnHide = document.getElementById("datasetBtnHide");

  if(btnKeep) btnKeep.addEventListener("click", ()=>{
    try{
      const h = state.meta && state.meta.datasetHash;
      if(h) LS.set("datasetHash", h);
    }catch(e){}
    __dsBanner(false);
  });

  if(btnReset) btnReset.addEventListener("click", ()=>{
    if(!confirm("Reset alias + refus mémorisés (noMerge) ?")) return;
    try{
      state.aliases = {};
      state.noMerge = {};
      LS.set("aliases", state.aliases);
      LS.set("noMerge", state.noMerge);
      try{ updateAliasTag(); }catch(e){}
      try{
        const h = state.meta && state.meta.datasetHash;
        if(h) LS.set("datasetHash", h);
      }catch(e){}
    }catch(e){}
    __dsBanner(false);
  });

  if(btnHide) btnHide.addEventListener("click", ()=>{
    __dsBanner(false);
  });
  if(v==="objectifs"){
    try{ if(typeof window.renderObjectifsModule==="function") window.renderObjectifsModule(); }catch(e){ console.error("[Objectifs] render error:", e); }
  }
}

function __dsCheckDatasetHash(){
  try{
    __dsInitBannerOnce();

    const h = __dsComputeDatasetHash();
    state.meta = state.meta || {};
    state.meta.datasetHash = h;

    const saved = LS.get("datasetHash", null);
    if(!saved){
      LS.set("datasetHash", h);
      __dsBanner(false);
      return;
    }
    if(saved !== h){
      __dsBanner(true, "Alias/refus détectés d’un autre dataset : risque de clients “fantômes” ou règles incohérentes.");
    }else{
      __dsBanner(false);
    }
  }catch(e){}
}


// =====================================================
// Session safety — évite tout mélange de datasets
// - purge les caches & agrégats calculés
// - si un nouveau CSV est importé avec des alias/refus/overrides d’un ancien dataset,
//   on purge automatiquement ces éléments puis on reconstruit le dataset pour éviter
//   les "clients fantômes" et les fusions involontaires.
// =====================================================
function __resetComputedState(){
  // Ne touche pas aux données brutes (rawRows/rawText) ni aux mappings.
  state.clients = [];
  state.periodTx = [];
  state.periodWindow = null;
  state.timebox = null;
  state.cache = null;
  state.potCache = Object.create(null);

  if(!state.ui) state.ui = {};
  state.ui.clientExtraFilter = null;
  state.ui.lastKpiApply = null;
  state.ui.dirCache = null;
  state.ui.dirCacheMeta = null;

  // Stats calculées (si présentes)
  [
    "statsAvgF","statsAvgM","statsAvgBasket",
    "statsStdF","statsStdM",
    "statsStdTF","statsStdTD",
    "statsMedianF","statsMedianM","statsMedianBasket"
  ].forEach(k=>{ if(k in state) state[k] = null; });
}

function __purgePersistedCrossDatasetSettings(){
  // Purge uniquement ce qui peut provoquer des fusions/effets fantômes entre CSV.
  state.aliases = {};
  state.noMerge = {};
  state.manualTv = {};
  state.meta = state.meta || {};
  state.meta.potManual = Object.create(null);

  LS.set("aliases", state.aliases);
  LS.set("noMerge", state.noMerge);
  LS.set("manualTv", state.manualTv);
  LS.set("meta", state.meta);

  try{ updateAliasTag(); }catch(e){}
}

function __rebuildTxFromRows(rows, ci, di, ai, coi, mi){
  const tx = [];
  for(const r of rows){
    const rawClient = (r[ci] ?? "").toString().trim();
    const rawCommercial = (isFinite(coi) ? (r[coi] ?? "") : "").toString().trim();
    const dateISO = parseFRDateToISO(r[di]);
    const amountHT = parseFRNumber(r[ai]);
    const marginPct = isFinite(mi) ? parseMarginPercent(r[mi]) : NaN;
    const {norm, canon} = resolveCanon(rawClient);
    const commercial = normalizeCommercialName(rawCommercial);
    tx.push({
      rawClient,
      clientNorm: norm,
      clientCanon: canon,
      dateISO,
      amountHT,
      rawCommercial,
      commercial,
      commercialNorm: normalizeName(rawCommercial),
      marginPct
    });
  }
  return tx;
}

function __dsAutoProtectFromCrossDatasetMix(rows, ci, di, ai, coi, mi){
  // Pré-requis: state.tx déjà défini + computeQuality() déjà appelé.
  try{
    const h = __dsComputeDatasetHash();
    state.meta = state.meta || {};
    state.meta.datasetHash = h;

    const saved = LS.get("datasetHash", null);
    if(!saved){
      LS.set("datasetHash", h);
      __dsBanner(false);
      return;
    }

    if(saved !== h){
      // Si des réglages persistés existent, ils peuvent provoquer des fusions involontaires.
      const hasAliases = state.aliases && Object.keys(state.aliases).length > 0;
      const hasNoMerge = state.noMerge && Object.keys(state.noMerge).length > 0;
      const hasManualTv = state.manualTv && Object.keys(state.manualTv).length > 0;
      const hasPotManual = state.meta && state.meta.potManual && Object.keys(state.meta.potManual).length > 0;

      if(hasAliases || hasNoMerge || hasManualTv || hasPotManual){
        __purgePersistedCrossDatasetSettings();

        // Reconstruire le dataset avec les mappings vierges (évite mélange de canons)
        state.txAll = __rebuildTxFromRows(rows, ci, di, ai, coi, mi);
        sanitizeCommercialFilterSelection();
        state.tx = state.txAll.filter(t=>txMatchesCommercialFilter(t));
        computeQuality();

        const h2 = __dsComputeDatasetHash();
        state.meta.datasetHash = h2;
        LS.set("datasetHash", h2);
        __dsBanner(false);
        return;
      }

      // Aucun réglage "à risque" -> on adopte ce nouveau dataset comme référence.
      LS.set("datasetHash", h);
      __dsBanner(false);
      return;
    }

    __dsBanner(false);
  }catch(e){
    // fail-safe: ne pas bloquer l'import
  }
}

const state = {
  ui:{hidePerdus:false, clientExtraFilter:null, lastKpiApply:null},
  meta: LS.get("meta", {potManual:Object.create(null)}),
  potCache: Object.create(null),
  rawText:"",
  rawRows:[], // including header row
  headers:[],
  mapped: {client:"", date:"", amount:"", commercial:"", margin:""},
  txAll:[], // normalized transactions before commercial filter
  tx:[], // normalized transactions {rawClient, clientNorm, clientCanon, dateISO, amountHT, commercial, marginPct}
  clients:[], // aggregated
  quality:{lines:0, parsed:0, valid:0, invalid:0, clients:0, minDate:null, maxDate:null, sum:0},
  aliases: LS.get("aliases", {}),   // norm -> canon
  noMerge: LS.get("noMerge", {}),   // pairKey -> true
  weakWords: LS.get("weakWords", ["menuiserie","sarl","sas","sa","eurl","ets","ste","sté","societe","société","groupe","compagnie","cie","holding","batiment","bâtiment"].join("\n")),
  params: LS.get("params", null),
  manualTv: LS.get("manualTv", {}), // clientName -> TV% override (commercial)
};

/* =====================================================
 * ALFRED — Source Unique de Vérité (helpers globaux)
 * Objectif : l'onglet ALFRED ne recalcule PAS le statut.
 * Il lit uniquement state.clients (segment officiel).
 * ===================================================== */
let __alfredSegCache = new Map();
let __alfredSegCacheLen = -1;

// Utilitaire global (utilisé par plusieurs modules)
function segIsNew(seg){
  const s = String(seg||"").toLowerCase().trim();
  return (s.includes("nouveau") || s.includes("réactiv") || s.includes("reactiv"));
}

// Lecture segment officiel (avec invalidation simple du cache)
function __alfredGetOfficialSeg(nm){
  const key = String(nm||"").trim();
  const curLen = (state && state.clients) ? (state.clients.length||0) : 0;
  if(curLen !== __alfredSegCacheLen){
    __alfredSegCache.clear();
    __alfredSegCacheLen = curLen;
  }
  if(__alfredSegCache.has(key)) return __alfredSegCache.get(key);
  let seg = "";
  try{
    const low = key.toLowerCase();
    const c = (state && state.clients ? (state.clients||[]).find(x=>x && x.name && (
      x.name === key || x.name.trim() === key ||
      x.name.toLowerCase() === low || x.name.trim().toLowerCase() === low
    )) : null);
    seg = (c && c.segment) ? c.segment : "";
  }catch(e){ seg = ""; }
  __alfredSegCache.set(key, seg);
  return seg;
}

function defaultParams(){
  const d = new Date().toISOString().slice(0,10);
  return {
    periodMonths: 36,
    asOfDate: null,
    freqMode: "annual",
    excludeTopN: 3,
    r5:30, r4:90, r3:180, r2:365,
    f1:1, f2:3, f3:6, f4:10,
    m1:500, m2:2000, m3:7000, m4:20000,

    vipRMin: 4, vipFMin: 4, vipMMin: 4,
    vipTfFragile: -0.20,
    tfWindow: 3,
    tfMode: "ratio",
    newR: 5, newF: 1,
    potRMin: 4, potMMin: 3, potFMax: 3,
  
  dormantFMax: 2,
    dormantDaysMin: 0,
    riskRMax: 2,
    riskFMin: 3,
    riskMMin: 3,
    riskMode: "OR",
  };
}

/** =========================
 * TV (Tendance Volume) — overrides commerciaux (Top clients)
 * - Objectif: permettre au commercial/dir d'imposer une tendance connue (ex: -40%) sans casser la logique auto.
 * - Règle: n'impacte QUE le moteur de prévision (computeDirectionKpis). La TV/TV badge et la matrice restent auto.
 * ========================= */
function _getManualTV(clientName){
  try{
    if(!clientName) return null;
    const m = state.manualTv || {};
    const v = m[clientName];
    if(v==null || v==="") return null;
    const n = +v;
    return (isFinite(n)) ? n : null;
  }catch(e){ return null; }
}
function _setManualTV(clientName, tvPct){
  try{
    if(!clientName) return;
    if(!state.manualTv) state.manualTv = {};
    if(tvPct==null || tvPct===""){
      delete state.manualTv[clientName];
    }else{
      const n = +tvPct;
      if(isFinite(n)) state.manualTv[clientName] = n;
      else delete state.manualTv[clientName];
    }
    LS.set("manualTv", state.manualTv);
  }catch(e){}
}
function _topClientsByShare(n=5){
  const arr = (state.clients||[]).filter(c=>c && c.name && c.segment!=="Perdus" && c.segment!=="Perdus Historiques");
  // caSharePeriod est déjà calculé sur la période analysée (part de CA). Fallback: annualAvgHT si dispo.
  arr.sort((a,b)=>((b.caSharePeriod||0)-(a.caSharePeriod||0)) || ((b.annualAvgHT||0)-(a.annualAvgHT||0)));
  return arr.slice(0, Math.max(0, n|0));
}
function openTVOverridesModal(){
  const ov = document.getElementById("tvOverridesModal");
  const tb = document.getElementById("tvOverridesBody");
  if(!ov || !tb) return;

  const top = _topClientsByShare(5);
  tb.innerHTML = top.map(c=>{
    const cur = _getManualTV(c.name);
    const auto = (c.tdPct!=null && isFinite(c.tdPct)) ? c.tdPct : null;
    const share = (c.caSharePeriod!=null && isFinite(c.caSharePeriod)) ? (c.caSharePeriod*100) : null;
    return `
      <tr>
        <td><span class="client-link" data-client="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span></td>
        <td><span class="chip ${chipClass(c.segment)}">${escapeHtml(c.segment)}</span></td>
        <td class="mono">${share==null ? "—" : share.toFixed(1)+"%"}</td>
        <td class="mono">${auto==null ? "NC" : (Math.round(auto))+"%"}</td>
        <td>
          <input class="tvOverrideInput" data-client="${escapeHtml(c.name)}" type="number" step="1" placeholder="ex: -40" value="${cur==null ? "" : cur}" style="width:92px;">
          <span class="small muted" style="margin-left:8px;">%</span>
        </td>
        <td class="small muted">${cur==null ? "Auto" : "Manuel"}</td>
      </tr>
    `;
  }).join("");

  // click client -> ouvre fiche client
  tb.onclick = (e)=>{
    const a = e.target.closest(".client-link");
    if(a){
      const name = a.dataset.client;
      if(name) showClientDetail(name);
    }
  };

  ov.classList.remove("hidden");
  ov.style.display = "flex";
  ov.style.pointerEvents = "auto";
}
function closeTVOverridesModal(){
  const ov = document.getElementById("tvOverridesModal");
  if(ov) ov.style.display = "none";
}
function saveTVOverridesModal(){
  const tb = document.getElementById("tvOverridesBody");
  if(!tb) return;
  const inputs = tb.querySelectorAll(".tvOverrideInput");
  inputs.forEach(inp=>{
    const name = inp.getAttribute("data-client");
    const v = inp.value;
    _setManualTV(name, (v==null || v==="") ? null : v);
  });
  closeTVOverridesModal();
  // refresh dashboard KPIs to reflect new forecast
  try{ recalcAll(); }catch(e){}
}

if(!state.params) state.params = defaultParams();

/** =========================
 * DOM helpers
 * ========================= */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));


/** =========================
 * Tri par clic sur colonnes (tous tableaux)
 * 1 clic = croissant • 2e clic = décroissant
 * ========================= */
function normalizeSortVal(v, type){
  if(v==null) return {v:null, isNull:true};
if(type==="num"){
    const n = Number(v);
    return {v: (Number.isFinite(n)? n : null), isNull: !Number.isFinite(n)};
}
  if(type==="date"){
    // attend ISO yyyy-mm-dd
    if(typeof v==="string" && /^\d{4}-\d{2}-\d{2}/.test(v)){
      const t = Date.parse(v+"T00:00:00Z");
return {v: (Number.isFinite(t)? t : null), isNull: !Number.isFinite(t)};
    }
    return {v:null, isNull:true};
}
  // string
  const s = (""+v).toLowerCase();
  return {v:s, isNull: s.trim()===""};
}

function applyHeaderIndicators(table, keys, sortState){
  if(!table) return;
const ths = table.querySelectorAll("thead th");
  ths.forEach((th,i)=>{
    const k = keys[i];
    if(!k) return;
    th.classList.add("th-sortable");
    th.setAttribute("data-sort-key", k);
    const base = th.getAttribute("data-base-label") || th.textContent.trim().replace(/\s*[▲▼]$/,"");
    th.setAttribute("data-base-label", base);
    if(sortState && sortState.key===k){
      th.textContent = base + (sortState.dir==="asc" ? " ▲" : " ▼");
    }else{
      th.textContent = base;
    }
  });
}

function setupSortableTable(tbodyId, sortKeyName, keys, types, rerender){
  const tbody = document.getElementById(tbodyId);
  if(!tbody) return;
  const table = tbody.closest("table");
  if(!table) return;

  // init sort state
  if(!state.ui) state.ui = {};
  if(!state.ui[sortKeyName]) state.ui[sortKeyName] = {key: keys[0], dir:"asc"};

  // mark headers (idempotent)
  applyHeaderIndicators(table, keys, state.ui[sortKeyName]);

  // event delegation: survives re-render of <thead> and avoids per-TH listeners
  const boundKey = "__sortBound_"+sortKeyName;
  if(table.dataset[boundKey] === "1") return;
  table.dataset[boundKey] = "1";

  table.addEventListener("click", (ev)=>{
    const t = ev.target;
    const el = (t && t.nodeType===3) ? t.parentElement : t;
    const th = (el && el.closest) ? el.closest("th") : null;
    if(!th || !table.contains(th)) return;

    const k = th.getAttribute("data-sort-key");
    if(!k) return;

    const cur = state.ui[sortKeyName] || {key: k, dir:"asc"};
    let dir = "asc";
    if(cur.key===k){
      dir = (cur.dir==="asc") ? "desc" : "asc";
    }
    state.ui[sortKeyName] = {key:k, dir};

    // refresh indicators on current header DOM
    applyHeaderIndicators(table, keys, state.ui[sortKeyName]);

    if(typeof rerender==="function") rerender();
  });
}

function sortRowsByState(rows, sortState, keys, types){
  if(!sortState || !sortState.key) return rows;
  const k = sortState.key;
  const idx = keys.indexOf(k);
const type = (idx>=0 ? (types[idx]||"str") : "str");
  const dirMul = (sortState.dir==="desc") ? -1 : 1;
return rows.sort((a,b)=>{
    const na = normalizeSortVal(a[k], type);
    const nb = normalizeSortVal(b[k], type);
    // NC/null toujours en bas
    if(na.isNull && nb.isNull) return 0;
    if(na.isNull) return 1;
    if(nb.isNull) return -1;

    if(type==="str"){
      return dirMul * (""+na.v).localeCompare(""+nb.v, "fr");
    }
    // num/date
    return dirMul * ((na.v||0) - (nb.v||0));
  });
}


/** =========================
 * Tri direct par clic sur colonnes (DOM)
 * - 1 clic: asc, 2e clic: desc
 * - Gère texte, nombres, €, %, dates (dd/mm/yyyy ou yyyy-mm-dd), et NC/null (toujours en bas)
 * ========================= */
function parseFRNumber(s){
  if(s==null) return NaN;
s = (""+s).replace(/ /g," ").trim();
  // retire symbole euro et espaces
  s = s.replace(/€|\s/g,"");
// remplace séparateur de milliers (.) ou espace, et virgule décimale
  // ex: 34 955,93 -> 34955.93
  s = s.replace(/\./g,"").replace(/,/g,".");
// retire tout sauf chiffres, . et -
  s = s.replace(/[^0-9.\-]/g,"");
  const n = parseFloat(s);
  return Number.isFinite(n) ?
n : NaN;
}
function parseCellValue(raw){
  if(raw==null) return {v:null, isNull:true, type:"null"};
  let s = (""+raw).replace(/ /g," ").trim();
if(!s || /^NC$/i.test(s)) return {v:null, isNull:true, type:"null"};
  // % 
  if(/%$/.test(s)){
    const n = parseFRNumber(s.replace(/%$/,""));
return {v:(Number.isFinite(n)? n : null), isNull: !Number.isFinite(n), type:"num"};
  }
  // €
  if(/[€]/.test(s)){
    const n = parseFRNumber(s);
return {v:(Number.isFinite(n)? n : null), isNull: !Number.isFinite(n), type:"num"};
  }
  // date dd/mm/yyyy
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){
    const [dd,mm,yy] = s.split("/").map(x=>parseInt(x,10));
const t = Date.UTC(yy, mm-1, dd);
    return {v:(Number.isFinite(t)? t : null), isNull: !Number.isFinite(t), type:"date"};
}
  // date yyyy-mm-dd (ou yyyy-mm-ddThh)
  if(/^\d{4}-\d{2}-\d{2}/.test(s)){
    const t = Date.parse(s.slice(0,10)+"T00:00:00Z");
return {v:(Number.isFinite(t)? t : null), isNull: !Number.isFinite(t), type:"date"};
  }
  // nombre simple
  if(/^[\-+]?\d+(?:[\s\u00A0]\d{3})*(?:[.,]\d+)?$/.test(s) || /^[\-+]?\d+(?:[.,]\d+)?$/.test(s)){
    const n = parseFRNumber(s);
return {v:(Number.isFinite(n)? n : null), isNull: !Number.isFinite(n), type:"num"};
  }
  // texte
  return {v:s.toLowerCase(), isNull:false, type:"str"};
}

/** =========================
 * Tri (clic colonnes) - TABLES DANS MODALES
 * - Ne touche pas aux grands tableaux déjà gérés par setupSortableTable()
 * - Active le tri asc/desc dans les tableaux insérés dynamiquement (modales/drills)
 * ========================= */
function setupModalTableSort(){
  const isInModal = (el)=>{
    if(!el || !el.closest) return false;
    return !!el.closest("#modalALFREDDrill, #modalReconquete, .modal-card, .modal-overlay, [role='dialog']");
  };

  const attachOnTable = (table)=>{
    if(!table || table.dataset.modalSortableAttached) return;
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    if(!thead || !tbody) return;
    if(!isInModal(table)) return;

    const ths = Array.from(thead.querySelectorAll("th"));
    if(!ths.length) return;

    // si le header est déjà géré par onclick inline (ex: drill), on ne double pas
    if(ths.some(th => th.getAttribute("onclick"))) return;

    table.dataset.modalSortableAttached = "1";

    let sortIdx = 0;
    let dir = 1; // 1 asc, -1 desc

    const syncArrows = ()=>{
      ths.forEach((th,i)=>{
        const base = th.getAttribute("data-base-label") || th.textContent.trim().replace(/\s*[▲▼]$/,"");
        th.setAttribute("data-base-label", base);
        th.textContent = base + (i===sortIdx ? (dir===1 ? " ▲" : " ▼") : "");
      });
    };

    ths.forEach((th,i)=>{
      th.style.cursor = "pointer";
      th.title = "Cliquer pour trier (▲/▼)";
      th.addEventListener("click", ()=>{
        if(sortIdx === i) dir = -dir;
        else { sortIdx = i; dir = 1; }
        syncArrows();

        const rows = Array.from(tbody.querySelectorAll("tr"));
        rows.sort((ra, rb)=>{
          const aTxt = ra.children[i] ? ra.children[i].textContent : "";
          const bTxt = rb.children[i] ? rb.children[i].textContent : "";
          const a = parseCellValue(aTxt);
          const b = parseCellValue(bTxt);

          // NC/null toujours en bas
          if(a.isNull && b.isNull) return 0;
          if(a.isNull) return 1;
          if(b.isNull) return -1;

          // num/date
          if(a.type === "num" || b.type === "num" || a.type === "date" || b.type === "date"){
            return dir * ((a.v||0) - (b.v||0));
          }
          // string
          return dir * ((""+a.v).localeCompare((""+b.v), "fr"));
        });

        for(const r of rows) tbody.appendChild(r);
      });
    });

    // init arrows
    syncArrows();
  };

  const scan = (root)=>{
    if(!root || !root.querySelectorAll) return;
    const tables = root.querySelectorAll("table");
    for(const t of tables) attachOnTable(t);
  };

  // scan initial + observer (pour tables injectées dans modales)
  try{
    scan(document);
    const mo = new MutationObserver((muts)=>{
      for(const m of muts){
        for(const n of m.addedNodes){
          if(n && n.nodeType===1) scan(n);
        }
      }
    });
    mo.observe(document.body, {childList:true, subtree:true});
  }catch(e){}
}

function makeDomTableSortable(table){
  if(!table) return;
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  if(!thead || !tbody) return;
const ths = Array.from(thead.querySelectorAll("th"));
  if(!ths.length) return;

  // sauvegarde label original
  ths.forEach(th=>{
    if(!th.dataset.label) th.dataset.label = th.textContent.trim();
    th.style.cursor = "pointer";
    th.title = "Cliquer pour trier (▲/▼)";
  });
// état par table
  if(!table.dataset.sortIdx) table.dataset.sortIdx = "";
  if(!table.dataset.sortDir) table.dataset.sortDir = "asc";
function applyIndicators(){
    const idx = table.dataset.sortIdx==="" ? -1 : parseInt(table.dataset.sortIdx,10);
    const dir = table.dataset.sortDir || "asc";
ths.forEach((th,i)=>{
      const base = th.dataset.label || th.textContent.trim();
      if(i===idx){
        th.textContent = base + (dir==="asc" ? " ▲" : " ▼");
      }else{
        th.textContent = base;
      }
    });
}

  function sortByColumn(idx){
    const dir = (table.dataset.sortIdx===""+idx && table.dataset.sortDir==="asc") ? "desc" : "asc";
    table.dataset.sortIdx = ""+idx;
table.dataset.sortDir = dir;

    const rows = Array.from(tbody.querySelectorAll("tr")).filter(tr=>{
      // ignore rows that are placeholders (colspan)
      const tds = tr.querySelectorAll("td");
      return tds && tds.length>1;
    });
rows.sort((a,b)=>{
      const ac = a.children[idx] ? a.children[idx].textContent : "";
      const bc = b.children[idx] ? b.children[idx].textContent : "";
      const A = parseCellValue(ac);
      const B = parseCellValue(bc);

      // nulls at bottom
      if(A.isNull && B.isNull) return 0;
      if(A.isNull) return 1;
      if(B.isNull) return -1;

      let cmp = 0;
      if(A.type==="num" && B.type==="num") cmp = (A.v 
- B.v);
      else if(A.type==="date" && B.type==="date") cmp = (A.v - B.v);
      else cmp = (""+A.v).localeCompare(""+B.v, "fr", {numeric:true, sensitivity:"base"});

      if(cmp===0) return 0;
      return (dir==="asc") ? (cmp<0?-1:1) : (cmp<0?1:-1);
    });
// réinjection
    rows.forEach(r=>tbody.appendChild(r));
    applyIndicators();
  }

  // add listeners (idempotent)
  if(!table.dataset.sortBound){
    ths.forEach((th, idx)=>{
      th.addEventListener("click", ()=>sortByColumn(idx));
    });
table.dataset.sortBound="1";
  }
  applyIndicators();
}

function bindDomSortableTables(){
  document.querySelectorAll(".tableWrap table, .pilotage-toplist table").forEach(makeDomTableSortable);
}

function setStatus(txt, meta){
  $("#statusTxt").textContent = txt;
  if(meta!=null) $("#statusMeta").textContent = meta;
}
function escapeHtml(s){
  return (s??"").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function fmtInt(n){ return (isFinite(n)? n.toLocaleString("fr-FR") : "—"); }
function fmtEUR(n){ return (isFinite(n)? n.toLocaleString("fr-FR",{minimumFractionDigits:2, maximumFractionDigits:2})+" €" : "—"); }
function fmtMoney(n){ return fmtEUR(n); } // alias historique (compat)
function fmtDateISO(iso){
  if(!iso) return "";
  try{ return new Date(iso+"T00:00:00Z").toLocaleDateString("fr-FR"); }catch(e){ return iso; }
}


function fmtPctPercent(p, decimals=0){
  const n = Number(p);
  if(p==null || p==="" || !isFinite(n)) return "—";
  const s = (decimals>0 ? n.toFixed(decimals) : String(Math.round(n)));
  return s + "%";
}
function fmtPctRatio(r, decimals=0){
  const n = Number(r);
  if(r==null || r==="" || !isFinite(n)) return "—";
  return fmtPctPercent(n*100, decimals);
}
function fmtPctAuto(v, decimals=0){
  const n = Number(v);
  if(v==null || v==="" || !isFinite(n)) return "—";
  // Heuristique: si |v| <= 1.5 => ratio (0-1), sinon pourcentage
  if(Math.abs(n) <= 1.5) return fmtPctRatio(n, decimals);
  return fmtPctPercent(n, decimals);
}

function _monthKeyFromISO(iso){
  // iso: YYYY-MM-DD
  if(!iso) return "";
  return String(iso).slice(0,7);
}
function _monthIndex(mk){
  const [y,m]=mk.split('-').map(Number);
  return (y*12 + (m-1));
}
function _mkFromIndex(idx){
  const y = Math.floor(idx/12);
  const m = (idx%12)+1;
  return `${y}-${String(m).padStart(2,'0')}`;
}
// Compute per-client Max CA on 12M rolling window (last 5 years) + current 12M CA.
// Returns map: { [clientCanon]: {max12, cur12} }
function computeClientMaxCA12MAll(asOfISO){
  const out = Object.create(null);
  try{
    const asOfStr = (asOfISO||state.params?.asOfDate||state.quality?.maxDate||new Date().toISOString().slice(0,10));
    const asOfMK = _monthKeyFromISO(asOfStr);
    const asOfIdx = _monthIndex(asOfMK);

    // prefer canonical cache (monthly sums) if available
    const mByC = state.cache && state.cache.monthlyByClient ? state.cache.monthlyByClient : null;

    if(mByC){
      for(const [key, mm] of mByC.entries()){
        if(!mm || !mm.size) continue;

        // collect month indexes <= asOf
        let minIdx = Infinity;
        const entries = [];
        for(const [mk, cell] of mm.entries()){
          const idx = _monthIndex(mk);
          if(idx > asOfIdx) continue;
          const v = cell && isFinite(cell.sumHT) ? Number(cell.sumHT) : 0;
          if(!v) continue;
          if(idx < minIdx) minIdx = idx;
          entries.push([idx, v]);
        }
        if(minIdx===Infinity){
          out[key] = {max12:0, cur12:0, prevMax12:0};
          continue;
        }
        const L = (asOfIdx - minIdx + 1);
        const arr = new Float64Array(L);
        for(const [idx, v] of entries){
          const pos = idx - minIdx;
          if(pos>=0 && pos<L) arr[pos] += v;
        }

        // current 12M = last 12 months (or all available if <12)
        let cur12 = 0;
        const startCur = Math.max(0, L-12);
        for(let i=startCur;i<L;i++) cur12 += arr[i];

        if(L < 12){
          // less than 12 months of history -> by definition 100%
          out[key] = {max12:cur12, cur12, prevMax12:0};
          continue;
        }

        // rolling max over any 12 consecutive months (all history up to asOf)
        let sum12 = 0;
        for(let i=0;i<12;i++) sum12 += arr[i];
        let max12 = sum12;
        // rolling max over windows ending before current month (end <= L-2)
        let prevMax12 = (11 <= (L-2)) ? sum12 : 0;

        for(let i=12;i<L;i++){
          sum12 += arr[i] - arr[i-12];
          if(sum12 > max12) max12 = sum12;
          if(i <= L-2 && sum12 > prevMax12) prevMax12 = sum12;
        }
        out[key] = {max12, cur12, prevMax12};
      }
      return out;
    }

    // fallback: build monthly buckets from tx (slower)
    const tx = state.tx || [];
    if(!tx.length) return out;

    const buckets = Object.create(null);
    for(const t of tx){
      const mk = _monthKeyFromISO(t.dateISO);
      if(!mk) continue;
      const idx = _monthIndex(mk);
      if(idx > asOfIdx) continue;
      const key = t.clientCanon || t.clientNorm || t.rawClient;
      if(!key) continue;
      let mm = buckets[key];
      if(!mm){ mm = new Map(); buckets[key]=mm; }
      const v = (isFinite(t.amountHT) ? Number(t.amountHT) : 0);
      if(!v) continue;
      mm.set(idx, (mm.get(idx)||0) + v);
    }

    for(const key in buckets){
      const mm = buckets[key];
      let minIdx = Infinity;
      for(const idx of mm.keys()) if(idx < minIdx) minIdx = idx;
      const L = (asOfIdx - minIdx + 1);
      const arr = new Float64Array(L);
      for(const [idx, v] of mm.entries()){
        const pos = idx - minIdx;
        if(pos>=0 && pos<L) arr[pos] += v;
      }

      let cur12=0;
      const startCur = Math.max(0, L-12);
      for(let i=startCur;i<L;i++) cur12 += arr[i];

      if(L < 12){
        out[key] = {max12:cur12, cur12, prevMax12:0};
        continue;
      }

      let sum12=0;
      for(let i=0;i<12;i++) sum12 += arr[i];
      let max12=sum12;
      let prevMax12 = (11 <= (L-2)) ? sum12 : 0;

      for(let i=12;i<L;i++){
        sum12 += arr[i] - arr[i-12];
        if(sum12>max12) max12=sum12;
        if(i <= L-2 && sum12>prevMax12) prevMax12=sum12;
      }
      out[key] = {max12, cur12, prevMax12};
    }
  }catch(e){}
  return out;
}

function chipClass(seg){
  const s=(seg||"").toLowerCase();
  if(s.includes("vip solides")) return "good";
  if(s.includes("vip fragiles")) return "warn";
  if(s.includes("vip")) return "good";
  if(s.includes("régulier")||s.includes("regulier")) return "acc";
  if(s.includes("nou")) return "acc";
  if(s.includes("pot")) return "warn";
  if(s.includes("ris")||s.includes("dorm")) return "bad";
  return "acc";
}


function getTableauBordKpis(){
  const kpiClients = (typeof getDashClientsVisible === "function")
    ? (getDashClientsVisible() || [])
    : ((state && Array.isArray(state.clients)) ? state.clients : []);

  const activeClients = kpiClients.filter(c=>{
    const seg = String(c && c.segment || "");
    return !!c && seg !== "Perdus" && seg !== "Perdus Historiques";
  });

  const total = activeClients.length;
  const active = activeClients.filter(c => Number(c && (c.frequency || c.orders12m || c.nTx || 0)) > 0).length;

  const asOfISO = (state && state.params && state.params.asOfDate)
    || (state && state.quality && state.quality.maxDate)
    || new Date().toISOString().slice(0,10);

  const year = String(asOfISO).slice(0,4);
  const curMk = String(asOfISO).slice(0,7);
  const prevDate = new Date(curMk + "-01T00:00:00Z");
  prevDate.setUTCMonth(prevDate.getUTCMonth()-1);
  const prevMk = prevDate.toISOString().slice(0,7);

  let ytdCA = 0;
  let curOrders = 0;
  let prevOrders = 0;

  try{
    const tx = Array.isArray(state && state.tx) ? state.tx : [];
    for(const t of tx){
      if(!t || !t.dateISO) continue;
      const iso = String(t.dateISO);
      const mk = iso.slice(0,7);
      if(iso.slice(0,4) === year) ytdCA += Number(t.amountHT || 0);
      if(mk === curMk) curOrders++;
      else if(mk === prevMk) prevOrders++;
    }
  }catch(_e){}

  if(!ytdCA){
    try{
      const pm = state && state.cache && state.cache.portfolioMonthly;
      if(pm && typeof pm.forEach === "function"){
        pm.forEach((cell, mk)=>{
          const s = String(mk || "");
          if(s.slice(0,4) === year && s <= curMk) ytdCA += Number(cell && cell.sumHT || 0);
        });
      }
    }catch(_e){}
  }

  if(!(curOrders || prevOrders)){
    try{
      const pm = state && state.cache && state.cache.portfolioMonthly;
      if(pm && typeof pm.get === "function"){
        curOrders = Number(pm.get(curMk)?.cnt || 0);
        prevOrders = Number(pm.get(prevMk)?.cnt || 0);
      }
    }catch(_e){}
  }

  // Alignement Dashboard : panier moyen = CA total visible / nombre total de commandes visibles
  let basket = 0;
  try{
    const totalHT = kpiClients.reduce((s,c)=>s + Number(c && (c.monetaryHT || 0)), 0);
    const totalTx = kpiClients.reduce((s,c)=>s + Number(c && (c.frequency || 0)), 0);
    basket = totalTx ? (totalHT / totalTx) : 0;
  }catch(_e){}

  if(!basket){
    try{
      let amt = 0, cnt = 0;
      const tx = Array.isArray(state && state.tx) ? state.tx : [];
      for(const t of tx){
        const a = Number(t && t.amountHT || 0);
        if(Number.isFinite(a)){ amt += a; cnt++; }
      }
      basket = cnt ? (amt / cnt) : 0;
    }catch(_e){}
  }

  // Alignement Dashboard : dépendance top 5 sur les parts de CA visibles
  let depTop5Pct = 0;
  try{
    const shares = kpiClients
      .map(c => Number(c && (c.caSharePeriod || 0)))
      .filter(n => Number.isFinite(n) && n >= 0)
      .sort((a,b)=>b-a);
    depTop5Pct = shares.length ? (shares.slice(0,5).reduce((a,b)=>a+b,0) * 100) : 0;
  }catch(_e){}

  return { year, total, active, ytdCA, curOrders, prevOrders, basket, depTop5Pct };
}


window.getTableauBordKpis = getTableauBordKpis;

/** =========================
 * Tabs
 * ========================= */
function 
switchView(v){
  $$(".tab").forEach(t=>t.classList.toggle("active", t.dataset.view===v));
  ["home","import","dedupe","params","tableau-bord","dash","clients","pilotage-co","alfred","objectifs","export","categories","kpi"].forEach(x=>{
    const el = $("#view-"+x);
    if(!el) return;
    el.classList.toggle("hidden", x!==v);
  });
  try{
    if(v==="tableau-bord" && typeof window.renderTableauBord==="function"){
      window.renderTableauBord();
    }
  }catch(e){
    console.warn("[TableauBord] switchView render error", e);
  }
}
$("#tabs").addEventListener("click",(e)=>{
  const t = e.target.closest(".tab");
  if(!t) return;
  if(t.id==="tabHomeIcon"){
    if(typeof enterHome==="function") enterHome();
    else switchView("home");
    return;
  }
  switchView(t.dataset.view);
});
/** =========================
 * CSV parsing
 * ========================= */
function detectSep(line){
  const seps = [";","\t",",","|"];
  let best=";", bestCount=-1;
for(const s of seps){
    const c = (line.split(s).length-1);
    if(c>bestCount){ bestCount=c; best=s; }
  }
  return best;
}
function parseCSV(text, sep){
  const rows=[];
  let i=0, cur="", inQ=false;
  let row=[];
  const pushCell=()=>{ row.push(cur); cur=""; };
  const pushRow=()=>{ rows.push(row);
row=[]; };
  while(i<text.length){
    const ch=text[i];
    if(ch === '"'){
      if(inQ && text[i+1] === '"'){ cur+='"'; i+=2; continue; }
      inQ = !inQ; i++; continue;
    }
    if(!inQ && ch === sep){ pushCell(); i++; continue; }
    if(!inQ && (ch === "\n" || ch === "\r")){
      pushCell();
      // avoid pushing empty trailing lines
      if(row.length>1 || (row.length===1 && row[0].trim()!=="")) pushRow();
      if(ch === "\r" && 
text[i+1]==="\n") i+=2; else i++;
      continue;
    }
    cur+=ch; i++;
  }
  pushCell();
  if(row.length>1 || (row.length===1 && row[0].trim()!=="")) pushRow();
  // drop final empty row
  if(rows.length && rows[rows.length-1].every(c=>String(c||"").trim()==="")) rows.pop();
  return rows;
}
async function readFile(file, encoding){
  const buf = await file.arrayBuffer();
  const dec = new TextDecoder(encoding, {fatal:false});
  return dec.decode(buf);
}
function fillSelect(sel, headers){
  sel.innerHTML = `<option value="">— choisir —</option>` + headers.map((h,i)=>`<option value="${i}">${escapeHtml(h||("Col "+(i+1)))}</option>`).join("");
}
function normalizeCommercialName(s){
  const txt = normSpaces((s??"").toString());
  if(!txt) return "";
  return txt;
}
function parseMarginPercent(v){
  const s = (v??"").toString().trim();
  if(!s) return NaN;
  const hasPct = /%/.test(s);
  const n = parseFRNumber(s);
  if(!isFinite(n)) return NaN;
  if(hasPct) return n;
  if(Math.abs(n) <= 1) return n * 100;
  return n;
}
function ensureExtraMappingUI(){
  const amountSel = document.getElementById("colAmount");
  if(!amountSel || document.getElementById("colCommercial")) return;
  const wrap = amountSel.parentElement;
  if(!wrap) return;

  const makeField = (labelTxt, selectId)=>{
    const label = document.createElement("label");
    label.textContent = labelTxt;
    label.style.marginTop = "10px";
    const sel = document.createElement("select");
    sel.id = selectId;
    wrap.appendChild(label);
    wrap.appendChild(sel);
  };

  makeField("Commercial (optionnel)", "colCommercial");
  makeField("Marge % (optionnel)", "colMargin");
}
function getCommercialFilterState(){
  if(!state.ui) state.ui = {};
  if(!state.ui.commercialFilter || typeof state.ui.commercialFilter !== "object"){
    state.ui.commercialFilter = { mode:"ALL", selected:[] };
  }
  if(!Array.isArray(state.ui.commercialFilter.selected)) state.ui.commercialFilter.selected = [];
  if(!state.ui.commercialFilter.mode) state.ui.commercialFilter.mode = "ALL";
  return state.ui.commercialFilter;
}
function getCommercialUniverse(){
  const src = (Array.isArray(state.txAll) && state.txAll.length) ? state.txAll : (Array.isArray(state.tx) ? state.tx : []);
  const set = new Set();
  for(const t of src){
    const name = normalizeCommercialName(t && (t.commercial || t.rawCommercial || ""));
    if(name) set.add(name);
  }
  return Array.from(set).sort((a,b)=>a.localeCompare(b, "fr", {sensitivity:"base"}));
}
function sanitizeCommercialFilterSelection(){
  const f = getCommercialFilterState();
  const options = new Set(getCommercialUniverse());
  f.selected = (f.selected || []).map(normalizeCommercialName).filter(x=>x && options.has(x));
  f.mode = f.selected.length ? (f.selected.length===1 ? "ONE" : "MULTI") : "ALL";
  return f;
}
function txMatchesCommercialFilter(t, filterState){
  const f = filterState || getCommercialFilterState();
  if(!f || f.mode === "ALL" || !Array.isArray(f.selected) || !f.selected.length) return true;
  const name = normalizeCommercialName(t && (t.commercial || t.rawCommercial || ""));
  return !!name && f.selected.includes(name);
}
function ensureCommercialFilterUI(){
  const tabs = document.getElementById("tabs");
  if(!tabs) return null;

  let wrap = document.getElementById("commercialFilterWrap");
  if(!wrap){
    wrap = document.createElement("div");
    wrap.id = "commercialFilterWrap";
    wrap.style.cssText = "margin-left:auto; display:flex; align-items:center; position:relative; z-index:30;";
    wrap.innerHTML = `<button id="commercialFilterBtn" type="button" class="ghost" style="display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; border:1px solid rgba(255,255,255,0.14); background:rgba(0,0,0,0.18); color:var(--text); font-weight:900; cursor:pointer; white-space:nowrap;">👤 Tous</button>`;
    tabs.appendChild(wrap);
  }

  let panel = document.getElementById("commercialFilterPanel");
  if(!panel){
    panel = document.createElement("div");
    panel.id = "commercialFilterPanel";
    panel.style.cssText = "display:none; position:fixed; top:0; left:0; width:320px; max-height:340px; overflow:auto; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.10); background:#0f1730; box-shadow:0 24px 48px rgba(0,0,0,0.55); z-index:2147483647; opacity:1; pointer-events:auto; isolation:isolate; backdrop-filter:none; -webkit-backdrop-filter:none;";
    panel.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
        <div style="font-size:11px; font-weight:950; text-transform:uppercase; color:var(--muted);">Filtre commercial</div>
        <button id="commercialFilterReset" type="button" class="ghost" style="padding:4px 8px; border-radius:999px; font-size:11px;">Tous</button>
      </div>
      <div id="commercialFilterList" style="display:flex; flex-direction:column; gap:6px;"></div>`;
    document.body.appendChild(panel);
  }

  if(panel.dataset.bound === "1") return { wrap, panel, btn: document.getElementById("commercialFilterBtn") };
  panel.dataset.bound = "1";

  const btn = document.getElementById("commercialFilterBtn");
  const resetBtn = document.getElementById("commercialFilterReset");
  const positionPanel = ()=>{
    const r = btn.getBoundingClientRect();
    const width = 320;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, r.right - width));
    panel.style.top = Math.round(r.bottom + 10) + "px";
    panel.style.left = Math.round(left) + "px";
  };
  const closePanel = ()=>{ panel.style.display = "none"; };
  const openPanel = ()=>{ positionPanel(); panel.style.display = "block"; };

  btn.addEventListener("click", (ev)=>{
    ev.preventDefault();
    ev.stopPropagation();
    if(panel.style.display === "block") closePanel(); else openPanel();
  });
  resetBtn.addEventListener("click", (ev)=>{
    ev.preventDefault();
    ev.stopPropagation();
    const f = getCommercialFilterState();
    f.mode = "ALL";
    f.selected = [];
    applyCommercialFilter();
  });
  [panel, wrap].forEach(node=>{
    ["click","mousedown","mouseup","pointerdown","pointerup","touchstart","touchend","change","input"].forEach(evt=>{
      node.addEventListener(evt, (ev)=>ev.stopPropagation());
    });
  });
  document.addEventListener("click", ()=>closePanel());
  window.addEventListener("resize", ()=>{ if(panel.style.display === "block") positionPanel(); });
  window.addEventListener("scroll", ()=>{ if(panel.style.display === "block") positionPanel(); }, true);

  return { wrap, panel, btn };
}
function renderCommercialFilterUI(){
  const ui = ensureCommercialFilterUI();
  if(!ui) return;
  const btn = ui.btn || document.getElementById("commercialFilterBtn");
  const list = document.getElementById("commercialFilterList");
  if(!btn || !list) return;

  const options = getCommercialUniverse();
  const f = sanitizeCommercialFilterSelection();
  if(!options.length){
    btn.textContent = "👤 Tous";
    btn.disabled = true;
    btn.style.opacity = ".55";
    list.innerHTML = `<div class="small muted">Aucun commercial détecté dans le dataset.</div>`;
    return;
  }

  btn.disabled = false;
  btn.style.opacity = "1";
  let label = "Tous";
  if(f.mode !== "ALL" && f.selected.length === 1) label = f.selected[0];
  else if(f.mode !== "ALL" && f.selected.length > 1) label = `${f.selected.length} commerciaux`;
  btn.textContent = `👤 ${label}`;

  list.innerHTML = options.map(name=>{
    const checked = (f.mode !== "ALL" && f.selected.includes(name)) ? "checked" : "";
    return `<label data-commercial-row="1" style="display:grid; grid-template-columns:18px minmax(0,1fr); align-items:center; column-gap:10px; width:100%; padding:8px 6px; border-radius:8px; cursor:pointer; user-select:none;">
      <input type="checkbox" value="${escapeHtml(name)}" ${checked} style="margin:0; width:18px; height:18px; accent-color:#6ea8ff; cursor:pointer;" />
      <span style="font-weight:700; line-height:1.25; white-space:normal; overflow-wrap:anywhere;">${escapeHtml(name)}</span>
    </label>`;
  }).join("");

  list.querySelectorAll('[data-commercial-row="1"]').forEach(row=>{
    ["click","mousedown","mouseup","pointerdown","pointerup","touchstart","touchend"].forEach(evt=>{
      row.addEventListener(evt, (ev)=>ev.stopPropagation());
    });
  });
  list.querySelectorAll('input[type="checkbox"]').forEach(inp=>{
    ["click","mousedown","mouseup","pointerdown","pointerup","touchstart","touchend"].forEach(evt=>{
      inp.addEventListener(evt, (ev)=>ev.stopPropagation());
    });
    inp.addEventListener("change", ()=>{
      const picked = Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map(x=>normalizeCommercialName(x.value)).filter(Boolean);
      f.selected = picked;
      f.mode = picked.length ? (picked.length===1 ? "ONE" : "MULTI") : "ALL";
      applyCommercialFilter();
    });
  });
}
function applyCommercialFilter(opts){
  const options = opts || {};
  const src = Array.isArray(state.txAll) ? state.txAll : [];
  const f = sanitizeCommercialFilterSelection();
  state.tx = src.filter(t=>txMatchesCommercialFilter(t, f));
  try{ computeQuality(); }catch(e){}
  try{ renderCommercialFilterUI(); }catch(e){}
  try{
    if(window.DataStore && typeof DataStore.setDatasetFromLegacyState === "function"){
      DataStore.setDatasetFromLegacyState(state);
    }
  }catch(e){}
  try{
    window.dispatchEvent(new CustomEvent("commercialFilterChanged", {
      detail: {
        mode: f.mode,
        selected: Array.isArray(f.selected) ? f.selected.slice() : []
      }
    }));
  }catch(e){}
  if(options.skipRecalc) return;
  try{ recalcAll(); }catch(e){ try{ updateData(); }catch(_e){} }
  try{ if(typeof window.renderObjectifsModule === "function") window.renderObjectifsModule(); }catch(e){}
}

/** =========================
 * Normalization & similarity
 * ========================= */
function stripAccents(s){ return s.normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function normSpaces(s){ return s.replace(/\s+/g," ").trim();
}
function getWeakSet(){
  const txt = $("#weakWords").value;
  const items = txt.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const norm = items.map(w=>stripAccents(w.toLowerCase()).replace(/[^a-z0-9]/g,""));
  return new Set(norm.filter(Boolean));
}
function normalizeName(s){
  s = (s??"").toString();
  s = stripAccents(s).toLowerCase();
  s = s.replace(/['’`]/g," ");
  s = s.replace(/[^a-z0-9\s]/g," ");
  s = normSpaces(s);
const weak = getWeakSet();
  if(weak.size){
    const parts = s.split(" ").filter(w=>{
      const key = w.replace(/[^a-z0-9]/g,"");
      return key && !weak.has(key);
    });
s = parts.join(" ");
  }
  return normSpaces(s);
}
function levenshtein(a,b){
  a=a||""; b=b||"";
  const n=a.length, m=b.length;
  if(n===0) return m;
if(m===0) return n;
  const dp = new Array(m+1);
  for(let j=0;j<=m;j++) dp[j]=j;
  for(let i=1;i<=n;i++){
    let prev=dp[0]; dp[0]=i;
for(let j=1;j<=m;j++){
      const temp=dp[j];
      const cost=a[i-1]===b[j-1]?0:1;
      dp[j]=Math.min(dp[j]+1, dp[j-1]+1, prev+cost);
      prev=temp;
}
  }
  return dp[m];
}
function similarity(a,b){
  const an = normalizeName(a), bn = normalizeName(b);
if(!an || !bn) return 0;
  if(an===bn) return 100;
  if(an.includes(bn) || bn.includes(an)){
    const ratio = Math.min(an.length,bn.length)/Math.max(an.length,bn.length);
return Math.min(99, Math.round(88 + 12*ratio));
  }
  const dist = levenshtein(an,bn);
  const maxLen = Math.max(an.length,bn.length);
return Math.max(0, Math.min(99, Math.round((1 - dist/maxLen)*100)));
}
function pairKey(an,bn){
  return (an<bn) ? (an+"||"+bn) : (bn+"||"+an);
}

/** =========================
 * Date & amount parsing
 * ========================= */
function parseFRDateToISO(v){
  const s = (v??"").toString().trim();
  if(!s) return null;
  // Format ISO YYYY-MM-DD
  if(/^\d{4}-\d{2}-\d{2}/.test(s)){
    const d = new Date(s.slice(0,10));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
  }
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if(m){
    let p1=parseInt(m[1],10), p2=parseInt(m[2],10), yy=parseInt(m[3],10);
    if(yy<100) yy += 2000;
    let dd, mm2;
    // Détection automatique du format :
    // - Si p1 > 12 : forcément DD/MM (format FR)
    // - Si p2 > 12 : forcément MM/DD (format US)
    // - Sinon : heuristique — si p1 <= 12 et p2 <= 12, on teste les deux ;
    //   on préfère le format US (M/D) si l'année est >= 2000 et p1 <= 12
    //   car ce fichier vient d'un logiciel US (Sage, etc.)
    if(p1 > 12){
      // Format FR : DD/MM/YYYY
      dd = p1; mm2 = p2;
    } else if(p2 > 12){
      // Format US : MM/DD/YYYY
      mm2 = p1; dd = p2;
    } else {
      // Ambigu : les deux sont <= 12.
      // On détecte sur l'ensemble du fichier via window.__dateFormatHint si dispo,
      // sinon on tente d'abord US (M/D) — cohérent avec les logiciels FR qui exportent en US
      const hint = (typeof window !== 'undefined') ? window.__dateFormatHint : undefined;
      if(hint === 'FR'){ dd = p1; mm2 = p2; }
      else { mm2 = p1; dd = p2; } // US par défaut quand ambigu
    }
    const d = new Date(Date.UTC(yy, mm2-1, dd));
    if(d.getUTCFullYear()===yy && d.getUTCMonth()===(mm2-1) && d.getUTCDate()===dd) return d.toISOString().slice(0,10);
  }
  // Dernier recours : laisser le navigateur parser
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
}
function parseFRNumber(v){
  if(v==null) return NaN;
let s=(""+v).trim();
  if(!s) return NaN;
  s = s.replace(/[€\s\u00A0]/g,"");
  // detect comma decimal
  if(s.includes(",") && !s.includes(".")){
    s = s.replace(/\./g,"");
s = s.replace(",",".");
  }else{
    s = s.replace(/,/g,"");
  }
  s = s.replace(/[^0-9.\-]/g,"");
  const n = parseFloat(s);
return isNaN(n) ? NaN : n;
}

/** =========================
 * Build dataset
 * ========================= */
function bestGuess(headers){
  const h = headers.map(x=>normSpaces((x||"").toString()).toLowerCase());

  const pick = (patterns)=>{
    for(const rx of patterns){
      const idx = h.findIndex(x=>rx.test(x));
      if(idx >= 0) return idx;
    }
    return -1;
  };

  return {
    client: pick([
      /^(n[°oº]?\s*)?client$/, /^code\s*client$/, /^id\s*client$/, /^num(é|e)?ro\s*client$/,
      /client/, /raison\s*sociale/, /\bsoci(é|e)t(é|e)\b/, /societe/, /tiers/, /customer/, /account/, /nom\s*client/, /enseigne/
    ]),
    date: pick([
      /^date$/, /^date\s*(facture|commande|vente|achat|op[ée]ration)$/, /date/,
      /jour/, /invoice/, /facture/, /commande/, /vente/, /achat/
    ]),
    amount: pick([
      /montant\s*ht/, /total\s*ht/, /\bca\s*ht\b/, /hors\s*taxe/, /\bht\b/, /net\s*ht/,
      /montant/, /total/, /amount/, /^\bca\b/, /chiffre/
    ]),
    commercial: pick([
      /^commercial$/, /^vendeur$/, /^responsable\s*commercial$/, /commercial/, /vendeur/, /sales/, /\brep\b/, /responsable/, /owner/
    ]),
    margin: pick([
      /^marge$/, /marge/, /margin/, /taux\s*de\s*marge/
    ]),
  };
}
function resolveCanon(rawName){
  const norm = normalizeName(rawName);
  const clean = normSpaces((rawName??"").toString());
  if(!norm) return {norm:"", canon:"(Sans nom)"};
const canon = state.aliases[norm] || clean || norm.toUpperCase();
  // ensure deterministic within session
  if(!state.aliases[norm]) state.aliases[norm] = canon;
return {norm, canon};
}
function buildTransactions(){
  const ci = parseInt(state.mapped.client,10);
  const di = parseInt(state.mapped.date,10);
  const ai = parseInt(state.mapped.amount,10);
  const coi = parseInt(state.mapped.commercial,10);
  const mi = parseInt(state.mapped.margin,10);
if(!isFinite(ci)||!isFinite(di)||!isFinite(ai)){
    $("#buildMsg").innerHTML = `<span class="danger">Mapping incomplet.</span>`;
    return;
  }
  __resetComputedState();
  const rows = state.rawRows.slice(1);

  // ── Détection automatique du format de date (US M/D/YYYY vs FR D/M/YYYY) ──
  // On scanne les 200 premières lignes : si on trouve p1 > 12, c'est du FR.
  // Si on trouve p2 > 12, c'est du US. La première preuve trouvée gagne.
  window.__dateFormatHint = undefined;
  (function detectDateFormat(){
    const sample = rows.slice(0, 200);
    for(const r of sample){
      const s = String(r[di] ?? '').trim();
      const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
      if(!m) continue;
      const p1 = parseInt(m[1],10), p2 = parseInt(m[2],10);
      if(p1 > 12){ window.__dateFormatHint = 'FR'; return; } // DD/MM
      if(p2 > 12){ window.__dateFormatHint = 'US'; return; } // MM/DD
    }
    // Aucune preuve définitive — on laisse undefined (parseFRDateToISO utilisera US par défaut)
  })();
  const txAll=[];
for(const r of rows){
    const rawClient = (r[ci] ?? "").toString().trim();
    const rawCommercial = (isFinite(coi) ? (r[coi] ?? "") : "").toString().trim();
    const dateISO = parseFRDateToISO(r[di]);
const amountHT = parseFRNumber(r[ai]);
    const marginPct = isFinite(mi) ? parseMarginPercent(r[mi]) : NaN;
    const {norm, canon} = resolveCanon(rawClient);
    const commercial = normalizeCommercialName(rawCommercial);
    txAll.push({
      rawClient,
      clientNorm: norm,
      clientCanon: canon,
      dateISO,
      amountHT,
      rawCommercial,
      commercial,
      commercialNorm: normalizeName(rawCommercial),
      marginPct
    });
}
  state.txAll = txAll;
  sanitizeCommercialFilterSelection();
  state.tx = txAll.filter(t=>txMatchesCommercialFilter(t));

  LS.set("aliases", state.aliases);
  updateAliasTag();
  computeQuality();
  __dsAutoProtectFromCrossDatasetMix(rows, ci, di, ai, coi, mi);
  renderCommercialFilterUI();

  // --- LIBÉRATION DE LA RAM ---
  // Une fois les transactions propres créées ET les métriques calculées, on vide les données brutes lourdes 
  // pour éviter de saturer le navigateur sur des fichiers > 50k lignes.
  state.rawText = "";
  state.rawRows = [];
  // --- Auto: caler la Date de référence sur la 3e date la plus récente du fichier importé (modifiable ensuite)
  // --- Auto : caler la Date de référence sur la date absolue la plus récente du fichier importé
  try{
    const qMax = state.quality && state.quality.maxDate;
    state.ui = state.ui || {};

    if(qMax && !state.ui.userAsOfTouched){
      if(!state.params) state.params = defaultParams();
      state.params.asOfDate = qMax;
      LS.set("params", state.params);
      const asEl = document.getElementById("asOfDate");
      if(asEl) asEl.value = qMax;
      renderParamKpis();
    }
  }catch(e){}

  $("#btnSuggest").disabled = false;
  $("#btnApplyAliases").disabled = false;
  $("#btnExportClients").disabled = false;
  $("#btnExportTx").disabled = false;
  $("#buildMsg").innerHTML = `<span class="ok">Dataset construit.</span>`;
  setStatus("Import OK", `${fmtInt(state.quality.clients)} clients`);

  // --- AUTOMATISATION DES RÉGLAGES AUTO ---
  // On force un premier calcul des moyennes pour définir les seuils
  recalcAll(); 
  if (state.statsAvgF && state.statsAvgM && state.statsAvgBasket) {
      // On simule l'application du preset auto pour que les scores RFM soient cohérents immédiatement
      const F1 = 1;
      const F3 = state.statsAvgF;
      const F2 = (F1 + F3) / 2;
      const F4 = (F3 - F2) * 2 + F3;

      const M1 = state.statsAvgBasket;
      const M3 = state.statsAvgM;
      const M2 = (M1 + M3) / 2;
      const M4 = (M3 - M2) * 2 + M3;

      // Mise à jour des inputs de l'interface pour la cohérence visuelle
      const setV = (id, v) => { 
          const el = document.getElementById(id); 
          if(el) el.value = (id.startsWith('f')) ? v.toFixed(2) : Math.round(v); 
      };
      setV("f1", F1); setV("f2", F2); setV("f3", F3); setV("f4", F4);
      setV("m1", M1); setV("m2", M2); setV("m3", M3); setV("m4", M4);

      // Mise à jour des paramètres dans le state
      state.params.f1 = F1; state.params.f2 = F2; state.params.f3 = F3; state.params.f4 = F4;
      state.params.m1 = M1; state.params.m2 = M2; state.params.m3 = M3; state.params.m4 = M4;

      LS.set("params", state.params);

      // Deuxième passe de calcul avec les nouveaux seuils auto
      recalcAll();
      renderParamKpis();
  }


  try{ if(window.DataStore && typeof DataStore.setDatasetFromLegacyState==='function') DataStore.setDatasetFromLegacyState(state); }catch(e){}
}

/** =========================
 * Quality
 * ========================= */
function computeQuality(){
  const q = {lines: state.rawRows.length, parsed: Math.max(0,state.rawRows.length-1), valid:0, invalid:0, clients:0, minDate:null, maxDate:null, sum:0};
const set = new Set();
  for(const t of state.tx){
    if(t.dateISO && isFinite(t.amountHT)){
      q.valid++;
q.sum += t.amountHT;
      if(!q.minDate || t.dateISO < q.minDate) q.minDate=t.dateISO;
      if(!q.maxDate || t.dateISO > q.maxDate) q.maxDate=t.dateISO;
      set.add(t.clientCanon);
    }else q.invalid++;
}
  q.clients = set.size;
  state.quality = q;
  $("#statusMeta").textContent = `${fmtInt(q.clients)} clients`;
  renderQuality();
}
function renderQuality(){
  const q = state.quality;
const items = [
    ["Lignes", fmtInt(q.lines)],
    ["Transactions", fmtInt(q.parsed)],
    ["Valides", fmtInt(q.valid)],
    ["Invalides", fmtInt(q.invalid)],
    ["Clients uniques", fmtInt(q.clients)],
    ["Somme HT", fmtEUR(q.sum)],
  ];
$("#kpiQuality").innerHTML = items.map(([k,v])=>`
    <div class="kpi"><div class="k">${k}</div><div class="v">${v}</div></div>
  `).join("");
  const notes = [];
if(q.minDate && q.maxDate) notes.push(`Période détectée : <span class="mono">${fmtDateISO(q.minDate)} → ${fmtDateISO(q.maxDate)}</span>.`);
if(q.invalid>0) notes.push(`<span class="danger">⚠️ ${q.invalid} lignes ignorées</span> (date ou montant HT illisible).`);
  $("#qualityNotes").innerHTML = notes.join("<br/>") || "—";
}

function renderParamKpis(){
  const box = document.getElementById("kpiParams");
  if(!box) return;

  const p = state.params || {};
  const clients = (state.clients||[]).slice();
const topN = Math.max(0, Math.min(5, parseInt(p.excludeTopN,10) || 0));

  // Exclusion TOP N (sur CA période) UNIQUEMENT pour les moyennes
  let base = clients;
if(topN>0){
    base = clients.slice().sort((a,b)=>(b.monetaryHT||0)-(a.monetaryHT||0)).slice(topN);
  }

  const n = base.length;
  const mean = (arr)=> arr.length ?
(arr.reduce((s,x)=>s+(isFinite(x)?x:0),0)/arr.length) : NaN;

  const avgR = mean(base.map(c=>c.recencyDays).filter(isFinite));
  // fréquence normalisée selon mode
  const mode = (p.freqMode || "annual");
const avgF = mean(base.map(c=>{
    if(isFinite(c.frequencyMetric)) return c.frequencyMetric;
    // fallback : approx à partir de frequency et de la période sélectionnée
    let monthsSpan;
    if(p.periodMonths==="ALL"){
      const minISO = state.quality?.minDate;
      if(minISO){
        const asOf = new Date((p.asOfDate||new Date().toISOString().slice(0,10))+"T00:00:00Z");
        const minD = new Date(minISO+"T00:00:00Z");
        monthsSpan = Math.max(1, Math.round((asOf - minD)/(30.4375*24*3600*1000)));
      }else monthsSpan = 12;
    
}else{
      monthsSpan = Math.max(1, parseInt(p.periodMonths,10) || 12);
    }
    if(mode==="monthly") return (c.frequency||0)/monthsSpan;
    return (c.frequency||0)/(monthsSpan/12);
  }).filter(isFinite));
const avgM = mean(base.map(c=>c.monetaryHT).filter(isFinite));
  const avgBasket = mean(base.map(c=>{
    const f = (c.frequency||0);
    return f>0 ? (c.monetaryHT||0)/f : NaN;
  }).filter(isFinite));
  // expose moyennes pour Réglages Auto
  state.statsAvgF = avgF; state.statsAvgM = avgM; state.statsAvgBasket = avgBasket; state.statsAvgFMode = mode;
const fLabel = (mode==="monthly") ? "Fréquence moyenne / mois" : "Fréquence moyenne / an";
box.innerHTML = [
    ["Récence moyenne", isFinite(avgR) ? (Math.round(avgR).toLocaleString("fr-FR")+" j") : "—"],
    [fLabel, isFinite(avgF) ?
(avgF.toFixed(2).replace(".",",")) : "—"],
    ["Montant moyen (CA HT)", isFinite(avgM) ?
(avgM.toLocaleString("fr-FR",{minimumFractionDigits:0,maximumFractionDigits:0})+" €") : "—"],
    ["Panier moyen HT", isFinite(avgBasket) ?
(avgBasket.toLocaleString("fr-FR",{minimumFractionDigits:0,maximumFractionDigits:0})+" €") : "—"],
    ["Base moyennes", `${fmtInt(n)} clients` + (topN>0 ? ` (TOP ${topN} exclus)` : "")]
  ].map(([k,v])=>`<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");

  const sf = document.getElementById('suggStdF');
  if(sf) sf.textContent = `(Moyennes ${isFinite(state.statsStdF)? state.statsStdF.toFixed(2):'—'})`;
  const sm = document.getElementById('suggStdM');
  if(sm) sm.textContent = `(Moyennes ${isFinite(state.statsStdM)? state.statsStdM.toFixed(0):'—'})`;

  // Mise à jour des badges TV/TF dans la vue paramètres si besoin
  if(state.params) {
      ["f1","f2","f3","f4","m1","m2","m3","m4"].forEach(id => {
          const el = document.getElementById(id);
          if(el) el.value = (id.startsWith('f')) ? state.params[id].toFixed(2) : state.params[id];
      });
  }
}


/** =========================
 * Suggestions (dedupe)
 * ========================= */
function updateAliasTag(){
  const a = Object.keys(state.aliases||{}).length;
  const n = Object.keys(state.noMerge||{}).length;
$("#aliasTag").textContent = `Alias: ${a} • Refus: ${n}`;
}
function generateSuggestions(){
  if(!state.tx.length) return;
  const threshold = parseInt($("#simSel").value,10) || 90;
const maxP = parseInt($("#maxPairs").value,10) || 200;

  // unique raw display names
  const uniq = Array.from(new Set(state.tx.map(t=>t.rawClient).filter(Boolean))).slice(0);
// Regroupement élargi par première lettre uniquement (meilleure couverture de l'algo Levenshtein)
  const buckets = new Map();
for(const name of uniq){
    const n = normalizeName(name);
    if(!n) continue;
    const key = n[0] || "#";
    if(!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(name);
  }

  const pairs=[];
  const seen = new Set();
for(const [bk, list] of buckets.entries()){
    for(let i=0;i<list.length;i++){
      for(let j=i+1;j<list.length;j++){
        const a = list[i], b=list[j];
const an = normalizeName(a), bn=normalizeName(b);
        if(!an||!bn||an===bn) continue;
        const pk = pairKey(an,bn);
        if(seen.has(pk)) continue;
        seen.add(pk);
        if(state.noMerge[pk]) continue;
        const sc = similarity(a,b);
if(sc>=threshold) pairs.push({a,b, an, bn, score: sc});
      }
    }
  }
  pairs.sort((x,y)=>y.score-x.score);
  renderSuggestions(pairs.slice(0,maxP), threshold);
}
function renderSuggestions(pairs, threshold){
  const body = $("#suggestBody");
  body.innerHTML = "";
if(!pairs.length){
    body.innerHTML = `<tr><td colspan="13" class="muted">Aucune suggestion ≥ ${threshold}%.</td></tr>`;
    return;
}
  for(const p of pairs){
    const tr = document.createElement("tr");
    tr.dataset.an = p.an;
    tr.dataset.bn = p.bn;
tr.dataset.a = p.a;
    tr.dataset.b = p.b;
    tr.innerHTML = `
      <td>${escapeHtml(p.a)}</td>
      <td>${escapeHtml(p.b)}</td>
      <td><span class="chip ${p.score>=95?'good':(p.score>=92?'warn':'acc')}">${p.score}%</span></td>
      <td>
        <div class="row" style="gap:8px; flex-wrap:nowrap; align-items:flex-end;">
          <button class="good btnMerge" type="button">Fusionner</button>
          <button class="bad btnSplit" type="button">Séparer</button>
        </div>
      </td>
    `;
body.appendChild(tr);
  }

  body.onclick = (e)=>{
    const btn = e.target.closest("button");
    if(!btn) return;
    const tr = btn.closest("tr");
const a = tr.dataset.a, b=tr.dataset.b;
    const an = tr.dataset.an, bn=tr.dataset.bn;
    const pk = pairKey(an,bn);
if(btn.classList.contains("btnMerge")){
      const aCanon = state.aliases[an] || a;
      const bCanon = state.aliases[bn] || b;
const canon = (aCanon.length <= bCanon.length) ? aCanon : bCanon;
// pick shorter as canonical
      state.aliases[an] = canon;
      state.aliases[bn] = canon;
      delete state.noMerge[pk];
tr.querySelector("td:nth-child(4)").innerHTML = `<span class="chip good">Fusionné → ${escapeHtml(canon)}</span>`;
    }else{
      state.noMerge[pk] = true;
tr.querySelector("td:nth-child(4)").innerHTML = `<span class="chip bad">Séparé</span>`;
    }
    LS.set("aliases", state.aliases);
    LS.set("noMerge", state.noMerge);
    updateAliasTag();
  };
}
function applyAliases(){
  if(!state.tx.length) return;
for(const t of state.tx){
    const n = normalizeName(t.rawClient);
    t.clientNorm = n;
    if(n && state.aliases[n]) t.clientCanon = state.aliases[n];
}
  LS.set("aliases", state.aliases);
  updateAliasTag();
  computeQuality();
  recalcAll();
  $("#applyMsg").innerHTML = `<span class="ok">Alias appliqués + recalcul OK.</span>`;
  setStatus("Alias appliqués", `${fmtInt(state.clients.length)} clients`);
}

/** =========================
 * Params + scoring
 * ========================= */
function saveParams(){
  const p = {...state.params};
const val = $("#periodMonths").value;
  p.periodMonths = (val === "ALL") ? "ALL" : (parseInt(val,10) || 12);
  p.asOfDate = $("#asOfDate").value ||
new Date().toISOString().slice(0,10);
  p.freqMode = $("#freqMode").value || "annual";
  p.excludeTopN = parseInt($("#excludeTopN").value,10) || 0;
  ["r5","r4","r3","r2"].forEach(id=>p[id]=parseInt($("#"+id).value,10));
  ["f1","f2","f3","f4"].forEach(id=>{ const v=parseFloat(($("#"+id).value||"").toString().replace(",", ".")); p[id]=isFinite(v)? Math.round(v*100)/100 : 0; });
  ["m1","m2","m3","m4"].forEach(id=>p[id]=parseFloat($("#"+id).value));
const okR = p.r5<=p.r4 && p.r4<=p.r3 && p.r3<=p.r2;
  const okF = p.f1<=p.f2 && p.f2<=p.f3 && p.f3<=p.f4;
const okM = p.m1<=p.m2 && p.m2<=p.m3 && p.m3<=p.m4;
  if(!okR || !okF || !okM){
    $("#paramMsg").innerHTML = `<span class="danger">Seuils incohérents (doivent être croissants).</span>`;
return;
  }
  state.params = p;
  LS.set("params", state.params);
  $("#paramMsg").innerHTML = `<span class="ok">Paramètres enregistrés.</span>`;
}



function fillScoreSelect(id){
  const el = document.getElementById(id);
  if(!el) return;
el.innerHTML = [1,2,3,4,5].map(v=>`<option value="${v}">${v}</option>`).join("");
}
function initSettingsUI(){
  // score dropdowns
  ["vipRMin","vipFMin","vipMMin","newR","newF","potRMin","potMMin","potFMax","riskRMax","riskFMin","riskMMin","dormantFMax"]
    .forEach(fillScoreSelect);
const p = state.params || defaultParams();
  const setVal = (id, v)=>{
    const el = document.getElementById(id);
if(el) el.value = (v==null ? "" : String(v));
  };

  setVal("vipRMin", p.vipRMin ?? 4);
  setVal("vipFMin", p.vipFMin ?? 4);
setVal("vipMMin", p.vipMMin ?? 4);
  setVal("vipTfFragile", isFinite(p.vipTfFragile)? p.vipTfFragile : -0.20);

  setVal("tfWindow", p.tfWindow ?? 3);
  setVal("tfMode", p.tfMode ?? "ratio");
setVal("newR", p.newR ?? 5);
  setVal("newF", p.newF ?? 1);

  setVal("potRMin", p.potRMin ?? 4);
  setVal("potMMin", p.potMMin ?? 3);
  setVal("potFMax", p.potFMax ?? 3);
setVal("riskRMax", p.riskRMax ?? 2);
  setVal("riskFMin", p.riskFMin ?? 3);
  setVal("riskMMin", p.riskMMin ?? 3);
  setVal("riskMode", p.riskMode ?? "OR");

  setVal("dormantFMax", p.dormantFMax ?? 2);
setVal("dormantDaysMin", p.dormantDaysMin ?? 0);
}

function saveAllSegmentSettings(){
  const p = {...(state.params || defaultParams())};
const gi = (id, d=0)=>{
    const el = document.getElementById(id);
    const n = el ? parseInt(el.value,10) : d;
return isFinite(n) ? n : d;
  };
  const gf = (id, d=0)=>{
    const el = document.getElementById(id);
const n = el ? parseFloat(el.value) : d;
    return isFinite(n) ? n : d;
  };
const gs = (id, d="")=>{
    const el = document.getElementById(id);
    return (el && el.value!=null) ? String(el.value) : d;
};

  p.vipRMin = gi("vipRMin",4); p.vipFMin = gi("vipFMin",4); p.vipMMin = gi("vipMMin",4);
  p.vipTfFragile = gf("vipTfFragile",-0.20);

  p.tfWindow = gi("tfWindow",3);
  p.tfMode = (gs("tfMode","ratio")==="regress") ?
"regress" : "ratio";

  p.newR = gi("newR",5); p.newF = gi("newF",1);

  p.potRMin = gi("potRMin",4); p.potMMin = gi("potMMin",3); p.potFMax = gi("potFMax",3);
p.riskRMax = gi("riskRMax",2); p.riskFMin = gi("riskFMin",3); p.riskMMin = gi("riskMMin",3);
  p.riskMode = (gs("riskMode","OR")==="AND") ? "AND" : "OR";

  p.dormantFMax = gi("dormantFMax",2);
p.dormantDaysMin = Math.max(0, gi("dormantDaysMin",0));

  state.params = p;
  LS.set("params", state.params);

  const msg = document.getElementById("settingsMsg");
  if(msg) msg.innerHTML = `<span class="ok">Réglages enregistrés.</span>`;
}

function openSettings(){
  const ov = document.getElementById("segmentSettingsModal");
  if(!ov) return;
  initSettingsUI();
  ov.classList.remove("hidden");
  ov.style.display = "flex";
  ov.style.pointerEvents = "auto";
}
function closeSettings(){
  const ov = document.getElementById("segmentSettingsModal");
  if(ov) ov.style.display = "none";
}

function scoreRecency(days,p){
  if(days<=p.r5) return 5;
  if(days<=p.r4) return 4;
  if(days<=p.r3) return 3;
  if(days<=p.r2) return 2;
  return 1;
}
function scoreFrequency(f,p){
  if(f<=p.f1) return 1;
  if(f<=p.f2) return 2;
  if(f<=p.f3) return 3;
  if(f<=p.f4) return 4;
  return 5;
}
function scoreMonetary(m,p){
  if(m<=p.m1) return 1;
  if(m<=p.m2) return 2;
  if(m<=p.m3) return 3;
  if(m<=p.m4) return 4;
  return 5;
}
/** =========================
 * segmentation
 * ========================= */
function segment(r,f,m,tf,tfReliable,recencyDays,tenureMonths,ordersLifetime,vipShare){
  const p = state.params || {};
  const ordLife = Number.isFinite(+ordersLifetime) ? Math.max(0, Math.floor(+ordersLifetime)) : 0;
  const ten = Number.isFinite(+tenureMonths) ? Math.max(0, Math.floor(+tenureMonths)) : 0;
  const rec = Number.isFinite(+recencyDays) ? +recencyDays : null;

  // NOUVEAU : Nettoyage temporel
  if(rec !== null && rec >= 545) return "Perdus Historiques";
  if(rec !== null && rec >= 365) return "Perdus";

  const share = Number.isFinite(+vipShare) ? +vipShare : null;
  if(share !== null && share >= 0.07){
    const thr = Number.isFinite(+p.vipTfFragile) ? +p.vipTfFragile : -0.15;
    if(tfReliable === true && Number.isFinite(tf) && tf <= thr) return "VIP Fragiles";
    return "VIP Solides";
  }

  const vipRMin = Number.isFinite(+p.vipRMin) ? Math.floor(+p.vipRMin) : 4;
  const vipFMin = Number.isFinite(+p.vipFMin) ? Math.floor(+p.vipFMin) : 4;
  const vipMMin = Number.isFinite(+p.vipMMin) ? Math.floor(+p.vipMMin) : 4;

  if(r >= vipRMin && f >= vipFMin && m >= vipMMin){
    const thr = Number.isFinite(+p.vipTfFragile) ? +p.vipTfFragile : -0.15;
    if(tfReliable === true && Number.isFinite(tf) && tf <= thr) return "VIP Fragiles";
    return "VIP Solides";
  }

  let baseSegment = null;
  if(ten < 9) { baseSegment = "Nouveaux"; } 
  else {
    if(rec !== null && rec > 180){ baseSegment = "Occasionnels"; } 
    else if(ordLife <= 2){ baseSegment = "Occasionnels"; } 
    else if(f >= 3 && r >= 3){ baseSegment = "Réguliers"; } 
    else { baseSegment = "Potentiels"; }
  }

  const riskThr = -0.25; 
  const eligibleForRisk = (baseSegment === "Réguliers" || baseSegment === "Potentiels");
  if(eligibleForRisk && tfReliable === true && Number.isFinite(tf) && tf <= riskThr){ return "À risque"; }
  return baseSegment || "Occasionnels";
}

function stddev(arr){
  const a = (arr||[]).filter(isFinite);
  const n=a.length;
  if(n<=1) return 0;
const m = a.reduce((s,x)=>s+x,0)/n;
  let v=0; for(const x of a){ v += (x-m)*(x-m); }
  return Math.sqrt(v/(n-1));
}

function median(arr){
  const a = arr.slice().sort((x,y)=>x-y);
  if(!a.length) return NaN;
  const mid=Math.floor(a.length/2);
  return a.length%2 ? a[mid] : (a[mid-1]+a[mid])/2;
}

/**
 * Traduction JS de calculate_adjusted_velocity_trend (Python)
 * AVEC "VOLUME SAFETY NET" pour éviter les faux positifs (ex: Century21)
 * @param {Set} datesSet - Set de strings ISO 'YYYY-MM-DD'
 * @param {Date} refDateObj - Date de référence (asOf)
 */
/* =========================
 * Calendrier économique (Congés Agence) + Ajustement TF (Panier moyen)
 * - Activé par défaut (BTP : août + fin d'année)
 * - Au jour près, en UTC
 * ========================= */
const ECON_DAY_MS = 24*60*60*1000;

// Congés récurrents par défaut (modifs futures via backend)
const ECON_HOLIDAYS_DEFAULT = [
  // Août : 3 semaines
  { kind:"fixed", start:{m:8,d:1},  end:{m:8,d:21} }, // 01/08 -> 21/08 inclus
  // Fin d'année : 25/12 -> 02/01 (chevauche deux années)
  { kind:"cross", start:{m:12,d:25}, end:{m:1,d:2} }  // 25/12 -> 02/01 inclus
];

const ECON_HOLIDAYS_STORAGE_KEY = "novaxis_econ_holidays_v1";
let ECON_HOLIDAYS = _loadEcoHolidays();

function _loadEcoHolidays(){
  try{
    const raw = localStorage.getItem(ECON_HOLIDAYS_STORAGE_KEY);
    if(!raw) return JSON.parse(JSON.stringify(ECON_HOLIDAYS_DEFAULT));
    const arr = JSON.parse(raw);
    if(!Array.isArray(arr) || arr.length===0) return JSON.parse(JSON.stringify(ECON_HOLIDAYS_DEFAULT));
    return _sanitizeEcoHolidays(arr);
  }catch(e){
    return JSON.parse(JSON.stringify(ECON_HOLIDAYS_DEFAULT));
  }
}

function _sanitizeEcoHolidays(arr){
  const out = [];
  for(const h of arr){
    if(!h || !h.start || !h.end) continue;
    let sm = Math.max(1, Math.min(12, +h.start.m||0));
    let sd = Math.max(1, Math.min(31, +h.start.d||0));
    let em = Math.max(1, Math.min(12, +h.end.m||0));
    let ed = Math.max(1, Math.min(31, +h.end.d||0));
    const kind = (em < sm) ? "cross" : (h.kind === "cross" ? "cross" : "fixed");
    out.push({ kind, start:{m:sm,d:sd}, end:{m:em,d:ed} });
  }
  return out.length ? out : JSON.parse(JSON.stringify(ECON_HOLIDAYS_DEFAULT));
}


// TF panier (autonome par client)
const TF_BASKET_COEF_DOWN = 0.45; // plus punitif si baisse du panier moyen
const TF_BASKET_COEF_UP   = 0.15; // bonus limité si hausse du panier moyen
const TF_BASKET_MIN_INVOICES = 10;
const TF_BASKET_CAP_DOWN = -0.60;
const TF_BASKET_CAP_UP   = +0.25;

function _ecoClamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function _ecoUTCDate(y, m, d){ return new Date(Date.UTC(y, (m-1), d)); }

// Retourne le nombre de jours de congés (au jour près) dans l'intervalle [a,b) (dates UTC midnight)
function _ecoHolidayDaysBetween(aDate, bDate){
  try{
    const aMs = (aDate instanceof Date) ? aDate.getTime() : new Date(aDate).getTime();
    const bMs = (bDate instanceof Date) ? bDate.getTime() : new Date(bDate).getTime();
    if(!(isFinite(aMs) && isFinite(bMs)) || bMs <= aMs) return 0;

    const y1 = new Date(aMs).getUTCFullYear();
    const y2 = new Date(bMs - 1).getUTCFullYear(); // -1ms pour inclure l'année si b tombe pile au 01/01
    let days = 0;

    for(let y = y1; y <= y2; y++){
      for(const h of ECON_HOLIDAYS){
        if(!h || !h.start || !h.end) continue;

        let hs, heExcl;
        if(h.kind === "cross"){
          hs = _ecoUTCDate(y, h.start.m, h.start.d);
          // fin en année suivante
          const yEnd = (h.end.m < h.start.m) ? (y + 1) : y;
          const heIncl = _ecoUTCDate(yEnd, h.end.m, h.end.d);
          heExcl = new Date(heIncl.getTime() + ECON_DAY_MS); // inclusif -> exclusif
        }else{
          hs = _ecoUTCDate(y, h.start.m, h.start.d);
          const heIncl = _ecoUTCDate(y, h.end.m, h.end.d);
          heExcl = new Date(heIncl.getTime() + ECON_DAY_MS);
        }

        const s = hs.getTime();
        const e = heExcl.getTime();
        // overlap [aMs,bMs) ∩ [s,e)
        const o = Math.max(0, Math.min(bMs, e) - Math.max(aMs, s));
        if(o > 0) days += (o / ECON_DAY_MS);
      }
    }

    return Math.max(0, days);
  }catch(e){
    return 0;
  }
}

function _ecoDaysBetweenDates(aDate, bDate){
  try{
    if(!(aDate instanceof Date) || !(bDate instanceof Date)) return 0;
    const aMs = aDate.getTime(), bMs = bDate.getTime();
    if(!(isFinite(aMs) && isFinite(bMs)) || bMs <= aMs) return 0;

    const total = (bMs - aMs) / ECON_DAY_MS;
    const off = _ecoHolidayDaysBetween(aDate, bDate);
    return Math.max(0, total - off);
  }catch(e){
    return 0;
  }
}

function _ecoDaysBetweenISO(aISO, bISO){
  try{
    if(!aISO || !bISO) return 0;
    const a = new Date(aISO + "T00:00:00Z");
    const b = new Date(bISO + "T00:00:00Z");
    return _ecoDaysBetweenDates(a,b);
  }catch(e){
    return 0;
  }
}


function calculateAdjustedVelocityTrend(datesSet, refDateObj) {
  // 1. Prep
  if (!datesSet || datesSet.size < 3) return { tf: null, details: "Pas assez de data (<3 dates)" };

  // Conversion en objets Date et tri
  let dates = Array.from(datesSet)
    .map(d => new Date(d + "T00:00:00Z"))
    .filter(d => d <= refDateObj)
    .sort((a, b) => a - b);

  if (dates.length < 3) return { tf: null, details: "Pas assez d'historique" };

  // --- PARTIE 1 : VÉLOCITÉ (Algorithme Python d'origine) ---
  const ipts = [];
  for (let i = 1; i < dates.length; i++) {
    const diffTime = Math.max(0, dates[i] - dates[i - 1]); // Sécurité vs dates négatives
    const diffDays = _ecoDaysBetweenDates(dates[i - 1], dates[i]);
    ipts.push(diffDays);
  }

  const totalIntervals = ipts.length;
  let nRecent = Math.floor(totalIntervals * 0.2);
  nRecent = Math.max(3, Math.min(20, nRecent));

  let histIpts, recIpts;
  if (totalIntervals < 6) {
    const mid = Math.floor(totalIntervals / 2);
    histIpts = ipts.slice(0, mid);
    recIpts = ipts.slice(mid);
  } else {
    histIpts = ipts.slice(0, totalIntervals - nRecent);
    recIpts = ipts.slice(totalIntervals - nRecent);
  }

  if (histIpts.length === 0) return { tf: null, details: "Historique vide" };
  const sumHist = histIpts.reduce((a, b) => a + b, 0);
  const avgHistSpeed = sumHist / histIpts.length;

  const lastDate = dates[dates.length - 1];
  const silenceMs = Math.max(0, refDateObj - lastDate);
  const currentSilence = _ecoDaysBetweenDates(lastDate, refDateObj);

  const sumRec = recIpts.reduce((a, b) => a + b, 0);
  const adjRecentSpeed = (sumRec + currentSilence) / (recIpts.length + 1);

  if (adjRecentSpeed === 0) return { tf: 0.0, details: "Vitesse infinie" };
  
  // Score de vélocité "pur"
  let trendScore = (avgHistSpeed / adjRecentSpeed) - 1;
  let details = "";

  // --- PARTIE 2 : SAFETY NET (Le Correctif Century21) ---
  // On vérifie si le VOLUME s'effondre. Si oui, la vélocité ment.
  
  const msOneYear = 365.25 * 24 * 60 * 60 * 1000;
  const limitY1 = refDateObj.getTime() - msOneYear;       // Il y a 1 an
  const limitY2 = refDateObj.getTime() - (2 * msOneYear); // Il y a 2 ans

  let countLast12m = 0;
  let countPrev12m = 0;

  for (let d of dates) {
    const t = d.getTime();
    if (t > limitY1) {
      countLast12m++;
    } else if (t > limitY2) {
      countPrev12m++;
    }
  }

  // On applique le filet de sécurité seulement si on a de l'historique en N-1
  if (countPrev12m > 0) {
    // Calcul de la tendance volume (ex: 8 vs 14 => -0.42 soit -42%)
    const volTrend = (countLast12m - countPrev12m) / countPrev12m;

    // SEUIL D'ALERTE : Si le volume baisse de plus de 25% (-0.25)
    if (volTrend < -0.25) {
      // Cas Century21 : Vélocité (+0.16) mais Volume (-0.42).
      // On force la TF à prendre la valeur du Volume si celle-ci est pire que la vélocité.
      if (volTrend < trendScore) {
        trendScore = volTrend; 
        // On ajoute un flag "vol" dans le détail pour comprendre pourquoi
        details = "Correction Volume"; 
      }
    }
  }

  return { tf: trendScore, details: details };
}

/** =========================
 * calculs RFM/TF/TD/prévision
 * ========================= */

function updateData(){
  // Pipeline de rendu centralisée (sécurité : on ne touche pas au moteur de calcul)
  renderDash();
  renderActions();
  renderPilotage(); // legacy: vue ALFRED
  renderTable();
  updateExportTag();
  try{ bindDomSortableTables(); }catch(e){}
  try{ bindDomSortableTables(); }catch(e){}
  renderParamKpis();

  // Hooks isolés (sécurité IA)
  renderPilotageCo();
  renderALFRED();
}


// =====================================================
// Cache canonique (compute once, render many)
// Construit des agrégats réutilisables (Direction / Horizon / Cockpit)
// =====================================================
function __buildCanonicalCache(){
  const tx = state.tx || [];
  const txByClient = new Map();
  const monthlyByClient = new Map();
  const portfolioMonthly = new Map();
  const monthsSet = new Set();

  // Global tx sorted + prefix sums for O(log n) portfolio sums between dates
  const txSorted = [];
  for(const t of tx){
    if(!t || !t.dateISO || !isFinite(t.amountHT)) continue;
    txSorted.push(t);
  }
  txSorted.sort((a,b)=> String(a.dateISO||"").localeCompare(String(b.dateISO||"")));

  const prefixSum = new Float64Array(txSorted.length + 1);
  for(let i=0;i<txSorted.length;i++){
    prefixSum[i+1] = prefixSum[i] + Number(txSorted[i].amountHT||0);
  }

  for(const t of tx){
    if(!t || !t.clientCanon || !t.dateISO || !isFinite(t.amountHT)) continue;
    const c = t.clientCanon;
    if(!txByClient.has(c)) txByClient.set(c, []);
    txByClient.get(c).push(t);

    const mk = t.dateISO.slice(0,7);
    monthsSet.add(mk);

    if(!monthlyByClient.has(c)) monthlyByClient.set(c, new Map());
    const mm = monthlyByClient.get(c);
    if(!mm.has(mk)) mm.set(mk, {sumHT:0, cnt:0});
    const cell = mm.get(mk);
    cell.sumHT += t.amountHT;
    cell.cnt += 1;

    if(!portfolioMonthly.has(mk)) portfolioMonthly.set(mk, {sumHT:0, cnt:0});
    const pc = portfolioMonthly.get(mk);
    pc.sumHT += t.amountHT;
    pc.cnt += 1;
  }

  // sort per-client tx lists (utile cockpit) — dateISO is ISO string so lexicographic OK
  for(const arr of txByClient.values()){
    arr.sort((a,b)=> String(a.dateISO||"").localeCompare(String(b.dateISO||"")));
  }

  const monthsOrdered = Array.from(monthsSet).sort();

  state.cache = {
    txByClient,
    monthlyByClient,
    portfolioMonthly,
    monthsOrdered,
    txSorted,
    prefixSum,
    txCount: tx.length,
    datasetHash: (state.meta && state.meta.datasetHash) ? state.meta.datasetHash : null,
    builtAt: Date.now()
  };
}

function __cacheSumBetweenDates(sISO, eISO){
  const c = state.cache;
  if(!c || !c.txSorted || !c.prefixSum) return null;
  if(!sISO || !eISO || sISO > eISO) return 0;

  const arr = c.txSorted;
  const ps = c.prefixSum;

  const lb = (x)=>{
    let lo=0, hi=arr.length;
    while(lo<hi){
      const mid=(lo+hi)>>1;
      const d = String(arr[mid].dateISO||"");
      if(d < x) lo = mid+1; else hi = mid;
    }
    return lo;
  };
  const ub = (x)=>{
    let lo=0, hi=arr.length;
    while(lo<hi){
      const mid=(lo+hi)>>1;
      const d = String(arr[mid].dateISO||"");
      if(d <= x) lo = mid+1; else hi = mid;
    }
    return lo;
  };

  const i = lb(sISO);
  const j = ub(eISO);
  return ps[j] - ps[i];
}


// ============================================================================
// ALFRED — TIMEBOX (Source de vérité temporelle)
// Conventions :
// - Mois calendaires complets par défaut
// - MTD uniquement si un module le demande explicitement (ex: PilotageCo CA M)
// ============================================================================
window.__icBuildTimebox = function(asOfISO){
  try{
    const pad2 = (n)=>String(n).padStart(2,'0');
    const monthKey = (iso)=> (iso && iso.length>=7) ? iso.slice(0,7) : "";
    const addMonthsKey = (ym, delta)=>{
      if(!ym || ym.length<7) return "";
      let y = parseInt(ym.slice(0,4),10);
      let m = parseInt(ym.slice(5,7),10)-1;
      if(!Number.isFinite(y)||!Number.isFinite(m)) return "";
      m += (parseInt(delta,10)||0);
      y += Math.floor(m/12);
      m = ((m%12)+12)%12;
      return `${y}-${pad2(m+1)}`;
    };
    const utcDate = (y,m,d)=> new Date(Date.UTC(y,m,d,0,0,0,0));
    const utcEndOfDay = (y,m,d)=> new Date(Date.UTC(y,m,d,23,59,59,999));
    const lastDayOfMonthUTC = (y,m)=> new Date(Date.UTC(y, m+1, 0)).getUTCDate();
    const safeDay = (y,m,d)=>{
      const ld = lastDayOfMonthUTC(y,m);
      return Math.min(Math.max(1, d), ld);
    };

    const todayISO = new Date().toISOString().slice(0,10);
    const qMaxISO = (state.quality && state.quality.maxDate) ? state.quality.maxDate : null;
    let aISO = String(asOfISO || (state.params && state.params.asOfDate) || (state.periodWindow && state.periodWindow.asOfISO) || qMaxISO || todayISO).slice(0,10);
    if(qMaxISO && aISO > qMaxISO) aISO = qMaxISO;

    const a = new Date(aISO + "T00:00:00Z");
    const y = a.getUTCFullYear();
    const m = a.getUTCMonth();
    const d = a.getUTCDate();

    const M = monthKey(aISO);
    const M_start = utcDate(y,m,1);
    const M_end_mtd = utcEndOfDay(y,m,d);
    const M_end_full = utcEndOfDay(y,m,lastDayOfMonthUTC(y,m));

    const isLastDay = (d === lastDayOfMonthUTC(y,m));
    const lastCompleteMonthKey = isLastDay ? M : addMonthsKey(M, -1);

    const M_1 = addMonthsKey(M, -1);
    const m1y = (m-1<0) ? (y-1) : y;
    const m1m = (m-1<0) ? (m+11) : (m-1);
    const M_1_start = utcDate(m1y, m1m, 1);
    const M_1_end = utcEndOfDay(m1y, m1m, lastDayOfMonthUTC(m1y, m1m));

    const M_2 = addMonthsKey(M, -2);
    const M_3 = addMonthsKey(M, -3);

    const N_1 = `${y-1}-${pad2(m+1)}`;
    const N_1_start = utcDate(y-1, m, 1);
    const N_1_end_full = utcEndOfDay(y-1, m, lastDayOfMonthUTC(y-1, m));
    const N_1_end_mtd = utcEndOfDay(y-1, m, safeDay(y-1, m, d));

    // Rolling 12 mois (mois complets) : ancré sur le dernier mois complet
    const R12_endKey = lastCompleteMonthKey;
    const R12_startKey = addMonthsKey(R12_endKey, -11);
    const r12y = parseInt(R12_endKey.slice(0,4),10);
    const r12m = parseInt(R12_endKey.slice(5,7),10)-1;
    const R12_start = utcDate(parseInt(R12_startKey.slice(0,4),10), parseInt(R12_startKey.slice(5,7),10)-1, 1);
    const R12_end = utcEndOfDay(r12y, r12m, lastDayOfMonthUTC(r12y, r12m));

    // Années (bornes calendaires)
    const YEAR_N_start = utcDate(y, 0, 1);
    const YEAR_N_end_full = utcEndOfDay(y, 11, 31);
    const YEAR_N_end_ytd = utcEndOfDay(y, m, d);

    const YEAR_N_1_start = utcDate(y-1, 0, 1);
    const YEAR_N_1_end_full = utcEndOfDay(y-1, 11, 31);
    const YEAR_N_1_end_ytd = utcEndOfDay(y-1, m, safeDay(y-1, m, d));

    return {
      asOfISO: aISO,

      // clés (mois)
      M, M_1, M_2, M_3, N_1,
      lastCompleteMonthKey,

      // bornes (Date objets UTC)
      M_start, M_end_mtd, M_end_full,
      M_1_start, M_1_end,
      N_1_start, N_1_end_full, N_1_end_mtd,

      ROLLING_12: { startKey: R12_startKey, endKey: R12_endKey, start: R12_start, end: R12_end },

      YEAR_N:   { start: YEAR_N_start,   end_full: YEAR_N_end_full,   end_ytd: YEAR_N_end_ytd },
      YEAR_N_1: { start: YEAR_N_1_start, end_full: YEAR_N_1_end_full, end_ytd: YEAR_N_1_end_ytd }
   
,
      // Fenêtre d'analyse (minISO → asOfISO) : alignée sur recalcAll (periodMonths / ALL)
      ANALYSIS: (function(){
        try{
          const p = (state && state.params) ? state.params : {};
          const qMinISO = (state && state.quality) ? state.quality.minDate : null;
          let minISO = "";
          if(p && String(p.periodMonths||"").toUpperCase()==="ALL"){
            minISO = qMinISO ? String(qMinISO).slice(0,10) : "1900-01-01";
          }else{
            const months = parseInt(p && p.periodMonths,10) || 12;
            const periodDays = Math.round((months/12)*365.25);
            const minD = new Date(a.getTime() - periodDays*24*3600*1000);
            minISO = minD.toISOString().slice(0,10);
          }
          const minD2 = new Date(minISO + "T00:00:00Z");
          return { minISO, asOfISO:aISO, minUTC:minD2, asOfUTC:a };
        }catch(e){
          return { minISO:"", asOfISO:aISO, minUTC:null, asOfUTC:a };
        }
      })()

    };

  }catch(e){
    return { asOfISO: (asOfISO || new Date().toISOString().slice(0,10)) };
  }
};

window.__icGetTimebox = function(){
  try{
    const asOfISO = (typeof window.__hzGetAsOfISO === "function") ? window.__hzGetAsOfISO() : null;
    const tb = window.__icBuildTimebox(asOfISO);
    state.timebox = tb;
    return tb;
  }catch(e){
    return (state.timebox || { asOfISO: new Date().toISOString().slice(0,10) });
  }
};


/* =========================================================
   A5 — API PÉRIODES STANDARD (source: state.timebox)
   - getPeriod(code, opts)
   - sumCachePeriod(clientName|null, code, opts)
   Notes:
   - Par défaut, périodes = calendaires complètes (pas de MTD)
   - MTD uniquement si opts.mode==="mtd" (scanne state.periodTx, pas state.tx)
========================================================= */
(function(){
  const pad2 = (n)=>String(n).padStart(2,'0');

  const lastDayOfMonthUTC = (y,m)=> new Date(Date.UTC(y, m+1, 0)).getUTCDate();
  const utcDate = (y,m,d)=> new Date(Date.UTC(y,m,d,0,0,0));
  const utcEndOfDay = (y,m,d)=> new Date(Date.UTC(y,m,d,23,59,59,999));

  const addMonthsKey = (ym, delta)=>{
    if(!ym || ym.length<7) return "";
    let y = parseInt(ym.slice(0,4),10);
    let m = parseInt(ym.slice(5,7),10)-1;
    if(!Number.isFinite(y)||!Number.isFinite(m)) return "";
    m += (parseInt(delta||0,10)||0);
    y += Math.floor(m/12);
    m = ((m%12)+12)%12;
    return `${y}-${pad2(m+1)}`;
  };

  const boundsFromMonthKey = (mk)=>{
    if(!mk || mk.length<7) return {startUTC:null,endUTC:null};
    const y = parseInt(mk.slice(0,4),10);
    const m = parseInt(mk.slice(5,7),10)-1;
    if(!Number.isFinite(y)||!Number.isFinite(m)) return {startUTC:null,endUTC:null};
    const startUTC = utcDate(y,m,1);
    const endUTC = utcEndOfDay(y,m,lastDayOfMonthUTC(y,m));
    return {startUTC,endUTC};
  };

  const _tb = ()=>{
    try{
      if(state && state.timebox && state.timebox.asOfISO) return state.timebox;
      if(typeof window.__icGetTimebox === "function") return window.__icGetTimebox();
    }catch(e){}
    return (state && state.timebox) ? state.timebox : { asOfISO: new Date().toISOString().slice(0,10) };
  };

  window.getPeriod = function(code, opts){
    try{
      const tb = _tb();
      const c = String(code||"").toUpperCase();
      const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "";

      if(c==="M"){
        return {
          key: tb.M || "",
          label: (mode==="mtd") ? "M (MTD)" : "M",
          startUTC: tb.M_start || null,
          endUTC: (mode==="mtd") ? (tb.M_end_mtd||null) : (tb.M_end_full||null),
          startKey: tb.M || "",
          endKey: tb.M || ""
        };
      }
      if(c==="M_1"){
        return {
          key: tb.M_1 || "",
          label: "M-1",
          startUTC: tb.M_1_start || null,
          endUTC: tb.M_1_end || null,
          startKey: tb.M_1 || "",
          endKey: tb.M_1 || ""
        };
      }
      if(c==="M_2" || c==="M_3"){
        const mk = tb[c] || addMonthsKey(tb.M||"", (c==="M_2"?-2:-3));
        const b = boundsFromMonthKey(mk);
        return { key: mk, label: (c==="M_2"?"M-2":"M-3"), startUTC: b.startUTC, endUTC: b.endUTC, startKey: mk, endKey: mk };
      }

      if(c==="N_1"){
        return {
          key: tb.N_1 || "",
          label: (mode==="mtd") ? "N-1 (MTD)" : "N-1",
          startUTC: tb.N_1_start || null,
          endUTC: (mode==="mtd") ? (tb.N_1_end_mtd||null) : (tb.N_1_end_full||null),
          startKey: tb.N_1 || "",
          endKey: tb.N_1 || ""
        };
      }

      if(c==="ROLLING_12" || c==="R12"){
        const r = tb.ROLLING_12 || {};
        return {
          key: `${r.startKey||""}→${r.endKey||""}`,
          label: "12M glissants",
          startUTC: r.start || null,
          endUTC: r.end || null,
          startKey: r.startKey || "",
          endKey: r.endKey || ""
        };
      }

      if(c==="YEAR_N"){
        const y = tb.YEAR_N || {};
        return {
          key: (tb.asOfISO||"").slice(0,4),
          label: (mode==="ytd") ? "Année N (YTD)" : "Année N",
          startUTC: y.start || null,
          endUTC: (mode==="ytd") ? (y.end_ytd||null) : (y.end_full||null)
        };
      }
      if(c==="YEAR_N_1"){
        const y = tb.YEAR_N_1 || {};
        return {
          key: String((parseInt((tb.asOfISO||"").slice(0,4),10)||0)-1),
          label: (mode==="ytd") ? "Année N-1 (YTD)" : "Année N-1",
          startUTC: y.start || null,
          endUTC: (mode==="ytd") ? (y.end_ytd||null) : (y.end_full||null)
        };
      }

      return null;
    }catch(e){
      return null;
    }
  };

  // Somme via cache mensuel (full months) ; MTD = scan state.periodTx (pas state.tx)
  window.sumCachePeriod = function(clientName, code, opts){
    try{
      const p = window.getPeriod(code, opts) || null;
      if(!p) return {sum:0, any:false};

      const wantMTD = (opts && String(opts.mode||"").toLowerCase()==="mtd") || (String(code||"").toUpperCase()==="M" && (opts && opts.mode==="mtd"));
      const wantYear = (String(code||"").toUpperCase().startsWith("YEAR"));

      const __cache = (state && state.cache) ? state.cache : null;
      const __mbc = (__cache && (__cache.monthlyByClient instanceof Map)) ? __cache.monthlyByClient : null;
      const __pm = (__cache && (__cache.portfolioMonthly instanceof Map)) ? __cache.portfolioMonthly : null;

      const nm = (clientName==null) ? null : String(clientName).trim();

      // MTD: pas en cache => scan periodTx uniquement (déjà filtré)
      if(wantMTD && !wantYear){
        const txs = (state && Array.isArray(state.periodTx)) ? state.periodTx : (state && Array.isArray(state.tx) ? state.tx : []);
        if(!p.startUTC || !p.endUTC) return {sum:0, any:false};
        let sum=0, any=false;
        for(const t of txs){
          if(!t || !t.dateISO) continue;
          if(nm){
            const tn = (t.clientCanon!=null ? String(t.clientCanon) : (t.clientNorm!=null ? String(t.clientNorm) : "")).trim();
            if(!tn || tn !== nm) continue;
          }
          const d = new Date(t.dateISO + "T00:00:00Z");
          if(d>=p.startUTC && d<=p.endUTC){
            const a = Number(t.amountHT||0);
            if(Number.isFinite(a)){
              sum += a;
              any = true;
            }
          }
        }
        return {sum, any};
      }

      // YEAR_* : on somme par mois via cache (12 clés)
      if(wantYear){
        if(!p.startUTC || !p.endUTC) return {sum:0, any:false};
        const y0 = p.startUTC.getUTCFullYear();
        const m0 = p.startUTC.getUTCMonth();
        const y1 = p.endUTC.getUTCFullYear();
        const m1 = p.endUTC.getUTCMonth();
        let mkStart = `${y0}-${pad2(m0+1)}`;
        const mkEnd = `${y1}-${pad2(m1+1)}`;
        let mk = mkStart;
        let sum=0, any=false;
        const maxIter = 60;
        for(let i=0;i<maxIter;i++){
          if(!mk) break;
          if(nm){
            const mm = __mbc ? __mbc.get(nm) : null;
            const cell = (mm && mm.get) ? mm.get(mk) : null;
            if(cell && Number.isFinite(cell.sumHT)){
              sum += cell.sumHT;
              any = any || (Number(cell.cnt||0)>0) || (cell.sumHT!==0);
            }
          }else{
            const cell = __pm ? __pm.get(mk) : null;
            if(cell && Number.isFinite(cell.sumHT)){
              sum += cell.sumHT;
              any = any || (Number(cell.cnt||0)>0) || (cell.sumHT!==0);
            }
          }
          if(mk===mkEnd) break;
          mk = addMonthsKey(mk, 1);
        }
        return {sum, any};
      }

      // Full months: M_1/M_2/M_3/N_1, Rolling12
      const startKey = p.startKey || p.key || "";
      const endKey = p.endKey || p.key || "";
      if(!startKey) return {sum:0, any:false};

      let sum=0, any=false;
      if(endKey && endKey !== startKey){
        // range (Rolling 12)
        let mk = startKey;
        const maxIter = 120;
        for(let i=0;i<maxIter;i++){
          if(!mk) break;
          if(nm){
            const mm = __mbc ? __mbc.get(nm) : null;
            const cell = (mm && mm.get) ? mm.get(mk) : null;
            if(cell && Number.isFinite(cell.sumHT)){
              sum += cell.sumHT;
              any = any || (Number(cell.cnt||0)>0) || (cell.sumHT!==0);
            }
          }else{
            const cell = __pm ? __pm.get(mk) : null;
            if(cell && Number.isFinite(cell.sumHT)){
              sum += cell.sumHT;
              any = any || (Number(cell.cnt||0)>0) || (cell.sumHT!==0);
            }
          }
          if(mk===endKey) break;
          mk = addMonthsKey(mk, 1);
        }
        return {sum, any};
      }else{
        // single month
        const mk = startKey;
        if(nm){
          const mm = __mbc ? __mbc.get(nm) : null;
          const cell = (mm && mm.get) ? mm.get(mk) : null;
          if(cell && Number.isFinite(cell.sumHT)){
            sum = cell.sumHT;
            any = (Number(cell.cnt||0)>0) || (cell.sumHT!==0);
          }
        }else{
          const cell = __pm ? __pm.get(mk) : null;
          if(cell && Number.isFinite(cell.sumHT)){
            sum = cell.sumHT;
            any = (Number(cell.cnt||0)>0) || (cell.sumHT!==0);
          }
        }
        return {sum, any};
      }
    }catch(e){
      return {sum:0, any:false};
    }
  };
})();

/* =========================================================
   B5 — FORECAST / OBJECTIFS — BASE CANONIQUE (HORIZON)
   Objectif : Horizon ne recalcule plus ses bases à partir de state.tx.
   Source : state.cache.monthlyByClient / state.cache.portfolioMonthly + timebox.
   Retour compatible avec l'ancien moteur __hzComputeM1Bases :
   - refByName / extrapByName / detailsByName / availableMonths
   - lastCompleteMonthKey / refMonthKey / targetMonthKey
========================================================= */
;(function(){
  const _pad2 = (n)=>String(n).padStart(2,'0');
  const _addMonthsKey = (ym, delta)=>{
    if(!ym || ym.length<7) return "";
    let y = parseInt(ym.slice(0,4),10);
    let m = parseInt(ym.slice(5,7),10)-1;
    if(!Number.isFinite(y)||!Number.isFinite(m)) return "";
    m += (parseInt(delta||0,10)||0);
    y += Math.floor(m/12);
    m = ((m%12)+12)%12;
    return `${y}-${_pad2(m+1)}`;
  };
  const _subM = (mk, n)=> _addMonthsKey(mk, -(parseInt(n||0,10)||0));

  const _safeName = (c)=>{
    const nm0 = (c && (c.name!=null ? c.name : (c.clientCanon!=null ? c.clientCanon : (c.clientNorm!=null ? c.clientNorm : (c.client!=null ? c.client : ""))))) || "";
    return String(nm0).trim();
  };

  const _cellSum = (mm, mk)=>{
    try{
      if(!mm || !mk) return {sum:0,cnt:0,any:false};
      const cell = (mm instanceof Map) ? mm.get(mk) : mm[mk];
      if(!cell) return {sum:0,cnt:0,any:false};
      const sum = Number(cell.sumHT||0);
      const cnt = Number(cell.cnt||0);
      return {sum: (Number.isFinite(sum)?sum:0), cnt:(Number.isFinite(cnt)?cnt:0), any: (Number.isFinite(sum) && sum!==0) || (Number.isFinite(cnt) && cnt>0)};
    }catch(e){
      return {sum:0,cnt:0,any:false};
    }
  };

  window.__icComputeHorizonBases = function(asOfISO, clients, preferredRefMonthKey){
    try{
      const tb = (typeof window.__icGetTimebox==="function") ? window.__icGetTimebox() : (state.timebox||null);
      const lastCompleteMonthKey = (tb && tb.lastCompleteMonthKey) ? tb.lastCompleteMonthKey : ((tb && tb.M_1) ? tb.M_1 : "");
      const c = state.cache || {};
      const monthsOrdered = Array.isArray(c.monthsOrdered) ? c.monthsOrdered.slice() : [];
      const mbc = c.monthlyByClient || null;

      // Mois dispo <= mois de la DateRF (M), pour permettre un mois en cours (MTD) dans Horizon
      const mkAsOf = (tb && tb.M) ? tb.M : (asOfISO ? String(asOfISO).slice(0,7) : "");
      const capMonthKey = mkAsOf || lastCompleteMonthKey || "";

      let availableMonths = monthsOrdered.filter(mk=> mk && (!capMonthKey || mk <= capMonthKey));
      if(!availableMonths.length && capMonthKey) availableMonths = [capMonthKey];

      const lastObservedMonthKey = (availableMonths && availableMonths.length) ? availableMonths[availableMonths.length-1] : "";

      const refMonthKey = (preferredRefMonthKey && availableMonths.includes(preferredRefMonthKey))
        ? preferredRefMonthKey
        : (mkAsOf || lastObservedMonthKey || lastCompleteMonthKey || "");

      const targetMonthKey = _addMonthsKey(refMonthKey, 1);

      const refByName = {};
      const extrapByName = {};
      const detailsByName = {};

      const mk1 = refMonthKey;
      const mk2 = _subM(refMonthKey, 1);
      const mk3 = _subM(refMonthKey, 2);

      for(const cc of (clients||[])){
        const nm = _safeName(cc);
        if(!nm) continue;

        const mm = (mbc && (mbc instanceof Map)) ? mbc.get(nm) : (mbc ? mbc[nm] : null);

        const r = _cellSum(mm, mk1);
        const a1 = _cellSum(mm, mk1);
        const a2 = _cellSum(mm, mk2);
        const a3 = _cellSum(mm, mk3);

        const sum3 = (a1.sum + a2.sum + a3.sum);
        const cnt3 = (a1.cnt + a2.cnt + a3.cnt);
        const months3 = 3;

        const extrap = sum3 / Math.max(1, months3);

        refByName[nm] = r.sum;
        extrapByName[nm] = (Number.isFinite(extrap) ? extrap : 0);

        detailsByName[nm] = {
          refMonthKey,
          refSum: r.sum,
          refCnt: r.cnt,
          extrapMode: "avg3",
          avg3Months: [mk1,mk2,mk3],
          avg3Sum: sum3,
          avg3Cnt: cnt3,
          extrapSum: (Number.isFinite(extrap)?extrap:0)
        };
      }

      return {
        refByName,
        extrapByName,
        detailsByName,
        availableMonths,
        lastCompleteMonthKey,
        lastObservedMonthKey,
        refMonthKey,
        targetMonthKey
      };
    }catch(e){
      return { refByName:{}, extrapByName:{}, detailsByName:{}, availableMonths:[], lastCompleteMonthKey:"", lastObservedMonthKey:"", refMonthKey:"", targetMonthKey:"" };
    }
  };
})(); 


/* =========================================================
   B2 — AGRÉGATIONS CANONIQUES (source: state.cache + getPeriod)
   - sumMetric(metric, periodCode, scope, clientName, opts)
   - avgMetric(metric, periodCode, scope, clientName, opts)
   - pctMetric(num, den)
   - countClients(periodCode, predicate)
   Notes:
   - Jamais de scan state.tx (sauf MTD via state.periodTx déjà filtré)
   - metric supportés: "caHT", "cnt", "basket", "freq", "monthlyAvg"
========================================================= */
(function(){
  const _safeStr = (v)=> String(v==null?"":v).trim();
  const _addMonthsKey = (ym, delta)=>{
    if(!ym || ym.length<7) return "";
    let y = parseInt(ym.slice(0,4),10);
    let m = parseInt(ym.slice(5,7),10)-1;
    if(!Number.isFinite(y)||!Number.isFinite(m)) return "";
    m += (parseInt(delta||0,10)||0);
    y += Math.floor(m/12);
    m = ((m%12)+12)%12;
    return `${y}-${String(m+1).padStart(2,'0')}`;
  };
  const _monthsBetweenInclusive = (startKey, endKey)=>{
    if(!startKey || !endKey || startKey.length<7 || endKey.length<7) return [];
    if(startKey > endKey) return [];
    const out = [];
    let cur = startKey;
    let guard = 0;
    while(cur && cur <= endKey && guard < 240){
      out.push(cur);
      cur = _addMonthsKey(cur, 1);
      guard++;
    }
    return out;
  };

  window.pctMetric = function(num, den){
    const a = Number(num);
    const b = Number(den);
    if(!Number.isFinite(a) || !Number.isFinite(b) || b<=0) return null;
    return a / b;
  };

  window.sumMetric = function(metric, periodCode, scope, clientName, opts){
    try{
      const m = String(metric||"caHT").trim().toLowerCase();
      const sc = String(scope||"portfolio").trim().toLowerCase();
      const isClient = (sc==="client");
      const name = isClient ? _safeStr(clientName) : "";

      // MTD : scan state.periodTx (déjà filtré) uniquement
      const p = (typeof window.getPeriod === "function") ? window.getPeriod(periodCode, opts) : null;
      if(!p) return {sum:0, any:false};

      if(String(p.label||"").toLowerCase().includes("mtd")){
        const txs = (state && Array.isArray(state.periodTx)) ? state.periodTx : [];
        let sum = 0, cnt = 0;
        for(const t of txs){
          if(!t || !t.dateISO) continue;
          if(isClient){
            const nm = _safeStr(t.clientCanon!=null ? t.clientCanon : (t.clientNorm!=null ? t.clientNorm : ""));
            if(!nm || nm !== name) continue;
          }
          const amt = Number(t.amountHT||0);
          if(Number.isFinite(amt)){ sum += amt; cnt++; }
        }
        if(m==="cnt") return {sum:cnt, any:cnt>0};
        return {sum:sum, any:cnt>0 || sum!==0};
      }

      const cache = state && state.cache ? state.cache : null;
      const mbc = cache && cache.monthlyByClient ? cache.monthlyByClient : null;
      const pm  = cache && cache.portfolioMonthly ? cache.portfolioMonthly : null;

      const startKey = p.startKey || p.key || "";
      const endKey = p.endKey || p.key || "";
      const months = _monthsBetweenInclusive(startKey, endKey);

      let sum = 0, cnt = 0, any = false;

      if(isClient){
        if(!mbc || !mbc.get || !name) return {sum:0, any:false};
        const mm = mbc.get(name);
        if(!mm || !mm.get) return {sum:0, any:false};
        for(const mk of months){
          const cell = mm.get(mk);
          if(!cell) continue;
          const vSum = Number(cell.sumHT||0);
          const vCnt = Number(cell.cnt||0);
          if(m==="cnt"){ if(Number.isFinite(vCnt)){ cnt += vCnt; if(vCnt>0) any=true; } }
          else { if(Number.isFinite(vSum)){ sum += vSum; if(vCnt>0 || vSum!==0) any=true; } }
        }
        return (m==="cnt") ? {sum:cnt, any} : {sum, any};
      }else{
        if(!pm || !pm.get) return {sum:0, any:false};
        for(const mk of months){
          const cell = pm.get(mk);
          if(!cell) continue;
          const vSum = Number(cell.sumHT||0);
          const vCnt = Number(cell.cnt||0);
          if(m==="cnt"){ if(Number.isFinite(vCnt)){ cnt += vCnt; if(vCnt>0) any=true; } }
          else { if(Number.isFinite(vSum)){ sum += vSum; if(vCnt>0 || vSum!==0) any=true; } }
        }
        return (m==="cnt") ? {sum:cnt, any} : {sum, any};
      }
    }catch(e){
      return {sum:0, any:false};
    }
  };

  window.avgMetric = function(metric, periodCode, scope, clientName, opts){
    try{
      const m = String(metric||"").trim().toLowerCase();
      const sc = String(scope||"portfolio").trim().toLowerCase();
      const isClient = (sc==="client");
      const name = isClient ? _safeStr(clientName) : "";

      const p = (typeof window.getPeriod === "function") ? window.getPeriod(periodCode, opts) : null;
      if(!p) return {avg:0, any:false};

      const ca = window.sumMetric("caHT", periodCode, sc, name, opts);
      const cnt = window.sumMetric("cnt", periodCode, sc, name, opts);

      if(m==="basket"){
        const den = Number(cnt.sum||0);
        const num = Number(ca.sum||0);
        if(!Number.isFinite(den) || den<=0) return {avg:0, any:false};
        return {avg: num/den, any:true};
      }

      if(m==="freq"){
        // fréquence = nb factures / nb mois (mois complets) ; en MTD, on renvoie cnt (info brute)
        const label = String(p.label||"").toLowerCase();
        if(label.includes("mtd")){
          return {avg: Number(cnt.sum||0), any: !!cnt.any};
        }
        const months = _monthsBetweenInclusive(p.startKey||"", p.endKey||"");
        const nMonths = Math.max(1, months.length||0);
        const v = Number(cnt.sum||0);
        if(!Number.isFinite(v)) return {avg:0, any:false};
        return {avg: v / nMonths, any: (v>0)};
      }

      if(m==="monthlyavg"){
        const label = String(p.label||"").toLowerCase();
        if(label.includes("mtd")){
          // MTD : pas de moyenne mensuelle pertinente
          return {avg: Number(ca.sum||0), any: !!ca.any};
        }
        const months = _monthsBetweenInclusive(p.startKey||"", p.endKey||"");
        const nMonths = Math.max(1, months.length||0);
        const v = Number(ca.sum||0);
        if(!Number.isFinite(v)) return {avg:0, any:false};
        return {avg: v / nMonths, any: (v!==0)};
      }

      // default: return CA
      return {avg: Number(ca.sum||0), any: !!ca.any};
    }catch(e){
      return {avg:0, any:false};
    }
  };

  window.countClients = function(periodCode, predicate){
    try{
      const arr = (state && Array.isArray(state.clients)) ? state.clients : [];
      if(!arr.length) return 0;
      const fn = (typeof predicate === "function") ? predicate : null;
      let n=0;
      for(const c of arr){
        if(!c || !c.name) continue;
        if(fn && !fn(c)) continue;
        // if a periodCode is provided, we can test activity using cache
        if(periodCode){
          const r = window.sumMetric("cnt", periodCode, "client", c.name);
          if(r && r.sum>0) n++;
        }else{
          n++;
        }
      }
      return n;
    }catch(e){
      return 0;
    }
  };
})();
;

/* =========================================================
   B1 — MOTEUR KPI UNIQUE (architecture)
   - computeKpis(periodCode, scope, clientName?, opts?)
   - cache: state.kpiCache
   Notes:
   - Priorité: lecture cache canonique (state.cache) + API périodes (getPeriod)
   - Aucune lecture de state.tx (MTD autorisé uniquement via state.periodTx)
========================================================= */
(function(){
  const _safeStr = (v)=> (v==null ? "" : String(v)).trim();
  const _modeKey = (opts)=> _safeStr(opts && opts.mode ? opts.mode : "");
  const _nowTB = ()=>{
    try{
      if(state && state.timebox && state.timebox.asOfISO) return state.timebox;
      if(typeof window.__icGetTimebox==="function") return window.__icGetTimebox();
    }catch(e){}
    return null;
  };

  const _addMonthsKey = (ym, delta)=>{
    if(!ym || ym.length<7) return "";
    let y = parseInt(ym.slice(0,4),10);
    let m = parseInt(ym.slice(5,7),10)-1;
    if(!Number.isFinite(y)||!Number.isFinite(m)) return "";
    m += (parseInt(delta||0,10)||0);
    y += Math.floor(m/12);
    m = ((m%12)+12)%12;
    return `${y}-${String(m+1).padStart(2,'0')}`;
  };

  const _monthsRange = (startKey, endKey)=>{
    const out = [];
    if(!startKey || !endKey || startKey.length<7 || endKey.length<7) return out;
    let mk = startKey;
    for(let i=0;i<240;i++){
      out.push(mk);
      if(mk === endKey) break;
      mk = _addMonthsKey(mk, 1);
      if(!mk) break;
    }
    return out;
  };

  const _sumFromMonthlyCache = (clientNameOrNull, periodCode, opts)=>{
    const p = (typeof window.getPeriod==="function") ? window.getPeriod(periodCode, opts) : null;
    if(!p) return {sum:0, cnt:0, any:false, period:null};

    // MTD autorisé uniquement via state.periodTx (jamais state.tx)
    const wantMTD = (opts && String(opts.mode||"").toLowerCase()==="mtd");
    if(wantMTD){
      try{
        const txs = (state && Array.isArray(state.periodTx)) ? state.periodTx : [];
        if(!txs.length || !p.startUTC || !p.endUTC) return {sum:0,cnt:0,any:false,period:p};

        let sum=0, cnt=0, any=false;
        const t0 = p.startUTC.getTime();
        const t1 = p.endUTC.getTime();
        for(const t of txs){
          if(!t || !t.dateISO) continue;
          const d = (typeof _parseISO==="function") ? _parseISO(t.dateISO) : new Date(t.dateISO);
          const tt = d instanceof Date ? d.getTime() : NaN;
          if(!Number.isFinite(tt) || tt<t0 || tt>t1) continue;

          if(clientNameOrNull){
            const nm = (t.clientCanon!=null ? String(t.clientCanon) : (t.clientNorm!=null ? String(t.clientNorm) : "")).trim();
            if(nm !== clientNameOrNull) continue;
          }
          const a = (t.amountHT!=null && isFinite(t.amountHT)) ? Number(t.amountHT) : 0;
          if(!a) continue;
          sum += a; cnt += 1; any = true;
        }
        return {sum, cnt, any, period:p};
      }catch(e){
        return {sum:0,cnt:0,any:false,period:p};
      }
    }

    const __cache = (state && state.cache) ? state.cache : null;
    const __mbc = (__cache && (__cache.monthlyByClient instanceof Map)) ? __cache.monthlyByClient : null;
    const __pm  = (__cache && (__cache.portfolioMonthly instanceof Map)) ? __cache.portfolioMonthly : null;

    if(!p.startKey || !p.endKey) return {sum:0,cnt:0,any:false,period:p};

    const months = _monthsRange(p.startKey, p.endKey);
    if(!months.length) return {sum:0,cnt:0,any:false,period:p};

    let sum = 0;
    let cnt = 0;
    let any = false;

    if(clientNameOrNull){
      if(!__mbc) return {sum:0,cnt:0,any:false,period:p};
      const mm = __mbc.get(clientNameOrNull);
      if(!mm) return {sum:0,cnt:0,any:false,period:p};
      for(const mk of months){
        const cell = mm.get(mk);
        if(!cell) continue;
        const v = (cell.sumHT!=null && isFinite(cell.sumHT)) ? Number(cell.sumHT) : 0;
        const c = (cell.cnt!=null && isFinite(cell.cnt)) ? Number(cell.cnt) : 0;
        if(v || c){ sum += v; cnt += c; any = true; }
      }
    }else{
      if(!__pm) return {sum:0,cnt:0,any:false,period:p};
      for(const mk of months){
        const cell = __pm.get(mk);
        if(!cell) continue;
        const v = (cell.sumHT!=null && isFinite(cell.sumHT)) ? Number(cell.sumHT) : 0;
        const c = (cell.cnt!=null && isFinite(cell.cnt)) ? Number(cell.cnt) : 0;
        if(v || c){ sum += v; cnt += c; any = true; }
      }
    }

    return {sum, cnt, any, period:p};
  };

  window.computeKpis = function(periodCode, scope, clientName, opts){
    try{
      const code = String(periodCode||"").trim() || "ROLLING_12";
      const sc = String(scope||"portfolio").trim().toLowerCase();
      const name = (sc==="client") ? _safeStr(clientName) : "";
      const mode = _modeKey(opts);

      const tb = _nowTB();
      const asOfISO = tb && tb.asOfISO ? tb.asOfISO : "";
      const dsHash = (state && state.meta && state.meta.datasetHash) ? String(state.meta.datasetHash) : "";

      if(!state.kpiCache) state.kpiCache = { meta:{}, data:{} };
      const meta = state.kpiCache.meta || {};
      const needReset = (meta.asOfISO !== asOfISO) || (meta.datasetHash !== dsHash);
      if(needReset){
        state.kpiCache = { meta:{ asOfISO, datasetHash: dsHash }, data:{} };
      }

      const k = `${code}|${sc}|${mode}|${name}`;
      if(state.kpiCache.data[k]) return state.kpiCache.data[k];

      const agg = _sumFromMonthlyCache((sc==="client")? name : null, code, opts);
      const p = agg.period || (typeof window.getPeriod==="function" ? window.getPeriod(code, opts) : null);

      const monthsCount = (p && p.startKey && p.endKey) ? _monthsRange(p.startKey, p.endKey).length : 0;

      const caHT = Number(agg.sum||0);
      const orders = Number(agg.cnt||0);
      const basket = (orders>0) ? (caHT / orders) : 0;
      const freqPerMonth = (monthsCount>0) ? (orders / monthsCount) : 0;
      const annualizedCA = (monthsCount>0) ? (caHT * (12 / monthsCount)) : caHT;

      const out = {
        periodCode: code,
        scope: sc,
        clientName: name || null,
        any: !!agg.any,
        monthsCount,
        caHT,
        orders,
        basket,
        freqPerMonth,
        annualizedCA,
        period: p || null
      };

      state.kpiCache.data[k] = out;
      return out;
    }catch(e){
      return {periodCode:String(periodCode||""), scope:String(scope||"portfolio"), clientName:clientName||null, any:false, monthsCount:0, caHT:0, orders:0, basket:0, freqPerMonth:0, annualizedCA:0, period:null};
    }
  };
})();
/* =========================================================
   B3 — MODÈLE CLIENT CANONIQUE (architecture)
   - buildClientMetrics(clients?, periodCodes?)
   - Injecte client.metrics[periodCode] = { caHT, orders, basket, freq, months }
   Notes:
   - Lecture cache canonique uniquement (state.cache.monthlyByClient)
   - Aucune lecture de state.tx (MTD non géré ici)
========================================================= */
;(function(){
  const _pad2 = (n)=> String(n).padStart(2,'0');
  const _addMonthsKey = (ym, delta)=>{
    if(!ym || ym.length<7) return "";
    let y = parseInt(ym.slice(0,4),10);
    let m = parseInt(ym.slice(5,7),10)-1;
    if(!Number.isFinite(y)||!Number.isFinite(m)) return "";
    m += (parseInt(delta||0,10)||0);
    y += Math.floor(m/12);
    m = ((m%12)+12)%12;
    return `${y}-${_pad2(m+1)}`;
  };
  const _monthsBetweenKeys = (a,b)=>{
    if(!a||!b||a.length<7||b.length<7) return 0;
    const ya=parseInt(a.slice(0,4),10), ma=parseInt(a.slice(5,7),10);
    const yb=parseInt(b.slice(0,4),10), mb=parseInt(b.slice(5,7),10);
    if(!Number.isFinite(ya)||!Number.isFinite(ma)||!Number.isFinite(yb)||!Number.isFinite(mb)) return 0;
    return (yb-ya)*12 + (mb-ma);
  };
  const _listMonthKeys = (startKey, endKey)=>{
    const out=[];
    if(!startKey||!endKey) return out;
    const n = _monthsBetweenKeys(startKey,endKey);
    if(n<0) return out;
    for(let i=0;i<=n;i++) out.push(_addMonthsKey(startKey,i));
    return out;
  };

  window.buildClientMetrics = function(clients, periodCodes){
    try{
      const arr = Array.isArray(clients) ? clients : (state && Array.isArray(state.clients) ? state.clients : []);
      if(!arr.length) return;
      const codes = Array.isArray(periodCodes) && periodCodes.length ? periodCodes
        : ["M","M_1","ROLLING_12","YEAR_N","YEAR_N_1"];
      const mByC = state && state.cache && state.cache.monthlyByClient ? state.cache.monthlyByClient : null;
      if(!mByC) {
        for(const c of arr){ if(c) c.metrics = c.metrics || {}; }
        return;
      }

      for(const c of arr){
        if(!c || !c.name) continue;
        const nm = String(c.name).trim();
        if(!nm) continue;

        const mm = mByC.get(nm);
        c.metrics = c.metrics || {};

        for(const codeRaw of codes){
          const code = String(codeRaw||"").toUpperCase();
          const p = (typeof window.getPeriod === "function") ? window.getPeriod(code) : null;
          if(!p || !p.startKey || !p.endKey){
            c.metrics[code] = { caHT:0, orders:0, basket:0, freq:0, months:0 };
            continue;
          }
          const keys = _listMonthKeys(p.startKey, p.endKey);
          const months = keys.length || 0;

          let sum=0, cnt=0;
          if(mm && mm.size){
            for(const mk of keys){
              const cell = mm.get(mk);
              if(cell){
                const v = Number(cell.sumHT||0);
                const k = parseInt(cell.cnt||0,10)||0;
                if(Number.isFinite(v)) sum += v;
                cnt += k;
              }
            }
          }

          const basket = (cnt>0) ? (sum/cnt) : 0;
          const freq = (months>0) ? (cnt/months) : 0;

          c.metrics[code] = {
            caHT: sum,
            orders: cnt,
            basket: basket,
            freq: freq,
            months: months
          };
        }
      }
    }catch(e){}
  };
;
(function(){
  function _isoToUTC(iso){
    try{
      if(!iso || typeof iso!=="string" || iso.length<10) return null;
      return new Date(iso.slice(0,10) + "T00:00:00Z");
    }catch(e){ return null; }
  }
  function _daysBetweenUTC(a,b){
    try{ return Math.round((b-a)/86400000); }catch(e){ return null; }
  }
  function _normSeg(seg){
    return (seg==null?"" : String(seg))
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  window.buildClientSegmentation = function(clients){
    try{
      const arr = Array.isArray(clients) ? clients : (state && Array.isArray(state.clients) ? state.clients : []);
      if(!arr.length) return;

      const tb = (state && state.timebox) ? state.timebox : null;
      const asOfISO = (tb && tb.asOfISO) ? tb.asOfISO
        : ((state && state.periodWindow && state.periodWindow.asOfISO) ? state.periodWindow.asOfISO
        : ((state && state.quality && state.quality.maxDate) ? state.quality.maxDate : (new Date().toISOString().slice(0,10))));

      const asOfD = _isoToUTC(asOfISO);

      for(const c of arr){
        if(!c) continue;

        // --- Canonical recencyDays (depuis dernière facture <= DateRF) ---
        try{
          const lastISO = (c.lastISO!=null ? String(c.lastISO) : (c.last!=null ? String(c.last) : "")) || "";
          const lastD = _isoToUTC(lastISO);
          const recDays = (asOfD && lastD) ? _daysBetweenUTC(lastD, asOfD) : null;
          if(recDays!=null && isFinite(recDays)){
            c.recencyDays = recDays;
            c.recCalDays = recDays; // compat (certaines vues lisent recCalDays)
          }
        }catch(e){}

        const seg = (c.segment!=null ? c.segment : (c.segmentation && c.segmentation.segment!=null ? c.segmentation.segment : null));
        const s = _normSeg(seg);

        // --- Status (structurel) ---
        let status = "Actif";
        if(s.includes("perdus historiques") || s.includes("perdu historiques") || s.includes("perduhistorique") || s.includes("perdushistorique")) status = "Perdus Historiques";
        else if(s.includes("perdus") || s.includes("perdu")) status = "Perdus";

        // Si un statut directionnel existe déjà, on le préserve en priorité
        try{
          const ds = (c.dirStatus!=null ? String(c.dirStatus) : "");
          if(ds) status = ds;
        }catch(e){}

        // --- Health (structurel) ---
        let health = "Neutre";
        try{
          if(typeof isHealthySeg === "function"){
            health = isHealthySeg(seg) ? "Sain" : "Sous surveillance";
          }else{
            if(s.includes("vip") || s.includes("regulier")) health = "Sain";
            else if(s.includes("risque") || s.includes("fragile")) health = "Sous surveillance";
            else if(status!=="Actif") health = "Perdu";
          }
        }catch(e){}

        const obj = (c.segmentation && typeof c.segmentation==="object") ? c.segmentation : {};
        obj.segment = seg;
        obj.status = status;
        obj.health = health;
        obj.asOfISO = asOfISO;
        c.segmentation = obj;

        // Raccourcis (sans casser l'existant)
        c.status = status;
        c.health = health;
      }
    }catch(e){}
  };
})();




})();




function recalcAll(){
  try{
  // Invalidation cache Direction (évite détails KPI obsolètes si la date/période change)
  if(!state.ui) state.ui = {};
  state.ui.dirCache = null; state.ui.dirCacheMeta = null;
  if(!state.tx.length){ updateData(); return;
}
  const p = state.params;
  // Date de référence : par défaut, on se cale sur la date max du fichier (pas "aujourd'hui"),
  // et on ne dépasse jamais la dernière date disponible (sinon on dilue artificiellement les moyennes).
const qMinISO = state.quality?.minDate;
  const qMaxISO = state.quality?.maxDate;
  const fallbackAsOfISO = (p.asOfDate || qMaxISO || new Date().toISOString().slice(0,10));
let asOf = new Date(fallbackAsOfISO + "T00:00:00Z");
  if(qMaxISO){
    const maxD = new Date(qMaxISO + "T00:00:00Z");
if(asOf > maxD) asOf = maxD;
  }

  // Timebox (source de vérité temporelle)
  try{
    const __asOfISO = asOf.toISOString().slice(0,10);
    state.timebox = (typeof window.__icBuildTimebox === 'function') ? window.__icBuildTimebox(__asOfISO) : { asOfISO: __asOfISO };
  }catch(e){}

  let minDate;
  // Fenêtre d'analyse (minDate → asOf) : source = state.timebox.ANALYSIS (A5)
  try{
    const an = state.timebox && state.timebox.ANALYSIS ? state.timebox.ANALYSIS : null;
    if(an && an.minISO){
      minDate = new Date(String(an.minISO).slice(0,10) + "T00:00:00Z");
    }else{
      throw new Error("No ANALYSIS");
    }
  }catch(e){
    // fallback (legacy) : conserve le comportement existant
    if(p.periodMonths === "ALL"){
      if(qMinISO) minDate = new Date(qMinISO + "T00:00:00Z");
      else minDate = new Date("1900-01-01T00:00:00Z");
    }else{
      const months = parseInt(p.periodMonths,10) || 12;
      const periodDays = Math.round((months/12)*365.25);
      minDate = new Date(asOf.getTime() - periodDays*24*3600*1000);
    }
  }
const filtered = state.tx.filter(t=>t.dateISO && isFinite(t.amountHT)).filter(t=>{
    const d=new Date(t.dateISO+"T00:00:00Z");
    return d>=minDate && d<=asOf;
  });
  // Base "période" (minDate → asOf) : utilisée pour les KPI "période" (ex: CA HT période)
  state.periodTx = filtered;
  state.periodWindow = { minISO: ((state.timebox && state.timebox.ANALYSIS && state.timebox.ANALYSIS.minISO) ? state.timebox.ANALYSIS.minISO : (minDate.toISOString().slice(0,10))), asOfISO: ((state.timebox && state.timebox.ANALYSIS && state.timebox.ANALYSIS.asOfISO) ? state.timebox.ANALYSIS.asOfISO : (asOf.toISOString().slice(0,10))) };

// Base TF / ancienneté : on utilise tout l’historique jusqu’à la date de référence (pas limité à la période d’analyse)
  const tfTx = state.tx.filter(t=>t.dateISO && isFinite(t.amountHT)).filter(t=>{
    const d=new Date(t.dateISO+"T00:00:00Z");
    return d<=asOf;
  });
// === Lifetime stats (pour segmentation : ancienneté, one-shot, perdus) ===
const lifeMap = new Map();
// key -> {first,last,orders}
for(const t of state.tx){
  if(!t.dateISO || !isFinite(t.amountHT)) continue;
  const d = new Date(t.dateISO+"T00:00:00Z");
if(d > asOf) continue;
  const key = t.clientCanon || "(Sans nom)";
  if(!lifeMap.has(key)) lifeMap.set(key, {first:t.dateISO, last:t.dateISO, orders:0});
  const o = lifeMap.get(key);
o.orders += 1;
  if(t.dateISO < o.first) o.first = t.dateISO;
  if(t.dateISO > o.last) o.last = t.dateISO;
}

  
  // === TF (Tendance de Fréquence) ===
  const ymToIndex = (y,m)=> (y*12 + m);
  const asOfIdx = ymToIndex(asOf.getUTCFullYear(), asOf.getUTCMonth());
function ymIndexFromISO(iso){
    const y = parseInt(iso.slice(0,4),10);
    const m = parseInt(iso.slice(5,7),10)-1;
    return ymToIndex(y,m);
}


function monthsBetweenISO(firstISO, asOfDate){
  try{
    const y1 = parseInt(firstISO.slice(0,4),10);
    const m1 = parseInt(firstISO.slice(5,7),10)-1;
    const y2 = asOfDate.getUTCFullYear();
const m2 = asOfDate.getUTCMonth();
    const months = (y2 - y1)*12 + (m2 - m1);
    return Math.max(0, months);
  }catch(e){ return 0;
}
}
const map = new Map();
  const invDatesByClient = new Map();
// key -> Set(dateISO) (facture = 1 date unique)
  for(const t of tfTx){
    const k = t.clientCanon ||
"(Sans nom)";
    if(!invDatesByClient.has(k)) invDatesByClient.set(k, new Set());
    invDatesByClient.get(k).add(t.dateISO);
  }

  // --- TF Panier (autonome) : panier moyen 12 derniers mois vs 12 mois précédents ---
  const __basketMap = new Map(); // name -> {sumNow,cntNow,sumPrev,cntPrev}
  const __msOneYear = 365.25 * 24 * 60 * 60 * 1000;
  const __limitY1 = asOf.getTime() - __msOneYear;
  const __limitY2 = asOf.getTime() - (2 * __msOneYear);

  for(const t of tfTx){
    if(!t || !t.dateISO || !isFinite(t.amountHT)) continue;
    const d = new Date(t.dateISO + "T00:00:00Z");
    const tm = d.getTime();
    if(tm > asOf.getTime()) continue;
    const key = t.clientCanon || "(Sans nom)";
    if(!__basketMap.has(key)) __basketMap.set(key, {sumNow:0, cntNow:0, sumPrev:0, cntPrev:0});
    const o = __basketMap.get(key);

    if(tm > __limitY1){
      o.sumNow += Number(t.amountHT) || 0;
      o.cntNow += 1;
    }else if(tm > __limitY2){
      o.sumPrev += Number(t.amountHT) || 0;
      o.cntPrev += 1;
    }
  }

  for(const t of tfTx){
    
    const monthIdx = ymIndexFromISO(t.dateISO);
const key = t.clientCanon || "(Sans nom)";
    if(!map.has(key)) map.set(key, {name:key, last:t.dateISO, freq:0, m:0, months:{}});
    const c = map.get(key);
    c.freq++;
c.m += t.amountHT;
    c.months[monthIdx] = (c.months[monthIdx]||0) + 1;
    if(t.dateISO > c.last) c.last = t.dateISO;
}
  // Durée de la période sélectionnée (en années) pour annualiser le CA
  const yearsSpanSel = (p.periodMonths === "ALL")
    ?
Math.max(1e-6, ((asOf - minDate) / (365.25*24*3600*1000)))
    : Math.max(1e-6, ( (parseInt(p.periodMonths,10) || 12) / 12 ));
  const clients=[];
for(const c of map.values()){
    const last = new Date(c.last+"T00:00:00Z");


    // Si la dernière commande du client est plus vieille que le début de la période d'analyse,
    // on considère ce client comme "Hors Scope" et on ne l'intègre pas dans la liste.
    if(last < minDate) continue; 

    const recDays = Math.round(_ecoDaysBetweenDates(last, asOf));
    const r = scoreRecency(recDays,p);
let fMetric = c.freq;
    // Normalisation fréquence (annuelle ou mensuelle)
    const mode = (p.freqMode || "annual");
const monthsSpan = (p.periodMonths === "ALL")
      ?
Math.max(1, Math.round((asOf - new Date(((state.quality && state.quality.minDate) ? state.quality.minDate : p.asOfDate) + "T00:00:00Z")) / (30.4375*24*3600*1000)))
      : Math.max(1, parseInt(p.periodMonths,10) || 12);
if(mode === "monthly"){
      fMetric = c.freq / monthsSpan;
}else{
      const yearsSpan = monthsSpan / 12;
      fMetric = c.freq / Math.max(1e-6, yearsSpan);
}
    const f = scoreFrequency(fMetric,p);
    const basketAvg = (c.freq>0) ? (c.m / c.freq) : 0;
// Monetary = CA annuel moyen sur la période sélectionnée
    const annualAvg = c.m / yearsSpanSel;
const m = scoreMonetary(annualAvg,p);
    
    // --- Calcul TF "Adjusted Velocity" ---
    const life = lifeMap.get(c.name) || {};
    const firstISO = life.first || c.last;
    const ordersLifetime = (life.orders!=null ? life.orders : c.freq);
    const tenureMonths = monthsBetweenISO(firstISO, asOf);

    // On utilise la nouvelle fonction importée du code Python
    const dateSet = invDatesByClient.get(c.name);
    const velRes = calculateAdjustedVelocityTrend(dateSet, asOf);

    let tf = velRes.tf;
    let basketDelta = null;
    let basketDeltaRaw = null;
    // Si la fonction retourne une valeur (non null), on considère le calcul comme fiable
    // car la fonction gère elle-même les seuils (<3 dates => null)
    const tfReliable = (tf !== null);
    let tfNote = velRes.details || "";

    // --- Ajustement TF via panier moyen (autonome par client) ---
    // Comparaison 12 derniers mois vs 12 mois précédents (min 10 factures sur chaque fenêtre)
    try{
      if(tf !== null && __basketMap && __basketMap.has(c.name)){
        const b = __basketMap.get(c.name);
        if(b && (b.cntNow >= TF_BASKET_MIN_INVOICES) && (b.cntPrev >= TF_BASKET_MIN_INVOICES)){
          const basketNow = (b.sumNow / Math.max(1, b.cntNow));
          const basketPrev = (b.sumPrev / Math.max(1, b.cntPrev));
          if(isFinite(basketNow) && isFinite(basketPrev) && basketPrev > 0){
            let delta = (basketNow / basketPrev) - 1; // ex: -0.23 = -23%
            basketDeltaRaw = delta;
            delta = _ecoClamp(delta, TF_BASKET_CAP_DOWN, TF_BASKET_CAP_UP);
            basketDelta = delta;
            const coef = (delta < 0 ? TF_BASKET_COEF_DOWN : TF_BASKET_COEF_UP);
            const corr = coef * delta;
            tf = (isFinite(tf) ? (tf + corr) : tf);
            tfNote = (tfNote ? tfNote + " | " : "") + ("PanierΔ " + Math.round(delta*100) + "% (×" + coef.toFixed(2) + ")");
          }
        }
      }
    }catch(e){}
    // --- Fin Ajustement TF panier ---

    // --- Fin Calcul TF ---

    clients.push({
      name:c.name,
      basketDelta:basketDelta,
      basketDeltaRaw:basketDeltaRaw,
      lastISO:c.last,
      recencyDays:recDays,
      frequency:c.freq,
      frequencyMetric:fMetric,
      frequencyMode:(p.freqMode||"annual"),
      monetaryHT:c.m,
      basketAvgHT: (c.freq>0 ? (c.m/c.freq) : 0),
      annualAvgHT: c.m/yearsSpanSel,
      scoreR:r, scoreF:f, scoreM:m,
      rfm:""+r+f+m,
      tf:tf,
      tfReliable:tfReliable,
      tfNote:tfNote,
      firstISO:firstISO,
      ordersLifetime:ordersLifetime,
      tenureMonths:tenureMonths,
      segment:null
    });
}
  state.clients = clients;

  // B3 — Modèle client canonique (metrics par période)
  try{ if(typeof window.buildClientMetrics==='function') window.buildClientMetrics(state.clients); }catch(e){}

  // B4 — Segmentation canonique (sans changer la logique existante)
  try{ if(typeof window.buildClientSegmentation==='function') window.buildClientSegmentation(state.clients); }catch(e){}

  // Potentiels: Max CA 12M glissants sur 5 ans (as-of = date max du fichier)
  try{
    state.potCache = computeClientMaxCA12MAll(state.quality?.maxDate);
    for(const c of clients){
      const k = c.name;
      const r = state.potCache[k];
      c.maxCA12m = r ? r.max12 : 0;
      c.maxCA12mPrev = r ? (r.prevMax12||0) : 0;
      c.ca12mCur = r ? r.cur12 : 0;
      const refMax = (c.maxCA12mPrev>0 ? c.maxCA12mPrev : c.maxCA12m);
      const rawPct = (refMax>0 ? (c.ca12mCur/refMax) : 0);
      c.isNewPeak = (c.maxCA12mPrev>0 && c.ca12mCur > c.maxCA12mPrev*1.0001);
      c.pctOfMax = (refMax>0 ? Math.min(1, rawPct) : 0);
      c.__pctMaxCls = c.isNewPeak ? "pct-peak" : "";
      c.__pctMaxTxt = (refMax>0 ? fmtPctRatio(c.pctOfMax, 0) : "—");
      const pmRaw = state.meta?.potManual ? state.meta.potManual[k] : null;
      const pm = (pmRaw==null? null : (typeof pmRaw==='number'? pmRaw : String(pmRaw).replace(/[^0-9.,-]/g,'').replace(',','.')));
      c.potManual = (pm!=null && isFinite(pm) && Number(pm)>0) ? Number(pm) : null;
      c.__penTxt = (c.potManual && c.potManual>0) ? fmtPctRatio((c.ca12mCur/c.potManual), 0) : "—";
      c.penetration = (c.potManual && c.potManual>0) ? (c.ca12mCur/c.potManual) : null;
    }
  }catch(e){ console.warn("[MaxCA] computeClientMaxCA12MAll failed", e); state.potCache = null; }

  try{
    const totalCA_period = clients.reduce((s,c)=>s + (isFinite(c.monetaryHT)?c.monetaryHT:0), 0);
    for(const c of clients){
      c.caSharePeriod = (totalCA_period>0 ? ((isFinite(c.monetaryHT)?c.monetaryHT:0)/totalCA_period) : 0);
      c.segment = segment(c.scoreR, c.scoreF, c.scoreM, c.tf, c.tfReliable, c.recencyDays, c.tenureMonths, c.ordersLifetime, c.caSharePeriod);
    }
  }catch(e){ console.warn("[Seg] VIP 7% recalcul segments:", e); }



  try{
    const fArr = clients.map(c=>c.frequency).filter(isFinite);
const mArr = clients.map(c=>c.monetaryHT).filter(isFinite);
    state.statsStdF = stddev(fArr);
    state.statsStdM = stddev(mArr);
  }catch(e){ state.statsStdF = null; state.statsStdM = null;
}

  try{ __buildCanonicalCache(); }catch(e){ console.warn("[Cache] build failed", e); state.cache = null; }

  setStatus("Calcul OK", `${fmtInt(clients.length)} clients`);
  updateData();
  }catch(err){
    console.error(err);
alert('Erreur calcul : '+(err && err.message ? err.message : err));
    setStatus('Erreur calcul');
}
}

/** =========================
 * Dashboard render
 * ========================= */

function getDashClientsVisible(){
  let arr = (state.clients||[]).slice();
  // On laisse tout visible par défaut. 
  // Si le toggle "Masquer Perdus" est actif, on cache les deux catégories de perdus.
  if(state.ui && state.ui.hidePerdus){
    arr = arr.filter(c => c.segment !== "Perdus" && c.segment !== "Perdus Historiques");
  }
  return arr;
}


/** =========================
 * KPI Direction (Pilotage)
 * - calculés sur la période sélectionnée (dataset filtré)
 * ========================= */
function _dirGetPeriodBoundsISO(){
  const p = state.params || {};
  const tb = (typeof window.__icGetTimebox==="function") ? window.__icGetTimebox() : null;

  // Source de vérité : DateRF canonique (timebox) puis fallback legacy
  const today = new Date().toISOString().slice(0,10);
  const asOfISO0 = (p.asOfDate || (tb && tb.asOfISO) || (state.periodWindow && state.periodWindow.asOfISO) || (state.quality && state.quality.maxDate) || today);

  let asOfISO = asOfISO0;
  const qMaxISO = (state.quality && state.quality.maxDate) ? state.quality.maxDate : null;
  if(qMaxISO && asOfISO > qMaxISO) asOfISO = qMaxISO;

  let startISO = null;
  if(p.periodMonths === "ALL"){
    // Source de vérité : min dataset si dispo, sinon timebox.ANALYSIS.minISO
    startISO = (state.quality && state.quality.minDate) ? state.quality.minDate : ((tb && tb.ANALYSIS && tb.ANALYSIS.minISO) ? tb.ANALYSIS.minISO : asOfISO);
  }else{
    const m = Math.max(1, parseInt(p.periodMonths||12,10));
    const d = new Date(asOfISO+"T00:00:00Z");
    const dd = new Date(d.getTime());
    dd.setUTCMonth(dd.getUTCMonth()-m);
    startISO = dd.toISOString().slice(0,10);
  }
  return {startISO, asOfISO};
}

function _dirMidpointISO(startISO, asOfISO){
  const a = new Date(startISO+"T00:00:00Z").getTime();
  const b = new Date(asOfISO+"T00:00:00Z").getTime();
  const mid = new Date(a + (b-a)/2);
  return mid.toISOString().slice(0,10);
}
function _dirBuildSeries(){
  const {startISO, asOfISO} = _dirGetPeriodBoundsISO();
  const by = new Map(); // name -> {dates:[], txs:[{dateISO,amountHT}]}

  // Fast path : utiliser le cache canonique (txByClient trié) si disponible
  const cache = state && state.cache ? state.cache : null;
  const txByClient = cache && cache.txByClient ? cache.txByClient : null;

  // lowerBound sur ISO (liste triée par dateISO)
  const _lbISO = (arr, iso)=>{
    let lo=0, hi=arr.length;
    while(lo<hi){
      const mid = (lo+hi)>>>1;
      const v = arr[mid] && arr[mid].dateISO ? arr[mid].dateISO : "";
      if(v < iso) lo = mid+1; else hi = mid;
    }
    return lo;
  };

  if(txByClient){
    for(const [name, arr] of txByClient.entries()){
      if(!arr || arr.length===0) continue;
      // plage [startISO, asOfISO]
      let i = _lbISO(arr, startISO);
      for(; i<arr.length; i++){
        const t = arr[i];
        if(!t || !t.dateISO) continue;
        if(t.dateISO > asOfISO) break;

        let o = by.get(name);
        if(!o){ o = {dates:[], txs:[]}; by.set(name,o); }

        const amt = (isFinite(t.amountHT)?t.amountHT:0);

        // CA conservé (avoirs inclus) mais montants négatifs exclus des dates de vélocité
        if(amt > 0){
          o.dates.push(t.dateISO);
        }
        o.txs.push({dateISO:t.dateISO, amountHT:amt});
      }
    }

    // tri (déjà trié par construction, mais on sécurise)
    for(const o of by.values()){
      if(o.dates && o.dates.length>1) o.dates.sort();
      if(o.txs && o.txs.length>1) o.txs.sort((a,b)=>a.dateISO.localeCompare(b.dateISO));
    }
    return {by, startISO, asOfISO};
  }

  // Fallback : scan direct des transactions
  const startT = new Date(startISO+"T00:00:00Z").getTime();
  const asOfT  = new Date(asOfISO+"T00:00:00Z").getTime();
  for(const t of (state.tx||[])){
    if(!t || !t.clientCanon || !t.dateISO) continue;
    const tt = new Date(t.dateISO+"T00:00:00Z").getTime();
    if(!(tt>=startT && tt<=asOfT)) continue;
    const name = t.clientCanon;
    let o = by.get(name);
    if(!o){ o = {dates:[], txs:[]}; by.set(name,o); }

    const amt = (isFinite(t.amountHT)?t.amountHT:0);

    if(amt > 0){
      o.dates.push(t.dateISO);
    }
    o.txs.push({dateISO:t.dateISO, amountHT:amt});
  }
  for(const o of by.values()){
    o.dates.sort();
    o.txs.sort((a,b)=>a.dateISO.localeCompare(b.dateISO));
  }
  return {by, startISO, asOfISO};
}
function _dirIntervalsDays(dates){
  if(!dates || dates.length<2) return [];
  const out=[];
  for(let i=1;i<dates.length;i++){
    const a = new Date(dates[i-1]+"T00:00:00Z").getTime();
    const b = new Date(dates[i]+"T00:00:00Z").getTime();
    out.push(Math.max(0, _ecoDaysBetweenISO(dates[i-1], dates[i])));
  }
  return out;
}

// === Helpers Direction KPI ===
function _mean(arr){
  if(!Array.isArray(arr) || arr.length===0) return NaN;
  let s=0, n=0;
  for(const x of arr){
    const v = Number(x);
    if(Number.isFinite(v)) { s+=v; n++; }
  }
  return n? (s/n) : NaN;
}
// ===================== TD (%) — Taux de Décrochage =====================
// TD (%) = (1 - (Récence / CycleMoyen)) * 100
// Couleurs (UI) : vert ≥ 0 ; neutre -20 à -1 ; orange -50 à -21 ; rouge ≤ -51
let __tdCacheKey = null;      // startISO|asOfISO
let __tdCacheMap = null;      // Map<clientName, meanIntervalDays>

function _tdEnsureCache(){
  const b = _dirGetPeriodBoundsISO();
  const key = (b && b.startISO ? b.startISO : "") + "|" + (b && b.asOfISO ? b.asOfISO : "");
  if(__tdCacheKey === key && __tdCacheMap) return;

  __tdCacheKey = key;
  __tdCacheMap = new Map();

  const __res = _dirBuildSeries();
  const by = (__res && __res.by) ? __res.by : __res; // Map name -> séries
  for(const [name, series] of by.entries()){
    const dates = (series && series.dates) ? series.dates : [];
    const intervals = _dirIntervalsDays(dates);
    const meanInt = (intervals && intervals.length) ? _mean(intervals) : null;
    if(meanInt && isFinite(meanInt) && meanInt > 0) __tdCacheMap.set(name, meanInt);
  }
}

function _tdValuePercent(client){
  try {
    if(!client || !client.name) return null;
    if(client.tenureMonths == null || client.tenureMonths < 12) return null; // Garde-fou 1 an

    const asOfISO = _asOfISO();
    const asOf = _parseISO(asOfISO);
    const msOneYear = 365.25 * 24 * 60 * 60 * 1000;

    const limit12m = asOf.getTime() - msOneYear;
    const limit36m = asOf.getTime() - (3 * msOneYear);

    let ca12m = 0, ca36m = 0;
    const txsAll = state.tx.filter(t => t.clientCanon === client.name && t.dateISO);

    for(const t of txsAll){
       const tt = _parseISO(t.dateISO).getTime();
       if(tt > asOf.getTime()) continue;
       if(tt >= limit12m) ca12m += (t.amountHT || 0);
       if(tt >= limit36m) ca36m += (t.amountHT || 0);
    }

    const activeYears = Math.min(3, Math.max(1, client.tenureMonths / 12));
    const caAnnuelMoyen36m = ca36m / activeYears;

    if (caAnnuelMoyen36m <= 0) return 0;

    // Calcul de l'évolution: (CA Récent / CA Moyen) - 1. Ex: 85% devient -15%.
    return ((ca12m / caAnnuelMoyen36m) - 1) * 100;
  } catch(e) {
    return null;
  }
}

/* --- Prévision : pénalité/bonus selon matrice TF x TD (9 statuts cockpit) --- */
function _tftdMatrixCoef(tf, client){
  // Reproduit exactement les seuils utilisés par renderTFTDMatrix(c)
  // TD utilisé = tdInt (cohérent calcul/affichage)
  let tdInt = null;
  try{
    if(client){
      tdInt = (client.tdPct!=null && isFinite(client.tdPct)) ? client.tdPct : _tdValuePercent(client);
    }
  }catch(e){}
  const td = (tdInt!=null && isFinite(tdInt)) ? tdInt : 0;
  // Levels 0/1/2
  const tdLevel = (td >= -20) ? 0 : (td >= -50 ? 1 : 2);
  const tfLevel = (tf > -0.15) ? 0 : (tf > -0.25 ? 1 : 2);

  const statuses = [
    ["OK","Alerte","Alerte forte"],
    ["Érosion","Risque","Risque élevé"],
    ["Risque volume","Critique","Critique +"]
  ];
  const status = statuses[tfLevel][tdLevel];

  // Coefs de base (équilibré, pénalités)
  let coef = 1.00;
  switch(status){
    case "OK": coef = 1.00; break;
    case "Alerte": coef = 0.95; break;
    case "Alerte forte": coef = 0.95; break;
    case "Érosion": coef = 0.95; break;
    case "Risque": coef = 0.90; break;
    case "Risque élevé": coef = 0.85; break;
    case "Risque volume": coef = 0.80; break;
    case "Critique": coef = 0.75; break;
    case "Critique +": coef = 0.70; break;
  }

  // Bonus contrôlé (uniquement en OK)
  if(status==="OK"){
    if(tf > 0.35) coef = 1.10;
    else if(tf > 0.20) coef = 1.05;
  }

  return {status, coef, tfLevel, tdLevel, td}; // td = valeur directe
}

function _tdBadgeHTML(client){
  const v = _tdValuePercent(client);
  if(v === null || !isFinite(v)) return `<span class="td-badge td-neutral">NC</span>`;
  const vv = Math.round(v);

  let cls = "td-neutral";
  if(vv >= 0) cls = "td-green";
  else if(vv >= -15) cls = "td-neutral";
  else if(vv >= -50) cls = "td-orange";
  else cls = "td-red";

  const sign = vv > 0 ? "+" : "";
  return `<span class="td-badge ${cls}">${sign}${vv}%</span>`;
}


function _tfBadgeHTML(client){
  try{
    if(!client || !isFinite(client.tf)) return "";
    const v = Math.round(client.tf * 100);
    let cls = "td-neutral";
    if(v >= 0) cls = "td-green";
    else if(v >= -20) cls = "td-neutral";
    else if(v >= -50) cls = "td-orange";
    else cls = "td-red";
    return `<span class="td-badge ${cls}">${v}%</span>`;
  }catch(e){
    return "";
  }
}
// =======================================================================


function computeDirectionKpis(clients){
  const baseClients0 = (clients||[]).filter(c=>c && c.name);
  // Exclusion des segments perdus des KPIs Direction (évite de compter avant filtrage UI)
  const baseClients = baseClients0.filter(c=>c.segment!=="Perdus" && c.segment!=="Perdus Historiques");
  const denomActifs = baseClients.length || 0;
  const p = (state && state.params) ? state.params : {};

  const CHURN_TF_THRESHOLD = -0.80;

  const {by, startISO, asOfISO} = _dirBuildSeries();
  const midISO = _dirMidpointISO(startISO, asOfISO);
  const midT = new Date(midISO+"T00:00:00Z").getTime();
  const startT = new Date(startISO+"T00:00:00Z").getTime();

  // NOUVEAU : Récupération de l'année calendaire de référence (Ex: 2026)
  const refYear = parseInt(asOfISO.slice(0,4), 10);
  const asOfT  = new Date(asOfISO+"T00:00:00Z").getTime();
  const daysSpan = Math.max(1, (asOfT-startT)/(1000*3600*24));
  const monthsSpan = (state.params && state.params.periodMonths==="ALL") ? (daysSpan/30.437) : Math.max(1, parseInt(state.params?.periodMonths||12,10));

  const preDrop = [];
  const preDropMain = [];
  const preDropLow = [];
  const churned = [];
  const forecastItems = [];

  for(const c of baseClients){
    const name = c.name;
    const series = by.get(name) || {dates:[], txs:[]};
    const dates = series.dates;
    const intervals = _dirIntervalsDays(dates);
    const meanInt = intervals.length ? _mean(intervals) : (c.frequency? (daysSpan/Math.max(1,c.frequency)) : NaN);
    const recCal = c.recencyDays;
    // RÉCENCE ÉCO (congés/WE/fériés) utilisée pour le moteur Direction (décrochage & pénalités prévision)
    let rec = recCal;
    try{
      if(c.lastISO){
        const dLast = _parseISO(c.lastISO);
        const dAsOf = _parseISO(asOfISO);
        const eco = _ecoDaysBetweenDates(dLast, dAsOf);
        if(isFinite(eco)) rec = eco;
      }
    }catch(e){}

    
    let __isDecrochage = false; // V4.15 : utilisé pour la pénalité prévisionnel
// DÉCROCHAGE (unifié) : déjà en décrochage (rec > 1.5×cycle) OU pré-décrochage (condA/condB)
// - VIP inclus (pas de trou logique)
// - Sert de pénalité prévisionnel (-20%)
    if(c.segment!=="Perdus" && c.segment!=="Perdus Historiques" && isFinite(rec) && isFinite(meanInt) && meanInt>0){
      const tv = c.tdPct || 0;
      // RÈGLE : Si le Volume (TV) est très bon, on augmente la tolérance de récence (2.2x au lieu de 1.5x)
      const tolerance = (tv > 10) ? 2.2 : 1.5; 

      const isAlreadyRisk = (rec > tolerance * meanInt);
      const condA = (rec > 1.2 * meanInt && rec <= tolerance * meanInt);
      const condB = (intervals.length>=2 && intervals[intervals.length-1] > meanInt && intervals[intervals.length-2] > meanInt && rec <= tolerance * meanInt);

      __isDecrochage = !!(isAlreadyRisk || condA || condB);

      // RÈGLE D'IMMUNITÉ : Un client en croissance de volume (>5%) ne peut pas être en Risque 
      // sauf si son silence dépasse 3x sa moyenne.
      if(tv > 5 && rec < Math.max(3 * meanInt, 10)) __isDecrochage = false; 

      if(__isDecrochage){
        const caN1 = _sumTxForClientBetween(c.name, (refYear-1)+"-01-01", (refYear-1)+"-12-31");
        const item = {client:c, meanInt, rec, condA, condB, isAlreadyRisk, caExposed: caN1};
        preDrop.push(item); // compat (liste totale)
        // RÈGLE MÉTIER : On isole les Occasionnels & Nouveaux du risque principal
        if(c.segment==="Occasionnels" || c.segment==="Nouveaux"){
          preDropLow.push(item);
        }else{
          preDropMain.push(item);
        }
      }
    }

    // DÉCROCHAGE CONFIRMÉ (unifié) :
    // A) H1 actif, H2 inactif
    // B) Client encore actif mais érosion forte confirmée : TF <= -80% (indépendant du segment)
    let __isChurnConfirmed = false;
    if(c.segment!=="Perdus" && c.segment!=="Perdus Historiques" && c.segment!=="Occasionnels" && c.segment!=="Nouveaux"){
      let hasH1=false, hasH2=false;
      for(const tx of series.txs){
        const tt = new Date(tx.dateISO+"T00:00:00Z").getTime();
        if(tt < midT) hasH1=true;
        else hasH2=true;
      }

      const byAbsence = (hasH1 && !hasH2);
      const byErosion = (isFinite(c.tf) && c.tf <= CHURN_TF_THRESHOLD);

      if(byAbsence || byErosion){
        __isChurnConfirmed = true;
        // CA Perdu = Max(0, CA N-1 - CA N)
        const caN1 = _sumTxForClientBetween(c.name, (refYear-1)+"-01-01", (refYear-1)+"-12-31");
        const caN  = _sumTxForClientBetween(c.name, refYear+"-01-01", refYear+"-12-31");
        const caLost = Math.max(0, caN1 - caN);
        churned.push({client:c, caLost: caLost});
      }
    }

    // PRÉVISION 3 MOIS (Plat + Affiné) — base fixe 36 mois (indépendant de la période sélectionnée)
// - Exclut Dormants, Occasionnels, Perdus
// - "Plat" : CA moyen mensuel sur 36 mois × 3
// - "Affiné" : Plat × facteur vélocité (biais prudent -5% + caps) × pénalité Décrochage (-20%)
    if(c.segment!=="Perdus" && c.segment!=="Perdus Historiques" && c.segment!=="Dormants" && c.segment!=="Occasionnels" && !__isChurnConfirmed){
      const FORECAST_BASE_MONTHS = 36;

      // Fenêtre fixe 36 mois glissants (par rapport à la date de référence)
      const asOfD = new Date(asOfISO+"T00:00:00Z");
      const winStartD = new Date(asOfD.getTime());
      winStartD.setUTCMonth(winStartD.getUTCMonth() - FORECAST_BASE_MONTHS);
      const winStartT = winStartD.getTime();
      const winEndT = asOfD.getTime();

      // Transactions client sur la fenêtre
      let fCount = 0, mSum = 0;
      let firstTxISO = null; // 1ère transaction trouvée dans la fenêtre (36 mois)
      const allTx = (state.tx || []);
      for(const tx of allTx){
        if(tx && tx.clientCanon === c.name && tx.dateISO){
          const tt = new Date(tx.dateISO+"T00:00:00Z").getTime();
          if(tt >= winStartT && tt <= winEndT){
            fCount += 1;
            mSum += (tx.amountHT || 0);
            if(!firstTxISO || tx.dateISO < firstTxISO) firstTxISO = tx.dateISO;
          }
        }
      }

      if(fCount > 0 && isFinite(mSum)){
        // Calcul de la durée de vie réelle du client sur la fenêtre (basée sur la 1ère transaction réellement présente)
        const cFirstD = new Date((firstTxISO || c.firstISO || asOfISO) + "T00:00:00Z");
        const ageMs = asOfD.getTime() - cFirstD.getTime();

        // Conversion de l'âge en mois (moyenne 30.44 jours/mois)
        let ageMonths = ageMs / (1000 * 3600 * 24 * 30.436875);

        // Sécurité : on ne divise pas par 0, et on ne remonte pas plus loin que la fenêtre max
        const FBM = (p && isFinite(p.forecastBaseMonths) && p.forecastBaseMonths>0) ? p.forecastBaseMonths : FORECAST_BASE_MONTHS;
        ageMonths = Math.max(1, Math.min(FBM, ageMonths));

        const flat = (mSum / ageMonths) * 3;

        // Facteur vélocité : 1 + TF (TF = tendance de vélocité)
        let tf = 0;
        try{
          const vel = calculateAdjustedVelocityTrend(new Set(dates||[]), new Date(asOfISO+"T00:00:00Z"));
          if(vel && isFinite(vel.tf)) tf = vel.tf;
        }catch(e){}

        let factor = (1 + tf) * 0.95; // biais prudent (-5%)

        // Pénalité Décrochage (-20%)
        if(__isDecrochage){
          factor *= 0.70; // pénalité décrochage -30%
          if(rec > 1.5*meanInt){
            factor *= 0.95; // décrochage confirmé : -5% supplémentaire
          }
        }

        // Cap (général)
        factor = Math.max(0.5, Math.min(1.5, factor));

        // Base faible (peu de dates) => cap plus strict
        if((dates||[]).length < 6){
          factor = Math.max(0.85, Math.min(1.15, factor));
        }

        // --- FACTEUR TV (Tendance Volume) — version "classique" ---
// Par défaut: TV auto (c.tdPct). Option: TV manuelle (commercial) via la modale Top 5.
const tvAuto = (c.tdPct != null && isFinite(c.tdPct)) ? c.tdPct : 0;
const tvManual = _getManualTV(c.name);
const tv = (tvManual != null && isFinite(tvManual)) ? tvManual : tvAuto;

// Conversion en multiplicateur ATTÉNUÉE pour éviter un écrasement trop fort (ex: 0.68).
// Ex: -40% => ~0.73 (avant cap), +20% => ~1.13 (avant cap).
const tvMultiplierRaw = (tv !== null && isFinite(tv)) ? (1 + (tv / 150)) : 1;
const tvMultiplier = Math.max(0.75, Math.min(1.10, tvMultiplierRaw));

let totalFactor = factor * tvMultiplier;
const {status} = _tftdLevels(c); // statut UI (matrice) basé sur la TV auto, pas la manuelle

// Cap final (anti extrêmes) — resserré pour limiter l'écart Plat vs Corrigé
totalFactor = Math.max(0.70, Math.min(1.20, totalFactor));

const affine = flat * totalFactor;

// Détails : theo = plat, contrib = affiné
forecastItems.push({client:c, contrib:affine, theo:flat, factor:totalFactor, tf, tftdStatus:status, tftdCoef:tvMultiplier, tvUsed:tv, tvManual:(tvManual!=null)});
      }
    }
  }

  // Pré-décrochage : séparation "vrais clients" vs "pré-perdus" (Occasionnels & Nouveaux)
  const preDropMainCA = preDropMain.reduce((s,x)=>s+(x.caExposed||0),0);
  const preDropMainN  = preDropMain.length;
  const preDropMainPct = denomActifs ? (preDropMainN/denomActifs*100) : 0;

  const preDropLowCA = preDropLow.reduce((s,x)=>s+(x.caExposed||0),0);
  const preDropLowN  = preDropLow.length;
  const preDropLowPct = denomActifs ? (preDropLowN/denomActifs*100) : 0;

  // Compat : totaux historiques (ancienne tuile unique)
  const preDropCA = preDropMainCA + preDropLowCA;
  const preDropN  = preDropMainN + preDropLowN;
  const preDropPct = denomActifs ? (preDropN/denomActifs*100) : 0;

  const churnN = churned.length;
  const churnPct = denomActifs ? (churnN/denomActifs*100) : 0;
  const churnCA = churned.reduce((s,x)=>s+(x.caLost||0),0);

  const forecastPlat = forecastItems.reduce((s,x)=>s+(x.theo||0),0);
  const forecastAffine = forecastItems.reduce((s,x)=>s+(x.contrib||0),0);
  const forecastFactor = forecastPlat>0 ? (forecastAffine/forecastPlat) : 1;
  // Compat (anciens noms)
  const forecast = forecastAffine;
  const forecastTheo = forecastPlat;
  forecastItems.sort((a,b)=>(b.contrib||0)-(a.contrib||0));

  return {
    // Compat (ancienne tuile unique)
    preDrop, preDropCA, preDropN, preDropPct,

    // Nouveaux KPI (séparés)
    preDropMain, preDropMainCA, preDropMainN, preDropMainPct,
    preDropLow,  preDropLowCA,  preDropLowN,  preDropLowPct,

    churned, churnCA, churnN, churnPct,
    forecastPlat, forecastAffine, forecastFactor,
    forecast, forecastTheo, forecastItems,
    denomActifs
  };
}
function renderDirectionKpis(clients){
  const box = document.getElementById("dirKpis");
  if(!box) return;
  if(!clients || !clients.length){
    box.innerHTML = `<div class="muted small">—</div>`;
    return;
  }
  const dir = computeDirectionKpis(clients);
  state.ui.dirCache = dir;
  // Meta cache : permet d'éviter l'affichage d'un détail KPI calculé sur une autre date/période
  const __p = state.params || {};
  const __tb = (typeof window.__icGetTimebox==="function") ? window.__icGetTimebox() : null;
  const __today = new Date().toISOString().slice(0,10);
  const __asOfISO0 = (__p.asOfDate || (__tb && __tb.asOfISO) || (state.periodWindow && state.periodWindow.asOfISO) || (state.quality && state.quality.maxDate) || __today);
  const __qMaxISO = (state.quality && state.quality.maxDate) ? state.quality.maxDate : null;
  const __asOfISO = (__qMaxISO && __asOfISO0 > __qMaxISO) ? __qMaxISO : __asOfISO0;
  state.ui.dirCacheMeta = { asOfISO: __asOfISO, periodMonths: (__p.periodMonths||12) };

  const tipRisk = "Risque (vrais clients) : ralentissement d’activité sur la période analysée. Se déclenche lorsque le client a un retard significatif par rapport à son cycle normal de commande (hors Occasionnels & Nouveaux).";
  const tipPrePerdus = "Pré-perdus (Occasionnels & Nouveaux) : même détection que le risque, mais classés à part car l’impact prévisionnel est considéré faible.";

const tipCh  = "Indique une rupture d’activité sur la période sélectionnée. Se déclenche si (A) H1 actif / H2 inactif OU (B) TF ≤ -80% (hors Perdus, Occasionnels, Nouveaux).";

  const tipFc  = "Prévision 3 mois :\n• Plat = projection linéaire (hors Dormants/Occasionnels)\n• Affiné = Plat pondéré par la vélocité (cap appliqué)";


// --- Alignement strict compteur ↔ détail KPI (anti-doublons) ---
// La modale détail dé-duplique par nom. Ici on applique la même règle afin d'éviter tout décalage.
const _clientWord = (n)=> (n===1 ? "client" : "clients");
const _denomActifsUnique = (arr)=>{
  const s = new Set();
  for(const c of (arr||[])){
    if(!c || !c.name) continue;
    if(c.segment==="Perdus" || c.segment==="Perdus Historiques") continue;
    s.add(String(c.name).trim());
  }
  return s.size || 0;
};
const _uniqByClientName = (items, valueKey)=>{
  const map = new Map();
  for(const it of (items||[])){
    const c = (it && it.client) ? it.client : it;
    const nm = (c && (c.name||c.clientCanon||c.clientNorm)) ? String(c.name||c.clientCanon||c.clientNorm).trim() : "";
    if(!nm) continue;
    const v = (it && it[valueKey]!=null && isFinite(it[valueKey])) ? it[valueKey] : 0;
    const prev = map.get(nm);
    if(!prev || v > (prev.__v||0)){
      map.set(nm, Object.assign({}, it, {__nm:nm, __v:v}));
    }
  }
  return Array.from(map.values());
};

const denomActifsU = _denomActifsUnique(clients);

const mainU  = _uniqByClientName(dir.preDropMain, "caExposed");
const lowU   = _uniqByClientName(dir.preDropLow,  "caExposed");
const churnU = _uniqByClientName(dir.churned,     "caLost");

// Affichage : le compteur suit exactement le contenu qui serait listé en modale
// (si "Masquer perdus" est activé, on exclut Perdus + Perdus Historiques pour le COUNT)
const _keepForCount = (c)=> !state.ui?.hidePerdus || (c && c.segment!=="Perdus" && c.segment!=="Perdus Historiques");

const preDropMainItems = mainU.filter(x => x && x.client && _keepForCount(x.client));
const preDropMainN   = preDropMainItems.length;
const preDropMainCA  = preDropMainItems.reduce((s,x)=>s+(x.caExposed||0),0);
const preDropMainPct = denomActifsU ? (preDropMainN/denomActifsU*100) : 0;

const preDropLowItems = lowU.filter(x => x && x.client && _keepForCount(x.client));
const preDropLowN   = preDropLowItems.length;
const preDropLowCA  = preDropLowItems.reduce((s,x)=>s+(x.caExposed||0),0);
const preDropLowPct = denomActifsU ? (preDropLowN/denomActifsU*100) : 0;

const churnItems = churnU.filter(x => x && x.client && _keepForCount(x.client));
const churnN   = churnItems.length;
const churnCA  = churnItems.reduce((s,x)=>s+(x.caLost||0),0);
const churnPct = denomActifsU ? (churnN/denomActifsU*100) : 0;
box.innerHTML = `
  <div class="dir-kpi" data-kpi="dir:predrop">
    <div class="k">Risque de décrochage <span class="tip" data-tip="${escapeHtml(tipRisk)}">i</span></div>
    <div class="v">${fmtInt(preDropMainN)} ${_clientWord(preDropMainN)}</div>
    <div class="s">${preDropMainPct.toFixed(1)}% des actifs <br> CA exposé : ${fmtEUR(preDropMainCA)}</div>
  </div>

  <div class="dir-kpi" data-kpi="dir:predrop_low">
    <div class="k">Décrochage en cours  <span class="tip" data-tip="${escapeHtml(tipPrePerdus)}">i</span></div>
    <div class="v">${fmtInt(preDropLowN)} ${_clientWord(preDropLowN)}</div>
    <div class="s">${preDropLowPct.toFixed(1)}% des actifs <br> CA exposé : ${fmtEUR(preDropLowCA)}</div>
  </div>

  <div class="dir-kpi" data-kpi="dir:churn">
    <div class="k">Décrochage confirmé <span class="tip" data-tip="${escapeHtml(tipCh)}">i</span></div>
    <div class="v">${fmtInt(churnN)} ${_clientWord(churnN)}</div>
    <div class="s">${churnPct.toFixed(1)}% des actifs <br> CA exposé : ${fmtEUR(churnCA)}</div>
  </div>
`;

// --- UI colors: Décrochage tiles (orange base; highest count in red) ---
try{
  const tiles = Array.from(box.querySelectorAll('.dir-kpi'));
  for(const t of tiles){
    t.classList.remove("tileGlowRed","tileGlowOrange","tileGlowGreen","is-on");
    t.classList.add("tileGlowOrange");
  }
  const nums = [
    {id:"dir:predrop", n: Number(preDropMainN)},
    {id:"dir:predrop_low", n: Number(preDropLowN)},
    {id:"dir:churn", n: Number(churnN)}
  ].filter(x=>isFinite(x.n));
  nums.sort((a,b)=>b.n-a.n);
  if(nums.length){
    const worst = nums[0];
    const el = box.querySelector('.dir-kpi[data-kpi="'+worst.id+'"]');
    if(el){
      el.classList.remove("tileGlowOrange");
      el.classList.add("tileGlowRed","is-on");
    }
  }
}catch(e){}
box.onclick = (e)=>{
    const actBtn = e.target.closest('[data-act="tvOverrides"]');
    if(actBtn){ e.stopPropagation(); openTVOverridesModal(); return; }
    const card = e.target.closest(".dir-kpi");
    if(!card) return;
    const id = card.dataset.kpi;
    if(id) openKpiDetail(id);
  };
}
function classFromStatus(status){
  const s = (status||"").toLowerCase();
  // OK
  if(s==="ok") return "tftd-soft-ok";
  // Warning-ish
  if(s.includes("alerte") || s.includes("érosion") || s.includes("erosion")) return "tftd-soft-warn";
  // Orange-ish
  if(s.includes("risque volume") || (s==="risque") || s.includes("alerte forte")) return "tftd-soft-orange";
  // Red-ish
  if(s.includes("risque élevé") || s.includes("risque eleve") || s.includes("critique")) return "tftd-soft-red";
  return "tftd-soft-warn";
}

function renderDash(){
  const clients = getDashClientsVisible();
  const totalClients = clients.length;

  // KPI Dashboard : exclure Perdus & Perdus Historiques (sans impacter le reste du dashboard)
  const kpiClients = clients.filter(c => c && c.segment !== "Perdus" && c.segment !== "Perdus Historiques");
  const totalKpiClients = kpiClients.length;

  // --- Potentiels KPIs (moyennes simples) ---
  let avgPotCover = NaN;   // moyenne des % du max (clients avec maxCA>0)
  let avgPenSimple = NaN;  // moyenne des PdPs (clients avec potentiel manuel >0)
  try{
    const withMax = kpiClients.filter(c => (c && (c.maxCA12m||0) > 0));
    if(withMax.length){
      avgPotCover = withMax.reduce((s,c)=> s + (isFinite(c.pctOfMax)? Number(c.pctOfMax) : 0), 0) / withMax.length;
    }
    const withMan = kpiClients.filter(c => (c && (c.potManual||0) > 0));
    if(withMan.length){
      avgPenSimple = withMan.reduce((s,c)=> s + ((c.ca12mCur||0) / (c.potManual||1)), 0) / withMan.length;
    }
  }catch(e){}
  // CA "période" doit respecter la période sélectionnée (1/2/3 ans) + la date de référence (asOf)
  // On le calcule directement depuis les transactions filtrées (state.periodTx).
  let caHTPeriode = NaN;
  try{
    const periodTx = Array.isArray(state.periodTx) ? state.periodTx : [];
    if(periodTx.length){
      // limiter au périmètre clients visibles (sinon masque dormants / filtres clients serait incohérent)
      const vis = new Set(kpiClients.map(c => (c.clientCanon||c.clientNorm||c.name||c.client||"").toString()));
      caHTPeriode = periodTx.reduce((s,t)=>{
        const key = (t.clientCanon||t.clientNorm||t.rawClient||"").toString();
        if(!vis.size || vis.has(key)) return s + (t.amountHT||0);
        return s;
      },0);
    }
  }catch(e){}
  const totalHT = kpiClients.reduce((s,c)=>s+(c.monetaryHT||0),0);
  // CA HT annuel moyen (global) = CA HT période / durée de période (en années)
  const p = (state && state.params) ? state.params : (defaultParams ? defaultParams() : {periodMonths:12, asOfDate:null});
  let yearsSpanDash = 1;
  try{
    if(String(p.periodMonths).toUpperCase()==="ALL"){
      const asOf = (p.asOfDate ? new Date(p.asOfDate+"T00:00:00Z") : null);
      const minISO = state && state.periodWindow && state.periodWindow.minISO ? state.periodWindow.minISO : null;
      const minD = minISO ? new Date(minISO+"T00:00:00Z") : null;
      if(asOf && minD && isFinite(asOf-minD)) yearsSpanDash = Math.max(1e-6, (asOf - minD)/(365.25*24*3600*1000));
    }else{
      yearsSpanDash = Math.max(1e-6, ((parseInt(p.periodMonths,10)||12)/12));
    }
  }catch(e){ yearsSpanDash = 1; }
  const annualAvgDash = (isFinite(caHTPeriode)? caHTPeriode : totalHT) / yearsSpanDash;
const totalTx = kpiClients.reduce((s,c)=>s+(c.frequency||0),0);
  const basket = totalTx ? totalHT/totalTx : 0;
  const avgFreq = totalClients ? totalTx/totalClients : 0;
const recMed = median(kpiClients.map(c=>c.recencyDays).filter(isFinite));
  // Taux de perte (moyenne N..N-3) : simulation sur la date de référence RFM (paramétrage) puis -1an, -2ans, -3ans.
  // On calcule, pour chaque date, le taux de clients "Perdus" (jamais "Perdus Historiques") parmi les clients non-historiques et ayant une activité connue à date.
  // Méthode alignée "Historique de vie" via __computeClientSegmentAt().
  let churnRateAvg = NaN;
  let churnSeries = null; // {asOfISO, rates:[{label, lost, denom, rate}]}
  try{
    const asOfISO0 = (p.asOfDate || state?.quality?.maxDate || new Date().toISOString().slice(0,10));
    __ensureTxIndex && __ensureTxIndex();
    const baseList = (state.clients||[]).filter(c=>c && c.name);
    const rates = [];
    const d0 = new Date(asOfISO0+"T00:00:00Z");
    for(let k=0;k<4;k++){
      const dEval = new Date(d0.getTime());
      dEval.setUTCFullYear(dEval.getUTCFullYear()-k);
      let lost=0, denom=0;
      for(const c of baseList){
        const txs = state.__txByClient ? (state.__txByClient.get(c.name) || []) : [];
        if(!txs || !txs.length) continue;
        const segAt = (typeof __computeClientSegmentAt==="function") ? __computeClientSegmentAt(dEval, txs) : c.segment;
        if(segAt==="Perdus Historiques") continue; // jamais dans le taux
        if(segAt==="Inactif") continue;
        denom++;
        if(segAt==="Perdus") lost++;
      }
      const rate = denom ? (lost/denom) : NaN;
      const label = (dEval.getUTCFullYear())+""; // repère année
      rates.push({label, lost, denom, rate});
    }
    churnSeries = {asOfISO: asOfISO0, rates};
    const fin = rates.map(x=>x.rate).filter(isFinite);
    churnRateAvg = fin.length ? (fin.reduce((a,b)=>a+b,0)/fin.length) : NaN;
  }catch(e){}
// KPI ajoutés (cliquables)
  const arrByCA = kpiClients.slice().sort((a,b)=>(b.monetaryHT||0)-(a.monetaryHT||0));
  const top5 = arrByCA.slice(0,5);
const top5sum = top5.reduce((s,c)=>s+(c.monetaryHT||0),0);
  const top5pct = totalHT ? (top5sum/totalHT*100) : 0;

  const n20 = Math.max(1, Math.ceil(totalClients*0.20));
const top20 = arrByCA.slice(0,n20);
  const top20sum = top20.reduce((s,c)=>s+(c.monetaryHT||0),0);
  const top20pct = totalHT ? (top20sum/totalHT*100) : 0;

  const actifs = kpiClients.filter(c=>c.scoreR>=3);
const actifsPct = totalKpiClients ? (actifs.length/totalKpiClients*100) : 0;

  const activationDays = 90;
  const act90 = kpiClients.filter(c=>isFinite(c.recencyDays) && c.recencyDays<=activationDays);
  const denomForAct90 = totalKpiClients;
  const act90Pct = denomForAct90 ? (act90.length/denomForAct90*100) : 0;

  const kpis = [
    ["Clients analysés", fmtInt(totalKpiClients), null],
    ["CA HT période", fmtEUR(isFinite(caHTPeriode)? caHTPeriode : totalHT), null],
    ["CA HT annuel moyen", fmtEUR(annualAvgDash), null],
    ["Panier moyen HT (approx.)", fmtEUR(basket), null],
    ["Fréquence moyenne", (isFinite(avgFreq)? avgFreq.toFixed(2):"—"), null],
    ["Taux de perte moyen", (isFinite(churnRateAvg)? (churnRateAvg*100).toFixed(0)+"%" : "—"), null],
    ["Concentration CA (Top 20%)", `${fmtInt(n20)} clients • ${top20pct.toFixed(1)}%`, "top20"],
    ["Dépendance CA (Top 5)", `${top5pct.toFixed(1)}%`, "top5"],
    ["Taux de clients actifs (R≥3)", `${actifsPct.toFixed(1)}%`, "actifs"],
    ["Activation (≤90j)", `${act90Pct.toFixed(1)}% • ${fmtInt(act90.length)}/${fmtInt(denomForAct90||0)}`, "act90"],
    ["Couverture du potentiel historique", (isFinite(avgPotCover)? (avgPotCover*100).toFixed(0)+"%" : "—"), "potcover"],
    ["PdP moyenne", (isFinite(avgPenSimple)? (avgPenSimple*100).toFixed(0)+"%" : "—"), "penrate"],
  ];
$("#kpiMain").innerHTML = kpis.map(([k,v,id])=>`
    <div class="kpi ${id?'clickable':''}" data-kpi="${id||''}">
      <div class="k">${k}</div><div class="v">${v}</div>
    </div>
  `).join("");

// --- UI colors: tile glow rules (Concentration / Activation / Couverture potentiel) ---
try{
  const boxes = Array.from(document.querySelectorAll('#kpiMain .kpi'));
  for(const b of boxes){
    const id = (b && b.dataset) ? (b.dataset.kpi||"") : "";
    b.classList.remove("tileGlowGreen","tileGlowOrange","tileGlowRed","is-on");
    if(id==="top20"){
      // Concentration CA (Top 20%) : >80% red, 50-80 orange, <50 green
      const v = Number(top20pct);
      if(isFinite(v)){
        if(v>80){ b.classList.add("tileGlowRed"); b.classList.add("is-on"); }
        else if(v>=50){ b.classList.add("tileGlowOrange"); }
        else { b.classList.add("tileGlowGreen"); }
      }else{
        b.classList.add("tileGlowOrange");
      }
    }else if(id==="act90"){
      // Activation (≤90j) : >75 green, 50-75 orange, <50 red
      const v = Number(act90Pct);
      if(isFinite(v)){
        if(v>75){ b.classList.add("tileGlowGreen"); b.classList.add("is-on"); }
        else if(v>=50){ b.classList.add("tileGlowOrange"); }
        else { b.classList.add("tileGlowRed"); b.classList.add("is-on"); }
      }else{
        b.classList.add("tileGlowOrange");
      }
    }else if(id==="potcover"){
      // Couverture potentiel historique : keep subtle blue (no thresholds yet)
      b.classList.add("tileGlowBlue");
    }
  }
}catch(e){}
$("#kpiMain").onclick = (e)=>{
    const box = e.target.closest(".kpi.clickable");
    if(!box) return;
    const id = box.dataset.kpi;
    if(id) openKpiDetail(id);
  };

const segStats = {};
let totalCA = 0;
for(const c of clients){
  const seg = c.segment || "—";
  if(!segStats[seg]) segStats[seg] = {n:0, ca:0};
  segStats[seg].n += 1;
const ca = (isFinite(c.monetaryHT) ? c.monetaryHT : 0);
  segStats[seg].ca += ca;
  totalCA += ca;
}
const order = ["VIP Solides","VIP Fragiles","Réguliers","Potentiels","Occasionnels","Nouveaux","À risque","Perdus","Perdus Historiques"];
// Tri : on lit le select si présent (source de vérité), sinon state.ui
const segSort = (document.getElementById("segSort") && document.getElementById("segSort").value)
  ?
document.getElementById("segSort").value
  : ((state.ui && state.ui.segSort) ? state.ui.segSort : "prio");
  const segList = order.filter(s=>segStats[s] && segStats[s].n>0);
if(segSort==="clients") segList.sort((a,b)=> (segStats[b].n - segStats[a].n));
  if(segSort==="ca") segList.sort((a,b)=> (segStats[b].ca - segStats[a].ca));
$("#segBars").innerHTML = segList.map(seg=>{
  const st = segStats[seg] || {n:0, ca:0};
  const n = st.n;
  const pct = totalClients ? (n*100/totalClients) : 0;          // part clients (base 100)
  const pca = totalCA ? (st.ca*100/totalCA) : 0;                // part CA (base 100)

  // NOUVEAU: Séparation visuelle pour Perdus Historiques
  const isHist = (seg === "Perdus Historiques");
  const extraStyle = isHist ? `margin-top:16px; padding-top:12px; border-top:1px dashed rgba(255,255,255,.15); opacity:0.55; filter:grayscale(100%);` : ``;

  return `<div class="barrow clickable" data-seg="${escapeHtml(seg)}" title="Cliquer pour le détail (${escapeHtml(seg)})" style="${extraStyle}">
    <div style="display:flex; align-items:center; gap:8px;"><button class="metaSeg" data-meta-seg="${escapeHtml(seg)}" title="Voir définition du segment" style="width:22px; height:22px; border-radius:999px; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.04); color:#ddd; 
cursor:pointer; font-weight:900; display:flex; align-items:center; justify-content:center; line-height:1; padding:0; z-index:5;">i</button><span class="chip ${chipClass(seg)}">${escapeHtml(seg)}</span></div>
    <div class="barstack">
      <div class="bar" title="Part de clients : ${pct.toFixed(1).replace(".",",")}%"><i style="width:${pct.toFixed(2)}%"></i></div>
      <div class="bar bar-ca" title="Part de CA : ${pca.toFixed(1).replace(".",",")}%"><i style="width:${pca.toFixed(2)}%"></i></div>
      <div class="barhint">CA segment : <b style="color:var(--warn)">${pca.toFixed(1).replace(".",",")}%</b> • ${fmtEUR(st.ca)}</div>
    </div>
    <div class="muted pctCol">${pct.toFixed(1).replace(".",",")}%</div>
  </div>`;
}).join("") || `<div class="muted small">—</div>`;

// Segments: clic -> détail tableau + explication
  const segBox = document.getElementById("segBars");
if(segBox){
    segBox.onclick = (e)=>{
      const row = e.target.closest(".barrow.clickable");
      if(!row) return;
const seg = row.dataset.seg || "";
      if(seg) openKpiDetail(`seg:${seg}`);
    };
  }


  // TF × TD health matrix (9 statuts)
  // Niveaux identiques au cockpit (renderTFTDMatrix) :
  // - TD (valeur directe) ; niveaux: stable (≥ -20), fragile (-20 à -50), à risque (≤ -50)
  // - TF niveaux: stable (> -15%), fragile (-15% à -25%), à risque (≤ -25%)
  const statuses = [
    ["OK",            "Alerte",        "Alerte forte"],
    ["Érosion",       "Risque",        "Risque élevé"],
    ["Risque volume", "Critique",      "Critique +"]
  ];

  function getTFTDLevelsForClient(c){
    const tf = (typeof c.tf === "number" && isFinite(c.tf)) ? c.tf : null;
    const tdInt = (typeof c.tdPct==="number" && isFinite(c.tdPct)) ? c.tdPct : _tdValuePercent(c);
    const tdDisp = (tdInt==null || !isFinite(tdInt)) ? null : tdInt; // valeur directe (pas d'inversion)
    const tdLevel = (tdDisp==null)? null : (tdDisp>=-20 ? 0 : (tdDisp>=-50 ? 1 : 2));
    const tfLevel = (tf==null)? null : (tf>-0.15 ? 0 : (tf>-0.25 ? 1 : 2));
    const status = (tdLevel==null || tfLevel==null) ? "NC" : statuses[tfLevel][tdLevel];
    return {tf, tdDisp, tfLevel, tdLevel, status};
  }

  
  // --- Matrice de santé R / F / M (conservée) ---
  const dist = {R:[0,0,0,0,0], F:[0,0,0,0,0], M:[0,0,0,0,0]};
  for(const c of clients){
    dist.R[(c.scoreR||1)-1]++; 
    dist.F[(c.scoreF||1)-1]++; 
    dist.M[(c.scoreM||1)-1]++;
  }

  const rowsHM_RFM = [
    {label:"Récence", key:"R"},
    {label:"Fréquence", key:"F"},
    {label:"Montant", key:"M"},
  ];
  const colsHM_RFM = [
    {label:"5 (Top)", score:5},
    {label:"4", score:4},
    {label:"3", score:3},
    {label:"2", score:2},
    {label:"1 (Low)", score:1},
  ];

  const boxRFM = document.getElementById("rfmHealth");
  if(boxRFM){
    if(!totalClients){
      boxRFM.innerHTML = `<div class="muted small">—</div>`;
    }else{
      let h = `<div class="health-grid">`;
      h += `<div></div>` + colsHM_RFM.map(c=>`<div class="health-colhead">${c.label}</div>`).join("");
      for(const r of rowsHM_RFM){
        h += `<div class="health-rowhead">${r.label}</div>`;
        for(const c of colsHM_RFM){
          const n = dist[r.key][c.score-1] || 0;
          const pct = totalClients ? (n*100/totalClients) : 0;
          h += `<div class="health-cell s${c.score}" data-dim="${r.key}" data-score="${c.score}">
                  <div class="n">${fmtInt(n)}</div>
                  <div class="p">${pct.toFixed(0)}%</div>
                </div>`;
        }
      }
      h += `</div>`;
      boxRFM.innerHTML = h;
    }
    boxRFM.onclick = (e)=>{
      const cell = e.target.closest(".health-cell");
      if(!cell) return;
      const dim = cell.dataset.dim;
      const score = parseInt(cell.dataset.score,10);
      if(dim && isFinite(score)) openKpiDetail(`rfm:${dim}:${score}`);
    };
  }

  // --- Matrice de santé TF × TD ---
  const dist9 = [
    [0,0,0],
    [0,0,0],
    [0,0,0]
  ];
  let nc = 0;
  for(const c of clients){
    const lv = getTFTDLevelsForClient(c);
    if(lv.tfLevel==null || lv.tdLevel==null) { nc++; continue; }
    dist9[lv.tfLevel][lv.tdLevel] += 1;
  }

  const rowsHM_TFTD = [
    {label:"TF stable",  y:0},
    {label:"TF fragile", y:1},
    {label:"TF à risque",y:2},
  ];
  const colsHM_TFTD = [
    {label:"TD stable",  x:0},
    {label:"TD fragile", x:1},
    {label:"TD à risque",x:2},
  ];

  const boxTFTD = document.getElementById("tftdHealth");
  if(boxTFTD){
    if(!totalClients){
      boxTFTD.innerHTML = `<div class="muted small">—</div>`;
    }else{
      let h = `<div class="health-grid tftd">`;
      h += `<div></div>` + colsHM_TFTD.map(c=>`<div class="health-colhead">${c.label}</div>`).join("");
      for(const r of [...rowsHM_TFTD].slice().reverse()){
        h += `<div class="health-rowhead small">${r.label}</div>`;
        for(const c of colsHM_TFTD){
          const st = statuses[r.y][c.x];
          const n = dist9[r.y][c.x] || 0;
          const pct = totalClients ? (n*100/totalClients) : 0;
          h += `<div class="health-cell ${classFromStatus(st)}" data-mode="tftd" data-tf="${r.y}" data-td="${c.x}" title="${escapeHtml(st)}">
                  <div class="n">${fmtInt(n)}</div>
                  <div class="lbl">${escapeHtml(st)}</div>
                  <div class="p">${pct.toFixed(0)}%</div>
                </div>`;
        }
      }
      h += `</div>`;
      if(nc){
        const pctNc = totalClients ? (nc*100/totalClients) : 0;
        h += `<div class="muted small" style="margin-top:8px;">NC : ${fmtInt(nc)} (${pctNc.toFixed(0)}%)</div>`;
      }
      boxTFTD.innerHTML = h;
    }

    boxTFTD.onclick = (e)=>{
      const cell = e.target.closest(".health-cell");
      if(!cell) return;
      const tfLevel = parseInt(cell.dataset.tf,10);
      const tdLevel = parseInt(cell.dataset.td,10);
      if(!isFinite(tfLevel) || !isFinite(tdLevel)) return;
      // Ouvre une modale de détail (comme la matrice RFM) avec la liste des clients concernés
      openKpiDetail(`tftd:${tfLevel}:${tdLevel}`);
    };
  }

  // --- Toggle RFM / TF×TD ---
  const legendEl = document.getElementById("healthLegend");
  const btnR = document.getElementById("btnHealthRfm");
  const btnT = document.getElementById("btnHealthTftd");
  function applyHealthMode(mode){
    if(!state.ui) state.ui = {};
    state.ui.healthMode = mode;
    const isRfm = (mode!=="tftd");
    if(boxRFM) boxRFM.classList.toggle("hidden", !isRfm);
    if(boxTFTD) boxTFTD.classList.toggle("hidden", isRfm);
    if(legendEl){
      legendEl.textContent = isRfm
        ? "Vert = Score 5 (Top), Rouge = Score 1 (Critique)."
        : "Vert = OK, Jaune/Orange = alerte/risque, Rouge = critique.";
    }
    if(btnR) btnR.disabled = isRfm;
    if(btnT) btnT.disabled = !isRfm;
  }
  if(btnR) btnR.onclick = ()=>applyHealthMode("rfm");
  if(btnT) btnT.onclick = ()=>applyHealthMode("tftd");
  applyHealthMode((state.ui && state.ui.healthMode) ? state.ui.healthMode : "rfm");

// KPI Direction (colonne droite)
  try{ renderDirectionKpis(clients); }catch(e){ console.warn(e); }
}

/** =========================
 * Table render
 * ========================= */
function updateClientsExtraFilterUI(){
  const row = document.getElementById("clientsExtraRow");
  const chip = document.getElementById("clientsExtraFilter");
const btn = document.getElementById("btnClearExtraFilter");
  const f = (state.ui && state.ui.clientExtraFilter) ? state.ui.clientExtraFilter : null;
  if(!row || !chip || !btn) return;
if(!f){
    row.classList.add("hidden");
    return;
  }
  row.classList.remove("hidden");
  if(f.mode==="rfm"){
    const label = (f.dim==="R") ?
"Récence" : (f.dim==="F" ? "Fréquence" : "Montant");
    chip.textContent = `Filtre actif : ${label} = ${f.score}`;
  }else if(f.mode==="tftd"){
    const tfLab = (f.tfLevel===0) ? "TF stable" : (f.tfLevel===1 ? "TF fragile" : "TF à risque");
    const tdLab = (f.tdLevel===0) ? "TD stable" : (f.tdLevel===1 ? "TD fragile" : "TD à risque");
    chip.textContent = `Filtre actif : ${tfLab} • ${tdLab}`;
  }else{
    chip.textContent = "Filtre actif";
  }
  btn.onclick = ()=>{
    state.ui.clientExtraFilter = null;
    updateClientsExtraFilterUI();
renderTable();
  };
}

function refreshSegmentFilter(){
  const segs = ["ALL","VIP Solides","VIP Fragiles","Réguliers","Potentiels","Nouveaux","À risque","Dormants"];
  $("#filterSegment").innerHTML = segs.map(s=>`<option value="${escapeHtml(s)}">${s==="ALL"?"Tous":s}</option>`).join("");
}
function renderTable(){
  const tbody = $("#clientsBody");
  const search = ($("#searchClient").value||"").toLowerCase().trim();
  const seg = $("#filterSegment").value || "ALL";
let rows = (state.clients||[]).slice();
  if(search) rows = rows.filter(c => (c.name||"").toLowerCase().includes(search));
  if(seg!=="ALL") rows = rows.filter(c => c.segment===seg);

  // TD (%) calculé pour tri/affichage
  rows.forEach(c=>{ c.tdPct = _tdValuePercent(c); });
// Filtre extra (ex: matrice santé)
  const extra = (state.ui && state.ui.clientExtraFilter) ? state.ui.clientExtraFilter : null;
  if(extra && extra.mode==="rfm"){
    if(extra.dim==="R") rows = rows.filter(c=>c.scoreR===extra.score);
    else if(extra.dim==="F") rows = rows.filter(c=>c.scoreF===extra.score);
    else if(extra.dim==="M") rows = rows.filter(c=>c.scoreM===extra.score);
  }else if(extra && extra.mode==="tftd"){
    rows = rows.filter(c=>{
      const tf = (typeof c.tf === "number" && isFinite(c.tf)) ? c.tf : null;
      const tdInt = (typeof c.tdPct==="number" && isFinite(c.tdPct)) ? c.tdPct : _tdValuePercent(c);
      const tdDisp = (tdInt==null || !isFinite(tdInt)) ? null : tdInt;
      const tdLevel = (tdDisp==null)? null : (tdDisp>=-20 ? 0 : (tdDisp>=-50 ? 1 : 2));
      const tfLevel = (tf==null)? null : (tf>-0.15 ? 0 : (tf>-0.25 ? 1 : 2));
      return (tfLevel===extra.tfLevel && tdLevel===extra.tdLevel);
    });
  }

  // Tri : 1) init via le menu existant, 2) ensuite via clic sur colonnes
  const legacySort = $("#sortBy").value ||
"monetary_desc";
  const legacyToState = (v)=>{
    switch(v){
      case "recency_asc": return {key:"recencyDays", dir:"asc"};
case "frequency_desc": return {key:"frequency", dir:"desc"};
      case "annual_desc": return {key:"annualAvgHT", dir:"desc"};
      case "name_asc": return {key:"name", dir:"asc"};
case "monetary_desc":
      default: return {key:"monetaryHT", dir:"desc"};
    }
  };
  if(!state.ui) state.ui = {};
if(!state.ui.sortClients) state.ui.sortClients = legacyToState(legacySort);

  const __keys = ['name', 'segment', 'tf', 'scoreR', 'scoreF', 'scoreM', 'rfm', 'tdPct', 'lastISO', 'recencyDays', 'frequency', 'monetaryHT', 'annualAvgHT'];
const __types = ['str', 'str', 'num', 'num', 'num', 'num', 'str', 'num', 'date', 'num', 'num', 'num', 'num'];
  sortRowsByState(rows, state.ui.sortClients, __keys, __types);
const maxRows = 800;
  const shown = rows.slice(0,maxRows);
  tbody.innerHTML = shown.map(c=>`
    <tr>
      <td><span class="client-link" data-client="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span></td>
      <td><span class="chip ${chipClass(c.segment)}">${escapeHtml(c.segment)}</span></td>
      <td>${_tfBadgeHTML(c) || '<span class="mono muted">NC</span>'}</td>
      <td class="mono">${c.scoreR}</td>
      <td class="mono">${c.scoreF}</td>
      <td class="mono">${c.scoreM}</td>
      <td class="mono">${c.rfm}</td>
      <td>${_tdBadgeHTML(c)}</td>
      <td>${fmtDateISO(c.lastISO)}</td>
      <td class="mono">${fmtInt(c.recencyDays)}</td>
      <td class="mono">${fmtInt(c.frequency)}</td>
      <td class="mono">${fmtEUR(c.monetaryHT)}</td>
      <td class="mono">${fmtEUR(c.annualAvgHT)}</td>
        <td class="mono ${escapeHtml(c.__pctMaxCls||"")}">${escapeHtml(c.__pctMaxTxt||"—")}</td>
      <td class="mono">${escapeHtml(c.__penTxt||"—")}</td>
  
  </tr>
  `).join("") || `<tr><td colspan="15" class="muted">Aucun résultat.</td></tr>`;

  $("#tableInfo").textContent = `${fmtInt(rows.length)} client(s) filtré(s) • ${fmtInt(shown.length)} affiché(s)${rows.length>maxRows ?
" (limité pour performance)" : ""}.`;
  // Tri par clic sur colonnes (DOM)
  try{ bindDomSortableTables();
}catch(e){}
}

/** =========================
 * Exports
 * ========================= */
function csvEscape(v){
  v=(v??"").toString();
  if(/[;\n\r"]/.test(v)) return '"'+v.replace(/"/g,'""')+'"';
  return v;
}
function downloadText(filename, text){
  const blob = new Blob([text], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 800);
}
function exportClients(){
  const cols = ["Client","Segment","ScoreR","ScoreF","ScoreM","RFM","DernierAchat","RecencyJours","NbAchats","CA_HT_Periode","CA_HT_AnnuelMoyen"];
  const lines=[cols.join(";")];
for(const c of (state.clients||[])){
    lines.push([
      c.name, c.segment, c.scoreR, c.scoreF, c.scoreM, c.rfm,
      c.lastISO||"", c.recencyDays, c.frequency,
      (c.monetaryHT||0).toFixed(2).replace(".",","),
      (c.annualAvgHT||0).toFixed(2).replace(".",","),
    ].map(csvEscape).join(";"));
}
  downloadText("clients_segmentes.csv", lines.join("\n"));
}
function exportTx(){
  const cols=["ClientBrut","ClientCanonique","Date","MontantHT"];
  const lines=[cols.join(";")];
for(const t of (state.tx||[])){
    if(!t.dateISO || !isFinite(t.amountHT)) continue;
    lines.push([t.rawClient, t.clientCanon, t.dateISO, (t.amountHT||0).toFixed(2).replace(".",",")].map(csvEscape).join(";"));
  }
  downloadText("transactions_normalisees.csv", lines.join("\n"));
}
function updateExportTag(){
  $("#exportTag").textContent = `${fmtInt((state.clients||[]).length)} clients`;
}

/** =========================
 * Wire UI
 * ========================= */

/** =========================
 * KPI detail view (page dédiée)
 * ========================= */
function openKpiDetail(id){
  let __kpiCustom = (typeof window!=='undefined' && window.__kpiCustom) ? window.__kpiCustom : null;
  const clients = (typeof getDashClientsVisible==="function" ? getDashClientsVisible() : (state.clients||[]));
  const kpiClients = (clients||[]).filter(c => c && c.segment !== "Perdus" && c.segment !== "Perdus Historiques");
const p = state.params || {};
  const asOfISO = (p.asOfDate || new Date().toISOString().slice(0,10));
  const perTxt = `${fmtInt(p.periodMonths||12)} mois`;
let title = "Détail KPI";
  let subtitle = `Période : ${perTxt} • Date : ${escapeHtml(asOfISO)}`;
  let rows = [];
  // Optional grouping for KPI detail rendering (used for Direction preDrop split)
  let __kpiGroups = null;

  // id = "seg:<Segment>"  ou  "rfm:<R|F|M>:<1..5>"
  state.ui.lastKpiApply = null;
const explain = document.getElementById("kpiExplain");
  const actions = document.getElementById("kpiActions");
  if(explain){ explain.style.display = "none"; explain.innerHTML = "";
}
  // Détail matrice TF×TD (Dashboard)
  if(id && id.startsWith("tftd:")){
    const parts = id.split(":");
    const tfLevel = parseInt(parts[1],10);
    const tdLevel = parseInt(parts[2],10);
    const st = (isFinite(tfLevel) && isFinite(tdLevel) && TFTD_STATUS_MATRIX[tfLevel] && TFTD_STATUS_MATRIX[tfLevel][tdLevel]) ? TFTD_STATUS_MATRIX[tfLevel][tdLevel] : "Statut";
    title = `TF×TD — ${st}`;
    // NOTE: TD est inversée à l'affichage (comme au cockpit)
    rows = clients.filter(c=>{
      const tf = (typeof c.tf === "number" && isFinite(c.tf)) ? c.tf : null;
      const tdInt = (typeof c.tdPct==="number" && isFinite(c.tdPct)) ? c.tdPct : _tdValuePercent(c);
      const tdDisp = (tdInt==null || !isFinite(tdInt)) ? null : tdInt;
      const tdL = (tdDisp==null)? null : (tdDisp>=-20 ? 0 : (tdDisp>=-50 ? 1 : 2));
      const tfL = (tf==null)? null : (tf>-0.15 ? 0 : (tf>-0.25 ? 1 : 2));
      return (tfL===tfLevel && tdL===tdLevel);
    });
    subtitle = `Case : ${escapeHtml(st)} • Période : ${perTxt} • Date : ${escapeHtml(asOfISO)}`;
  }


  if(actions){ actions.style.display = "none"; }

  // KPI Dashboard simples
if(id==="act90"){
  title = "Activation (≤90j)";
  const days = 90;
  rows = kpiClients.filter(c=>isFinite(c.recencyDays) && c.recencyDays<=days);
  subtitle = `Clients ayant commandé au cours des ${days} derniers jours • Période : ${perTxt} • Date : ${escapeHtml(asOfISO)}`;
}

// KPI Direction (colonne droite)
if(typeof id === "string" && id.startsWith("dir:")){
  // recalcul systématique (évite toute incohérence UI vs moteur)
  let dir = null;
  try{
    dir = computeDirectionKpis(getDashClientsVisible());
    state.ui.dirCache = dir;
    const __p2 = state.params || {};
    const __today2 = new Date().toISOString().slice(0,10);
    const __asOfISO0_2 = (__p2.asOfDate || (state.periodWindow && state.periodWindow.asOfISO) || (state.quality && state.quality.maxDate) || __today2);
    const __qMaxISO2 = (state.quality && state.quality.maxDate) ? state.quality.maxDate : null;
    const __asOfISO2 = (__qMaxISO2 && __asOfISO0_2 > __qMaxISO2) ? __qMaxISO2 : __asOfISO0_2;
    state.ui.dirCacheMeta = { asOfISO: __asOfISO2, periodMonths: (__p2.periodMonths||12) };
  }catch(e){ dir = null; }
  const key = id.slice(4);
  
if(key==="predrop"){
  title = "Risque de décrochage";
  const mainU = _uniqByClientName(dir?.preDropMain||[], "caExposed");
  rows = mainU.map(x => x.client).filter(Boolean);
  subtitle = `Clients en ralentissement (vrais clients) • Période : ${perTxt} • Date : ${escapeHtml(asOfISO)}`;
}else if(key==="predrop_low"){
  title = "Décrochage en cours (Pré-perdus)";
  const lowU = _uniqByClientName(dir?.preDropLow||[], "caExposed");
  rows = lowU.map(x => x.client).filter(Boolean);
  subtitle = `Occasionnels & Nouveaux en alerte • Période : ${perTxt} • Date : ${escapeHtml(asOfISO)}`;
}else if(key==="churn"){
  title = "Décrochage confirmé";
  const churnU = _uniqByClientName(dir?.churned||[], "caLost");
  rows = churnU.map(x => x.client).filter(Boolean);
  subtitle = `Rupture d'activité confirmée • Période : ${perTxt} • Date : ${escapeHtml(asOfISO)}`;
}else if(key==="forecast"){
    title = "Prévision CA 3 mois (top contributeurs)";
    const items = (dir?.forecastItems||[]).slice(0,200);
    const names = new Set(items.map(x=>x.client?.name).filter(Boolean));
    rows = clients.filter(c=>names.has(c.name));
    subtitle = `Projection comportementale • Période : ${perTxt} • Date : ${escapeHtml(asOfISO)}`;
  }
}

if(typeof id === "string" && id.startsWith("seg:")){
    const seg = id.slice(4);
title = `Segment : ${seg}`;
    rows = clients.filter(c=>c.segment===seg);

    const lines = [];
    lines.push(`<b>Conditions du segment</b> (règles app) :`);
if(seg==="VIP Solides" || seg==="VIP Fragiles"){
      lines.push(`• Base VIP si <span class="mono">R≥4</span> et <span class="mono">F≥4</span> et <span class="mono">M≥4</span>.`);
lines.push(`• VIP Fragiles si <span class="mono">TF ≤ -20%</span>, sinon VIP Solides.`);
}else if(seg==="Nouveaux"){
      lines.push(`• Nouveaux si <span class="mono">R=5</span> et <span class="mono">F=1</span>.`);
}else if(seg==="Potentiels"){
      lines.push(`• Potentiels si <span class="mono">R≥4</span> et <span class="mono">M≥3</span> et <span class="mono">F≤3</span>.`);
}else if(seg==="À risque"){
      lines.push(`• À risque si <span class="mono">R≤2</span> et (<span class="mono">F≥3</span> ou <span class="mono">M≥3</span>).`);
}else if((seg==="Occasionnels"||seg==="Perdus")){
      lines.push(`• Occasionnels si <span class="mono">factures vie ≤ 2</span> <i>ou</i> <span class="mono">dernière commande > 180j</span>.`);
}else if(seg==="Réguliers"){
      lines.push(`• Réguliers : cas restant (aucune règle précédente).`);
}

    if(explain){
      explain.style.display = "flex";
      explain.innerHTML = `<div>🧠</div><div>${lines.join("<br/>")}</div>`;
}
    if(actions) actions.style.display = "flex";
    state.ui.lastKpiApply = {mode:"segment", segment: seg};
}

  if(typeof id === "string" && id.startsWith("rfm:")){
    const parts = id.split(":");
    const dim = (parts[1]||"").toUpperCase();
const score = parseInt(parts[2],10);
    const label = (dim==="R") ? "Récence" : (dim==="F" ? "Fréquence" : "Montant");
title = `Matrice santé : ${label} = ${score}`;
    rows = clients.filter(c=>{
      if(dim==="R") return c.scoreR===score;
      if(dim==="F") return c.scoreF===score;
      if(dim==="M") return c.scoreM===score;
      return false;
    });
if(explain){
      explain.style.display = "flex";
      explain.innerHTML = `<div>🔎</div><div>Filtre : <b>${label} = ${score}</b>.
Tu peux appliquer ce filtre directement dans l’onglet Clients.</div>`;
    }
    if(actions) actions.style.display = "flex";
state.ui.lastKpiApply = {mode:"rfm", dim, score};
  }

  if(id==="actifs"){
    title = "Clients actifs (Récence ≥ 3)";
rows = kpiClients.filter(c=>c.scoreR>=3);
  }else if(id==="top5"){
    title = "Top 5 clients (CA HT période)";
    rows = kpiClients.slice().sort((a,b)=>(b.monetaryHT||0)-(a.monetaryHT||0)).slice(0,5);
}else 
  if(id==="potcover"){
    title = "Couverture du potentiel historique";
    subtitle = `Moyenne simple sur tous les clients • Période : ${perTxt} • Date : ${escapeHtml(asOfISO)}`;
    rows = kpiClients.slice();
    // enrich rows with sortable fields
    rows.forEach(c=>{
      const max12 = isFinite(c.maxCA12m)?c.maxCA12m:0;
      const cur12 = isFinite(c.ca12mCur)?c.ca12mCur:0;
      c.__kpiMax12 = max12;
      c.__kpiCur12 = cur12;
      c.__kpiPctMax = (max12>0 ? (cur12/max12) : 0);
    });
    // % de CA (dans la modale) + PdP (si potentiel estimé renseigné)
    try{
      const totCur12 = rows.reduce((s,x)=>s+(Number(x.__kpiCur12)||0),0) || 0;
      rows.forEach(c=>{
        c.__kpiShareCA = (totCur12>0 ? ((Number(c.__kpiCur12)||0)/totCur12) : 0);
        c.__kpiPotM = Number(c.potManual)||0;
        c.__kpiPen = (c.__kpiPotM>0 ? ((Number(c.__kpiCur12)||0)/c.__kpiPotM) : null);
      });
    }catch(e){}

    // Table custom (UI) : afficher % CA et PdP (taux)
    __kpiCustom = {
      keys: ["name","segment","__kpiCur12","__kpiMax12","__kpiPctMax","__kpiShareCA","__kpiPen"],
      types:["str","str","num","num","num","num","num"],
      headerHtml: `<tr>
        <th data-k="name">Client</th>
        <th data-k="segment">Segment</th>
        <th data-k="__kpiCur12">CA 12m</th>
        <th data-k="__kpiMax12">Potentiel hist.</th>
        <th data-k="__kpiPctMax">% CA</th>
        <th data-k="__kpiShareCA">Part CA</th>
        <th data-k="__kpiPen">Plafond freq</th>
      </tr>`,
      rowFn: (c, muted=false)=>`
        <tr${muted ? ' style="opacity:.55; filter:grayscale(100%);"' : ''}>
          <td><span class="client-link" data-client="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span></td>
          <td><span class="chip acc">${escapeHtml(c.segment)}</span></td>
          <td class="mono">${fmtEUR(Number(c.__kpiCur12||0))}</td>
          <td class="mono">${fmtEUR(Number(c.__kpiMax12||0))}</td>
          <td class="mono">${isFinite(c.__kpiPctMax) ? (Math.round(c.__kpiPctMax*100)+'%') : '—'}</td>
          <td class="mono">${isFinite(c.__kpiShareCA) ? (Math.round(c.__kpiShareCA*100)+'%') : '—'}</td>
          <td class="mono">${(c.__kpiPen!=null && isFinite(c.__kpiPen)) ? (Math.round(c.__kpiPen*100)+'%') : '—'}</td>
        </tr>`
    };

    // default sort by __kpiPctMax asc (low coverage first)
    rows = rows.slice().sort((a,b)=>(a.__kpiPctMax||0)-(b.__kpiPctMax||0));
  }
  if(id==="penrate"){
    title = "PdP moyenne";
    subtitle = `Clients avec Potentiel estimé renseigné • Période : ${perTxt} • Date : ${escapeHtml(asOfISO)}`;
    rows = kpiClients.filter(c=>c && c.potManual && isFinite(c.penetration));
    rows.forEach(c=>{
      c.__kpiPotM = Number(c.potManual)||0;
      c.__kpiCur12 = isFinite(c.ca12mCur)?c.ca12mCur:0;
      c.__kpiPen = (c.__kpiPotM>0 ? (c.__kpiCur12/c.__kpiPotM) : 0);
    });
    rows = rows.slice().sort((a,b)=>(a.__kpiPen||0)-(b.__kpiPen||0));
  }

if(id==="top20"){
    title = "Top 20% clients (CA HT période)";
    const arr = clients.slice().sort((a,b)=>(b.monetaryHT||0)-(a.monetaryHT||0));
const n = Math.max(1, Math.ceil(arr.length*0.20));
    rows = arr.slice(0,n);
  }

  if(id!=="potcover" && id!=="penrate"){
    rows = rows.slice().sort((a,b)=>(b.monetaryHT||0)-(a.monetaryHT||0));
  }
  $("#kpiTitle").textContent = title;
  $("#kpiSubtitle").textContent = subtitle;
const ca = rows.reduce((s,c)=>s+(c.monetaryHT||0),0);
  const caAll = clients.reduce((s,c)=>s+(c.monetaryHT||0),0);
  const part = caAll ? (ca/caAll*100) : 0;
  // Respect toggle "Masquer Perdus" for KPI detail listings
  if(state.ui && state.ui.hidePerdus){
    rows = (rows||[]).filter(c => c && c.segment !== "Perdus" && c.segment !== "Perdus Historiques");
  }

  const kpis = [
    ["Clients", fmtInt(rows.length)],
    ["CA HT", fmtEUR(ca)],
    ["Part du CA total", part.toFixed(1)+"%"],
    ["CA moyen / client", (rows.length? fmtEUR(ca/rows.length):"—")],
    ["Fréquence moyenne", (rows.length? (rows.reduce((s,c)=>s+(c.frequency||0),0)/rows.length).toFixed(2):"—")],
    ["Récence médiane", (rows.length? fmtInt(Math.round(median(rows.map(r=>r.recencyDays).filter(isFinite))))+" j":"—")],
  ];
$("#kpiKpi").innerHTML = kpis.map(([k,v])=>`
    <div class="kpi"><div class="k">${k}</div><div class="v">${v}</div></div>
  `).join("");
// Tri par colonnes (même logique que la table principale)
  if(!state.ui) state.ui = {};
  state.ui.lastKpiId = id;
  // Custom KPI tables for potentiels
  if(id==="potcover"){
    if(!state.ui.sortKpi || state.ui.sortKpi.key==="annualAvgHT") state.ui.sortKpi = {key:"__kpiPctMax", dir:"asc"};
  }else if(id==="penrate"){
    if(!state.ui.sortKpi || state.ui.sortKpi.key==="annualAvgHT") state.ui.sortKpi = {key:"__kpiPen", dir:"asc"};
  }

if(!state.ui.sortKpi) state.ui.sortKpi = {key:"annualAvgHT", dir:"desc"};
  const __kpiKeys = ['name', 'segment', 'tf', 'scoreR', 'scoreF', 'scoreM', 'rfm', 'tdPct', 'lastISO', 'recencyDays', 'frequency', 'monetaryHT', 'annualAvgHT'];
  const __kpiTypes = ['str', 'str', 'num', 'num', 'num', 'num', 'str', 'num', 'date', 'num', 'num', 'num', 'num'];
  if(__kpiGroups && typeof id==="string" && id==="dir:predrop"){
    sortRowsByState(__kpiGroups.active, state.ui.sortKpi, (__kpiCustom?__kpiCustom.keys:__kpiKeys), (__kpiCustom?__kpiCustom.types:__kpiTypes));
    sortRowsByState(__kpiGroups.low, state.ui.sortKpi, (__kpiCustom?__kpiCustom.keys:__kpiKeys), (__kpiCustom?__kpiCustom.types:__kpiTypes));
    rows = (__kpiGroups.active||[]).concat(__kpiGroups.low||[]);
  }else{
    sortRowsByState(rows, state.ui.sortKpi, (__kpiCustom?__kpiCustom.keys:__kpiKeys), (__kpiCustom?__kpiCustom.types:__kpiTypes));
  }
const tbody = $("#kpiBody");
  // Header override + tri colonnes pour KPI potentiels
  try{
    const table = tbody && tbody.closest("table");
    if(table && __kpiCustom){
      const thead = table.querySelector("thead");
      if(thead) thead.innerHTML = __kpiCustom.headerHtml;
      setupSortableTable("kpiBody", "sortKpi", __kpiCustom.keys, __kpiCustom.types, ()=>openKpiDetail(id));
    }else if(table){
      // ensure default header sort bindings
      setupSortableTable("kpiBody", "sortKpi", __kpiKeys, __kpiTypes, ()=>openKpiDetail(id));
    }
  }catch(e){}

  const maxRows = 1200;

  const renderRow = (__kpiCustom ? __kpiCustom.rowFn : (c, muted=false)=>`
    <tr${muted ? ' style="opacity:.55; filter:grayscale(100%);"' : ''}>
      <td><span class="client-link" data-client="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span></td>
      <td><span class="chip acc">${escapeHtml(c.segment)}</span></td>
      <td>${_tfBadgeHTML(c) || '<span class="mono muted">NC</span>'}</td>
      <td class="mono">${c.scoreR}</td>
      <td class="mono">${c.scoreF}</td>
      <td class="mono">${c.scoreM}</td>
      <td class="mono">${c.rfm}</td>
      <td>${_tdBadgeHTML(c)}</td>
      <td>${fmtDateISO(c.lastISO)}</td>
      <td class="mono">${fmtInt(c.recencyDays)}</td>
      <td class="mono">${fmtInt(c.frequency)}</td>
      <td class="mono">${fmtEUR(c.monetaryHT)}</td>
      <td class="mono">${fmtEUR(c.annualAvgHT)}</td>
    </tr>
  `);

  let shownCount = 0;

  if(__kpiGroups && typeof id==="string" && id==="dir:predrop"){
    const grpA = (__kpiGroups.active||[]);
    const grpB = (__kpiGroups.low||[]);

    const shownA = grpA.slice(0, maxRows);
    const shownB = grpB.slice(0, Math.max(0, maxRows - shownA.length));
    shownCount = shownA.length + shownB.length;

    const parts = [];
    if(shownA.length){
      parts.push(shownA.map(c=>renderRow(c,false)).join(""));
    }
    if(shownB.length){
      parts.push(`
        <tr><td colspan="13" style="padding:10px 12px; font-weight:800; color:rgba(255,255,255,.72); background:rgba(255,255,255,.04); border-top:1px dashed rgba(255,255,255,.14);">
          Pré-perdus (Occasionnels & Nouveaux) — affichage informatif (impact prévision faible)
        </td></tr>
      `);
      parts.push(shownB.map(c=>renderRow(c,true)).join(""));
    }
    tbody.innerHTML = parts.join("") || `<tr><td colspan="13" class="muted">Aucun client.</td></tr>`;
  }else{
    const shown = (rows||[]).slice(0, maxRows);
    shownCount = shown.length;
    tbody.innerHTML = shown.map(c=>renderRow(c,false)).join("") || `<tr><td colspan="13" class="muted">Aucun client.</td></tr>`;
  }

  $("#kpiFoot").textContent = `${fmtInt(rows.length)} client(s) • ${fmtInt(shownCount)} affiché(s)`;
  switchView("kpi");
}

/** =========================
 * events
 * ========================= */
function init(){
  // weak words
  $("#weakWords").value = state.weakWords;
  updateAliasTag();

  // params
  const p = state.params;
$("#periodMonths").value = String(p.periodMonths);
  $("#asOfDate").value = p.asOfDate || new Date().toISOString().slice(0,10);

  // --- Sync Date de référence : modification immédiate (sans devoir "Enregistrer paramètres")
  const __asOfEl = document.getElementById("asOfDate");
  if(__asOfEl && !__asOfEl.dataset.bound){
    __asOfEl.addEventListener("change", ()=>{
      state.ui = state.ui || {};
      state.ui.userAsOfTouched = true;
      if(!state.params) state.params = defaultParams();
      state.params.asOfDate = __asOfEl.value || state.params.asOfDate;
      LS.set("params", state.params);
      renderParamKpis();
      $("#paramMsg").innerHTML = `<span class="ok">Date de référence appliquée.</span>`;
    });
    __asOfEl.dataset.bound = "1";
  }

  $("#freqMode").value = (p.freqMode || "annual");
  $("#excludeTopN").value = String(p.excludeTopN ?? 0);
  renderParamKpis();
["r5","r4","r3","r2","f1","f2","f3","f4","m1","m2","m3","m4"].forEach(id=>$("#"+id).value = p[id]);

  refreshSegmentFilter();
  updateClientsExtraFilterUI();

  $("#fileInput").addEventListener("change", ()=>{
    const f = $("#fileInput").files?.[0];
    if(!f){ $("#fileInfo").textContent=""; $("#importTag").textContent="Aucun fichier"; return; }
    $("#fileInfo").textContent = `Taille : ${(f.size/1024).toFixed(0)} Ko`;
    $("#importTag").textContent = f.name;
    // Lecture automatique dès le dépôt du CSV
    setTimeout(()=>{
      try{ $("#btnParse").click(); }catch(e){}
    }, 0);
  });
$("#btnResetSession").addEventListener("click", ()=>{
    if(!confirm("Réinitialiser la session (données importées) ? Les alias restent en mémoire locale.")) return;
    state.rawText=""; state.rawRows=[]; state.headers=[]; state.tx=[]; state.clients=[];
    __resetComputedState();
    state.quality={lines:0,parsed:0,valid:0,invalid:0,clients:0,minDate:null,maxDate:null,sum:0};
    $("#importTag").textContent="Aucun fichier";
    $("#fileInput").value="";
    $("#fileInfo").textContent="";
    $("#btnBuild").disabled=true;
    $("#btnSuggest").disabled=true;
    $("#btnApplyAliases").disabled=true;
    $("#btnExportClients").disabled=true;
    $("#btnExportTx").disabled=true;
    $("#buildMsg").textContent="";
    $("#suggestBody").innerHTML = `<tr><td colspan="13" class="muted">Importe un CSV puis clique “Générer suggestions”.</td></tr>`;
    setStatus("Prêt","0 clients");
    renderQuality();
    renderDash();
    renderTable();
   
 updateExportTag(); try{ bindDomSortableTables(); }catch(e){}
    switchView("import");
  });
$("#btnParse").addEventListener("click", async ()=>{
    const f = $("#fileInput").files?.[0];
    if(!f){ alert("Choisis un fichier CSV."); return; }
    setStatus("Lecture…");
    const enc = $("#encSel").value || "utf-8";
    const sepSel = $("#sepSel").value;
    try{
      const text = await readFile(f, enc);
      state.rawText = text;
      const firstLine = (text.split(/\r?\n/).find(l=>l.trim().length>0) || "");
      let sep = ";";
      if(sepSel==="auto") sep = detectSep(firstLine);
      else sep = 
(sepSel==="\\t") ? "\t" : sepSel;
      const rows = parseCSV(text, sep);
      if(rows.length<2){ alert("CSV vide ou illisible."); setStatus("Erreur import"); return; }
      state.rawRows = rows;
      state.headers = rows[0].map(h=>normSpaces((h??"").toString()));
      ensureExtraMappingUI();
      fillSelect($("#colClient"), state.headers);
      fillSelect($("#colDate"), state.headers);
      fillSelect($("#colAmount"), state.headers);
      fillSelect($("#colCommercial"), state.headers);
      fillSelect($("#colMargin"), state.headers);

      const g = bestGuess(state.headers);
      if(g.client>=0) $("#colClient").value=String(g.client);
if(g.date>=0) $("#colDate").value=String(g.date);
      if(g.amount>=0) $("#colAmount").value=String(g.amount);
      if(g.commercial>=0) $("#colCommercial").value=String(g.commercial);
      if(g.margin>=0) $("#colMargin").value=String(g.margin);

      state.mapped.client = $("#colClient").value;
      state.mapped.date = $("#colDate").value;
      state.mapped.amount = $("#colAmount").value;
      state.mapped.commercial = $("#colCommercial").value;
      state.mapped.margin = $("#colMargin").value;

      $("#colClient").onchange = ()=> state.mapped.client=$("#colClient").value;
$("#colDate").onchange = ()=> state.mapped.date=$("#colDate").value;
      $("#colAmount").onchange = ()=> state.mapped.amount=$("#colAmount").value;
      $("#colCommercial").onchange = ()=> state.mapped.commercial=$("#colCommercial").value;
      $("#colMargin").onchange = ()=> state.mapped.margin=$("#colMargin").value;

      $("#btnBuild").disabled = false;
      $("#importTag").textContent = `${f.name} • ${fmtInt(rows.length)} lignes • sep="${sep==="\\t"?"TAB":sep}"`;
$("#buildMsg").innerHTML = `<span class="ok">Mapping prêt.</span> Clique “Construire le dataset”.`;
      setStatus("Mapping prêt", "0 clients");
    }catch(err){
      console.error(err);
alert("Erreur de lecture. Essaie un autre encodage.");
      setStatus("Erreur import");
    }
  });
$("#btnBuild").addEventListener("click", ()=>{
    buildTransactions();
    try{ recalcAll(); }catch(e){}
    $("#btnSuggest").disabled = false;
    $("#btnApplyAliases").disabled = false;
  });
$("#btnSuggest").addEventListener("click", ()=>{
    // persist weak words text
    state.weakWords = $("#weakWords").value;
    LS.set("weakWords", state.weakWords);
    generateSuggestions();
  });
$("#btnClearAliases").addEventListener("click", ()=>{
    if(!confirm("Réinitialiser tous les alias + refus mémorisés ?")) return;
    state.aliases = {};
    state.noMerge = {};
    LS.set("aliases", state.aliases);
    LS.set("noMerge", state.noMerge);
    updateAliasTag();
    $("#suggestBody").innerHTML = `<tr><td colspan="13" class="muted">Alias réinitialisés. Regénère des suggestions.</td></tr>`;
  });
$("#btnApplyAliases").addEventListener("click", applyAliases);

  $("#btnSaveParams").addEventListener("click", saveParams);
  $("#btnRecalc").addEventListener("click", ()=>{
    recalcAll();
    $("#paramMsg").innerHTML = `<span class="ok">Recalcul terminé.</span>`;
  });
$("#btnRefreshTable").addEventListener("click", renderTable);
  $("#searchClient").addEventListener("input", debounce(renderTable, 150));
  $("#filterSegment").addEventListener("change", renderTable);
  $("#sortBy").addEventListener("change", renderTable);

  $("#btnExportClients").addEventListener("click", exportClients);
  $("#btnExportTx").addEventListener("click", exportTx);
  $("#btnBackKpi").addEventListener("click", ()=>switchView("tableau-bord"));

  // KPI detail → Voir ce filtre dans l’onglet Clients (modale)
  try{
    const btnApply = document.getElementById("btnApplyClientFilter");
    if(btnApply){
      btnApply.addEventListener("click", ()=>{
        try{
          const ap = state && state.ui ? state.ui.lastKpiApply : null;
          if(!ap) return;
          if(!state.ui) state.ui = {};
          if(ap.mode==="segment"){
            state.ui.clientExtraFilter = { type:"segment", seg: ap.segment };
            if(typeof renderClientsExtraFilterTag === "function") renderClientsExtraFilterTag();
            switchView("clients");
            if(typeof renderTable === "function") renderTable();
          }else if(ap.mode==="rfm"){
            state.ui.clientExtraFilter = { type:"rfm", dim: ap.dim, score: ap.score };
            if(typeof renderClientsExtraFilterTag === "function") renderClientsExtraFilterTag();
            switchView("clients");
            if(typeof renderTable === "function") renderTable();
          }
        }catch(e){}
      });
    }
  }catch(e){}


  // initial renders
  try{ ensureExtraMappingUI(); }catch(e){}
  try{ renderCommercialFilterUI(); }catch(e){}
  renderQuality();
renderDash();
  renderTable();
  updateExportTag(); try{ bindDomSortableTables(); }catch(e){}
  setStatus("Prêt","0 clients");

  // Dashboard: Masquer / Afficher Dormants (impacte les répartitions)
  const btnDorm = document.getElementById("btnToggleDormants");
if(btnDorm){
    // état initial
    btnDorm.classList.toggle("active", !!(state.ui && state.ui.hidePerdus));
    btnDorm.textContent = (state.ui && state.ui.hidePerdus) ?
"Afficher Perdus" : "Masquer Perdus";

    btnDorm.addEventListener("click", ()=>{
      state.ui.hidePerdus = !(state.ui && state.ui.hidePerdus);
      btnDorm.classList.toggle("active", state.ui.hidePerdus);
      btnDorm.textContent = state.ui.hidePerdus ? "Afficher Perdus" : "Masquer Perdus";
      renderDash(); // recalc visuel
    });
}


  // Init module Fiche Client (clic sur le NOM)
  if(window.__initClientCockpitModule) window.__initClientCockpitModule();
  if(window.__initALFREDCockpitModule) window.__initALFREDCockpitModule();
}

function debounce(fn, ms){
  let t=null;
  return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}




function setupAgencyHolidaysModal(){
  const btnOpen = document.getElementById("btnAgencyHolidays");
  const modal = document.getElementById("agencyHolidaysModal");
  const btnClose = document.getElementById("btnCloseAgencyHolidays");
  const rowsHost = document.getElementById("agencyHolidaysRows");
  const msgEl = document.getElementById("agencyHolidaysMsg");
  const btnAdd = document.getElementById("btnAgencyHolidaysAdd");
  const btnRestore = document.getElementById("btnAgencyHolidaysRestore");
  const btnSave = document.getElementById("btnAgencyHolidaysSave");

  if(!btnOpen || !modal || !btnClose || !rowsHost || !btnSave) return;

  let draft = JSON.parse(JSON.stringify(ECON_HOLIDAYS || ECON_HOLIDAYS_DEFAULT));

  const months = [
    {v:1,t:"01"},{v:2,t:"02"},{v:3,t:"03"},{v:4,t:"04"},{v:5,t:"05"},{v:6,t:"06"},
    {v:7,t:"07"},{v:8,t:"08"},{v:9,t:"09"},{v:10,t:"10"},{v:11,t:"11"},{v:12,t:"12"}
  ];

  function _opt(list, val){
    return list.map(o=>`<option value="${o.v}" ${(+val===+o.v)?"selected":""}>${o.t}</option>`).join("");
  }

  function _rowHtml(h, i){
    const sm = h?.start?.m||1, sd=h?.start?.d||1, em=h?.end?.m||1, ed=h?.end?.d||1;
    return `
      <div class="segRow" style="align-items:flex-end;gap:10px;flex-wrap:wrap;">
        <div style="min-width:110px;">
          <label>Début (MM/JJ)</label>
          <div style="display:flex;gap:8px;">
            <select data-k="sm" data-i="${i}" style="width:72px;">${_opt(months, sm)}</select>
            <input data-k="sd" data-i="${i}" type="number" min="1" max="31" value="${sd}" style="width:80px;"/>
          </div>
        </div>
        <div style="min-width:110px;">
          <label>Fin (MM/JJ)</label>
          <div style="display:flex;gap:8px;">
            <select data-k="em" data-i="${i}" style="width:72px;">${_opt(months, em)}</select>
            <input data-k="ed" data-i="${i}" type="number" min="1" max="31" value="${ed}" style="width:80px;"/>
          </div>
        </div>
        <div class="small muted" style="flex:1;min-width:220px;padding-bottom:6px;">
          Récurrent chaque année ${(+em < +sm) ? "(chevauche 2 années)" : ""}.
        </div>
        <button class="btn" data-act="del" data-i="${i}" title="Supprimer" style="padding:8px 10px;">🗑</button>
      </div>
    `;
  }

  function render(){
    rowsHost.innerHTML = (draft||[]).map((h,i)=>_rowHtml(h,i)).join("") || "<div class='small muted'>Aucune période.</div>";
    if(msgEl) msgEl.textContent = "";
  }

  function open(){
    draft = JSON.parse(JSON.stringify(ECON_HOLIDAYS || ECON_HOLIDAYS_DEFAULT));
    render();
    modal.classList.remove("hidden");
    modal.style.display = "flex";
  modal.style.pointerEvents = "auto";
  }
  function close(){ modal.style.display = "none"; }

  function syncFromDom(){
    const els = rowsHost.querySelectorAll("[data-k]");
    for(const el of els){
      const i = +el.getAttribute("data-i");
      const k = el.getAttribute("data-k");
      if(!draft[i]) continue;
      const v = +el.value;
      if(k==="sm") draft[i].start.m = v;
      if(k==="sd") draft[i].start.d = Math.max(1, Math.min(31, v));
      if(k==="em") draft[i].end.m = v;
      if(k==="ed") draft[i].end.d = Math.max(1, Math.min(31, v));
      // kind auto
      draft[i].kind = (draft[i].end.m < draft[i].start.m) ? "cross" : "fixed";
    }
  }

  btnOpen.addEventListener("click", (e)=>{ e.preventDefault(); open(); });
  btnClose.addEventListener("click", (e)=>{ e.preventDefault(); close(); });
  modal.addEventListener("click", (e)=>{ if(e.target === modal) close(); });

  rowsHost.addEventListener("input", ()=>{ syncFromDom(); });
  rowsHost.addEventListener("click", (e)=>{
    const b = e.target?.closest?.("button[data-act='del']");
    if(!b) return;
    const i = +b.getAttribute("data-i");
    draft.splice(i,1);
    render();
  });

  if(btnAdd){
    btnAdd.addEventListener("click",(e)=>{
      e.preventDefault();
      syncFromDom();
      draft.push({ kind:"fixed", start:{m:1,d:1}, end:{m:1,d:7} });
      render();
    });
  }

  if(btnRestore){
    btnRestore.addEventListener("click",(e)=>{
      e.preventDefault();
      draft = JSON.parse(JSON.stringify(ECON_HOLIDAYS_DEFAULT));
      render();
    });
  }

  btnSave.addEventListener("click",(e)=>{
    e.preventDefault();
    syncFromDom();
    try{
      const clean = _sanitizeEcoHolidays(draft);
      localStorage.setItem(ECON_HOLIDAYS_STORAGE_KEY, JSON.stringify(clean));
      ECON_HOLIDAYS = clean;
      if(msgEl) msgEl.textContent = "Enregistré. Les prochains calculs utiliseront ces congés.";
      // si tu veux immédiat : relance recalcul
      const btn = document.getElementById("btnRecalc");
      if(btn) btn.click();
    }catch(err){
      if(msgEl) msgEl.textContent = "Erreur: congés non enregistrés.";
    }
  });
}

function setupStrategicTabs(){
  // Hook historique : certaines versions avaient des "tabs" internes au cockpit stratégique.
  // Ici : no-op sécurisé + rendu initial si besoin.
  try{
    if(typeof state === "undefined") return;
    state.ui = state.ui || {};
    if(state.ui.view === "pilotage-co"){
      try{ renderPilotageCo(); }catch(e){}
    }
  }catch(e){}
}




window.addEventListener("DOMContentLoaded", () => {
  init();

/* === UI HOME + PARCOURS D'ENTRÉE (UI uniquement, sans moteur métier) === */
(function(){
  const $$ = (q)=>document.querySelector(q);
  const $$$ = (q)=>Array.from(document.querySelectorAll(q));

  function _hasSession(){
    try{
      // Heuristique UI : une session est considérée présente si des transactions existent
      return (state && Array.isArray(state.tx) && state.tx.length>0) || (state && Array.isArray(state.clients) && state.clients.length>0);
    }catch(e){ return false; }
  }

  function setBodyMode(mode){
    document.body.classList.toggle("mode-home", mode==="home");
    document.body.classList.toggle("mode-entry", mode==="entry");
  }

  function setTabsAllowed(allowedViews){
    const allowed = new Set(allowedViews||[]);
    $$$('#tabs .tab').forEach(t=>{
      const v = t.getAttribute("data-view") || "";
      // tabs "home" n'existent pas : on cache/affiche seulement les tabs connus
      t.classList.toggle("hidden", !allowed.has(v));
    });
  }

  function updateHomeStatus(){
    const hs = $$("#homeStatusTxt");
    const hm = $$("#homeStatusMeta");
    const st = $$("#statusTxt");
    const sm = $$("#statusMeta");
    if(hs && st) hs.textContent = st.textContent || "Prêt";
    if(hm && sm) hm.textContent = sm.textContent || "0 clients";
  }

  function enterHome(){
    setBodyMode("home");
    setTabsAllowed(["import","dedupe","tableau-bord","dash","clients","pilotage-co","alfred","objectifs","categories","params"]); // conserve la hauteur du bandeau
    if(typeof switchView==="function") switchView("home");
    updateHomeStatus();
    const btnResume = $$("#btnHomeResume");
    if(btnResume){
      const ok = _hasSession();
      btnResume.style.opacity = ok ? "1" : ".45";
      btnResume.style.pointerEvents = ok ? "auto" : "none";
    }
  }

  function enterPreDashboard(){
    setBodyMode("entry");
    // Affiche seulement Import + Normalisation
    setTabsAllowed(["import","dedupe","home","objectifs"]);
    if(typeof switchView==="function") switchView("import");
    updateHomeStatus();
  }

  function enterApp(view){
    setBodyMode("app");
    // Tabs visibles après entrée : Dashboard | Clients | Pilotage Commercial | ALFRED | Référenciel | Paramétrage
    setTabsAllowed(["tableau-bord","dash","clients","pilotage-co","alfred","objectifs","categories","params","home"]);
    if(typeof switchView==="function") switchView(view || (document.querySelector('.tab[data-view="tableau-bord"]') ? "tableau-bord" : "dash"));
    updateHomeStatus();
  }

  function showEntryAsk(){
    const box = $$("#entryAsk");
    if(!box) return;
    box.style.display = "block";
  }
  function hideEntryAsk(){
    const box = $$("#entryAsk");
    if(!box) return;
    box.style.display = "none";
  }

  // Bind home tiles
  (function bindEntryUi(){
    const bStart = $$("#btnHomeStart");
    const bResume = $$("#btnHomeResume");
    const bReset = $$("#btnHomeReset");

    function hasDatasetLoaded(){
      try{
        return Array.isArray(state.tx) && state.tx.length>0;
      }catch(_e){ return false; }
    }

    function goResume(){
      // Si aucune donnée n'est chargée, on bascule automatiquement sur l'import
      if(hasDatasetLoaded()) enterApp(document.querySelector('.tab[data-view="tableau-bord"]') ? "tableau-bord" : "dash");
      else enterPreDashboard();
    }

    function hardReset(){
      if(!confirm("Réinitialiser (support) ?\n\n- Efface la session (CSV et calculs en mémoire)\n- Recharge l'app proprement\n- Les alias restent enregistrés")) return;

      // reset mémoire (équivalent Réinitialiser la session dans Import)
      try{
        state.rawText=""; state.rawRows=[]; state.headers=[]; state.tx=[]; state.clients=[];
        __resetComputedState();
        state.quality={lines:0,parsed:0,valid:0,invalid:0,clients:0,minDate:null,maxDate:null,sum:0};
      }catch(_e){}

      // petit ménage UI si présent
      try{
        const el = (sel)=>{ try{return document.querySelector(sel);}catch(e){return null;} };
        const t = el("#importTag"); if(t) t.textContent="Aucun fichier";
        const fi = el("#fileInput"); if(fi) fi.value="";
        const info = el("#fileInfo"); if(info) info.textContent="";
      }catch(_e){}

      // Anti-cache: change le token, puis reload (force rechargement de TOUS les JS via index loader)
      try{ localStorage.setItem("ALFRED_CACHE_BUST", String(Date.now())); }catch(_e){}
      try{ location.reload(); }catch(_e){}
    }

    if(bStart){
      bStart.addEventListener("click", ()=> enterPreDashboard());
      bStart.addEventListener("keydown", (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); enterPreDashboard(); }});
    }
    if(bResume){
      bResume.addEventListener("click", goResume);
      bResume.addEventListener("keydown", (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); goResume(); }});
    }
    if(bReset){
      bReset.addEventListener("click", hardReset);
      bReset.addEventListener("keydown", (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); hardReset(); }});
    }

    // bouton raccourci vers Normalisation (Import)
    const bDed = $$("#btnGoDedupe");
    if(bDed){
      bDed.addEventListener("click", ()=>{ try{ if(typeof switchView==="function") switchView("dedupe"); }catch(e){} });
    }

    // Flyout non-bloquant
    const ask = $$("#entryAsk");
    const askClose = $$("#btnEntryAskClose");
    const askYes = $$("#btnEntryAskYes");
    const askNo = $$("#btnEntryAskNo");
    if(askClose) askClose.addEventListener("click", ()=> ask.classList.remove("show"));
    if(askYes) askYes.addEventListener("click", ()=>{ ask.classList.remove("show"); enterPreDashboard(); });
    if(askNo) askNo.addEventListener("click", ()=>{ ask.classList.remove("show"); enterApp(document.querySelector('.tab[data-view="tableau-bord"]') ? "tableau-bord" : "dash"); });
  })();

  // Hook après build dataset : active le bouton central (UI uniquement)
  function __isDatasetReady(){
    try{ return (typeof state!=="undefined" && state && Array.isArray(state.tx) && state.tx.length>0); }catch(e){ return false; }
  }
  function __updateEntryCta(){
    const cta = document.getElementById("entryCta");
    if(!cta) return;
    const ok = __isDatasetReady();
    cta.disabled = !ok;
    cta.setAttribute("aria-disabled", ok ? "false" : "true");
    cta.classList.toggle("is-ready", ok);
    cta.textContent = ok ? "Continuer vers le Dashboard" : "Dataset requis";
  }
  try{
    const b = document.getElementById("btnBuild");
    if(b && !b.dataset.uiBound){
      b.addEventListener("click", ()=>{ setTimeout(__updateEntryCta, 0); setTimeout(__updateEntryCta, 250); });
      b.dataset.uiBound = "1";
    }
  }catch(e){}
  try{ __updateEntryCta(); }catch(e){}

  

  // CTA pré-dashboard : entrer dans l'app uniquement si le dataset est prêt
  try{
    const cta = document.getElementById("entryCta");
    if(cta && !cta.dataset.bound){
      cta.addEventListener("click", ()=>{
        try{
          if(typeof __isDatasetReady === "function" && __isDatasetReady()){
            enterApp(document.querySelector('.tab[data-view="tableau-bord"]') ? "tableau-bord" : "dash");
          }else{
            console.warn("[Entry] Dataset requis avant d'entrer sur le Dashboard.");
            try{ __updateEntryCta(); }catch(_e){}
          }
        }catch(err){
          console.error("[Entry] click error:", err);
        }
      });
      cta.dataset.bound = "1";
    }
  }catch(e){}
// Sécurise : si l'utilisateur clique un onglet "interdit" en pré-dashboard, on l'empêche visuellement
  try{
    const tabsEl = document.getElementById("tabs");
    if(tabsEl && !tabsEl.dataset.uiGuard){
      tabsEl.addEventListener("click", (e)=>{
        if(!e || !e.target) return;
        const t = e.target.closest(".tab");
        if(!t) return;
        if(t.classList.contains("hidden")){
          e.preventDefault(); e.stopPropagation();
        }
      }, true);
      tabsEl.dataset.uiGuard = "1";
    }
  }catch(e){}
})();

  setupModalTableSort();
  setupAgencyHolidaysModal();
  setupStrategicTabs();

  // Active le tri par clic sur colonnes (▲/▼)
  setupSortableTable("clientsBody","sortClients",['name', 'segment', 'tf', 'scoreR', 'scoreF', 'scoreM', 'rfm', 'tdPct', 'lastISO', 'recencyDays', 'frequency', 'monetaryHT', 'annualAvgHT'],['str', 'str', 'num', 'num', 'num', 'num', 'str', 'date', 'num', 'num', 'num', 'num'], ()=>renderTable());
  setupSortableTable("kpiBody","sortKpi",['name', 'segment', 'tf', 'scoreR', 'scoreF', 'scoreM', 'rfm', 'tdPct', 'lastISO', 'recencyDays', 'frequency', 'monetaryHT', 'annualAvgHT'],['str', 'str', 'num', 'num', 'num', 'num', 'str', 'date', 'num', 'num', 'num', 'num'], ()=>{ if(state.ui && state.ui.lastKpiId) openKpiDetail(state.ui.lastKpiId); });


  // Ouvrir / fermer la modale "Réglages Segments"
  const ov = document.getElementById("segmentSettingsModal");
  const btnOpen = document.getElementById("btnOpenSegmentSettings");
  if (btnOpen) btnOpen.addEventListener("click", openSettings); // Fallback if no specific button, but usually there's one. Actually, wait. The user has buttons inside the Params tab.
  // The provided code didn't show a specific "Open Settings Modal" button in the HTML structure provided, 
  // but there are bindings for it in the JS block. I'll keep the bindings.

  const btnClose = 
document.getElementById("btnCloseSettings");
  if (btnClose) btnClose.addEventListener("click", closeSettings);

  // clic sur le fond = fermer
  if (ov) {
    ov.addEventListener("click", (e) => {
      if (e.target === ov) closeSettings();
    });
  }

// Boutons modale Réglages Segments
const bs = document.getElementById("btnSaveSettings");
if(bs) bs.addEventListener("click", saveSegmentSettings);

const br = document.getElementById("btnRestoreDefaultsSegments");
if(br) br.addEventListener("click", restoreDefaultSegments);

const brr = document.getElementById("btnRecalcFromSettings");
if(brr) brr.addEventListener("click", recalcFromSettings);

const breset = document.getElementById("btnResetApp");
if(breset) breset.addEventListener("click", ()=>{
  if(confirm("Reset APP (V3.54) : effacer les données locales de cette version (imports, réglages, aliases) ?")){
    LS.clearAll();
    location.reload();
  }
});

  // ESC = fermer
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSettings();
  });
});



function readSegmentSettingsToParams(){
  const p = {...(state.params || defaultParams())};
const getNum = (id, def=0)=>{
    const el = document.getElementById(id);
    if(!el) return def;
const v = (el.value ?? "").toString().trim();
    if(v==="") return def;
    const n = Number(v);
    return isFinite(n) ? n : def;
  };
const getInt = (id, def=0)=> Math.round(getNum(id, def));
  const getStr = (id, def="")=>{
    const el = document.getElementById(id);
const v = el ? (el.value ?? "") : "";
    return (v==null || v==="") ? def : String(v);
  };
// VIP / TF
  p.vipRMin = getInt("vipRMin", p.vipRMin ?? 4);
  p.vipFMin = getInt("vipFMin", p.vipFMin ?? 4);
p.vipMMin = getInt("vipMMin", p.vipMMin ?? 4);
  p.vipTfFragile = getNum("vipTfFragile", isFinite(p.vipTfFragile)? p.vipTfFragile : -0.20);
  p.tfWindow = getInt("tfWindow", p.tfWindow ?? 3);
p.tfMode = getStr("tfMode", p.tfMode ?? "ratio");

  // Nouveaux / Potentiels / Risque / Dormants
  p.newR = getInt("newR", p.newR ?? 5);
p.newF = getInt("newF", p.newF ?? 1);

  p.potRMin = getInt("potRMin", p.potRMin ?? 4);
  p.potMMin = getInt("potMMin", p.potMMin ?? 3);
p.potFMax = getInt("potFMax", p.potFMax ?? 3);

  p.riskRMax = getInt("riskRMax", p.riskRMax ?? 2);
  p.riskFMin = getInt("riskFMin", p.riskFMin ?? 3);
p.riskMMin = getInt("riskMMin", p.riskMMin ?? 3);
  p.riskMode = getStr("riskMode", p.riskMode ?? "OR");

  p.dormantFMax = getInt("dormantFMax", p.dormantFMax ?? 2);
p.dormantDaysMin = getInt("dormantDaysMin", p.dormantDaysMin ?? 0);

  // mini-cohérence
  const msg = document.getElementById("settingsMsg");
if(p.vipRMin<1 || p.vipRMin>5 || p.vipFMin<1 || p.vipFMin>5 || p.vipMMin<1 || p.vipMMin>5){
    if(msg) msg.innerHTML = '<span class="danger">Valeurs VIP invalides.</span>';
return null;
  }
  return p;
}

function saveSegmentSettings(){
  const p = readSegmentSettingsToParams();
  if(!p) return;
  state.params = p;
  LS.set("params", state.params);
const msg = document.getElementById("settingsMsg");
  if(msg) msg.innerHTML = '<span class="ok">Réglages enregistrés.</span>';
}

function restoreDefaultSegments(){
  const base = defaultParams();
// on ne touche pas aux paramètres généraux (période, date ref, etc.) si déjà définis
  const keep = {...(state.params || {})};
const merged = {...base, ...keep};
  // mais on force le retour aux défauts UNIQUEMENT sur la partie segmentation
  [
    "vipRMin","vipFMin","vipMMin","vipTfFragile","tfWindow","tfMode",
    "newR","newF","potRMin","potMMin","potFMax",
    "riskRMax","riskFMin","riskMMin","riskMode",
    "dormantFMax","dormantDaysMin"
  ].forEach(k=> merged[k] = base[k]);
state.params = merged;
  LS.set("params", state.params);
  initSettingsUI();
  const msg = document.getElementById("settingsMsg");
  if(msg) msg.innerHTML = '<span class="ok">Défauts restaurés.</span>';
}

function recalcFromSettings(){
  saveSegmentSettings();
recalcAll();
  const msg = document.getElementById("settingsMsg");
  if(msg) msg.innerHTML = '<span class="ok">Recalcul terminé.</span>';
}





const SEGMENT_DEFINITIONS = {
  "VIP Solides": { desc: "Gros clients stratégiques, actifs et stables.", criteria: "Récence ≥ 4 • Fréquence ≥ 4 • Montant ≥ 4 • Tendance ≥ -15 %" },
  "VIP Fragiles": { desc: "Gros clients encore actifs mais en baisse significative.", criteria: "Récence ≥ 3 • Fréquence ≥ 4 • Montant ≥ 4 • Tendance ≤ -15 %" },
  "Réguliers": { desc: "Clients installés dans le temps avec une activité stable.", criteria: "Ancienneté ≥ 9 mois • ≥ 3 commandes • Récence ≥ 3" },
 
 "Potentiels": { desc: "Clients récents en phase d’essai ou de développement.", criteria: "Ancienneté < 9 mois • Récence ≥ 3" },
  "Nouveaux": { desc: "Client ayant réalisé sa première commande récemment.", criteria: "1 commande • Dernier achat < 9 mois" },
  "Occasionnels": { desc: "Client ayant passé une seule commande sans suite.", criteria: "1 commande • Dernier achat entre 9 et 12 mois" },
  "À risque": { desc: "Client historiquement engagé dont l’activité diminue fortement.", criteria: "Ancienneté ≥ 9 mois • ≥ 3 commandes • Récence ≤ 2 ou Tendance ≤ -20 %" },
  "Perdus": 
{ desc: "Client sans commande depuis longtemps.", criteria: "Dernière facture > 365 jours" },
  "Occasionnels": { desc: "Petit compte peu engagé, achats rares ou isolés.", criteria: "1 à 2 commandes (hors segments ci‑dessus)" }
};
function openSegmentInfo(seg){
  const def = SEGMENT_DEFINITIONS[seg];
  if(!def) return;

  document.getElementById("segmentInfoTitle").textContent = seg;
  document.getElementById("segmentInfoDesc").textContent = def.desc;
  document.getElementById("segmentInfoCriteria").textContent = def.criteria;
const modal = document.getElementById("segmentInfoModal");
  // ensure re-open works even if a "hidden" class was added by generic overlay closer
  modal.classList.remove("hidden");
  modal.style.display = "flex";
  modal.style.pointerEvents = "auto";

  document.getElementById("btnViewSegmentClients").onclick = function(){
    modal.style.display = "none";
state.ui.clientExtraFilter = { type: "segment", seg };
    if(typeof renderClientsExtraFilterTag === "function") renderClientsExtraFilterTag();
    switchView("clients");
    renderTable();
  };
}

(() => {
  const __btn = document.getElementById("btnCloseSegmentInfo");
  const __modal = document.getElementById("segmentInfoModal");
  if(__btn && __modal){
    __btn.onclick = function(){ __modal.style.display = "none"; __modal.style.pointerEvents = "none"; };
  }
})();;

// Clean segment click binding
document.addEventListener("DOMContentLoaded", function(){
  const segBox = document.getElementById("segBars");
  if(!segBox) return;
  segBox.onclick = function(e){
    if(e.target && e.target.closest && e.target.closest(".metaSeg")) return;

    const row = e.target.closest(".barrow.clickable");
    if(!row) return;
    const seg = row.dataset.seg;
    if(!seg) return;

    if(typeof openKpiSegment === "function") openKpiSegment(seg);
    else if(typeof openSegmentInfo === "function") openSegmentInfo(seg);
  };
});

document.addEventListener("click", function(e){
  const btn = e.target && e.target.closest ? e.target.closest(".metaSeg") : null;
  if(!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const seg = btn.getAttribute("data-meta-seg") || "";
  if(seg && typeof openSegmentInfo === "function") openSegmentInfo(seg);
}, true);

document.addEventListener("DOMContentLoaded", function(){
  const sel = document.getElementById("segSort");
  if(!sel) return;
  if(!state.ui) state.ui = {};
  sel.value = state.ui.segSort || "prio";
  sel.addEventListener("change", function(){
    state.ui.segSort = sel.value;
    renderDash();
  });
});
/** =========================
 * Column sorting (click on headers)
 * ========================= */
function _parseSortableValue(txt){
  const t = (txt||"").toString().trim();
if(!t || t==="—" || t==="NC") return {type:"empty", v:null};

  // Date dd/mm/yyyy
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(t)){
    const [dd,mm,yyyy]=t.split("/").map(x=>parseInt(x,10));
return {type:"num", v: new Date(yyyy,mm-1,dd).getTime()};
  }

  // Percent
  if(/^-?\d+(\.\d+)?%$/.test(t)){
    return {type:"num", v: parseFloat(t.replace("%",""))};
}

  // Euro / numbers with spaces / NBSP
  const cleaned = t
    .replace(/\u202f/g," ")          // narrow no-break space
    .replace(/\u00a0/g," ")          // nbsp
    .replace(/[€]/g,"")
    .replace(/\s/g,"")
    .replace(",",".");
if(/^-?\d+(\.\d+)?$/.test(cleaned)){
    return {type:"num", v: parseFloat(cleaned)};
  }

  return {type:"str", v:t.toLowerCase()};
}

function makeTableSortable(table){
  if(!table) return;
const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  if(!thead || !tbody) return;

  const ths = Array.from(thead.querySelectorAll("th"));
ths.forEach((th, idx)=>{
    th.classList.add("sortable");
    th.addEventListener("click", ()=>{
      // Toggle direction for this column; reset others
      const cur = th.getAttribute("data-dir");
      const dir = (cur==="asc") ? "desc" : "asc";
      ths.forEach(h=>{ if(h!==th){ h.removeAttribute("data-dir"); }});
      th.setAttribute("data-dir", dir);

      const rows = Array.from(tbody.querySelectorAll("tr"));
      const withVal = rows.map((tr, i)=>{
        const td = tr.children[idx];
        const 
val = td ? _parseSortableValue(td.textContent) : {type:"empty", v:null};
        return {tr, i, val};
      });

      withVal.sort((a,b)=>{
        // Empty always last
        const ae = (a.val.type==="empty");
        const be = (b.val.type==="empty");
        if(ae && be) return a.i-b.i;
        if(ae) return 1;
        if(be) return -1;

     
   // Numbers first compare as numbers, else strings
        if(a.val.type==="num" && b.val.type==="num"){
          return dir==="asc" ?
(a.val.v-b.val.v) : (b.val.v-a.val.v);
        }
        // Mixed: compare as strings
        const av = (a.val.v??"").toString();
const bv = (b.val.v??"").toString();
        const c = av.localeCompare(bv, "fr", {numeric:true, sensitivity:"base"});
        return dir==="asc" ? c : -c;
      });
// Re-append
      const frag = document.createDocumentFragment();
      withVal.forEach(o=>frag.appendChild(o.tr));
      tbody.appendChild(frag);
    });
  });
}


/* =========================
 * Réglages Auto (Frequency / Monetary)
 * - Ouvre une modale et propose des seuils basés sur les moyennes (KPI Paramétrage)
 * ========================= */
function fmtComma2(n){
  return (Number.isFinite(n)? n.toFixed(2).replace(".",",") : "—");
}
function openAutoSettingsModal(){
  // Nouvelle fonction (robuste): s'assure que la modale est attachée au <body>
  let ov = document.getElementById("autoSettingsModal");

  // Si la modale n'est pas trouvée (ou HTML cassé), on ne plante pas : on stoppe proprement.
  if(!ov){
    console.warn("[AppRFM] autoSettingsModal introuvable.");
    return;
  }

  // IMPORTANT : dans certains cas, la modale peut être injectée dans une autre modale (HTML non fermé).
  // On la "remonte" au niveau du body pour garantir l'affichage.
  try{
    if(ov.parentElement !== document.body){
      document.body.appendChild(ov);
    }
  }catch(e){}

  // Pré-remplir depuis les KPI (déjà calculés dans renderParamsKPI)
  const favg = Number(state.statsAvgF);
  const mavg = Number(state.statsAvgM);
  const bask = Number(state.statsAvgBasket);

  const elF = document.getElementById("autoFavg");
  const elM = document.getElementById("autoMavg");
  const elB = document.getElementById("autoBasket");

  if(elF) elF.value = (Number.isFinite(favg)? favg.toFixed(2) : "");
  if(elM) elM.value = (Number.isFinite(mavg)? String(Math.round(mavg)) : "");
  if(elB) elB.value = (Number.isFinite(bask)? String(Math.round(bask)) : "");

  computeAutoPreset(true);
  ov.classList.remove("hidden");
  ov.style.display = "flex";
  ov.style.pointerEvents = "auto";
}

function closeAutoSettings(){
  const ov = document.getElementById("autoSettingsModal");
  if(ov) ov.style.display = "none";
}

function computeAutoPreset(forceOverwrite){
  const msg = document.getElementById("autoSettingsMsg");
  const favg = Number(document.getElementById("autoFavg")?.value);
  const mavg = Number(document.getElementById("autoMavg")?.value);
  const bask = Number(document.getElementById("autoBasket")?.value);

  // Frequency
  const F1 = 1;
  const F3 = favg;
  const F2 = (F1 + F3) / 2;
  const F4 = (F3 - F2) * 2 + F3; // équivalent: 2*F3 - 1

  const setF = (id, v)=>{
    const el = document.getElementById(id);
    if(!el) return;
    if(forceOverwrite || el.value==="") el.value = (Number.isFinite(v)? v.toFixed(2) : "");
  };
  setF("autoF1", F1);
  setF("autoF2", F2);
  setF("autoF3", F3);
  setF("autoF4", F4);

  const disp = document.getElementById("autoFavgDisp");
  if(disp) disp.textContent = fmtComma2(favg);

  // Monetary (arrondi à l'euro)
  const M1 = bask;
  const M3 = mavg;
  const M2 = (M1 + M3) / 2;
  const M4 = (M3 - M2) * 2 + M3; // équivalent: 2*M3 - M1

  const roundE = (x)=> Number.isFinite(x) ? Math.round(x) : NaN;
  const setM = (id, v)=>{
    const el = document.getElementById(id);
    if(!el) return;
    if(forceOverwrite || el.value==="") el.value = (Number.isFinite(v)? String(roundE(v)) : "");
  };
  setM("autoM1", M1);
  setM("autoM2", M2);
  setM("autoM3", M3);
  setM("autoM4", M4);

  if(msg){
    if(!Number.isFinite(favg) || !Number.isFinite(mavg) || !Number.isFinite(bask)){
      msg.innerHTML = '<span class="bad">Charge un fichier + fais un recalcul pour obtenir les moyennes.</span>';
    }else{
      const mode = (state.statsAvgFMode==="monthly") ? "mensuelle" : "annuelle";
      msg.innerHTML = `<span class="ok">Base utilisée : F_avg ${fmtComma2(favg)} (${mode}) • M_avg ${fmtInt(roundE(mavg))} € • Basket_avg ${fmtInt(roundE(bask))} €</span>`;
    }
  }
}

function applyAutoPresetToParams(){
  // Lire les valeurs modale
  const readNum = (id)=> Number(document.getElementById(id)?.value);
  const readInt = (id)=> Math.round(Number(document.getElementById(id)?.value));

  const f1 = readNum("autoF1");
  const f2 = readNum("autoF2");
  const f3 = readNum("autoF3");
  const f4 = readNum("autoF4");

  const m1 = readInt("autoM1");
  const m2 = readInt("autoM2");
  const m3 = readInt("autoM3");
  const m4 = readInt("autoM4");

  // Injecter dans l'onglet Paramétrage (inputs existants)
  const setVal = (id, v)=>{
    const el = document.getElementById(id);
    if(!el) return;
    if(v==null || !Number.isFinite(v)) return;
    // inputs number: valeur avec point
    if(id.startsWith("f")) el.value = Number(v).toFixed(2);
    else el.value = String(Math.round(v));
  };

  setVal("f1", f1); setVal("f2", f2); setVal("f3", f3); setVal("f4", f4);
  setVal("m1", m1); setVal("m2", m2); setVal("m3", m3); setVal("m4", m4);

  // Mettre à jour state.params sans forcer "Enregistrer" (cohérence UI) + message
  try{
    if(!state.params) state.params = defaultParams();
    ["f1","f2","f3","f4"].forEach(k=>{ const el=document.getElementById(k); if(el) state.params[k]=Number(el.value); });
    ["m1","m2","m3","m4"].forEach(k=>{ const el=document.getElementById(k); if(el) state.params[k]=Number(el.value); });
    LS.set("params", state.params);
  }catch(e){}

  const pm = document.getElementById("paramMsg");
  if(pm) pm.innerHTML = '<span class="ok">Réglages Auto intégrés (tu peux Recalculer).</span>';

  closeAutoSettings();
}

// Bind UI (safe)
document.addEventListener("DOMContentLoaded", ()=>{
  const btn = document.getElementById("btnRestoreStdDefaults");
  if(btn){
    btn.addEventListener("click", ()=>{
      try{ openAutoSettingsModal(); }catch(e){ console.error(e); alert("Impossible d’ouvrir Réglages Auto (console)."); }
    });
  }
  const ov = document.getElementById("autoSettingsModal");
  const c = document.getElementById("btnCloseAutoSettings");
  if(c) c.addEventListener("click", closeAutoSettings);
  if(ov){
    ov.addEventListener("click", (e)=>{ if(e.target===ov) closeAutoSettings(); });
  }
  document.addEventListener("keydown", (e)=>{
    const ov2 = document.getElementById("autoSettingsModal");
    if(e.key==="Escape" && ov2 && ov2.style.display==="flex") closeAutoSettings();
  });

  const br = document.getElementById("btnAutoRecalc");
  if(br) br.addEventListener("click", ()=>computeAutoPreset(true));

  ["autoFavg","autoMavg","autoBasket"].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener("input", ()=>computeAutoPreset(false));
  });

  const ba = document.getElementById("btnAutoApply");
  if(ba) ba.addEventListener("click", applyAutoPresetToParams);
});

document.addEventListener("DOMContentLoaded", ()=>{
  makeTableSortable(document.querySelector("#view-clients table"));
  makeTableSortable(document.querySelector("#view-kpi table"));
  makeTableSortable(document.querySelector("#view-import table"));
});



// Mode d'affichage (4e carte) : "season" (Saisonnalité) ou "basket" (Panier moyen mensuel)
window.__cdSeaBasketMode = window.__cdSeaBasketMode || "season";
var __cdSeaBasketMode = window.__cdSeaBasketMode;

// --- Helper global: monthsBetweenISO (utilisé par la fiche client) ---
window.monthsBetweenISO = window.monthsBetweenISO || function(firstISO, asOfDate){
  try{
    if(!firstISO) return 0;
    const y1 = parseInt(String(firstISO).slice(0,4),10);
    const m1 = parseInt(String(firstISO).slice(5,7),10)-1;
    const y2 = asOfDate.getUTCFullYear();
    const m2 = asOfDate.getUTCMonth();
    const months = (y2 - y1)*12 + (m2 - m1);
    return Math.max(0, months);
  }catch(e){ return 0; }
};



(function(){
  const text = "Cette prévision dépend de l’historique analysé. Pour une estimation plus fiable, privilégie un historique de 3 ans.";
  const target = document.querySelector("#kpiForecast3m") || 
                 Array.from(document.querySelectorAll("div")).find(el => (el.textContent||"").includes("Prévisionnel 3 mois"));
if(!target) return;

  const tip = document.createElement("div");
  tip.className = "custom-tooltip";
  tip.textContent = text;
  document.body.appendChild(tip);

  target.style.cursor = "help";

  target.addEventListener("mouseenter", e => {
    tip.style.opacity = "1";
  });

  target.addEventListener("mousemove", e => {
    tip.style.left = (e.clientX + 15) + "px";
    tip.style.top = (e.clientY + 15) + "px";
  });

  target.addEventListener("mouseleave", () => {
    tip.style.opacity = "0";
  });
})();;



(function(){
  function isVisible(el){
    if(!el) return false;
    const st = window.getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  }
  function bindCloseIn(container){
    if(!container) return false;
    const btns = Array.from(container.querySelectorAll("button"));
    const closeBtn = btns.find(b => (b.textContent||"").trim().toLowerCase() === "fermer");
    if(!closeBtn) return false;
    if(closeBtn.__wiredClose) return true;
    closeBtn.__wiredClose = true;

    closeBtn.addEventListener("click", function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      if(typeof window.closeSegmentsInfoModal === "function") { window.closeSegmentsInfoModal(); return; }
      if(typeof window.closeSegmentInfoModal === "function") { window.closeSegmentInfoModal(); return; }
      const ov = container.closest(".overlay") || container.closest(".modal") || container;
      ov.style.display = "none";
      ov.classList.add("hidden");
    });
    return true;
  }

  function findSegInfoOverlay(){
    const candidates = Array.from(document.querySelectorAll("[id*='seg'][id*='modal'], [id*='seg'][id*='overlay'], .overlay, .modal, [role='dialog']"));
    for(const el of candidates){
      if(!isVisible(el)) continue;
      const txt = (el.innerText || "").toLowerCase();
      if(txt.includes("segments") && (txt.includes("crit") || txt.includes("conditions") || txt.includes("explication") || txt.includes("règle") || txt.includes("regle"))){
        return el;
      }
    }
    return null;
  }

  function attempt(){
    const direct = document.getElementById("segmentsInfoModal") || document.getElementById("segmentInfoModal") ||
                   document.getElementById("overlay-segments-info") || document.getElementById("overlay-seg-info");
    if(direct) bindCloseIn(direct);
    const ov = findSegInfoOverlay();
    if(ov) bindCloseIn(ov);
  }

  document.addEventListener("click", function(){
    setTimeout(attempt, 0);
  }, true);

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", attempt);
  } else {
    attempt();
  }
})();;


/** =========================
 * Actions commerciales (sélection partagée dans l'app)
 * - clé stable: nom canonique client (pas d'ID)
 * - persistance: localStorage (ALFRED_ACTIONS_COMMERCIALES_V1)
 * - synchro UI: event window "actionsCommercialesChanged"
 * - export: Excel .xls (HTML) lisible dans Excel
 * ========================= */
(function(){
  "use strict";
  const KEY = "ALFRED_ACTIONS_COMMERCIALES_V1";

  function _read(){
    try{
      const raw = window.localStorage ? window.localStorage.getItem(KEY) : null;
      if(!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj==="object") ? obj : {};
    }catch(e){ return {}; }
  }
  function _write(map){
    try{ if(window.localStorage) window.localStorage.setItem(KEY, JSON.stringify(map||{})); }catch(e){}
  }
  function getSelected(){
    const m = _read();
    return Object.keys(m||{}).filter(k=>m[k]);
  }
  function isChecked(name){
    const k = String(name||"").trim();
    if(!k) return false;
    const m = _read();
    return !!m[k];
  }
  function set(name, checked){
    const k = String(name||"").trim();
    if(!k) return false;
    const m = _read();
    if(checked) m[k] = true; else delete m[k];
    _write(m);
    try{ window.dispatchEvent(new CustomEvent("actionsCommercialesChanged",{detail:{client:k, checked:!!checked}})); }catch(e){}
    return true;
  }
  function toggle(name){
    const k = String(name||"").trim();
    if(!k) return false;
    const m = _read();
    const next = !m[k];
    if(next) m[k] = true; else delete m[k];
    _write(m);
    try{ window.dispatchEvent(new CustomEvent("actionsCommercialesChanged",{detail:{client:k, checked:next}})); }catch(e){}
    return next;
  }
  function _fmt2(n){ return String(n).padStart(2,"0"); }
  function _todayFR(){
    const d = new Date();
    return _fmt2(d.getDate())+"-"+_fmt2(d.getMonth()+1)+"-"+d.getFullYear();
  }
  function _esc(v){
    v = (v==null) ? "" : String(v);
    return v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function _downloadExcelHtml(filename, html){
    const blob = new Blob([html], {type:"application/vnd.ms-excel;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 800);
  }

  // Export Excel (.xls HTML) — colonnes futures (téléphone/mail/adresse/marge) si dispo dans state.clients
  function exportXls(){
    const selected = getSelected();
    if(!selected.length){
      alert("Aucun client sélectionné (Action commerciale).");
      return;
    }
    const clients = (window.state && Array.isArray(window.state.clients)) ? window.state.clients : [];
    const byName = new Map();
    for(const c of clients){
      const nm = String(c && c.name || "").trim();
      if(nm) byName.set(nm, c);
    }

    const rows = selected.map(nm=>{
      const c = byName.get(nm) || {};
      const phone = (c.phone ?? c.telephone ?? c.tel ?? "");
      const mail  = (c.mail ?? c.email ?? "");
      const adr   = (c.adresse ?? c.address ?? "");
      const marge = (c.marge ?? c.margin ?? "");
      const seg   = (c.segment ?? "");
      return { nm, seg, phone, mail, adr, marge };
    });

    const today = _todayFR();
    const filename = `Actions commerciales fixe le (${today}).xls`;

    const html = `
      <html><head><meta charset="utf-8"/></head><body>
        <table border="1" cellspacing="0" cellpadding="4">
          <thead>
            <tr>
              <th>Client</th><th>Segment</th><th>Téléphone</th><th>Mail</th><th>Adresse</th><th>Marge</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r=>`
              <tr>
                <td>${_esc(r.nm)}</td>
                <td>${_esc(r.seg)}</td>
                <td>${_esc(r.phone)}</td>
                <td>${_esc(r.mail)}</td>
                <td>${_esc(r.adr)}</td>
                <td>${_esc(r.marge)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </body></html>
    `;
    _downloadExcelHtml(filename, html);
  }

  window.ActionsCommerciales = { KEY, getSelected, isChecked, set, toggle, exportXls };
})();


/* === Paramétrage : Réglages avancés (délégation events, robuste SPA) === */
(function(){
  if(window.__alfredSegSettingsDelegated) return;
  window.__alfredSegSettingsDelegated = true;

  document.addEventListener("click", function(ev){
    const t = ev.target;
    const openBtn = t && t.closest ? t.closest("#btnOpenSegmentSettings") : null;
    if(openBtn){
      ev.preventDefault();
      if(typeof openSettings === "function") openSettings();
      return;
    }

    const closeBtn = t && t.closest ? t.closest("#btnCloseSettings") : null;
    if(closeBtn){
      ev.preventDefault();
      if(typeof closeSettings === "function") closeSettings();
      return;
    }

    const saveBtn = t && t.closest ? t.closest("#btnSaveSettings") : null;
    if(saveBtn){
      ev.preventDefault();
      if(typeof saveSegmentSettings === "function") saveSegmentSettings();
      return;
    }

    const restoreBtn = t && t.closest ? t.closest("#btnRestoreDefaultsSegments") : null;
    if(restoreBtn){
      ev.preventDefault();
      if(typeof restoreDefaultSegments === "function") restoreDefaultSegments();
      return;
    }

    const recalcBtn = t && t.closest ? t.closest("#btnRecalcFromSettings") : null;
    if(recalcBtn){
      ev.preventDefault();
      if(typeof recalcFromSettings === "function") recalcFromSettings();
      else if(typeof recalcAll === "function") recalcAll();
      return;
    }

    // clic sur le fond (overlay) => fermer
    const ov = t && t.id === "segmentSettingsModal" ? t : (t && t.closest ? t.closest("#segmentSettingsModal") : null);
    if(ov && t === ov){
      if(typeof closeSettings === "function") closeSettings();
      return;
    }
  });
})();



window.addEventListener("datasetReady", ()=>{
  try{
    const active = document.querySelector(".tab.active");
    const view = active ? (active.getAttribute("data-view") || "") : "";
    if(view==="tableau-bord" && typeof window.renderTableauBord==="function"){
      window.renderTableauBord();
    }
  }catch(e){}
});

