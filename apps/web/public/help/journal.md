# Journal — la page d'accueil

C'est l'écran que tu vois en ouvrant l'app. Le contenu et les actions disponibles changent radicalement selon que tu es Owner ou Guest.

---

<!-- role:owner -->
## 👑 Côté Owner

C'est ton **carnet du jour**. Une page = un jour. Tu navigues d'un jour à l'autre avec les flèches en haut, ou tu cliques sur la date pour ouvrir un sélecteur.

### Naviguer dans le temps
- **Flèches gauche/droite** — jour précédent / suivant (impossible d'aller dans le futur)
- **Clic sur la date** — ouvre un date picker pour sauter à n'importe quel jour passé
- **Bouton « Aujourd'hui »** — apparaît uniquement quand tu es sur une date passée

### Écrire une nouvelle note
- Bouton **« + Nouvelle note »** en bas de la liste — crée un brouillon avec l'heure courante
- La page scrolle automatiquement vers la nouvelle note pour que tu puisses commencer à écrire tout de suite

Chaque note a un **type** (Journal par défaut, mais aussi Livre, Film, Série, Musique, etc.) et peut contenir du texte riche, des images, de l'audio, des **vidéos**, des blocs de code, des annotations.

### @ Mentionner ton confident

Dans une note (ou un commentaire), tape **@** puis choisis ton confident dans la liste qui apparaît. La mention s'affiche en couleur et il reçoit une **notification**.

Discrétion : il n'est prévenu que s'il a le **droit de lire** la note. Si tu le mentionnes dans une note **secrète** ou que tu ne lui as **pas partagée**, aucune notification ne part.

### Titres et sections repliables

Dans une note longue, structure ton contenu avec des **titres** (`#`, `##`, `###`…). Chaque titre peut se **replier** : clique sur le petit chevron à gauche du titre pour masquer toute sa section, jusqu'au prochain titre de même niveau ou supérieur. Replier un grand titre replie aussi ses sous-titres. Ça fonctionne **en écriture comme en lecture**, et tout est **déplié par défaut** à l'ouverture. En lecture, le bouton **« Tout replier / Tout déplier »** agit aussi sur les titres, et un **sommaire cliquable** apparaît automatiquement dès 3 titres. Le repli est juste un confort d'affichage : il n'est pas enregistré.

### Le tracker du jour (daily log)

En haut de la page, un bloc **« Ressenti du jour »** te permet d'enregistrer un état **global du jour**, indépendamment de tes notes individuelles.

- **Mood** (emoji), **météo**, **heures de sommeil**, **énergie** (1-5), **anxiété** (1-5)
- Replié par défaut quand vide, déplié automatiquement dès que tu remplis quelque chose
- En mode replié, un aperçu compact résume l'état : `🙂 ☀️ 😴 7h ⚡ 4/5 🌀 2/5`
- Le tracker suit **la date sélectionnée** : tu peux remonter dans le temps via les flèches et remplir un jour passé
- Sauvegarde automatique + sync serveur. Le confident **Confidant** voit le recap dans sa timeline (lecture seule).

C'est complémentaire aux champs mood/sommeil/météo qui existent sur chaque note : le daily log est ton ressenti **global du jour**, les champs par note sont ponctuels.

### Les sections contextuelles

Plusieurs blocs apparaissent **uniquement quand pertinent** :

- **Souvenirs** — quand tu as écrit à la même période les semaines, mois ou années passées. Les trois périodes (**il y a une semaine / un mois / un an**) ont chacune leur couleur. L'app te propose un **échantillon au hasard**, renouvelé à chaque ouverture (ou via **« Mélanger » 🔀**), pour te faire redécouvrir des notes différentes. Sur mobile, le bloc reste **compact** : il n'affiche **qu'un seul souvenir**, avec un bouton **« + N autres souvenirs »** pour dérouler la liste, et **« Voir tout »** qui ouvre la liste complète d'une période dans un panneau ; clique une note pour la **lire sur place**. Tu peux aussi **replier complètement** le bloc avec le chevron : ton choix est **mémorisé** et il reste replié aux visites suivantes. Visible uniquement aujourd'hui.
- **Brouillons en cours** — petit badge avec lien vers la page Brouillons s'il y en a au moins un.
- **Capsules temporelles** — bouton qui n'apparaît que s'il existe au moins une capsule programmée.
- **Lu par le confident** — œil 👁 avec compteur, pour filtrer les notes que ton confidant a déjà lues.

### Filtrer et trier la journée

Au-dessus de la liste, plusieurs lignes de filtres s'affichent automatiquement quand utiles :

- **Recherche** — cherche dans le contenu, le titre, les tags, les métadonnées média
- **Tri** — Heure ↓/↑, Ajouté ↓/↑
- **Filtres de type** (Journal, Livre, Film…) — n'apparaissent que s'il y a au moins un type non-Journal ce jour
- **Filtres de visibilité** (🔒 Privé, 🌐 Partagé, 🤝 Spécifique) — n'apparaissent que si la journée contient au moins une note non-privée

### Mode sélection multiple

Bouton avec l'icône de damier en haut. Active des cases à cocher sur chaque note. Une barre apparaît en bas avec les actions en lot :

- Mettre/retirer en brouillon
- Changer la visibilité (Privé / Partagé / Spécifique)
- Marquer comme « Pour toi » (💌 confident)
- Changer l'humeur (mood)
- Ajouter ou retirer un tag

### Vue capsules temporelles

Bouton **« Capsules »** dans la barre des filtres. Bascule l'affichage pour ne montrer que les capsules :

- **Scellées** — pas encore débloquées
- **Ouvertes** — date passée, lisibles maintenant

Bouton **« ← Retour au journal »** pour revenir.

### 💡 Astuces Owner

- La sauvegarde est **automatique et continue** — tu n'as pas de bouton « Enregistrer ».
- Tu peux choisir une **police d'écriture** selon ton humeur (le menu les regroupe par ressenti) et **mettre des morceaux de texte en couleur** : sélectionne le passage, clique le bouton **A coloré** de la barre d'outils et choisis une teinte. Police, taille et couleur sont conservées en lecture, dans les aperçus et à l'export PDF.
- Une note **sans contenu** reste en brouillon (visible uniquement sur la page Brouillons et avec le badge dédié sur le journal).
- Le **mode sélection** est le moyen le plus rapide de partager plusieurs notes d'un coup.
- Les **filtres** se souviennent de leur état entre les sessions (un seul espace de stockage local).
- Pour insérer une **vidéo** dans une note, clique sur l'icône caméra dans la barre d'outils de l'éditeur. MP4, WebM et MOV sont acceptés, jusqu'à 500 Mo. Une barre de chargement s'affiche pendant l'envoi. La vidéo s'intègre directement dans la note avec un lecteur (lecture, pause, avance rapide).
- Le bouton **Corriger** (orthographe et grammaire) suit la règle de sélection : si tu as sélectionné un passage, il ne corrige que celui-ci ; sinon toute la note.
<!-- /role -->

---

## 👤 Côté Guest

L'accueil ressemble plus à un **fil chronologique** : un défilement vertical des notes partagées avec toi, regroupées par jour.

### Filtres et recherche

- **Recherche** — cherche dans titres, contenu et métadonnées
- **Filtres de tri / type / visibilité / tags** — comme côté Owner
- **« Non lus »** — toggle pour ne voir que les notes pas encore lues (badge bleu pulsant sur les non-lus)

<!-- role:confidant -->
### 🤝 Filtres exclusifs au Confidant

- **« 💛 Pour moi »** — uniquement les notes que l'Owner t'a explicitement adressées avec le bouton « Pour toi »
- **« ⏱ Ajouts »** — uniquement les notes que l'Owner a éditées récemment (ajouts dans des notes anciennes)
- **« Capsules »** — vue dédiée aux capsules temporelles (verrouillées + débloquées)
<!-- /role -->

### Lire, réagir, commenter

- Clic sur une carte → ouvre la note en grand dans une fenêtre. Sur mobile, ferme-la d'un **glissement vers le bas** depuis l'en-tête (ou avec la croix).
- Bouton **« Marquer lu »** dans la fenêtre, ou icône en raccourci sur la carte
- Bouton **🙂+** sur la carte → poser une [réaction emoji](reactions.md) sans avoir à commenter
- Pour commenter, sélectionne du texte dans une note → bouton **« 💬 Commenter »** apparaît. Tu peux aussi laisser un commentaire général en bas de la note.
- Dans un commentaire, tape **@** pour **mentionner l'Owner** : il reçoit une notification « tu as été mentionné·e ».

### Notes 18+

Si l'Owner a marqué une note comme [contenu 18+](adulte.md), elle apparaît **floutée** dans la timeline avec un badge orange. Pour la lire, il faut répondre à une question. Voir l'article dédié pour le détail.

### 💡 Astuces Guest

- Les notes **non lues** ont un point bleu pulsant — utile pour repérer ce qui est nouveau.
- Si l'Owner t'envoie une notification, tu peux **cliquer dessus** pour aller directement à la note et au commentaire concerné.
- Le défilement est **infini** : il charge 10 jours à la fois en remontant.
- Si tu es Confidant, n'oublie pas que tu peux aussi accéder à **Tâches**, **Collection**, **Stats** et **Calendrier** depuis les icônes en haut de la page.
