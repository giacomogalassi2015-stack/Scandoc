// =====================================================================
// CONFIGURAZIONE SERVER — NON MODIFICARE
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
const videoContainer   = document.getElementById('video-container');

// Screens
const screenHome   = document.getElementById('screen-home');
const screenCamera = document.getElementById('screen-camera');
const screenForm   = document.getElementById('screen-form');

// Header
const headerBack     = document.getElementById('btn-header-back');
const headerSub      = document.getElementById('header-sub');

// Home buttons
const btnPassport = document.getElementById('btn-passport');
const btnCie      = document.getElementById('btn-cie');
const btnManual   = document.getElementById('btn-manual');

// Form fields
const fCognome        = document.getElementById('f-cognome');
const fNome           = document.getElementById('f-nome');
const fSesso          = document.getElementById('f-sesso');
const fNascita        = document.getElementById('f-nascita');
const fComuneNascita  = document.getElementById('f-comune-nascita');
const fCittadinanza   = document.getElementById('f-cittadinanza');
const fTipoDoc        = document.getElementById('f-tipo-doc');
const fNumDoc         = document.getElementById('f-num-doc');
const fLuogoRilascio  = document.getElementById('f-luogo-rilascio');

const hintComune   = document.getElementById('hint-comune');
const hintRilascio = document.getElementById('hint-rilascio');
const scanBadge    = document.getElementById('scan-source-badge');

// MRZ accordion
const mrzAccordion     = document.getElementById('mrz-accordion');
const mrzAccordionBody = document.getElementById('mrz-accordion-body');
const btnAccordion     = document.getElementById('btn-accordion');

// Actions
const btnClear = document.getElementById('btn-clear-form');
const btnSave  = document.getElementById('btn-save-form');

// Toast
const toastEl = document.getElementById('toast');

// =====================================================================
// STATO
// =====================================================================
let currentMode   = null;   // 'passport' | 'cie' | 'manual'
let cameraStream  = null;

const videoConstraints = {
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
};

// =====================================================================
// UTILS
// =====================================================================
function showToast(msg, ms = 2800) {
    toastEl.textContent = msg;
    toastEl.classList.add('visible');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => toastEl.classList.remove('visible'), ms);
}

function todayISO() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Converte una data MRZ (YYMMDD) in YYYY-MM-DD per <input type="date">
 * Soglia: yy <= 30 → 2000+yy, altrimenti 1900+yy
 */
function mrzDateToISO(yymmdd) {
    if (!yymmdd || yymmdd.length !== 6 || yymmdd === '<<<<<<') return '';
    const yy   = parseInt(yymmdd.substring(0, 2), 10);
    const mm   = yymmdd.substring(2, 4);
    const dd   = yymmdd.substring(4, 6);
    if (isNaN(yy) || isNaN(parseInt(mm, 10)) || isNaN(parseInt(dd, 10))) return '';
    const yyyy = yy <= 30 ? 2000 + yy : 1900 + yy;
    return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
}

/**
 * Rimuove i filler '<' e normalizza gli spazi
 */
function stripFiller(str) {
    return str.replace(/</g, ' ').trim().replace(/\s+/g, ' ');
}

// =====================================================================
// NAVIGAZIONE
// =====================================================================
function showScreen(name) {
    screenHome  .classList.toggle('screen-active', name === 'home');
    screenCamera.classList.toggle('screen-active', name === 'camera');
    screenForm  .classList.toggle('screen-active', name === 'form');

    // Freccia indietro header
    headerBack.classList.toggle('hidden', name === 'home');

    // Sotto-titolo header
    const labels = {
        home:   'Seleziona tipo documento',
        camera: currentMode === 'passport' ? 'Scansione Passaporto' : 'Scansione CIE',
        form:   'Modulo registrazione',
    };
    headerSub.textContent = labels[name] || '';
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
    video.srcObject = null;
    startBtn.style.display = 'flex';
    scanBtn.style.display  = 'none';
    statusDiv.textContent  = 'In attesa...';
    resultDiv.style.display  = 'none';
    previewContainer.style.display = 'none';
}

