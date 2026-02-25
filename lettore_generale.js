// =====================================================================
// CONFIGURAZIONE SERVER
// =====================================================================
const WORKER_URL = 'https://scanner-alloggiati.giacomogalassi2015.workers.dev';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const cropCanvas = document.getElementById('crop-preview');
const startBtn = document.getElementById('start-button');
const scanBtn = document.getElementById('scan-button');
const statusDiv = document.getElementById('status');
const resultDiv = document.getElementById('result');
const mirino = document.getElementById('mirino');
const previewContainer = document.getElementById('preview-container');

const constraints = { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } };

// =====================================================================
// 0. LOGICA MIRINO INTERATTIVO
// =====================================================================
const container = document.getElementById('video-container');
const MIN_W = 80, MIN_H = 40;

function initMirino() {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;

    const w  = Math.round(cw * 0.8);
    const h  = Math.round(ch * 0.25);

    mirino.style.width  = w + 'px';
    mirino.style.height = h + 'px';
    mirino.style.left   = Math.round((cw - w) / 2) + 'px';
    mirino.style.top    = Math.round((ch - h) / 2) + 'px';
}

// Aggiungi maniglie
const HANDLES = ['nw','n','ne','e','se','s','sw','w'];
HANDLES.forEach(pos => {
    const h = document.createElement('div');
    h.className = 'mirino-handle';
    h.dataset.pos = pos;
    mirino.appendChild(h);
});

function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

function getRect() {
    return {
        x: parseInt(mirino.style.left, 10) || 0,
        y: parseInt(mirino.style.top, 10) || 0,
        w: parseInt(mirino.style.width, 10) || MIN_W,
        h: parseInt(mirino.style.height, 10) || MIN_H,
    };
}

function applyRect(x, y, w, h) {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    w = clamp(w, MIN_W, cw);
    h = clamp(h, MIN_H, ch);
    x = clamp(x, 0, cw - w);
    y = clamp(y, 0, ch - h);
    mirino.style.left   = x + 'px';
    mirino.style.top    = y + 'px';
    mirino.style.width  = w + 'px';
    mirino.style.height = h + 'px';
}

let action = null;

function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const pos = e.target.dataset.pos;

    if (e.target === mirino || e.target.classList.contains('mirino-handle')) {
        e.preventDefault();
        action = {
            type: pos ? 'resize' : 'drag',
            pos: pos || null,
            startX: t.clientX,
            startY: t.clientY,
            startRect: getRect(),
        };
    }
}

function onTouchMove(e) {
    if (!action || e.touches.length !== 1) return;
    e.preventDefault();
    const t  = e.touches[0];
    const dx = t.clientX - action.startX;
    const dy = t.clientY - action.startY;
    const r  = action.startRect;

    if (action.type === 'drag') {
        applyRect(r.x + dx, r.y + dy, r.w, r.h);
        return;
    }

    let { x, y, w, h } = r;
    const p = action.pos;

    if (p.includes('e')) w = r.w + dx;
    if (p.includes('s')) h = r.h + dy;
    if (p.includes('w')) { x = r.x + dx; w = r.w - dx; }
    if (p.includes('n')) { y = r.y + dy; h = r.h - dy; }

    if (w < MIN_W) { if (p.includes('w')) x = r.x + r.w - MIN_W; w = MIN_W; }
    if (h < MIN_H) { if (p.includes('n')) y = r.y + r.h - MIN_H; h = MIN_H; }

    applyRect(x, y, w, h);
}

function onTouchEnd() { action = null; }

mirino.addEventListener('touchstart', onTouchStart, { passive: false });
mirino.addEventListener('touchmove',  onTouchMove,  { passive: false });
mirino.addEventListener('touchend',   onTouchEnd);

mirino.addEventListener('mousedown', e => {
    if (e.target === mirino || e.target.classList.contains('mirino-handle')) {
        e.preventDefault();
        const pos = e.target.dataset.pos;
        action = { type: pos ? 'resize' : 'drag', pos: pos || null, startX: e.clientX, startY: e.clientY, startRect: getRect() };
    }
});

