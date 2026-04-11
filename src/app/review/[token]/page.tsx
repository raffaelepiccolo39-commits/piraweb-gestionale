'use client';

import { useEffect, useState, use } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ContentApproval } from '@/types/database';
import {
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';

interface PublicApproval extends Omit<ContentApproval, 'submitter'> {
  task?: { title: string; project?: { name: string; client?: { name: string; company: string | null } } };
  submitter?: { full_name: string };
}

export default function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const supabase = createClient();

  const [approval, setApproval] = useState<PublicApproval | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function fetchApproval() {
      const { data, error } = await supabase
        .from('content_approvals')
        .select(`
          *,
          submitter:profiles!content_approvals_submitted_by_fkey(full_name),
          task:tasks(
            title,
            project:projects(
              name,
              client:clients(name, company)
            )
          )
        `)
        .eq('share_token', token)
        .single();

      if (error || !data) {
        setNotFound(true);
      } else {
        setApproval(data as PublicApproval);
      }
      setLoading(false);
    }
    fetchApproval();
  }, [supabase, token]);

  const handleResponse = async (status: 'approved' | 'revision_requested') => {
    if (!approval) return;
    const { error } = await supabase
      .from('content_approvals')
      .update({
        status,
        review_comment: feedback || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', approval.id);

    if (!error) {
      setSubmitted(true);
      setApproval((a) => a ? { ...a, status, review_comment: feedback || null } : null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertTriangle size={48} className="text-gray-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link non valido</h1>
          <p className="text-gray-500">Questo link di revisione non esiste o e' scaduto.</p>
        </div>
      </div>
    );
  }

  if (!approval) return null;

  const task = approval.task as PublicApproval['task'];
  const clientName = task?.project?.client?.company || task?.project?.client?.name || '';
  const projectName = task?.project?.name || '';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">PiraWeb</h1>
            <p className="text-xs text-gray-500">Revisione contenuto</p>
          </div>
          {clientName && (
            <span className="text-sm text-gray-500">{clientName}</span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Content info */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{approval.title}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {projectName && `Progetto: ${projectName}`}
                {task?.title && ` · Task: ${task.title}`}
              </p>
              {approval.submitter && (
                <p className="text-xs text-gray-400 mt-1">
                  Inviato da {(approval.submitter as { full_name: string }).full_name}
                  {' · '}
                  {new Date(approval.submitted_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
            <StatusBadge status={approval.status} />
          </div>

          {approval.description && (
            <p className="text-sm text-gray-600 leading-relaxed">{approval.description}</p>
          )}

          {/* Content link */}
          {approval.content_url && (
            <a
              href={approval.content_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-sm font-medium"
            >
              <ExternalLink size={16} />
              Visualizza Contenuto
            </a>
          )}

          {/* Attachments */}
          {approval.attachment_urls.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Allegati</p>
              {approval.attachment_urls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-indigo-600 hover:underline truncate"
                >
                  {url}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Review section */}
        {approval.status === 'pending' && !submitted ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare size={16} className="text-indigo-500" />
              La tua opinione
            </h3>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Commenti, suggerimenti o modifiche richieste... (opzionale)"
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => handleResponse('approved')}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-500 text-white font-medium text-sm hover:bg-green-600 transition-colors"
              >
                <CheckCircle size={18} />
                Approva
              </button>
              <button
                onClick={() => handleResponse('revision_requested')}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition-colors"
              >
                <XCircle size={18} />
                Richiedi Modifiche
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
            {approval.status === 'approved' ? (
              <>
                <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-gray-900">Contenuto Approvato</h3>
                <p className="text-sm text-gray-500 mt-1">Grazie per la tua revisione!</p>
              </>
            ) : approval.status === 'revision_requested' ? (
              <>
                <XCircle size={48} className="text-orange-500 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-gray-900">Modifiche Richieste</h3>
                <p className="text-sm text-gray-500 mt-1">Il team lavorera' sulle modifiche richieste.</p>
              </>
            ) : approval.status === 'rejected' ? (
              <>
                <XCircle size={48} className="text-red-500 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-gray-900">Contenuto Rifiutato</h3>
              </>
            ) : (
              <>
                <Clock size={48} className="text-yellow-500 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-gray-900">In Attesa di Revisione</h3>
              </>
            )}
            {approval.review_comment && (
              <div className="mt-4 p-3 rounded-lg bg-gray-50 text-left">
                <p className="text-xs font-medium text-gray-500 mb-1">Feedback:</p>
                <p className="text-sm text-gray-700">{approval.review_comment}</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 px-6 py-4 mt-12">
        <p className="text-center text-xs text-gray-400">
          PiraWeb Gestionale &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: 'In attesa', className: 'bg-yellow-100 text-yellow-700' },
    approved: { label: 'Approvato', className: 'bg-green-100 text-green-700' },
    rejected: { label: 'Rifiutato', className: 'bg-red-100 text-red-700' },
    revision_requested: { label: 'Modifiche richieste', className: 'bg-orange-100 text-orange-700' },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}
