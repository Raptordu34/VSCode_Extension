# Learning Kit — Instructions pour Claude Code

Tu travailles dans le repo `learning-kit`, un système de templates pédagogiques HTML/CSS glassmorphism.

## Design system
Lis `design/DESIGN_SYSTEM.md` avant toute génération de contenu.

## Créer un nouveau document
```bash
./scripts/new-doc.sh <type> "<Titre>"
```
Types disponibles : `compte-rendu` | `td-exercice` | `presentation` | `one-pager` | `fiche-revision` | `cheat-sheet` | `synthese-article` | `rapport-projet` | `comparatif`

## Règle principale
Tu génères UNIQUEMENT des fichiers `section-*.html`.
Tu ne touches JAMAIS : `index.html`, `*.css`, `scripts/`, `layouts/`, `design/`.

## Pour chaque génération de section
1. Identifier le type de document (dossier `templates/`)
2. Lire `templates/<TYPE>/PROMPT.md`
3. Lire `templates/<TYPE>/section-EXAMPLE.html`
4. Générer la section selon la spec
5. Nommer le fichier `section-<sujet>.html`
