# Tester Mes Courses Téo sur son iPhone avant de payer Apple Developer

**Objectif :** tester sur un iPhone personnel la version native et la sortie
Bluetooth sur Bisofice MPT-II, sans Mac personnel ni abonnement Apple Developer.
Ces étapes sont destinées à un **test individuel**, pas à la distribution à
3 000 chauffeurs.

## Ce qui est et n'est pas prêt

- Projet Swift iOS existant, avec bouton de test MPT-II accessible
  dans **Paramètres (⚙) → Bisofice MPT-II → Tester mon imprimante**.
- Workflow GitHub Actions sur Mac distant :
  `.github/workflows/ios-iphone-trial.yml`.
- Ce workflow doit **réussir réellement** pour produire
  `MesCoursesTeo-iPhone-unsigned.ipa`. Ce n'est pas encore validé.
- Ce fichier est **non signé** ; ne peut pas être installé simplement depuis
  Safari ou l'app Fichiers.
- Test papier réel non validé : la présence d'un canal BLE d'écriture prouve
  la communication mais pas encore la sortie de l'ensemble d'un ticket ESC/POS.

## Méthode gratuite avec PC Windows + iPhone + compte Apple standard

1. Dans GitHub, sélectionner la branche
   `production/3000-chauffeurs` et ouvrir
   **Actions → iPhone — application d'essai IPA non signée**.
2. Déclencher `Run workflow` ou consulter l'exécution issue du dernier push.
3. Si elle finit **verte**, ouvrir les **Artifacts** de l'exécution et
   télécharger `MesCoursesTeo-iPhone-unsigned-IPA`. Extraire le ZIP pour
   obtenir le fichier `.ipa`.
4. Sur un **PC Windows** connecté à l'iPhone par câble USB, installer
   **Sideloadly** depuis https://sideloadly.io/ et les composants Apple
   demandés par l'outil. Il existe aussi d'autres outils, mais utiliser
   uniquement des sources de confiance.
5. Faire signer l'IPA **localement** avec son propre compte Apple gratuit
   et l'installer avec l'outil. **Ne jamais communiquer son mot de passe
   Apple dans ChatGPT ou GitHub**, ni publier un certificat.
6. Si iOS le demande, activer le **Mode développeur** dans
   Réglages → Confidentialité et sécurité → Mode développeur et valider
   le développeur sous Réglages → Général → VPN et gestion de l'appareil.
7. Sur l'iPhone, ouvrir l'application native **Mes Courses Téo**.
   Ouvrir ⚙ puis cliquer sur **Tester mon imprimante** avec MPT-II
   allumée et nRF Connect fermé. Vérifier si un ticket sort et conserver
   le message d'erreur exact en cas d'échec.
8. Dans ⚙ → Adresse du site, indiquer l'adresse HTTPS de la version
   publiée qui ouvre réellement Mes Courses Téo. L'adresse de test
   GitHub Pages préremplie dans le projet **n'a pas été validée**.
9. Pour essayer l'impression d'une vérification complète, se connecter,
   ouvrir **Plus → Vérification sommaire → Historique → Imprimer le ticket**.
   Un message « données envoyées » ne prouve pas à lui seul que le papier
   est sorti.

### Limites Apple du compte gratuit

- La signature/test reste valide seulement **7 jours** ;
  il faudra renouveler périodiquement.
- Nombre de dispositifs et d'applications de test limité
  (voir documentation Apple).
- Ce n'est pas une distribution App Store / TestFlight pour 3 000 utilisateurs.

Documentation Apple :
https://developer.apple.com/help/account/basics/about-your-developer-account

## Si vous n'avez que l'iPhone (sans ordinateur)

Cette méthode gratuite de signature et installation ne suffit pas :
un fichier `.ipa` non signé **ne peut pas être installé directement**
sur un iPhone non modifié depuis Safari.
Il faut ponctuellement accès à un PC Windows / Mac ou une autre solution
de signature conforme (qui peut avoir des frais). Éviter les sites
qui proposent des profils de confiance inconnus ou demandent
de déposer les identifiants Apple sur un serveur.

## Distribution future

L'essai individuel gratuit ne remplace pas Apple Developer, l'approbation
App Store, ni la compatibilité BLE testée avant de déployer pour les
chauffeurs. Le code reste sur la branche
`production/3000-chauffeurs` jusqu'à validation.
