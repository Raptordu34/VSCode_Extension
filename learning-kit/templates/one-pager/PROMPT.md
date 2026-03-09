# Prompt — Template One Pager

## Contexte
Tu génères le contenu HTML d'un document synthétique sur une seule page, sans sidebar.
Lis d'abord : `../../design/DESIGN_SYSTEM.md`
Référence obligatoire : `section-EXAMPLE.html` (dans ce dossier)

## Structure attendue (contenu à insérer après `.page-header` dans index.html)

```html
<h2>Sujet Principal</h2>

<div class="section-block">
    <h3>Section</h3>
    <p>Contenu...</p>
    <div class="key-point">Point essentiel à retenir.</div>
</div>
```

## Composants disponibles (components.css)

- `.section-block` — bloc glassmorphism pour regrouper une thématique
- `.key-point` — point clé avec bordure gauche orange

## Règles
- Le contenu va directement dans `index.html`, après `.page-header`
- Structure courte : 2-4 `section-block` maximum
- Chaque section-block = une idée principale
