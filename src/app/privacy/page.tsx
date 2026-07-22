import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Informativa sulla privacy — Pira Web',
  description: 'Come Pira Web S.R.L. tratta i dati personali di dipendenti e clienti nel gestionale e nell\'app.',
};

/**
 * Informativa privacy pubblica.
 *
 * Serve per due motivi concreti: Apple e Google la pretendono per pubblicare
 * l'app, e il gestionale tratta dati sensibili (presenze, geolocalizzazione,
 * dati retributivi) che per legge vanno dichiarati. È scritta per essere letta
 * da una persona, non da un avvocato: dice cosa raccogliamo, perché, e come si
 * fa a farlo cancellare.
 *
 * Statica di proposito (nessun dato dinamico): così finisce anche nel pacchetto
 * dell'app ed è raggiungibile offline.
 */

const AGGIORNATA = '22 luglio 2026';

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-pw-text mb-2">{titolo}</h2>
      <div className="space-y-2 text-sm text-pw-text-muted leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-pw-bg px-5 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-pw-text">Informativa sulla privacy</h1>
        <p className="text-sm text-pw-text-dim mt-1">Ultimo aggiornamento: {AGGIORNATA}</p>

        <p className="mt-6 text-sm text-pw-text-muted leading-relaxed">
          Questa informativa spiega come <strong>Pira Web S.R.L.</strong> raccoglie e usa i dati
          personali di chi accede al gestionale e all&apos;app — collaboratori e clienti. È scritta
          per essere capita, non per coprirci: se qualcosa non è chiaro, scrivici e te lo spieghiamo.
        </p>

        <Sezione titolo="Chi tratta i dati">
          <p>
            Il titolare del trattamento è <strong>Pira Web S.R.L.</strong>, con sede a Casapesenna (CE),
            P.IVA 04891370613. Per qualsiasi richiesta sui tuoi dati puoi scrivere a{' '}
            <a href="mailto:info@piraweb.it" className="text-pw-accent hover:underline">info@piraweb.it</a>.
          </p>
        </Sezione>

        <Sezione titolo="Quali dati raccogliamo, e perché">
          <p><strong>Se sei un collaboratore</strong> dell&apos;agenzia:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Nome, email e ruolo — per farti accedere e assegnarti il lavoro.</li>
            <li>
              <strong>Presenze e orari</strong> (entrata, pausa, uscita) — per la gestione del lavoro
              e le buste paga. È un obbligo di legge conservarli.
            </li>
            <li>
              <strong>Posizione (GPS)</strong> — registrata <em>solo</em> nel momento in cui timbri
              l&apos;entrata e l&apos;uscita, per certificare la presenza. Non c&apos;è alcun
              tracciamento continuo: fuori da quei due istanti la tua posizione non viene mai letta.
            </li>
            <li>
              <strong>Dati retributivi</strong> (stipendio, IBAN, contratto) — per la contabilità.
              Sono conservati separatamente e li vede solo l&apos;amministrazione, non gli altri
              colleghi.
            </li>
          </ul>
          <p className="pt-2"><strong>Se sei un cliente</strong> con accesso all&apos;area riservata:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Nome, azienda ed email — per identificarti e mostrarti la tua area.</li>
            <li>I contenuti del tuo piano editoriale, i messaggi che ci scrivi, i file che carichi,
              lo stato dei pagamenti e il contratto — per gestire il rapporto con te.</li>
          </ul>
        </Sezione>

        <Sezione titolo="Su quale base giuridica">
          <p>
            Trattiamo questi dati per <strong>eseguire il rapporto di lavoro o il contratto</strong>
            con te, per <strong>adempiere a obblighi di legge</strong> (fiscali, contributivi,
            giuslavoristici) e per il nostro <strong>legittimo interesse</strong> a organizzare il
            lavoro dell&apos;agenzia. La posizione GPS è trattata sulla base dell&apos;organizzazione
            del lavoro, nel rispetto dell&apos;art. 4 dello Statuto dei Lavoratori: registra e
            segnala, non serve a controllarti a distanza.
          </p>
        </Sezione>

        <Sezione titolo="A chi li affidiamo">
          <p>
            Non vendiamo i tuoi dati a nessuno. Per far funzionare il servizio ci appoggiamo a
            fornitori che li trattano solo per nostro conto:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase</strong> e <strong>Vercel</strong> — dove il gestionale e il database
              sono ospitati.</li>
            <li><strong>Google</strong> — per la trascrizione dei messaggi vocali che registri tu.</li>
            <li><strong>Anthropic</strong> — per l&apos;assistente che riordina le idee, quando lo usi.</li>
            <li><strong>Meta</strong> — solo se e quando pubblichiamo i contenuti sui tuoi profili social.</li>
            <li><strong>Aruba</strong> — per la fatturazione elettronica verso il Sistema di Interscambio.</li>
          </ul>
        </Sezione>

        <Sezione titolo="Per quanto li teniamo">
          <p>
            Teniamo i dati per il tempo del rapporto con te, e dopo solo per quanto la legge ci
            obbliga (i documenti fiscali e le buste paga hanno tempi di conservazione previsti dalla
            normativa). Quello che non siamo obbligati a conservare, lo cancelliamo.
          </p>
        </Sezione>

        <Sezione titolo="I tuoi diritti">
          <p>
            Puoi in ogni momento chiederci di <strong>vedere</strong> i tuoi dati, di{' '}
            <strong>correggerli</strong>, di <strong>cancellarli</strong> o di{' '}
            <strong>riceverne una copia</strong>. Puoi anche opporti a un trattamento o chiederne la
            limitazione. Per esercitare questi diritti scrivi a{' '}
            <a href="mailto:info@piraweb.it" className="text-pw-accent hover:underline">info@piraweb.it</a>:
            ti rispondiamo entro i termini di legge.
          </p>
          <p>
            Dall&apos;app puoi chiedere la cancellazione del tuo account direttamente dalla tua
            pagina profilo, alla voce <strong>&ldquo;Cancella il mio account&rdquo;</strong>.
            Cancelleremo l&apos;accesso e i dati personali che non siamo obbligati a conservare per
            legge; ti diremo con chiarezza cosa resta e perché.
          </p>
          <p>
            Se ritieni che trattiamo i tuoi dati in modo scorretto, puoi rivolgerti al{' '}
            <strong>Garante per la protezione dei dati personali</strong> (garanteprivacy.it).
          </p>
        </Sezione>

        <Sezione titolo="Modifiche a questa informativa">
          <p>
            Se cambieremo il modo in cui trattiamo i dati, aggiorneremo questa pagina e la data in
            cima. Le modifiche importanti te le segnaleremo.
          </p>
        </Sezione>

        <p className="mt-10 pt-6 border-t border-pw-border text-xs text-pw-text-dim">
          Pira Web S.R.L. · Casapesenna (CE) · P.IVA 04891370613 ·{' '}
          <a href="mailto:info@piraweb.it" className="text-pw-accent hover:underline">info@piraweb.it</a>
        </p>
      </div>
    </main>
  );
}
