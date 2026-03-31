function renderALFRED(){

  const sel = document.getElementById("yearSelect");
  const tbody = document.getElementById("yearMonthsTbody");
  const kpiBox = document.getElementById("yearKpis");
  if(!sel || !tbody || !kpiBox) return;

  const monthEl = document.getElementById("monthSelect");
  const rollingEl = document.getElementById("rolling12");
  const mSel = monthEl ? (monthEl.value || "") : "";
  const rolling = rollingEl ? !!rollingEl.checked : false;

  const shiftYear = (iso, delta)=>{
    if(!iso) return "";
    const y = parseInt(iso.slice(0,4),10);
    if(!isFinite(y)) return iso;
    return String(y+delta) + iso.slice(4);
  };

  const fmtFR = (iso)=>{
    if(!iso || typeof iso!=="string" || iso.length<10) return "—";
    const y=iso.slice(0,4), m=iso.slice(5,7), d=iso.slice(8,10);
    return `${d}/${m}/${y}`;
  };

  const table = tbody.closest("table");
  const thead = table ? table.querySelector("thead") : null;

  // Header aligné sur les colonnes + données centrées
  if(thead){
    thead.innerHTML = `
      <tr>
        <th style="width:1%; white-space:nowrap; text-align:left; padding:6px 8px;">Mois</th>
        <th style="text-align:center; padding:6px 8px;">CA N</th>
        <th style="text-align:center; padding:6px 8px;">CA N-1</th>
        <th style="text-align:center; padding:6px 8px;">Écart Valeur</th>
        <th style="text-align:center; padding:6px 8px;">Écart %</th>
      </tr>
    `;
  }

  // Compactage
  if(table){
    table.style.width = "100%";
    table.style.tableLayout = "auto";
    table.style.minWidth = "0";
  }

  if(!state.tx || !state.tx.length){
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Importe un fichier puis clique Recalculer.</td></tr>`;
    kpiBox.innerHTML = "";
    return;
  }

  const years = _yearsInData();
  if(!years.length) return;

  // Init select si nécessaire (une seule fois)
  if(!sel.options.length){
    sel.innerHTML = years.slice().reverse()
      .map(y=>`<option value="${y}">${y}</option>`)
      .join("");
  }

  const yN  = parseInt(sel.value,10);
  const yN1 = yN - 1;

  const ranges = getALFREDRanges(yN);
  const rangeN  = ranges.rangeN;
  const rangeN1 = ranges.rangeN1;

  const monthNames = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];

  const pad2 = (n)=>String(n).padStart(2,'0');

  const sumMonth = (year, m, rS, rE)=>{
    const s = new Date(Date.UTC(year, m-1, 1));
    const e = new Date(Date.UTC(year, m, 0));
    let sISO = s.toISOString().slice(0,10);
    let eISO = e.toISOString().slice(0,10);

    // Intersection mois × période filtre
    if(rS && rS > sISO) sISO = rS;
    if(rE && rE < eISO) eISO = rE;
    if(sISO > eISO) return 0;

    // Fast path: month-aligned + no partial month → portfolioMonthly
    if((!rS || rS <= sISO) && (!rE || rE >= eISO)){
      const mk = `${year}-${pad2(m)}`;
      const pm = state.cache && state.cache.portfolioMonthly ? state.cache.portfolioMonthly : null;
      const cell = pm ? pm.get(mk) : null;
      return (cell && isFinite(cell.sumHT)) ? Number(cell.sumHT) : 0;
    }

    // Precise path: use cache sorted tx + prefix sums
    const v = __cacheSumBetweenDates(sISO, eISO);
    return (v==null || !isFinite(v)) ? 0 : v;
  };

  const mkPct = v=>{
    if(v==null || !isFinite(v)) return "—";
    const sign = v>0 ? "+" : "";
    return sign + v.toFixed(1).replace(".",",") + "%";
  };

  let totN=0, totN1=0;
  const rows = [];
  const monthsToShow = mSel ? [parseInt(mSel,10)] : Array.from({length:12}, (_,i)=>i+1);
  for(const m of monthsToShow){
    const caN  = sumMonth(yN,  m, rangeN.s,  rangeN.e);
    const caN1 = sumMonth(yN1, m, rangeN1.s, rangeN1.e);
    totN += caN; totN1 += caN1;

    const diff = caN - caN1;
    const diffPct = (caN1 > 0) ? (diff/caN1*100) : null;

    const colorValue = diff > 0 ? "#22c55e" : (diff < 0 ? "#ef4444" : "#999");
    const colorPct   = (diffPct!=null && isFinite(diffPct))
      ? (diffPct > 0 ? "#22c55e" : (diffPct < 0 ? "#ef4444" : "#999"))
      : "#999";

    rows.push(`
      <tr>
        <td style="padding:6px 8px; text-align:left; white-space:nowrap;"><span class="month-link" data-year="${yN}" data-month="${m}" data-ym="${yN}-${pad2(m)}" style="cursor:pointer; text-decoration:underline dotted; text-underline-offset:3px;">${monthNames[m-1]}</span></td>
        <td style="padding:6px 8px; text-align:center;">${fmtMoney(caN)}</td>
        <td style="padding:6px 8px; text-align:center;">${fmtMoney(caN1)}</td>
        <td style="padding:6px 8px; text-align:center; color:${colorValue}; font-weight:600;">${fmtMoney(diff)}</td>
        <td style="padding:6px 8px; text-align:center; color:${colorPct}; font-weight:600;">${mkPct(diffPct)}</td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join("");

  const globalPct = (totN1>0) ? ((totN-totN1)/totN1*100) : null;

  const extraLbl = (ranges.mode==='rolling12' || ranges.mode==='rolling12_auto') ? ' • 12m glissants' : (ranges.mode==='month' ? ' • mois' : (ranges.mode==='ytd_auto' ? ' • ytd' : ''));
  const periodLbl = (ranges.mode!=='year')
    ? `${fmtFR(rangeN.s)} → ${fmtFR(rangeN.e)} (N) • ${fmtFR(rangeN1.s)} → ${fmtFR(rangeN1.e)} (N-1)${extraLbl}`
    : `${yN} vs ${yN1}`;

  // Affichage compact : on met le détail complet en tooltip pour ne pas casser le layout
  const mVal2 = (document.getElementById('monthSelect') && (document.getElementById('monthSelect').value || '')) || '';
  let periodShort = '';
  if(ranges.mode === 'year') periodShort = `Année ${yN}`;
  else if(ranges.mode === 'ytd_auto') periodShort = `${yN}`;
  else if(ranges.mode === 'rolling12' || ranges.mode === 'rolling12_auto') periodShort = '12M glissants';
  else if(ranges.mode === 'month' && mVal2) {
    const mi = Math.max(1, Math.min(12, parseInt(mVal2,10))) - 1;
    periodShort = `Mois ${monthNames[mi]} ${yN}`;
  } else {
    periodShort = `${fmtFR(rangeN.s)}–${fmtFR(rangeN.e)}`;
  }

  kpiBox.innerHTML = `
    <div class="kpi"><div class="k">CA N (${yN})</div><div class="v">${fmtMoney(totN)}</div></div>
    <div class="kpi"><div class="k">CA N-1 (${yN1})</div><div class="v">${fmtMoney(totN1)}</div></div>
    <div class="kpi"><div class="k">Écart</div><div class="v" style="color:${(totN-totN1)>0 ? '#22c55e' : ((totN-totN1)<0 ? '#ef4444' : 'rgba(255,255,255,0.92)')}; font-weight:800;">${fmtMoney(totN-totN1)}</div></div>
    <div class="kpi"><div class="k">Écart %</div><div class="v mono" style="color:${(globalPct!=null && isFinite(globalPct)) ? (globalPct>0 ? '#22c55e' : (globalPct<0 ? '#ef4444' : 'rgba(255,255,255,0.92)')) : 'rgba(255,255,255,0.92)'}; font-weight:800;">${globalPct==null?"NC":(globalPct>0?"+":"")+globalPct.toFixed(1).replace(".",",")+"%"}</div></div>
    <div class="kpi"><div class="k">PÉRIODE</div><div class="v mono" title="${periodLbl}">${periodShort}</div></div>
    <div class="kpi"><div class="k">Référence</div><div class="v mono">${_asOfISO()}</div></div>
  `;

  // --- LANCEMENT DU COCKPIT ALFRED AUTONOME ---
  buildALFREDCockpit(yN);
}


/* =========================================================
   DRILL "CA MENSUEL" : clic sur un mois => liste clients + YoY
   + Délégation globale : clic sur un nom client => fiche client
========================================================= */

// 1) Clic global sur les noms clients (tous tableaux)
(function(){
  if(window.__alfredClientLinkDelegationInstalled) return;
  window.__alfredClientLinkDelegationInstalled = true;
  document.addEventListener('click', function(ev){
    const el = ev && ev.target && ev.target.closest ? ev.target.closest('[data-client]') : null;
    if(!el) return;
    const name = el.getAttribute('data-client');
    if(!name) return;
    // éviter d'intercepter des champs
    const tag = (el.tagName||"").toUpperCase();
    if(tag==="INPUT"||tag==="SELECT"||tag==="TEXTAREA") return;
    ev.preventDefault();
    try{ if(typeof window.openClientDetail === 'function') window.openClientDetail(name); }catch(_e){}
  }, true);
})();

// 2) Drill mois : liste clients + variation N vs N-1
window.openALFREDMonthDrill = function(year, month){
  try{
    const yN = parseInt(year,10);
    const m  = parseInt(month,10);
    if(!isFinite(yN) || !isFinite(m) || m<1 || m>12) return;
    const yN1 = yN - 1;

    // Récupérer les bornes de période (mêmes règles que le tableau mensuel)
    const ranges = (typeof getALFREDRanges==="function") ? getALFREDRanges(yN) : null;
    const rangeN  = ranges ? ranges.rangeN  : {s:`${yN}-01-01`, e:`${yN}-12-31`};
    const rangeN1 = ranges ? ranges.rangeN1 : {s:`${yN1}-01-01`, e:`${yN1}-12-31`};

    const makeBounds = (y, mo, rS, rE)=>{
      const s = new Date(Date.UTC(y, mo-1, 1));
      const e = new Date(Date.UTC(y, mo, 0));
      let sISO = s.toISOString().slice(0,10);
      let eISO = e.toISOString().slice(0,10);
      if(rS && rS > sISO) sISO = rS;
      if(rE && rE < eISO) eISO = rE;
      if(sISO > eISO) return null;
      return {sISO, eISO};
    };

    const bN  = makeBounds(yN,  m, rangeN.s,  rangeN.e);
    const bN1 = makeBounds(yN1, m, rangeN1.s, rangeN1.e);

    const mapN  = new Map();
    const mapN1 = new Map();

    for(const c of (state.clients||[])){
      const nm = c && c.name;
      if(!nm) continue;
      if(bN){
        const vN = _sumTxForClientBetween(nm, bN.sISO, bN.eISO);
        if(vN) mapN.set(nm, vN);
      }
      if(bN1){
        const vN1 = _sumTxForClientBetween(nm, bN1.sISO, bN1.eISO);
        if(vN1) mapN1.set(nm, vN1);
      }
    }

    const all = new Set([...mapN.keys(), ...mapN1.keys()]);
    const rows = [];
    let totN=0, totN1=0;

    for(const nm of all){
      const caN  = mapN.get(nm)  || 0;
      const caN1 = mapN1.get(nm) || 0;
      if(!caN && !caN1) continue;
      totN += caN; totN1 += caN1;
      rows.push({name:nm, caN, caN1});
    }

    rows.sort((a,b)=> (b.caN - a.caN) || (b.caN1 - a.caN1) || String(a.name).localeCompare(String(b.name)));

    const monthLong = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
    const title = `Clients • ${monthLong[m-1]} ${yN} (vs ${yN1})`;

    const varLine = (caN, caN1)=>{
      const diff = (caN||0) - (caN1||0);
      const pct  = (caN1>0) ? (diff/caN1*100) : null;
      const sign = diff>0 ? "+" : "";
      const diffTxt = sign + fmtMoney(diff);
      const pctTxt  = (pct==null || !isFinite(pct)) ? "—" : ((pct>0?"+":"") + pct.toFixed(1).replace(".",",") + "%");
      const cls = diff>0 ? "pos" : (diff<0 ? "neg" : "neu");
      return {diff, pct, diffTxt, pctTxt, cls};
    };

    const segOf = (nm)=>{
      const c = (state.clients||[]).find(x=>x && (x.name===nm || (x.name||"").trim()===(nm||"").trim()));
      return c ? (c.segment||"—") : "—";
    };

    const head = `
      <div class="small muted" style="margin-bottom:10px;">
        Période mois : <span class="mono">${bN?bN.sISO:"—"} → ${bN?bN.eISO:"—"}</span> •
        N-1 : <span class="mono">${bN1?bN1.sISO:"—"} → ${bN1?bN1.eISO:"—"}</span>
      </div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
        <div class="kpi"><div class="k">CA mois (N)</div><div class="v">${fmtMoney(totN)}</div></div>
        <div class="kpi"><div class="k">CA mois (N-1)</div><div class="v">${fmtMoney(totN1)}</div></div>
        <div class="kpi"><div class="k">Écart</div><div class="v" style="color:${(totN-totN1)>0 ? '#22c55e' : ((totN-totN1)<0 ? '#ef4444' : 'rgba(255,255,255,0.92)')}; font-weight:800;">${fmtMoney(totN-totN1)}</div></div>
      </div>
    `;

    const table = `
      <div class="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Segment</th>
              <th style="white-space:nowrap;">CA mois</th>
              <th style="white-space:nowrap;">CA mois N-1</th>
              <th style="white-space:nowrap;">Variation</th>
              <th style="white-space:nowrap;">Var %</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.map(r=>{
                const v = varLine(r.caN, r.caN1);
                const color = v.diff>0 ? "#22c55e" : (v.diff<0 ? "#ef4444" : "#999");
                const colorPct = (v.pct!=null && isFinite(v.pct)) ? (v.pct>0 ? "#22c55e" : (v.pct<0 ? "#ef4444" : "#999")) : "#999";
                return `
                  <tr>
                    <td><span class="client-link" data-client="${escapeHtml(r.name)}" style="font-weight:650; cursor:pointer;">${escapeHtml(r.name)}</span></td>
                    <td>${escapeHtml(segOf(r.name))}</td>
                    <td class="mono" style="font-weight:800;">${fmtMoney(r.caN||0)}</td>
                    <td class="mono">${fmtMoney(r.caN1||0)}</td>
                    <td class="mono" style="color:${color}; font-weight:700;">${escapeHtml(v.diffTxt)}</td>
                    <td class="mono" style="color:${colorPct}; font-weight:700;">${escapeHtml(v.pctTxt)}</td>
                  </tr>
                `;
              }).join("")
              || `<tr><td colspan="6" class="muted">Aucun client sur ce mois.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;

    const mEl = document.getElementById('modalALFREDDrill');
    const tEl = document.getElementById('alfredDrillTitle');
    const cEl = document.getElementById('alfredDrillContent');
    if(tEl) tEl.textContent = title;
    if(cEl) cEl.innerHTML = head + table;
    if(mEl){ mEl.classList.remove('hidden'); mEl.style.display = 'flex'; mEl.style.pointerEvents='auto'; }
  }catch(e){
    console.error("[ALFRED] Month drill error", e);
  }
};

// Délégation clic mois (table CA mensuel)
(function(){
  if(window.__alfredMonthLinkDelegationInstalled) return;
  window.__alfredMonthLinkDelegationInstalled = true;
  document.addEventListener('click', function(ev){
    const el = ev && ev.target && ev.target.closest ? ev.target.closest('.month-link') : null;
    if(!el) return;
    const y = el.getAttribute('data-year');
    const m = el.getAttribute('data-month');
    if(!y || !m) return;
    ev.preventDefault();
    window.openALFREDMonthDrill(y, m);
  }, true);
})();


// ==========================================
// MODULE : ALFRED COCKPIT AUTONOME
// ==========================================
function resetALFREDDates() {
  const m = document.getElementById('monthSelect');
  const r = document.getElementById('rolling12');
  if(m) m.value = '';
  if(r) r.checked = false;
  renderALFRED();
}


function __daysInMonth(y, m){ return new Date(Date.UTC(y, m, 0)).getUTCDate(); } // m:1..12
function __shiftIsoYearsClamped(iso, deltaY){
  if(!iso || iso.length<10) return iso;
  const y = parseInt(iso.slice(0,4),10);
  const m = parseInt(iso.slice(5,7),10);
  const d = parseInt(iso.slice(8,10),10);
  if(!isFinite(y)||!isFinite(m)||!isFinite(d)) return iso;
  const ny = y + deltaY;
  const dim = __daysInMonth(ny, m);
  const nd = Math.min(d, dim);
  return String(ny).padStart(4,'0') + '-' + String(m).padStart(2,'0') + '-' + String(nd).padStart(2,'0');
}
function __isoFromUTCDate(dt){ return dt.toISOString().slice(0,10); }
function getALFREDRanges(yN){
  const mEl = document.getElementById('monthSelect');
  const rEl = document.getElementById('rolling12');
  const mVal = mEl ? (mEl.value || '') : '';
  const rolling = rEl ? !!rEl.checked : false;

  if(!mVal){
    if(rolling){
      const now = new Date();
      const curY = now.getFullYear();
      const endMonth = (yN === curY) ? (now.getMonth()+1) : 12;
      const endN = __isoFromUTCDate(new Date(Date.UTC(yN, endMonth, 0)));
      const startDt = new Date(Date.UTC(yN, endMonth-1, 1));
      startDt.setUTCMonth(startDt.getUTCMonth() - 11);
      const startN = __isoFromUTCDate(startDt);
      const rangeN = { s:startN, e:endN };
      const rangeN1 = { s: __shiftIsoYearsClamped(startN, -1), e: __shiftIsoYearsClamped(endN, -1) };
      return { rangeN, rangeN1, mode:'rolling12_auto' };
    }
    // Année complète (attention : si année en cours, on force une comparaison YTD pour éviter "1 mois vs 1 an")
    const asOfISO = (typeof state !== 'undefined' && state && state.periodWindow && state.periodWindow.asOfISO) ? state.periodWindow.asOfISO : new Date().toISOString().slice(0,10);
    const asOfY = parseInt(asOfISO.slice(0,4), 10);
    if(asOfY === yN){
      const asOfM = parseInt(asOfISO.slice(5,7), 10);
      const endN = __isoFromUTCDate(new Date(Date.UTC(yN, asOfM, 0)));
      const endN1 = __isoFromUTCDate(new Date(Date.UTC(yN-1, asOfM, 0)));
      const rangeN = { s:`${yN}-01-01`, e:endN };
      const rangeN1 = { s:`${yN-1}-01-01`, e:endN1 };
      return { rangeN, rangeN1, mode:'ytd_auto' };
    }
    return { rangeN:{s:`${yN}-01-01`, e:`${yN}-12-31`}, rangeN1:{s:`${yN-1}-01-01`, e:`${yN-1}-12-31`}, mode:'year' };
  }

  const m = parseInt(mVal,10);
  let endN = __isoFromUTCDate(new Date(Date.UTC(yN, m, 0)));

  let startN;
  if(rolling){
    const startDt = new Date(Date.UTC(yN, m-1, 1));
    startDt.setUTCMonth(startDt.getUTCMonth() - 11);
    startN = __isoFromUTCDate(startDt);
  } else {
    startN = __isoFromUTCDate(new Date(Date.UTC(yN, m-1, 1)));
  }
  const rangeN = { s:startN, e:endN };
  const rangeN1 = { s: __shiftIsoYearsClamped(startN, -1), e: __shiftIsoYearsClamped(endN, -1) };
  return { rangeN, rangeN1, mode: rolling ? 'rolling12' : 'month' };
}


function fmtDateFR(iso){
  if(!iso || String(iso).length < 10) return '';
  const s = String(iso).slice(0,10);
  return s.slice(8,10) + '/' + s.slice(5,7) + '/' + s.slice(0,4);
}


function openALFREDDrill(title, list, mode='simple') {
  const m = document.getElementById('modalALFREDDrill');
  document.getElementById('alfredDrillTitle').innerText = title;
  const content = document.getElementById('alfredDrillContent');

  // Memo pour le tri
  window.__alfredDrillLast = { title, list, mode };
  const stAll = window.__alfredDrillSortState || (window.__alfredDrillSortState = {});
  const st = stAll[title] || { key: null, dir: -1 }; // dir: -1 = desc, +1 = asc

  if(!list || list.length === 0) {
    content.innerHTML = '<div class="muted">Aucun client trouvé.</div>';
    m.classList.remove('hidden');
  m.style.display = 'flex';
  m.style.pointerEvents = 'auto';
    return;
  }

  const cls = (v)=> (v>0?'pos':(v<0?'neg':'neu'));

  const esc = (s)=> String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const escAttr = (s)=> String(s ?? '')
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // --- Source Unique de Vérité : segment officiel via state.clients ---
  const __alfredSegCache = new Map();
  const __alfredGetOfficialSeg = (nm)=>{
    const key = String(nm||"").trim();
    if(__alfredSegCache.has(key)) return __alfredSegCache.get(key);
    let seg = "";
    try{
      const low = key.toLowerCase();
      const c = (state && state.clients ? (state.clients||[]).find(x=>x && x.name && (
        x.name === key || x.name.trim() === key ||
        x.name.toLowerCase() === low || x.name.trim().toLowerCase() === low
      )) : null);
      seg = c && c.segment ? c.segment : "";
    }catch(e){ seg = ""; }
    __alfredSegCache.set(key, seg);
    return seg;
  };

  const clientLink = (name, color, tagHtml='') => {
    const seg = __alfredGetOfficialSeg(name);
    const isNew = (typeof segIsNew === "function") ? !!segIsNew(seg) : false;
    const finalColor = isNew ? "#38bdf8" : (color || "var(--text)");
    const finalWeight = isNew ? 900 : 700;
    const autoTag = isNew ? ` <span style="color:#38bdf8; font-weight:800;">(Nouveau)</span>` : '';
    return `<a href="#" class="alfredClientLink" data-client="${escAttr(name)}" style="color:${finalColor}; text-decoration:none; font-weight:${finalWeight};">${esc(name)}${autoTag}${tagHtml||''}</a>`;
  };

  const bindClientLinks = ()=>{
    try{
      const links = content.querySelectorAll('a.alfredClientLink[data-client]');
      links.forEach(a=>{
        a.onclick = (ev)=>{ ev.preventDefault(); (window.__openClientFromALFRED||__openClientFromALFRED)(a.getAttribute('data-client')); return false; };
      });
    } catch(e){}
  };

  const th = (label, key, right=false)=>{
    const active = (st.key === key);
    const arrow = active ? (st.dir > 0 ? ' ▲' : ' ▼') : '';
    const align = right ? 'text-align:right;' : 'text-align:left;';
    return `<th onclick="(window.__alfredDrillResort||__alfredDrillResort)('${key}')" style="padding:10px 6px; ${align} cursor:pointer; user-select:none; white-space:nowrap;">${label}${arrow}</th>`;
  };

  const sortNum = (a,b)=> (a===b?0:(a>b?1:-1));
  const getNum = (v)=> (v==null || !isFinite(v)) ? -Infinity : +v;
  const getStr = (v)=> (v==null ? '' : String(v));
  const getIso = (v)=> (v && typeof v === 'string' ? v.slice(0,10) : '');

  const applySort = (rows, defaultKey, getters)=>{
    const key = st.key || defaultKey;
    const dir = st.dir || -1;
    const g = getters[key] || getters[defaultKey];
    if(!g) return rows;
    rows.sort((A,B)=>{
      const a = g(A), b = g(B);
      // num vs string
      if(typeof a === 'number' || typeof b === 'number'){
        return sortNum(getNum(a), getNum(b)) * dir;
      }
      return getStr(a).localeCompare(getStr(b), 'fr') * dir;
    });
    return rows;
  };

  // Auto-detect mode if needed
  const sample = list[0] || {};
  if(mode === 'simple' && (('d' in sample) || ('n' in sample) || ('n1' in sample))) mode = 'delta';

  if(mode === 'new') {
    // list items: {name, val, firstNISO, recence}
    const rows = list.map(x => ({
      name: x.name,
      val: isFinite(x.val) ? x.val : 0,
      first: x.firstNISO || x.first || x.firstISO || x.firstNISO || null,
      rec: (x.recence===0 || isFinite(x.recence)) ? x.recence : null,
      kind: (x.kind || null)
    }));

    applySort(rows, 'val', {
      name: r=>r.name,
      first: r=>getIso(r.first),
      rec: r=>getNum(r.rec),
      val: r=>getNum(r.val),
    });

    content.innerHTML = `<table style="width:100%; border-collapse:collapse;">
      <thead style="font-size:12px; color:var(--muted);">
        <tr>
          ${th('Client','name',false)}
          ${th('Date 1ère commande','first',true)}
          ${th('Récence','rec',true)}
          ${th('Montant HT','val',true)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(c => `<tr>
          <td style="padding:8px 0; border-bottom:1px solid var(--stroke);">${clientLink(c.name, (c.kind==='reactivated'?'var(--text)':'var(--accent)'))}</td>
          <td style="text-align:right; border-bottom:1px solid var(--stroke); white-space:nowrap;">${fmtDateFR(c.first)}</td>
          <td style="text-align:right; border-bottom:1px solid var(--stroke); white-space:nowrap;">${(c.rec===null? '—' : (c.rec + ' j'))}</td>
          <td style="text-align:right; border-bottom:1px solid var(--stroke); font-weight:900;"><span class="pos">${fmtMoney(c.val)}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  } else if(mode === 'lost') {
    // list items: {name, val, lastN1ISO, recence}
    const rows = list.map(x => ({
      name: x.name,
      val: isFinite(x.val) ? x.val : 0,
      last: x.lastN1ISO || x.last || x.lastISO || null,
      rec: (x.recence===0 || isFinite(x.recence)) ? x.recence : null
    }));

    applySort(rows, 'val', {
      name: r=>r.name,
      last: r=>getIso(r.last),
      rec: r=>getNum(r.rec),
      val: r=>getNum(r.val),
    });

    // Si pas de colonnes enrichies, on retombe sur un tableau simple
    const hasMeta = rows.some(r => r.last || r.rec!=null);

    content.innerHTML = hasMeta ? `<table style="width:100%; border-collapse:collapse;">
      <thead style="font-size:12px; color:var(--muted);">
        <tr>
          ${th('Client','name',false)}
          ${th('Date dernière commande','last',true)}
          ${th('Récence','rec',true)}
          ${th('Montant HT','val',true)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(c => `<tr>
          <td style="padding:8px 0; border-bottom:1px solid var(--stroke);">${clientLink(c.name)}</td>
          <td style="text-align:right; border-bottom:1px solid var(--stroke); white-space:nowrap;">${fmtDateFR(c.last)}</td>
          <td style="text-align:right; border-bottom:1px solid var(--stroke); white-space:nowrap;">${(c.rec==null? '—' : (c.rec + ' j'))}</td>
          <td style="text-align:right; border-bottom:1px solid var(--stroke); font-weight:900;"><span class="neg">${fmtMoney(c.val)}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<table style="width:100%; border-collapse:collapse;">
      <thead style="font-size:12px; color:var(--muted);">
        <tr>
          ${th('Client','name',false)}
          ${th('Montant HT','val',true)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(c => `<tr>
          <td style="padding:8px 0; border-bottom:1px solid var(--stroke);">${clientLink(c.name)}</td>
          <td style="text-align:right; border-bottom:1px solid var(--stroke); font-weight:900;"><span class="neg">${fmtMoney(c.val)}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>`;


  } else if(mode === 'pareto') {
    const years = window.__alfredLastYears || {};
    const yN = years.yN || 'N';
    const yN1 = years.yN1 || 'N-1';

    const rows = list.map(x => ({
      name: x.name,
      seg: x.seg || '',
      tfPct: (x.tfPct===0 || isFinite(x.tfPct)) ? x.tfPct : null,
      tvPct: (x.tvPct===0 || isFinite(x.tvPct)) ? x.tvPct : null,
      caN: isFinite(x.caN) ? x.caN : 0,
      caN1: isFinite(x.caN1) ? x.caN1 : 0,
      varVal: (x.varVal===0 || isFinite(x.varVal)) ? x.varVal : ((isFinite(x.caN)&&isFinite(x.caN1))?(x.caN-x.caN1):0),
      varPct: (x.varPct===0 || isFinite(x.varPct)) ? x.varPct : null,
      shareN1: (x.shareN1===0 || isFinite(x.shareN1)) ? x.shareN1 : 0,
    }));

    const pct = (v)=>{
      if(v===null || !isFinite(v)) return '—';
      const s = (v>0?'+':'') + (Math.round(v*10)/10).toFixed(1) + '%';
      return `<span class="${cls(v)}">${s}</span>`;
    };
    const pctPlain = (v)=>{
      if(v===null || !isFinite(v)) return '—';
      return (Math.round(v*10)/10).toFixed(1) + '%';
    };
    const moneySigned = (v)=>{
      const sign = v>=0?'+ ':'- ';
      const spanCls = (v>=0?'pos':'neg');
      return `<span class="${spanCls}">${sign}${fmtMoney(Math.abs(v))}</span>`;
    };

    const tfBadge = (v)=>{
      if(v===null || !isFinite(v)) return '—';
      let clsB = 'td-neutral';
      if(v >= 0) clsB = 'td-green';
      else if(v >= -20) clsB = 'td-neutral';
      else if(v >= -50) clsB = 'td-orange';
      else clsB = 'td-red';
      const sign = v>0?'+':'';
      return `<span class="td-badge ${clsB}">${sign}${Math.round(v)}%</span>`;
    };
    const tvBadge = (v)=>{
      if(v===null || !isFinite(v)) return '—';
      let clsB = 'td-neutral';
      if(v >= 0) clsB = 'td-green';
      else if(v >= -15) clsB = 'td-neutral';
      else if(v >= -50) clsB = 'td-orange';
      else clsB = 'td-red';
      const sign = v>0?'+':'';
      return `<span class="td-badge ${clsB}">${sign}${Math.round(v)}%</span>`;
    };

    applySort(rows, 'caN', {
      name: r=>r.name,
      seg: r=>r.seg,
      tf: r=>getNum(r.tfPct),
      tv: r=>getNum(r.tvPct),
      caN: r=>getNum(r.caN),
      caN1: r=>getNum(r.caN1),
      varVal: r=>getNum(r.varVal),
      varPct: r=>getNum(r.varPct),
      shareN1: r=>getNum(r.shareN1),
    });

    content.innerHTML = `<table style="width:100%; border-collapse:collapse;">
      <thead style="font-size:12px; color:var(--muted);">
        <tr>
          ${th('Client','name',false)}
          ${th('Segment','seg',false)}
          ${th('TF','tf',true)}
          ${th('TV','tv',true)}
          ${th('CA ' + yN,'caN',true)}
          ${th('CA ' + yN1,'caN1',true)}
          ${th('Variation €','varVal',true)}
          ${th('Variation %','varPct',true)}
          ${th('Part CA ' + yN1,'shareN1',true)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const chip = r.seg ? `<span class="chip ${chipClass(r.seg)}">${esc(r.seg)}</span>` : '—';
          return `<tr>
            <td style="padding:8px 6px; border-bottom:1px solid var(--stroke);">${clientLink(r.name, 'var(--text)')}</td>
            <td style="padding:8px 6px; border-bottom:1px solid var(--stroke);">${chip}</td>
            <td style="padding:8px 6px; text-align:right; border-bottom:1px solid var(--stroke); white-space:nowrap;">${tfBadge(r.tfPct)}</td>
            <td style="padding:8px 6px; text-align:right; border-bottom:1px solid var(--stroke); white-space:nowrap;">${tvBadge(r.tvPct)}</td>
            <td style="padding:8px 6px; text-align:right; border-bottom:1px solid var(--stroke); font-weight:800;">${fmtMoney(r.caN)}</td>
            <td style="padding:8px 6px; text-align:right; border-bottom:1px solid var(--stroke); font-weight:800;">${fmtMoney(r.caN1)}</td>
            <td style="padding:8px 6px; text-align:right; border-bottom:1px solid var(--stroke); white-space:nowrap; font-weight:800;">${moneySigned(r.varVal)}</td>
            <td style="padding:8px 6px; text-align:right; border-bottom:1px solid var(--stroke); white-space:nowrap;">${pct(r.varPct)}</td>
            <td style="padding:8px 6px; text-align:right; border-bottom:1px solid var(--stroke); white-space:nowrap;">${pctPlain(r.shareN1)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  } else if(mode === 'shift') {
    // list items: {name, from, to, whenISO}
    const rows = list.map(x => ({
      name: x.name,
      from: x.from || x.old || x.prev || '—',
      to: x.to || x.new || x.now || '—',
      whenISO: x.whenISO || x.when || x.transitionISO || x.dateISO || null
    }));

    applySort(rows, 'whenISO', {
      name: r=>r.name,
      from: r=>r.from,
      to: r=>r.to,
      whenISO: r=>getIso(r.whenISO),
    });

    content.innerHTML = `<table style="width:100%; border-collapse:collapse;">
      <thead style="font-size:12px; color:var(--muted);">
        <tr>
          ${th('Client','name',false)}
          ${th('Ancien segment','from',false)}
          ${th('Nouveau segment','to',false)}
          ${th('Période de transition','whenISO',true)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(c => `<tr>
          <td style="padding:8px 0; border-bottom:1px solid var(--stroke);">${clientLink(c.name)}</td>
          <td style="border-bottom:1px solid var(--stroke);">${esc(c.from)}</td>
          <td style="border-bottom:1px solid var(--stroke); font-weight:800;">${esc(c.to)}</td>
          <td style="text-align:right; border-bottom:1px solid var(--stroke); white-space:nowrap;">${fmtDateFR(c.whenISO)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  } else if(mode === 'delta') {
    // list items: {name, n, n1, d}
    const rows = list.map(x => ({
      name: x.name,
      n: isFinite(x.n) ? x.n : (isFinite(x.caN) ? x.caN : 0),
      n1: isFinite(x.n1) ? x.n1 : (isFinite(x.caN1) ? x.caN1 : 0),
      d: isFinite(x.d) ? x.d : ((isFinite(x.n) ? x.n : 0) - (isFinite(x.n1) ? x.n1 : 0)),
    }));

    rows.forEach(r=>{
      r.pct = (r.n1 > 0) ? (r.d / r.n1 * 100) : (r.n > 0 ? 100 : 0);
    });

    applySort(rows, 'd', {
      name: r=>r.name,
      n1: r=>getNum(r.n1),
      n: r=>getNum(r.n),
      d: r=>getNum(r.d),
      pct: r=>getNum(r.pct),
    });

    content.innerHTML = `<table style="width:100%; border-collapse:collapse;">
      <thead style="font-size:12px; color:var(--muted);">
        <tr>
          ${th('Client','name',false)}
          ${th('CA N-1','n1',true)}
          ${th('CA N','n',true)}
          ${th('Δ','d',true)}
          ${th('Δ%','pct',true)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(c => {
          const sign = c.d >= 0 ? '+ ' : '- ';
          return `<tr>
            <td style="padding:8px 0; border-bottom:1px solid var(--stroke);">${clientLink(c.name)}</td>
            <td style="text-align:right; border-bottom:1px solid var(--stroke);">${fmtMoney(c.n1)}</td>
            <td style="text-align:right; border-bottom:1px solid var(--stroke); font-weight:700;">${fmtMoney(c.n)}</td>
            <td style="text-align:right; border-bottom:1px solid var(--stroke); font-weight:900;"><span class="${cls(c.d)}">${sign}${fmtMoney(Math.abs(c.d))}</span></td>
            <td style="text-align:right; border-bottom:1px solid var(--stroke); font-weight:900;"><span class="${cls(c.pct)}">${(c.pct>=0?'+':'-')}${(Math.round(Math.abs(c.pct)*10)/10).toFixed(1)}%</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  } else if(mode === 'signed') {
    // list items: {name, val, first, last, recence}
    const rows = list.map(x => ({
      name: x.name,
      val: isFinite(x.val) ? x.val : 0,
      first: x.first || x.firstISO || x.firstNISO || x.firstN1ISO || null,
      last: x.last || x.lastISO || x.lastNISO || x.lastN1ISO || null,
      rec: (x.recence===0 || isFinite(x.recence)) ? x.recence : null,
      kind: (x.kind || null)
    }));

    applySort(rows, 'val', {
      name: r=>r.name,
      first: r=>getIso(r.first),
      last: r=>getIso(r.last),
      rec: r=>getNum(r.rec),
      val: r=>getNum(r.val),
    });

    content.innerHTML = `<table style="width:100%; border-collapse:collapse;">
      <thead style="font-size:12px; color:var(--muted);">
        <tr>
          ${th('Client','name',false)}
          ${th('Date première commande','first',true)}
          ${th('Date dernière commande','last',true)}
          ${th('Récence','rec',true)}
          ${th('Montant HT','val',true)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(c => {
          const sign = c.val >= 0 ? '+ ' : '− ';
          return `<tr>
            <td style="padding:8px 0; border-bottom:1px solid var(--stroke);">${clientLink(c.name, (c.kind==='new'?'var(--accent)':'var(--text)'))}</td>
            <td style="padding:8px 0; border-bottom:1px solid var(--stroke); white-space:nowrap; text-align:right;">${fmtDateFR(c.first)}</td>
            <td style="padding:8px 0; border-bottom:1px solid var(--stroke); white-space:nowrap; text-align:right;">${fmtDateFR(c.last)}</td>
            <td style="text-align:right; padding:8px 0; border-bottom:1px solid var(--stroke); white-space:nowrap;">${(c.rec===null? '—' : (c.rec + ' j'))}</td>
            <td style="text-align:right; padding:8px 0; border-bottom:1px solid var(--stroke); font-weight:900;">
              <span class="${cls(c.val)}">${sign}${fmtMoney(Math.abs(c.val))}</span>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  } else {
    const rows = list.map(x => ({name: x.name, val: isFinite(x.val) ? x.val : 0}));
    applySort(rows, 'val', { name:r=>r.name, val:r=>getNum(r.val) });

    content.innerHTML = `<table style="width:100%; border-collapse:collapse;">
      <thead style="font-size:12px; color:var(--muted);">
        <tr>
          ${th('Client','name',false)}
          ${th('Montant HT','val',true)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(c => `<tr>
          <td style="padding:8px 0; border-bottom:1px solid var(--stroke);">${clientLink(c.name)}</td>
          <td style="text-align:right; border-bottom:1px solid var(--stroke); font-weight:900;">${fmtMoney(c.val)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  bindClientLinks();
  m.style.display = 'flex';
}

// Tri : bascule asc/desc et re-render

// Ouverture du cockpit client depuis un drill ALFRED (ferme la modale puis ouvre la fiche)
window.__openClientFromALFRED = window.__openClientFromALFRED || function(clientName){
  try{
    const m = document.getElementById('modalALFREDDrill');
    if(m) m.style.display = 'none';

    // Certaines UI nécessitent d'afficher l'onglet/zone "Client" avant d'ouvrir la modale
    if(typeof showTab === 'function'){
      try{ showTab('client'); }catch(_e){}
      try{ showTab('clients'); }catch(_e){}
    }
    if(typeof activateTab === 'function'){
      try{ activateTab('client'); }catch(_e){}
      try{ activateTab('clients'); }catch(_e){}
    }

    setTimeout(() => {
      const fn = (typeof window.openClientDetail === 'function') ? window.openClientDetail
               : (typeof openClientDetail === 'function') ? openClientDetail
               : null;
      if(fn){
        fn(clientName);
      } else {
        try{ if(typeof toast==='function') toast("Ouverture client impossible : fonction introuvable", "bad"); }catch(_e){}
        console.warn("[ALFRED] openClientDetail introuvable");
      }
    }, 0);
  }catch(e){
    alert('Erreur ouverture client: ' + (e && e.message ? e.message : e));
  }
};

(function(){
  // Délégation globale : permet d'ouvrir le cockpit en cliquant sur un nom client
  // même hors modale ALFRED (ex: onglet Pilotage Commercial).
  if(window.__alfredClientLinkDelegated) return;
  window.__alfredClientLinkDelegated = 1;
  document.addEventListener("click", function(e){
    const a = e.target && e.target.closest ? e.target.closest('a.alfredClientLink[data-client]') : null;
    if(!a) return;
    e.preventDefault();
    e.stopPropagation();
    const nm = a.getAttribute("data-client") || "";
    if(!nm) return;
    const fn = (typeof window.__openClientFromALFRED === "function") ? window.__openClientFromALFRED
             : (typeof window.openClientDetail === "function") ? window.openClientDetail
             : (typeof openClientDetail === "function") ? openClientDetail
             : null;
    if(fn) { try{ fn(nm); }catch(err){ console.error(err); } }
  }, true);
})();

window.__alfredDrillResort = window.__alfredDrillResort || function(key){
  const last = window.__alfredDrillLast;
  if(!last) return;
  const stAll = window.__alfredDrillSortState || (window.__alfredDrillSortState = {});
  const st = stAll[last.title] || { key:null, dir:-1 };
  const nextDir = (st.key === key) ? (st.dir * -1) : -1; // default = desc
  stAll[last.title] = { key, dir: nextDir };
  openALFREDDrill(last.title, last.list, last.mode);
};


function isHealthySeg(seg) {
  if(!seg) return false;
  const s = (''+seg)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,'')
    .replace(/[^a-z0-9]/g,'');
  return s.startsWith('vip') || s.startsWith('regulier');
}

function isoMinusDays(isoDate, days) {
  if(!isoDate) return '';
  const d = new Date(String(isoDate).slice(0,10) + 'T00:00:00');
  if(!isFinite(d)) return '';
  d.setDate(d.getDate() - (days||0));
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}


function segRank(seg) {
  if(!seg) return 0;
  const s = (''+seg)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,'')
    .replace(/[^a-z0-9]/g,'');
  // Lower rank = worse, higher rank = better.
  if(s.includes('perduhistorique') || s.includes('perdushistorique')) return 0;
  if(s.includes('perdu')) return 0;
  if(s.includes('dormant')) return 1;
  if(s.includes('risque')) return 2;
  if(s.includes('occasionnel')) return 3;
  if(s.includes('nouveau')) return 4;
  if(s.includes('potentiel')) return 5;
  if(s.includes('regulier')) return 6;
  if(s.startsWith('vip') && s.includes('fragile')) return 7;
  if(s.startsWith('vip') && s.includes('solide')) return 8;
  if(s.startsWith('vip')) return 7; // fallback for VIP without qualifier
  return 0;
}




// === ALFRED DRILL HELPERS (V6.73) ===
function __openClientFromALFRED(clientName){
  // Ferme la modale ALFRED
  try{
    const m = document.getElementById('modalALFREDDrill');
    if(m) m.style.display = 'none';
  } catch(e){}

  // Sécurité : certains layouts nécessitent d'afficher l'onglet "Clients" avant d'ouvrir la fiche
  try{
    if(typeof showTab === 'function'){
      try{ showTab('clients'); }catch(_e){}
      try{ showTab('client'); }catch(_e){}
    }
    if(typeof activateTab === 'function'){
      try{ activateTab('clients'); }catch(_e){}
      try{ activateTab('client'); }catch(_e){}
    }
  } catch(e){}

  // Résolution robuste du nom (match exact puis case-insensitive)
  let resolved = clientName;
  try{
    if(state && Array.isArray(state.clients)){
      const exact = state.clients.find(x => x && x.name === clientName);
      if(exact) resolved = exact.name;
      else {
        const canon = String(clientName||'').trim().toLowerCase();
        const alt = state.clients.find(x => x && String(x.name||'').trim().toLowerCase() === canon);
        if(alt) resolved = alt.name;
      }
    }
  } catch(e){}

  // Ouvre le cockpit client
  const doOpen = ()=>{
    try{
      if(typeof openClientDetail === 'function'){
        openClientDetail(resolved);
      } else {
        alert("Fonction openClientDetail introuvable");
      }
    } catch(e){
      console.error(e);
      alert("Impossible d'ouvrir la fiche client.");
    }
  };

  // Laisse respirer le DOM (fermeture overlay) puis ouvre
  try{
    requestAnimationFrame(()=>setTimeout(doOpen, 0));
  } catch(e){
    setTimeout(doOpen, 0);
  }
}
// Source unique utilisée par les liens des drills ALFRED
window.__openClientFromALFRED = __openClientFromALFRED;

function __alfredDrillResort(key){
  const last = window.__alfredDrillLast;
  if(!last) return;
  const stAll = window.__alfredDrillSortState || (window.__alfredDrillSortState = {});
  const st = stAll[last.title] || (stAll[last.title] = { key: null, dir: -1 });
  if(st.key === key){
    st.dir = (st.dir > 0 ? -1 : 1);
  } else {
    st.key = key;
    st.dir = -1; // desc par défaut
  }
  try { openALFREDDrill(last.title, last.list, last.mode); } catch(e){ console.error(e); }
}

function buildALFREDCockpit(yN) {
  const container = document.getElementById("alfredCockpitContainer");
  if(!container) return;

  const yN1 = yN - 1;
  const monthEl = document.getElementById('monthSelect');
  const rollingEl = document.getElementById('rolling12');
  const mSel = monthEl ? (monthEl.value || '') : '';
  const rolling = rollingEl ? !!rollingEl.checked : false;

  const ranges = getALFREDRanges(yN);
  const rangeN  = ranges.rangeN;
  const rangeN1 = ranges.rangeN1;

  container.innerHTML = '<div class="muted small" style="padding:20px; text-align:center;">Calcul en cours...</div>';

  setTimeout(() => {
    try {
      // ---- 1) Agrégation CA / Tx sur N et N-1 (période comparable)
      const stats = new Map(); // name -> {caN,caN1,txN,txN1,firstISO}
      let totalCaN = 0;
      let totalCaN1 = 0;

      for(const t of (state.tx || [])){
        if(!t || !t.dateISO || !isFinite(t.amountHT)) continue;
        const c = (t.clientCanon || (t.rawClient||"").toString().trim() || "(Client non renseigné)");
        // On inclut aussi les lignes sans canon pour que la décomposition = Δ total
        // (sinon le KPI central lit le portefeuille complet, mais la décomposition ignore ces montants)

        if(!stats.has(c)) stats.set(c, {caN:0, caN1:0, txN:0, txN1:0, firstISO:null, firstNISO:null, lastNISO:null, firstN1ISO:null, lastN1ISO:null, lastBeforeISO:null});
        const o = stats.get(c);
        if(!o.firstISO || t.dateISO < o.firstISO) o.firstISO = t.dateISO;
        if(t.dateISO < rangeN.s){ if(!o.lastBeforeISO || t.dateISO > o.lastBeforeISO) o.lastBeforeISO = t.dateISO; }

        // N
        if(t.dateISO >= rangeN.s && t.dateISO <= rangeN.e){
          o.caN += t.amountHT;
          o.txN += 1;
          if(!o.firstNISO || t.dateISO < o.firstNISO) o.firstNISO = t.dateISO;
          if(!o.lastNISO || t.dateISO > o.lastNISO) o.lastNISO = t.dateISO;
          totalCaN += t.amountHT;
          continue;
        }
        // N-1 (période décalée)
        if(t.dateISO >= rangeN1.s && t.dateISO <= rangeN1.e){
          o.caN1 += t.amountHT;
          o.txN1 += 1;
          if(!o.firstN1ISO || t.dateISO < o.firstN1ISO) o.firstN1ISO = t.dateISO;
          if(!o.lastN1ISO  || t.dateISO > o.lastN1ISO)  o.lastN1ISO  = t.dateISO;
          totalCaN1 += t.amountHT;
        }
      }

      // ---- 1) Bilan Croissance (Le P&L Client)
      // Classement: nouveaux / reactivés (absence>=360j) / organique (absence<360j) / perdus
      const listAcq=[], listOrg=[], listPerdus=[];
      let caAcq=0, caPerdus=0;
      let orgN = 0, orgN1 = 0;

      const startNDate = new Date(rangeN.s+'T00:00:00Z');

      for(const [name,o] of stats){
        const n  = (o.caN  || 0);
        const n1 = (o.caN1 || 0);

        const hasN  = (o.txN  || 0) > 0;
        const hasN1 = (o.txN1 || 0) > 0;

        // Ignore uniquement les clients totalement absents des deux périodes
        if(!hasN && !hasN1) continue;

        // Perdus : présent en N-1 mais absent en N
        if(!hasN && hasN1){
          caPerdus += n1;
          listPerdus.push({
            name, val:n1,
            firstN1ISO:o.firstN1ISO, lastN1ISO:o.lastN1ISO,
            recence: (o.lastN1ISO ? __daysBetween(new Date(o.lastN1ISO+'T00:00:00Z'), new Date(rangeN.e+'T00:00:00Z')) : null)
          });
          continue;
        }

        // Clients ayant acheté en N : classification Nouveaux / Réactivés / Organique
        if(hasN){
          const hasHistoryBeforeN = !!o.lastBeforeISO && (o.lastBeforeISO < rangeN.s);
          let absenceDays = null;
          if(hasHistoryBeforeN){
            absenceDays = __daysBetween(new Date(o.lastBeforeISO+'T00:00:00Z'), startNDate);
          }

          // Nouveaux : aucune transaction avant le début de N
          if(!hasHistoryBeforeN){
            caAcq += n;
            listAcq.push({
              name, val:n,
              firstNISO:o.firstNISO, lastNISO:o.lastNISO,
              recence: (o.lastNISO ? __daysBetween(new Date(o.lastNISO+'T00:00:00Z'), new Date(rangeN.e+'T00:00:00Z')) : null),
              absence: absenceDays,
              kind: 'new'
            });
            continue;
          }

          // Réactivés : absence >= 360 jours avant le début de N
          if((absenceDays===0 || isFinite(absenceDays)) && absenceDays >= 360){
            caAcq += n;
            listAcq.push({
              name, val:n,
              firstNISO:o.firstNISO, lastNISO:o.lastNISO,
              recence: (o.lastNISO ? __daysBetween(new Date(o.lastNISO+'T00:00:00Z'), new Date(rangeN.e+'T00:00:00Z')) : null),
              absence: absenceDays,
              kind: 'reactivated'
            });
            continue;
          }

          // Base organique : historique + absence < 360 jours
          orgN  += n;
          orgN1 += n1;
          listOrg.push({name, n, n1, d:(n-n1), absence: absenceDays});
          continue;
        }
      }

      const caOrg = orgN - orgN1;
      const baseOrgN1 = orgN1;

      const solde = caAcq - caPerdus;
      const orgPct = (baseOrgN1>0) ? (caOrg/baseOrgN1*100) : 0;
      const acqPct = (totalCaN>0) ? (caAcq/totalCaN*100) : 0;
      const perdusPct = (totalCaN1>0) ? (caPerdus/totalCaN1*100) : 0;
      const soldePct = (totalCaN1>0) ? (solde/totalCaN1*100) : 0;

      const signedMoney = (v)=> (v>=0?"+ ":"- ") + fmtMoney(Math.abs(v));
      const signedPct = (v)=> (v>=0?"+":"-") + (Math.round(Math.abs(v)*10)/10).toFixed(1) + "%";

      // Drill store (évite JSON.stringify dans onclick)
      const listSolde = [
        ...listAcq.map(x => ({
          name: x.name,
          val: +(x.val||0),
          first: x.firstNISO || null,
          last: x.lastNISO || null,
          recence: (x.recence===0 || isFinite(x.recence)) ? x.recence : null,
          kind: (x.kind || null)
        })),
        ...listPerdus.map(x => ({
          name: x.name,
          val: -(x.val||0),
          first: x.firstN1ISO || x.first || null,
          last: x.lastN1ISO || x.last || null,
          recence: (x.recence===0 || isFinite(x.recence)) ? x.recence : null
        })),
      ];
      window.__alfredDrillStore = {
        acq: listAcq,
        org: listOrg,
        perdus: listPerdus,
        solde: listSolde,
      };

      // ---- 2) Sécurité (Pareto)
      // Top 80% du CA sur la période N, puis "en danger" = TF négative (TF = tendance de fréquence)
      const arrByCa = [];
      for(const [name,o] of stats){
        if(o.caN>0) arrByCa.push({name, ca:o.caN, txN:o.txN||0, txN1:o.txN1||0});
      }
      arrByCa.sort((a,b)=>b.ca-a.ca);

      const target = totalCaN * 0.80;
      let acc = 0;
      const top80 = [];
      for(const c of arrByCa){
        if(acc >= target && top80.length>0) break;
        top80.push(c);
        acc += c.ca;
      }

      // Mémo années / totals pour les en-têtes et parts (N-1 comparable à la période N)
      window.__alfredLastYears = { yN, yN1, totalCaN, totalCaN1 };

      // Helpers meta client (segment + TF/TV du moteur global)
      const __findClientMeta = (nm)=>{
        const key = String(nm||"").trim().toLowerCase();
        return (state.clients||[]).find(x=>x && x.name && (
          x.name === nm || x.name.trim() === nm ||
          x.name.toLowerCase() === key || x.name.trim().toLowerCase() === key
        )) || null;
      };

      let dangerCount = 0;
      const listParetoDanger = [];
      for(const c of top80){
        const o = stats.get(c.name);
        const caN  = c.ca || 0;
        const caN1 = (o && isFinite(o.caN1)) ? o.caN1 : 0;

        const meta = __findClientMeta(c.name);
        const seg = meta ? (meta.segment || "") : "";
        // TF / TV : on privilégie les métriques du moteur global si dispo, sinon fallback comparatif période (tx/ca)
        const tfPct = (meta && isFinite(meta.tf)) ? (meta.tf * 100) :
          ((c.txN1>0) ? ((c.txN - c.txN1)/c.txN1)*100 : (c.txN>0?100:0));

        const tvPct = (meta && (typeof _tdValuePercent === 'function')) ? _tdValuePercent(meta) :
          (caN1>0 ? ((caN - caN1)/caN1)*100 : null);

        const varVal = caN - caN1;
        const varPct = (caN1>0) ? (varVal/caN1*100) : null;
        const shareN1 = (totalCaN1>0) ? (caN1/totalCaN1*100) : 0;

        if(tfPct < 0){
          dangerCount++;
          listParetoDanger.push({
            name: c.name,
            seg,
            tfPct,
            tvPct,
            caN,
            caN1,
            varVal,
            varPct,
            shareN1
          });
        }
      }

      // Expose Pareto drill list (inline onclick handlers need global access)
      if(!window.__alfredDrillStore) window.__alfredDrillStore = {};
      window.__alfredDrillStore.pareto = listParetoDanger;

      // ---- 3) Vitalité : panier moyen sur clients (>=3 commandes) - tous segments
      const asOfNowISO = rangeN.e;
      let caVitaN=0, txVitaN=0, caVitaN1=0, txVitaN1=0;
      let clientsVitaN=0, clientsVitaBoth=0;

      for(const [name,o] of stats){
        const txN = o.txN||0, txN1 = o.txN1||0;
        const caN = o.caN||0, caN1 = o.caN1||0;
        if(txN >= 3 && caN > 0){
          clientsVitaN++;
          caVitaN += caN;
          txVitaN += txN;

          // Pour la variation, on compare uniquement si le client est aussi "stable" en N-1
          if(txN1 >= 3 && caN1 > 0){
            clientsVitaBoth++;
            caVitaN1 += caN1;
            txVitaN1 += txN1;
          }
        }
      }

      const panierN  = (txVitaN>0)  ? (caVitaN/txVitaN)   : 0;
      const panierN1 = (txVitaN1>0) ? (caVitaN1/txVitaN1) : 0;
      const hasVitaN1 = (txVitaN1>0);
      const varPanierAbs = hasVitaN1 ? (panierN - panierN1) : null;
      const varPanierPct = (hasVitaN1 && panierN1>0) ? (varPanierAbs / panierN1) * 100 : null;

      // ---- 4) MOMENTUM (SHIFT 90 JOURS)
      const asOfPrevISO = isoMinusDays(asOfNowISO, 90);
      let upgrades=0, downgrades=0;
      const listUp=[], listDown=[];

      for(const [name,o] of stats){
        if((o.caN||0)<=0 && (o.caN1||0)<=0) continue;
        let segNow=null, segPrev=null;
        try { segNow = (__computeClientSegmentAt__legacy ? __computeClientSegmentAt__legacy(name, asOfNowISO).segment : null); } catch(e){ segNow=null; }
        try { segPrev = (__computeClientSegmentAt__legacy ? __computeClientSegmentAt__legacy(name, asOfPrevISO).segment : null); } catch(e){ segPrev=null; }
        if(!segNow || !segPrev) continue;

        const rNow = segRank(segNow);
        const rPrev = segRank(segPrev);
        if(rPrev < rNow){ upgrades++; const whenISO = __findSegTransitionISO(name, asOfPrevISO, asOfNowISO, segPrev, segNow);
        listUp.push({name, val: rNow - rPrev, from: segPrev, to: segNow, whenISO}); }
        else if(rPrev > rNow){ downgrades++; const whenISO = __findSegTransitionISO(name, asOfPrevISO, asOfNowISO, segPrev, segNow);
        listDown.push({name, val: rPrev - rNow, from: segPrev, to: segNow, whenISO}); }
      }

      // Inject drill data for Momentum
      if(window.__alfredDrillStore){
        window.__alfredDrillStore.up = listUp;
        window.__alfredDrillStore.down = listDown;
      }


      // ---- Render
      container.innerHTML = `
        <div style="display:grid; gap:14px;">
          <div class="card" style="padding:16px; border:1px solid var(--stroke);">
            <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:10px; margin-bottom:12px;">
              <div style="font-weight:900;">BILAN DE CROISSANCE</div>
              <div class="muted small">${rangeN.s} → ${rangeN.e}</div>
            </div>

            <div style="display:flex; flex-direction:column; gap:10px;">
              <div class="card clickable-card" onclick="openALFREDDrill('Détails Acquisition (Nouveaux du mois + Réactivés)', window.__alfredDrillStore.acq, 'new')" style="padding:14px; margin:0; border:1px solid var(--stroke);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                  <span style="font-size:12px; font-weight:900; color:var(--accent);">ACQUISITION (NOUVEAUX DU MOIS + RÉACTIVÉS)</span>
                  <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
                    <div style="font-size:18px; font-weight:900;"><span class="pos">+ ${fmtMoney(caAcq)}</span></div>
                    <div class="muted small"><span class="pos">${(Math.round(acqPct*10)/10).toFixed(1)}%</span> <span class="muted">du CA ${yN}</span></div>
                  </div>
                </div>
              </div>

              <div class="card clickable-card" onclick="openALFREDDrill('Détails Périmètre Constant (Organique)', window.__alfredDrillStore.org, 'delta')" style="padding:14px; margin:0; border:1px solid var(--stroke);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                  <div>
                    <div style="font-size:12px; font-weight:900; color:var(--text);">PÉRIMÈTRE CONSTANT ORGANIQUE</div>
                    <div class="muted small">Base ${yN1} : ${fmtMoney(baseOrgN1)}</div>
                  </div>
                  <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
                    <div style="font-size:18px; font-weight:900;"><span class="${caOrg>=0?'pos':'neg'}">${signedMoney(caOrg)}</span></div>
                    <div class="muted small"><span class="${caOrg>=0?'pos':'neg'}">${signedPct(orgPct)}</span> <span class="muted">vs ${yN1}</span></div>
                  </div>
                </div>
              </div>
              </div>

              <div class="card clickable-card" onclick="openALFREDDrill('Détails Clients Perdus (période analysée)', window.__alfredDrillStore.perdus, 'lost')" style="padding:14px; margin:0; border:1px solid var(--stroke);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                  <span style="font-size:12px; font-weight:900; color:var(--text);">CLIENTS PERDUS DE LA PÉRIODE ANALYSÉE</span>
                  <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
                    <div style="font-size:18px; font-weight:900;"><span class="neg">${signedMoney(-caPerdus)}</span></div>
                    <div class="muted small"><span class="neg">${signedPct(-perdusPct)}</span> <span class="muted">du CA ${yN1}</span></div>
                  </div>
                </div>
              </div>

              <div class="card clickable-card" onclick="openALFREDDrill('Détails Solde (Nouveaux - Perdus)', window.__alfredDrillStore.solde, 'signed')" style="padding:14px; margin:0; border:1px solid var(--stroke);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                  <span style="font-size:12px; font-weight:900; color:var(--text);">SOLDE (NOUVEAUX - PERDUS)</span>
                  <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
                    <div style="font-size:18px; font-weight:900;"><span class="${solde>=0?'pos':'neg'}">${signedMoney(solde)}</span></div>
                    <div class="muted small"><span class="${solde>=0?'pos':'neg'}">${signedPct(soldePct)}</span> <span class="muted">vs ${yN1}</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="muted small" style="margin-top:10px;">Clique une tuile pour voir la liste des clients.</div>
          </div>

          <div class="card clickable-card" onclick="openALFREDDrill('Top 80% en danger (TF négative)', (window.__alfredDrillStore && window.__alfredDrillStore.pareto) ? window.__alfredDrillStore.pareto : [], 'pareto')" style="padding:16px; border:1px solid var(--stroke);">
            <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:10px;">
              <div>
                <div style="font-weight:900;">SÉCURITÉ (LOI DE PARETO)</div>
                <div class="muted small">Top 80% du CA : ${top80.length} clients</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:28px; font-weight:900; color:${dangerCount>0?'var(--warn)':'var(--good)'};">${dangerCount}</div>
                <div class="muted small">en TF négative</div>
              </div>
            </div>
            <div class="muted small" style="margin-top:8px;">Clique pour la liste (triée par CA).</div>
          </div>

          <div class="card" style="padding:16px; border:1px solid var(--stroke);">
            <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:10px;">
              <div>
                <div style="font-weight:900;">VITALITÉ (PANIER MOYEN)</div>
                <div class="muted small">Tous segments • clients ≥ 3 commandes (période N)</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:26px; font-weight:900;">${fmtMoney(panierN)}</div>
                <div class="muted small">
                  ${(!hasVitaN1) ? '—' : ('<span class="'+(varPanierAbs>=0?'pos':'neg')+'">'+(varPanierAbs>=0?'+ ':'- ')+fmtMoney(Math.abs(varPanierAbs))+'</span>')}
                  <span class="muted"> • </span>
                  ${(!hasVitaN1) ? '—' : ('<span class="'+(varPanierPct>=0?'pos':'neg')+'">'+(varPanierPct>=0?'+':'-')+(Math.round(Math.abs(varPanierPct)*10)/10).toFixed(1)+'%</span>')}
                </div>
              </div>
            </div>
            <div class="muted small" style="margin-top:10px;">
              Base : ${clientsVitaN} clients (N≥3) • Variation sur ${clientsVitaBoth} clients (N & N-1 ≥3)
            </div>
          </div>

          <div class="card" style="padding:16px; border:1px solid var(--stroke);">
            <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:10px;">
              <div style="font-weight:900;">MOMENTUM (SHIFT 90 JOURS)</div>
              <div class="muted small">${asOfPrevISO} → ${asOfNowISO}</div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
              <div class="card clickable-card" onclick="openALFREDDrill('Détails Promotions (90 jours)', window.__alfredDrillStore.up, 'shift')" style="padding:12px; margin:0; border:1px solid var(--stroke);">
                <div style="display:flex; justify-content:space-between;">
                  <div class="muted small">PROMOTIONS 🟢</div>
                  <div style="font-weight:900; color:var(--good);">${upgrades}</div>
                </div>
              </div>
              <div class="card clickable-card" onclick="openALFREDDrill('Détails Dégradations (90 jours)', window.__alfredDrillStore.down, 'shift')" style="padding:12px; margin:0; border:1px solid var(--stroke);">
                <div style="display:flex; justify-content:space-between;">
                  <div class="muted small">DÉGRADATIONS 🔴</div>
                  <div style="font-weight:900; color:var(--bad);">${downgrades}</div>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      `;
    } catch(e) {
      container.innerHTML = '<div class="bad">Erreur: '+(e && e.message ? e.message : e)+'</div>';
    }
  }, 50);
}



