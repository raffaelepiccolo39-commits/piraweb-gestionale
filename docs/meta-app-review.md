# Richiesta a Meta: `instagram_manage_insights`

Serve per il **report mensile di andamento** nel portale clienti: follower, copertura, interazioni del profilo del cliente. Senza questo permesso la Graph API non restituisce quei dati — non è un problema di codice, è che i numeri non arrivano proprio.

L'app oggi chiede solo permessi di **pubblicazione** (`instagram_content_publish`, `pages_manage_posts`…), definiti in `src/app/api/meta/auth/route.ts`. Di analytics non c'è nulla.

---

## Cosa serve prima di sottomettere

1. **Verifica dell'attività** (Business Verification) completata su Meta Business Manager — visura camerale o documento equivalente. Se non è fatta, la review non parte nemmeno.
2. **App in stato Live**, non in Development.
3. Un **account Instagram Business** realmente collegato a una Pagina Facebook che amministri (uno dei clienti va bene, con il suo consenso).
4. Il permesso aggiunto in *App Dashboard → App Review → Permissions and Features* → `instagram_manage_insights` → *Request advanced access*.

## Le due cose su cui le richieste vengono respinte

**La motivazione generica.** "Ci servono le statistiche" viene rifiutato. Va detto *chi* vede quei dati e *perché*: qui è il titolare dell'attività che guarda l'andamento del **proprio** profilo, dentro un'area riservata a lui.

**Lo screencast.** È obbligatorio e deve mostrare il percorso completo: login → collegamento dell'account Instagram → schermata del report con i numeri veri. Registrato dal vivo, senza tagli, con il cursore che clicca. Un mockup viene respinto.

---

## Testo della motivazione (in inglese, come richiede Meta)

> **How will your app use instagram_manage_insights?**
>
> Our app is a client portal used by a social media marketing agency. Each of our clients is a business owner whose Instagram Business account we manage under a signed service contract.
>
> We use `instagram_manage_insights` to retrieve follower count, reach, impressions and engagement metrics for the Instagram Business account **belonging to that specific client**, and display them in a private, authenticated area that only that client can access. The client sees exclusively the metrics of their own account — never data belonging to other businesses.
>
> Concretely: the business owner logs into our portal with their own credentials, opens the "Monthly report" section, and sees how their profile grew over the last month — followers gained, posts reach, engagement on published content. This replaces the PDF report we currently send by email, and lets the client verify the results of the service they are paying for.
>
> We do not aggregate, resell, or share this data with third parties. It is shown only to the account owner, inside an area protected by authentication and row-level authorization: each client can only ever query their own connected account.
>
> **Steps to test:**
> 1. Go to `https://<dominio>/login` and sign in with the test credentials provided.
> 2. You will land on the client portal home, showing the content grid for that client.
> 3. Tap "Report" in the bottom navigation bar.
> 4. The screen shows follower growth, reach and engagement for the connected Instagram Business account, for the current month.

Sostituisci `<dominio>` con l'indirizzo reale e allega **credenziali di prova funzionanti** — un revisore che non riesce a entrare respinge senza leggere oltre.

---

## Nota sui tempi

Dalla sottomissione alla risposta passano in genere alcune settimane, e un primo rifiuto è comune (di solito per lo screencast). Per questo conviene avviare la pratica **prima** di costruire la schermata del report: mentre Meta valuta, si può lavorare al resto.

Contraddizione da tenere presente: il testo qui sopra descrive una schermata che **ancora non esiste**, e lo screencast la richiede funzionante. Vanno quindi fatti insieme — prima una versione della pagina report anche con dati di prova, poi il video, poi la sottomissione.

---

## Prima di collegare Meta sul serio

Sono state corrette (migration `20260720e`), ma vale la pena ricordarle:

- l'OAuth non salvava nulla e rediregeva comunque con "collegato";
- `page_access_token` era leggibile da tutto il team;
- il controllo di scadenza del token veniva saltato in silenzio per i non-admin.
