import * as vscode from 'vscode';
import type { WorkspaceMode, WorkspaceModeDefinition, WorkspaceModeState } from './types.js';

const WORKSPACE_MODE_STORAGE_PREFIX = 'aiContextOrchestrator.workspaceMode';

export const WORKSPACE_MODE_DEFINITIONS: Record<WorkspaceMode, WorkspaceModeDefinition> = {
	code: {
		mode: 'code',
		label: 'Code / programmation',
		description: 'Orchestration IA complète pour les projets de développement.',
		detail: 'Conserve le comportement actuel: workflows, providers, comptes, modèles et handoffs.',
		supportsLearningDocuments: false
	},
	research: {
		mode: 'research',
		label: 'Recherche',
		description: 'Assistant documentaire pour sources, reformulation et structuration.',
		detail: 'Expose une expérience orientée documents et préparation de livrables structurés.',
		supportsLearningDocuments: true
	},
	study: {
		mode: 'study',
		label: 'Études / scolaire',
		description: 'Assistant de vulgarisation, de prise de notes et de restructuration.',
		detail: 'Pensé pour les cours, fiches, notes brutes et documents pédagogiques.',
		supportsLearningDocuments: true
	},
	blank: {
		mode: 'blank',
		label: 'Vierge / à initialiser',
		description: 'Initialise un espace de travail documentaire avec prompts et structure de base.',
		detail: 'Prépare un premier document learning-kit et la configuration IA associée.',
		supportsLearningDocuments: true
	}
};

function getWorkspaceModeStorageKey(folder: vscode.WorkspaceFolder): string {
	return `${WORKSPACE_MODE_STORAGE_PREFIX}:${folder.uri.toString()}`;
}

export function getWorkspaceModeDefinition(mode: WorkspaceMode): WorkspaceModeDefinition {
	return WORKSPACE_MODE_DEFINITIONS[mode];
}

export function getWorkspaceModeLabel(mode: WorkspaceMode): string {
	return getWorkspaceModeDefinition(mode).label;
}

export function supportsLearningDocuments(mode: WorkspaceMode): boolean {
	return getWorkspaceModeDefinition(mode).supportsLearningDocuments;
}

export function getWorkspaceModeState(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder
): WorkspaceModeState | undefined {
	return context.workspaceState.get<WorkspaceModeState>(getWorkspaceModeStorageKey(workspaceFolder));
}

export async function setWorkspaceModeState(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder,
	mode: WorkspaceMode
): Promise<WorkspaceModeState> {
	const previousState = getWorkspaceModeState(context, workspaceFolder);
	const timestamp = new Date().toISOString();
	const nextState: WorkspaceModeState = {
		mode,
		selectedAt: previousState?.selectedAt ?? timestamp,
		updatedAt: timestamp
	};

	await context.workspaceState.update(getWorkspaceModeStorageKey(workspaceFolder), nextState);
	return nextState;
}

export async function clearWorkspaceModeState(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
	await context.workspaceState.update(getWorkspaceModeStorageKey(workspaceFolder), undefined);
}

export async function promptForWorkspaceMode(currentMode?: WorkspaceMode): Promise<WorkspaceMode | undefined> {
	const selection = await vscode.window.showQuickPick(
		(Object.values(WORKSPACE_MODE_DEFINITIONS) as WorkspaceModeDefinition[]).map((definition) => ({
			label: definition.label,
			description: definition.description,
			detail: definition.detail,
			picked: definition.mode === currentMode,
			mode: definition.mode
		})),
		{
			title: currentMode ? 'Changer le type de workspace' : 'Type de workspace',
			placeHolder: currentMode
				? 'Choisissez le mode qui correspond le mieux à ce workspace'
				: 'Choisissez le type de répertoire dans lequel vous travaillez',
			ignoreFocusOut: true
		}
	);

	return selection?.mode as WorkspaceMode | undefined;
}

export async function ensureWorkspaceMode(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder,
	options?: { forcePrompt?: boolean }
): Promise<WorkspaceModeState | undefined> {
	const existingState = getWorkspaceModeState(context, workspaceFolder);
	if (existingState && !options?.forcePrompt) {
		return existingState;
	}

	const selectedMode = await promptForWorkspaceMode(existingState?.mode);
	if (!selectedMode) {
		return existingState;
	}

	return setWorkspaceModeState(context, workspaceFolder, selectedMode);
}