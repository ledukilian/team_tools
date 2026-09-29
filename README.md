# 🛠️ Boîte à outils d'équipe

Application statique, sans serveur, pour suivre une équipe : les **compétences**, le **climat de travail** et les **estimations**.

Tout se passe dans le navigateur. Les données restent sur votre ordinateur.

## 🧰 Outils

La matrice et la météo partagent les **équipes**, les **membres** et les **périodes**, gérés depuis la page d'accueil. Les estimations CURSE sont dans le même fichier.

| | Outil | Version | À quoi ça sert |
|---|---|---|---|
| 🕸️ | [Matrice de compétences](skill-matrix.html) | `0.2.0` | Notes de 1 à 10, radar et profils pour une période. Le suivi trace ces notes dans le temps, personne par personne, puis en moyenne d'équipe. |
| 🌦️ | [Météo d'équipe](weather.html) | `0.2.1` | Travail et charge, moral et énergie (0 à 5), score d'équipe, alertes individuelles et suivi dans le temps |
| 📡 | [Estimation CURSE](estimation.html) | `0.1.0` | Cinq axes notés de 1 à 5, un radar et des points. Une feature additionne ses user stories. |

## ▶️ Utilisation

1. Ouvrir [`index.html`](index.html) dans un navigateur. **Aucune installation.**
2. Les graphiques chargent Chart.js depuis un CDN. Il faut une connexion internet pour les voir.
3. Depuis le panneau **📁 Mes données** :
   - créer les équipes, les membres et les périodes ;
   - **exporter** ou **importer** un fichier JSON.

## 🔐 Données

Le fichier est enregistré dans le `localStorage` du navigateur (`lead-tools-store-v1`). L'export JSON contient les équipes, la météo, la matrice et les estimations. Rien n'est envoyé à un serveur.

> ⚠️ L'export JSON contient aussi le **host** et le **token** Jira, s'ils ont été renseignés. À traiter comme un secret.
