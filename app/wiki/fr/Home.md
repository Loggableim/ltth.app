# 🇫🇷 Français

Bienvenue sur **PupCid's Little TikTool Helper** !

Il s'agit d'un outil gratuit et open source pour le streaming professionnel TikTok LIVE avec des fonctionnalités complètes pour les créateurs de contenu.

### Liens Rapides
- [Démarrage](./Getting-Started.md#français)
- [Installation](./Installation-&-Setup.md#français)
- [Liste des Plugins](./Plugin-Liste.md#français)
- [FAQ](./FAQ-&-Troubleshooting.md#français)

### 🎯 À Propos du Projet

**PupCid's Little TikTool Helper** est un outil professionnel open source pour le streaming LIVE compatible TikTok avec des fonctionnalités étendues pour les créateurs de contenu. L'outil fournit une intégration complète des événements LIVE TikTok dans OBS Studio avec overlays, alertes, synthèse vocale, soundboard et automatisation d'événements.

### ✨ Caractéristiques Clés

- **🔒 100% Local** - Pas de services cloud, pas de connexion requise
- **🎨 Overlays Professionnels** - Sources de navigateur Full-HD pour OBS Studio
- **🔌 Système de Plugins Modulaire** - Facilement extensible via des plugins
- **🌍 Multi-langue** - Interface utilisateur en allemand et anglais
- **⚡ Mises à Jour en Temps Réel** - Communication en direct basée sur WebSocket
- **🎭 Automatisation d'Événements** - Règles "si-alors" sans code

### 🎤 Pour qui est cet outil ?

- **Streamers TikTok LIVE** - Overlays et alertes professionnels
- **Créateurs de Contenu** - Automatisation d'événements et interactivité
- **Streamers VRChat** - Intégration OSC pour le contrôle d'avatar
- **Streamers Multi-invités** - Intégration VDO.Ninja pour les interviews
- **Développeurs** - Système de plugins modulaire pour extension

### 🚀 Fonctions Principales

#### 1. Intégration TikTok LIVE

Connexion en temps réel aux streams LIVE TikTok avec tous les événements :

- ✅ **Cadeaux** - Cadeaux avec pièces, suivi des combos, catalogue de cadeaux
- ✅ **Chat** - Messages avec photos de profil et badges
- ✅ **Abonnements** - Nouveaux abonnés avec suivi des rôles
- ✅ **Partages** - Partages de stream avec informations utilisateur
- ✅ **J'aime** - Événements de j'aime avec comptage
- ✅ **Souscriptions** - Souscripteurs avec niveaux

#### 2. Synthèse Vocale (TTS)

Système TTS professionnel avec plus de 100 voix :

- 🎙️ **75+ Voix TikTok** - Gratuit, pas de clés API requises
- 🎙️ **30+ Voix Google Cloud** - Optionnel avec clé API
- 👤 **Mappages de Voix Utilisateur** - Les utilisateurs obtiennent leurs propres voix assignées
- 📝 **Auto-TTS pour Chat** - Lecture automatique des messages de chat
- 🚫 **Filtre de Liste Noire** - Exclure mots/utilisateurs
- 🎚️ **Volume et Vitesse** - Ajuster le volume et la vitesse

#### 3. Système d'Alertes

Alertes personnalisables pour tous les événements TikTok :

- 🔊 **Son + Texte + Animation** - Alertes entièrement configurables
- 🖼️ **Images et GIFs** - Graphiques d'alerte personnalisés
- ⏱️ **Contrôle de Durée** - Définir la durée d'affichage des alertes
- 🎨 **Modèles Personnalisés** - Balises comme `{username}`, `{giftName}`, `{coins}`
- 🧪 **Mode Test** - Tester les alertes avant le stream

#### 4. Soundboard

Plus de 100 000 sons avec mappage de cadeaux :

- 🔍 **Intégration MyInstants** - Accès à une énorme bibliothèque de sons
- 🎁 **Mappage Cadeau-vers-Son** - Rose → Son A, Lion → Son B
- 🎵 **Sons d'Événements** - Sons pour Follow, Subscribe, Share
- ⚡ **Système de Seuil de J'aime** - Déclencher des sons à X j'aime
- 📦 **Téléchargement Personnalisé** - Télécharger vos propres MP3
- ⭐ **Favoris et Tendances** - Organiser les sons

#### 5. Objectifs et Barres de Progression

4 objectifs séparés avec overlays de source de navigateur :

- 📊 **Objectif de J'aime** - Objectif de j'aime avec barre de progression
- 👥 **Objectif d'Abonnés** - Objectif d'abonnés avec suivi
- 💎 **Objectif de Souscriptions** - Objectif de souscripteurs
- 🪙 **Objectif de Pièces** - Objectif de pièces (dons)
- 🎨 **Styles Personnalisés** - Personnaliser couleurs, dégradés, étiquettes
- ➕ **Ajouter/Définir/Incrémenter** - Sélection de mode flexible

#### 6. Automatisation d'Événements (Flows)

Automatisations "si-alors" sans code :

- 🔗 **Déclencheurs** - Cadeau, Chat, Follow, Subscribe, Share, Like
- ⚙️ **Conditions** - Conditions avec opérateurs (==, !=, >=, <=, contains)
- ⚡ **Actions** - TTS, Alerte, Scène OBS, OSC, Requête HTTP, Délai
- 🧩 **Multi-Étapes** - Plusieurs actions en séquence
- ✅ **Mode Test** - Tester les flows avant le stream

**Exemple de Flow :**
```
Déclencheur : Cadeau == "Rose"
Actions :
  1. TTS : "Merci {username} pour la Rose !"
  2. Scène OBS : Passer à "Cam2"
  3. OSC : Geste de salut dans VRChat
```

### 💻 Stack Technologique

| Catégorie | Technologie | Version |
|-----------|-------------|---------|
| **Backend** | Node.js | >=18.0.0 <25.0.0 |
| **Framework Web** | Express | ^4.18.2 |
| **Temps Réel** | Socket.io | ^4.6.1 |
| **Base de Données** | SQLite (better-sqlite3) | ^11.9.0 |
| **API TikTok** | SDK EulerStream | adaptateurs app |
| **Intégration OBS** | obs-websocket-js | ^5.0.6 |
| **Protocole OSC** | osc | ^2.4.5 |
| **Logging** | winston | ^3.18.3 |
| **Frontend** | Bootstrap 5 | 5.3 |
| **Icônes** | Font Awesome | 6.x |

### ⚡ Démarrage Rapide

1. Installer Node.js 18-23
2. Cloner le dépôt : `git clone https://github.com/Loggableim/ltth.app.git`
3. Aller dans le dossier runtime : `cd app`
4. Installer les dépendances : `npm install`
5. Démarrer le serveur : `npm start`
6. Ouvrir le dashboard : `http://localhost:3000/dashboard.html`
6. Se connecter à TikTok LIVE avec votre nom d'utilisateur

**Terminé !** 🎉 Tous les événements sont maintenant affichés en direct.

### 📄 Licence

Ce projet est sous licence **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**.

---

*Dernière mise à jour : 2026-07-22*
*Version : 1.4.0*
