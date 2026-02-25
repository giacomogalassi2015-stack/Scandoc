// =====================================================================
// CONFIGURAZIONE SERVER
// =====================================================================
const WORKER_URL = 'https://scanner-alloggiati.giacomogalassi2015.workers.dev';

// =====================================================================
// DOM REFS
// =====================================================================
const video            = document.getElementById('video');
const canvas           = document.getElementById('canvas');
const cropCanvas       = document.getElementById('crop-preview');
const startBtn         = document.getElementById('start-button');
const scanBtn          = document.getElementById('scan-button');
const statusDiv        = document.getElementById('status');
const resultDiv        = document.getElementById('result');
const mirino           = document.getElementById('mirino');
const previewContainer = document.getElementById('preview-container');
const container        = document.getElementById('video-container');

// Sections
const modeSection    = document.getElementById('mode-selection');
const cameraSection  = document.getElementById('camera-section');
const formSection    = document.getElementById('form-section');
const cameraModeLabel = document.getElementById('camera-mode-label');

// Mode buttons
const btnPassport = document.getElementById('btn-passport');
const btnCie      = document.getElementById('btn-cie');
const btnManual   = document.getElementById('btn-manual');
const btnChangeMode   = document.getElementById('btn-change-mode');
const btnBackFromForm = document.getElementById('btn-back-from-form');

// Form fields
const fNome         = document.getElementById('f-nome');
const fCognome      = document.getElementById('f-cognome');
const fSesso        = document.getElementById('f-sesso');
const fNascita      = document.getElementById('f-nascita');
const fComuneNascita= document.getElementById('f-comune-nascita');
const fCittadinanza = document.getElementById('f-cittadinanza');
const fTipoDoc      = document.getElementById('f-tipo-doc');
const fNumDoc       = document.getElementById('f-num-doc');
const fLuogoRilascio= document.getElementById('f-luogo-rilascio');
const fArrivo       = document.getElementById('f-arrivo');
const fPermanenza   = document.getElementById('f-permanenza');

const btnClearForm = document.getElementById('btn-clear-form');
const btnSaveForm  = document.getElementById('btn-save-form');
const mrzDebugContainer = document.getElementById('mrz-debug-container');
const mrzDebugDiv       = document.getElementById('mrz-debug');
const toggleDebug       = document.getElementById('toggle-debug');

// Toast
const toast = (() => {
    const el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
    return el;
})();

// =====================================================================
// STATO
// =====================================================================
let currentMode = null; // 'passport' | 'cie' | 'manual'
let cameraStream = null;

const constraints = {
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
};

// =====================================================================
// UTILS
// =====================================================================
function showToast(msg, duration = 2500) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

function todayISO() {
    return new Date().toISOString().split('T')[0];
}

// Converte una data MRZ (YYMMDD) in YYYY-MM-DD
function mrzDateToISO(yymmdd) {
    if (!yymmdd || yymmdd.length !== 6) return '';
    const yy = parseInt(yymmdd.substring(0, 2), 10);
    const mm = yymmdd.substring(2, 4);
    const dd = yymmdd.substring(4, 6);
    // Soglia: se yy <= 30 siamo nel 2000, altrimenti 1900
    const yyyy = yy <= 30 ? 2000 + yy : 1900 + yy;
    return `${yyyy}-${mm}-${dd}`;
}

function stripFiller(str) {
    return str.replace(/</g, ' ').trim().replace(/\s+/g, ' ');
}

// =====================================================================
// NAVIGAZIONE TRA SEZIONI
// =====================================================================
function showSection(name) {
    modeSection.style.display   = name === 'mode'   ? '' : 'none';
    cameraSection.style.display = name === 'camera' ? '' : 'none';
    formSection.style.display   = name === 'form'   ? '' : 'none';
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
    video.srcObject = null;
    startBtn.style.display = 'block';
    scanBtn.style.display  = 'none';
}

btnPassport.addEventListener('click', () => activateCameraMode('passport'));
btnCie.addEventListener('click',      () => activateCameraMode('cie'));
btnManual.addEventListener('click',   () => activateManualMode());
btnChangeMode.addEventListener('click', goBackToMode);
btnBackFromForm.addEventListener('click', () => {
    if (currentMode === 'manual') {
        goBackToMode();
    } else {
        showSection('camera');
        resultDiv.style.display = 'none';
        previewContainer.style.display = 'none';
    }
});

function goBackToMode() {
    stopCamera();
    currentMode = null;
    showSection('mode');
}

