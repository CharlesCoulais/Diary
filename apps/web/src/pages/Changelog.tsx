import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { PageHeader } from '../components/PageHeader';
import { BottomNav } from '../components/BottomNav';
import { markChangelogSeen } from '../lib/changelogSeen';

// Le suivi « dernière version vue » vit dans lib/changelogSeen.ts (léger, sans
// `marked`), réexporté ici pour les importateurs existants (Settings/GuestSettings).
export { useHasUnseenChangelog } from '../lib/changelogSeen';

interface Section {
  version: string;
  date: string | null;
  bodyMd: string;
}

/** Parse le markdown en sections par ## version — date */
function parseSections(md: string): Section[] {
  const lines = md.split('\n');
  const out: Section[] = [];
  let current: Section | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+([^—\-]+)(?:[—\-]\s*(.+))?\s*$/);
    if (m) {
      if (current) out.push(current);
      current = { version: m[1]!.trim(), date: m[2]?.trim() ?? null, bodyMd: '' };
    } else if (current) {
      current.bodyMd += line + '\n';
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Contenu du changelog sans wrapper de page (titre/BottomNav). Utilisé tel
 * quel par la `ChangelogPage` plein écran, et embarqué dans la colonne droite
 * des Réglages.
 */
export function ChangelogContent() {
  const [md, setMd] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/changelog.md')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.text();
      })
      .then(setMd)
      .catch(() => setError(true));
  }, []);

  const sections = useMemo(() => (md ? parseSections(md) : []), [md]);

  useEffect(() => {
    if (sections[0]) markChangelogSeen(sections[0].version);
  }, [sections]);

  return (
    <>
      {error && (
        <p className="text-sm text-text-muted/70 italic">Impossible de charger les nouveautés.</p>
      )}
      {!error && !md && (
        <p className="text-sm text-text-muted/55 italic">Chargement…</p>
      )}
      {sections.length === 0 && md && (
        <p className="text-sm text-text-muted/70 italic">Aucune note de version pour l'instant.</p>
      )}
      <div className="flex flex-col gap-6">
        {sections.map((s, i) => (
          <section key={s.version + i} className="bg-bg-elevated rounded-2xl px-6 py-5 shadow-soft">
            <header className="mb-3">
              <h2 className="font-serif text-2xl text-text-primary tracking-tight">{s.version}</h2>
              {s.date && (
                <p className="text-xs text-text-muted/60 mt-0.5 uppercase tracking-widest">{s.date}</p>
              )}
            </header>
            <div
              className="help-prose"
              dangerouslySetInnerHTML={{ __html: marked.parse(s.bodyMd, { breaks: true, gfm: true }) as string }}
            />
          </section>
        ))}
      </div>
    </>
  );
}

export function ChangelogPage() {
  return (
    <div className="min-h-dvh pb-16 sm:pb-24 max-w-2xl mx-auto lg:max-w-none lg:px-12">
      <PageHeader title="Nouveautés" subtitle="Mises à jour de l'app" backTo="/" />
      <div className="px-6 pb-6">
        <ChangelogContent />
      </div>
      <BottomNav />
    </div>
  );
}
