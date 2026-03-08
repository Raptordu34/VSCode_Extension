import * as vscode from 'vscode';
import { EventBus } from '../../core/eventBus.js';
import { resolveWorkspaceFolder } from '../../core/workspaceContext.js';
import { supportsLearningDocuments, ensureWorkspaceMode, getWorkspaceModeDefinition, getWorkspaceModeState } from '../workspace/service.js';
import {
	createLearningDocument,
	getActiveLearningDocument,
	importSourcesIntoLearningDocument,
	promptForLearningDocument,
	setActiveLearningDocument
} from './service.js';
import type { LearningDocumentType } from './types.js';

async function ensureDocumentWorkspaceMode(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder
): Promise<boolean> {
	const modeState = await ensureWorkspaceMode(context, workspaceFolder);
	if (!modeState) {
		return false;
	}

	if (!supportsLearningDocuments(modeState.mode)) {
		void vscode.window.showWarningMessage(`Le mode ${getWorkspaceModeDefinition(modeState.mode).label} est orienté code. Changez le type de workspace pour activer les fonctionnalités documentaires.`);
		return false;
	}

	return true;
}

export function registerDocumentCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('ai-context-orchestrator.createLearningDocument', async () => {
			const workspaceFolder = await resolveWorkspaceFolder(context, {
				placeHolder: 'Choisissez le workspace dans lequel créer un document learning-kit',
				showWarning: true
			});
			if (!workspaceFolder || !(await ensureDocumentWorkspaceMode(context, workspaceFolder))) {
				return;
			}

			const documentType: LearningDocumentType = 'compte-rendu';
			const title = await vscode.window.showInputBox({
				title: 'Créer un document learning-kit',
				prompt: 'Nom du document à créer',
				placeHolder: 'Exemple: Réseaux bayésiens - séance 03',
				ignoreFocusOut: true,
				validateInput: (value) => value.trim().length === 0 ? 'Le titre du document est requis.' : undefined
			});
			if (!title?.trim()) {
				return;
			}

			const document = await createLearningDocument(context, workspaceFolder, documentType, title.trim());
			await vscode.window.showTextDocument(vscode.Uri.joinPath(workspaceFolder.uri, ...document.indexFile.split('/')));
			void vscode.window.showInformationMessage(`Document ${document.title} créé dans ${document.relativeDirectory}.`);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.switchLearningDocument', async () => {
			const workspaceFolder = await resolveWorkspaceFolder(context, {
				placeHolder: 'Choisissez le workspace du document à activer',
				showWarning: true
			});
			if (!workspaceFolder) {
				return;
			}

			const document = await promptForLearningDocument(context, workspaceFolder, 'Choisissez le document à rendre actif');
			if (!document) {
				void vscode.window.showInformationMessage('Aucun document learning-kit disponible dans ce workspace.');
				return;
			}

			await setActiveLearningDocument(context, workspaceFolder, document.id);
			void vscode.window.showInformationMessage(`Document actif: ${document.title}.`);
			EventBus.fire('refresh');
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.openActiveLearningDocument', async () => {
			const workspaceFolder = await resolveWorkspaceFolder(context, {
				placeHolder: 'Choisissez le workspace du document à ouvrir',
				showWarning: true
			});
			if (!workspaceFolder) {
				return;
			}

			const document = await getActiveLearningDocument(context, workspaceFolder);
			if (!document) {
				void vscode.window.showInformationMessage('Aucun document actif. Créez d’abord un compte rendu.');
				return;
			}

			await vscode.window.showTextDocument(vscode.Uri.joinPath(workspaceFolder.uri, ...document.indexFile.split('/')));
		}),

		vscode.commands.registerCommand('ai-context-orchestrator.addLearningDocumentSources', async () => {
			const workspaceFolder = await resolveWorkspaceFolder(context, {
				placeHolder: 'Choisissez le workspace du document à enrichir',
				showWarning: true
			});
			if (!workspaceFolder || !(await ensureDocumentWorkspaceMode(context, workspaceFolder))) {
				return;
			}

			let document = await getActiveLearningDocument(context, workspaceFolder);
			if (!document) {
				void vscode.window.showInformationMessage('Aucun document actif. Créez d’abord un compte rendu.');
				return;
			}

			if (getWorkspaceModeState(context, workspaceFolder)?.mode !== 'blank') {
				const maybeSelectedDocument = await promptForLearningDocument(context, workspaceFolder, 'Choisissez le document auquel rattacher les sources');
				if (maybeSelectedDocument) {
					document = maybeSelectedDocument;
				}
			}

			const sourceUris = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: true,
				openLabel: 'Importer dans le dossier sources du document',
				defaultUri: workspaceFolder.uri
			});
			if (!sourceUris || sourceUris.length === 0) {
				return;
			}

			const updatedDocument = await importSourcesIntoLearningDocument(context, workspaceFolder, document, sourceUris);
			void vscode.window.showInformationMessage(`${sourceUris.length} source(s) importée(s) dans ${updatedDocument.sourceDirectory}.`);
			EventBus.fire('refresh');
		})
	);
}