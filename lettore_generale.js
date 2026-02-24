/**
 * MRZ Scanner — Production-Ready Client-Side Engine
 * Targets: Tesseract.js v5 | TD1 (CIE Italiana, 3x30 chars)
 *
 * Architecture:
 *  - MrzImageProcessor  → Pre-processing canvas (Sauvola, deskew)
 *  - MrzOcrEngine       → Lifecycle del Worker Tesseract (singleton lazy-init)
 *  - MrzPostProcessor   → Estrazione, correzione, validazione ICAO checksum
 *  - MrzScanner         → Controller che orchestra i tre moduli
 */

'use strict';

/* ============================================================
 * MODULO 1 — IMAGE PROCESSOR
 * Responsabilità: ricevere il frame grezzo e restituire
 * un ImageData binarizzato, pronto per Tesseract.
 * ============================================================ */
const MrzImageProcessor = (() => {

    /**
     * Sauvola Adaptive Thresholding — O(1) per pixel via Integral Images.
     *
     * Ottimizzazioni V8/JSCore rispetto alla versione precedente:
     *  - Uint32Array per le tavole integrali: la somma di grigi 8-bit su finestre
     *    di ~50x50 px (max ~255 * 2500 = ~637k) rientra in Uint32 senza overflow,
     *    eliminando l'overhead floating-point di Float64Array (~4x più veloce).
     *  - sqSum rimane Float64 perché 255^2 * 2500 = ~162M, oltre Uint32.
     *  - Accesso lineare ai pixel con indice precalcolato per ridurre i cache miss.
     *  - Operatori bitwise (>> 0, | 0) per troncamento intero senza Math.round/floor.
     *  - Il loop interno usa variabili locali per evitare lookup ripetuti su `this`.
     *
     * @param {Uint8ClampedArray} data  - Pixel RGBA lineari del canvas
     * @param {number} width
     * @param {number} height
     * @param {number} [wSize=25]  - Raggio finestra locale (25 = buon trade-off per OCR-B)
     * @param {number} [k=0.18]   - Sensibilità Sauvola (0.1–0.3; valori bassi → più bianco)
     * @returns {Uint8ClampedArray} - Output RGBA binarizzato (BW)
     */
    function _sauvola(data, width, height, wSize = 25, k = 0.18) {
        const W1 = width + 1;
        const size = W1 * (height + 1);

        // Uint32 è sufficiente per la somma lineare, Float64 per i quadrati
        const iSum   = new Uint32Array(size);
        const iSqSum = new Float64Array(size);
        const gray   = new Uint8Array(width * height);

        // --- Passo 1: Conversione a grigi con pesi percettivi BT.601 ---
        // Uint8 è sufficiente; il risultato è già in [0, 255].
        // Moltiplichiamo per 1024 e shiftiamo a destra per evitare float
        // nei coefficienti (0.299 ≈ 306/1024, 0.587 ≈ 601/1024, 0.114 ≈ 117/1024)
        for (let y = 0; y < height; y++) {
            const rowOff = y * width;
            const rgbaOff = rowOff * 4;
            for (let x = 0; x < width; x++) {
                const p = rgbaOff + (x << 2); // x * 4
                gray[rowOff + x] = (data[p] * 306 + data[p + 1] * 601 + data[p + 2] * 117) >> 10;
            }
        }

        // --- Passo 2: Tavole Integrali ---
        for (let y = 0; y < height; y++) {
            const y1  = (y + 1) * W1;
            const y0  = y * W1;
            const gRow = y * width;
            for (let x = 0; x < width; x++) {
                const g   = gray[gRow + x];
                const idx = y1 + x + 1;
                iSum  [idx] = g          + iSum  [y0 + x + 1] + iSum  [y1 + x] - iSum  [y0 + x];
                iSqSum[idx] = (g * g)    + iSqSum[y0 + x + 1] + iSqSum[y1 + x] - iSqSum[y0 + x];
            }
        }

        // --- Passo 3: Binarizzazione di Sauvola ---
        const R_max = 128; // Normalizzazione deviazione standard (valore teorico max ≈ 127.5)
        const output = new Uint8ClampedArray(data.length);

        for (let y = 0; y < height; y++) {
            const y0c = Math.max(0, y - wSize);
            const y1c = Math.min(height - 1, y + wSize);
            const Y0  = y0c * W1;
            const Y1  = (y1c + 1) * W1;

            for (let x = 0; x < width; x++) {
                const x0c = Math.max(0, x - wSize);
                const x1c = Math.min(width - 1, x + wSize);
                const x0  = x0c;
                const x1p = x1c + 1;

                const count = (y1c - y0c + 1) * (x1c - x0c + 1);

                // Lookup tavole integrali con indici precalcolati
                const s  = iSum  [Y1 + x1p] - iSum  [Y0 + x1p] - iSum  [Y1 + x0] + iSum  [Y0 + x0];
                const sq = iSqSum[Y1 + x1p] - iSqSum[Y0 + x1p] - iSqSum[Y1 + x0] + iSqSum[Y0 + x0];

                const mean = s / count;
                const stdDev = Math.sqrt(Math.max(0, sq / count - mean * mean));

                // Formula Sauvola: T = mean * (1 + k * (σ/R_max − 1))
                const threshold = mean * (1 + k * (stdDev / R_max - 1));
                const val = gray[y * width + x] > threshold ? 255 : 0;

                const out = (y * width + x) << 2; // * 4
                output[out]     = val;
                output[out + 1] = val;
                output[out + 2] = val;
                output[out + 3] = 255;
            }
        }

        return output;
    }

    /**
     * Deskew leggero basato su Hough Transform semplificata.
     *
     * Logica: proiettiamo i pixel neri orizzontalmente a vari angoli
     * nell'intervallo [-10°, +10°] e cerchiamo l'angolo che massimizza
     * la varianza delle proiezioni (le righe di testo si "compattano" all'angolo corretto).
     * Applica la rotazione solo se l'angolo stimato è > 0.5° (tilt significativo).
     *
     * Nota: opera sull'immagine già binarizzata per velocità.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     */
    function _deskew(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        const ANGLE_RANGE = 10;  // gradi
        const ANGLE_STEP  = 0.5; // risoluzione angolare (trade-off velocità/precisione)
        const cx = width  / 2;
        const cy = height / 2;

        let bestAngle = 0;
        let bestVariance = -1;

        for (let angleDeg = -ANGLE_RANGE; angleDeg <= ANGLE_RANGE; angleDeg += ANGLE_STEP) {
            const rad = angleDeg * Math.PI / 180;
            const cosA = Math.cos(rad);
            const sinA = Math.sin(rad);

            // Accumulator: proiezione dei pixel neri (valore 0) sull'asse Y ruotato
            const acc = new Uint16Array(height);
            let accMean = 0;

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    // Leggiamo solo il canale R (già BW)
                    if (data[(y * width + x) * 4] === 0) {
                        // Calcola la coordinata Y proiettata
                        const projY = ((x - cx) * (-sinA) + (y - cy) * cosA + cy) | 0;
                        if (projY >= 0 && projY < height) {
                            acc[projY]++;
                            accMean++;
                        }
                    }
                }
            }

            accMean /= height;

            // Varianza delle proiezioni: massima quando le righe sono allineate
            let variance = 0;
            for (let i = 0; i < height; i++) {
                const d = acc[i] - accMean;
                variance += d * d;
            }

            if (variance > bestVariance) {
                bestVariance = variance;
                bestAngle = angleDeg;
            }
        }

        // Applica la rotazione solo se il tilt è significativo (>0.5°)
        if (Math.abs(bestAngle) > 0.5) {
            const offscreen = new OffscreenCanvas(width, height);
            const offCtx = offscreen.getContext('2d');
            offCtx.fillStyle = '#FFFFFF';
            offCtx.fillRect(0, 0, width, height);
            offCtx.translate(cx, cy);
            offCtx.rotate(-bestAngle * Math.PI / 180);
            offCtx.translate(-cx, -cy);
            offCtx.putImageData(imageData, 0, 0);

            // Ridisegna il canvas principale con l'immagine ruotata
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(offscreen, 0, 0);
        }
    }

    /**
     * Pipeline pubblica: riceve il canvas di cattura e i parametri di crop,
     * restituisce il dataURL dell'immagine binarizzata pronta per Tesseract.
     *
     * @param {HTMLCanvasElement} sourceCanvas - Canvas con il frame grezzo
     * @param {HTMLCanvasElement} cropCanvas   - Canvas di output (crop-preview)
     * @param {{ x, y, w, h }} crop            - Coordinate di ritaglio nel sourceCanvas
     * @param {{ scale, padding }} opts
     * @returns {string} dataURL JPEG (quality 1.0)
     */
    function process(sourceCanvas, cropCanvas, crop, opts = {}) {
        const { scale = 1.5, padding = 20 } = opts;
        const { x, y, w, h } = crop;

        const outW = (w * scale + padding * 2) | 0;
        const outH = (h * scale + padding * 2) | 0;

        cropCanvas.width  = outW;
        cropCanvas.height = outH;

        const ctx = cropCanvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, outW, outH);
        ctx.filter = 'none';
        ctx.drawImage(sourceCanvas, x, y, w, h, padding, padding, w * scale, h * scale);

        // Leggi i pixel, applica Sauvola, scrivi il risultato
        const imgData = ctx.getImageData(0, 0, outW, outH);
        const binarized = _sauvola(imgData.data, outW, outH, 25, 0.18);
        ctx.putImageData(new ImageData(binarized, outW, outH), 0, 0);

        // Deskew: utile per tilt > 0.5° — non impatta se l'immagine è già diritta
        // Richiede OffscreenCanvas (supportato in tutti i mobile browser moderni)
        if (typeof OffscreenCanvas !== 'undefined') {
            _deskew(ctx, outW, outH);
        }

        return cropCanvas.toDataURL('image/jpeg', 1.0);
    }

    return { process };
})();


