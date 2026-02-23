try {
        // WHITELIST ATTIVA: L'OCR leggerà SOLO i caratteri validi per l'MRZ
        const { data: { text } } = await Tesseract.recognize(
            imageData, 
            'eng',
            { tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<' }
        );

        // Stampiamo la stringa "nuda e cruda" appena letta, togliendo solo gli a capo
        const testoGrezzo = text.toUpperCase().replace(/\n/g, '<br>'); 

        // Modifica temporanea: Mostriamo il testo grezzo e nient'altro
        resultDiv.innerHTML = `
            <h3>DEBUG - Testo Grezzo Letto:</h3>
            <div style="font-family: monospace; word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">
                ${testoGrezzo}
            </div>
        `;
        resultDiv.style.display = "block";
        statusDiv.textContent = "Scansione grezza completata.";
        
    } catch (err) {
        statusDiv.textContent = "Errore OCR: " + err.message;
    }