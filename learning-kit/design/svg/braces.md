# Braces — SVG Elements

> Conventions : voir `CATALOG.md`

Accolades courbes construites avec **deux beziers cubiques symétriques**.
Formule générale (horizontal, largeur W, profondeur H) :
```
M 4 start_y  C 0 start_y, 0 peak_y, W/2 peak_y  C W peak_y, W start_y, W-4 start_y
```
La "pointe" centrale indique la direction de l'annotation.

---

## brace-bottom ⌣

Pointe vers le bas — annote le contenu **au-dessus**. ViewBox 200×28.

```html
<svg width="200" height="28" viewBox="0 0 200 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 4 4 C 0 4, 0 24, 100 24 C 200 24, 200 4, 196 4"
    stroke="#d67556" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
```

---

## brace-top ⌢

Pointe vers le haut — annote le contenu **en-dessous**. ViewBox 200×28.

```html
<svg width="200" height="28" viewBox="0 0 200 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 4 24 C 0 24, 0 4, 100 4 C 200 4, 200 24, 196 24"
    stroke="#d67556" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
```

---

## brace-bottom · small

Version réduite pour annoter 2–3 mots inline. ViewBox 100×20.

```html
<svg width="100" height="20" viewBox="0 0 100 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 3 3 C 0 3, 0 17, 50 17 C 100 17, 100 3, 97 3"
    stroke="#d67556" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
```

---

## brace-right }

Pointe vers la droite — annote le contenu **à gauche**. ViewBox 28×120.

```html
<svg width="28" height="120" viewBox="0 0 28 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 4 4 C 4 0, 24 0, 24 60 C 24 120, 4 120, 4 116"
    stroke="#d67556" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
```

---

## brace-left {

Pointe vers la gauche — annote le contenu **à droite**. ViewBox 28×120.

```html
<svg width="28" height="120" viewBox="0 0 28 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 24 4 C 24 0, 4 0, 4 60 C 4 120, 24 120, 24 116"
    stroke="#d67556" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
```

---

## Notes d'intégration

Pour adapter la taille de l'accolade : modifier uniquement `width`/`height` HTML et `viewBox`.
Le path reste identique — SVG scale automatiquement.

Exemple avec hauteur personnalisée (brace-right, H=72) :
```html
<svg width="28" height="72" viewBox="0 0 28 72" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 4 4 C 4 0, 24 0, 24 36 C 24 72, 4 72, 4 68"
    stroke="#d67556" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
```
> Règle : `peak_y = H/2`, `end_y = H-4`.
