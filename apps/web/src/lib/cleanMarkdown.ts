/**
 * Nettoie le markdown avant lecture par le `AnnotatedReader` :
 *  - retire les échappements backslash de Tiptap-markdown (`\*`, `\_`, etc.)
 *    qui rendraient les markers d'italique/gras littéraux dans le texte ;
 *  - convertit `\\\n` (sauts de ligne durs sérialisés par Tiptap) en
 *    vrai `\n` interprétable ;
 *  - supprime les antislashs résiduels en fin de ligne.
 *
 * Appliqué partout où on rend `entry.contentMd` en lecture (EntryCard,
 * EntrySheet, GuestHome…).
 */
export function cleanMarkdown(md: string): string {
  return md
    .replace(/\\\n/g, '\n')
    .replace(/\\([[\](){}*_`~#>|!.+=-])/g, '$1')
    .replace(/\\$/gm, '')
    .trim();
}