function activateCameraMode(mode) {
    currentMode = mode;
    const label = mode === 'passport' ? '🛂 Passaporto' : '🪪 Carta d\'Identità';
    cameraModeLabel.textContent = `Modalità: ${label}`;
    statusDiv.textContent = 'Fotocamera pronta — premi Accendi per iniziare.';
    resultDiv.style.display = 'none';
    previewContainer.style.display = 'none';
    showSection('camera');
}

function activateManualMode() {
    currentMode = 'manual';
    clearForm();
    fArrivo.value = todayISO();
    showSection('form');
    mrzDebugContainer.style.display = 'none';
}

// =====================================================================
// MIRINO INTERATTIVO
// =====================================================================
const MIN_W = 80, MIN_H = 40;
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
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

function initMirino() {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;
    const w = Math.round(cw * 0.85);
    const h = Math.round(ch * 0.28);
    mirino.style.width  = w + 'px';
    mirino.style.height = h + 'px';
    mirino.style.left   = Math.round((cw - w) / 2) + 'px';
    mirino.style.top    = Math.round((ch - h) / 2) + 'px';
}

let action = null;

function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const pos = e.target.dataset.pos;
    if (e.target === mirino || e.target.classList.contains('mirino-handle')) {
        e.preventDefault();
        action = { type: pos ? 'resize' : 'drag', pos: pos || null, startX: t.clientX, startY: t.clientY, startRect: getRect() };
    }
}

function onTouchMove(e) {
    if (!action || e.touches.length !== 1) return;
    e.preventDefault();
    const t  = e.touches[0];
    const dx = t.clientX - action.startX;
    const dy = t.clientY - action.startY;
    const r  = action.startRect;
    if (action.type === 'drag') { applyRect(r.x + dx, r.y + dy, r.w, r.h); return; }
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
    if (action.type === 'drag') { applyRect(r.x + dx, r.y + dy, r.w, r.h); return; }
    let { x, y, w, h } = r;
    const p = action.pos;
    if (p.includes('e')) w = r.w + dx;
    if (p.includes('s')) h = r.h + dy;
    if (p.includes('w')) { x = r.x + dx; w = r.w - dx; }
    if (p.includes('n')) { y = r.y + dy; h = r.h - dy; }
    if (w < MIN_W) { if (p.includes('w')) x = r.x + r.w - MIN_W; w = MIN_W; }
    if (h < MIN_H) { if (p.includes('n')) y = r.y + r.h - MIN_H; h = MIN_H; }
    applyRect(x, y, w, h);
});
document.addEventListener('mouseup', () => { action = null; });

// Resize / orientamento
let resizeTimer = null;
function safeInitMirino() {
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        requestAnimationFrame(() => requestAnimationFrame(() => { initMirino(); resizeTimer = null; }));
    }, 150);
}
window.addEventListener('resize', safeInitMirino);
window.addEventListener('orientationchange', safeInitMirino);

