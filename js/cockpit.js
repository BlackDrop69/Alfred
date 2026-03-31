
var monthsBetweenISO = window.monthsBetweenISO;

(function(){
  // --- Module original (adapté pour éviter erreurs si éléments absents) ---
/* === MODULE COCKPIT CLIENT (JS) === */

var __cdLastTxs = null;
var __cdResizeObs = null;

// Helper pour fermer la modale
document.getElementById("btnCloseClientDetail").onclick = function() {
  document.getElementById("clientDetailModal").style.display = "none";
};

// Toggle SAISONNALITÉ <-> PANIER MOYEN (moyenne mensuelle)
(function(){
  var btn = document.getElementById("btnToggleSeaBasket");
  if(!btn) return;
  btn.addEventListener("click", function(){
    __cdSeaBasketMode = (__cdSeaBasketMode === "season") ? "basket" : "season"; window.__cdSeaBasketMode = __cdSeaBasketMode;
    var ti = document.getElementById("cdSeasonBasketTitle");
    var sub = document.getElementById("cdSeasonBasketSubtitle");
    if(__cdSeaBasketMode === "basket"){
      if(ti) ti.textContent = "PANIER MOYEN — moyenne mensuelle (durée de vie)";
      window.__cdSeaBasketMode = __cdSeaBasketMode;
      if(sub) sub.textContent = "Abscisse : mois · Ordonnée : panier moyen HT (€/facture)";
      btn.textContent = "Voir saisonnalité";
    }else{
      if(ti) ti.textContent = "SAISONNALITÉ (Moyenne commandes par mois)";
      if(sub) sub.textContent = "Abscisse : Jan→Déc · Ordonnée : moyenne commandes/mois";
      btn.textContent = "Voir panier moyen";
    }
    var __last = window.__cdLastTxs || __cdLastTxs;
    if(__last && Array.isArray(__last) && __last.length){
      try{ renderClientCharts(__last); }catch(e){}
    }
  });
})();;

// Helper couleur segment
function getSegColorClass(seg) {
  if(!seg) return "bg-one";
  const s = seg.toLowerCase();
  if(s.includes("vip")) return "bg-vip";
  if(s.includes("rég") || s.includes("reg")) return "bg-reg";
  if(s.includes("pot")) return "bg-pot";
  if(s.includes("nouv")) return "bg-new";
  if(s.includes("risq")) return "bg-risk";
  if(s.includes("dorm") || s.includes("perdu")) return "bg-dorm";
  return "bg-one";
}

/** =========================
 * Point d’injection UI (évolutions futures)
 * ========================= */
function renderExtraPanels(ctx){
  // ctx = { client, txs }
  // Point d’injection officiel : ajouter ici des panels UI (ex: FOCUS) sans toucher au rendu principal.
}

// FONCTION PRINCIPALE : OUVRIR LA FICHE

function getClientPotManual(key){
  try{
    const v = state.meta?.potManual ? state.meta.potManual[key] : null;
    if(v==null) return null;
    const n = Number(v);
    return (isFinite(n) && n>0) ? n : null;
  }catch(e){ return null; }
}
function setClientPotManual(key, val){
  try{
    if(!state.meta) state.meta = {potManual:Object.create(null)};
    if(!state.meta.potManual) state.meta.potManual = Object.create(null);
    const n = (window.__parseIntFr ? window.__parseIntFr(val) : Number(String(val||"").replace(/[^0-9\-]/g,"")));
    if(!isFinite(n) || n<=0){
      delete state.meta.potManual[key];
    }else{
      state.meta.potManual[key]=n;
    }
    LS.set("meta", state.meta);
    // refresh cached fields for client if exists
    const c = state.clients?.find(x=>x.name===key);
    if(c){
      c.potManual = getClientPotManual(key);
      c.penetration = (c.potManual && c.potManual>0) ? (c.ca12mCur/c.potManual) : null;
    }
  }catch(e){ console.warn("[PotManual] set failed", e); }
}
// expose to global for inline handlers
window.setClientPotManual = setClientPotManual;

window.__fmtIntFr = function(n){
  const v = Number(n);
  if(!isFinite(v)) return "";
  return Math.round(v).toLocaleString('fr-FR',{minimumFractionDigits:0, maximumFractionDigits:0});
};
window.__parseIntFr = function(s){
  const txt = String(s||"").replace(/[\s\u202F\u00A0]/g,'').replace(/[^0-9\-]/g,'');
  const n = Number(txt);
  return isFinite(n) ? n : NaN;
};
window.__fmtPotInput = function(el){
  try{
    const raw = String(el.value||"");
    const n = window.__parseIntFr(raw);
    if(!isFinite(n)) return;
    // try to preserve caret from end
    const endFromRight = raw.length - (el.selectionStart||raw.length);
    el.value = window.__fmtIntFr(n);
    const pos = Math.max(0, el.value.length - endFromRight);
    el.setSelectionRange(pos,pos);
  }catch(e){}
};
window.getClientPotManual = getClientPotManual;

// live update penetration chip in cockpit (no full recalc)
window.__cdUpdPen = function(inputEl){
  try{
    const ca12 = Number(inputEl?.dataset?.ca12)||0;

    // FIX : On nettoie les séparateurs de milliers avant de convertir en nombre
    const rawVal = inputEl?.value || "";
    const v = window.__parseIntFr ? window.__parseIntFr(rawVal) : Number(String(rawVal).replace(/[\s\u202F\u00A0]/g,'').replace(/[^0-9\-]/g,'')) || 0;

    const pen = (v>0 && ca12>0) ? (ca12/v) : null;
    const el = document.getElementById('cdPenVal');
    if(!el) return;
    if(pen==null){
      el.textContent='—';
      el.style.opacity='0.25';
      return;
    }
    el.textContent = Math.round(Math.max(0, Math.min(9.99, pen))*100) + '%';
    el.style.opacity='1';
  }catch(e){}
};

window.openClientDetail = openClientDetail;
function openClientDetail(clientName) {
  // 0. Sécurité : Nettoyage et décodage du nom reçu
  if (!clientName) return;

  let searchName = String(clientName).trim();
  // Astuce JS pour décoder les caractères HTML (ex: &amp; -> &)
  let __txtDecode = document.createElement("textarea");
  __txtDecode.innerHTML = searchName;
  searchName = __txtDecode.value.trim();

  // 1. Récupération des données avec tolérance d'espaces
  const c = state.clients.find(x => 
    x.name === searchName || 
    x.name.trim() === searchName ||
    x.name.toLowerCase() === searchName.toLowerCase()
  );

  // 2. Sécurité anti-crash
  if (!c) {
    console.error("⚠️ ALFRED Erreur : Client introuvable dans la base ->", clientName);
    alert("Impossible de charger les données de : " + clientName);
    return; // On stoppe l'exécution ici pour ne pas faire planter le cockpit
  }

  // 3. Fermeture propre de la modale ALFRED pour laisser la place au cockpit
  const modalALFRED = document.getElementById('modalALFREDDrill');
  if (modalALFRED) modalALFRED.style.display = 'none';

  // On récupère TOUT l'historique brut du CSV pour ce client
    const canon = (c && c.name) ? String(c.name) : String(searchName);
  const canonLC = canon.toLowerCase();
  const txs = (state.tx||[])
    .filter(t=>{
      if(!t || !t.dateISO) return false;
      const cc = (t.clientCanon!=null) ? String(t.clientCanon) : (t.client!=null ? String(t.client) : "");
      return cc === canon || cc === searchName || cc === clientName || cc.trim()===canon.trim() || cc.toLowerCase()===canonLC;
    })
    .sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""));
  
  if (!c || !txs.length) return alert("Données client introuvables");

  // 2. Remplissage Header
  document.getElementById("cdName").textContent = c.name;
  document.getElementById("cdMeta").innerHTML = (function(){
    const k = c.name;
    const pm = getClientPotManual(k);
    const maxCA = isFinite(c.maxCA12m)?c.maxCA12m:0;
    const pctMax = (maxCA>0 ? (isFinite(c.ca12mCur)?(c.ca12mCur/maxCA):0) : 0);
    const pen = (pm && pm>0) ? ((isFinite(c.ca12mCur)?c.ca12mCur:0)/pm) : null;

    const pmTxt = (pm!=null?window.__fmtIntFr(pm):"");

    const fK = (n)=>{
      const v = Number(n)||0;
      // format exact (pas de k€ / M€)
      return (isFinite(v)?Math.round(v):0).toLocaleString('fr-FR',{minimumFractionDigits:0, maximumFractionDigits:0}) + ' €';
    };
    const fPct = (x)=>{
      let v = Number(x);
      if(!isFinite(v) || v<0) return "—";
      // tolérance: si la valeur ressemble déjà à un pourcentage (ex 25), la convertir en ratio
      if(v>1.5 && v<=100) v = v/100;
      const p = Math.max(0, Math.min(9.99, v))*100;
      return Math.round(p)+'%';
    };

    // input pill (same look as chip)
    const inputHTML = (valTxt, ca12)=>`
      <span class="chip" style="gap:8px;">
        <span style="opacity:.85;">Potentiel estimé :</span>
        <input id="cdPotManual" type="text" inputmode="numeric" value="${valTxt||""}"
          style="width:88px; background:transparent; border:none; outline:none; color:#fff; font-weight:900; text-align:right; font-family:var(--mono); font-size:12px; line-height:14px; padding:0; margin:0; height:14px;"
          autocomplete="off" spellcheck="false"
          data-key="${encodeURIComponent(k)}" data-ca12="${Number(ca12)||0}"
          oninput="window.__fmtPotInput(this); setClientPotManual(decodeURIComponent(this.dataset.key), this.value); try{window.__cdUpdPen && window.__cdUpdPen(this);}catch(e){}"
          onblur="window.__fmtPotInput(this)"
          onchange="try{recalcAll();}catch(e){}" placeholder="…">
      </span>`;

    const penTxt = (pm && pm>0) ? fPct(pen) : "—";
    return `
      <span class="chip ${chipClass(c.segment)}">${c.segment}</span>
    `;

  })()

  // KPIs segment (affichage: 3e ligne sous la grille)
  try{
    const k = c.name;
    const pm = (typeof getClientPotManual==="function") ? getClientPotManual(k) : null;

    const maxCA = isFinite(c.maxCA12m)?c.maxCA12m:0;
    const pctMax = (maxCA>0 ? (isFinite(c.ca12mCur)?(c.ca12mCur/maxCA):0) : 0);
    const pen = (pm && pm>0) ? ((isFinite(c.ca12mCur)?c.ca12mCur:0)/pm) : null;

    const fK = (n)=>{
      const v = Number(n)||0;
      return (isFinite(v)?Math.round(v):0).toLocaleString('fr-FR',{minimumFractionDigits:0, maximumFractionDigits:0}) + ' €';
    };
    const fPct = (x)=>{
      let v = Number(x);
      if(!isFinite(v) || v<0) return "—";
      if(v>1.5 && v<=100) v = v/100;
      const p = Math.max(0, Math.min(9.99, v))*100;
      return Math.round(p)+'%';
    };

    const elMax = document.getElementById("cdMaxCA");
    if(elMax) elMax.textContent = fK(maxCA);

    const elPct = document.getElementById("cdPctMax");
    if(elPct) elPct.textContent = fPct(pctMax);

    const elPen = document.getElementById("cdPenVal");
    if(elPen){
      const penTxt = (pm && pm>0) ? fPct(pen) : "—";
      elPen.textContent = penTxt;
      elPen.style.opacity = (pm && pm>0) ? "1" : "0.25";
    }

    const inp = document.getElementById("cdPotManual");
    if(inp){
      const pmTxt = (pm!=null?window.__fmtIntFr(pm):"");
      inp.value = pmTxt;
      inp.dataset.key = encodeURIComponent(k);
      inp.dataset.ca12 = String(Number(c.ca12mCur)||0);
      inp.style.opacity = (pm && pm>0) ? "1" : "0.9";
    }
  }catch(e){}

;

  // KPIs Temporels
  const first = txs[0].dateISO;
  const last = txs[txs.length-1].dateISO;
  const d1 = new Date(first); const d2 = new Date(last);
  const diffM = (d2.getFullYear()-d1.getFullYear())*12 + (d2.getMonth()-d1.getMonth());
  
  document.getElementById("cdFirstDate").textContent = fmtDateISO(first);
  document.getElementById("cdLastDate").textContent = fmtDateISO(last);
  document.getElementById("cdTenure").textContent = diffM >= 12 ? `${Math.floor(diffM/12)} ans ${diffM%12} mois` : `${diffM} mois`;
  document.getElementById("cdTotalOrders").textContent = txs.length;

  // KPIs Financiers
  const totalLifeCA = txs.reduce((s, t) => s + t.amountHT, 0);
  const maxInv = Math.max(...txs.map(t => t.amountHT));
  document.getElementById("cdLifeCA").textContent = fmtEUR(totalLifeCA);
  document.getElementById("cdAvgBasket").textContent = fmtEUR(totalLifeCA / txs.length);
  try{
    const elAvgM = document.getElementById("cdAvgMonthlyCA");
    if(elAvgM){
      const firstISO = (txs[0] && txs[0].dateISO) ? txs[0].dateISO : null;
      const lastISO  = (txs[txs.length-1] && txs[txs.length-1].dateISO) ? txs[txs.length-1].dateISO : null;
      let months = 0;
      if(firstISO && lastISO){
        // inclusive months count (>=1)
        const y1 = parseInt(firstISO.slice(0,4),10), m1 = parseInt(firstISO.slice(5,7),10);
        const y2 = parseInt(lastISO.slice(0,4),10),  m2 = parseInt(lastISO.slice(5,7),10);
        if(Number.isFinite(y1)&&Number.isFinite(m1)&&Number.isFinite(y2)&&Number.isFinite(m2)){
          months = (y2*12 + (m2-1)) - (y1*12 + (m1-1)) + 1;
        }
      }
      if(!months || months<1) months = 1;
      elAvgM.textContent = fmtEUR(totalLifeCA / months);
    }
  }catch(e){}

  document.getElementById("cdMaxInv").textContent = fmtEUR(maxInv);
  // CA 3 derniers mois (calendaire) : M3 (le plus ancien) → M2 → M1 (mois courant à date)
  try{
    const asOfISO = (typeof _asOfISO==="function") ? _asOfISO() : (state.ui?.asOfISO || state.asOfISO || "");
    const asOf = (typeof _parseISO==="function") ? _parseISO(asOfISO) : new Date(asOfISO);

    // utilitaires dates (UTC)
    function utcDate(y,m,d){ return new Date(Date.UTC(y,m,d,0,0,0,0)); }
    function utcEndOfDay(y,m,d){ return new Date(Date.UTC(y,m,d,23,59,59,999)); }
    function lastDayOfMonthUTC(y,m){ return new Date(Date.UTC(y, m+1, 0)).getUTCDate(); }
    function safeDay(y,m,d){
      const ld = lastDayOfMonthUTC(y,m);
      return Math.min(d, ld);
    }
    function monthLabelFR(d){
      try{
        const s = new Intl.DateTimeFormat("fr-FR",{month:"long", year:"numeric"}).format(d);
        return s.charAt(0).toUpperCase() + s.slice(1);
      }catch(_){
        return d.toISOString().slice(0,7);
      }
    }

    function sumBetween(d0, d1){
      let s=0, any=false;
      for(const t of txs){
        if(!t.dateISO) continue;
        const d = (typeof _parseISO==="function") ? _parseISO(t.dateISO) : new Date(t.dateISO);
        if(d>=d0 && d<=d1){ s += (isFinite(t.amountHT)?t.amountHT:0); any=true; }
      }
      return {sum:s, any};
    }

    const y = asOf.getUTCFullYear();
    const m = asOf.getUTCMonth();
    const day = asOf.getUTCDate();

    // M1 = mois courant (du 1er au jour de la date de référence)
    const m1Start = utcDate(y, m, 1);
    const m1End   = utcEndOfDay(y, m, lastDayOfMonthUTC(y, m));

    // M2 = mois précédent (complet)
    const m2m = m-1;
    const m2y = (m2m<0) ? (y-1) : y;
    const m2mm = (m2m<0) ? (m2m+12) : m2m;
    const m2Start = utcDate(m2y, m2mm, 1);
    const m2End   = utcEndOfDay(m2y, m2mm, lastDayOfMonthUTC(m2y, m2mm));

    // M3 = mois encore avant (complet)
    const m3m_raw = m-2;
    const m3y = (m3m_raw<0) ? (y-1) : y;
    const m3mm = (m3m_raw<0) ? (m3m_raw+12) : m3m_raw;
    // si m=0 (janvier), m-2=-2 => année-1 ok, mois 10 (novembre) : correct.
    // si m=1 (février), m-2=-1 => année-1 ok, mois 11 (décembre) : correct.
    const m3Start = utcDate(m3y, m3mm, 1);
    const m3End   = utcEndOfDay(m3y, m3mm, lastDayOfMonthUTC(m3y, m3mm));

    function fillOne(prefix, start, end){
      const cur = sumBetween(start, end);

      // N-1 (même fenêtre calendaire)
      const yN1 = start.getUTCFullYear() - 1;
      const mN1 = start.getUTCMonth();
      let startN1, endN1;

      // mois complet : 1er → dernier jour du mois
      startN1 = utcDate(yN1, mN1, 1);
      endN1   = utcEndOfDay(yN1, mN1, lastDayOfMonthUTC(yN1, mN1));
      const prev = sumBetween(startN1, endN1);

      // UI
      const elLabel = document.getElementById("cd"+prefix+"Label");
      const elVal   = document.getElementById("cd"+prefix+"Val");
      const elN1    = document.getElementById("cd"+prefix+"N1");
      const elVar   = document.getElementById("cd"+prefix+"Var");

      if(elLabel) elLabel.textContent = monthLabelFR(start);
      if(elVal)   elVal.textContent   = fmtEUR(cur.sum);

      if(elN1){
        const yr = startN1.getUTCFullYear();
        elN1.textContent = prev.any ? (yr + " : " + fmtEUR(prev.sum)) : (yr + " : NC");
      }

      if(elVar){
        if(prev.any && prev.sum !== 0){
          const v = (cur.sum - prev.sum) / prev.sum;
          const pct = (v*100);
          const sign = pct>0 ? "+" : "";
          const delta = (cur.sum - prev.sum);
          const signV = delta>0 ? "+" : "";
          elVar.textContent = "Variation : " + signV + fmtEUR(delta) + " (" + sign + pct.toFixed(1) + "%)";
          elVar.style.color = pct>0 ? "var(--good)" : (pct<0 ? "var(--bad)" : "var(--muted)");
        }else{
          elVar.textContent = "Variation : NC";
          elVar.style.color = "var(--muted)";
        }
      }
    }

    // Remplissage dans l’ordre demandé : M3 (ancien) → M2 → M1 (récent)
    fillOne("M3", m3Start, m3End);
    fillOne("M2", m2Start, m2End);
    fillOne("M1", m1Start, m1End);

  }catch(e){
    const ids = ["M3Label","M3Val","M3N1","M3Var","M2Label","M2Val","M2N1","M2Var","M1Label","M1Val","M1N1","M1Var"];
    for(const id of ids){
      const el = document.getElementById("cd"+id);
      if(!el) continue;
      if(id.endsWith("Label")) el.textContent="—";
      else if(id.endsWith("Val")) el.textContent="—";
      else if(id.endsWith("Var")){ el.textContent="Variation : NC"; el.style.color="var(--muted)"; }
      else el.textContent="—";
    }
  }
  // Tendance TF
  const tfEl = document.getElementById("cdTrend");
  if (Number.isFinite(c.tf)) {
    const isPos = c.tf > 0;
    tfEl.style.color = isPos ? "var(--good)" : (c.tf < -0.1 ? "var(--bad)" : "var(--muted)");
    tfEl.textContent = (isPos ? "↗ +" : "↘ ") + (c.tf * 100).toFixed(0) + "%";
  } else {
    tfEl.textContent = "NC";
    tfEl.style.color = "var(--muted)";
  }

  

  // pastille TF (mêmes seuils visuels que TD)
  const tfDot = document.getElementById("cdTrendDot");
  try{
    if(tfDot && Number.isFinite(c.tf)){
      const v = c.tf * 100;
      let cls = "neutral";
      if(v >= 0) cls = "green";
      else if(v >= -25) cls = "amber";
      else if(v >= -50) cls = "orange";
      else cls = "red";
      tfDot.className = "kpi-dot " + cls;
    }else if(tfDot){
      tfDot.className = "kpi-dot neutral";
    }
  }catch(e){ if(tfDot) tfDot.className="kpi-dot neutral"; }
  // Dynamique TD (valeur directe : signe cohérent calcul/affichage)
  const tdEl = document.getElementById("cdTD");
  try{
    const tdInt = _tdValuePercent(c);
    if(tdEl && tdInt!=null && isFinite(tdInt)){
      const tdDisp = tdInt; // valeur directe (pas d'inversion)
      const tdPct = Math.round(tdDisp);
      const isPos = tdDisp > 0;
      tdEl.style.color = isPos ? "var(--good)" : (tdDisp < -10 ? "var(--bad)" : "var(--muted)");
      tdEl.textContent = (isPos ? "↗ +" : "↘ ") + Math.abs(tdPct) + "%";
      if(tdPct<0) tdEl.textContent = "↘ " + tdPct + "%"; // conserve le signe -
      // pastille TD (basée sur la valeur affichée tdDisp)
      let tdDot = document.getElementById("cdTDDot");
      try{
        if(tdDot){
          const v = tdDisp; // déjà inversé pour l'affichage
          let cls = "neutral";
          if(v >= 0) cls = "green";
          else if(v >= -25) cls = "amber";
          else if(v >= -50) cls = "orange";
          else cls = "red";
          tdDot.className = "kpi-dot " + cls;
        }
      }catch(e){ if(document.getElementById("cdTDDot")) document.getElementById("cdTDDot").className="kpi-dot neutral"; }

    }else if(tdEl){
      tdEl.textContent = "NC";
      tdEl.style.color = "var(--muted)";
      tdDot = document.getElementById("cdTDDot");
      if(tdDot) tdDot.className = "kpi-dot neutral";
      tdDot = document.getElementById("cdTDDot");
      if(tdDot) tdDot.className = "kpi-dot neutral";
    }
  }catch(e){
    if(tdEl){
      tdEl.textContent = "NC";
      tdEl.style.color = "var(--muted)";
      tdDot = document.getElementById("cdTDDot");
      if(tdDot) tdDot.className = "kpi-dot neutral";
    }
  }


// 3-4. GRAPHIQUES FICHE CLIENT (Canvas 2×2, robuste et évolutif)
// (rendu différé après affichage de la modale pour éviter canvas 0×0)

// 3-3 bis. HISTORIQUE DE VIE (segments trimestriels)
  try{ renderClientLifeTimeline(c.name); }catch(e){ console.warn("[AppRFM] Life timeline error", e); }

  // Matrice TF×TD (visuel cockpit)
  try{ renderTFTDMatrix(c); }catch(e){}

// 5. Alerte Tendance// 5. Alerte Tendance
  const box = document.getElementById("cdAlertBox");
  const ti = document.getElementById("cdAlertTitle");
  const txt = document.getElementById("cdAlertText");
  
  if (c.tf < -0.25) {
    box.style.display = "block";
    box.style.background = "rgba(255,93,93,.15)";
    box.style.border = "1px solid rgba(255,93,93,.3)";
    ti.textContent = "⚠️ RALENTISSEMENT DÉTECTÉ";
    ti.style.color = "#ff8888";
    txt.textContent = `Le rythme d'achat baisse significativement (${(c.tf*100).toFixed(0)}%). Vérifier si le client part à la concurrence. ${c.tfNote||""}`;
  } else if (c.tf > 0.5) {
    box.style.display = "block";
    box.style.background = "rgba(56,211,159,.15)";
    box.style.border = "1px solid rgba(56,211,159,.3)";
    ti.textContent = "🚀 ACCÉLÉRATION MASSIVE";
    ti.style.color = "#88ffcc";
    txt.textContent = `Le client achète beaucoup plus vite qu'avant (+${(c.tf*100).toFixed(0)}%). Opportunité de fidélisation ou gros chantier en cours.`;
  } else {
    box.style.display = "none";
  }

  // 6. Time Machine (Frise historique) — toute la durée de vie, pas de 2 mois
  const strip = document.getElementById("historyStrip");
  if(strip){
    strip.innerHTML = "<div class='small muted'>Calcul de l'historique...</div>";

  setTimeout(() => {
    strip.innerHTML = "";
    if(!txs.length){
      strip.innerHTML = "<div class='small muted'>Aucune donnée</div>";
      return;
    }

    const firstISO = txs[0].dateISO;
    const lastISO = txs[txs.length-1].dateISO;
    const start = new Date(firstISO + 'T00:00:00Z');
    const end = new Date(lastISO + 'T00:00:00Z');

    // on aligne sur des fins de mois
    const startM = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const endM = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

    // utilitaires locaux (pour ne pas dépendre de la période sélectionnée)
    function monthsDiff(a,b){ return (b.getUTCFullYear()-a.getUTCFullYear())*12 + (b.getUTCMonth()-a.getUTCMonth()); }
    function endOfMonthUTC(y,m){ return new Date(Date.UTC(y, m+1, 0)); }

    const p = Object.assign({}, (state.params||{}), { periodMonths: 'ALL' });

    // set dates uniques (factures) pour TF
    function uniqDateSet(sub){
      const s = new Set();
      sub.forEach(t=>{ if(t.dateISO) s.add(t.dateISO); });
      return s;
    }

    const totalMonths = monthsDiff(startM, endM);
    const step = 2;

    for(let mi=0; mi<=totalMonths; mi+=step){
      const cur = new Date(Date.UTC(startM.getUTCFullYear(), startM.getUTCMonth()+mi, 1));
      const ref = endOfMonthUTC(cur.getUTCFullYear(), cur.getUTCMonth()+ (step-1));
      if(ref < start) continue;
      if(ref > end) break;

      const subTxs = txs.filter(t => new Date(t.dateISO+'T00:00:00Z') <= ref);

      let seg = null;
      if(subTxs.length){
        const lastTx = subTxs[subTxs.length-1];
        const rec = Math.round((ref - new Date(lastTx.dateISO+'T00:00:00Z'))/86400000);

        const yearsSpanSel = Math.max(1e-6, ((ref - new Date(subTxs[0].dateISO+'T00:00:00Z')) / (365.25*24*3600*1000)));
        const freq = subTxs.length;
        const mht = subTxs.reduce((s,t)=>s+(t.amountHT||0),0);

        // fréquence normalisée sur toute la période (ALL)
        const monthsSpan = Math.max(1, Math.round((ref - new Date(subTxs[0].dateISO+'T00:00:00Z')) / (30.4375*24*3600*1000)));
        let fMetric = freq;
        const mode = (p.freqMode || 'annual');
        if(mode === 'monthly'){
          fMetric = freq / monthsSpan;
        } else {
          const yearsSpan = monthsSpan / 12;
          fMetric = freq / Math.max(1e-6, yearsSpan);
        }

        const r = scoreRecency(rec, p);
        const f = scoreFrequency(fMetric, p);
        const annualAvg = mht / yearsSpanSel;
        const mm = scoreMonetary(annualAvg, p);

        const ten = monthsBetweenISO(subTxs[0].dateISO, ref);
        const dateSet = uniqDateSet(subTxs);
        const velRes = calculateAdjustedVelocityTrend(dateSet, ref);
        const tf = velRes.tf;
        const tfReliable = (tf !== null);

        seg = segment(r, f, mm, tf, tfReliable, rec, ten, freq, (c && isFinite(c.caSharePeriod) ? c.caSharePeriod : null));
      }

      const mStr = ref.toLocaleDateString('fr-FR', { month:'short', year:'2-digit' });
      const col = getSegColorClass(seg);
      const short = seg ? (seg.replace('À ', '').split(' ')[0].slice(0,4)) : '—';

      strip.innerHTML += `
        <div class="history-month" title="${mStr}: ${seg || 'Inactif'}">
          <div class="history-date">${mStr}</div>
          <div class="history-dot ${seg ? col : ''}" style="${!seg ? 'border-color:#333;background:transparent' : ''}"></div>
          <div class="history-seg">${short}</div>
        </div>
      `;
    }

    strip.scrollLeft = strip.scrollWidth;
  }, 50);
  }


  // 7. Tableau Complet// 7. Tableau Complet
  const tbody = document.getElementById("cdFullTableBody");
  // On inverse pour avoir le plus récent en haut
  const revTxs = txs.slice().reverse();
  tbody.innerHTML = revTxs.map(t => {
    const ago = Math.floor((new Date() - new Date(t.dateISO)) / 86400000);
    return `
      <tr>
        <td class="mono">${fmtDateISO(t.dateISO)}</td>
        <td class="mono" style="font-weight:bold; color:#fff;">${fmtEUR(t.amountHT)}</td>
        <td class="muted" style="font-size:11px;">il y a ${ago}j</td>
      </tr>
    `;
  }).join("");

  try{ renderExtraPanels({client:c, txs:txs}); }catch(e){ console.warn("[renderExtraPanels]", e); }
  const __cdm = document.getElementById("clientDetailModal");
  if(__cdm){ __cdm.classList.remove("hidden"); __cdm.style.display = "flex"; __cdm.style.pointerEvents = "auto"; }
  requestAnimationFrame(()=>{ try{ renderClientCharts(txs); }catch(e){} });
}

  // Bind safe: certains handlers du module original sont déclarés en top-level.
  // On sécurise en (re)bindant une fois que le DOM est prêt.
  function __bindClientCockpit(){
    var btn = document.getElementById("btnCloseClientDetail");
    var modal = document.getElementById("clientDetailModal");
    if(btn && modal){
      btn.onclick = function(){ modal.style.display="none"; };
    }
    // fermeture clic overlay
    if(modal){
      modal.addEventListener("click", function(e){
        if(e.target === modal){ modal.style.display="none"; }
      });
    }
    // ESC
    document.addEventListener("keydown", function(e){
      if(e.key === "Escape" && modal && modal.style.display==="flex"){
        modal.style.display="none";
      }
    });
  }

  // Délégation de clic: uniquement sur le NOM (span.client-link)
  function __bindClientNameClicks(){
    var b1 = document.getElementById("clientsBody");
    var b2 = document.getElementById("kpiBody");
    var b3 = document.getElementById("actionsTbody");
    function handler(e){
      var t = e.target;
      if(t && t.classList && t.classList.contains("client-link")){
        var name = t.getAttribute("data-client");
        if(name){
          try{ openClientDetail(name); }catch(err){ console.error(err); alert("Impossible d'ouvrir la fiche client (console)."); }
        }
      }
    }
    if(b1) b1.addEventListener("click", handler);
    if(b2) b2.addEventListener("click", handler);
    if(b3) b3.addEventListener("click", handler);
  }

  // expose init hook
  window.__initClientCockpitModule = function(){
    __bindClientCockpit();
    __bindClientNameClicks();
  };

  // si init() de l'app est déjà passée (cas rare), on tente un bind direct
  if(document.readyState !== "loading"){
    setTimeout(function(){ if(window.__initClientCockpitModule) window.__initClientCockpitModule();
  if(window.__initALFREDCockpitModule) window.__initALFREDCockpitModule(); }, 0);
  }else{
    document.addEventListener("DOMContentLoaded", function(){
      setTimeout(function(){ if(window.__initClientCockpitModule) window.__initClientCockpitModule();
  if(window.__initALFREDCockpitModule) window.__initALFREDCockpitModule(); }, 0);
    });
  }
})();;


