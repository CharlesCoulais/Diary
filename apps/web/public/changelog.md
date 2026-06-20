# Nouveautés

Les évolutions récentes de l'application, du plus récent au plus ancien.

## v0.14.0 — 20 juin 2026

### 🧩 Des champs sur mesure pour tes types de notes

- Sur un **type de note personnalisé**, tu peux maintenant définir **tes propres champs** : un nom + un format au choix (texte, texte long, nombre, date, case à cocher, note en étoiles, liste déroulante, liste multi-choix). Tu les ajoutes dans **Réglages → Affichage → Types de notes**.
- Quand tu écris une note de ce type, ces champs apparaissent **à remplir** dans l'éditeur ; en lecture, seuls les champs remplis s'affichent, chez toi comme chez ton **confident**.
- Par exemple un type « Dessin » avec *Support*, *Dimensions*, *Terminé* et une *Note* en étoiles.

## v0.13.0 — 20 juin 2026

### 🏷️ Tes propres types de notes

- Tu peux maintenant **créer tes propres types de notes** (en plus des types intégrés Journal, Livre, Agenda…), avec **leur nom, leur couleur et leur icône**. Pratique pour te faire un type « Voyages », « Rêves », « Recettes »… à toi.
- Chaque type personnalisé **reprend le comportement** d'un type existant que tu choisis : un type « Voyages » calé sur **Agenda** affichera la vue agenda (événements, calendrier), un type « Recettes » calé sur **Journal** sera une note texte classique, etc.
- Crée-les **à la volée** depuis le sélecteur de type d'une note (bouton **« + Type »**), ou gère-les tranquillement dans **Réglages → Affichage → Types de notes** (renommer, recolorer, changer l'icône, réordonner).
- Tes types personnalisés apparaissent **partout** comme les types intégrés : sélecteur, filtres, calendrier, statistiques, et chez ton **confident** en lecture. La suppression d'un type est **bloquée** tant que des notes l'utilisent (pour ne rien casser).

## v0.12.3 — 18 juin 2026

### 🔍 Zoom sur les photos

- Quand tu ouvres une photo en grand, tu peux maintenant **zoomer** : **pince à deux doigts** ou **double-tap** sur mobile, **molette** ou **double-clic** sur ordinateur, puis **glisse** pour te déplacer dans l'image zoomée. Valable partout (notes, collection, messagerie).

### 🎨 Couleurs des types de note revues

- Chaque type de note (Journal, Livre, Film, Agenda, Finance…) a maintenant une **couleur distincte et adaptée au thème** : des teintes profondes en mode clair, plus lumineuses en mode sombre. Fini les couleurs trop proches (Agenda/Finance, Film/Finance…) qui se ressemblaient selon le thème.

### 🗓️ Agenda : heure de fin & réorganisation

- Chaque **événement** d'une note Agenda peut maintenant avoir une **date et heure de fin** (bouton « Ajouter une fin »). La plage s'affiche en lecture : « → 11:00 » pour une fin le même jour, « → 20 juin 18:00 » sur plusieurs jours.
- Les événements **sans heure** d'une même journée (et plus largement ceux qui partagent le même créneau) peuvent être **réorganisés à la main** avec des **flèches ↑/↓** dans l'éditeur. Le tri par date et par heure reste automatique pour le reste.

### 👀 Confident : en-tête des notes plus compact (mobile)

- Côté lecture confident, l'en-tête de chaque note tient désormais sur **une seule ligne** en mobile : la date passe en **format court** (« 17/06 »), au lieu du format long qui faisait doubler la hauteur du bandeau (et qui répétait la date déjà affichée en titre de section).

### 🔴 Pastille « à répondre » sur le Fil

- L'onglet **Fil** de la barre du bas (mobile) affiche désormais une **pastille** avec le nombre de fils **qui attendent ta réponse** — comme c'était déjà le cas dans le menu de gauche sur ordinateur. Plus besoin d'ouvrir la page pour savoir s'il y a du nouveau.
- Le compteur est **cohérent partout** (barre du bas, menu mobile, menu de gauche) : un fil compte tant que tu n'y as pas répondu ou que tu ne l'as pas clôturé.

### 🛠️ Correction — scroll bloqué après une photo (mobile)

