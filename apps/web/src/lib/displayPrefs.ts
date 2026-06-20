import { useState, useCallback, useEffect } from 'react';
import type { NoteType } from '../components/NoteTypePicker';
import type { LocalTask } from './db/schema';

/** Mode de tri pour Aujourd'hui / Journal — partagé Owner et Guest. */
export type SortMode = 'time-desc' | 'time-asc' | 'updated-desc' | 'updated-asc';

/** Statuts sélectionnés (tableau vide = tous) */
export type TaskStatusFilter = LocalTask['status'][];
/** Priorités sélectionnées — '__none__' représente les tâches sans priorité (tableau vide = toutes) */
export type TaskPriorityFilter = string[];

export interface TaskDisplayPrefs {
  defaultStatusFilter: TaskStatusFilter;
  defaultPriorityFilter: TaskPriorityFilter;
  hideCompleted: boolean;
  sortBy: 'manual' | 'priority' | 'dueDate' | 'createdAt' | 'status';
  categoryOrder: string[];
}

/** Vue par défaut sur la page Fil (activité commentaires). */
export type FilDefaultView = 'all' | 'to-reply' | 'replied' | 'closed';

export interface OwnerDisplayPrefs {
  hideDrafts: boolean;
  hideAdult: boolean;
  /**
   * Masque par défaut les notes que **l'utilisateur courant** a marquées
   * « à oublier » (rating LOW posée par soi). Indépendant des notations
   * des confidents. Le filtre s'applique sur Aujourd'hui / Journal /
   * Timeline ; il peut toujours être contourné ponctuellement via les
   * pills de la barre de filtres.
   */
  hideMyForgotten: boolean;
  defaultTypes: NoteType[];
  toolbarPosition: 'top' | 'bottom';
  filDefaultView: FilDefaultView;
  /**
   * Mode compact par page (le toggle dans la barre des filtres bascule celui
   * de la page courante, et les réglages permettent de les définir
   * indépendamment).
   *   - `compactToday`   = page Aujourd'hui (Home)
   *   - `compactJournal` = page Journal (Timeline)
   */
  compactToday: boolean;
  compactJournal: boolean;
  /**
   * Tri **par défaut** des notes sur Aujourd'hui / Journal (Owner).
   * S'applique aux pages où l'utilisateur n'a pas encore choisi un tri via
   * le SortPicker (qui persiste ensuite par page dans `journal-sort` /
   * `timeline-sort`). Changer ce réglage n'écrase pas les choix déjà faits.
   */
  defaultSortMode: SortMode;
}

/** Mode d'affichage par défaut pour le confident : un seul focus à la fois. */
export type GuestFocus = 'all' | 'unread' | 'edits' | 'forMe';

export interface GuestDisplayPrefs {
  hideDrafts: boolean;
  hideAdult: boolean;
  /** Cf. `OwnerDisplayPrefs.hideMyForgotten` — masque les notes que le
   *  confident lui-même a marquées « à oublier » (sa rating LOW). */
  hideMyForgotten: boolean;
  focus: GuestFocus;
  defaultTypes: NoteType[];
  filDefaultView: FilDefaultView;
  /**
   * Mode compact par page côté confident.
   *   - `compactToday`   = page Aujourd'hui (GuestDay)
   *   - `compactJournal` = page Journal (GuestHome)
   */
  compactToday: boolean;
  compactJournal: boolean;
  /**
   * Tri par défaut sur le Journal du confident. Cf. note sur OwnerDisplayPrefs.
   */
  defaultSortMode: SortMode;
}

const OWNER_KEY = 'owner-display-prefs';
const GUEST_KEY = 'guest-display-prefs';
const TASK_KEY = 'task-display-prefs';

// Events custom — l'event `storage` natif ne fire que dans les AUTRES onglets,
// jamais celui qui a fait le `setItem`. Pour qu'une page (Timeline, Home,
// GuestHome…) qui écoute soit synchrone avec un changement venant de la
// section Réglages du même onglet, on dispatch en plus un CustomEvent qui
// passe l'origine actuelle.
const OWNER_PREFS_EVENT = 'owner-display-prefs-changed';
const GUEST_PREFS_EVENT = 'guest-display-prefs-changed';

/** S'abonne aux changements de prefs Owner (storage cross-tab + custom same-tab + pageshow bfcache). */
export function subscribeOwnerPrefs(handler: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === OWNER_KEY) handler(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(OWNER_PREFS_EVENT, handler);
  window.addEventListener('pageshow', handler);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(OWNER_PREFS_EVENT, handler);
    window.removeEventListener('pageshow', handler);
  };
}

/** Idem côté Confident. */
export function subscribeGuestPrefs(handler: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === GUEST_KEY) handler(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(GUEST_PREFS_EVENT, handler);
  window.addEventListener('pageshow', handler);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(GUEST_PREFS_EVENT, handler);
    window.removeEventListener('pageshow', handler);
  };
}

export const OWNER_PREFS_DEFAULTS: OwnerDisplayPrefs = { hideDrafts: false, hideAdult: false, hideMyForgotten: false, defaultTypes: [], toolbarPosition: 'top', filDefaultView: 'all', compactToday: false, compactJournal: false, defaultSortMode: 'time-desc' };
export const GUEST_PREFS_DEFAULTS: GuestDisplayPrefs = { hideDrafts: false, hideAdult: false, hideMyForgotten: false, focus: 'all', defaultTypes: [], filDefaultView: 'all', compactToday: false, compactJournal: false, defaultSortMode: 'time-desc' };
export const TASK_PREFS_DEFAULTS: TaskDisplayPrefs = { defaultStatusFilter: [], defaultPriorityFilter: [], hideCompleted: false, sortBy: 'manual', categoryOrder: [] };

