# Prix du fioul

Le prix moyen national hebdomadaire du **fioul domestique en France** dans
Gladys, publié par le ministère de la Transition écologique (DGEC, Direction
générale de l'énergie et du climat), pour savoir quand remplir votre cuve.

Ce sont des moyennes nationales, en euros par litre, toutes taxes comprises,
pour des livraisons de 2 000 à 4 999 litres. Ce n'est **pas le prix de votre
fournisseur** : elles montrent la tendance et le niveau à attendre.

Sans lien avec le ministère. Développée sans cuve ni compte fournisseur, à
partir des données publiques : vos retours sont les bienvenus.

## Ce que vous obtenez

- Un appareil **Prix du fioul domestique** : le prix en €/l, sa variation sur
  une semaine en %, la moyenne du mois précédent, le coût estimé du plein
  (avec le volume que vous commandez d'habitude) et la semaine du relevé.
- En option, un second appareil avec les **carburants routiers** du même
  fichier (gazole, SP95-E10, SP95-E5, SP98, E85, GPLc, gazole non routier) :
  prix et variation sur une semaine de chacun.
- Un déclencheur de scène **Nouveau prix du fioul**, une fois par semaine,
  filtrable par tendance (en baisse, stable, en hausse), avec un résumé prêt
  pour un message.
- Un widget de tableau de bord : le prix, sa tendance, le coût du plein, la
  courbe des six derniers mois et la moyenne du mois précédent.

## Prérequis

- Gladys 5.3.0 ou plus récent.
- Un accès à Internet depuis Gladys (`www.ecologie.gouv.fr`).
- Aucun compte ni clé.

## Installation

Dans Gladys, ouvrez **Intégrations → Installer depuis GitHub** et saisissez
l'adresse du dépôt : `https://github.com/guim31/gladys-fioul`.

## Configuration

| Champ                                  | Rôle                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Litres d'un plein (facultatif)         | Le volume que vous commandez d'habitude, pour le coût estimé du plein (prix × litres, en euros entiers). 0 : pas de fonctionnalité de coût.                   |
| Carburants routiers aussi (facultatif) | Les moyennes nationales des carburants routiers du même fichier, sur un second appareil. Aucun par défaut.                                                    |
| Langue des noms                        | Langue des noms d'appareils et de fonctionnalités (figés à l'ajout d'un appareil), de la date de la semaine et du résumé du déclencheur. Français par défaut. |

Ouvrez ensuite l'onglet **Découverte** de l'intégration et ajoutez les
appareils. Changer les litres ou les carburants change les appareils : Gladys
propose alors de les **Mettre à jour** dans l'onglet Découverte.

## Appareils

### Prix du fioul domestique

| Fonctionnalité                  | Type                 | Exemple (semaine du 13/11/2026) |
| ------------------------------- | -------------------- | ------------------------------- |
| Prix TTC (€/l)                  | Monnaie, euros       | 1,703                           |
| Variation sur 1 semaine (%)     | Monnaie, pourcentage | −1,7                            |
| Moyenne du mois précédent (€/l) | Monnaie, euros       | 1,9253 (octobre)                |
| Coût estimé du plein (€)        | Monnaie, euros       | 2555 (1 500 litres)             |
| Semaine du relevé               | Texte                | Semaine du 13 nov. 2026         |

Gladys n'a pas d'unité €/l : les fonctionnalités de prix affichent le symbole
euro, et leur nom précise « par litre ».

### Prix des carburants – moyenne France

Pour chaque carburant routier choisi : son prix en €/l et sa variation sur
une semaine en %, puis la semaine du relevé.

## Scènes

### Prix sous un seuil

Aucun déclencheur particulier : dans une scène, choisissez **Valeur d'un
appareil** sur la fonctionnalité de prix, par exemple « Prix TTC (€/l)
inférieur à 1,20 ».

### Une baisse de N %

Même chose sur la variation : « Variation sur 1 semaine (%) inférieure à −3 »
lance la scène quand le prix a baissé de plus de 3 % sur la semaine.

### Nouveau prix du fioul

Se déclenche une fois par semaine, quand le ministère publie une nouvelle
semaine (jamais pour la semaine déjà connue au démarrage de l'intégration).
Filtre : la tendance sur la semaine (en baisse, stable, en hausse ; vide pour
toutes). Variables : `price` (€/l), `change` (%), `trend` (`down`, `stable`
ou `up`), `fill_cost` (€, 0 sans litres), `week_date` (`AAAA-MM-JJ`, le
vendredi de la semaine) et `summary`, par exemple « Fioul domestique
1,6519 €/l (−3,0 %), Plein de 1 500 l : 2 478 €, Semaine du 20 nov. 2026 »,
prêt pour un message.

## Tableau de bord

### Widget Prix du fioul

Le prix moyen national, en vert quand il a baissé sur la semaine, en orange
quand il a monté ; la variation sur une semaine ; le coût du plein (avec des
litres réglés dans la configuration) ; la courbe des 26 dernières semaines ;
la moyenne du mois précédent ; la semaine du relevé. Un réglage masque chaque
bloc sauf le prix. Le widget n'a besoin d'aucun appareil.

## Actions

**Tester le téléchargement** (onglet Configuration) télécharge tout de suite
le fichier du ministère et répond avec le dernier prix du fioul.

## Données et limites

- La source est la page
  https://www.ecologie.gouv.fr/politiques-publiques/prix-produits-petroliers
  et son classeur « Prix HTT et TTC depuis janvier 2020 » (DGEC). Les
  semaines sont datées de leur vendredi ; le ministère publie en général le
  lundi suivant.
- L'intégration lit la page et le classeur une fois par jour, et toutes les
  2 heures à partir du lundi 10 h UTC jusqu'à la sortie de la nouvelle
  semaine. Un fichier inchangé n'est pas retéléchargé (ETag). Cela fait
  quelques petites requêtes par jour.
- Le nom du fichier change de temps en temps : l'intégration retrouve le lien
  dans la page à chaque relève, et se rabat sur le dernier lien qui a marché.
- Une semaine de plus de 35 jours n'est pas affichée : mieux vaut pas de
  valeur qu'une valeur ancienne.
- La moyenne du mois précédent est la moyenne des semaines de ce mois, comme
  dans le tableau mensuel du ministère.
- Prix des carburants en station : les intégrations « prix des carburants »
  du store les lisent station par station, mais sans le fioul. Un capteur de
  niveau de cuve (OilFox…) dit quand commander ; cette intégration dit à quel
  prix.

## Dépannage

- **« Les prix du ministère ne peuvent pas être téléchargés »** : Gladys n'a
  pas accès à Internet, ou le site du ministère est indisponible ;
  l'intégration réessaie toutes les heures.
- **« Le fichier de prix du ministère est illisible »** : le ministère a
  changé la présentation de son classeur ; ouvrez un ticket sur le dépôt.
- **« Aucun prix depuis plus d'un mois »** : le ministère ne publie plus.
- **Aucune valeur** : ajoutez d'abord les appareils dans l'onglet Découverte ;
  les valeurs arrivent dans la minute.
- Plus de détails dans les journaux de l'intégration (`LOG_LEVEL=debug`).

## Crédits

Données : ministère de la Transition écologique, DGEC, prix hebdomadaires des
produits pétroliers, données publiques. Intégration de guim31 sous licence
Apache 2.0.
