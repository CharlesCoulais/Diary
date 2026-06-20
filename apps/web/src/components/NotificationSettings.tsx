import { useEffect, useState } from 'react';
import { trpc } from '../lib/trpc';
import { TimeInput } from './TimeInput';
import { NOTE_TYPE_CONFIG, noteTint, type NoteType } from './NoteTypePicker';
import { Switch } from './Switch';
import { SettingsCard } from './SettingsCard';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function NotificationSettings() {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const isGuest = me?.role === 'GUEST';
  const { data: settings } = trpc.notifications.getSettings.useQuery();
  const { data: vapidData, isLoading: vapidLoading, isError: vapidError } = trpc.notifications.vapidPublicKey.useQuery();
  const saveSettings = trpc.notifications.saveSettings.useMutation({
    onSuccess: () => utils.notifications.getSettings.invalidate(),
  });
  const subscribe = trpc.notifications.subscribe.useMutation();
  const unsubscribeMutation = trpc.notifications.unsubscribe.useMutation();
  const sendTest = trpc.notifications.sendTest.useMutation();

  const [swSupported] = useState(() => 'serviceWorker' in navigator && 'PushManager' in window);
  /**
   * iOS Safari 16.4+ supporte les Web Push **uniquement** si l'app est
   * installée à l'écran d'accueil (mode standalone). Si on est sur iOS dans
   * Safari hors-PWA, la souscription échoue silencieusement à `subscribe()`.
   * On affiche un guide avant le toggle pour expliquer l'étape manquante.
   */
  const [isIOSNotStandalone] = useState(() => {
    const ua = navigator.userAgent || '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    if (!isIOS) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    return !isStandalone;
  });
  const [permState, setPermState] = useState<NotificationPermission>('default');
  const [currentSub, setCurrentSub] = useState<PushSubscription | null>(null);
  const [reminderTime, setReminderTime] = useState<string>('09:00');
  const [dailyLogTime, setDailyLogTime] = useState<string>('20:00');
  const [saving, setSaving] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  // Sous-onglets internes de la section Notifications
  type NotifTab = 'general' | 'modes' | 'important';
  const [tab, setTab] = useState<NotifTab>('general');

  useEffect(() => {
    if (!swSupported) return;
    setPermState(Notification.permission);
    navigator.serviceWorker.getRegistration('/sw.js').then((reg) => {
      reg?.pushManager.getSubscription().then(setCurrentSub);
    });
  }, [swSupported]);

  useEffect(() => {
    if (settings?.reminderTime) setReminderTime(settings.reminderTime);
  }, [settings?.reminderTime]);

  useEffect(() => {
    if (settings?.dailyLogReminderAt) setDailyLogTime(settings.dailyLogReminderAt);
  }, [settings?.dailyLogReminderAt]);

  const isEnabled = settings?.enabled ?? false;
  const dailyLogOn = (settings?.dailyLogReminderAt ?? null) !== null;

  const saveDailyLogReminder = async (value: string | null) => {
    await saveSettings.mutateAsync({
      enabled: isEnabled,
      reminderTime: settings?.reminderTime ?? null,
      dailyLogReminderAt: value,
    });
    utils.notifications.getSettings.invalidate();
  };

  const handleToggle = async () => {
    if (!swSupported) return;
    setToggleError(null);

    try {
      if (isEnabled || currentSub) {
        // Désactiver
        if (currentSub) {
          await currentSub.unsubscribe();
          await unsubscribeMutation.mutateAsync({ endpoint: currentSub.endpoint });
          setCurrentSub(null);
        }
        await saveSettings.mutateAsync({ enabled: false, reminderTime: settings?.reminderTime ?? null });
      } else {
        // Activer — demander permission puis s'abonner
        const perm = await Notification.requestPermission();
        setPermState(perm);
        if (perm !== 'granted') return;

        if (vapidLoading) {
          setToggleError('Chargement en cours, réessaie dans un instant.');
          return;
        }
        if (vapidError || !vapidData?.key) {
          setToggleError('Clé VAPID manquante — vérifie les variables d\'environnement côté serveur.');
          return;
        }

        const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
        await reg.update();
        await navigator.serviceWorker.ready;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidData.key),
        });
        const json = sub.toJSON();
        await subscribe.mutateAsync({
          endpoint: sub.endpoint,
          p256dh: (json.keys?.p256dh) ?? '',
          auth: (json.keys?.auth) ?? '',
        });
        setCurrentSub(sub);
      }
      utils.notifications.getSettings.invalidate();
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  };

  const handleSaveTime = async () => {
    setSaving(true);
    await saveSettings.mutateAsync({ enabled: isEnabled, reminderTime: reminderTime || null });
    setSaving(false);
  };

  if (!swSupported) return null;

  const TABS: { id: NotifTab; label: string; desc: string }[] = [
    { id: 'general',   label: 'Général',     desc: 'Activation, test, rappel quotidien, types de notifications' },
    { id: 'modes',     label: 'Modes',       desc: 'Discret (contenu masqué) et silencieux (aucune notification)' },
    { id: 'important', label: 'Critiques',   desc: 'Notifications qui passent en clair même en mode silencieux/discret' },
  ];

  return (
    <SettingsCard>
      <p className="text-xs text-text-muted/60 mb-4">
        Reçois un rappel push pour écrire ou consulter les commentaires.
      </p>

      {/* Sous-onglets internes */}
      <div className="flex gap-1 border-b border-text-muted/[0.12] -mx-6 px-6 mb-2 overflow-x-auto hide-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-text-muted/50 italic mb-2">{TABS.find((t) => t.id === tab)?.desc}</p>

      {/* ── Onglet « Général » ─────────────────────────────────────────────── */}
      {tab === 'general' && <>
      {/* Guide iOS : Web Push requiert l'app installée à l'écran d'accueil */}
      {isIOSNotStandalone && (
        <div className="mt-2 mb-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs leading-relaxed">
          <p className="font-medium text-warning mb-1">📱 Installe l'app d'abord</p>
          <p className="text-text-muted">
            Sur iOS, les notifications push ne fonctionnent qu'après avoir ajouté Diary
            à l'écran d'accueil. Dans Safari : <strong>bouton Partager</strong> → <strong>Sur l'écran d'accueil</strong>,
            puis ouvre l'app depuis l'icône et reviens ici.
          </p>
        </div>
      )}
      {/* Toggle activation */}
      <div className="flex items-center justify-between py-3 border-b border-text-muted/10">
        <div>
          <p className="text-sm text-text-primary">Activer les notifications</p>
          {permState === 'denied' && (
            <p className="text-xs text-danger/80 mt-0.5">
              Bloquées par le navigateur — autorise-les dans les réglages du site.
            </p>
          )}
          {toggleError && (
            <p className="text-xs text-danger/80 mt-0.5 max-w-[220px]">{toggleError}</p>
          )}
        </div>
        <Switch
          checked={isEnabled}
          onChange={() => void handleToggle()}
          disabled={permState === 'denied' || subscribe.isPending || unsubscribeMutation.isPending || isIOSNotStandalone}
          aria-label="Activer les notifications push"
        />
      </div>

      {/* Bouton test push */}
      {isEnabled && currentSub && (
        <div className="py-3 border-b border-text-muted/10">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-primary">Tester les notifications</p>
            <button
              type="button"
              onClick={() => sendTest.mutate()}
              disabled={sendTest.isPending}
              className="text-xs px-3 py-1.5 rounded-full bg-text-muted/10 text-text-muted border border-text-muted/20 hover:bg-text-muted/20 transition-colors disabled:opacity-50"
            >
              {sendTest.isPending ? '…' : sendTest.data?.ok === false ? '✗ Échec' : sendTest.data?.ok ? '✓ Envoyé' : 'Envoyer un test'}
            </button>
          </div>
          {sendTest.data && !sendTest.data.ok && (
            <p className="text-[11px] text-danger/70 mt-1.5">
              {(sendTest.data as { reason?: string }).reason === 'no_subscription' && 'Aucun abonnement en base — réactive les notifs.'}
              {(sendTest.data as { reason?: string }).reason === 'no_vapid' && 'Clé VAPID manquante côté serveur.'}
              {(sendTest.data as { error?: string }).error && `Erreur : ${(sendTest.data as { error?: string }).error}`}
            </p>
          )}
        </div>
      )}

      {/* Heure de rappel — visible seulement si activé */}
      {isEnabled && (
        <div className="flex items-center justify-between py-3 border-b border-text-muted/10">
          <div>
            <p className="text-sm text-text-primary">Heure du rappel quotidien</p>
            <p className="text-xs text-text-muted/50 mt-0.5">Laisse vide pour désactiver le rappel</p>
          </div>
          <div className="flex items-center gap-2">
            <TimeInput
              value={reminderTime}
              onChange={setReminderTime}
            />
            <button
              type="button"
              onClick={handleSaveTime}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-full bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors disabled:opacity-50"
            >
              {saving ? '…' : 'OK'}
            </button>
          </div>
        </div>
      )}

      {/* Rappel du suivi quotidien — owner uniquement, visible si notifs activées.
          Distinct du rappel d'écriture : ne se déclenche que si le ressenti du
          jour n'est pas encore noté. */}
      {isEnabled && !isGuest && (
        <div className="flex items-center justify-between gap-3 py-3 border-b border-text-muted/10">
          <div className="min-w-0">
            <p className="text-sm text-text-primary">Rappel du suivi quotidien</p>
            <p className="text-xs text-text-muted/50 mt-0.5">
              Un rappel à l'heure choisie, seulement si ton ressenti du jour n'est pas encore noté.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {dailyLogOn && (
              <TimeInput
                value={dailyLogTime}
                onChange={(v) => { setDailyLogTime(v); saveDailyLogReminder(v); }}
              />
            )}
            <Switch
              checked={dailyLogOn}
              onChange={(on) => saveDailyLogReminder(on ? dailyLogTime : null)}
              aria-label="Rappel du suivi quotidien"
            />
          </div>
        </div>
      )}

      {/* Préférences guest : nouvelles notes + tâches + demandes */}
      {isGuest && settings && (
        <GuestNotifPrefs
          notifyOnNewEntry={settings.notifyOnNewEntry}
          notifyEntryTypes={settings.notifyEntryTypes as NoteType[]}
          notifyOnTaskUpdate={settings.notifyOnTaskUpdate ?? true}
          notifyOnRequestTreated={settings.notifyOnRequestTreated ?? true}
          notifyOnReadGateDecision={settings.notifyOnReadGateDecision ?? true}
          notifyOnCapsuleUnlock={settings.notifyOnCapsuleUnlock ?? true}
          notifyOwnerComments={settings.notifyOwnerComments ?? true}
          notifyOwnerReactions={settings.notifyOwnerReactions ?? true}
          notifyMessages={settings.notifyMessages ?? true}
          notifyOwnerSecurity={settings.notifyOwnerSecurity ?? true}
          isEnabled={isEnabled}
          reminderTime={settings.reminderTime ?? null}
        />
      )}

      {/* Préférences owner : push pour les actions du confident */}
      {!isGuest && settings && (
        <OwnerNotifPrefs
          notifyOwnerComments={settings.notifyOwnerComments ?? true}
          notifyOwnerReactions={settings.notifyOwnerReactions ?? true}
          notifyOwnerTaskChanges={settings.notifyOwnerTaskChanges ?? true}
          notifyOwnerRequests={settings.notifyOwnerRequests ?? true}
          notifyOwnerSecurity={settings.notifyOwnerSecurity ?? true}
          notifyOwnerReadGate={settings.notifyOwnerReadGate ?? true}
          notifyOnCapsuleUnlock={settings.notifyOnCapsuleUnlock ?? true}
          notifyMessages={settings.notifyMessages ?? true}
          isEnabled={isEnabled}
          reminderTime={settings.reminderTime ?? null}
        />
      )}

      {/* Pause des push vers les confidents — owner only. Permet de publier
          en série, ou d'écrire pendant un événement, sans spammer son
          confident. L'in-app continue de marquer les notifs comme avant. */}
      {!isGuest && settings && (
        <PauseGuestPushToggle pauseGuestPush={settings.pauseGuestPush ?? false} />
      )}
      </>}

      {/* ── Onglet « Modes » ─────────────────────────────────────────────── */}
      {tab === 'modes' && <>
      {/* Notifications discrètes — masquer le contenu sur l'écran verrouillé */}
      {settings && (
        <DiscreetNotifPrefs
          pushDiscreet={settings.pushDiscreet ?? false}
          pushDiscreetTitle={settings.pushDiscreetTitle ?? null}
          pushDiscreetBody={settings.pushDiscreetBody ?? null}
          pushDiscreetIcon={settings.pushDiscreetIcon ?? null}
          pushDiscreetScheduled={settings.pushDiscreetScheduled ?? false}
          pushDiscreetSchedule={settings.pushDiscreetSchedule ?? []}
          isEnabled={isEnabled}
          reminderTime={settings.reminderTime ?? null}
        />
      )}

      {/* Mode silencieux — plages sans aucune notification push */}
      {settings && (
        <SilentNotifPrefs
          pushSilent={settings.pushSilent ?? false}
          pushSilentSchedule={settings.pushSilentSchedule ?? []}
          isEnabled={isEnabled}
          reminderTime={settings.reminderTime ?? null}
        />
      )}
      </>}

      {/* ── Onglet « Critiques » ─────────────────────────────────────────── */}
      {tab === 'important' && <>
      {/* Notifications importantes — exclues des modes silencieux/discret */}
      {settings && (
        <ImportantNotifPrefs
          pushImportantKinds={settings.pushImportantKinds ?? ['security']}
          isEnabled={isEnabled}
          reminderTime={settings.reminderTime ?? null}
        />
      )}
      </>}
    </SettingsCard>
  );
}