function readPrefs<T>(key: string, defaults: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
  } catch {
    return defaults;
  }
}

export function getOwnerDisplayPrefs(): OwnerDisplayPrefs {
  const raw = readPrefs(OWNER_KEY, OWNER_PREFS_DEFAULTS) as OwnerDisplayPrefs & { compactMode?: boolean };
  // Migration : ancien `compactMode` unique → applique aux deux pages.
  if (raw.compactMode !== undefined) {
    if (raw.compactToday === undefined) raw.compactToday = raw.compactMode;
    if (raw.compactJournal === undefined) raw.compactJournal = raw.compactMode;
    delete raw.compactMode;
  }
  return raw;
}

export function getGuestDisplayPrefs(): GuestDisplayPrefs {
  const raw = readPrefs(GUEST_KEY, GUEST_PREFS_DEFAULTS) as GuestDisplayPrefs & { unreadOnly?: boolean; editOnly?: boolean; forMeOnly?: boolean; compactMode?: boolean };
  // Migration depuis l'ancien format (3 booleans → focus unique). Priorité : forMe > edits > unread.
  if (raw.focus === undefined) {
    if (raw.forMeOnly) raw.focus = 'forMe';
    else if (raw.editOnly) raw.focus = 'edits';
    else if (raw.unreadOnly) raw.focus = 'unread';
    else raw.focus = 'all';
  }
  delete raw.unreadOnly;
  delete raw.editOnly;
  delete raw.forMeOnly;
  // Migration : ancien `compactMode` unique → applique aux deux pages.
  if (raw.compactMode !== undefined) {
    if (raw.compactToday === undefined) raw.compactToday = raw.compactMode;
    if (raw.compactJournal === undefined) raw.compactJournal = raw.compactMode;
    delete raw.compactMode;
  }
  return raw;
}

export function useOwnerDisplayPrefs(): [OwnerDisplayPrefs, (patch: Partial<OwnerDisplayPrefs>) => void] {
  const [prefs, setPrefs] = useState<OwnerDisplayPrefs>(() => getOwnerDisplayPrefs());
  // Re-synchronise quand un autre composant (Réglages typiquement) modifie les
  // prefs — ou quand on revient sur la page via bfcache (Android PWA + iOS).
  useEffect(() => subscribeOwnerPrefs(() => setPrefs(getOwnerDisplayPrefs())), []);
  const update = useCallback((patch: Partial<OwnerDisplayPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(OWNER_KEY, JSON.stringify(next)); }
      catch (err) { console.error('[displayPrefs] localStorage write failed', err); }
      // Notifie les autres consumers du même onglet (l'event `storage` natif
      // ne fire que dans les autres onglets).
      window.dispatchEvent(new Event(OWNER_PREFS_EVENT));
      return next;
    });
  }, []);
  return [prefs, update];
}

/**
 * Écrit un patch dans les prefs Confident **hors hook** (ex. depuis un toggle de
 * barre de filtres). Lit l'état courant, fusionne, persiste et notifie les
 * consumers same-tab via l'event custom. À utiliser quand on n'a pas le couple
 * [prefs, update] du hook sous la main.
 */
export function patchGuestDisplayPrefs(patch: Partial<GuestDisplayPrefs>): void {
  const next = { ...getGuestDisplayPrefs(), ...patch };
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(next)); }
  catch (err) { console.error('[displayPrefs] localStorage write failed', err); }
  window.dispatchEvent(new Event(GUEST_PREFS_EVENT));
}

export function useGuestDisplayPrefs(): [GuestDisplayPrefs, (patch: Partial<GuestDisplayPrefs>) => void] {
  const [prefs, setPrefs] = useState<GuestDisplayPrefs>(() => getGuestDisplayPrefs());
  useEffect(() => subscribeGuestPrefs(() => setPrefs(getGuestDisplayPrefs())), []);
  const update = useCallback((patch: Partial<GuestDisplayPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(GUEST_KEY, JSON.stringify(next)); }
      catch (err) { console.error('[displayPrefs] localStorage write failed', err); }
      window.dispatchEvent(new Event(GUEST_PREFS_EVENT));
      return next;
    });
  }, []);
  return [prefs, update];
}

export function getTaskDisplayPrefs(): TaskDisplayPrefs {
  const prefs = readPrefs(TASK_KEY, TASK_PREFS_DEFAULTS);
  // Migrate from old single-value string format to array
  if (!Array.isArray(prefs.defaultStatusFilter)) prefs.defaultStatusFilter = [];
  if (!Array.isArray(prefs.defaultPriorityFilter)) prefs.defaultPriorityFilter = [];
  return prefs;
}

export function useTaskDisplayPrefs(): [TaskDisplayPrefs, (patch: Partial<TaskDisplayPrefs>) => void] {
  const [prefs, setPrefs] = useState<TaskDisplayPrefs>(() => getTaskDisplayPrefs());
  const update = useCallback((patch: Partial<TaskDisplayPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(TASK_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return [prefs, update];
}
