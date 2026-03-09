# Charts — SVG Templates

> Conventions : voir `CATALOG.md`

Graphiques statiques SVG à données fixes. Adapter les coordonnées et valeurs numériques selon le contenu.
Pas de JavaScript — tout est calculé manuellement ou via un script de génération.

---

## chart-bar-h — Barres horizontales

Idéal pour un comparatif de catégories (langages, frameworks, scores…).

**Calcul des largeurs :** `barWidth = (valeur / 100) × maxWidth`
Avec `maxWidth = 230` (zone de tracé de 80 à 310 en x).

```html
<svg width="320" height="180" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg"
     style="font-family:'Inter',system-ui,sans-serif;">
  <!-- Axe Y -->
  <line x1="80" y1="10" x2="80" y2="155" stroke="#9e9a94" stroke-width="1" opacity="0.4" stroke-linecap="round"/>
  <!-- Axe X -->
  <line x1="80" y1="155" x2="310" y2="155" stroke="#9e9a94" stroke-width="1" opacity="0.4" stroke-linecap="round"/>

  <!-- Barre : valeur 85% → width = 85*230/100 = 196 -->
  <rect x="80" y="18" width="196" height="18" rx="3" fill="rgba(214,117,86,0.8)"/>
  <text x="75" y="31" text-anchor="end" font-size="9" fill="#9e9a94">Label A</text>
  <text x="282" y="31" font-size="9" fill="#d67556" font-weight="500">85%</text>

  <!-- Barre suivante (décaler y de 28px) -->
  <rect x="80" y="46" width="165" height="18" rx="3" fill="rgba(214,117,86,0.6)"/>
  <text x="75" y="59" text-anchor="end" font-size="9" fill="#9e9a94">Label B</text>
  <text x="251" y="59" font-size="9" fill="#d67556" font-weight="500">72%</text>
</svg>
```

> Espacement : `y = 18 + (index × 28)` pour chaque barre. Hauteur de barre = 18px.

---

## chart-bar-v — Barres verticales

Évolution temporelle (trimestres, mois, années).

**Calcul des hauteurs :** `barHeight = (valeur / 100) × 128` — hauteur max = 128px
`y = 148 - barHeight` (l'axe X est à y=148).

```html
<svg width="280" height="180" viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg"
     style="font-family:'Inter',system-ui,sans-serif;">
  <!-- Axe X -->
  <line x1="30" y1="148" x2="270" y2="148" stroke="#9e9a94" stroke-width="1" opacity="0.4" stroke-linecap="round"/>

  <!-- Barre : valeur 78% → height=100, y=48 -->
  <rect x="90" y="48" width="28" height="100" rx="3" fill="rgba(214,117,86,0.7)"/>
  <text x="104" y="161" text-anchor="middle" font-size="8" fill="#9e9a94">Q2</text>
  <text x="104" y="43"  text-anchor="middle" font-size="8" fill="#d67556">78%</text>
</svg>
```

> Espacement : `x = 42 + (index × 48)` pour chaque barre. Largeur de barre = 28px.

---

## chart-donut — Camembert / Donut

Technique : `stroke-dasharray` sur un `<circle>`. Rayon `r=54`, circonférence `C = 2π×54 ≈ 339.3`.

**Calcul par segment :**
- `dash = (part% / 100) × 339.3`
- `offset = -(somme des dashes précédents)`
- Rotation globale `-90°` pour démarrer en haut.

```html
<svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(-90 100 100)">
    <!-- Segment A — 42% → dash=142.5, offset=0 -->
    <circle cx="100" cy="100" r="54" fill="none"
      stroke="#d67556" stroke-width="22" stroke-opacity="0.85"
      stroke-dasharray="142.5 339.3" stroke-dashoffset="0" stroke-linecap="butt"/>

    <!-- Segment B — 28% → dash=94.9, offset=-142.5 -->
    <circle cx="100" cy="100" r="54" fill="none"
      stroke="#5ba6a0" stroke-width="22" stroke-opacity="0.75"
      stroke-dasharray="94.9 339.3" stroke-dashoffset="-142.5" stroke-linecap="butt"/>

    <!-- Segment C — 18% → dash=61.1, offset=-237.4 -->
    <circle cx="100" cy="100" r="54" fill="none"
      stroke="#9e9a94" stroke-width="22" stroke-opacity="0.6"
      stroke-dasharray="61.1 339.3" stroke-dashoffset="-237.4" stroke-linecap="butt"/>

    <!-- Segment D — 12% → dash=40.7, offset=-298.5 -->
    <circle cx="100" cy="100" r="54" fill="none"
      stroke="rgba(255,255,255,0.25)" stroke-width="22"
      stroke-dasharray="40.7 339.3" stroke-dashoffset="-298.5" stroke-linecap="butt"/>
  </g>
  <!-- Fond central (trou du donut) -->
  <circle cx="100" cy="100" r="42" fill="#262624"/>
  <!-- Valeur centrale -->
  <text x="100" y="96" text-anchor="middle"
    font-family="'Inter',system-ui,sans-serif" font-size="18" font-weight="700" fill="#d67556">42%</text>
  <text x="100" y="110" text-anchor="middle"
    font-family="'Inter',system-ui,sans-serif" font-size="8" fill="#9e9a94">principal</text>
</svg>
```

> Adapter `fill="#262624"` à la couleur de fond réelle de la page.

---

## chart-line — Courbe avec axes

Utilise `<path>` avec commandes `C` (cubic bezier) pour des courbes lisses.
Ajouter un `<linearGradient>` pour l'aire sous la courbe.

```html
<svg width="320" height="180" viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad-line" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d67556" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#d67556" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <!-- Axes -->
  <line x1="40" y1="15"  x2="40"  y2="148" stroke="#9e9a94" stroke-width="1" opacity="0.4" stroke-linecap="round"/>
  <line x1="40" y1="148" x2="310" y2="148" stroke="#9e9a94" stroke-width="1" opacity="0.4" stroke-linecap="round"/>
  <!-- Aire -->
  <path d="M 63 108 C 109 80, 155 52, 201 42 C 247 32, 293 50, 293 50
           L 293 148 L 63 148 Z" fill="url(#grad-line)" opacity="0.3"/>
  <!-- Courbe -->
  <path d="M 63 108 C 109 80, 155 52, 201 42 C 247 32, 293 50, 293 50"
    stroke="#d67556" stroke-width="2" stroke-linecap="round"/>
  <!-- Points -->
  <circle cx="201" cy="42" r="3.5" fill="#d67556"/>
</svg>
```

---

## chart-sparkline — Mini courbe inline

Sans axes, sans légende. Pour tableaux, métriques, dashboards compacts.

```html
<!-- Sparkline courbe — 80×24 -->
<svg width="80" height="24" viewBox="0 0 80 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 2 18 C 12 16, 18 12, 26 10 C 34 8, 40 14, 50 8 C 58 4, 66 6, 78 4"
    stroke="#d67556" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="78" cy="4" r="2.5" fill="#d67556"/>
</svg>

<!-- Sparkline barres — 60×24 -->
<svg width="60" height="24" viewBox="0 0 60 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2"  y="14" width="5" height="8"  rx="1.5" fill="rgba(214,117,86,0.5)"/>
  <rect x="10" y="10" width="5" height="12" rx="1.5" fill="rgba(214,117,86,0.6)"/>
  <rect x="18" y="16" width="5" height="6"  rx="1.5" fill="rgba(214,117,86,0.45)"/>
  <rect x="26" y="6"  width="5" height="16" rx="1.5" fill="#d67556"/>
</svg>
```