- Sur mobile, après avoir agrandi une photo puis être revenu au journal, le **scroll restait bloqué** (il fallait fermer l'app). Corrigé.

### 🛠️ Édition des notes : mise en page alignée

- Quand tu modifies une note **avec des champs structurés** (Livre, Film, Série, Musique, Agenda, Finance, Quizz, Sortie, Achats, Dev…), ces champs s'affichent désormais **juste sous le titre**, et la zone de texte libre passe **en dessous** — au lieu de se retrouver tout en bas avec un grand vide au-dessus. Le journal classique est inchangé (tu écris directement). Corrigé sur ordinateur **et** mobile, pour tous les types de notes.

---

## v0.12.2 — 17 juin 2026

### 📇 Carnet de contacts

- Une nouvelle page **Contacts** (menu de gauche / menu mobile) : ton carnet d'adresses, à part du journal.
- Pour chaque contact : **prénom, nom, lien** (famille, ami, enfant…), **anniversaire**, **téléphone, email, adresse** et des **notes**. Le téléphone et l'email sont cliquables (appel ou mail direct).
- L'**anniversaire** affiche l'âge et te prévient quand il approche (« dans X jours », « aujourd'hui 🎉 »).
- Les contacts sont **regroupés par lien** en sections **repliables** (Famille, Ami, Enfant…), pour t'y retrouver d'un coup d'œil.
- Une **recherche** filtre instantanément par nom, lien, téléphone, email…
- **Partagé avec ton confident** : il voit le carnet en lecture seule (il ne peut ni ajouter, ni modifier, ni supprimer).

### 👀 Confident : Agenda, Finance & Calendrier complets

- Les notes **Agenda** et **Finance** affichent maintenant leur **contenu** côté confident : un **résumé** dans la liste (« 1 événement », « Solde −53 € · 1 ligne ») et le **détail complet** (événements, budget) à l'ouverture — avant, la note s'affichait vide.
- La page **Calendrier** se remplit aussi côté confident (les jours avec des notes qu'il peut lire), et son **menu de navigation** s'affiche enfin sur mobile.
- En **mode compact**, les notes Agenda/Finance affichent leur résumé (« 1 événement », « Solde −53 € · 1 ligne ») au lieu de « Note vide » — côté owner comme confident.
- Côté confident, la **zone de réponse** des commentaires est désormais ancrée **en bas** de la note (comme chez l'owner), au lieu de flotter au milieu de l'écran sur les notes courtes.

### 🎨 Nouvelle icône

- L'application a une nouvelle **icône** (un carnet) — visible dans l'onglet du navigateur et sur l'écran d'accueil une fois installée. *(Si tu l'as déjà installée sur ton téléphone, retire-la puis réinstalle-la pour voir la nouvelle icône.)*

---

## v0.12.1 — 17 juin 2026

### 🔐 Accès confident étendu : Calendrier, Agenda, Budget

- L'owner peut maintenant activer, **pour chaque confident de niveau « Confident »**, l'accès aux vues **Calendrier**, **Agenda** et **Budget** (trois toggles dans Réglages → Confidents → Modifier).
- Le confident voit les pages correspondantes dans son menu de navigation (uniquement si l'accès lui a été accordé).
- Les pages **Agenda** et **Budget** affichent les notes qu'il peut lire — pas d'actions d'écriture pour le confident.
- Sur la page **Budget**, le confident voit le solde de départ en lecture seule (l'input d'édition reste propriétaire).
- Sur le **Calendrier**, la barre d'actions de l'owner est masquée pour le confident.

---

## v0.12.0 — 17 juin 2026

Une grosse passe de **confort, lisibilité et cohérence**, surtout sur mobile, plus quelques nouveautés et beaucoup de corrections.

### 🗓️ Deux nouveaux types de notes : Agenda & Finance

- **Agenda** : une note qui rassemble tes **événements datés** (titre, date, heure, lieu). Affichage en **liste** (à venir / passés, groupés par jour) ou en **calendrier** mensuel — les jours qui ont un événement sont marqués, tape-les pour voir le détail.
- **Finance** : une note **budget** — ajoute tes **revenus et dépenses** (avec une catégorie), et vois d'un coup d'œil le **total des entrées, des sorties et ton solde**, plus la **répartition des dépenses par catégorie**.
- On les choisit comme les autres types de note (via le bouton **« ··· »** du sélecteur). Elles vivent dans ton Journal — pas dans la Collection.
- **Deux pages dédiées** (menu de gauche / menu mobile) qui rassemblent tout, sans avoir à fouiller les notes :
  - **Agenda** : un **calendrier** (ou une liste) de **tous tes événements**, toutes notes Agenda confondues. Tape un événement pour ouvrir sa note.
  - **Budget** : ta situation **globale** sur toutes tes notes Finance — total des entrées, des sorties, **solde**, dépenses par catégorie, et le détail par note. Tu peux fixer un **solde de départ** (le point de départ avant tes mouvements) ; il est **synchronisé entre tes appareils**.

### 📖 Plus lisible, plus confortable au doigt

- Le texte trop petit a été remonté partout (un plancher de lisibilité a été posé), **sans changer ton réglage de taille** par appareil.
- Cibles tactiles agrandies un peu partout : flèches et points des carrousels, cases du **calendrier** et du **baromètre** (lisibles même en portrait), pastilles de filtres, cases d'épisodes…
- Le champ « sommeil » ne tronque plus la valeur ; les échelles énergie/anxiété affichent des repères (« à plat … à fond », « calme … panique »), et leurs moyennes sont indiquées **sur 5** avec leur échelle (fini l'ambiguïté du sens).
- Le nuage d'humeurs reflète enfin vraiment la fréquence (tailles graduées au lieu de deux tailles).
- **Humeur & météo** : on distingue clairement « de cette note » et « **Ressenti du jour** » (avant, les deux se ressemblaient et prêtaient à confusion).
- En **mode clair**, le texte gris secondaire est un peu plus contrasté (lisibilité conforme aux standards d'accessibilité), tout en gardant le ton chaleureux.

### ✍️ Écriture & organisation sur mobile

- **Barre d'outils de l'éditeur** désencombrée : sur mobile, seuls les outils de base restent visibles, le reste se déplie via **« ⋯ »** (et les boutons sont plus gros au doigt).
- **En-tête d'une note** : les réglages rares et sensibles (18+, verrou de lecture) passent dans le menu **« ⋯ »** pour ne plus être tapés par erreur.
- **Tâches** : en tri manuel, réordonne avec des **flèches ↑/↓** au doigt (le glisser-déposer ne marchait pas sur téléphone).
- **Commentaires** : la barre de mise en forme (gras, italique, **@**, …) est désormais toujours visible.

### 🧭 Filtres & navigation

- Sur mobile, les barres de filtres sont **repliées par défaut** (moins de bruit), avec un dégradé qui indique qu'on peut faire défiler.
- Les menus déroulants ne débordent plus hors de l'écran.
- Un bouton **« Réinitialiser les filtres »** apparaît quand une recherche ou un filtre ne renvoie rien.
- **Calendrier** : touche le nom du mois pour **sauter directement à un mois / une année** (fini les dizaines de taps pour remonter loin) ; le type « Journal » apparaît aussi dans la légende.
- Sur mobile, le menu (avatar) ouvre directement les **brouillons** et les **Nouveautés** (avec une pastille quand il y a du nouveau).

### 💬 Fil de discussion

- Le statut **« À répondre »** a été repensé : il reste tant que tu n'as pas répondu (ou clos le fil), même après l'avoir lu — c'est un vrai rappel. Un **point bleu « non lu »** distinct signale les nouveaux messages.
- Les compteurs de filtres sont colorés selon leur sens (corail = à répondre, vert = répondu).
- Le nom de l'auteur d'un commentaire est coloré de façon cohérente partout (toi vs l'autre), et **ouvrir un fil te place directement sur le passage commenté** au lieu de tout en bas.

### 📮 Boîte à demandes

- Change le statut d'une demande **en un tap** directement sur la carte, sans ouvrir le formulaire.
- Côté confident : bouton **« Annuler ma demande »** plus clair, et un message explique pourquoi une demande déjà prise en charge ne peut plus être annulée.

### ✅ Tâches

- Le changement de statut ne peut plus **réinitialiser une tâche par erreur** : rouvrir une tâche terminée demande confirmation. Une suppression peut être **annulée** (petit bandeau « Annuler »).
- **Supprimer une tâche** est désormais possible **directement depuis son panneau** (bouton « Supprimer »), sur ordinateur comme sur mobile — plus besoin du glissé latéral.
- Statuts mieux distingués : chaque statut a sa couleur, et « Déployé » / « Migré » ne sont plus confondus.
- Tes filtres sont conservés quand tu agis sur la liste.

### 🗂️ Collection & brouillons

- Une note gardée **secrète** indique clairement qu'elle est confidentielle (au lieu d'une carte muette) et le rappelle au tap.
- Le panneau de détail d'une note (livre, film, série…) s'empile proprement sur mobile : les valeurs ne sont plus tronquées.
- Les **brouillons** affichent une date lisible (« modifié il y a 3 jours · 15 juin ») au lieu d'un format technique.

### 🔔 Réglages, accès & sécurité

- Gestion des **confidents** plus claire : vocabulaire, boutons plus grands, et le mot de passe régénéré est copiable avec une confirmation avant fermeture (pour ne pas le perdre).
- **Double authentification** : un code expiré te ramène proprement à la connexion avec un message dédié, et ses champs s'adaptent mieux aux petits écrans.
- La page d'**invitation** (« Rejoindre ») adopte le même style soigné que la connexion.
- Petites améliorations du code PIN et de la liste des appareils connectés.
- La **cloche de notifications** et le **journal d'activité** s'adaptent aussi aux petits écrans : listes qui ne débordent plus, détails lisibles au tap.

### 🤝 Côté confident (lecture)

- Les textes qui s'adressaient « à toi » (l'autrice) sont reformulés correctement pour le confident.
- Actions plus visibles, états vides qui expliquent, mode compact mémorisé, compteur de notes non lues.
- Un petit indice (montré une fois) rappelle qu'on peut **sélectionner un passage d'une note pour le commenter**.

### ♿ Accessibilité & retours visuels

- Squelettes de chargement (fini le flash « vide »), et les erreurs ne passent plus inaperçues.
- Navigation au clavier dans les fenêtres, libellés sur les boutons-icônes, pastilles de filtres qui ne reposent plus uniquement sur la couleur.

### 🐛 Corrections

- Les **barres et touches de couleur rouge** qui restaient invisibles à certains endroits (barres de catégorie du budget, résultats de quiz, réponses fausses) s'affichent désormais correctement.
- Deux bannières (mise à jour / notifications) qui pouvaient se superposer en haut s'empilent désormais correctement, et respectent l'encoche iOS.
- Le bouton « réactiver les notifications » envoie au bon écran selon ton rôle.
- Le bouton « effacer la météo » est de nouveau utilisable au clavier.
- Les info-bulles de réactions ne sont plus coupées sur les bords de l'écran.
- Le statut d'enregistrement (« Enregistré » / « Échec ») est visible dans l'éditeur.
- Les barres d'actions groupées (tâches, collection) ne passent plus derrière la barre de navigation.
- Couleurs du baromètre adaptées au mode sombre, et divers correctifs de lisibilité (calendrier, collection).

## v0.11.0 — 15 juin 2026

### 🎵 Importer une playlist dans une note Musique

Tu peux désormais **importer toute une playlist d'un coup** dans une note Musique, plutôt que d'ajouter les morceaux un par un. Dans le panneau d'une note Musique, le bouton **« ⇪ Importer une playlist (.json) »** accepte un fichier d'export **Skiley** (l'outil qui exporte tes playlists Spotify en `.json`). Une fenêtre s'ouvre pour **choisir précisément les morceaux** à importer (tout, aucun, ou via un filtre) et régler quelques options :

- **Lien d'écoute** : garder **Spotify**, ou utiliser **YouTube** (chaque morceau est alors retrouvé sur YouTube — pratique pour écouter sans compte Spotify ; Spotify reste en secours si la vidéo n'est pas trouvée).
- **Pochettes** récupérées automatiquement (via iTunes).
- **Paroles** récupérées automatiquement (via lrclib), si tu le souhaites.

Une barre de progression te montre où en est la récupération. L'import **complète** la note, il n'efface pas les morceaux déjà là.

### 🔗 Collage d'un lien d'écoute : titre et artiste re-remplis tout seuls

Quand tu colles un lien **Spotify, YouTube, SoundCloud ou Deezer** dans un morceau, le **titre et l'artiste se remplissent automatiquement** à nouveau. Ça ne fonctionnait plus en conditions réelles (la requête était bloquée), c'est réparé.

### ⏭ Aller directement à un élément dans une playlist / un carrousel

Sur une playlist Musique **comme sur les carrousels de photos et de vidéos**, clique le compteur **« N/M »** (à côté des flèches ‹ ›) pour **sauter directement à un élément précis** : tape son numéro, ou choisis-le dans la liste (avec vignette pour les images). Très pratique sur les grandes séries où les flèches une-à-une étaient laborieuses.

### 🏠 Clic sur « Aujourd'hui » : retour propre au jour

Sur ordinateur, recliquer **« Aujourd'hui »** dans le menu alors qu'une note était ouverte dans le volet de droite laissait cette note ouverte. Désormais ça **referme la note** et **revient au jour courant**, comme attendu.

### 🖼 Aperçu des images plus propre

Deux améliorations sur l'affichage des photos dans une note :

- Les grandes images rognées en aperçu sont maintenant **cadrées sur le centre** (et non plus sur le haut) — aperçu bien plus représentatif. Le tap pour agrandir montre toujours l'image entière.
- Quand une note contient **plusieurs images**, elles restent **toutes regroupées dans le carrousel** : la première n'est plus isolée au-dessus.

### 🏷 Une légende sous chaque photo

Tu peux désormais ajouter une **légende** sous chaque photo : dans l'éditeur, un petit champ **« Légende (optionnel)… »** apparaît sous l'image. La légende est **rattachée à l'image** (elle voyage avec elle), donc elle s'affiche en lecture — y compris **dans le carrousel**, sans le casser : chaque photo garde sa propre légende quand tu navigues d'une image à l'autre.

## v0.10.1 — 13 juin 2026

### 🕰 Souvenirs plus discrets sur mobile

Le bloc **Souvenirs** prenait trop de place en haut du fil. Sur mobile, il est désormais **compact** : il n'affiche **qu'un seul souvenir**, avec un bouton **« + N autres souvenirs »** pour dérouler la liste quand tu en veux plus. Tu peux aussi le **replier entièrement** d'un geste sur le chevron, et ton choix est **mémorisé** — s'il est replié, il le reste à tes prochaines visites. Le bloc a aussi été **allégé visuellement** pour ne plus se confondre avec les cartes de notes.

### 📱 Lecture mobile plus fluide

Plusieurs réglages pour rendre le Journal plus agréable au téléphone :

- **Filtres repliés par défaut** : on voit la première note tout de suite. Le bandeau du haut est aussi plus discret. (Ton choix de replier/déplier reste mémorisé.)
- **Fermeture au doigt** : en lecture plein écran, glisse vers le bas depuis l'en-tête pour fermer la note.
- **Réactions au tactile** : le bouton **« + »** pour réagir est toujours visible (utile notamment sur une capsule scellée), et un **appui long** sur une réaction affiche qui a réagi.
- **Mode compact mémorisé** : si tu actives l'affichage condensé, il ne resaute plus à chaque navigation.
- **Lisibilité** : aperçus de notes garantis à une taille lisible même quand la note d'origine est en petite police, et quelques textes gris trop pâles assombris.
- **Aperçus fidèles** : l'aperçu d'une note reflète désormais sa **mise en forme** — police d'écriture, couleurs, mentions @ (chip accent), **gras, italique, souligné, barré et code** (en pastille colorée). Les passages **masqués** (spoilers) s'affichent en petit pavé discret, et fini les marqueurs parasites (`~~`, `` ` ``) qui s'affichaient en clair ou les mots qui se collaient.
- Petites notes pulsantes « non lu » remplacées par un point fixe (plus reposant, meilleure autonomie), et fil **« Récemment modifié »** chargé progressivement plutôt que d'un bloc.
- **Vue lecture du confident alignée sur celle de l'autrice** (l'édition en moins) : sous chaque note ouverte, on retrouve désormais la **météo**, les **tags**, les boutons **favoris / à oublier** et l'**humeur** — en plus de ce qui existait déjà. Ces infos restent aussi affichées sur les cartes du fil.

## v0.10.0 — 12 juin 2026

### @ Mentions

Tu peux maintenant **mentionner une personne** (toi ↔ ton confident) dans une **note** ou un **commentaire** : tape **@** puis choisis le nom dans la liste qui apparaît. La mention s'affiche en couleur, et la personne reçoit une **notification** (push + cloche) « tu as été mentionné·e ».

Discrétion respectée : si tu mentionnes ton confident dans une note qu'il **n'a pas le droit de lire** (note secrète, ou note que tu ne lui as pas partagée), **aucune notification** ne part — il n'est prévenu que pour ce qu'il peut réellement voir.

## v0.9.20 — 12 juin 2026

### ✦ Récap du mois

Une nouvelle section dans les **Statistiques** : Claude te résume ton mois en une **courte lettre**, écrite à partir de tes notes et de ton ressenti du jour. Les mois s'affichent en **liste repliable** (le plus récent ouvert), chacun indiquant s'il a déjà un récap ; tu génères ou régénères celui que tu veux, et il s'écrit sous tes yeux. Ton **confident** peut relire ces récaps (en lecture seule).

### 🌙 Sommeil & ressenti

Toujours dans les **Statistiques**, un nouvel aperçu croise ton **suivi du jour** avec ton **sommeil** : énergie et anxiété moyennes selon tes nuits, avec le nombre de jours derrière chaque tendance. Volontairement prudent tant que le suivi est récent : les tendances se précisent au fil des semaines.

## v0.9.19 — 11 juin 2026

### 🕰 Souvenirs

La section **Souvenirs** s'enrichit :

- **Plus de souvenirs** affichés, et un **tirage au hasard à chaque ouverture** de la page : tu ne retombes plus sur les mêmes notes plusieurs jours de suite. Un bouton **« Mélanger » 🔀** retire d'autres souvenirs à la volée.
- Les trois périodes — **il y a une semaine**, **un mois**, **un an** — sont maintenant **différenciées visuellement** (chacune sa couleur).
- **« Voir tout »** ouvre un **panneau latéral** avec la liste complète des notes de la période, et cliquer sur une note la **lit sur place**, sans changer de page.
- Les **confidents** ont eux aussi leurs Souvenirs en haut du journal — uniquement parmi les notes qui leur sont partagées.

### 🔴🟢 Baromètre : journée partagée

Une **4ᵉ couleur** fait son entrée au baromètre : la **journée partagée**, pour les jours qui ont clairement eu **des bons moments ET des tensions**. Elle s'affiche en dégradé rouge/vert dans le calendrier, le récap du mois et la légende.

### 🖼 Images

- **Import multiple** : le bouton image de l'éditeur accepte désormais **plusieurs photos à la fois** (elles s'insèrent dans l'ordre choisi).
- Les images **non redimensionnées** apparaissent maintenant correctement dans le **carousel** des cartes de notes, mélangées aux images redimensionnées et aux vidéos, dans l'ordre du contenu.

### ✍️ Éditeur

- **Texte en couleur** : un nouveau bouton **A coloré** dans la barre d'outils permet de **mettre des morceaux de texte en couleur**. Sélectionne le passage, choisis une teinte dans la palette — la couleur est conservée en lecture et à l'export.
- **Beaucoup de nouvelles polices d'écriture** (calligraphies, scriptes, manuscrites…) réparties par humeur, et un **sélecteur plus lisible** : le menu affiche un aperçu plus grand, et les **polices calligraphiques fines** (qui paraissaient minuscules) sont **agrandies automatiquement** pour rester lisibles — à l'écran comme dans tes notes — sans que tu aies à changer la taille à la main.
- **Copier/coller** : plus d'**espace parasite** ajouté sur chaque saut de ligne lors d'un collage de texte. Les notes existantes se nettoient automatiquement à la prochaine modification.
- **Réduire les lignes vides** et **Corriger l'orthographe** : si du texte est **sélectionné**, ces boutons n'agissent plus que sur la sélection (sans sélection, ils traitent toute la note comme avant).

### 📝 Cartes de notes

- La **bulle 💬** sous la preview ouvre désormais la note **en lecture, directement sur les commentaires** (avant, elle pouvait ouvrir l'édition, notamment sur les brouillons).
- L'**humeur** se modifie **directement depuis la preview** : tape l'emoji (ou le « + ») en bas à droite de la carte pour ouvrir le sélecteur, sans passer par l'édition.

### 📱 Mobile

- Le **sélecteur de météo** du ressenti du jour ne sort plus de l'écran sur mobile.

## v0.9.18 — 8 juin 2026

### Correctif export PDF

- Les passages écrits dans une **police manuscrite** (typiquement les pensées/branches, surtout celles non rattachées à un texte) gardent désormais leur **police et leur mise en forme** (italique, gras…) dans le PDF. Avant, ces passages perdaient leur style et ressortaient en texte brut.

## v0.9.17 — 7 juin 2026

### Exporter une période en PDF (avec le ressenti du jour)

Depuis le **Journal** (Timeline), un nouveau bouton **Exporter** permet de générer un **PDF d'une plage de dates** :

- Un document **chronologique** : pour chaque jour, le **ressenti du jour** (humeur, météo, sommeil, énergie, anxiété) puis **toutes les notes** de ce jour.
- Chaque note est rendue **en entier** (contenu, blocs spéciaux, images, métadonnées, commentaires et réactions), comme l'export d'une note.
- Choix de la période via des raccourcis (**Ce mois-ci**, **30 derniers jours**, **Cette année**) ou deux dates. Si un filtre « Période » est déjà actif dans le journal, il est pré-rempli. (Période limitée à 3 mois par export.)

## v0.9.16 — 7 juin 2026

### Export PDF complet et soigné

L'**export PDF** d'une note (menu de la carte → « Exporter en PDF ») rend désormais **tout**, proprement :

- Les **blocs spéciaux** ne sortent plus en `:::branch` brut : branches et ajouts différés deviennent des **encadrés**, les conversations des **bulles de chat**, les **diagrammes** sont rendus en image, et les **images** sont intégrées dans le PDF.
- Audio et vidéo (non lisibles dans un PDF) apparaissent en **encadré avec un lien** vers le fichier.
- Le PDF inclut maintenant **les commentaires** (en fil, avec auteur et date), **les réactions**, ainsi que toutes les **métadonnées** : date/heure, humeur, météo, sommeil, tags, visibilité, notations, et la fiche média complète (saisons, playlist, questions de quizz…).
- Les passages **masqués** (spoilers) sont **révélés** dans le PDF (c'est ton archive perso).

## v0.9.15 — 7 juin 2026

### Journal d'activité enrichi

La page **Journal d'activité** (Réglages → Journal d'activité) capture et montre beaucoup plus :

- **Plus d'événements** : modification d'une note (titre/contenu), changement de **visibilité**, pose/retrait d'un **verrou** (secret, 18+, verrou de lecture), **scellage/descellage** d'une capsule. Les modifications de note sont **regroupées** (au plus une toutes les 10 min par note) pour éviter le bruit.
- **Plus de détails par ligne** : l'**appareil et le navigateur** sont désormais lisibles (ex. « iPhone · Safari »), et les changements s'affichent en clair (ex. « privé → partagé », « +120 car. »).
- **Recherche & filtres de dates** : une barre de **recherche** (par note ou appareil) et un filtre **de date à date**, en plus du filtre par type.

## v0.9.14 — 7 juin 2026

### Capsules temporelles — fuite corrigée en mode compact

En **mode compact**, une **capsule temporelle scellée** affichait l'aperçu de son contenu comme une note normale — le corps de la capsule pouvait donc se lire avant la date d'ouverture. C'est corrigé : en compact, une capsule scellée n'affiche plus que son titre et son accroche (🔒), jamais son contenu, comme sur la carte pleine.

Au passage, les capsules encore scellées n'apparaissent plus dans les **Souvenirs** (« cette date ») tant qu'elles ne sont pas ouvertes.

## v0.9.13 — 6 juin 2026

### Collection — suivi des saisons et épisodes des séries

Tu peux désormais traiter une **série TV** comme une vraie fiche de collection, **sans créer de note** :

- À l'ajout d'une série depuis la recherche, ses **saisons et leur nombre d'épisodes** sont récupérés automatiquement.
- Dans le détail d'une série, chaque épisode est une **case à cocher**, en mode **cumulatif** : cliquer l'épisode 8 coche automatiquement les 7 précédents (idéal quand tu as vu les 100 premiers d'un coup). Re-cliquer un épisode déjà vu ramène le suivi juste en dessous. Un bouton **« Tout cocher »** par saison va encore plus vite.
- Tu peux aussi **ajouter/retirer une saison** et corriger le nombre d'épisodes à la main (utile sans connexion à la fiche en ligne).
- La carte de la série affiche la **progression** (« 2/4 saisons · 18/96 ép. ») et le statut passe tout seul en **En cours** puis **Terminé** au fil des épisodes cochés.
- Si la série est **déjà dans ta collection ou tes notes**, l'ajout n'est plus ignoré : son suivi des épisodes y est **rattaché et mis à jour** automatiquement (tes épisodes déjà cochés sont conservés).

## v0.9.12 — 5 juin 2026

### Quizz — organisés en thèmes, comme les séries Dev

Les quizz d'un même sujet se gèrent désormais comme une **série** :

- Dans l'éditeur d'un quizz, tu peux définir un **thème** (regroupe les quizz), un **n°** (ordre du quizz dans le thème) et un **total** visé. Le thème et le total se **propagent** automatiquement aux autres quizz du même thème, et l'autocomplétion du thème remplit le total connu.
- Dans la **Collection**, la carte d'un thème de quizz affiche sa **progression** (« 3 / 10 quizz ») avec une barre et un badge — comme « 27 / 50 chapitres » pour le Dev.
- En ouvrant un thème, chaque quizz est désormais **replié par défaut** (titre + nombre de questions) et s'ouvre d'un clic, dans l'ordre des n° — fini le défilement à rallonge quand un thème contient plusieurs quizz.

### API — créer & modifier des quizz

L'**API REST** permet désormais de créer (et mettre à jour) des notes de type **Quizz** : envoie `noteType: "QUIZZ"` avec tes questions dans `mediaMeta.quizQuestions`. Les identifiants de questions sont **générés automatiquement** si tu ne les fournis pas, et un quizz mal formé est refusé avec un message clair. La doc API détaille la structure d'une question. (Au passage, l'API accepte aussi maintenant la mise à jour de `mediaMeta` via `PATCH`.)

### Statistiques — heatmap d'activité nuancée

L'activité (vue 7 jours et heatmap 30 j / année / tout) **varie maintenant en intensité selon le nombre d'entrées** du jour, relativement au jour le plus chargé de la période. Un jour à 13 entrées est nettement plus foncé qu'un jour à 4 (avant, tout ce qui dépassait 2 avait la même couleur).

### Liens cliquables dans les notes

Les **liens dans une note** (URL collée ou tapée) sont désormais **cliquables en lecture** et apparaissent correctement dans l'aperçu des cartes. Avant, une URL seule pouvait disparaître à l'affichage. Marche pour les URL nues, les autolinks et les liens `[texte](url)`.

### Collage — espacement corrigé

Coller du texte ou du markdown produit maintenant une note propre : chaque ligne reste sur sa ligne (**les sauts de ligne sont préservés**), les lignes vides multiples ne créent plus de gros trous, et les **listes** restent compactes (fini l'espace entre chaque puce). Les titres et blocs de code sont conservés.

## v0.9.11 — 5 juin 2026

### Collage — paragraphes préservés

Coller du texte avec des **sauts de paragraphe** (lignes vides) conserve désormais sa structure dans l'éditeur (avant, tout était écrasé en un seul bloc avec des retours simples). Le markdown collé (titres, listes, blocs de code ```` ``` ````) reste interprété correctement.

### Réduire les lignes vides

Un nouveau bouton dans la barre d'outils **réduit l'espacement** d'une note : chaque suite de lignes vides est ramenée d'un cran (1 ligne vide → supprimée, 2 → 1, 3 → 2…). Le texte, les titres, les listes et les blocs de code ne sont pas touchés. Pratique pour aérer/resserrer une note collée. Réversible avec Ctrl/⌘+Z.

### Branches — ancrage sur du texte formaté

Une **branche** (ou un ajout) ancrée sur un passage contenant du **code inline**, du **gras** ou de l'**italique** retrouve désormais correctement son ancrage après rechargement — avant, le lien avec le passage d'origine disparaissait dans ce cas.

### Séries TV — saisons / épisodes éditables + détail des épisodes

- Pour une série ajoutée à la main (sans recherche), tu peux maintenant saisir le **total de saisons** et le **nombre d'épisodes par saison** (en plus de la saison et de l'épisode en cours).
- Dans la fiche d'une série, chaque entrée affiche désormais sa **saison · épisode** (et son titre s'il y en a un) au lieu de la seule date.

### Collection — progression des séries Dev

Les **séries Dev** affichent maintenant leur **progression** dans la Collection (carte et liste) : nombre de chapitres rédigés sur le total prévu (ex. « 12 / 50 chapitres ») avec une barre, comme les livres. Le badge indique le nombre de **parties**.

### Quizz — blocs de code & liens cliquables

- Les **énoncés** de quiz acceptent désormais des **blocs de code** (```` ``` ````) avec **coloration syntaxique**, et du code inline / gras / liens ; les options aussi (code inline).
- Dans la **Collection**, ouvrir un quizz (ou une série de quizz) affiche désormais son **titre, le nombre de questions et le quiz jouable** directement (avant : aucune info).
- Dans la **messagerie** et les **commentaires**, les liens (URL ou `[texte](url)`) sont maintenant **cliquables**.

## v0.9.10 — 5 juin 2026

### Quizz — mélange, images & bilan

Le type **Quizz** s'enrichit :

- **Mélanger** (au choix, par quiz) : l'ordre des **questions** et/ou des **options** est tiré au sort à chaque tentative — chacun a un parcours différent, et « Recommencer » re-mélange.
- **Images** : ajoute une image à l'**énoncé** d'une question et/ou à chaque **option** de QCM (une question peut être 100 % visuelle).
- **Bilan par question** (côté toi) : sous les réponses, un récap montre le **taux de réussite de chaque question** — pratique pour repérer celles qui piègent.

## v0.9.9 — 5 juin 2026

### Notes Quizz 🎯

Un nouveau **type de note « Quizz »** : tu composes des questions, chacun fait le quiz et voit son score.

- **Composer** (toi) : ajoute des questions, chacune en **QCM** (une ou plusieurs bonnes réponses) ou en **réponse libre** (tu listes les réponses acceptées — la comparaison ignore la casse, les accents et les espaces). Réordonne les questions, ajoute une explication facultative montrée après correction.
- **Faire le quiz** (toi et tes confidents) : en lecture, réponds puis **Valide** — chaque réponse est corrigée et tu vois ton **score**, les bonnes réponses et tes erreurs. Pour une réponse libre ratée de peu, un bouton **« J'avais juste »** permet de t'auto-corriger. Bouton **Recommencer** pour refaire le quiz à zéro.
- **Chacun sa sauvegarde** : l'état du quiz est propre à chaque personne. Tu peux **voir les réponses de chaque confident** (score + détail) directement sous le quiz, et **le faire toi-même** aussi.
- **Anti-triche** : les bonnes réponses ne sont jamais envoyées à l'appareil d'un confident avant qu'il ait validé — la correction se fait côté serveur.

## v0.9.8 — 4 juin 2026

### Collection — séries repliables

Toutes les séries multi-tomes de la Collection (livres, séries, films… et pas seulement les thèmes Dev) ont leurs **tomes/saisons repliés par défaut** dans la fiche : on déplie ce qu'on veut lire.

### Souvenirs — aperçu corrigé

L'aperçu des souvenirs (« cette date ») affiche désormais « Photo » / « Vidéo » / « Playlist » pour une note sans texte, au lieu d'afficher le code brut du média.

### Séries de notes Dev dans la Collection

Les notes **Dev** peuvent désormais s'organiser en **Thème → Parties → Chapitres** dans la Collection. Sur chaque note Dev, renseigne le **Thème**, la **Partie** (n° + nom + total) et le **Chapitre** (n° + total) — le Thème et le nom de Partie s'**autocomplètent** à partir de ce que tu as déjà saisi. Toutes les notes d'un même thème se regroupent sous une seule carte ; en l'ouvrant, les chapitres apparaissent classés par partie puis par numéro de chapitre, dans l'ordre que tu as défini, avec une progression « X / N chapitres ». Dans les listes, l'aperçu d'une note Dev montre directement sa structure (thème · partie · chapitre). Dans la fiche du thème, les **parties et chapitres sont repliés par défaut** — tu déplies au fur et à mesure ce que tu veux lire.

Les métadonnées de structure sont maintenant **partagées par tout le thème** : éditer le **nom du thème**, un **total** (parties ou chapitres) ou le **nom d'une partie** sur une seule note **met à jour automatiquement toutes les autres notes concernées** (le nom de partie se propage aux notes ayant le même numéro de partie). Choisir un **thème existant** remplit ses totaux, et choisir une **partie existante** reprend son numéro — plus besoin de tout ressaisir note par note.

### Liens cliquables en lecture

Les liens `[texte](url)` sont désormais **cliquables** en mode lecture (ils s'affichaient en texte brut). Ils s'ouvrent dans un nouvel onglet ; les URL non sûres (`javascript:`…) sont ignorées. Owner et confident.

### Titres repliables

Chaque **titre** d'une note peut désormais se **replier** pour masquer sa section (tous les blocs jusqu'au titre suivant de même niveau ou supérieur) — un clic sur le chevron à gauche du titre. Ça marche **en lecture comme en édition**, à **tous les niveaux** (replier un grand titre replie aussi ses sous-titres), et tout est **déplié par défaut** à l'ouverture. En lecture, un bouton dédié **« Replier / Déplier les titres »** plie ou déplie toutes les sections d'un coup. Pratique pour naviguer dans les très longues notes (cours, séries Dev). Le repli est purement visuel : il n'est ni enregistré ni synchronisé.

### Branches & titres

- Les **longues branches** se scrollent désormais en édition (avant, le contenu au-delà d'une certaine hauteur était coupé et inaccessible).
- Un **titre vide** (`##` sans texte) ne s'affiche plus en `#` littéraux en lecture (y compris dans une branche).
- Les **blocs de code** retrouvent leur cadre sombre en édition (une régression les affichait soulignés en couleur de lien).

### Curseur en édition sur mobile

En écrivant sur mobile, le curseur reste désormais **bien visible au-dessus du clavier** — il tient compte de la hauteur du clavier et de la **barre d'outils** quand elle est placée en bas (avant, il pouvait se retrouver caché juste sous le clavier ou derrière la barre).

### Listes en lecture

Les listes à puces (`- `, `* `) et numérotées (`1. `) s'affichent désormais comme de vraies listes en mode lecture (puces / numéros et indentation) au lieu d'afficher les tirets en texte brut.

### Code inline en lecture

Le code inline entre backticks (`` `comme ceci` ``) est désormais correctement rendu en mode lecture (police à chasse fixe, fond léger) au lieu d'afficher les backticks tels quels.

### Sommaire automatique

Les notes longues affichent désormais un **sommaire cliquable** en haut, généré automatiquement à partir de leurs titres (dès 3 titres). Un clic sur une entrée fait défiler la note jusqu'au titre correspondant. Le sommaire est repliable et indenté selon le niveau des titres.

### Importer du Markdown

Un nouveau bouton dans la barre d'outils de l'éditeur permet d'**importer un fichier Markdown** (`.md`, `.txt`) directement dans une note : son contenu (titres, listes, citations, code, tableaux, liens…) est converti et inséré à l'endroit du curseur.

### Diagrammes Mermaid

Tu peux maintenant insérer des **diagrammes** dans tes notes (bouton diagramme dans la barre d'outils de l'éditeur). Écris la description en syntaxe [Mermaid](https://mermaid.js.org/) — flowchart, séquence, gantt, camembert, mindmap… — et le schéma se dessine automatiquement, avec un aperçu en direct pendant l'édition. Le rendu suit le thème clair/sombre, et tes confidents les voient à la lecture. Le bloc est **repliable** (en écriture comme en lecture), et dans les listes une note à diagramme est signalée par la mention *Diagramme* (comme *Photo* / *Vidéo* / *Playlist*). En lecture, un clic sur le diagramme (ou le bouton ⤢) l'ouvre en **plein écran** : tu peux **zoomer** (molette / pincement / boutons) et **te déplacer** dedans (glisser), double-clic pour réinitialiser. Tout est expliqué dans le centre d'aide → *Diagrammes*. (À l'export PDF, le diagramme apparaît sous forme de code source.)

Un diagramme peut aussi être placé **dans une branche ou un ajout** (mets le curseur dedans avant de l'insérer).

*Correctif* : l'**indentation** des diagrammes (essentielle aux mindmaps notamment) n'est plus perdue en repassant une note en édition — elle était auparavant supprimée, ce qui cassait le rendu.

### Blocs repliables

Les blocs **conversations** se replient désormais d'un clic sur leur en-tête (comme les branches et les ajouts tardifs), en écriture comme en lecture — pratique pour alléger les longues notes.

### Journal d'activité

Une nouvelle page **Journal d'activité** (réservée à toi, dans *Réglages → Journal d'activité*) regroupe l'historique de ton carnet : connexions et tentatives échouées, changements de mot de passe ou de double authentification, sessions révoquées, lectures et commentaires de tes confidents, mais aussi les **notes** créées/supprimées, les **tâches** (création, changement de statut, suppression), les **demandes de sujets**, les **réactions**, les marquages **favori / à oublier** et les **messages envoyés**. Le journal est **exhaustif** (toute action d'écriture y figure, pratique pour le debug) ; un **filtre par type** (multi-sélection, regroupé par catégorie) permet de n'afficher que ce qui t'intéresse, et « Afficher plus » remonte le temps. Les adresses IP restent anonymisées et les évènements de plus de 90 jours sont purgés automatiquement.

### Recherche dans la Collection

Un champ de recherche fait son apparition en haut de la Collection. Tape un titre, un auteur, un nom de série ou d'album : la liste se filtre instantanément. La recherche ignore les accents et la casse, regarde dans tous les champs (titre, créateur, série, album, playlist et chaque morceau d'une playlist) et se combine avec les filtres de type et de statut. Un bouton × efface la recherche.

### Rappel — et streak — du suivi quotidien

Tu peux désormais activer un rappel dédié à ton **ressenti du jour** (humeur, sommeil, énergie, anxiété, météo), avec sa propre heure dans *Réglages → Notifications*. Il est malin : il ne te relance **que si tu n'as encore rien noté** ce jour-là. Et pour t'aider à tenir l'habitude, une pastille **🔥** apparaît sur le bloc « Ressenti du jour » et compte tes jours de suivi consécutifs.

### Déverrouillage biométrique

Sur les appareils compatibles, tu peux maintenant déverrouiller le carnet avec **Face ID, Touch ID ou ton empreinte** au lieu du code PIN. Active-le dans *Réglages → Code PIN* (un PIN doit déjà être configuré) : un bouton « Déverrouiller par biométrie » apparaît alors sur l'écran de verrouillage. Le code PIN reste toujours disponible en secours. C'est local à l'appareil.

---

## v0.9.7 — 2 juin 2026

### Souvenirs — filtres redesignés et sticky

La barre de filtres de l'onglet Souvenirs a été entièrement repensée pour s'intégrer dans la barre sticky en haut de la page, comme pour le reste de la Collection et la Timeline. Elle reste visible au scroll.

- **Picker de mois custom** : fini le sélecteur natif du navigateur. Un clic ouvre un panneau élégant avec navigation `< 2026 >` et une grille des 12 mois. Le mois sélectionné s'affiche directement sur le bouton ("Avr 2026"), avec un × pour effacer.
- **Dropdown multi-select pour les tags** : un bouton "Tags" s'ouvre sur une liste avec cases à cocher. Sélectionner plusieurs tags filtre les souvenirs qui en ont au moins un. Le compteur "Tags · 2" indique les tags actifs.

### Souvenirs — tags visibles pour le Confident

Les tags que l'Owner a ajoutés sur ses souvenirs sont maintenant visibles pour le Confident : les pastilles apparaissent sur les tuiles et le filtre Tags est actif dans la barre de filtres. Le Confident ne peut pas modifier les tags.

### Fix — éditeur de tags bloqué par le hover

Lors de l'ajout d'un tag sur une tuile Souvenir, le bouton "OK" était parfois masqué par l'overlay "Voir →" qui apparaissait au survol. Corrigé : l'overlay est masqué pendant toute la durée de l'édition.

---

## v0.9.6 — 2 juin 2026

### Vidéos dans les notes

Tu peux désormais insérer des vidéos directement dans tes notes de journal — idéal pour les souvenirs filmés (spectacles, vacances, moments de famille). Clique sur l'icône caméra dans la barre d'outils de l'éditeur, choisis ton fichier MP4, WebM ou MOV, et la vidéo s'intègre dans ta note avec un lecteur complet (lecture, pause, seeking). La barre de progression indique l'avancement de l'envoi. Taille maximale : 500 Mo.

---

## v0.9.5 — 2 juin 2026

### Séparateur `---` en lecture

Les lignes `---` placées dans une note s'affichent désormais comme une ligne de séparation horizontale en mode lecture, comme en édition. Auparavant elles s'affichaient en texte brut.

### Spoiler sur une image

La syntaxe `||![alt](url)||` (image entourée de doubles pipes) affiche l'image floutée en lecture. Un clic révèle l'image. Même comportement que les spoilers texte, mais adapté aux visuels sensibles.

### Verrou 18+ — insensible à la casse et aux accents

La réponse au verrou 18+ accepte maintenant toutes les variantes : `Indécent`, `indécent`, `INDÉCENT` et même `indecent` (sans accent) déverrouillent la note si l'une de ces formes est la bonne réponse. Les anciens verrous déjà configurés continuent de fonctionner.

### Fix scroll éditeur — le curseur reste visible en écrivant

En écrivant une longue note, la fenêtre scrollait parfois trop tard ou pas du tout, laissant le curseur hors de la zone visible. Corrigé : la vue suit le curseur au fil de la frappe.

### Fix tri — ordre stable quand plusieurs notes au même créneau

Quand plusieurs notes partagent la même section (Matin, Après-midi…), leur ordre pouvait varier aléatoirement selon les tris. Désormais le tie-breaker est `createdAt` aligné sur la direction du tri principal : tri descendant → la plus récente en haut, tri ascendant → chronologique.

## v0.9.4 — 23 mai 2026

### Spoilers `||texte||` dans notes et commentaires

Tape `||quelque chose||` ou utilise le bouton dédié pour cacher un passage. En lecture, le texte s'affiche flouté avec un curseur pointeur — un clic révèle. Une fois révélé, ça reste visible pour la session (revient masqué à la prochaine ouverture de la note).

**Trois façons de poser un spoiler côté note :**
- Tape `||texte||` directement
- Bouton « œil barré » dans la toolbar de l'éditeur
- Raccourci clavier **⌘⇧S** (Cmd+Shift+S)

**Côté commentaire** : nouveau bouton **◐** dans la toolbar formatage qui s'ouvre au focus (à côté de G / I / S / `).

En preview de carte, les spoilers sont remplacés par `▓▓▓` pour indiquer qu'il y a du contenu caché sans le révéler — il faut ouvrir la note pour cliquer.

### Notes à venir — bloc-notes rapide d'idées d'écriture

Nouveau petit panneau sur **Aujourd'hui** (owner uniquement) pour capturer en une seconde une idée d'écriture à ne pas oublier. Input rapide, liste des idées en attente, click sur le rond pour marquer comme écrite, croix pour supprimer.

**Côté confident** : le panneau s'affiche aussi en **lecture seule** sur son Aujourd'hui — il voit ce sur quoi tu comptes écrire prochainement, sans pouvoir interférer. Le bloc est masqué si tu n'as aucune idée en attente.

Les idées vivent comme des tâches spéciales (`taskType: writing-idea`) — tu les retrouves dans l'historique Tasks côté Owner. Elles sont filtrées hors de la vue Tâches côté Confident pour ne pas polluer sa liste.

### Reset password — régénération par l'owner

Plus simple qu'un flow email : si un confident oublie son mot de passe, l'owner clique « Régén. mdp » dans **Réglages → Confidents**. Un mot de passe temporaire lisible (10 caractères sans ambiguïté) s'affiche **une seule fois** dans un bandeau jaune avec un bouton Copier. L'owner le transmet via SMS / IRL / chat de confiance.

À sa prochaine connexion, le confident est forcé sur un écran **« Choisis ton mot de passe »** — impossible de naviguer dans l'app tant qu'il n'a pas posé son mdp définitif. Toutes ses anciennes sessions sont coupées au moment du regenerate.

Pour l'owner lui-même : `pnpm --filter @carnet/api reset:password` en CLI (déjà existant).

### Confidents : soft-delete au lieu de cascade

Quand tu révoques un confident, on garde l'historique de ses interactions (commentaires, réactions, favoris/à oublier, réponses au verrou). Auparavant, `user.delete` cascade-supprimait tout — la chronologie de tes échanges disparaissait avec le confident.

Désormais, soft-delete via `revokedAt` : le confident ne peut plus se reconnecter, n'apparaît plus dans la liste des actifs, mais ses traces de conversation restent visibles dans ton journal.

### Détection iOS PWA avant l'activation des push

Si tu es sur Safari iOS hors PWA (= sans avoir ajouté Diary à l'écran d'accueil), le toggle « Activer les notifications » est désactivé avec un guide jaune qui explique l'étape manquante. Safari 16.4+ ne supporte les Web Push qu'en mode standalone — auparavant le toggle s'activait mais l'envoi échouait silencieusement.

### Performance Timeline — chargement progressif

Sur **Toutes les notes**, on monte désormais 50 cartes au démarrage puis on en ajoute 50 par 50 à mesure que tu scrolles (un petit indicateur en bas montre combien il en reste). Évite le freeze de plusieurs secondes au mount initial quand tu as ~250+ entrées.

### Améliorations sécurité & polish

- **Toggle uniformes** : les boutons à bascule dans Réglages → Affichage utilisent maintenant le même design que ceux des Notifications (plus grand, mieux contenu).
- **Tokens sémantiques** : capsules scellées, contenu 18+, secret, tâches à tester — chaque type a maintenant sa propre couleur de marque cohérente partout (au lieu de teintes hardcodées par-ci par-là).
- **Dropdowns mobile bis** : 5 dropdowns restants (avatar menus, sort picker…) repositionnent maintenant leur panneau s'il déborde.
- **Inputs iOS** : les champs de saisie passent automatiquement à 16px sur mobile tactile pour empêcher le zoom Safari au focus.
- **Login : protection IP** : en plus de la limite 10 essais / email, on bloque 30 essais échoués / IP / 15min — évite le credential stuffing depuis une seule machine.
- **Menu avatar Owner uniforme** : sur `/aujourd-hui`, le menu hamburger affichait une variante incomplète. Tout est aligné maintenant.
- **Confidentialité** : un confident ne peut plus accéder aux bonnes réponses du verrou de lecture via DevTools, ne voit plus la liste des autres destinataires d'une note `SHARED_SPECIFIC`, et chaque consultation de timeline laisse un audit log.

## v0.9.3 — 23 mai 2026

### Masquer par défaut mes notes « à oublier »

Nouveau réglage dans **Réglages → Affichage → Notes** (Owner **et** Confident) :

> **Masquer mes notes « à oublier »**

Quand le toggle est activé, les notes que **toi** as marquées « à oublier » (rating ⊘) disparaissent silencieusement de tes vues principales — Aujourd'hui / Journal / Timeline. Les notations posées par d'autres personnes (confidents ou owner) **n'entrent pas** dans cette logique, c'est purement « cache ce que **moi** j'ai voulu oublier ».

**Bypass automatique** : si tu actives le pill **« À oublier »** dans la barre de filtres (n'importe quelle option du dropdown), la pref est temporairement ignorée sur cette page — sinon le pool serait vidé avant le filtre et tu ne verrais rien. Aussitôt le filtre désactivé, tes notes « à oublier » redisparaissent.

Désactivé par défaut. Idéal si tu écrémes ponctuellement ton journal — marque ce qui ne t'intéresse pas, active le toggle, et la vue s'épure d'elle-même.

### Toggles de réglages — design uniforme

Les boutons à bascule de la section **Affichage → Notes** étaient légèrement plus petits que ceux du reste de la page Réglages (Notifications, Pause push, etc.). Tout est désormais aligné sur le même design (track plus large, pouce blanc bien contenu).

## v0.9.2 — 22 mai 2026

### Favoris & À oublier — une notation par utilisateur

Chaque note peut maintenant recevoir **deux types de marqueurs personnels** :

- **★ Favoris** : la note te plaît, tu veux la retrouver facilement.
- **⊘ À oublier** : la note est sans intérêt ou tu préfères qu'elle ne ressorte plus.

Les deux marqueurs sont **mutuellement exclusifs** par personne (cliquer favoris alors qu'on est sur « à oublier » bascule). Ils s'affichent dans la barre d'actions de chaque carte, à côté des réactions emoji.

**Visibilité partagée** :
- Côté **Owner** : tu vois **toutes** les notations (les tiennes + celles de chaque confident), avec leur nom au survol (desktop) ou au **long-press** (mobile).
- Côté **Confident** : tu vois uniquement **ta propre notation** + celle de l'**owner**.

**Impact sur les souvenirs** : la notification quotidienne « il y a un an » **exclut désormais** les notes que **toi (owner)** as marquées « à oublier ». Les notations des confidents ne sont pas prises en compte ici — ils marquent pour eux, pas pour toi. Plus de souvenirs gênants qui remontent.

### Nouveaux filtres : Favoris, À oublier, Options

La barre de filtres gagne **trois nouveaux dropdowns** et perd les pills isolés (Brouillons, Pour toi, Secret, 18+ y sont consolidés) :

- **Favoris** — adapte ses options selon le rôle :
  - Owner : Tous les favoris / Mes favoris / Favoris des confidents
  - Confident : Tous les favoris / Mes favoris / Favoris de l'owner
- **À oublier** — même structure, miroir de Favoris (Toutes / Les miennes / Des confidents ou De l'owner).
- **Options** — regroupe en multi-sélection les anciens pills isolés : Brouillons, Pour toi, Secret, 18+. Le trigger affiche le libellé actif (ou « Options · N » si plusieurs).

La barre de filtres est nettement plus aérée, et le 18+ rejoint enfin les autres filtres au lieu de vivre dans un coin.

### Dropdowns mobile : plus de panneau coupé hors écran

Sur mobile, certains dropdowns dont le trigger était près du bord droit (filtre Verrou, Capsules, etc.) ouvraient un panneau qui sortait de l'écran. Ils se **repositionnent maintenant automatiquement** à l'ouverture pour rester visibles, peu importe où se trouve le bouton qui les déclenche.

Concerne 10+ dropdowns dans toute l'app (filtres, picker d'heure, suggestions de tag, picker de capsule, etc.).

### Corrections de navigation Owner

- Le bouton **Réglages** du menu avatar Owner pointait par erreur vers `/reglages` (la page des Confidents) au lieu de `/settings`. Tu peux maintenant retrouver la section **Confidents** depuis le menu avatar comme attendu.
- Le bouton **Aujourd'hui** du menu Owner affichait la page dédiée Confident au lieu de la vraie page Owner. Routing corrigé.

## v0.9.1 — 21 mai 2026

### Auto-clôture des fils inactifs

Un nouveau cron tourne **chaque nuit à 03h** et clôt automatiquement les fils de discussion qui n'ont reçu **aucun commentaire** (ni de toi ni du confident) depuis **5 jours**. Plus besoin de cliquer manuellement « Clore ce fil » sur les notes anciennes — ça nettoie le **Fil** des fils qui traînent indéfiniment.

Si un nouveau commentaire arrive sur un fil clôturé automatiquement, il est rouvert comme avant (logique existante).

### Refonte des créneaux horaires — fenêtres équilibrées

Les termes du sélecteur d'heure passent de **6 à 9 créneaux**, désormais découpés en blocs de 2h cohérents (au lieu d'avoir un Matin de 6h et une Après-midi qui regroupait midi + l'aprèm) :

```
Matin            06h → 10h
Fin de matinée   10h → 12h  (nouveau)
Midi             12h → 14h  (nouveau)
Après-midi       14h → 16h
Fin d'après-midi 16h → 18h
Début de soirée  18h → 20h  (nouveau)
Soir             20h → 22h
Nuit             22h+
Libre            (sans repère horaire)
```

Disponible dans le picker d'édition de note, les filtres par créneau (Aujourd'hui / Timeline / Journal du confident) et l'API REST (nouveaux enum values `LATE_MORNING`, `NOON`, `EARLY_EVENING`).

Les notes existantes en `AFTERNOON` (qui couvraient avant 12h-16h30) restent sur leur créneau ; elles sont juste sortées à 14h dans l'ordre chronologique au lieu de 12h.

### Tri par défaut configurable (Journal)

Nouveau réglage dans **Réglages → Affichage → Notes** (Owner et Confident) : choisis l'ordre par défaut des notes sur le **Journal** (et Journal du Confident) :

- **Heure récente** (par défaut) — par date + heure d'écriture, plus récent d'abord.
- **Heure ancienne** — chronologique pour relire dans l'ordre.
- **Modification récente** — vue à plat avec les notes éditées récemment en haut.
- **Modification ancienne** — pour repérer les notes que tu n'as plus touchées.

Le réglage est **réappliqué à chaque ouverture** du Journal — si tu changes le tri via la barre de filtres en haut de page, le choix reste valable jusqu'au prochain refresh, puis revient au défaut. **Aujourd'hui n'est pas concerné** (cette page garde son propre tri persisté localement).

### Gestion globale des tags

Nouvelle section **Réglages → Tags** (Owner) qui te permet de **gérer tes tags sans repasser sur chaque note** :

- **Créer** un tag depuis les Réglages (pour préparer une nomenclature à l'avance).
- **Renommer** un tag : toutes les notes qui le portent adoptent le nouveau nom automatiquement.
- **Fusionner** deux tags : utile pour résorber les doublons (« Vacances » / « vacances » / « vacanes ») — toutes les liaisons sont basculées vers la cible, puis le tag source est supprimé.
- **Supprimer** un tag : il disparaît, les notes restent intactes (juste détaguées).
- **Nettoyer les tags inutilisés** d'un clic : un bandeau apparaît au-dessus de la liste quand des tags sans aucune note rattachée existent (restes d'anciennes notes ou typos jamais sauvegardés).

Chaque ligne affiche le nombre de notes associées pour des décisions éclairées. Les modifications se propagent vers tes autres appareils au prochain sync.

### Réglages — Taille du texte et nom d'affichage

- Nouvelle section **Affichage → Taille du texte** : quatre préréglages (**Compact / Normal / Confort / Grand**) qui scale **toute l'interface** d'un coup. Idéal pour remonter un Android d'entrée de gamme ou un vieil iPhone où le « Normal » paraît trop dense. Réglage stocké **par appareil** — ton téléphone peut être en Confort pendant que le desktop reste en Normal.
- Section **Profil** enrichie d'un champ **Nom d'affichage** : tu peux maintenant changer ton pseudo depuis les réglages (1 à 80 caractères), avec auto-sauvegarde à la perte de focus. Le nom est repris partout (commentaires, fil, messagerie, header). Laisser vide ⇒ retour au repli sur la première partie de l'email.

### Dialogues maison — fini les pop-ups système

Les anciennes **boîtes de confirmation et d'alerte natives du navigateur** (typo système crue, hors charte) sont remplacées partout par un dialogue cohérent avec le reste de l'app : suppression d'une demande, suppression d'une catégorie de tâche, ajout d'un lien dans l'éditeur, erreurs d'upload image/audio, scanner ISBN qui n'a rien trouvé… Tous passent maintenant par la même petite modale cocoa avec icône colorée selon le ton (rouge pour les suppressions, ambre pour les avertissements, vert pour les succès), support clavier (**Esc** annule, **Entrée** confirme) et tap-backdrop pour fermer.

### Colonne droite repliée sur Fil / Demandes / Collection / Tâches

Sur desktop, quand rien n'est sélectionné, la **colonne de droite disparaît** et la liste prend toute la largeur — exactement comme dans le Journal. Plus d'espace vide avec un texte "Sélectionne…" qui mange la moitié de l'écran : tu vois plus de notes / tâches / titres d'un coup d'œil, et le panneau de détail s'ouvre seulement quand tu cliques sur un élément.

### Tri par date de mise à jour

Nouveau mode de tri **« Modifié récemment »** sur **Aujourd'hui**, **Timeline** et **Journal du confident**. Bascule la liste en vue à plat (sans regroupement par date d'écriture) avec un label `Modifié il y a Xh` sur chaque carte pour repérer d'un coup d'œil ce que tu viens de toucher — pratique quand tu reviens compléter une note d'il y a trois mois et que tu veux la retrouver sans scroller.

Le tri par **date d'ajout** disparaît dans le Journal (il faisait doublon avec le tri chronologique) ; sur Aujourd'hui, il reste accessible.

### Mode compact — par page

Un nouveau **bouton mode compact** (icône 3-lignes, à côté du tri) sur les pages **Aujourd'hui**, **Timeline** et **Journal du confident**. Une fois activé, chaque carte se réduit à l'essentiel : l'**icône du type** (sans le label), la **date courte 21/05**, et **une seule ligne** de titre + aperçu, avec les compteurs commentaires/réactions condensés à droite. Les indicateurs (🔞, 🔒, verrou, capsule, brouillon, "pour toi") restent visibles sous forme de petites pastilles.

Deux **réglages distincts** (Aujourd'hui / Journal) dans les préférences d'affichage — tu peux activer le compact sur le Journal sans toucher à Aujourd'hui. Le toggle de la page elle-même est **éphémère** (juste pour la session en cours) et n'écrase plus tes réglages globaux.

### Verrou de lecture

Une nouvelle option sur les notes permet de **conditionner l'accès à une réponse** du guest. L'idée : avant de lire, le guest doit s'engager — écrire "promis", répondre à une question, ou toute formulation que tu lui imposes.

**Comment ça marche :**
- Active le **verrou 🔒** depuis la barre d'actions d'une note (à côté du bouton 18+).
- Rédige ta **condition d'accès** : ce que le guest doit s'engager à faire ou à accepter.
- Optionnel : définis une liste de **réponses acceptées**. Si la réponse du guest correspond (à la casse, ponctuation et accents près), l'accès est déverrouillé **automatiquement**. Sinon, tu reçois sa réponse et tu valides (ou non) toi-même.
- Un badge **🔒 Verrou** s'affiche sur la preview de la note dans le journal et la timeline. Côté confident, la preview est remplacée par la condition à valider (au lieu d'une simple ligne vide), pour qu'il sache d'un coup d'œil quelle note ouvrir.
- Dans la note, tu vois la liste de toutes les réponses reçues, avec leur statut, et tu peux les **accepter** ou **refuser** directement depuis la lecture de ta note (plus besoin de passer par la Collection).
- **Notifications dans les deux sens** : tu es alertée (cloche in-app + push) dès qu'un confident envoie une réponse, avec son texte affiché directement dans la cloche. De son côté, le confident est notifié quand tu acceptes ou refuses sa réponse, avec rappel du texte qu'il avait envoyé.
- Toggle dédié dans **Réglages → Notifications** : « Verrou de lecture » côté Owner (réponses reçues) et côté Confident (décisions de l'auteur), avec un filtre **Verrous** dans la cloche pour ne voir que ces notifs.
- **Filtre dropdown « Verrou »** sur les pages Aujourd'hui, Timeline et Journal (Owner + Confident) : multi-select par statut (accepté, refusé, en attente, non répondu) pour retrouver d'un coup les réponses en attente de validation ou les notes pas encore touchées.

### Capsules temporelles

- **Filtre dropdown « Capsules »** (Owner + Confident) sur Aujourd'hui, Timeline et Journal : multi-select par statut **scellée** / **ouverte** pour retrouver tes capsules à venir ou celles déjà ouvertes.
- **Heure d'ouverture personnalisable** : en plus du jour, tu peux maintenant définir une heure précise (ex: 18:00 le jour de ton anniversaire). Sans heure renseignée, la capsule s'ouvre à 00:00 — les anciennes capsules conservent leur heure d'origine. L'heure est toujours interprétée en **heure de Paris** quel que soit le fuseau du navigateur.
- **Notification d'ouverture** : tu reçois une notif in-app + push dès qu'une capsule atteint sa date (et heure) d'ouverture. Côté confident pareil pour les capsules partagées avec lui. Toggle dédié dans Réglages → Notifications (« Capsule temporelle ouverte »).

Tant que tu n'as pas approuvé, le guest ne voit pas le contenu — exactement comme pour les notes 18+ non résolues.

### Notes 18+ — réponse de clémence

Nouveau champ optionnel sur les notes 18+ : la **réponse de clémence**. Si tu la renseignes, après **100 essais ratés uniques** d'un même confident, son accès est automatiquement accordé et la bonne réponse lui est révélée — anti-frustration sans brader le mystère. Laisse vide pour garder le comportement actuel.

### Messagerie — chat flottant desktop & bulle réductible

- Sur **desktop**, le chat s'ouvre maintenant en **fenêtre flottante** (400×600, bas-droite) au lieu d'un panneau plein écran. Tu peux continuer à scroller ton journal en parallèle, exactement comme Messenger.
- Bouton **`–`** pour réduire le chat en **bulle pill** (avatar + nom du correspondant + badge unread) — tu navigues librement, puis tu ré-ouvres la conversation d'un tap **sans devoir re-sélectionner la personne**. Disponible aussi sur **mobile** (au-dessus du BottomNav).
- **Avatars partout** : dans la liste des conversations, dans le header de la fenêtre ouverte, et dans la bulle réduite. Plus de carrés de couleur avec une initiale comme seul indice — tu reconnais ton correspondant d'un coup d'œil.
- **Icône chat dans le sidebar du confident** (parité avec l'owner).
- **Statut « en ligne »** sur l'avatar (pastille verte, non clippée par le rond) et dans le header de conversation, basé sur la connexion temps réel.
- Scrollbar de la conversation alignée sur la charte (fine, discrète) au lieu de la barre système.

### Bouton retour en haut — refonte desktop

Le bouton **« remonter en haut »** détecte automatiquement la colonne dans laquelle il vit et écoute son scroll : sur les pages à layout deux colonnes (Collection, Tâches, Journal…), il apparaît même quand c'est la colonne intérieure qui défile et non la fenêtre. Sur desktop, il se positionne dans la **colonne de gauche** (alignée verticalement avec la bulle de chat), au lieu de flotter à droite par-dessus le panneau de détail.

### Tâches & Collection — barre de filtres sticky + scroll par colonne

- La **barre de filtres** des Tâches et de la Collection reste **collée en haut** quand tu scrolles la liste — plus besoin de remonter pour changer de catégorie ou de tri.
- Côté confident, les **Tâches** scrollent maintenant chaque colonne **indépendamment** (comme côté owner) au lieu d'embarquer toute la page : le panneau de détail à droite reste fixe pendant que tu fais défiler la liste à gauche.

### Verrouillage rapide depuis n'importe quelle page

Un **petit cadenas** s'affiche à côté de ton avatar (mobile **et** desktop), si tu as défini un PIN. Un tap = verrouillage immédiat de l'app — pratique pour reposer son téléphone à table ou couper court à un coup d'œil par-dessus l'épaule. Côté desktop, l'entrée est aussi accessible depuis le menu utilisateur du sidebar.

### Menu mobile — Fil et Notifs inversés

L'ordre du BottomNav passe à **Aujourd'hui · Journal · ＋ · Fil · Notifs** (au lieu de … · Notifs · Fil) — la cloche tombe sous le pouce droit, le Fil reste collé au bouton de création.

### Lecture et édition — finitions

- Le marqueur **`~~barré~~`** est désormais rendu en mode lecture (il ne l'était pas — il restait visible avec les tildes).
- Nouveau bouton **Souligné** (⌘U) dans la toolbar de l'éditeur.
- Les **images et GIF** sont bornés en taille — plus de portrait qui mange tout l'écran : max **70 % de la hauteur** en lecture, **40 % en preview** côté confident, avec proportions préservées.

### Confident — compteurs et menus

- Les entrées de menu côté confident affichent maintenant un **compteur** harmonisé (en mono à droite, alignement propre — fini la pastille orange qui cassait la ligne) :
  - **Aujourd'hui** = nombre de notes du jour **non lues**
  - **Journal** = total des notes
  - **Fil** = discussions à répondre
  - **Demandes**, **Collection**, **Tâches** = compteurs respectifs
- Côté **owner**, l'entrée Aujourd'hui affiche maintenant le nombre d'entrées du jour (manquait sur desktop + mobile).
- **Cloche** : les filtres par catégorie apparaissent dès qu'il y a au moins un type de notif (au lieu d'attendre 3 catégories peuplées), et restent visibles même après lecture (les badges montrent les non-lus, mais les catégories ne disparaissent plus dès que tout est lu).

### Souvenirs — finitions desktop

- Le label de période (« il y a une semaine », etc.) est raccourci en `1 sem. / 1 mois / 1 an` sur les cartes desktop pour ne plus passer à la ligne. Le libellé complet reste en tooltip.

### Divers

- **Avatar du confident visible par l'owner** : le rond d'avatar s'affichait dans un sens (owner → confident) mais pas dans l'autre, à cause d'une asymétrie de permissions sur la route `/images/:id`. Désormais symétrique.
- **Padding bas de page revu** sur les layouts deux colonnes : l'espace réservé à la bulle de chat n'est plus appliqué à la colonne de droite (panneau de détail) — seule la colonne de gauche reçoit la marge, pour ne pas créer un trou blanc en bas du détail.
- **Écran de verrouillage PIN** : couvre vraiment toute l'app (sidebar comprise) — il était masqué derrière le menu desktop dans certains cas.
- **Scrollbar fine et discrète** sur les dropdowns de filtre (tags, mood).
- **Modale notifications** : ancrée au bouton cloche (au lieu de partir hors écran en haut-droite quand on l'ouvrait depuis le bas du sidebar).
- **Picker emoji** : passe au-dessus des filtres sticky (le popover de réactions était caché derrière la barre des filtres).
- **Aperçu des notes verrouillées** côté confident : la condition à valider s'affiche directement dans la carte (mini-libellé `🔒 Verrou de lecture · « la condition »`) — plus d'aperçu vide qui empêchait de savoir laquelle ouvrir.

## v0.9.0 — 20 mai 2026

### Refonte UX desktop — layout deux colonnes partout

Toutes les pages secondaires héritent maintenant du même modèle que la **Timeline** : sur desktop, une **colonne liste à gauche** + un **panneau lecture/édition inline à droite**, sans changer de page. Sélection visible en `ring inset` + accent.

Cible : **Calendar**, **Collection**, **Tâches**, **Stats**, **Baromètre**, **Demandes**, **Fil**, **Réglages**, **Brouillons**. Plus de modale qui couvre l'écran — tu vois toujours ta liste à gauche pendant que tu lis/édites à droite.

### Calendar — modes de vue

La page **Calendrier** propose maintenant **plusieurs modes de vue** (mois / liste) avec un layout deux colonnes : sélection d'un jour à gauche → détails et notes liées à droite.

### Collection — panneau de détail inline

Sur la **Collection**, cliquer une œuvre n'ouvre plus une modale mais le **panneau de détail à droite** — édition des métadonnées, statut série/tome, création de note associée — pendant que la grille reste visible à gauche.

### Tâches — refonte du mode Confident

Le confident dispose maintenant d'une **page Tâches complète**, avec le même design que l'Owner. Les tâches de l'Owner sont visibles en **lecture seule** dans un panneau latéral (desktop) — il peut voir les détails mais ne peut rien modifier. Ses propres tâches sont entièrement éditables depuis ce même panneau.

Sur mobile, la création de tâche ne montre les boutons d'action qu'une fois qu'un titre est saisi.

### Tâches — filtre Auteur

Un nouveau menu **Auteur** permet de filtrer par créateur : « Mes tâches » ou « Confident ». Chaque en-tête de catégorie affiche désormais un compteur du nombre de tâches correspondant aux filtres actifs.

### Stats — filtres période et médias détaillés

La page **Statistiques** gagne des **filtres période** (semaine, mois, année, custom) et un **détail par média** plus riche (livres, séries, films, musique). Corrections d'accès côté Confident pour qu'il puisse consulter ses propres stats sans interférer avec celles de l'Owner.

### Baromètre — refonte desktop

Page **Baromètre** repensée pour le desktop : calendrier mensuel à gauche, détail du jour sélectionné à droite (couleur, notes liées, jour d'absence). Plus fluide pour parcourir l'année en arrière.

### Demandes — panneau de traitement

Sur les **Demandes**, sélection d'une demande à gauche → panneau de traitement à droite (accepter / refuser / commenter, créer la note associée).

### Fil — panneau droit aligné

La page **Fil** adopte le même panneau de lecture droit que la Timeline. Badge harmonisé avec le reste de l'app.

### UX desktop — corrections diverses

- Couleurs par type de note plus contrastées dans les listes desktop
- **DailyTracker** correctement centré
- **Dropdowns portalisés** (humeur, météo, statut…) pour qu'ils sortent des cards sans clipping
- Menu **⋮** sur les notes en desktop
- **Vidéos** rendues en 16:9 dans les notes (au lieu de hauteur libre)
- **Playlist** : indicateurs sous forme de dots
- Bouton **« Remonter en haut »** flottant ajusté pour ne plus chevaucher les bottom panels
- Headers sticky propres sur toutes les pages
- Améliorations diverses des filtres et de la nav guest/owner

## v0.8.10 — 19 mai 2026

### Timeline — refonte UX desktop

La **Timeline** passe sur un layout **deux colonnes** sur desktop : la liste à gauche, un **panneau de lecture inline** à droite. Tu sélectionnes une note → elle s'ouvre dans le panneau sans modale plein écran. Sélection visible via `ring inset` + couleur d'accent. Header sticky avec la barre de filtres (même style que la Home).

Premier jalon avant la généralisation à toutes les pages secondaires (v0.9.0).

### Améliorations desktop

- **Sidebar chat** repensée + bouton **Remonter en haut** dans le panneau de lecture.
- **Humeur** en dropdown au lieu d'une liste linéaire.
- **Météo** présentation minimale.
- Corrections diverses (overflow timeline, dropdowns portalisés, vidéos 16:9…).

## v0.8.9 — 18 mai 2026

### Notes 18+ — indices progressifs

Quand tu protèges une note avec une question secrète, tu peux maintenant ajouter jusqu'à **5 indices optionnels**. Ils se révèlent automatiquement après 10, 20, 30, 40 puis 50 mauvaises réponses — juste assez pour débloquer quelqu'un qui cherche vraiment, sans brader le mystère dès le premier essai.

### Design — typographie cohérente

La police **JetBrains Mono** est désormais utilisée partout pour les **timestamps**, **tags de type** (`JOURNAL`, `MUSIQUE`, `FILM`…) et les **kickers** (date au-dessus du titre Aujourd'hui, par exemple). Donne un aspect plus structuré et lisible aux éléments « techniques » de l'app. Côté confident, les labels et timestamps suivent la même règle.

### Écran de verrouillage — soigné

Le **lock screen** (PIN) gagne un design plus chaleureux :
- Kicker en font-mono pour le contexte (« Ton carnet est verrouillé » / « Le journal est verrouillé » selon le rôle)
- Titre en *serif italic* avec le prénom (« Bon retour, Dena. »)

### Bloc Ressenti — repensé

Le **DailyTracker** (humeur, sommeil, météo, énergie, anxiété) gagne :
- **Repliage** automatique pour ne pas dominer l'écran d'accueil
- **8 quick-picks** d'humeur en accès direct, avec extension pour explorer
- **Météo minimale** (les principaux états sans encombrer)
- Séparateurs plus discrets (plus de grille agressive)

### Souvenirs — allégés

La section **Souvenirs** (cette date) est plus légère visuellement, mieux intégrée à la Home — moins envahissante quand tu n'as pas envie de ressasser.

### Bouton Nouvelle note

Le bouton **« Nouvelle note »** sur la Home a été redessiné pour s'aligner avec le reste de l'interface (pas un CTA criard, mais reste reconnaissable).

## v0.8.8 — 17 mai 2026

### Messagerie directe — la bulle flottante

Une **messagerie privée** entre toi et ton confident, indépendante des notes. Une **bulle ronde** en bas à droite de l'écran, présente sur toutes les pages, ouvre la conversation.

- Les messages arrivent **en temps réel** ; un indicateur « est en train d'écrire… » montre quand l'autre rédige.
- Un **compteur de non-lus** s'affiche sur la bulle, et tu reçois une **notification push** quand un message arrive et que tu n'es pas sur l'app.
- Tu peux **modifier et supprimer** tes propres messages, et **réagir** à n'importe quel message avec un emoji.
- **Répondre à un message précis** : la réponse cite le message d'origine, et cliquer la citation y ramène.
- **Envoyer des médias** : photos, GIF (fichier ou recherche intégrée) et courtes vidéos.
- La bulle ouvre la **liste de tes conversations** : tu choisis explicitement à qui tu écris. Chaque discussion est privée et isolée — jamais un chat de groupe.

### Notifications discrètes

Une nouvelle option dans **Réglages → Notifications** : le mode **discret**. Une fois activé, tes notifications push n'affichent plus le vrai contenu sur l'écran verrouillé — à la place, un **titre** et un **message** neutres que tu choisis, et une **icône** au choix parmi un jeu sobre (cloche, météo, note, agenda, message). Le contenu réel n'est même jamais envoyé à l'appareil.

Le mode discret peut être **toujours actif**, ou **programmé selon un horaire** : tu définis des plages (jours + heures, le passage de minuit géré) pendant lesquelles les notifications deviennent automatiquement discrètes — par exemple les soirées, les nuits et tout le weekend.

Pratique pour garder le journal privé quand le téléphone traîne. *(Le système affiche toujours un petit libellé avec le nom de l'app — tu peux renommer le raccourci de l'app pour le rendre discret aussi.)*

### Mode silencieux programmé

En complément, un **mode silencieux** : tu définis des plages horaires pendant lesquelles **aucune notification push** n'est envoyée (par exemple la nuit ou en réunion). Il est **prioritaire** sur le mode discret. La cloche in-app continue de se mettre à jour — tu retrouves simplement tout au calme à ta prochaine ouverture de l'app.

### Notifications importantes

Certains types de notification peuvent être marqués **importants** : ils passent **toujours, en clair**, en ignorant les modes silencieux et discret. Par défaut, l'alerte de **connexion à un nouvel appareil** est importante — une information critique qui doit toujours arriver, quels que soient l'heure et les réglages. Tu peux ajuster la liste (messages, commentaires, tâches…) dans les réglages.

### Réglages de notification par type

Chaque type de notification a désormais son propre interrupteur dans **Réglages → Notifications**, côté owner comme côté confident — y compris un réglage dédié pour la **messagerie**. Tu choisis finement ce pour quoi tu veux être alerté (commentaires, réactions, tâches, messages, connexion à un nouvel appareil…).

### Corrections

- Cliquer une notification ouvre maintenant la note **et** le fil de commentaires ciblés, même quand on est déjà sur l'accueil (owner et confident).
- Une réaction à un commentaire déclenche bien une notification (push + cloche).
- Le défilement jusqu'au commentaire ciblé est plus fiable, et l'URL est nettoyée à la fermeture d'une note.

### Images et GIF dans les commentaires

Les commentaires acceptent maintenant les **médias** : via l'icône trombone, joins une **image** ou un **GIF** (un fichier, ou une recherche Giphy intégrée) à ton commentaire — sur la timeline comme sur la page Fil. Owner et confident peuvent en envoyer et voient ceux de l'autre.

### Les GIF des notes s'animent à nouveau

Correction d'un bug : un GIF inséré dans une note pouvait s'afficher figé sur sa première image quand son type de fichier était mal détecté (fréquent au collage). Les GIF sont désormais reconnus de façon fiable et conservent leur animation.

### « En train d'écrire… » sur les commentaires

Quand quelqu'un rédige un commentaire sur une note, les autres personnes qui ont cette même note ouverte voient apparaître **« … est en train d'écrire… »** au-dessus du champ — sur la timeline comme sur la page Fil. L'indicateur disparaît tout seul quelques secondes après la dernière frappe.

### Tout en temps réel

L'app ne se contente plus de vérifier les nouveautés toutes les quelques secondes : elle est maintenant **connectée en continu au serveur**. Concrètement, tout se met à jour **instantanément**, sans rien rafraîchir :

- nouveaux commentaires, réponses et réactions ;
- notifications (la cloche) ;
- nouvelles notes, tâches, demandes et le baromètre du couple ;
- synchronisation entre tes appareils.

Plus fluide, plus immédiat, et plus économe en batterie et en données.

## v0.8.7 — 16 mai 2026

### Baromètre du couple

Une nouvelle page **Baromètre** pour suivre la stabilité de ton couple, un jour à la fois.

Chaque jour, tu choisis une **couleur** :

- 🔴 **Journée tendue** — quelque chose t'a vraiment agacée
- 🔵 **Neutre** — rien de particulier
- 🟢 **Bonne journée** — tu as passé un bon moment en sa compagnie

Un jour non rempli passe automatiquement en **neutre**. Une couleur posée se verrouille **24 h après** — sauf si le jour était resté en neutre automatique, que tu peux fixer quand tu veux.

**Notes liées** : tu peux rattacher une ou plusieurs notes du journal à une journée, pour garder le « pourquoi » sous la main. Tu les relis directement depuis le baromètre — un lecteur s'ouvre par-dessus, sans changer de page, et tu passes d'une note liée à l'autre.

**Jours d'absence** : annote les jours où vous n'êtes pas ensemble (« Semaine dans le sud avec mes enfants », « Seule à l'appart »…) — ils s'affichent avec une petite icône, indépendamment de la couleur.

La page présente un **calendrier mensuel** coloré et un récap du mois. Le Confident peut consulter le baromètre en lecture seule, notes liées comprises — dans le respect des règles d'accès (les notes privées, secrètes, capsules scellées ou 18+ non débloquées lui restent verrouillées).

## v0.8.6 — 15 mai 2026

### Collection : ajouter, éditer et suivre tes œuvres sans écrire de note

La Collection gère maintenant tes œuvres média (livres, mangas, films, séries…) même celles sur lesquelles tu n'as encore rien écrit.

**Items de Collection.** Tu peux ajouter des œuvres que tu n'as **pas encore commencées** : un manga acheté mais pas lu, un film à voir… Bouton **Ajouter un titre** au-dessus de la grille (côté owner) : recherche via les APIs (livres / films / séries / musique) ou saisie manuelle. Statuts disponibles : **Wishlist**, **Possédé**, **En cours**, **Terminé**.

Sous le capot, un item de Collection est simplement une **note "masquée" du journal** — même schéma, mêmes champs. Il reste invisible dans la Timeline, le Journal et le Fil du confident tant que tu n'écris pas dessus.

**Éditer un item.** Ouvre une œuvre depuis la Collection : chaque item propose **« Éditer »** (panneau média complet — statut, progression, page/tome/chapitre, résumé, note sur 5 — sans rien faire apparaître dans le journal) et **« Créer une note »** (transforme l'item en vraie note du journal, instantanément, sans ressaisie : œuvre, couverture, résumé et statut conservés).

**Ajout en masse pour les séries** (livres / mangas) : coche *« Ajouter plusieurs tomes d'un coup »*, saisis la plage (ex: tomes 1 à 15), puis cherche la série — l'app récupère la **couverture et le résumé spécifiques** de chaque tome (Open Library / Google Books / BNF, et **MangaDex** pour les couvertures de mangas, bien mieux couvertes tome par tome). Les N tomes sont regroupés en **une seule carte série** (T.1–T.15 / 15).

**Modifier en lot** : bouton *« Modifier en lot »* à côté d'« Ajouter un titre ». Sélectionne des cartes, puis change leur statut ou supprime-les d'un coup.

### Statut du tome / statut de la série

Pour les œuvres multi-parties (séries de livres, séries TV, sagas de films), tu marques **deux statuts distincts** dans le panneau métadonnées :

- **Statut du tome / de la saison / du film** — où tu en es sur cette unité précise
- **Statut de la série / saga** — où tu en es dans l'ensemble

Plus de confusion entre « j'ai fini ce tome » et « j'ai fini toute la série ». La Collection affiche le statut **série** en priorité, avec un **filtre par statut** sous les onglets de type. Le statut de série modifié sur un tome s'applique automatiquement à toute la série. Pour une œuvre mono (livre/film seul), un seul statut comme avant.

## v0.8.5 — 14 mai 2026

### Date et heure dans les notifs push

Les notifications push incluent désormais un **timestamp d'émission** (heure côté serveur). L'OS l'affiche à côté de la notif et l'utilise pour trier le centre de notifs — utile pour distinguer les notifs reçues maintenant des plus anciennes.

### Partage du lien d'une note côté confident

Le confident dispose désormais d'un bouton de partage 🔗 dans l'en-tête de chaque note ouverte — pratique pour renvoyer le lien direct à l'owner quand ils discutent d'une note ailleurs (SMS, WhatsApp, mail…). Sur mobile, ouvre le picker natif ; sur desktop, copie le lien dans le presse-papier.

### Bandeau "nouvelle version disponible"

Un bandeau vert apparaît en haut de l'écran dès qu'un nouveau déploiement est en ligne, avec un bouton **Recharger** pour passer à la nouvelle version sans attendre le prochain refresh manuel. Polling toutes les 20 s.

## v0.8.4 — 14 mai 2026

### Polices choisies par humeur ✒️

Le picker de police est désormais **organisé par humeur d'écriture** (Calme, Joie, Tendresse, Intime, Rêverie, Intensité), plutôt que par classification typographique. 8 nouvelles polices ajoutées au passage.

### Bouton retour mobile

Sur mobile (Android nav bar, geste retour iOS), le bouton **retour** ferme désormais la modale / sheet ouverte au lieu de naviguer en arrière dans l'app. Plus de "Annulé en plein milieu d'une note" parce que tu cherchais juste à fermer.

Couvre :

- L'édition et la lecture d'une note (owner + confident)
- La sheet des séries / playlists
- Le picker de publication différée
- Le bottom sheet du calendrier (détail d'un jour)
- L'édition d'une tâche
- Le partage spécifique (choix des destinataires)
- Le scanner d'ISBN
- Le panneau des notifications
- Les sous-panneaux capsule temporelle, mode 18+, et menu d'actions mobile

## v0.8.3 — 14 mai 2026

### Publication différée 🕒

Quand tu sors une note du mode brouillon (dans les 48 h qui suivent sa création), un nouveau picker te propose de **différer sa visibilité côté confident** : *Maintenant*, *30 min*, *1h*, *3h*, *12h*, *24h* ou *Personnalisé*.

- Pendant le délai, le confident ne voit **rien** : ni la note dans son fil, ni de notification push.
- Toi, tu vois la note normalement, avec un petit badge orange ⏱ **« Visible HH:MM »** dans l'en-tête.
- À l'échéance, le confident reçoit la notification de nouvelle publication — pas avant.
- Si la note a déjà plus de 48 h, le picker ne s'affiche pas (le confident y a déjà accès, différer n'aurait aucun effet).
- Si tu remets la note en brouillon, le minuteur est effacé.

### Brouillons cachés 48 h (au lieu de 5 h)

Les brouillons restent désormais invisibles aux guests pendant **48 h** après leur création (vs 5 h auparavant), pour vraiment te laisser respirer le temps d'écrire.

Le badge **"Brouillon"** affiche maintenant son **âge** (ex: `Brouillon · 3h`, `Brouillon · 2j 4h`). Il passe en **rose** au-delà de 48 h pour te signaler les brouillons déjà accessibles au confident — utile pour repérer ceux où tu dois t'activer.

Article mis à jour dans le Centre d'aide → [Brouillons](/help/brouillons).

## v0.8.2 — 14 mai 2026

### Progression livres & séries

- **Page, chapitre, volume, saison, épisode** affichés directement sur la carte dans la timeline et la home — plus besoin d'ouvrir la note pour savoir où tu en es.
- Format compact : `T.2/5 · p. 148/320` pour un livre, `S2/4 E6/12` pour une série.

### Éditeur — glisser-déposer des blocs

- Les blocs **Branche**, **Conversation** et **Ajout différé** sont maintenant déplaçables par glisser-déposer grâce à la poignée ⠿.
- **Sur desktop** : la poignée apparaît au survol du bloc.
- **Sur mobile** : maintiens la poignée ~250 ms puis glisse. Le scroll normal reste possible partout ailleurs.

### Éditeur — collapse/expand en mode édition

- Le bouton **Tout replier / Tout déplier** est désormais actif aussi en mode édition (il existait déjà en lecture seule). Il apparaît automatiquement dès qu'un bloc branche ou ajout différé est présent dans la note.

### Correctifs

- **Création de branche sur mobile** : la branche s'insère correctement (régression qui empêchait toute création sur iOS/Android).
- Badge "Contenu sensible" ne passe plus par-dessus le menu de navigation en bas de l'écran.
- **Forcer la mise à jour** (Réglages) n'expire plus les notifs push — la subscription est préservée pendant le refresh.

## v0.8.1 — 13 mai 2026

### Capsules temporelles 🔒

- **Réactions et commentaires** disponibles **sans révéler le contenu** — le confident peut soutenir une capsule avant son ouverture
- Bulle 💬 + compteur de commentaires sur la card sealed (alignée sur les notes secrètes)
- Icône horloge en état **actif** sur la card quand la capsule est scellée

### Notes 18+

- **Re-verrouillage automatique** à la fermeture de la modale (la question est redemandée à la prochaine ouverture)
- Formulaire de gate visible même sur les notes très courtes

### Divers

- Toggle correct sur les branches imbriquées (l'enfant fermé ne s'ouvre plus avec le parent)
- **GIFs animés** préservés à l'upload (au lieu d'être aplatis en image statique)

## v0.8.0 — 13 mai 2026

### Conversations 💬

Nouveau bloc **conversation** dans l'éditeur de note (icône 💬 dans la toolbar) : intègre un extrait de discussion (WhatsApp, Slack, Discord, SMS, iMessage, Messenger, Telegram, Signal, Instagram) directement dans une note — fini les captures d'écran.

- **Collage auto-converti** depuis WhatsApp, Slack (FR/EN), Discord, SMS (Messages.app) — les timestamps, auteurs et bursts sont reconnus
- **Couleurs par plateforme** : vert WhatsApp, bleu iMessage, violet Slack, etc. — adaptées aux deux thèmes
- **Images** : copie depuis le presse-papier, glisser-déposer ou bouton d'upload
- **Réactions** : `❤️ Moi · Bob` sous un message
- **Citations** : préfixe `> Auteur: texte cité` pour les réponses, rendu en italique
- **Renommer les participants** (`Alice Dupont → Alice`) et **désigner qui est "moi"** (bulles alignées à droite)
- **Plié au-delà de 5 messages**, avec lien "Voir les N autres →"
- **SMS** : alternance Moi/Toi auto + bouton **⇆** pour inverser d'un coup si tombé à l'envers
- Article complet dans le Centre d'aide → [Conversations](/help/conversations) 👑

## v0.7.0 — 13 mai 2026

### Cette page

- **Page Nouveautés** : tu y es. Un badge "Nouveau" apparaît dans Réglages quand une version inédite est dispo.

### Musique

- **Auto-fill du lien YouTube** : quand tu choisis un titre dans la recherche iTunes, le lien YouTube correspondant se remplit tout seul en arrière-plan.
- **Fix preview** : cliquer sur ▶ dans une carte de note musicale n'ouvre plus la note en lecture en même temps que la vidéo démarre.

### Correcteur d'orthographe

- **Dispo dans les commentaires** : le bouton "Corriger" apparaît à côté des outils gras/italique dans la zone de rédaction de commentaire, côté owner et confident.
- **Plus robuste** sur les textes très courts ou 100 % balisés (pas d'erreur intempestive).

## v0.6.0 — 13 mai 2026

### Confort de lecture

- **Pull-to-refresh** sur mobile : tire l'écran vers le bas pour rafraîchir.
- **Bouton "Remonter en haut"** flottant sur la Timeline, Home et la vue confident.
- **Réglage** : vue par défaut sur la page Fil (Tous / À répondre / Répondu / Fermé) configurable séparément pour owner et confident.

### Musique

- **Embeds YouTube** débloqués en production (problème de `Referrer-Policy` corrigé).
- **Champ Série** : plus de perte de lettres pendant la frappe.

### Recherche ISBN

- **Catalogue BNF** ajouté comme fallback : trouve enfin les éditions FR absentes de Google Books / Open Library (mangas notamment).

### Stabilité

- **Notifications** : on peut enfin archiver une notif non-lue et le clic marque comme lue correctement.
- **Auto-refresh** : le confident voit maintenant les nouvelles notes, commentaires et réactions sans relancer l'app.
- **Réactions** : polling 30s pour voir les emojis ajoutés par les autres en quasi-temps réel.
- Diverses corrections de stabilité et performance.

## v0.5.0 — 12 mai 2026

### Nouvelles fonctionnalités

- **Réactions emoji** sur les notes et commentaires.
- **Demandes de sujets** : le confident peut suggérer des sujets à écrire.
- **Tracker journalier** : humeur, sommeil, météo, énergie, anxiété — recap visible dans la timeline.
- **Calendrier enrichi** : bandeau d'intelligence avec stats clés + bottom sheet par jour.
- **Filtre par humeur** dans la timeline et la home confident.
- **Stat "Morceaux écoutés"** dans les statistiques.

### Notes musique

- **Playlists multi-pistes** : une note peut contenir plusieurs morceaux.
- **Paroles + traduction** automatiques.
- **Collection** : regroupement par chanson puis par artiste (à partir de 2 morceaux du même artiste).

### Notifications

- Nouveaux types : `REACTION_NEW`, `ENTRY_NEW`, `ENTRY_EDIT`, `REQUEST_TREATED`.
- Préférences confident : choisir quels types d'événements déclenchent une notif.
- Pills de filtre dans la cloche : Tout / Commentaires / Réactions / Notes / Tâches / Demandes.

### Tâches (confident)

- **Filtres** Statut, Priorité, Type, Terminées masquées.
- **Tris rapides** : Priorité, Échéance, Récent, Statut.
- Bouton "Plus d'options" sur la barre d'ajout (catégorie + type).

### Interface

- **PageHeader** unifié sur toutes les pages.
- **GuestTopBar** intégrée dans le header des pages confident.
- Réglages : tous les blocs uniformisés.
- **Correcteur d'orthographe** : popover lisible avec liste détaillée des corrections et possibilité d'ignorer individuellement.

### Centre d'aide

- Articles à jour, téléchargeables individuellement ou en bloc.
