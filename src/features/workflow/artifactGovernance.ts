import * as vscode from 'vscode';
import { buildWorkspaceUri } from '../../core/workspace.js';
import type { ArtifactGovernancePolicy } from './types.js';
import { GITIGNORE_BLOCK_MARKER, GITIGNORE_MANAGED_PATHS } from './constants.js';

async function readGitignoreContent(workspaceUri: vscode.Uri): Promise<string | undefined> {
	const gitignoreUri = buildWorkspaceUri(workspaceUri, '.gitignore');
	if (!gitignoreUri) {
		return undefined;
	}
	try {
		const bytes = await vscode.workspace.fs.readFile(gitignoreUri);
		return Buffer.from(bytes).toString('utf8');
	} catch {
		return undefined;
	}
}

function buildManagedBlock(paths: readonly string[]): string {
	return [
		GITIGNORE_BLOCK_MARKER,
		...paths,
		''
	].join('\n');
}

export async function ensureIgnoredArtifacts(workspaceUri: vscode.Uri): Promise<void> {
	const gitignoreUri = buildWorkspaceUri(workspaceUri, '.gitignore');
	if (!gitignoreUri) {
		throw new Error('Unable to resolve .gitignore path.');
	}

	const existing = await readGitignoreContent(workspaceUri) ?? '';
	const normalizedLines = existing
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const missingPaths = GITIGNORE_MANAGED_PATHS.filter((path) => !normalizedLines.includes(path));
	if (missingPaths.length === 0 && existing.includes(GITIGNORE_BLOCK_MARKER)) {
		return;
	}

	const block = buildManagedBlock(missingPaths.length > 0 ? missingPaths : GITIGNORE_MANAGED_PATHS);
	const prefix = existing.trimEnd();
	const next = prefix.length > 0
		? `${prefix}\n\n${block}`
		: `${block}`;
	await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(next, 'utf8'));
}

export async function appendGitignoreRules(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	await ensureIgnoredArtifacts(workspaceFolder.uri);
}

export async function detectGovernancePolicy(workspaceFolder: vscode.WorkspaceFolder): Promise<ArtifactGovernancePolicy> {
	const content = await readGitignoreContent(workspaceFolder.uri);
	const gitignoreExists = content !== undefined;
	const hasBlock = content?.includes(GITIGNORE_BLOCK_MARKER) ?? false;
	const managedPathsCovered = hasBlock && GITIGNORE_MANAGED_PATHS.every((path) => content?.includes(path));
	return { gitignoreExists, hasBlock, managedPathsCovered };
}
