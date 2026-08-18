import { cn } from '@/lib/utils';
import { fasciaLeadScore } from '@/types/database';

/**
 * Badge del lead score (§6.2). Il numero da solo non dice niente a chi
 * guarda la board di corsa: la fascia sì.
 */
export function BadgeScore({ score, className }: { score: number; className?: string }) {
  const fascia = fasciaLeadScore(score);
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', fascia.classe, className)}
      title={`Lead score ${score} — ${fascia.nome}`}
    >
      {score}
      <span className="opacity-70">{fascia.nome}</span>
    </span>
  );
}

/**
 * "Discovery 5/7" — sulla card serve a rendere ovvio, senza aprire nulla,
 * perché quell'opportunità non può ancora passare a Proposta (§7.4).
 */
export function IndicatoreDiscovery({ fatti, className }: { fatti: number; className?: string }) {
  const completa = fatti === 7;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
        completa ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-pw-border text-pw-text-dim',
        className,
      )}
      title={completa ? 'Discovery completa' : 'Discovery incompleta: la proposta è bloccata finché mancano campi'}
    >
      Discovery {fatti}/7
    </span>
  );
}