/* =========================
   COCKPIT CLIENT — Life Timeline (segments bimestriels)
   - recalcul du segment tous les 2 mois, sur une fenêtre 36 mois glissants
   - si 36 mois > minDate client, on prend l'historique disponible (max)
   - rendu : blocs continus (pas de pastilles), fusion des périodes identiques
   ========================= */

function __addMonthsUTC(d, n){
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + n;
  const ny = y + Math.floor(m/12);
  const nm = ((m%12)+12)%12;
  const day = dt.getUTCDate();
  // clamp day to end of month
  const end = new Date(Date.UTC(ny, nm+1, 0)).getUTCDate();
  const nd = Math.min(day, end);
  return new Date(Date.UTC(ny, nm, nd));
}
function __iso(d){
  return d.toISOString().slice(0,10);
}
function __daysBetween(a,b){
  return Math.round((b-a)/86400000);
}
function __monthsBetween(a,b){
  // a,b are Date UTC
  return (b.getUTCFullYear()-a.getUTCFullYear())*12 + (b.getUTCMonth()-a.getUTCMonth());
}
function __ensureTxIndex(){
  // Rebuild index if missing, wrong type, or empty (can happen if an earlier module pre-created empty maps)
  try{
    if(state.__txByClient instanceof Map && state.__datesSetByClient instanceof Map && state.__txByClient.size>0) return;
  }catch(_e){}

  const map = new Map();
  const dset = new Map();
  for(const t of (state.tx||[])){
    if(!t || !t.clientCanon || !t.dateISO) continue;
    if(!map.has(t.clientCanon)) map.set(t.clientCanon, []);
    map.get(t.clientCanon).push(t);
    if(!dset.has(t.clientCanon)) dset.set(t.clientCanon, new Set());
    dset.get(t.clientCanon).add(t.dateISO);
  }
  for(const [k, arr] of map.entries()){
    arr.sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""));
  }
  state.__txByClient = map;
  state.__datesSetByClient = dset;
  state.__lifeThresholdCache = new Map(); // key: asOfISO -> {favg,mavg,bask,totalCA, pFM:{f1..f4,m1..m4}}
}

