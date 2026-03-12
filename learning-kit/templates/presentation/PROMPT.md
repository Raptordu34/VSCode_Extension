# Prompt — Template Présentation (Slides)

## Contexte

Tu génères des slides HTML à insérer dans le `slides-container` de `index.html`.
Lire d'abord : `../../design/DESIGN_SYSTEM.md`
Référence obligatoire : `slide-EXAMPLE.html` (catalogue complet des composants)

---

## IMPORTANT : différence avec les autres templates

Chaque slide = **un fichier `slide-<slug>.html`** (snippet HTML, sans DOCTYPE).
Le fichier contient uniquement `<div class="slide">…</div>`, sans `<html>`, `<head>` ni `<link>`.
Les styles sont hérités de `index.html`.

**En parallèle**, ajouter le nom du fichier dans le tableau `SLIDES` de `index.html` :
```javascript
const SLIDES = [
    'slide-titre.html',
    'slide-agenda.html',
    'slide-modele.html',
    // ...
];
```

Le runtime du template gère aussi :
- les **fragments** (révélation progressive intra-slide)
- l'**auto-animate** léger entre deux slides successives liées
- un **toggle progression** pour choisir entre affichage progressif intra-slide ou slide complète immédiate
- un **mode contraste** et un **mode overview**
- un **diagnostic auteur** pour overflow et densité excessive

---

## Structure d'un fichier slide (`slide-<slug>.html`)

```html
<!-- slide-modele.html — pas de DOCTYPE, pas de <html>/<head>/<link> -->
<div class="slide">
    <div class="slide-content">
        <h2>Titre de la slide</h2>

        <!-- contenu : texte, composants, listes... -->
    </div>
</div>
```

**Toutes les slides** ont `class="slide"` — c'est `index.html` qui ajoute `.active` dynamiquement.

### Fragments (révélation progressive)

Ajouter `class="fragment"` sur les éléments à révéler pas à pas.

```html
<ul class="key-points">
    <li class="fragment" data-fragment-index="1">Premier point</li>
    <li class="fragment fade-left" data-fragment-index="2">Deuxième point</li>
    <li class="fragment grow highlight-current" data-fragment-index="3">Point final à insister</li>
</ul>
```

Classes d'effet disponibles :
- `.fade-left`
- `.fade-right`
- `.grow`
- `.blur-focus`
- `.highlight-current`

### Auto-animate entre deux slides successives

Sur les deux slides adjacentes, poser le même `data-auto-animate-id` sur le root `.slide`,
et un `data-auto-animate-key` sur les éléments qui doivent être reliés visuellement.

```html
<div class="slide" data-auto-animate-id="sql-demo">
    <div class="slide-content">
        <h2 data-auto-animate-key="title">Optimisation SQL</h2>
        <div class="terminal" data-auto-animate-key="code">…</div>
    </div>
</div>
```

---

## Slide de titre (fichier `slide-titre.html`)

```html
<div class="slide">
    <div class="slide-content">
        <span class="slide-section-label">Cours N — Module X</span>
        <p class="slide-title">Titre Principal<br>de la Présentation</p>
        <p class="slide-subtitle">Sous-titre · Auteur · Date</p>
    </div>
</div>
```

---

## Slide de séparation de section

```html
<div class="slide">
    <div class="slide-content">
        <div class="slide-divider">
            <span class="section-number">2</span>
            <h2>Titre de la section</h2>
            <p class="slide-subtitle">Description courte</p>
        </div>
    </div>
</div>
```

---

## Composants disponibles

### Typographie slide

| Composant | Usage |
|-----------|-------|
| `<p class="slide-title">` | Grand titre de couverture (gradient) |
| `<p class="slide-subtitle">` | Sous-titre de couverture |
| `<span class="slide-section-label">` | Badge catégorie au-dessus du titre |
| `<div class="slide-divider">` | Slide de séparation de section |

### Listes

| Composant | Usage |
|-----------|-------|
| `<ul class="agenda-list">` | Plan/agenda numéroté. Ajouter `.current` sur la li active |
| `<ul class="key-points">` | Points clés avec checkmarks verts |
| `<ul class="steps">` | Étapes numérotées avec cercles terracotta |
| `<ul>` / `<ol>` | Listes standards (losanges orange / numéros orange automatiques) |

