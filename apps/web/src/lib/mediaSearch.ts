export interface MediaSearchResult {
  id: string;
  title: string;
  creator?: string;
  year?: string;
  coverUrl?: string;
  progressTotal?: number;
  workId?: string; // Open Library work ID pour les livres
  description?: string;
  albumTitle?: string; // Album d'un morceau (musique uniquement)
  isbn?: string; // ISBN si disponible (livres)
}

export interface BookEdition {
  key: string;
  pages: number;
  label: string; // "352 p. · Pocket (2023)"
}

const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined;
const TMDB_IMG = 'https://image.tmdb.org/t/p/w92';

export async function searchMovies(q: string, signal: AbortSignal): Promise<MediaSearchResult[]> {
  if (!TMDB_KEY || q.length < 2) return [];
  const res = await fetch(
    `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&language=fr-FR&page=1`,
    { signal },
  );
  if (!res.ok) return [];
  const data = await res.json() as { results?: Record<string, unknown>[] };
  return (data.results ?? []).slice(0, 6).map((r, i) => ({
    id: String((r['id'] as number | undefined) ?? i),
    title: (r['title'] as string) ?? '',
    year: (r['release_date'] as string | undefined)?.slice(0, 4),
    coverUrl: r['poster_path'] ? TMDB_IMG + (r['poster_path'] as string) : undefined,
    description: (r['overview'] as string | undefined) || undefined,
  }));
}

export async function searchSeries(q: string, signal: AbortSignal): Promise<MediaSearchResult[]> {
  if (!TMDB_KEY || q.length < 2) return [];
  const res = await fetch(
    `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&language=fr-FR&page=1`,
    { signal },
  );
  if (!res.ok) return [];
  const data = await res.json() as { results?: Record<string, unknown>[] };
  return (data.results ?? []).slice(0, 6).map((r, i) => ({
    id: String((r['id'] as number | undefined) ?? i),
    title: (r['name'] as string) ?? '',
    year: (r['first_air_date'] as string | undefined)?.slice(0, 4),
    coverUrl: r['poster_path'] ? TMDB_IMG + (r['poster_path'] as string) : undefined,
    description: (r['overview'] as string | undefined) || undefined,
  }));
}

/**
 * Strip les suffixes de tome (`T01`, `Tome 3`, `Vol. 2`, etc.) d'un titre/query.
 * Utile avant un appel AniList qui ne reconnaît pas les éditions tome par tome.
 */
export function stripVolumeSuffix(s: string): string {
  return s.replace(/\s*[-–—:]?\s*(?:t\.?|tome|vol\.?|volume)\s*0*\d+\s*$/i, '').trim();
}

/**
 * Recherche manga via AniList (GraphQL). Sans clé, free, bien fourni en
 * description + volumes/chapitres + cover HD. Utilisé en fallback quand
 * Google Books ne renvoie rien (mangas peu indexés en FR).
 */
async function searchMangaAniList(q: string, signal: AbortSignal): Promise<MediaSearchResult[]> {
  const query = `
    query ($search: String) {
      Page(perPage: 10) {
        media(search: $search, type: MANGA, sort: POPULARITY_DESC) {
          id
          title { romaji english native userPreferred }
          description(asHtml: false)
          coverImage { extraLarge large }
          volumes
          chapters
          startDate { year }
          staff(perPage: 5) {
            edges { role node { name { full } } }
          }
        }
      }
    }
  `;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { search: q } }),
      signal,
    });
    if (!res.ok) return [];
    const json = await res.json() as {
      data?: { Page?: { media?: Array<{
        id: number;
        title: { romaji?: string; english?: string; native?: string; userPreferred?: string };
        description?: string;
        coverImage?: { extraLarge?: string; large?: string };
        volumes?: number;
        chapters?: number;
        startDate?: { year?: number };
        staff?: { edges?: Array<{ role?: string; node?: { name?: { full?: string } } }> };
      }> } };
    };
    const items = json.data?.Page?.media ?? [];
    return items.map((m) => {
      // Privilégier le titre user-preferred (langue de l'utilisateur sur AniList) puis english.
      const title = m.title.userPreferred || m.title.english || m.title.romaji || m.title.native || '';
      // Auteur : on prend le Story (scénariste). Pour les one-man-shows, "Story & Art".
      const auteur = m.staff?.edges?.find((e) => /story/i.test(e.role ?? ''))?.node?.name?.full
        ?? m.staff?.edges?.[0]?.node?.name?.full;
      // AniList renvoie HTML allégé (<br>, <i>…) dans description même avec asHtml:false.
      const cleanDesc = m.description?.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() || undefined;
      return {
        id: String(m.id),
        title,
        creator: auteur,
        year: m.startDate?.year ? String(m.startDate.year) : undefined,
        coverUrl: m.coverImage?.extraLarge ?? m.coverImage?.large,
        description: cleanDesc,
      };
    }).filter((r) => r.title);
  } catch { return []; }
}

