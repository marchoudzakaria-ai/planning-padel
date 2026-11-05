# 🎾 Planning Padel

PWA mobile-first pour suivre tes **tournois officiels** et tes **parties ouvertes**, alimentée automatiquement par tes **e-mails Gmail** (Ten'Up, Padel Nomado, Padel Now…).

---

## 0. Tes données réelles (import du 05/11/2026)

Le fichier `import/mes-evenements-gmail.json` contient **31 événements** relevés dans ton Gmail : 7 tournois à venir, 2 tournois passés et 22 parties 4PADEL depuis le 1er octobre.

- **Sur ton téléphone :** ouvre l'app → Réglages → *Importer un fichier* → choisis ce fichier (envoie-le-toi par AirDrop ou e-mail). Pas de doublons si tu réimportes.
- ⚠️ **Ne publie pas le dossier `import/` sur Netlify ou GitHub** : il contient tes inscriptions et les noms de tes partenaires. Retire-le du dossier avant de le glisser sur Netlify.
- Une fois la passerelle Apps Script en place (section 4), les nouveaux e-mails arrivent tout seuls et se fusionnent avec ces événements (même identifiant `sourceId`).

---

## 1. Architecture retenue

```
┌──────────────────────────┐        GET ?token=…        ┌──────────────────────────────┐
│  PWA (ce dossier)        │ ─────────────────────────▶ │  Google Apps Script          │
│  HTML + Tailwind + JS    │ ◀───────── JSON ────────── │  (tourne dans TON compte)    │
│  Hébergée : GitHub Pages │                            │  lit Gmail → parse → JSON    │
│  Données : localStorage  │                            └──────────────┬───────────────┘
│  Export .ics / JSON      │                                           │ GmailApp.search()
└──────────────────────────┘                            ┌──────────────▼───────────────┐
                                                        │ Gmail : e-mails Ten'Up,      │
                                                        │ Padel Nomado, Padel Now,     │
                                                        │ libellé « padel »            │
                                                        └──────────────────────────────┘
```

### Pourquoi ce choix (le plus simple et robuste)

| Option | Verdict |
|---|---|
| **Apps Script + Gmail** ✅ | Gratuit, aucun serveur, aucun mot de passe stocké. Le script tourne avec ton compte Google : pas besoin de faire valider une appli OAuth par Google. |
| Next.js + API Gmail (OAuth) | Lourd. Une appli OAuth non validée par Google a des jetons qui **expirent tous les 7 jours** pour la lecture Gmail : il faudrait se reconnecter chaque semaine. |
| Make / Zapier | Payant dès qu'il y a du volume, tes e-mails transitent par un tiers, parsing moins souple. Reste une bonne option si tu veux aussi recevoir une notif Slack/WhatsApp. |
| Scraping Ten'Up / applis padel | ❌ À éviter : pas d'API publique, il faudrait stocker tes identifiants, ça casse à chaque mise à jour du site et c'est contraire aux CGU. |

**Le point clé :** Ten'Up et les applis de padel n'ont pas d'API publique, mais **elles t'envoient toutes un e-mail** (inscription, liste d'attente, convocation du juge-arbitre, réservation confirmée, annulation). Gmail devient donc la source unique, ce qui est fiable et légal.

Pour tout ce qui n'arrive pas par e-mail (SMS, WhatsApp, capture d'une partie repérée), l'app propose **« Coller un message »** : la date, l'heure, le club, la catégorie (P25…P2000) et le statut sont détectés automatiquement.

### Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Coquille de l'app, barre de navigation, bottom sheet |
| `app.js` | Logique : vues À venir / Calendrier / Sync / Réglages, statuts, synchro, export .ics |
| `parser.js` | Détection date / heure / club / statut dans un texte (partagé avec le script) |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Installation sur l'écran d'accueil + fonctionnement hors ligne |
| `apps-script/Code.gs` | La passerelle Gmail à coller dans Google Apps Script |

### Statuts

`Repéré` → `En attente` (liste d'attente) → `Inscrit` → `Confirmé` (convocation reçue) · `Annulé`

Lors d'une synchro, si tu as modifié un événement à la main, le script ne l'écrase pas : il fait seulement avancer le statut (ex. Inscrit → Confirmé quand la convocation arrive). Un événement importé que tu supprimes ne revient pas.

---

## 2. Tester l'app en local (2 min)

Dans le Terminal :

```bash
cd ~/Desktop/"PLANNING PADEL "
```

```bash
python3 -m http.server 8765
```

Ouvre http://localhost:8765 (sur ordinateur, active la vue mobile des outils de développement). Des exemples sont chargés au premier lancement, supprime-les ensuite.

---

## 3. Mettre l'app en ligne (gratuit, HTTPS obligatoire pour l'installer sur le téléphone)

**Option A, Netlify Drop (le plus rapide, sans compte Git)**
1. Va sur https://app.netlify.com/drop
2. Glisse-dépose le dossier `PLANNING PADEL` (le dossier `apps-script` peut rester, il n'est pas utilisé par le site).
3. Tu obtiens une URL du type `https://xxx.netlify.app`.

**Option B, GitHub Pages**
1. Crée un dépôt GitHub, pousse les fichiers.
2. *Settings → Pages → Branch: main / root*.

**Installer sur le téléphone**
- iPhone (Safari) : bouton Partager → *Sur l'écran d'accueil*.
- Android (Chrome) : menu ⋮ → *Installer l'application*.

---

## 4. Mise à jour automatique depuis Gmail (10 min, une seule fois)

**Comment ça marche :** le script vérifie ta boîte **toutes les 5 minutes**. Dès qu'un e-mail de padel arrive (inscription Ten'Up, paiement ou désistement Padel Club, partie 4PADEL, réservation Doinsport, convocation…), il met à jour ta liste. L'app la récupère **à chaque ouverture, à chaque retour dans l'app, et toutes les 5 min tant qu'elle est ouverte**, puis affiche « 📬 Nouveau mail padel ». Délai maximum : environ 5 minutes.

> Gmail ne peut pas « pousser » un e-mail vers une app perso sans un projet Google Cloud payant à configurer. La vérification toutes les 5 min est la solution gratuite et fiable. Quand rien de nouveau n'est arrivé, le script ne fait qu'une petite recherche, ce qui reste très loin des quotas Google.

### Étape 1 : mettre l'app en ligne
Voir section 3 (Netlify Drop). Note l'adresse obtenue, ex. `https://planning-padel.netlify.app/`. **Retire le dossier `import/` avant de déposer.**

### Étape 2 : installer le script
1. https://script.google.com → **Nouveau projet** → nomme-le « Planning Padel ».
2. Efface `Code.gs`, colle tout le contenu de `apps-script/Code.gs`.
3. Ligne `APP_URL: ''` : mets l'adresse de l'étape 1 entre les guillemets. Enregistre (💾).
4. Dans la liste des fonctions en haut, choisis **`installer`** → ▶ **Exécuter**.
5. Google demande l'autorisation : *Examiner les autorisations → ton compte → Paramètres avancés → Accéder à Planning Padel (non sécurisé) → Autoriser*. C'est normal : c'est **ton** script, pas une appli publiée.
6. Le journal affiche « ✅ Installé ». Le jeton secret est créé automatiquement et la vérification toutes les 5 min est active.

### Étape 3 : relier ton téléphone (un clic)
1. **Déployer → Nouveau déploiement → ⚙️ Application Web**. *Exécuter en tant que :* **Moi**. *Qui a accès :* **Tout le monde** (protégé par ton jeton). → **Déployer**.
2. Choisis la fonction **`lienPourTelephone`** → ▶ **Exécuter**. Le journal affiche un lien.
3. Envoie-toi ce lien (par exemple dans une note), **ouvre-le sur ton téléphone**, puis ajoute l'app à l'écran d'accueil. C'est fini : l'app est configurée.
4. Importe une fois `import/mes-evenements-gmail.json` (Réglages → *Importer un fichier*) pour avoir tes titres déjà nettoyés. Sinon, la synchro les recrée d'elle-même.

> Ce lien contient ton jeton : ne le partage pas. Pour le changer, supprime la propriété `TOKEN` (⚙️ Paramètres du projet → Propriétés du script), relance `installer`, puis `lienPourTelephone`.

### Vérifier / arrêter
- `testerExtraction` : liste dans le journal ce que le script détecte.
- ⏰ **Déclencheurs** (menu de gauche) : tu dois voir `verifierNouveauxMails`, toutes les 5 minutes.
- `desinstaller` : arrête la vérification automatique.
- Après une modification du script : *Déployer → Gérer les déploiements → ✏️ → Nouvelle version* (l'URL ne change pas).

---

## 5. Ajuster la détection

Les e-mails varient d'un organisateur à l'autre. Si un champ est mal détecté :
- Les règles sont dans `parser.js` (date, heure, type, catégorie, statut, club, ville, partenaire).
- **Recopie la même modification dans la partie « Parseur » de `Code.gs`**, puis redéploie une nouvelle version.
- Envoie-moi un exemple d'e-mail (en masquant tes infos perso) et j'adapte les règles.

---

## 6. Sécurité

- Aucun identifiant Ten'Up / Padel Nomado / Padel Now n'est stocké nulle part.
- Le script ne fait **que lire** Gmail, uniquement pour les requêtes de `SOURCES`, et ne renvoie que les champs utiles (date, club…), jamais le contenu complet des e-mails.
- Le jeton est stocké uniquement sur ton téléphone. En cas de doute : supprime la propriété `TOKEN` du script, relance `installer` puis `lienPourTelephone`, et rouvre le nouveau lien.
- Pour tout couper : *script.google.com → Déployer → Gérer les déploiements → Archiver*, ou retire l'accès dans https://myaccount.google.com/permissions.

---

## 7. Évolutions possibles

- **Synchro multi-appareils** : stocker aussi tes ajouts manuels dans une Google Sheet via le même script (`doPost`). Aujourd'hui les ajouts manuels restent sur l'appareil où tu les as faits (utilise *Sauvegarder / Restaurer* pour les transférer).
- **Abonnement agenda** : le script peut exposer un flux `.ics` auquel ton agenda iPhone/Google s'abonne, sans export manuel.
- **Notifications** : rappel la veille d'un tournoi (déclencheur horaire Apps Script → e-mail ou notification).
