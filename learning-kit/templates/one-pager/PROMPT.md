# Prompt — Template One Pager

## Contexte

Tu génères le contenu HTML d'un document synthétique sur une seule page, sans sidebar.
Public cible : décideurs, pairs, toute personne ayant 5 minutes.

Lire d'abord : `../../design/DESIGN_SYSTEM.md`

---

## Ce que tu produis

Tu **modifies directement `index.html`** : remplace le bloc délimité par les commentaires
`<!-- ═══ Contenu généré par LLM ═══ -->` et `<!-- ═══ Fin du contenu ═══ -->`.

Pas de fichier section séparé — tout le contenu est inline dans la page.

---

## Structure du contenu

```html
<h2>Titre principal du document</h2>

<div class="section-block">
    <h3>Première thématique</h3>
    <p>Contenu...</p>
    <div class="key-point">Point essentiel à retenir.</div>
</div>

<div class="section-block">
    <h3>Deuxième thématique</h3>
    <!-- composants selon besoin -->
</div>
```

**Règles :**
- `<h2>` — titre principal unique
- `<h3>` — titre de section (avec ou sans `.section-block`)
- `<h4>` — sous-titre (toujours enfant d'un `<h3>`)
- **2 à 5 `section-block` maximum** — au-delà, utiliser le template compte-rendu
- Ne jamais préfixer les titres avec A., B., 1., 2.

---

## Composants disponibles

### Containers

| Classe | Usage |
|--------|-------|
| `.section-block` | Bloc glassmorphism — enveloppe une thématique |
| `.key-point` | Point clé, bordure orange gauche |

### Mise en valeur

| Classe | Usage |
|--------|-------|
| `.highlight-box` | Définition formelle — bordure orange gauche épaisse |
| `.tip-box` | Conseil / bonne pratique — ampoule animée |
| `.callout-info` | Information complémentaire — icône `i` bleu |
| `.callout-warning` | Mise en garde — icône `!` ambre animée |
| `.callout-danger` | Erreur critique — icône `×` rouge |

### Chiffres et données

| Classe | Usage |
|--------|-------|
| `.metrics-grid` + `.metric-card` | Grille de métriques. Variantes : `.accent` `.good` `.bad` |
| `.metric-value` / `.metric-label` | Chiffre principal / légende |
| `<dl class="key-value">` | Paires clé/valeur |

### Listes

| Classe | Usage |
|--------|-------|
| `<ul>` | Puces losange terracotta (automatique) |
| `<ol>` | Numéros terracotta (automatique) |
| `<ul class="steps">` | Étapes numérotées animées |

### Comparaisons

```html
<div class="compare-grid">
    <div class="compare-item good"    data-label="Forces">...</div>
    <div class="compare-item bad"     data-label="Limites">...</div>
    <div class="compare-item neutral" data-label="Cas d'usage">...</div>
</div>
```

### Mise en page

| Classe | Usage |
|--------|-------|
| `.two-col` / `.three-col` | Grilles 2 ou 3 colonnes |
| `.figure-box` + `<figcaption>` | Encadré figure/image |

### Tableaux

Toujours envelopper dans `.table-glass` :
```html
<div class="table-glass"><table>…</table></div>
```

### Code, badges, texte

| Élément | Usage |
|---------|-------|
| `<pre><code>` | Bloc de code |
| `<code>` | Terme technique inline |
| `.badge .badge-orange/blue/green/red` | Qualifier un concept inline |
| `<p class="source">` | Citation bibliographique |
| `<p class="inline-note">` | Remarque secondaire |
| `<strong>` / `<em>` | Gras blanc / accent orange italique |

---

## Checklist avant de livrer

- [ ] Contenu placé entre les deux commentaires délimiteurs dans `index.html`
- [ ] Un seul `<h2>` en haut
- [ ] 2 à 5 `section-block`
- [ ] Pas de nouvelle classe CSS inventée
- [ ] Tableaux dans `.table-glass`
- [ ] `<h4>` toujours sous un `<h3>`
