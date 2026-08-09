# 🦪 SEAORA — La Perle

Sceller des photos, des films, une voix et quelques mots dans un coquillage 3D,
protégé par un code secret, partagé par QR code.

Le créateur dépose ses souvenirs, choisit un code — et, s'il le souhaite, une
**référence** qui sera exigée en plus du code. Il reçoit un lien et un QR code.
Celui qui scanne voit le coquillage : il entre le code, la coquille s'ouvre, la
perle grandit jusqu'à remplir l'écran, puis les souvenirs jaillissent — et la
voix commence exactement à cet instant.

---

## Architecture

```text
React + Vite                Node.js + Express               PostgreSQL
──────────────              ─────────────────               ──────────
  components/          →      routes/                 →       Prisma
  hooks/                      controllers/                    ──────
  services/                   services/                       Pearl
  api/                        prisma client                   Memory
                                                              Session
                                                              UnlockAttempt
```

Une seule règle traverse le serveur :

```text
Routes  →  Controllers  →  Services  →  Prisma  →  PostgreSQL
```

Aucune requête base de données dans un gestionnaire de route ; aucune logique
métier dans un contrôleur ; le navigateur ne parle jamais à PostgreSQL.

### Le parcours

```text
Loading → scène sous-marine → porte (code secret) → authentifié
        → collection de souvenirs → choisir → ouvrir
        → lecteur plein écran → photo / vidéo / voix / écrit
```

### Arborescence

```text
seaora/
├── client/                        React + Vite
│   ├── index.html
│   ├── vite.config.js             proxy /api et /m vers le serveur
│   └── src/
│       ├── main.jsx · App.jsx     routage, code-splitting par écran
│       ├── api/                   client.js · pearls · gifts · admin
│       ├── components/
│       │   ├── underwater/        UnderwaterScene · WaterOverlay
│       │   ├── passcode/          PasscodeGate
│       │   ├── memories/          MemoryCollection · MemoryStack · MemoryCard · Journal
│       │   ├── story/             StoryViewer · StoryProgress · AudioPlayer
│       │   │                      PhotoMemory · VideoMemory · NoteMemory
│       │   ├── builder/           Sheet
│       │   └── ui/                LoadingScreen · Fallback · Dust · icons
│       ├── hooks/                 useCardStack · useVoiceNotes
│       │                          usePerformanceTier · useToast
│       ├── pages/                 ViewerPage · BuilderPage · AdminPage · PanelPage
│       ├── services/              audioBus · capture (MediaRecorder, poster)
│       ├── three/                 shellScene · shellGeometry
│       ├── styles/                base · underwater · gate · collection · story · pages
│       └── utils/                 motion · format
│
├── server/                        Node.js + Express
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   ├── seed.js
│   │   └── assets/                y déposer sample-video.mp4 (facultatif)
│   └── src/
│       ├── app.js · server.js
│       ├── config/                env · prisma
│       ├── routes/                auth · memories · pearls · gifts · admin
│       ├── controllers/           un par domaine
│       ├── services/              pearl · memory · auth · gift · session
│       │                          media · qr · serialize · storage/
│       ├── middleware/            auth · uploads · rateLimiters · errorHandler
│       └── utils/                 crypto · text · urls · httpError · asyncHandler
│
├── uploads/                       images/ · videos/ · audio/
├── .env.example
├── package.json                   scripts racine (dev, build, db:*)
└── README.md
```

---

## Prérequis

| | |
|---|---|
| **Node.js** | 18.18 ou plus récent |
| **PostgreSQL** | 14 ou plus récent |
| **Outils de compilation** | `sharp` et `@prisma/client` téléchargent des binaires. Sur Linux, si la compilation échoue : `sudo apt install -y build-essential python3` |

---

## Démarrage rapide

```bash
# 1 — les dépendances (racine, serveur, client)
npm run install:all

# 2 — la configuration
cp .env.example .env
#    puis renseignez DATABASE_URL, ADMIN_KEY et PASSCODE

# 3 — la base
npm run db:migrate        # crée les tables
npm run db:seed           # crée la perle de démonstration

# 4 — les deux moitiés, ensemble
npm run dev
```

