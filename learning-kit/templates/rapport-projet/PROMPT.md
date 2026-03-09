# Prompt — Template Rapport de Projet

## Contexte
Tu génères des sections HTML pour un rapport de projet formel.
Lis d'abord : `../../design/DESIGN_SYSTEM.md`
Référence obligatoire : `section-EXAMPLE.html` (dans ce dossier)

## Structure type d'un rapport (sections suggérées)
1. Introduction
2. Contexte & État de l'art
3. Méthodologie
4. Résultats & Analyse
5. Conclusion & Perspectives

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

- `.callout` — point important ou hypothèse, fond orange discret
- `.callout-info` — information contextuelle, fond bleu discret
- `.result-box` — résultat principal mis en valeur
- `.figure-caption` — légende de figure, centré en italique

## Règles
- Chaque section = un fichier `section-*.html`
- `.result-box` uniquement dans la section Résultats
- `.figure-caption` après chaque image ou diagramme
- Ton formel, pas de `.hint` ni de `.question` (ce sont des composants TD)
