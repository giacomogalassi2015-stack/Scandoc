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

// Funzione avanzata: Binarizzazione (Bianco e Nero assoluto per uccidere le ombre)
function applicaBinarizzazione(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        // Calcola la luminosità del pixel
        const luminosita = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        // Se è scuro diventa nero (testo), se è chiaro diventa bianco (sfondo)
        const colore = luminosita < 130 ? 0 : 255; 
        data[i] = data[i+1] = data[i+2] = colore; // Applica a R, G, B
    }
    ctx.putImageData(imageData, 0, 0);
}

scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    downloadBtn.style.display = "none";
    statusDiv.textContent = "Elaborazione immagine e OCR in corso...";
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
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    
    // Disegniamo il ritaglio normale
    cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    
    // Applichiamo la magia: trasformiamo in Bianco e Nero puro
    applicaBinarizzazione(cropCtx, cropW, cropH);

    const imageData = cropCanvas.toDataURL('image/jpeg', 1.0);

    try {
        // OCR POTENZIATO: Whitelist + Modalità Blocco Singolo (PSM 6)
        const { data: { text } } = await Tesseract.recognize(
            imageData, 
            'eng',
            { 
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
                tessedit_pageseg_mode: '6' // Forza Tesseract a non cercare paragrafi o colonne strane
            }
        );

        const cleanText = text.toUpperCase().replace(/\s/g, '');
        const mrzRegex = /[A-Z0-9<]{28,45}/g; 
        const mrzLines = cleanText.match(mrzRegex);

        if (mrzLines && mrzLines.length >= 3) {
            let datiProcessati = estraiDatiCIE(mrzLines);
            mostraRisultati(datiProcessati);
        } else {
            statusDiv.textContent = "Testo non trovato o sfocato. Cerca di evitare riflessi sulla plastica.";
        }
    } catch (err) {
        statusDiv.textContent = "Errore OCR.";
    }
    scanBtn.disabled = false;
});