| | |
|---|---|
| **http://localhost:5173/p/demo** | la perle de démonstration — code : `PASSCODE` |
| **http://localhost:5173/panel** | créer une perle complète d'un coup |
| **http://localhost:5173/admin** | générer un cadeau vide *(exige `ADMIN_KEY`)* |
| **http://localhost:5000/api/health** | l'API |

### Créer la base PostgreSQL

```bash
# avec Docker
docker run --name seaora-postgres -e POSTGRES_PASSWORD=seaora \
  -e POSTGRES_USER=seaora -e POSTGRES_DB=seaora -p 5432:5432 -d postgres:16

# ou avec psql
createdb seaora
```

Puis dans `.env` :

```env
DATABASE_URL=postgresql://seaora:seaora@localhost:5432/seaora?schema=public
```

---

## Commandes

| Commande | Rôle |
|---|---|
| `npm run install:all` | installe la racine, le serveur et le client |
| `npm run dev` | serveur **et** client, ensemble |
| `npm run dev:server` · `npm run dev:client` | l'un ou l'autre |
| `npm run build` | construit le client dans `client/dist` |
| `npm start` | démarre le serveur ; il sert aussi le client construit |
| `npm run db:migrate` | crée / applique une migration (développement) |
| `npm run db:deploy` | applique les migrations existantes (production) |
| `npm run db:seed` | (re)crée la perle de démonstration |
| `npm run db:reset` | vide la base et rejoue tout |
| `npm run db:studio` | l'explorateur Prisma |
| `npm run setup` | install + migrate + seed, d'un trait |

En développement, Vite sert le client sur `5173` et relaie `/api` et `/m` vers
Express sur `5000` : **une seule origine des deux côtés**, exactement comme en
production. En production, `npm run build && npm start` : Express sert l'API,
les médias et le client construit sur un seul port.

---

## Variables d'environnement

Un seul fichier, `.env`, à la racine. Le serveur et Vite le lisent tous les deux.

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | **obligatoire** — la chaîne de connexion PostgreSQL |
| `PORT` | port du serveur (5000 par défaut) |
| `CLIENT_URL` | origine du client, pour CORS en développement |
| `PUBLIC_URL` | **indispensable en production** — l'adresse que les gens atteignent vraiment. Les QR codes l'encodent |
| `TRUST_PROXY` | nombre de sauts de proxy à croire pour l'IP du client |
| `PASSCODE` | le code de la perle de démonstration. **Vérifié côté serveur**, jamais envoyé au navigateur |
| `ADMIN_KEY` | **obligatoire** pour ouvrir `/admin` |
| `STORAGE_DRIVER` | `database` (par défaut) ou `local` — voir *Médias* |
| `UPLOAD_DIR` | où atterrissent les médias, **uniquement** avec `STORAGE_DRIVER=local` |
| `MAX_IMAGES`, `MAX_IMAGE_MB`, `MAX_AUDIOS`, `MAX_AUDIO_MB`, `MAX_VIDEOS`, `MAX_VIDEO_MB`, `MAX_NOTES` | limites d'envoi |
| `VITE_API_URL` | seulement si le client est déployé sur un autre hôte que l'API |

> Ne committez jamais le vrai `.env`. `.gitignore` s'en charge.

---

## La base de données

Le schéma d'origine tenait quatre tables parallèles — images, audios, videos,
notes — chacune avec sa propre colonne de position, et le lecteur les fusionnait
en une seule pile à la lecture. Ici elles sont **une table `Memory`** discriminée
par `type` : les mêmes données, un seul ordre, un seul jeu d'endpoints, et un
seul endroit où ajouter un cinquième type de souvenir plus tard.

### `position` : l'ordre de l'auteur

`position` est **la place dans l'album, tous types confondus** — une seule
séquence par perle.

