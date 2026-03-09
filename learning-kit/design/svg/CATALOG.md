# SVG Elements Catalog — Learning Kit

Bibliothèque de référence SVG pour la génération de diagrammes, schémas et graphes dans les `section-*.html`.

## Comment utiliser ce catalogue

1. Lire ce fichier pour comprendre les conventions
2. Charger le fichier de la catégorie souhaitée (ex: `arrows.md`)
3. Copier le snippet SVG inline directement dans le HTML

## Conventions globales

### ViewBox

| Usage | ViewBox | Dimensions HTML |
|---|---|---|
| Icône inline (entre texte, dans une liste) | `0 0 24 24` | `width="24" height="24"` |
| Connecteur horizontal (entre blocs) | `0 0 200 40` | `width="200" height="40"` |
| Connecteur vertical (entre blocs) | `0 0 40 200` | `width="40" height="200"` |

### Palette

| Rôle | Valeur | Usage |
|---|---|---|
| Accent principal | `#d67556` | Flèches principales, éléments actifs |
| Muted | `#9e9a94` | Flèches secondaires, éléments passifs |
| Fond transparent | `none` | Toujours pour `fill` sur les corps |

### Style de trait

```
stroke-linecap="round"
stroke-linejoin="round"
stroke-width="2"       ← icônes 24×24 et connecteurs 200×40
stroke-width="2.5"     ← diagrammes standalone (viewBox > 200)
```

### Anatomie d'une flèche

- **Racine** : `<svg fill="none" xmlns="http://www.w3.org/2000/svg">` — toujours `fill="none"` et `xmlns` sur la racine
- **Corps** : `<line>` ou `<path>` avec `fill="none"` et `stroke="#d67556"`
- **Tête** : `<polygon>` avec `fill="#d67556"` et `stroke="none"` (triangle plein)

### Intégration HTML

```html
<!-- Icône inline dans du texte -->
<span style="display:inline-flex; align-items:center; vertical-align:middle;">
  <svg>...</svg>
</span>

<!-- Connecteur entre deux blocs glassmorphisme -->
<div style="display:flex; justify-content:center; margin: 0.5rem 0;">
  <svg>...</svg>
</div>
```

## Index des catégories

| Fichier | Contenu |
|---|---|
| `arrows.md` | Flèches : droite, gauche, haut, bas, courbe, double-tête, bidirectionnel |
| `lines.md` | Traits : horizontal/vertical thin/regular/thick, pointillés, tiretés, animés (flux) |
| `braces.md` | Accolades courbes : brace-top, brace-bottom, brace-left, brace-right, tailles variables |
| `nodes.md`    | Nœuds : terminal (pill), process (rect), decision (losange), io (parallélogramme), dot |
| `callouts.md` | Bulles d'annotation : right, left, top, bottom + bracket-label vertical/horizontal |
| `arch.md`     | Architecture : client, server, database (cylindre), cloud, microservice (hex), queue |
| `charts.md`   | Graphiques : bar-h, bar-v, donut (stroke-dasharray), line chart, sparkline |
