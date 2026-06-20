# Collection

> 👑 **Owner** : ajout et édition complète.
> 🤝 **Confidant** : lecture seule.
> 👤 Guest standard : pas d'accès.

Vue dédiée à toutes tes notes de **type média** : livres, films, séries, musique, jeux, sorties, shopping. La Collection regroupe automatiquement tes lectures, visionnages, écoutes en une bibliothèque organisée.

## Ce que la Collection affiche

Toute note dont le type **n'est pas Journal** apparaît ici. Chaque entrée provient d'une note classique de ton journal — la Collection est juste **une autre vue** de tes notes média.

Types représentés :

- 📖 **Livres**
- 🎬 **Films**
- 📺 **Séries**
- 🎮 **Jeux**
- 🎵 **Musique**
- 🌿 **Sorties**
- 🛍️ **Shopping**

## La structure visuelle

### Onglets de filtrage en haut

- **« Tout »** + un onglet par type **présent dans ta collection**
- Seuls les types pour lesquels tu as au moins une note s'affichent
- Le compte total d'œuvres uniques est indiqué

### Rechercher dans ta collection

Sous les onglets, un champ **« Rechercher un titre, un auteur… »** filtre instantanément ta collection au fil de la frappe. La recherche est **insensible aux accents et à la casse** et regarde dans le **titre**, l'**auteur/réalisateur/artiste**, le **nom de série**, l'**album** et le **nom de playlist** (ainsi que chaque morceau d'une playlist musique). Elle se combine avec les onglets de type et le filtre de statut. Le bouton **×** efface la recherche.

### Deux modes d'affichage automatiques

L'app choisit automatiquement entre deux dispositions selon ce que contient la sélection :

- **Mode cartes** (grille 4 colonnes) — quand au moins une œuvre a une **image de couverture**. Couverture, titre, auteur, progression, note en étoiles, badge de statut.
- **Mode lignes** — sinon. Plus compact, vignettes plus petites.

### Regroupement par série

Les volumes d'une même série (les tomes d'un manga, les saisons d'une série, les films d'une saga) sont **automatiquement regroupés** sous un seul élément, qui affiche la progression cumulée (« T.1–T.3 / 7 », « 2/4 saisons · 18/96 ép. », etc.).

### Regroupement par morceau et par artiste (Musique)

Côté musique, deux niveaux d'agrégation :

1. **Par morceau** : si le même morceau (`titre + artiste`) apparaît dans plusieurs notes — y compris à travers des playlists — il est représenté par **une seule carte** avec un badge `N notes` indiquant combien d'occurrences existent.
2. **Par artiste** : quand un artiste a **≥ 2 morceaux distincts** dans ton journal, ils sont fusionnés en **une carte artiste** affichant `<artiste> · N morceaux`. Au clic, le sheet liste chaque morceau avec un player et le contenu de la note source.

Les playlists sont donc **éclatées** dans la Collection : une playlist de 5 morceaux contribue 5 entrées potentielles, pas 1 carte unique. Si plusieurs morceaux de la playlist sont du même artiste, ils sont regroupés sous l'artiste.

### Regroupement par statut

Dans chaque type, les œuvres sont triées par statut :

1. **En cours** (lecture/visionnage actif)
2. **Terminé**
3. **Abandonné**
4. Sans statut

Une **barre de filtre** sous les onglets permet de ne voir que les œuvres d'un statut donné.

#### Statut tome vs statut série

Pour les œuvres **multi-tomes** (livre avec volume/série) ou les **séries TV** (multi-saisons) ou les **sagas de films** (avec nom de saga), tu disposes de **deux statuts distincts** dans le panneau métadonnées :

- **Statut du tome / de la saison / du film** — l'état de cette unité précise
- **Statut de la série / saga** — l'état global du groupe

Dans la Collection, c'est le **statut de la série** qui est affiché et utilisé pour le filtre. Tu peux donc avoir un tome marqué « Terminé » sans que toute la série le soit — pratique pour repérer ce qu'il te reste à lire / regarder.

Pour une œuvre **mono** (livre seul, film seul…), un seul statut est demandé : « Statut » tout court.

## Items de Collection (Owner)

Tu peux référencer des œuvres dans ta Collection **sans avoir écrit de note** dessus — par exemple un manga acheté pas encore lu, ou un film à voir.

Sous le capot, un **item de Collection est une note du journal "masquée"** : même schéma, mêmes champs (statut, page, tome, chapitre, note sur 5…), mais elle n'apparaît **ni dans la Timeline, ni dans le Journal, ni dans le Fil du confident** tant que tu n'as pas écrit dessus.

Statuts possibles : **Wishlist** (envie) · **Possédé** (pas commencé) · **En cours** · **Terminé**.

