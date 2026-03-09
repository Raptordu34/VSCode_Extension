import * as vscode from 'vscode';
import { buildWorkspaceUri, readUtf8 } from '../../core/workspace.js';
import { PROJECT_MEMORY_FILE } from '../workflow/constants.js';
import type { WorkflowBrief, WorkflowSessionState } from '../workflow/types.js';

function toUtf8Bytes(content: string): Uint8Array {
	return Buffer.from(content, 'utf8');
}

function uniquePreservingOrder(values: string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const value of values) {
		if (!value || seen.has(value)) {
			continue;
		}
		seen.add(value);
		unique.push(value);
	}
	return unique;
}

export async function readProjectMemory(workspaceUri: vscode.Uri): Promise<string | undefined> {
	const memoryUri = buildWorkspaceUri(workspaceUri, PROJECT_MEMORY_FILE);
	if (!memoryUri) {
		return undefined;
	}

	try {
		const content = await readUtf8(memoryUri);
		return content.trim() || undefined;
	} catch {
		return undefined;
	}
}

export function buildProjectMemoryEntry(session: WorkflowSessionState, brief?: WorkflowBrief): string {
	const stageFiles = uniquePreservingOrder(session.stages.map((stage) => stage.stageFile));
	const artifactFiles = uniquePreservingOrder(session.stages.flatMap((stage) => stage.artifactFiles));
	const providers = uniquePreservingOrder(session.stages.map((stage) => stage.provider));
	const presets = session.stages.map((stage) => stage.preset).join(' -> ');
	const headline = brief?.goal ?? session.label ?? session.stages.at(-1)?.briefSummary ?? 'Workflow completed';

	return [
		`## ${new Date().toISOString()}`,
		`- Objective: ${headline}`,
		`- Workflow: ${session.workflowId ?? 'unknown'}`,
		`- Presets: ${presets}`,
		`- Providers: ${providers.join(', ') || 'unknown'}`,
		`- Stage files: ${stageFiles.join(', ') || 'none'}`,
		`- Artifact files: ${artifactFiles.join(', ') || 'none'}`,
		`- Summary: Completed ${session.stages.length} stage(s) and updated ${artifactFiles.length > 0 ? artifactFiles.length : stageFiles.length} tracked file(s).`,
		''
	].join('\n');
}

export async function appendProjectMemoryEntry(
	workspaceFolder: vscode.WorkspaceFolder,
	session: WorkflowSessionState,
	brief?: WorkflowBrief
): Promise<void> {
	const memoryUri = buildWorkspaceUri(workspaceFolder.uri, PROJECT_MEMORY_FILE);
	if (!memoryUri) {
		return;
	}

	const entry = buildProjectMemoryEntry(session, brief);
	let existing = '';
	try {
		existing = await readUtf8(memoryUri);
	} catch {
		existing = '# Project Memory\n\n';
	}

	const next = `${existing.trimEnd()}\n\n${entry}`.trimStart() + '\n';
	await vscode.workspace.fs.createDirectory(memoryUri.with({ path: memoryUri.path.slice(0, memoryUri.path.lastIndexOf('/')) }));
	await vscode.workspace.fs.writeFile(memoryUri, toUtf8Bytes(next));
}