# Sharp Depth Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the extension's webview CSS from glass morphism with large rounded corners to a "Sharp Depth" style: 0-2px radius on surfaces, subtle transparency, multi-layer elevation shadows, and button relief effects — aligned with VS Code 2026 design direction.

**Architecture:** All CSS lives in a single embedded `<style>` block inside `src/webview/designSystem.ts`. No external files. Changes are purely CSS variable and rule updates — no TypeScript logic changes required.

**Tech Stack:** TypeScript (template literals), CSS custom properties, VS Code webview API

---

### Task 1: Update CSS variables in `:root`

**File:**
- Modify: `src/webview/designSystem.ts:36-76`

**What to change:**

Replace the current radius and shadow variables with the new Sharp Depth values:

```css
/* OLD */
--radius-sm: 8px;
--radius-md: 14px;
--radius-lg: 24px;
--shadow-soft: 0 18px 48px rgba(0,0,0,0.24), 0 6px 16px rgba(0,0,0,0.18);
--shadow-glow: 0 0 0 1px rgba(255,255,255,0.03), 0 0 24px rgba(214, 117, 86, 0.06);

/* NEW */
--radius-sm: 3px;
--radius-md: 2px;
--radius-lg: 2px;
--radius-interactive: 4px;
--shadow-elev-1: 0 1px 2px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.18);
--shadow-elev-2: 0 1px 3px rgba(0,0,0,0.32), 0 4px 12px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.14);
--shadow-elev-3: 0 2px 4px rgba(0,0,0,0.36), 0 8px 20px rgba(0,0,0,0.26), 0 16px 40px rgba(0,0,0,0.16);
--btn-highlight: inset 0 1px 0 rgba(255,255,255,0.08);
--btn-press: inset 0 2px 4px rgba(0,0,0,0.28);
--panel-glass: color-mix(in srgb, var(--vscode-sideBar-background, #252526) 90%, transparent);
```

**Step 1: Edit the `:root` block** in `designSystem.ts` lines 36-76, replacing the 5 old variables with the 10 new ones above.

**Step 2: Verify** — no TypeScript errors (the variables are only referenced in CSS strings, no type-checking needed).

**Step 3: Commit**
```bash
git add src/webview/designSystem.ts
git commit -m "refactor(design): update CSS variables for Sharp Depth system"
```

---

### Task 2: Sharpen surface containers

**File:**
- Modify: `src/webview/designSystem.ts` — `.glass-panel`, `.card`, `.hero`, `.stat`, `.mc-section`, `.provider-card`, `.provider-account`, `.history-entry`, `.stage-pill`

**What to change:**

**.glass-panel** (lines 132-142):
```css
.glass-panel {
    position: relative;
    background: var(--panel-glass);
    border: 1px solid var(--glass-border);
    border-top-color: color-mix(in srgb, var(--glass-border) 80%, rgba(255,255,255,0.12));
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-elev-2);
    overflow: hidden;
    transform: translateZ(0);
    will-change: transform;
}
```

**.card** (lines 243-250):
```css
.card {
    background: var(--panel-strong);
    border: 1px solid var(--glass-border);
    border-top-color: color-mix(in srgb, var(--glass-border) 70%, rgba(255,255,255,0.10));
    border-radius: var(--radius-md);
    padding: 16px;
    box-shadow: var(--shadow-elev-1);
}
```

**.stat** (lines 298-303):
```css
.stat {
    padding: 12px;
    border-radius: var(--radius-sm);
    background: var(--panel-soft);
    border: 1px solid var(--glass-border);
    box-shadow: var(--shadow-elev-1);
}
```

**.mc-section** (lines 459-465):
```css
.mc-section {
    border-radius: var(--radius-md);
    background: var(--panel-strong);
    border: 1px solid var(--glass-border);
    border-top-color: color-mix(in srgb, var(--glass-border) 70%, rgba(255,255,255,0.10));
    margin-bottom: 6px;
    overflow: hidden;
    box-shadow: var(--shadow-elev-1);
}
```

**.provider-card** (lines 661-666):
```css
.provider-card {
    padding: 12px;
    border-radius: var(--radius-md);
    background: var(--panel-soft);
    border: 1px solid var(--glass-border);
    box-shadow: var(--shadow-elev-1);
}
```

