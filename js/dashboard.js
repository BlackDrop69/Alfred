
(function(){
  function ensureTip(){
    let tip = document.getElementById("tt-global");
    if(tip) return tip;
    tip = document.createElement("div");
    tip.id = "tt-global";
    document.body.appendChild(tip);
    return tip;
  }
  const tip = ensureTip();
  let pinned = false;

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function placeFromPoint(x, y){
    const pad = 14;
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    tip.style.left = "0px";
    tip.style.top = "0px";
    tip.classList.add("show");
    const r = tip.getBoundingClientRect();
    let nx = x + pad;
    let ny = y + pad;
    if(nx + r.width + 10 > vw) nx = x - r.width - pad;
    if(ny + r.height + 10 > vh) ny = y - r.height - pad;
    tip.style.left = clamp(nx, 10, vw - r.width - 10) + "px";
    tip.style.top  = clamp(ny, 10, vh - r.height - 10) + "px";
  }

  function show(el, x, y){
    const txt = el.getAttribute("data-tt");
    if(!txt) return;
    // kill any native tooltip
    el.removeAttribute("title");
    tip.textContent = txt;
    pinned = false;
    tip.style.pointerEvents = "none";
    placeFromPoint(x, y);
  }

  function hide(){
    if(pinned) return;
    tip.classList.remove("show");
  }

  // Delegation: hover shows
  document.addEventListener("mouseenter", function(e){
    const t = e.target;
    if(t && t.classList && t.classList.contains("tt-help")){
      show(t, e.clientX, e.clientY);
    }
  }, true);

  document.addEventListener("mousemove", function(e){
    const t = e.target;
    if(!t || !t.classList || !t.classList.contains("tt-help")) return;
    if(!tip.classList.contains("show") || pinned) return;
    placeFromPoint(e.clientX, e.clientY);
  }, true);

  document.addEventListener("mouseleave", function(e){
    const t = e.target;
    if(t && t.classList && t.classList.contains("tt-help")){
      hide();
    }
  }, true);

  // Click pins/unpins
  document.addEventListener("click", function(e){
    const t = e.target;
    if(t && t.classList && t.classList.contains("tt-help")){
      e.preventDefault(); e.stopPropagation();
      const txt = t.getAttribute("data-tt");
      if(!txt) return;
      tip.textContent = txt;
      pinned = !pinned;
      if(pinned){
        tip.style.pointerEvents = "none";
        placeFromPoint(e.clientX, e.clientY);
      } else {
        tip.classList.remove("show");
      }
    } else {
      // click elsewhere closes if pinned
      if(pinned){
        pinned = false;
        tip.classList.remove("show");
      }
    }
  }, true);

  // --- Support des "i" existants (class .tip + data-tip) ---
  document.addEventListener("mouseenter", function(e){
    const t = e.target;
    if(t && t.classList && t.classList.contains("tip") && t.hasAttribute("data-tip")){
      // kill native tooltip if any
      t.removeAttribute("title");
      // map data-tip -> affichage dans tooltip global
      tip.textContent = t.getAttribute("data-tip") || "";
      pinned = false;
      tip.style.pointerEvents = "none";
      placeFromPoint(e.clientX, e.clientY);
    }
  }, true);

  document.addEventListener("mousemove", function(e){
    const t = e.target;
    if(!t || !t.classList || !t.classList.contains("tip") || !t.hasAttribute("data-tip")) return;
    if(!tip.classList.contains("show") || pinned) return;
    placeFromPoint(e.clientX, e.clientY);
  }, true);

  document.addEventListener("mouseleave", function(e){
    const t = e.target;
    if(t && t.classList && t.classList.contains("tip") && t.hasAttribute("data-tip")){
      if(!pinned) tip.classList.remove("show");
    }
  }, true);

})();;

/** =========================
 * MODULES STRATÉGIQUES (V5)
 * - Actions commerciales
 * - ALFRED
 * ========================= */

function _asOfISO(){
  return (state.periodWindow && state.periodWindow.asOfISO) ? state.periodWindow.asOfISO : (state.quality?.maxDate || new Date().toISOString().slice(0,10));
}
function _parseISO(d){ return new Date(d+"T00:00:00Z"); }
function _monthKey(y,m){ return y+"-"+String(m).padStart(2,"0"); } // m = 1..12

function _tftdLevels(c){
  const tf = (typeof c.tf === "number" && isFinite(c.tf)) ? c.tf : null;
  const tdInt = (typeof c.tdPct==="number" && isFinite(c.tdPct)) ? c.tdPct : _tdValuePercent(c);
  const tdDisp = (tdInt==null || !isFinite(tdInt)) ? null : tdInt; 

  let tdLevel = null;
  if (tdDisp !== null) {
      const isVipProtect = (c.caSharePeriod && c.caSharePeriod >= 0.07);
      const fragileThreshold = isVipProtect ? -10 : -15; // Un VIP passe en alerte dès -10% de chute

      if (tdDisp >= fragileThreshold) tdLevel = 0;      // Maintien ou Croissance
      else if (tdDisp >= -50) tdLevel = 1;              // Érosion
      else tdLevel = 2;                                 // Chute (< -50%)
  }

  const tfLevel = (tf==null)? null : (tf>-0.15 ? 0 : (tf>-0.25 ? 1 : 2));
  const status = (tdLevel==null || tfLevel==null) ? "NC" : TFTD_STATUS_MATRIX[tfLevel][tdLevel];
  return {tf, tdDisp, tfLevel, tdLevel, status};
}


function _tfChip(tf){
  if(!(typeof tf==="number") || !isFinite(tf)) return `<span class="chip">TF NC</span>`;
  const pct = Math.round(tf*100);
  const cls = (tf>-0.15) ? "good" : (tf>-0.25 ? "warn" : "bad");
  return `<span class="chip ${cls}">TF ${pct}%</span>`;
}

function _tdBadge(tdDisp){
  if(!(typeof tdDisp==="number") || !isFinite(tdDisp)) return `<span class="td-badge td-neutral">TV NC</span>`;
  const vv = Math.round(tdDisp);
  let cls = "td-neutral";
  if(vv >= 0) cls = "td-green";
  else if(vv >= -15) cls = "td-neutral";
  else if(vv >= -50) cls = "td-orange";
  else cls = "td-red";

  const sign = vv > 0 ? "+" : "";
  return `<span class="td-badge ${cls}">TV ${sign}${vv}%</span>`;
}

function _sumTxForClientBetween(name, startISO, endISO){
  // Direction helpers : éviter le scan global state.tx (utiliser cache canonique si dispo)
  const cache = state && state.cache ? state.cache : null;
  const txByClient = cache && cache.txByClient ? cache.txByClient : null;

  if(txByClient && txByClient.get){
    const arr = txByClient.get(name) || [];
    if(arr && arr.length){
      // lowerBound sur ISO (liste triée par dateISO)
      const _lbISO = (a, iso)=>{
        let lo=0, hi=a.length;
        while(lo<hi){
          const mid=(lo+hi)>>>1;
          const v = a[mid] && a[mid].dateISO ? a[mid].dateISO : "";
          if(v < iso) lo = mid+1; else hi = mid;
        }
        return lo;
      };
      let s = 0;
      for(let i=_lbISO(arr, startISO); i<arr.length; i++){
        const t = arr[i];
        if(!t || !t.dateISO) continue;
        if(t.dateISO > endISO) break;
        const amt = t.amountHT;
        if(isFinite(amt)) s += amt;
      }
      return s;
    }
    return 0;
  }

  // Fallback : scan direct (ancien comportement)
  const start = _parseISO(startISO);
  const end = _parseISO(endISO);
  let s=0;
  for(const t of (state.tx||[])){
    if(t.clientCanon!==name) continue;
    if(!t.dateISO || !isFinite(t.amountHT)) continue;
    const d=_parseISO(t.dateISO);
    if(d>=start && d<=end) s+=t.amountHT;
  }
  return s;
}

function _clientCaMonth(name, year, month1to12){
  const start = new Date(Date.UTC(year, month1to12-1, 1));
  const end = new Date(Date.UTC(year, month1to12, 0)); // last day
  const sISO = start.toISOString().slice(0,10);
  const eISO = end.toISOString().slice(0,10);
  return _sumTxForClientBetween(name, sISO, eISO);
}

function _clientYTD(name, year, asOfMonth, asOfDay){
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, asOfMonth-1, asOfDay));
  const sISO = start.toISOString().slice(0,10);
  const eISO = end.toISOString().slice(0,10);
  return _sumTxForClientBetween(name, sISO, eISO);
}

function _pct(a,b){
  if(!isFinite(a) || !isFinite(b) || b<=0) return null;
  return a/b;
}

function _gaugeHTML(ratio){
  if(ratio==null || !isFinite(ratio)) return `<div class="bar"><i style="width:0%"></i></div><div class="small muted">NC</div>`;
  const pct = Math.max(0, Math.min(200, ratio*100));
  return `<div class="bar"><i style="width:${pct}%"></i></div><div class="small muted mono">${Math.round(ratio*100)}%</div>`;
}

function _yearsInData(){
  const years = new Set();
  for(const t of (state.tx||[])){
    if(!t.dateISO) continue;
    const y = parseInt(t.dateISO.slice(0,4),10);
    if(isFinite(y)) years.add(y);
  }
  return Array.from(years).sort((a,b)=>a-b);
}