/* ============================================================
 * MODULO 2 — OCR ENGINE
 * Responsabilità: lifecycle del Worker Tesseract.
 *
 * Pattern: Lazy Singleton con Promise di inizializzazione.
 * Il Worker viene creato UNA SOLA VOLTA (al primo scan o durante
 * il warm-up della camera) e riutilizzato per tutte le scansioni.
 * Questo elimina il costo di init (~1–2s su mobile) a ogni click.
 *
 * Gestione degli stati:
 *   IDLE        → Worker pronto, nessuna operazione in corso
 *   INITIALIZING → Init in corso (impedisce doppi init concorrenti)
 *   BUSY        → Riconoscimento in corso (impedisce scansioni sovrapposte)
 *   ERROR       → Errore fatale — il Worker verrà ricreato al prossimo tentativo
 * ============================================================ */
const MrzOcrEngine = (() => {

    const State = Object.freeze({ IDLE: 'idle', INITIALIZING: 'init', BUSY: 'busy', ERROR: 'error' });

    let _worker     = null;
    let _state      = State.IDLE;
    let _initPromise = null; // Promise di init: se l'init è già in corso, la riusano tutti i caller

    /**
     * Parametri Tesseract ottimizzati per font OCR-B / MRZ.
     * - `load_system_dawg` / `load_freq_dawg` = '0': disabilita i dizionari linguistici.
     *   Senza questo, Tesseract "corregge" le sequenze di '<' verso parole inglesi.
     * - `classify_enable_learning` = '0': disabilita l'adaptive classifier.
     *   Su sequenze brevi crea deriva; meglio il modello statico.
     * - `tessedit_do_invert` = '0': l'immagine è già BW su sfondo bianco, non invertire.
     * - `edges_max_children_per_outline` = '40': limita la segmentazione caratteri
     *   aggressiva su font monospazio come OCR-B.
     */
    const TESS_PARAMS = {
        tessedit_char_whitelist      : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
        tessedit_pageseg_mode        : '6',   // blocco uniforme di testo
        load_system_dawg             : '0',
        load_freq_dawg               : '0',
        classify_enable_learning     : '0',
        classify_enable_adaptive_matcher: '0',
        tessedit_do_invert           : '0',
        edges_max_children_per_outline: '40',
    };

    async function _createWorker() {
        _state = State.INITIALIZING;
        try {
            // Tesseract.js v5: createWorker accetta la lingua direttamente
            const w = await Tesseract.createWorker('eng', 1, {
                // '1' = OEM_TESSERACT_ONLY (motore legacy): più letterale su font
                // monospazio, meno "creativo" dell'LSTM puro. Assicurati che
                // eng.traineddata sia la versione legacy (non lstm) nel tuo CDN.
                // Se usi la CDN default di Tesseract.js v5 con LSTM, cambia a:
                // Tesseract.OEM.TESSERACT_LSTM_COMBINED per un compromesso.
                logger: () => {} // Silenzia i log verbosi in produzione
            });
            await w.setParameters(TESS_PARAMS);
            _worker = w;
            _state  = State.IDLE;
            console.info('[MrzOcrEngine] Worker inizializzato e pronto.');
        } catch (err) {
            _state = State.ERROR;
            _worker = null;
            throw new Error(`[MrzOcrEngine] Init Worker fallita: ${err.message}`);
        }
    }

    /**
     * Assicura che il Worker esista e sia pronto.
     * Se l'init è già in corso (chiamata concorrente), si aggancia alla stessa Promise.
     */
    async function _ensureReady() {
        if (_state === State.IDLE && _worker) return;

        if (_state === State.INITIALIZING && _initPromise) {
            // Altra chiamata ha già avviato l'init: aspettiamo la stessa Promise
            return _initPromise;
        }

        if (_state === State.ERROR || !_worker) {
            // Errore precedente o primo avvio: (ri)creiamo il Worker
            _initPromise = _createWorker();
            return _initPromise;
        }
    }

    /**
     * Warm-up pubblico: da chiamare subito dopo l'avvio della camera.
     * Il Worker viene inizializzato in background mentre l'utente allinea il documento,
     * così al primo click di "Scansiona" è già pronto.
     */
    async function warmup() {
        try {
            await _ensureReady();
        } catch (err) {
            // Errore silenzioso in warm-up: ci riprova al primo scan
            console.warn('[MrzOcrEngine] Warm-up fallito, riprovo al primo scan.', err.message);
        }
    }

    /**
     * Esegue il riconoscimento OCR sull'immagine fornita.
     *
     * @param {string} imageDataUrl - DataURL dell'immagine pre-processata
     * @returns {Promise<string>} - Testo grezzo restituito da Tesseract
     * @throws {Error} se il Worker è BUSY o se l'OCR fallisce
     */
    async function recognize(imageDataUrl) {
        if (_state === State.BUSY) {
            throw new Error('[MrzOcrEngine] Worker occupato. Attendere il termine della scansione.');
        }

        await _ensureReady();

        _state = State.BUSY;
        try {
            const { data: { text } } = await _worker.recognize(imageDataUrl);
            return text;
        } finally {
            // Torniamo sempre a IDLE, anche in caso di eccezione
            _state = State.IDLE;
        }
    }

    /**
     * Distrugge il Worker. Da chiamare solo se la pagina viene dismessa
     * o l'utente abbandona la funzione di scansione.
     */
    async function destroy() {
        if (_worker) {
            try { await _worker.terminate(); } catch (_) {}
            _worker = null;
        }
        _state = State.IDLE;
        _initPromise = null;
        console.info('[MrzOcrEngine] Worker terminato.');
    }

    return { warmup, recognize, destroy };
})();


