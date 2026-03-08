# Config Drawer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer les 7 QuickPicks de lancement de workflow par un drawer overlay dans la sidebar webview, avec mémoire de la dernière configuration.

**Architecture:** Un `LastWorkflowConfig` stocké dans `context.globalState` pré-remplit le drawer. Le bouton "Lancer ▶" ouvre le drawer (re-render avec `drawerOpen: true`). Le drawer poste `{ command: 'smartInit', ...overrides }` à la fermeture. `runSmartInitAiFlow` est étendu pour accepter des overrides qui écrasent la config par défaut.

**Tech Stack:** TypeScript, VS Code WebviewView API, HTML/CSS (glassmorphism existant), `context.globalState`

**Design doc:** `docs/plans/2026-03-08-config-drawer-design.md`

---

### Task 1 : Interface `LastWorkflowConfig` + helpers globalState

**Fichiers :**
- Modify: `src/features/workflow/workflowService.ts`
- Modify: `src/features/workflow/types.ts`

**Step 1 : Ajouter l'interface dans `types.ts`**

À la fin du fichier, après `WorkflowDashboardState` :

```typescript
export interface LastWorkflowConfig {
  preset: WorkflowPreset;
  provider: ProviderTarget;
  providerModel?: string;
  claudeEffort?: ClaudeEffortLevel;
  brief?: string;
}
```

**Step 2 : Ajouter la constante de clé dans `constants.ts`**

```typescript
export const LAST_WORKFLOW_CONFIG_KEY = 'aiContextOrchestrator.lastWorkflowConfig';
```

**Step 3 : Ajouter les helpers dans `workflowService.ts`**