// =====================================================================
// LOGICHE ICAO — CHECKSUM
// =====================================================================
function icaoCheckDigit(str) {
    const weights = [7, 3, 1];
    const charValues = {
        '<':0,'0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
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

function extractAndFixMRZ(rawText, docType) {
    // Pulisce e filtra le righe
    const minLen = docType === 'passport' ? 40 : 28;
    const exactLen = docType === 'passport' ? 44 : 30;

    let lines = rawText
        .toUpperCase()
        .replace(/[^A-Z0-9<\n]/g, '')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length >= minLen);

    // Se non ci sono ritorni a capo, proviamo a spezzare per lunghezza
    if (lines.length === 0) {
        const flat = rawText.toUpperCase().replace(/[^A-Z0-9<]/g, '');
        lines = [];
        for (let i = 0; i < flat.length; i += exactLen) {
            const chunk = flat.substring(i, i + exactLen);
            if (chunk.length >= minLen) lines.push(chunk);
        }
    }

    // Normalizza a exactLen
    lines = lines.map(l => {
        if (l.length > exactLen) l = l.substring(0, exactLen);
        if (l.length < exactLen) l = l.padEnd(exactLen, '<');
        return l;
    });

    const expectedLines = docType === 'passport' ? 2 : 3;
    lines = lines.slice(0, expectedLines);

    // Validazione checksum per ogni riga
    const validated = lines.map((line, idx) => {
        let valid = false;

        if (docType === 'passport') {
            if (idx === 0) {
                // P<NAT + cognome<<nome
                valid = line[0] === 'P';
            } else if (idx === 1) {
                // docNum(9)+check+nat(3)+dob(6)+check+sesso+exp(6)+check+…+check
                const docNum   = line.substring(0, 9);
                const docCheck = parseInt(line[9], 10);
                const dob      = line.substring(13, 19);
                const dobCheck = parseInt(line[19], 10);
                const exp      = line.substring(21, 27);
                const expCheck = parseInt(line[27], 10);
                valid = !isNaN(docCheck) && !isNaN(dobCheck) && !isNaN(expCheck) &&
                        icaoCheckDigit(docNum) === docCheck &&
                        icaoCheckDigit(dob)    === dobCheck &&
                        icaoCheckDigit(exp)    === expCheck;
            }
        } else {
            // CIE ID1
            if (idx === 0) {
                const docNum   = line.substring(5, 14);
                const docCheck = parseInt(line[14], 10);
                valid = !isNaN(docCheck) && icaoCheckDigit(docNum) === docCheck;
            } else if (idx === 1) {
                const dob      = line.substring(0, 6);
                const dobCheck = parseInt(line[6], 10);
                const exp      = line.substring(8, 14);
                const expCheck = parseInt(line[14], 10);
                valid = !isNaN(dobCheck) && !isNaN(expCheck) &&
                        icaoCheckDigit(dob) === dobCheck &&
                        icaoCheckDigit(exp) === expCheck;
            } else if (idx === 2) {
                valid = true; // nome/cognome, no checksum standard
            }
        }

        return { line, checksumValid: valid };
    });

    return validated;
}

// =====================================================================
// PARSER MRZ → dati strutturati
// =====================================================================
/**
 * Estrae i campi dal MRZ validato.
 * @param {Array<{line:string, checksumValid:boolean}>} mrzLines
 * @param {'passport'|'cie'} docType
 * @returns {Object} dati del documento
 */
function parseMRZ(mrzLines, docType) {
    const result = {
        tipoDoc: '', numDoc: '', cognome: '', nome: '',
        sesso: '', dataNascita: '', cittadinanza: '',
        luogoRilascio: ''
    };

    try {
        if (docType === 'passport') {
            // ---- PASSAPORTO (TD3) — 2 righe da 44 ----
            // Riga 0: P<NAT COGNOME<<NOME<...
            // Riga 1: DOCNUM(9)+check+NAT(3)+DOB(6)+check+SEX+EXP(6)+check+OPTIONAL+check

            const r0 = (mrzLines[0]?.line ?? '').padEnd(44, '<');
            const r1 = (mrzLines[1]?.line ?? '').padEnd(44, '<');

            result.tipoDoc = 'P';

            // Tipo specifico doc (es. PO, PC…)
            const rawType = r0.substring(0, 2).replace(/<+$/, '');
            result.tipoDoc = rawType || 'P';

            // Cognome e Nome — dopo i 5 car di tipo+nazione
            const namePart = r0.substring(5);
            const sepIdx   = namePart.indexOf('<<');
            if (sepIdx !== -1) {
                result.cognome = stripFiller(namePart.substring(0, sepIdx));
                result.nome    = stripFiller(namePart.substring(sepIdx + 2).replace(/<<.*/,''));
            } else {
                result.cognome = stripFiller(namePart);
            }

            result.numDoc       = r1.substring(0, 9).replace(/<+$/, '');
            result.cittadinanza = r1.substring(10, 13).replace(/<+$/, '');
            result.dataNascita  = mrzDateToISO(r1.substring(13, 19));
            result.sesso        = r1[20] === 'M' ? 'M' : (r1[20] === 'F' ? 'F' : '');

        } else {
            // ---- CIE (ID1) — 3 righe da 30 ----
            // Riga 0: tipo(2)+nazione(3)+numDoc(9)+check+addl(15)
            // Riga 1: DOB(6)+check+sesso+EXP(6)+check+nazione(3)+optional+check
            // Riga 2: COGNOME<<NOME<…

            const r0 = (mrzLines[0]?.line ?? '').padEnd(30, '<');
            const r1 = (mrzLines[1]?.line ?? '').padEnd(30, '<');
            const r2 = (mrzLines[2]?.line ?? '').padEnd(30, '<');

            const rawType = r0.substring(0, 2).replace(/<+$/, '');
            result.tipoDoc = rawType || 'I';

            result.numDoc      = r0.substring(5, 14).replace(/<+$/, '');
            result.dataNascita = mrzDateToISO(r1.substring(0, 6));
            result.sesso       = r1[7] === 'M' ? 'M' : (r1[7] === 'F' ? 'F' : '');
            result.cittadinanza= r1.substring(15, 18).replace(/<+$/, '');

            // Cognome e Nome dalla riga 2
            const sepIdx = r2.indexOf('<<');
            if (sepIdx !== -1) {
                result.cognome = stripFiller(r2.substring(0, sepIdx));
                result.nome    = stripFiller(r2.substring(sepIdx + 2).replace(/<<.*/,''));
            } else {
                result.cognome = stripFiller(r2);
            }
        }
    } catch (err) {
        console.warn('[parseMRZ] Errore:', err);
    }

    return result;
}

// =====================================================================
// POPOLAMENTO FORM
// =====================================================================
function clearForm() {
    [fNome, fCognome, fSesso, fNascita, fComuneNascita,
     fCittadinanza, fTipoDoc, fNumDoc, fLuogoRilascio, fPermanenza].forEach(el => {
        if (el.tagName === 'SELECT') el.value = '';
        else el.value = '';
        el.classList.remove('autofilled');
    });
    fPermanenza.value = '1';
    fArrivo.value = todayISO();
}

function populateForm(data) {
    const fieldMap = [
        [fNome,          data.nome],
        [fCognome,       data.cognome],
        [fSesso,         data.sesso],
        [fNascita,       data.dataNascita],
        [fCittadinanza,  data.cittadinanza],
        [fNumDoc,        data.numDoc],
    ];

    fieldMap.forEach(([el, val]) => {
        if (val) {
            el.value = val;
            el.classList.add('autofilled');
        }
    });

    // Tipo documento
    if (data.tipoDoc) {
        const t = data.tipoDoc[0];
        if (['P','I','V','A'].includes(t)) {
            fTipoDoc.value = t;
            fTipoDoc.classList.add('autofilled');
        }
    }

    // Data di arrivo: sempre oggi
    fArrivo.value = todayISO();
}

// =====================================================================
// FOTOCAMERA
// =====================================================================
startBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraStream = stream;
        video.srcObject = stream;
        startBtn.style.display = 'none';
        scanBtn.style.display  = 'block';

        video.onloadedmetadata = () => { initMirino(); };
        statusDiv.textContent = 'Regola il mirino sulla banda MRZ e scatta.';
    } catch (err) {
        statusDiv.textContent = 'Errore fotocamera. Controlla i permessi.';
        console.error(err);
    }
});

