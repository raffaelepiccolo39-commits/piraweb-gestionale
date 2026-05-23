# Deploy del Gestionale PiraWeb su SiteGround Cloud

Runbook click-by-click per la migrazione da Vercel a SiteGround Cloud.
Segui le fasi in ordine. Niente passi opzionali — sono tutti necessari.

**Stato pre-migrazione (verificato 2026-05-23):**

- ✅ Repo locale: `~/Desktop/gestionale/` su branch `main`, 2 commit avanti su origin
- ✅ Branch backup `pre-siteground-migration` pushato su origin
- ✅ Build standalone testato in locale (server.js → 200 su /login in 35ms)
- ✅ Vercel CLI loggato, env vars prod scaricate in `.env.production.local`
- ✅ Env staging pronto in `.env.staging`
- ✅ Crontab pronto in `deploy/crontab.sg.txt`
- ✅ Bootstrap Supabase pronto in `deploy/supabase-staging-bootstrap.sql`

**Tempi stimati:**

| Fase | Tempo |
|------|-------|
| 1A. Supabase staging | 15 min |
| 1B-1D. Setup SG | 45 min |
| 2. Smoke test | 30 min |
| 3. Switch prod | 15 min |
| **Totale** | **~2h** (idealmente in una sessione unica) |

---

## ⏰ DA FARE 24h PRIMA dello switch finale: abbassa TTL DNS

Site Tools → `piraweb.it` → **Domain → DNS Zone Editor** → record CNAME `gestionale`
→ Edit → **TTL: 300** → Save.

Solo TTL, NON cambiare il target. Serve per cutover rapido in Fase 3.

---

## Fase 1A — Crea progetto Supabase staging

1. Vai su https://supabase.com/dashboard
2. **New project**
3. Compila:
   - Organization: la tua org
   - **Name**: `piraweb-gestionale-staging`
   - **Database password**: genera forte (bottone "Generate") → **salvala in 1Password**
   - **Region**: la stessa di prod (probabilmente `Europe (Frankfurt)` o `eu-central-1`)
   - **Plan**: Free
4. Click **Create** → aspetta ~2 min provisioning
5. Quando pronto, vai a **SQL Editor** (sidebar)
6. **New query** → incolla TUTTO il contenuto di `deploy/supabase-staging-bootstrap.sql`
7. **Run** → verifica "Success"
8. Vai a **Database → Tables** → conferma che vedi `profiles`, `clients`, `projects`, `tasks`, `api_usage`, etc. (circa 30 tabelle)
9. **Project Settings → API**: copia in un appunto:
   - **Project URL** (es. `https://abcdefgh.supabase.co`)
   - **anon public key** (lungo JWT, inizia con `eyJ...`)
   - **service_role secret** (lungo JWT, inizia con `eyJ...`)

10. Apri `~/Desktop/gestionale/.env.staging` e sostituisci i 3 placeholder:

    ```
    NEXT_PUBLIC_SUPABASE_URL="<incolla qui Project URL>"
    NEXT_PUBLIC_SUPABASE_ANON_KEY="<incolla qui anon key>"
    SUPABASE_SERVICE_ROLE_KEY="<incolla qui service_role>"
    ```

11. **Crea un utente admin di test**: in Supabase staging → **Authentication → Users → Add user**:
    - Email: `staging@piraweb.it` (o quella che vuoi)
    - Password: scegline una sicura e salvala
    - Auto Confirm User: ✅
    
    Poi vai a **Table Editor → profiles**, trova la riga appena creata e setta `role = 'admin'`.

---

## Fase 1B — Crea sotto-dominio su SiteGround

1. Site Tools del dominio `piraweb.it`
2. **Domain → Subdomains**
3. **Create New Subdomain**:
   - **Subdomain**: `gestionale-staging`
   - **Document Root**: lascia il default (es. `public_html/gestionale-staging.piraweb.it`)
4. Crea
5. **Security → SSL Manager**: forza Let's Encrypt sul nuovo sotto-dominio (di solito automatico, verifica)

---

## Fase 1C — Attiva app Node.js su SG

1. Site Tools → **Devs → Node.js**
2. **Create Application**:
   - **Node.js version**: 20.x (o più recente disponibile)
   - **Application mode**: `Production`
   - **Application root**: `/home/<tuo-user>/www/gestionale-staging.piraweb.it/public_html` (o il path che SG ti mostra per il sotto-dominio)
   - **Application URL**: `gestionale-staging.piraweb.it`
   - **Application startup file**: `app.js`