Importer `LAST_WORKFLOW_CONFIG_KEY` depuis `./constants.js` (déjà importé partiellement — ajouter à l'import existant).

Importer `LastWorkflowConfig` depuis `./types.js`.

Ajouter à la fin du fichier :

```typescript
export function readLastWorkflowConfig(context: vscode.ExtensionContext): LastWorkflowConfig | undefined {
  return context.globalState.get<LastWorkflowConfig>(LAST_WORKFLOW_CONFIG_KEY);
}

export async function saveLastWorkflowConfig(context: vscode.ExtensionContext, config: LastWorkflowConfig): Promise<void> {
  await context.globalState.update(LAST_WORKFLOW_CONFIG_KEY, config);
}
```

**Step 4 : Compiler**

```bash
npm run compile
```
Attendu : 0 erreurs.

**Step 5 : Commit**

```bash
git add src/features/workflow/types.ts src/features/workflow/constants.ts src/features/workflow/workflowService.ts
git commit -m "feat: add LastWorkflowConfig interface and globalState helpers"
```

---

### Task 2 : Étendre `runSmartInitAiFlow` avec overrides

**Fichiers :**
- Modify: `src/commands/index.ts`

**Step 1 : Ajouter les imports nécessaires**

Dans les imports de `workflowService.ts`, ajouter `readLastWorkflowConfig`, `saveLastWorkflowConfig`.

Ajouter le type `LastWorkflowConfig` à l'import de `types.ts`.

**Step 2 : Étendre la signature de `runSmartInitAiFlow`**

Remplacer la fonction existante :

```typescript
async function runSmartInitAiFlow(preset: WorkflowPreset, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
```

par :

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
): Promise<void> {
```

**Step 3 : Appliquer les overrides au plan**

Dans le corps de `runSmartInitAiFlow`, après `buildSmartDefaultWorkflowPlan` :

```typescript
const configuration = getExtensionConfiguration();
const workflowPlan = buildSmartDefaultWorkflowPlan(preset, configuration);

// Apply drawer overrides
if (overrides?.provider) { workflowPlan.provider = overrides.provider; }
if (overrides?.providerModel !== undefined) { workflowPlan.providerModel = overrides.providerModel; }
if (overrides?.claudeEffort) { workflowPlan.claudeEffort = overrides.claudeEffort; }
if (overrides?.brief) {
  workflowPlan.brief = {
    taskType: inferTaskType(preset, overrides.brief),
    goal: overrides.brief,
    constraints: [],
    rawText: overrides.brief
  };
}
// Recalculate presetDefinition after potential provider change
workflowPlan.presetDefinition = WORKFLOW_PRESETS[preset];
```

Note : importer `inferTaskType` et `WORKFLOW_PRESETS` s'ils ne sont pas déjà importés dans `commands/index.ts`.

**Step 4 : Mettre à jour la commande `smartInitAI` pour accepter les overrides et sauvegarder**

Dans le handler de `ai-context-orchestrator.smartInitAI` :

```typescript
vscode.commands.registerCommand('ai-context-orchestrator.smartInitAI', async (preset?: string, overrides?: { provider?: string; providerModel?: string; claudeEffort?: string; brief?: string }) => {
  const workspaceFolder = await resolveCommandWorkspaceFolder('Choose the workspace folder to initialize');
  if (!workspaceFolder) { return; }
  const configuration = getExtensionConfiguration();
  const resolvedPreset: WorkflowPreset = (preset as WorkflowPreset | undefined) ?? configuration.defaultPreset;
  const resolvedOverrides = overrides ? {
    provider: overrides.provider as ProviderTarget | undefined,
    providerModel: overrides.providerModel,
    claudeEffort: overrides.claudeEffort as ClaudeEffortLevel | undefined,
    brief: overrides.brief
  } : undefined;
  await runSmartInitAiFlow(resolvedPreset, workspaceFolder, resolvedOverrides);
  // Save last config
  if (resolvedOverrides) {
    await saveLastWorkflowConfig(context, {
      preset: resolvedPreset,
      provider: resolvedOverrides.provider ?? configuration.defaultProvider,
      providerModel: resolvedOverrides.providerModel,
      claudeEffort: resolvedOverrides.claudeEffort,
      brief: resolvedOverrides.brief
    });
  }
  EventBus.fire('refresh');
}),
```

Note : `context` est disponible via fermeture (paramètre de `registerAllCommands`).

**Step 5 : Compiler**

```bash
npm run compile
```
Attendu : 0 erreurs.

**Step 6 : Commit**

```bash
git add src/commands/index.ts
git commit -m "feat: extend smartInitAI with overrides and lastWorkflowConfig persistence"
```

---

### Task 3 : Handler `openConfigDrawer` dans `WorkflowControlViewProvider`

**Fichiers :**
- Modify: `src/features/workflow/ui.ts`
- Modify: `src/extension.ts`

**Step 1 : Passer `context` à `WorkflowControlViewProvider`**

Dans `extension.ts`, modifier la construction du provider :

```typescript
const workflowControlViewProvider = new WorkflowControlViewProvider(
  context.extensionUri,
  loadDashboardState,
  workflowUiHelpers,
  context  // nouveau paramètre
);
```

**Step 2 : Mettre à jour le constructeur dans `ui.ts`**

```typescript
export class WorkflowControlViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private drawerOpen = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly loadState: () => Promise<WorkflowDashboardState>,
    private readonly helpers: WorkflowUiHelpers,
    private readonly context: vscode.ExtensionContext
  ) {}
```

**Step 3 : Ajouter les imports nécessaires dans `ui.ts`**

```typescript
import { readLastWorkflowConfig } from './workflowService.js';
import type { LastWorkflowConfig } from './types.js';
```

**Step 4 : Ajouter le case `openConfigDrawer` dans `onDidReceiveMessage`**

```typescript
case 'openConfigDrawer':
  this.drawerOpen = true;
  void this.render(this.view!);
  return;
case 'closeConfigDrawer':
  this.drawerOpen = false;
  void this.render(this.view!);
  return;
