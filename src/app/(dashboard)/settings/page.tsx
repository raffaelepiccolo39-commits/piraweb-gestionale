'use client';


import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { getRoleLabel, getRoleColor, getInitials, formatCurrency } from '@/lib/utils';
import type { Profile } from '@/types/database';
import { Settings, Users, Shield, Save, UserPlus, Eye, EyeOff, Pencil, Lock, ArrowRightLeft, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'social_media_manager', label: 'Social Media Manager' },
  { value: 'content_creator', label: 'Content Creator' },
  { value: 'graphic_social', label: 'Graphic Social' },
  { value: 'graphic_brand', label: 'Graphic Brand' },
];

const createRoleOptions = [
  { value: 'admin', label: 'Amministratore' },
  { value: 'social_media_manager', label: 'Dipendente - Social Media Manager' },
  { value: 'content_creator', label: 'Dipendente - Content Creator' },
  { value: 'graphic_social', label: 'Dipendente - Graphic Social' },
  { value: 'graphic_brand', label: 'Dipendente - Graphic Brand' },
];

export default function SettingsPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    email: '',
  });

  // Create user modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'content_creator',
    salary: '',
    iban: '',
    contract_type: '',
    contract_start_date: new Date().toISOString().split('T')[0],
  });

  // View/Edit employee modal state
  const [viewingMember, setViewingMember] = useState<Profile | null>(null);
  const [editingMember, setEditingMember] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({
    salary: '',
    iban: '',
    color: '',
    contract_type: '',
    contract_start_date: '',
  });
  const [editLoading, setEditLoading] = useState(false);

  // Password change
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Reassign tasks
  const [showReassign, setShowReassign] = useState(false);
  const [reassignFrom, setReassignFrom] = useState<Profile | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [reassignLoading, setReassignLoading] = useState(false);

  const toast = useToast();

  const handleChangePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('Le password non corrispondono');
      return;
    }
    setPasswordLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: passwordForm.current_password, new_password: passwordForm.new_password }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Password aggiornata con successo');
        setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      } else {
        toast.error(data.error || 'Errore nel cambio password');
      }
    } catch {
      toast.error('Errore di connessione');
    }
    setPasswordLoading(false);
  };

  const handleReassignTasks = async () => {
    if (!reassignFrom || !reassignTo) return;
    setReassignLoading(true);
    try {
      const res = await fetch('/api/admin/reassign-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_user_id: reassignFrom.id, to_user_id: reassignTo }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.reassigned} task riassegnate con successo`);
        setShowReassign(false);
        setReassignFrom(null);
        setReassignTo('');
      } else {
        toast.error(data.error || 'Errore nella riassegnazione');
      }
    } catch {
      toast.error('Errore di connessione');
    }
    setReassignLoading(false);
  };

  const fetchTeam = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name');
    if (data) setTeamMembers(data as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name,
        email: profile.email,
      });
    }
    fetchTeam();
  }, [profile, fetchTeam]);

  const handleUpdateProfile = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: profileForm.full_name })
      .eq('id', profile.id);
    if (error) {
      toast.error('Errore nel salvataggio del profilo');
    } else {
      toast.success('Profilo aggiornato');
    }
    setSaving(false);
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch('/api/admin/update-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_role', user_id: userId, role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Errore aggiornamento ruolo');
        return;
      }
    } catch {
      toast.error('Errore di connessione');
      return;
    }
    fetchTeam();
  };

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      const res = await fetch('/api/admin/update-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_active', user_id: userId, is_active: isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Errore aggiornamento stato');
        return;
      }
    } catch {
      toast.error('Errore di connessione');
      return;
    }
    fetchTeam();
  };

  const handleCreateUser = async () => {
    setCreateLoading(true);
    setCreateError(null);
    setCreateSuccess(false);

    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setCreateError(data.error);
      } else {
        setCreateSuccess(true);
        setCreateForm({ full_name: '', email: '', password: '', role: 'content_creator', salary: '', iban: '', contract_type: '', contract_start_date: new Date().toISOString().split('T')[0] });
        fetchTeam();
        setTimeout(() => {
          setShowCreateModal(false);
          setCreateSuccess(false);
        }, 1500);
      }
    } catch {
      setCreateError('Errore di connessione');
    } finally {
      setCreateLoading(false);
    }
  };

  const openEditMember = (member: Profile) => {
    setViewingMember(null);
    setEditingMember(member);
    setEditForm({
      salary: member.salary ? String(member.salary) : '',
      iban: member.iban || '',
      color: member.color || '#8c7af5',
      contract_type: member.contract_type || '',
      contract_start_date: member.contract_start_date || '',
    });
  };

  const handleSaveEmployee = async () => {
    if (!editingMember) return;
    setEditLoading(true);
    try {
      const res = await fetch('/api/admin/update-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_employee',
          user_id: editingMember.id,
          salary: editForm.salary || null,
          iban: editForm.iban || null,
          color: editForm.color || null,
          contract_type: editForm.contract_type || null,
          contract_start_date: editForm.contract_start_date || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Errore salvataggio dipendente');
      }
    } catch {
      toast.error('Errore di connessione');
    }
    setEditLoading(false);
    setEditingMember(null);
    fetchTeam();
  };

  const openCreateModal = () => {
    setCreateForm({ full_name: '', email: '', password: '', role: 'content_creator', salary: '', iban: '', contract_type: '', contract_start_date: new Date().toISOString().split('T')[0] });
    setCreateError(null);
    setCreateSuccess(false);
    setShowPassword(false);
    setShowCreateModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
          Impostazioni
        </h1>
      </div>

      {/* Profile settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings size={20} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-pw-text">
              Il tuo Profilo
            </h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="profile-name"
              label="Nome completo"
              value={profileForm.full_name}
              onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
            />
            <Input
              id="profile-email"
              label="Email"
              value={profileForm.email}
              disabled
            />
          </div>
          <div className="flex items-center gap-3">
            <Badge className={getRoleColor(profile?.role || '')}>
              {getRoleLabel(profile?.role || '')}
            </Badge>
          </div>
          <Button onClick={handleUpdateProfile} loading={saving}>
            <Save size={16} />
            Salva Profilo
          </Button>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock size={20} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-pw-text">Cambia Password</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            id="current-password"
            label="Password Attuale"
            type="password"
            value={passwordForm.current_password}
            onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
            placeholder="Inserisci la password attuale"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-pw-text-muted mb-1">
                Nuova Password <span className="text-xs text-gray-400">(min. 8 caratteri)</span>
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  placeholder="Nuova password"
                  className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <Input
              id="confirm-password"
              label="Conferma Password"
              type="password"
              value={passwordForm.confirm_password}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
              placeholder="Ripeti password"
            />
          </div>
          <Button
            onClick={handleChangePassword}
            loading={passwordLoading}
            disabled={!passwordForm.current_password || !passwordForm.new_password || passwordForm.new_password.length < 8 || passwordForm.new_password !== passwordForm.confirm_password}
          >
            <Lock size={16} />
            Aggiorna Password
          </Button>
        </CardContent>
      </Card>

      {/* Team management (admin only) */}
      {profile?.role === 'admin' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={20} className="text-gray-400" />
                <h2 className="text-lg font-semibold text-pw-text">
                  Gestione Team
                </h2>
              </div>
              <Button onClick={openCreateModal}>
                <UserPlus size={16} />
                Nuovo Utente
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-pw-border">
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="px-6 py-4 flex items-center gap-4 cursor-pointer hover:bg-pw-surface-2/50 transition-colors"
                  onClick={() => member.id !== profile.id ? setViewingMember(member) : undefined}
                >
                  <div className="w-10 h-10 rounded-full bg-pw-accent flex items-center justify-center shrink-0">
                    <span className="text-white text-sm font-semibold">
                      {getInitials(member.full_name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-pw-text">
                      {member.full_name}
                    </p>
                    <p className="text-xs text-pw-text-muted">
                      {getRoleLabel(member.role)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleActive(member.id, member.is_active); }}
                      disabled={member.id === profile.id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        member.is_active
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-pw-surface-3 text-pw-text-dim'
                      } disabled:opacity-50`}
                    >
                      {member.is_active ? 'Attivo' : 'Disattivato'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create user modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Nuovo Utente"
      >
        <div className="space-y-4">
          {createSuccess && (
            <div className="p-3 rounded-lg bg-green-500/10 text-green-400 text-sm font-medium">
              Utente creato con successo!
            </div>
          )}
          {createError && (
            <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
              {createError}
            </div>
          )}
          <Input
            id="create-name"
            label="Nome completo *"
            value={createForm.full_name}
            onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
            placeholder="es. Mario Rossi"
          />
          <Input
            id="create-email"
            label="Email *"
            type="email"
            value={createForm.email}
            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            placeholder="es. mario@piraweb.it"
          />
          <div>
            <label htmlFor="create-password" className="block text-sm font-medium text-pw-text-muted mb-1">
              Password * <span className="text-xs text-gray-400">(min. 8 caratteri)</span>
            </label>
            <div className="relative">
              <input
                id="create-password"
                type={showPassword ? 'text' : 'password'}
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="Inserisci password"
                className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>
          <Select
            id="create-role"
            label="Ruolo *"
            value={createForm.role}
            onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
            options={createRoleOptions}
          />

          {/* Sezione contratto dipendente */}
          {createForm.role !== 'admin' && (
            <>
              <div className="pt-2 border-t border-pw-border">
                <p className="text-sm font-medium text-pw-text-muted mb-3">
                  Contratto Dipendente
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="create-salary" className="block text-sm font-medium text-pw-text-muted mb-1">
                    Paga Mensile (EUR)
                  </label>
                  <input
                    id="create-salary"
                    type="number"
                    min="0"
                    step="0.01"
                    value={createForm.salary}
                    onChange={(e) => setCreateForm({ ...createForm, salary: e.target.value })}
                    placeholder="es. 1200"
                    className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none text-sm"
                  />
                </div>
                <Select
                  id="create-contract-type"
                  label="Tipo Contratto"
                  value={createForm.contract_type}
                  onChange={(e) => setCreateForm({ ...createForm, contract_type: e.target.value })}
                  options={[
                    { value: '6_mesi', label: '6 mesi' },
                    { value: '12_mesi', label: '12 mesi' },
                    { value: 'indeterminato', label: 'Indeterminato' },
                  ]}
                  placeholder="Seleziona..."
                />
              </div>
              <Input
                id="create-iban"
                label="IBAN"
                value={createForm.iban}
                onChange={(e) => setCreateForm({ ...createForm, iban: e.target.value.toUpperCase() })}
                placeholder="es. IT60X0542811101000000123456"
              />
              <Input
                id="create-contract-start"
                label="Data Inizio Contratto"
                type="date"
                value={createForm.contract_start_date}
                onChange={(e) => setCreateForm({ ...createForm, contract_start_date: e.target.value })}
              />
            </>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowCreateModal(false)}
              className="flex-1"
            >
              Annulla
            </Button>
            <Button
              onClick={handleCreateUser}
              loading={createLoading}
              disabled={!createForm.full_name || !createForm.email || !createForm.password || createForm.password.length < 8}
              className="flex-1"
            >
              <UserPlus size={16} />
              Crea Utente
            </Button>
          </div>
        </div>
      </Modal>

      {/* View member detail modal */}
      <Modal
        open={!!viewingMember}
        onClose={() => setViewingMember(null)}
        title={viewingMember?.full_name || ''}
      >
        {viewingMember && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-pw-accent flex items-center justify-center">
                <span className="text-white text-lg font-bold">{getInitials(viewingMember.full_name)}</span>
              </div>
              <div>
                <p className="text-base font-semibold text-pw-text">{viewingMember.full_name}</p>
                <Badge className={getRoleColor(viewingMember.role)}>{getRoleLabel(viewingMember.role)}</Badge>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex justify-between py-2 border-b border-pw-border">
                <span className="text-sm text-pw-text-muted">Email</span>
                <span className="text-sm text-pw-text font-medium">{viewingMember.email}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-pw-border">
                <span className="text-sm text-pw-text-muted">IBAN</span>
                <span className="text-sm text-pw-text font-medium font-mono">{viewingMember.iban || '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-pw-border">
                <span className="text-sm text-pw-text-muted">Paga Mensile</span>
                <span className="text-sm text-pw-text font-medium">{viewingMember.salary ? formatCurrency(viewingMember.salary) : '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-pw-border">
                <span className="text-sm text-pw-text-muted">Tipo Contratto</span>
                <span className="text-sm text-pw-text font-medium">
                  {viewingMember.contract_type === 'indeterminato' ? 'Indeterminato' : viewingMember.contract_type === '6_mesi' ? '6 mesi' : viewingMember.contract_type === '12_mesi' ? '12 mesi' : '—'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-pw-border">
                <span className="text-sm text-pw-text-muted">Inizio Contratto</span>
                <span className="text-sm text-pw-text font-medium">{viewingMember.contract_start_date || '—'}</span>
              </div>
              {viewingMember.salary && (
                <div className="p-3 rounded-xl bg-indigo-500/10 text-pw-accent text-sm">
                  Costo annuale: <strong>{formatCurrency(viewingMember.salary * 12)}</strong>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setViewingMember(null)} className="flex-1">
                  Chiudi
                </Button>
                <Button onClick={() => openEditMember(viewingMember)} className="flex-1">
                  <Pencil size={16} />
                  Modifica
                </Button>
                <select
                  value={viewingMember.role}
                  onChange={(e) => { handleUpdateRole(viewingMember.id, e.target.value); setViewingMember(null); }}
                  className="text-sm px-3 py-1.5 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text-muted"
                >
                  {roleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setReassignFrom(viewingMember);
                  setReassignTo('');
                  setShowReassign(true);
                  setViewingMember(null);
                }}
                className="w-full"
              >
                <ArrowRightLeft size={16} />
                Riassegna tutte le task a un altro utente
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit employee modal */}
      <Modal
        open={!!editingMember}
        onClose={() => setEditingMember(null)}
        title={`Modifica - ${editingMember?.full_name || ''}`}
      >
        {editingMember && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="edit-salary" className="block text-sm font-medium text-pw-text-muted mb-1">
                  Paga Mensile (EUR)
                </label>
                <input
                  id="edit-salary"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.salary}
                  onChange={(e) => setEditForm({ ...editForm, salary: e.target.value })}
                  placeholder="es. 1200"
                  className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none text-sm"
                />
              </div>
              <Select
                id="edit-contract-type"
                label="Tipo Contratto"
                value={editForm.contract_type}
                onChange={(e) => setEditForm({ ...editForm, contract_type: e.target.value })}
                options={[
                  { value: '6_mesi', label: '6 mesi' },
                  { value: '12_mesi', label: '12 mesi' },
                  { value: 'indeterminato', label: 'Indeterminato' },
                ]}
                placeholder="Seleziona..."
              />
            </div>
            <Input
              id="edit-iban"
              label="IBAN"
              value={editForm.iban}
              onChange={(e) => setEditForm({ ...editForm, iban: e.target.value.toUpperCase() })}
              placeholder="es. IT60X0542811101000000123456"
            />
            <Input
              id="edit-contract-start"
              label="Data Inizio Contratto"
              type="date"
              value={editForm.contract_start_date}
              onChange={(e) => setEditForm({ ...editForm, contract_start_date: e.target.value })}
            />

            {/* Color picker */}
            <div>
              <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-2">
                Colore identificativo
              </label>
              <div className="flex items-center gap-2">
                {['#8c7af5', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#6366f1', '#f97316', '#14b8a6', '#a855f7'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditForm({ ...editForm, color: c })}
                    className={`w-7 h-7 rounded-full transition-all ${editForm.color === c ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {editForm.salary && (
              <div className="p-3 rounded-xl bg-indigo-500/10 text-pw-accent text-sm">
                Costo annuale: <strong>{formatCurrency(Number(editForm.salary) * 12)}</strong>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditingMember(null)} className="flex-1">
                Annulla
              </Button>
              <Button onClick={handleSaveEmployee} loading={editLoading} className="flex-1">
                <Save size={16} />
                Salva Modifiche
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {/* Reassign tasks modal */}
      <Modal
        open={showReassign}
        onClose={() => setShowReassign(false)}
        title="Riassegna Task"
        size="sm"
      >
        {reassignFrom && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-amber-500/10 flex items-center gap-3">
              <AlertTriangle size={20} className="text-amber-500 shrink-0" />
              <p className="text-sm text-amber-400">
                Tutte le task attive di <strong>{reassignFrom.full_name}</strong> verranno riassegnate
              </p>
            </div>

            <Select
              id="reassign-to"
              label="Assegna a"
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
              options={teamMembers
                .filter((m) => m.id !== reassignFrom.id && m.is_active)
                .map((m) => ({ value: m.id, label: m.full_name }))}
              placeholder="Seleziona nuovo assegnatario"
            />

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowReassign(false)} className="flex-1">
                Annulla
              </Button>
              <Button onClick={handleReassignTasks} loading={reassignLoading} disabled={!reassignTo} className="flex-1">
                <ArrowRightLeft size={16} />
                Riassegna
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
