import * as vscode from 'vscode';
import { buildWorkspaceUri } from '../../core/workspace.js';
import type { ArtifactGovernancePolicy } from './types.js';
import { GITIGNORE_MANAGED_PATHS } from './constants.js';

const GITIGNORE_BLOCK_MARKER = '# ai-context-orchestrator';

async function readGitignoreContent(workspaceFolder: vscode.WorkspaceFolder): Promise<string | undefined> {
	const gitignoreUri = buildWorkspaceUri(workspaceFolder.uri, '.gitignore');
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

export async function appendGitignoreRules(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const gitignoreUri = buildWorkspaceUri(workspaceFolder.uri, '.gitignore');
	if (!gitignoreUri) {
		throw new Error('Unable to resolve .gitignore path.');
	}

	const existing = await readGitignoreContent(workspaceFolder) ?? '';
	if (existing.includes(GITIGNORE_BLOCK_MARKER)) {
		return;
	}

	const block = [
		'',
		GITIGNORE_BLOCK_MARKER,
		...GITIGNORE_MANAGED_PATHS,
		''
	].join('\n');

	const next = (existing.trimEnd() + '\n' + block).trimStart() + '\n';
	await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(next, 'utf8'));
}

export async function detectGovernancePolicy(workspaceFolder: vscode.WorkspaceFolder): Promise<ArtifactGovernancePolicy> {
	const content = await readGitignoreContent(workspaceFolder);
	const gitignoreExists = content !== undefined;
	const hasBlock = content?.includes(GITIGNORE_BLOCK_MARKER) ?? false;
	const managedPathsCovered = hasBlock && GITIGNORE_MANAGED_PATHS.every((path) => content?.includes(path));
	return { gitignoreExists, hasBlock, managedPathsCovered };
}