function _adviceForClient(c, ratioYtd){
  const seg = c.segment || "";
  const {status} = _tftdLevels(c);

  const crit = new Set(["Critique +","Critique","Risque élevé","Risque volume"]);
  const callset = new Set(["Risque","Érosion","Alerte forte"]);

  let advice = "RAS";
  let why = [];
  if(seg==="VIP Fragiles"){ advice="RDV"; why.push("VIP fragile"); }
  if(crit.has(status)){ advice="RDV"; if(!why.length) why.push("Statut "+status); }
  const pct = (ratioYtd!=null && isFinite(ratioYtd)) ? Math.round(ratioYtd*100) : null;
  if(pct!==null && pct<85){ advice="RDV"; if(why.length<2) why.push(`CA YTD ${pct}% vs N-1`); }
  if(advice==="RAS" && (callset.has(status) || seg==="Occasionnels")){ advice="Appel"; if(!why.length) why.push(status!=="NC" ? ("Statut "+status) : "Occasionnel"); }
  if(advice==="RAS" && pct!==null && pct<95){ advice="Appel"; if(why.length<2) why.push(`CA YTD ${pct}% vs N-1`); }

  // mini précision occasionnel >180 j (si dispo)
  if(advice!=="RAS" && (c.recencyDays!=null) && (+c.recencyDays>180) && why.length<2){
    if(seg==="Occasionnels") why.push(">180 j");
  }

  return {advice, why: why.join(" • "), status};
}

