# Prompt — Template TD / Exercice

## Contexte
Tu génères une section HTML pour un exercice avec questions et solutions.
Lis d'abord : `../../design/DESIGN_SYSTEM.md`
Référence obligatoire : `section-EXAMPLE.html` (dans ce dossier)

## Structure attendue

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="./components.css">
</head>
<body>

    <h2>Exercice N : Titre</h2>

    <div class="question">
        <h3 style="margin-top:0;">Question N</h3>
        <p>Énoncé...</p>
    </div>

    <div class="hint">Indice optionnel...</div>

    <div class="solution">
        <h3 style="margin-top:0;">Solution</h3>
        <p>Réponse...</p>
    </div>

</body>
</html>
```

## Composants disponibles (components.css)

- `.question` — bloc énoncé, fond glassmorphism, indicateur `?` à droite, bordure orange gauche
- `.solution` — bloc réponse, fond orange, icône 💡 animée à droite, bordure orange gauche
- `.hint` — indice optionnel, style discret en italique

## Règles
- Pas de `<body class="mode-detailed">` (pas de mode compact pour les exercices)
- Toujours mettre `.question` avant `.solution`
- `.hint` est optionnel, à placer entre `.question` et `.solution`
- `<h3 style="margin-top:0;">` dans les blocs question/solution pour supprimer la marge haute
