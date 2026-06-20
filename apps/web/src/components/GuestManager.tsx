import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { Switch } from './Switch';
import { SettingsCard } from './SettingsCard';
import { confirmDialog } from '../lib/dialog';
import { showToast } from '../lib/toast';

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function GuestManager() {
  const { data: me } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.guests.list.useQuery(undefined, {
    enabled: me?.role === 'OWNER',
  });
  const invite = trpc.guests.invite.useMutation({
    onSuccess: () => { utils.guests.list.invalidate(); setShowInviteForm(false); setEmail(''); },
  });
  const revokeGuest = trpc.guests.revokeGuest.useMutation({
    onSuccess: () => utils.guests.list.invalidate(),
  });
  const revokeInvitation = trpc.guests.revokeInvitation.useMutation({
    onSuccess: () => utils.guests.list.invalidate(),
  });
  const updateGuest = trpc.guests.updateGuest.useMutation({
    onSuccess: () => { utils.guests.list.invalidate(); setEditingId(null); },
  });
  const regeneratePassword = trpc.guests.regeneratePassword.useMutation({
    onSuccess: (res) => { setRegeneratedPassword(res.password); setPasswordCopied(false); setConfirmRegenId(null); },
  });

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [email, setEmail] = useState('');
  const [guestAccess, setGuestAccess] = useState<'ALL' | 'SPECIFIC' | 'CONFIDANT'>('ALL');
  const [canComment, setCanComment] = useState(true);
  const [canViewCalendar, setCanViewCalendar] = useState(false);
  const [canViewAgenda, setCanViewAgenda] = useState(false);
  const [canViewBudget, setCanViewBudget] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAccess, setEditAccess] = useState<'ALL' | 'SPECIFIC' | 'CONFIDANT'>('ALL');
  const [editCanComment, setEditCanComment] = useState(true);
  const [editCanViewCalendar, setEditCanViewCalendar] = useState(false);
  const [editCanViewAgenda, setEditCanViewAgenda] = useState(false);
  const [editCanViewBudget, setEditCanViewBudget] = useState(false);
  const [confirmRegenId, setConfirmRegenId] = useState<string | null>(null);
  /** Mdp régénéré, affiché une seule fois après succès. Reset à null une fois
   *  l'owner a fermé le bandeau (signal que le mdp est noté/transmis). */
  const [regeneratedPassword, setRegeneratedPassword] = useState<string | null>(null);
  /** Passe à true dès que l'owner a copié le mdp — conditionne la fermeture
   *  silencieuse du bandeau (sinon confirmation pour éviter de perdre le mdp). */
  const [passwordCopied, setPasswordCopied] = useState(false);

  if (me?.role !== 'OWNER') return null;

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    invite.mutate({
      email,
      guestAccess,
      canComment: guestAccess === 'CONFIDANT' ? true : canComment,
      canViewCalendar: guestAccess === 'CONFIDANT' ? canViewCalendar : false,
      canViewAgenda: guestAccess === 'CONFIDANT' ? canViewAgenda : false,
      canViewBudget: guestAccess === 'CONFIDANT' ? canViewBudget : false,
    }, {
      onSuccess: ({ token }) => {
        const link = `${window.location.origin}/rejoindre?token=${token}`;
        setInviteLink(link);
      },
    });
  };

  return (
    <SettingsCard>
      {/* Le titre « Confidents » est fourni par le chrome de Réglages (SET-03) ;
          ici on ne garde que l'action d'invitation, alignée à droite. */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <button
          type="button"
          onClick={() => { setShowInviteForm((v) => !v); setInviteLink(null); }}
          className={`shrink-0 min-h-[36px] rounded-full px-3.5 text-xs font-medium transition-colors ${
            showInviteForm
              ? 'text-text-muted hover:text-text-primary'
              : 'bg-accent/10 text-accent hover:bg-accent/15'
          }`}
        >
          {showInviteForm ? 'Annuler' : '+ Inviter'}
        </button>
      </div>

      {/* Formulaire d'invitation */}
      {showInviteForm && !inviteLink && (
        <form onSubmit={handleInvite} className="mb-4 flex flex-col gap-3 p-4 bg-bg-primary rounded-xl">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="Email de l'invité·e"
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/15 focus:border-accent/40 pb-0.5"
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-muted/60 uppercase tracking-wide">Niveau d'accès</span>
            <div className="flex gap-2">
              {([
                { value: 'ALL', label: 'Partagé', desc: 'Entrées marquées publiques' },
                { value: 'CONFIDANT', label: 'Confident', desc: 'Tout, public et privé' },
                { value: 'SPECIFIC', label: 'Limité', desc: 'Partages explicites seulement' },
              ] as const).map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGuestAccess(value)}
                  className={`flex-1 flex flex-col items-center px-2 py-2 rounded-xl text-xs border transition-all ${
                    guestAccess === value
                      ? 'border-accent/60 bg-accent/10 text-text-primary'
                      : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'
                  }`}
                >
                  <span className="font-medium">{label}</span>
                  <span className="text-[11px] opacity-70 text-center leading-tight mt-0.5">{desc}</span>
                </button>
              ))}
            </div>
          </div>
          {guestAccess !== 'CONFIDANT' && (
            <div className="flex items-center justify-between gap-2 text-sm text-text-muted">
              <span>Peut commenter</span>
              <Switch checked={canComment} onChange={setCanComment} aria-label="Peut commenter" />
            </div>
          )}
          {guestAccess === 'CONFIDANT' && (
            <div className="flex flex-col gap-2 pt-1 border-t border-text-muted/10">
              <span className="text-xs text-text-muted/60 uppercase tracking-wide">Accès aux vues</span>
              <div className="flex items-center justify-between gap-2 text-sm text-text-muted">
                <span>Calendrier</span>
                <Switch checked={canViewCalendar} onChange={setCanViewCalendar} aria-label="Accès Calendrier" />
              </div>
              <div className="flex items-center justify-between gap-2 text-sm text-text-muted">
                <span>Agenda</span>
                <Switch checked={canViewAgenda} onChange={setCanViewAgenda} aria-label="Accès Agenda" />
              </div>
              <div className="flex items-center justify-between gap-2 text-sm text-text-muted">
                <span>Budget</span>
                <Switch checked={canViewBudget} onChange={setCanViewBudget} aria-label="Accès Budget" />
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={invite.isPending}
            className="text-sm text-accent hover:opacity-70 disabled:opacity-40 transition-opacity self-start"
          >
            {invite.isPending ? 'Création…' : 'Générer le lien'}
          </button>
        </form>
      )}

      {/* Lien généré */}
      {inviteLink && (
        <div className="mb-4 p-4 bg-bg-primary rounded-xl flex flex-col gap-2">
          <p className="text-xs text-text-muted">Lien d'invitation (valide 7 jours) :</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-text-primary bg-bg-elevated rounded px-2 py-1.5 truncate">{inviteLink}</code>
            <button
              type="button"
              onClick={() => copyToClipboard(inviteLink)}
              className="text-xs text-accent hover:opacity-70 shrink-0"
            >
              Copier
            </button>
          </div>
          <button type="button" onClick={() => { setInviteLink(null); setShowInviteForm(false); }} className="text-xs text-text-muted self-start hover:text-text-primary">
            Fermer
          </button>
        </div>
      )}

      {isLoading && <p className="text-sm text-text-muted/50 italic">Chargement…</p>}

      {/* Guests actifs */}
      {(data?.guests ?? []).length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {data!.guests.map((g) => (
            <div key={g.id} className="py-1.5">
              {editingId === g.id ? (
                <div className="flex flex-col gap-3 p-3 bg-bg-primary rounded-xl">
                  <span className="text-sm text-text-primary font-medium">{g.displayName || g.email}</span>
                  <div className="flex gap-2">
                    {([
                      { value: 'ALL', label: 'Partagé' },
                      { value: 'CONFIDANT', label: 'Confident' },
                      { value: 'SPECIFIC', label: 'Limité' },
                    ] as const).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setEditAccess(value)}
                        className={`flex-1 py-1.5 rounded-lg text-xs border transition-all ${
                          editAccess === value
                            ? 'border-accent/60 bg-accent/10 text-text-primary'
                            : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {editAccess !== 'CONFIDANT' && (
                    <div className="flex items-center justify-between gap-2 text-sm text-text-muted">
                      <span>Peut commenter</span>
                      <Switch checked={editCanComment} onChange={setEditCanComment} aria-label="Peut commenter" />
                    </div>
                  )}
                  {editAccess === 'CONFIDANT' && (
                    <div className="flex flex-col gap-2 pt-1 border-t border-text-muted/10">
                      <span className="text-xs text-text-muted/60 uppercase tracking-wide">Accès aux vues</span>
                      <div className="flex items-center justify-between gap-2 text-sm text-text-muted">
                        <span>Calendrier</span>
                        <Switch checked={editCanViewCalendar} onChange={setEditCanViewCalendar} aria-label="Accès Calendrier" />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm text-text-muted">
                        <span>Agenda</span>
                        <Switch checked={editCanViewAgenda} onChange={setEditCanViewAgenda} aria-label="Accès Agenda" />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm text-text-muted">
                        <span>Budget</span>
                        <Switch checked={editCanViewBudget} onChange={setEditCanViewBudget} aria-label="Accès Budget" />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => updateGuest.mutate({ guestId: g.id, guestAccess: editAccess, guestCanComment: editCanComment, guestCanViewCalendar: editCanViewCalendar, guestCanViewAgenda: editCanViewAgenda, guestCanViewBudget: editCanViewBudget })}
                      disabled={updateGuest.isPending}
                      className="text-xs text-accent hover:opacity-70 disabled:opacity-40 transition-opacity"
                    >
                      {updateGuest.isPending ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-text-muted hover:text-text-primary">
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-text-primary truncate">{g.displayName || g.email}</span>
                    <span className="text-xs text-text-muted/60 truncate">
                      {g.email} · {{ ALL: 'Partagé', CONFIDANT: 'Confident', SPECIFIC: 'Limité' }[g.guestAccess as string] ?? g.guestAccess}
                      {g.guestAccess !== 'CONFIDANT' && ` · ${g.guestCanComment ? 'peut commenter' : 'lecture seule'}`}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                    {confirmRevokeId === g.id ? (
                      <>
                        <button type="button" onClick={() => { revokeGuest.mutate({ guestId: g.id }); setConfirmRevokeId(null); }} className="min-h-[36px] px-2.5 rounded-lg text-xs text-danger font-medium hover:bg-danger/10 transition-colors">Confirmer</button>
                        <button type="button" onClick={() => setConfirmRevokeId(null)} className="min-h-[36px] px-2.5 rounded-lg text-xs text-text-muted hover:bg-text-muted/10 transition-colors">Annuler</button>
                      </>
                    ) : confirmRegenId === g.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => regeneratePassword.mutate({ guestId: g.id })}
                          disabled={regeneratePassword.isPending}
                          className="min-h-[36px] px-2.5 rounded-lg text-xs text-warning font-medium hover:bg-warning/10 transition-colors"
                        >
                          {regeneratePassword.isPending ? '…' : 'Confirmer régénération'}
                        </button>
                        <button type="button" onClick={() => setConfirmRegenId(null)} className="min-h-[36px] px-2.5 rounded-lg text-xs text-text-muted hover:bg-text-muted/10 transition-colors">Annuler</button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => { setEditingId(g.id); setEditAccess(g.guestAccess as 'ALL' | 'SPECIFIC' | 'CONFIDANT'); setEditCanComment(g.guestCanComment ?? true); setEditCanViewCalendar(g.guestCanViewCalendar ?? false); setEditCanViewAgenda(g.guestCanViewAgenda ?? false); setEditCanViewBudget(g.guestCanViewBudget ?? false); }}
                          className="min-h-[36px] px-2.5 rounded-lg text-xs text-text-muted/70 hover:text-text-primary hover:bg-text-muted/10 transition-colors"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRegenId(g.id)}
                          className="min-h-[36px] px-2.5 rounded-lg text-xs text-warning/80 hover:text-warning hover:bg-warning/10 transition-colors"
                          title="Génère un mdp temporaire à transmettre au confident"
                        >
                          Régén. mdp
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRevokeId(g.id)}
                          disabled={revokeGuest.isPending}
                          className="min-h-[36px] px-2.5 rounded-lg text-xs text-danger/80 hover:text-danger hover:bg-danger/10 transition-colors"
                        >
                          Révoquer
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bandeau affiché une seule fois après régénération — l'owner doit le
          noter / le transmettre immédiatement au confident. */}
      {regeneratedPassword && (
        <div className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-warning">
            ⚠️ Mot de passe temporaire généré — note-le maintenant, il ne sera plus visible.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm bg-bg-primary/60 border border-text-muted/15 rounded px-2 py-1.5 select-all">
              {regeneratedPassword}
            </code>
            <button
              type="button"
              onClick={() => { copyToClipboard(regeneratedPassword); setPasswordCopied(true); showToast({ message: 'Mot de passe copié', tone: 'success' }); }}
              className="min-h-[36px] px-2.5 rounded-lg text-xs text-accent hover:bg-accent/10 transition-colors"
            >
              {passwordCopied ? 'Copié ✓' : 'Copier'}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (passwordCopied || await confirmDialog({
                  title: 'Fermer sans copier ?',
                  message: 'Le mot de passe ne sera plus visible. Assure-toi de l\'avoir noté ou transmis au confident.',
                  confirmLabel: 'Fermer quand même',
                  tone: 'warning',
                })) {
                  setRegeneratedPassword(null);
                }
              }}
              className="min-h-[36px] px-2.5 rounded-lg text-xs text-text-muted hover:bg-text-muted/10 transition-colors"
            >
              Fermer
            </button>
          </div>
          <p className="text-[11px] text-text-muted/70 leading-relaxed">
            Transmets-le au confident par un canal de confiance (SMS, IRL).
            À son prochain login il devra choisir un mot de passe définitif.
          </p>
        </div>
      )}

      {/* Invitations en attente */}
      {(data?.invitations ?? []).length > 0 && (
        <div className="flex flex-col gap-2 border-t border-text-muted/10 pt-3">
          <span className="text-xs text-text-muted/50 uppercase tracking-wide">En attente</span>
          {data!.invitations.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-2 py-1">
              <span className="text-sm text-text-muted truncate">{inv.email}</span>
              {confirmCancelId === inv.id ? (
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => { revokeInvitation.mutate({ invitationId: inv.id }); setConfirmCancelId(null); }} className="text-xs text-danger font-medium">Confirmer</button>
                  <button type="button" onClick={() => setConfirmCancelId(null)} className="text-xs text-text-muted">Non</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmCancelId(inv.id)}
                  className="text-xs text-text-muted/50 hover:text-danger transition-colors shrink-0"
                >
                  Annuler
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!isLoading && !data?.guests.length && !data?.invitations.length && !showInviteForm && !inviteLink && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-text-muted/60">
            Aucun confident pour l'instant.
          </p>
          <p className="text-xs text-text-muted/50 max-w-xs leading-relaxed">
            Invite une personne de confiance à lire (et commenter) ton journal.
          </p>
          <button
            type="button"
            onClick={() => { setShowInviteForm(true); setInviteLink(null); }}
            className="min-h-[36px] rounded-full px-4 bg-accent/10 text-accent text-sm font-medium hover:bg-accent/15 transition-colors"
          >
            + Inviter un confident
          </button>
        </div>
      )}
    </SettingsCard>
  );
}
