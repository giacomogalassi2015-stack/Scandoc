const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const cropCanvas = document.getElementById('crop-preview');
const startBtn = document.getElementById('start-button');
const scanBtn = document.getElementById('scan-button');
const statusDiv = document.getElementById('status');
const resultDiv = document.getElementById('result');
const mirino = document.getElementById('mirino');
const downloadBtn = document.getElementById('download-button');

const constraints = { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } };

startBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        startBtn.style.display = 'none';
        scanBtn.style.display = 'block';
        statusDiv.textContent = "Allinea la banda in basso (MRZ) nel riquadro verde e scatta.";
    } catch (err) {
        statusDiv.textContent = "Errore fotocamera.";
    }
});

scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    downloadBtn.style.display = "none";
    statusDiv.textContent = "Analisi OCR in corso... attendi.";
    resultDiv.style.display = "none";

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let cropX, cropY, cropW, cropH;
    let usaMirinoManuale = true;

    if ('BarcodeDetector' in window) {
        try {
            const barcodeDetector = new BarcodeDetector();
            const barcodes = await barcodeDetector.detect(canvas);
            if (barcodes.length > 0) {
                const bc = barcodes[0].boundingBox;
                cropX = Math.max(0, bc.x - 20); 
                cropY = bc.y + bc.height;       
                cropW = bc.width + 100;         
                cropH = bc.height * 2.5;        
                usaMirinoManuale = false;
            }
        } catch (e) {}
    }

    if (usaMirinoManuale) {
        const videoRatio = video.videoWidth / video.clientWidth;
        const mirinoRect = mirino.getBoundingClientRect();
        const videoRect = video.getBoundingClientRect();
        cropX = (mirinoRect.left - videoRect.left) * videoRatio;
        cropY = (mirinoRect.top - videoRect.top) * videoRatio;
        cropW = mirinoRect.width * videoRatio;
        cropH = mirinoRect.height * videoRatio;
    }

    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.filter = 'contrast(1.5) grayscale(1)';
    cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const imageData = cropCanvas.toDataURL('image/jpeg', 1.0);

    try {
        // WHITELIST ATTIVA: L'OCR leggerà SOLO i caratteri validi per l'MRZ
        const { data: { text } } = await Tesseract.recognize(
            imageData, 
            'eng',
            { tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<' }
        );

        const cleanText = text.toUpperCase().replace(/\s/g, '');
        const mrzRegex = /[A-Z0-9<]{28,45}/g; 
        const mrzLines = cleanText.match(mrzRegex);

        if (mrzLines && mrzLines.length >= 3) {
            let datiProcessati = estraiDatiCIE(mrzLines.slice(0, 3));
            mostraRisultati(datiProcessati);
        } else {
            statusDiv.textContent = "Testo non trovato o formato errato. Riprova stringendo l'inquadratura.";
        }
    } catch (err) {
        statusDiv.textContent = "Errore OCR.";
    }
    scanBtn.disabled = false;
});