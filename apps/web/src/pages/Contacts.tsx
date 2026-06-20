import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { trpc, type RouterOutputs } from '../lib/trpc';
import { PageHeader } from '../components/PageHeader';
import { BottomNav } from '../components/BottomNav';
import { confirmDialog } from '../lib/dialog';
import { showToast } from '../lib/toast';
import { useModalA11y } from '../hooks/useModalA11y';
import { useBackButtonClose } from '../hooks/useBackButtonClose';
import { isoToday } from '../lib/dateHelpers';

const ACCENT = '#A8736A'; // bois de rose — identité de la page Contacts (cf. Agenda/Budget)
const NO_CAT = 'Sans catégorie'; // groupe des contacts sans lien renseigné

type Contact = RouterOutputs['contacts']['list'][number];

/** Suggestions de liens proposées dans le formulaire (datalist, non contraignant). */
const RELATION_SUGGESTIONS = ['Famille', 'Ami', 'Enfant', 'Parent', 'Conjoint·e', 'Collègue', 'Voisin·e', 'Médecin', 'Autre'];

function fullName(c: Contact): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

function initials(c: Contact): string {
  const a = c.firstName.trim()[0] ?? '';
  const b = c.lastName.trim()[0] ?? '';
  const s = (a + b).toUpperCase();
  return s || '·';
}

/** href tel: nettoyé (garde + et chiffres). */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Anniversaire : libellé lisible + âge + jours avant le prochain.
 * Dates ancrées à T12:00:00 pour éviter les décalages de fuseau (cf. dateHelpers).
 */
function birthdayInfo(iso: string | null | undefined): { label: string; age: number | null; daysUntil: number } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const label = new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const today = new Date(`${isoToday()}T12:00:00`);
  const ty = today.getFullYear();
  let next = new Date(`${ty}-${pad2(m)}-${pad2(d)}T12:00:00`);
  if (next.getTime() < today.getTime()) next = new Date(`${ty + 1}-${pad2(m)}-${pad2(d)}T12:00:00`);
  const daysUntil = Math.round((next.getTime() - today.getTime()) / 86_400_000);
  const turning = next.getFullYear() - y; // âge atteint au prochain anniversaire
  const age = turning > 0 && turning < 150 ? turning - 1 : null;
  return { label, age, daysUntil };
}

