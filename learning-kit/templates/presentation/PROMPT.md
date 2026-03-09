# Prompt — Template Présentation (Slides)

## Contexte
Tu génères des slides HTML à insérer dans le `slides-container` de `index.html`.
Lis d'abord : `../../design/DESIGN_SYSTEM.md`
Référence obligatoire : `section-EXAMPLE.html` (dans ce dossier)

## IMPORTANT : différence avec les autres templates
Pour la présentation, tu ne génères PAS un fichier section séparé.
Tu génères le contenu HTML à insérer directement dans le `<div class="slides-container">` de `index.html`.

## Structure d'une slide

```html
<div class="slide">
    <div class="slide-content">
        <h2>Titre de la slide</h2>
        <div class="slide-body">
            <p>Contenu...</p>
            <ul class="bullet-list">
                <li>Point clé</li>
            </ul>
        </div>
        <span class="slide-number">N</span>
    </div>
</div>
```

## Slide de titre (première slide)

```html
<div class="slide active">
    <div class="slide-content">
        <p class="slide-title">Titre de la Présentation</p>
        <p class="slide-subtitle">Sous-titre — Auteur — Date</p>
    </div>
</div>
```

## Composants disponibles (components.css)

- `.slide-title` — grand titre de slide de couverture
- `.slide-subtitle` — sous-titre de la slide de couverture
- `.slide-body` — corps de contenu d'une slide
- `.bullet-list` — liste avec puces orange
- `.slide-number` — numéro en bas à droite

## Règles
- Première slide : `class="slide active"`, les autres : `class="slide"`
- Limiter le contenu : 4-6 bullets ou 2-3 paragraphes par slide
- Pas de tableaux complexes dans les slides (trop dense)
