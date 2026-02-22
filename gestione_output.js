function mostraRisultati(datiStrutturati) {
    const resultDiv = document.getElementById('result');
    const downloadBtn = document.getElementById('download-button');
    const statusDiv = document.getElementById('status');

    if (!datiStrutturati) {
        statusDiv.textContent = "Formato MRZ illeggibile. Avvicinati di più.";
        return;
    }

    const oggi = new Date().toISOString().split('T')[0];

    resultDiv.innerHTML = `
        <h3 style="margin-top:0;">Dati Soggiorno</h3>
        <div class="form-group">
            <label>Tipo Alloggiato:</label>
            <select id="out-tipo-cliente">
                <option value="Ospite Singolo">Ospite Singolo</option>
                <option value="Capo Famiglia">Capo Famiglia</option>
                <option value="Capo Gruppo">Capo Gruppo</option>
                <option value="Familiare">Familiare</option>
                <option value="Membro Gruppo">Membro Gruppo</option>
            </select>
        </div>
        <div style="display: flex; gap: 10px;">
            <div class="form-group" style="flex: 1;"><label>Arrivo:</label><input type="date" id="out-data-arrivo" value="${oggi}"></div>
            <div class="form-group" style="flex: 1;"><label>Notti:</label><input type="number" id="out-giorni" value="1" min="1"></div>
        </div>
        
        <hr>
        <h3>Dati Ospite <span style="font-size:12px; font-weight:normal; color:gray;">(Completa i campi vuoti)</span></h3>
        
        <div class="form-group"><label>Cognome:</label><input type="text" id="out-cognome" value="${datiStrutturati.cognome}"></div>
        <div class="form-group"><label>Nome:</label><input type="text" id="out-nome" value="${datiStrutturati.nome}"></div>
        
        <div style="display: flex; gap: 10px;">
            <div class="form-group" style="flex: 1;"><label>Data Nascita:</label><input type="text" id="out-nascita" value="${datiStrutturati.dataNascita}"></div>
            <div class="form-group" style="flex: 1;"><label>Sesso (M/F):</label><input type="text" id="out-sesso" value="${datiStrutturati.sesso}"></div>
        </div>

        <div style="display: flex; gap: 10px;">
            <div class="form-group" style="flex: 2;">
                <label>Comune/Stato Nascita:</label>
                <input type="text" id="out-luogo-nascita" placeholder="Es. ROMA o FRANCIA">
            </div>
            <div class="form-group" style="flex: 1;">
                <label>Prov (Sigla):</label>
                <input type="text" id="out-prov-nascita" placeholder="Es. RM" maxlength="2">
            </div>
        </div>
        <div class="form-group"><label>Cittadinanza:</label><input type="text" id="out-cittadinanza" value="${datiStrutturati.nazionalita}"></div>

        <hr>
        <h3>Documento</h3>
        <div style="display: flex; gap: 10px;">
            <div class="form-group" style="flex: 1;"><label>Tipo Doc:</label><input type="text" id="out-tipo-doc" value="${datiStrutturati.tipo}"></div>
            <div class="form-group" style="flex: 1;"><label>Numero:</label><input type="text" id="out-num-doc" value="${datiStrutturati.numeroDocumento}"></div>
        </div>
        <div class="form-group">
            <label>Comune/Stato Rilascio:</label>
            <input type="text" id="out-luogo-rilascio" placeholder="Es. MILANO o SPAGNA">
        </div>
    `;
    
    resultDiv.style.display = "block";
    downloadBtn.style.display = "block";
    statusDiv.textContent = "Ok! Completa i Luoghi di nascita/rilascio.";
}

document.getElementById('download-button').addEventListener('click', () => {
    // Raccogliamo tutti i dati dal form editato
    const tipo = document.getElementById('out-tipo-cliente').value;
    const arrivo = document.getElementById('out-data-arrivo').value;
    const notti = document.getElementById('out-giorni').value;
    
    const cognome = document.getElementById('out-cognome').value.toUpperCase();
    const nome = document.getElementById('out-nome').value.toUpperCase();
    const nascita = document.getElementById('out-nascita').value;
    const sesso = document.getElementById('out-sesso').value.toUpperCase();
    
    const luogoNascita = document.getElementById('out-luogo-nascita').value.toUpperCase();
    const provNascita = document.getElementById('out-prov-nascita').value.toUpperCase();
    const cittadinanza = document.getElementById('out-cittadinanza').value.toUpperCase();
    
    const tipoDoc = document.getElementById('out-tipo-doc').value.toUpperCase();
    const numDoc = document.getElementById('out-num-doc').value.toUpperCase();
    const luogoRilascio = document.getElementById('out-luogo-rilascio').value.toUpperCase();

    // Creazione del blocco di testo stile Alloggiati
    let testoFile = `--- DATI SOGGIORNO ---\n`;
    testoFile += `TIPO ALLOGGIATO: ${tipo}\nDATA ARRIVO: ${arrivo}\nPERMANENZA: ${notti} NOTTI\n\n`;
    
    testoFile += `--- DATI ANAGRAFICI ---\n`;
    testoFile += `COGNOME: ${cognome}\nNOME: ${nome}\nSESSO: ${sesso}\nDATA NASCITA: ${nascita}\n`;
    testoFile += `LUOGO NASCITA: ${luogoNascita}\nPROVINCIA NASCITA: ${provNascita}\nCITTADINANZA: ${cittadinanza}\n\n`;
    
    testoFile += `--- DOCUMENTO ---\n`;
    testoFile += `TIPO DOC: ${tipoDoc}\nNUMERO DOC: ${numDoc}\nLUOGO RILASCIO: ${luogoRilascio}\n`;

    const blob = new Blob([testoFile], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Alloggiati_${cognome}_${nome}.txt`;
    a.click();
    URL.revokeObjectURL(url);
});