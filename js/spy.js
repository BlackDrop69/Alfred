(function() {
    let spyActive = false;
    let isLocked = false;
    let isDragging = false;
    let offset = { x: 0, y: 0 };

    const panel = document.createElement('div');
    panel.id = "alfred-spy-genesis";
    panel.style.cssText = `
        display: none; /* <-- C'est ici que la magie opère */
        position:fixed; top:5%; right:20px; width:620px; max-height:88vh;
        background:rgba(5,5,5,0.98); color:#00ff00; border:1px solid #00ff00; 
        padding:25px; font-family:'Fira Code', 'Consolas', monospace; font-size:11px; 
        z-index:1000000; overflow-y:auto; border-radius:15px; box-shadow:0 0 50px rgba(0,255,0,0.3);
        backdrop-filter: blur(15px); pointer-events:auto; line-height:1.6; cursor:grab;
    `;
    
    const copyBtn = document.createElement('button');
    copyBtn.innerHTML = "🔗 COPIER L'ANALYSE TECHNIQUE";
    copyBtn.style.cssText = `width:100%; padding:15px; margin-bottom:20px; background:#00ff00; color:#000; border:none; border-radius:8px; font-weight:900; cursor:pointer; font-size:13px; text-transform:uppercase;`;
    
    const content = document.createElement('div');
    panel.appendChild(copyBtn);
    panel.appendChild(content);
    document.body.appendChild(panel);

    // --- LOGIQUE DE DRAG & DROP ---
    panel.addEventListener('mousedown', (e) => {
        if (e.target === copyBtn || e.target.closest('div[style*="background:#111"]')) return;
        isDragging = true;
        panel.style.cursor = 'grabbing';
        offset.x = e.clientX - panel.offsetLeft;
        offset.y = e.clientY - panel.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        panel.style.left = (e.clientX - offset.x) + 'px';
        panel.style.top = (e.clientY - offset.y) + 'px';
        panel.style.right = 'auto'; // Désactive le placement initial
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        panel.style.cursor = 'grab';
    });

    copyBtn.onclick = () => {
        navigator.clipboard.writeText(content.innerText).then(() => {
            copyBtn.innerHTML = "✅ ADN COPIÉ DANS LE PRESSE-PAPIER";
            setTimeout(() => copyBtn.innerHTML = "🔗 COPIER L'ANALYSE TECHNIQUE", 2000);
        });
    };

    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 's') { spyActive = !spyActive; isLocked = false; panel.style.display = spyActive ? 'block' : 'none'; }
        if (spyActive && (e.key.toLowerCase() === 'l' || e.code === 'Space')) { e.preventDefault(); isLocked = !isLocked; panel.style.borderColor = isLocked ? '#ff0055' : '#00ff00'; }
    });

    window.addEventListener('mouseover', (e) => {
        if (!spyActive || isLocked) return;
        const el = e.target;
        const parent = el.parentElement;
        const s = window.getComputedStyle(el);
        const ps = parent ? window.getComputedStyle(parent) : null;
        const getSel = (node) => node.tagName.toLowerCase() + (node.id ? '#' + node.id : '') + (node.classList.length ? '.' + Array.from(node.classList).join('.') : '');

        let sourceFile = "core.js";
        if(el.closest('#view-studio')) sourceFile = "studio.js";
        if(el.closest('#view-horizon')) sourceFile = "horizon.js";
        if(el.closest('#view-objectifs')) sourceFile = "objectifs.js";
        if(el.closest('#view-alfred')) sourceFile = "alfred.js";

        content.innerHTML = `
<b style="color:#fff; font-size:14px;">[DNA SCAN : ${getSel(el)}]</b>
<br>------------------------------------------------------------<br>

<b style="color:cyan;">[1. STRUCTURE HTML & DOM]</b>
<br>SÉLECTEUR CIBLE : ${getSel(el)}
<br>SÉLECTEUR PARENT : ${parent ? getSel(parent) : 'N/A'}
<br>HIÉRARCHIE      : ${parent ? parent.tagName : 'ROOT'} > ${el.tagName} (${el.children.length} enfants)
<br>
<b style="color:cyan;">[2. LOGIQUE JAVASCRIPT & DATA]</b>
<br>FICHIER SOURCE  : ${sourceFile}
<br>VALEUR ACTUELLE : "${el.innerText || el.value || 'N/A'}"
<br>TYPE D'ÉVÉNEMENT : ${el.onclick ? 'Action Inline' : 'Déléguée'}
<br>DATA-ATTRIBUTES : ${JSON.stringify(el.dataset, null, 2)}
<br>FONCTION SOURCE : ${el.onclick ? '<div style="color:#aaa; background:#111; padding:10px; border-left:4px solid orange; margin-top:8px;">' + el.onclick.toString() + '</div>' : 'Rechercher dans ' + sourceFile}
<br>
<b style="color:cyan;">[3. PROPRIÉTÉS CSS & LAYOUT]</b>
<br>DIMENSIONS      : ${el.offsetWidth}x${el.offsetHeight}px
<br>POSITIONNEMENT  : ${s.position} (z-index: ${s.zIndex})
<br>CONTEXTE PARENT : ${ps?.display} (${ps?.flexDirection || ''}) | Gap: ${ps?.gap}
<br>ESPACEMENTS     : Marges:${s.margin} / Padding:${s.padding}
<br>
<b style="color:cyan;">[4. DESIGN & RENDU VISUEL]</b>
<br>COULEUR TEXTE   : ${s.color}
<br>BACK-COLOR      : ${s.backgroundColor}
<br>BORDURES        : ${s.border} (Radius: ${s.borderRadius})
<br>VISIBILITÉ      : ${s.display} | Opacity: ${s.opacity}
<br>------------------------------------------------------------`;
    });
})();