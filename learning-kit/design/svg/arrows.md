# Arrows — SVG Elements

> Conventions : voir `CATALOG.md`

---

## arrow-right

Flèche horizontale simple pointant à droite. Usage : icône inline 24×24.
Forme pleine effilée — queue arrondie via bezier, corps étroit, tête large.

```html
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 20 12 L 13 6.5 L 13 10 Q 5 10 4.5 12 Q 5 14 13 14 L 13 17.5 Z" fill="#d67556"/>
</svg>
```

---

## arrow-left

Flèche horizontale simple pointant à gauche. Usage : icône inline 24×24.

```html
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 4 12 L 11 6.5 L 11 10 Q 19 10 19.5 12 Q 19 14 11 14 L 11 17.5 Z" fill="#d67556"/>
</svg>
```

---

## arrow-up

Flèche verticale simple pointant vers le haut. Usage : icône inline 24×24.

```html
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 12 4 L 6.5 11 L 10 11 Q 10 19 12 19.5 Q 14 19 14 11 L 17.5 11 Z" fill="#d67556"/>
</svg>
```

---

## arrow-down

Flèche verticale simple pointant vers le bas. Usage : icône inline 24×24.

```html
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 12 20 L 6.5 13 L 10 13 Q 10 5 12 4.5 Q 14 5 14 13 L 17.5 13 Z" fill="#d67556"/>
</svg>
```

---

## arrow-curved-right

Flèche courbe (arc vers le haut) de gauche à droite. Usage : connecteur 200×40 entre blocs.
Trait fin (1.5px) + tête à encoche concave (Q bezier).

```html
<svg width="200" height="40" viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 10 24 C 60 5, 140 5, 180 20" stroke="#d67556" stroke-width="1.5" stroke-linecap="round" fill="none"/>
  <path d="M 188 21 L 179 15 Q 182 21 179 27 Z" fill="#d67556"/>
</svg>
```

---

## arrow-double

Flèche double-tête horizontale (←→). Usage : connecteur 200×40, indique une relation bidirectionnelle symétrique.

```html
<svg width="200" height="40" viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="22" y1="20" x2="178" y2="20" stroke="#d67556" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M 15 20 L 22 15.5 Q 20 20 22 24.5 Z" fill="#d67556"/>
  <path d="M 185 20 L 178 15.5 Q 180 20 178 24.5 Z" fill="#d67556"/>
</svg>
```

---

## arrow-bidirectional

Deux flèches parallèles en sens opposés (→ et ←). Usage : connecteur 200×40, indique un flux dans les deux directions (ex: requête/réponse).

```html
<svg width="200" height="40" viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Flèche du haut : gauche → droite -->
  <line x1="15" y1="14" x2="177" y2="14" stroke="#d67556" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M 184 14 L 177 9.5 Q 179 14 177 18.5 Z" fill="#d67556"/>
  <!-- Flèche du bas : droite → gauche -->
  <line x1="185" y1="26" x2="23" y2="26" stroke="#9e9a94" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M 16 26 L 23 21.5 Q 21 26 23 30.5 Z" fill="#9e9a94"/>
</svg>
```