function __sliceTxByISO(arr, startISO, endISO){
  // inclusive range [startISO, endISO]
  // arr sorted by dateISO
  let lo=0, hi=arr.length;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if((arr[mid].dateISO||"") < startISO) lo=mid+1; else hi=mid;
  }
  const startIdx=lo;
  lo=0; hi=arr.length;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if((arr[mid].dateISO||"") <= endISO) lo=mid+1; else hi=mid;
  }
  const endIdx=lo; // slice end (exclusive)
  return arr.slice(startIdx, endIdx);
}

function __computeFMThresholdsAt(asOfISO){
  __ensureTxIndex();
  const cache = state.__lifeThresholdCache;
  if(cache.has(asOfISO)) return cache.get(asOfISO);

  const p0 = state.params || {};
  const mode = (p0.freqMode || "annual"); // "annual" | "monthly"
  const asOf = new Date(asOfISO+"T00:00:00Z");
  const winStartGlobal = __addMonthsUTC(asOf, -36);
  const winStartISO = __iso(winStartGlobal);

  let totalCA = 0;
  const freqMetrics = [];
  const monetaryVals = [];
  const basketVals = [];

  for(const [name, txs] of state.__txByClient.entries()){
    if(!txs || !txs.length) continue;
    // minDate client (historique total) = première facture
    const minISO = txs[0].dateISO;
    const startISO = (minISO && minISO > winStartISO) ? minISO : winStartISO;
    const slice = __sliceTxByISO(txs, startISO, asOfISO);
    if(!slice.length) continue; // client inactif à ce point
    let sum=0;
    for(const t of slice){ sum += (+t.amountHT||0); }
    const cnt = slice.length;
    totalCA += sum;

    const startD = new Date(startISO+"T00:00:00Z");
    const monthsSpan = Math.max(1, __monthsBetween(startD, asOf)); // max dispo si historique < 36 mois
    const freqMetric = (mode==="monthly") ? (cnt / monthsSpan) : (cnt / (monthsSpan/12));
    if(isFinite(freqMetric)) freqMetrics.push(freqMetric);
    if(isFinite(sum)) monetaryVals.push(sum);
    const bask = cnt>0 ? (sum/cnt) : NaN;
    if(isFinite(bask)) basketVals.push(bask);
  }

  const mean = (arr)=> arr.length ? (arr.reduce((s,x)=>s+x,0)/arr.length) : NaN;
  const favg = mean(freqMetrics);
  const mavg = mean(monetaryVals);
  const bask = mean(basketVals);

  // mêmes règles que "Réglages Auto" (F1=1, F3=avg, etc.)
  const F1 = 1;
  const F3 = favg;
  const F2 = (F1 + F3) / 2;
  const F4 = (F3 - F2) * 2 + F3;

  const M1 = bask;
  const M3 = mavg;
  const M2 = (M1 + M3) / 2;
  const M4 = (M3 - M2) * 2 + M3;

  const res = {
    favg, mavg, bask, totalCA,
    pFM: {
      f1: F1, f2: F2, f3: F3, f4: F4,
      m1: Math.round(M1), m2: Math.round(M2), m3: Math.round(M3), m4: Math.round(M4)
    }
  };
  cache.set(asOfISO, res);
  return res;
}

