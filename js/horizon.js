/* === EXPORT SÛR : Assure l'accès global === */
try{
  if(typeof openClientDetail === 'function') window.openClientDetail = openClientDetail;
}catch(_e){}

(function(){
  "use strict";

  const $ = (sel)=>document.querySelector(sel);
  const $$ = (sel)=>Array.from(document.querySelectorAll(sel));

  const fmtEUR = (n)=>{
    try{ return (window.fmtEUR ? window.fmtEUR(n||0) : (Number(n||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR', maximumFractionDigits:0}))); }
    catch(e){ return String(n||0); }
  };
  
  const _hzFMoney0 = (n) => Number(n||0).toLocaleString('fr-FR', {style:'currency', currency:'EUR', minimumFractionDigits:0, maximumFractionDigits:0});
  
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

  window.__hzManualOverrides = window.__hzManualOverrides || new Map();
  window.__hzActiveGisementFilter = window.__hzActiveGisementFilter || "ALL";
  window.__hzPrevView = window.__hzPrevView || "view-cockpit";
  window.__hzDragging = false;
  window.__hzChartMaxVal = 1000;

  // Warmup après import CSV : calcule l'Atterrissage Global M+1 par défaut (sans ouvrir Horizon)
  // Source de vérité pour Studio : window.__hzLandingGlobalM1
  window.__hzLandingGlobalM1 = window.__hzLandingGlobalM1 || 0;
  window.addEventListener("datasetReady", function(ev){
      try{
          const snap = (ev && ev.detail) ? ev.detail : null;
          const clients = (snap && Array.isArray(snap.clients)) ? snap.clients : (window.state && Array.isArray(window.state.clients) ? window.state.clients : []);
          if(!clients || !clients.length) { window.__hzLandingGlobalM1 = 0; return; }

          // On réutilise le moteur Horizon pour obtenir le mois de référence (m0)
          if(typeof window.__hzComputeM1Bases === "function"){
              const hzBases = window.__hzComputeM1Bases(clients);
              const det = hzBases.detailsByName || {};
              let sumRef = 0;
              for(const c of clients){
                  if(!c) continue;
                  const seg = String(c.segment||c.seg||"");
                  if(seg === "Perdus" || seg === "Perdus Historiques") continue;
                  const nm = String(c.name||c.id||"").trim();
                  const d = det[nm];
                  const m0 = d ? Number(d.m0||0) : Number(c.caM||0);
                  sumRef += (Number.isFinite(m0) ? m0 : 0);
              }
              window.__hzLandingGlobalM1 = sumRef;
          }else{
              // fallback minimal
              let sumRef = 0;
              for(const c of clients){
                  if(!c) continue;
                  const seg = String(c.segment||c.seg||"");
                  if(seg === "Perdus" || seg === "Perdus Historiques") continue;
                  const m0 = Number(c.caM||0);
                  sumRef += (Number.isFinite(m0) ? m0 : 0);
              }
              window.__hzLandingGlobalM1 = sumRef;
          }
      }catch(e){
          window.__hzLandingGlobalM1 = 0;
      }
  });

  const GISEMENTS = [
    { key:"RISQUE", icon:"i-shield", title:"À risque", color:"#ff5d5d" },
    { key:"OPPORTUNITE", icon:"i-target", title:"Opportunités", color:"#6ea8ff" },
    { key:"NOUVEAUX", icon:"i-users", title:"Nouveaux", color:"#38bdf8" },
    { key:"VIP", icon:"i-star", title:"Clients VIP", color:"#ffd700" },
    { key:"BAISSE", icon:"i-chartDown", title:"En baisse", color:"#ffcc66" },
    { key:"RESTE", icon:"i-layers", title:"Portefeuille", color:"#a0aec0" }
  ];

  // --- UI: Glow color per gisement (shared with Studio) ---
  function __hzGlowClassForGisement(key){
    const k = String(key||"").toUpperCase();
    if(k === "RISQUE") return "tileGlowRed";
    if(k === "BAISSE") return "tileGlowOrange";
    if(k === "OPPORTUNITE") return "tileGlowBlue";
    if(k === "NOUVEAUX") return "tileGlowBlue";
    if(k === "VIP") return "tileGlowPurple";
    if(k === "RESTE") return "tileGlowGreen";
    return "tileGlowBlue";
  }


  window.__hzComputeM1Bases = function(clients){
      const __cache = (state && state.cache) ? state.cache : null;
      const __mbc = (__cache && (__cache.monthlyByClient instanceof Map)) ? __cache.monthlyByClient : null;
      const tb = (state && state.timebox) ? state.timebox : {};
      
      const m0 = tb.M || "";
      const m_1 = tb.M_1 || "";
      const m_2 = tb.M_2 || "";
      const m_3 = tb.M_3 || "";
  
      const extrapByName = {};
      const detailsByName = {};
  
      for(const c of (clients||[])){
          const nm = String(c.name||"").trim();
          if(!nm) continue;
          
          let v0=0, v1=0, v2=0, v3=0;
          if(__mbc && __mbc.has(nm)){
              const mm = __mbc.get(nm);
              v0 = mm.has(m0) ? mm.get(m0).sumHT : 0;
              v1 = mm.has(m_1) ? mm.get(m_1).sumHT : 0;
              v2 = mm.has(m_2) ? mm.get(m_2).sumHT : 0;
              v3 = mm.has(m_3) ? mm.get(m_3).sumHT : 0;
          }
          // Pondération (moins optimiste) : lisse sur 4 mois
          let baseRaw = (0.40*v0) + (0.25*v1) + (0.20*v2) + (0.15*v3);
          if(!Number.isFinite(baseRaw) || baseRaw < 0) baseRaw = 0;
          
          extrapByName[nm] = baseRaw;
          detailsByName[nm] = { m0: v0, m1: v1, m2: v2, m3: v3 };
      }
      return { extrapByName, detailsByName };
  };


  // === HORIZON vNext: base M+1 (projection) ===
  // Règles validées: M+1 calendaire, TF poids réduit si non fiable, opportunistes prudents,
  // panier progressif, panier baisse pénalité immédiate, hors saison -> baseline basse (si détectable),
  // pas de saison -> neutre, déclin -> uplift quasi nul, risque -> protection, cap fréquence souple.
  function __hzClamp(v, a, b){ v = +v; if(!Number.isFinite(v)) return a; return v < a ? a : (v > b ? b : v); }
  function __hzPctToFactor(pct, capAbs){
    // pct peut être "5" (5%) ou "0.05" (5%). On normalise.
    let x = Number(pct||0);
    if(!Number.isFinite(x)) x = 0;
    if(Math.abs(x) > 3) x = x/100;
    const cap = (capAbs==null) ? 0.30 : Math.abs(capAbs);
    x = __hzClamp(x, -cap, cap);
    return 1 + x;
  }
  function __hzTimingFactor_C(recCalDays, cycleDays, tfReliable){
    const rel = __hzClamp(Number(tfReliable||0), 0, 1);
    if(!Number.isFinite(cycleDays) || cycleDays <= 0){
      // pas de cycle : facteur neutre, mais on respecte la fiabilité
      return 0.6 + 0.4*rel;
    }
    const pos = (Number(recCalDays||0) <= 0) ? 0 : (Number(recCalDays||0) / cycleDays);
    let base;
    if(pos < 0.6) base = 0.20;
    else if(pos <= 1.0) base = 0.20 + 2.0*(pos - 0.60); // 0.2 -> 1.0
    else base = Math.max(0, 1.0 - 2.5*(pos - 1.0));     // chute rapide
    // TF non fiable => on aplatit vers 0.55
    return (0.55*(1-rel)) + (base*rel);
  }
  function __hzGetBasketDeltaAsPct(c){
    // basketDelta peut être en % (ex: 5) ou ratio (0.05)
    let bd = Number(c && (c.basketDelta!=null ? c.basketDelta : c.basketDeltaRaw));
    if(!Number.isFinite(bd)) return 0;
    if(Math.abs(bd) < 2 && bd !== 0) bd = bd*100;
    return bd; // en %
  }
  function __hzPatternKey(c, timingFactor){
    const td = Number(c && c.tdPct); // déjà un % (ex -97)
    const tf = Number(c && c.tf);    // parfois ratio => on ne refait pas ici
    const tfRel = __hzClamp(Number(c && c.tfReliable), 0, 1);

    // Déclin dur
    if(Number.isFinite(td) && td <= -20) return "DECLINE";
    if(Number.isFinite(tf) && (Math.abs(tf) > 3 ? tf : tf*100) <= -20) return "DECLINE";

    // Opportuniste / saisonnier (prudence)
    if(timingFactor >= 0.85 && tfRel >= 0.6) return "OPPORTUNISTE";

    // Croissance
    if(Number.isFinite(td) && td >= 10) return "GROWTH";

    return "STABLE";
  }
  function __hzComputeBaseM1_VNext(c, hist, fallbackBase, globalBasket){
    // Entrées
    const freqAnnual = Number.isFinite(+c.frequency) ? +c.frequency : (Number.isFinite(+c.freq) ? +c.freq : 1);
    const basketLevel = (Number.isFinite(+c.basketAvgHT) && +c.basketAvgHT>0) ? +c.basketAvgHT
                      : (Number.isFinite(+c.basket) && +c.basket>0) ? +c.basket
                      : (Number.isFinite(+globalBasket) && +globalBasket>0) ? +globalBasket : 150;

    const recCalDays = Number.isFinite(+c.recCalDays) ? +c.recCalDays
                      : Number.isFinite(+c.recencyDays) ? +c.recencyDays : 0;

    const tfReliable = __hzClamp(Number(c.tfReliable), 0, 1);

    // Cycle (timing)
    const cycleDays = freqAnnual > 0 ? (365 / freqAnnual) : 0;
    const timing = __hzTimingFactor_C(recCalDays, cycleDays, tfReliable);

    // Volume (cap base)
    const cmdCapBase = freqAnnual > 0 ? (freqAnnual / 12) : 0;

    // Velocité (mix validé: 70% mensuel + 30% court terme). Ici: tdPct = proxy "mensuel", trendM = proxy "court".
    const tdPct = Number(c.tdPct);
    const trendM = Number(c.trendM);
    const vMonth = Number.isFinite(tdPct) ? tdPct : 0;
    const v30   = Number.isFinite(trendM) ? (Math.abs(trendM) < 2 && trendM !== 0 ? trendM*100 : trendM) : 0;
    const velPct = 0.7*vMonth + 0.3*v30;
    const velocityFactor = __hzPctToFactor(velPct, 0.30);

    // Panier M+1 (progressif)
    const basketDeltaPct = __hzGetBasketDeltaAsPct(c);
    const basketFactor = __hzPctToFactor(0.30 * basketDeltaPct, 0.20); // progressif
    let basketM1 = basketLevel * basketFactor;

    // Pénalité immédiate si panier en baisse forte (choix 6A)
    if(basketDeltaPct <= -15){
      basketM1 = basketLevel * __hzPctToFactor(basketDeltaPct, 0.35);
    }

    // Pattern + cap souple
    const pattern = __hzPatternKey(c, timing);
    // bonus cap souple uniquement si opportuniste/saisonnier-like (on n'a pas encore un vrai seasonalityFactor fiable ici)
    let bonusFactor = 0;
    if(pattern === "OPPORTUNISTE"){
      // on n'ouvre pas si velocity est négative
      const velOk = (velPct >= 0);
      if(velOk) bonusFactor = __hzClamp((timing - 0.65) / 0.35, 0, 1) * __hzClamp(tfReliable, 0, 1);
    }

    const capSoft = cmdCapBase + (0.35 * cmdCapBase * bonusFactor);
    const capHard = cmdCapBase * 1.25;
    const cmdCapFinal = Math.min(capSoft, capHard);

    // Baseline commandes
    let cmd = cmdCapBase * timing * velocityFactor;

    // Opportunistes = prudents (choix 4A)
    if(pattern === "OPPORTUNISTE") cmd *= 0.75;

    // Déclin = prudence + chute panier déjà prise, on réduit encore légèrement
    if(pattern === "DECLINE") cmd *= 0.55;

    cmd = __hzClamp(cmd, 0, cmdCapFinal);

    // CA baseline
    let ca = cmd * basketM1;
    if(!Number.isFinite(ca) || ca < 0) ca = 0;

    // fallback si tout est trop vide (nouveau client / données insuffisantes)
    if(ca === 0 && Number.isFinite(fallbackBase) && fallbackBase > 0){
      ca = fallbackBase;
    }

    return {
      baseExtrap: ca,
      _hzTimingFactor: timing,
      _hzVelocityFactor: velocityFactor,
      _hzCmdCap: cmdCapFinal,
      _hzPattern: pattern,
      _hzBasketM1: basketM1
    };
  }
  // --- INITIALISATION HORIZON ---
// Safe stub (avoid blank screen if mode helper not yet defined)
window.__hzSetCurveMode = window.__hzSetCurveMode || function(mode){
  window.__hzCurveMode = mode || 'projection';
};

  window.openALFREDHorizon = function() {
      const activeView = document.querySelector('section:not(.hidden)');
      if (activeView && activeView.id !== 'view-horizon') {
          window.__hzPrevView = activeView.id;
      }

      const view = document.getElementById('view-horizon');
      if(!view) return;

      // JAILBREAK CSS ABSOLU (Plein écran forcé)
      if (view.parentElement && view.parentElement.tagName !== 'BODY') {
          document.body.appendChild(view);
      }
      view.classList.remove('grid');
      view.style.position = "fixed";
      view.style.inset = "0";
      view.style.width = "100vw";
      view.style.height = "100vh";
      view.style.maxWidth = "100vw";
      view.style.margin = "0";
      view.style.padding = "20px 0";
      view.style.zIndex = "9999";
      view.style.overflowX = "hidden";
      view.style.overflowY = "auto";
      view.style.boxSizing = "border-box";
      view.style.background = "var(--bg)";

      Array.from(view.children).forEach(child => {
          if (child.id !== 'hzAppContainer') child.style.display = 'none';
      });

      window.__hzManualOverrides = window.__hzManualOverrides || new Map();
      window.__hzActiveGisementFilter = "ALL";
      const clients = state.clients || [];
  
      const hzBases = window.__hzComputeM1Bases(clients);
      const ex = hzBases.extrapByName || {};
      const det = hzBases.detailsByName || {};
  
      const gs = state.globalStats || {};
      // Médiane des paniers segment "Nouveau" (même logique que Studio)
let globalBasket = 150;
try{
  const arr = (state.clients||[])
    .filter(c => (c.segment||"").toLowerCase().includes("nouveau") && Number.isFinite(+c.basketAvgHT) && +c.basketAvgHT > 0)
    .map(c => +c.basketAvgHT)
    .sort((a,b)=>a-b);

  if(arr.length){
    const mid = Math.floor(arr.length/2);
    globalBasket = (arr.length % 2)
      ? arr[mid]
      : (arr[mid-1] + arr[mid]) / 2;
  }
}catch(e){}
  
      window.__hzModel = { rows: [], acqNb: 0, acqPanier: globalBasket, sortCol: 'obj', sortDir: -1 };
  
      for(const c of clients){
          const nm = String(c.name).trim();
          if(!nm || c.segment === "Perdus" || c.segment === "Perdus Historiques") continue;
  
          const freqAnnual = Number.isFinite(+c.frequency) ? +c.frequency : 1; 
          const recCalDays = Number.isFinite(+c.recCalDays) ? +c.recCalDays : 0;
          const medianBasket = Number.isFinite(+c.basketAvgHT) && +c.basketAvgHT > 0 ? +c.basketAvgHT : globalBasket;
          const pctMax = Number(c.pctOfMax||0) * 100;
          const pdp = Number(c.penetration||0) * 100;
          const td = Number(c.tdPct) || 0;
          
          let tfRaw = Number(c.tf) || 0;
          const tf = (Math.abs(tfRaw) < 2 && tfRaw !== 0) ? tfRaw * 100 : tfRaw; 

          const seg = String(c.segment || "");
          const alertPilotage = String(c.actionZone || "");
  
          const cycleAchat = freqAnnual > 0 ? 365 / freqAnnual : 0;
          const retardJours = recCalDays - cycleAchat;
          const isOpportunite = cycleAchat > 0 && recCalDays >= (cycleAchat * 0.8) && recCalDays <= (cycleAchat * 1.2);
  
          let diagText = "Régulier";
          let diagColor = "var(--muted)";
          if (cycleAchat > 0 && retardJours > 15 && !seg.toLowerCase().includes("perdu")) {
              diagText = `Retard (${Math.round(retardJours)}j)`;
              diagColor = "#ffcc00"; 
          } else if (isOpportunite) {
              diagText = `🎯 Fenêtre idéale`;
              diagColor = "var(--accent)"; 
          } else if (td <= -5) {
              diagText = `Baisse Vol. (${td > 0 ? '+' : ''}${Math.round(td)}%)`;
              diagColor = "#ff4d4d"; 
          } else if (tf <= -5) {
              diagText = `Baisse Fréq. (${tf > 0 ? '+' : ''}${Math.round(tf)}%)`;
              diagColor = "#ff4d4d"; 
          } else if (td >= 5) {
              diagText = `Croissance Vol. (+${Math.round(td)}%)`;
              diagColor = "#38d39f"; 
          }

          let gKey = "RESTE";
          if (alertPilotage.includes("Décrochage") || seg.toLowerCase().includes("risque")) gKey = "RISQUE";
          else if (isOpportunite) gKey = "OPPORTUNITE";
          else if (seg.toLowerCase().includes("nouveau")) gKey = "NOUVEAUX";
          else if (seg.toLowerCase().includes("vip")) gKey = "VIP";
          else if (td < 0) gKey = "BAISSE";
  
          const d = det[nm] || {};
          // vNext compute (baseline M+1) — utilise uniquement state.clients (UI inchangée)
          const vNext = __hzComputeBaseM1_VNext(c, d, ex[nm]||0, globalBasket);

          let baseEx = Number(vNext.baseExtrap || 0);
          if(isOpportunite && baseEx < medianBasket) baseEx = medianBasket;

          // Horizon: toujours repartir sur le Mois de Référence (M0) à l'ouverture
          let initialObj = Number(d.m0 || 0);
          // Persistance: si une valeur a déjà été modifiée en Horizon, on la réapplique
          try{
              const ov = (window.__hzManualOverrides && window.__hzManualOverrides.get) ? window.__hzManualOverrides.get(nm) : undefined;
              if(ov !== undefined && ov !== null && ov !== "") initialObj = Number(ov) || 0;
          }catch(e){}
window.__hzModel.rows.push({
              id: nm, name: nm, segment: seg,
              gKey: gKey, isOpp: isOpportunite,
              freq: freqAnnual, basket: medianBasket,
              pctMax: pctMax, pdp: pdp,
              diagText: diagText, diagColor: diagColor,
              caM2: d.m2 || 0, caM1: d.m1 || 0, ref: d.m0 || 0, 
              baseExtrap: baseEx, obj: initialObj, __initObj: initialObj,
              _hzPattern: vNext._hzPattern, _hzTimingFactor: vNext._hzTimingFactor,
              _hzVelocityFactor: vNext._hzVelocityFactor, _hzCmdCap: vNext._hzCmdCap,
              _hzBasketM1: vNext._hzBasketM1
          });
      }
  
      document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
      view.classList.remove('hidden');
      window.scrollTo(0,0);
      if(typeof window.__hzSetCurveMode==='function') window.__hzSetCurveMode('projection'); else window.__hzCurveMode='projection';
      window.hzRenderMasterGrid(true); 
  };

  window.closeALFREDHorizon = function(){
      document.getElementById('view-horizon').classList.add('hidden');
      const target = document.getElementById(window.__hzPrevView) || document.getElementById('view-cockpit');
      if(target) target.classList.remove('hidden');
      window.scrollTo(0,0);
  };

  // --- ACTIONS GLOBALES (Mois de Réf & Projection ALFRED) ---
  window.hzResetAll = function() {
      // Objectif Mois de Réf : reproduit EXACTEMENT le CA du mois de référence en objectif
      const m = window.__hzModel;
      if(m && Array.isArray(m.rows)){
          m.rows.forEach(r=>{
              r.obj = Number(r.ref||0);
              r.__initObj = Number(r.ref||0);
          });
      }

      // reset sliders/tiles to 100% without recalculating objectives
      try{
        GISEMENTS.forEach(g=>{
          const el = document.getElementById(`hz_tuile_pct_${g.key}`);
          if(el) el.value = 100;
        });
      }catch(e){}

      if(window.__hzManualOverrides && window.__hzManualOverrides.clear){
          window.__hzManualOverrides.clear();
      }

      window.hzRenderMasterGrid(true);
  };

  window.hzAutoProject = function() {
      // MODE PROJECTION = baseline pure (les statistiques prévues)
      // => on aligne obj sur baseExtrap pour que la courbe "Projection" reflète la projection.
      try{
          const m = window.__hzModel;
          if(!m || !Array.isArray(m.rows)) return;

          m.rows.forEach(r=>{
              const v = Number(r.baseExtrap||0);
              r.obj = v;
              if(window.__hzManualOverrides && window.__hzManualOverrides.set) window.__hzManualOverrides.set(r.id, r.obj);
          });

          window.__hzSetCurveMode("projection");
          if(typeof window.hzUpdateVisuals === "function") window.hzUpdateVisuals();
          if(typeof window.hzRenderMasterGrid === "function") window.hzRenderMasterGrid(true);
      }catch(e){}
  };

  // Mode du graphe + styles boutons (Projection vs Suggestion)
  window.__hzSetCurveMode = function(mode){
      window.__hzCurveMode = mode || "projection";
      try{
          const bProj = document.getElementById("hzBtnProjection");
          const bSug  = document.getElementById("hzBtnSuggestObj");

          if(window.__hzCurveMode === "suggestion"){
              // Projection en orange, Suggestion en vert
              if(bProj){
                  bProj.style.background = "rgba(255, 165, 0, 0.10)";
                  bProj.style.borderColor = "rgba(255, 165, 0, 0.35)";
                  bProj.style.color = "rgba(255, 165, 0, 0.95)";
                  bProj.style.boxShadow = "0 0 10px rgba(255,165,0,0.10)";
              }
              if(bSug){
                  bSug.style.background = "rgba(16, 185, 129, 0.12)";
                  bSug.style.borderColor = "rgba(16, 185, 129, 0.40)";
                  bSug.style.color = "rgba(16, 185, 129, 0.98)";
                  bSug.style.boxShadow = "0 0 12px rgba(16,185,129,0.12)";
              }
          } else {
              // Mode projection : style original (bleu) + suggestion plus neutre
              if(bProj){
                  bProj.style.background = "rgba(56, 189, 248, 0.08)";
                  bProj.style.borderColor = "rgba(56, 189, 248, 0.30)";
                  bProj.style.color = "#38bdf8";
                  bProj.style.boxShadow = "0 0 10px rgba(56,189,248,0.10)";
              }
              if(bSug){
                  bSug.style.background = "rgba(255,255,255,0.03)";
                  bSug.style.borderColor = "rgba(255,255,255,0.10)";
                  bSug.style.color = "var(--muted)";
                  bSug.style.boxShadow = "none";
              }
          }
      }catch(e){}
  };

  // MODE SUGGESTION = version optimiste (action commerciale), jamais < projection
  // Implémentation: ruissellement par gisement avec un uplift modéré puis clamp >= baseExtrap.
  window.hzSuggestObjectives = function(){
      try{
          const m = window.__hzModel;
          if(!m || !Array.isArray(m.rows)) return;

          const suggestionStrategy = {
              "OPPORTUNITE": 120,
              "NOUVEAUX": 108,
              "VIP": 110,
              "BAISSE": 100,
              "RISQUE": 95,
              "RESTE": 105
          };

          // Applique le ruissellement par gisement
          GISEMENTS.forEach(g => {
              const p = suggestionStrategy[g.key] || 100;
              if(typeof window.hzUpdateGisement === "function") window.hzUpdateGisement(g.key, p);
          });

          // Clamp final: une suggestion ne doit jamais être < projection (baseExtrap)
          m.rows.forEach(r=>{
              const b = Number(r.baseExtrap||0);
              if(!Number.isFinite(b)) return;
              if(Number(r.obj||0) < b){
                  r.obj = b;
                  if(window.__hzManualOverrides && window.__hzManualOverrides.set) window.__hzManualOverrides.set(r.id, r.obj);
              }
          });

          window.__hzSetCurveMode("suggestion");
          if(typeof window.hzUpdateVisuals === "function") window.hzUpdateVisuals();
          if(typeof window.hzRenderMasterGrid === "function") window.hzRenderMasterGrid(true);
      }catch(e){}
  };

  // --- MOTEUR DE RUISSELLEMENT ALFRED ---
  window.hzUpdateGisement = function(gKey, pctVal) {
      const m = window.__hzModel;
      const pct = parseFloat(pctVal) || 100;
      const group = m.rows.filter(r => r.gKey === gKey);
  
      const baseGisement = group.reduce((s, r) => s + r.baseExtrap, 0);
      const targetCA = baseGisement * (pct / 100);
  
      // CLONE SÉCURISÉ
      let clonedGroup = group.map(c => ({...c}));
      
      let currentCA = 0;
      clonedGroup.forEach(c => {
          c._cmd = Math.round(c.baseExtrap / c.basket);
          if (c._cmd > c.freq) c._cmd = Math.floor(c.freq);
          c._obj = c._cmd * c.basket;
          currentCA += c._obj;
      });
  
      // TRI DÉTERMINISTE (Le fix est ici)
      let addQueue = [...clonedGroup].sort((a,b) => {
          let potA = 100 - Math.min(a.pctMax, 100);
          let potB = 100 - Math.min(b.pctMax, 100);
          let pdpBonusA = a.pdp > 0 ? (100 - a.pdp) * 0.2 : 0;
          let pdpBonusB = b.pdp > 0 ? (100 - b.pdp) * 0.2 : 0;
          let scoreA = (potA + pdpBonusA) * (a.isOpp ? 1.5 : 1);
          let scoreB = (potB + pdpBonusB) * (b.isOpp ? 1.5 : 1);
          
          if (scoreB !== scoreA) return scoreB - scoreA;
          
          // DÉPARTAGE ABSOLU : Si même potentiel, on trie par ID. 
          // (Empêche l'ordre de changer aléatoirement entre deux clics)
          return String(a.id).localeCompare(String(b.id)); 
      });
      let remQueue = [...addQueue].reverse(); 
  
      if (targetCA > currentCA) {
          let changed = true;
          while (currentCA < targetCA && changed) {
              changed = false;
              for (let c of addQueue) {
                  if (c._cmd < Math.floor(c.freq)) {
                      c._cmd++;
                      c._obj += c.basket;
                      currentCA += c.basket;
                      changed = true;
                      if (currentCA >= targetCA) break;
                  }
              }
          }
      } else if (targetCA < currentCA) {
          let changed = true;
          while (currentCA > targetCA && changed) {
              changed = false;
              for (let c of remQueue) {
                  if (c._cmd > 0) {
                      c._cmd--;
                      c._obj -= c.basket;
                      currentCA -= c.basket;
                      changed = true;
                      if (currentCA <= targetCA) break;
                  }
              }
          }
      }
  
      // RÉAFFECTATION
      group.forEach(c => {
          const finalState = clonedGroup.find(x => x.id === c.id);
          if(finalState) {
              c.obj = finalState._obj;
              if (window.__hzManualOverrides && window.__hzManualOverrides.set) {
                  window.__hzManualOverrides.set(c.id, c.obj);
              }
          }
      });
  
      window.hzUpdateVisuals(); 
  };

  window.hzStepGisement = function(gKey, delta) {
      const el = document.getElementById(`hz_tuile_pct_${gKey}`);
      let current = el ? parseFloat(el.value) : 100;
      window.hzUpdateGisement(gKey, Math.max(0, current + delta));
  };

  window.hzGlobalCurveChange = function(pctVal) {
      GISEMENTS.forEach(g => window.hzUpdateGisement(g.key, pctVal));
      window.hzUpdateVisuals();
  };

  window.hzSetFilter = function(gKey) {
      window.__hzActiveGisementFilter = (window.__hzActiveGisementFilter === gKey) ? "ALL" : gKey;
      window.hzRenderMasterGrid(true); 
      if (window.__hzActiveGisementFilter !== "ALL") {
          setTimeout(() => {
              const t = document.getElementById('hzFocusStudio');
              if(t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 50);
      }
  };

  window.hzUpdAcq = function(type, val) {
      const m = window.__hzModel;
      if(!m) return;
      if(type==='nb') m.acqNb = parseInt(val, 10)||0;
      window.hzUpdateVisuals();
  };

  // --- DRAG AND DROP MOUSE EVENTS POUR LE GRAPHIQUE ---
  window.hzStartDrag = function(e) {
      window.__hzDragging = true;
      document.body.style.userSelect = 'none'; // Évite de sélectionner le texte pendant le glissement
      document.addEventListener('mousemove', window.hzDoDrag);
      document.addEventListener('mouseup', window.hzEndDrag);
      window.hzDoDrag(e);
  };
  
  window.hzEndDrag = function(e) {
      window.__hzDragging = false;
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', window.hzDoDrag);
      document.removeEventListener('mouseup', window.hzEndDrag);
  };

  window.hzDoDrag = function(e) {
      if(!window.__hzDragging) return;
      const svg = document.getElementById('hz_svg_chart');
      if(!svg) return;
      e.preventDefault(); 
      
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      
      const h = 220; const padY = 30;
      const maxVal = window.__hzChartMaxVal || 1000;
      
      let val = (h - padY - loc.y) * maxVal / (h - padY * 2);
      if(val < 0) val = 0;
      
      const m = window.__hzModel;
      let totalBase = 0;
      m.rows.forEach(r => totalBase += r.baseExtrap);
      
      let pct = totalBase > 0 ? Math.round((val / totalBase) * 100) : 100;
      if(pct < 50) pct = 50;   // Sécurité basse
      if(pct > 250) pct = 250; // Sécurité haute
      
      window.hzGlobalCurveChange(pct);
  };


  // --- LE MOTEUR SVG DYNAMIQUE INTERACTIF ---
  function drawCurve(m2, m1, refM, target, isUpdating = false) {
      const h = 220; 
      const w = 1100; 
      const padX = 100;
      const padY = 30;
      
      // On fige l'échelle pendant le glissement pour ne pas que la souris "saute"
      const m = window.__hzModel;
      let totalBase = 0;
      m.rows.forEach(r => totalBase += r.baseExtrap);
      
      if(!window.__hzDragging && !isUpdating) {
          window.__hzChartMaxVal = Math.max(m2, m1, refM, totalBase * 2) * 1.05;
      }
      const maxVal = window.__hzChartMaxVal || 1000;

      const getY = (val) => h - padY - ((val / maxVal) * (h - padY * 2));
      
      const step = (w - padX * 2) / 3;
      const p0 = { x: padX, y: getY(m2) };
      const p1 = { x: padX + step, y: getY(m1) };
      const p2 = { x: padX + step * 2, y: getY(refM) };
      const p3 = { x: w - padX, y: getY(target) };

      const gridLines = [0, 0.5, 1].map(pct => {
          const y = getY(maxVal * pct);
          return `<line x1="${padX-40}" y1="${y}" x2="${w-padX+40}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4,4"/>
                  <text x="${padX-50}" y="${y+3}" fill="var(--muted)" font-size="10" font-family="monospace" font-weight="600" text-anchor="end">${fmtEUR(maxVal * pct)}</text>`;
      }).join('');

      const histPath = `M ${p0.x},${p0.y} L ${p1.x},${p1.y} L ${p2.x},${p2.y}`;
      const projPath = `M ${p2.x},${p2.y} L ${p3.x},${p3.y}`;

      const point = (p, label, val, isTarget=false) => {
          if(isTarget) {
              return `
              <g style="cursor:ns-resize;" onmousedown="window.hzStartDrag(event)">
                  <circle cx="${p.x}" cy="${p.y}" r="30" fill="transparent" />
                  
                  <circle cx="${p.x}" cy="${p.y}" r="20" fill="var(--good)" opacity="0.15" />
                  <circle cx="${p.x}" cy="${p.y}" r="7" fill="var(--bg)" stroke="var(--good)" stroke-width="3" />
                  <circle cx="${p.x}" cy="${p.y}" r="2" fill="var(--good)" />
                  
                  <path d="M${p.x - 4},${p.y - 12} L${p.x},${p.y - 16} L${p.x + 4},${p.y - 12} M${p.x - 4},${p.y + 12} L${p.x},${p.y + 16} L${p.x + 4},${p.y + 12}" fill="none" stroke="var(--good)" stroke-width="2" opacity="0.8"/>
                  
                  <rect x="${p.x - 40}" y="${p.y - 42}" width="80" height="20" fill="rgba(0,0,0,0.8)" rx="4" ry="4" stroke="rgba(255,255,255,0.1)"/>
                  <text x="${p.x}" y="${p.y - 28}" fill="var(--good)" font-size="11" font-weight="900" font-family="monospace" text-anchor="middle">${fmtEUR(val)}</text>
                  <text x="${p.x}" y="${h - 8}" fill="#fff" font-size="11" font-weight="800" font-family="sans-serif" text-anchor="middle">${label}</text>
              </g>`;
          } else {
              return `
              <circle cx="${p.x}" cy="${p.y}" r="4" fill="#38bdf8" stroke="var(--bg)" stroke-width="2"/>
              <rect x="${p.x - 35}" y="${p.y - 30}" width="70" height="18" fill="rgba(0,0,0,0.4)" rx="4" ry="4"/>
              <text x="${p.x}" y="${p.y - 18}" fill="#fff" font-size="10" font-weight="700" font-family="monospace" text-anchor="middle">${fmtEUR(val)}</text>
              <text x="${p.x}" y="${h - 8}" fill="var(--muted)" font-size="10" font-weight="700" font-family="sans-serif" text-anchor="middle">${label}</text>`;
          }
      };

      return `
      <svg id="hz_svg_chart" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
          ${gridLines}
          <path d="${histPath}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${projPath}" fill="none" stroke="${(window.__hzCurveMode==='suggestion'?'var(--good)':'#ff9f1a')}" stroke-width="3" stroke-dasharray="6,6" stroke-linecap="round"/>
          ${point(p0, 'M-2', m2)}
          ${point(p1, 'M-1', m1)}
          ${point(p2, 'M (Réf)', refM)}
          ${point(p3, 'Atterrissage M+1', target, true)}
      </svg>`;
  }

  // --- RENDU PARTIEL (60fps pour sliders) ---
  window.hzUpdateVisuals = function() {
      const m = window.__hzModel;
      let totalM2=0, totalM1=0, totalRef=0, totalObj=0, totalBase=0;
      
      m.rows.forEach(r => {
          totalM2 += r.caM2; totalM1 += r.caM1; totalRef += r.ref;
          totalObj += r.obj; totalBase += r.baseExtrap;
      });

      // Mémoire: Atterrissage Global M+1 (obj + budget nouveaux clients)
      try{
          window.__hzLandingGlobalM1 = (totalObj + (m.acqTotal||0));
      }catch(e){}

      // Budget Nouveaux Clients must impact chart target
      m.acqTotal = (Number(m.acqNb)||0) * (Number(m.acqPanier)||1500);

      const chartWrap = document.getElementById('hz_chart_wrapper');
      if(chartWrap) chartWrap.innerHTML = drawCurve(totalM2, totalM1, totalRef, (totalObj + (m.acqTotal||0)), true);

      // Mise à jour des Tuiles Zen
      GISEMENTS.forEach(g => {
          const group = m.rows.filter(r => r.gKey === g.key);
          const baseCA = group.reduce((s, r) => s + r.baseExtrap, 0);
          const objCA = group.reduce((s, r) => s + r.obj, 0);
          const maxCA = group.reduce((s, r) => s + (r.freq * r.basket), 0);
          let pct = baseCA > 0 ? Math.round((objCA / baseCA) * 100) : 100;
          if(baseCA === 0 && objCA > 0) pct = 150; 

          const elObj = document.getElementById(`hz_tuile_obj_${g.key}`);
          if(elObj) elObj.innerText = fmtEUR(objCA);

          // Badge "chez moi" (dirty/total) + glow + couleur du titre (rouge/vert)
          const dirtyCount = group.filter(r => Math.round(Number(r.obj||0)) !== Math.round(Number(r.__initObj||0))).length;
          const totalCount = group.length;

          const elBadge = document.getElementById(`hz_tuile_badge_${g.key}`);
          if(elBadge){
              elBadge.textContent = dirtyCount>0 ? `${dirtyCount}/${totalCount}` : `${totalCount}`;
              elBadge.classList.toggle("on", dirtyCount>0);
          }

          const elCard = document.getElementById(`hz_tuile_card_${g.key}`);
          if(elCard){
              elCard.classList.toggle("hzTileDirty", dirtyCount>0);
          }

          const elTitle = document.getElementById(`hz_tuile_title_${g.key}`);
          if(elTitle){
              const isActive = window.__hzActiveGisementFilter === g.key;
              const isFaded = window.__hzActiveGisementFilter !== "ALL" && !isActive;

              const refCA = group.reduce((s,r)=>s+(r.ref||0),0);
              const good = objCA >= refCA;
              elTitle.style.color = isFaded ? "var(--muted)" : (good ? "var(--good)" : "var(--bad)");
          }

// Si le Focus Studio est ouvert sur CE gisement, mettre à jour le tiroir
          if(window.__hzActiveGisementFilter === g.key) {
              const elPct = document.getElementById(`hz_tuile_pct_${g.key}`);
              if(elPct && document.activeElement !== elPct) elPct.value = pct;
              
              const elRange = document.getElementById(`hz_tuile_range_${g.key}`);
              if(elRange && document.activeElement !== elRange) elRange.value = pct;
          }
      });

      m.acqTotal = (Number(m.acqNb)||0) * (Number(m.acqPanier)||1500);
      const grandTotal = totalObj + m.acqTotal;
      
      const elAcq = document.getElementById('hz_acq_total');
      if(elAcq) elAcq.innerText = "+ " + fmtEUR(m.acqTotal);
      const elGt = document.getElementById('hz_grand_total');
      if(elGt) elGt.innerText = fmtEUR(grandTotal);

      const tbody = document.getElementById('hz_table_body');
      if(tbody) tbody.innerHTML = window.hzBuildTableRowsHTML();
  };

  // --- RENDU COMPLET ---
  window.hzRenderMasterGrid = function(forceFull = false) {
      const m = window.__hzModel;
      if(!m) return;
  
      let masterContainer = document.getElementById('hzAppContainer');
      if(!masterContainer) {
          masterContainer = document.createElement('div');
          masterContainer.id = 'hzAppContainer';
          document.getElementById('view-horizon').appendChild(masterContainer);
          forceFull = true;
      }
      
      if(!forceFull && masterContainer.innerHTML.trim() !== "") {
          window.hzUpdateVisuals();
          return;
      }
  
      let totalM2=0, totalM1=0, totalRef=0, totalObj=0, totalBase=0;
      m.rows.forEach(r => {
          totalM2 += r.caM2; totalM1 += r.caM1; totalRef += r.ref;
          totalObj += r.obj; totalBase += r.baseExtrap;
      });
  
      m.acqTotal = (Number(m.acqNb)||0) * (Number(m.acqPanier)||1500);
      const grandTotal = totalObj + m.acqTotal;
  
      // LE CONTENEUR GLOBAL CENTRÉ ET PRO
      let html = `<div style="max-width:1300px; margin:0 auto; width:100%; padding: 0 20px 60px 20px; box-sizing:border-box; font-family:sans-serif;">`;

      // HEADER
      html += `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:25px; width:100%;">
          <div style="display:flex; align-items:center;">
              <h2 style="margin:0; font-size:20px; font-weight:800; color:#fff; letter-spacing:0.5px;">
                  COCKPIT HORIZON
                  <span style="font-size:9px; font-weight:800; padding:4px 8px; background:rgba(56, 211, 159, 0.1); color:#38d39f; border-radius:8px; margin-left:12px; border:1px solid rgba(56,211,159,0.3); text-transform:uppercase; vertical-align:middle;">Ruissellement ALFRED</span>
              </h2>
          </div>
          <button class="ghost" onclick="window.closeALFREDHorizon()" style="border:1px solid rgba(255,255,255,0.2); padding:8px 16px; border-radius:6px; font-weight:600; cursor:pointer; color:var(--text); background:rgba(0,0,0,0.3); font-size:11px; text-transform:uppercase; letter-spacing:0.5px; transition:0.2s;">← Retour Dashboard</button>
      </div>`;

      // ==========================================
      // BLOC 1 : L'ÉCRAN RADAR (Direction)
      // ==========================================
      html += `
      <div style="display:flex; gap:20px; align-items: stretch; margin-bottom:20px;">
          <div style="flex:0 0 320px; background:var(--panel2); border:1px solid var(--stroke); border-radius:12px; padding:20px; display:flex; flex-direction:column; justify-content:space-between;">
              
              <div>
                  <div style="font-size:10px; text-transform:uppercase; color:var(--muted); font-weight:800; letter-spacing:1px; margin-bottom:4px;">Atterrissage Global M+1</div>
                  <div id="hz_grand_total" style="font-size:36px; font-weight:800; color:var(--good); font-family:monospace; line-height:1;">${fmtEUR(grandTotal)}</div>
              </div>
              
              <div style="margin-top:20px; background:rgba(56, 189, 248, 0.05); border:1px solid rgba(56, 189, 248, 0.2); padding:15px; border-radius:10px;">
                  <div style="font-size:10px; text-transform:uppercase; color:#38bdf8; font-weight:800; margin-bottom:8px;">Budget Nouveaux Clients</div>
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                      <div style="display:flex; gap:6px; align-items:center;">
                          <button class="ghost" style="border:1px solid rgba(56,189,248,0.3); padding:4px 10px; border-radius:6px; font-weight:900; color:#38bdf8; cursor:pointer;" onclick="const i=document.getElementById('hzAcqNb'); i.value=Math.max(0,(parseFloat(i.value)||0)-1); window.hzUpdAcq('nb', i.value);">−</button>
                          <input id="hzAcqNb" class="hzNoSpin" type="number" min="0" value="${m.acqNb}" oninput="window.hzUpdAcq('nb',this.value)" style="width:40px; background:rgba(0,0,0,0.5); border:1px solid rgba(56,189,248,0.3); color:#fff; border-radius:6px; padding:4px; text-align:center; font-weight:900; font-family:monospace; font-size:14px;">
                          <button class="ghost" style="border:1px solid rgba(56,189,248,0.3); padding:4px 10px; border-radius:6px; font-weight:900; color:#38bdf8; cursor:pointer;" onclick="const i=document.getElementById('hzAcqNb'); i.value=Math.max(0,(parseFloat(i.value)||0)+1); window.hzUpdAcq('nb', i.value);">+</button>
                      </div>
                      <div id="hz_acq_total" style="font-size:16px; font-weight:800; font-family:monospace; color:#38bdf8;">+ ${fmtEUR(m.acqTotal)}</div>
                  </div>
              </div>

              <div style="margin-top:20px; display:flex; flex-direction:column; gap:8px;">
                  <button onclick="window.hzResetAll()" class="ghost" style="text-align:left; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); padding:10px 12px; border-radius:8px; color:var(--muted); font-size:11px; font-weight:700; cursor:pointer; transition:0.2s;">
                      <span style="display:inline-block; width:20px;">📊</span> Objectif Mois de Réf (100%)
                  </button>
                  <button id="hzBtnProjection" onclick="window.hzAutoProject()" class="ghost" style="text-align:left; background:rgba(56, 189, 248, 0.08); border:1px solid rgba(56, 189, 248, 0.3); padding:10px 12px; border-radius:8px; color:#38bdf8; font-size:11px; font-weight:700; cursor:pointer; transition:0.2s; box-shadow:0 0 10px rgba(56,189,248,0.1);">
                      <span style="display:inline-block; width:20px;">🚀</span> Projection ALFRED
                  </button>
                  <button id="hzBtnSuggestObj" onclick="window.hzSuggestObjectives()" class="ghost" style="text-align:left; background:rgba(16, 185, 129, 0.08); border:1px solid rgba(16, 185, 129, 0.30); padding:10px 12px; border-radius:8px; color:rgba(16, 185, 129, 0.95); font-size:11px; font-weight:700; cursor:pointer; transition:0.2s; box-shadow:0 0 10px rgba(16,185,129,0.10);">
                      <span style="display:inline-block; width:20px;">✅</span> Suggestion d'objectifs ALFRED
                  </button>
              </div>

          </div>

          <div style="flex:1; background:var(--panel2); border:1px solid var(--stroke); border-radius:12px; padding:20px; position:relative; min-width:0;">
              <div style="position:absolute; top:20px; left:20px; font-size:10px; color:var(--muted); font-weight:800; text-transform:uppercase; letter-spacing:1px; display:flex; align-items:center; gap:6px;">
                  <span style="display:inline-block; width:8px; height:8px; background:var(--good); border-radius:50%; box-shadow:0 0 8px var(--good);"></span> 
                  Glissez le point Cible à la souris
              </div>
              <div id="hz_chart_wrapper" style="height:220px; width:100%; margin-top:20px;">
                  ${drawCurve(totalM2, totalM1, totalRef, (totalObj + (m.acqTotal||0)))}
              </div>
          </div>
      </div>`;

      // ==========================================
      // BLOC 2 : LES TUILES ZEN (Compactes)
      // ==========================================
      html += `<div style="display:grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom:20px;">`;
  
      GISEMENTS.forEach(g => {
          const group = m.rows.filter(r => r.gKey === g.key);
          const count = group.length;
          
          const baseCA = group.reduce((s, r) => s + r.baseExtrap, 0);
          const objCA = group.reduce((s, r) => s + r.obj, 0);
  
          const isActive = window.__hzActiveGisementFilter === g.key;
          const isFaded = window.__hzActiveGisementFilter !== "ALL" && !isActive;
          
          const borderStyle = isActive ? `1px solid ${g.color}` : `1px solid var(--stroke)`;
          const bgStyle = isActive ? `rgba(0,0,0,0.6)` : `rgba(0,0,0,0.2)`;
          const opacity = isFaded ? `0.5` : `1`;
          const transform = isActive ? `transform: translateY(-2px); box-shadow: 0 4px 15px rgba(0,0,0,0.5), 0 0 10px ${g.color}20;` : `box-shadow:none;`;
  
          html += `
          <div id="hz_tuile_card_${g.key}" class="kpi clickable hzGTile ${__hzGlowClassForGisement(g.key)}${(group.filter(r => Math.round(Number(r.obj||0)) !== Math.round(Number(r.__initObj||0))).length>0) ? ' hzTileDirty is-on' : ''}${((window.__hzActiveGisementFilter||'ALL')===g.key) ? ' is-on' : ''}" style="background:${bgStyle}; border:${borderStyle}; opacity:${opacity}; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px; cursor:pointer; transition:all 0.2s; ${transform}" 
               onclick="window.hzSetFilter('${g.key}')">

              <div style="position:relative; display:flex; justify-content:center;">
                  <svg id="hz_tuile_icon_${g.key}" class="tileIcon centered" aria-hidden="true"><use href="#${g.icon}"></use></svg>
                  ${(() => { 
                      const dirty = group.filter(r => Math.round(Number(r.obj||0)) !== Math.round(Number(r.__initObj||0))).length;
                      const total = group.length;
                      const txt = dirty>0 ? `${dirty}/${total}` : `${total}`;
                      const cls = dirty>0 ? "hzBadge on" : "hzBadge";
                      return `<div id="hz_tuile_badge_${g.key}" class="${cls}" style="position:absolute; top:-2px; right:-2px;">${txt}</div>`;
                  })()}
              </div>

              ${(() => {
                  const refCA = group.reduce((s,r)=>s+(r.ref||0),0);
                  const good = objCA >= refCA;
                  const titleColor = isFaded ? 'var(--muted)' : (good ? 'var(--good)' : 'var(--bad)');
                  return `<div id="hz_tuile_title_${g.key}" class="hzGTitle" style="font-weight:900; font-size:11px; color:${titleColor}; line-height:1.2; text-transform:uppercase; letter-spacing:0.6px;">${g.title}</div>`;
              })()}

              <div style="margin-top:auto; padding-top:8px;">
                  <div style="font-size:9px; color:var(--muted); font-weight:700; font-family:monospace; margin-bottom:2px;">Réf: ${fmtEUR(group.reduce((s,r)=>s+(r.ref||0),0))}</div>
                  <div id="hz_tuile_obj_${g.key}" style="font-size:15px; color:${isActive ? g.color : '#fff'}; font-weight:900; font-family:monospace;">${fmtEUR(objCA)}</div>
              </div>
          </div>`;
      });
      html += `</div>`;

      // ==========================================
      // BLOC 3 : LE STUDIO FOCUS (Tableau branché au dictionnaire)
      // ==========================================
      const activeGisement = GISEMENTS.find(g => g.key === window.__hzActiveGisementFilter);
      
      html += `<div id="hzFocusStudio">`;

      if (activeGisement) {
          const gKey = activeGisement.key;
          const group = m.rows.filter(r => r.gKey === gKey);
          const baseCA = group.reduce((s, r) => s + r.baseExtrap, 0);
          const objCA = group.reduce((s, r) => s + r.obj, 0);
          let pct = baseCA > 0 ? Math.round((objCA / baseCA) * 100) : 100;
          if(baseCA === 0 && objCA > 0) pct = 150; 

          html += `
          <div class="card" style="background:var(--panel2); border:1px solid ${activeGisement.color}40; border-radius:12px; padding:20px; box-shadow: 0 4px 20px ${activeGisement.color}10;">
              
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                  <h3 style="margin:0; font-size:16px; color:#fff; display:flex; align-items:center; gap:8px;">
                      <span>${activeGisement.icon}</span> Ajustement : ${activeGisement.title}
                  </h3>
                  
                  <div style="display:flex; align-items:center; gap:12px; background:rgba(0,0,0,0.3); padding:8px 15px; border-radius:8px; border:1px solid rgba(255,255,255,0.05); width:350px;">
                      <button class="ghost" style="border:1px solid var(--stroke); padding:4px 10px; border-radius:4px; font-weight:900; color:#fff; cursor:pointer;" onclick="window.hzStepGisement('${gKey}', -5)">-</button>
                      <input id="hz_tuile_pct_${gKey}" type="number" value="${pct}" class="hzNoSpin" style="width:50px; background:transparent; border:none; color:${activeGisement.color}; text-align:center; font-weight:900; font-family:monospace; font-size:16px;" oninput="window.hzUpdateGisement('${gKey}', this.value)">
                      <span style="color:var(--muted); font-weight:bold; font-size:12px; margin-left:-5px;">%</span>
                      <button class="ghost" style="border:1px solid var(--stroke); padding:4px 10px; border-radius:4px; font-weight:900; color:#fff; cursor:pointer;" onclick="window.hzStepGisement('${gKey}', 5)">+</button>
                      
                      <input id="hz_tuile_range_${gKey}" type="range" min="50" max="200" value="${pct}" style="flex:1; accent-color:${activeGisement.color}; cursor:pointer; margin-left:10px;" oninput="window.hzUpdateGisement('${gKey}', this.value)">
                  </div>
              </div>
              
              <div style="display:flex; justify-content:flex-end; margin-top:10px;">
                <button class="ghost" style="border:1px solid var(--stroke); padding:6px 12px; border-radius:8px; font-weight:800; cursor:pointer;"
                        onclick="window.hzRetourSuggestion && window.hzRetourSuggestion('${activeGisement.key}')">Retour Suggestion ALFRED</button>
              </div>

              ${buildTableWrapper(activeGisement)}
          </div>`;
      } else {
          // Vue "ALL"
          html += buildTableWrapper({ title: "Portefeuille complet", color: "var(--accent)" });
      }

      html += `</div>`; // Fin hzFocusStudio
      html += `</div>`; // Fin du wrapper global
  
      masterContainer.innerHTML = html;
  };

  function buildTableWrapper(activeGisement) {
      const m = window.__hzModel;
      const thStyle = "padding:12px 10px; border-bottom:1px solid var(--stroke); color:var(--muted); cursor:pointer; font-size:11px; font-weight:800; text-transform:uppercase;";
      const getCaret = (key) => m.sortCol === key ? (m.sortDir === 1 ? ' ▴' : ' ▾') : '';

      return `
      <div style="background:rgba(0,0,0,0.3); border:1px solid var(--stroke); border-radius:8px; overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left;">
              <thead style="background:rgba(255,255,255,0.02);">
                  <tr>
                      <th style="${thStyle} text-align:left;" onclick="window.hzSort('name')">Client${getCaret('name')}</th>
                      <th style="${thStyle} text-align:left;" onclick="window.hzSort('diagText')">Diagnostic${getCaret('diagText')}</th>
                      <th style="${thStyle} text-align:right;" onclick="window.hzSort('caM2')">M-2${getCaret('caM2')}</th>
                      <th style="${thStyle} text-align:right;" onclick="window.hzSort('caM1')">M-1${getCaret('caM1')}</th>
                      <th style="${thStyle} text-align:right;" onclick="window.hzSort('ref')">M (Réf)${getCaret('ref')}</th>
                      <th style="${thStyle} text-align:right;" onclick="window.hzSort('pctMax')">% Max${getCaret('pctMax')}</th>
                      <th style="${thStyle} text-align:right;" onclick="window.hzSort('pdp')">PdP${getCaret('pdp')}</th>
                      <th style="${thStyle} text-align:right; color:${activeGisement.color || 'var(--accent)'};" onclick="window.hzSort('baseExtrap')">Suggestion${getCaret('baseExtrap')}</th>
                      <th style="${thStyle} text-align:right;" onclick="window.hzSort('obj')">Cible €${getCaret('obj')}</th>
                      <th style="${thStyle} text-align:center;">Cmd</th>
                  </tr>
              </thead>
              <tbody id="hz_table_body">
                  ${window.hzBuildTableRowsHTML()}
              </tbody>
          </table>
      </div>`;
  }

  window.hzBuildTableRowsHTML = function() {
      const m = window.__hzModel;
      let activeRows = [];
      if (window.__hzActiveGisementFilter !== "ALL") {
          activeRows = m.rows.filter(r => r.gKey === window.__hzActiveGisementFilter);
      } else {
          activeRows = [...m.rows]; // FIX SPREAD : Clone le tableau pour le tri visuel, protège l'original
      }
      
      let html = "";
      activeRows.forEach(r => {
          let cmdDisplay = Math.round(r.obj / r.basket);
          const isOverFreq = (r.freq > 0 && cmdDisplay > r.freq);
          const rowBg = isOverFreq ? "background:rgba(255, 77, 77, 0.08); border-bottom:1px solid rgba(255, 77, 77, 0.3);" : "border-bottom:1px solid rgba(255,255,255,0.03);";

          let inputBg = "rgba(56, 211, 159, 0.1)";
          let inputBorder = "1px solid #38d39f";
          let inputColor = "#38d39f";
          let nameColor = "#e2e8f0"; 
          
          if (r.obj < r.ref) {
              inputBg = "rgba(255, 93, 93, 0.08)";
              inputBorder = "1px solid #ff5d5d";
              inputColor = "#ff5d5d";
          }
          if (r.obj === r.ref && r.ref === 0) {
              inputBg = "rgba(0,0,0,0.3)";
              inputBorder = "1px solid var(--stroke)";
              inputColor = "#fff";
          }
          if(isOverFreq) { 
              inputBg = "rgba(255,77,77,0.1)"; 
              inputBorder = "1px solid #ff4d4d"; 
              inputColor = "#ff4d4d"; 
          }
  
          html += `
          <tr style="${rowBg}">
              <td style="padding:12px 10px; word-break:break-word;">
                  <div style="font-weight:700; font-size:12px; color:${nameColor};">${esc(r.name)}</div>
                  <div class="small" style="font-weight:600; margin-top:4px; color:var(--muted); font-size:10px;">${esc(r.segment)}</div>
              </td>
              <td style="padding:12px 10px; text-align:left;">
                  <span style="font-size:10px; font-weight:800; padding:3px 6px; border-radius:4px; border:1px solid ${r.diagColor}40; color:${r.diagColor}; background:${r.diagColor}10;">${esc(r.diagText)}</span>
              </td>
              <td style="padding:12px 10px; text-align:right; color:var(--muted); font-weight:600; font-family:monospace; font-size:12px;">${fmtEUR(r.caM2)}</td>
              <td style="padding:12px 10px; text-align:right; color:var(--muted); font-weight:600; font-family:monospace; font-size:12px;">${fmtEUR(r.caM1)}</td>
              <td style="padding:12px 10px; text-align:right; font-weight:900; color:${r.ref===0?'rgba(255,255,255,0.3)':'#fff'}; font-family:monospace; font-size:12px;">${fmtEUR(r.ref)}</td>
              <td style="padding:12px 10px; text-align:right; color:var(--muted); font-weight:800; font-family:monospace; font-size:12px;">${fmtPct(r.pctMax)}</td>
              <td style="padding:12px 10px; text-align:right; font-weight:800; color:#fff; font-family:monospace; font-size:12px;">${r.pdp != null && r.pdp > 0 ? fmtPct(r.pdp) : '—'}</td>
              <td style="padding:12px 10px; text-align:right; color:var(--accent); font-weight:900; font-family:monospace; font-size:13px;">${fmtEUR(r.baseExtrap)}</td>
              <td style="padding:12px 10px; text-align:right;">
                  <input type="number" class="hzNoSpin" value="${Math.round(r.obj)}" style="width:75px; background:${inputBg}; border:${inputBorder}; color:${inputColor}; padding:6px; border-radius:6px; text-align:right; font-weight:900; font-family:monospace; font-size:12px;" onchange="window.hzUpdRowEur('${esc(r.id)}', this.value)">
                  ${isOverFreq ? `<div style="color:#ff4d4d; font-size:9px; font-weight:bold; margin-top:4px; line-height:1.1;">⚠️ PdP (${Math.round(r.freq)})</div>` : ''}
              </td>
              <td style="padding:12px 10px; text-align:right;">
                  <div style="display:flex; gap:4px; justify-content:flex-end; align-items:center;">
                      <button class="ghost" style="padding:2px 6px; border-radius:4px; border:1px solid ${isOverFreq ? '#ff4d4d' : 'var(--stroke)'}; font-weight:900; font-size:11px; cursor:pointer; color:${isOverFreq ? '#ff4d4d' : 'inherit'}" onclick="window.hzStepOrders('${esc(r.id)}', -1)">-</button>
                      <div style="min-width:20px; text-align:center; font-weight:900; font-family:monospace; font-size:12px; color:${isOverFreq ? '#ff4d4d' : 'inherit'}">${cmdDisplay}</div>
                      <button class="ghost" style="padding:2px 6px; border-radius:4px; border:1px solid ${isOverFreq ? '#ff4d4d' : 'var(--stroke)'}; font-weight:900; font-size:11px; cursor:pointer; color:${isOverFreq ? '#ff4d4d' : 'inherit'}" onclick="window.hzStepOrders('${esc(r.id)}', 1)">+</button>
                  </div>
              </td>
          </tr>`;
      });
      return html;
  };

  window.hzSort = function(key){
      const m = window.__hzModel;
      if(!m) return;
      if(m.sortCol === key) {
          m.sortDir *= -1;
      } else { 
          m.sortCol = key; 
          m.sortDir = -1; 
      }

      // IMPORTANT: tri uniquement sur action utilisateur (clic entête).
      // Aucune auto-réorganisation lors des updates (steppers / inputs).
      try{
          m.rows.sort((a,b)=>{
              const valA = a[m.sortCol];
              const valB = b[m.sortCol];
              if (typeof valA === "string") return String(valA).localeCompare(String(valB)) * m.sortDir;
              return ((valA || 0) - (valB || 0)) * m.sortDir;
          });
      }catch(_e){}

      window.hzRenderMasterGrid(true); 
  };

  window.hzUpdRowEur = function(id, val) {
      const m = window.__hzModel;
      const r = m.rows.find(x => x.id === id);
      if(!r) return;
      r.obj = parseFloat(val) || 0;
      window.__hzManualOverrides.set(r.id, r.obj);
      window.hzUpdateVisuals();
  };

  window.hzStepOrders = function(id, delta) {
      const m = window.__hzModel;
      const r = m.rows.find(x => x.id === id);
      if(!r) return;
      let currentCmd = Math.round(r.obj / r.basket);
      let nextCmd = Math.max(0, currentCmd + delta);
      r.obj = nextCmd * r.basket;
      window.__hzManualOverrides.set(r.id, r.obj);
      window.hzUpdateVisuals();
  };

})();