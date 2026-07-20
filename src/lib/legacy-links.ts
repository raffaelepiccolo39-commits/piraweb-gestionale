/**
 * Traduce i vecchi indirizzi con parametro nel percorso.
 *
 * Le schede di cliente, progetto e task sono passate da `/projects/<id>` a
 * `/projects/scheda?id=<id>`: le rotte dinamiche non sopravvivono
 * all'esportazione statica con cui si impacchetta l'app.
 *
 * Il problema è che quei link non stanno solo nel codice: **li scrivono le
 * funzioni dentro il database** (notify_task_assigned e compagnia, che fanno
 * format('/projects/%s', ...)), e nella tabella notifications ce ne sono
 * centinaia già salvati. Riscrivere quelle funzioni in produzione è
 * possibile ma tocca più migration, con il rischio di drift che conosciamo.
 *
 * Tradurre in lettura copre in un colpo solo lo storico e tutto ciò che i
 * trigger continueranno a scrivere. Resta valido anche dopo aver sistemato
 * le funzioni: a quel punto semplicemente non troverà più nulla da tradurre.
 */

const RULES: Array<[RegExp, (id: string) => string]> = [
  [/^\/clients\/([0-9a-f-]{36})\/report$/i, (id) => `/clients/report?id=${id}`],
  [/^\/clients\/([0-9a-f-]{36})$/i,         (id) => `/clients/scheda?id=${id}`],
  [/^\/projects\/([0-9a-f-]{36})$/i,        (id) => `/projects/scheda?id=${id}`],
  [/^\/tasks\/([0-9a-f-]{36})$/i,           (id) => `/tasks/scheda?id=${id}`],
  [/^\/review\/([0-9a-f]{16,})$/i,          (token) => `/review?token=${token}`],
];

export function normalizeLegacyLink(link: string): string {
  for (const [pattern, build] of RULES) {
    const m = link.match(pattern);
    if (m) return build(m[1]);
  }
  return link;
}
