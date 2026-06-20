import type { ReactNode } from 'react';

/**
 * Carte standard d'une section de Réglages — convention unique (SET-03/04).
 *
 * Le **titre de la section** est fourni par le chrome de la page Réglages
 * (libellé de la ligne dans la liste + en-tête `<h1>` de la colonne détail), donc
 * on NE rend PAS de `<h2>` de titre principal ici : ça évitait le doublon
 * « Code PIN » (h1) + « CODE PIN » (h2) en vue détail (SET-03).
 *
 * `title` reste disponible UNIQUEMENT pour les **sous-sections** d'une page qui
 * empile plusieurs cartes (ex. Notifications, préférences d'affichage), où le
 * titre n'est pas un doublon du libellé de section mais un vrai sous-titre.
 */
export function SettingsCard({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-bg-elevated rounded-2xl px-6 py-5 shadow-soft ${className}`}>
      {title && (
        <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-4">{title}</h2>
      )}
      {children}
    </section>
  );
}