function OwnerNotifPrefs({
  notifyOwnerComments,
  notifyOwnerReactions,
  notifyOwnerTaskChanges,
  notifyOwnerRequests,
  notifyOwnerSecurity,
  notifyOwnerReadGate,
  notifyOnCapsuleUnlock,
  notifyMessages,
  isEnabled,
  reminderTime,
}: {
  notifyOwnerComments: boolean;
  notifyOwnerReactions: boolean;
  notifyOwnerTaskChanges: boolean;
  notifyOwnerRequests: boolean;
  notifyOwnerSecurity: boolean;
  notifyOwnerReadGate: boolean;
  notifyOnCapsuleUnlock: boolean;
  notifyMessages: boolean;
  isEnabled: boolean;
  reminderTime: string | null;
}) {
  const utils = trpc.useUtils();
  const saveSettings = trpc.notifications.saveSettings.useMutation({
    onSuccess: () => utils.notifications.getSettings.invalidate(),
  });
  const save = (patch: Partial<{
    notifyOwnerComments: boolean;
    notifyOwnerReactions: boolean;
    notifyOwnerTaskChanges: boolean;
    notifyOwnerRequests: boolean;
    notifyOwnerSecurity: boolean;
    notifyOwnerReadGate: boolean;
    notifyOnCapsuleUnlock: boolean;
    notifyMessages: boolean;
  }>) => {
    saveSettings.mutate({
      enabled: isEnabled,
      reminderTime,
      notifyOwnerComments: patch.notifyOwnerComments ?? notifyOwnerComments,
      notifyOwnerReactions: patch.notifyOwnerReactions ?? notifyOwnerReactions,
      notifyOwnerTaskChanges: patch.notifyOwnerTaskChanges ?? notifyOwnerTaskChanges,
      notifyOwnerRequests: patch.notifyOwnerRequests ?? notifyOwnerRequests,
      notifyOwnerSecurity: patch.notifyOwnerSecurity ?? notifyOwnerSecurity,
      notifyOwnerReadGate: patch.notifyOwnerReadGate ?? notifyOwnerReadGate,
      notifyOnCapsuleUnlock: patch.notifyOnCapsuleUnlock ?? notifyOnCapsuleUnlock,
      notifyMessages: patch.notifyMessages ?? notifyMessages,
    });
  };
  return (
    <div className="pt-3">
      <p className="text-[11px] text-text-muted/60 uppercase tracking-wide mb-1">Push pour les actions des guests</p>
      <ToggleRow
        label="Commentaires"
        hint="Nouveaux commentaires, réponses, fils rouverts."
        value={notifyOwnerComments}
        onChange={(v) => save({ notifyOwnerComments: v })}
      />
      <ToggleRow
        label="Réactions"
        hint="Quelqu'un réagit à une de tes notes avec un emoji."
        value={notifyOwnerReactions}
        onChange={(v) => save({ notifyOwnerReactions: v })}
      />
      <ToggleRow
        label="Tâches modifiées"
        hint="Création ou modification d'une tâche par le confident."
        value={notifyOwnerTaskChanges}
        onChange={(v) => save({ notifyOwnerTaskChanges: v })}
      />
      <ToggleRow
        label="Demandes de sujet"
        hint="Quand un confident te propose un sujet à écrire."
        value={notifyOwnerRequests}
        onChange={(v) => save({ notifyOwnerRequests: v })}
      />
      <ToggleRow
        label="Verrou de lecture"
        hint="Quand un confident répond à la condition d'une note verrouillée (à valider)."
        value={notifyOwnerReadGate}
        onChange={(v) => save({ notifyOwnerReadGate: v })}
      />
      <ToggleRow
        label="Capsule temporelle ouverte"
        hint="Quand l'une de tes capsules atteint sa date (et heure) d'ouverture."
        value={notifyOnCapsuleUnlock}
        onChange={(v) => save({ notifyOnCapsuleUnlock: v })}
      />
      <ToggleRow
        label="Messagerie"
        hint="Nouveau message ou réaction dans le chat direct."
        value={notifyMessages}
        onChange={(v) => save({ notifyMessages: v })}
      />
      <ToggleRow
        label="Nouvelle connexion"
        hint="Alerte quand un autre appareil se connecte à ton compte."
        value={notifyOwnerSecurity}
        onChange={(v) => save({ notifyOwnerSecurity: v })}
      />
      {!isEnabled && (
        <p className="text-[11px] text-text-muted/50 italic pt-3">Push désactivé : tu recevras les alertes uniquement in-app (cloche).</p>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-text-muted/10">
      <div className="min-w-0">
        <p className="text-sm text-text-primary">{label}</p>
        {hint && <p className="text-xs text-text-muted/50 mt-0.5">{hint}</p>}
      </div>
      <Switch checked={value} onChange={onChange} aria-label={label} />
    </div>
  );
}

type DiscreetIconKey = 'bell' | 'cloud' | 'note' | 'calendar' | 'chat';

const DISCREET_ICONS: { key: DiscreetIconKey | null; label: string; src: string }[] = [
  { key: null, label: 'Défaut', src: '/icon-192.png' },
  { key: 'bell', label: 'Cloche', src: '/notif-icons/bell.svg' },
  { key: 'cloud', label: 'Météo', src: '/notif-icons/cloud.svg' },
  { key: 'note', label: 'Note', src: '/notif-icons/note.svg' },
  { key: 'calendar', label: 'Agenda', src: '/notif-icons/calendar.svg' },
  { key: 'chat', label: 'Message', src: '/notif-icons/chat.svg' },
];

interface ScheduleRule { days: number[]; from: string; to: string }

const SCHEDULE_DAYS: { v: number; l: string }[] = [
  { v: 1, l: 'L' }, { v: 2, l: 'M' }, { v: 3, l: 'M' }, { v: 4, l: 'J' },
  { v: 5, l: 'V' }, { v: 6, l: 'S' }, { v: 0, l: 'D' },
];

/** Éditeur de plages horaires (jours + heures, case « toute la journée »). */
function ScheduleEditor({
  schedule,
  onChange,
  hint,
}: {
  schedule: ScheduleRule[];
  onChange: (next: ScheduleRule[]) => void;
  hint?: string;
}) {
  const updateRule = (i: number, patch: Partial<ScheduleRule>) =>
    onChange(schedule.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const toggleDay = (i: number, day: number) => {
    const r = schedule[i];
    if (!r) return;
    const days = r.days.includes(day) ? r.days.filter((d) => d !== day) : [...r.days, day];
    updateRule(i, { days });
  };

  return (
    <div className="flex flex-col gap-2">
      {schedule.length === 0 && (
        <p className="text-[11px] text-text-muted/55 italic">
          Aucune plage : ajoute-en une ci-dessous.
        </p>
      )}
      {schedule.map((rule, i) => {
        const allDay = rule.from === '00:00' && rule.to === '00:00';
        return (
          <div key={i} className="bg-bg-primary rounded-lg p-2.5 flex flex-col gap-2">
            <div className="flex items-center gap-1">
              {SCHEDULE_DAYS.map((d, di) => {
                const on = rule.days.includes(d.v);
                return (
                  <button
                    key={di}
                    type="button"
                    onClick={() => toggleDay(i, d.v)}
                    className={`w-7 h-7 rounded-full text-xs transition-colors ${
                      on ? 'bg-accent text-bg-elevated' : 'bg-text-muted/10 text-text-muted'
                    }`}
                  >
                    {d.l}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => onChange(schedule.filter((_, idx) => idx !== i))}
                className="ml-auto text-text-muted/50 hover:text-danger transition-colors px-1"
                title="Supprimer la plage"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
              <span>Toute la journée</span>
              <Switch
                checked={allDay}
                onChange={(v) => updateRule(i, v
                  ? { from: '00:00', to: '00:00' }
                  : { from: '09:00', to: '18:00' })}
                aria-label="Toute la journée"
              />
            </div>
            {!allDay && (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span>de</span>
                <TimeInput value={rule.from} onChange={(v) => updateRule(i, { from: v })} />
                <span>à</span>
                <TimeInput value={rule.to} onChange={(v) => updateRule(i, { to: v })} />
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...schedule, { days: [1, 2, 3, 4, 5], from: '22:00', to: '08:00' }])}
        className="text-xs px-3 py-2 rounded-lg border border-dashed border-text-muted/25 text-text-muted hover:border-accent/50 hover:text-accent transition-colors"
      >
        + Ajouter une plage
      </button>
      {hint && <p className="text-[11px] text-text-muted/50 italic">{hint}</p>}
    </div>
  );
}

function DiscreetNotifPrefs({
  pushDiscreet,
  pushDiscreetTitle,
  pushDiscreetBody,
  pushDiscreetIcon,
  pushDiscreetScheduled,
  pushDiscreetSchedule,
  isEnabled,
  reminderTime,
}: {
  pushDiscreet: boolean;
  pushDiscreetTitle: string | null;
  pushDiscreetBody: string | null;
  pushDiscreetIcon: string | null;
  pushDiscreetScheduled: boolean;
  pushDiscreetSchedule: ScheduleRule[];
  isEnabled: boolean;
  reminderTime: string | null;
}) {
  const utils = trpc.useUtils();
  const saveSettings = trpc.notifications.saveSettings.useMutation({
    onSuccess: () => utils.notifications.getSettings.invalidate(),
  });
  const [title, setTitle] = useState(pushDiscreetTitle ?? '');
  const [body, setBody] = useState(pushDiscreetBody ?? '');
  const [schedule, setSchedule] = useState<ScheduleRule[]>(pushDiscreetSchedule);
  useEffect(() => { setTitle(pushDiscreetTitle ?? ''); }, [pushDiscreetTitle]);
  useEffect(() => { setBody(pushDiscreetBody ?? ''); }, [pushDiscreetBody]);
  useEffect(() => { setSchedule(pushDiscreetSchedule); }, [pushDiscreetSchedule]);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const save = (patch: Partial<{
    pushDiscreet: boolean;
    pushDiscreetTitle: string | null;
    pushDiscreetBody: string | null;
    pushDiscreetIcon: DiscreetIconKey | null;
    pushDiscreetScheduled: boolean;
    pushDiscreetSchedule: ScheduleRule[];
  }>) => {
    saveSettings.mutate({
      enabled: isEnabled,
      reminderTime,
      timezone: tz,
      pushDiscreet: patch.pushDiscreet ?? pushDiscreet,
      pushDiscreetTitle: patch.pushDiscreetTitle !== undefined ? patch.pushDiscreetTitle : pushDiscreetTitle,
      pushDiscreetBody: patch.pushDiscreetBody !== undefined ? patch.pushDiscreetBody : pushDiscreetBody,
      pushDiscreetIcon: (patch.pushDiscreetIcon !== undefined
        ? patch.pushDiscreetIcon
        : pushDiscreetIcon) as DiscreetIconKey | null,
      pushDiscreetScheduled: patch.pushDiscreetScheduled ?? pushDiscreetScheduled,
      pushDiscreetSchedule: patch.pushDiscreetSchedule ?? schedule,
    });
  };

  const previewIcon = pushDiscreetIcon
    ? `/notif-icons/${pushDiscreetIcon}.svg`
    : '/icon-192.png';

  return (
    <div className="pt-1">
      <ToggleRow
        label="Notifications discrètes"
        hint="Masque le vrai contenu : la notif affiche un titre et un texte neutres de ton choix."
        value={pushDiscreet}
        onChange={(v) => save({ pushDiscreet: v })}
      />

      {pushDiscreet && (
        <div className="py-3 border-b border-text-muted/10 flex flex-col gap-3">
          <div>
            <label className="text-xs text-text-muted/60">Titre affiché</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => save({ pushDiscreetTitle: title.trim() || null })}
              placeholder="Rappel"
              maxLength={60}
              className="mt-1 w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted/60">Message affiché</label>
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onBlur={() => save({ pushDiscreetBody: body.trim() || null })}
              placeholder="Nouvelle activité"
              maxLength={120}
              className="mt-1 w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none"
            />
          </div>

          <div>
            <p className="text-xs text-text-muted/60 mb-1.5">Icône</p>
            <div className="flex flex-wrap gap-2">
              {DISCREET_ICONS.map((ic) => {
                const selected = (pushDiscreetIcon ?? null) === ic.key;
                return (
                  <button
                    key={ic.key ?? 'default'}
                    type="button"
                    onClick={() => save({ pushDiscreetIcon: ic.key })}
                    title={ic.label}
                    className={`w-11 h-11 rounded-xl overflow-hidden border-2 transition-all ${
                      selected ? 'border-accent' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={ic.src} alt={ic.label} className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aperçu */}
          <div className="flex items-center gap-3 bg-bg-primary rounded-lg p-3">
            <img src={previewIcon} alt="" className="w-10 h-10 rounded-lg shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{title.trim() || 'Rappel'}</p>
              <p className="text-xs text-text-muted/70 truncate">{body.trim() || 'Nouvelle activité'}</p>
            </div>
          </div>

          <p className="text-[11px] text-text-muted/50 italic">
            Note : ton système affiche toujours un petit libellé avec le nom de l'app. Tu peux
            renommer le raccourci de l'app sur ton téléphone pour le rendre lui aussi discret.
          </p>

          {/* Mode : toujours / selon un horaire */}
          <div>
            <p className="text-xs text-text-muted/60 mb-1.5">Quand l'appliquer</p>
            <div className="flex gap-1.5">
              {[
                { v: false, l: 'Toujours' },
                { v: true, l: 'Selon un horaire' },
              ].map((opt) => (
                <button
                  key={String(opt.v)}
                  type="button"
                  onClick={() => save({ pushDiscreetScheduled: opt.v })}
                  className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-colors ${
                    pushDiscreetScheduled === opt.v
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          {pushDiscreetScheduled && (
            <ScheduleEditor
              schedule={schedule}
              onChange={(next) => { setSchedule(next); save({ pushDiscreetSchedule: next }); }}
              hint="Pour une plage qui passe minuit, mets une heure de fin inférieure à l'heure de début (ex. 17:00 → 08:00). Hors de ces plages, les notifications affichent le vrai contenu."
            />
          )}
        </div>
      )}
    </div>
  );
}

function SilentNotifPrefs({
  pushSilent,
  pushSilentSchedule,
  isEnabled,
  reminderTime,
}: {
  pushSilent: boolean;
  pushSilentSchedule: ScheduleRule[];
  isEnabled: boolean;
  reminderTime: string | null;
}) {
  const utils = trpc.useUtils();
  const saveSettings = trpc.notifications.saveSettings.useMutation({
    onSuccess: () => utils.notifications.getSettings.invalidate(),
  });
  const [schedule, setSchedule] = useState<ScheduleRule[]>(pushSilentSchedule);
  useEffect(() => { setSchedule(pushSilentSchedule); }, [pushSilentSchedule]);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const save = (patch: Partial<{ pushSilent: boolean; pushSilentSchedule: ScheduleRule[] }>) => {
    saveSettings.mutate({
      enabled: isEnabled,
      reminderTime,
      timezone: tz,
      pushSilent: patch.pushSilent ?? pushSilent,
      pushSilentSchedule: patch.pushSilentSchedule ?? schedule,
    });
  };

  return (
    <div className="pt-1">
      <ToggleRow
        label="Mode silencieux"
        hint="Pendant les plages définies, aucune notification push n'est envoyée — prioritaire sur le mode discret. La cloche in-app reste à jour."
        value={pushSilent}
        onChange={(v) => save({ pushSilent: v })}
      />
      {pushSilent && (
        <div className="py-3 border-b border-text-muted/10">
          <ScheduleEditor
            schedule={schedule}
            onChange={(next) => { setSchedule(next); save({ pushSilentSchedule: next }); }}
            hint="Pour une plage qui passe minuit, mets une heure de fin inférieure à l'heure de début (ex. 22:00 → 08:00). Sans aucune plage, rien n'est mis en silencieux."
          />
        </div>
      )}
    </div>
  );
}

type ImportantKind = 'comment' | 'reaction' | 'task' | 'request' | 'entry' | 'message' | 'security' | 'readGate' | 'capsule';

const IMPORTANT_KINDS: { key: ImportantKind; label: string }[] = [
  { key: 'security', label: 'Connexion à un nouvel appareil' },
  { key: 'message', label: 'Messages directs' },
  { key: 'comment', label: 'Commentaires' },
  { key: 'reaction', label: 'Réactions' },
  { key: 'task', label: 'Tâches' },
  { key: 'request', label: 'Demandes' },
  { key: 'entry', label: 'Nouvelles notes' },
  { key: 'readGate', label: 'Verrou de lecture' },
  { key: 'capsule', label: 'Capsule ouverte' },
];

function ImportantNotifPrefs({
  pushImportantKinds,
  isEnabled,
  reminderTime,
}: {
  pushImportantKinds: string[];
  isEnabled: boolean;
  reminderTime: string | null;
}) {
  const utils = trpc.useUtils();
  const saveSettings = trpc.notifications.saveSettings.useMutation({
    onSuccess: () => utils.notifications.getSettings.invalidate(),
  });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const toggle = (key: ImportantKind) => {
    const next = pushImportantKinds.includes(key)
      ? pushImportantKinds.filter((k) => k !== key)
      : [...pushImportantKinds, key];
    saveSettings.mutate({
      enabled: isEnabled,
      reminderTime,
      timezone: tz,
      pushImportantKinds: next as ImportantKind[],
    });
  };

  return (
    <div className="pt-3">
      <p className="text-[11px] text-text-muted/60 uppercase tracking-wide mb-1">Notifications importantes</p>
      <p className="text-xs text-text-muted/50 mb-1">
        Ces types passent toujours, en clair — ils ignorent les modes silencieux et discret.
      </p>
      {IMPORTANT_KINDS.map((k) => (
        <ToggleRow
          key={k.key}
          label={k.label}
          value={pushImportantKinds.includes(k.key)}
          onChange={() => toggle(k.key)}
        />
      ))}
    </div>
  );
}

function GuestNotifPrefs({
  notifyOnNewEntry,
  notifyEntryTypes,
  notifyOnTaskUpdate,
  notifyOnRequestTreated,
  notifyOnReadGateDecision,
  notifyOnCapsuleUnlock,
  notifyOwnerComments,
  notifyOwnerReactions,
  notifyMessages,
  notifyOwnerSecurity,
  isEnabled,
  reminderTime,
}: {
  notifyOnNewEntry: boolean;
  notifyEntryTypes: NoteType[];
  notifyOnTaskUpdate: boolean;
  notifyOnRequestTreated: boolean;
  notifyOnReadGateDecision: boolean;
  notifyOnCapsuleUnlock: boolean;
  notifyOwnerComments: boolean;
  notifyOwnerReactions: boolean;
  notifyMessages: boolean;
  notifyOwnerSecurity: boolean;
  isEnabled: boolean;
  reminderTime: string | null;
}) {
  const utils = trpc.useUtils();
  const saveSettings = trpc.notifications.saveSettings.useMutation({
    onSuccess: () => utils.notifications.getSettings.invalidate(),
  });

  const save = (patch: {
    notifyOnNewEntry?: boolean;
    notifyEntryTypes?: NoteType[];
    notifyOnTaskUpdate?: boolean;
    notifyOnRequestTreated?: boolean;
    notifyOnReadGateDecision?: boolean;
    notifyOnCapsuleUnlock?: boolean;
    notifyOwnerComments?: boolean;
    notifyOwnerReactions?: boolean;
    notifyMessages?: boolean;
    notifyOwnerSecurity?: boolean;
  }) => {
    saveSettings.mutate({
      enabled: isEnabled,
      reminderTime,
      notifyOnNewEntry: patch.notifyOnNewEntry ?? notifyOnNewEntry,
      // Les types custom ne sont pas (encore) suivables individuellement : on les
      // exclut de l'envoi (l'UI ne liste que les types built-in).
      notifyEntryTypes: (patch.notifyEntryTypes ?? notifyEntryTypes).filter(
        (t): t is Exclude<NoteType, 'CUSTOM'> => t !== 'CUSTOM',
      ),
      notifyOnTaskUpdate: patch.notifyOnTaskUpdate ?? notifyOnTaskUpdate,
      notifyOnRequestTreated: patch.notifyOnRequestTreated ?? notifyOnRequestTreated,
      notifyOnReadGateDecision: patch.notifyOnReadGateDecision ?? notifyOnReadGateDecision,
      notifyOnCapsuleUnlock: patch.notifyOnCapsuleUnlock ?? notifyOnCapsuleUnlock,
      notifyOwnerComments: patch.notifyOwnerComments ?? notifyOwnerComments,
      notifyOwnerReactions: patch.notifyOwnerReactions ?? notifyOwnerReactions,
      notifyMessages: patch.notifyMessages ?? notifyMessages,
      notifyOwnerSecurity: patch.notifyOwnerSecurity ?? notifyOwnerSecurity,
    });
  };

  const toggleType = (t: NoteType) => {
    const next = notifyEntryTypes.includes(t)
      ? notifyEntryTypes.filter((x) => x !== t)
      : [...notifyEntryTypes, t];
    save({ notifyEntryTypes: next });
  };

  return (
    <div className="pt-3">
      <p className="text-[11px] text-text-muted/60 uppercase tracking-wide mb-1">Types de notifications</p>
      <ToggleRow
        label="Nouvelles notes publiées"
        hint="Alerte à la publication, pas pendant les brouillons."
        value={notifyOnNewEntry}
        onChange={(v) => save({ notifyOnNewEntry: v })}
      />

      {notifyOnNewEntry && (
        <div className="py-3 border-b border-text-muted/10">
          <p className="text-xs text-text-muted/60 mb-2">Types de notes à suivre</p>
          <div className="flex flex-wrap gap-1.5">
            {NOTE_TYPE_CONFIG.map((cfg) => {
              const active = notifyEntryTypes.includes(cfg.value);
              return (
                <button
                  key={cfg.value}
                  type="button"
                  onClick={() => toggleType(cfg.value)}
                  className={
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
                    (active ? 'border-transparent font-medium' : 'bg-transparent border-text-muted/15 text-text-muted hover:border-text-muted/30')
                  }
                  style={active ? { backgroundColor: noteTint(cfg.color, 13), color: cfg.color, borderColor: noteTint(cfg.color, 25) } : {}}
                >
                  <cfg.Icon className="w-3.5 h-3.5 shrink-0" /> {cfg.label}
                </button>
              );
            })}
          </div>
          {notifyEntryTypes.length === 0 && (
            <p className="text-[11px] text-text-muted/50 mt-2 italic">Aucun type sélectionné — aucune notif ne partira.</p>
          )}
        </div>
      )}

      <ToggleRow
        label="Tâches traitées"
        hint="Quand une tâche que tu as créée passe à « fait » ou « annulé »."
        value={notifyOnTaskUpdate}
        onChange={(v) => save({ notifyOnTaskUpdate: v })}
      />

      <ToggleRow
        label="Demandes traitées"
        hint="Quand une demande que tu as faite est traitée ou refusée."
        value={notifyOnRequestTreated}
        onChange={(v) => save({ notifyOnRequestTreated: v })}
      />

      <ToggleRow
        label="Verrou de lecture"
        hint="Quand l'auteur accepte ou refuse ta réponse à une note verrouillée."
        value={notifyOnReadGateDecision}
        onChange={(v) => save({ notifyOnReadGateDecision: v })}
      />

      <ToggleRow
        label="Capsule temporelle ouverte"
        hint="Quand une capsule partagée avec toi atteint sa date d'ouverture."
        value={notifyOnCapsuleUnlock}
        onChange={(v) => save({ notifyOnCapsuleUnlock: v })}
      />

      <ToggleRow
        label="Commentaires"
        hint="Quand on répond à un de tes commentaires."
        value={notifyOwnerComments}
        onChange={(v) => save({ notifyOwnerComments: v })}
      />

      <ToggleRow
        label="Réactions"
        hint="Quand quelqu'un réagit à un de tes commentaires."
        value={notifyOwnerReactions}
        onChange={(v) => save({ notifyOwnerReactions: v })}
      />

      <ToggleRow
        label="Messagerie"
        hint="Nouveau message ou réaction dans le chat direct."
        value={notifyMessages}
        onChange={(v) => save({ notifyMessages: v })}
      />

      <ToggleRow
        label="Nouvelle connexion"
        hint="Alerte quand un autre appareil se connecte à ton compte."
        value={notifyOwnerSecurity}
        onChange={(v) => save({ notifyOwnerSecurity: v })}
      />

      {!isEnabled && (
        <p className="text-[11px] text-text-muted/50 italic pt-3">Push désactivé : tu recevras les alertes uniquement in-app (cloche).</p>
      )}
    </div>
  );
}

/**
 * Toggle Owner-only : pause toutes les notifs push envoyées aux confidents.
 * Pratique pour publier plusieurs notes d'affilée sans spammer, ou pour
 * écrire pendant un événement (anniversaire, voyage…) sans déclencher des
 * push pour chaque petite mise à jour.
 *
 * Important : les confidents continuent de voir l'activité dans leur cloche
 * in-app (l'événement SSE reste émis) — seul le push OS de leur téléphone
 * est suspendu. Donc rien n'est perdu, juste plus discret.
 */
function PauseGuestPushToggle({ pauseGuestPush }: { pauseGuestPush: boolean }) {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.notifications.getSettings.useQuery();
  const save = trpc.notifications.saveSettings.useMutation({
    onSuccess: () => utils.notifications.getSettings.invalidate(),
  });
  const onChange = (v: boolean) => {
    // `enabled` + `reminderTime` sont requis par le schéma de saveSettings —
    // on relit les valeurs courantes pour ne pas les écraser accidentellement.
    save.mutate({
      enabled: settings?.enabled ?? false,
      reminderTime: settings?.reminderTime ?? null,
      pauseGuestPush: v,
    });
  };
  return (
    <section className="bg-bg-elevated rounded-2xl px-6 py-5 shadow-soft mt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-text-primary">Pause des push confident</h2>
          <p className="text-xs text-text-muted/70 mt-1 leading-relaxed">
            Suspend temporairement <strong>toutes les notifications push</strong> envoyées à
            tes confidents (commentaires, capsules, verrou, nouvelle publication…). Ils
            continuent à voir l'activité dans leur cloche in-app — rien ne sonne sur leur
            téléphone tant que la pause est active.
          </p>
        </div>
        {/* Couleur warning (au lieu d'accent par défaut) pour signaler qu'il
            s'agit d'un état "spécial" qui mérite l'œil. */}
        <Switch
          checked={pauseGuestPush}
          onChange={onChange}
          activeClass="bg-warning"
          aria-label="Pause des push confident"
        />
      </div>
      {pauseGuestPush && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-warning/10 border border-warning/25 text-[11px] text-text-primary leading-relaxed">
          ⏸ Push confident en pause. N'oublie pas de le réactiver quand tu veux
          que tes confidents reçoivent à nouveau les alertes sur leur téléphone.
        </div>
      )}
    </section>
  );
}
