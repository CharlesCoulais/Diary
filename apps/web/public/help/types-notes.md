# Types de notes

> 🌍 **Tous les rôles** voient les types, mais seul l'**Owner** peut les attribuer aux notes.

Chaque note a un **type** qui détermine sa nature : entrée de journal classique, livre lu, film vu, série suivie, album écouté, etc. Le type sert à organiser ton journal en plusieurs « volets » thématiques sans les éparpiller dans des apps différentes.

## Les types disponibles

| Type | Icône | Usage typique |
|------|-------|---------------|
| **Journal** | ✦ | Entrée de journal classique (le défaut) |
| **Livre** | 📖 | Suivi de lectures (titre, auteur, progression, notes) |
| **Série** | 📺 | Séries TV (saisons, épisodes, note) |
| **Film** | 🎬 | Films vus |
| **Musique** | 🎵 | Albums écoutés, morceaux découverts |
| **Sortie** | 🌿 | Lieux visités, restaurants, événements |
| **Shopping** | 🛍️ | Achats, wishlists |
| **Dev** | ⌨ | Projets perso, tickets dev |
| **Quizz** | ? | Quiz à se faire tester (QCM ou réponse libre) |
| **Agenda** | 🗓️ | Événements datés, avec vue liste ou calendrier |
| **Finance** | € | Budget : revenus / dépenses, solde, catégories |

Chaque type a une **couleur dédiée** qui apparaît partout : dans la grille du calendrier, dans la barre du filtre, dans la bordure des cartes Collection, etc.

## Créer tes propres types

En plus des types intégrés, tu peux **définir tes propres types de notes** avec leur **nom**, leur **couleur** et leur **icône** (un emoji). Par exemple un type « Voyages », « Rêves » ou « Recettes ».

Un type personnalisé **reprend le comportement d'un type intégré** que tu choisis : c'est lui qui décide de ce que la note sait faire.
- Cale-le sur **Agenda** → ta note « Voyages » aura la vue événements + calendrier.
- Cale-le sur **Finance** → elle gérera un budget.
- Cale-le sur **Journal** → une note texte simple.
- Cale-le sur **Livre / Film / Série / Musique** → elle rejoint la Collection avec couverture, progression, etc.

### Créer un type à la volée

Dans une note, ouvre le **sélecteur de type** (les pastilles Journal, Livre, Agenda…) : tes types personnalisés y apparaissent déjà comme les autres, suivis d'un bouton **« + Type »**. Touche-le pour ouvrir un petit formulaire : un **nom**, une **couleur** à choisir parmi les pastilles, un **emoji** en guise d'icône, et le champ **« se comporte comme »** où tu choisis le type intégré dont il hérite. Valide, et le type est **créé puis appliqué à la note dans la foulée**.

### Gérer tes types dans les réglages