3. **Create** — lascia che si inizializzi

4. **Environment Variables**: apri il file `.env.staging` e per ogni riga `KEY="value"`:
   - Click **Add Variable**
   - Name: `KEY`
   - Value: `value` (senza virgolette esterne — SG le aggiunge)
   - Salva
   
   Sono 30 variabili. Ripeti per tutte. NON saltare `NODE_ENV=production`.

---

## Fase 1D — Deploy via SSH

1. Site Tools → **Devs → SSH Keys Manager** → genera/scarica chiave SSH se non l'hai già
2. Da terminale Mac:

   ```bash
   ssh -p <porta-sg> <user>@<host-sg>
   ```

3. Una volta dentro:

   ```bash
   cd ~/www/gestionale-staging.piraweb.it/public_html
   git clone https://github.com/raffaelepiccolo39-commits/piraweb-gestionale.git .
   git checkout main
   npm ci --omit=dev=false   # serve dev deps per il build
   npm run build:sg
   ```

   > Il build dura 2-3 min. Genera `.next/standalone/server.js` + copia public e static.

4. Torna nel pannello SG → **Devs → Node.js** → click **Restart** sull'app

5. Verifica nel browser: https://gestionale-staging.piraweb.it/login dovrebbe rispondere

---

## Fase 1E — Setup crontab su SG

1. SSH come prima
2. `crontab -e`
3. Incolla il contenuto di `deploy/crontab.sg.txt` (è già nel repo dopo il clone)
4. Sostituisci `__CRON_SECRET__` col valore reale (da `.env.staging` → riga `CRON_SECRET`)
5. Sostituisci `__DOMAIN__` con `gestionale-staging.piraweb.it`
6. Salva ed esci
7. Verifica: `crontab -l`

---

## Fase 2 — Smoke test su staging

Apri https://gestionale-staging.piraweb.it e spunta:

- [ ] **Login**: entra con `staging@piraweb.it`
- [ ] **Dashboard si carica**: niente 500, theme switcher funziona
- [ ] **CRM**: crea un Deal di test → si salva in Supabase staging
- [ ] **API AI**: vai su una task, click "AI describe" → risposta da Anthropic
- [ ] **Email test**: dal Settings/Tools → invia mail test → arriva
- [ ] **Cron manuale**: da terminale Mac:

  ```bash
  curl -H "Authorization: Bearer <CRON_SECRET>" \
       https://gestionale-staging.piraweb.it/api/cron/lead-scout
  ```
  
  Deve rispondere 200.

- [ ] **Logs SG**: Site Tools → Devs → Node.js → Logs → niente errori unhandled

Se qualcosa fallisce, FERMATI. Non procedere alla Fase 3.

---

## Fase 3 — Switch prod (solo dopo OK di Fase 2)

1. **Backup ulteriore**: assicurati che `pre-siteground-migration` su origin sia aggiornato.

2. **Aggiorna config su Vercel-side che restano live finché DNS non switcha:**
   - Vercel dashboard → progetto `piraweb-gestionale` → Settings → freeze deployments (opzionale, evita deploy accidentali)