/**
 * Recherche livre via le catalogue BNF (SRU XML, Dublin Core). Couvre les
 * éditions françaises absentes de Google Books / Open Library, et renvoie
 * souvent une `dc:description` en français. Free, sans clé.
 */
async function searchBooksBNF(q: string, signal: AbortSignal): Promise<MediaSearchResult[]> {
  try {
    const url = `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(`bib.title adj "${q}"`)}&maximumRecords=10&recordSchema=dublincore`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const xml = await res.text();
    const records = xml.match(/<srw:record\b[^>]*>[\s\S]*?<\/srw:record>/g) ?? [];
    return records.slice(0, 10).map((record, idx) => {
      const pick = (tag: string) => {
        const re = new RegExp(`<dc:${tag}[^>]*>([^<]+)</dc:${tag}>`, 'i');
        const m = record.match(re);
        return m ? m[1]!.trim() : undefined;
      };
      const rawTitle = pick('title');
      if (!rawTitle) return null;
      // BNF formate souvent en "Titre / Auteur" ou "Titre : sous-titre"
      const title = rawTitle.split('/')[0]!.trim();
      const rawCreator = pick('creator');
      const creator = rawCreator
        ? rawCreator.replace(/\.\s*Auteur.*$/i, '').replace(/\s*\([^)]*\)\s*/g, '').trim()
        : undefined;
      const description = pick('description');
      const year = pick('date')?.match(/\d{4}/)?.[0];
      const format = pick('format');
      const pagesMatch = format?.match(/(\d+)\s*p\./);
      const pages = pagesMatch ? parseInt(pagesMatch[1]!, 10) : undefined;
      const identifier = pick('identifier');
      const isbnMatch = identifier?.match(/\b(97[89]\d{10}|\d{9}[\dXx])\b/);
      const result: MediaSearchResult = {
        id: `bnf-${idx}`,
        title,
      };
      if (creator) result.creator = creator;
      if (year) result.year = year;
      if (pages && pages > 0) result.progressTotal = pages;
      if (description) result.description = description;
      if (isbnMatch?.[1]) result.isbn = isbnMatch[1];
      return result;
    }).filter((r): r is MediaSearchResult => r !== null);
  } catch { return []; }
}