function __computeClientSegmentAt__legacy(clientName, asOfISO){
  __ensureTxIndex();
  const txsAll = state.__txByClient.get(clientName) || [];
  if(!txsAll.length) return { segment:"—", asOfISO };

  const asOf = new Date(asOfISO+"T00:00:00Z");
  const minISO = txsAll[0].dateISO;
  const minD = new Date(minISO+"T00:00:00Z");

  const winStart = __addMonthsUTC(asOf, -36);
  const winStartISO0 = __iso(winStart);
  const startISO = (minISO && minISO > winStartISO0) ? minISO : winStartISO0;

  const txWin = __sliceTxByISO(txsAll, startISO, asOfISO);

  // recencyDays : depuis dernière facture <= asOf
  const lastISO = (txWin.length ? txWin[txWin.length-1].dateISO : null) || txsAll[txsAll.length-1].dateISO;
  const lastD = lastISO ? new Date(lastISO+"T00:00:00Z") : null;
  const recencyDays = lastD ? __daysBetween(lastD, asOf) : null;

  // tenureMonths : depuis première facture
  const tenureMonths = Math.max(0, __monthsBetween(minD, asOf));

  // lifetime orders up to asOf
  const txLife = __sliceTxByISO(txsAll, minISO, asOfISO);
  const ordersLifetime = txLife.length;

  // window monetary & frequency
  let sum=0;
  for(const t of txWin){ sum += (+t.amountHT||0); }
  const cnt = txWin.length;

  // TF (vélocité) — même algo que l'app (sans ajustement panier pour l'historique)
  const dateSet = state.__datesSetByClient.get(clientName);
  const velRes = calculateAdjustedVelocityTrend(dateSet, asOf);
  const tf = velRes.tf;
  const tfReliable = (tf !== null);

  // seuils dynamiques F/M à ce point
  const th = __computeFMThresholdsAt(asOfISO);
  const p0 = state.params || {};
  const pSim = Object.assign({}, p0, th.pFM);

  // scores R/F/M
  const r = (recencyDays==null || !isFinite(recencyDays)) ? 1 : scoreRecency(recencyDays, pSim);
  // fréquence "metric" comme dans l'app (annual ou monthly) — basé sur la fenêtre dispo
  const startD = new Date(startISO+"T00:00:00Z");
  const monthsSpan = Math.max(1, __monthsBetween(startD, asOf));
  const freqMetric = (pSim.freqMode==="monthly") ? (cnt / monthsSpan) : (cnt / (monthsSpan/12));
  const f = scoreFrequency(freqMetric, pSim);
  const m = scoreMonetary(sum, pSim);

  // vipShare : part du CA sur la fenêtre vs total à ce point
  const vipShare = (th.totalCA>0) ? (sum / th.totalCA) : null;

  const seg = segment(r,f,m,tf,tfReliable,recencyDays,tenureMonths,ordersLifetime,vipShare);
  return { segment: seg, asOfISO, startISO, cnt, sum, recencyDays, tf, tfReliable, r,f,m };
}


function __findSegTransitionISO(clientName, fromISO, toISO, segFrom, segTo){
  try{
    if(!clientName || !fromISO || !toISO || !segTo) return toISO || fromISO || '';
    const d0 = new Date(fromISO+"T00:00:00Z");
    const d1 = new Date(toISO+"T00:00:00Z");
    if(!(d0 instanceof Date) || isNaN(d0) || !(d1 instanceof Date) || isNaN(d1)) return toISO;
    if(d1 < d0) return toISO;

    let prev = segFrom;
    const d = new Date(d0.getTime());
    const maxSteps = Math.min(400, Math.ceil((d1 - d0) / (1000*60*60*24)) + 2); // 90j typique
    let steps = 0;

    while(d <= d1 && steps < maxSteps){
      const iso = __iso(d);
      let s = null;
      try{ s = __computeClientSegmentAt__legacy(clientName, iso).segment; } catch(e){ s = null; }
      if(s === segTo && prev !== segTo) return iso;
      if(s) prev = s;
      d.setUTCDate(d.getUTCDate() + 1);
      steps++;
    }
    return toISO;
  }catch(e){
    return toISO;
  }
}





/* =========================
   COCKPIT CLIENT — Historique de vie (segments trimestriels)
   - Simulation RFM/Segmentation sur tout le dataset, photo tous les 3 mois (trimestre)
   - Moteur encapsulé (zéro impact sur recalcAll / parsing / RFM globale)
   ========================= */

function __lifeISO(d){ return d.toISOString().slice(0,10); }

function __lifeAddMonthsUTC(d, n){
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + n;
  const ny = y + Math.floor(m/12);
  const nm = ((m%12)+12)%12;
  return new Date(Date.UTC(ny, nm, 1));
}

function __lifeParseISO(iso){
  if(!iso) return null;
  const s = String(iso).slice(0,10);
  const d = new Date(s + "T00:00:00Z");
  return isFinite(d) ? d : null;
}

function __lifeLowerBound(arrISO, targetISO){
  // first index with arrISO[i] >= targetISO
  let lo=0, hi=arrISO.length;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if((arrISO[mid]||"") < targetISO) lo=mid+1; else hi=mid;
  }
  return lo;
}

function __lifeUpperBound(arrISO, targetISO){
  // first index with arrISO[i] > targetISO
  let lo=0, hi=arrISO.length;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if((arrISO[mid]||"") <= targetISO) lo=mid+1; else hi=mid;
  }
  return lo;
}

function __lifeComputePeriodMinISO(asOfISO){
  const p = state.params || {};
  const qMinISO = state.quality?.minDate || null;
  const asOf = __lifeParseISO(asOfISO);
  if(!asOf) return qMinISO || "1900-01-01";

  let minDate;
  if(p.periodMonths === "ALL"){
    minDate = qMinISO ? __lifeParseISO(qMinISO) : new Date("1900-01-01T00:00:00Z");
  }else{
    const months = parseInt(p.periodMonths,10) || 12;
    const periodDays = Math.round((months/12)*365.25);
    minDate = new Date(asOf.getTime() - periodDays*86400000);
    if(qMinISO){
      const qMin = __lifeParseISO(qMinISO);
      if(qMin && minDate < qMin) minDate = qMin;
    }
  }
  return __lifeISO(minDate);
}

function __lifeComputeDynamicFMThresholds(asOfISO, minISO){
  // Recalcule F/M "auto" à date asOfISO sur la fenêtre minISO..asOfISO (mêmes règles que l'app)
  __ensureTxIndex();
  if(!state.__lifeDynFMC) state.__lifeDynFMC = new Map(); // key: asOfISO|minISO
  const k = asOfISO + "|" + minISO;
  if(state.__lifeDynFMC.has(k)) return state.__lifeDynFMC.get(k);

  const p0 = state.params || {};
  const mode = (p0.freqMode || "annual"); // "annual" | "monthly"
  const asOf = __lifeParseISO(asOfISO);
  const startD = __lifeParseISO(minISO);
  if(!asOf || !startD){
    const fallback = { totalCA:0, pFM:{}, favg:NaN, mavg:NaN, bask:NaN };
    state.__lifeDynFMC.set(k, fallback);
    return fallback;
  }

  let totalCA = 0;
  const freqMetrics = [];
  const monetaryVals = [];
  const basketVals = [];

  // Scan par client (déjà indexé/sorté)
  for(const [name, txs] of state.__txByClient.entries()){
    if(!txs || !txs.length) continue;
    const dates = txs.map(t=>t.dateISO);
    // indices fenêtre
    const i0 = __lifeLowerBound(dates, minISO);
    const i1 = __lifeUpperBound(dates, asOfISO);
    if(i1 <= i0) continue;

    let sum=0;
    for(let i=i0;i<i1;i++) sum += (+txs[i].amountHT||0);
    const cnt = i1 - i0;
    totalCA += sum;

    const monthsSpan = Math.max(1, (asOf.getUTCFullYear()-startD.getUTCFullYear())*12 + (asOf.getUTCMonth()-startD.getUTCMonth()));
    const freqMetric = (mode==="monthly") ? (cnt / monthsSpan) : (cnt / (monthsSpan/12));
    if(isFinite(freqMetric)) freqMetrics.push(freqMetric);
    if(isFinite(sum)) monetaryVals.push(sum);
    const bask = cnt>0 ? (sum/cnt) : NaN;
    if(isFinite(bask)) basketVals.push(bask);
  }

  const mean = (arr)=> arr.length ? (arr.reduce((s,x)=>s+x,0)/arr.length) : NaN;
  const favg = mean(freqMetrics);
  const mavg = mean(monetaryVals);
  const bask = mean(basketVals);

  const F1 = 1;
  const F3 = favg;
  const F2 = (F1 + F3) / 2;
  const F4 = (F3 - F2) * 2 + F3;

  const M1 = bask;
  const M3 = mavg;
  const M2 = (M1 + M3) / 2;
  const M4 = (M3 - M2) * 2 + M3;

  const res = {
    favg, mavg, bask, totalCA,
    pFM: {
      f1: F1, f2: F2, f3: F3, f4: F4,
      m1: Math.round(M1), m2: Math.round(M2), m3: Math.round(M3), m4: Math.round(M4)
    }
  };
  state.__lifeDynFMC.set(k, res);
  return res;
}