/** ---------- Actions commerciales ---------- */
function renderActions(){
  const tb = $("#actionsTbody");
  const kpiBox = $("#actKpis");
  if(!tb || !kpiBox) return;

  if(!state.tx.length || !state.clients.length){
    tb.innerHTML = `<tr><td colspan="11" class="muted">Importe un fichier puis clique Recalculer.</td></tr>`;
    kpiBox.innerHTML = "";
    return;
  }

  const filter = ($("#actFilter")?.value || "ONLY");
  const q = ($("#actSearch")?.value || "").trim().toLowerCase();

  const asOfISO = _asOfISO();
  const asOf = _parseISO(asOfISO);
  const asOfY = asOf.getUTCFullYear();
  const asOfM = asOf.getUTCMonth()+1;
  const asOfD = asOf.getUTCDate();

  // CA M (mois civil courant) vs même mois N-1 (YoY)
  const yoyY = asOfY - 1;
  const yoyM = asOfM;

  const rows = [];
  let cntRDV=0, cntCALL=0, cntRAS=0;
  let sumRDV=0, sumCALL=0;

  for(const c0 of (state.clients||[])){
    if(state.ui?.hidePerdus && c0.segment==="Perdus") continue;
    const name = c0.name;
    if(q && !String(name||"").toLowerCase().includes(q)) continue;

    const caM1 = _clientCaMonth(name, yoyY, yoyM);
    const ytdN = _clientYTD(name, asOfY, asOfM, asOfD);
    const ytdN1 = _clientYTD(name, asOfY-1, asOfM, asOfD);
    const ratio = _pct(ytdN, ytdN1);

    const {advice, why, status} = _adviceForClient(c0, ratio);

    if(filter==="RDV" && advice!=="RDV") continue;
    if(filter==="CALL" && advice!=="Appel") continue;
    if(filter==="ONLY" && advice==="RAS") continue;

    if(advice==="RDV"){ cntRDV++; sumRDV+= (isFinite(caM1)?caM1:0); }
    else if(advice==="Appel"){ cntCALL++; sumCALL+= (isFinite(caM1)?caM1:0); }
    else cntRAS++;

    const rec = (c0.recencyDays==null || !isFinite(c0.recencyDays)) ? "NC" : (Math.round(c0.recencyDays)+" j");
    const {tf, tdDisp} = _tftdLevels(c0);

    rows.push({
      advice,
      name,
      segment: c0.segment || "",
      status,
      recDays: (isFinite(c0.recencyDays)? +c0.recencyDays : 999999),
      ca_m1: caM1,
      ytd: ytdN,
      ratio,
      tf, tdDisp,
      why
    });
  }

  // KPIs
  kpiBox.innerHTML = `
    <div class="kpi"><div class="k">RDV conseillés</div><div class="v">${fmtInt(cntRDV)}</div></div>
    <div class="kpi"><div class="k">Appels conseillés</div><div class="v">${fmtInt(cntCALL)}</div></div>
    <div class="kpi"><div class="k">RAS</div><div class="v">${fmtInt(cntRAS)}</div></div>
    <div class="kpi"><div class="k">CA M-1 (RDV)</div><div class="v">${fmtMoney(sumRDV)}</div></div>
    <div class="kpi"><div class="k">CA M-1 (Appels)</div><div class="v">${fmtMoney(sumCALL)}</div></div>
    <div class="kpi"><div class="k">Référence</div><div class="v mono">${_asOfISO()}</div></div>
  `;

  // sort by advice then recency descending by default
  const prio = {"RDV":0, "Appel":1, "RAS":2};
  rows.sort((a,b)=> (prio[a.advice]-prio[b.advice]) || (b.recDays-a.recDays) || (String(a.name).localeCompare(String(b.name))));

  // Render
  tb.innerHTML = rows.map(r=>{
    const advChip = (r.advice==="RDV") ? `<span class="chip bad">RDV</span>` : (r.advice==="Appel" ? `<span class="chip warn">Appel</span>` : `<span class="chip">RAS</span>`);
    const ratioTxt = (r.ratio==null) ? "NC" : fmtPctRatio(r.ratio, 0);
    const ratioCls = (r.ratio==null) ? "acc" : (r.ratio>=1 ? "good" : (r.ratio>=0.95 ? "acc" : (r.ratio>=0.85 ? "warn" : "bad")));
    const statusLbl = (r.status||"NC");
    const statusChip = `<span class="chip ${ratioCls}">${escapeHtml(statusLbl)}</span>`;

    return `<tr>
      <td>${advChip}</td>
      <td>${(()=>{ const __segOff = (typeof __alfredGetOfficialSeg==="function") ? (__alfredGetOfficialSeg(r.name) || (r.segment||"")) : (r.segment||""); const __isNew = (typeof segIsNew==="function") ? !!segIsNew(__segOff) : false; const __style = __isNew ? "color:#38bdf8; font-weight:900;" : ""; const __tag = __isNew ? ' <span style="color:#38bdf8; font-weight:800;">(Nouveau)</span>' : ""; return '<span class="client-link" data-client="' + escapeHtml(r.name) + '" style="' + __style + '">' + escapeHtml(r.name) + __tag + '</span>'; })()}</td>
      <td>${escapeHtml(r.segment||"")}</td>
      <td style="white-space:nowrap">${statusChip} ${_tfChip(r.tf)} ${_tdBadge(r.tdDisp)}</td>
      <td>${escapeHtml((r.recDays===999999)?"NC":(Math.round(r.recDays)+" j"))}</td>
      <td class="mono">${fmtMoney(r.ca_m1)}</td>
      <td class="mono">${fmtMoney(r.ytd)}</td>
      <td>
        ${_gaugeHTML(r.ratio)}
      </td>
      <td class="muted">${escapeHtml(r.why||"")}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="9" class="muted">Aucun résultat.</td></tr>`;

  // allow click to open cockpit via existing handler
  try{ if(window.__initClientCockpitModule) window.__initClientCockpitModule();
  if(window.__initALFREDCockpitModule) window.__initALFREDCockpitModule(); }catch(e){}
}

/** ---------- ALFRED (legacy renderPilotage) ---------- */
function renderPilotage(){
  const sel = $("#yearSelect");
  const tbody = $("#yearMonthsTbody");
  const kpiBox = $("#yearKpis");
  const segBars = $("#yearSegBars");
  const tftdBars = $("#yearTftdBars");
  if(!sel || !tbody || !kpiBox || !segBars || !tftdBars) return;

  if(!state.tx.length){
    sel.innerHTML = "";
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Importe un fichier puis clique Recalculer.</td></tr>`;
    kpiBox.innerHTML = ""; segBars.innerHTML=""; tftdBars.innerHTML="";
    return;
  }

  const years = _yearsInData();
  const asOfISO = _asOfISO();
  const asOf = _parseISO(asOfISO);
  const yDefault = years.length ? years[years.length-1] : asOf.getUTCFullYear();

  if(!sel.options.length){
    sel.innerHTML = years.slice().reverse().map(y=>`<option value="${y}">${y}</option>`).join("");
    sel.value = String(state.ui?.pilotYear || yDefault);
  }
  const yN = parseInt(sel.value,10) || yDefault;
  state.ui.pilotYear = yN;
  const yN1 = yN-1;

  // monthly totals
  const monthNames = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];

  const sumRange = (sISO, eISO)=>{
    let tot = 0;
    for(const t of (state.tx||[])){
      if(!t || !t.dateISO || !isFinite(t.amountHT)) continue;
      if(t.dateISO < sISO || t.dateISO > eISO) continue;
      tot += t.amountHT;
    }
    return tot;
  };

  const sumMonth = (year, m1to12, clampStartISO, clampEndISO)=>{
    const s = new Date(Date.UTC(year, m1to12-1, 1));
    const e = new Date(Date.UTC(year, m1to12, 0));
    const sISO = s.toISOString().slice(0,10);
    const eISO = e.toISOString().slice(0,10);

    // Optional clamp: allow MTD / partial-month comparisons to align "as-of" between N and N-1
    // Backward compatible: existing calls with 2 args behave exactly the same.
    const cs = (clampStartISO && clampStartISO > sISO) ? clampStartISO : sISO;
    const ce = (clampEndISO   && clampEndISO   < eISO) ? clampEndISO   : eISO;
    if(cs > ce) return 0;
    return sumRange(cs, ce);
  };

  const monthIter = (startISO, endISO)=>{
    const out = [];
    if(!startISO || !endISO) return out;
    const sy = parseInt(startISO.slice(0,4),10);
    const sm = parseInt(startISO.slice(5,7),10);
    const ey = parseInt(endISO.slice(0,4),10);
    const em = parseInt(endISO.slice(5,7),10);
    if(!isFinite(sy)||!isFinite(sm)||!isFinite(ey)||!isFinite(em)) return out;
    let y=sy, m=sm;
    for(let guard=0; guard<36; guard++){
      out.push({y, m});
      if(y===ey && m===em) break;
      m += 1;
      if(m>12){ m=1; y+=1; }
    }
    return out;
  };

  // ---- Périmètre d'affichage : respecte la période sélectionnée
  let monthsToShow = [];
  if(ranges.mode === "month"){
    monthsToShow = [{y:yN, m: parseInt(mSel,10)}];
  } else if(ranges.mode === "rolling12" || ranges.mode === "rolling12_auto"){
    monthsToShow = monthIter(rangeN.s, rangeN.e);
  } else if(ranges.mode === "ytd_auto"){
    monthsToShow = monthIter(rangeN.s, rangeN.e);
  } else {
    monthsToShow = Array.from({length:12}, (_,i)=>({y:yN, m:i+1}));
  }

  let totN=0, totN1=0;
  const rows = [];
  for(const mm of monthsToShow){
    const a = sumMonth(mm.y-1, mm.m, rangeN1.s, rangeN1.e);
    const b = sumMonth(mm.y, mm.m, rangeN.s, rangeN.e);
    totN1 += a; totN += b;
    const diff = b-a;
    const pct = (a>0) ? (diff/a) : null;
    const label = (monthsToShow.length>12 || monthsToShow.some(x=>x.y!==yN)) ? `${monthNames[mm.m-1]} ${String(mm.y).slice(2)}` : monthNames[mm.m-1];
    rows.push({label, a, b, diff, pct});
  }
  tbody.innerHTML = rows.map(r=>{
    const pctTxt = (r.pct==null) ? "NC" : fmtPctRatio(r.pct, 0);
    const cls = (r.pct==null) ? "" : (r.pct>=0 ? "ok" : "danger");
    return `<tr>
      <td>${r.label}</td>
      <td class="mono">${fmtMoney(r.a)}</td>
      <td class="mono">${fmtMoney(r.b)}</td>
      <td class="mono ${cls}">${fmtMoney(r.diff)}</td>
      <td class="mono ${cls}">${pctTxt}</td>
    </tr>`;
  }).join("");

  const globalPct = (totN1>0) ? ((totN-totN1)/totN1) : null;
  kpiBox.innerHTML = `
    <div class="kpi"><div class="k">CA N (${yN})</div><div class="v">${fmtMoney(totN)}</div></div>
    <div class="kpi"><div class="k">CA N-1 (${yN1})</div><div class="v">${fmtMoney(totN1)}</div></div>
    <div class="kpi"><div class="k">Écart</div><div class="v">${fmtMoney(totN-totN1)}</div></div>
    <div class="kpi"><div class="k">Écart %</div><div class="v mono">${globalPct==null?"NC":((globalPct>0?"+":"")+fmtPctRatio(globalPct,0))}</div></div>
  `;
}
function renderPilotageCo(){
  const elUrgences = document.getElementById("list-urgences");
  const elRisque   = document.getElementById("list-risque");
  const elPep      = document.getElementById("list-pepiniere");
  const elVic      = document.getElementById("list-victoires");
  const tb         = document.getElementById("pilotage-co-body");

  const elKpiU    = document.getElementById("kpi-urgences-v");
  const elKpiR    = document.getElementById("kpi-risque-v");
  const elKpiN    = document.getElementById("kpi-nouveaux-v");
  const elKpiD    = document.getElementById("kpi-dynamiques-v");

  const elKpiUc   = document.getElementById("kpi-urgences-c");
  const elKpiRc   = document.getElementById("kpi-risque-c");
  const elKpiNc   = document.getElementById("kpi-nouveaux-c");
  const elKpiDc   = document.getElementById("kpi-dynamiques-c");

  const elKpiE    = document.getElementById("kpi-extremes-v");
  const elKpiEc   = document.getElementById("kpi-extremes-c");
  const elExt     = document.getElementById("list-extremes");

  // Vue non montée (sécurité)
  if(!(elUrgences || elRisque || elPep || elVic || elKpiU || elKpiR || elKpiN || elKpiD || elKpiUc || elKpiRc || elKpiNc || elKpiDc || tb)) return;


  // Bind UI (filtre / recherche) une seule fois
  try{
    state.ui = state.ui || {};
    if(!state.ui.__pilotageCoBound){
      const pf = document.getElementById("pilotFilter");
      const ps = document.getElementById("pilotSearch");
      const pb = document.getElementById("btnPilotRefresh");
      if(pf) pf.addEventListener("change", ()=>renderPilotageCo());
      if(ps) ps.addEventListener("input",  ()=>renderPilotageCo());
      if(pb) pb.addEventListener("click",  ()=>renderPilotageCo());

      const bx = document.getElementById("btnPilotExportActions");
      if(bx) bx.addEventListener("click", ()=>{ if(window.ActionsCommerciales && typeof window.ActionsCommerciales.exportXls==="function") window.ActionsCommerciales.exportXls(); });
      const br = document.getElementById("btnPilotRefreshActions");
      if(br) br.addEventListener("click", ()=>{ try{ renderPilotageCo(); }catch(e){} });
      const bz = document.getElementById("btnPilotResetActions");
      if(bz) bz.addEventListener("click", ()=>{
        if(window.ActionsCommerciales && window.ActionsCommerciales.getSelected){
          const all = window.ActionsCommerciales.getSelected();
          all.forEach(n=>window.ActionsCommerciales.set(n,false));
        }
        try{ renderPilotageCo(); }catch(e){}
      });

      // Tri tableau Pilotage Co (clic asc/desc) — bind robuste (délégation, résiste aux re-render)
      if(!state.ui.__pilotageCoSort) state.ui.__pilotageCoSort = {key:"__impRank", dir:"asc"};
      setupSortableTable(
        "pilotage-co-body",
        "__pilotageCoSort",
        ["__impRank","name","segment","__diagSort","recCalDays","caM","caM1","__varPct","__pctMax","__pdp"],
        ["num","str","str","str","num","num","num","num","num","num"],
        ()=>renderPilotageCo()
      );

      state.ui.__pilotageCoBound = true;

      // Actions commerciales : délégation clic (checkbox + nom client)
      try{
        if(!state.ui.__acDelegation){
          const root = document.getElementById("view-pilotage-co");
          if(root){
            root.addEventListener("change", (ev)=>{
              const t = ev.target;
              if(t && t.classList && t.classList.contains("ac-check")){
                const nm = String(t.getAttribute("data-client")||"").trim();
                if(!nm) return;
                if(window.ActionsCommerciales && window.ActionsCommerciales.set) window.ActionsCommerciales.set(nm, !!t.checked);
              }
            });
            root.addEventListener("click", (ev)=>{
              const a = ev.target && ev.target.closest ? ev.target.closest(".client-link") : null;
              if(a && a.getAttribute){
                const nm = String(a.getAttribute("data-client")||"").trim();
                if(!nm) return;
                // clic client = toggle action
                if(window.ActionsCommerciales && window.ActionsCommerciales.toggle){
                  const next = window.ActionsCommerciales.toggle(nm);
                  // met à jour toutes les checkboxes visibles dans pilotage
                  root.querySelectorAll(`input.ac-check[data-client="${nm.replace(/"/g, "\\\"")}"]`).forEach(i=>{ i.checked = !!next; });
                }
              }
            });
          }
          state.ui.__acDelegation = true;
        }
      }catch(e){}

    }
  }catch(e){}

  const emptyAll = (msg)=>{
    const m = msg || `<div class="muted">—</div>`;
    if(elUrgences) elUrgences.innerHTML = m;
    if(elRisque)   elRisque.innerHTML   = m;
    if(elPep)      elPep.innerHTML      = m;
    if(elVic)      elVic.innerHTML      = m;
    if(elExt)      elExt.innerHTML      = m;

    if(elKpiU)    elKpiU.textContent    = "—";
    if(elKpiR)    elKpiR.textContent    = "—";
    if(elKpiN)    elKpiN.textContent    = "—";
    if(elKpiD)    elKpiD.textContent    = "—";
    if(elKpiE)    elKpiE.textContent    = "—";

    if(elKpiUc)   elKpiUc.textContent   = "—";
    if(elKpiRc)   elKpiRc.textContent   = "—";
    if(elKpiNc)   elKpiNc.textContent   = "—";
    if(elKpiDc)   elKpiDc.textContent   = "—";
    if(elKpiEc)   elKpiEc.textContent   = "—";

    if(tb)         tb.innerHTML         = `<tr><td colspan="11" class="muted">—</td></tr>`;
  };
  if(!state || !state.tx || !state.tx.length || !state.clients || !state.clients.length){
    emptyAll(`<div class="muted">Importe un fichier puis clique Recalculer.</div>`);
    return;
  }

  const asOfISO = _asOfISO();
  const asOf = _parseISO(asOfISO);
  const asOfY = asOf.getUTCFullYear();
  const asOfM = asOf.getUTCMonth()+1;
  const asOfD = asOf.getUTCDate();

  // Index dates + tx par client (cockpit) — depuis cache canonique
  const byDates = new Map();
  const byTx = (state.cache && state.cache.txByClient) ? state.cache.txByClient : new Map();

  for(const [nm, arr] of byTx.entries()){
    if(!arr || !arr.length) continue;
    const dts = new Array(arr.length);
    for(let i=0;i<arr.length;i++) dts[i] = arr[i].dateISO;
    byDates.set(nm, dts); // déjà trié par construction du cache
  }

  const msOneYear = 365.25*24*60*60*1000;
  const asOfTime = asOf.getTime();
  const limit12m = asOfTime - msOneYear;

  const isLostSeg = (seg)=> (seg==="Perdus" || seg==="Perdus Historiques");
  const segIsNew  = (seg)=>{ const s = String(seg||"").toLowerCase().trim(); return (s.includes("nouveau") || s.includes("réactiv") || s.includes("reactiv")); };

  const _pad2 = (n)=> String(n).padStart(2,"0");

  const _sumMonth = (clientName, year, month1to12)=>{
    const ym = `${year}-${_pad2(month1to12)}`;
    const mByC = state.cache && state.cache.monthlyByClient ? state.cache.monthlyByClient : null;
    if(!mByC) return 0;
    const mm = mByC.get(clientName);
    if(!mm) return 0;
    const cell = mm.get(ym);
    return (cell && isFinite(cell.sumHT)) ? Number(cell.sumHT) : 0;
  };

  const _varTxt = (n, n1)=>{
    if(!(typeof n==="number") || !isFinite(n)) n = 0;
    if(!(typeof n1==="number") || !isFinite(n1)) n1 = 0;
    if(n1>0){
      const v = (n-n1)/n1*100;
      const sign = v>0 ? "+" : "";
      return { txt: sign + v.toFixed(1).replace(".",",") + "%", cls: (v>0?"var-pos":(v<0?"var-neg":"var-na")) };
    }
    if(n>0) return { txt: "+100%", cls: "var-pos" };
    return { txt: "—", cls: "var-na" };
  };

  
