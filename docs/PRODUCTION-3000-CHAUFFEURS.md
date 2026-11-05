# Mes Courses Téo — cahier de production pour 3 000 chauffeurs

**Statut : en préparation — ne pas annoncer « prêt pour 3 000 chauffeurs ».**
Cette branche est isolée de `main` pour ne pas perturber l'application existante.
Aucun changement ne doit être déployé en production sans tests, migration réversible
et validation d'un pilote.

## 1. Résultat attendu côté chauffeur

- Télécharger **Mes Courses Téo** sur l'App Store / Google Play ; pas besoin de Bluefy,
  de nRF Connect, de GitHub Pages, d'un Mac ni d'une installation manuelle.
- Créer un compte sécurisé ou se connecter ; retrouver uniquement ses données.
- Ajouter une course taxi (aéroport ou centre-ville) ou une tournée adaptée ;
  importer les captures Téo ; rapprocher les fiches de paie ; gérer SEV et dépenses.
- Remplir la vérification sommaire puis toucher **Imprimer**.
- Première impression : rechercher / associer l'imprimante dans les paramètres
  internes de Mes Courses Téo ; sélectionner la largeur de papier et imprimer un test.
- Impressions suivantes : même bouton, connexion automatique, état visible,
  possibilité de réimprimer volontairement en cas d'échec.
- Utilisation possible sans réseau ; synchronisation explicite au retour d'Internet.
- Pas de suppression silencieuse ni de doublons lors de la synchronisation.

## 2. Architecture cible (décisions de conception)

- **Clients mobiles :** application iOS et Android réellement native, interface
  intégrée, stockage local et permissions Bluetooth propres à chaque système.
  Une migration progressive vers React Native/Expo (development builds + module BLE)
  est une piste retenue ; valider la bibliothèque et l'effort de portage avant de
  basculer. L'actuelle WKWebView Swift reste un prototype de connexion, **pas un
  binaire approuvé pour un déploiement massif**.
- **Domaine partagé :** types métier et fonctions pures (taxi, pourboire,
  redevances, SEV, calculs, dédoublonnage, vérification sommaire) extraits de
  `app/page.tsx` ; tests automatisés, arrondis décimaux sûrs, horodatages UTC
  et présentation en heure de Montréal.
- **Données :** Firebase Auth + Firestore avec documents séparés et indexés :
  `/drivers/{uid}/courses/{id}`, `inspections/{id}`, `expenses/{id}`,
  `payStatements/{id}`, `settings/profile`. Contrôle d'accès : chaque UID
  ne lit/écrit que ses objets ; les accès d'administration passent par une
  politique d'autorisation explicite.
- **Migration :** conserver l'ancien document
  `/drivers/{uid}/data/app` pour lecture/migration contrôlée ; copier,
  comparer les compteurs et montants, puis activer la nouvelle lecture derrière
  un drapeau. Ne jamais supprimer l'ancien contenu avant validation et sauvegarde.
- **Hors ligne :** base locale persistante, file d'opérations idempotentes
  avec identifiants stables, horodatage de mise à jour et résolution explicite
  des conflits. Aucun écrasement silencieux.
- **Stockage justificatifs :** fichiers dans un stockage d'objets lié à
  l'identité du chauffeur ; métadonnées/empreintes dans Firestore, pas dans
  de gros documents JSON.
- **Observabilité :** erreurs applicatives sans PII, métriques de synchronisation
  et d'impression, suivi des versions, alertes, sauvegardes et restauration testée.

### Risque existant confirmé dans le dépôt

La version Web actuelle enregistre toutes les courses, les dépenses, les fiches
de paie et les vérifications d'un chauffeur dans un document Firestore unique
`drivers/{uid}/data/app`. Firestore impose une **limite de 1 Mio par document**.
C'est un risque à corriger avant une utilisation intensive et longue :
https://firebase.google.com/docs/firestore/quotas

Le fichier `firestore.rules` protège déjà l'accès par `request.auth.uid`
pour `/drivers/{uid}/...`, mais la présence de règles dans GitHub **ne garantit
pas leur déploiement**. Tester les accès entre deux chauffeurs dans l'émulateur
Firebase ; vérifier les règles actuellement publiées et ajouter App Check,
validation des schémas, quotas et opérations privilégiées si nécessaire.

## 3. Impression professionnelle (pilote matériel)

Architecture : `PrinterManager` → `PrinterDriver` (BLE ESC/POS, Bluetooth
Classique Android, AirPrint si compatible, autres modèles certifiés).

