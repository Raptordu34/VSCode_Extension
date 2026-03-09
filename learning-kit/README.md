# Learning Kit

Système de templates pédagogiques HTML/CSS glassmorphism pour la prise de notes universitaires.

## Setup (nouvelle machine)

```bash
git clone <url-du-repo-prive> learning-kit
```

## Créer un nouveau document

Depuis le dossier où tu veux créer le document (ex: `C:\Users\bapti\Documents\A3\`) :

**Windows (PowerShell ou Git Bash) :**
```bash
bash /c/Users/bapti/Documents/Projects/Business/learning-kit-global/learning-kit/scripts/new-doc.sh <type> "<Titre>"
```

**macOS / Linux :**
```bash
~/learning-kit/scripts/new-doc.sh <type> "<Titre>"
```

> Le document est créé dans le dossier courant, pas dans le kit.

**Types disponibles :**

| Type | Layout | Usage |
|---|---|---|
| `compte-rendu` | sidebar + sections | Notes de cours structurées |
| `td-exercice` | sidebar + sections | Exercices Q&A avec solutions |
| `synthese-article` | sidebar + sections | Résumé d'article scientifique |
| `rapport-projet` | sidebar + sections | Rapport formel |
| `presentation` | slides plein écran | Diaporama |
| `one-pager` | scroll vertical | Synthèse d'un sujet |
| `fiche-revision` | scroll vertical | Fiche de révision |
| `cheat-sheet` | scroll vertical | Référence technique rapide |
| `comparatif` | scroll vertical | Tableau comparatif |

## Workflow avec un LLM

Après `new-doc.sh`, ouvrir le dossier créé avec Claude Code. Le `CLAUDE.md` local est **automatiquement lu**. Pour Gemini CLI ou Copilot, donner ce fichier en contexte manuellement.

Ensuite, coller directement le contenu brut (notes, slides, PDF) — le LLM sait quoi faire :
- Il découpe en sections thématiques
- Il génère les fichiers `section-*.html`
- Il fournit les boutons nav à coller dans `index.html`

## Modifier le design global

| Ce que tu veux changer | Fichier à modifier |
|---|---|
| Couleurs, fonts, espacements | `design/tokens.css` |
| Typographie universelle (h2, h3...) | `design/base.css` |
| Shell sidebar (glassmorphism, nav) | `layouts/sidebar-iframe.css` |
| Shell slides | `layouts/slides.css` |
| Shell scroll | `layouts/single-scroll.css` |
| Composants d'un template spécifique | `templates/<type>/components.css` |

## Architecture

```
design/          → tokens.css (variables) + base.css (typo universelle)
layouts/         → 3 shells réutilisables
templates/       → 9 types de documents
scripts/         → new-doc.sh (bootstrap)
CLAUDE.md        → instructions pour Claude Code
GEMINI.md        → instructions pour Gemini CLI
.github/         → instructions pour GitHub Copilot
```
