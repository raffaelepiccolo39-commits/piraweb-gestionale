'use client';

import { memo } from 'react';
import type { Profile } from '@/types/database';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 13) return 'Buongiorno';
  if (hour < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

interface GreetingProps {
  profile: Profile;
  overdueTasks: number;
  dueTodayCount: number;
  inProgressTasks: number;
}

export const Greeting = memo(function Greeting({ profile, overdueTasks, dueTodayCount, inProgressTasks }: GreetingProps) {
  function getSubtitle(): string {
    if (overdueTasks > 0) return `Hai ${overdueTasks} attività in ritardo da gestire`;
    if (dueTodayCount > 0) return `${dueTodayCount} attività in scadenza oggi`;
    if (inProgressTasks > 0) return `${inProgressTasks} attività in corso`;
    return 'Tutto sotto controllo!';
  }

  return (
    <div>
      <p className="text-xs text-pw-text-dim uppercase tracking-wider">
        {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
      <h1 className="text-2xl font-bold text-pw-text font-[var(--font-dm-serif)] italic mt-1">
        {getGreeting()}, {profile.full_name.split(' ')[0]}!
      </h1>
      <p className="text-sm text-pw-text-muted mt-0.5">
        {getSubtitle()}
      </p>
    </div>
  );
});