// Header "indietro"
headerBack.addEventListener('click', () => {
    const active = screenCamera.classList.contains('screen-active') ? 'camera' : 'form';
    if (active === 'camera') {
        stopCamera();
        showScreen('home');
    } else {
        // dal form: se è arrivato da camera torna alla camera, se manuale torna home
        if (currentMode === 'manual') {
            showScreen('home');
        } else {
            showScreen('camera');
        }
    }
});

// ── HOME: selezione modalità ──
btnPassport.addEventListener('click', () => {
    currentMode = 'passport';
    resultDiv.style.display  = 'none';
    previewContainer.style.display = 'none';
    showScreen('camera');
});

btnCie.addEventListener('click', () => {
    currentMode = 'cie';
    resultDiv.style.display  = 'none';
    previewContainer.style.display = 'none';
    showScreen('camera');
});

btnManual.addEventListener('click', () => {
    currentMode = 'manual';
    clearForm();
    // Tipo doc: lasciamo vuoto, l'utente sceglie
    scanBadge.style.display  = 'none';
    mrzAccordion.style.display = 'none';
    showScreen('form');
});

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

/**
 * Estrae e valida le righe MRZ dal testo grezzo OCR.
 * @param {string} rawText  testo grezzo da Google Vision
 * @param {'passport'|'cie'} docType
 * @returns {Array<{line:string, checksumValid:boolean}>}
 */
function extractAndFixMRZ(rawText, docType) {
    const exactLen  = docType === 'passport' ? 44 : 30;
    const minLen    = exactLen - 4;
    const numLines  = docType === 'passport' ? 2 : 3;

    // 1) Pulizia
    let lines = rawText
        .toUpperCase()
        .replace(/[^A-Z0-9<\n]/g, '')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length >= minLen);

    // 2) Se non ci sono ritorni a capo sufficienti, prova split lineare
    if (lines.length < numLines) {
        const flat = rawText.toUpperCase().replace(/[^A-Z0-9<]/g, '');
        lines = [];
        for (let i = 0; i < flat.length; i += exactLen) {
            const chunk = flat.substring(i, i + exactLen);
            if (chunk.length >= minLen) lines.push(chunk);
        }
    }

    // 3) Normalizza a exactLen
    lines = lines
        .slice(0, numLines)
        .map(l => {
            if (l.length > exactLen) l = l.substring(0, exactLen);
            if (l.length < exactLen) l = l.padEnd(exactLen, '<');
            return l;
        });

    // 4) Valida checksum
    return lines.map((line, idx) => {
        let valid = false;

        if (docType === 'passport') {
            if (idx === 0) {
                valid = line[0] === 'P';
            } else if (idx === 1) {
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
                valid = true; // riga nome/cognome, nessun checksum standard
            }
        }

        return { line, checksumValid: valid };
    });
}

// =====================================================================
// PARSER MRZ → DATI STRUTTURATI
// =====================================================================
/**
 * Estrae i campi anagrafici e documentali dalle righe MRZ validate.
 *
 * @param {Array<{line:string}>} mrzLines  output di extractAndFixMRZ
 * @param {'passport'|'cie'}    docType
 * @returns {{cognome, nome, sesso, dataNascita, cittadinanza, numDoc, tipoDoc}}
 */
