'use client';

import { useEffect } from 'react';
import { installApiOriginPatch } from '@/lib/api-origin';

/**
 * Installa il reindirizzamento delle chiamate API quando l'app gira
 * impacchettata. Nel browser non fa nulla e non rende nulla.
 *
 * Sta nel layout radice perché deve agire prima di qualunque fetch delle
 * pagine, e vale sia per il gestionale sia per il portale.
 */
export function ApiOriginSetup() {
  useEffect(() => { installApiOriginPatch(); }, []);
  return null;
}
