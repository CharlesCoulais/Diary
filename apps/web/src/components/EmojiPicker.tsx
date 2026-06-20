import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Picker emoji complet (search, catégories, skin tones, récents persistés)
 * basé sur @emoji-mart/react. La librairie + data (~250 KB) sont chargées en
 * lazy-load — coût payé seulement à la première ouverture du picker, puis
 * mises en cache par le navigateur.
 *
 * API conservée pour compat avec les call-sites existants (reactions, mood,
 * commentaires…) : `onSelect(emoji)`, `onClose()`, `triggerRef?`.
 *
 * Le picker est rendu en portal vers `document.body` quand `triggerRef` est
 * fourni — indispensable pour échapper aux stacking contexts des cartes /
 * barres sticky qui sinon le cachent.
 */

// Chargement à la demande de la librairie + des données emoji + de la
// localisation FR. **Tous trois en local** : si on passe juste `locale="fr"`
// à Picker, emoji-mart tente de fetch `https://cdn.jsdelivr.net/...` à
// l'exécution → bloqué par la CSP (et inutile, on en a déjà besoin offline).
const EmojiMartLazy = lazy(async () => {
  const [picker, data, i18nFr] = await Promise.all([
    import('@emoji-mart/react'),
    import('@emoji-mart/data'),
    import('@emoji-mart/data/i18n/fr.json'),
  ]);
  const Picker = picker.default;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Wrapped = (props: any) => (
    <Picker data={data.default} i18n={i18nFr.default} {...props} />
  );
  return { default: Wrapped };
});

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  /** Compat : ancienne prop, ignorée — le picker complet a ses propres catégories. */
  hideSuggestions?: boolean;
  /**
   * Si fourni, le picker est rendu en portal (z-index global) et positionné
   * par-dessus le déclencheur. Indispensable quand le picker doit chevaucher
   * une barre sticky ou un panneau avec `transform` qui crée un nouveau
   * stacking context.
   */
  triggerRef?: React.RefObject<HTMLElement>;
  /**
   * Mode multi-sélection : le picker NE SE FERME PAS après chaque sélection.
   * L'utilisateur peut composer une humeur multi-emoji sans avoir à rouvrir
   * le picker à chaque clic. Fermé manuellement via Esc ou clic extérieur.
   */
  keepOpenOnSelect?: boolean;
}

const PICKER_WIDTH = 352;
const PICKER_HEIGHT = 435;

export function EmojiPicker({ onSelect, onClose, triggerRef, keepOpenOnSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Position fixe calculée depuis le rect du trigger (mode portal uniquement)
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties | null>(null);
  // Détection dark/light pour le thème emoji-mart (qui n'utilise pas nos CSS vars).
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );

  // Observe les changements de thème pour les répercuter au picker pendant son ouverture.
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setTheme(root.classList.contains('dark') ? 'dark' : 'light');
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Mode portal : calcule la position fixe ancrée au trigger.
  // Recalcule au scroll/resize pour suivre le déplacement de la page.
  useLayoutEffect(() => {
    if (!triggerRef) return;
    const compute = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Horizontal : essaie de centrer sur le trigger, clamp dans le viewport.
      let left = r.left + r.width / 2 - PICKER_WIDTH / 2;
      if (left + PICKER_WIDTH > vw - margin) left = vw - PICKER_WIDTH - margin;
      if (left < margin) left = margin;

      // Vertical : préfère au-dessus si dispo, sinon en dessous, sinon clamp.
      const spaceAbove = r.top - margin;
      const spaceBelow = vh - r.bottom - margin;
      let top: number;
      if (spaceAbove >= PICKER_HEIGHT) {
        top = r.top - PICKER_HEIGHT - 4;
      } else if (spaceBelow >= PICKER_HEIGHT) {
        top = r.bottom + 4;
      } else {
        // Pas la place ni au-dessus ni en dessous → centre vertical du viewport.
        top = Math.max(margin, (vh - PICKER_HEIGHT) / 2);
      }
      setPortalStyle({ position: 'fixed', left, top, zIndex: 60 });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [triggerRef]);

  // Close on outside click (mouse + touch pour iOS) — exclut le trigger pour
  // éviter une fermeture immédiate au moment où on rouvre le picker.
  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target)) {
        if (triggerRef?.current && triggerRef.current.contains(target)) return;
        onClose();
      }
    }
    // Échap pour fermer (UX clavier).
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, triggerRef]);

  // Reçoit l'objet emoji-mart et extrait juste le caractère natif pour
  // conserver le contrat existant (onSelect(string)). En mode keepOpenOnSelect,
  // on n'auto-ferme pas — l'utilisateur peut enchaîner plusieurs emojis.
  const handleSelect = (e: { native?: string }) => {
    if (e.native) {
      onSelect(e.native);
      if (!keepOpenOnSelect) onClose();
    }
  };

  const node = (
    <div
      ref={ref}
      style={triggerRef ? (portalStyle ?? { position: 'fixed', opacity: 0, pointerEvents: 'none' }) : undefined}
      className={triggerRef
        ? 'shadow-2xl rounded-2xl overflow-hidden'
        : 'absolute z-50 bottom-full mb-1 left-0 shadow-2xl rounded-2xl overflow-hidden'}
    >
      <Suspense
        fallback={
          <div
            className="bg-bg-elevated border border-text-muted/15 rounded-2xl flex items-center justify-center text-text-muted/60 text-sm"
            style={{ width: PICKER_WIDTH, height: PICKER_HEIGHT }}
          >
            Chargement du picker…
          </div>
        }
      >
        <EmojiMartLazy
          onEmojiSelect={handleSelect}
          theme={theme}
          locale="fr"
          set="native"
          previewPosition="none"
          skinTonePosition="search"
          navPosition="top"
          perLine={9}
          emojiButtonSize={36}
          emojiSize={22}
          maxFrequentRows={2}
        />
      </Suspense>
    </div>
  );

  return triggerRef ? createPortal(node, document.body) : node;
}
