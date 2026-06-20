import { useRef, useState } from 'react';
import { EmojiPicker } from './EmojiPicker';

/**
 * Selecteur d'humeur multi-emoji.
 *
 * Design unique pour les 3 variantes (`dropdown`, `compact`, `alwaysOpen`) :
 *   - rangée des emojis déjà sélectionnés (clic = retire)
 *   - un seul bouton `+` qui ouvre le full EmojiPicker (catalogue complet,
 *     recherche, skin tones)
 *   - le picker reste ouvert sur sélection (`keepOpenOnSelect`) pour pouvoir
 *     composer une humeur multi-emoji sans ré-ouvrir à chaque clic
 *   - bouton de fermeture du picker via Esc ou clic extérieur (géré par
 *     EmojiPicker lui-même)
 *
 * Le seul truc qui varie entre variantes : la taille des emojis affichés et
 * la présence d'un label/chevron pour le mode `dropdown`.
 */

function parseEmoji(value: string | null): string[] {
  if (!value) return [];
  return [...new Intl.Segmenter().segment(value)].map((s) => s.segment);
}

export function MoodSelector({
  value,
  onChange,
  alwaysOpen = false,
  compact = false,
  dropdown = false,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  alwaysOpen?: boolean;
  compact?: boolean;
  dropdown?: boolean;
}) {
  const selected = parseEmoji(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Retire un emoji déjà sélectionné (clic sur sa pastille).
  const removeEmoji = (emoji: string) => {
    const next = selected.filter((e) => e !== emoji).join('');
    onChange(next || null);
  };

  // Ajout via le picker : ajoute si pas déjà présent, sinon le retire (toggle).
  // Le picker reste ouvert grâce à `keepOpenOnSelect`.
  const handlePick = (emoji: string) => {
    const next = selected.includes(emoji)
      ? selected.filter((e) => e !== emoji).join('')
      : [...selected, emoji].join('');
    onChange(next || null);
  };

  // ── Variante "dropdown" : un bouton qui affiche la chaîne actuelle + ✕ ───
  // Utilisé dans DailyTracker version compacte.
  if (dropdown) {
    return (
      <div className="relative inline-flex items-center gap-1.5">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label={selected.length > 0 ? 'Modifier l’humeur' : 'Ajouter une humeur'}
          className="flex items-center gap-1.5 text-sm text-left"
        >
          {selected.length > 0 ? (
            <span className="text-base leading-none tracking-wide">{selected.join('')}</span>
          ) : (
            <span className="text-base text-text-muted/55">+</span>
          )}
        </button>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] text-text-muted/55 hover:text-danger transition-colors shrink-0 px-0.5"
            aria-label="Effacer l'humeur"
          >
            ✕
          </button>
        )}
        {pickerOpen && (
          <EmojiPicker
            triggerRef={triggerRef}
            keepOpenOnSelect
            onSelect={handlePick}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    );
  }

  // ── Variantes "compact" et "alwaysOpen" : rangée + bouton + ─────────────
  // Diffèrent uniquement par la taille (7×7 vs 8×8) et le wrapping.
  const isLarge = alwaysOpen;
  const pillSize = isLarge ? 'w-8 h-8 text-xl' : 'w-7 h-7 text-base';
  const triggerSize = isLarge ? 'w-8 h-8 text-base' : 'w-7 h-7 text-sm';

  return (
    <div className={`flex items-center flex-wrap ${isLarge ? 'gap-1' : 'gap-0.5'}`}>
      {selected.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => removeEmoji(emoji)}
          title={`${emoji} — clic pour retirer`}
          className={`${pillSize} leading-none flex items-center justify-center rounded-lg bg-accent/20 ring-1 ring-accent/40 transition-all duration-100`}
        >
          {emoji}
        </button>
      ))}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        title={selected.length > 0 ? 'Ajouter un autre emoji' : 'Choisir une humeur'}
        aria-label={selected.length > 0 ? 'Ajouter un autre emoji' : 'Choisir une humeur'}
        className={`${triggerSize} flex items-center justify-center rounded-lg transition-all ${
          pickerOpen
            ? 'bg-accent/15 text-accent'
            : 'text-text-muted/55 hover:text-text-muted hover:bg-text-muted/10'
        }`}
      >
        +
      </button>
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[11px] text-text-muted/45 hover:text-danger transition-colors leading-none px-1 ml-0.5"
          aria-label="Effacer toute l'humeur"
        >
          ✕
        </button>
      )}
      {pickerOpen && (
        <EmojiPicker
          triggerRef={triggerRef}
          keepOpenOnSelect
          onSelect={handlePick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
