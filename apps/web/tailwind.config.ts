import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  future: {
    // Les classes `hover:` ne s'appliquent QUE sur les devices avec un vrai pointeur
    // (souris, trackpad). Évite l'effet "hover qui reste collé" après un tap sur mobile.
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'rgb(var(--color-bg-primary-rgb) / <alpha-value>)',
          elevated: 'rgb(var(--color-bg-elevated-rgb) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--color-text-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary-rgb) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted-rgb) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
          soft: 'rgb(var(--color-accent-soft-rgb) / <alpha-value>)',
        },
        success: 'rgb(var(--color-success-rgb) / <alpha-value>)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-error)',
        guest: 'rgb(var(--color-guest-rgb) / <alpha-value>)',
        // Tokens sémantiques par statut de note.
        sealed: 'rgb(var(--color-sealed-rgb) / <alpha-value>)',
        adult:  'rgb(var(--color-adult-rgb) / <alpha-value>)',
        secret: 'rgb(var(--color-secret-rgb) / <alpha-value>)',
        test:   'rgb(var(--color-test-rgb) / <alpha-value>)',
        annotation: {
          DEFAULT: 'var(--color-annotation)',
          hover: 'var(--color-annotation-hover)',
          open: 'var(--color-annotation-open)',
          pending: 'var(--color-annotation-pending)',
          ring: 'var(--color-annotation-ring)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      // Échelle de texte redéfinie en REM avec des multiplicateurs RELEVÉS.
      // Le root `html` (12px par défaut, mais réglable Compact/Normal/Confort/
      // Grand via `lib/fontSize.ts`) scale toute l'UI : on GARDE donc le rem pour
      // que ce réglage d'échelle par appareil continue de fonctionner. Mais les
      // valeurs Tailwind par défaut donnaient text-xs=9px / text-sm=10,5px à 12px
      // → sous le seuil de lisibilité. On remonte le plancher SANS gonfler les
      // formulaires/dialogues compacts (niveau « conservateur », ajusté après
      // retour visuel : « modéré » paraissait démesuré dans les inputs/popovers).
      // À « Normal » (12px) : text-xs=11px, text-sm=12px, text-base=13,5px (et ça
      // re-scale avec les autres réglages). 3xl+ gardent le défaut Tailwind →
      // titres ~inchangés. Line-heights unitless (scalent aussi). TRANS-01.
      fontSize: {
        xs: ['0.917rem', '1.33'],
        sm: ['1rem', '1.43'],
        base: ['1.125rem', '1.5'],
        lg: ['1.25rem', '1.55'],
        xl: ['1.375rem', '1.4'],
        '2xl': ['1.542rem', '1.33'],
      },
      borderRadius: {
        DEFAULT: '0.625rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
      },
      transitionTimingFunction: {
        cozy: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
      },
    },
  },
  plugins: [],
} satisfies Config;
