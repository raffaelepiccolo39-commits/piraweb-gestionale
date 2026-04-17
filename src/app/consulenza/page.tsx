'use client';

import { useState, useEffect, useCallback } from 'react';

interface Slot {
  startTime: string;
  endTime: string;
  start: string;
  end: string;
}

interface SlotsResponse {
  date: string;
  slots: Slot[];
  closed?: boolean;
  reason?: string;
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getNextWeekdays(count: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  const current = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const d = new Date(current);

  while (dates.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      const yyyy = d.getFullYear();
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.getDate().toString().padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

export default function ConsulenzaPage() {
  const [dates] = useState(() => getNextWeekdays(10));
  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState<{ date: string; time: string; duration?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSlots = useCallback(async (date: string) => {
    setLoading(true);
    setClosedReason(null);
    setSelectedSlot(null);
    try {
      const res = await fetch(`/api/booking/slots?date=${date}`);
      const data: SlotsResponse = await res.json();
      if (data.closed || data.reason) {
        setClosedReason(data.reason || 'Non disponibile');
        setSlots([]);
      } else {
        setSlots(data.slots || []);
      }
    } catch {
      setSlots([]);
      setClosedReason('Errore nel caricamento');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedDate) fetchSlots(selectedDate);
  }, [selectedDate, fetchSlots]);

  const handleBook = async () => {
    if (!selectedSlot || !name || !email) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/booking/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, phone, company,
          slot_start: selectedSlot.start,
          slot_end: selectedSlot.end,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Errore nella prenotazione');
      else setBooked(data.booking);
    } catch {
      setError('Errore di connessione');
    }
    setSubmitting(false);
  };

  if (booked) {
    return (
      <>
        <style>{globalStyles}</style>
        <div className="cns-page">
          <header className="cns-header">
            <img src="/logo-email.png" alt="PiraWeb" className="cns-logo" />
          </header>
          <main className="cns-main">
            <div className="cns-confirm-card">
              <div className="cns-confirm-icon">✓</div>
              <h1 className="cns-confirm-title">Consulenza prenotata</h1>
              <p className="cns-confirm-sub">Riceverai un&apos;email di conferma con tutti i dettagli.</p>
              <div className="cns-confirm-box">
                <p className="cns-confirm-date">{booked.date}</p>
                <p className="cns-confirm-time">Ore {booked.time} — Durata: {booked.duration || '30 minuti'}</p>
                <p className="cns-confirm-mode">Videochiamata</p>
              </div>
              <div className="cns-confirm-contact">
                <p>Ing. Raffaele Antonio Piccolo — PiraWeb</p>
                <p>info@piraweb.it · +39 331 853 5698</p>
              </div>
            </div>
          </main>
          <Footer />
        </div>
      </>
    );
  }

  return (
    <>
      <style>{globalStyles}</style>
      <div className="cns-page">
        {/* Header */}
        <header className="cns-header">
          <img src="/logo-email.png" alt="PiraWeb" className="cns-logo" />
        </header>

        <main className="cns-main">
          {/* Hero */}
          <section className="cns-hero">
            <p className="cns-hero-label">CONSULENZA GRATUITA</p>
            <h1 className="cns-hero-title">Fissa un incontro<br />con il nostro team</h1>
            <p className="cns-hero-desc">
              30 minuti per analizzare la vostra presenza digitale e individuare le opportunita&apos; di crescita. Nessun impegno.
            </p>
          </section>

          {/* Booking */}
          <section className="cns-booking">
            {/* Date selector */}
            <div className="cns-panel">
              <div className="cns-panel-header">
                <span className="cns-panel-num">01</span>
                <span className="cns-panel-label">SCEGLI UNA DATA</span>
              </div>
              <div className="cns-dates">
                {dates.map(d => {
                  const dateObj = new Date(d + 'T12:00:00');
                  const dayName = dateObj.toLocaleDateString('it-IT', { weekday: 'short' });
                  const dayNum = dateObj.getDate();
                  const monthName = dateObj.toLocaleDateString('it-IT', { month: 'short' });
                  const isSelected = d === selectedDate;
                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedDate(d)}
                      className={`cns-date-btn ${isSelected ? 'cns-date-btn--active' : ''}`}
                    >
                      <span className="cns-date-day">{dayName}</span>
                      <span className="cns-date-num">{dayNum}</span>
                      <span className="cns-date-month">{monthName}</span>
                    </button>
                  );
                })}
              </div>

              {/* Slots */}
              <div className="cns-panel-header" style={{ marginTop: 24 }}>
                <span className="cns-panel-num">02</span>
                <span className="cns-panel-label">SCEGLI UN ORARIO</span>
              </div>
              <p className="cns-date-selected">{formatDateLabel(selectedDate)}</p>

              {loading ? (
                <p className="cns-muted">Caricamento...</p>
              ) : closedReason ? (
                <p className="cns-muted">{closedReason}</p>
              ) : slots.length === 0 ? (
                <p className="cns-muted">Nessuno slot disponibile</p>
              ) : (
                <div className="cns-slots">
                  {slots.map(slot => (
                    <button
                      key={slot.start}
                      onClick={() => setSelectedSlot(slot)}
                      className={`cns-slot-btn ${selectedSlot?.start === slot.start ? 'cns-slot-btn--active' : ''}`}
                    >
                      {slot.startTime}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Form */}
            <div className="cns-panel">
              <div className="cns-panel-header">
                <span className="cns-panel-num">03</span>
                <span className="cns-panel-label">I VOSTRI DATI</span>
              </div>

              {error && <div className="cns-error">{error}</div>}

              <div className="cns-field">
                <label className="cns-label">Nome e cognome *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Mario Rossi" className="cns-input" />
              </div>
              <div className="cns-field">
                <label className="cns-label">Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="mario@azienda.it" className="cns-input" />
              </div>
              <div className="cns-field">
                <label className="cns-label">Telefono</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+39 333 1234567" className="cns-input" />
              </div>
              <div className="cns-field">
                <label className="cns-label">Nome azienda</label>
                <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="La vostra attivita'" className="cns-input" />
              </div>
              <div className="cns-field">
                <label className="cns-label">Messaggio (opzionale)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Di cosa vorreste parlare?" rows={3} className="cns-input cns-textarea" />
              </div>

              <button
                onClick={handleBook}
                disabled={!selectedSlot || !name || !email || submitting}
                className={`cns-submit ${selectedSlot && name && email ? 'cns-submit--ready' : ''}`}
              >
                {submitting ? 'PRENOTAZIONE IN CORSO...' : selectedSlot ? `PRENOTA PER LE ${selectedSlot.startTime}` : 'SELEZIONA UN ORARIO'}
              </button>

              {selectedSlot && (
                <p className="cns-submit-info">
                  {formatDateLabel(selectedDate)} alle {selectedSlot.startTime} — 30 min — Videochiamata
                </p>
              )}

              {/* Info box */}
              <div className="cns-info-box">
                <p className="cns-info-title">COSA INCLUDE</p>
                <p className="cns-info-item">→ Analisi della vostra presenza digitale</p>
                <p className="cns-info-item">→ Identificazione delle aree di miglioramento</p>
                <p className="cns-info-item">→ Suggerimenti concreti e attuabili</p>
                <p className="cns-info-item">→ Nessun impegno o costo</p>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}

function Footer() {
  return (
    <footer className="cns-footer">
      <div className="cns-footer-inner">
        <div className="cns-footer-col">
          <p className="cns-footer-label">CONTATTI</p>
          <p className="cns-footer-text">info@piraweb.it</p>
          <p className="cns-footer-text">+39 331 853 5698</p>
          <p className="cns-footer-text">+39 081 1756 0017</p>
        </div>
        <div className="cns-footer-col">
          <p className="cns-footer-label">INDIRIZZO</p>
          <p className="cns-footer-text">Via A. Petrillo N°171</p>
          <p className="cns-footer-text">81030 Casapesenna (CE)</p>
        </div>
        <div className="cns-footer-col">
          <p className="cns-footer-label">SOCIAL</p>
          <p className="cns-footer-text"><a href="https://instagram.com/piraweb" target="_blank" rel="noopener noreferrer" className="cns-footer-link">Instagram</a></p>
          <p className="cns-footer-text"><a href="https://facebook.com/piraweb" target="_blank" rel="noopener noreferrer" className="cns-footer-link">Facebook</a></p>
          <p className="cns-footer-text"><a href="https://linkedin.com/company/piraweb" target="_blank" rel="noopener noreferrer" className="cns-footer-link">LinkedIn</a></p>
        </div>
      </div>
      <div className="cns-footer-bottom">
        <p>©2018–2026 Pira Web S.r.l. | P.IVA IT04891370613</p>
      </div>
    </footer>
  );
}

const globalStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  .cns-page {
    min-height: 100vh;
    background: #0a0a0a;
    color: #f0ede6;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }

  /* Header */
  .cns-header {
    padding: 24px clamp(24px, 5vw, 40px);
    border-bottom: 1px solid rgba(240,237,230,0.08);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cns-logo {
    height: 40px;
    width: auto;
    filter: invert(1);
  }

  /* Main */
  .cns-main {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 clamp(20px, 5vw, 40px);
  }

  /* Hero */
  .cns-hero {
    text-align: center;
    padding: clamp(48px, 8vw, 80px) 0 clamp(32px, 6vw, 56px);
  }
  .cns-hero-label {
    font-size: 11px;
    letter-spacing: 0.25em;
    color: rgba(240,237,230,0.4);
    margin-bottom: 16px;
    text-transform: uppercase;
  }
  .cns-hero-title {
    font-size: clamp(28px, 5vw, 48px);
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.01em;
    margin-bottom: 16px;
  }
  .cns-hero-desc {
    font-size: clamp(14px, 2vw, 16px);
    color: rgba(240,237,230,0.5);
    max-width: 460px;
    margin: 0 auto;
    line-height: 1.6;
  }

  /* Booking grid */
  .cns-booking {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    padding-bottom: clamp(48px, 8vw, 80px);
  }
  @media (max-width: 720px) {
    .cns-booking { grid-template-columns: 1fr; }
  }

  /* Panel */
  .cns-panel {
    background: rgba(240,237,230,0.03);
    border: 1px solid rgba(240,237,230,0.08);
    border-radius: 12px;
    padding: 24px;
  }
  .cns-panel-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }
  .cns-panel-num {
    font-size: 11px;
    color: rgba(240,237,230,0.3);
    letter-spacing: 0.1em;
  }
  .cns-panel-label {
    font-size: 11px;
    letter-spacing: 0.2em;
    color: rgba(240,237,230,0.6);
    font-weight: 600;
  }

  /* Dates */
  .cns-dates {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .cns-date-btn {
    background: rgba(240,237,230,0.04);
    border: 1px solid rgba(240,237,230,0.1);
    border-radius: 8px;
    padding: 8px 4px;
    min-width: 56px;
    text-align: center;
    cursor: pointer;
    color: rgba(240,237,230,0.6);
    transition: all 0.2s;
  }
  .cns-date-btn:hover {
    border-color: rgba(240,237,230,0.3);
    color: #f0ede6;
  }
  .cns-date-btn--active {
    background: #f0ede6;
    border-color: #f0ede6;
    color: #0a0a0a;
  }
  .cns-date-btn--active:hover {
    color: #0a0a0a;
  }
  .cns-date-day {
    display: block;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    opacity: 0.7;
  }
  .cns-date-num {
    display: block;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.4;
  }
  .cns-date-month {
    display: block;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.6;
  }

  .cns-date-selected {
    font-size: 13px;
    color: rgba(240,237,230,0.5);
    margin-bottom: 12px;
    text-transform: capitalize;
  }

  /* Slots */
  .cns-slots {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  @media (max-width: 400px) {
    .cns-slots { grid-template-columns: repeat(2, 1fr); }
  }
  .cns-slot-btn {
    background: rgba(240,237,230,0.04);
    border: 1px solid rgba(240,237,230,0.1);
    border-radius: 6px;
    padding: 10px 4px;
    color: rgba(240,237,230,0.7);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  .cns-slot-btn:hover {
    border-color: rgba(240,237,230,0.3);
    color: #f0ede6;
  }
  .cns-slot-btn--active {
    background: #FFD108;
    border-color: #FFD108;
    color: #0a0a0a;
    font-weight: 700;
  }
  .cns-slot-btn--active:hover {
    color: #0a0a0a;
  }

  .cns-muted {
    color: rgba(240,237,230,0.3);
    font-size: 13px;
  }

  /* Form */
  .cns-field {
    margin-bottom: 14px;
  }
  .cns-label {
    display: block;
    font-size: 11px;
    letter-spacing: 0.1em;
    color: rgba(240,237,230,0.4);
    margin-bottom: 6px;
    text-transform: uppercase;
  }
  .cns-input {
    width: 100%;
    padding: 12px 14px;
    background: rgba(240,237,230,0.04);
    border: 1px solid rgba(240,237,230,0.1);
    border-radius: 6px;
    color: #f0ede6;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
    font-family: inherit;
  }
  .cns-input::placeholder {
    color: rgba(240,237,230,0.2);
  }
  .cns-input:focus {
    border-color: rgba(240,237,230,0.3);
  }
  .cns-textarea {
    resize: vertical;
    min-height: 72px;
  }

  .cns-error {
    background: rgba(220,38,38,0.1);
    border: 1px solid rgba(220,38,38,0.3);
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 14px;
    color: #fca5a5;
    font-size: 13px;
  }

  /* Submit */
  .cns-submit {
    width: 100%;
    padding: 16px;
    background: rgba(240,237,230,0.08);
    border: 1px solid rgba(240,237,230,0.1);
    border-radius: 8px;
    color: rgba(240,237,230,0.3);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    cursor: not-allowed;
    transition: all 0.3s;
    margin-top: 4px;
  }
  .cns-submit--ready {
    background: #FFD108;
    border-color: #FFD108;
    color: #0a0a0a;
    cursor: pointer;
  }
  .cns-submit--ready:hover {
    transform: scale(1.01);
    filter: brightness(1.05);
  }
  .cns-submit:disabled {
    opacity: 0.6;
  }

  .cns-submit-info {
    text-align: center;
    margin-top: 10px;
    font-size: 11px;
    color: rgba(240,237,230,0.3);
    letter-spacing: 0.05em;
  }

  /* Info box */
  .cns-info-box {
    margin-top: 20px;
    padding: 16px;
    border-top: 1px solid rgba(240,237,230,0.06);
  }
  .cns-info-title {
    font-size: 10px;
    letter-spacing: 0.2em;
    color: rgba(240,237,230,0.3);
    margin-bottom: 10px;
    font-weight: 600;
  }
  .cns-info-item {
    font-size: 12px;
    color: rgba(240,237,230,0.4);
    line-height: 1.8;
  }

  /* Confirm */
  .cns-confirm-card {
    max-width: 480px;
    margin: clamp(48px,10vw,100px) auto;
    text-align: center;
  }
  .cns-confirm-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(255,209,8,0.1);
    border: 2px solid #FFD108;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    font-size: 24px;
    color: #FFD108;
  }
  .cns-confirm-title {
    font-size: clamp(24px, 4vw, 32px);
    font-weight: 700;
    margin-bottom: 8px;
  }
  .cns-confirm-sub {
    color: rgba(240,237,230,0.5);
    font-size: 14px;
    margin-bottom: 24px;
  }
  .cns-confirm-box {
    background: rgba(240,237,230,0.04);
    border: 1px solid rgba(240,237,230,0.08);
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 24px;
  }
  .cns-confirm-date {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 4px;
    text-transform: capitalize;
  }
  .cns-confirm-time {
    font-size: 14px;
    color: rgba(240,237,230,0.6);
  }
  .cns-confirm-mode {
    font-size: 12px;
    color: rgba(240,237,230,0.3);
    margin-top: 6px;
  }
  .cns-confirm-contact {
    color: rgba(240,237,230,0.3);
    font-size: 12px;
    line-height: 1.6;
  }

  /* Footer */
  .cns-footer {
    border-top: 1px solid rgba(240,237,230,0.06);
    padding: clamp(32px,5vw,48px) clamp(24px,5vw,40px) 24px;
  }
  .cns-footer-inner {
    max-width: 960px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  @media (max-width: 540px) {
    .cns-footer-inner { grid-template-columns: 1fr; gap: 20px; }
  }
  .cns-footer-col {}
  .cns-footer-label {
    font-size: 10px;
    letter-spacing: 0.2em;
    color: rgba(240,237,230,0.3);
    margin-bottom: 10px;
    font-weight: 600;
  }
  .cns-footer-text {
    font-size: 13px;
    color: rgba(240,237,230,0.5);
    line-height: 1.7;
  }
  .cns-footer-link {
    color: rgba(240,237,230,0.5);
    text-decoration: none;
    border-bottom: 1px solid rgba(240,237,230,0.1);
    transition: all 0.2s;
  }
  .cns-footer-link:hover {
    color: #f0ede6;
    border-color: rgba(240,237,230,0.4);
  }
  .cns-footer-bottom {
    max-width: 960px;
    margin: 24px auto 0;
    padding-top: 16px;
    border-top: 1px solid rgba(240,237,230,0.04);
    text-align: center;
    font-size: 11px;
    color: rgba(240,237,230,0.2);
  }
`;
