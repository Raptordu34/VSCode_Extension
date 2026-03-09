# Lines — SVG Elements

> Conventions : voir `CATALOG.md`

---

## line-h · thin

Trait horizontal fin. Usage : séparateur léger, axe de graphe.

```html
<svg width="200" height="12" viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="6" x2="196" y2="6" stroke="#d67556" stroke-width="1" stroke-linecap="round"/>
</svg>
```

---

## line-h · regular

Trait horizontal standard. Usage principal — connecteur entre blocs, séparateur de section.

```html
<svg width="200" height="12" viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="6" x2="196" y2="6" stroke="#d67556" stroke-width="2" stroke-linecap="round"/>
</svg>
```

---

## line-h · thick

Trait horizontal épais. Usage : emphase forte, barre de titre de section.

```html
<svg width="200" height="12" viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="6" x2="196" y2="6" stroke="#d67556" stroke-width="3.5" stroke-linecap="round"/>
</svg>
```

---

## line-v · regular

Trait vertical standard. Usage : séparateur de colonne, axe vertical.

```html
<svg width="12" height="80" viewBox="0 0 12 80" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="6" y1="4" x2="6" y2="76" stroke="#d67556" stroke-width="2" stroke-linecap="round"/>
</svg>
```

---

## line-v · avec nœuds

Axe vertical avec points d'étape. Usage : timeline, étapes de processus.

```html
<svg width="12" height="80" viewBox="0 0 12 80" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="6" y1="4" x2="6" y2="76" stroke="#d67556" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="6" cy="4"  r="3"   fill="#d67556"/>
  <circle cx="6" cy="40" r="2.5" fill="none" stroke="#d67556" stroke-width="1.5"/>
  <circle cx="6" cy="76" r="3"   fill="#d67556"/>
</svg>
```

---

## line-dashed · dots

Points ronds. Usage : relation optionnelle, flux possible, pseudo-code.

```html
<svg width="200" height="12" viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="6" x2="196" y2="6"
    stroke="#d67556" stroke-width="2.5" stroke-linecap="round"
    stroke-dasharray="2 6"/>
</svg>
```

---

## line-dashed · short

Tirets courts. Usage : connecteur discret, dépendance implicite.

```html
<svg width="200" height="12" viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="6" x2="196" y2="6"
    stroke="#d67556" stroke-width="1.5" stroke-linecap="round"
    stroke-dasharray="6 4"/>
</svg>
```

---

## line-dashed · long

Tirets longs. Usage : relation abstraite, UML dependency.

```html
<svg width="200" height="12" viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="6" x2="196" y2="6"
    stroke="#d67556" stroke-width="1.5" stroke-linecap="round"
    stroke-dasharray="14 6"/>
</svg>
```

---

## line-dashed · dash-dot

Tiret-point alterné. Usage : relation composée, signaux UML.

```html
<svg width="200" height="12" viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="6" x2="196" y2="6"
    stroke="#d67556" stroke-width="1.5" stroke-linecap="round"
    stroke-dasharray="10 4 2 4"/>
</svg>
```

---

## line-dashed · flow-right (animé)

Flux directionnel vers la droite. Nécessite la règle CSS ci-dessous.

```css
@keyframes dash-flow-right {
  to { stroke-dashoffset: -20; }
}
.flow-right { animation: dash-flow-right 0.8s linear infinite; }
```

```html
<svg width="200" height="12" viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="6" x2="196" y2="6"
    class="flow-right"
    stroke="#d67556" stroke-width="2" stroke-linecap="round"
    stroke-dasharray="8 6"/>
</svg>
```

---

## line-dashed · flow-left (animé)

Flux directionnel vers la gauche (réponse, signal inverse).

```css
@keyframes dash-flow-left {
  to { stroke-dashoffset: 20; }
}
.flow-left { animation: dash-flow-left 0.8s linear infinite; }
```

```html
<svg width="200" height="12" viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="6" x2="196" y2="6"
    class="flow-left"
    stroke="#9e9a94" stroke-width="2" stroke-linecap="round"
    stroke-dasharray="8 6"/>
</svg>
```
