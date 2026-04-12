'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

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

  // Form
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
      setClosedReason('Errore nel caricamento degli slot');
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
          name,
          email,
          phone,
          company,
          slot_start: selectedSlot.start,
          slot_end: selectedSlot.end,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Errore nella prenotazione');
      } else {
        setBooked(data.booking);
      }
    } catch {
      setError('Errore di connessione');
    }
    setSubmitting(false);
  };

  // Pagina di conferma
  if (booked) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" }}>
        <div style={{ background: '#fff', borderRadius: 12, maxWidth: 500, width: '100%', padding: '48px 40px', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✓</div>
          <h1 style={{ margin: '0 0 8px', color: '#111', fontSize: 24, fontWeight: 700 }}>Consulenza prenotata</h1>
          <p style={{ margin: '0 0 24px', color: '#666', fontSize: 15 }}>Riceverai un&apos;email di conferma con tutti i dettagli.</p>
          <div style={{ background: '#F8F8F8', border: '1px solid #EAEAEA', borderRadius: 8, padding: '16px 20px', textAlign: 'left' }}>
            <p style={{ margin: '0 0 4px', color: '#333', fontSize: 15, fontWeight: 600 }}>{booked.date}</p>
            <p style={{ margin: 0, color: '#666', fontSize: 14 }}>Ore {booked.time} — Durata: {booked.duration || '30 minuti'}</p>
          </div>
          <p style={{ margin: '24px 0 0', color: '#999', fontSize: 13 }}>
            Ing. Raffaele Antonio Piccolo — PiraWeb<br />
            info@piraweb.it · +39 331 853 5698
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ background: '#1A1A2E', padding: '24px 0', textAlign: 'center' }}>
        <Image src="/logo.png" alt="PiraWeb" width={140} height={50} style={{ height: 'auto' }} />
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>

        {/* Intro */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ margin: '0 0 8px', color: '#111', fontSize: 26, fontWeight: 700 }}>Fissa una consulenza gratuita</h1>
          <p style={{ margin: 0, color: '#666', fontSize: 15, maxWidth: 500, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            30 minuti con il nostro team per analizzare la vostra presenza digitale e individuare le opportunità di crescita. Nessun impegno.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' as const }}>

          {/* Colonna sinistra: calendario */}
          <div style={{ flex: '1 1 340px', minWidth: 300 }}>
            <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E5E5E5', overflow: 'hidden' }}>

              {/* Selettore data */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #EEE' }}>
                <p style={{ margin: '0 0 10px', color: '#333', fontSize: 14, fontWeight: 600 }}>Scegli una data</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                  {dates.map(d => {
                    const dateObj = new Date(d + 'T12:00:00');
                    const dayName = dateObj.toLocaleDateString('it-IT', { weekday: 'short' });
                    const dayNum = dateObj.getDate();
                    const isSelected = d === selectedDate;
                    return (
                      <button
                        key={d}
                        onClick={() => setSelectedDate(d)}
                        style={{
                          padding: '8px 6px',
                          border: isSelected ? '2px solid #1A1A2E' : '1px solid #DDD',
                          borderRadius: 8,
                          background: isSelected ? '#1A1A2E' : '#fff',
                          color: isSelected ? '#FFD700' : '#333',
                          cursor: 'pointer',
                          minWidth: 52,
                          textAlign: 'center',
                          fontSize: 12,
                          fontWeight: isSelected ? 700 : 400,
                        }}
                      >
                        <div style={{ textTransform: 'capitalize', fontSize: 10, opacity: 0.7 }}>{dayName}</div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{dayNum}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slot orari */}
              <div style={{ padding: '16px 20px' }}>
                <p style={{ margin: '0 0 10px', color: '#333', fontSize: 14, fontWeight: 600 }}>
                  {formatDateLabel(selectedDate)}
                </p>

                {loading ? (
                  <p style={{ color: '#999', fontSize: 13 }}>Caricamento...</p>
                ) : closedReason ? (
                  <p style={{ color: '#999', fontSize: 13 }}>{closedReason}</p>
                ) : slots.length === 0 ? (
                  <p style={{ color: '#999', fontSize: 13 }}>Nessuno slot disponibile per questa data</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {slots.map(slot => {
                      const isSelected = selectedSlot?.start === slot.start;
                      return (
                        <button
                          key={slot.start}
                          onClick={() => setSelectedSlot(slot)}
                          style={{
                            padding: '10px 4px',
                            border: isSelected ? '2px solid #1A1A2E' : '1px solid #DDD',
                            borderRadius: 6,
                            background: isSelected ? '#1A1A2E' : '#fff',
                            color: isSelected ? '#FFD700' : '#333',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: isSelected ? 700 : 500,
                          }}
                        >
                          {slot.startTime}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Colonna destra: form */}
          <div style={{ flex: '1 1 280px', minWidth: 260 }}>
            <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E5E5E5', padding: '20px' }}>
              <p style={{ margin: '0 0 16px', color: '#333', fontSize: 14, fontWeight: 600 }}>I vostri dati</p>

              {error && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>
                  <p style={{ margin: 0, color: '#DC2626', fontSize: 13 }}>{error}</p>
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', color: '#555', fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Nome e cognome *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Mario Rossi"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDD', borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', color: '#555', fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="mario@azienda.it"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDD', borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', color: '#555', fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Telefono</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+39 333 1234567"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDD', borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', color: '#555', fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Nome azienda</label>
                <input
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="La vostra attivita'"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDD', borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', color: '#555', fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Note (opzionale)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Di cosa vorreste parlare?"
                  rows={3}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDD', borderRadius: 6, fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>

              <button
                onClick={handleBook}
                disabled={!selectedSlot || !name || !email || submitting}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: selectedSlot && name && email ? '#1A1A2E' : '#CCC',
                  color: selectedSlot && name && email ? '#FFD700' : '#888',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: selectedSlot && name && email ? 'pointer' : 'not-allowed',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Prenotazione in corso...' : selectedSlot ? `Prenota per le ${selectedSlot.startTime}` : 'Seleziona un orario'}
              </button>

              {selectedSlot && (
                <p style={{ margin: '10px 0 0', color: '#999', fontSize: 11, textAlign: 'center' }}>
                  {formatDateLabel(selectedDate)} alle {selectedSlot.startTime} — 30 min — Videochiamata
                </p>
              )}
            </div>

            {/* Info */}
            <div style={{ marginTop: 16, padding: '16px 20px', background: '#fff', borderRadius: 8, border: '1px solid #E5E5E5' }}>
              <p style={{ margin: '0 0 8px', color: '#333', fontSize: 13, fontWeight: 600 }}>Cosa include la consulenza</p>
              <p style={{ margin: '0 0 4px', color: '#666', fontSize: 12, lineHeight: 1.5 }}>&#10003; Analisi della vostra presenza digitale</p>
              <p style={{ margin: '0 0 4px', color: '#666', fontSize: 12, lineHeight: 1.5 }}>&#10003; Identificazione delle aree di miglioramento</p>
              <p style={{ margin: '0 0 4px', color: '#666', fontSize: 12, lineHeight: 1.5 }}>&#10003; Suggerimenti concreti e attuabili</p>
              <p style={{ margin: '0', color: '#666', fontSize: 12, lineHeight: 1.5 }}>&#10003; Nessun impegno o costo</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 32, paddingTop: 16, borderTop: '1px solid #E5E5E5' }}>
          <p style={{ margin: '0 0 4px', color: '#999', fontSize: 11 }}>
            <strong>Pira Web S.R.L.</strong> — P.IVA 04891370613 — Casapesenna (CE)
          </p>
          <p style={{ margin: 0, color: '#BBB', fontSize: 10 }}>
            piraweb.it · info@piraweb.it · +39 331 853 5698
          </p>
        </div>
      </div>
    </div>
  );
}