Elle était numérotée à l'intérieur de chaque type : les photos 0, 1, 2 et les
voix 0, 1, 2 aussi, et le lecteur lisait les quatre groupes l'un après l'autre.
Cela jetait le seul ordre que l'auteur ait jamais exprimé : celui dans lequel il
a déposé ses souvenirs. Un cadeau construit *photo, voix, photo, écrit*
revenait *photo, photo, voix, écrit*.

Un souvenir ajouté prend `max(position) + 1` sur toute la perle, et le
glisser-déposer de l'atelier réordonne **l'album entier** : une voix peut être
posée entre deux photographies et y rester.

> Les **limites** restent par type (`MAX_IMAGES`, `MAX_AUDIOS`…) : vingt-quatre
> photographies et six films ne coûtent pas la même chose à stocker.

```prisma
model Memory {
  id           Int        @id @default(autoincrement())
  pearlId      Int
  type         MemoryType   // PHOTO | VIDEO | VOICE | NOTE
  title        String       // légende · libellé · titre de la page
  description  String       // le corps d'un souvenir écrit
  date         String       // texte libre : « Été 2019 »
  mediaUrl     String?      // chemin relatif au stockage
  thumbnailUrl String?
  posterUrl    String?
  mimeType     String?
  duration     Float?       // secondes — voix et films
  width        Int?
  height       Int?
  position     Int
  createdAt    DateTime
  updatedAt    DateTime
}
```

Quel champ porte du sens selon le type :

| type | `title` | `description` | `date` | `mediaUrl` | autres |
|---|---|---|---|---|---|
| `PHOTO` | la légende manuscrite | — | — | le WebP plein format | `thumbnailUrl`, `width`, `height` |
| `VIDEO` | le libellé | — | — | le film, tel quel | `posterUrl`, `duration` |
| `VOICE` | le libellé | — | — | l'audio, tel quel | `duration` |
| `NOTE` | le titre | la page | « Été 2019 » | — | — |

Les autres modèles : **`Pearl`** (la porte, les secrets, la lettre),
**`Session`** (un jeton lié à une seule perle, `VIEW` ou `BUILDER`),
**`UnlockAttempt`** (une tentative ratée, comptée par IP et par perle),
**`MediaBlob`** (les octets d'un fichier, indexés par le même chemin relatif
que portent les souvenirs — voir *Médias*).

### Les données de démonstration

`npm run db:seed` crée une perle scellée avec **un souvenir de chaque type**, de
sorte que chaque état de l'interface soit visible immédiatement.

La photographie, l'image d'aperçu et le message vocal sont **générés** par le
script — de vrais fichiers WebP et un vrai WAV jouable — donc rien à télécharger
et aucune URL morte.

Le film est la seule chose qu'un script ne peut pas fabriquer sans encodeur
vidéo, et ce service ne dépend délibérément pas de ffmpeg. Déposez un `.mp4`
court ici puis rejouez le seed :

```text
server/prisma/assets/sample-video.mp4
```

Sans lui, le souvenir vidéo existe quand même : sa carte montre l'image
d'aperçu, le badge de lecture et la durée, et le lecteur retombe sur l'horloge
de la photographie quand un film refuse de démarrer — le comportement exact d'un
vrai cadeau dont le navigateur ne sait pas décoder le codec.

---

## L'API

### La porte

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/auth/gate?slug=` | Les mots de la porte : titre, invitation, indice, `needsRef`. **Aucun média** |
| `POST` | `/api/auth/passcode` | `{ slug?, passcode, reference? }` → l'album entier **et** un jeton de lecture |

Sans `slug`, la porte est celle de la perle de démonstration, et le code est
comparé à `PASSCODE` — **côté serveur**, là aussi.

### Les souvenirs

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/memories?type=` | Tous les souvenirs de la perle de la session |
| `GET` | `/api/memories/:id` | Un seul |
| `POST` | `/api/memories` | Ajouter *(JSON pour un écrit, multipart sinon)* |
| `PATCH` | `/api/memories/:id` | Les mots d'une carte, ou une page entière |
| `DELETE` | `/api/memories/:id` | Retirer *(les fichiers partent avec)* |
| `POST` | `/api/memories/reorder` | `{ type, ids[] }` après un glissement |

