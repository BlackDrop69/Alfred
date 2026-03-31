(function(){
  "use strict";

  const LS_KEY = "ALFRED_OBJECTIFS_EXPORT_V1";
  const LS_ACTIONS_KEY = "ALFRED_ACTIONS_COMMERCIALES_V1";
  const LS_OBJ_YM_KEY = "ALFRED_OBJECTIFS_VIEW_YM_V1";

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // -------------------------
  // Temps écoulé (Burn Rate)
  // -------------------------
  function getMonthProgress(){
    const d = new Date();
    const daysInMonth = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    return (d.getDate() / daysInMonth) * 100;
  }

  // Jours ouvrés (lun-ven) — pour le pacing temps (plus intuitif que jours calendaires)
  function countBusinessDaysInMonth(d){
    const y=d.getFullYear(), m=d.getMonth();
    const last = new Date(y, m+1, 0).getDate();
    let n=0;
    for(let day=1; day<=last; day++){
      const dt=new Date(y,m,day);
      const wd=dt.getDay(); // 0=dim .. 6=sam
      if(wd!==0 && wd!==6) n++;
    }
    return n;
  }

  function countBusinessDaysElapsed(d){
    // inclut aujourd'hui si jour ouvré
    const y=d.getFullYear(), m=d.getMonth();
    let n=0;
    for(let day=1; day<=d.getDate(); day++){
      const dt=new Date(y,m,day);
      const wd=dt.getDay();
      if(wd!==0 && wd!==6) n++;
    }
    return n;
  }

  function getBusinessTime(){
    const now = new Date();
    const total = countBusinessDaysInMonth(now);
    const elapsed = countBusinessDaysElapsed(now);
    const remaining = Math.max(0, total - elapsed);
    const pct = total>0 ? (elapsed/total)*100 : 0;
    return { total, elapsed, remaining, pct };
  }


  function ymRangeISO(y,m){
    const mm = String(m).padStart(2,"0");
    const last = new Date(y, m, 0).getDate();
    return { s: `${y}-${mm}-01`, e: `${y}-${mm}-${String(last).padStart(2,"0")}` };
  }

  function monthKey(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    return `${y}-${m}`;
  }

  function prevMonthKey(d){
    const p = new Date(d.getFullYear(), d.getMonth()-1, 1);
    return monthKey(p);
  }

  function parseDateISO(s){
    // attendu: "YYYY-MM-DD" (ou ISO)
    if(!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(!m) return null;
    const y = +m[1], mo = +m[2]-1, da = +m[3];
    const dt = new Date(y, mo, da);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  function fmtEUR(v){
    const n = Number(v||0);
    if(window.fmtEUR) return window.fmtEUR(n);
    try{
      return n.toLocaleString("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0});
    }catch(e){
      return String(Math.round(n))+" €";
    }
  }

  // -------------------------
  // Statut pacing (vert/orange/rouge)
  // -------------------------
  function getPacingStatus(realPct, timePct){
    // realPct / timePct : valeurs en %
    if(realPct >= timePct) return { key:"good", label:"En avance", glow:"tileGlowGreen" };
    if(realPct >= timePct - 15) return { key:"warn", label:"À surveiller", glow:"tileGlowOrange" };
    return { key:"bad", label:"Retard critique", glow:"tileGlowRed" };
  }

  function clampPct(x){
    x = Number(x)||0;
    if(x < 0) return 0;
    if(x > 100) return 100;
    return x;
  }

  // -------------------------
  // Import / Persistance
  // -------------------------
  let imported = null;

  let actions = {};

  function loadSaved(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return;
      const obj = JSON.parse(raw);
      if(obj && obj.type==="ALFRED_OBJECTIFS_EXPORT" && obj.version===1 && Array.isArray(obj.clients)){
        imported = obj;
      }
    }catch(_e){}
  }

  function loadActions(){
    try{
      const raw = localStorage.getItem(LS_ACTIONS_KEY);
      if(!raw) { actions = {}; return; }
      const obj = JSON.parse(raw);
      actions = (obj && typeof obj === 'object') ? obj : {};
    }catch(_e){ actions = {}; }
  }

  function saveActions(){
    try{ localStorage.setItem(LS_ACTIONS_KEY, JSON.stringify(actions||{})); }catch(_e){}
  }

  function save(obj){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(obj)); }catch(_e){}
  }

  function clearImport(){
    imported = null;
    try{ localStorage.removeItem(LS_KEY); }catch(_e){}
  }

  function parseAndSet(text){
    let obj;
    try{ obj = JSON.parse(text); }catch(e){
      alert("Fichier invalide (JSON illisible).");
      return;
    }
    if(!obj || obj.type!=="ALFRED_OBJECTIFS_EXPORT" || obj.version!==1 || !Array.isArray(obj.clients)){
      alert("Fichier .alfred invalide (type/version).");
      return;
    }
    imported = obj;
    save(obj);
    window.renderObjectifsModule();
  }

  function wireImportUI(){
    const input = $("#objectifsImportFile");
    if(!input || input.__wired) return;
    input.__wired = true;
    input.addEventListener("change", (e)=>{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      const reader = new FileReader();
      reader.onload = ()=>parseAndSet(String(reader.result||""));
      reader.onerror = ()=>alert("Lecture fichier impossible.");
      reader.readAsText(f);
      input.value = "";
    });
  }

  // API globale (utile debug)
  window.__objectifsImportText = (text)=>parseAndSet(String(text||""));
  window.__objectifsClear = ()=>{ clearImport(); window.renderObjectifsModule(); };

  

  // Date de travail (fallback simple) : max(date) des transactions chargées, sinon date système.
  function getEffectiveNow(){
    try{
      const tx = getTx();
      let max = null;
      for(const t of tx){
        const dt = parseDateISO(t && (t.dateISO || t.date || ""));
        if(!dt) continue;
        if(!max || dt > max) max = dt;
      }
      return max ? new Date(max.getTime()) : new Date();
    }catch(_e){
      return new Date();
    }
  }

  // -------------------------
  // Période (informatif : mois/année) — sélection utilisateur
  // -------------------------
  function getSelectedYM(){
    try{
      const raw = localStorage.getItem(LS_OBJ_YM_KEY);
      if(!raw) return null;
      const o = JSON.parse(raw);
      const y = +o.y, m = +o.m;
      if(!Number.isFinite(y) || !Number.isFinite(m) || m<1 || m>12) return null;
      return { y, m };
    }catch(_e){
      return null;
    }
  }

  function setSelectedYM(ym){
    try{
      if(!ym){ localStorage.removeItem(LS_OBJ_YM_KEY); return; }
      localStorage.setItem(LS_OBJ_YM_KEY, JSON.stringify({ y:+ym.y, m:+ym.m }));
    }catch(_e){}
  }

  function getTxYearRange(){
    // bornes années sur l'historique CSV (getTx)
    try{
      const tx = getTx();
      let minY = null, maxY = null;
      for(const t of tx){
        const dt = parseDateISO(t && (t.dateISO || t.date || ""));
        if(!dt) continue;
        const y = dt.getFullYear();
        if(minY==null || y < minY) minY = y;
        if(maxY==null || y > maxY) maxY = y;
      }
      if(minY==null || maxY==null) return null;
      return { minY, maxY };
    }catch(_e){
      return null;
    }
  }

  function wirePeriodPicker(){
    const root = document.getElementById("view-objectifs");
    if(!root) return;

    const mSel = root.querySelector("#objMonthSel");
    const ySel = root.querySelector("#objYearSel");
    const btnNow = root.querySelector("#objYMNow");
    if(!mSel || !ySel) return;

    if(!mSel.__wired){
      mSel.__wired = true;
      mSel.addEventListener("change", ()=>{
        const ym = getSelectedYM() || {};
        ym.m = +mSel.value;
        ym.y = +ySel.value;
        setSelectedYM(ym);
        try{ window.renderObjectifsModule(); }catch(_e){}
      });
    }

    if(!ySel.__wired){
      ySel.__wired = true;
      ySel.addEventListener("change", ()=>{
        const ym = getSelectedYM() || {};
        ym.m = +mSel.value;
        ym.y = +ySel.value;
        setSelectedYM(ym);
        try{ window.renderObjectifsModule(); }catch(_e){}
      });
    }

    if(btnNow && !btnNow.__wired){
      btnNow.__wired = true;
      btnNow.addEventListener("click", (ev)=>{
        ev.preventDefault();
        setSelectedYM(null);
        try{ window.renderObjectifsModule(); }catch(_e){}
      });
    }
  }



// -------------------------
  // Dataset (réalisé)
  // -------------------------
  function getTx(){
    if(window.DataStore && typeof window.DataStore.getTx === "function") return window.DataStore.getTx() || [];
    if(window.state && Array.isArray(window.state.tx)) return window.state.tx;
    return [];
  }

  function getClientStatsMap(){
    // retourne Map clientId -> {medianBasket, ...} si dispo
    if(window.DataStore && typeof window.DataStore.snapshot === "function"){
      try{
        const snap = window.DataStore.snapshot();
        if(snap && snap.clientStats && typeof snap.clientStats.get === "function") return snap.clientStats;
      }catch(_e){}
    }
    return null;
  }

  function buildRealtimeByClient(targetIds, meta){
    meta = meta || {};
    const norm = (s)=>String(s||"").trim().toLowerCase();

    const tx = getTx();

    let maxAny = null;
    for(const t of tx){
      const dt = parseDateISO(t && (t.dateISO || t.date || ""));
      if(!dt) continue;
      if(!maxAny || dt > maxAny) maxAny = dt;
    }

    let forcedYM = null;
    if(meta.targetYM && Number.isFinite(+meta.targetYM.year) && Number.isFinite(+meta.targetYM.month)){
      forcedYM = { y:+meta.targetYM.year, m:+meta.targetYM.month };
    }else if(maxAny){
      forcedYM = { y:maxAny.getFullYear(), m:maxAny.getMonth()+1 };
    }else{
      const d=new Date(); forcedYM = { y:d.getFullYear(), m:d.getMonth()+1 };
    }

    const mkNow = `${forcedYM.y}-${String(forcedYM.m).padStart(2,"0")}`;
    const prev = forcedYM.m===1 ? { y:forcedYM.y-1, m:12 } : { y:forcedYM.y, m:forcedYM.m-1 };
    const mkPrev = `${prev.y}-${String(prev.m).padStart(2,"0")}`;

    const startOfMonth = new Date(forcedYM.y, forcedYM.m-1, 1);
    const endOfMonth = new Date(forcedYM.y, forcedYM.m, 0);
    let now = endOfMonth;
    if(maxAny && maxAny >= startOfMonth && maxAny <= endOfMonth) now = maxAny;
    const dayCut = now.getDate();

    const keyToId = new Map();
    for(const id of targetIds){
      const raw = String(id);
      const k = norm(raw);
      if(k) keyToId.set(k, raw);
    }

    const by = new Map();
    for(const id of targetIds){
      by.set(String(id), { caM:0, cmdM:0, caM1:0, cmdM1:0, firstDate:null });
    }

    for(const t of tx){
      if(!t) continue;
      const k1 = norm(t.clientCanon);
      const k2 = norm(t.clientNorm);
      const k3 = norm(t.rawClient);

      const canonId = keyToId.get(k1) || keyToId.get(k2) || keyToId.get(k3);
      if(!canonId) continue;

      const dt = parseDateISO(t.dateISO || t.date || "");
      if(!dt) continue;

      const amount = Number(t.amountHT);
      const rec = by.get(canonId);
      if(!rec) continue;

      if(!rec.firstDate || dt < rec.firstDate) rec.firstDate = dt;

      const mk = monthKey(dt);
      const dday = dt.getDate();

      if(mk === mkNow){
        if(Number.isFinite(amount)) rec.caM += amount;
        rec.cmdM += 1;
      }else if(mk === mkPrev && dday <= dayCut){
        if(Number.isFinite(amount)) rec.caM1 += amount;
        rec.cmdM1 += 1;
      }
    }

    by.__objYM = forcedYM;
    by.__objNow = now;
    return by;
  }

  // -------------------------
  // UI Helpers
  // -------------------------
  function iconUse(id){ return `<svg width="46" height="46" viewBox="0 0 24 24" fill="none" style="opacity:.95;"><use href="${id}"></use></svg>`; }

  function gaugeSVG(pct, statusKey){
    // Cadran néon (HUD ultra-léger) : arc fin + glow doux
    pct = clampPct(pct);

    const strokeVar = statusKey==="good" ? "var(--good)" : statusKey==="warn" ? "var(--warn)" : "var(--bad)";

    const cx = 100, cy = 100, r = 78;

    // Arc 270° : start -225°, end 45°
    const startA = (-225) * Math.PI/180;
    const endA   = (45) * Math.PI/180;

    const sx = cx + r * Math.cos(startA);
    const sy = cy + r * Math.sin(startA);
    const ex = cx + r * Math.cos(endA);
    const ey = cy + r * Math.sin(endA);

    const arcPath = `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;

    const arcLen = 2 * Math.PI * r * (270/360);
    const dash = (pct/100) * arcLen;
    const gap = arcLen - dash;

    // Ticks discrets (instrumentation)
    let ticks = "";
    for(let i=0;i<=10;i++){
      const tp = i/10;
      const ta = (-225 + 270*tp) * Math.PI/180;
      const r1 = r+1;
      const r2 = r-8;
      const x1 = cx + r1*Math.cos(ta);
      const y1 = cy + r1*Math.sin(ta);
      const x2 = cx + r2*Math.cos(ta);
      const y2 = cy + r2*Math.sin(ta);
      ticks += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" class="obj-gauge-tick lite"></line>`;
    }

    return `
      <svg class="obj-gauge" viewBox="0 0 200 200" width="320" height="320" aria-hidden="true">
        <defs>
          <filter id="objGlowSoft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blur"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
        </defs>

        <!-- Arc base -->
        <path d="${arcPath}" class="obj-gauge-arc-bg"></path>

        <!-- Arc glow (dessous) -->
        <path d="${arcPath}" class="obj-gauge-arc-glow"
          style="stroke:${strokeVar}; stroke-dasharray:${dash} ${gap}; filter:url(#objGlowSoft);"></path>

        <!-- Arc principal -->
        <path d="${arcPath}" class="obj-gauge-arc-val"
          style="stroke:${strokeVar}; stroke-dasharray:${dash} ${gap};"></path>

        <!-- Ticks -->
        <g class="obj-gauge-ticks">${ticks}</g>

        <!-- Centre (transparent) -->
        <circle cx="${cx}" cy="${cy}" r="56" class="obj-gauge-center"></circle>
      </svg>
    `;
  }

  function barHTML(pct, statusKey){
    pct = clampPct(pct);
    const bg = statusKey==="good" ? "var(--good)" : statusKey==="warn" ? "var(--warn)" : "var(--bad)";
    return `
      <div class="obj-bar">
        <div class="obj-bar-fill" style="width:${pct}%; background:${bg};"></div>
      </div>
    `;
  }

  function statusPill(st){
    const bg = st.key==="good" ? "rgba(16,185,129,0.14)" : st.key==="warn" ? "rgba(255,171,64,0.14)" : "rgba(255,90,107,0.14)";
    const bd = st.key==="good" ? "rgba(16,185,129,0.35)" : st.key==="warn" ? "rgba(255,171,64,0.35)" : "rgba(255,90,107,0.35)";
    return `<span class="obj-pill" style="background:${bg}; border-color:${bd};">${st.label}</span>`;
  }

  function diagText(caPct, cmdPct, timePct){
    const caOK = caPct >= timePct;
    const cmdOK = cmdPct >= timePct;
    if(caOK && cmdOK) return "Bon rythme CA et fréquence.";
    if(caOK && !cmdOK) return "Bon rythme CA, mais retard sur le volume de commandes.";
    if(!caOK && cmdOK) return "Bon rythme commandes, mais retard sur le CA.";
    return "Retard CA et fréquence : priorisation urgente.";
  }

  function openClientAction(clientId){
    // Pont vers Cockpit si disponible
    if(typeof window.openClientDetail === "function"){
      try{ window.openClientDetail(String(clientId)); return; }catch(_e){}
    }
    if(typeof window.__openClientFromALFRED === "function"){
      try{ window.__openClientFromALFRED(String(clientId)); return; }catch(_e){}
    }
    alert("Ouverture fiche client indisponible sur cette build.");
  }
  window.__objectifsOpenClient = openClientAction;

  // -------------------------
  // Rendu principal
  // -------------------------
  window.renderObjectifsModule = function(){
    const container = document.getElementById("objectifsContent");
    if(!container) return;

    // header always present
    const meta = imported ? {
      datasetHash: imported.datasetHash || "",
      createdAt: imported.createdAt || "",
      period: imported.period || "M",
      refYM: imported.refMonth || null,
      targetYM: imported.targetMonth || null,
      selectedCommercial: imported.selectedCommercial || "",
      newClientsTarget: Number(imported.newClientsCount||0),
      clients: Array.isArray(imported.clients) ? imported.clients : []
    } : null;

    // Prepare targets
    const targets = meta ? meta.clients.filter(c => c && Number(c.caCible) > 0) : [];
    const effectiveNow = getEffectiveNow();

    // Période analysée (informatif) : sélection utilisateur > export (targetMonth) > dataset
    const selYM = getSelectedYM();
    const exportYM = (meta && meta.targetYM && Number.isFinite(+meta.targetYM.year) && Number.isFinite(+meta.targetYM.month))
      ? { y:+meta.targetYM.year, m:+meta.targetYM.month }
      : null;

    const fallbackYM = exportYM || { y: effectiveNow.getFullYear(), m: effectiveNow.getMonth()+1 };
    const ym = selYM || fallbackYM;

    // Référentiel "temps" : mois courant uniquement (sinon mois terminé => 100%)
    const sysNow = new Date();
    const isCurrentMonth = (+ym.y === sysNow.getFullYear() && +ym.m === (sysNow.getMonth()+1));
    const timePct = isCurrentMonth ? getMonthProgress() : 100;
    const timePctR = Math.round(timePct);

    const targetIds = targets.map(c => String(c.id));
    const targetIdSet = new Set(targetIds);
    const statsMap = getClientStatsMap();

    // Réalisé par client sur le mois choisi (force YM, ne dépend pas de l'export)
    const rt = targetIds.length ? buildRealtimeByClient(targetIds, { targetYM:{ year:+ym.y, month:+ym.m } }) : new Map();

    // Compute portfolio objective (cibles export) + realized (CA total du mois analysé, tous clients)
    let objPortfolio = 0;
    for(const c of targets){
      const v = Number(c.caCible);
      if(Number.isFinite(v)) objPortfolio += v;
    }

    const rangeN = ymRangeISO(+ym.y, +ym.m);

    // CA total du mois sur tout le dataset runtime courant
    // (donc tout le portefeuille visible après filtres globaux app, sans se limiter aux clients ciblés/exportés)
    let realPortfolio = 0;
    const statsAll = new Map(); // client -> {hasN,lastBeforeISO}
    for(const t of getTx()){
      if(!t || !t.dateISO || !Number.isFinite(Number(t.amountHT))) continue;
      const iso = String(t.dateISO);
      const c = String(t.clientCanon || (t.rawClient||"").toString().trim() || "(Client non renseigné)");

      if(!statsAll.has(c)) statsAll.set(c, {hasN:false, lastBeforeISO:null});
      const o = statsAll.get(c);

      if(iso < rangeN.s){
        if(!o.lastBeforeISO || iso > o.lastBeforeISO) o.lastBeforeISO = iso;
        continue;
      }
      if(iso >= rangeN.s && iso <= rangeN.e){
        realPortfolio += Number(t.amountHT);
        o.hasN = true;
      }
    }

    const pctPortfolio = objPortfolio>0 ? (realPortfolio/objPortfolio)*100 : 0;
    const stPortfolio = getPacingStatus(pctPortfolio, timePct);

    // New clients (réalisé) : clients ayant des tx dans le mois ET aucune tx avant le mois
    let realNew = 0;
    for(const [_name,o] of statsAll){
      if(o.hasN && !o.lastBeforeISO) realNew += 1;
    }
    const objNew = meta ? meta.newClientsTarget : 0;
    const pctNew = objNew>0 ? (realNew/objNew)*100 : 0;
    const stNew = getPacingStatus(pctNew, timePct);


// Commandes (Fréquence) : réalisées vs cibles globales
    let objCmd = 0, realCmd = 0;
    for(const c of targets){
      const id = String(c.id);
      const rec = rt.get(id) || {cmdM:0};
      realCmd += (Number(rec.cmdM)||0);

      // Source unique de vérité : la colonne CMD exportée depuis Studio
      const cmdTarget = Math.max(0, Math.round(Number(c.cmd) || 0));
      objCmd += cmdTarget;
    }

    const pctCmd = objCmd>0 ? (realCmd/objCmd)*100 : 0;
    const stCmd = getPacingStatus(pctCmd, timePct);

    // Radar (clients rouges)
    const radar = [];
    for(const c of targets){
      const id=String(c.id);
      const cible = Number(c.caCible)||0;
      const rec = rt.get(id) || {caM:0, cmdM:0, caM1:0, cmdM1:0};
      const ca = Number(rec.caM)||0;

      const caPct = cible>0 ? (ca/cible)*100 : 0;
      const st = getPacingStatus(caPct, timePct);
      if(st.key !== "bad") continue;

      const gap = Math.max(0, cible - ca);
      radar.push({ id, name: c.name||id, gap, cible, ca, st });
    }
    radar.sort((a,b)=>b.gap-a.gap);

    // Synthèse "reste à sécuriser"
    let resteGlobal = 0;
    for(const c of targets){
      const id=String(c.id);
      const cible = Number(c.caCible)||0;
      const rec = rt.get(id);
      const ca = rec ? (Number(rec.caM)||0) : 0;
      if(ca < cible) resteGlobal += (cible - ca);
    }

    // Render
    container.innerHTML = `
      <div class="obj-topbar obj-topbar--flat">
        <div class="obj-title">Mes Objectifs</div>

        <div class="obj-topbar-meta small muted">
          ${meta ? `
            <span><b>Import</b> : ${targets.length} clients • période ${meta.period}${meta.selectedCommercial ? ` • Commercial : ${meta.selectedCommercial}` : ``}</span>
            ${meta.datasetHash ? `<span>• Dataset: <span class="obj-mono">${meta.datasetHash}</span></span>` : ``}
            ${meta.createdAt ? `<span>• Export: ${meta.createdAt}</span>` : ``}
          ` : `<span>Aucun fichier .alfred importé.</span>`}
        </div>

        <div class="obj-timebar">
          ${(() => {
            const bt = getBusinessTime();
            const pct = Math.round(bt.pct);
            return `
              <div class="obj-timebar-top">
                <div class="obj-time-label">Temps restant</div>
                <div class="obj-time-val obj-mono">${bt.remaining} j</div>
              </div>
              <div class="obj-timebar-track" aria-hidden="true">
                <div class="obj-timebar-fill" style="width:${pct}%;"></div>
              </div>
            `;
          })()}
        </div>

        <div class="obj-period" style="display:flex; gap:8px; flex-wrap:nowrap; align-items:center; justify-content:flex-end;">
          ${(() => {
            const yr = getTxYearRange();
            const yMin = yr ? yr.minY : +ym.y;
            const yMax = yr ? yr.maxY : +ym.y;

            let yOpts = "";
            for(let y=yMax; y>=yMin; y--){
              yOpts += `<option value="${y}" ${y===+ym.y ? "selected" : ""}>${y}</option>`;
            }

            let mOpts = "";
            const mNames = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
            for(let m=1; m<=12; m++){
              const label = mNames[m-1];
              mOpts += `<option value="${m}" ${m===+ym.m ? "selected" : ""}>${label}</option>`;
            }

            return `
              <span class="small muted" style="opacity:.9;">Période :</span>
              <select class="ghost" id="objMonthSel" style="padding:6px 9px; border-radius:12px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92); width:auto; min-width:0;">
                ${mOpts}
              </select>
              <select class="ghost" id="objYearSel" style="padding:6px 9px; border-radius:12px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92); width:auto; min-width:0;">
                ${yOpts}
              </select>
              <button class="ghost" id="objYMNow" title="Revenir au mois courant" style="padding:6px 9px; border-radius:12px; white-space:nowrap;">Mois courant</button>
            `;
          })()}
        </div>

        <div class="obj-actions obj-actions--flat">
          <label class="ghost obj-import-btn">
            Import Objectifs
            <input id="objectifsImportFile" type="file" accept=".alfred,application/json" style="display:none">
          </label>
          <button class="ghost obj-clear-btn" onclick="window.__objectifsClear && window.__objectifsClear()">⟲ RAZ</button>
        </div>
      </div>

      <div class="obj-section">
        <div class="obj-section-title">Vision macro</div>
        <div class="obj-gauges-3">
                    ${renderGaugeKPI("Objectif CA (€)", "#i-target", realPortfolio, objPortfolio, stPortfolio, true, "wide")}
          ${renderGaugeKPI("Objectif de Nouveaux Clients (#)", "#i-users", realNew, objNew, stNew, false, "mid")}
          ${renderGaugeKPI("Objectif en nombre de Commandes (#)", "#i-layers", realCmd, objCmd, stCmd, false, "wide")}
        </div>
      </div>

      <div class="obj-section">
        <div class="obj-section-title">Radar opérationnel</div>
        <div class="obj-grid-2">
          ${renderRadarCard(radar, resteGlobal)}
          ${renderSynthCard(resteGlobal, targets.length, radar.length)}
        </div>
      </div>

      <div class="obj-section">
        <div class="obj-section-title">Action — Tableau Clients</div>
        ${renderClientTable(targets, rt, statsMap, timePct, ym)}
      </div>
    `;

    wireImportUI();
    wirePeriodPicker();
    wireRowToggles();
    wireActionCheckboxes();
    wireExportActions();
    wireSyntheseButtons();
  };

  function renderGaugeKPI(title, iconId, currentVal, maxVal, st, isCurrency=true, variant="wide"){
    const pct = maxVal>0 ? (Number(currentVal||0)/Number(maxVal||0))*100 : 0;
    const v = isCurrency ? fmtEUR(currentVal) : String(Math.round(Number(currentVal||0)));
    const m = isCurrency ? fmtEUR(maxVal) : String(Math.round(Number(maxVal||0)));

    return `
      <div class="obj-gauge-kpi obj-gauge-kpi--${variant}">
        <div class="obj-gauge-wrap">
          ${gaugeSVG(pct, st.key)}
          <div class="obj-gauge-centertext">
            <div class="obj-gauge-main obj-mono">${v}</div>
            <div class="obj-gauge-sub small muted">Objectif : ${m}</div>
            <div class="obj-gauge-pct obj-mono">${Math.round(pct)}%</div>
          </div>
        </div>

        <div class="obj-gauge-label small muted">${title}</div>
        <div class="obj-gauge-status small muted">${statusPill(st)}</div>
      </div>
    `;
  }

  function renderRadarCard(radar, resteGlobal){
    const items = radar.slice(0, 10).map(r=>{
      return `
        <div class="obj-radar-item">
          <div class="obj-radar-left">
            <div class="obj-radar-name">${escapeHTML(r.name)}</div>
            <div class="obj-radar-sub small muted">Manque: <span class="obj-mono">${fmtEUR(r.gap)}</span> • ${Math.round((r.ca/r.cible)*100)||0}%</div>
          </div>
          <button class="ghost obj-radar-btn" onclick="window.__objectifsOpenClient && window.__objectifsOpenClient('${escapeAttr(r.id)}')">Action</button>
        </div>
      `;
    }).join("");

    return `
      <div class="obj-card obj-radar-card tileGlowRed">
        <div class="obj-radar-head">
          <div>
            <div class="obj-kpi-title">Top retards critiques</div>
            <div class="small muted">Clients 🔴 uniquement • Tri par impact financier</div>
          </div>
          <div class="obj-radar-badge obj-mono">${radar.length}</div>
        </div>
        <div class="obj-radar-list">
          ${items || `<div class="small muted" style="padding:10px;">Aucun retard critique détecté.</div>`}
        </div>
      </div>
    `;
  }

  function renderSynthCard(resteGlobal, nTargets, nBad){
    return `
      <div class="obj-card tileGlowBlue">
        <div class="obj-kpi-title">Synthèse</div>
        <div class="obj-synth-grid">
          <div class="obj-synth-tile">
            <div class="small muted">Reste à sécuriser</div>
            <div class="obj-synth-val obj-mono">${fmtEUR(resteGlobal)}</div>
          </div>
          <div class="obj-synth-tile">
            <div class="small muted">Clients ciblés</div>
            <div class="obj-synth-val obj-mono">${nTargets}</div>
          </div>
          <div class="obj-synth-tile">
            <div class="small muted">Retards critiques</div>
            <div class="obj-synth-val obj-mono">${nBad}</div>
          </div>
        </div>
        <div class="small muted" style="margin-top:10px;"></div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;">
          <button class="ghost obj-export-actions" id="objExportActions">Exporter mes actions commerciales</button>
          <button class="ghost" id="objRefreshActions">Rafraîchir</button>
          <button class="ghost" id="objResetActions" title="Réinitialiser actions">⟲</button>
        </div>
      </div>
    `;
  }

  
  // Tri tableau clients (Mes Objectifs) — état local (pas de refactor global)
  let __objClientSort = { key: "resteEur", dir: "desc" };

  function _objSortArrow(k){
    if(!__objClientSort || __objClientSort.key !== k) return "";
    return (__objClientSort.dir === "asc") ? " ▲" : " ▼";
  }

  function _objSetSort(k){
    if(!k) return;
    if(__objClientSort.key === k){
      __objClientSort.dir = (__objClientSort.dir === "asc") ? "desc" : "asc";
    }else{
      __objClientSort.key = k;
      // par défaut: desc pour les métriques, asc pour le nom
      __objClientSort.dir = (k === "name") ? "asc" : "desc";
    }
  }

  function _objSortRows(rows){
    const k = __objClientSort && __objClientSort.key ? __objClientSort.key : null;
    if(!k) return rows;

    const dirMul = (__objClientSort.dir === "asc") ? 1 : -1;

    const numKeys = new Set(["cible","ca","caPct","cmd","cmdTarget","cmdPct","resteEur","resteCmd","trendEur"]);
    const strKeys = new Set(["name"]);

    rows.sort((a,b)=>{
      const av = a[k];
      const bv = b[k];

      // NC / null en bas
      const aNull = (av==null || av==="" || (typeof av==="number" && !Number.isFinite(av)));
      const bNull = (bv==null || bv==="" || (typeof bv==="number" && !Number.isFinite(bv)));
      if(aNull && bNull) return 0;
      if(aNull) return 1;
      if(bNull) return -1;

      if(numKeys.has(k)){
        return dirMul * ((Number(av)||0) - (Number(bv)||0));
      }
      if(strKeys.has(k)){
        return dirMul * String(av).localeCompare(String(bv), "fr", {sensitivity:"base"});
      }
      return 0;
    });

    return rows;
  }

  function _objClientTxHistoryHTML(clientId, ym){
    try{
      if(!clientId || !ym || !ym.y || !ym.m) return `<div class="small muted">—</div>`;
      const range = ymRangeISO(+ym.y, +ym.m);
      const tx = getTx();

      const norm = (s)=>String(s||"").trim().toLowerCase();
      const key = norm(clientId);

      // filtre (même logique d'identification que buildRealtimeByClient)
      const rows = [];
      for(const t of tx){
        if(!t || !t.dateISO) continue;
        const iso = String(t.dateISO);
        if(iso < range.s || iso > range.e) continue;

        const k1 = norm(t.clientCanon);
        const k2 = norm(t.clientNorm);
        const k3 = norm(t.rawClient);

        if(k1!==key && k2!==key && k3!==key) continue;

        const amt = Number(t.amountHT);
        rows.push({ iso, amt: (Number.isFinite(amt)? amt : null) });
      }

      rows.sort((a,b)=> String(b.iso).localeCompare(String(a.iso)));

      if(!rows.length) return `<div class="small muted">Aucune commande sur la période.</div>`;

      const max = 20;
      const shown = rows.slice(0, max);

      const trs = shown.map((r,i)=>{ 
        const bg = (i%2===0) ? "rgba(255,255,255,0.018)" : "rgba(255,255,255,0.038)";
        const fr = (function(iso){
          const s = String(iso||"");
          if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
            const y=s.slice(0,4), m=s.slice(5,7), d=s.slice(8,10);
            return `${d}/${m}/${y}`;
          }
          return s;
        })(r.iso);
        return `
        <tr>
          <td class="obj-mono" style="padding:4px 6px; border-bottom:1px solid rgba(255,255,255,0.08); background:${bg};">${escapeHTML(fr)}</td>
          <td class="obj-mono" style="padding:4px 6px; border-bottom:1px solid rgba(255,255,255,0.08); text-align:right; background:${bg};">${r.amt!=null ? fmtEUR(r.amt) : "—"}</td>
        </tr>
      `;
      }).join("");

      const more = rows.length > max ? `<div class="small muted" style="margin-top:6px;">+${rows.length - max} autres lignes…</div>` : ``;

            return `
        <div class="obj-tx-wrap" style="margin-top:8px;">
          <div class="small muted">(${rows.length} lignes)</div>
          <div style="margin-top:6px; overflow-y:auto; overflow-x:hidden; max-height:240px; border:1px solid rgba(255,255,255,0.08); border-radius:10px;">
            <table style="width:100%; border-collapse:collapse; font-size:12px; table-layout:fixed;">
              <thead>
                <tr>
                  <th style="width:44%; text-align:left; padding:6px; border-bottom:1px solid rgba(255,255,255,0.08); white-space:nowrap;">Date</th>
                  <th style="width:56%; text-align:right; padding:6px; border-bottom:1px solid rgba(255,255,255,0.08); white-space:nowrap;">CA</th>
                </tr>
              </thead>
              <tbody>
                ${trs}
              </tbody>
            </table>
          </div>
          ${more}
        </div>
      `;
    }catch(_e){
      return `<div class="small muted">—</div>`;
    }
  }

  function renderClientTable(targets, rt, statsMap, timePct, ym){
    if(!targets.length){
      return `<div class="obj-empty">Importe un fichier .alfred pour afficher les clients.</div>`;
    }

    // build rows with computed status
    const rows = [];
    for(const c of targets){
      const id = String(c.id);
      const cible = Number(c.caCible)||0;
      const rec = rt.get(id) || {caM:0, cmdM:0, caM1:0, cmdM1:0};
      const ca = Number(rec.caM)||0;
      const cmd = Number(rec.cmdM)||0;

      const caPct = cible>0 ? (ca/cible)*100 : 0;
      const st = getPacingStatus(caPct, timePct);

      // Source unique de vérité : la colonne CMD exportée depuis Studio
      const cmdTarget = Math.max(0, Math.round(Number(c.cmd) || 0));
      const cmdPct = cmdTarget>0 ? (cmd/cmdTarget)*100 : 0;

      const resteEur = Math.max(0, cible - ca);
      const resteCmd = Math.max(0, cmdTarget - cmd);

      const trendEur = (Number(rec.caM)||0) - (Number(rec.caM1)||0);

      rows.push({
        id, name: c.name||id,
        cible, ca, caPct, cmd, cmdTarget, cmdPct,
        resteEur, resteCmd, trendEur,
        st
      });
    }

    // tri : défaut (sévérité puis reste€), sinon tri utilisateur (sur toute la liste)
    const sev = (k)=> k==="bad" ? 2 : k==="warn" ? 1 : 0;

    if(!__objClientSort || !__objClientSort.key){
      rows.sort((a,b)=> (sev(b.st.key)-sev(a.st.key)) || (b.resteEur - a.resteEur) || (a.name||"").localeCompare(b.name||""));
    }else{
      // tri utilisateur = priorité absolue (pas de regroupement "À surveiller")
      _objSortRows(rows);
    }

    const head = `
      <div class="obj-table-head">
        <div class="obj-th obj-th-sort" data-obj-sort="name">Client${_objSortArrow("name")}</div>
        <div class="obj-th obj-hide-sm">Action commerciale</div>
        <div class="obj-th obj-th-sort" data-obj-sort="cible">Cible${_objSortArrow("cible")}</div>
        <div class="obj-th obj-th-sort" data-obj-sort="ca">CA M${_objSortArrow("ca")}</div>
        <div class="obj-th obj-hide-sm obj-th-sort" data-obj-sort="caPct">Objectif de CA${_objSortArrow("caPct")}</div>
        <div class="obj-th obj-th-sort" data-obj-sort="cmd">Nb Cmd${_objSortArrow("cmd")}</div>
        <div class="obj-th obj-hide-sm obj-th-sort" data-obj-sort="cmdPct">Objectif de Cmd${_objSortArrow("cmdPct")}</div>
        <div class="obj-th obj-th-sort" data-obj-sort="resteEur">Reste (€)${_objSortArrow("resteEur")}</div>
        <div class="obj-th"></div>
      </div>
    `;

    const body = rows.map(r=>{
      return `
        <div class="obj-row ${r.st.glow}" data-obj-row="${escapeAttr(r.id)}">
          <div class="obj-row-main">
            <div class="obj-row-client">
              <div class="obj-row-name"><span class="obj-client-link" data-client="${escapeAttr(r.name)}">${escapeHTML(r.name)}</span></div>
              <div class="small muted">${statusPill(r.st)}</div>
            </div>

            <div class="obj-cell obj-cell--check obj-hide-sm"><input type="checkbox" class="obj-action-check" data-obj-actioncheck="${escapeAttr(r.id)}" ${actions && actions[r.id] ? "checked" : ""}></div>

            <div class="obj-cell obj-cell--cible obj-mono obj-center">${fmtEUR(r.cible)}</div>
            <div class="obj-cell obj-cell--cam obj-mono obj-center">${fmtEUR(r.ca)}</div>

            <div class="obj-cell obj-cell--pacing obj-hide-sm">${barHTML((r.cible>0 ? (r.ca/r.cible)*100 : 0), r.st.key)}<div class="small muted obj-mono obj-sub">${Math.round(r.caPct)}%</div></div>

            <div class="obj-cell obj-cell--nbcmd obj-mono obj-center">${r.cmd}</div>

            <div class="obj-cell obj-cell--pacing obj-hide-sm">${barHTML((r.cmdTarget>0 ? (r.cmd/r.cmdTarget)*100 : 0), getPacingStatus(r.cmdPct, timePct).key)}<div class="small muted obj-mono obj-sub">${Math.round(r.cmdPct)}% — Objectif fixé : ${r.cmdTarget}</div></div>

            <div class="obj-cell obj-cell--reste obj-mono obj-center">${fmtEUR(r.resteEur)}</div>

            <div class="obj-cell obj-cell--btn"><button class="ghost obj-row-btn" data-obj-open="${escapeAttr(r.id)}">Détails</button>
            </div>
          </div>

          <div class="obj-row-detail" data-obj-detail="${escapeAttr(r.id)}" hidden>
            <div class="obj-detail-grid">
              <div class="obj-detail-box">
                <div class="small muted">Historique des commandes (CA du client)</div>
                <div class="small muted" style="margin-top:4px;">Période : ${escapeHTML(String(ym && ym.m ? ym.m : ""))}/${escapeHTML(String(ym && ym.y ? ym.y : ""))}</div>
                ${_objClientTxHistoryHTML(r.id, ym)}
              </div>
              <div class="obj-detail-box">
                <div class="small muted">Reste à faire</div>
                <div class="obj-mono" style="margin-top:6px; font-size:18px; font-weight:950;">${fmtEUR(r.resteEur)} • ${r.resteCmd} cmd</div>
              </div>
              <div class="obj-detail-box">
                <div class="small muted">Tendance M-1 (à date)</div>
                <div class="obj-mono" style="margin-top:6px; font-size:18px; font-weight:950;">
                  ${fmtEUR(r.trendEur)}
                </div>
                <div class="small muted" style="margin-top:4px;">(CA M - CA M-1 sur la même date)</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="obj-table obj-table--clients">
        ${head}
        <div class="obj-table-body">${body}</div>
      </div>
    `;
  }

  function wireActionCheckboxes(){
    $$(".obj-action-check").forEach(cb=>{
      if(cb.__wired) return;
      cb.__wired = true;
      cb.addEventListener("change", ()=>{
        const id = cb.getAttribute("data-obj-actioncheck");
        if(!id) return;
        if(cb.checked) actions[id] = 1;
        else delete actions[id];
        saveActions();
      });
    });
  }

  function exportActionsCommercialesXLS(){
    try{
      const keys = actions ? Object.keys(actions).filter(k=>actions[k]) : [];
      if(!keys.length){
        alert("Aucune action commerciale sélectionnée (aucune case cochée).");
        return;
      }

      // Map rapide des cibles importées
      const targets = (imported && Array.isArray(imported.clients)) ? imported.clients : [];
      const byId = new Map(targets.map(c=>[String(c.id), c]));

      // Réalisé (CA/commandes) sur le mois courant
      const meta = (imported && imported.meta) ? imported.meta : {};
      const rt = buildRealtimeByClient(keys, meta.targetYM ? { targetYM: meta.targetYM } : null);
      const statsMap = getClientStatsMap();

      const cols = [
        {k:"name", label:"Client"},
        {k:"segment", label:"Segment"},
        {k:"cible", label:"Objectif CA (€)"},
        {k:"ca", label:"CA en cours (€)"},
        {k:"cmd", label:"Nombre de commandes"},
        {k:"reste", label:"Reste (€)"},
        // Colonnes futures (si présentes)
        {k:"phone", label:"Téléphone"},
        {k:"email", label:"Email"},
        {k:"address", label:"Adresse"},
        {k:"margin", label:"Marge"}
      ];

      const rows = keys.map(id=>{
        const t = byId.get(String(id)) || {};
        const rec = rt.get(String(id)) || {caM:0, cmdM:0};
        const cible = Number(t.caCible)||0;
        const ca = Number(rec.caM)||0;
        const cmd = Number(rec.cmdM)||0;
        const reste = Math.max(0, cible - ca);

        // champs optionnels : on accepte plusieurs alias possibles
        const phone = t.phone || t.telephone || t.tel || t.mobile || "";
        const email = t.email || t.mail || "";
        const address = t.address || t.adresse || "";
        const margin = t.margin || t.marge || "";

        return {
          name: t.name || String(id),
          segment: t.segment || t.seg || "",
          cible: Math.round(cible),
          ca: Math.round(ca),
          cmd: Math.round(cmd),
          reste: Math.round(reste),
          phone, email, address, margin
        };
      });

      // HTML Excel (.xls) propre
      const escape = (s)=>String(s==null?"":s)
        .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

      const thead = "<tr>" + cols.map(c=>`<th style="border:1px solid #ddd; background:#f3f3f3; padding:6px; text-align:left;">${escape(c.label)}</th>`).join("") + "</tr>";
      const tbody = rows.map(r=>{
        return "<tr>" + cols.map(c=>{
          const v = r[c.k];
          return `<td style="border:1px solid #ddd; padding:6px;">${escape(v)}</td>`;
        }).join("") + "</tr>";
      }).join("");

      const stamp = new Date();
      const fn = `actions_commerciales_${stamp.getFullYear()}-${String(stamp.getMonth()+1).padStart(2,"0")}-${String(stamp.getDate()).padStart(2,"0")}.xls`;

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
        <table>${thead}${tbody}</table>
      </body></html>`;

      const blob = new Blob([html], {type:"application/vnd.ms-excel;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fn;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
    }catch(e){
      alert("Export impossible.");
    }
  }

  function wireExportActions(){
    const btn = document.getElementById("objExportActions");
    if(!btn || btn.__wired) return;
    btn.__wired = true;
    btn.addEventListener("click", exportActionsCommercialesXLS);
  }


  function wireRefreshActions(){
    const btn = document.getElementById("objRefreshActions");
    if(!btn || btn.__wired) return;
    btn.__wired = true;
    btn.addEventListener("click", ()=>{ try{ renderObjectifsModule(); }catch(e){} });
  }

  function wireResetActions(){
    const btn = document.getElementById("objResetActions");
    if(!btn || btn.__wired) return;
    btn.__wired = true;
    btn.addEventListener("click", ()=>{
      try{
        if(window.ActionsCommerciales && window.ActionsCommerciales.getSelected){
          const all = window.ActionsCommerciales.getSelected();
          all.forEach(n => window.ActionsCommerciales.set(n,false));
        }
      }catch(e){}
      try{ renderObjectifsModule(); }catch(e){}
    });
  }

  
    function wireSyntheseButtons(){
    if(window.__objSyntheseButtonsBound) return;
    const root = document.getElementById("view-objectifs");
    if(!root) return;
    window.__objSyntheseButtonsBound = true;

    root.addEventListener("click", (ev)=>{
      const t = ev.target;
      if(!t) return;

            const btnReset = t.closest ? t.closest("#objResetActions") : null;
      if(btnReset){
        ev.preventDefault();

        // Mes objectifs : la source de vérité = "actions" (ids) + LS_ACTIONS_KEY
        try{
          actions = {};
          try{ saveActions(); }catch(_e){}
        }catch(e){}

        // Safety: si jamais une UI réutilise ActionsCommerciales (noms), on reset aussi (sans dépendance)
        try{
          if(window.ActionsCommerciales && window.ActionsCommerciales.getSelected){
            const all = window.ActionsCommerciales.getSelected();
            all.forEach(n => window.ActionsCommerciales.set(n,false));
          }
        }catch(e){}

        // Décoche visuel immédiat (robuste même avant re-render)
        try{
          root.querySelectorAll("input.obj-action-check:checked, input.ac-check:checked")
            .forEach(cb => { cb.checked = false; });
        }catch(e){}

        try{ renderObjectifsModule(); }catch(e){}
        return;
      }

      const btnRefresh = t.closest ? t.closest("#objRefreshActions") : null;
      if(btnRefresh){
        ev.preventDefault();
        try{ renderObjectifsModule(); }catch(e){}
        return;
      }
    });
  }

function wireRowToggles(){
    // details toggle
    $$(".obj-row-btn[data-obj-open]").forEach(btn=>{
      if(btn.__wired) return;
      btn.__wired = true;
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-obj-open");
        const detail = document.querySelector(`[data-obj-detail="${CSS.escape(id)}"]`);
        if(!detail) return;
        const isHidden = detail.hasAttribute("hidden");
        if(isHidden) detail.removeAttribute("hidden");
        else detail.setAttribute("hidden","");
      });
    });

    // click sur le nom du client => cockpit
    $$(".obj-client-link").forEach(a=>{
      if(a.__wired) return;
      a.__wired = true;
      a.style.cursor = "pointer";
      a.addEventListener("click", ()=>{
        const nm = a.getAttribute("data-client");
        if(!nm) return;
        if(typeof window.openClientCockpit === "function") { try{ window.openClientCockpit(nm); return; }catch(_e){} }
        // fallback : ouverture “client detail” si cockpit non dispo
        if(typeof window.openClientDetail === "function") { try{ window.openClientDetail(nm); return; }catch(_e){} }
        // fallback ultime : ancienne action
        try{ openClientAction(nm); }catch(_e){}
      });
    });

    // tri des colonnes (Action — Tableau Clients)
    $$(".obj-table--clients .obj-table-head .obj-th-sort").forEach(h=>{
      if(h.__wired) return;
      h.__wired = true;
      h.style.cursor = "pointer";
      h.title = "Cliquer pour trier (▲/▼)";
      h.addEventListener("click", ()=>{
        const k = h.getAttribute("data-obj-sort");
        if(!k) return;
        _objSetSort(k);
        window.renderObjectifsModule();
      });
    });
  }

  // -------------------------
  // Security helpers

  // -------------------------
  function escapeHTML(s){
    return String(s==null?"":s)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }
  function escapeAttr(s){
    return escapeHTML(s).replace(/`/g,"&#96;");
  }

  // -------------------------
  // Init
  // -------------------------
  loadSaved();
  loadActions();
  if(document.readyState === "complete") window.renderObjectifsModule();
  else window.addEventListener("load", window.renderObjectifsModule);

  document.addEventListener("click", (e)=>{
    if(e.target.closest(".tab")){
      setTimeout(window.renderObjectifsModule, 10);
    }
  });

  window.addEventListener("datasetReady", ()=>{
    try{ window.renderObjectifsModule(); }catch(_e){}
  });

  window.addEventListener("commercialFilterChanged", ()=>{
    try{ window.renderObjectifsModule(); }catch(_e){}
  });

})();