function parseMRZ(mrzLines, docType) {
    const out = {
        cognome: '', nome: '', sesso: '',
        dataNascita: '', cittadinanza: '', numDoc: '', tipoDoc: ''
    };

    try {
        if (docType === 'passport') {
            // ─── TD3 – 2 righe × 44 ───────────────────────────────────
            // Riga 0:  [0]tipo [1]tipoExtra [2-4]nazione [5+]COGNOME<<NOME<…
            // Riga 1:  [0-8]numDoc [9]check [10-12]nazione [13-18]ddn [19]check
            //          [20]sesso [21-26]scad [27]check …

            const r0 = (mrzLines[0]?.line ?? '').padEnd(44, '<');
            const r1 = (mrzLines[1]?.line ?? '').padEnd(44, '<');

            out.tipoDoc = 'P'; // Passaporto

            // Cognome e nome: da posizione 5, separati da <<
            const namePart = r0.substring(5);
            const sep      = namePart.indexOf('<<');
            if (sep !== -1) {
                out.cognome = stripFiller(namePart.substring(0, sep));
                // Il nome può contenere ulteriori << per secondo nome
                out.nome    = stripFiller(namePart.substring(sep + 2).replace(/<<.*$/, ''));
            } else {
                out.cognome = stripFiller(namePart);
            }

            out.numDoc       = r1.substring(0, 9).replace(/<+$/, '');
            out.cittadinanza = r1.substring(10, 13).replace(/<+$/, '');
            out.dataNascita  = mrzDateToISO(r1.substring(13, 19));
            out.sesso        = r1[20] === 'M' ? 'M' : (r1[20] === 'F' ? 'F' : '');

        } else {
            // ─── ID1 – 3 righe × 30 ──────────────────────────────────
            // Riga 0:  [0-1]tipo [2-4]nazione [5-13]numDoc [14]check …
            // Riga 1:  [0-5]ddn [6]check [7]sesso [8-13]scad [14]check
            //          [15-17]cittadinanza …
            // Riga 2:  COGNOME<<NOME<…

            const r0 = (mrzLines[0]?.line ?? '').padEnd(30, '<');
            const r1 = (mrzLines[1]?.line ?? '').padEnd(30, '<');
            const r2 = (mrzLines[2]?.line ?? '').padEnd(30, '<');

            out.tipoDoc = 'I'; // Carta d'identità

            out.numDoc       = r0.substring(5, 14).replace(/<+$/, '');
            out.dataNascita  = mrzDateToISO(r1.substring(0, 6));
            out.sesso        = r1[7] === 'M' ? 'M' : (r1[7] === 'F' ? 'F' : '');
            out.cittadinanza = r1.substring(15, 18).replace(/<+$/, '');

            // Cognome e nome dalla riga 2
            const sep = r2.indexOf('<<');
            if (sep !== -1) {
                out.cognome = stripFiller(r2.substring(0, sep));
                out.nome    = stripFiller(r2.substring(sep + 2).replace(/<<.*$/, ''));
            } else {
                out.cognome = stripFiller(r2);
            }
        }
    } catch (err) {
        console.warn('[parseMRZ] errore:', err);
    }

    return out;
}

// =====================================================================
// POPOLAMENTO FORM
// =====================================================================
function clearForm() {
    [fCognome, fNome, fNascita, fComuneNascita,
     fCittadinanza, fNumDoc, fLuogoRilascio].forEach(el => {
        el.value = '';
        el.classList.remove('autofilled');
    });
    fSesso.value   = '';
    fTipoDoc.value = '';
    fSesso.classList.remove('autofilled');
    fTipoDoc.classList.remove('autofilled');

    hintComune.textContent   = '';
    hintRilascio.textContent = '';
}

/**
 * Compila il form con i dati estratti dal MRZ.
 *
 * Regole:
 *  - tipoDoc: pre-selezionato in base a currentMode (P o I)
 *  - Se cittadinanza != 'ITA':
 *      ComuneNascita = codice nazione
 *      LuogoRilascio = codice nazione
 *  - Se cittadinanza == 'ITA':
 *      ComuneNascita = '' (l'operatore compila)
 *      LuogoRilascio = '' (l'operatore compila)
 *
 * @param {{cognome, nome, sesso, dataNascita, cittadinanza, numDoc, tipoDoc}} data
 */
