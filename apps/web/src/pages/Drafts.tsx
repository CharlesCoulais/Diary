import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db/schema';
import { formatDateLong } from '../lib/dateHelpers';
import { useSyncContext } from '../lib/sync/SyncProvider';
import { EntryCard } from '../components/EntryCard';
import { BottomNav } from '../components/BottomNav';
import { BackToTop } from '../components/BackToTop';
import { PageHeader } from '../components/PageHeader';

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: diffDays > 365 ? 'numeric' : undefined });
}

export function DraftsPage() {
  const { sync } = useSyncContext();

  const drafts = useLiveQuery(
    () => db.entries.filter((e) => !!e.isDraft && !e.deletedAt && !e.collectionOnly).toArray(),
    [],
  ) ?? [];

  const sorted = [...drafts].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  // ── Desktop 3-column : entry read panel ───────────────────────────────────
  const [activeDesktopEntryId, setActiveDesktopEntryId] = useState<string | null>(null);
  // Le panel a été ouvert via la bulle 💬 → lecture scrollée sur les commentaires.
  const [desktopOpenToComments, setDesktopOpenToComments] = useState(false);
  const activeDesktopEntry = sorted.find((e) => e.id === activeDesktopEntryId) ?? null;

  return (
    <div className="min-h-dvh pb-24 max-w-2xl mx-auto lg:max-w-none lg:mx-0 lg:px-0 lg:pb-0 lg:flex lg:items-start">

      {/* Left column */}
      <div className={`lg:min-h-dvh lg:min-w-0 lg:pb-16 ${activeDesktopEntryId ? 'lg:w-[520px] lg:shrink-0' : 'lg:flex-1'} lg:px-12`}>

        <PageHeader
          title="Brouillons"
          backTo="/"
          subtitle={sorted.length > 0 ? `${sorted.length} note${sorted.length > 1 ? 's' : ''}` : undefined}
        />

        <div className="px-4 lg:px-0">
          {sorted.length === 0 ? (
            <div className="text-center py-16">
              <p className="font-serif text-text-muted/55 text-3xl mb-3">✦</p>
              <p className="font-serif text-text-muted italic text-sm">Aucun brouillon en cours.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sorted.map((entry) => (
                <div key={entry.id}>
                  <p className="text-[11px] text-text-muted/55 mb-1.5 ml-1">
                    modifié {formatRelativeDate(entry.updatedAt).toLowerCase()} · {formatDateLong(entry.date)}
                  </p>
                  <div className={`lg:rounded-2xl lg:transition-colors ${activeDesktopEntryId === entry.id ? 'lg:ring-2 lg:ring-accent/40 lg:ring-offset-2 lg:ring-offset-bg-primary' : ''}`}>
                    <EntryCard
                      entry={entry}
                      onSave={sync}
                      onDesktopClick={(opts) => {
                        setDesktopOpenToComments(!!opts?.comments);
                        setActiveDesktopEntryId(entry.id);
                      }}
                      compact={!!activeDesktopEntryId}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <BackToTop />
        <BottomNav />
      </div>

      {/* Right panel — desktop entry read view */}
      {activeDesktopEntry && (
        <div data-right-panel className="hidden lg:flex lg:flex-col lg:flex-1 lg:sticky lg:top-0 lg:self-start lg:h-dvh lg:border-l lg:border-text-muted/10 lg:overflow-hidden">
          <EntryCard
            key={activeDesktopEntry.id}
            entry={activeDesktopEntry}
            defaultOpen
            desktopPanel
            openToComments={desktopOpenToComments}
            onModalClose={() => { setDesktopOpenToComments(false); setActiveDesktopEntryId(null); }}
            onSave={sync}
          />
        </div>
      )}

    </div>
  );
}