La lecture exige une session (`x-view-token` **ou** `x-gift-token`) ;
l'écriture exige une session d'atelier (`x-gift-token`).

### Les perles

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/api/pearls` | Créer. `multipart` : `images[]`, `audio[]`, `captions[]`, `audioLabels[]`, `password`, `reference?`, `message` |
| `GET` | `/api/pearls/:slug` | Les mots de la porte. `409` si le cadeau est encore en préparation |
| `POST` | `/api/pearls/:slug/unlock` | `{ password, reference? }` → `message`, `images[]`, `audios[]`, `videos[]`, `notes[]` |
| `GET` | `/api/pearls/:slug/qr.png` | QR code PNG (`?size=180…1400`) |
| `GET` | `/api/pearls/:slug/qr.svg` | QR code vectoriel |
| `GET` | `/api/pearls/:slug/manage` | Statistiques — en-tête `x-manage-key` |
| `PATCH` | `/api/pearls/:slug` | Textes / code / `reference` (`""` la retire) — `x-manage-key` |
| `DELETE` | `/api/pearls/:slug` | Supprimer perle et fichiers — `x-manage-key` |

### L'atelier — en-tête `x-gift-token`

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/gifts/:slug` | La porte : `sealed`, et quel mot de passe demander |
| `POST` | `/api/gifts/:slug/session` | `{ password }` → jeton + tout le contenu |
| `GET` | `/api/gifts/:slug/content` | Tout le contenu |
| `POST` | `/api/gifts/:slug/photos` · `voices` · `videos` · `notes` | Ajouter |
| `POST` | `/api/gifts/:slug/{kind}/:id/replace` | Remplacer sans changer de place dans la pile |
| `PATCH` | `/api/gifts/:slug/{kind}/:id` | Légende / titre / texte |
| `DELETE` | `/api/gifts/:slug/{kind}/:id` | Retirer |
| `POST` | `/api/gifts/:slug/order` | `{ ids[] }` — **l'album entier**, tous types confondus |
| `PATCH` | `/api/gifts/:slug/message` | Le mot qui accompagne le cadeau |
| `POST` | `/api/gifts/:slug/finish` | `{ password, confirm }` → scelle et révoque |

Chaque écriture répond avec **le cadeau entier** : l'atelier n'a jamais à
deviner ce qui a changé, il se redessine à partir d'une seule vérité.