function populateForm(data) {
    // Helper: imposta valore + classe autofilled se non vuoto
    function setField(el, val) {
        if (val) {
            el.value = val.toUpperCase();
            el.classList.add('autofilled');
        }
    }

    setField(fCognome,       data.cognome);
    setField(fNome,          data.nome);
    setField(fNascita,       data.dataNascita);
    setField(fCittadinanza,  data.cittadinanza);
    setField(fNumDoc,        data.numDoc);

    // Data nascita: non toUpperCase
    if (data.dataNascita) {
        fNascita.value = data.dataNascita;
        fNascita.classList.add('autofilled');
    }

    if (data.sesso) {
        fSesso.value = data.sesso;
        fSesso.classList.add('autofilled');
    }

    // Tipo documento: sempre determinato da currentMode, non dal MRZ
    const tipoMap = { passport: 'P', cie: 'I' };
    const tipoVal = tipoMap[currentMode] ?? '';
    if (tipoVal) {
        fTipoDoc.value = tipoVal;
        fTipoDoc.classList.add('autofilled');
    }

    // ── Regola Italiani vs Stranieri ──────────────────────────────────
    const nazione = (data.cittadinanza || '').toUpperCase().replace(/<+$/, '');

    if (nazione && nazione !== 'ITA') {
        // Straniero: pre-compila comune nascita e luogo rilascio con il codice nazione
        fComuneNascita.value = nazione;
        fComuneNascita.classList.add('autofilled');

        fLuogoRilascio.value = nazione;
        fLuogoRilascio.classList.add('autofilled');

        hintComune.textContent   = '(da codice nazione — modifica se necessario)';
        hintRilascio.textContent = '(da codice nazione — modifica se necessario)';
    } else {
        // Italiano o nazione non rilevata: campi vuoti, l'operatore inserisce
        fComuneNascita.value = '';
        fComuneNascita.classList.remove('autofilled');

        fLuogoRilascio.value = '';
        fLuogoRilascio.classList.remove('autofilled');

        if (nazione === 'ITA') {
            hintComune.textContent   = 'inserire manualmente';
            hintRilascio.textContent = 'inserire manualmente';
        }
    }
}

// =====================================================================
// MIRINO INTERATTIVO
// =====================================================================
const MIN_W = 80, MIN_H = 40;
const HANDLE_POS = ['nw','n','ne','e','se','s','sw','w'];

HANDLE_POS.forEach(pos => {
    const h = document.createElement('div');
    h.className = 'mirino-handle';
    h.dataset.pos = pos;
    mirino.appendChild(h);
});

function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

function getRect() {
    return {
        x: parseInt(mirino.style.left,  10) || 0,
        y: parseInt(mirino.style.top,   10) || 0,
        w: parseInt(mirino.style.width, 10) || MIN_W,
        h: parseInt(mirino.style.height,10) || MIN_H,
    };
}

function applyRect(x, y, w, h) {
    const cw = videoContainer.clientWidth;
    const ch = videoContainer.clientHeight;
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
    const cw = videoContainer.clientWidth;
    const ch = videoContainer.clientHeight;
    if (!cw || !ch) return;
    const w = Math.round(cw * 0.85);
    const h = Math.round(ch * 0.28);
    mirino.style.width  = w + 'px';
    mirino.style.height = h + 'px';
    mirino.style.left   = Math.round((cw - w) / 2) + 'px';
    mirino.style.top    = Math.round((ch - h) / 2) + 'px';
}

let mirinoAction = null;

function mirinoDown(clientX, clientY, target) {
    const pos = target.dataset.pos;
    if (target === mirino || target.classList.contains('mirino-handle')) {
        mirinoAction = {
            type: pos ? 'resize' : 'drag',
            pos: pos || null,
            startX: clientX, startY: clientY,
            startRect: getRect(),
        };
        return true;
    }
    return false;
}

function mirinoMove(clientX, clientY) {
    if (!mirinoAction) return;
    const dx = clientX - mirinoAction.startX;
    const dy = clientY - mirinoAction.startY;
    const r  = mirinoAction.startRect;

    if (mirinoAction.type === 'drag') { applyRect(r.x+dx, r.y+dy, r.w, r.h); return; }

    let { x, y, w, h } = r;
    const p = mirinoAction.pos;
    if (p.includes('e')) w = r.w+dx;
    if (p.includes('s')) h = r.h+dy;
    if (p.includes('w')) { x = r.x+dx; w = r.w-dx; }
    if (p.includes('n')) { y = r.y+dy; h = r.h-dy; }
    if (w < MIN_W) { if (p.includes('w')) x = r.x+r.w-MIN_W; w = MIN_W; }
    if (h < MIN_H) { if (p.includes('n')) y = r.y+r.h-MIN_H; h = MIN_H; }
    applyRect(x, y, w, h);
}