export async function searchBooks(q: string, signal: AbortSignal): Promise<MediaSearchResult[]> {
  if (q.length < 2) return [];

  // Google Books en priorité : bien fourni sur les mangas, BD et livres francophones récents
  try {
    const gbRes = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10&langRestrict=fr`,
      { signal },
    );
    if (gbRes.ok) {
      const gbData = await gbRes.json() as { items?: { id: string; volumeInfo: Record<string, unknown> }[] };
      const items = gbData.items ?? [];
      if (items.length > 0) {
        const gbResults = items.slice(0, 8).map((item) => {
          const info = item.volumeInfo;
          const imageLinks = info['imageLinks'] as Record<string, string> | undefined;
          const pageCount = info['pageCount'] as number | undefined;
          // Google Books expose `thumbnail` à zoom=1 (~128px) → pixellisé à grande
          // taille. On force zoom=3 (~512px) et on retire `edge=curl` (effet de
          // page cornée qui gêne pour une couverture propre).
          const rawCover = imageLinks?.['thumbnail'] ?? imageLinks?.['smallThumbnail'] ?? undefined;
          const coverUrl = rawCover
            ? rawCover.replace(/&zoom=\d+/, '&zoom=3').replace(/&edge=curl/, '')
            : undefined;
          // Google Books renvoie une liste d'identifiants industriels (ISBN_13 / ISBN_10)
          const idents = info['industryIdentifiers'] as { type: string; identifier: string }[] | undefined;
          const isbn = idents?.find((i) => i.type === 'ISBN_13')?.identifier
            ?? idents?.find((i) => i.type === 'ISBN_10')?.identifier;
          return {
            id: item.id,
            title: (info['title'] as string) ?? '',
            creator: (info['authors'] as string[] | undefined)?.[0],
            year: (info['publishedDate'] as string | undefined)?.slice(0, 4),
            coverUrl,
            progressTotal: pageCount && pageCount > 0 ? pageCount : undefined,
            description: (info['description'] as string | undefined) || undefined,
            isbn,
          };
        });
        // Si tous les résultats Google Books sont sans description (cas mangas
        // FR peu fournis), on requête BNF (FR) et AniList (mangas) en parallèle
        // pour trouver un résumé. On préserve les titres + couvertures GB en FR
        // et on enrichit uniquement la description (priorité BNF qui est aussi FR).
        const noneHasDescription = gbResults.every((r) => !r.description);
        if (noneHasDescription) {
          const [bnf, aniList] = await Promise.all([
            searchBooksBNF(q, signal),
            searchMangaAniList(q, signal),
          ]);
          const description = bnf.find((r) => r.description)?.description ?? aniList[0]?.description;
          if (description) {
            return gbResults.map((r) => ({
              ...r,
              description: r.description ?? description,
            }));
          }
        }
        return gbResults;
      }
    }
  } catch { /* fallback OL puis AniList puis BNF */ }

  // Fallback 1 : Open Library — souvent la seule source à avoir le **titre FR**
  // des mangas. On enrichit avec description via /works/{id}.json. Si manque,
  // on greffe la description AniList par-dessus (en gardant le titre FR de OL).
  const ol = await searchBooksOL(q, signal);
  if (ol.length > 0) {
    const top = ol[0]!;
    if (!top.description) {
      try {
        // AniList ne trouve pas les titres avec suffixe tome (`T01`, etc.) —
        // on retire le suffixe pour cibler la série elle-même.
        const seriesQuery = stripVolumeSuffix(q) || q;
        const aniList = await searchMangaAniList(seriesQuery, signal);
        const aniTop = aniList[0];
        if (aniTop?.description || aniTop?.coverUrl) {
          ol[0] = {
            ...top,
            description: top.description ?? aniTop.description,
            coverUrl: top.coverUrl ?? aniTop.coverUrl,
          };
        }
      } catch { /* description optionnelle */ }
    }
    return ol;
  }

  // Fallback 2 : AniList seul (cas où OL n'a rien — manga très récent / niche).
  // Titre romaji mais on a au moins quelque chose pour l'utilisateur.
  try {
    const aniList = await searchMangaAniList(q, signal);
    if (aniList.length > 0) return aniList;
  } catch { /* continue */ }

  // Fallback 3 : BNF (rare, mais pour les livres FR très anciens / spécialisés)
  try {
    const bnf = await searchBooksBNF(q, signal);
    return bnf;
  } catch { return []; }
}

/**
 * Recherche Open Library séparée, avec enrichment description via /works.
 * Extraite pour pouvoir être appelée depuis plusieurs branches de fallback.
 */
async function searchBooksOL(q: string, signal: AbortSignal): Promise<MediaSearchResult[]> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=10&fields=key,title,author_name,number_of_pages_median,first_publish_year,cover_i,isbn`,
      { signal },
    );
    if (!res.ok) return [];
    const data = await res.json() as { docs?: Record<string, unknown>[] };
    const base: MediaSearchResult[] = (data.docs ?? []).slice(0, 10).map((r, i) => ({
      id: String(i),
      workId: (r['key'] as string | undefined)?.replace('/works/', ''),
      title: (r['title'] as string) ?? '',
      creator: (r['author_name'] as string[] | undefined)?.[0],
      year: r['first_publish_year'] != null ? String(r['first_publish_year']) : undefined,
      coverUrl: r['cover_i']
        ? `https://covers.openlibrary.org/b/id/${r['cover_i'] as number}-L.jpg`
        : undefined,
      progressTotal: r['number_of_pages_median'] as number | undefined,
      isbn: (r['isbn'] as string[] | undefined)?.[0],
    }));
    // Enrichment parallèle : récupère description via /works/{id}.json.
    await Promise.all(base.map(async (r) => {
      if (!r.workId) return;
      try {
        const wRes = await fetch(`https://openlibrary.org/works/${r.workId}.json`, { signal });
        if (!wRes.ok) return;
        const w = await wRes.json() as { description?: string | { value: string } };
        if (typeof w.description === 'string') r.description = w.description;
        else if (w.description && 'value' in w.description) r.description = w.description.value;
      } catch { /* ignore */ }
    }));
    return base;
  } catch { return []; }
}