### Administration — en-tête `x-admin-key`

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/admin/status` | `ADMIN_KEY` est-elle configurée ? *(pas de clé requise)* |
| `POST` | `/api/admin/session` | Vérifier la clé |
| `POST` | `/api/admin/gifts` | `{ reference, tempPassword }` → `slug`, `builderUrl`, `qr` |
| `GET` | `/api/admin/gifts` | Les 40 derniers cadeaux et leur état |
| `GET` | `/api/admin/gifts/:slug/qr.png` · `.svg` | QR **de l'atelier** *(le QR public vise le coquillage)* |

---

## Le parcours en trois temps

Un cadeau naît vide chez l'administrateur et se remplit chez le client.

### 1. L'administrateur — `/admin`

Protégé par `ADMIN_KEY`. **Sans cette clé, la console refuse de s'ouvrir.**

Deux champs : la **référence** gravée sur l'objet (elle devient le second
secret) et un **mot de passe temporaire** à communiquer au client. Le bouton
crée l'identifiant, l'URL et le QR code de l'atelier. La perle naît `DRAFT` : le
coquillage refuse de s'ouvrir tant qu'elle n'est pas scellée, et le mot de passe
temporaire n'est affiché qu'une fois — la base ne le conserve que haché.

### 2. Le client — `/build/:slug`

Il scanne, saisit le mot de passe temporaire, et **l'atelier s'ouvre dans le
décor du cadeau fini** : même eau, même papier, mêmes typographies, mêmes
ressorts.

Ce n'est pas un formulaire. **Une seule pile**, dans l'ordre où le client
dépose ses souvenirs, terminée par une carte vide — même papier, même ombre,
même inclinaison — qui porte « Ajouter un souvenir ». La remplir *est* le geste
d'ajout.

L'atelier n'a plus quatre onglets. Il **demande** : photo · voix · écrit ·
vidéo. Quatre onglets faisaient ressembler un cadeau à quatre collections, et
cachaient ce qui compte — l'ordre du dépôt est l'ordre de la lecture.

Quatre familles, une pile : **photos** (choisir ou déposer, légender, remplacer,
retirer) · **voix** (`MediaRecorder` ou import) · **écrits** (titre, date libre,
texte) · **vidéos** (la vignette est extraite dans le navigateur avant l'envoi).
Sous la scène, une bande-contact montre **tout l'album d'un coup**, dans son
ordre réel : on y glisse une vignette pour la déplacer — une voix peut se poser
entre deux photographies.

### 3. Sceller — « Terminer »

Au scellage, dans une seule transaction : le code du propriétaire remplace le
code inutilisable de départ, **le mot de passe temporaire est effacé**, la perle
passe `SEALED`, et **toutes les sessions ouvertes sont révoquées** — y compris
celle en cours, à qui le serveur rend aussitôt un jeton neuf. Il n'existe aucun
instant où les deux mots de passe fonctionnent.

---

## La voix : pourquoi elle démarre bien

Les navigateurs mobiles n'autorisent la lecture audio que si elle découle d'un
geste de l'utilisateur. Or ici le geste — le tap sur « Révéler » — précède de
trois secondes le moment où la voix doit commencer.

La solution : au moment du tap, l'élément audio est « amorcé » — `play()` en
sourdine puis `pause()` immédiat. Le navigateur le marque alors comme approuvé
par l'utilisateur, et le `play()` différé réussit. Si malgré tout il est bloqué,
la carte reste jouable d'un tap.

**Une seule voix à la fois.** La règle vit dans `services/audioBus.js`, pas dans
un composant, pour qu'elle tienne que la note ait été lancée depuis sa carte,
depuis le lecteur plein écran, au clavier, ou par l'album passant tout seul à la
suivante :

```text
arrêter la précédente → réinitialiser son état → démarrer la nouvelle
                      → mettre à jour l'audio actif → mettre à jour la progression
