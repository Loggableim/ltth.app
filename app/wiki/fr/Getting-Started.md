# 🇫🇷 Français

### 📑 Table des Matières

1. [Aperçu](#aperçu-français)
2. [Démarrage Rapide (5 Minutes)](#démarrage-rapide-5-minutes-français)
3. [Première Diffusion](#première-diffusion-français)
4. [Activer les Plugins](#activer-les-plugins-français)
5. [Configuration OBS](#configuration-obs-français)
6. [Premiers Pas Courants](#premiers-pas-courants-français)
7. [Prochaines Étapes](#prochaines-étapes-français)

---

### 🎯 Aperçu {#aperçu-français}

Ce guide vous aidera à démarrer avec **Little TikTool Helper v1.2.1** en **5-10 minutes**.

**Ce que vous réaliserez :**

✅ Outil installé et fonctionnel
✅ Connecté à TikTok LIVE
✅ Premiers overlays configurés dans OBS
✅ Plugins de base activés
✅ Prêt pour votre première diffusion

---

### ⚡ Démarrage Rapide (5 Minutes) {#démarrage-rapide-5-minutes-français}

#### Étape 1 : Installation (2 minutes)

**Prérequis :**
- Node.js 18.0.0+ installé ([Télécharger](https://nodejs.org/))
- Git installé (facultatif, [Télécharger](https://git-scm.com/))

**Installation :**

**Option A - Application de Bureau (Recommandé) :**
```bash
# Cloner le dépôt
git clone https://github.com/Loggableim/ltth.app.git
cd ltth.app

# Installer les dépendances
npm install

# Démarrer l'app de bureau
npm start
```

**Option B - Serveur Autonome :**
```bash
# Aller dans le dossier app
cd app

# Installer les dépendances
npm install

# Démarrer le serveur
npm start
```

#### Étape 2 : Ouvrir le Dashboard (30 secondes)

**App de Bureau :** S'ouvre automatiquement

**Autonome :** Ouvrir le navigateur sur `http://localhost:3000`

#### Étape 3 : Se Connecter à TikTok (1 minute)

1. **Obtenir la clé API Eulerstream :**
   - Aller sur [Eulerstream](https://eulerstream.com/)
   - S'inscrire (gratuit)
   - Copier votre clé API

2. **Dans le Dashboard :**
   - Cliquer sur **"Connect to TikTok LIVE"**
   - Entrer votre **nom d'utilisateur TikTok**
   - Entrer votre **clé API Eulerstream**
   - Cliquer sur **"Connect"**

3. **Attendre la connexion :**
   - Le statut devrait passer à **"Connected" (vert)**
   - Les événements en direct apparaissent dans le journal d'événements

#### Étape 4 : Test (30 secondes)

**Envoyer un cadeau de test :**
1. Ouvrir TikTok sur votre téléphone
2. Aller sur votre diffusion LIVE
3. Envoyer un cadeau de test (p. ex., Rose)
4. Le dashboard devrait afficher le cadeau

**✅ Terminé !** Vous êtes maintenant connecté à TikTok LIVE.

---

### 🎬 Première Diffusion {#première-diffusion-français}

#### 1. Configuration de Base

**Activer TTS :**
1. Dashboard → **TTS** (Barre latérale)
2. Activer **"Auto-TTS for Chat"**
3. Sélectionner une voix (p. ex., "en_us_001 - Female")
4. Cliquer sur **Test**

**Activer les Alertes :**
1. Dashboard → **Alerts** (Barre latérale)
2. Activer **Gift Alert**
3. Sélectionner un son (facultatif)
4. Cliquer sur **Test Alert**

**Configurer les Objectifs :**
1. Dashboard → **Goals** (Barre latérale)
2. Configurer **Goal 1** (p. ex., "1000 J'aime")
3. Type : **Likes**
4. Objectif : **1000**
5. Cliquer sur **Save**

#### 2. Ajouter des Overlays OBS

**Overlay Principal :**
```
Browser Source → URL: http://localhost:3000/overlay
Largeur: 1920
Hauteur: 1080
```

**Overlay d'Objectif :**
```
Browser Source → URL: http://localhost:3000/goals/goal1
Largeur: 600
Hauteur: 100
```

**Overlay de Leaderboard :**
```
Browser Source → URL: http://localhost:3000/leaderboard/overlay
Largeur: 400
Hauteur: 600
```

#### 3. Démarrer la Diffusion

1. **Démarrer OBS** - Les overlays devraient être visibles
2. **Démarrer TikTok LIVE** - Sur votre téléphone
3. **Connecter LTTH** - Dashboard → Connect
4. **Démarrer la diffusion !** 🎉

---

### 🔌 Activer les Plugins {#activer-les-plugins-français}

#### Plugins Recommandés pour Débutants

**1. TTS v2.0** (Auto-activé)
- Synthèse vocale pour les messages de chat
- Plus de 75 voix gratuites

**2. Live Goals** (Auto-activé)
- Barres de progression pour j'aime, pièces, abonnés
- Overlays OBS disponibles

**3. Leaderboard** (Recommandé)
```
Dashboard → Plugins → Leaderboard → Enable
```
- Affiche les meilleurs donateurs
- Mises à jour en temps réel

**4. Spotlight** (Recommandé)
```
Dashboard → Plugins → Spotlight → Enable
```
- Affiche le dernier abonné, donateur, etc.
- Overlay pour chaque type d'événement

**5. Soundboard** (Facultatif)
```
Dashboard → Plugins → Soundboard → Enable
```
- Sons spécifiques aux cadeaux
- Intégration MyInstants

#### Activer un Plugin

1. Dashboard → **Plugins** (Barre latérale)
2. Trouver le plugin dans la liste
3. Cliquer sur le bouton **Enable**
4. Configurer le plugin (si UI disponible)

Voir **[Liste des Plugins](./Plugin-Liste.md#français)** pour tous les 35 Plugins disponibles.

---

### 🎨 Configuration OBS {#configuration-obs-français}

#### Installer OBS Studio

1. Télécharger : [obsproject.com](https://obsproject.com/)
2. Version **29.0 ou supérieure** recommandée
3. Effectuer l'installation standard

#### Activer OBS WebSocket (pour plugin Multi-Cam)

1. OBS → **Tools** → **WebSocket Server Settings**
2. Activer **"Enable WebSocket server"**
3. Port : **4455** (par défaut)
4. Définir un mot de passe (facultatif)
5. Cliquer sur **OK**

**Dans LTTH :**
```
Dashboard → Plugins → Multi-Cam Switcher → Configure
OBS WebSocket:
  Host: localhost
  Port: 4455
  Password: (votre mot de passe)
→ Connect
```

---

### 💡 Premiers Pas Courants {#premiers-pas-courants-français}

#### Faire Lire les Messages du Chat

**Automatiquement :**
```
Dashboard → TTS → Activer Auto-TTS for Chat
```

**Liste Noire (ne pas lire certains mots) :**
```
Dashboard → TTS → Blacklist
→ Ajouter des mots (p. ex., "spam", "mot interdit")
```

#### Connecter des Cadeaux avec des Sons

```
Dashboard → Plugins → Soundboard → Enable
→ Configure
→ Gift Mappings
→ Rose → Sélectionner un son
→ Save
```

#### Changer de Caméra par Chat

```
Dashboard → Plugins → Multi-Cam Switcher → Enable
→ Configure
→ Connecter OBS
→ Activer les commandes de chat

Dans le chat: !cam 1 (ou !cam 2, !cam 3, etc.)
```

---

### 🎓 Prochaines Étapes {#prochaines-étapes-français}

#### Explorer les Fonctionnalités Avancées

**1. Système de Flows (Automatisation d'Événements) :**
```
Dashboard → Flows → Créer un nouveau flow
Exemple:
  Déclencheur: Cadeau = "Rose"
  Actions:
    1. TTS: "Merci {username} pour la Rose !"
    2. OBS: Changer de scène vers "Cam2"
    3. OSC: Geste de salut dans VRChat
```

**2. Activer les Plugins WebGPU :**
- **WebGPU Emoji Rain** - Effet emoji accéléré par GPU

**3. Système XP des Spectateurs :**
```
Dashboard → Plugins → Viewer XP System → Enable
→ Configurer les récompenses XP
→ Ajouter un overlay de leaderboard
```

#### Lire la Documentation

- **[Liste des Plugins](./Plugin-Liste.md#français)** - tous les 35 Plugins en détail
- **[Configuration](./Konfiguration.md#français)** - Paramètres avancés
- **[FAQ & Troubleshooting](./FAQ-&-Troubleshooting.md#français)** - Résoudre les problèmes courants

---

### 🎉 Bonne Chance avec Votre Diffusion !

Vous êtes maintenant prêt pour votre première diffusion professionnelle TikTok LIVE avec Little TikTool Helper !

**Conseils pour Débuter :**
- Testez tout **avant** votre première diffusion en direct
- Utilisez **Test Alerts** et **Test TTS**
- Commencez avec peu de plugins et développez progressivement
- Lisez **[FAQ & Troubleshooting](./FAQ-&-Troubleshooting.md#français)** si vous avez des problèmes

---

[← Home](Home#français) | [→ Installation & Setup](Installation-&-Setup#français)

---

*Dernière mise à jour : 2025-12-11*
*Version : 1.2.1*
