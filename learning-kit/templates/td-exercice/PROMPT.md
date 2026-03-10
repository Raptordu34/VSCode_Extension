# Prompt — Template TD / Exercice

## Contexte

Tu génères une section HTML pour un exercice avec questions, indices progressifs et solutions masquées.
Lire d'abord : `../../design/DESIGN_SYSTEM.md`
Référence obligatoire : `section-EXAMPLE.html` (catalogue complet de tous les composants)

---

## Ce que tu produis

Un fichier `section-<slug>.html` par exercice (ex: `section-ex1-sql.html`).

**En parallèle**, fournis le bouton à ajouter dans `index.html` :
```html
<button class="nav-btn" onclick="loadSection('section-ex1-sql.html', this)">Exercice 1</button>
```

---

## Structure d'un exercice

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="./components.css">
    <script src="./section-utils.js" defer></script>
</head>
<body>

    <h2>Exercice N — Titre</h2>

    <!-- 1. En-tête de l'exercice -->
    <div class="exo-header">
        <div class="exo-meta">
            <span class="diff-badge diff-moyen">Intermédiaire</span>
            <span class="exo-points">◎ 10 pts</span>
            <span class="exo-time">⏱ 20–30 min</span>
        </div>
        <div class="objectifs">
            <strong>Objectifs</strong>
            <ul>
                <li>Objectif d'apprentissage 1</li>
                <li>Objectif d'apprentissage 2</li>
            </ul>
        </div>
        <p class="exo-prereq"><strong>Prérequis :</strong> <em>Cours N — Titre</em></p>
    </div>

    <!-- 2. Contexte (optionnel) -->
    <div class="context-block">
        <h3 style="margin-top:0;">Contexte</h3>
        <p>Données, schéma, énoncé du problème…</p>
    </div>

    <!-- 2 bis. Rappel de cours (optionnel) -->
    <button class="hint-btn" data-hint="rappel-jointure" data-label="Rappel de cours" data-close-label="Masquer le rappel" aria-expanded="false">
        <span class="btn-arrow">▶</span>
        <span class="btn-label">Rappel de cours</span>
    </button>
    <div class="hint" id="rappel-jointure">
        Rappel synthétique d'une notion du cours, d'une formule, ou d'une convention utile pour démarrer.
    </div>

    <!-- 2 ter. Scaffolding pédagogique (optionnel) -->
    <div class="two-col">
        <div class="highlight-box">
            <p><span class="badge badge-green">Exemple</span></p>
            <p>Cas concret minimal qui montre la méthode attendue sur une situation simple.</p>
        </div>
        <div class="callout-info">
            <p><span class="badge badge-blue">Analogie</span></p>
            <p><strong>Intuition :</strong> reformulation imagée pour rendre un concept abstrait plus manipulable.</p>
        </div>
    </div>

    <!-- 3. Question -->
    <div class="question">
        <div class="question-header">
            <span class="question-num">Q1</span>
            <span class="question-pts">4 pts</span>
            <span class="diff-badge diff-fondamental">Fondamental</span>
        </div>
        <p>Énoncé de la question…</p>

        <!-- Piège courant — AVANT les indices (pédagogiquement prouvé) -->
        <div class="erreur-freq">
            <strong>Piège courant :</strong> Ce que les étudiants pensent souvent à tort…
        </div>

        <!-- Indice 1 — déverrouillé dès le départ -->
        <button class="hint-btn" data-hint="q1-h1" data-label="Indice 1/2" aria-expanded="false">
            <span class="btn-arrow">▶</span>
            <span class="btn-label">Indice 1/2</span>
        </button>
        <div class="hint" id="q1-h1">Premier niveau d'indice…</div>

        <!-- Indice 2 — verrouillé jusqu'à révélation de l'indice 1 -->
        <button class="hint-btn hint-locked" data-hint="q1-h2" data-label="Indice 2/2" aria-expanded="false">
            <span class="btn-arrow">▶</span>
            <span class="btn-label">Indice 2/2</span>
        </button>
        <div class="hint" id="q1-h2">Deuxième niveau, plus proche de la réponse…</div>
    </div>

    <!-- 4. Zone de réponse -->
    <div class="reponse-zone" data-placeholder="Votre réponse…"></div>

    <!-- 5. Bouton solution (TOUJOURS immédiatement suivi du div .solution) -->
    <button class="solution-btn" aria-expanded="false">
        <span class="btn-arrow">▶</span>
        <span class="btn-label">Voir la solution</span>
    </button>
    <div class="solution">
        <div class="solution-inner">
            <h4 style="margin-top:0;">Solution — Q1</h4>
            <!-- contenu de la solution -->
        </div>
    </div>

    <!-- 6. Barème (optionnel) -->
    <!-- 7. Pour aller plus loin (optionnel, toujours en dernier) -->

