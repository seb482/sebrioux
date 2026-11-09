# Passeport virtuel – MRC des Basques

Premier jet d'un passeport virtuel pour visiter les attraits de la MRC des Basques.

- Chaque attrait a un **code QR** installé sur place. Le scan ajoute l'**étampe** dans le passeport.
- Chaque étampe rapporte des **pistoles** (monnaie virtuelle, 10 par défaut).
- Les pistoles accumulées débloquent des **récompenses** à des seuils définis (10, 25, 50 par défaut).
- Le **mode administrateur** permet d'éditer les attraits, de générer les QR, d'étamper ou de corriger le passeport à la main, de gérer les récompenses et les paramètres.

Application statique (HTML, CSS, JavaScript natif) : aucun outil de build, aucune dépendance à installer.

## Lancer l'application

```bash
cd passeport-basques
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Sur GitHub Pages, le dossier se publie tel quel. La caméra exige HTTPS ou `localhost`.

## Fonctionnement

### Scanner un code QR

- Un code QR d'attrait contient une URL de la forme `https://…/passeport-basques/?e=CODE`.
- Un scan avec l'**appareil photo natif** (iPhone, Android) ouvre l'application et étampe l'attrait directement.
- L'onglet **Scanner** utilise la caméra avec l'API `BarcodeDetector` (Chrome et Edge sur Android ou ordinateur). Ailleurs, la saisie manuelle du code reste disponible.

Règles : un attrait ne s'étampe qu'une fois ; un attrait désactivé est refusé ; un code inconnu est refusé.

### Pistoles et récompenses

- Pistoles = `étampes × pistoles par étampe` + ajustements manuels (jamais négatif).
- Une récompense est **débloquée** quand le total atteint son seuil, puis **réclamée** une seule fois. L'administrateur peut annuler une réclamation.

### Mode administrateur

Onglet **Admin**, NIP par défaut `1234` (à changer dans **Paramètres**).

- **Attraits** : ajouter, modifier, activer/désactiver, supprimer. Afficher ou imprimer le QR (bouton *QR*). Un code est généré automatiquement si le champ est vide.
- **Passeport** : cocher les étampes à la main, ajouter ou retirer des ajustements de pistoles avec un motif, vider le passeport.
- **Récompenses** : ajouter, modifier, supprimer ; annuler une réclamation.
- **Paramètres** : titre, territoire, nom de la monnaie, pistoles par étampe, NIP. Export et import JSON, réinitialisation.

## Données et stockage

Les données sont dans le `localStorage` du navigateur (clé `passeport-basques:v1`), sur l'appareil. Elles ne sont **pas partagées** entre appareils et ne sont pas sauvegardées dans le nuage. Utilisez *Exporter (JSON)* pour une sauvegarde.

Le NIP administrateur est stocké en clair sur l'appareil. C'est une protection contre les manipulations accidentelles, pas une sécurité réelle.

## Contenu à valider avant publication

- Les trois attraits de départ (`js/core.js`, `defaultState`) ont des textes rédigés à partir de sources touristiques publiques. Vérifiez-les et complétez-les, notamment l'**église** (texte provisoire).
- Les **récompenses** sont des exemples : remplacez-les par de vraies offres de partenaires.
- Les horaires de la traverse varient selon la saison et les marées : vérifiez auprès de la Compagnie de navigation des Basques avant de publier les textes.

## Tests

```bash
npm test
```

Les tests couvrent la logique métier (`js/core.js`) : étampes, pistoles, seuils et réclamations, validation des attraits et des codes, extraction des codes depuis une URL.

## Prochaines étapes suggérées

- Un petit backend partagé (par exemple une base de données hébergée) pour que plusieurs visiteurs aient leur propre passeport et que l'administration soit protégée côté serveur.
- Un QR par attrait imprimé sur un support durable, avec un contrôle des codes reçus.
- Un service worker versionné : incrémenter `VERSION` dans `sw.js` à chaque mise à jour des fichiers.
