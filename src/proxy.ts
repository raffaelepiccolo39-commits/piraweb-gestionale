import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Esclude anche sw.js, manifest e file statici di root: il service worker
    // DEVE essere servito pubblicamente (senza auth/redirect), altrimenti il
    // browser non riesce ad aggiornarlo e un SW vecchio resta bloccato.
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
