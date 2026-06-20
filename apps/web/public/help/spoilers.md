# Spoilers

> 🌍 **Tous les rôles** peuvent poser des spoilers dans leurs notes et leurs commentaires.

Un **spoiler** est un passage de texte caché dans une note ou un commentaire. Il s'affiche flouté en lecture — il faut cliquer dessus pour le révéler. Utile pour les fins d'histoires, les surprises, les anecdotes que tu veux pouvoir relire mais pas accidentellement.

## Syntaxe

Entoure le texte par deux barres verticales `||` :

```
J'ai adoré ce film. ||La fin avec le miroir m'a retourné le cerveau.||
```

## Côté note — trois façons de poser un spoiler

1. **Tape `||texte||` à la main** dans l'éditeur.
2. **Bouton « œil barré »** dans la toolbar de mise en forme (à côté du barré).
3. **Raccourci clavier** : sélectionne ton texte → **⌘⇧S** (Cmd+Shift+S sur Mac, Ctrl+Shift+S ailleurs).

Re-clique le bouton (ou re-fais le raccourci) sur un spoiler existant pour le retirer.

## Côté commentaire

Quand tu composes un commentaire, focus le champ de saisie : une barre de mise en forme glisse depuis le haut avec **G / I / S / ` / ◐**. Le **◐** entoure ta sélection avec `||...||`.

## Comportement en lecture

- **Sur la carte** d'aperçu : le spoiler apparaît sous forme de blocs `▓▓▓` — on indique qu'il y a quelque chose à cacher sans le révéler. Tu dois ouvrir la note pour pouvoir cliquer.
- **En mode lecture plein écran** : le texte est flouté avec un curseur pointeur. Un clic révèle.
- Une fois révélé, ça reste lisible pour la session — c'est masqué à nouveau au prochain remontage (changement de page, retour à la liste, etc.).

## 💡 Astuces

- Les spoilers fonctionnent à l'intérieur d'autres marqueurs : `**||spoiler en gras||**` marche.
- Pas d'imbrication possible — `||a||b||` est ambigu, on prend la première paire.
- Le spoiler s'arrête à la fin de la ligne : impossible de cacher plusieurs paragraphes d'un coup, il faut en poser un par bloc.
- En export PDF / ZIP, le texte est restitué tel quel (`||texte||`) — le but est de préserver le markdown source.
