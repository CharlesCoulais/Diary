# Verrou de lecture

> 🔒 **L'Owner** active le verrou. Les guests concernés doivent répondre pour accéder au contenu.

Le verrou de lecture permet de **conditionner l'accès d'une note à une réponse** du guest. Tu définis une condition (un engagement, une promesse, une question…), et le guest ne voit le contenu qu'une fois sa réponse acceptée.

C'est différent des autres mécanismes de protection :
- **Secret 🔐** = personne d'autre ne voit la note, point.
- **18+ 🔞** = contenu flou + question à réponse unique + hash local.
- **Verrou 🔒** = la réponse est libre, tu la lis, tu décides (ou tu laisses l'automatique le faire).

<!-- role:owner -->
## 👑 Activer le verrou sur une note

1. Ouvre une note → bouton **🔒** dans la barre d'actions (à côté de 🔞).
2. Une fenêtre s'ouvre :
   - **Condition d'accès** — le texte affiché au guest avant d'accéder. Ex. : *« En lisant cette note, tu t'engages à ne pas en parler autour de toi. »*
   - **Réponses acceptées** *(optionnel)* — une liste de formulations qui déverrouillent automatiquement (ex. « promis », « je m'engage », « ok »). Insensible à la casse et aux espaces en début/fin.
3. Clique **Enregistrer**.

### Deux modes de validation

| Réponses définies | Réponse du guest | Résultat |
|---|---|---|
| Oui | Dans la liste | ✅ Déverrouillage automatique |
| Oui | Hors liste | ⏳ En attente — tu valides manuellement |
| Non (liste vide) | N'importe quoi | ⏳ En attente — tu valides manuellement |

Dans tous les cas, tu vois **exactement ce que le guest a écrit**.

### Voir et valider les réponses

Dans la note (mode lecture), une section **Réponses reçues** liste les guests qui ont répondu :
- Leur nom et leur réponse
- Le statut : ✅ approuvé / ⏳ en attente / ❌ refusé
- Des boutons **Accepter** / **Refuser** pour les réponses en attente

Tu reçois aussi une **notification push** à chaque réponse qui attend ta validation.

### Désactiver le verrou

Re-clique sur le bouton **🔒** → **Supprimer**. Toutes les réponses associées sont effacées et le contenu redevient accessible normalement (selon la visibilité de la note).

### Badge sur la preview

Un badge **🔒 Verrou** s'affiche sur la note dans le journal et la timeline. Le survol indique combien de réponses acceptées sont définies, ou « validation manuelle » si la liste est vide.
<!-- /role -->

## 👁️ Côté guest

Si une note que tu peux normalement lire a un verrou actif :

- **Sur la timeline** — la note s'affiche mais avec un contenu masqué.
- **À l'ouverture** — un écran présente la condition d'accès et un champ de réponse. Tu lis la condition, tu tapes ta réponse, tu envoies.
- **Déverrouillage auto** — si ta réponse est dans la liste acceptée, le contenu s'affiche immédiatement.
- **Attente de validation** — sinon, un message t'indique que ta réponse a été transmise à l'owner et qu'il doit valider. Reviens plus tard.
- **Refusé** — si l'owner a refusé ta réponse, un message te l'indique. Tu peux soumettre une nouvelle réponse.

## 💡 Astuces

- Pour un engagement simple (« je promets de ne pas juger »), mets « je promets », « promis », « ok » dans la liste des réponses acceptées — tu évites d'avoir à valider chaque guest manuellement.
- Pour une vraie validation manuelle (tu veux lire leur réponse avant de décider), laisse la liste vide.
- Le verrou est **par note**, pas par guest — tous les guests qui peuvent lire la note sont concernés.
- Combiner **Verrou + Capsule temporelle** est possible : la note reste masquée jusqu'à la date d'ouverture, puis le verrou entre en jeu.