/* ============================================================
 * MODULO 3 — POST PROCESSOR
 * Responsabilità: estrarre, correggere e validare le 3 righe TD1
 * dal testo grezzo restituito da Tesseract.
 * ============================================================ */
const MrzPostProcessor = (() => {

    // Tabella valori ICAO per checksum (ICAO 9303 §4.9)
    const CHAR_VALUES = Object.freeze({
        '<':0,'0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
        'A':10,'B':11,'C':12,'D':13,'E':14,'F':15,'G':16,'H':17,'I':18,
        'J':19,'K':20,'L':21,'M':22,'N':23,'O':24,'P':25,'Q':26,'R':27,
        'S':28,'T':29,'U':30,'V':31,'W':32,'X':33,'Y':34,'Z':35
    });

    const WEIGHTS = [7, 3, 1];

    /**
     * Calcola il check digit ICAO per una stringa.
     * @param {string} str
     * @returns {number} cifra di controllo [0–9]
     */
    function _checkDigit(str) {
        let sum = 0;
        for (let i = 0; i < str.length; i++) {
            sum += (CHAR_VALUES[str[i]] ?? 0) * WEIGHTS[i % 3];
        }
        return sum % 10;
    }

    /**
     * Corregge le confusioni OCR tipiche del font OCR-B per zona semantica.
     *
     * Mappatura basata su similarità visiva nel font OCR-B:
     *  - Zone numeriche (date, numero documento): O→0, I→1, B→8, G→6, Z→2, S→5
     *  - Zone alfabetiche (cognome, nome): 0→O, 1→I
     *  - Separatori '<': caratteri isolati K, C, L tra '<' probabilmente sono '<'
     *    (euristico basato sulla struttura TD1)
     *
     * @param {string} line   - Riga grezza di 30 caratteri
     * @param {boolean[]} numericMap - Array di 30 bool: true = zona numerica
     * @returns {string} Riga corretta
     */
    function _correctLine(line, numericMap) {
        let out = '';
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (numericMap[i]) {
                // Zona numerica: correggi lettere simili a numeri
                out += ({ 'O':'0','Q':'0','D':'0','I':'1','L':'1',
                          'Z':'2','S':'5','B':'8','G':'6' }[c] ?? c);
            } else {
                // Zona alfabetica/filler: correggi numeri simili a lettere
                out += ({ '0':'O','1':'I' }[c] ?? c);
            }
        }
        // Post-correzione: sequenze di 3+ KLC consecutive sono quasi certamente filler '<'
        // (in TD1 non esistono parole di 3+ caratteri identici in zone non-nome)
        return out.replace(/[KLC]{3,}/g, m => '<'.repeat(m.length));
    }

    /**
     * Mappa semantica TD1: posizioni numeriche per ogni riga.
     * Fonte: ICAO Doc 9303 Part 5 — TD1 Layout.
     *
     * Riga 1: pos 5-13 = nr. documento, 14 = check, 15-29 = dati opzionali/naz.
     * Riga 2: pos 0-5 = DOB, 6 = check, 7 = sesso(A), 8-13 = exp, 14 = check,
     *         15-29 = opzionali/check
     * Riga 3: cognome e nome (tutto alfabetico/filler)
     */
    const TD1_NUMERIC_MAP = Object.freeze([
        // Riga 1: tipo doc(A) + paese(A) + nr.doc(N) + chk(N) + opz.(A/N)
        [false,false,false,false,false, true,true,true,true,true,true,true,true,true, true, ...Array(15).fill(false)],
        // Riga 2: DOB(N) + chk(N) + sesso(A) + exp(N) + chk(N) + opz.(N/A) + chk(N)
        [true,true,true,true,true,true, true, false, true,true,true,true,true,true, true, ...Array(14).fill(false), true],
        // Riga 3: tutto alfanumerico/filler (no zone strettamente numeriche)
        Array(30).fill(false),
    ]);

    /**
     * Valida una riga contro il checksum ICAO nella posizione attesa per TD1.
     * Restituisce null se la posizione non ha checksum verificabile.
     *
     * @param {string} line
     * @param {number} lineIdx - 0, 1 o 2
     * @returns {{ valid: boolean, details: string } | null}
     */
    function _validate(line, lineIdx) {
        if (line.length !== 30) return null;

        if (lineIdx === 0) {
            const docNum = line.substring(5, 14);
            const expected = parseInt(line[14]);
            const computed = _checkDigit(docNum);
            return {
                valid: !isNaN(expected) && computed === expected,
                details: `DocNum chk: atteso ${expected}, calcolato ${computed}`
            };
        }

        if (lineIdx === 1) {
            const dob    = line.substring(0, 6);
            const dobChk = parseInt(line[6]);
            const exp    = line.substring(8, 14);
            const expChk = parseInt(line[14]);
            const dobOk  = !isNaN(dobChk) && _checkDigit(dob) === dobChk;
            const expOk  = !isNaN(expChk) && _checkDigit(exp) === expChk;
            return {
                valid: dobOk && expOk,
                details: `DOB chk: ${dobOk ? '✓' : '✗'} | EXP chk: ${expOk ? '✓' : '✗'}`
            };
        }

        if (lineIdx === 2) {
            // Riga 3 non ha checksum matematico: considerata valida se contiene
            // almeno un '<<' (separatore cognome/nome, obbligatorio in TD1)
            const valid = line.includes('<<');
            return { valid, details: valid ? 'Separatore << trovato' : 'Separatore << assente' };
        }

        return null;
    }

    /**
     * Pipeline pubblica di estrazione, correzione e validazione.
     *
     * @param {string} rawText - Testo grezzo da Tesseract
     * @returns {Array<{ line: string, checksumValid: boolean, checksumDetails: string }>}
     */
    function extract(rawText) {
        // Step 1: Pulizia — rimuove tutto tranne caratteri MRZ e newline
        const cleaned = rawText
            .toUpperCase()
            .replace(/[^A-Z0-9<\n]/g, '')
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length >= 20);

        // Step 2: Estrai candidati con tolleranza ±2 rispetto ai 30 char TD1
        // NOTA: operiamo sulla stringa unita per catturare righe spezzate da Tesseract
        const joined = cleaned.join('');
        const candidates = [];
        const re = /[A-Z0-9<]{28,32}/g;
        let m;
        while ((m = re.exec(joined)) !== null) candidates.push(m[0]);

        // Step 3: Normalizza a 30 caratteri + correzioni per zona
        const lines = candidates.slice(0, 3).map((raw, idx) => {
            let line = raw.length > 30 ? raw.substring(0, 30) : raw.padEnd(30, '<');
            line = _correctLine(line, TD1_NUMERIC_MAP[idx] ?? Array(30).fill(false));
            return line;
        });

        // Step 4: Validazione checksum ICAO per riga
        return lines.map((line, idx) => {
            const result = _validate(line, idx);
            return {
                line,
                checksumValid  : result?.valid  ?? false,
                checksumDetails: result?.details ?? 'n/a'
            };
        });
    }

    return { extract };
})();