</body>
</html>
```

---

## Règles critiques

### Solution toggle
- `.solution-btn` doit être **immédiatement suivi** du div `.solution` (pas d'élément entre les deux)
- Toujours `<div class="solution"><div class="solution-inner">…</div></div>`
- La solution est masquée par défaut — JS la révèle

### Indices progressifs
- Le **premier** `.hint-btn` n'a PAS la classe `.hint-locked`
- Les suivants ont `.hint-locked` — JS déverrouille séquentiellement quand le précédent est révélé
- `data-hint` pointe vers l'`id` du div `.hint` correspondant
- IDs uniques par exercice : `q1-h1`, `q1-h2`, `q2-h1`, etc.
- `data-close-label` est optionnel et permet de personnaliser le libellé replié pour d'autres usages que les indices

### Ordre pédagogique dans la question
1. Énoncé
2. `.erreur-freq` (piège — avant les indices, pas après)
3. `.hint-btn` / `.hint` (séquence)

---

## Difficulté — 3 niveaux (jamais "Difficile")

| Classe | Niveau |
|--------|--------|
| `.diff-fondamental` | Fondamental — vert |
| `.diff-moyen` | Intermédiaire — terracotta |
| `.diff-avance` | Avancé — rouge |

Utiliser "Avancé" pas "Difficile" — le framing réduit l'anxiété d'échec.

---

## Composants disponibles

### Structure exercice

| Composant | Usage |
|-----------|-------|
| `.exo-header` | En-tête : metadata (diff, pts, temps), objectifs, prérequis |
| `.exo-meta` | Flex-row pour les badges de metadata |
| `.exo-points` | Badge points (ex: `◎ 14 pts`) |
| `.exo-time` | Badge temps estimé (ex: `⏱ 30–45 min`) |
| `.exo-prereq` | Ligne prérequis en italique |
| `.objectifs` | Bloc teal avec liste d'objectifs d'apprentissage (2–4 max) |
| `.context-block` | Contexte, données, schéma — glassmorphism neutre |
| `.question` | Bloc énoncé, bordure orange gauche |
| `.question-header` | Flex-row : `.question-num` + `.question-pts` + `.diff-badge` |
| `.question-num` | Badge orange numéroté (`Q1`, `Q2`…) |
| `.question-pts` | Points de la question |
| `.sub-question` | Sous-parties a), b), c) dans une question |

### Flux pédagogique

| Composant | Usage |
|-----------|-------|
| `.erreur-freq` | Piège courant — amber, avant les indices |
| `.hint-btn` + `.hint` | Indice progressif — caché par défaut, révélé au clic |
| `.hint-btn.hint-locked` | Indice verrouillé — activé après révélation du précédent |
| `.reponse-zone` + `data-placeholder` | Espace visuel pour la réponse de l'étudiant |
| `.solution-btn` + `.solution` + `.solution-inner` | Solution masquée — toggle accordion |
| `.pour-aller-plus-loin` | Approfondissement — toujours en dernier, optionnel |
| `.bareme` | Critères de notation — grid 3 colonnes |

### Patrons pédagogiques recommandés

Ces patrons n'ajoutent **aucune nouvelle classe CSS** : ils assemblent uniquement les composants déjà disponibles.

| Patron | Structure | Usage |
|--------|-----------|-------|
| Rappel de cours repliable | `.hint-btn` + `.hint` avec un seul couple, sans `.hint-locked` | Réactiver une définition, formule ou convention sans allonger l'énoncé |
| Rappel de cours long | `.hint-btn` + `.hint` avec plusieurs `<p>`, `<ul>`, `.highlight-box` ou `.table-glass` | Fournir une mini-fiche de cours masquée par défaut pour les notions denses |
| Exemple guidé | `.highlight-box` + `.badge badge-green` + mini-code / mini-tableau | Montrer un cas simple complètement résolu avant la généralisation |
| Exemple développé | `.highlight-box` + plusieurs `<p>` + `<ul>` + éventuel `<pre>` | Montrer un cas riche avec raisonnement, calculs intermédiaires et lecture du résultat |
| Analogie | `.callout-info` + `.badge badge-blue` | Donner une intuition métier, physique ou quotidienne sur un concept abstrait |
| Analogie développée | `.callout-info` + plusieurs `<p>` + `<ul>` | Construire une intuition progressive quand une simple phrase ne suffit pas |
| Contre-exemple | `.highlight-box` + `.badge badge-red` | Montrer quand une règle ne marche plus, ou pourquoi une intuition est fausse |
| Méthode de résolution | `.highlight-box` suivi de `<ul class="steps">` | Proposer une procédure stable quand l'étudiant ne sait pas par où commencer |
| Checklist d'auto-vérification | `.callout-info` ou `.highlight-box` + `<ul>` | Donner un mini protocole de contrôle avant d'ouvrir la solution |

### Cas longs — règles de structure

- Un bloc long doit être découpé en plusieurs paragraphes courts, pas en un seul pavé.
- Pour un rappel de cours long repliable, utiliser `.hint-btn` + `.hint` avec `data-close-label` et un `id` dédié.
- À l'intérieur d'un bloc long, on peut combiner `<p>`, `<ul>`, `<ol>`, `<pre><code>`, `.highlight-box`, `.callout-info` et `.table-glass`.
- Un bloc long doit rester focalisé sur une seule idée pédagogique : rappel, exemple ou analogie. Si plusieurs objectifs se mélangent, scinder en deux blocs.
- Éviter de mettre une solution complète dans un rappel long : le rappel doit réactiver le cours, pas court-circuiter le raisonnement.

### Snippets pédagogiques prêts à l'emploi

#### 1. Rappel de cours (collapse)

```html
<button class="hint-btn" data-hint="rappel-cle-primaire" data-label="Rappel de cours" data-close-label="Masquer le rappel" aria-expanded="false">
    <span class="btn-arrow">▶</span>
    <span class="btn-label">Rappel de cours</span>
