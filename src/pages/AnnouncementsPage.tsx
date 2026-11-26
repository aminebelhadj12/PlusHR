import React, { useEffect, useState } from 'react';
import { Megaphone, Pin, Trash2, Plus, Send, Paperclip } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import type { Announcement, Department, RoleCode } from '../types';
import { ConfirmModal, Modal } from '../components/ui/ConfirmModal';

export const AnnouncementsPage: React.FC = () => {
  const { user, addToast } = useApp();
  const canPublish = ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'].includes(user?.role_code || '');
  const canModerate = ['COMPANY_ADMIN', 'HR_MANAGER'].includes(user?.role_code || '');

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Announcement['category']>('general');
  const [audienceType, setAudienceType] = useState<Announcement['audience_type']>('all');
  const [targetDept, setTargetDept] = useState('');
  const [targetRole, setTargetRole] = useState<RoleCode>('EMPLOYEE');
  const [expiresAt, setExpiresAt] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [annRes, deptRes] = await Promise.all([
        apiRequest<{ announcements: Announcement[] }>('/api/announcements'),
        apiRequest<{ departments: Department[] }>('/api/departments'),
      ]);
      setAnnouncements(annRes.announcements);
      setDepartments(deptRes.departments);
      if (deptRes.departments.length > 0 && !targetDept) {
        setTargetDept(deptRes.departments[0].id);
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur chargement annonces', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('content', content);
      fd.append('category', category);
      fd.append('audience_type', audienceType);
      if (audienceType === 'department') fd.append('target_department_id', targetDept);
      if (audienceType === 'role') fd.append('target_role_code', targetRole);
      if (expiresAt) fd.append('expires_at', expiresAt);
      if (isPinned) fd.append('is_pinned', 'true');
      if (attachment) fd.append('attachment', attachment);

      await apiRequest('/api/announcements', { method: 'POST', body: fd });
      addToast('Annonce publiée', 'success');
      setCreateOpen(false);
      setTitle('');
      setContent('');
      setAttachment(null);
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur publication annonce', 'error');
    }
  };

  const handleTogglePin = async (id: string) => {
    try {
      await apiRequest(`/api/announcements/${id}/pin`, { method: 'PATCH' });
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur épinglage', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/announcements/${deleteTarget.id}`, { method: 'DELETE' });
      addToast('Annonce supprimée', 'success');
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur suppression', 'error');
    }
  };

  const handleComment = async (annId: string) => {
    const text = (commentInputs[annId] || '').trim();
    if (!text) return;
    try {
      await apiRequest(`/api/announcements/${annId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      });
      setCommentInputs((p) => ({ ...p, [annId]: '' }));
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur envoi commentaire', 'error');
    }
  };

  const handleDeleteComment = async (annId: string, commentId: string) => {
    try {
      await apiRequest(`/api/announcements/${annId}/comments/${commentId}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur suppression commentaire', 'error');
    }
  };

  const catLabel: Record<Announcement['category'], string> = {
    general: 'Général',
    hr: 'Ressources Humaines',
    operations: 'Opérations',
    urgent: 'Urgent',
    event: 'Événement',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Annonces internes</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Communications officielles ciblées par entreprise, département ou rôle
          </p>
        </div>
        {canPublish && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Publier une annonce
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
          <Megaphone className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Aucune annonce publiée pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann) => (
            <article
              key={ann.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    {ann.is_pinned && (
                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                        <Pin className="w-3.5 h-3.5" />
                        Épinglée
                      </span>
                    )}
                    <span className={ann.category === 'urgent' ? 'text-red-600 font-semibold' : 'font-medium text-slate-700 dark:text-slate-300'}>
                      {catLabel[ann.category]}
                    </span>
                    <span>·</span>
                    <span>Par {ann.author_name || 'Direction'}</span>
                    <span>·</span>
                    <span>{new Date(ann.created_at).toLocaleDateString('fr-FR')}</span>
                    {ann.expires_at && (
                      <>
                        <span>·</span>
                        <span>Expire le {ann.expires_at}</span>
                      </>
                    )}
                  </div>
                  <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mt-1">{ann.title}</h2>
                </div>

                {canModerate && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTogglePin(ann.id)}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800"
                      title={ann.is_pinned ? 'Désépingler' : 'Épingler'}
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(ann)}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-600 hover:bg-slate-50 dark:hover:bg-slate-800"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">{ann.content}</p>

              {ann.attachment_path && (
                <a
                  href={ann.attachment_path}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  Pièce jointe associée
                </a>
              )}

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="text-xs font-semibold text-slate-500">
                  Commentaires ({ann.comments?.length || 0})
                </div>
                {ann.comments && ann.comments.length > 0 && (
                  <div className="space-y-2">
                    {ann.comments.map((c) => (
                      <div key={c.id} className="flex items-start justify-between gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 text-xs">
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-white me-2">{c.user_name}</span>
                          <span className="text-slate-600 dark:text-slate-300">{c.content}</span>
                        </div>
                        {(c.user_id === user?.id || canModerate) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(ann.id, c.id)}
                            className="text-slate-400 hover:text-red-600 shrink-0"
                            aria-label="Supprimer commentaire"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={commentInputs[ann.id] || ''}
                    onChange={(e) => setCommentInputs((p) => ({ ...p, [ann.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleComment(ann.id);
                      }
                    }}
                    placeholder="Réagir ou poser une question…"
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => handleComment(ann.id)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                    aria-label="Envoyer commentaire"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={createOpen} title="Publier une annonce" onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Titre *</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Contenu *</label>
            <textarea
              required
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Catégorie</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Announcement['category'])}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="general">Général</option>
                <option value="hr">Ressources Humaines</option>
                <option value="operations">Opérations</option>
                <option value="urgent">Urgent</option>
                <option value="event">Événement</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Public cible</label>
              <select
                value={audienceType}
                onChange={(e) => setAudienceType(e.target.value as Announcement['audience_type'])}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="all">Toute l’entreprise</option>
                <option value="department">Un département</option>
                <option value="role">Un rôle spécifique</option>
              </select>
            </div>
            {audienceType === 'department' && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Département cible</label>
                <select
                  value={targetDept}
                  onChange={(e) => setTargetDept(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {audienceType === 'role' && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Rôle cible</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as RoleCode)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="EMPLOYEE">Employé</option>
                  <option value="MANAGER">Manager</option>
                  <option value="HR_MANAGER">Responsable RH</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Date d’expiration</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Pièce jointe</label>
              <input
                type="file"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-500"
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
            Épingler en haut du fil
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg">
              Annuler
            </button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
              Publier
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Supprimer l'annonce"
        message={`Confirmer la suppression définitive de "${deleteTarget?.title}" ?`}
        confirmLabel="Supprimer"
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
};