### Statistiques et impact

| Composant | Usage |
|-----------|-------|
| `<div class="big-stat">` | Grande statistique d'impact |
| `<div class="metrics-grid">` | Grille de métriques |
| `<div class="metric-card">` | Carte métrique (variantes : `.accent` `.good` `.bad`) |

### Mise en valeur

| Composant | Usage |
|-----------|-------|
| `<div class="highlight-box">` | Définition ou concept central |
| `<div class="tip-box">` | Conseil (icône ampoule animée) |
| `<div class="callout-info">` | Information complémentaire — bleu |
| `<div class="callout-warning">` | Avertissement — amber |
| `<div class="callout-danger">` | Erreur critique — rouge |
| `<div class="quote-block"><blockquote>…</blockquote><cite>…</cite></div>` | Citation |

### Données et code

| Composant | Usage |
|-----------|-------|
| `<pre><code>` | Bloc code (bouton Copier injecté automatiquement) |
| `<div class="terminal">` | Shell macOS avec traffic lights |
| `<div class="table-glass"><table>…</table></div>` | Tableau glassmorphism |
| `<dl class="key-value"><dt>…</dt><dd>…</dd></dl>` | Paires clé–valeur |

### Mise en page

| Composant | Usage |
|-----------|-------|
| `<div class="two-col">` | Grille 2 colonnes |
| `<div class="compare-grid">` | Comparaison (`.compare-item.good/.bad/.neutral` + `data-label=""`) |
| `<div class="figure-box">` | Image ou schéma avec légende |

### Inline

| Composant | Usage |
|-----------|-------|
| `<code>` | Code inline (fond orange transparent) |
| `<strong>` | Texte blanc important |
| `<em>` | Accent terracotta italique |
| `<span class="badge badge-orange/blue/green/red">` | Badge qualifier |
| `<p class="source">` | Citation bibliographique |
| `<p class="inline-note">` | Note secondaire grise |

---

## Règles pour les présentations

### Contenu par slide
- **Maximum 5–6 bullet points** ou **2–3 paragraphes courts** par slide. Il est **strictement interdit** de surcharger les listes à puces.
- Assure-toi que les textes dans les puces soient concis et percutants. Formule des phrases claires pour éviter que le texte ne soit trop long.
- Évite absolument les retours à la ligne intempestifs au milieu des mots (pas de textes trop longs qui casseraient la mise en page).
- Un concept clé = une slide
- Si tu utilises des fragments, limiter à **3–5 étapes** par slide
- Le diagnostic auteur du template signale automatiquement les slides trop denses ou en overflow

### Ordre recommandé
1. **Titre** (`.slide-title` + `.slide-subtitle`)
2. **Agenda** (`.agenda-list`)
3. **Slides de contenu** (par section)
4. **Séparateurs de section** (`.slide-divider`) avant chaque nouveau chapitre
5. **Conclusion** (`.key-points` + `.source`)

### Navigation disponible (intégrée dans index.html)
- **← → / Espace / ↑↓** : navigation entre slides
- **P** : activer / désactiver l'affichage progressif dans une slide
- **F** : plein écran
- **C** : mode contraste / lecture
- **O** : vue d'ensemble du deck
- **D** : diagnostic auteur (overflow / densité)
- **?** : aide raccourcis
- **Dots** en bas : navigation directe par clic

---

## Checklist avant de livrer

- [ ] Chaque fichier `slide-*.html` contient un seul `<div class="slide">` (sans DOCTYPE)
- [ ] Nom du fichier ajouté dans le tableau `SLIDES` de `index.html`
- [ ] Pas plus de 6 éléments par slide
- [ ] `.slide-divider` avant chaque nouvelle section
- [ ] Fragments limités à une progression utile, pas décorative
- [ ] `data-auto-animate-id` utilisé seulement pour deux slides consécutives réellement liées
- [ ] Tableaux dans `.table-glass`
- [ ] `.agenda-list li.current` sur la première entrée du plan
- [ ] Slide de conclusion avec `.key-points` et `.source` si applicable