function __computeClientSegmentAt(dateEval, txsClient){
  // Moteur math sécurisé — aligné sur les règles de segmentation globales.
  const pastTxs0 = (txsClient || []).filter(tx => {
    const d = __lifeParseISO(tx.dateISO || tx.date);
    return d && d.getTime() <= dateEval.getTime();
  });
  if(pastTxs0.length === 0) return "Inactif";

  const pastTxs = pastTxs0.sort((a,b)=> (a.dateISO||a.date||"").localeCompare(b.dateISO||b.date||""));

  const firstTxDate = __lifeParseISO(pastTxs[0].dateISO || pastTxs[0].date);
  const lastTxDate  = __lifeParseISO(pastTxs[pastTxs.length-1].dateISO || pastTxs[pastTxs.length-1].date);
  if(!firstTxDate || !lastTxDate) return "Inactif";

  const recencyDays = Math.max(0, (dateEval.getTime() - lastTxDate.getTime()) / 86400000);

  let tenureMonths = (dateEval.getTime() - firstTxDate.getTime()) / (1000*60*60*24*30.437);
  tenureMonths = Math.max(1, tenureMonths);

  const frequencyLife = pastTxs.length;
  const ordLife = frequencyLife;

  // Fenêtre dynamique (mêmes réglages que l'app)
  const asOfISO = __lifeISO(dateEval);
  const minISO  = __lifeComputePeriodMinISO(asOfISO);

  // fenêtre client
  const dates = pastTxs.map(t => t.dateISO || t.date);
  const i0 = __lifeLowerBound(dates, minISO);
  const i1 = pastTxs.length; // <= asOf
  let sumWin=0;
  for(let i=i0;i<i1;i++) sumWin += (+pastTxs[i].amountHT||0);
  const cntWin = Math.max(0, i1 - i0);

  // seuils dynamiques
  const th = __lifeComputeDynamicFMThresholds(asOfISO, minISO);
  const p0 = state.params || {};
  const pSim = Object.assign({}, p0, th.pFM || {});

  // fréquence metric sur la fenêtre
  const asOf = dateEval;
  const startD = __lifeParseISO(minISO);
  const monthsSpan = startD ? Math.max(1, (asOf.getUTCFullYear()-startD.getUTCFullYear())*12 + (asOf.getUTCMonth()-startD.getUTCMonth())) : 12;
  const freqMetric = (pSim.freqMode==="monthly") ? (cntWin / monthsSpan) : (cntWin / (monthsSpan/12));

  // tf (tendance) : on réutilise la fonction globale, mais elle est bornée par asOf.
  const dateSet = state.__datesSetByClient ? state.__datesSetByClient.get(pastTxs[0].clientCanon || pastTxs[0].client || "") : null;
  const velRes = (typeof calculateAdjustedVelocityTrend === "function" && dateSet) ? calculateAdjustedVelocityTrend(dateSet, asOf) : {tf:null};
  const tf = velRes ? velRes.tf : null;
  const tfReliable = (tf !== null);

  // vipShare sur fenêtre (pondérée par totalCA à ce point)
  const vipShare = (th && th.totalCA>0) ? (sumWin / th.totalCA) : null;

  const r = scoreRecency(recencyDays, pSim);
  const f = scoreFrequency(freqMetric, pSim);
  const m = scoreMonetary(sumWin, pSim);

  return segment(r, f, m, tf, tfReliable, recencyDays, tenureMonths, ordLife, vipShare);
}

function __lifeBuildSimulation(maxDateDatasetISO){
  __ensureTxIndex();
  const qMinISO = state.quality?.minDate || null;
  const qMaxISO = maxDateDatasetISO || state.quality?.maxDate || new Date().toISOString().slice(0,10);
  const p = state.params || {};

  if(!qMinISO) return null;
  const key = [
    "v1",
    (state.tx ? state.tx.length : 0),
    qMinISO,
    qMaxISO,
    p.periodMonths, p.freqMode,
    p.r2,p.r3,p.r4,p.r5,
    p.vipRMin,p.vipFMin,p.vipMMin,p.vipTfFragile
  ].join("|");

  if(!state.__lifeSimCache) state.__lifeSimCache = new Map();
  if(state.__lifeSimCache.has(key)) return state.__lifeSimCache.get(key);

  // Bornes dataset : T0 = 1er jour du mois de la plus ancienne facture
  const d0raw = __lifeParseISO(qMinISO);
  const dFin = __lifeParseISO(qMaxISO);
  if(!d0raw || !dFin) return null;
  const d0 = new Date(Date.UTC(d0raw.getUTCFullYear(), d0raw.getUTCMonth(), 1));
  if(d0.getTime() > dFin.getTime()) return null;

  // Grille trimestrielle : +3 mois
  const dates = [];
  let cur = new Date(d0.getTime());
  let safety = 0;
  while(cur.getTime() <= dFin.getTime() && safety < 800){
    dates.push(__lifeISO(cur));
    cur = __lifeAddMonthsUTC(cur, 3);
    safety++;
  }
  if(dates.length === 0 || dates[dates.length-1] !== __lifeISO(dFin)){
    dates.push(__lifeISO(dFin));
  }

  // Préparation : indices client (dates + prefix sums)
  const idx = new Map();
  for(const [name, txs] of state.__txByClient.entries()){
    if(!txs || !txs.length) continue;
    const arrISO = txs.map(t=>t.dateISO);
    const pref = new Array(txs.length+1);
    pref[0]=0;
    for(let i=0;i<txs.length;i++){
      pref[i+1]=pref[i]+(+txs[i].amountHT||0);
    }
    idx.set(name, {txs, dates: arrISO, pref, firstISO: arrISO[0]});
  }

  // Simulation : segments par date, pour chaque client
  const byClient = new Map();
  for(const [name] of idx.entries()){
    byClient.set(name, new Array(dates.length).fill("Inactif"));
  }

  for(let di=0; di<dates.length; di++){
    const asOfISO = dates[di];
    const minISO = __lifeComputePeriodMinISO(asOfISO);
    const th = __lifeComputeDynamicFMThresholds(asOfISO, minISO);
    const pSim = Object.assign({}, (state.params||{}), th.pFM||{});
    const asOfD = __lifeParseISO(asOfISO);
    const startD = __lifeParseISO(minISO);
    const monthsSpan = (asOfD && startD) ? Math.max(1, (asOfD.getUTCFullYear()-startD.getUTCFullYear())*12 + (asOfD.getUTCMonth()-startD.getUTCMonth())) : 12;

    for(const [name, obj] of idx.entries()){
      const {txs, dates: arrISO, pref} = obj;
      // lifetime up to asOf
      const iLife = __lifeUpperBound(arrISO, asOfISO);
      if(iLife <= 0){
        byClient.get(name)[di] = "Inactif";
        continue;
      }

      const firstISO = arrISO[0];
      const lastISO = arrISO[iLife-1];

      const firstD = __lifeParseISO(firstISO);
      const lastD = __lifeParseISO(lastISO);
      if(!firstD || !lastD || !asOfD){
        byClient.get(name)[di] = "Inactif";
        continue;
      }

      const recencyDays = Math.max(0, (asOfD.getTime() - lastD.getTime())/86400000);
      let tenureMonths = (asOfD.getTime() - firstD.getTime())/(1000*60*60*24*30.437);
      tenureMonths = Math.max(1, tenureMonths);

      // window slice
      const i0 = __lifeLowerBound(arrISO, minISO);
      const i1 = iLife;
      const cntWin = Math.max(0, i1 - i0);
      const sumWin = (pref[i1] - pref[i0]);

      const freqMetric = (pSim.freqMode==="monthly") ? (cntWin / monthsSpan) : (cntWin / (monthsSpan/12));

      // tf global (bornée à asOf)
      const dateSet = state.__datesSetByClient ? state.__datesSetByClient.get(name) : null;
      const velRes = (typeof calculateAdjustedVelocityTrend === "function" && dateSet) ? calculateAdjustedVelocityTrend(dateSet, asOfD) : {tf:null};
      const tf = velRes ? velRes.tf : null;
      const tfReliable = (tf !== null);

      const vipShare = (th && th.totalCA>0) ? (sumWin / th.totalCA) : null;

      const r = scoreRecency(recencyDays, pSim);
      const f = scoreFrequency(freqMetric, pSim);
      const m = scoreMonetary(sumWin, pSim);

      const seg = segment(r,f,m,tf,tfReliable,recencyDays,tenureMonths,iLife,vipShare);
      byClient.get(name)[di] = seg;
    }
  }

  const sim = { key, datesISO: dates, byClient, t0ISO: __lifeISO(d0), tFinISO: __lifeISO(dFin) };
  state.__lifeSimCache.set(key, sim);
  return sim;
}

function __lifeMergeBlocks(datesISO, segs, startIdx){
  // Transforme en blocs consécutifs : {segment, startISO, endISO}
  const blocks = [];
  if(!segs || segs.length===0) return blocks;

  let i = Math.max(0, startIdx||0);
  let curSeg = segs[i];
  let curStart = datesISO[i];

  for(let k=i+1;k<segs.length;k++){
    if(segs[k] !== curSeg){
      blocks.push({segment:curSeg, startISO:curStart, endISO:datesISO[k]});
      curSeg = segs[k];
      curStart = datesISO[k];
    }
  }
  blocks.push({segment:curSeg, startISO:curStart, endISO:datesISO[datesISO.length-1]});
  return blocks;
}

function __lifeHexToRgba(hex, a){
  const h = String(hex||"").replace("#","").trim();
  const v = h.length===3 ? h.split("").map(ch=>ch+ch).join("") : h;
  const n = parseInt(v, 16);
  if(!isFinite(n)) return `rgba(255,255,255,${a})`;
  const r = (n>>16)&255, g=(n>>8)&255, b=n&255;
  return `rgba(${r},${g},${b},${a})`;
}

function __lifeBaseColor(seg){
  const s = String(seg||"").toLowerCase().replace(/é/g,"e").replace(/à/g,"a").replace(/î/g,"i").replace(/ô/g,"o").replace(/û/g,"u");
  if(s.includes("vip") && s.includes("sol")) return "#ffd700";     // VIP Solides
  if(s.includes("vip") && s.includes("frag")) return "#ffcc66";    // VIP Fragiles (warn)
  if(s.includes("vip")) return "#ffd700";
  if(s.includes("regulier")) return "#38d39f";
  if(s.includes("pot")) return "#6ea8ff";
  if(s.includes("nou")) return "#38bdf8";
  if(s.includes("ris")) return "#ff5d5d";
  if(s.includes("histor")) return "#475569";
  if(s.includes("perd") || s.includes("dorm")) return "#64748b";
  if(s.includes("occ") || s.includes("one")) return "#94a3b8";
  if(s.includes("inact")) return "rgba(255,255,255,0.06)";
  return "rgba(255,255,255,0.10)";
}