export function ContactsPage() {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });
  const isOwner = me?.role === 'OWNER';
  const { data: contacts = [], isLoading } = trpc.contacts.list.useQuery();

  const [search, setSearch] = useState('');
  // null = fermé ; { } = nouveau ; { ...contact } = édition
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);

  const upsert = trpc.contacts.upsert.useMutation({
    onSuccess: () => {
      void utils.contacts.list.invalidate();
      setEditing(null);
    },
    onError: (e) => showToast({ message: e.message || 'Enregistrement impossible', tone: 'danger' }),
  });
  const del = trpc.contacts.delete.useMutation({
    onSuccess: () => {
      void utils.contacts.list.invalidate();
      showToast({ message: 'Contact supprimé' });
    },
    onError: (e) => showToast({ message: e.message || 'Suppression impossible', tone: 'danger' }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.firstName, c.lastName, c.relation, c.phone, c.email, c.address, c.notes, c.birthday]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [contacts, search]);

  // Regroupement par lien (catégorie), trié alpha, « Sans catégorie » en dernier.
  const groups = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const c of filtered) {
      const key = c.relation?.trim() || NO_CAT;
      const arr = map.get(key) ?? (map.set(key, []), map.get(key)!);
      arr.push(c);
    }
    return [...map.entries()].sort((a, b) =>
      a[0] === NO_CAT ? 1 : b[0] === NO_CAT ? -1 : a[0].localeCompare(b[0], 'fr'),
    );
  }, [filtered]);

  // Sections repliées (par libellé de catégorie). La recherche force le dépli.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleDelete = async (c: Contact) => {
    const ok = await confirmDialog({
      title: 'Supprimer ce contact ?',
      message: `${fullName(c) || 'Ce contact'} sera retiré du carnet. Cette action est définitive.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (ok) del.mutate({ id: c.id });
  };

  return (
    <div className="min-h-dvh pb-24 max-w-2xl mx-auto lg:pb-0">
      <div className="lg:px-12 lg:pb-16">
        <PageHeader
          title="Contacts"
          subtitle={contacts.length > 0 ? `${contacts.length} contact${contacts.length > 1 ? 's' : ''}` : undefined}
          rightAction={
            isOwner ? (
              <button
                type="button"
                onClick={() => setEditing({})}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: ACCENT }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Ajouter
              </button>
            ) : undefined
          }
        />

        <div className="px-4 lg:px-0 max-w-xl mx-auto">
          {contacts.length > 0 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un contact…"
              className="w-full mb-4 bg-bg-elevated border border-text-muted/15 rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted/45 outline-none focus:border-accent/40 transition-colors"
            />
          )}

          {isLoading ? (
            <p className="text-sm text-text-muted/55 italic py-8 text-center">Chargement…</p>
          ) : contacts.length === 0 ? (
            <div className="text-center py-16">
              <p className="font-serif text-text-muted/55 text-3xl mb-3">📇</p>
              <p className="font-serif text-text-muted italic text-sm">
                {isOwner
                  ? <>Ton carnet est vide. Ajoute un premier contact avec le bouton <strong>Ajouter</strong>.</>
                  : 'Aucun contact pour le moment.'}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-text-muted/55 italic py-8 text-center">Aucun contact ne correspond à « {search} ».</p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map(([cat, items]) => {
                const isCollapsed = collapsed.has(cat) && !search.trim();
                return (
                  <div key={cat}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(cat)}
                      aria-expanded={!isCollapsed}
                      className="w-full flex items-center gap-2 py-1"
                    >
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`shrink-0 text-text-muted/50 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                      ><polyline points="6 9 12 15 18 9" /></svg>
                      <span className="font-mono text-[11px] uppercase tracking-widest font-medium" style={{ color: ACCENT }}>{cat}</span>
                      <span className="text-[11px] text-text-muted/45 tabular-nums">{items.length}</span>
                      <span className="flex-1 h-px bg-text-muted/10 ml-1" />
                    </button>
                    {!isCollapsed && (
                      <div className="flex flex-col gap-2.5 mt-2">
                        {items.map((c) => (
                          <ContactCard
                            key={c.id}
                            contact={c}
                            canEdit={!!isOwner}
                            onEdit={() => setEditing(c)}
                            onDelete={() => handleDelete(c)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <ContactFormModal
          initial={editing}
          saving={upsert.isPending}
          onCancel={() => setEditing(null)}
          onSave={(data) => upsert.mutate(data)}
        />
      )}

      <BottomNav />
    </div>
  );
}

function ContactCard({
  contact: c,
  canEdit,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const bday = birthdayInfo(c.birthday);
  const bdaySoon = bday && bday.daysUntil === 0 ? 'aujourd’hui 🎉' : bday && bday.daysUntil <= 30 ? `dans ${bday.daysUntil} j` : null;
  return (
    <div className="rounded-2xl border border-text-muted/12 bg-bg-elevated/60 p-3.5 flex gap-3">
      <div
        className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold text-white"
        style={{ backgroundColor: ACCENT }}
        aria-hidden
      >
        {initials(c)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">
            {fullName(c) || <span className="italic text-text-muted/50">Sans nom</span>}
            {c.relation && (
              <span className="ml-2 align-middle inline-block px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT }}>
                {c.relation}
              </span>
            )}
          </p>
          {canEdit && (
            <div className="shrink-0 flex items-center gap-0.5 -mt-1 -mr-1">
              <button type="button" onClick={onEdit} aria-label="Modifier" className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted/55 hover:text-accent hover:bg-accent/10 transition-colors">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
              </button>
              <button type="button" onClick={onDelete} aria-label="Supprimer" className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted/55 hover:text-danger hover:bg-danger/10 transition-colors">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              </button>
            </div>
          )}
        </div>

        <div className="mt-1 flex flex-col gap-0.5 text-[13px]">
          {c.phone && (
            <a href={telHref(c.phone)} className="inline-flex items-center gap-1.5 text-text-secondary hover:text-accent transition-colors w-fit">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-muted/55"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              {c.phone}
            </a>
          )}
          {c.email && (
            <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-text-secondary hover:text-accent transition-colors w-fit break-all">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-muted/55"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
              {c.email}
            </a>
          )}
          {c.address && (
            <span className="inline-flex items-start gap-1.5 text-text-secondary">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-text-muted/55"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              <span className="whitespace-pre-wrap">{c.address}</span>
            </span>
          )}
          {bday && (
            <span className="inline-flex items-center gap-1.5 text-text-secondary">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-muted/55"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 3h.01M17 4h.01" /></svg>
              <span>
                {bday.label}
                {bday.age !== null && <span className="text-text-muted/60"> · {bday.age} ans</span>}
                {bdaySoon && <span className="ml-1.5 font-medium" style={{ color: ACCENT }}>{bdaySoon}</span>}
              </span>
            </span>
          )}
          {c.notes && (
            <p className="mt-1 text-xs text-text-muted/75 italic whitespace-pre-wrap leading-relaxed">{c.notes}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Champ libellé + input/textarea, état local. */
function Field({
  label,
  value,
  onChange,
  type = 'text',
  textarea,
  placeholder,
  list,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  textarea?: boolean;
  placeholder?: string;
  list?: string;
  autoFocus?: boolean;
}) {
  const cls = 'w-full bg-bg-primary border border-text-muted/15 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/40 transition-colors';
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-text-muted/70">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className={cls + ' resize-none'} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} list={list} autoFocus={autoFocus} className={cls} />
      )}
    </label>
  );
}

function ContactFormModal({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: Partial<Contact>;
  saving: boolean;
  onCancel: () => void;
  onSave: (data: {
    id?: string;
    firstName: string;
    lastName: string;
    relation: string;
    phone: string;
    email: string;
    address: string;
    notes: string;
    birthday: string;
  }) => void;
}) {
  useBackButtonClose(true, onCancel);
  const panelRef = useModalA11y<HTMLDivElement>(onCancel);

  const [firstName, setFirstName] = useState(initial.firstName ?? '');
  const [lastName, setLastName] = useState(initial.lastName ?? '');
  const [relation, setRelation] = useState(initial.relation ?? '');
  const [birthday, setBirthday] = useState(initial.birthday ?? '');
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [email, setEmail] = useState(initial.email ?? '');
  const [address, setAddress] = useState(initial.address ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');

  const canSave = !!(firstName.trim() || lastName.trim()) && !saving;

  const submit = () => {
    if (!canSave) return;
    onSave({ id: initial.id, firstName, lastName, relation, phone, email, address, notes, birthday });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0, 0, 0, 0.4)', paddingTop: 'env(safe-area-inset-top)' }}
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-form-title"
        className="bg-bg-elevated rounded-t-2xl sm:rounded-2xl shadow-soft w-full sm:max-w-md max-h-[88dvh] overflow-y-auto p-5 outline-none"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="contact-form-title" className="text-base font-medium text-text-primary mb-4">
          {initial.id ? 'Modifier le contact' : 'Nouveau contact'}
        </h3>

        <datalist id="relation-suggestions">
          {RELATION_SUGGESTIONS.map((r) => <option key={r} value={r} />)}
        </datalist>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom" value={firstName} onChange={setFirstName} placeholder="Marie" autoFocus />
            <Field label="Nom" value={lastName} onChange={setLastName} placeholder="Dupont" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lien" value={relation} onChange={setRelation} placeholder="Famille, ami…" list="relation-suggestions" />
            <Field label="Anniversaire" value={birthday} onChange={setBirthday} type="date" />
          </div>
          <Field label="Téléphone" value={phone} onChange={setPhone} type="tel" placeholder="06 12 34 56 78" />
          <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="marie@exemple.fr" />
          <Field label="Adresse" value={address} onChange={setAddress} textarea placeholder="12 rue des Lilas, 75011 Paris" />
          <Field label="Notes" value={notes} onChange={setNotes} textarea placeholder="Infos utiles, allergies…" />
        </div>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm text-text-muted border border-text-muted/20 hover:border-text-muted/40 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSave}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: ACCENT }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
