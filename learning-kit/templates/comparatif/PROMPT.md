# Prompt — Template Comparatif / Tableau de bord

## Contexte
Tu génères le contenu HTML d'un document comparatif entre technologies ou approches.
Lis d'abord : `../../design/DESIGN_SYSTEM.md`
Référence obligatoire : `section-EXAMPLE.html` (dans ce dossier)

## Structure attendue (contenu à insérer dans index.html)

```html
<h2>Comparatif : A vs B</h2>

<div class="comparison-grid">
    <div class="comparison-row">
        <div class="compare-card">
            <h4>Option A</h4>
            <ul><li>Caractéristique</li></ul>
        </div>
        <div class="compare-card highlight">
            <h4>Option B (recommandée)</h4>
            <ul><li>Caractéristique</li></ul>
        </div>
    </div>
</div>

<div class="verdict">Conclusion : préférer B car...</div>
```

## Composants disponibles (components.css)

- `.comparison-grid` — conteneur de toutes les lignes de comparaison
- `.comparison-row` — ligne sur 2 colonnes (grid 1fr 1fr)
- `.compare-card` — carte d'une option, fond glassmorphism
- `.compare-card.highlight` — carte mise en avant (bordure orange, glow)
- `.verdict` — conclusion/recommandation finale

## Règles
- Contenu va dans index.html après .page-header
- Toujours terminer par un `.verdict`
- `.highlight` sur la carte recommandée uniquement
- Compléter avec un `<table>` pour les critères détaillés si besoin
