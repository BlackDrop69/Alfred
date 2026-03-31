(function(){
  "use strict";

  const $ = (sel)=>document.querySelector(sel);
  const $$ = (sel)=>Array.from(document.querySelectorAll(sel));

  const fmtEUR = (n)=>{
    try{ return (window.fmtEUR ? window.fmtEUR(n||0) : (Number(n||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR', maximumFractionDigits:0}))); }
    catch(e){ return String(n||0); }
  };
  
  const fmtPct = (n)=>{
    if(n == null || n === "" || !Number.isFinite(+n)) return "—";
    let v = +n;
    if (Math.abs(v) > 3 || v === 0) return (v > 0 ? "+" : "") + v.toFixed(1).replace(".", ",") + " %";
    return (v > 0 ? "+" : "") + (v * 100).toFixed(1).replace(".", ",") + " %";
  };

  const fmtNum = (n)=>{
    if(!Number.isFinite(+n)) return "—";
    return (+n).toFixed(1).replace(".", ",");
  };
  
  const esc = (s)=> String(s==null?"":s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));

  
  function _monthNameFR(m){
    return ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"][m] || String(m);
  }

  function _getRefYM(){
    const tb = (window.__icGetTimebox && window.__icGetTimebox()) || null;
    const iso = tb && tb.asOfISO ? String(tb.asOfISO) : null;
    const d = iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? new Date(iso+"T00:00:00") : new Date();
    return { y: d.getFullYear(), m: d.getMonth()+1 };
  }

  function _getTargetYM(refY, refM, targetM){
    const tm = Number(targetM);
    if(!Number.isFinite(tm) || tm<1 || tm>12) return { y: refY, m: refM };
    const y = (tm < refM) ? (refY + 1) : refY;
    return { y, m: tm };
  }

  function _syncMonthUI(){
    const ref = _getRefYM();
    const refEl = document.getElementById("objRefMonth");
    const mSel = document.getElementById("objTargetMonth");
    const ySel = document.getElementById("objTargetYear");

    if(refEl) refEl.textContent = `${_monthNameFR(ref.m)} ${ref.y}`;

    const saved = _loadStudioTargetYM();

    // Mois (Janvier..Décembre)
    if(mSel){
      if(!mSel.dataset.inited){
        let html = "";
        for(let m=1; m<=12; m++){
          html += `<option value="${m}">${_monthNameFR(m)}</option>`;
        }
        mSel.innerHTML = html;
        mSel.dataset.inited = "1";
      }
      const mm = (Number(model.targetMonth) || (saved && saved.month) || ref.m);
      mSel.value = String(mm);
      model.targetMonth = mm;

      mSel.onchange = () => {
        model.targetMonth = Number(mSel.value) || ref.m;
        const yy = Number(model.targetYear) || (saved && saved.year) || ref.y;
        model.targetYear = yy;
        _saveStudioTargetYM(model.targetMonth, model.targetYear);
      };
    }

    // Années (autour année courante)
    if(ySel){
      if(!ySel.dataset.inited){
        const y0 = ref.y;
        let html = "";
        for(let y=y0-3; y<=y0+3; y++){
          html += `<option value="${y}">${y}</option>`;
        }
        ySel.innerHTML = html;
        ySel.dataset.inited = "1";
      }
      const yy = (Number(model.targetYear) || (saved && saved.year) || ref.y);
      ySel.value = String(yy);
      model.targetYear = yy;

      ySel.onchange = () => {
        model.targetYear = Number(ySel.value) || ref.y;
        const mm = Number(model.targetMonth) || (saved && saved.month) || ref.m;
        model.targetMonth = mm;
        _saveStudioTargetYM(model.targetMonth, model.targetYear);
      };
    }

    if(!saved && Number.isFinite(+model.targetMonth) && Number.isFinite(+model.targetYear)){
      _saveStudioTargetYM(model.targetMonth, model.targetYear);
    }
  }

const model = {
    period: "M",
    targetMonth: null,
    targetYear: null,
    commercial: "ALL",
    gisement: "ALL",
    q: "",
    studioState: new Map(), 
    suggestions: new Map(), 
    newClientsCount: 0,     
    visibleIds: [],
    dataCache: null,
    sortCol: "caM",    
    sortDir: -1,
    frozenOrderIds: null
  };


  // Persist selection "Objectif pour" (mois+année)
  const LS_STUDIO_TARGET_YM = "ALFRED_STUDIO_TARGET_YM_V1";
  function _loadStudioTargetYM(){
    try{
      const raw = localStorage.getItem(LS_STUDIO_TARGET_YM);
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(!obj || !Number.isFinite(+obj.month) || !Number.isFinite(+obj.year)) return null;
      return { month: +obj.month, year: +obj.year };
    }catch(e){ return null; }
  }
  function _saveStudioTargetYM(month, year){
    try{
      localStorage.setItem(LS_STUDIO_TARGET_YM, JSON.stringify({ month:+month, year:+year, savedAt: Date.now() }));
    }catch(e){}
  }


  const LS_STUDIO_COMMERCIAL = "ALFRED_STUDIO_COMMERCIAL_V1";
  function _loadStudioCommercial(){
    try{
      const raw = localStorage.getItem(LS_STUDIO_COMMERCIAL);
      return raw ? String(raw) : "ALL";
    }catch(e){ return "ALL"; }
  }
  function _saveStudioCommercial(v){
    try{ localStorage.setItem(LS_STUDIO_COMMERCIAL, String(v||"ALL")); }catch(e){}
  }

  function _getAllCommercials(){
    const st = __getAppState() || {};
    const txs = Array.isArray(st.txAll) ? st.txAll : (Array.isArray(st.tx) ? st.tx : []);
    const set = new Set();
    for(const t of txs){
      const name = String((t && (t.commercial || t.rawCommercial)) || "").trim();
      if(name) set.add(name);
    }
    return Array.from(set).sort((a,b)=>a.localeCompare(b, 'fr', {sensitivity:'base'}));
  }

  function _syncCommercialUI(){
    const sel = document.getElementById("objCommercial");
    const meta = document.getElementById("objStudioMeta");
    if(!sel) return;

    const options = _getAllCommercials();
    const saved = _loadStudioCommercial();
    const current = (model.commercial && model.commercial !== "ALL") ? String(model.commercial) : saved;
    const safe = (current && current !== "ALL" && options.includes(current)) ? current : "ALL";

    if(!sel.dataset.inited || sel.dataset.count !== String(options.length)){
      let html = `<option value="ALL">Tous les commerciaux</option>`;
      for(const name of options){
        html += `<option value="${esc(name)}">${esc(name)}</option>`;
      }
      sel.innerHTML = html;
      sel.dataset.inited = "1";
      sel.dataset.count = String(options.length);
    }

    sel.value = safe;
    model.commercial = safe;

    sel.onchange = () => {
      model.commercial = String(sel.value || "ALL");
      _saveStudioCommercial(model.commercial);
      model.frozenOrderIds = null;
      __objRender();
    };

    if(meta){
      const scopeLabel = (model.commercial && model.commercial !== "ALL") ? `Commercial : ${model.commercial}` : `Tous les commerciaux`;
      meta.textContent = `${scopeLabel}`;
    }
  }

  function _getStudioClients(){
    const all = _prepareStudioData() || [];
    if(!model.commercial || model.commercial === "ALL") return all;
    return all.filter(c => String(c.commercial||"").trim() === String(model.commercial).trim());
  }

  function __getAppState(){
    try{ if(typeof state!=="undefined" && state) return state; }catch(e){}
    return (window && window.state) ? window.state : null;
  }

  function _getClientSalesMeta(clientName){
    const st = __getAppState() || {};
    const txs = Array.isArray(st.txAll) ? st.txAll : (Array.isArray(st.tx) ? st.tx : []);
    const target = String(clientName||"").trim();
    if(!target || !txs.length) return { commercial:"", marginPct:null };

    let commercial = "";
    let sumMargin = 0;
    let nMargin = 0;

    for(const t of txs){
      if(!t || String(t.clientCanon||"").trim() !== target) continue;
      if(!commercial && t.commercial) commercial = String(t.commercial).trim();
      const m = Number(t.marginPct);
      if(Number.isFinite(m)){
        sumMargin += m;
        nMargin++;
      }
    }
    return { commercial, marginPct: nMargin ? (sumMargin / nMargin) : null };
  }

  // --- L'ASPIRATEUR HORIZON (DOUBLE MOTEUR INFALLIBLE) ---
  function _getHzAuto(cObj){
    const target1 = String(cObj.name||cObj.id||"").trim().toLowerCase();
    const target2 = String(cObj.clientCanon||"").trim().toLowerCase();
    
    let val = null;

    // MOTEUR 1 : La Data (On cherche la variable finale "obj" de l'input Horizon)
    let hzData = [];
    if(window.__hzModel && Array.isArray(window.__hzModel.rows)) hzData = window.__hzModel.rows;
    else if(window.state && window.state.horizonRows) hzData = window.state.horizonRows;
    
    if(hzData.length > 0) {
        let rr = hzData.find(r => {
            const r1 = String(r.name||"").trim().toLowerCase();
            const r2 = String(r.clientCanon||r.c||r.id||"").trim().toLowerCase();
            return r1 === target1 || r2 === target1 || (target2 && (r1 === target2 || r2 === target2));
        });
        
        if(rr) {
            // Priorité absolue à 'obj' (la case input), sinon on tombe sur l'extrapolé
            val = rr.obj !== undefined ? rr.obj : (rr.auto ?? rr.AUTO ?? rr.extrap ?? rr.EXTRAP);
        }
    }

    // MOTEUR 2 : Le DOM (Si le moteur 1 rate, on lit physiquement la case html d'Horizon)
    if(val === null || val === undefined) {
        const hzBody = document.querySelector("#hzMasterBody");
        if(hzBody) {
            const rows = hzBody.querySelectorAll("tr");
            for(let tr of Array.from(rows)) {
                const firstTd = tr.querySelector("td");
                if(firstTd && (firstTd.textContent.toLowerCase().includes(target1) || (target2 && firstTd.textContent.toLowerCase().includes(target2)))) {
                    const input = tr.querySelector("input[data-role='objEur']");
                    if(input && input.value !== "") {
                        val = Number(input.value);
                        break;
                    }
                }
            }
        }
    }

    return Number(val) || 0;
  }

  function _prepareStudioData() {
    if(model.dataCache) return model.dataCache;

    const st = __getAppState() || {};
    const rawClients = (st && Array.isArray(st.clients)) ? st.clients : [];
    
    const selY = document.getElementById("yearSelect");
    const selM = document.getElementById("monthSelect");
    
    let yN = new Date().getFullYear();
    let m = new Date().getMonth() + 1;
    
    const tb = (typeof window.__icGetTimebox === "function") ? window.__icGetTimebox() : null;
    if (tb && tb.asOfISO) {
        yN = parseInt(tb.asOfISO.slice(0,4), 10);
        m = parseInt(tb.asOfISO.slice(5,7), 10);
    }
    
    if (selY && selY.value) yN = parseInt(selY.value, 10);
    if (selM && selM.value) m = parseInt(selM.value, 10);
    
    const yN1 = yN - 1;
    
    const ranges = (typeof window.getALFREDRanges==="function") ? window.getALFREDRanges(yN) : null;
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

    const gs = st.globalStats || {};
    const globalBasket = Number.isFinite(+gs.portfolioMedianBasket) && +gs.portfolioMedianBasket > 0 ? +gs.portfolioMedianBasket : 150;

    const enriched = rawClients.map(c => {
      if(!c || !c.name) return null;
      
      const nm = String(c.name).trim();
      const seg = String(c.segment || "—").trim();
      const alertPilotage = String(c.actionZone || "").trim();
      
      let caM = 0;
      let caM1 = 0;
      
      if(typeof window._sumTxForClientBetween === "function") {
          if (bN)  caM  = window._sumTxForClientBetween(nm, bN.sISO, bN.eISO) || 0;
          if (bN1) caM1 = window._sumTxForClientBetween(nm, bN1.sISO, bN1.eISO) || 0;
      }

      const ecartEur = caM - caM1;
      const pctMax = Number(c.pctOfMax) || 0;
      const pdp = Number(c.penetration) || 0;
      const td = Number(c.tdPct) || 0;
      
      let tfRaw = Number(c.tf) || 0;
      const tf = (Math.abs(tfRaw) < 2 && tfRaw !== 0) ? tfRaw * 100 : tfRaw; 
      
      const freqAnnual = Number.isFinite(+c.frequency) ? +c.frequency : 1;
      const recCalDays = Number.isFinite(+c.recCalDays) ? +c.recCalDays : 0;
      const medianBasket = Number.isFinite(+c.basketAvgHT) && +c.basketAvgHT > 0 ? +c.basketAvgHT : globalBasket;

      const cycleAchat = freqAnnual > 0 ? 365 / freqAnnual : 0;
      const retardJours = recCalDays - cycleAchat;
      
      const isPerdu = seg.toLowerCase().includes("perdu");
      const isOpportunite = !isPerdu && (cycleAchat > 0 && recCalDays >= (cycleAchat * 0.8) && recCalDays <= (cycleAchat * 1.2));

      let diagText = "Actif et régulier";
      let diagColor = "var(--muted)";
      
      if (isPerdu) {
          diagText = "Inactif";
          diagColor = "var(--muted)";
      } else if (cycleAchat > 0 && retardJours > 15) {
          diagText = `Retard d'achat de ${Math.round(retardJours)} jours`;
          diagColor = "#ffcc00"; 
      } else if (isOpportunite) {
          diagText = `🎯 Fenêtre d'achat idéale`;
          diagColor = "var(--accent)"; 
      } else if (td <= -5) {
          diagText = `Baisse du volume de ${Math.abs(Math.round(td))} %`;
          diagColor = "#ff4d4d"; 
      } else if (tf <= -5) {
          diagText = `Fréquence en baisse de ${Math.abs(Math.round(tf))} %`;
          diagColor = "#ff4d4d"; 
      } else if (td >= 5) {
          diagText = `Croissance du volume (+${Math.round(td)} %)`;
          diagColor = "#38d39f"; 
      }

      let gKey = "RESTE";
      if (isPerdu) {
          gKey = "RESTE";
      } else if (alertPilotage.includes("Décrochage") || seg.includes("À risque")) {
          gKey = "RISQUE";
      } else if (isOpportunite) {
          gKey = "OPPORTUNITE";
      } else if (seg.includes("Nouveau")) {
          gKey = "NOUVEAUX";
      } else if (seg.includes("VIP")) {
          gKey = "VIP";
      } else if (td < 0) {
          gKey = "BAISSE";
      }

      const salesMeta = _getClientSalesMeta(nm);

      return {
        id: nm, name: nm, seg, alertPilotage, 
        caM, caM1, ecartEur,
        pctMax, pdp, td, freqAnnual, medianBasket,
        diagText, diagColor, gKey,
        commercial: salesMeta.commercial || "",
        marginPct: salesMeta.marginPct,
        hzAuto: _getHzAuto(c) 
      };
    }).filter(Boolean);

    model.dataCache = enriched;
    return enriched;
  }

  const GISEMENTS = [
    { key:"RISQUE", label:`<span style="display:inline-flex;align-items:center;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ff5d5d;box-shadow:0 0 8px rgba(255,93,93,.5);margin-right:10px;"></span>À risque / Décrochage</span>`, predicate:(c)=> c.gKey === "RISQUE" },
    { key:"OPPORTUNITE", label:`<span style="display:inline-flex;align-items:center;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#6ea8ff;box-shadow:0 0 8px rgba(110,168,255,.5);margin-right:10px;"></span>Opportunité imminente</span>`, predicate:(c)=> c.gKey === "OPPORTUNITE" },
    { key:"NOUVEAUX", label:`<span style="display:inline-flex;align-items:center;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#38bdf8;box-shadow:0 0 8px rgba(56,189,248,.5);margin-right:10px;"></span>Nouveaux clients</span>`, predicate:(c)=> c.gKey === "NOUVEAUX" },
    { key:"VIP", label:`<span style="display:inline-flex;align-items:center;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ffd700;box-shadow:0 0 8px rgba(255,215,0,.5);margin-right:10px;"></span>Clients VIP sains</span>`, predicate:(c)=> c.gKey === "VIP" },
    { key:"BAISSE", label:`<span style="display:inline-flex;align-items:center;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ffcc66;box-shadow:0 0 8px rgba(255,204,102,.5);margin-right:10px;"></span>En baisse d'activité</span>`, predicate:(c)=> c.gKey === "BAISSE" },
    { key:"RESTE", label:`<span style="display:inline-flex;align-items:center;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#38d39f;box-shadow:0 0 8px rgba(56,211,159,.5);margin-right:10px;"></span>Le reste des clients</span>`, predicate:(c)=> c.gKey === "RESTE" } 
  ];

  // --- UI: Glow color per gisement (shared with Horizon) ---
  function __studioGlowClassForGisement(key){
    const k = String(key||"").toUpperCase();
    if(k === "RISQUE") return "tileGlowRed";
    if(k === "BAISSE") return "tileGlowOrange";
    if(k === "OPPORTUNITE") return "tileGlowBlue";
    if(k === "NOUVEAUX") return "tileGlowBlue";
    if(k === "VIP") return "tileGlowPurple";
    if(k === "RESTE") return "tileGlowGreen";
    return "tileGlowBlue";
  }


  function _renderGisements(clients){
    const host = $("#objGisementsHost");
    if(!host) return;

    let html = `<div style="margin-top:10px; margin-bottom:12px; font-weight:950; text-transform:uppercase; color:var(--muted); font-size:11px;">Gisements (Exclusifs)</div>`;
    
    for(const g of GISEMENTS){
      const gClients = clients.filter(g.predicate);
      const totalCount = gClients.length;
      if(totalCount === 0 && g.key !== "RESTE") continue;
      
      const activeCount = gClients.filter(c => {
        const s = model.studioState.get(c.id);
        return !!s && Number(s.caCible) > 0;
      }).length;
      const hasTarget = activeCount > 0;
      const isOn = (model.gisement === g.key);
      
      let bg = "transparent";
      let border = "1px solid var(--stroke)";
      let color = "var(--text)";
      let countColor = "var(--muted)";
      let labelDisplay = hasTarget ? `${activeCount}/${totalCount}` : totalCount;

      if (hasTarget) {
          bg = "rgba(56, 211, 159, 0.1)"; 
          border = "1px solid rgba(56, 211, 159, 0.4)"; 
          color = "#38d39f";
          countColor = "#38d39f";
      }
      
      if (isOn) {
          bg = "rgba(110,168,255,.15)";
          border = "1px solid rgba(110,168,255,.4)";
          color = "#fff";
          countColor = "#fff";
      }

      let separator = "";
      if(g.key === "RESTE") {
          separator = `<div style="margin: 20px 0 10px 0; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 15px; font-weight:950; text-transform:uppercase; color:var(--muted); font-size:11px;">Portefeuille</div>`;
          if(!hasTarget && !isOn) border = "1px dashed var(--stroke)";
      }
      
      html += `${separator}<button class="ghost kpi clickable ${__studioGlowClassForGisement(g.key)}${(hasTarget || isOn) ? ' is-on' : ''}" data-g="${esc(g.key)}" style="padding:10px 12px; border-radius:8px; background:${bg}; border:${border}; color:${color}; font-weight:900; display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; width:100%; text-align:left; cursor:pointer; transition:all 0.2s;">
        ${g.label}
        <span class="small" style="color:${countColor}; font-weight:950; font-size:12px;">${labelDisplay}</span>
      </button>`;
    }

    host.innerHTML = html;
    host.onclick = (ev)=>{
      const btn = ev.target && ev.target.closest ? ev.target.closest("button[data-g]") : null;
      if(btn) {
        const clickedKey = btn.getAttribute("data-g");
        if(model.gisement === clickedKey) model.gisement = "ALL";
        else model.gisement = clickedKey;
        __objRender();
      }
    };
  }

  function __objApplyLayoutTweaks(){
    const view = $("#view-objectifs-studio");
    if(!view) return;

    view.style.display = "grid";
    view.style.gridTemplateColumns = "240px 1fr"; 
    view.style.gap = "20px";

    const mainWrap = view.querySelector('div[style*="height:calc"]');
    if(mainWrap) {
        mainWrap.style.height = "auto";
        mainWrap.style.maxHeight = "none";
        mainWrap.style.overflow = "visible";
    }

    let topBar = $("#objPanierBar");
    if(!topBar) {
        topBar = document.createElement("div");
        topBar.id = "objPanierBar";
        const header = view.querySelector("#main-header");
        if(header) header.insertAdjacentElement("afterend", topBar);
        else view.insertBefore(topBar, view.firstChild);
    }
    topBar.style.cssText = "grid-column: 1 / -1; width:100%; display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:15px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.05); padding:15px; border-radius:12px; margin-bottom:20px; align-items:center;";

    $$('button').forEach(btn => {
        const text = btn.textContent || "";
        if(text.includes("Report M-1") || text.includes("Report M")) {
            btn.textContent = "Report Réf";
            btn.onclick = window.__objReportMRef;
        }
        else if(text.includes("Suggestion")) {
            // Libellé unifié (comme Horizon) : active toutes les suggestions en objectifs
            btn.textContent = "Suggestion d'objectifs ALFRED";
            btn.onclick = window.__objBulkApplySuggestions;
        }
        else if(text.includes("Remise à 0")) {
            btn.onclick = window.__objReset;
        }
        else if(text.includes("Appliquer")) {
            btn.onclick = window.__objBulkApply;
        }
    });


    // (Projection ALFRED supprimée : on conserve uniquement Suggestion / Remise à 0 / Report Réf)

  }

  function _recalcTotals(clients){
    const topBar = $("#objPanierBar");
    if(!topBar) return;

    let totalCible = 0;
    let totalCaRef = 0;
    let clientsCibles = 0;

    const paniersNouveaux = clients.filter(c => c.seg.includes("Nouveau") && c.medianBasket > 0).map(c => c.medianBasket).sort((a,b) => a - b);
    let medNouveau = 150; 
    if (paniersNouveaux.length > 0) {
        const mid = Math.floor(paniersNouveaux.length / 2);
        medNouveau = paniersNouveaux.length % 2 !== 0 ? paniersNouveaux[mid] : (paniersNouveaux[mid - 1] + paniersNouveaux[mid]) / 2;
    }
    const newClientsGoalEur = model.newClientsCount * medNouveau;

    // Sync UI: Budget Nouveaux Clients (input) <-> Obj. Nouveaux (€)
    const elNewGoal = document.getElementById("objNewGoal");
    if(elNewGoal && document.activeElement !== elNewGoal){
        elNewGoal.value = Math.round(newClientsGoalEur);
    }

    const visibleById = new Map((clients||[]).map(c => [c.id, c]));
    for(const [id, stateCible] of model.studioState.entries()){
      const c = visibleById.get(id);
      if(!c) continue;
      const caCible = +stateCible.caCible;
      if(caCible > 0) {
        totalCible += caCible;
        clientsCibles++;
        if(c.caM) totalCaRef += c.caM;
      }
    }

    const objGlobal = totalCible + newClientsGoalEur;
    const ecart = objGlobal - totalCaRef;
    const isEcartPos = ecart >= 0;

    topBar.innerHTML = `
      <div style="border-right:1px solid rgba(255,255,255,0.05);">
        <div class="small muted" style="margin-bottom:4px; font-weight:900; font-size:11px; text-transform:uppercase;">Clients Ciblés</div>
        <div style="font-size:22px; font-weight:950; color:#fff;">${clientsCibles}</div>
      </div>
      
      <div style="border-right:1px solid rgba(255,255,255,0.05);">
        <div class="small muted" style="margin-bottom:4px; font-weight:900; font-size:11px; text-transform:uppercase;">Obj. Nouveaux (€)</div>
        <div style="display:flex; align-items:center; gap:10px;">
            <div style="font-size:22px; font-weight:950; color:var(--accent);">${fmtEUR(newClientsGoalEur)}</div>
            <div style="display:flex; align-items:center; gap:4px;">
                <button class="ghost" style="padding:4px 10px; border:1px solid var(--stroke); border-radius:4px; font-weight:900; cursor:pointer;" onclick="window.__objStepNewClients(-1)">-</button>
                <div class="small muted" style="font-size:14px; font-weight:bold; min-width:24px; text-align:center;">${model.newClientsCount}</div>
                <button class="ghost" style="padding:4px 10px; border:1px solid var(--stroke); border-radius:4px; font-weight:900; cursor:pointer;" onclick="window.__objStepNewClients(1)">+</button>
            </div>
        </div>
      </div>

      <div style="border-right:1px solid rgba(255,255,255,0.05);">
        <div class="small muted" style="margin-bottom:4px; font-weight:900; font-size:11px; text-transform:uppercase;">Objectif Total</div>
        <div style="font-size:22px; font-weight:950; color:#fff;">${fmtEUR(objGlobal)}</div>
      </div>

      <div>
        <div class="small muted" style="margin-bottom:4px; font-weight:900; font-size:11px; text-transform:uppercase;">Écart (vs M Réf)</div>
        <div style="font-size:22px; font-weight:950; color:${isEcartPos ? '#38d39f' : '#ff4d4d'};">${isEcartPos ? '+' : ''}${fmtEUR(ecart)}</div>
      </div>
    `;
  }

  window.__objSort = function(key) {
      if (model.sortCol === key) {
          model.sortDir *= -1; 
      } else {
          model.sortCol = key;
          model.sortDir = -1; 
      }

      // IMPORTANT: tri uniquement sur action utilisateur (clic entête).
      // On "fige" l'ordre calculé, et on ne re-trie plus lors des updates (steppers / inputs).
      try{
          const clients = _getStudioClients() || [];
          const q = (model.q || "").trim().toLowerCase();
          const g = GISEMENTS.find(gx=>gx.key===model.gisement);

          let rows = clients.filter(c => {
            if(q && !c.name.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q)) return false;
            if(g && g.key !== "ALL") return g.predicate(c); 
            return true;
          });

          rows.sort((a, b) => {
              let valA, valB;

              if (model.sortCol === "caCible") {
                  const sA = model.studioState.get(a.id);
                  const sB = model.studioState.get(b.id);
                  valA = sA ? (+sA.caCible || 0) : 0;
                  valB = sB ? (+sB.caCible || 0) : 0;
              } else {
                  valA = a[model.sortCol];
                  valB = b[model.sortCol];
              }

              if (typeof valA === "string") return String(valA).localeCompare(String(valB)) * model.sortDir;
              return ((valA || 0) - (valB || 0)) * model.sortDir;
          });

          model.frozenOrderIds = rows.map(r => r.id);
      }catch(_e){
          model.frozenOrderIds = null;
      }

      __objRender();
  };

  function _renderTable(clients){
    const tbody = $("#objTbody");
    const thead = $("#view-objectifs-studio table thead");
    if(!tbody || !thead) return;

    const thStyle = "padding:12px; border-bottom:1px solid var(--stroke); color:var(--muted); cursor:pointer; font-size:12px;";
    const getCaret = (key) => model.sortCol === key ? (model.sortDir === 1 ? ' ▴' : ' ▾') : '';

    thead.innerHTML = `
      <tr>
        <th style="${thStyle} text-align:left;" onclick="window.__objSort('name')">Client${getCaret('name')}</th>
        <th style="${thStyle} text-align:left;" onclick="window.__objSort('diagText')">Info Révélatrice${getCaret('diagText')}</th>
        <th style="${thStyle} text-align:right;" onclick="window.__objSort('caM')">M (Réf)${getCaret('caM')}</th>
        <th style="${thStyle} text-align:right;" onclick="window.__objSort('pctMax')">% Max${getCaret('pctMax')}</th>
        <th style="${thStyle} text-align:right;" onclick="window.__objSort('pdp')">PdP${getCaret('pdp')}</th>
        <th style="${thStyle} text-align:right; color:var(--accent);" onclick="window.__objSort('hzAuto')">Suggestion${getCaret('hzAuto')}</th>
        <th style="${thStyle} text-align:right;" onclick="window.__objSort('caCible')">Cible €${getCaret('caCible')}</th>
        <th style="${thStyle} text-align:center;">Cmd</th>
      </tr>`;

    const q = (model.q || "").trim().toLowerCase();
    const g = GISEMENTS.find(gx=>gx.key===model.gisement);

    let rows = clients.filter(c => {
      if(q && !c.name.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q)) return false;
      if(g && g.key !== "ALL") return g.predicate(c); 
      return true;
    });

    // IMPORTANT: pas d'auto-tri pendant les updates.
    // Si l'utilisateur a cliqué une colonne, on applique l'ordre figé calculé à ce moment-là.
    if(Array.isArray(model.frozenOrderIds) && model.frozenOrderIds.length){
        const idx = new Map(model.frozenOrderIds.map((id,i)=>[id,i]));
        rows.sort((a,b)=> (idx.has(a.id)?idx.get(a.id):1e9) - (idx.has(b.id)?idx.get(b.id):1e9));
    }

    model.visibleIds = rows.map(r => r.id);
    model.suggestions.clear();
    
    let html = "";
    for(const c of rows){
      let stateCible = model.studioState.get(c.id);
      let caCible = stateCible ? +stateCible.caCible : 0;
      let isTargetSet = stateCible && caCible > 0; 
      
      let cmdDisplay = stateCible ? +stateCible.cmd : Math.max(0, Math.round(c.caM / c.medianBasket));
      
      if(c.hzAuto > 0) model.suggestions.set(c.id, c.hzAuto);

      const isOverFreq = (c.freqAnnual > 0 && cmdDisplay > c.freqAnnual);
      const rowBg = isOverFreq ? "background:rgba(255, 77, 77, 0.08); border-bottom:1px solid rgba(255, 77, 77, 0.3);" : "border-bottom:1px solid rgba(255,255,255,0.03);";

      let inputBg = isTargetSet ? "rgba(56, 211, 159, 0.15)" : "rgba(0,0,0,0.3)";
      let inputBorder = isTargetSet ? "1px solid #38d39f" : "1px solid rgba(255,255,255,0.1)";
      let inputColor = isTargetSet ? "#38d39f" : "#fff";
      let nameColor = "#fff"; 
      
      if (isTargetSet) {
          if (caCible < c.caM) {
              inputBg = "rgba(255, 93, 93, 0.08)";
              inputBorder = "1px solid #ff5d5d";
              inputColor = "#ff5d5d";
              nameColor = "#ff5d5d"; 
          } else {
              nameColor = "#38d39f"; 
          }
      }

      if(isOverFreq) { 
          inputBg = "rgba(255,77,77,0.1)"; 
          inputBorder = "1px solid #ff4d4d"; 
          inputColor = "#ff4d4d"; 
      }

      html += `
        <tr style="${rowBg}">
          <td style="padding:12px 10px; word-break:break-word;">
            <div style="font-weight:600; font-size:13px; white-space:normal; line-height:1.2; color:${nameColor}; transition: color 0.2s ease;"><span class="client-link" data-client="${esc(c.name)}" style="cursor:pointer;">${esc(c.name)}</span></div>
            <div class="small" style="font-weight:400; margin-top:4px; color:var(--muted); font-size:11px;">${esc(c.seg)}</div>
          </td>
          
          <td style="padding:12px 10px; text-align:left;">
            <span style="font-size:12px; font-weight:600; color:${c.diagColor};">${esc(c.diagText)}</span>
          </td>

          <td style="padding:12px 10px; text-align:right; font-weight:950;">${fmtEUR(c.caM)}</td>
          
          <td style="padding:12px 10px; text-align:right; color:var(--muted); font-weight:900;">${fmtPct(c.pctMax)}</td>
          <td style="padding:12px 10px; text-align:right; font-weight:950;">${c.pdp != null ? fmtNum(c.pdp)+' %' : '—'}</td>
          
          <td style="padding:12px 10px; text-align:right; color:var(--accent); font-weight:950; font-size:14px;">
            ${c.hzAuto > 0 ? fmtEUR(c.hzAuto) : "—"}
          </td>
          
          <td style="padding:12px 10px; text-align:right;">
            <input type="number" class="stepper-input hzNoSpin" value="${stateCible?Math.round(caCible):""}" placeholder="${Math.round(c.caM)}" style="width:90px; background:${inputBg}; border:${inputBorder}; color:${inputColor}; padding:8px; border-radius:8px; text-align:right; font-weight:950; transition: all 0.2s ease;"
              onchange="window.__objSetTarget('${esc(c.id)}', this.value)" />
            ${isOverFreq ? `<div style="color:#ff4d4d; font-size:10px; font-weight:bold; margin-top:6px; line-height:1.1;">⚠️ PdP<br>dépassé (Max: ${Math.round(c.freqAnnual)})</div>` : ''}
          </td>
          
          <td style="padding:12px 10px; text-align:right;">
            <div style="display:flex; gap:4px; justify-content:flex-end; align-items:center;">
              <button class="ghost" style="padding:4px 8px; border-radius:6px; border:1px solid ${isOverFreq ? '#ff4d4d' : 'var(--stroke)'}; font-weight:950; cursor:pointer; color:${isOverFreq ? '#ff4d4d' : 'inherit'}" onclick="window.__objStepOrders('${esc(c.id)}', -1)">-</button>
              <div style="min-width:28px; text-align:center; font-weight:950; color:${isOverFreq ? '#ff4d4d' : 'inherit'}">${cmdDisplay}</div>
              <button class="ghost" style="padding:4px 8px; border-radius:6px; border:1px solid ${isOverFreq ? '#ff4d4d' : 'var(--stroke)'}; font-weight:950; cursor:pointer; color:${isOverFreq ? '#ff4d4d' : 'inherit'}" onclick="window.__objStepOrders('${esc(c.id)}', 1)">+</button>
            </div>
          </td>
        </tr>`;
    }
    tbody.innerHTML = html;
  }

  window.__objStepNewClients = function(delta) {
      model.newClientsCount = Math.max(0, model.newClientsCount + delta);
      __objRender();
  };

  // Aliases expected by index.html (Budget Nouveaux Clients panel)
  window.__objStepNew = function(delta){
      window.__objStepNewClients(delta);
  };

  window.__objRecalcTotals = function(){
      const clients = _getStudioClients();
      // Recompute median basket for "Nouveau" (same as totals)
      const paniersNouveaux = clients
        .filter(c => c.seg.includes("Nouveau") && c.medianBasket > 0)
        .map(c => c.medianBasket)
        .sort((a,b)=>a-b);

      let medNouveau = 150;
      if(paniersNouveaux.length > 0){
          const mid = Math.floor(paniersNouveaux.length / 2);
          medNouveau = paniersNouveaux.length % 2 !== 0
            ? paniersNouveaux[mid]
            : (paniersNouveaux[mid - 1] + paniersNouveaux[mid]) / 2;
      }

      const elNewGoal = document.getElementById("objNewGoal");
      const eur = elNewGoal ? (parseFloat(elNewGoal.value)||0) : 0;

      // Convert € goal -> new clients count (rounded, safe)
      const nb = medNouveau > 0 ? Math.max(0, Math.round(eur / medNouveau)) : 0;
      model.newClientsCount = nb;

      __objRender();
  };


  window.__objSetTarget = function(id, val){
    const caCible = +val;
    if(!id) return;
    if(!Number.isFinite(caCible) || caCible <= 0) {
        model.studioState.delete(id);
    } else {
        const clients = _getStudioClients();
        const c = clients.find(cl => cl.id === id);
        const basket = c ? c.medianBasket : 150;
        const cmd = Math.max(0, Math.round(caCible / basket));
        model.studioState.set(id, { caCible, cmd, origin: "manual" });
    }
    __objRender();
  };

  window.__objStepOrders = function(id, delta){
    if(!id) return;
    const clients = _getStudioClients();
    const c = clients.find(cl => cl.id === id);
    if(!c) return;
    const basket = c.medianBasket;
    
    let stateCible = model.studioState.get(id);

    if (!stateCible) {
        let baseCmd = Math.max(0, Math.round(c.caM / basket));
        if (delta > 0) {
            model.studioState.set(id, { caCible: c.caM, cmd: baseCmd, origin: "stepper" });
        } else {
            let nextCmd = Math.max(0, baseCmd - 1);
            model.studioState.set(id, { caCible: nextCmd * basket, cmd: nextCmd, origin: "stepper" });
        }
    } else {
        let currentCmd = Number.isFinite(+stateCible.cmd) ? +stateCible.cmd : 0;
        let nextCmd = Math.max(0, currentCmd + delta);
        let nextCaCible = nextCmd * basket;
        
        if(nextCaCible <= 0){
            model.studioState.delete(id);
        } else {
            model.studioState.set(id, { caCible: nextCaCible, cmd: nextCmd, origin: "stepper" });
        }
    }
    __objRender();
  };

  window.__objReportMRef = function(){
    const clients = _getStudioClients();
    for(const c of clients){
      if(c && c.caM > 0){
        const cmd = Math.max(0, Math.round(c.caM / c.medianBasket));
        model.studioState.set(c.id, { caCible: c.caM, cmd, origin: "report" });
      }
    }
    __objRender();
  };

  window.__objBulkApplySuggestions = function(){
    const clients = _getStudioClients();

    // Source unique : colonne "Cible €" de Horizon (obj par client)
    const hzRows = (window.__hzModel && Array.isArray(window.__hzModel.rows)) ? window.__hzModel.rows : null;
    if(!hzRows || !hzRows.length){
      console.warn("[Studio] Impossible d'importer Horizon : window.__hzModel.rows est absent/vide.");
      return;
    }

    const hzMap = new Map();
    for(const r of hzRows){
      if(!r) continue;
      const id = (r.id != null ? String(r.id) : (r.name != null ? String(r.name) : null));
      if(!id) continue;
      const v = Number(r.obj);
      if(Number.isFinite(v)) hzMap.set(id, v);
    }

    if(hzMap.size === 0){
      console.warn("[Studio] Import Horizon : aucune valeur numérique trouvée dans la colonne Cible € (rows[].obj).");
      return;
    }

    // On remplace l'intégralité des objectifs Studio par les valeurs Horizon
    model.studioState.clear();

    for(const c of clients){
      const key = String(c.id);
      if(!hzMap.has(key)) continue;

      const caCible = hzMap.get(key);
      const basket = Number(c.medianBasket) || 150;
      const cmd = Math.max(0, Math.round(caCible / basket));

      model.studioState.set(c.id, { caCible, cmd, origin:"horizonCible" });
    }

    __objRender();
  };

  window.__objReset = function(){
      model.studioState.clear();
      model.newClientsCount = 0;
      __objRender();
  };

  window.__objBulkApply = function(){
      const visibleIds = new Set((_getStudioClients() || []).map(c => c.id));
      let targetCount = 0;
      for(const [id, s] of model.studioState.entries()){
          if(!visibleIds.has(id)) continue;
          const caCible = Number(s && s.caCible);
          if(Number.isFinite(caCible) && caCible > 0) targetCount++;
      }
      if(targetCount === 0) {
          alert("⚠️ Aucun objectif n'a été fixé. Veuillez renseigner des cibles.");
      } else {
          alert(`✅ Objectifs validés avec succès pour ${targetCount} clients !`);
      }
  };

  window.applyReportM1 = window.__objReportMRef; 
  window.applyReportMRef = window.__objReportMRef;
  window.applySuggestions = window.__objBulkApplySuggestions;
  window.resetObjectifs = window.__objReset;
  window.__objBulkApply = window.__objBulkApply;

  function __objRender(){
    _syncMonthUI();
    _syncCommercialUI();

    const view = $("#view-objectifs-studio");
    if(!view || view.classList.contains("hidden")) return;

    __objApplyLayoutTweaks();

    const qEl = $("#objSearch");
    model.q = qEl ? String(qEl.value||"") : "";

    const clients = _prepareStudioData();
    
    _renderGisements(clients);
    _renderTable(clients);
    _recalcTotals(clients);
  }

  window.__objRender = __objRender;

  window.openALFREDObjectifsStudio = function(){
    const view = $("#view-objectifs-studio");
    if(!view) return;
    view.classList.remove("hidden");
    model.dataCache = null; 
    __objRender();
  };

  window.closeALFREDObjectifsStudio = function(){
    const view = $("#view-objectifs-studio");
    if(!view) return;
    view.classList.add("hidden");
  };

  const ySel = document.getElementById("yearSelect");
  const mSel = document.getElementById("monthSelect");
  if(ySel) ySel.addEventListener("change", () => { model.dataCache = null; __objRender(); });
  if(mSel) mSel.addEventListener("change", () => { model.dataCache = null; __objRender(); });

  window.addEventListener("datasetReady", ()=>{
    model.dataCache = null; 
    if(!$("#view-objectifs-studio")?.classList.contains("hidden")) __objRender();
  });


  // =========================
  // Export (.alfred) — transfert vers le module Objectifs (PC séparé)
  // Source : model.studioState + newClientsCount + quelques metas.
  // =========================
  function __downloadBlob(filename, blob){
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 800);
  }

  window.__objExport = function(){
    try{
      const clients = _getStudioClients(); // [{id,name,gisement,medianBasket,...}]
      const exportedClients = [];

      for(const c of clients){
        const s = model.studioState.get(c.id);
        if(!s) continue;

        const caCible = Number(s.caCible);
        if(!Number.isFinite(caCible) || caCible <= 0) continue; // "actif" = >0

        exportedClients.push({
          id: String(c.id),
          name: String(c.name),
          gisement: c.gisement ? String(c.gisement) : "",
          commercial: c.commercial ? String(c.commercial) : "",
          marginPct: Number.isFinite(+c.marginPct) ? (+c.marginPct) : undefined,
          caCible: caCible,
          cmd: Math.max(0, Math.round(Number(s.cmd) || 0)),
          origin: s.origin ? String(s.origin) : ""
        });
      }

      const payload = {
        type: "ALFRED_OBJECTIFS_EXPORT",
        version: 1,
        createdAt: new Date().toISOString(),
        datasetHash: (window.state && window.state.meta && window.state.meta.datasetHash) ? String(window.state.meta.datasetHash) : "",
        period: model.period,
        
        refMonth: (function(){ const r=_getRefYM(); return { year:r.y, month:r.m }; })(),
        targetMonth: (function(){
          const r=_getRefYM();
          const mm = Number(model.targetMonth)||r.m;
          const yy = Number(model.targetYear)||r.y;
          return { year:yy, month:mm };
        })(),
        newClientsCount: Number(model.newClientsCount || 0),
        selectedCommercial: (model.commercial && model.commercial !== "ALL") ? String(model.commercial) : "",
        clients: exportedClients
      };

      const txt = JSON.stringify(payload, null, 2);
      const blob = new Blob([txt], {type:"application/json"});
      const now = new Date();
      const jj = String(now.getDate()).padStart(2,"0");
      const mm = String(now.getMonth()+1).padStart(2,"0");
      const aaaa = String(now.getFullYear());
      const exportDate = `${jj}-${mm}-${aaaa}`; // jj-mm-aaaa

      const tm = payload.targetMonth || payload.refMonth || {year: now.getFullYear(), month: now.getMonth()+1};
      const monthNames = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
      const mLabel = `${monthNames[Math.max(1,Math.min(12, +tm.month||1))-1]} ${tm.year}`;

      const commercialSuffix = payload.selectedCommercial ? ` - ${String(payload.selectedCommercial).replace(/[\/:*?"<>|]/g, "-")}` : "";
      const fname = `Objectif (${mLabel})${commercialSuffix} fixé le (${exportDate}).alfred`;
      __downloadBlob(fname, blob);

      console.log("[Studio] Export Objectifs OK", {clients: exportedClients.length, period: model.period, newClientsCount: payload.newClientsCount});
    }catch(err){
      console.error("[Studio] Export Objectifs FAILED", err);
      alert("Export impossible (voir console).");
    }
  };

})();