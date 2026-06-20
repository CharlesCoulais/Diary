import { useEffect, useRef, useState } from 'react';
import { trpc } from '../lib/trpc';
import { SettingsCard } from './SettingsCard';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Section "Profil" des Settings (et GuestSettings) — regroupe **photo** ET
 * **nom d'affichage**, conformément au libellé de la section ("Photo et
 * identité"). Le nom est sauvegardé via `auth.updateDisplayName`, la photo via
 * `auth.setAvatar`.
 */
export function AvatarSection() {
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  const uploadImage = trpc.images.upload.useMutation();
  const setAvatar = trpc.auth.setAvatar.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });
  const updateName = trpc.auth.updateDisplayName.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Nom d'affichage ────────────────────────────────────────────────────────
  // État local pour le champ texte : synchronisé sur la donnée serveur mais
  // édité librement, on persiste à la perte de focus ou au submit.
  const [name, setName] = useState<string>('');
  const [nameStatus, setNameStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [nameError, setNameError] = useState<string | null>(null);
  useEffect(() => {
    setName(user?.displayName ?? '');
  }, [user?.displayName]);

  const trimmedName = name.trim();
  const currentName = user?.displayName ?? '';
  const isDirty = trimmedName !== currentName;
  // Indication visuelle « enregistré » qui s'efface après 2s.
  useEffect(() => {
    if (nameStatus !== 'saved') return;
    const t = setTimeout(() => setNameStatus('idle'), 2000);
    return () => clearTimeout(t);
  }, [nameStatus]);

  const saveName = async () => {
    if (!isDirty) return;
    if (trimmedName.length > 80) {
      setNameError('80 caractères max.');
      setNameStatus('error');
      return;
    }
    setNameStatus('saving');
    setNameError(null);
    try {
      await updateName.mutateAsync({ displayName: trimmedName });
      setNameStatus('saved');
    } catch {
      setNameStatus('error');
      setNameError("Impossible d'enregistrer pour le moment.");
    }
  };

  // ── Photo ──────────────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.type)) { setError('Format non supporté (jpg, png, webp, gif)'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('Image trop grande (max 8 Mo)'); return; }
    setError(null);
    setLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const { id } = await uploadImage.mutateAsync({
        data: base64,
        mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        size: file.size,
      });
      await setAvatar.mutateAsync({ imageId: id });
    } catch {
      setError("Erreur lors de l'upload");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    setLoading(true);
    try { await setAvatar.mutateAsync({ imageId: null }); }
    finally { setLoading(false); }
  };

  const fallbackInitial = (user?.displayName ?? user?.email ?? '?').charAt(0).toUpperCase();
  const avatarUrl = user?.avatarImageId ? `/images/${user.avatarImageId}` : null;

  return (
    <SettingsCard className="space-y-6">
      {/* ── Photo ─────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted/50 mb-4">Photo de profil</p>
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-accent/20 flex items-center justify-center shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-accent font-semibold text-2xl">{fallbackInitial}</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              className="text-sm text-accent hover:opacity-80 transition-opacity disabled:opacity-40 text-left"
            >
              {loading ? 'Chargement…' : 'Changer la photo'}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={loading}
                className="text-sm text-text-muted/60 hover:text-text-muted transition-colors disabled:opacity-40 text-left"
              >
                Supprimer la photo
              </button>
            )}
            <p className="text-xs text-text-muted/55">JPG, PNG, WebP ou GIF · max 8 Mo</p>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {/* ── Nom d'affichage ───────────────────────────────────────────────── */}
      <div className="pt-5 border-t border-text-muted/8">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted/50 mb-2">Nom d'affichage</p>
        <p className="text-xs text-text-muted/60 mb-3">
          Visible dans les commentaires, le Fil et la messagerie. Laisse vide pour
          afficher la première partie de ton email.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveName();
          }}
          className="flex flex-col sm:flex-row sm:items-center gap-2"
        >
          <input
            type="text"
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              if (nameStatus !== 'idle') setNameStatus('idle');
              if (nameError) setNameError(null);
            }}
            onBlur={() => { void saveName(); }}
            placeholder={user?.email?.split('@')[0] ?? 'Ton prénom ou pseudo'}
            className="flex-1 bg-bg-primary/60 border border-text-muted/15 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors"
          />
          <button
            type="submit"
            disabled={!isDirty || nameStatus === 'saving'}
            className="px-4 py-2 rounded-xl bg-accent text-bg-primary text-sm font-medium hover:opacity-95 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            {nameStatus === 'saving' ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
        <div className="mt-2 min-h-[16px] text-xs">
          {nameStatus === 'saved' && (
            <span className="text-success">✓ Enregistré</span>
          )}
          {nameStatus === 'error' && (
            <span className="text-danger">{nameError ?? 'Erreur'}</span>
          )}
          {nameStatus === 'idle' && (
            <span className="text-text-muted/55">{trimmedName.length}/80</span>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
