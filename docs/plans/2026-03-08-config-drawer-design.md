# Config Drawer — Design

**Date:** 2026-03-08
**Statut:** Partiellement supersede par l'implementation

> Note implementation: le concept de drawer overlay a ete remplace par un lanceur inline/expandable dans la sidebar afin d'ameliorer la lisibilite, de reduire l'effet wizard, et d'eviter l'empilement de glassmorphism par-dessus le contenu existant.

---

## Problème

Le lancement d'un nouveau workflow passe par 7 QuickPicks successifs dans la barre de commande VS Code. C'est lent, hors contexte, et sans mémoire entre les sessions.

## Objectif

Configurer et lancer un workflow entierement depuis la sidebar (webview), via une surface de lancement integree qui s'ouvre au clic Lancer quand il n'y a pas de session active.

---

## Architecture

### Stockage — `LastWorkflowConfig`

Clé `globalState` : `aiContextOrchestrator.lastWorkflowConfig`

```typescript
interface LastWorkflowConfig {
  preset: WorkflowPreset;
  provider: ProviderTarget;
  providerModel?: string;
  claudeEffort?: ClaudeEffortLevel;
  brief?: string;
}
```

Sauvegardé après chaque lancement réussi. Fallback sur la config VS Code si absent.

### Flux

```
Clic "Lancer ▶" (pas de session active)
  → webview poste { command: 'openConfigDrawer' }
  → WorkflowControlViewProvider lit lastWorkflowConfig depuis globalState
  → re-render avec lastWorkflowConfig injecte dans le HTML
  → lanceur inline visible dans la sidebar

Utilisateur remplit le lanceur → clic "Lancer ▶"
  → webview poste { command: 'smartInit', preset, provider, providerModel, claudeEffort?, brief? }
  → extension sauvegarde lastWorkflowConfig dans globalState
  → runSmartInitAiFlow(preset, provider, providerModel, claudeEffort, brief, workspaceFolder)
  → le lanceur se ferme

Clic "Continuer ▶" (session active)
  → poste { command: 'continue' } directement, pas de drawer
```

---

## UI du Lanceur

Surface integree dans la sidebar. Niveau primaire visible immediatement, reglages avances replis par defaut.

```
┌─────────────────────────────┐
│  ░░░░ (backdrop)            │
│  ┌─────────────────────┐    │
│  │ ✕  Nouveau workflow  │    │
│  │─────────────────────│    │
│  │ Objectif             │    │
│  │ [Explore][Plan][Build│    │
│  │  Debug][Review][Test]│    │
│  │                      │    │
│  │ Brief                │    │
│  │ ┌──────────────────┐ │    │
│  │ │ (textarea)       │ │    │
│  │ └──────────────────┘ │    │
│  │                      │    │
│  │ Provider             │    │
│  │ [Claude][Gemini][CP] │    │
│  │                      │    │
│  │ Modèle               │    │
│  │ [select ▾]           │    │
│  │                      │    │
│  │ Effort (Claude only) │    │
│  │ [Low][Medium][High]  │    │
│  │                      │    │
│  │ ▸ Paramètres avancés │    │
│  │                      │    │
│  │ [ Lancer ▶ ]         │    │
│  └─────────────────────┘    │
└─────────────────────────────┘
```

**Fermeture :** clic ✕, clic backdrop, ou après Lancer réussi.

---

## Détails techniques

### Modèles dynamiques (JS côté webview)

Les listes sont injectées dans le HTML au render depuis `constants.ts` (pas de hardcode JS) :

```js
const MODELS = {
  claude: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  gemini: ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  copilot: ['default']
};
```

Changement de provider → mise à jour du `<select>` modèle en JS (zéro round-trip).

### Effort Claude

Row masquée par défaut (`.hidden`), visible seulement si `provider === 'claude'`, togglée en JS.

### Brief

- `<textarea>` avec placeholder depuis `buildBriefPrompt(preset)` (fonction existante)
- Pré-rempli avec `lastWorkflowConfig.brief`
- Masqué si preset `explore` (pas de brief requis)

### Extension `runSmartInitAiFlow`

Signature étendue pour accepter les paramètres du drawer :

```typescript
async function runSmartInitAiFlow(
  preset: WorkflowPreset,
  workspaceFolder: vscode.WorkspaceFolder,
  overrides?: {
    provider?: ProviderTarget;
    providerModel?: string;
    claudeEffort?: ClaudeEffortLevel;
    brief?: string;
  }
): Promise<void>
```

`buildSmartDefaultWorkflowPlan` reste inchangé — les overrides sont appliqués après construction du plan.

---

## Fichiers impactés

| Fichier | Changement |
|---------|-----------|
| `src/features/workflow/ui.ts` | Drawer HTML + CSS dans `getWorkflowControlHtml` ; handler `openConfigDrawer` |
| `src/webview/designSystem.ts` | Styles `.mc-drawer`, `.mc-backdrop`, `.drawer-pill`, `.drawer-select` |
| `src/commands/index.ts` | `runSmartInitAiFlow` étendu avec overrides + sauvegarde `lastWorkflowConfig` |
| `src/features/workflow/workflowService.ts` | Interface `LastWorkflowConfig` + helper lecture/écriture globalState |

---

## Ce qui ne change pas

- `Continue Workflow` : QuickPick existant, inchangé (choix du preset suivant)
- Config VS Code : toujours le fallback si `lastWorkflowConfig` absent
- `buildSmartDefaultWorkflowPlan` : réutilisé tel quel, les overrides viennent après