mirino.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    if (mirinoDown(e.touches[0].clientX, e.touches[0].clientY, e.target)) e.preventDefault();
}, { passive: false });
mirino.addEventListener('touchmove', e => {
    if (!mirinoAction || e.touches.length !== 1) return;
    e.preventDefault();
    mirinoMove(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
mirino.addEventListener('touchend', () => { mirinoAction = null; });
mirino.addEventListener('mousedown', e => { mirinoDown(e.clientX, e.clientY, e.target) && e.preventDefault(); });
document.addEventListener('mousemove', e => { mirinoMove(e.clientX, e.clientY); });
document.addEventListener('mouseup', () => { mirinoAction = null; });

// Resize schermo / orientamento
let resizeTimer = null;
function safeInitMirino() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        requestAnimationFrame(() => requestAnimationFrame(initMirino));
    }, 150);
}
window.addEventListener('resize', safeInitMirino);
window.addEventListener('orientationchange', safeInitMirino);

// =====================================================================
// FOTOCAMERA — ACCENSIONE
// =====================================================================
startBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia(videoConstraints);
        cameraStream = stream;
        video.srcObject = stream;
        startBtn.style.display = 'none';
        scanBtn.style.display  = 'flex';
        video.onloadedmetadata = () => initMirino();
        statusDiv.textContent = 'Regola il mirino sulla banda MRZ e scatta.';
    } catch (err) {
        statusDiv.textContent = 'Errore fotocamera: controlla i permessi del browser.';
        console.error('[CAM]', err);
    }
});

// =====================================================================
// GEOMETRIA object-fit: cover
// =====================================================================
function getCoverGeometry() {
    const displayW = video.clientWidth;
    const displayH = video.clientHeight;
    const srcW     = video.videoWidth;
    const srcH     = video.videoHeight;
    const scale    = Math.max(displayW / srcW, displayH / srcH);
    return {
        scale,
        offsetX: ((srcW * scale - displayW) / 2) / scale,
        offsetY: ((srcH * scale - displayH) / 2) / scale,
    };
}

