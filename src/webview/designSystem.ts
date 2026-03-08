import * as vscode from 'vscode';

export interface DesignShellOptions {
	webview: vscode.Webview;
	nonce: string;
	title: string;
	subtitle?: string;
	kicker?: string;
	navigationHtml?: string;
	contentHtml: string;
	scriptBody?: string;
	layout?: 'sidebar' | 'panel';
}

export function renderDesignShellDocument(options: DesignShellOptions): string {
	const {
		webview,
		nonce,
		title,
		subtitle,
		kicker,
		navigationHtml,
		contentHtml,
		scriptBody,
		layout = 'sidebar'
	} = options;

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeAttribute(title)}</title>
<style>
	:root {
		color-scheme: light dark;
		--bg-color: var(--vscode-editor-background, #1e1e1e);
		--panel-bg: var(--vscode-sideBar-background, #252526);
		--panel-strong: color-mix(in srgb, var(--vscode-sideBar-background, #252526) 92%, var(--vscode-editorWidget-background, #2d2d30) 8%);
		--panel-soft: color-mix(in srgb, var(--vscode-sideBar-background, #252526) 88%, var(--vscode-list-hoverBackground, rgba(255,255,255,0.04)) 12%);
		--panel-elevated: var(--vscode-editorWidget-background, #252526);
		--glass-border: var(--vscode-panel-border, rgba(128,128,128,0.35));
		--accent: var(--vscode-focusBorder, #007fd4);
		--accent-dark: var(--vscode-button-background, #0e639c);
		--accent-glow: color-mix(in srgb, var(--vscode-focusBorder, #007fd4) 35%, transparent);
		--focus-ring: 0 0 0 1px var(--vscode-focusBorder, #007fd4);
		--text-primary: var(--vscode-foreground, #cccccc);
		--text-secondary: var(--vscode-descriptionForeground, #9d9d9d);
		--text-muted: var(--vscode-disabledForeground, #7f7f7f);
		--text-body: var(--vscode-foreground, #cccccc);
		--button-primary-bg: var(--vscode-button-background, #0e639c);
		--button-primary-fg: var(--vscode-button-foreground, #ffffff);
		--button-primary-hover: var(--vscode-button-hoverBackground, #1177bb);
		--button-secondary-bg: var(--vscode-button-secondaryBackground, #3a3d41);
		--button-secondary-fg: var(--vscode-button-secondaryForeground, #ffffff);
		--button-secondary-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
		--input-bg: var(--vscode-input-background, #3c3c3c);
		--input-fg: var(--vscode-input-foreground, #cccccc);
		--input-border: var(--vscode-input-border, rgba(0,0,0,0));
		--hover-bg: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04));
		--active-bg: var(--vscode-list-activeSelectionBackground, rgba(14,99,156,0.35));
		--active-fg: var(--vscode-list-activeSelectionForeground, #ffffff);
		--badge-bg: var(--vscode-badge-background, #4d4d4d);
		--badge-fg: var(--vscode-badge-foreground, #ffffff);
		--font-family: "Segoe UI", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
		--spacing-xs: 0.5rem;
		--spacing-sm: 1rem;
		--spacing-md: 1.5rem;
		--spacing-lg: 2.25rem;
		--radius-sm: 8px;
		--radius-md: 14px;
		--radius-lg: 24px;
		--shadow-soft: 0 18px 48px rgba(0,0,0,0.24), 0 6px 16px rgba(0,0,0,0.18);
		--shadow-glow: 0 0 0 1px rgba(255,255,255,0.03), 0 0 24px rgba(214, 117, 86, 0.06);
	}
	body {
		margin: 0;
		min-height: 100vh;
		font-family: var(--font-family);
		background: var(--bg-color);
		color: var(--text-body);
		line-height: 1.6;
		overflow-x: hidden;
	}
	button,
	input,
	textarea,
	select {
		font: inherit;
	}
	::-webkit-scrollbar {
		width: 8px;
		height: 8px;
	}
	::-webkit-scrollbar-track {
		background: transparent;
	}
	::-webkit-scrollbar-thumb {
		background: color-mix(in srgb, var(--vscode-scrollbarSlider-background, rgba(121,121,121,0.4)) 90%, transparent);
		border-radius: 999px;
	}
	::-webkit-scrollbar-thumb:hover {
		background: var(--vscode-scrollbarSlider-hoverBackground, rgba(100,100,100,0.7));
	}
	.cursor-halo,
	.blob {
		display: none;
	}
	.blob.blob-1 {
		top: -100px;
		right: -80px;
	}
	.blob.blob-2 {
		left: -120px;
		bottom: -120px;
	}
	.app-shell {
		position: relative;
		z-index: 1;
		display: grid;
		gap: var(--spacing-md);
		padding: 16px;
	}
	.app-shell.layout-panel {
		grid-template-columns: clamp(220px, 24vw, 300px) minmax(0, 1fr);
		align-items: start;
	}
	.app-shell.layout-sidebar {
		grid-template-columns: minmax(0, 1fr);
	}
	.glass-panel {
		position: relative;
		background: var(--panel-bg);
		border: 1px solid var(--glass-border);
		border-top-color: var(--glass-border);
		border-radius: var(--radius-lg);
		box-shadow: 0 1px 2px rgba(0,0,0,0.16);
		overflow: hidden;
		transform: translateZ(0);
		will-change: transform;
	}
	.sidebar-shell {
		display: grid;
		gap: var(--spacing-md);
		padding: 18px;
	}
	.layout-panel .sidebar-shell {
		position: sticky;
		top: 16px;
		max-height: calc(100vh - 32px);
		overflow: auto;
	}
	.sidebar-header {
		display: grid;
		gap: 8px;
	}
	.sidebar-header h1 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 800;
		color: var(--text-primary);
		letter-spacing: 0.02em;
	}
	.sidebar-header p {
		margin: 0;
		font-size: 0.92rem;
		color: var(--text-secondary);
	}
	.kicker {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		width: fit-content;
		padding: 4px 8px;
		border-radius: 999px;
		background: var(--badge-bg);
		border: 1px solid transparent;
		color: var(--badge-fg);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		text-transform: none;
	}
	.nav-links {
		display: grid;
		gap: 10px;
	}
	.nav-btn {
		appearance: none;
		width: 100%;
		text-align: left;
		padding: 12px 14px;
		border-radius: 14px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-body);
		cursor: pointer;
		transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
	}
	.nav-btn:hover {
		transform: none;
		background: var(--hover-bg);
		border-color: transparent;
	}
	.nav-btn.active,
	.nav-btn[data-emphasis="strong"] {
		background: var(--active-bg);
		border-color: transparent;
		color: var(--active-fg);
		box-shadow: none;
	}
	.nav-btn strong,
	.nav-btn span {
		display: block;
	}
	.nav-btn strong {
		font-size: 0.92rem;
		font-weight: 700;
	}
	.nav-btn span {
		font-size: 0.78rem;
		margin-top: 4px;
		color: var(--text-secondary);
	}
	.main-shell {
		display: grid;
		gap: var(--spacing-md);
		min-width: 0;
	}
	.layout-panel .main-shell {
		min-height: calc(100vh - 32px);
	}
	.content-wrapper {
		display: grid;
		gap: 14px;
		padding: 18px;
	}
	.layout-panel .content-wrapper {
		min-height: calc(100vh - 32px);
		align-content: start;
	}
	.card {
		background: var(--panel-strong);
		border: 1px solid var(--glass-border);
		border-top-color: var(--glass-border);
		border-radius: 18px;
		padding: 16px;
		box-shadow: none;
	}
	.hero {
		padding: 18px;
		background: var(--panel-elevated);
	}
	h1,
	h2,
	h3,
	p {
		margin: 0;
	}
	h2 {
		color: var(--text-primary);
		font-size: 1.02rem;
		font-weight: 800;
	}
	h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-primary);
		padding-top: 0;
	}
	h3::before {
		content: '';
		width: 3px;
		height: 16px;
		border-radius: 999px;
		background: var(--accent);
	}
	.lead {
		margin-top: 10px;
		color: var(--text-secondary);
		line-height: 1.55;
	}
	.small {
		font-size: 0.82rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}
	.grid,
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	.stat {
		padding: 12px;
		border-radius: 14px;
		background: var(--panel-soft);
		border: 1px solid var(--glass-border);
	}
	.stat strong {
		display: block;
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text-primary);
		margin-bottom: 4px;
	}
	.stat span {
		display: block;
		font-size: 0.78rem;
		color: var(--text-secondary);
	}
	.actions,
	.action-grid {
		display: grid;
		gap: 8px;
	}
	button {
		appearance: none;
		width: 100%;
		border: 1px solid transparent;
		border-radius: 12px;
		padding: 10px 12px;
		background: var(--button-primary-bg);
		color: var(--button-primary-fg);
		cursor: pointer;
		text-align: left;
		box-shadow: none;
		transition: background 120ms ease, border-color 120ms ease, opacity 120ms ease;
	}
	button:hover:not(:disabled) {
		transform: none;
		background: var(--button-primary-hover);
	}
	button:focus-visible,
	input:focus-visible,
	textarea:focus-visible,
	select:focus-visible,
	details summary:focus-visible {
		outline: none;
		box-shadow: var(--focus-ring);
	}
	button:disabled {
		cursor: default;
		opacity: 0.48;
	}
	button.secondary,
	.linkButton {
		background: var(--button-secondary-bg);
		color: var(--button-secondary-fg);
		border: 1px solid transparent;
		box-shadow: none;
	}
	button.secondary:hover:not(:disabled),
	.linkButton:hover:not(:disabled) {
		background: var(--button-secondary-hover);
		border-color: transparent;
	}
	.linkButton span {
		display: block;
		font-size: 0.75rem;
		margin-top: 4px;
		color: var(--text-secondary);
	}
	.shortcuts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.tab-bar {
		display: flex;
		gap: 6px;
		padding: 4px;
		border-radius: 16px;
		background: var(--panel-strong);
		border: 1px solid var(--glass-border);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tab-bar::-webkit-scrollbar {
		display: none;
	}
	.tab-bar-btn {
		appearance: none;
		white-space: nowrap;
		padding: 8px 14px;
		border-radius: 12px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 600;
		transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
		width: auto;
		box-shadow: none;
	}
	.tab-bar-btn:hover {
		background: var(--hover-bg);
		color: var(--text-body);
		transform: none;
	}
	.tab-bar-btn.active {
		background: var(--active-bg);
		border-color: transparent;
		color: var(--active-fg);
		box-shadow: none;
	}
	.tab-panel {
		display: none;
		gap: 14px;
	}
	.tab-panel.active {
		display: grid;
	}
	.section-anchor {
		scroll-margin-top: 18px;
	}
	@media (max-width: 680px) {
		.app-shell.layout-panel {
			grid-template-columns: minmax(0, 1fr);
		}
		.layout-panel .sidebar-shell {
			position: relative;
			top: auto;
			max-height: none;
		}
	}
	@media (max-width: 480px) {
		.app-shell {
			padding: 12px;
		}
		.grid,
		.stat-grid,
		.shortcuts {
			grid-template-columns: 1fr;
		}
	}
	@media (prefers-reduced-transparency: reduce) {
		.glass-panel, .card {
			backdrop-filter: none !important;
			-webkit-backdrop-filter: none !important;
			background: var(--vscode-editor-background, #1f1f1f) !important;
		}
		.cursor-halo, .blob {
			display: none !important;
		}
	}
	@keyframes bulb-pulse {
		0%, 75%, 100% { filter: brightness(0.6) drop-shadow(0 0 2px rgba(214,117,86,0.2)); }
		82% { filter: brightness(1.6) drop-shadow(0 0 10px rgba(214,117,86,1)) drop-shadow(0 0 22px rgba(214,117,86,0.55)); }
		88% { filter: brightness(0.9) drop-shadow(0 0 5px rgba(214,117,86,0.5)); }
		93% { filter: brightness(1.4) drop-shadow(0 0 8px rgba(214,117,86,0.8)); }
	}
	/* Mission Control */
	.mc-section {
		border-radius: var(--radius-md);
		background: var(--panel-strong);
		border: 1px solid var(--glass-border);
		margin-bottom: 6px;
		overflow: hidden;
	}
	.mc-section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 14px;
		cursor: pointer;
		list-style: none;
		user-select: none;
		font-size: 0.88rem;
		font-weight: 700;
		color: var(--text-primary);
	}
	.mc-section-header::-webkit-details-marker { display: none; }
	.mc-section-header:hover { background: var(--hover-bg); }
	.mc-section-title { flex: 1; }
	.mc-section-badge {
		font-size: 0.76rem;
		font-weight: 600;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 60%;
	}
	.mc-section-body { padding: 0 12px 12px; }
	.section-footnote {
		margin: 0 0 10px;
		font-size: 0.76rem;
		color: var(--text-secondary);
		line-height: 1.45;
	}
	.preset-selector {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}
	.preset-btn {
		appearance: none;
		padding: 5px 12px;
		border-radius: 999px;
		border: 1px solid var(--glass-border);
		background: var(--panel-soft);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.80rem;
		font-weight: 600;
		width: auto;
		box-shadow: none;
		transition: background 100ms, border-color 100ms, color 100ms;
	}
	.preset-btn:hover:not(:disabled) { background: var(--hover-bg); color: var(--text-body); transform: none; box-shadow: none; }
	.preset-btn.active {
		background: var(--active-bg);
		border-color: transparent;
		color: var(--active-fg);
		box-shadow: none;
		transform: none;
	}
	.stage-pills { display: grid; gap: 8px; }
	.stage-pill {
		border-radius: 12px;
		padding: 12px;
		border: 1px solid rgba(255,255,255,0.07);
		background: rgba(255,255,255,0.03);
	}
	.stage-pill.completed { border-color: color-mix(in srgb, var(--vscode-testing-iconPassed, #73c991) 40%, var(--glass-border)); background: color-mix(in srgb, var(--vscode-testing-iconPassed, #73c991) 12%, var(--panel-strong)); }
	.stage-pill.in-progress { border-color: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 42%, var(--glass-border)); background: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 12%, var(--panel-strong)); }
	.stage-meta-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.stage-badge {
		background: rgba(255,255,255,0.05);
		border-color: rgba(255,255,255,0.08);
		color: var(--text-secondary);
	}
	.stage-pill.in-progress .stage-badge {
		background: var(--badge-bg);
		border-color: transparent;
		color: var(--badge-fg);
	}
	.history-list { display: grid; gap: 8px; }
	.history-entry {
		border-radius: 12px;
		padding: 12px;
		border: 1px solid rgba(255,255,255,0.07);
		background: rgba(255,255,255,0.03);
	}
	.history-entry.active {
		border-color: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 42%, var(--glass-border));
		background: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 12%, var(--panel-strong));
	}
	.history-meta-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}
	.history-title {
		font-size: 0.84rem;
		font-weight: 700;
		color: var(--text-primary);
	}
	.history-badge {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 3px 8px;
		border-radius: 999px;
		background: var(--badge-bg);
		border: 1px solid transparent;
		color: var(--badge-fg);
		white-space: nowrap;
	}
	.history-summary {
		margin-top: 4px;
		font-size: 0.76rem;
		color: var(--text-secondary);
	}
	.history-lineage {
		margin-top: 4px;
		font-size: 0.74rem;
		color: var(--text-secondary);
	}
	.history-timestamp {
		margin-top: 2px;
		font-size: 0.74rem;
		color: var(--text-secondary);
	}
	.pill-label { display: block; font-size: 0.83rem; font-weight: 700; color: var(--text-primary); }
	.pill-status { display: block; font-size: 0.74rem; color: var(--text-secondary); margin-top: 2px; }
	.pill-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
	.small-btn { padding: 4px 10px !important; font-size: 0.76rem !important; border-radius: 8px !important; }
	.provider-row { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
	.provider-row:last-of-type { border-bottom: none; }
	.provider-card {
		padding: 12px;
		border-radius: 14px;
		background: var(--panel-soft);
		border: 1px solid var(--glass-border);
	}
	.provider-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.provider-title-row strong {
		font-size: 0.84rem;
		color: var(--text-primary);
	}
	.provider-badge {
		background: var(--badge-bg);
		border-color: transparent;
		color: var(--badge-fg);
	}
	.provider-detail {
		display: block;
		margin-top: 6px;
	}
	.provider-metric-grid {
		margin-top: 10px;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.provider-metric-grid .stat {
		padding: 10px;
		border-radius: 12px;
	}
	.provider-metric-grid .stat strong {
		font-size: 0.78rem;
		margin-bottom: 3px;
	}
	.provider-metric-grid .stat span {
		font-size: 0.73rem;
	}
	.provider-metric-grid .tone-warning {
		border-color: color-mix(in srgb, var(--vscode-testing-iconQueued, #cca700) 40%, var(--glass-border));
		background: color-mix(in srgb, var(--vscode-testing-iconQueued, #cca700) 12%, var(--panel-soft));
	}
	.provider-metric-grid .tone-critical {
		border-color: color-mix(in srgb, var(--vscode-errorForeground, #f14c4c) 45%, var(--glass-border));
		background: color-mix(in srgb, var(--vscode-errorForeground, #f14c4c) 12%, var(--panel-soft));
	}
	.provider-account-list {
		display: grid;
		gap: 8px;
		margin-top: 10px;
	}
	.provider-account {
		padding: 10px;
		border-radius: 12px;
		border: 1px solid rgba(255,255,255,0.07);
		background: rgba(255,255,255,0.03);
	}
	.provider-account.active {
		border-color: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 42%, var(--glass-border));
		background: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 10%, var(--panel-strong));
	}
	.provider-account-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}
	.provider-account-header strong {
		font-size: 0.79rem;
		color: var(--text-primary);
	}
	.provider-account-badges {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.provider-account-badge {
		font-size: 0.68rem;
		padding: 2px 7px;
	}
	.provider-account-summary {
		margin-top: 6px;
		font-size: 0.76rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.provider-account-detail {
		display: block;
		margin-top: 4px;
	}
	.provider-refresh-meta {
		display: block;
		margin-top: 8px;
	}
	.availability-ready {
		background: color-mix(in srgb, var(--vscode-testing-iconPassed, #73c991) 18%, var(--badge-bg));
	}
	.availability-warning,
	.availability-needs-config {
		background: color-mix(in srgb, var(--vscode-testing-iconQueued, #cca700) 18%, var(--badge-bg));
	}
	.availability-error,
	.availability-unavailable {
		background: color-mix(in srgb, var(--vscode-errorForeground, #f14c4c) 20%, var(--badge-bg));
	}
	.dense-actions {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.advanced-details summary { cursor: pointer; font-size: 0.80rem; color: var(--text-secondary); list-style: none; }
	.advanced-details summary::-webkit-details-marker { display: none; }
	.advanced-details summary:hover { color: var(--text-body); }
	/* Workflow launcher */
	.mc-drawer {
	  display: grid;
	  gap: 0;
	  margin-bottom: 12px;
	  background: var(--panel-elevated);
	  border: 1px solid var(--glass-border);
	  box-shadow: 0 1px 2px rgba(0,0,0,0.18);
	  animation: fade-in 140ms ease-out;
	}
	@keyframes fade-in {
	  from { opacity: 0; transform: translateY(6px); }
	  to   { opacity: 1; transform: translateY(0); }
	}
	.drawer-header {
	  display: flex;
	  align-items: flex-start;
	  justify-content: space-between;
	  gap: 16px;
	  padding: 16px 18px 12px;
	  border-bottom: 1px solid rgba(255,255,255,0.08);
	  flex-shrink: 0;
	}
	.drawer-title {
	  font-size: 1rem;
	  font-weight: 800;
	  color: var(--text-primary);
	}
	.drawer-subtitle {
	  margin-top: 4px;
	  font-size: 0.80rem;
	  color: var(--text-secondary);
	  max-width: 44ch;
	}
	.drawer-close {
	  width: auto;
	  padding: 7px 11px;
	  font-size: 0.78rem;
	  line-height: 1;
	  background: var(--button-secondary-bg);
	  color: var(--button-secondary-fg);
	  border: 1px solid transparent;
	  box-shadow: none;
	}
	.drawer-close:hover { color: var(--button-secondary-fg); background: var(--button-secondary-hover); transform: none; box-shadow: none; }
	.drawer-body {
	  overflow-y: auto;
	  padding: 14px 18px 18px;
	  display: grid;
	  gap: 12px;
	  flex: 1;
	}
	.drawer-intro {
	  display: grid;
	  gap: 4px;
	  padding: 12px 14px;
	  border-radius: 14px;
	  background: var(--panel-soft);
	  border: 1px solid var(--glass-border);
	}
	.drawer-intro strong {
	  font-size: 0.84rem;
	  color: var(--text-primary);
	}
	.drawer-intro span {
	  font-size: 0.77rem;
	  color: var(--text-secondary);
	}
	.drawer-group {
	  display: grid;
	  gap: 12px;
	  padding: 14px;
	  border-radius: 16px;
	  background: var(--panel-soft);
	  border: 1px solid var(--glass-border);
	}
	.drawer-footer {
	  display: flex;
	  align-items: center;
	  justify-content: flex-end;
	  gap: 10px;
	  flex-wrap: wrap;
	  padding: 12px 18px 16px;
	  border-top: 1px solid var(--glass-border);
	}
	.drawer-field { display: grid; gap: 6px; }
	.drawer-label {
	  font-size: 0.76rem;
	  font-weight: 800;
	  color: var(--text-primary);
	  text-transform: uppercase;
	  letter-spacing: 0.06em;
	}
	.drawer-help {
	  margin: 0;
	  font-size: 0.78rem;
	  color: var(--text-secondary);
	}
	.drawer-hint {
	  font-size: 0.74rem;
	  color: var(--text-secondary);
	}
	.drawer-pills { display: flex; flex-wrap: wrap; gap: 6px; }
	.drawer-pill {
	  appearance: none;
	  padding: 7px 12px;
	  border-radius: 999px;
	  border: 1px solid var(--glass-border);
	  background: var(--panel-bg);
	  color: var(--text-body);
	  cursor: pointer;
	  font-size: 0.80rem;
	  font-weight: 600;
	  width: auto;
	  box-shadow: none;
	  transition: background 100ms, border-color 100ms, color 100ms;
	}
	.drawer-pill:hover:not(:disabled) { background: var(--hover-bg); color: var(--text-primary); transform: none; box-shadow: none; }
	.drawer-pill.active {
	  background: var(--active-bg);
	  border-color: transparent;
	  color: var(--active-fg);
	  transform: none;
	  box-shadow: none;
	}
	.drawer-select {
	  appearance: none;
	  width: 100%;
	  padding: 10px 12px;
	  border-radius: 10px;
	  border: 1px solid var(--input-border);
	  background: var(--input-bg);
	  color: var(--input-fg);
	  font: inherit;
	  font-size: 0.84rem;
	  cursor: pointer;
	}
	.drawer-textarea {
	  width: 100%;
	  min-height: 84px;
	  padding: 10px 12px;
	  border-radius: 10px;
	  border: 1px solid var(--input-border);
	  background: var(--input-bg);
	  color: var(--input-fg);
	  font: inherit;
	  font-size: 0.84rem;
	  resize: vertical;
	  box-sizing: border-box;
	}
	.drawer-advanced {
	  border-radius: 14px;
	  border: 1px solid var(--glass-border);
	  background: var(--panel-bg);
	  padding: 0 14px;
	}
	.drawer-advanced summary {
	  display: flex;
	  align-items: center;
	  justify-content: space-between;
	  gap: 10px;
	  padding: 12px 0;
	  font-size: 0.82rem;
	  font-weight: 700;
	  color: var(--text-body);
	}
	.drawer-summary-chip {
	  display: inline-flex;
	  align-items: center;
	  justify-content: center;
	  padding: 4px 8px;
	  border-radius: 999px;
	  border: 1px solid transparent;
	  background: var(--badge-bg);
	  font-size: 0.72rem;
	  color: var(--badge-fg);
	  white-space: nowrap;
	}
	.drawer-advanced-body {
	  display: grid;
	  gap: 12px;
	  padding: 0 0 14px;
	}
	.drawer-utility-row {
	  display: flex;
	  align-items: center;
	  justify-content: space-between;
	  gap: 12px;
	  flex-wrap: wrap;
	}
	.drawer-validation {
	  margin-right: auto;
	  font-size: 0.76rem;
	  color: var(--text-secondary);
	}
	.shortcuts {
		grid-template-columns: 1fr;
	}
	/* History tree */
	.history-entry--child {
		border-left: 2px solid var(--glass-border);
		border-radius: 0 12px 12px 0;
	}
	.history-entry--orphan {
		border-style: dashed;
		opacity: 0.8;
	}
	.history-tree-branch {
		font-size: 0.72rem;
		color: var(--text-muted);
		margin-right: 2px;
		user-select: none;
	}
	/* Stage preview */
	.stage-preview {
		margin-top: 8px;
		border-radius: 8px;
		border: 1px solid var(--glass-border);
		overflow: hidden;
	}
	.stage-preview summary {
		padding: 6px 10px;
		font-size: 0.76rem;
		font-weight: 600;
		color: var(--text-secondary);
		cursor: pointer;
		list-style: none;
		user-select: none;
	}
	.stage-preview summary::-webkit-details-marker { display: none; }
	.stage-preview summary:hover { color: var(--text-body); background: var(--hover-bg); }
	.stage-preview-body {
		padding: 8px 10px;
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 0.74rem;
		color: var(--text-secondary);
		white-space: pre-wrap;
		max-height: 200px;
		overflow-y: auto;
		border-top: 1px solid var(--glass-border);
		background: var(--panel-bg);
	}
	/* Copilot banner */
	.copilot-banner {
		padding: 12px 14px;
		border-radius: var(--radius-md);
		border: 1px solid color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 42%, var(--glass-border));
		background: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 10%, var(--panel-strong));
		margin-bottom: 6px;
	}
	.copilot-banner-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.copilot-banner-title {
		font-size: 0.84rem;
		font-weight: 700;
		color: var(--text-primary);
	}
	.copilot-banner-steps {
		margin: 6px 0 0;
		font-size: 0.78rem;
		color: var(--text-secondary);
	}
	kbd {
		display: inline-block;
		padding: 1px 5px;
		border-radius: 4px;
		border: 1px solid var(--glass-border);
		background: var(--panel-bg);
		font-family: monospace;
		font-size: 0.72rem;
		color: var(--text-body);
	}
	@media (max-width: 480px) {
	  .drawer-header,
	  .drawer-body,
	  .drawer-footer {
		padding-left: 14px;
		padding-right: 14px;
	  }
	  .drawer-group,
	  .drawer-advanced {
		padding-left: 12px;
		padding-right: 12px;
	  }
	  .dense-actions {
		grid-template-columns: 1fr;
	  }
	}
</style>
</head>
<body>
	<div class="blob blob-1"></div>
	<div class="blob blob-2"></div>
	<div class="cursor-halo" id="cursor-halo"></div>
	<div class="app-shell layout-${layout}">
		${navigationHtml
			? `<aside class="glass-panel sidebar-shell"><div class="sidebar-header">${kicker ? `<div class="kicker">${kicker}</div>` : ''}<h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div><div class="nav-links">${navigationHtml}</div></aside>`
			: ''}
		<main class="main-shell">
			${!navigationHtml
				? `<section class="glass-panel sidebar-shell"><div class="sidebar-header">${kicker ? `<div class="kicker">${kicker}</div>` : ''}<h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div></section>`
				: ''}
			<div class="glass-panel content-wrapper">
				${contentHtml}
			</div>
		</main>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const halo = document.getElementById('cursor-halo');
		document.addEventListener('mousemove', (event) => {
			halo.style.left = String(event.clientX) + 'px';
			halo.style.top = String(event.clientY) + 'px';
		});
		for (const button of document.querySelectorAll('button[data-command]')) {
			button.addEventListener('click', () => {
				if (button.disabled) {
					return;
				}
				vscode.postMessage({ command: button.dataset.command, provider: button.dataset.provider, target: button.dataset.target });
			});
		}
		for (const button of document.querySelectorAll('button[data-scroll-target]')) {
			button.addEventListener('click', () => {
				const target = document.getElementById(button.dataset.scrollTarget || '');
				if (!target) {
					return;
				}
				target.scrollIntoView({ behavior: 'smooth', block: 'start' });
				for (const item of document.querySelectorAll('button[data-scroll-target]')) {
					item.classList.remove('active');
				}
				button.classList.add('active');
			});
		}
		const tabButtons = Array.from(document.querySelectorAll('button[data-tab-target]'));
		const tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));
		const activateTab = (targetId) => {
			for (const item of tabButtons) {
				item.classList.toggle('active', item.dataset.tabTarget === targetId);
			}
			for (const panel of tabPanels) {
				panel.classList.toggle('active', panel.getAttribute('data-tab-panel') === targetId);
			}
		};
		for (const button of tabButtons) {
			button.addEventListener('click', () => {
				const targetId = button.dataset.tabTarget;
				if (!targetId) {
					return;
				}
				activateTab(targetId);
			});
		}
		if (tabButtons.length > 0 && tabPanels.length > 0) {
			const initialButton = tabButtons.find((button) => button.classList.contains('active')) || tabButtons[0];
			if (initialButton?.dataset.tabTarget) {
				activateTab(initialButton.dataset.tabTarget);
			}
		}
		${scriptBody ?? ''}
	</script>
</body>
</html>`;
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