3. **Aggiorna Meta App OAuth** (https://developers.facebook.com/apps):
   - Trova app con ID `796964696476543`
   - **Facebook Login → Settings → Valid OAuth Redirect URIs**
   - Aggiungi: `https://gestionale.piraweb.it/api/meta/callback` (se non c'è già — probabilmente sì)
   - Verifica che NON sia rimossa la vecchia (lasciamola per rollback)
   - Save

4. **Aggiorna Supabase Auth prod** (project `queboudvijstvpjuacix`):
   - Authentication → URL Configuration
   - Site URL: già `https://gestionale.piraweb.it` (lascia)
   - Additional Redirect URLs: aggiungi `https://gestionale-staging.piraweb.it/**` se non l'hai già

5. **Crea l'app Node.js produzione su SG**: ripeti Fasi 1B-1E ma con:
   - Subdomain: ⚠️ **NON crearne uno nuovo** — il dominio `gestionale.piraweb.it` punta ancora a Vercel via CNAME. Devi prima:
     - Site Tools → Domain → Subdomains → eventualmente già esiste oppure va creato
     - Document Root: `public_html/gestionale.piraweb.it`
   - App Node: stesso flow di staging ma:
     - Application URL: `gestionale.piraweb.it`
     - Env vars: copia da `.env.production.local` (NON `.env.staging`), tranne `NEXT_PUBLIC_APP_URL=https://gestionale.piraweb.it`
   - Deploy: stesso `git clone` + `npm run build:sg`

6. **Smoke test pre-cutover su IP/host SG** (con override `/etc/hosts` locale):
   - Trova IP del server SG
   - `sudo nano /etc/hosts` → aggiungi `<IP-SG> gestionale.piraweb.it`
   - Apri browser → fai login → verifica
   - Rimuovi la riga da `/etc/hosts` quando finito

7. **🔴 SWITCH DNS** (questa è l'azione di taglio):
   - Site Tools → Domain → DNS Zone Editor
   - Trova record CNAME `gestionale` → target `b63b976d8207a869.vercel-dns-017.com`
   - **Edit** → cambia target verso il nome host che SG ti ha dato per il sotto-dominio (di solito è il dominio principale `piraweb.it` o un IP A-record)
   - Save

8. **Aspetta 5-15 min** per propagazione (TTL 300 abbassato in fase preparatoria)

9. **Verifica**: `dig gestionale.piraweb.it +short` → deve mostrare l'IP/CNAME SG, non Vercel.

10. Apri https://gestionale.piraweb.it → smoke test completo come Fase 2.

11. **Setup crontab prod** (come Fase 1E, ma con `DOMAIN=gestionale.piraweb.it`).

12. **Aggiorna `NEXT_PUBLIC_APP_URL` su SG**: verifica che sia già `https://gestionale.piraweb.it` (non staging).

---

## Rollback (se Fase 3 va male)

1. Site Tools → DNS Zone Editor → record CNAME `gestionale`
2. Edit → ripristina target a `b63b976d8207a869.vercel-dns-017.com`
3. Save → in 5 min torna live su Vercel

Niente è rotto su Vercel: il deploy esistente continua a girare.

---

## Fase 4 — Cleanup (a freddo, dopo 7-10 giorni di prod stabile)

1. Push dei 3 commit pendenti su origin/main:
   - `8a522c0` refactor(crm): estrae form
   - `1489150` feat(auth): preserva redirect post-login
   - `07b0e2b` feat(deploy): output standalone + entry Passenger

2. Disabilita progetto Vercel (Settings → Delete Project... ma **non eliminarlo per 1 mese**, archivialo)

3. Aggiorna `README.md` con istruzioni deploy SG (sostituisci sezione Vercel)

4. Aggiorna memoria Claude:
   - Marca `project_gestionale_migrazione_siteground` come completata
   - Aggiungi `project_gestionale_deploy_siteground` con la nuova realtà

---

## Note tecniche

### Perché `output: 'standalone'`?
Genera un `.next/standalone/server.js` autosufficiente con tracking automatico delle dipendenze. Sull'host SG non serve `node_modules` completo a runtime, solo le ~12 dipendenze realmente usate. Riduce footprint da ~500 MB a ~54 MB.

### Perché `app.js` come entry point?
SiteGround Phusion Passenger richiede uno startup file `.js` nella root dell'app. `app.js` è un semplice wrapper che fa `require('./.next/standalone/server.js')`, mantenendo pulita la separazione tra entry point e codice generato.

### Aruba FE su SG
Aruba Fatturazione Elettronica probabilmente NON ha IP whitelist (è un servizio SOAP/REST pubblico autenticato), ma verifica con loro se devi notificare il cambio IP. Se serve, l'IP del server SG lo trovi con `curl ifconfig.me` via SSH sul nuovo host.

### Bug latenti rilevati
- Molte env Vercel hanno `\n` letterale alla fine del valore (vedi `.env.production.local`). Su SG sono state ripulite in `.env.staging`. Quando configuri prod su SG, **NON** copia-incollare da `.env.production.local` ma usa `.env.staging` come template + sostituisci `NEXT_PUBLIC_APP_URL` e i tre valori Supabase.
- `ADMIN_SECURITY_PIN_HASH` non è mai stato configurato → feature "verify PIN admin" non funziona. Decisione utente: ignorare, è codice morto.