**.provider-account** (lines 715-720):
```css
.provider-account {
    padding: 10px;
    border-radius: var(--radius-sm);
    border: 1px solid rgba(255,255,255,0.07);
    background: rgba(255,255,255,0.04);
}
```

**.history-entry** (lines 560-565):
```css
.history-entry {
    border-radius: var(--radius-sm);
    padding: 12px;
    border: 1px solid rgba(255,255,255,0.07);
    background: rgba(255,255,255,0.04);
    box-shadow: var(--shadow-elev-1);
}
```

**.stage-pill** (lines 527-532):
```css
.stage-pill {
    border-radius: var(--radius-sm);
    padding: 12px;
    border: 1px solid rgba(255,255,255,0.07);
    background: rgba(255,255,255,0.04);
    box-shadow: var(--shadow-elev-1);
}
```

**Step 1:** Edit each class in `designSystem.ts` as described above.

**Step 2: Commit**
```bash
git add src/webview/designSystem.ts
git commit -m "refactor(design): sharpen surface containers with elevation shadows"
```

---

### Task 3: Add button relief effects

**File:**
- Modify: `src/webview/designSystem.ts` — `button`, `button:hover`, `button:active`, `button.secondary`

**What to change:**

**Primary button** (lines 321-333):
```css
button {
    appearance: none;
    width: 100%;
    border: 1px solid transparent;
    border-radius: var(--radius-interactive);
    padding: 10px 12px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--button-primary-bg) 100%, rgba(255,255,255,0.08)) 0%,
        var(--button-primary-bg) 100%
    );
    color: var(--button-primary-fg);
    cursor: pointer;
    text-align: left;
    box-shadow: var(--btn-highlight), var(--shadow-elev-1);
    transition: background 120ms ease, border-color 120ms ease, box-shadow 80ms ease, opacity 120ms ease;
}
button:hover:not(:disabled) {
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--button-primary-hover) 100%, rgba(255,255,255,0.06)) 0%,
        var(--button-primary-hover) 100%
    );
    box-shadow: var(--btn-highlight), var(--shadow-elev-2);
}
button:active:not(:disabled) {
    box-shadow: var(--btn-press);
    transform: translateY(1px);
    transition: box-shadow 40ms ease, transform 40ms ease;
}
```

**Secondary button** (lines 350-361):
```css
button.secondary,
.linkButton {
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--button-secondary-bg) 100%, rgba(255,255,255,0.06)) 0%,
        var(--button-secondary-bg) 100%
    );
    color: var(--button-secondary-fg);
    border: 1px solid transparent;
    box-shadow: var(--btn-highlight), var(--shadow-elev-1);
}
button.secondary:hover:not(:disabled),
.linkButton:hover:not(:disabled) {
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--button-secondary-hover) 100%, rgba(255,255,255,0.06)) 0%,
        var(--button-secondary-hover) 100%
    );
    border-color: transparent;
    box-shadow: var(--btn-highlight), var(--shadow-elev-2);
}
button.secondary:active:not(:disabled),
.linkButton:active:not(:disabled) {
    box-shadow: var(--btn-press);
    transform: translateY(1px);
}
```

**Step 1:** Edit button rules in `designSystem.ts`.

**Step 2: Commit**
```bash
git add src/webview/designSystem.ts
git commit -m "refactor(design): add gradient relief and press effect to buttons"
```

---

### Task 4: Sharpen interactive small elements

**File:**
- Modify: `src/webview/designSystem.ts` — `.nav-btn`, `.tab-bar`, `.tab-bar-btn`, `.preset-btn`, `.drawer-pill`, `.drawer-group`, `.drawer-intro`, `.drawer-advanced`, `.kicker`, `.history-toggle`, `.small-btn`, `.copilot-banner`, `.stage-preview`, `.mc-drawer`, `.drawer-select`, `.drawer-textarea`

**What to change (radius only, keep logic intact):**