function __lifeColor(seg){
  const base = __lifeBaseColor(seg);
  // On applique une transparence "glossy" (comme les alertes/segments du cockpit client)
  if(String(base).startsWith("rgba")) return base;
  return __lifeHexToRgba(base, 0.62);
}

function __buildLifeTimelineBlocks(clientName, maxDateDatasetISO){
  __ensureTxIndex();
  const txs0 = state.__txByClient.get(clientName) || [];
  if(!txs0.length) return "<div class='muted small'>Aucun historique</div>";

  // 1) Tri chronologique & bornes client (condensation = toute la vie client sur 100% largeur)
  const txs = [...txs0].slice().sort((a,b)=> (a.dateISO||a.date||"").localeCompare(b.dateISO||b.date||""));
  const t0 = __lifeParseISO(txs[0].dateISO || txs[0].date);
  const tFin = __lifeParseISO(maxDateDatasetISO) || __lifeParseISO(state?.quality?.maxDate) || new Date();
  if(!t0 || !tFin || t0.getTime() > tFin.getTime()) return "";

  const durationTotalMs = Math.max(1, tFin.getTime() - t0.getTime());

  // 2) Photos trimestrielles (tous les 3 mois) à partir du T0 client
  const states = [];
  let cur = new Date(t0.getTime());
  let safety = 0;
  while(cur.getTime() <= tFin.getTime() && safety < 500){
    states.push({ date: new Date(cur.getTime()), seg: __computeClientSegmentAt(cur, txs) });
    const nxt = new Date(cur.getTime());
    nxt.setUTCMonth(nxt.getUTCMonth() + 3);
    cur = nxt;
    safety++;
  }

  // capture de fin
  if(states.length && states[states.length-1].date.getTime() < tFin.getTime()){
    states.push({ date: new Date(tFin.getTime()), seg: __computeClientSegmentAt(tFin, txs) });
  }
    // 3) Fusion des états consécutifs (Correction temporelle : fin du bloc = début du suivant)
    const blocks = [];
    if(states.length){
        let b = { seg: states[0].seg, start: states[0].date, end: null };
        for(let i=1; i<states.length; i++){
            if(states[i].seg !== b.seg){
                b.end = states[i].date; // Le bloc s'étire jusqu'à la date de la nouvelle photo
                blocks.push(b);
                b = { seg: states[i].seg, start: states[i].date, end: null };
            }
        }
        b.end = new Date(tFin.getTime());
        blocks.push(b);
    }

    // 4) UI : frise condensée 100% (Flexbox) + classes CSS natives V6.70
    let html = `<div style="width:100%;">` + `<div class="lifeTL">`;
    for(const b of blocks){
        const sMs = Math.max(b.start.getTime(), t0.getTime());
        const eMs = Math.min(b.end.getTime(), tFin.getTime());
        if(eMs < sMs) continue; // Sécurité anti-blocs fantômes

        // Durée minimale pour rendre visible un segment instantané (ex: dernier état)
        let duration = eMs - sMs;
        if(duration <= 0) duration = 24*60*60*1000;

        // La propriété 'flex' oblige le navigateur à tasser tout l'historique sur 100% de la largeur
        const bg = __lifeColor(b.seg); 

        html += `<div class="lifeSeg" style="flex:${duration}; background:${bg}; border-right:1px solid rgba(0,0,0,0.18); cursor:crosshair;" title="${b.seg} (Du ${b.start.toLocaleDateString()} au ${b.end.toLocaleDateString()})" onmouseover="this.style.filter='brightness(1.5)'" onmouseout="this.style.filter='brightness(1)'"><span class="lifeSegLabel" style="display:none;"></span></div>`;
    }
    html += `</div></div>`;
    return html;

}

function renderClientLifeTimeline(clientName){
  const wrap = document.getElementById("cdLifeTimeline");
  const meta1 = document.getElementById("cdLifeTimelineRange");
  const meta2 = document.getElementById("cdLifeTimelineStats");
  if(!wrap) return;

  __ensureTxIndex();
  const maxISO = (state.periodWindow && state.periodWindow.asOfISO) ? state.periodWindow.asOfISO :
                 (state.quality?.maxDate || new Date().toISOString().slice(0,10));

  wrap.innerHTML = __buildLifeTimelineBlocks(clientName, maxISO);

  if(meta1) meta1.textContent = "";
  if(meta2) meta2.textContent = "";
}
function ensureChartCanvas(container, id){
  let c = container.querySelector("canvas");
  if(!c){
    container.innerHTML = "";
    c = document.createElement("canvas");
    c.id = id;
    c.style.width = "100%";
    c.style.height = "100%";
    c.style.display = "block";
    container.appendChild(c);
  }
  // make sure container can size its child
  container.style.position = container.style.position || "relative";
  return c;
}

function resizeCanvasToContainer(canvas){
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  const needW = Math.floor(w * dpr);
  const needH = Math.floor(h * dpr);
  if(canvas.width !== needW || canvas.height !== needH){
    canvas.width = needW;
    canvas.height = needH;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0); // draw in CSS pixels
  return {ctx, w, h};
}

function niceStep(max, ticks=4){
  // simple "nice number" step (1/2/5 * 10^n)
  const raw = max / Math.max(1, ticks);
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const r = raw / p;
  const m = r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10;
  return m * p;
}

function fmtShortEUR(v){
  const n = +v || 0;
  if(n >= 1_000_000) return (n/1_000_000).toFixed(1).replace(".",",")+" M€";
  if(n >= 1_000) return Math.round(n/1_000)+" k€";
  return Math.round(n)+" €";
}

function paintAllClientCharts(txs, cvVol, cvLtv, cvVel, cvSea, cvBasket){
  // data prep
  const tx = txs.filter(t=>t && t.dateISO).slice().sort((a,b)=>a.dateISO.localeCompare(b.dateISO));
  // Affichage moyenne dans le titre (aligné à droite) : Vélocité & Panier moyen
  try{
    const elVel = document.getElementById("avgVelLabel");
    if(elVel){
      const dates = tx.map(t=>new Date(t.dateISO)).filter(d=>isFinite(d)).sort((a,b)=>a-b);
      const ints = [];
      for(let i=1;i<dates.length;i++){
        const days = Math.round((dates[i]-dates[i-1])/(1000*60*60*24));
        if(Number.isFinite(days) && days>=0) ints.push(days);
      }
      const avg = ints.length ? (ints.reduce((s,x)=>s+x,0)/ints.length) : 0;
      elVel.textContent = avg>0 ? ("Moy. " + Math.round(avg) + " j") : "";
    }
    const elB = document.getElementById("avgBasketLabel");
    if(elB){
      const total = tx.reduce((s,t)=>s+(Number(t.amountHT)||0),0);
      const avgB = (tx.length? (total/tx.length) : 0);
      elB.textContent = (avgB>0 ? ("Moy. " + fmtEUR(avgB)) : "");
    }
  }catch(e){}

  paintVolumeYear(cvVol, tx);
  paintLtvQuarter(cvLtv, tx);
  paintVelocityIntervals(cvVel, tx);
  paintSeasonalityAvg(cvSea, tx);
  paintAvgBasketMonthly(cvBasket, tx);
}


/* ---- Orchestrateur charts Fiche Client ----
   (évite les ReferenceError si l'appel existe dans openClientDetail) */
function renderClientCharts(txs){
  try{
    const boxVol = document.getElementById("chartVolume");
    const boxLtv = document.getElementById("chartOrders");
    const boxBasket = document.getElementById("chartBasketMean");
    const boxVel = document.getElementById("chartVelocityIntervals");
    const boxSea = document.getElementById("chartSeasonality");
    if(!boxVol || !boxLtv || !boxBasket || !boxVel || !boxSea) return;

    const cvVol = ensureChartCanvas(boxVol, "cvVolumeYear");
    const cvLtv = ensureChartCanvas(boxLtv, "cvLtvQuarter");
    const cvVel = ensureChartCanvas(boxVel, "cvVelocity");
    const cvSea = ensureChartCanvas(boxSea, "cvSeasonality");
    const cvBasket = ensureChartCanvas(boxBasket, "cvAvgBasket");

    paintAllClientCharts(txs || [], cvVol, cvLtv, cvVel, cvSea, cvBasket);
  }catch(e){
    console.warn("[AppRFM] renderClientCharts error", e);
  }
}

/* ---- Generic chart primitives ---- */

function drawFrame(ctx, x, y, w, h){
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
  ctx.restore();
}

function drawAxes(ctx, plot, yTicks, xLabels){
  const {x, y, w, h} = plot;
  ctx.save();
  // axes
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y+h);
  ctx.lineTo(x+w, y+h);
  ctx.stroke();

  // Y grid + labels
  ctx.fillStyle = "rgba(255,255,255,.65)";
  ctx.font = "11px var(--sans)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  yTicks.forEach(t=>{
    const yy = y + h - (t.p * h);
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x+w, yy);
    ctx.stroke();
    ctx.fillText(t.label, x-6, yy);
  });

  // X labels (few)
  if(Array.isArray(xLabels) && xLabels.length){
    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.font = "11px var(--sans)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    xLabels.forEach(l=>{
      const xx = x + l.p * w;
      ctx.fillText(l.label, xx, y+h+6);
    });
  }
  ctx.restore();
}

function attachCanvasTooltip(canvas, points){
  try{
    if(!canvas) return;
    canvas.__cdTipPoints = points || [];
    if(canvas.__cdTipBound) return;
    canvas.__cdTipBound = true;

    const container = canvas.parentElement;
    if(!container) return;

    // tooltip element
    let tip = container.querySelector(".cd-tooltip");
    if(!tip){
      tip = document.createElement("div");
      tip.className = "cd-tooltip";
      container.appendChild(tip);
    }

    function hide(){ tip.style.display = "none"; }

    function onMove(ev){
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const pts = canvas.__cdTipPoints || [];
      if(!pts.length){ hide(); return; }

      let best=null; let bestD=1e9;
      for(const p of pts){
        const dx = mx - p.x;
        const dy = my - p.y;
        const d = dx*dx + dy*dy;
        if(d < bestD){ bestD=d; best=p; }
      }
      const r2 = 10*10;
      if(!best || bestD > r2){ hide(); return; }

      const html = [
        `<div style="font-weight:900; margin-bottom:4px;">${escapeHtml(best.title||"")}</div>`,
        ...(best.lines||[]).map(l=>`<div class="muted">${escapeHtml(l)}</div>`)
      ].join("");

      tip.innerHTML = html;
      tip.style.display = "block";

      // position near cursor (within container)
      const pad = 12;
      let left = mx + pad;
      let top = my + pad;
      // keep inside
      const cr = container.getBoundingClientRect();
      // tip dimensions after display
      const tw = tip.offsetWidth || 180;
      const th = tip.offsetHeight || 60;
      if(left + tw > cr.width) left = Math.max(6, mx - tw - pad);
      if(top + th > cr.height) top = Math.max(6, my - th - pad);

      tip.style.left = left + "px";
      tip.style.top = top + "px";
    }

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", hide);
  }catch(e){}
}