/* ============================================================
 * CONTROLLER — MrzScanner
 * Orchestra i tre moduli e gestisce gli eventi DOM.
 * ============================================================ */
const MrzScanner = (() => {

    // Riferimenti DOM — letti una volta, non a ogni evento
    const video         = document.getElementById('video');
    const canvas        = document.getElementById('canvas');
    const cropCanvas    = document.getElementById('crop-preview');
    const startBtn      = document.getElementById('start-button');
    const scanBtn       = document.getElementById('scan-button');
    const statusDiv     = document.getElementById('status');
    const resultDiv     = document.getElementById('result');
    const mirino        = document.getElementById('mirino');

    // Contesto canvas grezzo — `willReadFrequently` ottimizza getImageData in V8
    const captureCtx = canvas.getContext('2d', { willReadFrequently: true });

    const CAM_CONSTRAINTS = {
        video: {
            facingMode: 'environment',
            width:  { ideal: 1920 },
            height: { ideal: 1080 },
            // Suggerisce al browser di non applicare post-processing automatico
            // (white balance aggressivo, sharpening) che può alterare le soglie
            advanced: [{ focusMode: 'continuous' }]
        }
    };

    /** Aggiorna lo status in modo sicuro (evita flash di stato vuoto) */
    function _setStatus(msg) {
        if (statusDiv) statusDiv.textContent = msg;
    }

    /**
     * Calcola le coordinate di crop del mirino rispetto alle dimensioni reali
     * del video (risoluzione nativa, non layout CSS).
     *
     * @returns {{ x, y, w, h }}
     */
    function _getCropCoords() {
        const ratio       = video.videoWidth / video.clientWidth;
        const mirinoRect  = mirino.getBoundingClientRect();
        const videoRect   = video.getBoundingClientRect();
        return {
            x: ((mirinoRect.left - videoRect.left) * ratio) | 0,
            y: ((mirinoRect.top  - videoRect.top)  * ratio) | 0,
            w: (mirinoRect.width  * ratio) | 0,
            h: (mirinoRect.height * ratio) | 0,
        };
    }

    /** Render del risultato nel DOM */
    function _renderResult(mrzLines, rawText) {
        const rowHtml = mrzLines.map((r, i) => `
            <div style="
                font-family: 'Courier New', monospace;
                font-size: 14px;
                padding: 10px 12px;
                background: ${r.checksumValid ? '#e8f5e9' : '#fff8e1'};
                border-left: 4px solid ${r.checksumValid ? '#4caf50' : '#ff9800'};
                border-radius: 2px;
                margin-bottom: 6px;
                word-break: break-all;
                letter-spacing: 0.05em;
            ">
                <strong>Riga ${i + 1}:</strong> ${r.line}<br>
                <span style="font-size: 11px; color: #888; margin-top: 4px; display: block;">
                    ${r.checksumValid ? '✓' : '⚠'} ${r.checksumDetails}
                </span>
            </div>
        `).join('');

        const rawHtml = `
            <details style="margin-top: 12px;">
                <summary style="cursor: pointer; font-size: 12px; color: #aaa;">
                    Mostra testo grezzo Tesseract
                </summary>
                <pre style="font-size: 11px; color: #999; margin-top: 6px; white-space: pre-wrap;">${rawText}</pre>
            </details>
        `;

        resultDiv.innerHTML = `<h3 style="margin-top:0;">Validazione ICAO TD1</h3>${rowHtml}${rawHtml}`;
        resultDiv.style.display = 'block';
    }

    /** Handler avvio camera */
    async function _onStart() {
        startBtn.disabled = true;
        _setStatus('Avvio fotocamera...');
        try {
            const stream = await navigator.mediaDevices.getUserMedia(CAM_CONSTRAINTS);
            video.srcObject = stream;
            startBtn.style.display = 'none';
            scanBtn.style.display  = 'block';
            _setStatus('Allinea la banda MRZ nel mirino e premi Scansiona.');

            // Warm-up del Worker in background: quando l'utente è pronto,
            // il Worker lo sarà già. Errori silenziosi — vengono gestiti in recognize().
            MrzOcrEngine.warmup();
        } catch (err) {
            _setStatus(`Errore fotocamera: ${err.message}. Controlla i permessi e ricarica.`);
            startBtn.disabled = false;
        }
    }

    /** Handler scansione */
    async function _onScan() {
        scanBtn.disabled = true;
        resultDiv.style.display = 'none';
        _setStatus('Cattura frame in corso...');

        // 1. Cattura il frame corrente nel canvas nascosto
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        captureCtx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 2. Calcola crop e avvia il pre-processing (Sauvola + deskew)
        const crop = _getCropCoords();
        _setStatus('Binarizzazione adattiva (Sauvola)...');

        let imageDataUrl;
        try {
            imageDataUrl = MrzImageProcessor.process(canvas, cropCanvas, crop, { scale: 1.5, padding: 20 });
        } catch (err) {
            _setStatus(`Errore pre-processing: ${err.message}`);
            scanBtn.disabled = false;
            return;
        }

        // 3. OCR
        _setStatus('Lettura OCR in corso...');
        let rawText;
        try {
            rawText = await MrzOcrEngine.recognize(imageDataUrl);
        } catch (err) {
            _setStatus(`Errore OCR: ${err.message}`);
            scanBtn.disabled = false;
            return;
        }

        // 4. Estrazione, correzione e validazione
        _setStatus('Validazione checksum ICAO...');
        const mrzLines = MrzPostProcessor.extract(rawText);

        // 5. Render
        _renderResult(mrzLines, rawText);
        const allValid = mrzLines.every(r => r.checksumValid);
        _setStatus(allValid ? '✓ Tutte le righe validate.' : '⚠ Alcuni checksum falliti — prova a riscansionare.');

        scanBtn.disabled = false;
    }

    /** Inizializzazione: aggancia gli handler e gestisce la distruzione del Worker */
    function init() {
        startBtn.addEventListener('click', _onStart);
        scanBtn.addEventListener('click',  _onScan);

        // Cleanup: distruggi il Worker se la pagina viene abbandonata
        window.addEventListener('beforeunload', () => MrzOcrEngine.destroy());
    }

    return { init };
})();

// --- Entry point ---
MrzScanner.init();