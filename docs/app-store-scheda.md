# Scheda App Store — Pira Web

Tutto pronto da incollare in App Store Connect. Campi in ordine di comparsa.

---

## Informazioni generali

- **Nome app:** Pira Web
- **Sottotitolo** (max 30 caratteri): `Agenzia, team e clienti`
- **Categoria principale:** Business
- **Categoria secondaria:** Produttività
- **Bundle ID:** it.piraweb.gestionale
- **Classificazione età:** 4+ (nessun contenuto sensibile)
- **Prezzo:** Gratuita
- **URL privacy (obbligatorio):** https://gestionale.piraweb.it/privacy
- **URL supporto:** https://gestionale.piraweb.it/privacy  *(o una pagina contatti dedicata)*
- **URL marketing (facoltativo):** https://piraweb.it

---

## Descrizione (campo "Description")

```
Pira Web è l'app dell'agenzia creativa Pira Web: uno spazio unico dove il team
gestisce il lavoro e i clienti seguono i propri progetti.

PER IL TEAM
• Task, progetti e clienti sempre a portata di mano
• Timbratura di entrata, pausa e uscita
• La tua giornata e i tuoi obiettivi, ovunque tu sia

PER I CLIENTI
• Il piano editoriale del mese, contenuto per contenuto
• Approvazione dei contenuti con un tocco
• Diario delle idee: scrivi o detta le tue idee, le valutiamo insieme
• Stato dei pagamenti e contratto sempre consultabili
• Prenotazione degli shooting sulle date disponibili

L'accesso è riservato: si entra con le credenziali fornite da Pira Web.
I dati sono trattati nel rispetto del GDPR — trovi tutto nell'informativa privacy.
```

## Novità di questa versione ("What's New" — v1.0)

```
Prima versione di Pira Web. Team e clienti, un'unica app.
```

## Parole chiave (campo "Keywords", max 100 caratteri, separate da virgola)

```
agenzia,gestionale,social,piano editoriale,team,clienti,task,marketing,shooting,contenuti
```

## Testo promozionale (facoltativo, aggiornabile senza review)

```
Il lavoro dell'agenzia e i progetti dei clienti, in un'app sola.
```

---

## Informazioni per la revisione Apple ("App Review Information")

> App con solo login (nessuna registrazione libera): Apple ESIGE un account demo
> funzionante, altrimenti rifiuta. Vedi sotto la scelta dell'account.

- **Nome referente:** Raffaele Antonio Piccolo
- **Email referente:** info@piraweb.it
- **Telefono:** *(il tuo numero)*
- **Account demo — Username:** `demo.apple@piraweb.it`
- **Account demo — Password:** `PiraDemo2026!`
- **Note per il revisore:**

```
Pira Web è l'app aziendale dell'agenzia Pira Web S.R.L., usata dal team interno
e dai clienti dell'agenzia. L'accesso è riservato: gli account vengono creati
dall'agenzia, non è prevista registrazione pubblica — per questo forniamo un
account demo qui sotto.

L'account demo dà accesso all'area cliente: piano editoriale, approvazione dei
contenuti, diario delle idee, stato dei pagamenti.

La cancellazione dell'account è disponibile nell'app alla pagina "Il tuo account".
```

---

## Screenshot — PRONTI

In `docs/store-screenshots/`, già alla misura giusta **1290×2796 (iPhone 6.9")**,
catturati dal sito live con l'account demo:

- `00-login.png` — schermata di accesso col brand
- `01-home.png` — home cliente (piano del mese, prossimo contenuto)
- `02-piano-editoriale.png` — i contenuti del mese con gli stati
- `03-idee.png` — diario delle idee (con "Detta" e "Sistemala")
- `04-pagamenti.png` — stato pagamenti
- `05-account.png` — gestione account / cancellazione

Apple ne chiede minimo 1, consigliati 3–5. Carica almeno home, piano editoriale, idee.
La misura 1290×2796 copre il requisito "iPhone 6.9 pollici": è l'unica taglia obbligatoria.

---

## Account demo — FATTO

Creato un **cliente finto "Studio Demo"** con accesso portale e 5 contenuti di esempio
(2 da approvare, 2 in programma, 1 postato). Il revisore Apple entra lì e NON vede
nessun dato reale di clienti o team.

- Email: `demo.apple@piraweb.it`
- Password: `PiraDemo2026!`
- Cliente collegato: Studio Demo (visibile nella lista clienti del gestionale — è finto)

Nota: "Studio Demo" compare tra i clienti del team perché è una riga vera nel database
(serve perché l'accesso funzioni durante la revisione). **Dopo l'approvazione Apple si
può cancellare** cliente + accesso + contenuti demo. Fino ad allora va lasciato attivo.