function getDefaultPlot(w,h){
  // padL augmenté à 58 pour éviter que les montants en € ne soient coupés à gauche
  const padL = 58, padR = 14, padT = 16, padB = 30;
  return {x: padL, y: padT, w: Math.max(10, w - padL - padR), h: Math.max(10, h - padT - padB), padL, padR, padT, padB};
}

/* ---- Chart 1: Volume annuel ---- */
function paintVolumeYear(canvas, tx){
  const {ctx, w, h} = resizeCanvasToContainer(canvas);
  ctx.clearRect(0,0,w,h);

  const years = {};
  tx.forEach(t=>{
    const y = (t.dateISO||"").slice(0,4);
    if(!y) return;
    years[y] = (years[y]||0)+1;
  });
  const keys = Object.keys(years).sort();
  const vals = keys.map(k=>years[k]);
  const maxV = Math.max(1, ...vals);

  const plot = getDefaultPlot(w,h);
  drawFrame(ctx, 0,0,w,h);

  // y ticks
  const step = niceStep(maxV, 4);
  const top = Math.ceil(maxV/step)*step;
  const yTicks = [];
  for(let v=0; v<=top; v+=step){
    yTicks.push({p: v/top, label: String(v)});
  }
  const xLabels = [];
  if(keys.length){
    const nLabMax = 10;
    const stepLab = Math.max(1, Math.ceil(keys.length / nLabMax));
    const n = keys.length;
    const barGap = 8;
    const barW = Math.max(6, (plot.w - (n-1)*barGap) / n);
    const pOf = (i)=>{
      const x = plot.x + i*(barW+barGap) + barW/2;
      return (x - plot.x) / Math.max(1, plot.w);
    };
    for(let i=0;i<n;i+=stepLab){
      xLabels.push({p: pOf(i), label: keys[i]});
    }
    if((n-1) % stepLab !== 0){
      xLabels.push({p: pOf(n-1), label: keys[n-1]});
    }
  }

  drawAxes(ctx, plot, yTicks, xLabels);

  // bars
  const n = keys.length || 1;
  const barGap = 8;
  const barW = Math.max(6, (plot.w - (n-1)*barGap) / n);
  keys.forEach((k,i)=>{
    const v = years[k];
    const p = v / top;
    const bh = p * plot.h;
    const x = plot.x + i*(barW+barGap);
    const y = plot.y + plot.h - bh;
    ctx.fillStyle = "rgba(110,168,255,.55)";
    ctx.fillRect(x, y, barW, bh);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.font = "11px var(--sans)";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(String(v), x+barW/2, y-4);
  });

  // axis labels
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.font = "11px var(--sans)";
  ctx.textAlign = "center"; ctx.textBaseline="bottom";
  ctx.fillText("Années", plot.x + plot.w/2, h-2);
  ctx.save();
  ctx.translate(12, plot.y + plot.h/2);
  ctx.rotate(-Math.PI/2);
  ctx.textAlign="center"; ctx.textBaseline="top";
  ctx.fillText("Nb factures", 0, 0);
  ctx.restore();
}