```

Seule la **première** note est préchargée, parce que seule la première démarre
d'elle-même. Les autres sont `preload="none"` : leur durée voyage déjà avec la
perle, donc une requête de métadonnées n'apprendrait plus rien, et un cadeau à
huit voix n'ouvre plus huit connexions que personne n'a demandées.

---

## Médias

Chaque image est ré-encodée en deux WebP : un plein format (≤1600 px, qualité
82) et une vignette (≤480 px). La galerie affiche la vignette d'abord, puis
remplace par le plein format une fois chargé — l'affichage est immédiat même en
3G. Le ré-encodage **efface les EXIF** (les coordonnées GPS des photos de
vacances) tout en respectant l'orientation d'origine.

Les **vidéos sont stockées telles quelles** : pas de ré-encodage, donc pas de
dépendance à ffmpeg. La vignette est extraite dans le navigateur du client avant
l'envoi — c'est ce qui permet à une carte vidéo de ne jamais être un rectangle
noir.

Les colonnes `media_url`, `thumbnail_url` et `poster_url` ne contiennent que des
**chemins relatifs** (`images/ab12.webp`), jamais un hôte ni un binaire. Le
stockage est derrière une interface à quatre méthodes :

```js
save(folder, filename, buffer) → Promise<storagePath>
remove(storagePath)            → Promise<void>
removeMany(storagePath[])      → Promise<void>
exists(storagePath)            → Promise<boolean>
```

Deux pilotes sont fournis, choisis par `STORAGE_DRIVER` :

| | |
|---|---|
| **`database`** *(défaut)* | les octets vivent dans PostgreSQL, table `media_blobs`, indexés par ce même chemin relatif. **Une seule sauvegarde emporte le cadeau entier** — la base et les souvenirs ne peuvent plus se désynchroniser |
| **`local`** | les octets vivent sous `UPLOAD_DIR`. Sauvegardez alors la base **et** le dossier ensemble |

Avec le pilote `database`, `/m/...` est servi par
`server/src/routes/media.routes.js` : `ETag`, `304`, `Accept-Ranges` et `206`
sont écrits à la main, parce qu'un navigateur refuse de se déplacer dans un
film dont le serveur répond `200` à une requête `Range`.

Ajouter un pilote S3 revient à écrire un module de cette forme dans
`server/src/services/storage/` et à le nommer dans `STORAGE_DRIVER` : aucun
contrôleur, aucun service, aucune ligne de la base ne change.

---

## Performance

### Les paliers

Le niveau de l'appareil est détecté une fois et reflété sur `<body>` en
`perf-mid`, `perf-low` et `is-mobile` — la feuille de style décide seule de ce
qu'elle coupe.

| | haut | moyen | bas |
|---|---|---|---|
| caustiques | pleines, en `screen` | opacité réduite, `mix-blend-mode` retiré | figées, sans animation |
| rayons | oui | atténués | retirés |
| bulles | 14 | 7 | 0 |
| poussière de lumière | 22 | 11 | 0 |
| flou d'arrière-plan | oui | oui | retiré |
| iridescence / sheen | oui | sheen seul | ni l'un ni l'autre |
| ombres temps réel | bureau seulement | blob peint | blob peint |
| résolution de rendu | ≤1.5× | ≤1.25× | ≤1.0×, cadence 30 fps |

Un téléphone **démarre au palier moyen et doit mériter le palier haut**. L'ancien
sens — partir du haut et exiger la preuve de la faiblesse — était à l'envers :
la preuve arrive sous forme d'images perdues, et le visiteur a déjà vu le
coquillage saccader.

Trois choses sont chères, et aucune pour la raison qu'on croit :
`mix-blend-mode` force le navigateur à garder l'arrière-plan comme texture
séparée et à le mélanger à chaque image ; `will-change` promeut un élément en
calque pour toujours ; `backdrop-filter` recalcule un flou plein écran à chaque
image. Ils sont tous les trois portés, mesurés et coupés là où ils coûtent plus
qu'ils n'apportent.

### Le reste

- La **résolution s'adapte** : après 25 images de chauffe, des fenêtres de 20
  images ; une correction dimensionnée à l'écart réel. Elle ne remonte jamais —
  une résolution qui oscille est pire à regarder qu'une résolution basse.
- Quand la galerie couvre le canvas, **la boucle de rendu est garée** et les
  couches d'eau sortent de l'arbre : sinon elles se composent à chaque image
  derrière un écran opaque, en concurrence avec le défilement.
- Un onglet en arrière-plan gare aussi la scène — c'est le moyen le plus rapide
  de vider une batterie et de se faire retirer le contexte WebGL.
- Les images sont chargées en **lazy** au-delà des cinq premières ; les vidéos
  ne sont créées que le temps d'être regardées ; les audios inactifs sont
  arrêtés et déchargés.
- Le glissement d'une carte **ne provoque aucun rendu React** : un ressort écrit
  la transformation directement dans le DOM. React ne redessine que lorsque le
  souvenir en main change.
- `prefers-reduced-motion` est respecté partout : ce n'est pas « une animation
  plus rapide », c'est l'absence d'animation.

---

## Sécurité

- **Le code ne quitte jamais le client en clair côté stockage** : il est haché
  en `scrypt` (N=16384). Une base volée ne livre pas les codes.
- **Le code n'est pas dans le bundle** : `/api/auth/passcode` le vérifie côté
  serveur, y compris pour la perle de démonstration (`PASSCODE`).
- **Référence facultative — un second secret** : hachée comme le code, jamais
  stockée en clair, absente de `GET /api/pearls/:slug` (seul le booléen
  `needsRef` sort). Les deux moitiés sont **toujours** vérifiées — pas de
  court-circuit — et une erreur sur l'une ou l'autre renvoie le même message :
  ni le texte ni le temps de réponse ne disent quelle moitié était juste. La
  comparaison ignore la casse et les espaces superflus, car la référence se
  recopie depuis un objet.
- **Les médias sont retenus** : la porte ne renvoie que ses propres mots. Les
  URLs des images, des films et de l'audio n'existent dans aucune réponse avant
  la validation du code.
- **Les souvenirs exigent une session** : `/api/memories` répond `401` sans
  jeton, et un jeton est lié à **une seule** perle.
- **Le mot de passe temporaire meurt au scellage**, dans la transaction même qui
  installe le code du propriétaire, et toutes les sessions sont révoquées.
- **Un cadeau en préparation ne s'ouvre pas** : il porte un `passHash` de 48
  caractères aléatoires que personne n'a jamais vus, et la porte répond `409`.
- **La console d'administration est fermée par défaut** : sans `ADMIN_KEY`,
  `/admin` ne génère rien. La clé est comparée en temps constant et sa saisie
  est limitée à 30 essais par quart d'heure.
- **Anti-force brute** : 12 tentatives par IP et par perle par tranche de 15
  minutes, plus une limite de débit par adresse ; 15 pour le mot de passe de
  l'atelier ; 40 créations par heure.
- **Noms de fichiers imprévisibles** : 16 caractères aléatoires — l'URL est
  elle-même la capacité d'accès. Les chemins sont normalisés avant tout accès
  disque, donc aucun `..` ne sort du dossier d'envoi.
- **Uploads bornés** : type MIME filtré, taille et nombre limités,
  `limitInputPixels` contre les images-bombes.
- **En-têtes** : `helmet` avec une CSP restrictive, CORS explicite, aucune
  dépendance CDN à l'exécution.
- **Erreurs sûres** : une erreur attendue porte un message lisible ; tout le
  reste répond « Erreur serveur ». Ni pile d'appel, ni message Prisma, ni chemin
  de fichier n'atteint le navigateur.

> ⚠️ Le code secret protège l'ouverture, mais toute personne disposant du **lien
> direct d'un média** peut le voir. Les noms étant aléatoires, ils ne sont pas
> devinables — mais ne partagez pas ces URLs.

---

## Accessibilité

- HTML sémantique ; les contrôles ordinaires sont de vrais `<button>`.
- Les deux piles de cartes portent `role="button"`, `tabindex` et le clavier
  complet : un `<button>` ne peut pas légalement contenir un article avec un
  titre, et le rôle atteint les technologies d'assistance de la même façon.
- `aria-label` sur chaque contrôle, `aria-live` sur les compteurs et les
  erreurs, `alt` sur chaque image, `role="dialog"` + `aria-modal` sur les
  couches plein écran.
- **Clavier** : `←` / `→` parcourent la pile et le lecteur, `Entrée` / `Espace`
  ouvrent, `Espace` met la voix en pause, `Échap` ferme la couche la plus
  intérieure d'abord.
- `:focus-visible` visible partout ; aucun anneau de focus supprimé sans
  remplacement.
- `prefers-reduced-motion` coupe les ressorts, les dérives et les bulles.

---

## États d'erreur et de repli

| Cas | Ce que voit le visiteur |
|---|---|
| WebGL indisponible | Un écran qui dit **pourquoi** (WebGL1/2, GPU, message), et un bouton pour recharger |
| Contexte graphique perdu | Le même écran, avec la raison probable |
| Perle introuvable | « Ce lien a expiré ou n'existe plus » — le champ de code disparaît |
| Cadeau non scellé | « Cette perle n'a pas encore été scellée par son auteur » |
| Code faux | Un message unique, un tremblement, le champ resélectionné |
| Trop de tentatives | « Trop de tentatives. Réessayez dans quelques minutes. » |
| Réseau coupé | « Connexion impossible — réessayez » |
| Image manquante | La carte garde sa forme et dit « Image indisponible » |
| Film illisible | Le lecteur retombe sur l'horloge de la photographie et passe au suivant |
| Album vide | « Cette perle ne contient encore aucun souvenir. » |
| Session d'atelier expirée | Retour à la porte, avec l'explication |

---

## Mise en production

```bash
npm run install:all
npm run build           # client/dist
npm run db:deploy       # applique les migrations
npm start               # Express sert l'API, les médias et le client
```

1. Renseignez `PUBLIC_URL` — **indispensable** : les QR codes encodent cette
   adresse. Le serveur avertit au démarrage si elle ne correspond à aucune
   interface locale.
2. Placez le service derrière un reverse proxy en HTTPS. Le micro du navigateur
   *exige* HTTPS : sans certificat, l'enregistrement vocal ne fonctionnera pas
   ailleurs qu'en `localhost`.
3. Gardez le processus en vie avec `pm2` ou une unité systemd.
4. Avec `STORAGE_DRIVER=database` (le défaut), la sauvegarde de la base suffit :
   les photographies, les films et les voix y sont. Avec `local`, sauvegardez
   la base **et** `uploads/` ensemble — la base seule ne suffit pas.

Exemple nginx :

```nginx
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 150m;   # doit dépasser MAX_VIDEO_MB
    proxy_request_buffering off; # une vidéo de 100 Mo ne doit pas transiter par le disque du proxy
}
```

Avec `TRUST_PROXY=1`, pour que l'anti-force brute compte la vraie IP.

---

## Dépannage

| Symptôme | Cause · remède |
|---|---|
| `PostgreSQL est injoignable` au démarrage | `DATABASE_URL` faux, ou la base n'écoute pas. Le serveur refuse de démarrer plutôt que de répondre 500 à tout |
| `The table ... does not exist` | Les migrations n'ont pas été jouées : `npm run db:migrate` |
| `@prisma/client did not initialize` | `npm run db:generate` |
| Le client dit « Le client n'est pas construit » | `npm run build`, ou utilisez `npm run dev` |
| `/admin` répond 503 | `ADMIN_KEY` absente de `.env` — puis redémarrez |
| Le QR code ne s'ouvre pas sur un téléphone | `PUBLIC_URL` encode `localhost`. Mettez-y l'adresse LAN affichée au démarrage |
| Le micro ne marche pas | Origine non sécurisée : le navigateur exige https hors `localhost`. L'import de fichier reste disponible |
| Le souvenir vidéo ne joue pas | Aucun `sample-video.mp4` fourni au seed — voir *Les données de démonstration* |
| Les images ne s'affichent pas en développement | Vite doit relayer `/m` : vérifiez que le serveur tourne sur le `PORT` du `.env` |
| `sharp` refuse de s'installer | Outils de compilation manquants : `sudo apt install -y build-essential python3` |
| La scène 3D ne démarre pas | L'écran de repli dit pourquoi. Souvent : accélération graphique désactivée, ou lien ouvert dans le navigateur intégré d'une application |

### Diagnostics

Ajoutez `?perf` à l'URL d'une perle, puis dans la console :

```js
window.__seaoraInfo()
// { tier, matTier, mobile, shadows, pixelRatio, triangles, calls, programs, geometries, textures }
```

---

## Réglages utiles

| Où | Quoi |
|---|---|
| `client/src/utils/motion.js` → `MOVE` | les courbes et les durées de toutes les cartes |
| `client/src/three/shellScene.js` → `REVEAL_MS` | la durée du zoom vers la perle |
| `client/src/three/shellScene.js` → `FILL` | la taille du coquillage à l'écran |
| `client/src/components/story/StoryViewer.jsx` → `PHOTO_MS`, `NOTE_MS` | combien de temps un souvenir tient l'écran |
| `client/src/hooks/useCardStack.js` → `VISIBLE`, `LIFT`, `FAN_X` | la profondeur de la pile |
| `server/src/services/media.service.js` → `MAX_EDGE`, `THUMB_EDGE` | la définition des images |
| `server/src/config/env.js` → `unlock` | la sévérité de l'anti-force brute |

---

*SEAORA — Keep love within reach.*