const _imp = (r, highThr, lowThr)=>{
  if (!r || !r.c) return "normale";
  const {status} = _tftdLevels(r.c);
  const s = status || "NC";
  if (s==="Critique" || s==="Critique +" || s==="Risque élevé") return "haute";
  if (s==="Risque" || s==="Alerte forte" || s==="Érosion") return "normale";
  if (s==="OK" || s==="Alerte" || s==="Risque volume") return "basse";
  return "normale";
};

  const _parlerVrai = (r)=>{
    if(!r) return "—";
    if(segIsNew(r.segment)) {
       const rec = r.recCalDays != null ? r.recCalDays : 0;
       const freq = (r.c && r.c.frequency) ? r.c.frequency : 1;
       if (rec < 120) {
          if (freq <= 1) return "Objectif : déclencher la 2ème commande";
          return "Accompagnement : Consolidation du compte";
       }
       return "Objectif : Valider une nouvelle commande";
    }

    const { tf } = _tftdLevels(r.c);
    if (tf != null && tf >= 0.05) return "Dynamique d'achat positive";

    if(r.__isDecrochage === true) return "En retard sur ses habitudes";
    if(r.basketDeltaRaw!=null && isFinite(r.basketDeltaRaw) && r.basketDeltaRaw < -0.10) return "Érosion du panier";
    if(r.trendV === "UP") return "En accélération";
    if(r.__isDecrochage === false && r.basketDeltaRaw!=null && isFinite(r.basketDeltaRaw) && r.basketDeltaRaw > 0) return "Potentiel de développement";
    return "Reprise de contact conseillée";
  };

  const _tfTdExplain = (r)=>{
    if(!r) return "—";
    const c = r.c;
    const lvl = _tftdLevels(c);
    const parts = [];

    if(r.__isDecrochage){
      if(r.lateDays!=null && isFinite(r.lateDays)){
        const j = Math.round(r.lateDays);
        if (j >= 30) {
          const m = Math.floor(j / 30);
          parts.push(`Absent depuis ${m} mois (${j}j de retard)`);
        } else {
          parts.push(`Absent depuis ${j} jours (retard constaté)`);
        }
      } else {
        parts.push("Absence prolongée");
      }
    }else{
      if(lvl && lvl.tfLevel === 2){
        const val = (lvl.tf != null && isFinite(lvl.tf)) ? ` de ${Math.abs(Math.round(lvl.tf * 100))}%` : "";
        parts.push(`Chute brutale du rythme d'achat${val}`);
      }else if(lvl && lvl.tfLevel === 1){
        const val = (lvl.tf != null && isFinite(lvl.tf)) ? ` de ${Math.abs(Math.round(lvl.tf * 100))}%` : "";
        parts.push(`Baisse du rythme d'achat${val}`);
      }

      if(lvl && lvl.tdLevel === 2){
        const val = (lvl.tdDisp != null && isFinite(lvl.tdDisp)) ? ` de ${Math.abs(Math.round(lvl.tdDisp))}%` : "";
        parts.push(`Forte chute du panier moyen${val}`);
      }else if(lvl && lvl.tdLevel === 1){
        const val = (lvl.tdDisp != null && isFinite(lvl.tdDisp)) ? ` de ${Math.abs(Math.round(lvl.tdDisp))}%` : "";
        parts.push(`Baisse du panier moyen${val}`);
      }
    }

    // Fallback : donner de la matière sans surcharger
    if(!parts.length){
      if(lvl && lvl.status && lvl.status!=="NC" && lvl.status!=="OK") parts.push(`Vigilance globale (${lvl.status})`);
      else parts.push("—");
    }
    return parts.join(" • ");
  };

  const _recTxt = (r)=>{
    const d = (r && typeof r.recCalDays==="number" && isFinite(r.recCalDays)) ? Math.max(0, Math.round(r.recCalDays)) : null;
    if(d==null) return "—";
    return `Il y a ${d}j`;
  };

  const _topTableHTML = (items, emptyMsg)=>{
    const header = `
      <div class="tableWrap" style="margin-top:12px;">
        <table>
          <thead>
            <tr>
              <th style="width:1%; white-space:nowrap;">Importance</th>
              <th style="width:1%; white-space:nowrap; text-align:center;">Action</th>
              <th>Client</th>
              <th>Segment</th>
              <th>Diagnostic</th>
              <th style="white-space:nowrap;">Récence</th>
              <th style="white-space:nowrap;">CA M</th>
              <th style="white-space:nowrap;">CA M-1</th>
              <th style="white-space:nowrap;">Variation</th>
              <th style="white-space:nowrap;">% Max CA</th>
              <th style="white-space:nowrap;">PdP</th>
            </tr>
          </thead>
          <tbody>
    `;
    const footer = `
          </tbody>
        </table>
      </div>
    `;

    const renderRow = (r)=>{
      const imp = _imp(r, highThr, lowThr);
      const varObj = _varTxt(r.caM||0, r.caM1||0);
      const seg = r.segment || "—";
      const pv = _parlerVrai(r);
      const tfTd = _tfTdExplain(r);
      const rec = _recTxt(r);

      const impChip = `<span class="imp-chip ${imp}">${imp==="haute"?"Haute":(imp==="basse"?"Basse":"Normale")}</span>`;
      const diag = (tfTd && tfTd!=="—") ? `${escapeHtml(pv)} • ${escapeHtml(tfTd)}` : escapeHtml(pv);

      const segOff = (typeof __alfredGetOfficialSeg==="function") ? (__alfredGetOfficialSeg(r.name) || seg) : seg;
      const isNewSegFlag = (typeof segIsNew==="function") ? !!segIsNew(segOff) : false;

      let clientNameDisplay = escapeHtml(r.name) + (isNewSegFlag ? ` <span style="color:#38bdf8; font-weight:800;">(Nouveau)</span>` : "");
      let nameStyle = isNewSegFlag ? "color:#38bdf8; font-weight:900;" : "font-weight: 500;";

      const clientHtml = `<span class="client-link" data-client="${escapeHtml(r.name)}" style="${nameStyle}">${clientNameDisplay}</span>`;
      const segHtml = escapeHtml(seg);
      return `
        <tr>
          <td style="white-space:nowrap;">${impChip}</td>
          <td style="text-align:center;">${(() => { const ck = (window.ActionsCommerciales && window.ActionsCommerciales.isChecked) ? window.ActionsCommerciales.isChecked(r.name) : false; return `<input type="checkbox" class="ac-check" data-client="${escapeHtml(r.name)}" ${ck?"checked":""}>`; })()}</td>
          <td>${clientHtml}</td>
          <td>${segHtml}</td>
          <td>${diag}</td>
          <td class="mono">${escapeHtml(rec)}</td>
          <td class="mono">${fmtEUR(r.caM||0)}</td>
          <td class="mono">${fmtEUR(r.caM1||0)}</td>
          <td class="mono ${varObj.cls}">${escapeHtml(varObj.txt)}</td>
          <td class="mono ${escapeHtml(r.__pctMaxCls||"")}">${escapeHtml(r.__pctMaxTxt||"—")}</td>
          <td class="mono">${escapeHtml(r.__penTxt||"—")}</td>
        </tr>
      `;
    };

    if(!items || !items.length){
      return header + `<tr><td colspan="10" class="muted">${escapeHtml(emptyMsg || "—")}</td></tr>` + footer;
    }
    return header + items.map(renderRow).join("") + footer;
  };

  const rows = [];
  for(const c of (state.clients||[])){
    if(!c || !c.name) continue;

    const seg = c.segment || "";
    const isLost = isLostSeg(seg);

    // Filtre : Actifs uniquement (fallback si propriété absente)
    const isActive = (c.isActive === true) || (c.isActive == null && !isLost);

    const lastISO = c.lastISO || c.lastOrderDate || "";
    let recCalDays = null;
    if(lastISO){
      try{
        const last = _parseISO(String(lastISO).slice(0,10));
        recCalDays = Math.floor((asOfTime - last.getTime())/(24*60*60*1000));
      }catch(e){}
    }

    // CA 12 mois glissants (proxy CA N-1 si champ absent)
    let ca12m = 0;

    // CA M (mois en cours = MTD explicite) : du 1er au jour de la DateRF
    let caM = 0;
    const mStartISO = `${asOfY}-${_pad2(asOfM)}-01`;
    const mEndISO = asOfISO;

    const orders = c.orders || byTx.get(c.name) || [];
    for(const t of orders){
      if(!t || !t.dateISO || !isFinite(t.amountHT)) continue;
      const iso = String(t.dateISO).slice(0,10);

      // MTD (M)
      if(iso >= mStartISO && iso <= mEndISO){
        caM += (t.amountHT||0);
      }

      // 12M glissants
      const tt = _parseISO(iso).getTime();
      if(tt > asOfTime) continue;
      if(tt >= limit12m) ca12m += (t.amountHT||0);
    }

    // Référence CA N-1 : si champ présent, sinon proxy 12m
    const caRef = (typeof c.ca12m==="number" && isFinite(c.ca12m)) ? c.ca12m : ca12m;

    // YTD (Jan -> date de référence), N et N-1 (réutilise utilitaire existant)
    const ytdN  = _clientYTD(c.name, asOfY,   asOfM, asOfD);
    const ytdN1 = _clientYTD(c.name, asOfY-1, asOfM, asOfD);

    const basketDeltaRaw = (typeof c.basketDeltaRaw==="number" && isFinite(c.basketDeltaRaw)) ? c.basketDeltaRaw : null;

    // Détection "retard sur ses habitudes" (alignée avec le moteur Direction)
    let meanInt = null, recEco = null, __isDecrochage = false;

    if(isActive && !isLost){
      const dates = byDates.get(c.name);
      if(dates && dates.length>=2){
        const intervals = _dirIntervalsDays(dates);
        if(intervals && intervals.length){
          meanInt = _mean(intervals);
          if(isFinite(meanInt) && meanInt>0){
            // Récence éco (congés/WE/fériés), identique au moteur Direction
            let rec = c.recencyDays;
            try{
              if(lastISO){
                const eco = _ecoDaysBetweenDates(_parseISO(String(lastISO).slice(0,10)), _parseISO(asOfISO));
                if(isFinite(eco)) rec = eco;
              }
            }catch(e){}
            recEco = rec;

            if(isFinite(recEco) && recEco>=0){
              const tv = c.tdPct || 0;
              const tolerance = (tv > 10) ? 2.2 : 1.5;

              const isAlreadyRisk = (recEco > tolerance * meanInt);
              const condA = (recEco > 1.2 * meanInt && recEco <= tolerance * meanInt);
              const condB = (intervals.length>=2 && intervals[intervals.length-1] > meanInt && intervals[intervals.length-2] > meanInt && recEco <= tolerance * meanInt);

              let late = !!(isAlreadyRisk || condA || condB);

              // Immunité croissance (même règle que Direction)
              if(tv > 5 && recEco < Math.max(3 * meanInt, 10)) late = false;

              __isDecrochage = !!late;
            }
          }
        }
      }
    }

    // Retard estimé (si décrochage)
    let lateDays = null;
    if(__isDecrochage && isFinite(recEco) && isFinite(meanInt) && meanInt>0){
      lateDays = Math.max(0, Math.round(recEco - meanInt));
    }

    // CA global (historique) : monétaire RFM
    const caTotal = (typeof c.m==="number" && isFinite(c.m)) ? c.m : 0;

    // CA impact (YTD) : part "perdue" vs N-1
    const caImpact = Math.max(0, (isFinite(ytdN1)?ytdN1:0) - (isFinite(ytdN)?ytdN:0));

    // Indicateur de tendance (si présent dans les données, sinon déduit à partir du YTD)
    const trendV = (c && c.trendV!=null) ? c.trendV
                  : ((typeof c.trendScore==="number" && isFinite(c.trendScore)) ? (c.trendScore>0 ? "UP" : (c.trendScore<0 ? "DOWN" : "FLAT"))
                  : ((isFinite(ytdN) && isFinite(ytdN1) && (ytdN - ytdN1) > 0) ? "UP" : null));

    // CA M-1 (mois précédent, complet) via cache mensuel
    let pm = asOfM - 1;
    let py = asOfY;
    if(pm < 1){ pm = 12; py = asOfY - 1; }
    const caM1 = _sumMonth(c.name, py, pm);

    // CA M-2 (deux mois avant) via cache mensuel
    let pm2 = pm - 1;
    let py2 = py;
    if(pm2 < 1){ pm2 = 12; py2 = py - 1; }
    const caM2 = _sumMonth(c.name, py2, pm2);


// Habitude d'achat : médiane des écarts (jours calendrier) sur les derniers achats (anti-bruit)
let habitGapDays = null;
try{
  const dts = byDates.get(c.name);
  if(dts && dts.length>=3){
    const take = dts.slice(Math.max(0, dts.length-8));
    const gaps = [];
    for(let i=1;i<take.length;i++){
      const a = _parseISO(String(take[i-1]).slice(0,10));
      const b = _parseISO(String(take[i]).slice(0,10));
      const g = Math.max(0, Math.round((b.getTime()-a.getTime())/(24*60*60*1000)));
      if(g>0) gaps.push(g);
    }
    if(gaps.length){
      gaps.sort((x,y)=>x-y);
      const mid = Math.floor(gaps.length/2);
      habitGapDays = (gaps.length%2) ? gaps[mid] : Math.round((gaps[mid-1] + gaps[mid]) / 2);
    }
  }
}catch(e){}

    rows.push({
      c,
      name: c.name,
      segment: seg,
      isLost,
      isActive,
      lastISO: String(lastISO||"").slice(0,10),
      recCalDays,
      habitGapDays,
      caTotal,
      caRef,
      ca12m,
      ytdN, ytdN1,
            caM, caM1, caM2,
      __pctMaxTxt: ((c && isFinite(c.pctOfMax)) ? fmtPctRatio(c.pctOfMax,0) : "—"),
      __pctMaxCls: (c && c.isNewPeak) ? "pct-peak" : "",
      __penTxt: ((c && c.penetration!=null) ? fmtPctRatio(c.penetration,0) : "—"),
      __potMetric: (c && c.potManual && c.penetration!=null) ? (c.penetration) : ((c && isFinite(c.pctOfMax)) ? c.pctOfMax : -1),
      basketDeltaRaw,
      trendV,
      __isDecrochage,
      meanInt, recEco,
      lateDays,
      caImpact
    });
  }

  // Seuils dynamiques (CA N-1) pour "Importance"
  const caRefs = rows
    .filter(r=>r && r.isActive && !r.isLost)
    .map(r=> (typeof r.caRef==="number" && isFinite(r.caRef)) ? r.caRef : 0)
    .filter(v=>v>0)
    .sort((a,b)=>a-b);

  const pickQuantile = (q)=>{
    if(!caRefs.length) return 0;
    const idx = Math.min(caRefs.length-1, Math.max(0, Math.floor(q*(caRefs.length-1))));
    return caRefs[idx];
  };

  let highThr = pickQuantile(0.80);
  let lowThr  = pickQuantile(0.30);

  // Garde-fous : éviter des seuils trop faibles/instables
  if(highThr <= 0) highThr = 0;
  if(lowThr  <= 0) lowThr  = 0;

  // --- Top Lists (accordéon Top 5) ---
  // --- Pilotage Commercial : filtres (basés sur state.clients) ---
  // ActionZone = provenance KPI Direction (cache) pour un classement strict et stable
