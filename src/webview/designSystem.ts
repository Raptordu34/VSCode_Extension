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
		--bg-color: var(--vscode-editor-background, #262624);
		--panel-bg: color-mix(in srgb, var(--vscode-sideBar-background, #1f1f1f) 78%, rgba(48, 48, 46, 0.55));
		--panel-strong: color-mix(in srgb, var(--vscode-sideBar-background, #1f1f1f) 88%, rgba(48, 48, 46, 0.72));
		--panel-soft: color-mix(in srgb, var(--vscode-sideBar-background, #1f1f1f) 68%, rgba(48, 48, 46, 0.35));
		--glass-border: color-mix(in srgb, var(--vscode-panel-border, rgba(255,255,255,0.12)) 72%, rgba(255,255,255,0.12));
		--accent: #d67556;
		--accent-dark: #c4643f;
		--accent-glow: rgba(214, 117, 86, 0.28);
		--text-primary: var(--vscode-foreground, #f5f3f0);
		--text-secondary: var(--vscode-descriptionForeground, #9e9a94);
		--text-muted: color-mix(in srgb, var(--vscode-descriptionForeground, #c4c0ba) 88%, white 12%);
		--text-body: color-mix(in srgb, var(--vscode-foreground, #dedad5) 92%, white 8%);
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
		background:
			radial-gradient(circle at top right, rgba(214, 117, 86, 0.16), transparent 24%),
			radial-gradient(circle at bottom left, rgba(214, 117, 86, 0.10), transparent 22%),
			var(--bg-color);
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
		background: rgba(214, 117, 86, 0.35);
		border-radius: 999px;
	}
	::-webkit-scrollbar-thumb:hover {
		background: rgba(214, 117, 86, 0.58);
	}
	.cursor-halo {
		position: fixed;
		left: 0;
		top: 0;
		width: 220px;
		height: 220px;
		pointer-events: none;
		transform: translate(-50%, -50%);
		border-radius: 999px;
		background: radial-gradient(circle, rgba(214, 117, 86, 0.12) 0%, rgba(214, 117, 86, 0.06) 34%, transparent 70%);
		filter: blur(2px);
		opacity: 0.9;
		z-index: 0;
	}
	.blob {
		position: fixed;
		width: 280px;
		height: 280px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(214, 117, 86, 0.16) 0%, rgba(214, 117, 86, 0.04) 55%, transparent 76%);
		filter: blur(20px);
		pointer-events: none;
		z-index: 0;
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
		background: linear-gradient(160deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 28%, transparent 62%), var(--panel-bg);
		border: 1px solid var(--glass-border);
		border-top-color: rgba(255,255,255,0.16);
		border-radius: var(--radius-lg);
		backdrop-filter: blur(18px) saturate(135%);
		-webkit-backdrop-filter: blur(18px) saturate(135%);
		box-shadow: var(--shadow-soft), var(--shadow-glow);
		overflow: hidden;
		transform: translateZ(0);
		will-change: transform, backdrop-filter;
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
		padding: 7px 11px;
		border-radius: 999px;
		background: rgba(214, 117, 86, 0.12);
		border: 1px solid rgba(214, 117, 86, 0.24);
		color: #f2b59e;
		font-size: 0.74rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
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
		border: 1px solid rgba(255,255,255,0.08);
		background: rgba(255,255,255,0.04);
		color: var(--text-body);
		cursor: pointer;
		transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
	}
	.nav-btn:hover {
		transform: translateY(-1px);
		background: rgba(214, 117, 86, 0.10);
		border-color: rgba(214, 117, 86, 0.24);
	}
	.nav-btn.active,
	.nav-btn[data-emphasis="strong"] {
		background: linear-gradient(160deg, rgba(214, 117, 86, 0.18) 0%, rgba(214, 117, 86, 0.08) 100%);
		border-color: rgba(214, 117, 86, 0.34);
		color: var(--text-primary);
		box-shadow: 0 0 16px rgba(214, 117, 86, 0.08);
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
		background: linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 26%, transparent 68%), var(--panel-strong);
		border: 1px solid rgba(255,255,255,0.08);
		border-top-color: rgba(255,255,255,0.14);
		border-radius: 18px;
		padding: 16px;
		box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
	}
	.hero {
		padding: 18px;
		background: linear-gradient(145deg, rgba(214, 117, 86, 0.22), rgba(255,255,255,0.03) 55%, rgba(0,0,0,0.04));
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
		position: relative;
		display: inline-block;
		padding-bottom: 10px;
	}
	h2::after {
		content: '';
		position: absolute;
		left: 0;
		bottom: 0;
		width: 62%;
		height: 4px;
		border-radius: 999px;
		background: var(--accent);
		box-shadow: 0 0 14px var(--accent-glow);
	}
	@keyframes water-ripple {
		0%,100% { box-shadow: 0 0 10px var(--accent-glow), 0 0 0 0 rgba(214,117,86,0); transform: scale(1); }
		8% { box-shadow: 0 0 18px rgba(214,117,86,0.9), 0 0 0 0 rgba(214,117,86,0.18); transform: scale(1.24); }
		18% { box-shadow: 0 0 10px var(--accent-glow), 0 0 0 10px rgba(214,117,86,0); transform: scale(1); }
	}
	h3 {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-primary);
		padding-top: 8px;
	}
	h3::before {
		content: '';
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 10px var(--accent-glow);
		animation: water-ripple 5.5s ease-out infinite;
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
		background: color-mix(in srgb, var(--panel-soft) 85%, rgba(255,255,255,0.03));
		border: 1px solid rgba(255,255,255,0.06);
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
		border: 0;
		border-radius: 12px;
		padding: 10px 12px;
		background: linear-gradient(160deg, rgba(214,117,86,0.95), rgba(196,100,63,0.95));
		color: #fff7f2;
		cursor: pointer;
		text-align: left;
		box-shadow: 0 8px 24px rgba(214, 117, 86, 0.14);
		transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
	}
	button:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 10px 26px rgba(214, 117, 86, 0.20);
	}
	button:disabled {
		cursor: default;
		opacity: 0.48;
	}
	button.secondary,
	.linkButton {
		background: rgba(255,255,255,0.04);
		color: var(--text-body);
		border: 1px solid rgba(255,255,255,0.08);
		box-shadow: none;
	}
	button.secondary:hover:not(:disabled),
	.linkButton:hover:not(:disabled) {
		background: rgba(214, 117, 86, 0.10);
		border-color: rgba(214, 117, 86, 0.28);
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
		border: 1px solid rgba(255,255,255,0.06);
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
		background: rgba(214, 117, 86, 0.08);
		color: var(--text-body);
		transform: none;
	}
	.tab-bar-btn.active {
		background: linear-gradient(160deg, rgba(214, 117, 86, 0.20) 0%, rgba(214, 117, 86, 0.10) 100%);
		border-color: rgba(214, 117, 86, 0.30);
		color: var(--text-primary);
		box-shadow: 0 0 12px rgba(214, 117, 86, 0.06);
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
		border: 1px solid rgba(255,255,255,0.07);
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
	.mc-section-header:hover { background: rgba(214,117,86,0.06); }
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
	.preset-btn:hover:not(:disabled) { background: rgba(214,117,86,0.10); color: var(--text-body); transform: none; box-shadow: none; }
	.preset-btn.active {
		background: linear-gradient(160deg, rgba(214,117,86,0.22), rgba(214,117,86,0.10));
		border-color: rgba(214,117,86,0.40);
		color: var(--text-primary);
		box-shadow: none;
		transform: none;
	}
	.stage-pills { display: grid; gap: 6px; }
	.stage-pill {
		border-radius: 10px;
		padding: 8px 10px;
		border: 1px solid rgba(255,255,255,0.07);
		background: rgba(255,255,255,0.03);
	}
	.stage-pill.completed { border-color: rgba(100,200,100,0.20); background: rgba(100,200,100,0.05); }
	.stage-pill.in-progress { border-color: rgba(214,117,86,0.30); background: rgba(214,117,86,0.07); }
	.pill-label { display: block; font-size: 0.83rem; font-weight: 700; color: var(--text-primary); }
	.pill-status { display: block; font-size: 0.74rem; color: var(--text-secondary); margin-top: 2px; }
	.pill-actions { display: flex; gap: 6px; margin-top: 6px; }
	.small-btn { padding: 4px 10px !important; font-size: 0.76rem !important; border-radius: 8px !important; }
	.provider-row { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
	.provider-row:last-of-type { border-bottom: none; }
	.advanced-details summary { cursor: pointer; font-size: 0.80rem; color: var(--text-secondary); list-style: none; }
	.advanced-details summary::-webkit-details-marker { display: none; }
	.advanced-details summary:hover { color: var(--text-body); }
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