Bouton **« Ajouter un titre »** au-dessus de la grille. Tu choisis le type, le statut, puis tu cherches via les APIs (livres / films / séries / musique) ou tu saisis manuellement (titre + auteur).

**Ouvre un item** (tap sur la carte) pour :
- Voir et éditer toutes ses métadonnées (le panneau média complet est disponible)
- Changer son statut via les pills (Wishlist / Possédé / En cours / Terminé)
- Le supprimer

### Éditer un item sans le sortir de la Collection

Quand tu ouvres une série depuis la Collection, chaque tome propose un bouton **« Éditer »**. Il ouvre le panneau métadonnées complet (résumé, note sur 5, statut, progression, volume…) et tes modifications sont enregistrées **sans que l'item apparaisse dans le journal** — il reste un item de Collection masqué. Pratique pour enrichir le résumé d'un tome ou ajuster le statut d'une série au fil de tes achats.

### Suivre les saisons et épisodes d'une série

Pour une **série TV**, tu peux cocher les épisodes vus au fil du temps, **sans créer de note**.

- Quand tu ajoutes une série depuis la recherche, ses **saisons et leur nombre d'épisodes** sont récupérés automatiquement.
- Ouvre la série depuis la Collection : la section **« Saisons & épisodes »** liste chaque saison repliable, avec une **case par épisode**. Le suivi est **cumulatif** : cliquer l'épisode 8 coche d'un coup les 7 précédents. Re-cliquer un épisode déjà vu ramène le suivi juste en dessous. Le bouton **« Tout cocher »** marque une saison entière d'un coup.
- Pour les **longues séries** (ex. plusieurs centaines d'épisodes), un champ **« Vu jusqu'à l'épisode N »** permet d'indiquer directement le dernier épisode vu sans faire défiler la grille (qui n'est affichée que pour les saisons de taille raisonnable).
- Besoin d'ajuster ? **« Ajouter une saison »**, change le **nombre d'épisodes**, ou clique **« Récupérer depuis la fiche »** pour re-synchroniser depuis le service en ligne. Tout fonctionne aussi **manuellement**, sans recherche.
- La carte affiche la progression (« 2/4 saisons · 18/96 ép. ») et le **statut évolue tout seul** : *En cours* dès le premier épisode coché, *Terminé* quand tout est vu.
- **Série déjà présente ?** Si tu ajoutes une série que tu as déjà (en collection ou en notes), elle n'est pas dupliquée : le suivi des épisodes est **rattaché à l'entrée existante** et rafraîchi depuis la fiche en ligne, en conservant les épisodes déjà cochés. Un message te le confirme.

### Transformer un item en note

Quand tu commences vraiment à lire/regarder, le bouton **« Créer une note »** (à côté d'« Éditer », dans le détail de l'item) transforme l'item en **vraie note du journal** — instantanément, sans ressaisie. L'œuvre, sa couverture, son résumé, son statut : tout est conservé. La note apparaît alors normalement dans ta Timeline et ton Journal.

### Modifier plusieurs items en lot

Bouton **« Modifier en lot »** → tap sur les cartes pour les sélectionner → la barre du bas permet de changer leur statut ou de les supprimer d'un coup. Ne s'applique qu'aux items de Collection (pas aux notes).

### Ajout en masse pour les séries

Quand tu as 20+ tomes d'un manga à enregistrer, c'est relou de tout taper un par un. Coche **« Ajouter plusieurs tomes d'un coup »** dans la sheet d'ajout (visible pour les livres uniquement), saisis le **nom de la série** (ex: *One Piece*), l'**auteur**, et la **plage de tomes** (de 1 à 25 par exemple).

Tous les tomes sont créés instantanément :
- même titre + auteur partagés
- un champ `volume` distinct par tome (1, 2, …, N)
- un `seriesName` qui les regroupe automatiquement dans la Collection : 1 seule carte pour la série, avec le décompte « N tomes ».

Si tu n'as que certains tomes (ex: 5 à 10), ajuste juste la plage de début. Pour tout regrouper après coup en cas de saisie individuelle, assure-toi simplement que le **nom de la série** est identique sur tous les tomes.

**Recherche par tome en mode bulk** : sélectionne un résultat (la série) → l'app récupère la **couverture et le résumé spécifiques** de chaque tome via Open Library. Si un tome n'est pas trouvé, on retombe sur la couverture commune de la série.

### Modifier plusieurs items en lot

Bouton **« Modifier en lot »** au-dessus de la grille → tap sur les cartes pour les sélectionner (cercle de validation en haut à gauche, anneau accentué). Une barre d'action en bas propose :
- Basculer toute la sélection en **Possédé**
- Basculer toute la sélection en **Wishlist**
- **Supprimer** la sélection

La sélection multiple ne s'applique qu'aux items de collection (pas aux notes du journal). Utile pour ranger ou nettoyer une saga d'un coup.

## Métadonnées affichées

Chaque carte/ligne affiche :

- **Couverture** ou icône colorée du type
- **Titre** de l'œuvre (ou nom de série si série)
- **Créateur** (auteur, réalisateur, artiste)
- **Progression** :
  - Livres : « T.1 / 3 · p. 45 / 200 »
  - Films : « F.1 » ou « F.1 / 5 » pour les sagas
  - Séries : « 2/4 saisons · 18/96 ép. » (suivi par épisode, cf. plus haut)
  - Dev : « 12 / 50 chapitres »
  - Quizz : « 3 / 10 quizz » (quizz regroupés par thème, cf. l'aide Quizz)
- **Note en étoiles** (★) — si tu en as mis une
- **Badge de statut** (En cours / Terminé / Abandonné)
- **Nombre de volumes** pour les séries

## Modifier les métadonnées (Owner)

Clic sur une œuvre → ouvre un panneau qui affiche **toutes les notes** de cette œuvre/série. Bouton ✎ pour ouvrir un formulaire d'édition groupée :
- **Pour les livres/films/séries** : éditer le `seriesName` qui regroupe les volumes
- **Pour la musique** : éditer titre, artiste, album, cover, note — appliqué à toutes les occurrences (mono ET tracks dans playlists, routé automatiquement au bon endroit)
- **Pour un groupe artiste** : le bouton est désactivé (modifier propagerait sur des morceaux différents)

Note : pour ajouter une nouvelle œuvre à ta Collection, **tu ne crées pas l'entrée depuis la Collection elle-même**. Tu crées une note normale dans ton Journal et tu lui donnes le type approprié (Livre, Film, etc.) avec ses métadonnées.

## 🤝 Côté Confidant

Vue identique en lecture seule. Tu peux ouvrir une œuvre pour voir le détail des notes que l'Owner a écrites dessus, mais tu ne peux pas modifier les métadonnées.

---

## ⭐ Souvenirs

L'onglet **Souvenirs** regroupe toutes les photos et vidéos que tu as marquées comme souvenir dans tes notes, affichées en grille visuelle par mois.

### Marquer un média comme souvenir

Depuis l'éditeur, insère une image ou une vidéo puis clique sur l'icône ⭐ qui apparaît sur le bloc média. Le souvenir apparaît automatiquement dans l'onglet Souvenirs de la Collection.

### Tags sur les souvenirs (Owner)

Chaque tuile affiche un bouton **+** en haut à gauche. Clique dessus pour ouvrir l'éditeur de tags :
- Tape un mot et valide avec **Entrée** pour ajouter un tag
- Clique sur **×** à côté d'un tag pour le supprimer
- Clique sur **OK** pour fermer

Les tags sont personnels (ils ne s'affichent pas dans la note elle-même) et servent uniquement à filtrer tes souvenirs dans cet onglet.

### Filtres

La barre sticky en haut propose deux filtres cumulables :

- **Tags** — menu déroulant multi-sélection : coche un ou plusieurs tags pour ne voir que les souvenirs correspondants. Le bouton indique le nombre de tags actifs ("Tags · 2").
- **Période** — deux boutons "Depuis…" et "Jusqu'à…" ouvrent chacun un sélecteur mois/année (grille + navigation annuelle). Sélectionner une plage restreint les souvenirs à cette fenêtre temporelle.

Un bouton **Réinitialiser** apparaît dès qu'un filtre est actif.

### Ouvrir la note liée

Chaque tuile affiche un bouton **Voir →** (en bas à droite) qui ouvre directement la note du journal d'où provient le souvenir.

### Contenu sensible

Les souvenirs issus de notes **spoiler** apparaissent floutés par défaut — un tap révèle l'image ou la vidéo. Les souvenirs issus de notes **18+** nécessitent le déverrouillage adulte pour la session en cours.

### 🤝 Côté Confidant

Le Confident voit les souvenirs des notes qui lui sont partagées. Les tags posés par l'Owner sont visibles sur les tuiles et actifs dans le filtre Tags — mais le Confident ne peut pas modifier les tags.

---

## 💡 Astuces

- **Ajouter une couverture** à une note de type Livre/Film/etc. déclenche automatiquement le passage en mode cartes pour ce type — la grille devient beaucoup plus visuelle.
- Les **séries multi-volumes** sont détectées automatiquement : si plusieurs notes partagent le même `seriesName`, elles sont regroupées.
- Le **statut « Abandonné »** est précieux : il évite que les œuvres que tu as commencées sans finir polluent ton « En cours ».
- La Collection est aussi un excellent moyen de **redécouvrir ce que tu as lu/vu il y a longtemps** — utilise la note en étoiles pour retrouver tes coups de cœur.