| Selector | Old radius | New radius |
|---|---|---|
| `.nav-btn` | 14px | `var(--radius-interactive)` |
| `.tab-bar` | 16px | `var(--radius-sm)` |
| `.tab-bar-btn` | 12px | `var(--radius-interactive)` |
| `.tab-bar-btn.active` | same | add `box-shadow: var(--shadow-elev-1)` |
| `.preset-btn` | 999px | `var(--radius-interactive)` |
| `.drawer-pill` | 999px | `var(--radius-interactive)` |
| `.drawer-group` | 16px | `var(--radius-sm)` |
| `.drawer-intro` | 14px | `var(--radius-sm)` |
| `.drawer-advanced` | 14px | `var(--radius-sm)` |
| `.kicker` | 999px | `var(--radius-interactive)` |
| `.history-toggle` | 6px | `var(--radius-interactive)` |
| `.small-btn` (inline) | 8px | `var(--radius-interactive)` |
| `.copilot-banner` | `var(--radius-md)` | `var(--radius-sm)` |
| `.stage-preview` | 8px | `var(--radius-sm)` |
| `.drawer-select` | 10px | `var(--radius-sm)` |
| `.drawer-textarea` | 10px | `var(--radius-sm)` |
| `.provider-metric-grid .stat` | 12px | `var(--radius-sm)` |

Also update `.tab-bar`:
```css
.tab-bar {
    display: flex;
    gap: 6px;
    padding: 4px;
    border-radius: var(--radius-sm);
    background: var(--panel-strong);
    border: 1px solid var(--glass-border);
    box-shadow: var(--shadow-elev-1);
    overflow-x: auto;
    scrollbar-width: none;
}
```

Also update `.mc-drawer`:
```css
.mc-drawer {
    display: grid;
    gap: 0;
    margin-bottom: 12px;
    background: var(--panel-glass);
    border: 1px solid var(--glass-border);
    border-top-color: color-mix(in srgb, var(--glass-border) 70%, rgba(255,255,255,0.12));
    box-shadow: var(--shadow-elev-2);
    animation: fade-in 140ms ease-out;
}
```

Also update `h3::before` (line 275-281) — change pill accent to square:
```css
h3::before {
    content: '';
    width: 3px;
    height: 16px;
    border-radius: 0;
    background: var(--accent);
}
```

**Step 1:** Edit each selector in `designSystem.ts`.

**Step 2: Commit**
```bash
git add src/webview/designSystem.ts
git commit -m "refactor(design): sharpen small interactive elements to right-angle style"
```

---

### Task 5: Final visual polish

**File:**
- Modify: `src/webview/designSystem.ts`

**What to change:**

1. **Scrollbar thumb** — remove `border-radius: 999px` for square thumb (line 101):
```css
::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--vscode-scrollbarSlider-background, rgba(121,121,121,0.4)) 90%, transparent);
    border-radius: 0;
}
```

2. **history-entry--child** left border (line 976) — update border-radius:
```css
.history-entry--child {
    border-left: 2px solid var(--glass-border);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
```

3. **`prefers-reduced-transparency` media query** — update to use new vars:
```css
@media (prefers-reduced-transparency: reduce) {
    .glass-panel, .card {
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        background: var(--vscode-editor-background, #1f1f1f) !important;
        box-shadow: none !important;
    }
    .cursor-halo, .blob {
        display: none !important;
    }
}
```

4. **`.drawer-close` button** — add `border-radius: var(--radius-interactive)` and relief:
```css
.drawer-close {
    width: auto;
    padding: 7px 11px;
    font-size: 0.78rem;
    line-height: 1;
    background: linear-gradient(180deg, color-mix(in srgb, var(--button-secondary-bg) 100%, rgba(255,255,255,0.06)) 0%, var(--button-secondary-bg) 100%);
    color: var(--button-secondary-fg);
    border: 1px solid transparent;
    border-radius: var(--radius-interactive);
    box-shadow: var(--btn-highlight), var(--shadow-elev-1);
}
```

**Step 1:** Apply all 4 polish changes.

**Step 2: Commit**
```bash
git add src/webview/designSystem.ts
git commit -m "refactor(design): final polish - scrollbar, child borders, reduced-transparency"
```

---

## Testing

After each task, test visually in VS Code:
1. Press `F5` to launch Extension Development Host
2. Run command `AI Context Orchestrator: Init Workflow`
3. Check: panels have sharp corners, buttons show gradient/press, cards have visible shadow
4. Switch VS Code theme (Dark+, Light+, One Dark) — verify colors adapt via `--vscode-*` variables
5. Check `prefers-reduced-transparency` via DevTools emulation
