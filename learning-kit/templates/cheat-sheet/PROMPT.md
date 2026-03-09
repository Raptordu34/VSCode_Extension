# Prompt — Template Cheat Sheet

## Contexte
Tu génères une référence technique rapide avec des grilles de cartes.
Lis d'abord : `../../design/DESIGN_SYSTEM.md`
Référence obligatoire : `section-EXAMPLE.html` (dans ce dossier)

## Structure attendue (contenu à insérer dans index.html)

```html
<h2>Technologie — Référence Rapide</h2>

<p class="section-label">Catégorie</p>
<div class="ref-grid">
    <div class="ref-card">
        <h4>Nom de la commande</h4>
        <code>syntaxe exacte</code>
        <p>Description courte.</p>
    </div>
</div>
```

## Composants disponibles (components.css)

- `.section-label` — étiquette de catégorie en orange uppercase
- `.ref-grid` — grille auto-responsive de cartes
- `.ref-card` — carte de référence glassmorphism
- `.ref-card h4` — titre de la commande en orange
- `.ref-card code` — affichage en bloc (display: block)

## Règles
- Contenu va dans index.html après .page-header
- Chaque `.ref-card` = une commande ou un concept
- Utiliser `<code>` pour la syntaxe exacte
- `<p>` pour une courte description
- Grouper par `.section-label` + `.ref-grid`
