# Mes Courses Téo — impression directe Bisofice MPT-II sur iPhone

Cette version iOS native affiche le site Mes Courses Téo dans une WKWebView et ajoute
**CoreBluetooth** pour envoyer des tickets ESC/POS à la Bisofice MPT-II **sans application d'impression tierce**.

## État du projet

- Le site existant reste intact dans Safari et sur GitHub/Vercel.
- Dans la version iOS native, le bouton **Ticket 58 mm / Imprimer** de
  **Plus → Vérification sommaire → Historique** démarre l'impression automatiquement.
- Première impression : l'app recherche **MPT-II** et se connecte au Bluetooth.
- Impressions suivantes : elle réutilise l'identifiant BLE mémorisé.
- Services prioritaires : **18F0 / 2AF1** (observés dans nRF Connect) ; secours :
  ISSC **49535343-FE7D... / 49535343-8841...** et
  **E7810A71... / BEF8D6C9...**.
- Le ticket utilise l'émulation **ESC/POS ASCII (32 colonnes)** ; les accents sont
  convertis pour une meilleure compatibilité thermique.
- Un retour d'envoi réussi indique l'envoi des données BLE, pas la confirmation
  qu'une feuille de papier est sortie de l'imprimante.

## Préparer et installer sur l'iPhone

**Requis : Mac, Xcode récent, XcodeGen, identifiant Apple pour signer et iPhone physique.**

1. Sur un Mac, cloner ce dépôt :
   `git clone https://github.com/allaouaboucheneb04-lgtm/mes-courses-teo.git`
2. Installer Xcode depuis l'App Store, puis XcodeGen
   (par exemple `brew install xcodegen`).
3. Ouvrir un Terminal et exécuter :
   `cd mes-courses-teo/ios/MesCoursesTeo && xcodegen generate`
4. Ouvrir `MesCoursesTeo.xcodeproj` dans Xcode.
5. Dans **Signing & Capabilities**, choisir votre équipe Apple et remplacer
   `ca.mescoursteo.iphone` par un identifiant d'app unique si nécessaire.
6. Connecter l'iPhone au Mac, le choisir comme destination et appuyer sur **Run**.
7. Accepter la permission Bluetooth au premier accès. Si le site préconfiguré
   n'est pas la bonne URL, appuyer sur ⚙ et renseigner **l'adresse HTTPS qui ouvre
   réellement le site Mes Courses Téo**. L'URL GitHub Pages préremplie est
   conventionnelle mais **n'a pas été confirmée accessible** dans cette conversation.
8. Se connecter dans Mes Courses Téo, puis ouvrir une vérification sauvegardée
   et appuyer sur **Ticket 58 mm / Imprimer**.

Pour la première impression, **fermer nRF Connect** : l'imprimante ne peut
généralement pas être occupée par une autre app BLE. Garder MPT-II allumée et
approcher l'iPhone.

## Technique

- `TaxiWebView.swift` installe un pont JS nommé
  `window.webkit.messageHandlers.teoPrinter`.
- Le site Web ne peut envoyer un ticket que depuis son cadre principal HTTPS,
  lorsque le domaine est celui configuré dans l'application native.
- `MPTIIPrinter.swift` recherche et reconnecte la MPT-II via CoreBluetooth,
  choisit une caractéristique BLE d'écriture et envoie les commandes ESC/POS
  par petits paquets de 20 octets, avec gestion des erreurs.
- Le formulaire, les cours et les vérifications conservent la synchronisation
  Firebase existante du site web.
- La connexion par popup Google peut avoir des limitations dans WKWebView ;
  vérifier d'abord la connexion par courriel et mot de passe.
- **Safari ne peut toujours pas imprimer directement en Bluetooth BLE.**
- L'installation et un essai physique sur la Bisofice restent nécessaires
  avant de considérer cette fonctionnalité comme validée.

## Dépannage

- **MPT-II introuvable :** fermer nRF Connect et toute autre application connectée
  à l'imprimante, puis réessayer.
- **Bluetooth désactivé :** l'activer dans Réglages → Bluetooth et autoriser
  Mes Courses Téo.
- **Commande envoyée mais pas de papier :** tester le rouleau, vérifier la charge,
  et refaire le test avec le service 18F0/2AF1 observé dans nRF Connect.
- **Page 404 :** l'adresse de l'hébergement GitHub Pages ou Vercel est incorrecte.
  Utiliser ⚙ pour renseigner l'adresse vérifiée. La page 404 est indépendante
  du module d'impression.
- **L'app n'apparaît pas dans Safari :** c'est normal, la version native iOS est
  une application signée et installée séparément.

## Limites

L'app **n'est pas encore un .ipa signé ou distribué sur TestFlight** et n'a pas
été compilée sur macOS ni testée physiquement sur votre imprimante dans ce
contexte. Elle fournit le code source pour effectuer cette dernière étape.