// =====================================================================
// SCATTO → OCR → PARSE → FORM
// =====================================================================
scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    statusDiv.textContent = 'Invio immagine a Google Vision…';
    resultDiv.style.display  = 'none';
    previewContainer.style.display = 'none';

    try {
        if (!video.videoWidth || !video.videoHeight || !video.clientWidth || !video.clientHeight) {
            throw new Error('Video non ancora pronto. Riprova tra un momento.');
        }

        // ─── Calcolo crop ─────────────────────────────────────────────
        const { scale, offsetX, offsetY } = getCoverGeometry();
        const rect    = getRect();
        const PADDING = 10;

        const cropX = Math.max(0, Math.floor(rect.x / scale + offsetX - PADDING));
        const cropY = Math.max(0, Math.floor(rect.y / scale + offsetY - PADDING));
        const cropW = Math.max(1, Math.min(video.videoWidth  - cropX, Math.floor(rect.w / scale + PADDING * 2)));
        const cropH = Math.max(1, Math.min(video.videoHeight - cropY, Math.floor(rect.h / scale + PADDING * 2)));

        console.log('[COVER GEOMETRY]', { scale, offsetX, offsetY });
        console.log('[CROP]', { cropX, cropY, cropW, cropH, vW: video.videoWidth, vH: video.videoHeight });

        // ─── Disegna e ritaglia ────────────────────────────────────────
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

        cropCanvas.width  = cropW;
        cropCanvas.height = cropH;
        cropCanvas.getContext('2d').drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        const base64Image = cropCanvas.toDataURL('image/jpeg', 0.9);

        // ─── FETCH verso il worker (NON MODIFICARE) ───────────────────
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

        if (!rawText.trim()) {
            throw new Error('Nessun testo rilevato. Riprova con più luce o riposiziona il mirino.');
        }

        // Mostra anteprima crop
        previewContainer.style.display = 'block';

        // ─── Estrai e valida MRZ ──────────────────────────────────────
        const mrzLines = extractAndFixMRZ(rawText, currentMode);
        console.log('[MRZ LINES]', mrzLines);

        // Render debug nel result (visibile nella schermata camera)
        resultDiv.innerHTML = buildMrzDebugHTML(mrzLines, rawText);
        resultDiv.style.display = 'block';
        statusDiv.textContent = '✓ Scansione completata — verifica i dati nel modulo.';

        // ─── Parsa e popola form ──────────────────────────────────────
        const parsed = parseMRZ(mrzLines, currentMode);
        console.log('[PARSED]', parsed);

        clearForm();
        populateForm(parsed);

        // Badge nel form "dati da scansione"
        const modeLabel = currentMode === 'passport' ? 'Passaporto' : 'Carta d\'Identità';
        scanBadge.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Dati estratti da scansione MRZ · ${modeLabel}`;
        scanBadge.style.display = 'flex';

        // Accordion debug
        mrzAccordionBody.innerHTML = buildMrzDebugHTML(mrzLines, rawText);
        mrzAccordion.style.display = 'block';
        btnAccordion.classList.remove('open');
        mrzAccordionBody.style.display = 'none';

        // Passa alla schermata form
        showScreen('form');
        showToast('Dati estratti — completa i campi vuoti');

    } catch (err) {
        statusDiv.textContent = `Errore: ${err.message}`;
        console.error('[SCAN ERROR]', err);
    }

    scanBtn.disabled = false;
});

// ─── HTML del debug MRZ ──────────────────────────────────────────────
function buildMrzDebugHTML(mrzLines, rawText) {
    const rows = mrzLines.length > 0
        ? mrzLines.map((r, i) => `
            <div class="mrz-row ${r.checksumValid ? 'ok' : 'warn'}">
                Riga ${i + 1}: ${r.line.replace(/</g, '&lt;')}
                <div class="mrz-row-status">
                    ${r.checksumValid ? '✓ Checksum OK' : '⚠ Checksum fallito — controllare il valore'}
                </div>
            </div>`).join('')
        : '<div style="color:#ef4444;font-size:.82rem;">Impossibile isolare righe MRZ. Riprova.</div>';

    return `
        <h3>Google Vision + ICAO</h3>
        ${rows}
        <h4>Testo grezzo OCR (debug):</h4>
        <div style="font-size:.68rem;color:#94a3b8;font-family:var(--font-mono);word-break:break-all;line-height:1.6;">
            ${rawText.replace(/</g, '&lt;').replace(/\n/g, '<br>')}
        </div>`;
}

// =====================================================================
// ACCORDION MRZ nel form
// =====================================================================
btnAccordion.addEventListener('click', () => {
    const isOpen = btnAccordion.classList.toggle('open');
    mrzAccordionBody.style.display = isOpen ? 'block' : 'none';
});

// =====================================================================
// FORM ACTIONS
// =====================================================================
btnClear.addEventListener('click', () => {
    clearForm();
    scanBadge.style.display  = 'none';
    mrzAccordion.style.display = 'none';
    showToast('Modulo svuotato');
});

btnSave.addEventListener('click', () => {
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
    };

    const required = [
        { key: 'cognome',       label: 'Cognome' },
        { key: 'nome',          label: 'Nome' },
        { key: 'sesso',         label: 'Sesso' },
        { key: 'dataNascita',   label: 'Data di Nascita' },
        { key: 'comuneNascita', label: 'Comune di Nascita' },
        { key: 'cittadinanza',  label: 'Cittadinanza' },
        { key: 'tipoDoc',       label: 'Tipo Documento' },
        { key: 'numDoc',        label: 'Numero Documento' },
    ];

    const missing = required.filter(f => !record[f.key]).map(f => f.label);
    if (missing.length) {
        showToast(`Campi obbligatori mancanti: ${missing.join(', ')}`, 4000);
        return;
    }

    // ── A questo punto invia `record` al tuo backend ──────────────────
    console.log('[REGISTRAZIONE ALLOGGIATI]', record);
    showToast('✓ Registrazione salvata correttamente', 3200);
});

// =====================================================================
// INIT
// =====================================================================
showScreen('home');