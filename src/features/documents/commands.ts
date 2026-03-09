import * as vscode from 'vscode';
import { EventBus } from '../../core/eventBus.js';
import { resolveWorkspaceFolder } from '../../core/workspaceContext.js';
import { supportsLearningDocuments, ensureWorkspaceMode, getWorkspaceModeDefinition, getWorkspaceModeState } from '../workspace/service.js';
import {
	createLearningDocument,
	getActiveLearningDocument,
	importSourcesIntoLearningDocument,
	promptForLearningDocumentType,
	promptForLearningDocument,
	setActiveLearningDocument
} from './service.js';
import type { LearningDocumentType } from './types.js';

type SourceSelectionAction = 'add-files' | 'remove-file' | 'import' | 'cancel';

interface SourceSelectionItem extends vscode.QuickPickItem {
	action: SourceSelectionAction;
	uri?: vscode.Uri;
}

async function promptForLearningDocumentSources(
	workspaceFolder: vscode.WorkspaceFolder,
	initialSelection: vscode.Uri[] = []
): Promise<vscode.Uri[] | undefined> {
	const selectedByPath = new Map(initialSelection.map((uri) => [uri.fsPath, uri]));

	while (true) {
		const selectedUris = [...selectedByPath.values()];
		const selectionItems: SourceSelectionItem[] = [
			{
				label: '$(add) Ajouter des fichiers',
				description: selectedUris.length > 0 ? `${selectedUris.length} fichier(s) sélectionné(s)` : 'Aucun fichier sélectionné pour le moment',
				detail: 'Ouvre le sélecteur natif et ajoute un ou plusieurs fichiers à importer.',
				action: 'add-files'
			},
			{
				label: '$(cloud-upload) Importer la sélection',
				description: selectedUris.length > 0 ? `${selectedUris.length} fichier(s) prêt(s) à être copiés` : 'Ajoutez au moins un fichier avant l’import',
				detail: 'Copie tous les fichiers sélectionnés dans le dossier sources du document.',
				action: 'import',
				alwaysShow: true
			},
			{
				label: '$(close) Annuler',
				description: 'Fermer sans importer de source',
				action: 'cancel'
			}
		];

		const selectedFileItems = selectedUris.map((uri, index) => ({
			label: `$(file) ${uri.path.split('/').pop() ?? uri.fsPath}`,
			description: `Sélection ${index + 1}`,
			detail: `${uri.fsPath} · cliquez pour retirer ce fichier de la sélection`,
			action: 'remove-file' as const,
			uri
		}));

		const selection = await vscode.window.showQuickPick<SourceSelectionItem>(
			[
				...selectionItems,
				...(selectedFileItems.length > 0 ? [{ label: 'Fichiers sélectionnés', kind: vscode.QuickPickItemKind.Separator, action: 'cancel' as const }] : []),
				...selectedFileItems
			],
			{
				title: 'Importer des sources dans le document',
				placeHolder: selectedUris.length > 0
					? 'Ajoutez d’autres fichiers, retirez-en, ou lancez l’import.'
					: 'Commencez par ajouter un ou plusieurs fichiers source.',
				ignoreFocusOut: true
			}
		);

		if (!selection || selection.action === 'cancel') {
			return undefined;
		}

		if (selection.action === 'add-files') {
			const pickedUris = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: true,
				openLabel: 'Ajouter à la sélection',
				defaultUri: workspaceFolder.uri,
				title: 'Sélectionnez un ou plusieurs fichiers à importer'
			});
			if (!pickedUris || pickedUris.length === 0) {
				continue;
			}

			for (const uri of pickedUris) {
				selectedByPath.set(uri.fsPath, uri);
			}
			continue;
		}

		if (selection.action === 'remove-file' && selection.uri) {
			selectedByPath.delete(selection.uri.fsPath);
			continue;
		}

		if (selection.action === 'import') {
			if (selectedUris.length === 0) {
				void vscode.window.showWarningMessage('Ajoutez au moins un fichier avant de lancer l’import.');
				continue;
			}

			return selectedUris;
		}
	}
}

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

			const documentType: LearningDocumentType | undefined = await promptForLearningDocumentType();
			if (!documentType) {
				return;
			}
			const title = await vscode.window.showInputBox({
				title: 'Créer un document learning-kit',
				prompt: `Nom du document à créer pour le type ${documentType}`,
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

			const sourceUris = await promptForLearningDocumentSources(workspaceFolder);
			if (!sourceUris || sourceUris.length === 0) {
				return;
			}

			const updatedDocument = await importSourcesIntoLearningDocument(context, workspaceFolder, document, sourceUris);
			void vscode.window.showInformationMessage(`${sourceUris.length} source(s) importée(s) dans ${updatedDocument.sourceDirectory}.`);
			EventBus.fire('refresh');
		})
	);
}