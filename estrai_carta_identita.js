function estraiDatiCIE(lines) {
    try {
        // 1. AUTO-HEALING: Correzione ombre e riflessi sulla riga del nome
        let riga1 = lines[0];
        let riga2 = lines[1];
        let riga3 = lines[2].replace(/[KLC]{2,}/g, '<<'); 

        // 2. CIFRARIO ICAO TD1 (3 righe da 30 caratteri)
        const tipoDoc = riga1.substring(0, 2).replace(/</g, '');
        const paese = riga1.substring(2, 5).replace(/</g, '');
        const numDoc = riga1.substring(5, 14).replace(/</g, '').replace(/O/g, '0'); 

        // Date: forziamo i numeri se l'OCR ha letto lettere
        const dataNascitaRaw = riga2.substring(0, 6).replace(/O/g, '0').replace(/I/g, '1');
        let sesso = riga2.substring(7, 8);
        if (sesso === '8' || sesso === '0') sesso = 'M';
        if (sesso === '1') sesso = 'F';
        
        const scadenzaRaw = riga2.substring(8, 14).replace(/O/g, '0').replace(/I/g, '1');
        const nazionalita = riga2.substring(15, 18).replace(/</g, '');

        // Nomi: divisione esatta con i separatori ICAO
        let nomiDivisi = riga3.split('<<');
        let cognome = nomiDivisi[0] ? nomiDivisi[0].replace(/</g, ' ').trim() : "";
        let nome = nomiDivisi[1] ? nomiDivisi[1].replace(/</g, ' ').trim() : "";

        const formattaData = (yymmdd) => {
            if(!/^\d{6}$/.test(yymmdd)) return yymmdd; 
            let year = parseInt(yymmdd.substring(0, 2));
            const month = yymmdd.substring(2, 4);
            const day = yymmdd.substring(4, 6);
            year = year > 50 ? 1900 + year : 2000 + year; 
            return `${day}/${month}/${year}`;
        };

        return {
            tipo: "CIE",
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
        console.error("Errore ICAO", e);
        return null;
    }
}