# Comment sauver le monde ?

Un simulateur climatique en une page web. On part de l'état réel de la Terre en 2025, on change des leviers écologiques (énergie, alimentation, forêts, captage du CO₂, et même géo-ingénierie extravagante) et on regarde comment le monde évolue jusqu'en 2100.

Toutes les données et formules viennent de sources scientifiques vérifiées (GIEC, Global Carbon Project, NOAA, NASA, PNUE, AIE, études publiées dans *Science*, *Nature*, *PNAS*…). La liste complète est affichée en bas de la page et dans `js/sources.js`.

## Les leviers

Les leviers sont rangés en catégories, chacune avec sa couleur et son icône : Énergie et Terres et alimentation (**réduire** les émissions), Retirer le CO₂ de l'air (**retirer**), Géo-ingénierie solaire (**masquer** le réchauffement sans enlever le CO₂). L'en-tête de chaque catégorie résume en direct les leviers activés et leur coût, et chaque catégorie peut se replier.

## Les trois modes

- **Bac à sable** : tous les leviers sont libres, avec des scénarios prêts à l'emploi.
- **Découverte pas à pas** : pour les débutants, une visite guidée explique la page puis chaque levier un par un, avec son effet calculé (seul et à fond) et un bouton pour l'essayer.
- **Défis chronométrés** : 6 défis (de facile à difficile) à réussir avant la fin du chrono, avec des contraintes (géo-ingénierie interdite, transition lente, climat plus sensible…). Chaque défi a aussi un budget (coût en 2050) : tout pousser au maximum coûte trop cher, il faut choisir les mesures les plus efficaces pour leur prix. On gagne jusqu'à 3 étoiles : objectif atteint, plus de la moitié du temps restant, et plan très économe. Les défis sont décrits dans `js/challenges.js`, et les tests vérifient que chacun a une solution.

## La carte des impacts

Une carte du monde en 14 grandes régions montre le niveau de risque de chacune selon le réchauffement de l'année choisie (de 2030 à 2100). Chaque région liste ses risques principaux, avec le seuil de réchauffement à partir duquel ils deviennent élevés selon le GIEC (2022) et les études citées (`js/impacts.js`). Le fond de carte vient de Natural Earth (domaine public) ; il est fabriqué par `tools/build-map.mjs`.

## Le coût des mesures

Chaque mesure affiche son coût en 2050, et un encart « Combien ça coûte ? » donne le total, sa fourchette et sa part du PIB mondial. Le calcul (`js/costs.js`) reprend la méthode du GIEC : tonnes de CO₂ évitées × coût par tonne (fourchettes du GIEC 2022, de Beerling et al. 2020, de Smith et Wagner 2018, d'Angel 2006). Ce sont des ordres de grandeur, sans les dégâts évités. Vérification : le scénario « Accord de Paris » coûte environ 1,4 % du PIB mondial en 2050, dans la fourchette du GIEC (1,3 à 2,7 %).

## Ouvrir la page

- **Sur ton ordinateur** : double-clique sur `index.html`. Aucune installation n'est nécessaire.
- **En ligne (gratuit)** : sur GitHub, va dans *Settings → Pages*. Sous *Build and deployment*, choisis *Deploy from a branch*, la branche `main` et le dossier `/ (root)`, puis *Save*. Au bout d'une à deux minutes, la page est en ligne à l'adresse `https://porchiaenzo-wq.github.io/sauver-le-monde/`.

## Comment fonctionne le modèle

Le moteur (`js/model.js`) calcule le climat année par année, de 1850 à 2100 :

1. **Émissions** : les leviers fixent les émissions de chaque secteur (électricité, transports, bâtiments, industrie, déforestation), le méthane et la pollution aux particules.
2. **Cycle du carbone** : 4 réservoirs aux durées différentes (Joos et al. 2013), avec des puits qui se saturent quand ils ont beaucoup absorbé et quand il fait chaud (modèle FaIR, Millar et al. 2017).
3. **Forçage radiatif** : F = 5,35 × ln(C/C₀) pour le CO₂ (Myhre et al. 1998), plus le méthane, les autres gaz, les aérosols et la géo-ingénierie.
4. **Température** : modèle à deux couches, surface et océan profond (Geoffroy et al. 2013).
5. **Conséquences** : montée des mers (Rahmstorf 2007), banquise arctique (Notz et Stroeve 2016), acidité des océans, points de bascule (Armstrong McKay et al. 2022).

**Vérification sur le passé** : le modèle retrouve le CO₂ mesuré (425,6 ppm en 2025 pour 425,7 mesurés) et le réchauffement dû à l'homme (1,36 °C, comme Forster et al. 2025). Sans rien changer, il prévoit environ 2,7 °C en 2100 ; le PNUE annonce 2,8 °C avec les politiques actuelles.

C'est un modèle simplifié : il montre les grandes tendances, pas des prévisions précises. Ses limites sont expliquées sur la page.

## Tests

Avec [Node.js](https://nodejs.org/) installé :

```
node --test
```

Les tests vérifient que le modèle retrouve les observations et que chaque levier agit dans le bon sens.

## Organisation des fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page |
| `css/style.css` | L'apparence (thème clair et sombre) |
| `js/model.js` | Le moteur de simulation |
| `js/levers.js` | Les leviers, leurs explications et les scénarios prêts à l'emploi |
| `js/costs.js` | Le coût de chaque mesure |
| `js/sources.js` | La bibliographie |
| `js/charts.js` | Les graphiques |
| `js/world-map.js` | Le fond de carte (fichier généré) |
| `js/impacts.js` | Les impacts par région et leurs seuils |
| `js/map.js` | La carte des impacts |
| `js/tour.js` | Le mode découverte pas à pas |
| `js/app.js` | L'interface (curseurs, résultats) |
| `js/challenges.js` | Les défis : objectifs, contraintes, chrono, solution |
| `js/challenge-ui.js` | Le déroulement d'un défi (chrono, validation, étoiles) |
| `tests/model.test.js` | Les tests du modèle |
| `tests/challenges.test.js` | Les tests des défis |
| `tests/costs.test.js` | Les tests des coûts |
| `tests/impacts.test.js` | Les tests de la carte des impacts |
| `tools/build-map.mjs` | Fabrique le fond de carte |
