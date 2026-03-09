# Nodes — SVG Elements

> Conventions : voir `CATALOG.md`

Boîtes, nœuds et formes pour diagrammes, flowcharts et schémas d'architecture.

## Palette de couleurs

| Rôle | Stroke | Fill | Usage |
|---|---|---|---|
| Terracotta (accent) | `#d67556` | `rgba(214,117,86,0.08)` | Étapes principales, général |
| Teal (scientifique) | `#5ba6a0` | `rgba(91,166,160,0.1)` | Théorèmes, algorithmes formels |
| Muted (neutre) | `#9e9a94` | `rgba(158,154,148,0.08)` | Étapes secondaires, contexte |

---

## node-terminal

Pill shape — début ou fin d'un algorithme/processus. ViewBox 120×36.

```html
<svg width="120" height="36" viewBox="0 0 120 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="34" rx="17"
    fill="rgba(214,117,86,0.1)" stroke="#d67556" stroke-width="1.5"/>
</svg>
```

---

## node-process

Rectangle arrondi — étape de traitement, instruction. ViewBox 140×40.

```html
<svg width="140" height="40" viewBox="0 0 140 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="138" height="38" rx="7"
    fill="rgba(214,117,86,0.08)" stroke="#d67556" stroke-width="1.5"/>
</svg>
```

### Variantes de largeur

| Taille | width/height | viewBox | rx |
|---|---|---|---|
| Small | 100×32 | `0 0 100 32` | 6 |
| Regular | 140×40 | `0 0 140 40` | 7 |
| Wide | 200×44 | `0 0 200 44` | 8 |

### Variante dashed (optionnel/abstrait)

```html
<rect x="1" y="1" width="138" height="38" rx="7"
  fill="rgba(214,117,86,0.04)" stroke="#d67556" stroke-width="1.5"
  stroke-dasharray="6 4"/>
```

---

## node-decision

Losange — condition if/else, branchement logique. ViewBox 100×60.

```html
<svg width="100" height="60" viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg">
  <polygon points="50,2 98,30 50,58 2,30"
    fill="rgba(214,117,86,0.08)" stroke="#d67556" stroke-width="1.5"
    stroke-linejoin="round"/>
</svg>
```

---

## node-io

Parallélogramme — entrée/sortie, lecture/écriture. ViewBox 140×40.

```html
<svg width="140" height="40" viewBox="0 0 140 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <polygon points="18,1 139,1 122,39 1,39"
    fill="rgba(214,117,86,0.08)" stroke="#d67556" stroke-width="1.5"
    stroke-linejoin="round"/>
</svg>
```

---

## node-dot · filled

Point de jonction sur un connecteur (fork/merge). ViewBox 16×16.

```html
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="8" cy="8" r="5" fill="#d67556"/>
</svg>
```

## node-dot · outline

Nœud creux — étape intermédiaire, état indéterminé.

```html
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="8" cy="8" r="5" fill="none" stroke="#d67556" stroke-width="1.5"/>
</svg>
```

---

## Ajouter du texte dans un nœud

Les nœuds SVG accueillent un `<text>` centré. Style recommandé :

```html
<text x="70" y="24" text-anchor="middle"
  font-family="'Inter', system-ui, sans-serif"
  font-size="11" fill="#dedad5">
  Libellé
</text>
```

> `y` ≈ `height/2 + 4` pour centrer verticalement.