// =====================================================================
// GEOMETRIA COVER
// =====================================================================
function getCoverGeometry() {
    const displayW = video.clientWidth;
    const displayH = video.clientHeight;
    const srcW     = video.videoWidth;
    const srcH     = video.videoHeight;
    const scale    = Math.max(displayW / srcW, displayH / srcH);
    const scaledW  = srcW * scale;
    const scaledH  = srcH * scale;
    const overshootX = (scaledW - displayW) / 2;
    const overshootY = (scaledH - displayH) / 2;
    return { scale, offsetX: overshootX / scale, offsetY: overshootY / scale };
}

// =====================================================================
// SCATTO → OCR → PARSE → FORM
// =====================================================================
scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    statusDiv.textContent = 'Invio sicuro a Google Vision in corso...';
    resultDiv.style.display = 'none';
    previewContainer.style.display = 'none';

    try {
        if (!video.videoWidth || !video.videoHeight || !video.clientWidth || !video.clientHeight) {
            throw new Error('Video non ancora pronto. Riprova tra un momento.');
        }

        const { scale, offsetX, offsetY } = getCoverGeometry();
        const rect    = getRect();
        const PADDING = 10;

        const cropX = Math.max(0, Math.floor(rect.x / scale + offsetX - PADDING));
        const cropY = Math.max(0, Math.floor(rect.y / scale + offsetY - PADDING));
        const cropW = Math.max(1, Math.min(video.videoWidth  - cropX, Math.floor(rect.w / scale + PADDING * 2)));
        const cropH = Math.max(1, Math.min(video.videoHeight - cropY, Math.floor(rect.h / scale + PADDING * 2)));

        console.log('[COVER GEOMETRY]', { scale, offsetX, offsetY });
        console.log('[CROP]', { cropX, cropY, cropW, cropH, videoW: video.videoWidth, videoH: video.videoHeight });

        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

        cropCanvas.width  = cropW;
        cropCanvas.height = cropH;
        cropCanvas.getContext('2d').drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        const base64Image = cropCanvas.toDataURL('image/jpeg', 0.9);

        // --- FETCH verso il worker (invariata) ---
        let response;
        try {
            response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Image })
            });
        } catch (fetchErr) {
            throw new Error(`Errore di rete [${fetchErr.name}]: ${fetchErr.message}`);
        }

        if (!response.ok) {
            let serverMsg = '';
            try { serverMsg = await response.text(); } catch (_) {}
            throw new Error(`Errore server ${response.status}: ${serverMsg || response.statusText}`);
        }

        const data    = await response.json();
        const rawText = data.text ?? '';

        if (!rawText.trim()) throw new Error('Nessun testo rilevato. Riprova con più luce.');

        previewContainer.style.display = 'block';
        document.querySelector('#preview-container p').textContent = 'Foto inviata a Google Vision:';

        // Estrai e valida le righe MRZ
        const mrzLines = extractAndFixMRZ(rawText, currentMode);

        // Render debug MRZ nella sezione camera
        resultDiv.innerHTML = `
            <h3>Risultato Google Vision + ICAO</h3>
            ${mrzLines.length > 0
                ? mrzLines.map((r, i) => `
                    <div class="mrz-row ${r.checksumValid ? 'ok' : 'warn'}">
                        Riga ${i + 1}: ${r.line.replace(/</g, '&lt;')}
                        <div class="mrz-row-status">
                            ${r.checksumValid ? '✓ Checksum OK' : '⚠ Checksum fallito — dati potrebbero essere imprecisi'}
                        </div>
                    </div>
                `).join('')
                : '<div style="color:#e05c5c;">Impossibile isolare righe MRZ valide. Riprova.</div>'}
            <h4>Testo grezzo Google Vision (debug):</h4>
            <div style="font-size:0.7rem; color:#7a82a6; font-family:monospace; word-break:break-all; margin-top:4px;">
                ${rawText.replace(/</g, '&lt;').replace(/\n/g, '<br>')}
            </div>`;
        resultDiv.style.display = 'block';
        statusDiv.textContent = 'Scansione completata!';

        // Parsa i dati dal MRZ
        const parsed = parseMRZ(mrzLines, currentMode);
        console.log('[PARSED]', parsed);

        // Prepara il form
        clearForm();
        populateForm(parsed);

        // Mostra il form per completare i dati mancanti
        mrzDebugContainer.style.display = 'block';
        mrzDebugDiv.innerHTML = resultDiv.innerHTML;
        mrzDebugDiv.style.display = 'none';
        toggleDebug.textContent = '▼ Mostra dettagli MRZ';

        showSection('form');
        showToast('Dati estratti — completa i campi mancanti');

    } catch (err) {
        statusDiv.textContent = `Errore [${err.name ?? 'Error'}]: ${err.message}`;
        console.error('[SCAN ERROR]', err);
    }

    scanBtn.disabled = false;
});