export interface BookISBNResult {
  title: string;
  creator?: string;
  pages?: number;
  publisher?: string;
  year?: string;
  description?: string;
  coverUrl?: string;
}

export async function fetchBookByISBN(isbn: string, signal: AbortSignal): Promise<BookISBNResult | null> {
  const clean = isbn.replace(/[-\s]/g, '');
  if (clean.length < 10) return null;

  // Certains ISBN-13 978-xxx ne sont pas indexés tels quels dans Google Books
  // mais trouvés en variante ISBN-10 (sans le préfixe 978/979).
  const isbn10Variant = clean.length === 13 && (clean.startsWith('978') || clean.startsWith('979'))
    ? clean.slice(3)
    : null;

  // Essai 1 : Google Books par ISBN — retry une fois sur 503, essaie aussi la variante ISBN-10
  const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`;
  let gbPartial: BookISBNResult | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 800));
      const gbRes = await fetch(gbUrl, { signal });
      if (gbRes.status === 503) continue;
      if (gbRes.ok) {
        const gbData = await gbRes.json() as { totalItems?: number; items?: { volumeInfo: Record<string, unknown> }[] };
        const info = gbData.items?.[0]?.volumeInfo;
        if (info && info['title']) {
          const pageCount = info['pageCount'] as number | undefined;
          const rawDesc = info['description'] as string | undefined;
          const imageLinks = info['imageLinks'] as Record<string, string> | undefined;
          gbPartial = {
            title: (info['title'] as string | undefined) ?? '',
            creator: (info['authors'] as string[] | undefined)?.[0],
            pages: pageCount && pageCount > 0 ? pageCount : undefined,
            publisher: info['publisher'] as string | undefined,
            year: (info['publishedDate'] as string | undefined)?.slice(0, 4),
            description: rawDesc || undefined,
            coverUrl: imageLinks?.['thumbnail'] ?? imageLinks?.['smallThumbnail'] ?? undefined,
          };
          // Résultat complet → on retourne directement
          if (gbPartial.creator && gbPartial.coverUrl) return gbPartial;
          // Résultat partiel (pas d'auteur ou de couverture) → on enrichit via recherche titre
          break;
        }
      }
      break;
    } catch { break; }
  }

  // Essai 1b : variante ISBN-10 si l'ISBN-13 n'a rien retourné
  if (!gbPartial && isbn10Variant) {
    try {
      const gb10Res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn10Variant}`,
        { signal },
      );
      if (gb10Res.ok) {
        const gb10Data = await gb10Res.json() as { items?: { volumeInfo: Record<string, unknown> }[] };
        const info = gb10Data.items?.[0]?.volumeInfo;
        if (info && info['title']) {
          const pageCount = info['pageCount'] as number | undefined;
          const imageLinks = info['imageLinks'] as Record<string, string> | undefined;
          gbPartial = {
            title: (info['title'] as string | undefined) ?? '',
            creator: (info['authors'] as string[] | undefined)?.[0],
            pages: pageCount && pageCount > 0 ? pageCount : undefined,
            publisher: info['publisher'] as string | undefined,
            year: (info['publishedDate'] as string | undefined)?.slice(0, 4),
            description: (info['description'] as string | undefined) || undefined,
            coverUrl: imageLinks?.['thumbnail'] ?? imageLinks?.['smallThumbnail'] ?? undefined,
          };
          if (gbPartial.creator && gbPartial.coverUrl) return gbPartial;
        }
      }
    } catch { /* continuer */ }
  }

  // Essai 1c : si Google Books par ISBN est partiel, on enrichit via recherche titre
  if (gbPartial?.title && (!gbPartial.creator || !gbPartial.coverUrl)) {
    // Extraire le numéro de tome du titre (ex: "Tome 2", "T02", "Vol. 3" → 2)
    const volumeMatch = gbPartial.title.match(
      /(?:tome|t\.|t0*|vol\.?|volume)\s*0*(\d+)/i,
    ) ?? gbPartial.title.match(/\bt0*(\d+)\b/i);
    const volumeNum = volumeMatch ? parseInt(volumeMatch[1]!, 10) : null;

    // On tente d'abord avec le titre exact, puis avec le titre de série
    // (sans l'indicateur de volume : "Tome 2", "T02", "Vol. 3"…)
    const seriesTitle = gbPartial.title
      .replace(/[\s–-]+(?:tome|t\.|t0|vol\.?|volume)\s*\d+.*/i, '')
      .replace(/[\s–-]+(?:t\d+).*/i, '')
      .trim();
    const titlesToTry = [gbPartial.title, ...(seriesTitle !== gbPartial.title ? [seriesTitle] : [])];

    for (const queryTitle of titlesToTry) {
      if (gbPartial.creator && gbPartial.coverUrl) break;
      try {
        const enrichRes = await fetch(
          `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(queryTitle)}&maxResults=8`,
          { signal },
        );
        if (!enrichRes.ok) continue;
        const enrichData = await enrichRes.json() as { items?: { volumeInfo: Record<string, unknown> }[] };
        const allItems = enrichData.items ?? [];

        // Filtre les résultats qui correspondent à la même série
        const matchKey = seriesTitle.toLowerCase().slice(0, 12);
        const seriesItems = allItems.filter((item) => {
          const t = ((item.volumeInfo['title'] as string | undefined) ?? '').toLowerCase();
          return t.startsWith(matchKey);
        });

        // Si on connaît le numéro de tome, trier : tome exact en premier, les autres ensuite
        const sorted = volumeNum !== null
          ? [
              ...seriesItems.filter((item) => {
                const t = (item.volumeInfo['title'] as string | undefined) ?? '';
                const m = t.match(/(?:tome|t\.|t0*|vol\.?|volume)\s*0*(\d+)/i)
                  ?? t.match(/\bt0*(\d+)\b/i);
                return m ? parseInt(m[1]!, 10) === volumeNum : false;
              }),
              ...seriesItems.filter((item) => {
                const t = (item.volumeInfo['title'] as string | undefined) ?? '';
                const m = t.match(/(?:tome|t\.|t0*|vol\.?|volume)\s*0*(\d+)/i)
                  ?? t.match(/\bt0*(\d+)\b/i);
                return !(m && parseInt(m[1]!, 10) === volumeNum);
              }),
            ]
          : seriesItems;

        for (const item of sorted) {
          const info = item.volumeInfo;
          const imageLinks = info['imageLinks'] as Record<string, string> | undefined;
          if (!gbPartial.creator) gbPartial.creator = (info['authors'] as string[] | undefined)?.[0];
          if (!gbPartial.coverUrl) gbPartial.coverUrl = imageLinks?.['thumbnail'] ?? imageLinks?.['smallThumbnail'];
          if (!gbPartial.description) gbPartial.description = (info['description'] as string | undefined) || undefined;
          if (!gbPartial.pages) {
            const pc = info['pageCount'] as number | undefined;
            if (pc && pc > 0) gbPartial.pages = pc;
          }
          if (gbPartial.creator && gbPartial.coverUrl) break;
        }
      } catch { /* silencieux */ }
    }
    return gbPartial;
  }

  // Essai 2 : Open Library — endpoint direct édition
  try {
    const olRes = await fetch(`https://openlibrary.org/isbn/${clean}.json`, { signal });
    if (olRes.ok) {
      const data = await olRes.json() as Record<string, unknown>;
      if (data['title']) {
        return {
          title: (data['title'] as string | undefined) ?? '',
          pages: data['number_of_pages'] as number | undefined,
          publisher: (data['publishers'] as string[] | undefined)?.[0],
          year: (data['publish_date'] as string | undefined)?.match(/\d{4}/)?.[0],
        };
      }
    }
  } catch { /* continuer */ }

  // Essai 3 : Open Library — recherche par ISBN (meilleure couverture)
  try {
    const olSearchRes = await fetch(
      `https://openlibrary.org/search.json?isbn=${clean}&limit=1&fields=title,author_name,number_of_pages_median,first_publish_year,cover_i`,
      { signal },
    );
    if (olSearchRes.ok) {
      const olSearchData = await olSearchRes.json() as { docs?: Record<string, unknown>[] };
      const doc = olSearchData.docs?.[0];
      if (doc && doc['title']) {
        const coverId = doc['cover_i'] as number | undefined;
        return {
          title: (doc['title'] as string) ?? '',
          creator: (doc['author_name'] as string[] | undefined)?.[0],
          pages: doc['number_of_pages_median'] as number | undefined,
          year: doc['first_publish_year'] != null ? String(doc['first_publish_year']) : undefined,
          coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : `https://covers.openlibrary.org/b/isbn/${clean}-M.jpg`,
        };
      }
    }
  } catch { /* continuer */ }

  // Essai 4 : BNF (catalogue de la Bibliothèque nationale de France) — couvre les éditions FR absentes ailleurs
  try {
    const bnfRes = await fetch(
      `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(`bib.isbn adj "${clean}"`)}&maximumRecords=1&recordSchema=dublincore`,
      { signal },
    );
    if (bnfRes.ok) {
      const xml = await bnfRes.text();
      const pick = (tag: string) => {
        const re = new RegExp(`<dc:${tag}[^>]*>([^<]+)</dc:${tag}>`, 'i');
        const m = xml.match(re);
        return m ? m[1]!.trim() : undefined;
      };
      const rawTitle = pick('title');
      if (rawTitle) {
        const title = rawTitle.split('/')[0]!.trim();
        const rawCreator = pick('creator');
        const creator = rawCreator ? rawCreator.replace(/\.\s*Auteur.*$/i, '').replace(/\s*\([^)]*\)\s*/g, '').trim() : undefined;
        const publisher = pick('publisher')?.replace(/\s*\([^)]*\)\s*$/, '').trim();
        const year = pick('date')?.match(/\d{4}/)?.[0];
        const format = pick('format');
        const pagesMatch = format?.match(/(\d+)\s*p\./);
        const pages = pagesMatch ? parseInt(pagesMatch[1]!, 10) : undefined;
        return {
          title,
          creator: creator || undefined,
          publisher,
          year,
          pages: pages && pages > 0 ? pages : undefined,
          coverUrl: `https://covers.openlibrary.org/b/isbn/${clean}-M.jpg`,
        };
      }
    }
  } catch { /* fin */ }

  return null;
}