- Garder un profil par **modèle matériel testé** (UUID de service/écriture,
  débit, MTU, encodage, largeur 58/80 mm, caractéristiques réelles).
- MPT-II : l'iPhone a **confirmé une connexion BLE et une écriture qui a imprimé
  des caractères UTF-8** depuis nRF Connect. Cela ne valide **pas encore**
  l'interprétation des octets binaires ESC/POS, la mise en page complète
  ni le contrôle de fin de travail.
- Tester au minimum : ESC @, texte ASCII, accents français, retour à la ligne,
  gras, tickets longs, reprise après perte radio, batterie faible, rouleau vide,
  imprimante utilisée par une autre application, plusieurs imprimantes proches.
- Confirmation de l'application : « données envoyées » ne signifie pas
  « impression papier confirmée ». Afficher ce niveau d'incertitude,
  éviter les tentatives automatiques qui impriment des doublons.
- Associer l'imprimante une fois puis enregistrer son identifiant local ;
  permettre « Changer d'imprimante », « Test » et « Oublier ».
- Android 12+ : gérer les permissions `BLUETOOTH_SCAN` et
  `BLUETOOTH_CONNECT` à l'exécution.
- Aucun navigateur tiers ou utilitaire BLE ne doit être requis pour les chauffeurs.

## 4. Qualité, protection et exploitation

Avant publication :
- Tests unitaires des calculs et de la détection des doublons.
- Tests de règles Firebase : non connecté → refus ; chauffeur A → accès A ;
  chauffeur B → aucun accès aux données A ; uploads et pièces jointes séparés.
- Tests de synchronisation : deux téléphones sur le même compte, hors ligne,
  conflits, migration, restauration, vérifications répétées.
- Tests d'impression sur **de vrais appareils** iOS et Android, MPT-II et
  chaque modèle officiellement annoncé compatible.
- Test de charge backend avec jeux de données synthétiques (pas de vraies
  données de chauffeurs) ; surveiller latence, erreurs, coûts Firebase,
  limites de quotas et index.
- Journal des versions, rollback, environnement staging distinct de production.
- Protection des renseignements personnels et politique de conservation
  à valider pour le Québec ; journal d'accès admin, suppression/export des données.

### Paliers de lancement

1. **Équipe** : tests techniques et comptes fictifs, 2–5 imprimantes.
2. **Pilote 10 chauffeurs** : fonctionnement quotidien complet, suivi des incidents.
3. **Pilote 50** : plusieurs versions iOS/Android et matériels hétérogènes.
4. **Déploiement 300** : charge, support, sauvegarde/restauration et monitoring.
5. **Déploiement 3 000** : seulement si les indicateurs des étapes précédentes
   sont validés ; procédure de retour arrière disponible.

### Critères de passage (à mesurer, pas présumer)

- 0 perte / mélange de données dans les scénarios de migration, sync et conflits.
- 0 accès transversal entre comptes dans les tests d'autorisation.
- Taux et causes d'échec d'impression instrumentés et revue réelle des tickets.
- Aucune publication si l'installation, la connexion ou l'impression casse
  sur les appareils pilotes.
- Support, documentation de dépannage et canal de retour intégrés à l'application.

## 5. Distribution sans Mac personnel

Les builds iOS peuvent être produits sur une infrastructure macOS hébergée.
L'installation et la distribution iOS à un grand public nécessitent la signature
et un compte **Apple Developer** (99 USD/an selon Apple), plus validation App Store.
Apple exige une expérience qui se distingue d'un simple site reconditionné :
https://developer.apple.com/app-store/review/guidelines/

Prévoir une fiche Play Console Android, des certificats signés conservés en
coffre sécurisé, des comptes d'organisation et une politique de confidentialité.
L'Apple Developer Enterprise Program n'est **pas** un raccourci destiné à
distribuer une app à 3 000 chauffeurs indépendants.

## 6. Ce qui est prêt / ce qui manque

**Existant et récupérable :** règles de base Firebase, logique métier,
formulaires, vérification sommaire, brouillon de pilote Swift/CoreBluetooth,
test BLE manuel MPT-II. **Non validé :** impression complète, build natif
installable, tests physiques, support Android natif, migration Firestore,
bascule hors ligne, comptes administrateurs, QA et exploitation à grande échelle.

**Règle de travail :** pas de déclaration « fonctionnel à 100 % » sans preuve
de tests d'acceptation ; pas de déploiement immédiat sur `main` pour une
fonction non vérifiée.
