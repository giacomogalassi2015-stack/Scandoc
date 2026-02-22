// estrai_carta_identita.js

function estraiDatiCIE(lines) {
    try {
        const tipoDoc = lines[0].substring(0, 2).replace(/</g, '');
        const paese = lines[0].substring(2, 5).replace(/</g, '');
        const numDoc = lines[0].substring(5, 14).replace(/</g, '');

        const dataNascitaRaw = lines[1].substring(0, 6);
        const sesso = lines[1].substring(7, 8);
        const scadenzaRaw = lines[1].substring(8, 14);
        const nazionalita = lines[1].substring(15, 18).replace(/</g, '');

        const nomiRaw = lines[2].split('<<');
        const cognome = nomiRaw[0] ? nomiRaw[0].replace(/</g, ' ').trim() : "Non letto";
        const nome = nomiRaw[1] ? nomiRaw[1].replace(/</g, ' ').trim() : "Non letto";

        const formattaData = (yymmdd) => {
            if(!/^\d{6}$/.test(yymmdd)) return yymmdd; 
            let year = parseInt(yymmdd.substring(0, 2));
            const month = yymmdd.substring(2, 4);
            const day = yymmdd.substring(4, 6);
            year = year > 50 ? 1900 + year : 2000 + year; 
            return `${day}/${month}/${year}`;
        };

        // Restituisce un oggetto "pulito" con i dati
        return {
            tipo: "Carta di Identità (CIE)",
            cognome: cognome,
            nome: nome,
            dataNascita: formattaData(dataNascitaRaw),
            sesso: sesso,
            nazionalita: nazionalita,
            paeseEmittente: paese,
            numeroDocumento: numDoc,
            scadenza: formattaData(scadenzaRaw)
        };
    } catch(e) {
        console.error("Errore decodifica CIE", e);
        return null; // Formato non valido
    }
}