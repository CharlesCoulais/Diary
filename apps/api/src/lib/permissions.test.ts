import { describe, it, expect } from 'vitest';
import { canRead, recapOwnerIdFor } from './permissions.js';

// Helpers — objets minimaux acceptés par les types structurels de canRead.
const owner = (id: string) => ({ id, role: 'OWNER' as const, guestAccess: null, guestCanComment: false });
const guest = (id: string, guestAccess: 'ALL' | 'SPECIFIC' | 'CONFIDANT') =>
  ({ id, role: 'GUEST' as const, guestAccess, guestCanComment: false });
const entry = (over: Partial<{ authorId: string; visibility: 'PRIVATE' | 'SHARED_ALL' | 'SHARED_SPECIFIC'; shares: Array<{ receiverId: string; canComment: boolean }>; isSecret: boolean }> = {}) =>
  ({ authorId: 'owner', visibility: 'PRIVATE' as const, shares: [], isSecret: false, ...over });

describe('canRead — matrice de visibilité (source unique de vérité)', () => {
  it('owner : lit sa propre note, pas celle d’un autre auteur', () => {
    expect(canRead(owner('owner'), entry({ authorId: 'owner' }))).toBe(true);
    expect(canRead(owner('owner'), entry({ authorId: 'autre' }))).toBe(false);
  });

  it('guest + PRIVATE : refusé', () => {
    expect(canRead(guest('g', 'ALL'), entry({ visibility: 'PRIVATE' }))).toBe(false);
    expect(canRead(guest('g', 'SPECIFIC'), entry({ visibility: 'PRIVATE' }))).toBe(false);
  });

  it('guest + SHARED_ALL : autorisé seulement si guestAccess === ALL', () => {
    expect(canRead(guest('g', 'ALL'), entry({ visibility: 'SHARED_ALL' }))).toBe(true);
    expect(canRead(guest('g', 'SPECIFIC'), entry({ visibility: 'SHARED_ALL' }))).toBe(false);
  });

  it('guest + SHARED_SPECIFIC : autorisé seulement si un partage le cible', () => {
    const shared = entry({ visibility: 'SHARED_SPECIFIC', shares: [{ receiverId: 'g', canComment: false }] });
    expect(canRead(guest('g', 'SPECIFIC'), shared)).toBe(true);
    expect(canRead(guest('autre', 'SPECIFIC'), shared)).toBe(false);
  });

  it('CONFIDANT : voit tout, indépendamment de la visibilité', () => {
    expect(canRead(guest('g', 'CONFIDANT'), entry({ visibility: 'PRIVATE' }))).toBe(true);
    expect(canRead(guest('g', 'CONFIDANT'), entry({ visibility: 'SHARED_SPECIFIC', shares: [] }))).toBe(true);
  });

  it('note secret : invisible même au CONFIDANT (boîte de Pandore)', () => {
    expect(canRead(guest('g', 'CONFIDANT'), entry({ visibility: 'SHARED_ALL', isSecret: true }))).toBe(false);
    expect(canRead(guest('g', 'ALL'), entry({ visibility: 'SHARED_ALL', isSecret: true }))).toBe(false);
    // …mais l’owner lit toujours sa propre note secret
    expect(canRead(owner('owner'), entry({ authorId: 'owner', isSecret: true }))).toBe(true);
  });
});

describe('recapOwnerIdFor — qui lit les récaps mensuels', () => {
  it('owner : lit ses propres récaps', () => {
    expect(recapOwnerIdFor({ id: 'owner', role: 'OWNER' })).toBe('owner');
  });

  it('CONFIDANT : lit les récaps de l’owner qui l’a invité', () => {
    expect(recapOwnerIdFor({ id: 'g', role: 'GUEST', guestAccess: 'CONFIDANT', invitedById: 'owner' })).toBe('owner');
  });

  it('CONFIDANT sans invitedById : null (défense en profondeur)', () => {
    expect(recapOwnerIdFor({ id: 'g', role: 'GUEST', guestAccess: 'CONFIDANT', invitedById: null })).toBeNull();
  });

  it('guest ALL / SPECIFIC : aucun accès aux récaps', () => {
    expect(recapOwnerIdFor({ id: 'g', role: 'GUEST', guestAccess: 'ALL', invitedById: 'owner' })).toBeNull();
    expect(recapOwnerIdFor({ id: 'g', role: 'GUEST', guestAccess: 'SPECIFIC', invitedById: 'owner' })).toBeNull();
  });
});