</button>
<div class="hint" id="rappel-cle-primaire">
    Une clé primaire identifie une ligne de manière unique, non nulle, et supporte les jointures de référence.
</div>
```

#### 2. Exemple guidé

```html
<div class="highlight-box">
    <p><span class="badge badge-green">Exemple</span></p>
    <p>Sur une table de 10 lignes, un scan séquentiel reste acceptable ; sur 10 millions, l'index devient critique.</p>
</div>
```

#### 3. Rappel de cours long

```html
<button class="hint-btn" data-hint="rappel-jointures-long" data-label="Rappel de cours approfondi" data-close-label="Masquer le rappel" aria-expanded="false">
    <span class="btn-arrow">▶</span>
    <span class="btn-label">Rappel de cours approfondi</span>
</button>
<div class="hint" id="rappel-jointures-long">
    <p><strong>Principe :</strong> une jointure rapproche des lignes de plusieurs tables à partir d'une clé commune.</p>
    <p><strong>Point d'attention :</strong> plus la table parcourue est grande, plus l'absence d'index sur les colonnes de jointure coûte cher.</p>
    <ul>
        <li><strong>Nested Loop :</strong> efficace si la table interne est vite accessible par index.</li>
        <li><strong>Hash Join :</strong> robuste sur de gros volumes quand on doit comparer beaucoup de lignes.</li>
        <li><strong>Merge Join :</strong> utile si les deux côtés sont déjà triés ou facilement triables.</li>
    </ul>
    <div class="highlight-box">
        <p><span class="badge badge-orange">Repère</span></p>
        <p>Quand le plan montre beaucoup de lignes éliminées après lecture, il faut souvent agir sur le filtrage en amont plutôt que sur la jointure elle-même.</p>
    </div>
</div>
```

#### 4. Exemple développé

```html
<div class="highlight-box">
    <p><span class="badge badge-green">Exemple développé</span></p>
    <p>Supposons une table <code>Inscriptions</code> contenant 180 000 lignes, dont seulement 3 200 concernent le semestre <code>2024-A</code> avec une note supérieure ou égale à 10.</p>
    <ul>
        <li>Sans index composite, PostgreSQL lit toute la table puis élimine 176 800 lignes.</li>
        <li>Avec un index sur <code>(semestre, note)</code>, le moteur cible directement les 3 200 lignes utiles.</li>
    </ul>
    <pre><code>CREATE INDEX idx_inscriptions_sem_note
    ON Inscriptions (semestre, note);</code></pre>
    <p class="inline-note">L'exemple doit montrer non seulement la commande, mais aussi le raisonnement qui justifie ce choix.</p>