document.addEventListener('mousemove', e => {
    if (!action) return;
    const dx = e.clientX - action.startX;
    const dy = e.clientY - action.startY;
    const r  = action.startRect;
    if (action.type === 'drag') { applyRect(r.x+dx, r.y+dy, r.w, r.h); return; }
    let {x,y,w,h} = r;
    const p = action.pos;
    if (p.includes('e')) w = r.w+dx;
    if (p.includes('s')) h = r.h+dy;
    if (p.includes('w')) { x = r.x+dx; w = r.w-dx; }
    if (p.includes('n')) { y = r.y+dy; h = r.h-dy; }
    if (w < MIN_W) { if (p.includes('w')) x = r.x+r.w-MIN_W; w = MIN_W; }
    if (h < MIN_H) { if (p.includes('n')) y = r.y+r.h-MIN_H; h = MIN_H; }
    applyRect(x,y,w,h);
});
document.addEventListener('mouseup', () => { action = null; });

// =====================================================================
// RESIZE / ROTAZIONE SCHERMO
// =====================================================================
let resizeTimer = null;

function safeInitMirino() {
    if (resizeTimer !== null) {
        clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                initMirino();
                resizeTimer = null;
            });
        });
    }, 150);
}

window.addEventListener('resize', safeInitMirino);
window.addEventListener('orientationchange', safeInitMirino);

// =====================================================================
// 1. LOGICHE ICAO
// =====================================================================
function icaoCheckDigit(str) {
    const weights = [7, 3, 1];
    const charValues = {
        '<': 0, '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
        'A':10,'B':11,'C':12,'D':13,'E':14,'F':15,'G':16,'H':17,'I':18,
        'J':19,'K':20,'L':21,'M':22,'N':23,'O':24,'P':25,'Q':26,'R':27,
        'S':28,'T':29,'U':30,'V':31,'W':32,'X':33,'Y':34,'Z':35
    };
    let sum = 0;
    for (let i = 0; i < str.length; i++) {
        sum += (charValues[str[i]] ?? 0) * weights[i % 3];
    }
    return sum % 10;
}

function extractAndFixMRZ(rawText) {
    let cleaned = rawText.toUpperCase().replace(/[^A-Z0-9<\n]/g, '').split('\n').map(l => l.trim()).filter(l => l.length >= 20).join('\n');
    const candidates = [];
    const lineRegex = /[A-Z0-9<]{28,32}/g;
    let match;
    while ((match = lineRegex.exec(cleaned.replace(/\n/g, ''))) !== null) {
        candidates.push(match[0]);
    }

    const lines = candidates.map(line => {
        if (line.length > 30) line = line.substring(0, 30);
        if (line.length < 30) line = line.padEnd(30, '<');
        line = line.replace(/[KLC]{3,}/g, match => '<'.repeat(match.length));
        return line;
    });

    const validated = lines.map((line, idx) => {
        let valid = false;
        if (idx === 0 && line.length === 30) {
            const docNum = line.substring(5, 14);
            const checkChar = parseInt(line[14]);
            valid = !isNaN(checkChar) && icaoCheckDigit(docNum) === checkChar;
        } else if (idx === 1 && line.length === 30) {
            const dob = line.substring(0, 6);
            const dobCheck = parseInt(line[6]);
            const exp = line.substring(8, 14);
            const expCheck = parseInt(line[14]);
            valid = !isNaN(dobCheck) && !isNaN(expCheck) && icaoCheckDigit(dob) === dobCheck && icaoCheckDigit(exp) === expCheck;
        } else if (idx === 2 && line.length === 30) {
            valid = true;
        }
        return { line, checksumValid: valid };
    });
    return validated;
}

// =====================================================================
// 2. ACCENSIONE FOTOCAMERA
// =====================================================================
startBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        startBtn.style.display = 'none';
        scanBtn.style.display = 'block';

        video.onloadedmetadata = () => {
            initMirino();
        };

        statusDiv.textContent = "Regola il mirino sulla banda MRZ e scatta.";
    } catch (err) {
        statusDiv.textContent = "Errore fotocamera. Controlla i permessi.";
    }
});

