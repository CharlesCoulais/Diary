# Conversations 💬 👑

Tu peux intégrer un extrait de conversation (WhatsApp, Slack, Discord, SMS, iMessage, Messenger, Telegram, Signal, Instagram) dans n'importe quelle note. Le bloc se rend en bulles façon vraie messagerie, avec la couleur de la plateforme.

> **Note** : seul l'owner peut insérer un bloc conversation (côté écriture). Les confidents les voient à la lecture, comme le reste du contenu d'une note.

## Insérer une conversation

1. Place le curseur dans le contenu de la note où tu veux insérer le bloc
2. Clique sur l'icône 💬 dans la barre d'outils de l'éditeur
3. Un bloc vide apparaît — clique sur ✎ pour l'éditer

## Coller un extrait

Dans la zone "Conversation (brut)", colle directement le contenu copié depuis ton app de messagerie. Le format est auto-détecté et converti pour les sources suivantes :

- **WhatsApp** (export ou copie depuis l'app) — `[date heure] Auteur: message`
- **Slack** (FR et EN) — `Auteur  [14 h 03]` ou `Auteur  2:03 PM`, avec les bursts inline
- **Discord** — `Auteur — DD/MM/YYYY HH:MM`
- **SMS / iMessage** (Messages.app macOS) — alternance auto **Moi/Toi** (à corriger si besoin avec le bouton **⇆ Moi/Toi**)

Si rien n'est détecté, tu peux taper la syntaxe à la main (voir plus bas).

## Réglages du bloc

- **Plateforme** : choisit la couleur, l'icône et le label du bloc (WhatsApp en vert, iMessage en bleu, etc.)
- **Avec** : l'interlocuteur ou le nom du groupe, affiché dans le header
- **Qui est moi ?** : sélectionne parmi les auteurs détectés. Tes bulles s'alignent à droite et reprennent la couleur de la plateforme
- **Renommer les participants** : par exemple `Alice Dupont → Alice` ou `Jean-Pierre → JP`. Le nom original reste dans la source markdown, seul l'affichage change

## Images

Trois façons d'ajouter une image dans la conversation :

1. **Bouton "Image"** au-dessus du textarea — sélectionne un ou plusieurs fichiers
2. **Coller** (Cmd+V / Ctrl+V) avec une image dans le presse-papier (capture d'écran, partage natif iOS/Android)
3. **Glisser-déposer** un fichier image dans le textarea

L'image est uploadée automatiquement et insérée comme `![](/images/…)` au curseur, sur sa propre ligne. Pour qu'elle soit rattachée au bon message, place le curseur sous la ligne `[date] Auteur` voulue avant l'insertion.

## Syntaxe à la main

Si tu préfères taper directement, ou enrichir un extrait collé :

```
[14/05 14:32] Alice
Salut comment vas-tu ?
❤️ Moi

[14/05 14:33] Moi
> Alice: Salut comment vas-tu ?
Ça va bien et toi ?
![](/images/abc123)
🔥 Alice · Bob
```

- **En-tête de message** : `[date heure] Auteur` puis lignes de contenu en dessous
- **Image** : `![](url)` sur sa propre ligne — l'URL peut être `/images/:id` (upload interne) ou n'importe quelle URL externe
- **Réaction** : une ligne commençant par un ou plusieurs emojis, suivie des auteurs séparés par `·` ou `,`
- **Citation** (réponse à un message précédent) : une ligne `> Auteur: contenu cité` en tête du message body. Multi-ligne possible avec `> ` sur chaque ligne

## Affichage

- Le bloc est **plié par défaut au-delà de 5 messages**, avec un lien "Voir les N autres messages →" pour déplier
- Tes messages (l'auteur sélectionné comme "Qui est moi ?") s'alignent à droite avec la couleur accent de la plateforme
- Les autres auteurs sont à gauche, en bulle neutre
- Tu peux faire une conversation **entièrement côté interlocuteur**, sans aucun message « Moi » : laisse « Qui est moi ? » sur « Personne » et écris simplement les messages au nom de l'autre (« Toi » ou son prénom). Seuls les auteurs nommés « Moi / Me » passent à droite
- Le bloc utilise une police sans-serif (Inter) pour se distinguer du contenu serif de la note
- En preview de la note (carte de la liste), le bloc apparaît comme `💬 conversation` pour ne pas étouffer le contenu

## Astuces

- Pour un **SMS** mal alterné, clique sur **⇆ Moi/Toi** : tous les auteurs sont inversés d'un coup
- Pour citer un message dans la conversation, ajoute manuellement une ligne `> Auteur: phrase` juste sous l'en-tête `[date] Auteur` du message qui répond
- Les images sont compressées avant upload (format WebP, ~85 % qualité), même pour les captures d'écran lourdes
- Le contenu du bloc est indexé par la recherche full-text : tu peux retrouver une note en cherchant une phrase d'un message
