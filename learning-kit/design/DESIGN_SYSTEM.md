# Design System — Learning Kit

## Identité visuelle

- **Palette :** fond `#0f172a` (slate foncé), accent `#f97316` (orange), texte `#f8fafc`
- **Font :** Inter (400/500/600/800) via Google Fonts
- **Style :** Glassmorphism — `backdrop-filter: blur`, bordures semi-transparentes, reflets intérieurs
- **Effets :** blob orange en arrière-plan, halo curseur qui suit la souris, animation water-ripple sur les puces h3, animation bulb-pulse sur les icônes d'indication

## Variables CSS disponibles (tokens.css)

```css
--bg-color        /* Fond principal : #262624 */
--glass-bg        /* Fond des panneaux verre : rgba(48,48,46,0.55) */
--glass-border    /* Bordure des panneaux verre : rgba(255,255,255,0.12) */
--accent          /* Terracotta : #d67556 */
--accent-dark     /* Terracotta foncé : #c4643f */
--accent-glow     /* Halo terracotta : rgba(214,117,86,0.4) */
--text-primary    /* Blanc cassé : #f5f3f0 */
--text-secondary  /* Gris moyen : #9e9a94 */
--text-muted      /* Gris clair : #c4c0ba */
--text-body       /* Corps de texte : #dedad5 */
--radius-sm / --radius-md / --radius-lg  /* 8px / 14px / 24px */
--spacing-xs / --spacing-sm / --spacing-md / --spacing-lg
```

## Composants universels (base.css)

### Titres — hiérarchie

```html
<h2>Titre principal de section</h2>
<!-- → 2.6rem, weight 800, blanc, barre orange pleine largeur 60% en dessous -->

<h3>Sous-partie</h3>
<!-- → 1.6rem, weight 700, blanc ; séparateur horizontal fin au-dessus + point orange animé (water-ripple) -->

<h4>Sous-sujet dans une sous-partie</h4>
<!-- → 1.3rem, weight 700, blanc, bordure gauche orange (3px) -->
```

**Règles impératives :**
- Ne jamais préfixer les titres avec A., B., 1., 2. — la hiérarchie visuelle suffit
- Ne pas sauter de niveau (h4 toujours enfant d'un h3)
- Pas de h5 ou au-delà

### Texte et inline
```html
<p>Paragraphe normal</p>
<strong>Texte important (blanc)</strong>
<em>Accent orange en italique</em>
<code>SELECT * FROM table</code>  <!-- fond orange transparent, texte ambre -->
```

### Comparaisons (components.css — compte-rendu)
```html
<div class="compare-grid">
    <div class="compare-item good" data-label="Idéal pour">
        <p>Contenu...</p>
    </div>
    <div class="compare-item bad" data-label="Limite">
        <p>Contenu...</p>
    </div>
    <div class="compare-item neutral" data-label="Cas d'usage">
        <p>Contenu...</p>
    </div>
</div>
<!-- → grille responsive, header badge coloré automatique via data-label -->
<!-- → good = vert, bad = rouge, neutral = gris -->
```

### Tableaux
```html
<table>
    <thead><tr><th>Col A</th><th>Col B</th></tr></thead>
    <tbody>
        <tr><td>Valeur</td><td>Valeur</td></tr>
    </tbody>
</table>
<!-- → header sombre, lignes alternées avec légère teinte orange -->
```

## Règles ABSOLUES pour le LLM

1. **Ne JAMAIS créer de nouvelles classes CSS** — utiliser uniquement les classes documentées ici et dans le PROMPT.md du template
2. **Ne JAMAIS modifier de fichiers CSS** — ni base.css, ni tokens.css, ni layout.css, ni components.css
3. **Ne JAMAIS modifier index.html** — ni la sidebar, ni la navigation, ni le shell
4. **Ne JAMAIS ajouter de styles inline** sauf les surcharges couleur déjà gérées par base.css
5. **Toujours commencer par `<link rel="stylesheet" href="./components.css">`** dans chaque section
6. **Le LLM génère UNIQUEMENT** des fichiers `section-*.html` ou le contenu d'`index.html` pour la présentation

## Comportement attendu par type

Voir `templates/<type>/PROMPT.md` pour les composants spécifiques à chaque template.

## Bibliothèque SVG (diagrammes)

Voir `svg/CATALOG.md` pour les conventions et l'index des catégories.

Le LLM doit :
1. Lire `svg/CATALOG.md` pour comprendre les conventions (viewBox, palette, style)
2. Charger `svg/arrows.md` (ou autre catégorie) pour les snippets
3. Copier le snippet SVG directement inline dans le `section-*.html`

Ne jamais créer de nouveaux styles SVG — utiliser uniquement les éléments documentés dans ce catalogue.