// =====================================================================
// 3. SCATTO E CROP — TRUCCO GRANDANGOLO
// =====================================================================

// (Manteniamo la funzione di Claude nel codice per non rompere la struttura, anche se non la usiamo)
function getCoverGeometry() {
    const displayW = video.clientWidth;
    const displayH = video.clientHeight;
    const srcW     = video.videoWidth;
    const srcH     = video.videoHeight;
    const scale = Math.max(displayW / srcW, displayH / srcH);
    const scaledW = srcW * scale;
    const scaledH = srcH * scale;
    const overshootX = (scaledW - displayW) / 2;
    const overshootY = (scaledH - displayH) / 2;
    const offsetX = overshootX / scale;
    const offsetY = overshootY / scale;
    return { scale, offsetX, offsetY };
}

scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    statusDiv.textContent = "Invio sicuro a Google Vision in corso...";
    resultDiv.style.display = "none";
    previewContainer.style.display = "none";

    try {
        if (!video.videoWidth || !video.videoHeight || !video.clientWidth || !video.clientHeight) {
            throw new Error('Video non ancora pronto. Riprova tra un momento.');
        }

        // --- TRUCCO GRANDANGOLO: NESSUN RITAGLIO, MANDIAMO TUTTA LA FOTO A GOOGLE ---
        
        // 1. Disegna il fotogramma completo sul canvas principale
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 2. Mostriamo in anteprima all'utente l'intero fotogramma (ridimensionato via CSS)
        cropCanvas.width  = canvas.width;
        cropCanvas.height = canvas.height;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);

        // 3. Convertiamo l'intera immagine in Base64 (Qualità 0.8)
        const base64Image = canvas.toDataURL('image/jpeg', 0.8);
        
        console.log('[SCATTO] Fotogramma intero inviato a Google Vision.');

        let response;
        try {
            response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Image })
            });
        } catch (fetchErr) {
            const detail = `Errore di rete [${fetchErr.name}]: ${fetchErr.message}`;
            console.error('[FETCH ERROR]', fetchErr);
            throw new Error(detail);
        }

        if (!response.ok) {
            let serverMsg = '';
            try { serverMsg = await response.text(); } catch (_) {}
            console.error('[SERVER ERROR]', response.status, serverMsg);
            throw new Error(`Errore server ${response.status}: ${serverMsg || response.statusText}`);
        }

        const data = await response.json();
        const rawText = data.text ?? '';

        if (!rawText.trim()) {
            throw new Error('Nessun testo rilevato. Riprova con più luce.');
        }

        previewContainer.style.display = "block";
        document.querySelector('#preview-container p').textContent = "Foto intera inviata a Google:";

        const mrzLines = extractAndFixMRZ(rawText);

        resultDiv.innerHTML = `
            <h3>Risultato Google Vision + ICAO</h3>
            ${mrzLines.length > 0 ? mrzLines.map((r, i) => `
                <div style="font-family:monospace; font-size:15px; padding:8px;
                            background:${r.checksumValid ? '#e6ffe6' : '#fff3cd'};
                            border-left: 4px solid ${r.checksumValid ? 'green' : 'orange'};
                            margin-bottom:4px;">
                    Riga ${i+1}: ${r.line}
                    <br><span style="font-size:11px; color:gray;">
                        ${r.checksumValid ? '✓ Checksum OK' : '⚠ Attenzione: Checksum Fallito'}
                    </span>
                </div>
            `).join('') : '<div style="color:red;">Impossibile isolare 3 righe MRZ valide. Riprova.</div>'}

            <h4 style="margin-top: 15px;">Testo Grezzo Google (Per Debug):</h4>
            <div style="font-size: 11px; color: gray; font-family: monospace; word-break: break-all;">
                ${rawText.replace(/\n/g, '<br>')}
            </div>
        `;
        resultDiv.style.display = "block";
        statusDiv.textContent = "Scansione completata!";

    } catch (err) {
        const msg = `Errore [${err.name ?? 'Error'}]: ${err.message}`;
        statusDiv.textContent = msg;
        console.error('[SCAN ERROR]', err);
    }

    scanBtn.disabled = false;
});