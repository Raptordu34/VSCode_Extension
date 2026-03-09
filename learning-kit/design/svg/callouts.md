# Callouts — SVG Elements

> Conventions : voir `CATALOG.md`

Bulles d'annotation avec queue directionnelle. Construites avec un `<rect>` + `<polygon>` pour la queue,
et une `<line>` de la même couleur que le fill pour masquer la jonction.

---

## callout-right

Queue pointant à droite — annote un élément à droite de la bulle. ViewBox 144×40.

```html
<svg width="144" height="40" viewBox="0 0 144 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="38" rx="8"
    fill="rgba(214,117,86,0.1)" stroke="#d67556" stroke-width="1.5"/>
  <polygon points="119,14 141,20 119,26"
    fill="rgba(214,117,86,0.1)" stroke="#d67556" stroke-width="1.5" stroke-linejoin="round"/>
  <line x1="119" y1="15" x2="119" y2="25" stroke="rgba(214,117,86,0.1)" stroke-width="2.5"/>
  <!-- texte -->
  <text x="60" y="24" text-anchor="middle"
    font-family="'Inter',system-ui,sans-serif" font-size="10" fill="#dedad5">
    annotation
  </text>
</svg>
```

---

## callout-left

Queue pointant à gauche — annote un élément à gauche de la bulle. ViewBox 144×40.

```html
<svg width="144" height="40" viewBox="0 0 144 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="25" y="1" width="118" height="38" rx="8"
    fill="rgba(214,117,86,0.1)" stroke="#d67556" stroke-width="1.5"/>
  <polygon points="25,14 3,20 25,26"
    fill="rgba(214,117,86,0.1)" stroke="#d67556" stroke-width="1.5" stroke-linejoin="round"/>
  <line x1="25" y1="15" x2="25" y2="25" stroke="rgba(214,117,86,0.1)" stroke-width="2.5"/>
  <text x="84" y="24" text-anchor="middle"
    font-family="'Inter',system-ui,sans-serif" font-size="10" fill="#dedad5">
    annotation
  </text>
</svg>
```

---

## callout-bottom

Queue pointant vers le bas — annote un élément en dessous. ViewBox 130×58.

```html
<svg width="130" height="58" viewBox="0 0 130 58" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="128" height="36" rx="8"
    fill="rgba(214,117,86,0.1)" stroke="#d67556" stroke-width="1.5"/>
  <polygon points="57,37 65,56 73,37"
    fill="rgba(214,117,86,0.1)" stroke="#d67556" stroke-width="1.5" stroke-linejoin="round"/>
  <line x1="58" y1="37" x2="72" y2="37" stroke="rgba(214,117,86,0.1)" stroke-width="2.5"/>
  <text x="65" y="23" text-anchor="middle"
    font-family="'Inter',system-ui,sans-serif" font-size="10" fill="#dedad5">
    annotation
  </text>
</svg>
```

---

## callout-top

Queue pointant vers le haut — annote un élément au-dessus. ViewBox 130×58.

```html
<svg width="130" height="58" viewBox="0 0 130 58" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="21" width="128" height="36" rx="8"
    fill="rgba(214,117,86,0.1)" stroke="#d67556" stroke-width="1.5"/>
  <polygon points="57,21 65,2 73,21"
    fill="rgba(214,117,86,0.1)" stroke="#d67556" stroke-width="1.5" stroke-linejoin="round"/>
  <line x1="58" y1="21" x2="72" y2="21" stroke="rgba(214,117,86,0.1)" stroke-width="2.5"/>
  <text x="65" y="43" text-anchor="middle"
    font-family="'Inter',system-ui,sans-serif" font-size="10" fill="#dedad5">
    annotation
  </text>
</svg>
```

---

## bracket-right ]

Crochet vertical droit — délimite une zone de code ou de texte à annoter à droite. ViewBox 16×80.

```html
<svg width="16" height="80" viewBox="0 0 16 80" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="10" y1="2"  x2="10" y2="78" stroke="#d67556" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="10" y1="2"  x2="3"  y2="2"  stroke="#d67556" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="10" y1="78" x2="3"  y2="78" stroke="#d67556" stroke-width="1.5" stroke-linecap="round"/>
</svg>
```

> Adapter `height` et `y2` selon la hauteur de la zone à délimiter.

---

## bracket-left [

Crochet vertical gauche. ViewBox 16×80.

```html
<svg width="16" height="80" viewBox="0 0 16 80" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="6" y1="2"  x2="6"  y2="78" stroke="#d67556" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="6" y1="2"  x2="13" y2="2"  stroke="#d67556" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="6" y1="78" x2="13" y2="78" stroke="#d67556" stroke-width="1.5" stroke-linecap="round"/>
</svg>
```

---

## Couleurs disponibles

Remplacer `#d67556` / `rgba(214,117,86,0.1)` par :

| Rôle | Stroke | Fill |
|---|---|---|
| Terracotta (général) | `#d67556` | `rgba(214,117,86,0.1)` |
| Teal (scientifique) | `#5ba6a0` | `rgba(91,166,160,0.1)` |
| Muted (neutre) | `9e9a94` | `rgba(158,154,148,0.08)` |
| White (overlay) | `rgba(255,255,255,0.2)` | `rgba(255,255,255,0.07)` |