const _az = (r)=>{
  try{
    const c = (r && r.c) ? r.c : null;
    const nm = (c && c.name) ? String(c.name).trim() : (r && r.name ? String(r.name).trim() : "");
    if(!nm) return "";
    let dir = state && state.ui ? state.ui.dirCache : null;
    if(!dir && state && state.clients) dir = computeDirectionKpis(state.clients);
    const _setFromItems = (items)=>{
      const s=new Set();
      for(const it of (items||[])){
        const cc = (it && it.client) ? it.client : it;
        if(cc && cc.name) s.add(String(cc.name).trim());
      }
      return s;
    };
    const setRisk = _setFromItems(dir && dir.preDropMain);
    const setPre  = _setFromItems(dir && dir.preDropLow);
    const setCh   = _setFromItems(dir && dir.churned);

    let az = "";
    if(setCh.has(nm)) az = "Décrochage confirmé";
    else if(setPre.has(nm)) az = "Décrochage en cours";
    else if(setRisk.has(nm)) az = "Risque de décrochage";

    if(c) c.actionZone = az;
    return az;
  }catch(e){ return ""; }
};
  const _segL = (r)=> String((r && r.c && r.c.segment) || (r && r.segment) || "").toLowerCase();
  const _tf = (r)=>{
    const v = (r && r.c) ? r.c.tendanceFreq : null;
    return (typeof v==="number" && isFinite(v)) ? v : 0;
  };
  const _td = (r)=>{
    const v = (r && r.c) ? r.c.tendanceDep : null;
    return (typeof v==="number" && isFinite(v)) ? v : 0;
  };

  
// --- Classement Pilotage Co (RÈGLES MÉTIER) ---
// Urgence :
// - Clients en décrochage (Direction) : Décrochage en cours / confirmé
// - OU récence >= 2× habitude
//   * sauf fréquence élevée : si habitude < 10j => seuil = habitude + 10j (safety net)
// Le reste (hors Nouveaux, hors Perdus/Inactifs/Dormants) => Surveillance
// Dynamiques : CA M > CA M-1 (pas seulement la fréquence)

const _rowName = (r)=> {
  const c = (r && r.c) ? r.c : null;
  return (c && c.name) ? String(c.name).trim() : (r && r.name ? String(r.name).trim() : "");
};


const _isExcluded = (r)=>{
  const s = _segL(r);
  if(!s) return true;
  if(s.includes("perdu") || s.includes("inactif") || s.includes("dormant")) return true;
  return false;
};

const _isNouveau = (r)=>{
  const s = _segL(r);
  return s.includes("nouveau") || s.includes("réactivé") || s.includes("reactiv");
};

const _isDecrochageAZ = (r)=>{
  const az = _az(r);
  return (az === "Décrochage confirmé" || az === "Décrochage en cours");
};

