# Prompt — Template TD / Exercice

## Contexte
Tu génères une section HTML pour un exercice avec questions et solutions. Ce template est conçu pour une **pédagogie interactive** : l'étudiant est incité à réfléchir avant de voir la solution.
Lis d'abord : `../../design/DESIGN_SYSTEM.md`
Référence obligatoire : `section-EXAMPLE.html` (dans ce dossier)

## Composants Spécifiques (components.css)

### 1. Contexte de l'exercice (`.exercice-context`)
Utilisé au début pour poser le cadre, les hypothèses ou fournir un jeu de données.
```html
<div class="exercice-context">
    <h3 style="margin-top: 0;">Contexte</h3>
    <p>Énoncé global ou prérequis avant de commencer les questions.</p>
</div>
```

### 2. Question avec Badges (`.question`)
Bloc contenant la question. Ajoute toujours un badge de difficulté à côté du titre.
```html
<div class="question">
    <h3 style="margin-top: 0;">Question 1 <span class="badge badge-green" style="margin-left: 10px;">Facile</span></h3>
    <p>Énoncé spécifique de la question.</p>
</div>
```
*Badges disponibles :* `.badge-green` (Facile), `.badge-orange` (Intermédiaire), `.badge-red` (Difficile).

### 3. Indices Progressifs (`.hint-box`)
Bloc optionnel pour guider l'étudiant. Il est replié par défaut et s'ouvre au clic (géré par JS).
```html
<div class="hint-box">
    <div class="hint-header"></div>
    <div class="hint-content">
        Indice pour aider à résoudre la question.
    </div>
</div>
```

### 4. Solution Masquée (`.solution.hidden`)
La solution DOIT toujours avoir la classe `hidden`. Elle sera floutée par défaut et l'étudiant devra cliquer sur un bouton pour la révéler.
```html
<div class="solution hidden">
    <h3 style="margin-top: 0;">Solution</h3>
    <p>Explication et réponse attendue.</p>
    <pre><code>...</code></pre>
</div>
```

## Composants Riches (Hérités)
Tu as accès à tous les composants visuels riches :
- **Bloc de code** : `<pre><code>...</code></pre>` (bouton copier auto-ajouté).
- **Terminal** : `<div class="terminal"><code><span class="prompt">$</span> commande...</code></div>`
- **Callouts** : `.callout-info`, `.callout-warning`, `.callout-danger`.
- **Formules** : Support de KaTeX avec `$math$` et `$$math$$`.
- **Tableaux** : `<div class="table-glass"><table>...</table></div>`.

## Structure HTML Attendue (Squelette)

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="./components.css">
    <!-- Inclusion KaTeX si formules -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.min.css" crossorigin="anonymous">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.min.js" crossorigin="anonymous"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/contrib/auto-render.min.js" crossorigin="anonymous"></script>
    <script>
        document.addEventListener("DOMContentLoaded", () => {
            renderMathInElement(document.body, { delimiters: [ { left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false } ], throwOnError: false });
        });
    </script>
    <script src="./section-utils.js" defer></script>
</head>
<body>

    <h2>Exercice N : Titre</h2>

    <div class="exercice-context">
        <h3 style="margin-top: 0;">Contexte</h3>
        <p>...</p>
    </div>

    <!-- Répéter ce bloc Question -> Hint (opt) -> Solution pour chaque question -->
    <div class="question">...</div>
    <div class="hint-box">...</div>
    <div class="solution hidden">...</div>

</body>
</html>
```

## Règles strictes
1. N'oublie jamais d'importer `section-utils.js` (pour gérer les clics sur les solutions et indices).
2. N'oublie jamais la classe `.hidden` sur `.solution`.
3. Chaque question commence par un `<h3>` avec `margin-top: 0;`.
