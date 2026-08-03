'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { registraDispositivo } from '@/lib/push-client';
import { isPackagedApp } from '@/lib/api-origin';

/**
 * Registra il telefono per le notifiche push, una volta che si sa chi lo sta
 * usando: il token va legato a una persona, e il permesso si chiede a chi ha
 * gia' capito cos'e' l'app (su iOS un "no" non si puo' richiedere una seconda
 * volta).
 *
 * Guarda la sessione e non il profilo del team, perche' le notifiche servono
 * anche ai clienti del portale, che un profilo del team non ce l'hanno.
 *
 * Non disegna niente. Nel browser non fa niente.
 */
export function PushRegistration() {
  useEffect(() => {
    if (!isPackagedApp()) return;

    const supabase = createClient();
    let vivo = true;

    supabase.auth.getUser().then(({ data }) => {
      if (vivo && data.user) registraDispositivo();
    });

    // Chi apre l'app senza sessione arriva qui prima del login: la
    // registrazione va fatta appena entra, non alla prossima apertura.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, sessione) => {
      if (evento === 'SIGNED_IN' && sessione?.user) registraDispositivo();
    });

    return () => {
      vivo = false;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
