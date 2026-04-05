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
import { Settings, Users, Shield, Save, UserPlus, Eye, EyeOff, Pencil } from 'lucide-react';

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
    contract_type: '',
    contract_start_date: new Date().toISOString().split('T')[0],
  });

  // Edit employee modal state
  const [editingMember, setEditingMember] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({
    salary: '',
    contract_type: '',
    contract_start_date: '',
  });
  const [editLoading, setEditLoading] = useState(false);

  const fetchTeam = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name');
    if (data) setTeamMembers(data as Profile[]);
    setLoading(false);
  }, [supabase]);

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
    await supabase
      .from('profiles')
      .update({ full_name: profileForm.full_name })
      .eq('id', profile.id);
    setSaving(false);
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);
    fetchTeam();
  };

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    await supabase
      .from('profiles')
      .update({ is_active: !isActive })
      .eq('id', userId);
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
        setCreateForm({ full_name: '', email: '', password: '', role: 'content_creator', salary: '', contract_type: '', contract_start_date: new Date().toISOString().split('T')[0] });
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
    setEditingMember(member);
    setEditForm({
      salary: member.salary ? String(member.salary) : '',
      contract_type: member.contract_type || '',
      contract_start_date: member.contract_start_date || '',
    });
  };

  const handleSaveEmployee = async () => {
    if (!editingMember) return;
    setEditLoading(true);
    await supabase
      .from('profiles')
      .update({
        salary: editForm.salary ? Number(editForm.salary) : null,
        contract_type: editForm.contract_type || null,
        contract_start_date: editForm.contract_start_date || null,
      })
      .eq('id', editingMember.id);
    setEditLoading(false);
    setEditingMember(null);
    fetchTeam();
  };

  const openCreateModal = () => {
    setCreateForm({ full_name: '', email: '', password: '', role: 'content_creator', salary: '', contract_type: '', contract_start_date: new Date().toISOString().split('T')[0] });
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
                  className="px-6 py-4 flex items-center gap-4"
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
                    <p className="text-xs text-pw-text-muted">{member.email}</p>
                    {member.salary && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatCurrency(member.salary)}/mese
                        {member.contract_type && (
                          <> &middot; {member.contract_type === 'indeterminato' ? 'Indeterminato' : member.contract_type === '6_mesi' ? '6 mesi' : '12 mesi'}</>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <select
                      value={member.role}
                      onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                      className="text-sm px-3 py-1.5 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text-muted"
                      disabled={member.id === profile.id}
                    >
                      {roleOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {member.id !== profile.id && member.role !== 'admin' && (
                      <button
                        onClick={() => openEditMember(member)}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-pw-surface-2 hover:text-indigo-600 transition-colors"
                        title="Modifica stipendio e contratto"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleActive(member.id, member.is_active)}
                      disabled={member.id === profile.id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        member.is_active
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
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
                className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm pr-10"
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
                    className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
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

      {/* Edit employee modal */}
      <Modal
        open={!!editingMember}
        onClose={() => setEditingMember(null)}
        title={`Modifica - ${editingMember?.full_name || ''}`}
      >
        {editingMember && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-pw-surface-2 text-sm">
              <p className="text-pw-text-muted">
                <strong>{editingMember.full_name}</strong> &middot; {editingMember.email}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{getRoleLabel(editingMember.role)}</p>
            </div>

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
                  className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
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
              id="edit-contract-start"
              label="Data Inizio Contratto"
              type="date"
              value={editForm.contract_start_date}
              onChange={(e) => setEditForm({ ...editForm, contract_start_date: e.target.value })}
            />

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
    </div>
  );
}
