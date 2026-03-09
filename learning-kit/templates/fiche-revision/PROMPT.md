# Prompt — Template Fiche de Révision

## Contexte
Tu génères une fiche de révision dense avec questions/réponses classées par thème.
Lis d'abord : `../../design/DESIGN_SYSTEM.md`
Référence obligatoire : `section-EXAMPLE.html` (dans ce dossier)

## Structure attendue (contenu à insérer dans index.html)

```html
<h2>Fiche — Sujet</h2>

<p class="theme-title">Thème : Nom du thème</p>

<div class="revision-card">
    <div class="question">Question ? <span class="badge badge-high">Important</span></div>
    <div class="answer">Réponse courte et précise.</div>
</div>
```

## Composants disponibles (components.css)

- `.theme-title` — séparateur de thème en orange uppercase
- `.revision-card` — carte Q/R avec bordure orange gauche
- `.revision-card .question` — question en gras blanc
- `.revision-card .answer` — réponse en gris clair
- `.badge.badge-high` — badge importance haute (orange)
- `.badge.badge-med` — badge importance moyenne (gris)
- `.badge.badge-low` — badge importance faible (gris foncé)

## Règles
- Contenu va dans index.html après .page-header
- Toujours utiliser `.theme-title` pour séparer les thèmes
- Badges optionnels mais recommandés pour la priorisation
- Réponses courtes (2-3 lignes max par carte)