// "Client qui rapporte" : VIP (segment) OU CA significatif (M-1) OU top 20% sur CA ref (12m / ca12m)
const _isCoreClient = (r)=>{
  if(!r) return false;
  const imp = _imp(r, highThr, lowThr);
  if(imp === "haute") return true;

  const caM1 = (typeof r.caM1==="number" && isFinite(r.caM1)) ? r.caM1 : 0;
  if(caM1 >= 1000) return true;

  const caRef = (typeof r.caRef==="number" && isFinite(r.caRef)) ? r.caRef : 0;
  if(highThr>0 && caRef >= highThr) return true;

  return false;
};

// Retard sur habitude : récence >= 2× habitude, sauf fréquence élevée => +10j
// NOTE : uniquement si une habitude exploitable existe (habitGapDays).
const _lateByHabit = (r)=>{
  const rec = (r && typeof r.recCalDays==="number" && isFinite(r.recCalDays)) ? r.recCalDays : null;
  const hab0 = (r && typeof r.habitGapDays==="number" && isFinite(r.habitGapDays)) ? r.habitGapDays : null;
  if(rec==null || hab0==null || hab0<=0) return false;

  const hab = hab0; // ne pas clamp : tu veux la logique exacte + safety net
  const seuil = (hab < 10) ? (hab + 10) : (2 * hab);
  return rec >= seuil;
};

// Baisse réelle de volume : CA mois en cours (MTD) en forte baisse vs mois précédent (M-1) (si base significative)
const _hasVolumeDrop = (r)=>{
  if(!r) return false;
  const caM  = (typeof r.caM==="number" && isFinite(r.caM)) ? r.caM : 0;
  const caM1 = (typeof r.caM1==="number" && isFinite(r.caM1)) ? r.caM1 : 0;
  if(caM1 < 1000) return false;           // évite les micro-bases qui bruitent
  return caM < (0.75 * caM1);             // baisse >= 25%
};


// Rang CA pour l'affichage : par défaut CA de référence (12m), sinon CA M-1, sinon CA M
const _rankCA = (r)=>{
  const caRef = (r && typeof r.caRef==="number" && isFinite(r.caRef)) ? r.caRef : 0;
  const caM1  = (r && typeof r.caM1==="number"  && isFinite(r.caM1))  ? r.caM1  : 0;
  const caM2  = (r && typeof r.caM2==="number"  && isFinite(r.caM2))  ? r.caM2  : 0;
  const caM   = (r && typeof r.caM==="number"   && isFinite(r.caM))   ? r.caM   : 0;
  return (caRef>0) ? caRef : ((caM1>0) ? caM1 : ((caM2>0) ? caM2 : caM));
};

// Urgence = (Décrochage Direction) OU (Core client × (retard sur habitude OU baisse volume))
const _isUrgenceRule = (r)=>{
  if(!r) return false;
  if(_isExcluded(r)) return false;

  // Règle anti-faux-urgences : au-delà de 180 jours de récence, jamais "Urgence"
  // (ces clients retombent en "À surveiller" s'ils sont importants).
  const rec180 = (r && typeof r.recCalDays==="number" && isFinite(r.recCalDays)) ? r.recCalDays : null;
  if(rec180!=null && rec180 > 180) return false;

  if(_isDecrochageAZ(r)) return true;
  if(!_isCoreClient(r)) return false;
  return _lateByHabit(r) || _hasVolumeDrop(r);
};

const _isVIP = (r) => {
   const s = _segL(r);
   return s.includes("vip");
};

const _kName = (r)=> String(_rowName(r)||"").trim().toLowerCase();

// 1. Urgences (Vigilance)
const urgences = rows
  .filter(r => {
     if (r.isLost || !r.isActive || _isExcluded(r)) return false;
     const rec = r.recCalDays != null ? r.recCalDays : 0;
     const isDecrochage = _isDecrochageAZ(r);
     const isVip = _isVIP(r);
     const { tf, tdDisp } = _tftdLevels(r.c);

     if (isDecrochage && rec < 180) return true;
     if (isVip && (tf <= -0.50 || tdDisp <= -50)) return true;

     return false;
  })
  .sort((a,b) => (_rankCA(b)-_rankCA(a)) || _rowName(a).localeCompare(_rowName(b)));

const setU = new Set(urgences.map(_kName));

// 2. À surveiller (Risque)
let risques = rows
  .filter(r => {
     if (r.isLost || !r.isActive || _isExcluded(r)) return false;
     const nm = _kName(r);
     if (setU.has(nm)) return false; // Exclu des urgences

     const rec = r.recCalDays != null ? r.recCalDays : 0;
     const isDecrochage = _isDecrochageAZ(r);
     const az = _az(r);
     const isNouveau = _isNouveau(r);

     // Filtre \"clients qui font du CA\" : exclure ceux sans CA sur M, M-1, M-2 (sauf Nouveaux)
     const caRecent = ((typeof r.caM==="number" && isFinite(r.caM)) ? r.caM : 0) + ((typeof r.caM1==="number" && isFinite(r.caM1)) ? r.caM1 : 0) + ((typeof r.caM2==="number" && isFinite(r.caM2)) ? r.caM2 : 0);
     if(!isNouveau && caRecent <= 0) return false;

     // Strict: "presque partis" = retard relatif vs habitude (anti-bruit sur occasionnels)
     if (isDecrochage){
       const h = (r.habitGapDays != null && isFinite(r.habitGapDays) && r.habitGapDays > 0) ? r.habitGapDays : null;
       if(h){
         const thr = (h >= 90) ? 2.2 : 1.7;
         const ratio = rec / h;
         if(rec >= 45 && ratio >= thr) return true;
       }else{
         // fallback sans habitude fiable
         if(rec >= 180) return true;
       }
     }

     // Autorité Direction: Risque de décrochage
     if (az === "Risque de décrochage") return true;

     // Nouveaux : règle conservée (reste dans la tuile)
     if (isNouveau && rec >= 180) return true;

     return false;
  })
  // Tri: priorité aux "gros" (CA réalisé)
  .sort((a,b) => (_rankCA(b)-_rankCA(a)) || _rowName(a).localeCompare(_rowName(b)));

const setR = new Set(risques.map(_kName));
// 3. Nouveaux (30-180j)
const pep = rows
  .filter(r => {
     if (r.isLost || !r.isActive || _isExcluded(r)) return false;
     const nm = _kName(r);
     if(!nm) return false;
     if (setU.has(nm) || setR.has(nm)) return false; 

     const rec = r.recCalDays != null ? r.recCalDays : 0;
     const isNouveau = _isNouveau(r);

     if (isNouveau && rec >= 30 && rec < 180) return true;
     return false;
  })
  .sort((a,b) => (_rankCA(b)-_rankCA(a)) || _rowName(a).localeCompare(_rowName(b)));

const setP = new Set(pep.map(_kName));

// 4. Dynamiques
const vic = rows
  .filter(r => {
    if (r.isLost || !r.isActive || _isExcluded(r)) return false;
    const nm = _kName(r);
    if (setU.has(nm) || setR.has(nm) || setP.has(nm)) return false;

    const rec = (typeof r.recCalDays === "number" && isFinite(r.recCalDays)) ? r.recCalDays : null;
    if (rec === null || rec > 30) return false;

    const caM  = (typeof r.caM  === "number" && isFinite(r.caM))  ? r.caM  : 0;
    const caM1 = (typeof r.caM1 === "number" && isFinite(r.caM1)) ? r.caM1 : 0;
    const caM2 = (typeof r.caM2 === "number" && isFinite(r.caM2)) ? r.caM2 : 0;
    const avg3 = (caM + caM1 + caM2) / 3;

    const c = r.c || {};
    const monetaryHT   = (typeof c.monetaryHT   === "number" && isFinite(c.monetaryHT))   ? c.monetaryHT   : 0;
    const tenureMonths = (typeof c.tenureMonths  === "number" && isFinite(c.tenureMonths))  ? c.tenureMonths : 1;
    const avgHisto = monetaryHT / Math.min(Math.max(1, tenureMonths), 24);

    if (avg3 > avgHisto * 0.85) return true;

    const { tf } = _tftdLevels(c);
    if (tf != null && tf >= 0.10 && caM > 0) return true;

    return false;
  })
  .map(r => {
    const rec  = r.recCalDays;
    const caM  = (typeof r.caM  === "number" && isFinite(r.caM))  ? r.caM  : 0;
    const caM1 = (typeof r.caM1 === "number" && isFinite(r.caM1)) ? r.caM1 : 0;
    const caM2 = (typeof r.caM2 === "number" && isFinite(r.caM2)) ? r.caM2 : 0;
    const avg3 = (caM + caM1 + caM2) / 3;
    const c = r.c || {};
    const monetaryHT   = (typeof c.monetaryHT   === "number" && isFinite(c.monetaryHT))   ? c.monetaryHT   : 0;
    const tenureMonths = (typeof c.tenureMonths  === "number" && isFinite(c.tenureMonths))  ? c.tenureMonths : 1;
    const avgHisto = monetaryHT / Math.min(Math.max(1, tenureMonths), 24);
    const score = (avg3 / Math.max(avgHisto, 1)) * (1 - rec / 30);
    return { ...r, __dynScore: score };
  })
  .sort((a, b) => (b.__dynScore - a.__dynScore) || _rowName(a).localeCompare(_rowName(b)));

const setD = new Set(vic.map(_kName));

// Exposition globale pour tableau-bord.js
window.__pilotageCoVic = vic;

if(elUrgences) elUrgences.innerHTML = _topTableHTML(urgences, "—");
if(elRisque) elRisque.innerHTML = _topTableHTML(risques, "—");
if(elPep) elPep.innerHTML = _topTableHTML(pep, "—");
if(elVic) elVic.innerHTML = _topTableHTML(vic, "—");

