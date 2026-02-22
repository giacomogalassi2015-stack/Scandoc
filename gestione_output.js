function mostraRisultati(datiStrutturati) {
    const resultDiv = document.getElementById('result');
    const downloadBtn = document.getElementById('download-button');
    const statusDiv = document.getElementById('status');

    if (!datiStrutturati) {
        statusDiv.textContent = "Formato MRZ illeggibile.";
        return;
    }

    const oggi = new Date().toISOString().split('T')[0];

    resultDiv.innerHTML = `
        <h3 style="margin-top:0;">Dati Soggiorno</h3>
        <div class="form-group">
            <label>Tipo Cliente:</label>
            <select id="out-tipo-cliente">
                <option value="Ospite Singolo">Ospite Singolo</option>
                <option value="Capo Famiglia">Capo Famiglia</option>
                <option value="Capo Gruppo">Capo Gruppo</option>
                <option value="Familiare">Familiare</option>
                <option value="Membro Gruppo">Membro Gruppo</option>
            </select>
        </div>
        <div style="display: flex; gap: 10px;">
            <div class="form-group" style="flex: 1;">
                <label>Arrivo:</label>
                <input type="date" id="out-data-arrivo" value="${oggi}">
            </div>
            <div class="form-group" style="flex: 1;">
                <label>Notti:</label>
                <input type="number" id="out-giorni" value="1" min="1">
            </div>
        </div>
        <hr>
        <h3>Dati Documento <span style="font-size:12px; font-weight:normal; color:gray;">(Modifica se errati)</span></h3>
        <div class="form-group"><label>Cognome:</label><input type="text" id="out-cognome" value="${datiStrutturati.cognome}"></div>
        <div class="form-group"><label>Nome:</label><input type="text" id="out-nome" value="${datiStrutturati.nome}"></div>
        <div style="display: flex; gap: 10px;">
            <div class="form-group" style="flex: 1;"><label>Data Nascita:</label><input type="text" id="out-nascita" value="${datiStrutturati.dataNascita}"></div>
            <div class="form-group" style="flex: 1;"><label>Sesso (M/F):</label><input type="text" id="out-sesso" value="${datiStrutturati.sesso}"></div>
        </div>
        <div style="display: flex; gap: 10px;">
            <div class="form-group" style="flex: 1;"><label>Tipo Doc:</label><input type="text" id="out-tipo-doc" value="${datiStrutturati.tipo}"></div>
            <div class="form-group" style="flex: 1;"><label>Numero:</label><input type="text" id="out-num-doc" value="${datiStrutturati.numeroDocumento}"></div>
        </div>
    `;
    
    resultDiv.style.display = "block";
    downloadBtn.style.display = "block";
    statusDiv.textContent = "Documento letto! Verifica i dati prima di scaricare.";
}

document.getElementById('download-button').addEventListener('click', () => {
    const tipo = document.getElementById('out-tipo-cliente').value;
    const arrivo = document.getElementById('out-data-arrivo').value;
    const notti = document.getElementById('out-giorni').value;
    const cognome = document.getElementById('out-cognome').value.toUpperCase();
    const nome = document.getElementById('out-nome').value.toUpperCase();
    const nascita = document.getElementById('out-nascita').value;
    const sesso = document.getElementById('out-sesso').value.toUpperCase();
    const numDoc = document.getElementById('out-num-doc').value.toUpperCase();

    let testoFile = `TIPO ALLOGGIATO: ${tipo}\nDATA ARRIVO: ${arrivo}\nPERMANENZA: ${notti}\nCOGNOME: ${cognome}\nNOME: ${nome}\nSESSO: ${sesso}\nDATA NASCITA: ${nascita}\nNUMERO DOC: ${numDoc}\n`;

    const blob = new Blob([testoFile], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cognome}_${nome}_Alloggiati.txt`;
    a.click();
    URL.revokeObjectURL(url);
});