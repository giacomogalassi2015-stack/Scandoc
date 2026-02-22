// estrai_carta_identita.js

function estraiDatiCIE(lines) {
    try {
        // 1. "CORRETTORE AUTOMATICO" OCR
        // Visto che l'OCR confonde spesso le freccette con K, L, o C a causa delle ombre,
        // forziamo la pulizia della terza riga (quella dei nomi) prima di processarla.
        // Sostituiamo sequenze di K, L, C con la freccetta originale <
        let riga1 = lines[0];
        let riga2 = lines[1];
        let riga3 = lines[2].replace(/[KLC]{2,}/g, '<<'); 

        // 2. ESTRAZIONE ESATTA BASATA SUL CIFRARIO (Standard ICAO TD1)
        
        // --- RIGA 1 ---
        const tipoDoc = riga1.substring(0, 2).replace(/</g, '');
        const paese = riga1.substring(2, 5).replace(/</g, '');
        // Il numero documento finisce al carattere 14. Eventuali 'O' lette per sbaglio sono zeri '0'
        const numDoc = riga1.substring(5, 14).replace(/</g, '').replace(/O/g, '0'); 

        // --- RIGA 2 ---
        // Le date sono numeri. Correggiamo le lettere O o I lette per sbaglio
        const dataNascitaRaw = riga2.substring(0, 6).replace(/O/g, '0').replace(/I/g, '1');
        // Il sesso è esattamente all'ottavo carattere (indice 7). 
        // Se c'è un'ombra e legge 8 o 0, forziamo M o F in base al cifrario italiano
        let sesso = riga2.substring(7, 8);
        if (sesso === '8' || sesso === '0') sesso = 'M';
        if (sesso === '1') sesso = 'F';
        
        const scadenzaRaw = riga2.substring(8, 14).replace(/O/g, '0').replace(/I/g, '1');
        const nazionalita = riga2.substring(15, 18).replace(/</g, '');

        // --- RIGA 3 (La tua intuizione sui separatori) ---
        // I nomi sono nel formato: COGNOME<<NOME<<<<<
        // I cognomi composti (DE LUCA) sono: DE<LUCA<<NOME
        
        // Sostituiamo le doppie freccette << con un marcatore speciale "||" per dividere Cognome e Nome
        let nomiDivisi = riga3.split('<<');
        
        // Prendiamo il primo blocco (Cognome) e sostituiamo le singole < con spazi normali
        let cognome = nomiDivisi[0] ? nomiDivisi[0].replace(/</g, ' ').trim() : "Non letto";
        
        // Prendiamo il secondo blocco (Nome) e sostituiamo le singole < con spazi normali, togliendo le freccette finali
        let nome = nomiDivisi[1] ? nomiDivisi[1].replace(/</g, ' ').trim() : "Non letto";

        // Formattazione delle date (da AAMMGG a GG/MM/AAAA)
        const formattaData = (yymmdd) => {
            if(!/^\d{6}$/.test(yymmdd)) return yymmdd; 
            let year = parseInt(yymmdd.substring(0, 2));
            const month = yymmdd.substring(2, 4);
            const day = yymmdd.substring(4, 6);
            year = year > 50 ? 1900 + year : 2000 + year; 
            return `${day}/${month}/${year}`;
        };

        // 3. RESTITUIAMO I DATI PULITI
        return {
            tipo: "CIE (Identità Elettronica)",
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
        return null;
    }
}