if(elKpiU) elKpiU.textContent = String(urgences.length);
if(elKpiR) elKpiR.textContent = String(risques.length);
if(elKpiN) elKpiN.textContent = String(pep.length);
if(elKpiD) elKpiD.textContent = String(vic.length);

if(elKpiUc) elKpiUc.textContent = `${urgences.length} Clients`;
if(elKpiRc) elKpiRc.textContent = `${risques.length} Clients`;
if(elKpiNc) elKpiNc.textContent = `${pep.length} Clients`;
if(elKpiDc) elKpiDc.textContent = `${vic.length} Clients`;


// --- Gisement de CA (mix : PdP extrêmes + % Max CA ≤ 50% + reroutage A surveiller basse/normale) ---
try{
  const potMin = 50000;
  const mineThr = 0.15;
  const satThr  = 0.75;
  const maxThr  = 0.50;

  const isActiveRow = (r)=> (r && r.isActive && !r.isLost && !_isExcluded(r));
  const k = _kName;

  const base = rows.filter(isActiveRow);

  // 1) PdP extrêmes (basé sur Potentiel estimé)
  const manualRows = base.filter(r=>{
    const c = r.c||{};
    return (typeof c.potManual==="number" && isFinite(c.potManual) && c.potManual>=potMin &&
            typeof c.penetration==="number" && isFinite(c.penetration));
  });
  const mines = manualRows.filter(r=>r.c.penetration<=mineThr).sort((a,b)=>a.c.penetration-b.c.penetration);
  const sats  = manualRows.filter(r=>r.c.penetration>=satThr ).sort((a,b)=>b.c.penetration-a.c.penetration);

  // 2) Sous-couverts vs Max CA (indicateur historique)
  const lowMax = base.filter(r=>{
    const c = r.c||{};
    return (typeof c.pctOfMax==="number" && isFinite(c.pctOfMax) && c.pctOfMax <= maxThr);
  }).sort((a,b)=> (a.c.pctOfMax - b.c.pctOfMax) || (_rankCA(b)-_rankCA(a)));

  // 3) Dédup + priorités (Nouveaux/Vigilance/Dynamiques priment)
  const seen = new Set();
  const ban = (nm)=> !nm || setU.has(nm) || setP.has(nm) || setD.has(nm) || setR.has(nm); // setR = risques restants
  const pushUnique = (arr, r)=>{
    const nm = k(r);
    if(ban(nm)) return;
    if(seen.has(nm)) return;
    seen.add(nm);
    arr.push(r);
  };

  const gMines = []; const gSats = []; const gLowMax = [];

  // Inclure les reroutés depuis "A surveiller" (basse/normale) si présents
  try{
    if(typeof movedToGisement!=="undefined" && movedToGisement && movedToGisement.length){
      movedToGisement.forEach(r=>{
        // ils ne sont plus dans setR, donc passent la barrière
        if(r && r.c){
          if(typeof r.c.potManual==="number" && isFinite(r.c.potManual) && r.c.potManual>=potMin &&
             typeof r.c.penetration==="number" && isFinite(r.c.penetration)){
            if(r.c.penetration<=mineThr) pushUnique(gMines, r);
            else if(r.c.penetration>=satThr) pushUnique(gSats, r);
          }
          if(typeof r.c.pctOfMax==="number" && isFinite(r.c.pctOfMax) && r.c.pctOfMax<=maxThr){
            pushUnique(gLowMax, r);
          }
        }
      });
    }
  }catch(e){}

  mines.forEach(r=>pushUnique(gMines, r));
  sats.forEach(r=>pushUnique(gSats, r));
  lowMax.forEach(r=>pushUnique(gLowMax, r));

  if(elKpiE)  elKpiE.textContent  = `${gMines.length} / ${gSats.length} / ${gLowMax.length}`;
  if(elKpiEc) elKpiEc.textContent = `Fort Potentiels / Sous-Exploités / Saturés`;

  if(elExt){
    // Table unique (style standard) : Fort potentiel / Saturé / Sous-couvert
    const potMin = 50000;
    const mineThr = 0.15;
    const satThr  = 0.75;
    const maxThr  = 0.50;

    
    const gKeys  = ["__impRank","name","__type","__maxCA","caM","caM1","__varTxt","__pctMax","__pdp"];
    const gTypes = ["num","str","str","num","num","num","str","num","num"];

    const typeHelp = {
      "Fort potentiel": "Une réserve de croissance à exploiter : ce client a la capacité d'acheter beaucoup plus.",
      "Saturé": "Le potentiel maximum semble atteint : la priorité est la fidélisation.",
      "Sous-exploité": "Il a déjà fait beaucoup plus par le passé : Relance conseillée."
    };

    let gRows = [];
    const _pushG = (r, type)=>{
      if(!r || !r.c) return;
      const c = r.c;

      const imp = _imp(r, highThr, lowThr);
      const impRank = (imp==="haute") ? 0 : (imp==="basse" ? 2 : 1);
      const impLbl = (imp==="haute") ? "Haute" : (imp==="basse" ? "Basse" : "Normale");
      const impChip = `<span class="imp-chip ${imp}">${impLbl}</span>`;

      const maxCA = (typeof c.maxCA12m==="number" && isFinite(c.maxCA12m)) ? c.maxCA12m : null;
      const pctMax = (typeof c.pctOfMax==="number" && isFinite(c.pctOfMax)) ? (c.pctOfMax*100) : null;
      const pdp = (typeof c.penetration==="number" && isFinite(c.penetration)) ? (c.penetration*100) : null;

      const varObj = _varTxt(r.caM||0, r.caM1||0);

      gRows.push(Object.assign({}, r, {
        __impRank: impRank,
        __impHtml: impChip,
        __type: type,
        __typeHelp: (typeHelp[type]||""),
        __maxCA: maxCA,
        __pctMax: pctMax,
        __pdp: pdp,
        __varTxt: (varObj && varObj.txt) ? varObj.txt : "—"
      }));
    };

    // Build dataset
    gMines.forEach(r=>_pushG(r, "Fort potentiel"));
    gSats.forEach(r=>_pushG(r, "Saturé"));
    gLowMax.forEach(r=>_pushG(r, "Sous-exploité"));

    // Default sort state
    try{
      if(!state.ui.__pilotageCoGisementSort) state.ui.__pilotageCoGisementSort = {key:"__pctMax", dir:"asc"};
    }catch(e){}

    const fPct = (v)=> fmtPctPercent(v, 0);
    const fEur = (v)=> (v==null || !isFinite(v)) ? "—" : fmtMoney(v);

    const bodyId = "gisement-body";
    // apply current sort state BEFORE rendering (so rows actually move)
    try{
      state.ui = state.ui || {};
      if(!state.ui.__pilotageCoGisementSort) state.ui.__pilotageCoGisementSort = {key:gKeys[0], dir:"asc"};
      sortRowsByState(gRows, state.ui.__pilotageCoGisementSort, gKeys, gTypes);
    }catch(e){}
    elExt.innerHTML = `
      <div class="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Importance</th>
              <th>Client</th>
              <th style="min-width:380px;">Type</th>
              <th style="white-space:nowrap;">Max CA Historique</th>
              <th style="white-space:nowrap;">CA M</th>
              <th style="white-space:nowrap;">CA M-1</th>
              <th style="white-space:nowrap;">Variation</th>
              <th style="white-space:nowrap;">% Max CA</th>
              <th style="white-space:nowrap;">PdP</th>
            </tr>
          </thead>
          <tbody id="${bodyId}">
            ${gRows.length ? gRows.map(x=>`
              <tr>
                <td>${x.__impHtml||"—"}</td>
                <td class="clickClient" data-client="${escapeHtml(x.name)}" style="font-weight:700;">${escapeHtml(x.name)}</td>
                <td style="white-space:normal; line-height:1.25;"><span style="font-weight:800;">${escapeHtml(x.__type||"—")}</span><span style="opacity:0.7;"> — ${escapeHtml(x.__typeHelp||"")}</span></td>
                <td class="mono">${fEur(x.__maxCA)}</td>
                <td class="mono">${fEur(x.caM)}</td>
                <td class="mono">${fEur(x.caM1)}</td>
                <td class="mono">${escapeHtml(x.__varTxt||"—")}</td>
                <td class="mono">${fPct(x.__pctMax)}</td>
                <td class="mono">${fPct(x.__pdp)}</td>
              </tr>
            `).join("") : `<tr><td colspan="9" class="muted">—</td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    // sortable + click client
    try{
      setupSortableTable(bodyId, "__pilotageCoGisementSort", gKeys, gTypes, ()=>renderPilotageCo());
    }catch(e){}
    try{
      elExt.querySelectorAll(".clickClient").forEach(a=>{
        a.addEventListener("click", ()=>{
          try{
            const nm = a.getAttribute("data-client");
            if(!nm) return;
            if(typeof openClientCockpit==="function") openClientCockpit(nm);
          }catch(e){}
        });
      });
    }catch(e){}
    // Bind tri 1 seule fois
    try{
      if(!state.ui) state.ui = {};
      // Tri tableau Gisement — bind robuste (délégation, résiste aux re-render)
      setupSortableTable(bodyId, "__gisementSort", gKeys, gTypes, ()=>renderPilotageCo());
    }catch(e){}
  }
}catch(e){}

