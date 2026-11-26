import React, { useState } from 'react';
import { UserCircle, KeyRound, Fingerprint, Save, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import type { AuthUser } from '../types';

export const ProfilePage: React.FC = () => {
  const { user, updateUser, setSession, addToast } = useApp();

  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [registeringWebAuthn, setRegisteringWebAuthn] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiRequest<{ user: AuthUser }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...(phone ? { phone } : {}),
          ...(address ? { address } : {}),
          ...(emergencyContact ? { emergency_contact: emergencyContact } : {}),
        }),
      });
      updateUser(res.user);
      addToast('Profil mis à jour', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur mise à jour profil', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPwd(true);
    try {
      const res = await apiRequest<{ user: AuthUser; accessToken: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setSession(res.user, res.accessToken);
      setCurrentPassword('');
      setNewPassword('');
      addToast('Mot de passe modifié avec succès', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur modification mot de passe', 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  const handleRegisterWebAuthn = async () => {
    if (!window.PublicKeyCredential || !navigator.credentials?.create) {
      addToast('WebAuthn / Passkey non supporté dans ce navigateur ou contexte iframe.', 'warning');
      return;
    }
    setRegisteringWebAuthn(true);
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const userIdBytes = new TextEncoder().encode(user?.id || 'plushr-user');
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: '+HR Platform' },
          user: {
            id: userIdBytes,
            name: user?.email || 'user@plushr.ma',
            displayName: user?.full_name || 'Utilisateur +HR',
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          authenticatorSelection: { userVerification: 'preferred' },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!cred) {
        addToast('Enregistrement WebAuthn annulé.', 'info');
        return;
      }

      const res = await apiRequest<{ ok: boolean; credentialId: string }>('/api/auth/webauthn/register', {
        method: 'POST',
        body: JSON.stringify({ credentialId: cred.id }),
      });
      if (user) {
        updateUser({ ...user, webauthn_credential_id: res.credentialId });
      }
      addToast('Appareil WebAuthn enregistré pour le pointage sécurisé', 'success');
    } catch (err) {
      addToast(
        err instanceof Error
          ? `WebAuthn indisponible : ${err.message}`
          : 'Impossible d’enregistrer une clé WebAuthn dans cet environnement.',
        'warning'
      );
    } finally {
      setRegisteringWebAuthn(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Mon Profil & Sécurité</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Coordonnées personnelles, mot de passe et clé d’authentification WebAuthn
        </p>
      </div>

      {/* Identity card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white font-display text-lg font-bold flex items-center justify-center">
            {user?.full_name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-display text-lg font-semibold text-slate-900 dark:text-white">{user?.full_name}</div>
            <div className="text-xs text-slate-500">
              {user?.email} · Matricule {user?.matricule || 'N/A'} · {user?.role_code.replace('_', ' ')}
            </div>
          </div>
        </div>
        {user?.company_name && <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{user.company_name}</div>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <form
          onSubmit={handleSaveProfile}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center gap-2 font-display text-base font-semibold">
            <UserCircle className="w-4 h-4 text-blue-600" />
            Mettre à jour mes coordonnées
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Téléphone professionnel</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+212 6 ..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Adresse</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Nouvelle adresse"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Contact d’urgence</label>
            <input
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              placeholder="Nom et téléphone"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
          >
            <Save className="w-4 h-4" />
            {savingProfile ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>

        <form
          onSubmit={handleChangePassword}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center gap-2 font-display text-base font-semibold">
            <KeyRound className="w-4 h-4 text-blue-600" />
            Changer mon mot de passe
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Mot de passe actuel *</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Nouveau mot de passe (min 8 car., maj, min, chiffre) *</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <button
            type="submit"
            disabled={savingPwd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-blue-600 hover:opacity-90 text-white text-sm font-medium rounded-lg"
          >
            <KeyRound className="w-4 h-4" />
            {savingPwd ? 'Modification…' : 'Mettre à jour le mot de passe'}
          </button>
        </form>
      </div>

      {/* Real WebAuthn Credential registration */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center gap-2 font-display text-base font-semibold">
            <Fingerprint className="w-4 h-4 text-blue-600" />
            Vérification WebAuthn / Passkey
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enregistrez une clé matérielle ou Passkey standard du navigateur (aucune empreinte biométrique n’est stockée sur le serveur).
          </p>
          {user?.webauthn_credential_id && (
            <div className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Appareil enregistré ({user.webauthn_credential_id.slice(0, 14)}…)
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={registeringWebAuthn}
          onClick={handleRegisterWebAuthn}
          className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium rounded-lg"
        >
          <Fingerprint className="w-4 h-4 text-blue-600" />
          {registeringWebAuthn ? 'Vérification…' : 'Enregistrer un appareil WebAuthn'}
        </button>
      </div>
    </div>
  );
};