Pour t'en occuper tranquillement, va dans **Réglages → Affichage → Types de notes**. Tu peux y :
- **créer** un type (le même petit formulaire que ci-dessus) ;
- **renommer**, **recolorer**, changer l'**emoji** ou le **comportement** d'un type existant ;
- **réordonner** la liste avec les **flèches ↑ / ↓** (c'est l'ordre dans lequel tes types s'affichent dans le sélecteur) ;
- **supprimer** un type. À côté de chaque type, tu vois **combien de notes l'utilisent** : tant qu'il en reste, la suppression est **bloquée** (pour ne rien casser). Change d'abord ces notes de type, puis tu pourras le supprimer.

Tes types personnalisés apparaissent **partout** comme les types intégrés (sélecteur, filtres, calendrier, statistiques, bordure des cartes) et sont visibles **en lecture par ton confident**.

### Des champs sur mesure

Tu peux aussi donner à un type **tes propres champs** (en plus du comportement hérité). Dans **Réglages → Affichage → Types de notes**, ouvre un type et clique **« Ajouter un champ »**. Chaque champ a un **nom** et un **format** au choix :

- **Texte** (court) et **Texte long**
- **Nombre**
- **Date**
- **Case à cocher** (oui / non)
- **Note** (1 à 5 étoiles)
- **Liste déroulante** (un seul choix parmi des options que tu écris)
- **Liste multi-choix** (plusieurs choix)

Exemple pour un type « Dessin » : un champ *Support* (liste : Crayon, Aquarelle…), *Dimensions* (texte), *Terminé* (case à cocher), *Note* (étoiles).

Ensuite, quand tu écris une note de ce type, ces champs apparaissent **à remplir** dans l'éditeur ; en lecture, **seuls les champs remplis** s'affichent, chez toi **et** chez ton confident. Si tu retires un champ du type plus tard, les anciennes valeurs disparaissent simplement, sans rien casser.

## Comment ça change l'expérience

### Métadonnées spécifiques
Selon le type, tu peux remplir des champs supplémentaires :
- **Livres** : titre, auteur, couverture, tome, page courante, total pages, note en étoiles, ISBN (avec scan code-barres)
- **Séries** : titre, créateur, couverture, saison, épisode, total saisons, note, et **suivi épisode par épisode** (cases « vu » par saison, dans la [Collection](collection.md))
- **Films** : titre, réalisateur, affiche, note, n° de film dans une saga
- **Musique** : titre du morceau, artiste, album, pochette, **lien streaming** (YouTube/Spotify/SoundCloud/Deezer), note, **paroles + traduction**
- **Sortie** / **Shopping** : sujet, lieu, lien, note
- **Agenda** : une liste d'**événements** (titre, date et heure de **début**, lieu). Tu peux aussi donner une **date et heure de fin** (bouton « Ajouter une fin ») — la plage s'affiche alors en lecture (« → 11:00 » le même jour, « → 20 juin 18:00 » sur plusieurs jours). Les événements se trient automatiquement par date puis heure (ceux sans heure en fin de journée) ; quand plusieurs partagent le même créneau (souvent sans heure), des **flèches ↑/↓** te laissent les **réorganiser** à la main. En lecture, bascule entre une **liste** (à venir / passés, groupés par jour) et un **mini-calendrier** mensuel où les jours avec un événement sont marqués.
- **Finance** : un **budget** — des lignes de **revenus / dépenses** (libellé, montant, catégorie, date). En lecture : **total des entrées, des sorties et solde**, plus la **répartition des dépenses par catégorie**. (Agenda et Finance restent dans le Journal, pas dans la Collection.)

En plus des notes individuelles, deux **pages dédiées** (dans le menu) rassemblent tout : la page **Agenda** affiche en un calendrier (ou une liste) **tous** les événements de toutes tes notes Agenda ; la page **Budget** consolide **toutes** tes notes Finance (total entrées/sorties, solde, catégories, détail par note) et te laisse fixer un **solde de départ** synchronisé entre tes appareils. Touche un élément pour ouvrir la note d'origine.

### 🎵 Musique : mono ou playlist
Une note Musique peut contenir **un seul morceau** (mode classique) ou **plusieurs morceaux** (mode playlist).

- En mode **mono**, tu renseignes les champs du morceau directement
- Bouton **« + Ajouter un autre morceau »** : passe automatiquement en mode playlist. Le morceau actuel devient le morceau #1, un morceau vide est ajouté en #2
- En mode playlist :
  - Un champ **« Nom de la playlist »** apparaît en haut
  - Des **pills numérotées** permettent de naviguer entre les morceaux (chacun a ses propres champs)
  - En lecture/preview, tu peux **‹ N/M ›** ou **swiper** pour passer d'un morceau à l'autre. Clique le compteur **« N/M »** pour **aller directement à un morceau** : tape son numéro, ou choisis-le dans la liste (pratique sur les grandes playlists)
- Chaque morceau a son propre champ **Paroles** (original + traduction). Le bouton **« Récupérer »** va chercher les paroles via lrclib.net si tu as titre + artiste.
- Bouton **« ⇪ Importer une playlist (.json) »** : importe une playlist depuis un fichier d'export **Skiley** (le service qui sait exporter tes playlists Spotify en `.json`). Une fenêtre te laisse **choisir les morceaux** à importer (avec un filtre) et régler : le **lien d'écoute** (Spotify ou YouTube — YouTube retrouve chaque morceau, avec repli sur Spotify), la récupération automatique des **pochettes**, et celle des **paroles**. Chaque morceau devient une pill (titre, artiste, album, lien d'écoute). L'import **s'ajoute** aux morceaux déjà présents, il ne les remplace pas.

### Apparition dans la Collection
Toute note avec un type **non-Journal** apparaît automatiquement dans la page [Collection](collection.md), regroupée par type et par série. Tu n'as rien à faire d'autre que d'attribuer le bon type.

### Filtres et stats
- Sur le **Journal** et la **Timeline**, tu peux filtrer par type
- Sur le **Calendrier**, les jours s'affichent avec un point coloré par type présent
- Sur les **Stats**, une barre par type montre la répartition de tes notes

## Choisir le bon type

Tu peux changer le type d'une note **à tout moment** via le sélecteur de type (icône en haut de la note). Re-cliquer sur le type actif te ramène au type Journal par défaut.

**Conseil** : ne te casse pas la tête avec les types. Si tu as un doute, garde « Journal ». Tu pourras toujours requalifier plus tard.

## 💡 Astuces

- **Les filtres de type ne s'affichent pas** sur la page Journal si tu n'as que des entrées de type Journal ce jour-là. Ils apparaissent dès que tu ajoutes ne serait-ce qu'une note d'un autre type.
- Le **type Dev** est utile si tu mélanges journal personnel et notes de travail — il permet de les distinguer visuellement et de les filtrer.
- La **page Collection** est la plus intéressante pour les types Livre/Série/Film/Musique : c'est là que les regroupements automatiques de séries/saisons/tomes prennent tout leur sens.
- Tu peux **partager une note d'un type** comme n'importe quelle autre — un confidant Confidant peut suivre tes lectures, mais aussi un guest standard si tu marques la note partagée.
