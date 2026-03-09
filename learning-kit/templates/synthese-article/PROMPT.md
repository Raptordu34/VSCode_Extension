# Prompt — Template Synthèse d'Article

## Contexte
Tu génères des sections HTML pour la synthèse structurée d'un article scientifique.
Lis d'abord : `../../design/DESIGN_SYSTEM.md`
Référence obligatoire : `section-EXAMPLE.html` (dans ce dossier)

## Structure type d'une synthèse (sections suggérées)
1. Introduction & Contexte (avec `.article-meta`)
2. Méthodologie
3. Résultats
4. Discussion & Critique
5. Conclusion

## Structure d'une section

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="./components.css">
</head>
<body>
    <h2>Titre de la section</h2>
    <h3>Sous-partie</h3>
    <p>Contenu...</p>
</body>
</html>
```

## Composants disponibles (components.css)

- `.article-meta` — grille de métadonnées (auteurs, année, revue, domaine)
- `.highlight-box` — contribution principale, bordure orange gauche
- `.contribution` — points forts, bordure verte
- `.critique` — limites/critiques, bordure rouge

## Règles
- `.article-meta` uniquement dans la première section (Introduction)
- `.contribution` et `.critique` pour la section Discussion
- Chaque section = un fichier `section-*.html`