export async function fetchBookDescription(workId: string, signal: AbortSignal): Promise<string | null> {
  const res = await fetch(`https://openlibrary.org/works/${workId}.json`, { signal });
  if (!res.ok) return null;
  const data = await res.json() as { description?: string | { value?: string } };
  if (!data.description) return null;
  return typeof data.description === 'string'
    ? data.description
    : (data.description.value ?? null);
}

export async function fetchBookEditions(workId: string, signal: AbortSignal): Promise<BookEdition[]> {
  const res = await fetch(
    `https://openlibrary.org/works/${workId}/editions.json?limit=30`,
    { signal },
  );
  if (!res.ok) return [];
  const data = await res.json() as { entries?: Record<string, unknown>[] };

  const seen = new Set<number>();
  const editions: BookEdition[] = [];

  for (const e of (data.entries ?? [])) {
    const pages = e['number_of_pages'] as number | undefined;
    if (!pages || seen.has(pages)) continue;
    seen.add(pages);
    const publishers = (e['publishers'] as string[] | undefined)?.[0] ?? '';
    const date = (e['publish_date'] as string | undefined) ?? '';
    const year = date.match(/\d{4}/)?.[0] ?? '';
    const parts = [publishers, year].filter(Boolean).join(' ');
    editions.push({
      key: e['key'] as string,
      pages,
      label: `${pages} p.${parts ? ` · ${parts}` : ''}`,
    });
  }

  return editions.sort((a, b) => a.pages - b.pages);
}

