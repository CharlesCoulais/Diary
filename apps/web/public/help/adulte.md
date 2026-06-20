# Contenu 18+

> 🔞 **Toi seul·e (Owner)** peux marquer une note 18+. Les guests qui y ont accès doivent répondre à une question de ton choix pour la lire.

Le mode 18+ permet de marquer une note comme **contenu sensible** (réflexions intimes, scènes explicites, sujets délicats…) tout en la **partageant** avec ton confidant ou un guest spécifique. La preview est floutée, et la lecture est conditionnée à la **bonne réponse à une question** que toi seul·e définis.

C'est complémentaire du mode **🔐 Secret** :
- **Secret** = personne d'autre ne peut lire la note, jamais.
- **18+** = la note est partagée, mais l'accès est protégé par une question/réponse.

<!-- role:owner -->
## 👑 Marquer une note comme 18+

1. Ouvre une note → bouton **🔞** dans la barre d'actions (à côté du bouton secret).
2. Une fenêtre s'ouvre pour configurer :
   - **Question** — quelque chose que toi et la personne destinataire connaissez (ex. « notre ville de rencontre »)
   - **Réponse** — la réponse exacte attendue
   - **Indices** *(optionnels)* — jusqu'à 3 phrases d'aide, révélées automatiquement après 10, 20 puis 30 mauvaises réponses
3. Confirme. La note est désormais marquée 18+.

La réponse est **hashée localement (SHA-256)** avant d'être envoyée au serveur. La réponse en clair n'existe **nulle part** : ni dans la base, ni dans les logs, ni dans une sauvegarde. Tu ne pourras pas la « retrouver » plus tard — si tu l'oublies, il faudra reconfigurer la note.

### Désactiver le mode 18+

Re-clique sur le bouton **🔞** pour repasser la note en mode normal. La question et le hash sont alors supprimés.

### Côté toi

- La preview de la note dans la timeline apparaît **floutée** avec le badge « 🔞 Contenu sensible ».
- En lecture, la note s'ouvre avec la question : tu dois répondre comme un guest. Une fois passée, la session reste déverrouillée jusqu'au prochain rechargement.
<!-- /role -->

## 👁️ Côté lecteur (Guest / Confidant)

Si une personne avec qui la note est partagée tombe dessus :

- **Sur la timeline** — un placeholder flou s'affiche avec le badge « 🔞 Contenu sensible ». Aucune information sur le contenu n'est exposée (pas de cover, pas de titre, pas de texte). Le placeholder donne une vague idée de la *forme* (texte seul ou texte + image) mais rien de plus.
- **À l'ouverture de la note** — un formulaire demande la réponse à la question. Aucun contenu n'est envoyé tant que la réponse n'est pas validée.
- **Après bonne réponse** — la note se déverrouille pour la session courante. Au prochain rechargement de la page, il faudra répondre à nouveau.

### Sécurité

Le contenu, le titre, la cover et les liens d'une note 18+ ne sont **jamais envoyés** au navigateur d'un guest tant que la réponse n'a pas été validée côté serveur. Pas de bypass possible en désactivant le flou via les outils du navigateur — il n'y a tout simplement rien à révéler dans le DOM.

## Filtrer le contenu 18+

Un bouton **🔞 18+ (N)** apparaît dans la barre de filtres dès qu'au moins une note 18+ est visible :

- **Sur le journal du jour (Owner)** — uniquement pour le jour courant.
- **Sur la Timeline (Owner)** — sur toute la base.
- **Sur la timeline Guest** — sur les notes partagées avec toi.

Cliquer dessus active le mode « **uniquement 18+** ».

### Masquer par défaut

Dans les **Réglages → Affichage**, un toggle **« Masquer le contenu 18+ »** retire ces notes de la timeline par défaut. Tu peux toujours les ré-afficher temporairement avec le filtre.

## 🔑 Indices progressifs

Quand tu configures une note 18+, tu peux définir jusqu'à **3 indices** optionnels. Ils apparaissent **automatiquement** dans la porte de vérification après un certain nombre de mauvaises réponses :

| Échecs | Indice révélé |
|--------|--------------|
| 10     | Indice 1 |
| 20     | Indice 2 |
| 30     | Indice 3 |

Les indices te permettent de donner des pistes sans trop faciliter l'accès dès le premier essai — le lecteur doit vraiment réfléchir avant de les voir apparaître.

## 💡 Astuces

- Choisis une **question dont la réponse est unique et stable** : un prénom, un lieu, une date — pas une question dont la réponse pourrait changer.
- La réponse est **insensible à la casse et aux espaces** en début/fin (mais pas au milieu) — « Paris » et « paris » fonctionnent, « Pa ris » non.
- Si tu veux protéger une note **vraiment** privée (que personne ne devrait jamais lire), utilise le mode **🔐 Secret** plutôt que 18+.
- Le badge orange sur les filtres et les pills permet de **repérer rapidement** les éléments liés au 18+ dans l'interface.
