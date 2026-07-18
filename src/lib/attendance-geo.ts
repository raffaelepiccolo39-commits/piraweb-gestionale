/**
 * Posizione delle timbrature. Cattura le coordinate GPS al momento di
 * entrata/uscita (grezze: lat/lng + accuratezza), senza mai bloccare la
 * timbratura: se il GPS è negato o non disponibile, ritorna null e la
 * timbratura prosegue registrando "posizione non disponibile".
 *
 * La distanza dalla sede si calcola SOLO lato admin (distanceMeters), con le
 * coordinate dell'ufficio da company_settings: i dipendenti non le ricevono.
 */

export interface GeoStamp {
  lat: number;
  lng: number;
  /** Accuratezza stimata in metri (più è bassa, più è precisa). */
  acc: number | null;
}

/**
 * Chiede la posizione al browser. Risolve SEMPRE (mai reject): null se il
 * permesso è negato, il GPS è assente o scade il timeout. Così non blocca mai
 * la timbratura.
 */
export function captureGeoStamp(): Promise<GeoStamp | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        acc: p.coords.accuracy != null ? Math.round(p.coords.accuracy) : null,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}

/** Distanza in metri tra due coordinate (formula dell'emisenoverso). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000; // raggio terrestre in metri
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}