export interface MovieCollectionResult {
  seriesName: string;
  volume: number;       // position du film dans la collection (1-based)
  totalVolumes: number; // nombre total de films dans la collection
}

/** Récupère les infos de saga d'un film via TMDB (belongs_to_collection) */
export async function fetchMovieCollection(
  tmdbMovieId: number,
  signal: AbortSignal,
): Promise<MovieCollectionResult | null> {
  if (!TMDB_KEY) return null;

  // Détails du film pour trouver sa collection
  const movieRes = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbMovieId}?api_key=${TMDB_KEY}&language=fr-FR`,
    { signal },
  );
  if (!movieRes.ok) return null;
  const movieData = await movieRes.json() as {
    belongs_to_collection?: { id: number; name: string } | null;
  };

  const collection = movieData.belongs_to_collection;
  if (!collection) return null;

  // Détails de la collection pour obtenir tous les films et leur ordre
  const collRes = await fetch(
    `https://api.themoviedb.org/3/collection/${collection.id}?api_key=${TMDB_KEY}&language=fr-FR`,
    { signal },
  );
  if (!collRes.ok) return null;
  const collData = await collRes.json() as {
    name: string;
    parts?: { id: number; release_date?: string }[];
  };

  // Trie par date de sortie pour déterminer la position
  const parts = (collData.parts ?? [])
    .filter((p) => p.release_date)
    .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''));

  const position = parts.findIndex((p) => p.id === tmdbMovieId) + 1;

  return {
    seriesName: collData.name,
    volume: position > 0 ? position : 1,
    totalVolumes: parts.length,
  };
}

