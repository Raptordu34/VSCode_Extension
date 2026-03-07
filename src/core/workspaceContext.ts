import * as vscode from 'vscode';

const SELECTED_WORKSPACE_FOLDER_KEY = 'aiContextOrchestrator.selectedWorkspaceFolder';

function getFolderStorageKey(folder: vscode.WorkspaceFolder): string {
	return folder.uri.toString();
}

function findWorkspaceFolderByKey(folderKey: string | undefined): vscode.WorkspaceFolder | undefined {
	if (!folderKey) {
		return undefined;
	}

	return vscode.workspace.workspaceFolders?.find((folder) => getFolderStorageKey(folder) === folderKey);
}

export function getStoredWorkspaceFolder(context: vscode.ExtensionContext): vscode.WorkspaceFolder | undefined {
	return findWorkspaceFolderByKey(context.workspaceState.get<string>(SELECTED_WORKSPACE_FOLDER_KEY));
}

export async function rememberWorkspaceFolder(context: vscode.ExtensionContext, folder: vscode.WorkspaceFolder): Promise<void> {
	await context.workspaceState.update(SELECTED_WORKSPACE_FOLDER_KEY, getFolderStorageKey(folder));
}

export function getImplicitWorkspaceFolder(context?: vscode.ExtensionContext): vscode.WorkspaceFolder | undefined {
	const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
	if (workspaceFolders.length === 0) {
		return undefined;
	}

	if (workspaceFolders.length === 1) {
		return workspaceFolders[0];
	}

	const activeFolder = vscode.window.activeTextEditor
		? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
		: undefined;
	if (activeFolder) {
		return activeFolder;
	}

	return context ? getStoredWorkspaceFolder(context) : undefined;
}

export interface ResolveWorkspaceFolderOptions {
	placeHolder?: string;
	showWarning?: boolean;
	targetUri?: vscode.Uri;
}

export async function resolveWorkspaceFolder(
	context: vscode.ExtensionContext,
	options: ResolveWorkspaceFolderOptions = {}
): Promise<vscode.WorkspaceFolder | undefined> {
	const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
	if (workspaceFolders.length === 0) {
		if (options.showWarning) {
			void vscode.window.showWarningMessage('Open a workspace folder before running AI Context Orchestrator.');
		}
		return undefined;
	}

	if (options.targetUri) {
		const targetFolder = vscode.workspace.getWorkspaceFolder(options.targetUri);
		if (targetFolder) {
			await rememberWorkspaceFolder(context, targetFolder);
			return targetFolder;
		}
	}

	const implicitFolder = getImplicitWorkspaceFolder(context);
	if (implicitFolder) {
		await rememberWorkspaceFolder(context, implicitFolder);
		return implicitFolder;
	}

	const selection = await vscode.window.showQuickPick(
		workspaceFolders.map((folder) => ({
			label: folder.name,
			detail: folder.uri.fsPath,
			folder
		})),
		{
			title: 'Workspace Folder',
			placeHolder: options.placeHolder ?? 'Choose the workspace folder to use for this workflow',
			ignoreFocusOut: true
		}
	);

	if (!selection?.folder) {
		return undefined;
	}

	await rememberWorkspaceFolder(context, selection.folder);
	return selection.folder;
}