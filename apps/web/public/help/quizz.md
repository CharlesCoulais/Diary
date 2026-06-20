# Quizz 🎯

Le type de note **Quizz** te permet de créer un petit questionnaire que toi et tes confidents pouvez faire. Chacun répond de son côté, voit son score et ses corrections — et toi, tu peux consulter les réponses de tout le monde.

## Créer un quizz (côté toi)

1. Crée une note et choisis le type **Quizz** (menu des types, bouton ···).
2. Donne-lui un **titre** si tu veux, et écris une intro dans le corps de la note (optionnel).
3. Dans le panneau **« Questions du quizz »**, ajoute tes questions.

Pour chaque question, choisis le mode :

- **QCM** : saisis les options, puis **coche la ou les bonnes réponses**. Active *« Plusieurs bonnes réponses possibles »* si la question en attend plusieurs (cases à cocher) — sinon c'est une réponse unique (boutons radio).
- **Réponse libre** : liste une ou plusieurs **réponses acceptées**. La comparaison ignore la **casse**, les **accents** et les **espaces** (« État » = « etat »).

Tu peux **réordonner** les questions (flèches), en **supprimer**, et ajouter une **explication** facultative qui s'affichera après correction.

### Code et mise en forme

Les énoncés acceptent un **bloc de code** : entoure ton code de trois backticks ```` ``` ```` (avec un nom de langage optionnel sur la première ligne). Un aperçu s'affiche dans l'éditeur. Le **code inline** (entre `` ` ``), le **gras**, l'*italique* et les liens fonctionnent dans les énoncés comme dans les options.

### Images

Tu peux ajouter une **image** à l'énoncé d'une question (icône image sous l'énoncé) et une image à **chaque option** de QCM. Une option peut même être uniquement visuelle (image sans texte). Les images sont importées et compressées automatiquement, comme dans les notes.

### Mélanger les questions / options

Deux cases en haut de l'éditeur permettent de **mélanger l'ordre des questions** et/ou **l'ordre des options** : l'ordre est tiré au sort **à chaque tentative** (et re-mélangé quand on clique « Recommencer »). Chaque personne a donc un parcours différent. Le mélange est purement visuel — la correction reste exacte.

### Regrouper les quizz en thème

Comme les notes Dev, plusieurs quizz peuvent former une **série**. Dans le panneau d'un quizz :

- **Thème** : le sujet commun (ex. « JavaScript »). Tous les quizz ayant le même thème sont regroupés sur une seule carte dans la Collection. Renommer le thème renomme tous les quizz du thème ; l'autocomplétion propose les thèmes existants.
- **N°** : l'ordre du quizz dans le thème (1, 2, 3…). Les quizz s'affichent dans cet ordre.
- **Total** : le nombre de quizz prévus pour le thème. Il se propage à tous les quizz du thème et alimente la progression « X / total » affichée dans la Collection.

Dans la Collection, la carte d'un thème montre alors sa **progression** (ex. « 3 / 10 quizz ») avec une barre, comme les chapitres d'une série Dev. En l'ouvrant, chaque quizz est **replié** : un clic sur son titre le déroule.

## Faire le quizz

En lecture, réponds à chaque question puis clique sur **Valider**. Tu vois alors :

- ton **score** (ex. `3 / 5`) en haut ;
- pour chaque question, si tu as eu **juste** (✓) ou **faux** (✗), avec la **bonne réponse** mise en évidence ;
- l'**explication** si l'auteur en a mis une.

Pour une **réponse libre** ratée de peu, la réponse attendue s'affiche avec un bouton **« J'avais juste »** : clique dessus si tu estimes avoir donné la bonne réponse (faute de frappe, formulation différente…) — ton score s'ajuste.

Le bouton **Recommencer** efface tes réponses et te permet de refaire le quiz à zéro.

## Chacun sa sauvegarde

L'état du quiz est **propre à chaque personne** : ta progression n'écrase pas celle des autres. En rouvrant la note, tu retrouves tes réponses et ton score.

Côté **toi** (auteur), sous le quiz, un encart **« Réponses »** liste chaque participant avec son score ; déplie une ligne pour voir le détail de ses réponses. Tu y figures aussi (« Toi ») si tu as fait le quiz. En dépliant l'en-tête, un **bilan par question** affiche le taux de réussite de chacune — pour repérer les questions qui piègent.

## Bon à savoir

- Les **bonnes réponses ne sont jamais envoyées** à l'appareil d'un confident avant qu'il ait validé : impossible de tricher en inspectant la page. La correction est faite côté serveur.
- Un confident ne voit **que ses propres réponses** ; seul toi vois celles de tout le monde.
- Modifier les questions d'un quiz déjà commencé peut décaler les anciennes réponses — préviens tes confidents ou demande-leur de **recommencer** si tu changes beaucoup le quiz.
