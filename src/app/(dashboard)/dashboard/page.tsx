'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { reportUnknown, reportSupabaseError } from '@/lib/report-error';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, getStatusTone, getPriorityTone, getRoleLabel, getRoleTone, getInitials, formatDateLocal, todayLocal } from '@/lib/utils';
import { AlertTriangle, Calendar, ChevronRight, Users } from 'lucide-react';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import { COLONNE_ACCONTO, accontiNelPeriodo, totaliAcconti, type AccontoContabile } from '@/lib/acconti';
import { COLONNE_EXTRA, extraNelPeriodo, totaleExtra, type ExtraContabile } from '@/lib/lavori-extra';
import type { AttendanceRecord } from '@/types/database';

// Dashboard components
import { AttendanceWidget } from '@/components/dashboard/attendance-widget';
import { UrgentTasks } from '@/components/dashboard/urgent-tasks';
import { StatCards } from '@/components/dashboard/stat-cards';
import { ProjectProgress } from '@/components/dashboard/project-progress';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { TeamAttendance } from '@/components/dashboard/team-attendance';
import { AbsentToday } from '@/components/dashboard/absent-today';
import { TimeOffInbox } from '@/components/dashboard/time-off-inbox';
import { PedDeadlines } from '@/components/dashboard/ped-deadlines';
import { WebsiteRenewals } from '@/components/dashboard/website-renewals';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { GrigliaDashboard } from '@/components/dashboard/griglia-dashboard';
import {
  normalizza, riquadroPerId, disposizionePredefinita,
  type PostoRiquadro,
} from '@/components/dashboard/riquadri-config';
import { captureGeoStamp } from '@/lib/attendance-geo';
import { notifyTimeOffDecision } from '@/lib/time-off-notifications';
import type { TimeOffRequest } from '@/types/database';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Filter, Plus, LayoutGrid } from 'lucide-react';

interface DashboardStats {
  totalClients: number;
  activeProjects: number;
  totalTasks: number;
  todoTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
}

interface TeamMemberStats {
  id: string;
  full_name: string;
  role: string;
  total: number;
  completed: number;
  in_progress: number;
}

