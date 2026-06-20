export interface ChatReaction {
  emoji: string;
  by: string[];
}

export interface ChatReply {
  author: string;
  content: string;
}

export interface ChatMessage {
  author: string;
  timestamp: string | null;
  content: string;
  images: string[];
  reactions: ChatReaction[];
  replyTo?: ChatReply;
}

/**
 * Parse le contenu brut d'un bloc :::chat en messages structurés.
 *
 * Format attendu :
 *   [date heure] Auteur
 *   Contenu sur plusieurs lignes
 *   ![](image-id)               ← image (markdown standard)
 *   emoji(s) auteur · auteur    ← réactions (ligne commençant par 1+ emojis)
 *
 *   [date heure] Autre auteur
 *   ...
 *
 * Le format des dates et le séparateur des auteurs sont tolérants — on
 * extrait juste ce qu'on reconnaît.
 */
const HEADER_RE = /^\[([^\]]*)\]\s+~?(.+?)[\s,;:]*$/;
// "emoji(s) auteur · auteur" — détection : commence par 1 ou plusieurs emojis,
// éventuellement séparés par des espaces, suivis d'un texte.
const EMOJI_PROBE = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})+/u;
const IMAGE_RE = /^!\[[^\]]*\]\(([^)]+)\)\s*$/;

function isReactionLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Commence par un emoji ?
  if (!EMOJI_PROBE.test(trimmed)) return false;
  // Et contient au moins un séparateur ou un nom (sinon c'est juste des emojis dans le texte)
  // Pour rester simple : si la ligne fait moins de 80 chars et commence par emoji, on prend.
  return trimmed.length < 200;
}

function parseReaction(line: string): ChatReaction | null {
  const trimmed = line.trim();
  // Extrait la séquence d'emojis du début
  const emojiMatch = trimmed.match(/^((?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|‍|️|\p{Emoji_Modifier})+)/u);
  if (!emojiMatch) return null;
  const emojis = emojiMatch[1]!.trim();
  const rest = trimmed.slice(emojiMatch[0].length).trim();
  if (!rest) return { emoji: emojis, by: [] };
  // Sépare les auteurs par · ou , ou + ou &
  const by = rest.split(/[·,+&]/).map((s) => s.trim()).filter(Boolean);
  return { emoji: emojis, by };
}

export function parseChatBody(raw: string): ChatMessage[] {
  const lines = raw.split('\n');
  const messages: ChatMessage[] = [];
  let current: ChatMessage | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, ''); // strip trailing whitespace

    const headerMatch = line.match(HEADER_RE);
    if (headerMatch) {
      if (current) messages.push(current);
      current = {
        timestamp: headerMatch[1]!.trim() || null,
        author: headerMatch[2]!.trim(),
        content: '',
        images: [],
        reactions: [],
      };
      continue;
    }

    // Citation "> Auteur: texte" en tête du message body (avant tout contenu)
    if (current && current.content === '' && !current.replyTo) {
      const replyMatch = line.match(/^>\s*([^:]+?):\s*(.*)$/);
      if (replyMatch) {
        current.replyTo = { author: replyMatch[1]!.trim(), content: replyMatch[2]!.trim() };
        continue;
      }
      // Lignes additionnelles d'une citation multi-ligne
      const quoteMatch = line.match(/^>\s+(.*)$/);
      if (quoteMatch) {
        // pas de replyTo encore mais c'est une citation orpheline — on l'ignore
        continue;
      }
    }
    // Extension du contenu d'une citation multi-ligne (juste après le 1er > Author:)
    if (current && current.replyTo && current.content === '') {
      const quoteContinuation = line.match(/^>\s+(.*)$/);
      if (quoteContinuation) {
        current.replyTo.content += '\n' + quoteContinuation[1]!.trim();
        continue;
      }
    }

    if (!current) {
      // Texte avant le 1er header : on l'ignore ou on le rattache à une intro vide
      if (line.trim()) {
        current = { author: 'Conversation', timestamp: null, content: line, images: [], reactions: [] };
      }
      continue;
    }

    // Image
    const imgMatch = line.match(IMAGE_RE);
    if (imgMatch) {
      current.images.push(imgMatch[1]!);
      continue;
    }

    // Réaction
    if (isReactionLine(line) && current.content.length > 0) {
      const r = parseReaction(line);
      if (r) { current.reactions.push(r); continue; }
    }

    // Sinon : texte du message
    if (line === '' && current.content === '') continue; // skip leading blank
    current.content += (current.content ? '\n' : '') + line;
  }
  if (current) messages.push(current);

  // Trim final empty content
  for (const m of messages) m.content = m.content.replace(/\s+$/, '');
  return messages;
}