</div>
```

#### 5. Analogie

```html
<div class="callout-info">
    <p><span class="badge badge-blue">Analogie</span></p>
    <p><strong>Intuition :</strong> un index agit comme le sommaire d'un livre : on va directement au bon chapitre au lieu de relire toutes les pages.</p>
</div>
```

#### 6. Analogie développée

```html
<div class="callout-info">
    <p><span class="badge badge-blue">Analogie développée</span></p>
    <p><strong>Image mentale :</strong> imaginez une bibliothèque universitaire sans catalogue. Pour trouver un ouvrage, il faut inspecter chaque rayon un par un.</p>
    <p>L'index joue le rôle du catalogue : il ne remplace pas les livres, mais il permet de savoir immédiatement où chercher. Si le catalogue est organisé d'abord par matière puis par auteur, on retrouve la logique d'un index composite ordonné.</p>
    <ul>
        <li><strong>Sans index :</strong> exploration rayon par rayon.</li>
        <li><strong>Avec index simple :</strong> on retrouve une étagère précise.</li>
        <li><strong>Avec index composite :</strong> on retrouve directement la bonne section puis le bon sous-ensemble.</li>
    </ul>
</div>
```

#### 7. Méthode + auto-vérification

```html
<div class="highlight-box">
    <p><span class="badge badge-orange">Méthode</span></p>
    <ul class="steps">
        <li>Repérer le verbe de la consigne.</li>
        <li>Identifier les données utiles.</li>
        <li>Appliquer la règle de cours.</li>
        <li>Vérifier l'unité, le signe ou la cohérence du résultat.</li>
    </ul>
</div>

<div class="callout-info">
    <strong>Checklist :</strong>
    <ul>
        <li>Ai-je utilisé la bonne table ou la bonne formule ?</li>
        <li>Ai-je justifié le choix de méthode ?</li>
        <li>Mon résultat répond-il exactement à la question ?</li>
    </ul>
</div>
```

### Composants riches (identiques au compte-rendu)

| Composant | Usage |
|-----------|-------|
| `<ul>` / `<ol>` | Puces / numéros terracotta (automatique) |
| `<ul class="steps">` | Étapes numérotées animées |
| `<pre><code>` | Bloc code (bouton copier injecté automatiquement) |
| `.terminal` + `.prompt` + `.comment` | Shell macOS avec traffic lights |
| `.table-glass` | Tableau glassmorphism (toujours envelopper `<table>`) |
| `.highlight-box` | Définition formelle — bordure orange |
| `.callout-info` | Information complémentaire — icône `i` bleu |
| `.two-col` | Grille 2 colonnes |
| `.badge` + `.badge-orange/blue/green/red` | Qualifier inline |
| `<p class="source">` | Citation bibliographique |
| `<p class="inline-note">` | Remarque secondaire |

---

## Fonctionnalités JS (section-utils.js — chargé automatiquement)

- **Solution toggle** — révèle/masque `.solution` au clic sur `.solution-btn`
- **Hints séquentiels** — déverrouille le prochain `.hint-locked` après chaque révélation
- **Copier** — injecte un bouton "Copier" sur chaque `<pre>`
- **Progress** — notifie `index.html` quand une solution est révélée (dot vert sur le nav)
- **Révéler tout** — réceptionne le signal du bouton global dans `index.html`

---

## Checklist avant de livrer

- [ ] `<script src="./section-utils.js" defer></script>` présent
- [ ] `.solution-btn` immédiatement suivi du `.solution`
- [ ] Premier `.hint-btn` sans `.hint-locked`, suivants avec
- [ ] IDs des hints uniques dans tout le fichier
- [ ] `data-close-label` renseigné si un `.hint-btn` sert de rappel de cours plutôt que d'indice
- [ ] `.erreur-freq` placé avant les indices (pas après)
- [ ] `.pour-aller-plus-loin` en dernier élément du body
- [ ] Tableaux dans `.table-glass`
- [ ] Difficulté : `.diff-fondamental` / `.diff-moyen` / `.diff-avance` (pas "Difficile")