export async function fetchTVDetails(tmdbId: number, signal: AbortSignal): Promise<{ totalSeasons: number } | null> {
  if (!TMDB_KEY) return null;
  const res = await fetch(
    `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_KEY}&language=fr-FR`,
    { signal },
  );
  if (!res.ok) return null;
  const data = await res.json() as { number_of_seasons?: number };
  return { totalSeasons: data.number_of_seasons ?? 1 };
}

export async function fetchTVSeasonEpisodes(tmdbId: number, season: number, signal: AbortSignal): Promise<number | null> {
  if (!TMDB_KEY) return null;
  const res = await fetch(
    `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${TMDB_KEY}&language=fr-FR`,
    { signal },
  );
  if (!res.ok) return null;
  const data = await res.json() as { episodes?: unknown[] };
  return data.episodes?.length ?? null;
}

export async function searchMusic(q: string, signal: AbortSignal): Promise<MediaSearchResult[]> {
  if (q.length < 2) return [];
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=8`,
    { signal },
  );
  if (!res.ok) return [];
  const data = await res.json() as { results?: Record<string, unknown>[] };
  return (data.results ?? []).slice(0, 6).map((r) => ({
    id: String((r['trackId'] as number | undefined) ?? Math.random()),
    title: (r['trackName'] as string) ?? '',
    creator: (r['artistName'] as string) ?? undefined,
    year: (r['releaseDate'] as string | undefined)?.slice(0, 4),
    albumTitle: (r['collectionName'] as string) ?? undefined,
    coverUrl: (r['artworkUrl100'] as string | undefined)?.replace('100x100', '300x300'),
  }));
}
