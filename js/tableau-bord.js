
(function(){
  "use strict";

  const $ = (sel, root=document)=>root.querySelector(sel);
  const esc = (s)=> String(s==null?"":s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));

  function diagColor(text) {
    if (!text || text === "—") return "var(--muted)";
    const t = String(text).toLowerCase();
    if (t.includes("chute brutale") || t.includes("critique") ||
        t.includes("absent depuis") || t.includes("décrochage confirmé") ||
        t.includes("risque élevé")) return "var(--bad)";
    if (t.includes("décrochage en cours") || t.includes("retard d'achat") ||
        t.includes("baisse du rythme") || t.includes("baisse du panier") ||
        t.includes("risque") || t.includes("érosion") ||
        t.includes("forte chute") || t.includes("absent depuis")) return "#ff8c42";
    if (t.includes("retard") || t.includes("vigilance") ||
        t.includes("reprise de contact") || t.includes("fragile")) return "var(--warn)";
    if (t.includes("fenêtre d'achat") || t.includes("potentiel de développement") ||
        t.includes("gisement") || t.includes("2ème commande") ||
        t.includes("consolidation")) return "var(--accent)";
    if (t.includes("dynamique d'achat positive") || t.includes("croissance") ||
        t.includes("accélération") || t.includes("actif et régulier")) return "var(--good)";
    return "var(--muted)";
  }

  const fmtInt = (n)=> {
    const v = Number(n||0);
    return Number.isFinite(v) ? Math.round(v).toLocaleString('fr-FR') : "—";
  };
  const fmtEUR = (n)=> {
    const v = Number(n||0);
    if(!Number.isFinite(v)) return "—";
    try{ return (window.fmtEUR ? window.fmtEUR(v) : v.toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0})); }
    catch(e){ return String(Math.round(v))+" €"; }
  };
  const fmtPct = (n, dec=1)=> {
    const v = Number(n);
    if(!Number.isFinite(v)) return "—";
    return v.toFixed(dec).replace(".", ",")+"%";
  };

  function visibleClients(){
    try{
      if(typeof window.getDashClientsVisible === "function") return window.getDashClientsVisible() || [];
      return Array.isArray(window.state?.clients) ? window.state.clients : [];
    }catch(e){ return []; }
  }

  function _normKey(s){
    return String(s||"")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g," ")
      .trim();
  }

  function allTx(){
    try{
      if(Array.isArray(window.state?.txAll) && window.state.txAll.length) return window.state.txAll;
      if(Array.isArray(window.state?.tx) && window.state.tx.length) return window.state.tx;
      if(window.DataStore && typeof window.DataStore.getTx === "function"){
        const dsTx = window.DataStore.getTx() || [];
        if(Array.isArray(dsTx) && dsTx.length) return dsTx;
      }
    }catch(e){}
    return [];
  }

  function visibleTxByClients(clients){
    const keys = new Set();
    for(const c of (clients||[])){
      if(!c) continue;
      [c.clientCanon, c.clientNorm, c.name, c.id, c.client].forEach(v=>{
        const k = _normKey(v);
        if(k) keys.add(k);
      });
    }
    const tx = allTx();
    const matched = tx.filter(t => {
      const candidates = [t.clientCanon, t.clientNorm, t.rawClient, t.client, t.name];
      return candidates.some(v => {
        const k = _normKey(v);
        return k && keys.has(k);
      });
    });
    return matched;
  }

  function visibleClientTxOrAll(clients){
    const tx = visibleTxByClients(clients);
    return tx.length ? tx : allTx();
  }

  function getAsOfISO(){
    return _datasetLastISO();
  }


  function _datasetLastISO(){
    try{
      const txSrc = (window.state && Array.isArray(window.state.txAll) && window.state.txAll.length)
        ? window.state.txAll
        : (window.state && Array.isArray(window.state.tx) && window.state.tx.length)
          ? window.state.tx
          : (window.DataStore && typeof window.DataStore.getTx === "function")
            ? (window.DataStore.getTx() || [])
            : [];
      let max = "";
      for(const t of (txSrc||[])){
        const iso = String((t && t.dateISO) || "").slice(0,10);
        if(/^\d{4}-\d{2}-\d{2}$/.test(iso) && (!max || iso > max)) max = iso;
      }
      if(max) return max;
    }catch(e){}
    return (window.state?.quality?.maxDate) || "";
  }

  // CA d'un client pour une période via window.sumCachePeriod (exposé par core.js)
  // code : "M" (mois en cours), "M_1" (M-1), "M_2" (M-2), "M_3" (M-3)
  function _clientPeriodCA(clientName, code) {
    try {
      if (typeof window.sumCachePeriod === "function") {
        const r = window.sumCachePeriod(String(clientName).trim(), code);
        if (r && Number.isFinite(r.sum)) return r.sum;
      }
    } catch(e) {}
    return 0;
  }

  // Retourne { caM, caM1, caM2 } pour un client via sumCachePeriod
  function _clientRecentCA(clientName) {
    return {
      caM:  _clientPeriodCA(clientName, "M"),
      caM1: _clientPeriodCA(clientName, "M_1"),
      caM2: _clientPeriodCA(clientName, "M_2"),
    };
  }

  // CA portefeuille par mois via portfolioMonthly ou sumCachePeriod
  function _portfolioMonthCA(mk) {
    try {
      const pm = window.state?.cache?.portfolioMonthly;
      if (pm && typeof pm.get === "function") {
        const cell = pm.get(mk);
        if (cell && Number.isFinite(cell.sumHT)) return { sumHT: cell.sumHT, cnt: cell.cnt || 0 };
      }
    } catch(e) {}
    return null;
  }

  function ytdStats(clients){
    const asOfISO = getAsOfISO();
    const year = String(asOfISO).slice(0,4);
    const month = String(asOfISO).slice(5,7);
    const start = `${year}-01-01`;
    let sum = 0;

    const tx = visibleClientTxOrAll(clients);
    for(const t of tx){
      if(t && t.dateISO && t.dateISO >= start && t.dateISO <= asOfISO){
        sum += Number(t.amountHT || 0);
      }
    }

    if(!sum){
      try{
        const periodTx = Array.isArray(window.state?.periodTx) ? window.state.periodTx : [];
        for(const t of periodTx){
          if(t && t.dateISO && String(t.dateISO).slice(0,4) === year){
            sum += Number(t.amountHT || 0);
          }
        }
      }catch(e){}
    }

    if(!sum){
      try{
        const pm = window.state?.cache?.portfolioMonthly;
        if(pm && typeof pm.forEach === "function"){
          pm.forEach((cell, mk)=>{
            if(String(mk).slice(0,4) === year && String(mk).slice(5,7) <= month){
              sum += Number(cell && cell.sumHT || 0);
            }
          });
        }
      }catch(e){}
    }

    return { year, ca: sum };
  }

  function monthOrderStats(clients){
    const tx = visibleClientTxOrAll(clients);
    const asOfISO = getAsOfISO();
    const d = new Date(asOfISO + "T00:00:00Z");
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const curS = new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
    const curE = new Date(Date.UTC(y,m+1,0)).toISOString().slice(0,10);
    const prevS = new Date(Date.UTC(y,m-1,1)).toISOString().slice(0,10);
    const prevE = new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
    let cur = 0, prev = 0;
    for(const t of tx){
      if(!t || !t.dateISO) continue;
      if(t.dateISO >= curS && t.dateISO <= curE) cur++;
      else if(t.dateISO >= prevS && t.dateISO <= prevE) prev++;
    }

    if(!(cur || prev)){
      try{
        const pm = window.state?.cache?.portfolioMonthly;
        const curMk = `${y}-${String(m+1).padStart(2,"0")}`;
        const prevDate = new Date(Date.UTC(y,m-1,1));
        const prevMk = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth()+1).padStart(2,"0")}`;
        if(pm && typeof pm.get === "function"){
          cur = Number(pm.get(curMk)?.cnt || 0);
          prev = Number(pm.get(prevMk)?.cnt || 0);
        }
      }catch(e){}
    }

    return { cur, prev };
  }

  function top5Dependance(clients){
    const base = (clients||[]).filter(c => c && c.segment !== "Perdus Historiques");
    const totalHT = base.reduce((s,c)=> s + (Number(c.monetaryHT)||0), 0);
    const top5 = base.slice().sort((a,b)=>(Number(b.monetaryHT)||0)-(Number(a.monetaryHT)||0)).slice(0,5);
    const top5sum = top5.reduce((s,c)=> s + (Number(c.monetaryHT)||0), 0);
    return { pct: totalHT ? (top5sum / totalHT * 100) : 0, rows: top5 };
  }

  function avgBasket(clients){
    const tx = visibleTxByClients(clients);
    const sumTx = tx.reduce((s,t)=>s + (Number(t.amountHT)||0), 0);
    if(tx.length && sumTx > 0) return (sumTx / tx.length);
    try{
      const base = (clients||[]).filter(c => c && c.segment !== "Perdus Historiques");
      const totalHT = base.reduce((s,c)=>s + (Number(c.monetaryHT)||0),0);
      const totalOrders = base.reduce((s,c)=>s + (Number(c.frequency)||0),0);
      return totalOrders ? (totalHT / totalOrders) : 0;
    }catch(e){ return 0; }
  }

  function activeCount(clients){
    const list = (clients||[]).filter(c => c && c.segment !== "Perdus Historiques");
    const active = list.filter(c => Number(c.scoreR||0) >= 3);
    return { active: active.length, total: list.length };
  }

  function getDirection(clients){
    try{
      if(typeof window.computeDirectionKpis === "function") return window.computeDirectionKpis(clients || []);
      if(window.state?.ui?.dirCache) return window.state.ui.dirCache;
    }catch(e){}
    return null;
  }

  function uniqClientItems(items, metricKey){
    const map = new Map();
    for(const it of (items||[])){
      const c = it && it.client ? it.client : it;
      const nm = c && c.name ? String(c.name).trim() : "";
      if(!nm) continue;
      const prev = map.get(nm);
      if(!prev) map.set(nm, it);
      else{
        const a = Number(prev[metricKey]||0), b = Number(it[metricKey]||0);
        if(b > a) map.set(nm, it);
      }
    }
    return Array.from(map.values());
  }

  function topClientPreview(items, metricKey, n=3){
    const uniq = uniqClientItems(items, metricKey).sort((a,b)=> (Number(b[metricKey]||0) - Number(a[metricKey]||0)));
    return uniq.slice(0, n).map(it => it.client || it).filter(Boolean);
  }

  function opportunityStats(clients){
    const rows = (clients||[]).filter(c => c && c.segment !== "Perdus" && c.segment !== "Perdus Historiques");
    const nouveaux = rows
      .filter(c => /nouv|réactiv|reactiv/i.test(String(c.segment||"")))
      .sort((a,b)=>(Number(b.monetaryHT)||0)-(Number(a.monetaryHT)||0));

    // Dynamiques — source unique : Pilotage Commercial (window.__pilotageCoVic)
    // Fallback local si Pilotage Co n'a pas encore tourné
    const dynamiques = (() => {
      const vic = Array.isArray(window.__pilotageCoVic) ? window.__pilotageCoVic : [];
      if (vic.length) {
        return vic.map(r => ({
          client: r.c || r,
          score: typeof r.__dynScore === "number" ? r.__dynScore : 1
        }));
      }
      // Fallback : calcul local identique à dashboard.js
      return rows
        .map(c => {
          const rec = (typeof c.recencyDays === "number" && isFinite(c.recencyDays)) ? c.recencyDays : null;
          if (rec === null || rec > 30) return null;
          const name = String(c.name || "").trim();
          const { caM, caM1, caM2 } = _clientRecentCA(name);
          const avg3 = (caM + caM1 + caM2) / 3;
          const monetaryHT   = (typeof c.monetaryHT   === "number" && isFinite(c.monetaryHT))   ? c.monetaryHT   : 0;
          const tenureMonths = (typeof c.tenureMonths  === "number" && isFinite(c.tenureMonths))  ? c.tenureMonths : 1;
          const avgHisto = monetaryHT / Math.min(Math.max(1, tenureMonths), 24);
          const tf = (typeof c.tf === "number" && isFinite(c.tf)) ? c.tf : null;
          const cheminA = avg3 > avgHisto * 0.85;
          const cheminB = (tf !== null && tf >= 0.10 && caM > 0);
          if (!cheminA && !cheminB) return null;
          const score = (avg3 / Math.max(avgHisto, 1)) * (1 - rec / 30);
          return { client: c, score };
        })
        .filter(x => x !== null)
        .sort((a, b) => b.score - a.score);
    })();

    const gisement = rows
      .map(c => {
        const max = Number(c.maxCA12m||0);
        const cur = Number(c.ca12mCur||0);
        const gap = Math.max(0, max - cur);
        return { client:c, gap };
      })
      .filter(x => x.gap > 0)
      .sort((a,b)=>b.gap-a.gap);

    return {
      nouveauxN: nouveaux.length,
      nouveauxCA: nouveaux.reduce((s,c)=>s + (Number(c.monetaryHT)||0), 0),
      nouveauxTop: nouveaux.slice(0,3),
      nouveauxRows: nouveaux,

      dynamiquesN: dynamiques.length,
      dynamiquesScore: dynamiques.length ? (dynamiques.reduce((s,x)=>s+x.score,0) / dynamiques.length) : 0,
      dynamiquesTop: dynamiques.slice(0,3).map(x=>x.client),
      dynamiquesRows: dynamiques.map(x=>x.client),

      gisementN: gisement.length,
      gisementCA: gisement.reduce((s,x)=>s + x.gap, 0),
      gisementTop: gisement.slice(0,3).map(x=>x.client),
      gisementRows: gisement.map(x=>x.client),
    };
  }

  function tfStats(clients){
    const rows = (clients||[]).filter(c => c && c.segment !== "Perdus" && c.segment !== "Perdus Historiques");
    const up = rows.filter(c => Number(c.tdPct) > 5);
    const flat = rows.filter(c => Number(c.tdPct) >= -5 && Number(c.tdPct) <= 5);
    const down = rows.filter(c => Number(c.tdPct) < -5);
    const total = Math.max(1, rows.length);
    const mk = (id, label, arr) => ({
      id, label,
      pct: arr.length / total * 100,
      rows: arr
    });
    return [
      mk('tb:tf:up', 'En hausse', up),
      mk('tb:tf:flat', 'Stagne', flat),
      mk('tb:tf:down', 'Régresse', down),
    ];
  }

  function secondaryKpis(clients){
    const kpiClients = (clients||[]).filter(c => c && c.segment !== "Perdus" && c.segment !== "Perdus Historiques");
    let avgFreq = NaN, act90 = NaN, cover = NaN;
    try{
      if(kpiClients.length){
        avgFreq = kpiClients.reduce((s,c)=>s+(Number(c.frequency)||0),0)/kpiClients.length;
        act90 = kpiClients.filter(c=>Number.isFinite(Number(c.recencyDays)) && Number(c.recencyDays)<=90).length / kpiClients.length * 100;
        const withMax = kpiClients.filter(c => Number(c.maxCA12m||0) > 0);
        cover = withMax.length ? (withMax.reduce((s,c)=>s + (Number(c.pctOfMax)||0),0) / withMax.length) : NaN;
      }
    }catch(e){}
    return [
      { label:"Fréquence moyenne", value:Number.isFinite(avgFreq) ? avgFreq.toFixed(2).replace(".", ",") : "—" },
      { label:"Activation (≤90j)", value:Number.isFinite(act90) ? fmtPct(act90) : "—" },
      { label:"Couverture du potentiel historique", value:Number.isFinite(cover) ? fmtPct(cover) : "—" },
    ];
  }


  function _monthAdd(ym, delta){
    const y = Number(String(ym||"").slice(0,4));
    const m = Number(String(ym||"").slice(5,7));
    if(!Number.isFinite(y) || !Number.isFinite(m)) return "";
    const d = new Date(Date.UTC(y, m-1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
  }

  function _monthLabelShort(ym){
    const y = Number(String(ym||"").slice(0,4));
    const m = Number(String(ym||"").slice(5,7));
    if(!Number.isFinite(y) || !Number.isFinite(m)) return ym || "";
    const names = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];
    return `${names[m-1] || String(m)}`;
  }

  function last6MonthsStats(clients){
    const txVisible = visibleTxByClients(clients);
    const tx = (txVisible && txVisible.length) ? txVisible : allTx();
    const asOfISO = getAsOfISO();
    const refYM = String(asOfISO).slice(0,7);
    const months = [];
    for(let i=5;i>=0;i--) months.push(_monthAdd(refYM, -i));

    const rows = (clients||[]).filter(Boolean);
    const newClientKeys = new Set(
      rows
        .filter(c => /nouv|réactiv|reactiv/i.test(String(c.segment||"")))
        .map(c => _normKey(c.clientCanon || c.clientNorm || c.name || c.id || c.client))
        .filter(Boolean)
    );

    const curMap = new Map(months.map(mk => [mk, { total:0, newPart:0 }]));
    const prevMap = new Map(months.map(mk => [_monthAdd(mk, -12), 0]));

    for(const t of (tx||[])){
      if(!t || !t.dateISO) continue;
      const mk = String(t.dateISO).slice(0,7);
      const amt = Number(t.amountHT || 0);
      if(!Number.isFinite(amt)) continue;

      if(curMap.has(mk)){
        const cell = curMap.get(mk);
        cell.total += amt;
        const tk = _normKey(t.clientCanon || t.clientNorm || t.rawClient || t.client || t.name);
        if(tk && newClientKeys.has(tk)) cell.newPart += amt;
      }
      if(prevMap.has(mk)) prevMap.set(mk, prevMap.get(mk) + amt);
    }

    const series = months.map(mk => ({
      ym: mk,
      label: _monthLabelShort(mk),
      total: Number(curMap.get(mk)?.total || 0),
      newPart: Number(curMap.get(mk)?.newPart || 0),
      prevYear: Number(prevMap.get(_monthAdd(mk, -12)) || 0)
    }));

    return { months: series, total: series.reduce((s,x)=>s+x.total,0), totalNew: series.reduce((s,x)=>s+x.newPart,0) };
  }

  function monthlyCaChart(clients){
    const txPool = allTx();
    if(!txPool.length){
      return `
      <div class="card" style="grid-column: span 12; padding:16px 14px; overflow:hidden;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
          <h3 style="margin:0;">CA mensuel — 6 derniers mois</h3>
          <span class="small muted">Cumul mensuel du périmètre affiché</span>
        </div>
        <div class="small muted">Données transactions en cours de chargement… le graphique s’affichera automatiquement dès que le dataset sera prêt.</div>
      </div>`;
    }

    const stats = last6MonthsStats(clients);
    const rows = stats.months || [];
    if(!rows.length) return `<div class="small muted">Graphique indisponible.</div>`;

    const maxVal = Math.max(1, ...rows.map(r => Math.max(Number(r.total)||0, Number(r.prevYear)||0)));
    const W = 1120, H = 300;
    const pad = { t: 18, r: 18, b: 46, l: 56 };
    const chartW = W - pad.l - pad.r;
    const chartH = H - pad.t - pad.b;
    const step = chartW / Math.max(1, rows.length);
    const barW = Math.min(84, step * 0.58);

    const y = (v)=> pad.t + chartH - (Math.max(0, Number(v)||0) / maxVal) * chartH;
    const xCenter = (i)=> pad.l + (i * step) + step/2;
    const h = (v)=> {
      const n = Math.max(0, Number(v)||0);
      if(!n) return 0;
      return Math.max(4, (n / maxVal) * chartH);
    };

    const ticks = [0, 0.25, 0.5, 0.75, 1];
    const grid = ticks.map(k=>{
      const yy = pad.t + chartH - (chartH * k);
      const val = maxVal * k;
      return `
        <line x1="${pad.l}" y1="${yy}" x2="${W-pad.r}" y2="${yy}" stroke="rgba(255,255,255,.08)" stroke-width="1"/>
        <text x="${pad.l-8}" y="${yy+4}" text-anchor="end" fill="rgba(255,255,255,.52)" font-size="10">${esc(fmtInt(val/1000))}k</text>`;
    }).join("");

    const bars = rows.map((r,i)=>{
      const total = Math.max(0, Number(r.total)||0);
      const newPart = Math.min(total, Math.max(0, Number(r.newPart)||0));
      const prevYear = Math.max(0, Number(r.prevYear)||0);
      const xc = xCenter(i);
      const x = xc - barW/2;
      const totalH = h(total);
      const newH = h(newPart);
      const totalY = pad.t + chartH - totalH;
      const newY = pad.t + chartH - newH;
      const title = `${r.ym} • Total ${fmtEUR(total)} • Nouveaux ${fmtEUR(newPart)} • N-1 ${fmtEUR(prevYear)}`;
      return `
        <g>
          <title>${esc(title)}</title>
          <rect x="${x}" y="${totalY}" width="${barW}" height="${totalH}" rx="7" fill="rgba(110,168,255,.30)" stroke="rgba(110,168,255,.70)" stroke-width="1.1"/>
          ${newPart > 0 ? `<rect x="${x}" y="${newY}" width="${barW}" height="${newH}" rx="7" fill="rgba(56,211,159,.92)"/>` : ``}
          <text x="${xc}" y="${H-14}" text-anchor="middle" fill="rgba(255,255,255,.72)" font-size="11" font-weight="700">${esc(r.label)}</text>
        </g>`;
    }).join("");

    const linePts = rows.map((r,i)=> `${xCenter(i)},${y(r.prevYear)}`).join(" ");
    const dots = rows.map((r,i)=> `<circle cx="${xCenter(i)}" cy="${y(r.prevYear)}" r="3.5" fill="#ffb86b" stroke="#0b1020" stroke-width="1.5"/>`).join("");
    const baseLine = `<line x1="${pad.l}" y1="${pad.t+chartH}" x2="${W-pad.r}" y2="${pad.t+chartH}" stroke="rgba(255,255,255,.14)" stroke-width="1"/>`;

    return `
      <div class="card" style="grid-column: span 12; padding:12px 14px 14px; overflow:hidden;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
          <h3 style="margin:0;">CA mensuel — 6 derniers mois</h3>
          <span class="small muted">Cumul mensuel du périmètre affiché</span>
          <div style="margin-left:auto;display:flex;gap:14px;flex-wrap:wrap;align-items:center;">
            <span class="small muted" style="display:inline-flex;align-items:center;gap:6px;"><i style="width:10px;height:10px;border-radius:3px;background:rgba(110,168,255,.45);display:inline-block;border:1px solid rgba(110,168,255,.65);"></i>CA total</span>
            <span class="small muted" style="display:inline-flex;align-items:center;gap:6px;"><i style="width:10px;height:10px;border-radius:3px;background:rgba(56,211,159,.92);display:inline-block;"></i>Part nouveaux clients</span>
            <span class="small muted" style="display:inline-flex;align-items:center;gap:6px;"><i style="width:18px;height:2px;background:#ffb86b;display:inline-block;position:relative;"></i>CA N-1</span>
          </div>
        </div>
        <div class="small muted" style="margin-bottom:10px;">Lecture : histogramme du CA cumulé par mois, dont la part des nouveaux clients est isolée en vert, avec la comparaison du CA des mêmes mois en N-1.</div>
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="300" role="img" aria-label="CA mensuel des 6 derniers mois avec part nouveaux clients et comparaison N-1" style="display:block;overflow:visible;shape-rendering:geometricPrecision;">
          ${grid}
          ${baseLine}
          ${bars}
          <polyline points="${linePts}" fill="none" stroke="#ffb86b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          ${dots}
        </svg>
      </div>`;
  }

  function kpiCard(label, value, sub='', kpiId=''){
    return `<div class="kpi clickable" data-kpi-card="1" ${kpiId?`data-kpi-id="${esc(kpiId)}"`:''}><div class="k">${esc(label)}</div><div class="v">${value}</div>${sub?`<div class="small muted" style="margin-top:4px;">${sub}</div>`:''}</div>`;
  }
  function clientPreviewHtml(rows){
    const list = (rows||[]).slice(0,3);
    if(!list.length) return `<div class="small muted">—</div>`;

    const getCaM = (c)=>{
      // 1. Champ direct si déjà calculé
      const vals = [c && c.caM, c && c.caMonth, c && c.caMonthCur, c && c.caCurM, c && c.caMois];
      for(const v of vals){
        const n = Number(v);
        if(Number.isFinite(n) && n > 0) return n;
      }
      // 2. Via sumCachePeriod (source de vérité exposée par core.js)
      try {
        const name = c && (c.name || c.clientCanon || c.clientNorm || '');
        if(name && typeof window.sumCachePeriod === 'function'){
          const r = window.sumCachePeriod(String(name).trim(), 'M');
          if(r && Number.isFinite(r.sum)) return r.sum;
        }
      } catch(e) {}
      // 3. Scan direct state.tx sur le mois courant
      try {
        const name = c && (c.name || c.clientCanon || c.clientNorm || '');
        if(!name) return 0;
        const norm = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
        const nk = norm(name);
        const txSrc = (window.state && Array.isArray(window.state.txAll) && window.state.txAll.length)
          ? window.state.txAll : (window.state && Array.isArray(window.state.tx) ? window.state.tx : []);
        const asOf = getAsOfISO() || (window.state && window.state.quality && window.state.quality.maxDate) || "";
        const curMk = String(asOf).slice(0,7);
        let sum = 0;
        for(const t of txSrc){
          if(!t || !t.dateISO || String(t.dateISO).slice(0,7) !== curMk) continue;
          const tk = norm(t.clientCanon || t.clientNorm || t.rawClient || '');
          if(tk === nk) sum += Number(t.amountHT || 0);
        }
        return sum;
      } catch(e) {}
      return 0;
    };

    const getDiag = (c)=>{
      try{
        const raw = String((c && (c.diagnostic || c.diag || c.diagnosticLabel || c.__diagText || c.diagText)) || "").trim();
        if(raw) return raw;

        const seg = String((c && c.segment) || "");
        const alertPilotage = String((c && (c.actionZone || c.alertPilotage)) || "");
        const td = Number(c && c.tdPct) || 0;

        let tfRaw = Number(c && c.tf) || 0;
        const tf = (Math.abs(tfRaw) < 2 && tfRaw !== 0) ? tfRaw * 100 : tfRaw;

        const freqAnnual = Number.isFinite(+((c && c.frequency) || NaN)) ? +(c && c.frequency) : 1;
        const recCalDays = Number.isFinite(+((c && (c.recCalDays ?? c.recDays ?? c.recenceDays)) || NaN))
          ? +(c && (c.recCalDays ?? c.recDays ?? c.recenceDays))
          : 0;

        const cycleAchat = freqAnnual > 0 ? 365 / freqAnnual : 0;
        const retardJours = recCalDays - cycleAchat;

        const segLc = seg.toLowerCase();
        const isPerdu = segLc.includes("perdu");
        const isOpportunite = !isPerdu && (cycleAchat > 0 && recCalDays >= (cycleAchat * 0.8) && recCalDays <= (cycleAchat * 1.2));

        let diagText = "Actif et régulier";

        if (isPerdu) {
          diagText = "Inactif";
        } else if (cycleAchat > 0 && retardJours > 15) {
          diagText = `Retard d'achat de ${Math.round(retardJours)} jours`;
        } else if (isOpportunite) {
          diagText = "Fenêtre d'achat idéale";
        } else if (td <= -5) {
          diagText = `Baisse du volume de ${Math.abs(Math.round(td))} %`;
        } else if (tf <= -5) {
          diagText = `Fréquence en baisse de ${Math.abs(Math.round(tf))} %`;
        } else if (td >= 5) {
          diagText = `Croissance du volume (+${Math.round(td)} %)`;
        }

        if(alertPilotage && alertPilotage.trim()) return alertPilotage + " • " + diagText;
        return diagText;
      }catch(e){}
      return "—";
    };

    const getRecence = (c)=>{
      const raw = String((c && (c.recenceLabel || c.recLabel || c.recTxt || c.recenceText)) || "").trim();
      if(raw) return raw;
      const d = Number(c && (c.recCalDays ?? c.recDays ?? c.recenceDays));
      if(Number.isFinite(d)) return `Il y a ${d}j`;
      return "—";
    };

    const rowStyle = "display:grid;grid-template-columns:minmax(160px,1.2fr) 110px minmax(280px,3fr) 95px 90px;gap:14px;align-items:center;padding:7px 0;";
    const headStyle = rowStyle + "font-size:11px;font-weight:700;color:rgba(255,255,255,.82);border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:2px;";
    const cellMuted = "font-size:12px;color:rgba(255,255,255,.92);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    const diagStyle = "font-size:12px;color:rgba(255,255,255,.92);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    const recStyle = "font-size:12px;color:rgba(255,255,255,.92);white-space:nowrap;text-align:right;";
    const camStyle = "font-size:12px;color:rgba(255,255,255,.92);white-space:nowrap;text-align:right;font-weight:700;";

    return `<div style="margin-top:10px;border-top:1px solid rgba(255,255,255,.06);padding-top:8px;">
      <div style="${headStyle}">
        <div>Client</div>
        <div>Segment</div>
        <div>Diagnostic</div>
        <div style="text-align:right;">Récence</div>
        <div style="text-align:right;">CA M</div>
      </div>
      ${list.map(c=>{
        const nm = String((c && c.name) || "—");
        const seg = String((c && c.segment) || "—").trim() || "—";
        const diag = getDiag(c);
        const rec = getRecence(c);
        const cam = fmtEUR(getCaM(c));
        return `<div style="${rowStyle}">
          <div style="${cellMuted}"><span class="client-link" data-client="${esc(nm)}" style="cursor:pointer;font-weight:700;text-decoration:underline;">${esc(nm)}</span></div>
          <div style="${cellMuted}">${esc(seg)}</div>
          <div style="${diagStyle}"><span style="font-weight:700; color:${diagColor(diag)};">${esc(diag)}</span></div>
          <div style="${recStyle}">${esc(rec)}</div>
          <div style="${camStyle}">${cam}</div>
        </div>`;
      }).join("")}
    </div>`;
  }
  function metricCard(title, value, sub='', glow='', kpiId='', previewRows=[], help=''){
    return `<div class="kpi clickable ${glow}" ${kpiId?`data-kpi-id="${esc(kpiId)}"`:''}>
      <div class="k">${esc(title)}</div>
      <div class="v">${value}</div>
      ${help?`<div class="small muted" style="margin-top:4px;opacity:.92;">${help}</div>`:''}
      ${sub?`<div class="small muted" style="margin-top:4px;">${sub}</div>`:''}
      ${clientPreviewHtml(previewRows)}
    </div>`;
  }
  function tfBarRows(rows){
    return `<div style="display:flex;flex-direction:column;gap:14px;">${
      rows.map(x=>{
        const v = Math.max(0, Number(x.pct)||0);
        const width = Math.max(6, Math.min(100, v));
        const color = x.id==="tb:tf:up"
          ? "linear-gradient(90deg,#22c55e,#4ade80)"
          : (x.id==="tb:tf:flat"
              ? "linear-gradient(90deg,#3b82f6,#60a5fa)"
              : "linear-gradient(90deg,#ef4444,#f87171)");
        return `
          <div class="barrow clickable" data-kpi-id="${esc(x.id)}" title="Cliquer pour le détail">
            <div style="display:flex;align-items:center;gap:8px;min-width:150px;">
              <span class="seg-pill">${esc(x.label)}</span>
              <span class="small muted">${fmtInt((x.rows||[]).length)} clients</span>
            </div>
            <div class="bar">
              <i style="width:${width}%;background:${color};"></i>
            </div>
            <div class="pctCol">
              <div style="font-weight:800;">${v.toFixed(1).replace(".", ",")}%</div>
            </div>
          </div>`;
      }).join("")
    }</div>`;
  }

  function renderSegmentationControlsAndClone(){
    try{
      if(typeof window.renderDash === "function") window.renderDash();
    }catch(e){}
    const currentSort = (document.getElementById("segSort") && document.getElementById("segSort").value) || (window.state?.ui?.segSort) || "prio";
    const hidePerdus = !!(window.state && window.state.ui && window.state.ui.hidePerdus);
    const src = document.getElementById("segBars");
    const barsHtml = src ? src.innerHTML : `<div class="muted">Graphique segmentation indisponible.</div>`;
    const btnLabel = hidePerdus ? "Afficher Perdus" : "Masquer Perdus";
    return `
      <div style="display:flex;align-items:center;gap:8px;margin:6px 0 8px 0;flex-wrap:wrap;">
        <span class="muted small">Tri :</span>
        <select id="tbSegSort" class="input" style="padding:6px 10px; width:auto; min-width:220px;">
          <option value="prio" ${currentSort==="prio"?"selected":""}>Ordre (priorité)</option>
          <option value="clients" ${currentSort==="clients"?"selected":""}>Part de répartition (clients)</option>
          <option value="ca" ${currentSort==="ca"?"selected":""}>Part de CA</option>
        </select>
        <button id="tbBtnToggleDormants" class="btn" type="button" style="margin-left:auto;">${btnLabel}</button>
      </div>
      <div id="tbSegBars">${barsHtml}</div>
    `;
  }

  function bindSegmentationControls(root){
    const sel = root.querySelector("#tbSegSort");
    const btn = root.querySelector("#tbBtnToggleDormants");
    if(sel){
      sel.addEventListener("change", ()=>{
        try{
          if(!window.state.ui) window.state.ui = {};
          window.state.ui.segSort = sel.value || "prio";
          const orig = document.getElementById("segSort");
          if(orig) orig.value = sel.value || "prio";
          if(typeof window.renderDash === "function") window.renderDash();
          if(typeof window.renderTableauBord === "function") window.renderTableauBord();
        }catch(e){ console.warn("[TableauBord] seg sort", e); }
      });
    }
    if(btn){
      btn.addEventListener("click", ()=>{
        try{
          if(!window.state.ui) window.state.ui = {};
          window.state.ui.hidePerdus = !window.state.ui.hidePerdus;
          if(typeof window.renderDash === "function") window.renderDash();
          if(typeof window.renderTableauBord === "function") window.renderTableauBord();
        }catch(e){ console.warn("[TableauBord] toggle perdus", e); }
      });
    }
  }

  function openClient(name){
    try{
      if(typeof window.openClientDetail === "function") return window.openClientDetail(name);
    }catch(e){}
  }

  function openTbKpiDetail(id){
    const kpi = window.__tableauBordKpis && window.__tableauBordKpis[id];
    if(!kpi) return false;
    try {
      const rows = (kpi.rows || []).filter(c => c && (c.name || (c.c && c.c.name))).map(c => {
        // Normaliser : si c'est un row de dashboard (avec r.c), fusionner les champs
        if(!c.name && c.c && c.c.name) {
          return { ...c.c, ...c, name: c.c.name, segment: c.segment || c.c.segment };
        }
        return c;
      });
      const viewKpi = document.getElementById("view-kpi");
      const kpiTitle = document.getElementById("kpiTitle");
      const kpiSubtitle = document.getElementById("kpiSubtitle");
      const kpiBody = document.getElementById("kpiBody");
      const kpiKpi = document.getElementById("kpiKpi");
      if(!viewKpi || !kpiBody) return false;
      document.querySelectorAll("[id^='view-']").forEach(s => { if(s.classList) s.classList.add("hidden"); });
      viewKpi.classList.remove("hidden");
      if(kpiTitle) kpiTitle.textContent = kpi.title || id;
      if(kpiSubtitle) kpiSubtitle.textContent = kpi.subtitle || "";
      const ca = rows.reduce((s,c) => s + (Number(c.monetaryHT)||0), 0);
      const fmtE = v => typeof window.fmtEUR === "function" ? window.fmtEUR(v) : Math.round(Number(v)||0).toLocaleString("fr-FR") + " €";
      const fmtI = v => typeof window.fmtInt === "function" ? window.fmtInt(v) : String(Math.round(Number(v)||0));
      const fmtD = iso => typeof window.fmtDateISO === "function" ? window.fmtDateISO(iso) : (iso || "—");
      const fmtPct = v => {
        const n = Number(v);
        if(!Number.isFinite(n)) return "—";
        return Math.round(n * 100) + "%";
      };
      const tfHtml = c => {
        try{ if(typeof window._tfBadgeHTML === "function") return window._tfBadgeHTML(c) || '<span class="mono muted">NC</span>'; }catch(e){}
        return (typeof c.tf === "number" && Number.isFinite(c.tf)) ? `<span class="mono">${Math.round(c.tf*100)}%</span>` : '<span class="mono muted">NC</span>';
      };
      const tvHtml = c => {
        try{ if(typeof window._tdBadgeHTML === "function") return window._tdBadgeHTML(c) || '<span class="mono muted">—</span>'; }catch(e){}
        const td = (c && Number.isFinite(Number(c.tdPct))) ? Number(c.tdPct) : NaN;
        return Number.isFinite(td) ? `<span class="mono">${Math.round(td)}%</span>` : '<span class="mono muted">—</span>';
      };
      const pctMaxTxt = c => {
        if(c && typeof c.__pctMaxTxt === "string" && c.__pctMaxTxt) return c.__pctMaxTxt;
        if(c && Number.isFinite(Number(c.pctOfMax))) return fmtPct(Number(c.pctOfMax));
        if(c && c.c && Number.isFinite(Number(c.c.pctOfMax))) return fmtPct(Number(c.c.pctOfMax));
        return "—";
      };
      const pdpTxt = c => {
        if(c && typeof c.__penTxt === "string" && c.__penTxt) return c.__penTxt;
        if(c && Number.isFinite(Number(c.penetration))) return fmtPct(Number(c.penetration));
        if(c && c.c && Number.isFinite(Number(c.c.penetration))) return fmtPct(Number(c.c.penetration));
        return "—";
      };
      if(kpiKpi) kpiKpi.innerHTML = [
        ["Clients", fmtI(rows.length)],
        ["CA HT", fmtE(ca)],
        ["CA moyen / client", rows.length ? fmtE(ca / rows.length) : "—"],
        ["Récence médiane", rows.length ? fmtI(Math.round([...rows.map(c=>Number(c.recencyDays)||0)].sort((a,b)=>a-b)[Math.floor(rows.length/2)])) + " j" : "—"],
      ].map(([k,v]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
      kpiBody.innerHTML = rows.slice(0,500).map(c => `
        <tr>
          <td><span class="client-link" data-client="${esc(c.name)}">${esc(c.name)}</span></td>
          <td><span class="chip acc">${esc(c.segment||"—")}</span></td>
          <td>${tfHtml(c)}</td>
          <td class="mono">${Number.isFinite(Number(c.scoreR)) ? fmtI(c.scoreR) : "—"}</td>
          <td class="mono">${Number.isFinite(Number(c.scoreF)) ? fmtI(c.scoreF) : "—"}</td>
          <td class="mono">${Number.isFinite(Number(c.scoreM)) ? fmtI(c.scoreM) : "—"}</td>
          <td class="mono">${c.rfm || "—"}</td>
          <td>${tvHtml(c)}</td>
          <td class="mono">${fmtD(c.lastISO)}</td>
          <td class="mono">${Number.isFinite(Number(c.recencyDays)) ? fmtI(c.recencyDays) : "—"}</td>
          <td class="mono">${Number.isFinite(Number(c.frequency)) ? fmtI(c.frequency) : "—"}</td>
          <td class="mono">${fmtE(c.monetaryHT||0)}</td>
          <td class="mono">${fmtE(c.annualAvgHT||0)}</td>
          <td class="mono">${pctMaxTxt(c)}</td>
          <td class="mono">${pdpTxt(c)}</td>
        </tr>`).join("") || `<tr><td colspan="15" class="muted">—</td></tr>`;
      viewKpi.querySelectorAll(".client-link[data-client]").forEach(el => {
        el.addEventListener("click", ev => { ev.preventDefault(); openClient(el.getAttribute("data-client")); });
      });
      return true;
    } catch(e) { console.warn("[TB] openTbKpiDetail", e); return false; }
  }

  function bindInteractions(root){
    root.addEventListener("click", (e)=>{
      const client = e.target.closest(".client-link[data-client]");
      if(client){ e.preventDefault(); openClient(client.getAttribute("data-client")); return; }
      const row = e.target.closest("[data-kpi-id]");
      if(row){
        const id = row.getAttribute("data-kpi-id");
        if(id){
          if(id.startsWith("tb:") && openTbKpiDetail(id)) return;
          if(typeof window.openKpiDetail === "function"){ window.openKpiDetail(id); return; }
        }
      }
      const seg = e.target.closest(".barrow[data-seg]");
      if(seg && typeof window.openKpiDetail === "function") window.openKpiDetail("seg:" + seg.getAttribute("data-seg"));
    });
  }

  

  function caMonthCurrent(clients) {
    const txSrc = visibleClientTxOrAll(clients);
    const asOfISO = getAsOfISO();
    const curMk = String(asOfISO).slice(0,7);
    let ca = 0;

    for (const t of (txSrc || [])) {
      if (!t || !t.dateISO) continue;
      if (String(t.dateISO).slice(0,7) === curMk) ca += Number(t.amountHT || 0);
    }

    // Fallback robuste : somme client par client via le moteur central
    if (!ca && Array.isArray(clients) && clients.length && typeof window.sumCachePeriod === "function") {
      for (const c of clients) {
        const nm = String((c && (c.name || c.clientCanon || c.clientNorm || c.id || c.client)) || "").trim();
        if (!nm) continue;
        try {
          const r = window.sumCachePeriod(nm, "M");
          if (r && Number.isFinite(r.sum)) ca += Number(r.sum || 0);
        } catch(e) {}
      }
    }

    return ca;
  }


window.renderTableauBord = function renderTableauBord(){
    // S'assurer que les Dynamiques du Pilotage Commercial sont calculées
    // (renderPilotageCo tourne après renderTableauBord dans updateData)
    if (!Array.isArray(window.__pilotageCoVic) || !window.__pilotageCoVic.length) {
      try { if (typeof renderPilotageCo === "function") renderPilotageCo(); } catch(e) {}
    }
    const coreKpis = (typeof window.getTableauBordKpis === "function") ? (window.getTableauBordKpis() || {}) : {};
    const root = document.getElementById("tableauBordRoot");
    if(!root) return;

    const clients = visibleClients();
    if(!clients.length){
      root.innerHTML = `<div class="muted">Importe un dataset pour construire le tableau de bord.</div>`;
      return;
    }

    const active = activeCount(clients);
    const ytd = ytdStats(clients);
    const month = monthOrderStats(clients);
    const depTop5 = top5Dependance(clients);
    const basket = avgBasket(clients);
    const dir = getDirection(clients);
    const opp = opportunityStats(clients);
    const tf = tfStats(clients);
    const secondary = secondaryKpis(clients);

    const riskMainPreview = topClientPreview(dir?.preDropMain, "caExposed", 3);
    const riskLowPreview = topClientPreview(dir?.preDropLow, "caExposed", 3);
    const churnPreview = topClientPreview(dir?.churned, "caLost", 3);

    // Register custom KPI datasets for modal details
    window.__tableauBordKpis = {
      "tb:opp:new": { title:"Nouveaux clients", rows: (opp.nouveauxRows || []), subtitle:"Nouveaux clients — détail" },
      "tb:opp:dyn": { title:"Dynamiques", rows: opp.dynamiquesRows || [], subtitle:"Meilleures dynamiques TF×TV" },
      "tb:opp:gap": { title:"Gisement de CA", rows: opp.gisementRows || [], subtitle:"Clients au potentiel de CA le plus élevé" },
      "tb:tf:up": { title:"TF — En hausse", rows: (tf.find(x=>x.id==="tb:tf:up")||{}).rows || [], subtitle:"Clients en hausse" },
      "tb:tf:flat": { title:"TF — Stagne", rows: (tf.find(x=>x.id==="tb:tf:flat")||{}).rows || [], subtitle:"Clients stables" },
      "tb:tf:down": { title:"TF — Régresse", rows: (tf.find(x=>x.id==="tb:tf:down")||{}).rows || [], subtitle:"Clients en régression" },
      "tb:kpi:active": { title:"Clients actifs / analysés", rows: (clients||[]).filter(c => c && c.segment !== "Perdus Historiques" && Number(c.scoreR||0) >= 3), subtitle:"Clients actifs visibles" },
      "tb:kpi:ytd": { title:"CA depuis le début d'année", rows: (clients||[]).filter(c => c && c.segment !== "Perdus Historiques").slice().sort((a,b)=>(Number(b.monetaryHT)||0)-(Number(a.monetaryHT)||0)), subtitle:"Clients triés par CA cumulé" },
      "tb:kpi:basket": { title:"Panier moyen", rows: (clients||[]).filter(c => c && c.segment !== "Perdus Historiques").slice().sort((a,b)=>(((Number(b.monetaryHT)||0)/(Math.max(1, Number(b.frequency)||0))) - ((Number(a.monetaryHT)||0)/(Math.max(1, Number(a.frequency)||0))))), subtitle:"Clients triés par panier moyen" },
      "tb:kpi:orders": { title:"Commandes mois en cours vs M-1", rows: (clients||[]).filter(c => c && c.segment !== "Perdus Historiques").slice().sort((a,b)=>(Number(b.frequency)||0)-(Number(a.frequency)||0)), subtitle:"Clients triés par fréquence de commande" },
      "tb:kpi:dep5": { title:"Dépendance TOP 5 clients", rows: depTop5.rows || [], subtitle:"Top 5 clients par contribution CA" }
    };

    root.innerHTML = `
      <div class="kpis" style="margin-top:6px;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;width:100%;align-items:stretch;">
        ${kpiCard("Clients actifs / analysés", `${fmtInt(coreKpis.active ?? active.active)} / ${fmtInt(coreKpis.total ?? active.total)}`, "", "tb:kpi:active")}
        ${kpiCard(`CA depuis le début d\'année ${coreKpis.year ?? ytd.year}`, fmtEUR(coreKpis.ytdCA ?? ytd.ca), "", "tb:kpi:ytd")}
        ${kpiCard("CA mois en cours", fmtEUR(caMonthCurrent(clients)), "", "tb:kpi:ytd")}
        ${kpiCard("Panier moyen", fmtEUR(coreKpis.basket ?? basket), "", "tb:kpi:basket")}
        ${kpiCard("Commandes mois en cours vs M-1", `${fmtInt(coreKpis.curOrders ?? month.cur)} / ${fmtInt(coreKpis.prevOrders ?? month.prev)}`, "", "tb:kpi:orders")}
        ${kpiCard("Dépendance TOP 5 clients", fmtPct(coreKpis.depTop5Pct ?? depTop5.pct), "", "tb:kpi:dep5")}
      </div>

      <div class="grid" style="margin-top:12px;">

        <div class="card" style="grid-column: span 6; padding:0; overflow:hidden; display:flex; flex-direction:column;">
          <div style="display:flex;align-items:center;gap:8px;padding:10px 14px 9px;border-bottom:1px solid var(--stroke);flex:0 0 auto;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff8c42" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;">
              <path d="M12 9v4"/><path d="M12 17h.01"/>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            </svg>
            <span style="font-size:13px;font-weight:900;color:var(--text);">Vigilance</span>
            ${dir ? `<span style="margin-left:auto;font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:rgba(255,93,93,.12);color:var(--bad);">${fmtInt((dir.preDropMain||[]).length + (dir.preDropLow||[]).length + (dir.churned||[]).length)} clients exposés</span>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;flex:1;">
            <div style="padding:11px 14px;border-bottom:1px solid var(--stroke);flex:1;">
              <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">
                <span style="width:6px;height:6px;border-radius:50%;background:#ff8c42;flex:0 0 auto;display:inline-block;"></span>Risque de décrochage
              </div>
              ${metricCard("", dir ? `${fmtInt((dir.preDropMain||[]).length)} clients` : "—", dir ? `${fmtPct(dir.preDropMainPct)} des actifs • CA exposé : ${fmtEUR(dir.preDropMainCA)}` : "", "tileGlowOrange", "dir:predrop", riskMainPreview, "Clients à surveiller avant bascule vers une baisse plus nette.")}
            </div>
            <div style="padding:11px 14px;border-bottom:1px solid var(--stroke);flex:1;">
              <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">
                <span style="width:6px;height:6px;border-radius:50%;background:var(--bad);flex:0 0 auto;display:inline-block;"></span>Décrochage en cours
              </div>
              ${metricCard("", dir ? `${fmtInt((dir.preDropLow||[]).length)} clients` : "—", dir ? `${fmtPct(dir.preDropLowPct)} des actifs • CA exposé : ${fmtEUR(dir.preDropLowCA)}` : "", "tileGlowOrange", "dir:predrop_low", riskLowPreview, "Clients déjà engagés dans une baisse de rythme ou de valeur.")}
            </div>
            <div style="padding:11px 14px;flex:1;${dir && (dir.churned||[]).length === 0 ? 'opacity:.55;' : ''}">
              <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">
                <span style="width:6px;height:6px;border-radius:50%;background:#7f1d1d;flex:0 0 auto;display:inline-block;"></span>Décrochage confirmé
              </div>
              ${metricCard("", dir ? `${fmtInt((dir.churned||[]).length)} clients` : "—", dir ? `${fmtPct(dir.churnPct)} des actifs • CA exposé : ${fmtEUR(dir.churnCA)}` : "", "tileGlowRed", "dir:churn", churnPreview, "Clients à réactiver ou à sortir du plan d'action prioritaire.")}
            </div>
          </div>
        </div>

        <div class="card" style="grid-column: span 6; padding:0; overflow:hidden; display:flex; flex-direction:column;">
          <div style="display:flex;align-items:center;gap:8px;padding:10px 14px 9px;border-bottom:1px solid var(--stroke);flex:0 0 auto;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--good)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
            </svg>
            <span style="font-size:13px;font-weight:900;color:var(--text);">Opportunités</span>
            <span style="margin-left:auto;font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:rgba(56,211,159,.12);color:var(--good);">${fmtInt(opp.nouveauxN + opp.dynamiquesN + opp.gisementN)} clients</span>
          </div>
          <div style="display:flex;flex-direction:column;flex:1;">
            <div style="padding:11px 14px;border-bottom:1px solid var(--stroke);flex:1;">
              <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">
                <span style="width:6px;height:6px;border-radius:50%;background:var(--good);flex:0 0 auto;display:inline-block;"></span>Nouveaux clients
              </div>
              ${metricCard("", `${fmtInt(opp.nouveauxN)} clients`, `CA cumulé : ${fmtEUR(opp.nouveauxCA)}`, "tileGlowGreen", "tb:opp:new", opp.nouveauxTop, "Clients récemment acquis ou réactivés, à accompagner pour installer une relation durable.")}
            </div>
            <div style="padding:11px 14px;border-bottom:1px solid var(--stroke);flex:1;">
              <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">
                <span style="width:6px;height:6px;border-radius:50%;background:var(--accent);flex:0 0 auto;display:inline-block;"></span>Dynamiques
              </div>
              ${metricCard("", `${fmtInt(opp.dynamiquesN)} clients`, `TF×TV moyen : ${fmtPct(opp.dynamiquesScore,2)}`, "tileGlowGreen", "tb:opp:dyn", opp.dynamiquesTop, "Clients en tendance positive, prioritaires pour développer le chiffre d’affaires.")}
            </div>
            <div style="padding:11px 14px;flex:1;">
              <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">
                <span style="width:6px;height:6px;border-radius:50%;background:#a855f7;flex:0 0 auto;display:inline-block;"></span>Gisement de CA
              </div>
              ${metricCard("", `${fmtInt(opp.gisementN)} clients`, `Potentiel estimé : ${fmtEUR(opp.gisementCA)}`, "tileGlowGreen", "tb:opp:gap", opp.gisementTop, "Clients avec un potentiel de chiffre d’affaires non exploité à date.")}
            </div>
          </div>
        </div>


        ${monthlyCaChart(clients)}

        <div class="card" style="grid-column: span 12;">
          <h3>KPI complémentaires</h3>
          <div class="kpis">
            ${secondary.map(x => kpiCard(x.label, x.value)).join("")}
          </div>
        </div>
      </div>
    `;
    bindInteractions(root);
    bindSegmentationControls(root);
  };

  if(!window.__tableauBordDatasetReadyBound){
    window.__tableauBordDatasetReadyBound = true;
    window.addEventListener("datasetReady", ()=>{
      try{
        if(typeof window.renderTableauBord === "function"){
          setTimeout(()=>{ try{ window.renderTableauBord(); }catch(_e){} }, 0);
        }
      }catch(e){}
    });
  }

})();
