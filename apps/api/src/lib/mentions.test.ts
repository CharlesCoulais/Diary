import { describe, it, expect } from 'vitest';
import { extractMentionIds } from './mentions.js';

describe('extractMentionIds', () => {
  it('extrait un id de mention', () => {
    expect(extractMentionIds('Coucou [@Marie](mention:usr_abc123) ça va ?')).toEqual(['usr_abc123']);
  });

  it('gère plusieurs mentions et déduplique', () => {
    const md = '[@Marie](mention:a1) et [@Léo](mention:b2), re [@Marie](mention:a1)';
    expect(extractMentionIds(md)).toEqual(['a1', 'b2']);
  });

  it('accepte les libellés avec espaces et accents', () => {
    expect(extractMentionIds('[@Marie Curie](mention:cuid42)')).toEqual(['cuid42']);
  });

  it('ignore les liens markdown classiques', () => {
    expect(extractMentionIds('voir [le site](https://exemple.fr) et [@x](mention:z9)')).toEqual(['z9']);
  });

  it('ignore un faux token sans préfixe mention:', () => {
    expect(extractMentionIds('[@pasunemention](https://x.fr)')).toEqual([]);
  });

  it('renvoie [] pour vide / null / undefined', () => {
    expect(extractMentionIds('')).toEqual([]);
    expect(extractMentionIds(null)).toEqual([]);
    expect(extractMentionIds(undefined)).toEqual([]);
  });
});
