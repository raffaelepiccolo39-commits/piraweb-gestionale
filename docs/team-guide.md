# Guida d'uso — Gestionale PiraWeb

Documento per i collaboratori che usano il gestionale interno.
Per domande non coperte qui, scrivi a **info@piraweb.it**.

---

## 1. Cos'è il gestionale

Piattaforma interna di PiraWeb per gestire clienti, progetti, fatturazione, presenze, turni, CRM, contenuti social e altri flussi operativi dell'agenzia. Accessibile da `https://gestionale.piraweb.it`.

## 2. Primo accesso

Quando l'admin ti aggiunge come membro del team ricevi un'email **"Sei stato invitato/a in PiraWeb Gestionale"**. Clicca il pulsante **"Imposta Password e Accedi"**.

Atterrerai su un wizard a 3 step:

1. **Imposta password** — scegli una password di almeno 8 caratteri. L'indicatore di forza ti aiuta.
2. **Conferma profilo** — verifica nome e (opzionale) URL foto profilo.
3. **2FA** — scansiona il QR code con un'app di autenticazione (Google Authenticator, 1Password, Authy) e inserisci il codice a 6 cifre. **Obbligatorio per gli admin**, opzionale per gli altri.

Al completamento atterri in dashboard. Da lì sei operativo/a.

> ⚠️ Il link di invito scade dopo qualche giorno. Se ti scade chiedi all'admin di reinviarlo (bottone "Reinvia" nella tua riga in Impostazioni).

## 3. Login quotidiano

`https://gestionale.piraweb.it/login` — inserisci email e password. Se hai attivato la 2FA, ti chiede il codice 6 cifre dell'app authenticator.

Hai dimenticato la password? Scrivi a info@piraweb.it (per ora il reset è gestito dall'admin).

## 4. Moduli principali

| Modulo | Cosa fai | Chi lo usa |
|---|---|---|
| **Dashboard** | Overview con metriche, scadenze, attività recenti | Tutti |
| **Bacheca** | Note rapide e annunci interni | Tutti |
| **Chat** | Messaggi diretti, gruppi, canali progetto | Tutti |
| **Calendario** | Appuntamenti e meeting (sync con CalDAV) | Tutti |
| **Tasks** | I tuoi compiti assegnati con scadenze | Tutti |
| **Projects** | Progetti clienti con stato avanzamento | Tutti |
| **Brief** | Brief creativi per progetti | Designer, Social |
| **Contenuti / Social Calendar** | Pianificazione e pubblicazione contenuti social | Social, Designer |
| **AI / AI Content** | Generazione testi e contenuti assistita | Social, Designer |
| **Clienti** | Anagrafica clienti con contatti e contratti | Admin, Social |
| **CRM** | Pipeline deal e attività commerciali | Admin |
| **Lead Finder / Lead AI** | Ricerca e analisi automatica nuovi lead | Admin |
| **Invoices** | Emissione e tracking fatture (anche via SDI) | Admin |
| **Cashflow / CFO** | Flussi di cassa e analisi finanziaria | Admin |
| **Presenze / Ferie** | Timbrature e richieste ferie/permessi | Tutti |
| **Turni** | Pianificazione turni settimanali | Tutti |
| **Documenti** | Documenti personali e contratti | Tutti |
| **Note spese** | Rimborsi spese | Tutti |
| **Performance** | Valutazioni performance e obiettivi | Admin |
| **Impostazioni** | Profilo, password, 2FA, team (admin) | Tutti |

## 5. Workflow tipici

### Registrare un nuovo lead
1. **CRM → Nuovo Deal**: inserisci nome, valore stimato, stage iniziale (es. "Lead"), data prevista di chiusura.
2. Aggiungi attività (chiamata, meeting, email) man mano che lavori il deal.
3. Sposta tra colonne pipeline trascinando o cambiando lo stage.
4. Quando chiudi positivo: cambia stage a "Vinto" → puoi convertirlo in cliente.

### Creare e assegnare un task
1. Vai su **Projects → [progetto] → Tasks** oppure **Tasks** generale.
2. **Nuovo Task**: titolo, descrizione, assegnatari, scadenza, priorità.
3. Il dipendente assegnato vede il task nella sua dashboard.
4. Sposta tra "Da fare → In corso → Done" mentre lavori.

### Emettere una fattura
1. **Invoices → Nuova Fattura**: scegli cliente, aggiungi voci (descrizione + qtà + prezzo).
2. Il totale con IVA è calcolato automaticamente.
3. Salva come bozza, poi **Invia a SDI** (solo admin): la fattura va su Aruba/Sistema di Interscambio.
4. Lo stato (`bozza → inviata → consegnata → pagata`) aggiorna man mano.

### Segnare presenza / richiedere ferie
- **Presenze**: timbri entrata e uscita ogni giorno.
- **Ferie**: richiedi un periodo, l'admin approva.
- **Turni**: vedi i tuoi turni settimanali pianificati.

### Pianificare un post social
1. **Social Calendar → Nuovo post**: scegli cliente, data, piattaforma (Instagram, Facebook).
2. Carica creatività + testo. Salva come bozza o programma.
3. Se l'integrazione Meta è collegata, puoi pubblicare direttamente.

## 6. FAQ

**Ho perso il codice 2FA. Come faccio?**
Contatta l'admin (info@piraweb.it). Disattiva temporaneamente la 2FA dal suo profilo, poi al login successivo riconfiguri.

**Vedo solo alcuni moduli. Manca qualcosa.**
Alcuni moduli (CRM, Fatturazione, Cashflow, CFO, Impostazioni) sono visibili solo agli admin. Se ti serve l'accesso, chiedi all'admin di cambiare il tuo ruolo.

**Come cambio la mia password?**
Impostazioni → Profilo → Cambia password.

**Posso usare il gestionale dal cellulare?**
Sì, è responsive. Per workflow lunghi (creazione fatture, planning) è meglio desktop.

**Cosa succede se chiudo la finestra mentre lavoro a una task/deal?**
I dati vengono salvati automaticamente nei form modali quando clicchi "Salva". I form aperti senza salvare vanno persi.

**A chi scrivo per problemi tecnici?**
info@piraweb.it

## 7. Ruoli e permessi

| Ruolo | Cosa può fare in più |
|---|---|
| **Amministratore** | Tutto: gestione team, fatturazione, finanze, CRM, impostazioni |
| **Social Media Manager** | Anagrafica clienti, brief, calendario social, contenuti |
| **Content Creator** | Brief, contenuti, AI |
| **Graphic Social** | Brief, calendario social, contenuti, design |
| **Graphic Brand** | Brief, contenuti, design brand |

Tutti vedono: dashboard, chat, calendario, tasks, projects, presenze, ferie, turni, documenti, note spese, profilo.

---

*Ultimo aggiornamento: 2026-06-01*
