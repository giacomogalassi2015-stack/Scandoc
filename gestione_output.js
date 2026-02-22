// gestione_output.js

let ultimiDatiEstratti = null; // Salviamo i dati per poterli scaricare

function mostraRisultati(datiStrutturati) {
    const resultDiv = document.getElementById('result');
    const downloadBtn = document.getElementById('download-button');
    const statusDiv = document.getElementById('status');

    if (!datiStrutturati) {
        statusDiv.textContent = "Formato documento non riconosciuto o illeggibile.";
        return;
    }

    ultimiDatiEstratti = datiStrutturati; // Memorizza in RAM

    // Prepara l'HTML
    resultDiv.innerHTML = `
        <h3>Dati Estratti (${datiStrutturati.tipo}):</h3>
        <strong>Cognome:</strong> ${datiStrutturati.cognome}<br>
        <strong>Nome:</strong> ${datiStrutturati.nome}<br>
        <strong>Data Nascita:</strong> ${datiStrutturati.dataNascita}<br>
        <strong>Sesso:</strong> ${datiStrutturati.sesso}<br>
        <strong>N. Documento:</strong> ${datiStrutturati.numeroDocumento}<br>
        <strong>Scadenza:</strong> ${datiStrutturati.scadenza}
    `;
    
    resultDiv.style.display = "block";
    downloadBtn.style.display = "block"; // Mostra il pulsante di download
    statusDiv.textContent = "Documento elaborato con successo!";
}

function scaricaFileTxt() {
    if (!ultimiDatiEstratti) return;

    // Crea il testo per il file
    let testoFile = `--- DATI SCANSIONE DOCUMENTO ---\n`;
    for (const [chiave, valore] of Object.entries(ultimiDatiEstratti)) {
        testoFile += `${chiave.toUpperCase()}: ${valore}\n`;
    }

    // Crea un "Blob" (file virtuale) e lo scarica
    const blob = new Blob([testoFile], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Documento_${ultimiDatiEstratti.cognome}_${ultimiDatiEstratti.nome}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// Collega il pulsante di download alla funzione
document.getElementById('download-button').addEventListener('click', scaricaFileTxt);