/* ---- Chart 2: LTV par trimestre (cumul) ---- */
function paintLtvQuarter(canvas, tx){
  const {ctx, w, h} = resizeCanvasToContainer(canvas);
  ctx.clearRect(0,0,w,h);
  drawFrame(ctx,0,0,w,h);

  // aggregate quarterly, then cum
  const byQ = new Map();
  tx.forEach(t=>{
    const d = new Date(t.dateISO);
    if(!isFinite(d)) return;
    const y = d.getFullYear();
    const q = Math.floor(d.getMonth()/3)+1;
    const key = `${y}-T${q}`;
    byQ.set(key, (byQ.get(key)||0) + (+t.amountHT||0));
  });
  const keys = Array.from(byQ.keys()).sort((a,b)=>{
    const [ya,qa]=a.split("-T"); const [yb,qb]=b.split("-T");
    return (+ya-+yb) || (+qa-+qb);
  });
  const pts = [];
  let cum=0;
  keys.forEach((k,i)=>{ cum += (byQ.get(k)||0); pts.push({i, k, v:cum}); });
  const maxV = Math.max(1, ...pts.map(p=>p.v));

  const plot = getDefaultPlot(w,h);
  const step = niceStep(maxV, 4);
  const top = Math.ceil(maxV/step)*step;
  const yTicks = [];
  for(let v=0; v<=top; v+=step){
    yTicks.push({p: v/top, label: fmtShortEUR(v)});
  }

  // x labels: start / mid / end (avoid crowd)
  const xLabels = [];
  if(keys.length){
    xLabels.push({p:0, label: keys[0]});
    if(keys.length>2) xLabels.push({p:0.5, label: keys[Math.floor(keys.length/2)]});
    if(keys.length>1) xLabels.push({p:1, label: keys[keys.length-1]});
  }
  drawAxes(ctx, plot, yTicks, xLabels);

  if(pts.length){
    // line
    ctx.strokeStyle = "rgba(56,211,159,.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p,idx)=>{
      const x = plot.x + (pts.length===1 ? 0.5 : (p.i/(pts.length-1))) * plot.w;
      const y = plot.y + plot.h - (p.v/top) * plot.h;
      if(idx===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    // points
    ctx.fillStyle = "rgba(56,211,159,1)";
    pts.forEach(p=>{
      const x = plot.x + (pts.length===1 ? 0.5 : (p.i/(pts.length-1))) * plot.w;
      const y = plot.y + plot.h - (p.v/top) * plot.h;
      ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
    });
  }

  // axis labels
  ctx.fillStyle="rgba(255,255,255,.55)";
  ctx.font="11px var(--sans)";
  ctx.textAlign="center"; ctx.textBaseline="bottom";
  ctx.fillText("Trimestres", plot.x+plot.w/2, h-2);
}

/* ---- Chart 3: Vélocité (jours entre commandes) ---- */
function paintVelocityIntervals(canvas, tx){
  const {ctx, w, h} = resizeCanvasToContainer(canvas);
  ctx.clearRect(0,0,w,h);
  drawFrame(ctx,0,0,w,h);

  const dates = tx.map(t=>new Date(t.dateISO)).filter(d=>isFinite(d)).sort((a,b)=>a-b);
  const intervals = [];
  for(let i=1;i<dates.length;i++){
    const days = Math.round((dates[i]-dates[i-1])/(1000*60*60*24));
    intervals.push({i:i-1, days, d0:dates[i-1], d1:dates[i]});
  }
  const plot = getDefaultPlot(w,h);

  const days = intervals.map(v => v.days);
  const avgLife = intervals.length ? (intervals.reduce((s,x)=>s+x.days,0) / intervals.length) : 0;

  // ÉCHELLE ECG (pivot) :
  // - On force la MOYENNE au milieu des ordonnées (0..top) => top = 2x moyenne
  // - Fallback si moyenne indisponible : on s'adapte aux pics (maxVal * 1.15)
  const maxD = Math.max(120, ...days);
  const rawTop = Math.max(120, Math.max((avgLife>0 ? (avgLife*2) : 0), (maxD*1.15)));
  let top = Math.ceil(rawTop/30) * 30;
  const yTicks = [
    {p:0,   label:"0"},
    {p:0.5, label:String(Math.round(top/2))},
    {p:1,   label:String(Math.round(top))}
  ];

  // x labels: start/mid/end dates
  const xLabels = [];
  if(dates.length){
    const fmt = (d)=> String(d.getMonth()+1).padStart(2,"0")+"/"+String(d.getFullYear()).slice(-2);
    xLabels.push({p:0, label: fmt(dates[0])});
    xLabels.push({p:0.5, label: fmt(dates[Math.floor(dates.length/2)])});
    xLabels.push({p:1, label: fmt(dates[dates.length-1])});
  }
  drawAxes(ctx, plot, yTicks, xLabels);

  // --- LIGNE ECG : MOYENNE DE VIE ---
  if(avgLife > 0 && avgLife <= top){
    const yy = plot.y + plot.h - (avgLife/top)*plot.h;
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(plot.x, yy); ctx.lineTo(plot.x + plot.w, yy); ctx.stroke();
    ctx.restore();
  }

  // reference bands 30/60/120
  [30,60,120].forEach(v=>{
    if(v>top) return;
    const yy = plot.y + plot.h - (v/top)*plot.h;
    ctx.strokeStyle = v===30 ? "rgba(56,211,159,.25)" : v===60 ? "rgba(255,204,102,.25)" : "rgba(255,93,93,.22)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(plot.x, yy); ctx.lineTo(plot.x+plot.w, yy); ctx.stroke();
  });

  if(intervals.length){
    ctx.strokeStyle = "rgba(255,204,102,.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    intervals.forEach((p,idx)=>{
      const x = plot.x + (intervals.length===1 ? 0.5 : (p.i/(intervals.length-1))) * plot.w;
      const y = plot.y + plot.h - (p.days/top) * plot.h;
      if(idx===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    ctx.fillStyle = "rgba(255,204,102,1)";

    // Points + tooltip data (hover). On met en évidence les "pics" (plus grands intervalles)
    const pts = [];
    const topN = 8;
    const peaks = intervals.slice().sort((a,b)=>b.days-a.days).slice(0, topN);
    const peakSet = new Set(peaks.map(p=>p.i));
    const fmtFull = (d)=> String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();

    intervals.forEach(p=>{
      const x = plot.x + (intervals.length===1 ? 0.5 : (p.i/(intervals.length-1))) * plot.w;
      const y = plot.y + plot.h - (p.days/top) * plot.h;
      const isPeak = peakSet.has(p.i);
      ctx.beginPath(); ctx.arc(x,y, isPeak ? 5 : 3, 0, Math.PI*2); ctx.fill();
      pts.push({
        x, y,
        title: fmtFull(p.d1),
        lines: [
          `Intervalle : ${p.days} jours`,
          `Du ${fmtFull(p.d0)} au ${fmtFull(p.d1)}`
        ]
      });
    });

    attachCanvasTooltip(canvas, pts);}

  ctx.fillStyle="rgba(255,255,255,.55)";
  ctx.font="11px var(--sans)";
  ctx.textAlign="center"; ctx.textBaseline="bottom";
  ctx.fillText("Dates", plot.x+plot.w/2, h-2);
  ctx.save();
  ctx.translate(12, plot.y+plot.h/2);
  ctx.rotate(-Math.PI/2);
  ctx.textAlign="center"; ctx.textBaseline="top";
  ctx.fillText("Jours d'intervalle", 0, 0);
  ctx.restore();
}

/* ---- Chart 4: Saisonnalité moyenne (Jan→Déc) ---- */
function paintSeasonalityAvg(canvas, tx){
  const {ctx, w, h} = resizeCanvasToContainer(canvas);
  ctx.clearRect(0,0,w,h);
  drawFrame(ctx,0,0,w,h);

  const byMonth = Array(12).fill(0);
  const years = new Set();
  tx.forEach(t=>{
    const d = new Date(t.dateISO);
    if(!isFinite(d)) return;
    years.add(d.getFullYear());
    byMonth[d.getMonth()] += 1;
  });
  const denom = Math.max(1, years.size); // moyenne par année
  const avg = byMonth.map(v=>v/denom);
  const maxV = Math.max(1, ...avg);

  const plot = getDefaultPlot(w,h);
  const step = niceStep(maxV, 4);
  const top = Math.ceil(maxV/step)*step;
  const yTicks = [];
  for(let v=0; v<=top; v+=step){
    yTicks.push({p: v/top, label: (v%1===0 ? String(v) : v.toFixed(1).replace(".",","))});
  }
  const mois = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];
  const xLabels = mois.map((lab,i)=>({p:(i/11), label: lab}));
  drawAxes(ctx, plot, yTicks, xLabels);

  // line + points
  ctx.strokeStyle = "rgba(110,168,255,.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  avg.forEach((v,i)=>{
    const x = plot.x + (i/11) * plot.w;
    const y = plot.y + plot.h - (v/top) * plot.h;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  ctx.fillStyle = "rgba(110,168,255,1)";
  avg.forEach((v,i)=>{
    const x = plot.x + (i/11) * plot.w;
    const y = plot.y + plot.h - (v/top) * plot.h;
    ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
  });

  // month labels along bottom (all months)
  ctx.fillStyle="rgba(255,255,255,.55)";
  ctx.font="10px var(--sans)";
  ctx.textAlign="center"; ctx.textBaseline="top";
  for(let i=0;i<12;i++){
    const x = plot.x + (i/11)*plot.w;
    ctx.fillText(mois[i], x, plot.y+plot.h+6);
  }

  ctx.fillStyle="rgba(255,255,255,.55)";
  ctx.font="11px var(--sans)";
  ctx.textAlign="center"; ctx.textBaseline="bottom";
  ctx.fillText("Mois", plot.x+plot.w/2, h-2);
  ctx.save();
  ctx.translate(12, plot.y+plot.h/2);
  ctx.rotate(-Math.PI/2);
  ctx.textAlign="center"; ctx.textBaseline="top";
  ctx.fillText("Moyenne commandes / mois", 0, 0);
  ctx.restore();
}


/* ---- Alt Chart 4: Panier moyen mensuel (durée de vie) ---- */
function paintAvgBasketMonthly(canvas, tx){
  const {ctx, w, h} = resizeCanvasToContainer(canvas);
  ctx.clearRect(0,0,w,h);
  drawFrame(ctx,0,0,w,h);

  // Agrégation par mois (YYYY-MM) : moyenne panier = somme / nb factures
  const byM = new Map(); // key -> {sum,count}
  tx.forEach(t=>{
    const iso = t.dateISO;
    if(!iso) return;
    const key = iso.slice(0,7); // YYYY-MM
    const cur = byM.get(key) || {sum:0, count:0};
    cur.sum += (+t.amountHT||0);
    cur.count += 1;
    byM.set(key, cur);
  });

  const keys = Array.from(byM.keys()).sort();
  const pts = keys.map(k=>{
    const o = byM.get(k);
    const avg = o.count ? (o.sum/o.count) : 0;
    return {k, avg, count:o.count, sum:o.sum};
  });

  const maxV = Math.max(1, ...pts.map(p=>p.avg), 100);
  const plot = getDefaultPlot(w,h);

  // ÉCHELLE ECG (pivot) :
  // - On force la MOYENNE au milieu des ordonnées (0..top) => top = 2x moyenne
  // - Fallback si moyenne indisponible : on s'adapte aux pics (maxVal * 1.15)
  const avgForScale = pts.length ? (pts.reduce((s,x)=>s+x.sum,0) / pts.reduce((s,x)=>s+x.count,0)) : 0;
  const rawTop = Math.max(100, Math.max((avgForScale>0 ? (avgForScale*2) : 0), (maxV*1.15)));

  const step = niceStep(rawTop, 4);
  const top = Math.ceil(rawTop/step)*step;

  const yTicks = [];
  for(let v=0; v<=top; v+=step){
    yTicks.push({p: v/top, label: fmtEUR(v)});
  }

  // Libellés X adaptatifs
  const xLabels = [];
  const n = Math.max(1, pts.length);
  if(pts.length){
    if(pts.length <= 24){
      // Tous les mois (MM/AA)
      for(let i=0;i<pts.length;i++){
        const lab = pts[i].k.slice(5,7)+"/"+pts[i].k.slice(2,4);
        xLabels.push({p:(i/(n-1||1)), label: lab});
      }
    }else{
      // 1 label par année (Jan), + dernier
      for(let i=0;i<pts.length;i++){
        const mm = pts[i].k.slice(5,7);
        if(mm==="01"){
          xLabels.push({p:(i/(n-1||1)), label: pts[i].k.slice(0,4)});
        }
      }
      xLabels.push({p:1, label: pts[pts.length-1].k.slice(0,4)});
    }
  }
  drawAxes(ctx, plot, yTicks, xLabels);

  // --- LIGNE ECG : MOYENNE DE VIE ---
  const avgLifeBasket = pts.length ? (pts.reduce((s,x)=>s+x.sum,0) / pts.reduce((s,x)=>s+x.count,0)) : 0;
  if(avgLifeBasket > 0 && avgLifeBasket <= top){
    const yy = plot.y + plot.h - (avgLifeBasket/top)*plot.h;
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(plot.x, yy); ctx.lineTo(plot.x + plot.w, yy); ctx.stroke();
    ctx.restore();
  }

  if(!pts.length){
    drawEmpty(ctx, plot, "Aucune donnée");
    return;
  }

  // Line + points
  ctx.strokeStyle = "rgba(110,168,255,.92)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p,i)=>{
    const x = plot.x + (i/(n-1||1))*plot.w;
    const y = plot.y + plot.h - (p.avg/top)*plot.h;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // Points
  ctx.fillStyle = "rgba(110,168,255,1)";
  pts.forEach((p,i)=>{
    const x = plot.x + (i/(n-1||1))*plot.w;
    const y = plot.y + plot.h - (p.avg/top)*plot.h;
    ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
  });

  // Axes labels
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.font = "11px var(--sans)";
  ctx.textAlign = "center"; ctx.textBaseline="bottom";
  ctx.fillText("Mois", plot.x + plot.w/2, h-2);

  // Tooltip points (hover)
  const points = pts.map((p,i)=>{
    const x = plot.x + (i/(n-1||1))*plot.w;
    const y = plot.y + plot.h - (p.avg/top)*plot.h;
    return {x, y, title: p.k, lines:[`Panier moyen : ${fmtEUR(p.avg)}`, `Factures : ${p.count}`, `CA mois : ${fmtEUR(p.sum)}`]};
  });
  attachCanvasTooltip(canvas, points);
}


/* === DIAGNOSTIC (no-UI) : auto-vérification des connexions DOM/JS === */
(function(){
  function byId(id){ return document.getElementById(id); }
  function report(level, msg){
    try{ (console[level]||console.log).call(console, msg); }catch(_){ }
  }
  function selfCheck(){
    const required = [
      "clientsBody","kpiBody",
      "clientDetailModal","btnCloseClientDetail",
      "chartVolume","chartOrders","chartVelocityIntervals","chartVelocityTrend"
    ];
    const missing = required.filter(id => !byId(id));
    if(missing.length){
      report("error","[AppRFM] DOM manquant: "+missing.join(", "));
    } else {
      report("log","[AppRFM] Self-check OK (DOM critique présent).");
    }
    // Vérif présence de l'overlay KPI si attendu
    const kpiOv = byId("overlay-kpi-detail") || byId("kpiDetailModal");
    if(!kpiOv){
      report("warn","[AppRFM] Note: overlay KPI detail non détecté (si normal, ignorer).");
    }
  }
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", selfCheck, {once:true});
  } else {
    selfCheck();
  }

// --- Matrice TF × TD ---
function renderTFTDMatrix(c){
  const host = document.getElementById("cdTFTDMatrix");
  if(!host || !c) return;

  const lv = _tftdLevels(c) || {};
  const td = (typeof lv.tdDisp==="number" && isFinite(lv.tdDisp)) ? lv.tdDisp : null;
  const tf = (typeof lv.tf==="number" && isFinite(lv.tf)) ? lv.tf : null;
  const tdLevel = (lv.tdLevel==null || !isFinite(lv.tdLevel)) ? null : lv.tdLevel;
  const tfLevel = (lv.tfLevel==null || !isFinite(lv.tfLevel)) ? null : lv.tfLevel;

  // Levels (0=best) -> (2=worst)

  // Abscisses (bas) : TV (Tendance Volume)
  const xLabels = ["TV stable (≥ -15%)","TV érosion (-15% à -50%)","TV chute (≤ -50%)"];
  // Ordonnées (gauche) : TF (Tendance Fréquence)
  const yLabels = ["TF stable (> -15%)","TF fragile (-15% à -25%)","TF à risque (≤ -25%)"];

  // Statuts (y bottom->top, x left->right)
  const statuses = [
    ["OK",            "Alerte",        "Alerte forte"],
    ["Érosion",       "Risque",        "Risque élevé"],
    ["Risque volume", "Critique",      "Critique +"]
  ];

  const bgClass = [
    ["tftd-soft-ok","tftd-soft-warn","tftd-soft-orange"],
    ["tftd-soft-warn","tftd-soft-orange","tftd-soft-red"],
    ["tftd-soft-orange","tftd-soft-red","tftd-soft-red"]
  ];

  const dotClassFromBg = (bg)=>{
    if(bg==="tftd-soft-ok") return "tftd-dot-ok";
    if(bg==="tftd-soft-warn") return "tftd-dot-warn";
    if(bg==="tftd-soft-orange") return "tftd-dot-orange";
    return "tftd-dot-red";
  };

  let grid = "";
  // header
  grid += `<div class="tftd-h"></div>`;
  for(let x=0;x<3;x++) grid += `<div class="tftd-h">${xLabels[x]}</div>`;

  // rows rendered top->bottom so OK row is bottom
  for(let y=2;y>=0;y--){
    grid += `<div class="tftd-y">${yLabels[y]}</div>`;
    for(let x=0;x<3;x++){
      const active = (tdLevel!==null && tfLevel!==null && x===tdLevel && y===tfLevel);
      const bg = bgClass[y][x];
      const cls = `tftd-cell ${bg} ${active?'tftd-active':''}`;
      const dotCls = dotClassFromBg(bg);
      grid += `<div class="${cls}">${statuses[y][x]}${active?`<span class="tftd-dot ${dotCls}" title="Client"></span>`:""}</div>`;
    }
  }

  host.innerHTML = `
    <div class="tftd-wrap">
      <div class="tftd-grid">${grid}</div>
      <div class="tftd-axes">
        <span><strong>TF</strong> (vertical) — Tendance Fréquence (rythme d'achat)</span>
        <span><strong>TV</strong> (horizontal) — Tendance Volume (évolution CA lissé)</span>
      </div>
    </div>
  `;
}
function _matrixCell(id, emo, label, coef, risk, active){
  const isActive = (active && active===id);
  const cls = "mCell r"+(Number.isFinite(risk)?risk:0)+" "+(isActive?"active":"");
  const coefTxt = (Number.isFinite(coef)?coef.toFixed(2):"");
  return `<div class="${cls}" data-mid="${id}">
            <span class="mEmo">${emo}</span>
            <span class="mCoef">×${coefTxt}</span>
            <span class="mLabel">${label}</span>
            ${isActive?'<span class="mDot"></span>':''}
          </div>`;
}

// Expose helpers globally (used by cockpit renderer)
window.renderTFTDMatrix = renderTFTDMatrix;
window._matrixCell = _matrixCell;


})();;