// =====================================================================
// FORM ACTIONS
// =====================================================================
btnClearForm.addEventListener('click', () => {
    clearForm();
    fArrivo.value = todayISO();
    showToast('Form svuotato');
});

btnSaveForm.addEventListener('click', () => {
    // Raccoglie tutti i valori
    const record = {
        cognome:       fCognome.value.trim(),
        nome:          fNome.value.trim(),
        sesso:         fSesso.value,
        dataNascita:   fNascita.value,
        comuneNascita: fComuneNascita.value.trim(),
        cittadinanza:  fCittadinanza.value.trim().toUpperCase(),
        tipoDoc:       fTipoDoc.value,
        numDoc:        fNumDoc.value.trim().toUpperCase(),
        luogoRilascio: fLuogoRilascio.value.trim(),
        dataArrivo:    fArrivo.value,
        permanenza:    fPermanenza.value,
    };

    // Validazione essenziale
    const required = ['cognome','nome','sesso','dataNascita','tipoDoc','numDoc','dataArrivo'];
    const missing  = required.filter(k => !record[k]);
    if (missing.length > 0) {
        showToast(`⚠ Campi obbligatori mancanti: ${missing.join(', ')}`);
        return;
    }

    console.log('[REGISTRAZIONE]', record);
    showToast('✓ Registrazione salvata (vedi console)', 3500);
    // TODO: invia `record` al tuo backend / endpoint di registrazione
});

// =====================================================================
// TOGGLE DEBUG MRZ
// =====================================================================
toggleDebug.addEventListener('click', () => {
    const open = mrzDebugDiv.style.display !== 'none';
    mrzDebugDiv.style.display = open ? 'none' : 'block';
    toggleDebug.textContent = open ? '▼ Mostra dettagli MRZ' : '▲ Nascondi dettagli MRZ';
});