/** Reformate du texte collé (WhatsApp/Slack/Discord) vers la syntaxe interne. Best-effort. */
export function detectAndReformat(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // WhatsApp export : "[14/05/2026, 14:32:15] Alice : Message"
  // ou : "[14/05/2026 14:32:18] ~Alice: Message" (copie depuis l'app, ~ = non-contact)
  const whatsappRe = /^\[(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:[, ]\s*\d{1,2}:\d{2}(?::\d{2})?)?)\]\s*~?([^:]+?)\s*:\s*(.*)$/;
  const lines = trimmed.split('\n');
  if (lines.length >= 2 && whatsappRe.test(lines[0]!)) {
    const out: string[] = [];
    let currentMsg = '';
    let currentHeader = '';
    for (const line of lines) {
      const m = line.match(whatsappRe);
      if (m) {
        if (currentHeader) { out.push(currentHeader); if (currentMsg) out.push(currentMsg); out.push(''); }
        const ts = m[1]!.trim();
        const author = m[2]!.trim();
        currentHeader = `[${ts}] ${author}`;
        currentMsg = m[3]!.trim();
      } else {
        currentMsg += (currentMsg ? '\n' : '') + line;
      }
    }
    if (currentHeader) { out.push(currentHeader); if (currentMsg) out.push(currentMsg); }
    return out.join('\n');
  }

  // Discord copy : "Auteur — DD/MM/YYYY HH:MM\nMessage"
  const discordRe = /^(.+?)\s+—\s+(\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2})\s*$/;
  if (lines.length >= 2 && discordRe.test(lines[0]!)) {
    const out: string[] = [];
    let currentHeader = '';
    let currentMsg = '';
    for (const line of lines) {
      const m = line.match(discordRe);
      if (m) {
        if (currentHeader) { out.push(currentHeader); if (currentMsg) out.push(currentMsg); out.push(''); }
        currentHeader = `[${m[2]!.trim()}] ${m[1]!.trim()}`;
        currentMsg = '';
      } else {
        currentMsg += (currentMsg ? '\n' : '') + line;
      }
    }
    if (currentHeader) { out.push(currentHeader); if (currentMsg) out.push(currentMsg); }
    return out.join('\n');
  }

  // SMS (Messages.app macOS / Texty / etc.) — aucune info d'auteur, juste des sessions datées :
  //   " mardi 28 avr. à 10:46 "
  //   message 1
  //   message 2
  //   " mardi 28 avr. à 14:26 "
  //   message 3
  // On alterne Moi/Toi (à corriger manuellement après).
  const smsHeaderRe = /^\s*(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+\S+\.?\s+à\s+(\d{1,2}\s*[h:]\s*\d{2})\s*$/i;
  if (lines.some((l) => smsHeaderRe.test(l))) {
    const out: string[] = [];
    let currentTs = '';
    let currentDate = '';
    let nextIsMe = true;
    const dateRe = /^\s*((?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+\S+\.?)\s+à\s+(\d{1,2}\s*[h:]\s*\d{2})\s*$/i;
    for (const line of lines) {
      const m = line.match(dateRe);
      if (m) {
        currentDate = m[1]!.trim();
        currentTs = m[2]!.replace(/\s+/g, '').replace('h', ':');
        continue;
      }
      const text = line.trim();
      if (!text) continue;
      const author = nextIsMe ? 'Moi' : 'Toi';
      nextIsMe = !nextIsMe;
      const ts = currentDate ? `${currentDate} ${currentTs}` : currentTs;
      out.push(`[${ts}] ${author}`);
      out.push(text);
      out.push('');
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Slack — formats variés selon la langue/version :
  //   "Auteur  [14 h 03]" (FR)
  //   "Auteur  14:03" ou "Auteur  2:03 PM" (EN)
  //   Suivi par "[14 h 03]" en début de ligne ou inline "texte[14 h 03]plus de texte" = même auteur, nouveau message
  const slackTime = '\\[?\\d{1,2}(?:\\s*[h:]\\s*|\\s*h\\s*)\\d{2}(?:\\s*[APap][Mm])?\\]?';
  const slackHeaderRe = new RegExp(`^(.+?)\\s{2,}(${slackTime})\\s*$`);
  const slackInlineTsRe = new RegExp(`\\[(\\d{1,2}(?:\\s*[h:]\\s*|\\s*h\\s*)\\d{2}(?:\\s*[APap][Mm])?)\\]`, 'g');
  if (lines.length >= 2 && slackHeaderRe.test(lines[0]!)) {
    const out: string[] = [];
    let currentAuthor = '';
    let currentTs = '';
    let currentMsg = '';
    const flush = () => {
      if (currentAuthor && (currentMsg || currentTs)) {
        out.push(`[${currentTs}] ${currentAuthor}`);
        if (currentMsg) out.push(currentMsg);
        out.push('');
      }
      currentMsg = '';
    };
    const cleanTs = (s: string) => s.replace(/^\[|\]$/g, '').trim();

    for (const rawLine of lines) {
      const headerMatch = rawLine.match(slackHeaderRe);
      if (headerMatch) {
        flush();
        currentAuthor = headerMatch[1]!.trim();
        currentTs = cleanTs(headerMatch[2]!);
        continue;
      }
      // Découpe les timestamps inline : "texte[14 h 03]plus" → message + nouveau message
      const parts: Array<{ kind: 'text' | 'ts'; value: string }> = [];
      let lastIdx = 0;
      slackInlineTsRe.lastIndex = 0;
      let mm: RegExpExecArray | null;
      while ((mm = slackInlineTsRe.exec(rawLine)) !== null) {
        if (mm.index > lastIdx) parts.push({ kind: 'text', value: rawLine.slice(lastIdx, mm.index) });
        parts.push({ kind: 'ts', value: mm[1]!.trim() });
        lastIdx = mm.index + mm[0].length;
      }
      if (lastIdx < rawLine.length) parts.push({ kind: 'text', value: rawLine.slice(lastIdx) });

      for (const p of parts) {
        if (p.kind === 'ts') {
          // Nouveau message du même auteur — flush et démarre
          flush();
          currentTs = p.value;
        } else if (p.value.trim()) {
          currentMsg += (currentMsg ? '\n' : '') + p.value;
        }
      }
    }
    flush();
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  return null;
}