```

**Step 5 : Passer `drawerOpen` et `lastConfig` au render**

Modifier la méthode `render` :

```typescript
private async render(webviewView: vscode.WebviewView): Promise<void> {
  const state = await this.loadState();
  const nonce = this.helpers.createNonce();
  const lastConfig = this.drawerOpen ? readLastWorkflowConfig(this.context) : undefined;
  webviewView.webview.html = getWorkflowControlHtml(webviewView.webview, state, nonce, this.helpers, this.drawerOpen, lastConfig);
}
```

**Step 6 : Modifier le bouton Lancer dans `buildInitHero`**

Remplacer `id="mc-launch-btn"` par `data-command="openConfigDrawer"` :

```html
<button type="button" data-command="openConfigDrawer">Lancer ▶</button>
```

(Le JS du scriptBody s'occupait de `mc-launch-btn` — supprimer ce handler, le drawer gère maintenant le vrai lancement.)

**Step 7 : Compiler**

```bash
npm run compile
```
Attendu : 0 erreurs.

**Step 8 : Commit**

```bash
git add src/features/workflow/ui.ts src/extension.ts
git commit -m "feat: add openConfigDrawer handler and drawerOpen state to WorkflowControlViewProvider"
```

---

### Task 4 : HTML du Drawer dans `getWorkflowControlHtml`

**Fichiers :**
- Modify: `src/features/workflow/ui.ts`

**Step 1 : Mettre à jour la signature de `getWorkflowControlHtml`**

```typescript
export function getWorkflowControlHtml(
  webview: vscode.Webview,
  state: WorkflowDashboardState,
  nonce: string,
  helpers: WorkflowUiHelpers,
  drawerOpen: boolean = false,
  lastConfig?: LastWorkflowConfig
): string {
```

**Step 2 : Ajouter une fonction `buildConfigDrawerHtml`**

Ajouter à la fin de `ui.ts` (avant `formatWorkflowRoles`) :

```typescript
function buildConfigDrawerHtml(
  helpers: WorkflowUiHelpers,
  lastConfig: LastWorkflowConfig | undefined,
  configuration: ExtensionConfiguration
): string {
  const preset = lastConfig?.preset ?? configuration.defaultPreset;
  const provider = lastConfig?.provider ?? configuration.defaultProvider;
  const model = lastConfig?.providerModel ?? '';
  const effort = lastConfig?.claudeEffort ?? configuration.defaultClaudeEffort;
  const brief = lastConfig?.brief ?? '';

  const presets = Object.values(WORKFLOW_PRESETS);
  const presetPills = presets.map((p) =>
    `<button type="button" class="drawer-pill ${p.preset === preset ? 'active' : ''}" data-field="preset" data-value="${p.preset}">${helpers.escapeHtml(p.label)}</button>`
  ).join('');

  const providers: ProviderTarget[] = ['claude', 'gemini', 'copilot'];
  const providerPills = providers.map((p) =>
    `<button type="button" class="drawer-pill ${p === provider ? 'active' : ''}" data-field="provider" data-value="${p}">${helpers.escapeHtml(helpers.getProviderLabel(p))}</button>`
  ).join('');

  // Model options injectées depuis constants (évite hardcode JS)
  const claudeModels = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
  const geminiModels = ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'];
  const modelOptions = (provider === 'gemini' ? geminiModels : provider === 'copilot' ? ['default'] : claudeModels)
    .map((m) => `<option value="${m}" ${m === model ? 'selected' : ''}>${m}</option>`).join('');

  const effortPills = (['low', 'medium', 'high'] as const).map((e) =>
    `<button type="button" class="drawer-pill ${e === effort ? 'active' : ''}" data-field="effort" data-value="${e}">${helpers.escapeHtml(e.charAt(0).toUpperCase() + e.slice(1))}</button>`
  ).join('');

  const briefPlaceholder = preset === 'explore' ? 'Quelle zone explorer ?' : 'Décris l\'objectif de cette étape…';

  return `
<div class="mc-backdrop" id="mc-backdrop"></div>
<div class="mc-drawer" id="mc-drawer">
  <div class="drawer-header">
    <span class="drawer-title">Nouveau workflow</span>
    <button type="button" class="drawer-close" id="drawer-close-btn">✕</button>
  </div>
  <div class="drawer-body">
    <div class="drawer-field">
      <label class="drawer-label">Objectif</label>
      <div class="drawer-pills" id="preset-pills">${presetPills}</div>
    </div>
    <div class="drawer-field" id="brief-field" ${preset === 'explore' ? 'style="display:none"' : ''}>
      <label class="drawer-label">Brief</label>
      <textarea class="drawer-textarea" id="drawer-brief" placeholder="${helpers.escapeHtml(briefPlaceholder)}">${helpers.escapeHtml(brief)}</textarea>
    </div>
    <div class="drawer-field">
      <label class="drawer-label">Provider</label>
      <div class="drawer-pills" id="provider-pills">${providerPills}</div>
    </div>
    <div class="drawer-field">
      <label class="drawer-label">Modèle</label>
      <select class="drawer-select" id="drawer-model">${modelOptions}</select>
    </div>
    <div class="drawer-field" id="effort-field" ${provider !== 'claude' ? 'style="display:none"' : ''}>
      <label class="drawer-label">Effort Claude</label>
      <div class="drawer-pills" id="effort-pills">${effortPills}</div>
    </div>
    <details class="advanced-details">
      <summary>▸ Paramètres avancés</summary>
      <div style="margin-top:8px;">
        <button type="button" class="secondary" data-command="init">Configuration complète (QuickPick)…</button>
      </div>
    </details>
  </div>
  <div class="drawer-footer">
    <button type="button" id="drawer-launch-btn">Lancer ▶</button>
  </div>
</div>`;
}
```

**Step 3 : Injecter le drawer dans `getWorkflowControlHtml`**

Dans `getWorkflowControlHtml`, juste avant `return renderDesignShellDocument(...)` :

```typescript
const drawerHtml = drawerOpen
  ? buildConfigDrawerHtml(helpers, lastConfig, configuration)
  : '';
```

Et dans `contentHtml`, ajouter `${drawerHtml}` en premier :

```typescript
const contentHtml = `
${drawerHtml}
${heroHtml}
...
```

**Step 4 : Compiler**

```bash
npm run compile
```
Attendu : 0 erreurs.

**Step 5 : Commit**

```bash
git add src/features/workflow/ui.ts
git commit -m "feat: add config drawer HTML with preset/provider/model/effort/brief fields"
```

---

### Task 5 : CSS du Drawer dans `designSystem.ts`

**Fichiers :**
- Modify: `src/webview/designSystem.ts`

**Step 1 : Ajouter les styles drawer après la section `/* Mission Control */`**

```css
/* Config Drawer */
.mc-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 100;
  animation: fade-in 150ms ease;
}
.mc-drawer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 101;
  background: var(--panel-strong);
  border-top: 1px solid var(--glass-border);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  animation: slide-up 200ms ease-out;
}
@keyframes slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.drawer-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-primary);
}
.drawer-close {
  appearance: none;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 1rem;
  padding: 4px 8px;
  border-radius: 6px;
  width: auto;
  box-shadow: none;
  transition: color 120ms, background 120ms;
}
.drawer-close:hover { color: var(--text-primary); background: rgba(255,255,255,0.06); transform: none; box-shadow: none; }
.drawer-body {
  overflow-y: auto;
  padding: 14px 16px;
  display: grid;
  gap: 14px;
  flex: 1;
}
.drawer-footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.drawer-field { display: grid; gap: 6px; }
.drawer-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.drawer-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.drawer-pill {
  appearance: none;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.80rem;
  font-weight: 600;
  width: auto;
  box-shadow: none;
  transition: background 100ms, border-color 100ms, color 100ms;
}
.drawer-pill:hover:not(:disabled) { background: rgba(214,117,86,0.10); color: var(--text-body); transform: none; box-shadow: none; }
.drawer-pill.active {
  background: linear-gradient(160deg, rgba(214,117,86,0.22), rgba(214,117,86,0.10));
  border-color: rgba(214,117,86,0.40);
  color: var(--text-primary);
  transform: none;
  box-shadow: none;
}
.drawer-select {
  appearance: none;
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  color: var(--text-body);
  font: inherit;
  font-size: 0.84rem;
  cursor: pointer;
}
.drawer-select:focus { outline: 1px solid rgba(214,117,86,0.40); }
.drawer-textarea {
  width: 100%;
  min-height: 64px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  color: var(--text-body);
  font: inherit;
  font-size: 0.84rem;
  resize: vertical;
  box-sizing: border-box;
}
.drawer-textarea:focus { outline: 1px solid rgba(214,117,86,0.40); }
```

**Step 2 : Compiler**

```bash
npm run compile
```
Attendu : 0 erreurs.

**Step 3 : Commit**

```bash
git add src/webview/designSystem.ts
git commit -m "feat: add config drawer CSS styles"
```

---

### Task 6 : JavaScript du Drawer dans `scriptBody`

**Fichiers :**
- Modify: `src/features/workflow/ui.ts`

**Step 1 : Ajouter le `scriptBody` drawer dans `getWorkflowControlHtml`**

Remplacer le `scriptBody` existant par une version étendue. Le script gère :
- Ouverture/fermeture du drawer
- Sélection des pills (preset, provider, effort)
- Mise à jour dynamique du `<select>` modèle quand le provider change
- Visibilité de la row Effort (Claude seulement)
- Visibilité du Brief (masqué si explore)
- Post du message `smartInit` au clic Lancer

```typescript
const scriptBody = `
// ── Preset selector (hero, no drawer) ──
var selectedPreset = '${defaultPreset}';
for (var btn of document.querySelectorAll('.preset-btn')) {
  btn.addEventListener('click', (function(b) { return function() {
    selectedPreset = b.dataset.preset;
    for (var x of document.querySelectorAll('.preset-btn')) { x.classList.toggle('active', x.dataset.preset === selectedPreset); }
  }; })(btn));
}

// ── Stage index mark buttons ──
for (var markBtn of document.querySelectorAll('button[data-stage-index]')) {
  markBtn.addEventListener('click', (function(b) { return function() {
    vscode.postMessage({ command: b.dataset.command, stageIndex: Number(b.dataset.stageIndex) });
  }; })(markBtn));
}

// ── Drawer state ──
var drawerPreset = '${lastConfig?.preset ?? defaultPreset}';
var drawerProvider = '${lastConfig?.provider ?? defaultProvider}';
var drawerEffort = '${lastConfig?.claudeEffort ?? 'medium'}';

var CLAUDE_MODELS = ${JSON.stringify(claudeModels)};
var GEMINI_MODELS = ${JSON.stringify(geminiModels)};
var COPILOT_MODELS = ['default'];

function getModels(provider) {
  if (provider === 'gemini') return GEMINI_MODELS;
  if (provider === 'copilot') return COPILOT_MODELS;
  return CLAUDE_MODELS;
}

function updateModelSelect(provider, currentModel) {
  var sel = document.getElementById('drawer-model');
  if (!sel) return;
  var models = getModels(provider);
  sel.innerHTML = models.map(function(m) {
    return '<option value="' + m + '"' + (m === currentModel ? ' selected' : '') + '>' + m + '</option>';
  }).join('');
}

function updateEffortVisibility(provider) {
  var row = document.getElementById('effort-field');
  if (row) row.style.display = provider === 'claude' ? '' : 'none';
}

function updateBriefVisibility(preset) {
  var row = document.getElementById('brief-field');
  if (row) row.style.display = preset === 'explore' ? 'none' : '';
  var ta = document.getElementById('drawer-brief');
  if (ta) {
    var placeholders = { explore: 'Quelle zone explorer ?', plan: 'Que planifier ?', build: 'Que construire ?', debug: 'Quel bug corriger ?', review: 'Que reviewer ?', test: 'Quelle surface tester ?' };
    ta.placeholder = placeholders[preset] || 'Décris l\\'objectif…';
  }
}

// Pill clicks (preset / provider / effort)
for (var pill of document.querySelectorAll('.drawer-pill')) {
  pill.addEventListener('click', (function(p) { return function() {
    var field = p.dataset.field;
    var value = p.dataset.value;
    // Deselect siblings
    var container = p.closest('.drawer-pills');
    if (container) for (var s of container.querySelectorAll('.drawer-pill')) { s.classList.remove('active'); }
    p.classList.add('active');
    if (field === 'preset') {
      drawerPreset = value;
      updateBriefVisibility(value);
    } else if (field === 'provider') {
      drawerProvider = value;
      var currentModel = document.getElementById('drawer-model') ? document.getElementById('drawer-model').value : '';
      updateModelSelect(value, currentModel);
      updateEffortVisibility(value);
    } else if (field === 'effort') {
      drawerEffort = value;
    }
  }; })(pill));
}

// Close drawer
function closeDrawer() { vscode.postMessage({ command: 'closeConfigDrawer' }); }
var closeBtn = document.getElementById('drawer-close-btn');
if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
var backdrop = document.getElementById('mc-backdrop');
if (backdrop) backdrop.addEventListener('click', closeDrawer);

// Launch from drawer
var drawerLaunchBtn = document.getElementById('drawer-launch-btn');
if (drawerLaunchBtn) {
  drawerLaunchBtn.addEventListener('click', function() {
    var modelEl = document.getElementById('drawer-model');
    var briefEl = document.getElementById('drawer-brief');
    vscode.postMessage({
      command: 'smartInit',
      preset: drawerPreset,
      provider: drawerProvider,
      providerModel: modelEl ? modelEl.value : undefined,
      claudeEffort: drawerProvider === 'claude' ? drawerEffort : undefined,
      brief: briefEl && briefEl.value.trim() ? briefEl.value.trim() : undefined
    });
  });
}
`;
```

Note : les variables `claudeModels`, `geminiModels` et `lastConfig` doivent être définies dans la fonction `getWorkflowControlHtml` avant le `scriptBody`. Ajouter :

```typescript
const claudeModels = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
const geminiModels = ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'];
```

**Step 2 : Mettre à jour le handler `smartInit` dans `WorkflowControlViewProvider`**

Le message posté par le drawer inclut maintenant `provider`, `providerModel`, `claudeEffort`, `brief`. Passer ces overrides à la commande :

```typescript
case 'smartInit':
  await vscode.commands.executeCommand(
    'ai-context-orchestrator.smartInitAI',
    message.preset,
    {
      provider: message.provider,
      providerModel: message.providerModel,
      claudeEffort: message.claudeEffort,
      brief: message.brief
    }
  );
  this.drawerOpen = false;
  return;
```

Étendre le type du message pour inclure les nouveaux champs :

```typescript
async (message: {
  command?: string;
  provider?: ProviderTarget;
  preset?: string;
  providerModel?: string;
  claudeEffort?: string;
  brief?: string;
  stageIndex?: number;
})
```

**Step 3 : Compiler**

```bash
npm run compile
```
Attendu : 0 erreurs.

**Step 4 : Vérification manuelle (F5)**

- Ouvrir l'extension dans Extension Development Host
- Sidebar affiche hero sans session
- Clic "Lancer ▶" → drawer slide-up depuis le bas
- Clic sur un preset → pill active change
- Changement de provider → select modèle se met à jour, row Effort masquée si pas Claude
- Brief masqué si preset Explore
- Clic backdrop ou ✕ → drawer se ferme
- Clic "Lancer ▶" dans le drawer → workflow se lance sans QuickPick

**Step 5 : Commit**

```bash
git add src/features/workflow/ui.ts
git commit -m "feat: add config drawer JS with dynamic model/effort/brief + smartInit overrides"
```

---

### Task 7 : Nettoyage et polish

**Fichiers :**
- Modify: `src/features/workflow/ui.ts`

**Step 1 : Supprimer le handler `mc-launch-btn` du scriptBody**

Le bouton Lancer du hero déclenche maintenant `openConfigDrawer` (via `data-command`). Supprimer le bloc `mc-launch-btn` du `scriptBody` existant :

```typescript
// Supprimer ces lignes du scriptBody :
// var launchBtn = document.getElementById('mc-launch-btn');
// if (launchBtn) { launchBtn.addEventListener('click', ...) }
```

**Step 2 : Supprimer le `id="mc-launch-btn"` dans `buildInitHero`**

Le bouton Lancer dans le hero doit maintenant utiliser `data-command="openConfigDrawer"` (le JS global des `button[data-command]` gère déjà ça) :

```html
<button type="button" data-command="openConfigDrawer">Lancer ▶</button>
```

**Step 3 : Compiler**

```bash
npm run compile
```
Attendu : 0 erreurs.

**Step 4 : Commit final**

```bash
git add src/features/workflow/ui.ts
git commit -m "feat: complete config drawer — workflow launch without QuickPick"
```

---

## Vérification end-to-end

1. `npm run compile` → 0 erreurs
2. F5 → Extension Development Host
3. **Sans session** : clic Lancer → drawer slide-up, tous les champs présents
4. **Preset Explore** → champ Brief masqué
5. **Provider Gemini** → select modèles Gemini, row Effort masquée
6. **Provider Claude** → select modèles Claude, row Effort visible
7. **Lancer depuis drawer** → workflow se lance, drawer se ferme, session créée
8. **Rouvrir le drawer** → tous les champs pré-remplis avec la dernière config
9. **Session active** → bouton Continuer direct, pas de drawer