// --- Grand tableau : Plan d'Action ---
if(tb){
  const prio = (r)=>{
    const {status} = _tftdLevels(r.c);
    const s = status || "OK";
    if (s==="Critique" || s==="Critique +" || s==="Risque élevé") return 1;
    if (s==="Risque" || s==="Alerte forte" || s==="Érosion") return 2;
    if (s==="OK" || s==="Alerte" || s==="Risque volume") return 3;
    return 4;
  };

  const all = rows.filter(r=>{
     if (r.isLost || !r.isActive) return false;
     const nm = _kName(r);
     if(!nm) return false;
     if (setU.has(nm) || setR.has(nm) || setP.has(nm) || setD.has(nm)) return false;
     return true;
  }).slice().sort((a,b)=> (prio(a)-prio(b)) || (_rankCA(b)-_rankCA(a)) || String(a.name).localeCompare(String(b.name)));
    const maxRows = 400;

    // Filtre / recherche (Importance + recherche)
    const pf = document.getElementById("pilotFilter");
    const ps = document.getElementById("pilotSearch");
    const impMode = pf && pf.value ? String(pf.value) : "ALL";
    const q = ps && ps.value ? String(ps.value).trim().toLowerCase() : "";

    let subset = all;

    if(impMode !== "ALL"){
      subset = subset.filter(r=> _imp(r, highThr, lowThr) === impMode);
    }

    if(q){
      subset = subset.filter(r=> String(r.name||"").toLowerCase().includes(q));
    }

    // Tri selon l’état (clic sur en-têtes). Défaut: Importance (Haute → Normale → Basse).
    try{
      const sortState = (state.ui && state.ui.__pilotageCoSort) ? state.ui.__pilotageCoSort : {key:"__impRank", dir:"asc"};
      // dérivés sans muter les objets source
      const derived = subset.map(r=>{
        const imp = _imp(r, highThr, lowThr);
        const caM  = (typeof r.caM==="number" && isFinite(r.caM)) ? r.caM : 0;
        const caM1 = (typeof r.caM1==="number" && isFinite(r.caM1)) ? r.caM1 : 0;
        return Object.assign({}, r, {
          __impRank: (imp==="haute") ? 0 : (imp==="basse" ? 2 : 1),
          __diagSort: _parlerVrai(r) || "",
          __varPct: (caM1>0) ? ((caM-caM1)/caM1) : null,
          __pctMax: (r && r.c && isFinite(r.c.pctOfMax)) ? Number(r.c.pctOfMax) : (isFinite(r.__potMetric)?Number(r.__potMetric):-1),
          __pdp: (r && r.c && r.c.penetration!=null) ? Number(r.c.penetration) : -1
        });
      });
      sortRowsByState(derived, sortState,
        ["__impRank","name","segment","__diagSort","recCalDays","caM","caM1","__varPct","__pctMax","__pdp"],
        ["num","str","str","str","num","num","num","num","num","num"]
      );
      subset = derived;
    }catch(e){}

    subset = subset.slice(0, maxRows);

    tb.innerHTML = subset.map(r=>{
  const imp = _imp(r, highThr, lowThr);
  const varObj = _varTxt(r.caM||0, r.caM1||0);

  const __segOff = (typeof __alfredGetOfficialSeg==="function") ? (__alfredGetOfficialSeg(r.name) || (r.segment||"")) : (r.segment||"");
  const __isNew = (typeof segIsNew==="function") ? !!segIsNew(__segOff) : false;
  const __nmStyle = __isNew ? "color:#38bdf8; font-weight:900;" : "";
  const __nmTag = __isNew ? ` <span style="color:#38bdf8; font-weight:800;">(Nouveau)</span>` : "";
  const clientHtml = `<span class="client-link" data-client="${escapeHtml(r.name)}" style="${__nmStyle}"><b>${escapeHtml(r.name)}</b>${__nmTag}</span>`;
  const segTxt = r.segment || "—";
  const pv = _parlerVrai(r);
  const tfTd = _tfTdExplain(r);
  const rec = _recTxt(r);

  const impChip = `<span class="imp-chip ${imp}">${imp==="haute"?"Haute":(imp==="basse"?"Basse":"Normale")}</span>`;
  const diag = (tfTd && tfTd!=="—") ? `${escapeHtml(pv)} • ${escapeHtml(tfTd)}` : escapeHtml(pv);

  const pctMaxTxt = (r && r.__pctMaxTxt!=null) ? String(r.__pctMaxTxt) : "—";
  const pdpTxt = (r && r.__penTxt!=null) ? String(r.__penTxt) : "—";
  return `
    <tr>
      <td style="white-space:nowrap;">${impChip}</td>
      <td style="text-align:center;">${(() => { const ck = (window.ActionsCommerciales && window.ActionsCommerciales.isChecked) ? window.ActionsCommerciales.isChecked(r.name) : false; return `<input type="checkbox" class="ac-check" data-client="${escapeHtml(r.name)}" ${ck?"checked":""}>`; })()}</td>
      <td>${clientHtml}</td>
      <td>${escapeHtml(segTxt)}</td>
      <td>${diag}</td>
      <td class="mono">${escapeHtml(rec)}</td>
      <td class="mono">${fmtEUR(r.caM||0)}</td>
      <td class="mono">${fmtEUR(r.caM1||0)}</td>
      <td class="mono ${varObj.cls}">${escapeHtml(varObj.txt)}</td>
      <td class="mono ${escapeHtml((r && r.__pctMaxCls)||"")}">${escapeHtml(pctMaxTxt)}</td>
      <td class="mono">${escapeHtml(pdpTxt)}</td>
    </tr>
  `;
}).join("") || `<tr><td colspan="11" class="muted">—</td></tr>`;
  }

  if(elUrgences) elUrgences.innerHTML = _topTableHTML(urgences, "—");
  if(elRisque)   elRisque.innerHTML   = _topTableHTML(risques, "—");
  if(elPep)      elPep.innerHTML      = _topTableHTML(pep, "—");
  if(elVic)      elVic.innerHTML      = _topTableHTML(vic, "—");

  if(elKpiR) elKpiR.textContent = String(risques.length);
  if(elKpiN) elKpiN.textContent = String(pep.length);
  if(elKpiD) elKpiD.textContent = String(vic.length);

  // --- Grand tableau : Plan d'Action ---
  // (désactivé) Bloc dupliqué supprimé : la version active est plus haut dans renderPilotageCo.

  try{ bindDomSortableTables(); }catch(e){}

}

// === MODALE RECONQUÊTE (PERDUS) ===
function openReconqueteModal() {
  const container = document.getElementById('reconqueteList');
  const modal = document.getElementById('modalReconquete');
  if(!container || !modal || !state || !state.clients) return;

  const perdus = state.clients
    .filter(c => c && (c.segment === 'Perdus' || c.segment === 'Perdus Historiques'))
    .sort((a,b) => (b.lastOrderDate||'').localeCompare(a.lastOrderDate||''));

  if(!perdus.length){
    container.innerHTML = '<div class="muted" style="text-align:center; padding:20px;">Aucun client perdu identifié.</div>';
  }else{
    let html = '';
    for(const c of perdus){
      const dateStr = c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString('fr-FR') : 'Inconnue';
      html += `
        <div class="glass-blade" style="padding:12px 20px; opacity:0.75; margin-bottom:8px;">
          <div style="flex:1;">
            <div style="font-weight:800; font-size:15px;">${escapeHtml(c.name||'')}</div>
            <div class="muted" style="font-size:12px;">Dernière commande : ${escapeHtml(dateStr)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:bold; color:var(--muted);">${formatMoney(c.m||0)} <span style="font-size:10px; font-weight:normal;">(Historique HT)</span></div>
            <div class="glossy-tag" style="background:rgba(255,255,255,0.05); color:var(--muted); border-color:transparent;">${escapeHtml(c.segment||'')}</div>
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  }
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  modal.style.pointerEvents = 'auto';
}



/* === Helper global : anti-doublons KPI (pour openKpiDetail) ===
   NOTE: Dans V6.41, une version de ce helper a été injectée *après* </html> (donc non exécutée),
   ce qui provoquait: ReferenceError: _uniqByClientName is not defined.
   On le (re)déclare ici, dans un <script> exécuté, pour sécuriser openKpiDetail().
*/
function _uniqByClientName(items, valueKey){
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
}


/* === PATCH: Pilotage Co tiles handler (global for inline onclick) ===
   - Ajouté pour résoudre: togglePilotageCoPanel is not defined
   - Sans scroll automatique
   - Tuile active en vert
   - Scope limité à la vue Pilotage Co pour ne pas impacter la fiche client
*/
window.togglePilotageCoPanel = window.togglePilotageCoPanel || function(tileEl, panelId){
  try{
    const root = document.getElementById("view-pilotage-co") || document;

    // Panels: dans la vue pilotage-co si possible, sinon fallback global
    const target =
      (root !== document ? root.querySelector("#"+CSS.escape(panelId)) : null) ||
      document.getElementById(panelId);
    if(!target) return;

    // Liste des panels "bloc-*" (scope pilotage-co uniquement si possible)
    const panels = (root !== document ? root.querySelectorAll('[id^="bloc-"]') : document.querySelectorAll('[id^="bloc-"]'));

    // Etat courant : on se base sur la classe 'hidden' (et non style.display)
    const isOpen = !target.classList.contains("hidden");

    // Fermer tous les panels
    panels.forEach(p => { if(p) p.classList.add("hidden"); });

    // Toggle du panel cible
    if(isOpen){
      target.classList.add("hidden");
    }else{
      target.classList.remove("hidden");
    }

    // Highlight tuiles: uniquement dans la vue pilotage-co
    const tiles = (root !== document ? root.querySelectorAll(".pilotageCoTile") : document.querySelectorAll("#view-pilotage-co .pilotageCoTile"));
    tiles.forEach(t=>{
      t.style.background = "";
      t.style.borderColor = "";
      t.style.boxShadow = "";
      try{ t.classList.remove("is-on"); }catch(_e){}
    });

    if(tileEl && !isOpen){
      try{ tileEl.classList.add("is-on"); }catch(_e){}
    }
  }catch(err){
    console.error(err);
  }
};