export default function DashboardPage() {
  const { profile, isLoading: authLoading, retryLoadProfile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0, activeProjects: 0, totalTasks: 0, todoTasks: 0,
    completedTasks: 0, inProgressTasks: 0, overdueTasks: 0,
  });
  const [teamStats, setTeamStats] = useState<TeamMemberStats[]>([]);
  const [recentTasks, setRecentTasks] = useState<Array<{
    id: string; title: string; status: string; priority: string;
    project: { name: string; color: string } | null;
    assignee: { full_name: string } | null;
    deadline: string | null;
  }>>([]);
  const [urgentTasks, setUrgentTasks] = useState<Array<{
    id: string; title: string; deadline: string;
    project: { name: string; color: string } | null;
    assignee: { full_name: string } | null;
  }>>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [projectProgress, setProjectProgress] = useState<Array<{
    id: string; name: string; color: string;
    tasks: { id: string; status: string }[];
  }>>([]);
  const [cashflow, setCashflow] = useState({ expected: 0, received: 0, pending: 0 });
  const [activities, setActivities] = useState<Array<{
    id: string; action: string; entity_type: string; entity_name: string | null;
    created_at: string; user: { full_name: string } | null;
  }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [teamAttendance, setTeamAttendance] = useState<Array<{
    user_id: string; full_name: string; status: string;
  }>>([]);
  const [dueTodayCount, setDueTodayCount] = useState(0);
  const [pendingTimeOff, setPendingTimeOff] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // ── Disposizione dei riquadri ─────────────────────────────────────────
  //
  // Si legge dal profilo, che e' gia' in memoria: nessuna query in piu' per
  // aprire la pagina. `normalizza` ripulisce quello che arriva — un riquadro
  // tolto dal codice, uno aggiunto dopo l'ultimo salvataggio, un ruolo
  // cambiato — cosi' una disposizione vecchia non lascia buchi ne' nasconde
  // per sempre i riquadri nuovi.
  const [modifica, setModifica] = useState(false);
  // Com'era prima di iniziare a spostare. Il salvataggio è automatico, quindi
  // senza questa fotografia "ripristina" non avrebbe niente a cui tornare:
  // l'ultima versione salvata sarebbe sempre quella che si ha sotto gli occhi.
  const [istantanea, setIstantanea] = useState<{ posti: PostoRiquadro[]; spenti: string[] } | null>(null);
  const [disposizione, setDisposizione] = useState<PostoRiquadro[]>([]);
  const [spenti, setSpenti] = useState<string[]>([]);

  // Il profilo NON c'e' al primo render: arriva dopo, da useAuth. Leggerlo
  // solo nell'inizializzatore di useState voleva dire partire sempre dalla
  // disposizione predefinita e non ricaricare mai quella salvata — la
  // funzione sarebbe sembrata semplicemente rotta.
  const profiloLetto = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || profiloLetto.current === profile.id) return;
    profiloLetto.current = profile.id;
    const d = normalizza(profile.dashboard_layout, profile.role);
    setDisposizione(d.riquadri);
    setSpenti(d.spenti);
  }, [profile]);

  const isAdmin = profile?.role === 'admin';

  const fetchDashboardData = useCallback(async () => {
    if (!profile) return;
    setError(false);

    try {
      const now = new Date();
      const todayStr = todayLocal();
      const tomorrowStr = formatDateLocal(new Date(now.getTime() + 86400000));
      const currentMonth = todayStr.slice(0, 7);

      // Le task si leggono UNA volta sola.
      //
      // Prima erano cinque letture: gli id delle proprie (task_assignees), poi
      // le statistiche, le mie recenti, le urgenti e il carico del team — tutte
      // sulla stessa tabella. E la prima bloccava le altre, perché serviva a
      // filtrarle: un gradino di attesa in cima a ogni apertura della pagina.
      //
      // Ora una lettura sola con gli assegnatari dentro, e le quattro viste si
      // ricavano qui. Sono le stesse righe, filtrate in memoria invece che
      // quattro volte in rete.

      // Build all queries
      const queries: Promise<unknown>[] = [
        // clienti attivi (solo il conteggio)
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
        // progetti attivi (solo il conteggio)
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        // Tutte le task non archiviate, una volta sola: da qui si ricavano
        // statistiche, "le mie", le urgenti e il carico del team.
        supabase.from('tasks').select(`
          id, title, status, priority, deadline, assigned_to, updated_at,
          project:projects(name, color),
          assignee:profiles!tasks_assigned_to_fkey(full_name),
          task_assignees(user_id)
        `).is('archived_at', null).order('updated_at', { ascending: false }).limit(300),
        // la mia timbratura di oggi
        supabase.from('attendance_records').select('*').eq('user_id', profile.id).eq('date', todayStr).maybeSingle(),
        // avanzamento dei progetti
        supabase.from('projects').select('id, name, color, tasks(id, status)').eq('status', 'active').limit(5),
        // registro attivita
        supabase.from('activity_log').select(`
          id, action, entity_type, entity_name, created_at,
          user:profiles!activity_log_user_id_fkey(full_name)
        `).order('created_at', { ascending: false }).limit(10),
        // notifiche non lette (conteggio)
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).eq('is_read', false),
      ];

      // Admin-only queries
      if (isAdmin) {
        queries.push(
          // il team
          supabase.from('profiles').select('id, full_name, role').eq('is_active', true),
          // incassi del mese, solo contratti attivi
          (() => {
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            return supabase.from('client_payments').select('amount, is_paid, contract:client_contracts!client_payments_contract_id_fkey(status)').eq('is_suspended', false).gte('due_date', `${currentMonth}-01`).lte('due_date', `${currentMonth}-${lastDay}`);
          })(),
          // presenze del team
          supabase.rpc('get_team_attendance_today'),
          // richieste ferie da approvare
          supabase.from('time_off_requests')
            .select('*, user:profiles!time_off_requests_user_id_fkey(id, full_name, color)')
            .eq('status', 'pending')
            .order('start_date', { ascending: true })
            .limit(20),
          // 14: acconti dei lavori one-shot. In coda per non spostare gli
          // indici già in uso. Si scaricano tutti perché la data con cui
          // contano è calcolata (incasso se c'è, altrimenti scadenza).
          supabase.from('client_installments').select(COLONNE_ACCONTO).limit(2000),
          // 15: lavori extra fuori canone, fatturato atteso in più.
          supabase.from('client_extras').select(COLONNE_EXTRA).limit(2000),
        );
      }

      const results = await Promise.all(queries) as Array<{ data?: unknown; count?: number }>;

      // Nomi, non posizioni. Prima si leggeva results[11], results[14]…: bastava
      // aggiungere o togliere una query perche' ogni indice successivo puntasse
      // al dato sbagliato — e senza errori, solo numeri sbagliati nei riquadri.
      // Questa riga e' l'unico punto che deve restare allineato all'array.
      const [
        rClienti, rProgetti, rTask, rTimbratura, rAvanzamento, rAttivita, rNotifiche,
        rTeam, rIncassi, rPresenze, rFerie, rAcconti, rExtra,
      ] = results;

      // Le quattro viste, ricavate dall'unica lettura.
      //
      // Attenzione al filtro per persona: prima era il database a fare
      // `.in('id', mieId)` per chi non e' admin, quindi statistiche e urgenti
      // contavano solo le proprie. Qui si ottiene lo stesso, in memoria.
      type TaskRiga = {
        id: string; title: string; status: string; priority: string | null;
        deadline: string | null; assigned_to: string | null; updated_at: string;
        task_assignees?: { user_id: string }[] | null;
      };
      const tutteLeTask = (rTask.data as TaskRiga[]) || [];
      const eMia = (t: TaskRiga) => {
        const righe = t.task_assignees ?? [];
        // Fallback su assigned_to per le task vecchie, prima del
        // multi-assegnatario: senza, sparirebbero da "Le mie".
        return righe.length > 0
          ? righe.some((r) => r.user_id === profile.id)
          : t.assigned_to === profile.id;
      };
      const mieTask = tutteLeTask.filter(eMia);

      const allTasks = isAdmin ? tutteLeTask : mieTask;
      const dueToday = allTasks.filter((t) => t.deadline && t.deadline >= todayStr && t.deadline < tomorrowStr && t.status !== 'done').length;
      setDueTodayCount(dueToday);

      setStats({
        totalClients: rClienti.count || 0,
        activeProjects: rProgetti.count || 0,
        totalTasks: allTasks.length,
        // Solo 'todo': la card linka a /tasks?status=todo, quindi contare anche
        // le 'review' faceva sparire task dalla lista rispetto al numero.
        todoTasks: allTasks.filter((t) => t.status === 'todo').length,
        completedTasks: allTasks.filter((t) => t.status === 'done').length,
        inProgressTasks: allTasks.filter((t) => t.status === 'in_progress').length,
        // In ritardo = deadline STRETTAMENTE precedente a oggi (le scadenze di oggi
        // contano in dueToday, non in overdue). Confronto date-only: t.deadline è
        // 'YYYY-MM-DD', usare nowIso (timestamp) marcava per errore le scadenze di
        // oggi come già scadute.
        overdueTasks: allTasks.filter((t) => t.deadline && t.deadline < todayStr && t.status !== 'done').length,
      });

      // Le mie, le piu' fresche: la lettura arriva gia' ordinata per
      // updated_at, quindi qui basta filtrare e tagliare.
      setRecentTasks(mieTask.filter((t) => t.status !== 'done').slice(0, 8) as unknown as typeof recentTasks);

      // Urgenti = da fare con scadenza entro domani, la piu' vicina in cima.
      setUrgentTasks(
        allTasks
          .filter((t) => t.status !== 'done' && t.deadline && t.deadline <= tomorrowStr)
          .sort((a, b) => (a.deadline as string).localeCompare(b.deadline as string))
          .slice(0, 10) as unknown as typeof urgentTasks,
      );
      setAttendance((rTimbratura.data as AttendanceRecord | null));
      setProjectProgress((rAvanzamento.data as typeof projectProgress) || []);
      setActivities((rAttivita.data as typeof activities) || []);
      setUnreadCount(rNotifiche.count || 0);

      // Admin data
      if (isAdmin && rTeam) {
        const profiles = (rTeam.data as Array<{ id: string; full_name: string; role: string }>) || [];
        // Il carico del team esce dalle stesse righe gia' lette.
        const taskData = tutteLeTask as Array<{ assigned_to: string | null; status: string }>;

        const tasksByUser = new Map<string, { total: number; completed: number; in_progress: number }>();
        taskData.forEach((t) => {
          if (!t.assigned_to) return;
          const s = tasksByUser.get(t.assigned_to) || { total: 0, completed: 0, in_progress: 0 };
          s.total++;
          if (t.status === 'done') s.completed++;
          if (t.status === 'in_progress') s.in_progress++;
          tasksByUser.set(t.assigned_to, s);
        });
        setTeamStats(profiles.map((p) => {
          const s = tasksByUser.get(p.id) || { total: 0, completed: 0, in_progress: 0 };
          return { id: p.id, full_name: p.full_name, role: p.role, ...s };
        }));

        const allPayments = (rIncassi.data as Array<{ amount: number; is_paid: boolean; contract: { status: string } | null }>) || [];
        const payments = allPayments.filter((p) => p.contract?.status === 'active');
        // Acconti incassati nel mese: soldi entrati davvero, quindi vanno
        // nell'incassato. Non nell'atteso — quello resta il canone, e le rate
        // che l'acconto copre sono già lì.
        const ultimoGiorno = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const acconti = totaliAcconti(accontiNelPeriodo(
          (rAcconti?.data as AccontoContabile[]) || [],
          `${currentMonth}-01`,
          `${currentMonth}-${ultimoGiorno}`,
        ));
        // Lavori extra del mese: fatturato atteso in più, mai incassato — i
        // soldi che arrivano si registrano come acconto, già contato sopra.
        const extra = totaleExtra(extraNelPeriodo(
          (rExtra?.data as ExtraContabile[]) || [],
          `${currentMonth}-01`,
          `${currentMonth}-${ultimoGiorno}`,
        ));
        setCashflow({
          expected: payments.reduce((sum, p) => sum + Number(p.amount), 0) + extra,
          received: payments.filter((p) => p.is_paid).reduce((sum, p) => sum + Number(p.amount), 0) + acconti.received,
          pending: payments.filter((p) => !p.is_paid).reduce((sum, p) => sum + Number(p.amount), 0) + extra,
        });

        setTeamAttendance((rPresenze.data as typeof teamAttendance) || []);
        setPendingTimeOff((rFerie?.data as TimeOffRequest[]) || []);
      }
    } catch (err) {
      reportUnknown(err, 'client', { op: 'dashboard-carica' });
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Il salvataggio aspetta un attimo: trascinando un riquadro la griglia
  // annuncia decine di posizioni intermedie, e scriverle tutte sul database
  // vorrebbe dire una richiesta ogni pochi pixel.
  const timerSalvataggio = useRef<NodeJS.Timeout | null>(null);
  const scriviSulProfilo = useCallback((posti: PostoRiquadro[], nascosti: string[]) => {
    if (!profile) return;
    if (timerSalvataggio.current) clearTimeout(timerSalvataggio.current);
    timerSalvataggio.current = setTimeout(() => {
      void supabase
        .from('profiles')
        .update({ dashboard_layout: { riquadri: posti, spenti: nascosti } })
        .eq('id', profile.id)
        .then(({ error: err }) => {
          // Non blocca: la disposizione a schermo e' gia' quella giusta, qui
          // si perde solo il ricordo. Ma va detto, altrimenti la prossima
          // apertura sembra averla dimenticata senza motivo.
          if (err) {
            reportSupabaseError(err, 'dashboard-salva-disposizione');
            toast.error('Non sono riuscito a ricordare la disposizione');
          }
        });
    }, 700);
  }, [profile, supabase, toast]);

  useEffect(() => () => {
    if (timerSalvataggio.current) clearTimeout(timerSalvataggio.current);
  }, []);

  const salvaDisposizione = useCallback((posti: PostoRiquadro[]) => {
    setDisposizione(posti);
    scriviSulProfilo(posti, spenti);
  }, [scriviSulProfilo, spenti]);

  const spegniRiquadro = useCallback((id: string) => {
    const posti = disposizione.filter((p) => p.i !== id);
    const nascosti = spenti.includes(id) ? spenti : [...spenti, id];
    setDisposizione(posti);
    setSpenti(nascosti);
    scriviSulProfilo(posti, nascosti);
  }, [disposizione, spenti, scriviSulProfilo]);

  const accendiRiquadro = useCallback((id: string) => {
    const meta = riquadroPerId(id);
    if (!meta) return;
    // Torna in fondo, non dove stava prima: se lo si e' tolto e rimesso, il
    // posto di prima potrebbe essere occupato da qualcos'altro.
    const fondo = disposizione.reduce((max, p) => Math.max(max, p.y + p.h), 0);
    const posti = [...disposizione, { i: id, x: 0, y: fondo, w: meta.w, h: meta.h }];
    const nascosti = spenti.filter((s) => s !== id);
    setDisposizione(posti);
    setSpenti(nascosti);
    scriviSulProfilo(posti, nascosti);
  }, [disposizione, spenti, scriviSulProfilo]);

  /** Torna a com'era quando si è entrati in "Personalizza". */
  const ripristinaDisposizione = useCallback(() => {
    if (!istantanea) return;
    setDisposizione(istantanea.posti);
    setSpenti(istantanea.spenti);
    scriviSulProfilo(istantanea.posti, istantanea.spenti);
  }, [istantanea, scriviSulProfilo]);

  /** Torna alla disposizione di fabbrica, quella di chi non ha mai toccato niente. */
  const tornaAllaPredefinita = useCallback(() => {
    const posti = disposizionePredefinita(profile?.role);
    setDisposizione(posti);
    setSpenti([]);
    scriviSulProfilo(posti, []);
  }, [profile?.role, scriviSulProfilo]);

  const cambiaModifica = useCallback(() => {
    setModifica((attiva) => {
      // Entrando si scatta la fotografia, uscendo la si butta: tenerla
      // farebbe tornare, la volta dopo, a uno stato di ore prima.
      if (!attiva) setIstantanea({ posti: disposizione, spenti });
      else setIstantanea(null);
      return !attiva;
    });
  }, [disposizione, spenti]);

  // Realtime: la dashboard si aggiorna da sé quando cambiano task, pagamenti o
  // chat.
  //
  // Le sottoscrizioni NON sono filtrate per utente: una singola modifica fatta
  // da chiunque in azienda fa ricaricare tutte e ~15 le query su OGNI dashboard
  // aperta. Senza le due guardie qui sotto il costo si moltiplica per il numero
  // di schede lasciate aperte tutto il giorno (era la prima fonte di traffico
  // dell'app: ~600 GET tasks/giorno dalla sola dashboard).
  useEffect(() => {
    if (!profile) return;

    let debounceTimer: NodeJS.Timeout;
    // Un aggiornamento maturato a tab nascosto non si perde: viene eseguito al
    // ritorno sulla scheda, cioè quando l'utente può davvero vederlo.
    let missedWhileHidden = false;

    const runFetch = () => {
      if (document.visibilityState !== 'visible') { missedWhileHidden = true; return; }
      missedWhileHidden = false;
      fetchDashboardData();
    };

    const debouncedFetch = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runFetch, 10_000);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && missedWhileHidden) runFetch();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_payments' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_installments' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, debouncedFetch)
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [profile, fetchDashboardData]);

  // Attendance actions
  const handleAttendanceAction = async (action: 'clock_in' | 'lunch_break' | 'clock_out') => {
    if (!profile) return;
    setAttendanceLoading(true);
    try {
      const todayStr = todayLocal();
      const nowTime = new Date().toISOString();

      if (action === 'clock_in') {
        if (attendance?.status === 'lunch_break') {
          const { error } = await supabase.from('attendance_records').update({ status: 'working', lunch_end: nowTime }).eq('id', attendance.id);
          if (error) throw error;
        } else {
          const geo = await captureGeoStamp();
          const { error } = await supabase.from('attendance_records').insert({ user_id: profile.id, date: todayStr, clock_in: nowTime, status: 'working', clock_in_geo: geo });
          if (error) throw error;
        }
        toast.success(attendance?.status === 'lunch_break' ? 'Bentornato!' : 'Entrata registrata');
      } else if (action === 'lunch_break') {
        if (attendance) {
          // Stessa regola di /presenze: una sola pausa al giorno. Senza questo
          // controllo la seconda pausa sovrascrive lunch_start lasciando il
          // vecchio lunch_end, e a fine giornata la durata pranzo risulta
          // negativa → ore lavorate gonfiate.
          if (attendance.lunch_start) {
            toast.error('Pausa pranzo già registrata oggi');
            return;
          }
          const { error } = await supabase.from('attendance_records').update({ status: 'lunch_break', lunch_start: nowTime }).eq('id', attendance.id);
          if (error) throw error;
          toast.success('Buon pranzo!');
        }
      } else if (action === 'clock_out') {
        if (attendance) {
          const clockIn = new Date(attendance.clock_in!);
          let lunchDurationMs = 0;
          if (attendance.lunch_start && attendance.lunch_end) {
            lunchDurationMs = new Date(attendance.lunch_end).getTime() - new Date(attendance.lunch_start).getTime();
          } else if (attendance.lunch_start && !attendance.lunch_end) {
            lunchDurationMs = Date.now() - new Date(attendance.lunch_start).getTime();
          }
          const totalHours = (Date.now() - clockIn.getTime() - lunchDurationMs) / 3600000;
          const geo = await captureGeoStamp();
          const { error } = await supabase.from('attendance_records').update({ status: 'completed', clock_out: nowTime, total_hours: Math.round(totalHours * 100) / 100, clock_out_geo: geo }).eq('id', attendance.id);
          if (error) throw error;
          toast.success('Uscita registrata. Buona serata!');
        }
      }
      // Refresh attendance
      const { data } = await supabase.from('attendance_records').select('*').eq('user_id', profile.id).eq('date', todayStr).maybeSingle();
      setAttendance(data as AttendanceRecord | null);
    } catch (err) {
      reportUnknown(err, 'client', { op: 'dashboard-attendance' });
      toast.error('Errore nella registrazione');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleApproveTimeOff = async (id: string) => {
    if (!profile) return;
    const req = pendingTimeOff.find(r => r.id === id);
    try {
      const { error } = await supabase.from('time_off_requests')
        .update({ status: 'approved', reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast.success('Richiesta approvata');
      if (req) {
        try { await notifyTimeOffDecision(supabase, req, 'approved', null, profile.id); }
        catch (n) { reportUnknown(n, 'client', { op: 'dashboard-notifica-ferie-approva', requestId: id }); toast.error('Notifica al dipendente fallita: ' + (n as { message?: string })?.message); }
      }
      fetchDashboardData();
    } catch (e) {
      reportUnknown(e, 'client', { op: 'dashboard-approva-ferie', requestId: id });
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante l\'approvazione');
    }
  };

  const handleRejectTimeOff = async (id: string) => {
    if (!profile) return;
    const req = pendingTimeOff.find(r => r.id === id);
    try {
      const { error } = await supabase.from('time_off_requests')
        .update({ status: 'rejected', reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast.success('Richiesta rifiutata');
      if (req) {
        try { await notifyTimeOffDecision(supabase, req, 'rejected', null, profile.id); }
        catch (n) { reportUnknown(n, 'client', { op: 'dashboard-notifica-ferie-rifiuta', requestId: id }); toast.error('Notifica al dipendente fallita: ' + (n as { message?: string })?.message); }
      }
      fetchDashboardData();
    } catch (e) {
      reportUnknown(e, 'client', { op: 'dashboard-rifiuta-ferie', requestId: id });
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante il rifiuto');
    }
  };

  if (loading || authLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Greeting skeleton */}
        <div className="h-8 w-64 bg-pw-surface-2 rounded-xl" />
        <div className="h-4 w-48 bg-pw-surface-2 rounded-lg" />
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-pw-surface-2 rounded-2xl" />
          ))}
        </div>
        {/* Content skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 bg-pw-surface-2 rounded-2xl" />
          <div className="h-64 bg-pw-surface-2 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-pw-danger" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <p className="text-pw-text-muted max-w-md text-sm">Non è stato possibile caricare i dati. Riprova.</p>
        <button onClick={() => { setLoading(true); fetchDashboardData(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors duration-200 ease-out">Riprova</button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-yellow-500" />
        <h2 className="text-xl font-semibold text-pw-text">Profilo non trovato</h2>
        <p className="text-pw-text-muted max-w-md text-sm">Il tuo profilo non è stato ancora configurato.</p>
        <button onClick={retryLoadProfile} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors duration-200 ease-out">Riprova</button>
      </div>
    );
  }

  const firstName = profile.full_name.split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 13 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const dateLabel = new Date().toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const subtitleParts: React.ReactNode[] = [];
  if (stats.overdueTasks > 0) subtitleParts.push(<><strong className="text-pw-text font-semibold">{stats.overdueTasks}</strong> in ritardo</>);
  if (dueTodayCount > 0) subtitleParts.push(<><strong className="text-pw-text font-semibold">{dueTodayCount}</strong> in scadenza oggi</>);
  if (stats.inProgressTasks > 0) subtitleParts.push(<><strong className="text-pw-text font-semibold">{stats.inProgressTasks}</strong> in corso</>);
  const subtitle = subtitleParts.length > 0 ? (
    <>{subtitleParts.map((p, i) => <span key={i}>{i > 0 && ' · '}{p}</span>)}</>
  ) : 'Tutto sotto controllo';


  // ── I riquadri della dashboard ────────────────────────────────────────
  //
  // Qui c'e' solo il CONTENUTO, costruito dove i dati sono gia' in memoria.
  // Dove va ognuno, quanto e' grande e chi lo vede sta in riquadri-config.ts,
  // che e' letto anche dalla griglia e dal pannello "aggiungi": una lista
  // sola, altrimenti se ne aggiunge uno e non compare da qualche parte.
  const contenuti: Record<string, React.ReactNode> = {
    timbratura: (
      <AttendanceWidget
        record={attendance}
        loading={attendanceLoading}
        onClockIn={() => handleAttendanceAction('clock_in')}
        onLunchBreak={() => handleAttendanceAction('lunch_break')}
        onClockOut={() => handleAttendanceAction('clock_out')}
      />
    ),
    numeri: <StatCards stats={stats} isAdmin={isAdmin} />,
    urgenti: <UrgentTasks tasks={urgentTasks} isAdmin={isAdmin} />,
    'mie-task': (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-pw-text font-[var(--font-syne)]">
              Le mie task
            </h2>
            <Link href="/tasks" className="text-xs text-pw-accent hover:underline">Tutte</Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentTasks.length === 0 ? (
            <p className="p-6 text-sm text-pw-text-muted text-center">Nessuna attività in sospeso</p>
          ) : (
            <div className="divide-y divide-pw-border">
              {recentTasks.map((task) => (
                <Link
                  key={task.id}
                  href="/tasks"
                  className="px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 hover:bg-pw-surface-2 transition-colors duration-200 ease-out group cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {task.project && (
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: task.project.color }} />
                      )}
                      <p className="text-sm font-medium text-pw-text truncate">{task.title}</p>
                    </div>
                    <p className="text-xs text-pw-text-muted mt-0.5">
                      {task.project?.name}
                      {task.assignee && ` · ${task.assignee.full_name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Badge tone={getStatusTone(task.status)} dot size="sm">{STATUS_LABELS[task.status]}</Badge>
                    <Badge tone={getPriorityTone(task.priority)} size="sm">{PRIORITY_LABELS[task.priority]}</Badge>
                    {task.deadline && (
                      <span className="text-xs text-pw-text-dim flex items-center gap-1">
                        <Calendar size={11} />
                        {formatDate(task.deadline)}
                      </span>
                    )}
                    <ChevronRight size={14} className="text-pw-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    ),
    progetti: <ProjectProgress projects={projectProgress} />,
    attivita: <ActivityFeed activities={activities} />,
  };

  // I riquadri legati a un mestiere si aggiungono solo a chi li puo' vedere:
  // la griglia disegna quello che trova qui dentro, quindi un riquadro
  // assente non compare nemmeno per sbaglio.
  if (isAdmin || profile.role === 'social_media_manager') {
    contenuti.ped = <PedDeadlines />;
  }
  if (isAdmin) {
    contenuti.rinnovi = <WebsiteRenewals />;
    contenuti.ferie = (
      <TimeOffInbox
        requests={pendingTimeOff}
        onApprove={handleApproveTimeOff}
        onReject={handleRejectTimeOff}
      />
    );
    contenuti['presenze-team'] = <TeamAttendance team={teamAttendance} />;
    contenuti.assenti = <AbsentToday />;
    contenuti.team = (
      <Card>
        <CardHeader>
          {/* Niente piegatura: in un riquadro che si puo' gia' rimpicciolire
              o togliere, un secondo modo per nasconderlo era solo un clic in
              piu' fra te e il dato. */}
          <div className="flex items-center gap-2">
            <Users size={16} className="text-pw-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-pw-text">Carico del team</h2>
            <span className="text-[11px] text-pw-text-dim font-medium tabular-nums">
              {teamStats.length}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-pw-border">
              {teamStats.map((member) => (
                <div key={member.id} className="px-6 py-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-pw-accent flex items-center justify-center">
                      <span className="text-[#0A263A] text-xs font-bold">{getInitials(member.full_name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-pw-text truncate">{member.full_name}</p>
                      <Badge tone={getRoleTone(member.role)} size="sm">{getRoleLabel(member.role)}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-pw-text-muted ml-11">
                    <span>{member.total} assegnate</span>
                    <span className="text-pw-success">{member.completed} completate</span>
                    <span className="text-pw-warning">{member.in_progress} in corso</span>
                  </div>
                  {member.total > 0 && (
                    <div className="ml-11 mt-1.5 h-1.5 bg-pw-surface-3 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all duration-200 ease-out progress-animated" style={{ width: `${(member.completed / member.total) * 100}%` }} />
                    </div>
                  )}
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Saluto — hero card su mobile (navy + oro, brand) */}
      <div className="lg:hidden relative overflow-hidden rounded-2xl bg-[var(--pw-navy)] p-5 text-white">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[var(--pw-gold)]/10" aria-hidden="true" />
        <div className="absolute -right-2 top-10 h-16 w-16 rounded-full bg-[var(--pw-gold)]/5" aria-hidden="true" />
        <p className="relative text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--pw-gold)]">
          {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        </p>
        <h1 className="relative mt-1 text-2xl font-bold leading-tight">{greeting}, {firstName}</h1>
        <p className="relative mt-1.5 text-sm text-white/75">{subtitle}</p>
      </div>

      {/* Header classico — desktop */}
      <div className="hidden lg:block">
        <PageHeader
          eyebrow={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
          title={`${greeting}, ${firstName}`}
          subtitle={subtitle}
          actions={
            <>
              {isAdmin ? (
                <Link href="/projects">
                  <Button variant="primary" size="md">
                    <Plus size={14} />
                    Nuovo progetto
                  </Button>
                </Link>
              ) : (
                <Link href="/tasks">
                  <Button variant="primary" size="md">
                    <Plus size={14} />
                    Nuova Task
                  </Button>
                </Link>
              )}
            </>
          }
        />
      </div>

      {/* Scorciatoie a tile — solo mobile */}
      <QuickActions />

      {/* Barra "Personalizza": compare solo da computer, perche' solo li' si
          puo' trascinare. Da telefono i riquadri restano incolonnati. */}
      <div className="hidden lg:flex items-center justify-end gap-2">
        {modifica && spenti.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mr-auto">
            <span className="text-xs text-pw-text-muted">Rimetti:</span>
            {spenti.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => accendiRiquadro(id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-pw-border text-xs text-pw-text-muted hover:border-pw-accent/50 hover:text-pw-text transition-colors"
              >
                <Plus size={12} aria-hidden="true" />
                {riquadroPerId(id)?.titolo ?? id}
              </button>
            ))}
          </div>
        )}
        {modifica && (
          <>
            <Button variant="ghost" size="sm" onClick={tornaAllaPredefinita}>
              Disposizione iniziale
            </Button>
            <Button variant="ghost" size="sm" onClick={ripristinaDisposizione}>
              Ripristina
            </Button>
          </>
        )}
        <Button
          variant={modifica ? 'primary' : 'outline'}
          size="sm"
          onClick={cambiaModifica}
        >
          <LayoutGrid size={14} aria-hidden="true" />
          {modifica ? 'Fatto' : 'Personalizza'}
        </Button>
      </div>

      <GrigliaDashboard
        contenuti={contenuti}
        disposizione={disposizione}
        modifica={modifica}
        onCambia={salvaDisposizione}
        onSpegni={spegniRiquadro}
      />
    </div>
  );
}
