// gestione_output.js

function mostraRisultati(datiStrutturati) {
    const resultDiv = document.getElementById('result');
    const downloadBtn = document.getElementById('download-button');
    const statusDiv = document.getElementById('status');

    if (!datiStrutturati) {
        statusDiv.textContent = "Formato documento non riconosciuto o illeggibile.";
        return;
    }

    // Calcoliamo la data di oggi per il campo "Data di Arrivo"
    const oggi = new Date().toISOString().split('T')[0];

    // Creiamo un modulo interattivo invece di testo fisso
    resultDiv.innerHTML = `
        <h3 style="margin-top:0;">Dati Soggiorno</h3>
        
        <div class="form-group">
            <label>Tipo Cliente:</label>
            <select id="out-tipo-cliente">
                <option value="Singolo">Singolo</option>
                <option value="Capo Famiglia">Capo Famiglia</option>
                <option value="Familiare">Familiare</option>
                <option value="Capo Gruppo">Capo Gruppo</option>
                <option value="Membro Gruppo">Membro Gruppo</option>
            </select>
        </div>
        
        <div style="display: flex; gap: 10px;">
            <div class="form-group" style="flex: 1;">
                <label>Data Arrivo:</label>
                <input type="date" id="out-data-arrivo" value="${oggi}">
            </div>
            <div class="form-group" style="flex: 1;">
                <label>Giorni (Notti):</label>
                <input type="number" id="out-giorni" value="1" min="1">
            </div>
        </div>

        <hr>
        <h3>Dati Documento <span style="font-size:12px; color:gray;">(Correggi se errati)</span></h3>

        <div class="form-group">
            <label>Cognome:</label>
            <input type="text" id="out-cognome" value="${datiStrutturati.cognome}">
        </div>
        <div class="form-group">
            <label>Nome:</label>
            <input type="text" id="out-nome" value="${datiStrutturati.nome}">
        </div>
        
        <div style="display: flex; gap: 10px;">
            <div class="form-group" style="flex: 1;">
                <label>Data Nascita:</label>
                <input type="text" id="out-nascita" value="${datiStrutturati.dataNascita}">
            </div>
            <div class="form-group" style="flex: 1;">
                <label>Sesso:</label>
                <input type="text" id="out-sesso" value="${datiStrutturati.sesso}">
            </div>
        </div>

        <div style="display: flex; gap: 10px;">
            <div class="form-group" style="flex: 1;">
                <label>Tipo Doc:</label>
                <input type="text" id="out-tipo-doc" value="${datiStrutturati.tipo}">
            </div>
            <div class="form-group" style="flex: 1;">
                <label>N. Documento:</label>
                <input type="text" id="out-num-doc" value="${datiStrutturati.numeroDocumento}">
            </div>
        </div>
        
        <div style="display: flex; gap: 10px;">
            <div class="form-group" style="flex: 1;">
                <label>Scadenza:</label>
                <input type="text" id="out-scadenza" value="${datiStrutturati.scadenza}">
            </div>
            <div class="form-group" style="flex: 1;">
                <label>Nazionalità:</label>
                <input type="text" id="out-nazionalita" value="${datiStrutturati.nazionalita}">
            </div>
        </div>
    `;
    
    resultDiv.style.display = "block";
    downloadBtn.style.display = "block";
    statusDiv.textContent = "Documento elaborato! Verifica e correggi i campi prima di scaricare.";
}

function scaricaFileTxt() {
    // 1. Leggiamo i valori ATTUALI dai campi modificabili (così includiamo le correzioni dell'utente)
    const tipoCliente = document.getElementById('out-tipo-cliente').value;
    const dataArrivo = document.getElementById('out-data-arrivo').value;
    const giorni = document.getElementById('out-giorni').value;
    
    const cognome = document.getElementById('out-cognome').value;
    const nome = document.getElementById('out-nome').value;
    const dataNascita = document.getElementById('out-nascita').value;
    const sesso = document.getElementById('out-sesso').value;
    const tipoDoc = document.getElementById('out-tipo-doc').value;
    const numDoc = document.getElementById('out-num-doc').value;
    const scadenza = document.getElementById('out-scadenza').value;
    const nazionalita = document.getElementById('out-nazionalita').value;

    // 2. Creiamo il testo del file (Puoi personalizzare questo formato)
    let testoFile = `--- DATI SOGGIORNO ---\n`;
    testoFile += `Tipo Cliente: ${tipoCliente}\n`;
    testoFile += `Data di Arrivo: ${dataArrivo}\n`;
    testoFile += `Giorni di Permanenza: ${giorni}\n\n`;
    
    testoFile += `--- DATI OSPITE ---\n`;
    testoFile += `Cognome: ${cognome}\n`;
    testoFile += `Nome: ${nome}\n`;
    testoFile += `Data di Nascita: ${dataNascita}\n`;
    testoFile += `Sesso: ${sesso}\n`;
    testoFile += `Nazionalita': ${nazionalita}\n\n`;
    
    testoFile += `--- DOCUMENTO ---\n`;
    testoFile += `Tipo: ${tipoDoc}\n`;
    testoFile += `Numero: ${numDoc}\n`;
    testoFile += `Scadenza: ${scadenza}\n`;

    // 3. Genera e scarica il file
    const blob = new Blob([testoFile], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Il nome del file avrà il cognome inserito
    a.download = `Schedina_${cognome.replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// Collega il pulsante di download alla funzione
document.getElementById('download-button').addEventListener('click', scaricaFileTxt);