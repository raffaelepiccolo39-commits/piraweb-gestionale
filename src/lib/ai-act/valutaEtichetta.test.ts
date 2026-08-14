/**
 * Test di valutaEtichetta. Eseguire con:
 *   node --test --experimental-strip-types src/lib/ai-act/valutaEtichetta.test.ts
 *
 * Copre i sei casi di riferimento PIRA WEB della specifica e ogni ramo delle
 * sei regole (R1–R6, più le esenzioni R3/R5).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valutaEtichetta, type ContestoGenerazione } from './valutaEtichetta.ts';

/** Contesto di base: tutto negativo, output testo. Si sovrascrive il minimo. */
function ctx(over: Partial<ContestoGenerazione> = {}): ContestoGenerazione {
  return {
    tipoOutput: 'TESTO',
    contieneVoceClonata: false,
    contieneVoltoSintetico: false,
    rappresentaPersonaReale: false,
    scenaFotorealistica: false,
    finalitaInformativaPubblica: false,
    operaManifestamenteCreativa: false,
    revisioneEditorialeUmana: false,
    responsabileEditoriale: null,
    ...over,
  };
}

// ── I sei casi di riferimento PIRA WEB ──────────────────────────────────────

test('Caso 1 — script Pedata assistito da IA, recitato da persone reali → NON_RICHIESTA', () => {
  const r = valutaEtichetta(ctx({ tipoOutput: 'VIDEO', rappresentaPersonaReale: true }));
  assert.equal(r.esito, 'NON_RICHIESTA');
  assert.equal(r.regolaApplicata, 'DEFAULT');
});

test('Caso 2 — grafica Con.tex generata con IA e rilavorata → NON_RICHIESTA', () => {
  const r = valutaEtichetta(ctx({ tipoOutput: 'IMMAGINE' }));
  assert.equal(r.esito, 'NON_RICHIESTA');
});

test('Caso 3 — voiceover con voce sintetica non riconducibile a persona reale → NON_RICHIESTA', () => {
  const r = valutaEtichetta(ctx({ tipoOutput: 'AUDIO', contieneVoceClonata: true, rappresentaPersonaReale: false }));
  assert.equal(r.esito, 'NON_RICHIESTA');
});

test('Caso 4 — video con voce clonata di un titolare cliente → RICHIESTA_DEEPFAKE', () => {
  const r = valutaEtichetta(ctx({ tipoOutput: 'VIDEO', contieneVoceClonata: true, rappresentaPersonaReale: true }));
  assert.equal(r.esito, 'RICHIESTA_DEEPFAKE');
  assert.equal(r.regolaApplicata, 'DEEPFAKE_VOCE');
  assert.ok(r.testoSuggerito);
});

test('Caso 5 — post blog su normativa, pubblicato senza revisione → RICHIESTA_TESTO_INTERESSE_PUBBLICO', () => {
  const r = valutaEtichetta(ctx({ tipoOutput: 'TESTO', finalitaInformativaPubblica: true }));
  assert.equal(r.esito, 'RICHIESTA_TESTO_INTERESSE_PUBBLICO');
  assert.equal(r.regolaApplicata, 'TESTO_PUBBLICO');
});

test('Caso 6 — stesso post revisionato e firmato da Raffaele → ESENTE_REVISIONE_EDITORIALE', () => {
  const r = valutaEtichetta(
    ctx({
      tipoOutput: 'TESTO',
      finalitaInformativaPubblica: true,
      revisioneEditorialeUmana: true,
      responsabileEditoriale: 'Raffaele Antonio Piccolo',
    }),
  );
  assert.equal(r.esito, 'ESENTE_REVISIONE_EDITORIALE');
  assert.equal(r.regolaApplicata, 'REVISIONE_EDITORIALE');
  assert.equal(r.testoSuggerito, null);
});

// ── Copertura degli altri rami ──────────────────────────────────────────────

test('R2 — volto sintetico su scena fotorealistica (senza persona reale) → DEEPFAKE_VOLTO', () => {
  const r = valutaEtichetta(ctx({ tipoOutput: 'IMMAGINE', contieneVoltoSintetico: true, scenaFotorealistica: true }));
  assert.equal(r.esito, 'RICHIESTA_DEEPFAKE');
  assert.equal(r.regolaApplicata, 'DEEPFAKE_VOLTO');
});

test('R2 — volto sintetico che rappresenta persona reale → DEEPFAKE_VOLTO', () => {
  const r = valutaEtichetta(ctx({ tipoOutput: 'VIDEO', contieneVoltoSintetico: true, rappresentaPersonaReale: true }));
  assert.equal(r.regolaApplicata, 'DEEPFAKE_VOLTO');
});

test('R3 — deepfake ma opera manifestamente creativa → ESENTE_OPERA_CREATIVA (disclosure ridotta)', () => {
  const r = valutaEtichetta(
    ctx({ tipoOutput: 'VIDEO', contieneVoceClonata: true, rappresentaPersonaReale: true, operaManifestamenteCreativa: true }),
  );
  assert.equal(r.esito, 'ESENTE_OPERA_CREATIVA');
  assert.equal(r.regolaApplicata, 'OPERA_CREATIVA');
  assert.ok(r.testoSuggerito, 'l\'opera creativa mantiene una disclosure ridotta, non nulla');
});

test('R5 non sana i deepfake — voce clonata + revisione editoriale resta RICHIESTA_DEEPFAKE', () => {
  const r = valutaEtichetta(
    ctx({
      tipoOutput: 'VIDEO',
      contieneVoceClonata: true,
      rappresentaPersonaReale: true,
      revisioneEditorialeUmana: true,
      responsabileEditoriale: 'Raffaele',
    }),
  );
  assert.equal(r.esito, 'RICHIESTA_DEEPFAKE', 'la revisione editoriale non esenta un contenuto falsamente autentico');
});

test('R4 — revisione senza responsabile editoriale NON esenta', () => {
  const r = valutaEtichetta(
    ctx({ tipoOutput: 'TESTO', finalitaInformativaPubblica: true, revisioneEditorialeUmana: true, responsabileEditoriale: null }),
  );
  assert.equal(r.esito, 'RICHIESTA_TESTO_INTERESSE_PUBBLICO');
});

test('R6 — testo non di interesse pubblico (copy pubblicitario) → NON_RICHIESTA', () => {
  const r = valutaEtichetta(ctx({ tipoOutput: 'TESTO', finalitaInformativaPubblica: false }));
  assert.equal(r.esito, 'NON_RICHIESTA');
});

test('R1 non scatta senza persona reale — voce clonata generica → NON_RICHIESTA', () => {
  const r = valutaEtichetta(ctx({ tipoOutput: 'AUDIO', contieneVoceClonata: true, rappresentaPersonaReale: false }));
  assert.equal(r.esito, 'NON_RICHIESTA');
});
