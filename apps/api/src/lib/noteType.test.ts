import { describe, it, expect } from 'vitest';
import { behaviorOf, mediaMeta, noteTypeFieldDef, type NoteTypeDefLike } from '@carnet/schemas';

// Types custom de test : un héritant d'AGENDA, un héritant de JOURNAL.
const defs: Record<string, NoteTypeDefLike> = {
  c1: { id: 'c1', behavior: 'AGENDA', label: 'Voyages', labelPlural: 'Voyages', volumeLabel: 'événements', icon: '✈', colorHex: '#3b6ea5' },
  c2: { id: 'c2', behavior: 'JOURNAL', label: 'Rêves', labelPlural: 'Rêves', volumeLabel: 'entrées', icon: '🌙', colorHex: '#6c5cb8' },
};

describe('behaviorOf', () => {
  it('renvoie le type lui-même pour un built-in', () => {
    expect(behaviorOf({ noteType: 'AGENDA' }, {})).toBe('AGENDA');
    expect(behaviorOf({ noteType: 'JOURNAL', customTypeId: null }, defs)).toBe('JOURNAL');
    expect(behaviorOf({ noteType: 'BOOK' }, defs)).toBe('BOOK');
  });

  it('résout un type custom vers le behavior de sa définition', () => {
    expect(behaviorOf({ noteType: 'CUSTOM', customTypeId: 'c1' }, defs)).toBe('AGENDA');
    expect(behaviorOf({ noteType: 'CUSTOM', customTypeId: 'c2' }, defs)).toBe('JOURNAL');
  });

  it('retombe sur JOURNAL pour un custom orphelin (def supprimée ou absente)', () => {
    expect(behaviorOf({ noteType: 'CUSTOM', customTypeId: 'missing' }, defs)).toBe('JOURNAL');
    expect(behaviorOf({ noteType: 'CUSTOM', customTypeId: null }, defs)).toBe('JOURNAL');
    expect(behaviorOf({ noteType: 'CUSTOM' }, defs)).toBe('JOURNAL');
  });
});

describe('mediaMeta.customFields (survie au sync)', () => {
  it('préserve un objet mixte de valeurs (string/number/boolean/string[]/null)', () => {
    const customFields = { f1: 'texte', f2: 12, f3: true, f4: ['a', 'b'], f5: null };
    const parsed = mediaMeta.parse({ customFields });
    expect(parsed?.customFields).toEqual(customFields);
  });

  it('rejette au-delà de 100 champs', () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 101; i++) big[`f${i}`] = 'x';
    expect(() => mediaMeta.parse({ customFields: big })).toThrow();
  });
});

describe('noteTypeFieldDef', () => {
  it('valide un champ avec options', () => {
    const f = noteTypeFieldDef.parse({ id: 'a1', label: 'Support', type: 'select', options: ['Crayon', 'Aquarelle'] });
    expect(f.type).toBe('select');
    expect(f.options).toEqual(['Crayon', 'Aquarelle']);
  });

  it('rejette un type inconnu', () => {
    expect(() => noteTypeFieldDef.parse({ id: 'a1', label: 'X', type: 'color' })).toThrow();
  });
});
