# Fil — l'activité des commentaires

> 🌍 **Tous les rôles** ont accès au Fil.

Le Fil rassemble en un seul endroit **toute l'activité de commentaires** sur le journal : qui a commenté quoi, ce qui attend une réponse, ce qui est résolu. C'est l'équivalent d'une boîte de réception pour les conversations qui se passent dans le journal.

## À quoi ça sert

Plutôt que de devoir parcourir toutes tes notes pour voir où des commentaires ont été laissés, le Fil te donne **la liste de tous les fils de discussion** triés par activité récente.

Pour l'Owner : tu vois ce que tes guests t'ont écrit.
Pour un Guest : tu vois les notes où tu as commenté ou été commenté.

## La structure

Chaque ligne du Fil est un **fil de discussion** lié à une note précise. Elle affiche :

- **Type et date de la note** (📖 jeudi 7 mai)
- **Sujet ou titre** de la note (si c'est un livre/film/etc.)
- **Auteur du dernier commentaire** + extrait
- **Texte ancré** (le passage exact de la note auquel le commentaire est rattaché, si applicable)
- **Heure relative** (« il y a 2 j », « à l'instant »)
- **Compteur** de commentaires dans le fil
- **Point bleu « non lu »** — à gauche de la date quand un nouveau message t'attend (depuis ta dernière ouverture du fil). Ouvrir le fil l'efface. Il **ne change pas** le statut : un fil lu mais auquel tu n'as pas encore répondu reste « À répondre ».
- **Badge de statut** :
  - ● **À répondre** (orange) — le dernier message vient d'un autre que toi. Ça reste un todo **tant que tu n'as pas répondu** (ou clos le fil) — lire ne le retire pas.
  - ✓ **Répondu** (vert) — c'est toi qui as posté en dernier
  - — **Fermé** (gris) — le fil a été clos

## Filtrer par statut

En haut, des onglets pour filtrer :

- **Tous** — tous les fils
- **À répondre** — fils où l'autre a écrit en dernier (todo, avec compteur)
- **Répondu** — fils où tu as eu le dernier mot
- **Fermé** — fils résolus

## Déplier un fil

Clic sur un fil → la note s'affiche en dessous, avec **les commentaires automatiquement ouverts**. Tu peux :

- Lire tous les commentaires
- Répondre directement
- [Réagir avec un emoji](reactions.md) sur n'importe quel commentaire (bouton 🙂+)
- Voir le contenu complet de la note (avec ses images, audio, blocs de code)

## Joindre une image ou un GIF

Au moment d'écrire un commentaire, l'icône **trombone** à gauche du champ permet de joindre un média :

- **📷 Image** — choisis une photo (compressée automatiquement).
- **🔍 GIF** — recherche un GIF animé et choisis-le dans la grille.

Tu peux accompagner le média d'un texte ou l'envoyer seul. Le média s'affiche dans la bulle du commentaire, visible par l'owner comme par le confident.

## Éditer son propre commentaire

Sur n'importe quel commentaire que **tu as écrit**, une icône ✎ apparaît dans la barre d'actions (en dessous de la bulle). Clic → édition inline avec le même éditeur que la création. `Ctrl/Cmd + Entrée` pour valider.

Un badge **« modifié »** s'affiche discrètement à côté de l'horodatage dès qu'un commentaire a été édité — visible aussi bien dans le fil que dans le panneau du Fil (`/fil`).

Sur mobile, les actions sont visibles en opacité réduite (sans nécessiter de hover) pour rester accessibles au touch.

<!-- role:confidant -->
### 👑🤝 Clore ou rouvrir un fil

Un bouton **« ✓ Clore ce fil »** apparaît dans le fil déplié. Cela passe le fil en statut « Fermé ». Tu peux toujours le rouvrir avec **« ↩ Rouvrir »**.

Clore est pratique quand une conversation a abouti et n'a plus besoin d'attention.
<!-- /role -->

## Refresh automatique

Le Fil se met à jour **toutes les 30 secondes** automatiquement. Pas besoin de rafraîchir manuellement.

## 💡 Astuces

- **Notifications + Fil** vont ensemble. Quand tu reçois une notification de commentaire, elle te ramène à la note précise. Tu peux aussi venir au Fil pour avoir une vue d'ensemble.
- « À répondre » est un **todo** : il reste tant que tu n'as pas répondu (ou clos le fil), même après l'avoir lu. Le **point bleu** distingue, lui, « du nouveau à lire » de « déjà vu, à traiter plus tard ».
- **Clore un fil n'efface rien** : les commentaires restent visibles, mais le fil ne pollue plus ta vue active.
- Sur mobile, **les images et formats markdown** s'affichent correctement dans la vue dépliée du Fil.
- Si quelqu'un ajoute un commentaire dans un fil clos, **le fil se rouvre automatiquement** (statut « Réouvert »).
