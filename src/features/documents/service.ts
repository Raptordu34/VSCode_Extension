import * as path from 'path';
import * as vscode from 'vscode';
import type {
	LearningDocumentDefinition,
	LearningDocumentRecord,
	LearningDocumentSourceRecord,
	LearningDocumentState,
	LearningDocumentType
} from './types.js';

const LEARNING_DOCUMENT_STORAGE_PREFIX = 'aiContextOrchestrator.learningDocuments';
export const LEARNING_DOCUMENTS_ROOT = 'learning-documents';
const TEMPLATE_ROOT_CANDIDATES = [
	['learning-kit'],
	['learning-kit-global', 'learning-kit']
];

export const LEARNING_DOCUMENT_DEFINITIONS: Record<LearningDocumentType, LearningDocumentDefinition> = {
	'compte-rendu': {
		type: 'compte-rendu',
		label: 'Compte rendu',
		description: 'Document de cours structuré avec sidebar, sections détaillées et mode résumé.',
		templateFolderName: 'compte-rendu'
	},
	presentation: {
		type: 'presentation',
		label: 'Présentation',
		description: 'Slides pédagogiques structurées à partir des contenus sources.',
		templateFolderName: 'presentation'
	},
	'fiche-revision': {
		type: 'fiche-revision',
		label: 'Fiche de révision',
		description: 'Synthèse dense pour révision rapide avec hiérarchie claire.',
		templateFolderName: 'fiche-revision'
	},
	'td-exercice': {
		type: 'td-exercice',
		label: 'TD / exercice',
		description: 'Exercices, questions et solutions structurées.',
		templateFolderName: 'td-exercice'
	},
	'synthese-article': {
		type: 'synthese-article',
		label: 'Synthèse d’article',
		description: 'Résumé structuré d’un papier ou document scientifique.',
		templateFolderName: 'synthese-article'
	},
	'rapport-projet': {
		type: 'rapport-projet',
		label: 'Rapport projet',
		description: 'Rapport formel avec sections, callouts et résultats.',
		templateFolderName: 'rapport-projet'
	},
	comparatif: {
		type: 'comparatif',
		label: 'Comparatif',
		description: 'Document comparatif orienté arbitrage et décision.',
		templateFolderName: 'comparatif'
	},
	'one-pager': {
		type: 'one-pager',
		label: 'One-pager',
		description: 'Synthèse condensée sur une seule page.',
		templateFolderName: 'one-pager'
	},
	'cheat-sheet': {
		type: 'cheat-sheet',
		label: 'Cheat-sheet',
		description: 'Référence rapide et structurée.',
		templateFolderName: 'cheat-sheet'
	}
};

export function getLearningDocumentDefinitions(): LearningDocumentDefinition[] {
	return Object.values(LEARNING_DOCUMENT_DEFINITIONS);
}

export function getLearningDocumentDefinition(type: LearningDocumentType): LearningDocumentDefinition {
	return LEARNING_DOCUMENT_DEFINITIONS[type];
}

export function getLearningDocumentTypeLabel(type: LearningDocumentType): string {
	return getLearningDocumentDefinition(type).label;
}

interface LearningDocumentManifest {
	title: string;
	type: LearningDocumentType;
	slug: string;
	createdAt: string;
	updatedAt: string;
	sources: LearningDocumentSourceRecord[];
}

function isLearningDocumentType(value: string): value is LearningDocumentType {
	return Object.prototype.hasOwnProperty.call(LEARNING_DOCUMENT_DEFINITIONS, value);
}

function getStorageKey(folder: vscode.WorkspaceFolder): string {
	return `${LEARNING_DOCUMENT_STORAGE_PREFIX}:${folder.uri.toString()}`;
}

function sanitizeFileNameSegment(value: string): string {
	return value.replace(/[<>:"/\\|?*]/g, '-');
}

export function slugifyDocumentTitle(title: string): string {
	const base = title
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return base || 'document';
}

function ensureUniqueSlug(state: LearningDocumentState, baseSlug: string): string {
	const usedSlugs = new Set(state.documents.map((document) => document.slug));
	if (!usedSlugs.has(baseSlug)) {
		return baseSlug;
	}

	let index = 2;
	while (usedSlugs.has(`${baseSlug}-${index}`)) {
		index += 1;
	}

	return `${baseSlug}-${index}`;
}

async function pathExists(targetUri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(targetUri);
		return true;
	} catch {
		return false;
	}
}

async function resolveTemplateRootUri(extensionUri: vscode.Uri): Promise<vscode.Uri> {
	for (const segments of TEMPLATE_ROOT_CANDIDATES) {
		const candidate = vscode.Uri.joinPath(extensionUri, ...segments);
		if (await pathExists(vscode.Uri.joinPath(candidate, 'templates'))) {
			return candidate;
		}
	}

	throw new Error('Learning-kit templates were not found in the extension assets.');
}

async function getDocumentTemplateUri(extensionUri: vscode.Uri, type: LearningDocumentType): Promise<vscode.Uri> {
	const definition = getLearningDocumentDefinition(type);
	return vscode.Uri.joinPath(await resolveTemplateRootUri(extensionUri), 'templates', definition.templateFolderName);
}

export async function promptForLearningDocumentType(currentType?: LearningDocumentType): Promise<LearningDocumentType | undefined> {
	const selection = await vscode.window.showQuickPick(
		getLearningDocumentDefinitions().map((definition) => ({
			label: definition.label,
			description: definition.description,
			detail: `Template: ${definition.templateFolderName}`,
			picked: definition.type === currentType,
			type: definition.type
		})),
		{
			title: 'Type de document',
			placeHolder: 'Choisissez le type de document learning-kit à créer',
			ignoreFocusOut: true
		}
	);

	return selection?.type as LearningDocumentType | undefined;
}

async function readTextFile(fileUri: vscode.Uri): Promise<string> {
	const bytes = await vscode.workspace.fs.readFile(fileUri);
	return Buffer.from(bytes).toString('utf8');
}

async function writeTextFile(fileUri: vscode.Uri, content: string): Promise<void> {
	await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
}

function getDocumentDirectoryName(relativeDirectory: string): string {
	return path.posix.basename(relativeDirectory);
}

function normalizeSourceRecords(
	sources: LearningDocumentSourceRecord[] | undefined,
	sourceDirectory: string
): LearningDocumentSourceRecord[] {
	if (!Array.isArray(sources)) {
		return [];
	}

	return sources
		.filter((source) => typeof source?.relativePath === 'string' && typeof source?.label === 'string')
		.map((source) => ({
			label: source.label,
			relativePath: source.relativePath.startsWith(sourceDirectory)
				? source.relativePath
				: path.posix.join(sourceDirectory, path.posix.basename(source.relativePath)),
			importedAt: source.importedAt,
			originPath: source.originPath
		}));
}

function buildLearningDocumentRecordFromManifest(
	workspaceFolder: vscode.WorkspaceFolder,
	directoryName: string,
	manifest: LearningDocumentManifest,
	existingDocument?: LearningDocumentRecord
): LearningDocumentRecord | undefined {
	if (!manifest.title?.trim() || !isLearningDocumentType(manifest.type)) {
		return undefined;
	}

	const slug = manifest.slug?.trim() || existingDocument?.slug || directoryName;
	const relativeDirectory = path.posix.join(LEARNING_DOCUMENTS_ROOT, directoryName);
	const sourceDirectory = path.posix.join(relativeDirectory, 'sources');
	const promptFile = path.posix.join(relativeDirectory, 'PROMPT.md');
	const manifestFile = path.posix.join(relativeDirectory, 'document.json');
	const createdAt = manifest.createdAt || existingDocument?.createdAt || new Date().toISOString();
	const updatedAt = manifest.updatedAt || existingDocument?.updatedAt || createdAt;
	const sources = normalizeSourceRecords(manifest.sources, sourceDirectory);

	return {
		id: existingDocument?.id ?? slug,
		type: manifest.type,
		title: manifest.title.trim(),
		slug,
		relativeDirectory,
		indexFile: path.posix.join(relativeDirectory, 'index.html'),
		sourceDirectory,
		promptFile,
		manifestFile,
		createdAt,
		updatedAt,
		sources
	};
}

async function readManifestFromDirectory(
	workspaceFolder: vscode.WorkspaceFolder,
	directoryName: string,
	existingDocument?: LearningDocumentRecord
): Promise<LearningDocumentRecord | undefined> {
	const manifestUri = vscode.Uri.joinPath(workspaceFolder.uri, LEARNING_DOCUMENTS_ROOT, directoryName, 'document.json');
	if (!(await pathExists(manifestUri))) {
		return undefined;
	}

	try {
		const manifestContent = await readTextFile(manifestUri);
		const manifest = JSON.parse(manifestContent) as LearningDocumentManifest;
		return buildLearningDocumentRecordFromManifest(workspaceFolder, directoryName, manifest, existingDocument);
	} catch {
		return undefined;
	}
}

function normalizeLearningDocumentState(state: LearningDocumentState): LearningDocumentState {
	const documents = [...state.documents].sort((left, right) => left.relativeDirectory.localeCompare(right.relativeDirectory));
	const activeDocumentId = documents.some((document) => document.id === state.activeDocumentId)
		? state.activeDocumentId
		: documents[0]?.id;

	return {
		activeDocumentId,
		documents
	};
}

function areDocumentStatesEqual(left: LearningDocumentState, right: LearningDocumentState): boolean {
	return JSON.stringify(normalizeLearningDocumentState(left)) === JSON.stringify(normalizeLearningDocumentState(right));
}

async function reconcileLearningDocumentState(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder
): Promise<LearningDocumentState> {
	const storedState = await readState(context, workspaceFolder);
	const learningDocumentsRootUri = vscode.Uri.joinPath(workspaceFolder.uri, LEARNING_DOCUMENTS_ROOT);
	if (!(await pathExists(learningDocumentsRootUri))) {
		const emptyState: LearningDocumentState = { documents: [] };
		if (!areDocumentStatesEqual(storedState, emptyState)) {
			await writeState(context, workspaceFolder, emptyState);
		}
		return emptyState;
	}

	const entries = await vscode.workspace.fs.readDirectory(learningDocumentsRootUri);
	const directoryEntries = entries.filter(([, type]) => type === vscode.FileType.Directory).map(([name]) => name);
	const storedByDirectory = new Map(storedState.documents.map((document) => [getDocumentDirectoryName(document.relativeDirectory), document]));
	const discoveredByDirectory = new Map<string, LearningDocumentRecord>();

	for (const directoryName of directoryEntries) {
		const discoveredDocument = await readManifestFromDirectory(workspaceFolder, directoryName, storedByDirectory.get(directoryName));
		if (discoveredDocument) {
			discoveredByDirectory.set(directoryName, discoveredDocument);
		}
	}

	const documents: LearningDocumentRecord[] = [];
	for (const storedDocument of storedState.documents) {
		const directoryName = getDocumentDirectoryName(storedDocument.relativeDirectory);
		const discoveredDocument = discoveredByDirectory.get(directoryName);
		if (discoveredDocument) {
			documents.push(discoveredDocument);
			continue;
		}

		if (directoryEntries.includes(directoryName)) {
			documents.push(storedDocument);
		}
	}

	for (const directoryName of [...discoveredByDirectory.keys()].sort((left, right) => left.localeCompare(right))) {
		if (documents.some((document) => getDocumentDirectoryName(document.relativeDirectory) === directoryName)) {
			continue;
		}

		const discoveredDocument = discoveredByDirectory.get(directoryName);
		if (discoveredDocument) {
			documents.push(discoveredDocument);
		}
	}

	const nextState: LearningDocumentState = {
		activeDocumentId: documents.some((document) => document.id === storedState.activeDocumentId)
			? storedState.activeDocumentId
			: documents[0]?.id,
		documents
	};

	if (!areDocumentStatesEqual(storedState, nextState)) {
		await writeState(context, workspaceFolder, nextState);
	}

	return nextState;
}

async function copyDirectoryRecursive(sourceUri: vscode.Uri, targetUri: vscode.Uri): Promise<void> {
	await vscode.workspace.fs.createDirectory(targetUri);
	const entries = await vscode.workspace.fs.readDirectory(sourceUri);
	for (const [name, type] of entries) {
		const sourceChild = vscode.Uri.joinPath(sourceUri, name);
		const targetChild = vscode.Uri.joinPath(targetUri, name);
		if (type === vscode.FileType.Directory) {
			await copyDirectoryRecursive(sourceChild, targetChild);
			continue;
		}
		await vscode.workspace.fs.copy(sourceChild, targetChild, { overwrite: false });
	}
	}

function buildInstructionsContent(title: string, type: LearningDocumentType): string {
	const createdAt = new Date().toISOString().slice(0, 10);
	return [
		`# ${title}`,
		'',
		`**Type :** ${type}`,
		`**Créé le :** ${createdAt}`,
		'',
		'## Instructions LLM',
		'',
		'**Design system :** lire `./design/DESIGN_SYSTEM.md`',
		'**SVG catalog :** lire `./design/svg/CATALOG.md` avant d’ajouter tout élément graphique',
		'**Prompt template :** lire `./PROMPT.md`',
		'**Exemple de section :** voir `section-EXAMPLE.html` dans ce dossier',
		'**Sources :** exploiter en priorité le dossier `./sources/` quand des fichiers y sont présents',
		'',
		'## Règle principale',
		'Génère uniquement des fichiers `section-*.html` dans ce dossier.',
		'Ne modifie pas `index.html`, les fichiers CSS, ni les assets du learning-kit.',
		'',
		'## Workflow',
		'1. Lire DESIGN_SYSTEM.md',
		'2. Lire PROMPT.md',
		'3. Consulter section-EXAMPLE.html',
		'4. Lire les sources importées dans ./sources/ si elles existent',
		'5. Générer section-[nom].html',
		'6. Proposer les boutons nav à ajouter dans index.html (section nav-links)'
	].join('\n');
}

async function readState(context: vscode.ExtensionContext, folder: vscode.WorkspaceFolder): Promise<LearningDocumentState> {
	return context.workspaceState.get<LearningDocumentState>(getStorageKey(folder), { documents: [] });
}

async function writeState(context: vscode.ExtensionContext, folder: vscode.WorkspaceFolder, state: LearningDocumentState): Promise<void> {
	await context.workspaceState.update(getStorageKey(folder), state);
}

export async function clearLearningDocumentState(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
	await context.workspaceState.update(getStorageKey(workspaceFolder), undefined);
}

async function writeDocumentManifest(workspaceFolder: vscode.WorkspaceFolder, document: LearningDocumentRecord): Promise<void> {
	const manifestUri = vscode.Uri.joinPath(workspaceFolder.uri, document.manifestFile);
	const manifest: LearningDocumentManifest = {
		title: document.title,
		type: document.type,
		slug: document.slug,
		createdAt: document.createdAt,
		updatedAt: document.updatedAt,
		sources: document.sources
	};

	await writeTextFile(manifestUri, JSON.stringify(manifest, null, 2));
}

export async function getLearningDocumentState(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder
): Promise<LearningDocumentState> {
	return reconcileLearningDocumentState(context, workspaceFolder);
}

export async function getLearningDocuments(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder
): Promise<LearningDocumentRecord[]> {
	const state = await reconcileLearningDocumentState(context, workspaceFolder);
	return state.documents;
}

export async function getLearningDocumentById(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder,
	documentId: string | undefined
): Promise<LearningDocumentRecord | undefined> {
	if (!documentId) {
		return undefined;
	}

	const state = await reconcileLearningDocumentState(context, workspaceFolder);
	return state.documents.find((document) => document.id === documentId);
}

export async function getActiveLearningDocument(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder
): Promise<LearningDocumentRecord | undefined> {
	const state = await reconcileLearningDocumentState(context, workspaceFolder);
	return state.documents.find((document) => document.id === state.activeDocumentId) ?? state.documents[0];
}

export async function setActiveLearningDocument(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder,
	documentId: string
): Promise<LearningDocumentRecord | undefined> {
	const state = await reconcileLearningDocumentState(context, workspaceFolder);
	const document = state.documents.find((candidate) => candidate.id === documentId);
	if (!document) {
		return undefined;
	}

	await writeState(context, workspaceFolder, {
		...state,
		activeDocumentId: documentId
	});

	return document;
}

export async function promptForLearningDocument(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder,
	placeHolder: string
): Promise<LearningDocumentRecord | undefined> {
	const state = await reconcileLearningDocumentState(context, workspaceFolder);
	if (state.documents.length === 0) {
		return undefined;
	}

	const selection = await vscode.window.showQuickPick(
		state.documents.map((document) => ({
			label: document.title,
			description: getLearningDocumentTypeLabel(document.type),
			detail: document.relativeDirectory,
			documentId: document.id,
			picked: document.id === state.activeDocumentId
		})),
		{
			title: 'Document actif',
			placeHolder,
			ignoreFocusOut: true
		}
	);

	if (!selection?.documentId) {
		return undefined;
	}

	return setActiveLearningDocument(context, workspaceFolder, selection.documentId);
}

export async function createLearningDocument(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder,
	type: LearningDocumentType,
	title: string
): Promise<LearningDocumentRecord> {
	const state = await reconcileLearningDocumentState(context, workspaceFolder);
	const baseSlug = slugifyDocumentTitle(title);
	const slug = ensureUniqueSlug(state, baseSlug);
	const createdAt = new Date().toISOString();
	const relativeDirectory = path.posix.join(LEARNING_DOCUMENTS_ROOT, slug);
	const indexFile = path.posix.join(relativeDirectory, 'index.html');
	const promptFile = path.posix.join(relativeDirectory, 'PROMPT.md');
	const sourceDirectory = path.posix.join(relativeDirectory, 'sources');
	const manifestFile = path.posix.join(relativeDirectory, 'document.json');
	const documentDirectoryUri = vscode.Uri.joinPath(workspaceFolder.uri, ...relativeDirectory.split('/'));
	const kitRootUri = await resolveTemplateRootUri(context.extensionUri);
	const templateUri = await getDocumentTemplateUri(context.extensionUri, type);
	const [indexTemplate, componentTemplate, promptTemplate, exampleTemplate] = await Promise.all([
		readTextFile(vscode.Uri.joinPath(templateUri, 'index.html')),
		readTextFile(vscode.Uri.joinPath(templateUri, 'components.css')),
		readTextFile(vscode.Uri.joinPath(templateUri, 'PROMPT.md')),
		readTextFile(vscode.Uri.joinPath(templateUri, 'section-EXAMPLE.html'))
	]);

	await vscode.workspace.fs.createDirectory(documentDirectoryUri);
	await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceFolder.uri, ...sourceDirectory.split('/')));
	await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceFolder.uri, ...path.posix.join(relativeDirectory, '.github').split('/')));

	const definition = getLearningDocumentDefinition(type);
	const subtitle = `${definition.label} • ${createdAt.slice(0, 10)}`;
	const nextIndexContent = indexTemplate
		.replace(/\.\.\/\.\.\/layouts\//g, './layouts/')
		.replace(/\{\{TITRE\}\}/g, title)
		.replace(/\{\{SOUS_TITRE\}\}/g, subtitle);
	const nextComponentsContent = componentTemplate.replace(/\.\.\/\.\.\/design\//g, './design/');
	const instructionsContent = buildInstructionsContent(title, type);

	await Promise.all([
		writeTextFile(vscode.Uri.joinPath(documentDirectoryUri, 'index.html'), nextIndexContent),
		writeTextFile(vscode.Uri.joinPath(documentDirectoryUri, 'components.css'), nextComponentsContent),
		writeTextFile(vscode.Uri.joinPath(documentDirectoryUri, 'PROMPT.md'), promptTemplate),
		writeTextFile(vscode.Uri.joinPath(documentDirectoryUri, 'section-EXAMPLE.html'), exampleTemplate),
		writeTextFile(vscode.Uri.joinPath(documentDirectoryUri, 'CLAUDE.md'), instructionsContent),
		writeTextFile(vscode.Uri.joinPath(documentDirectoryUri, 'GEMINI.md'), instructionsContent),
		writeTextFile(vscode.Uri.joinPath(documentDirectoryUri, '.github', 'copilot-instructions.md'), instructionsContent)
	]);

	try {
		await vscode.workspace.fs.copy(vscode.Uri.joinPath(templateUri, 'section-utils.js'), vscode.Uri.joinPath(documentDirectoryUri, 'section-utils.js'), { overwrite: false });
	} catch {
		// Optional helper; ignore when not present.
	}

	await copyDirectoryRecursive(vscode.Uri.joinPath(kitRootUri, 'design'), vscode.Uri.joinPath(documentDirectoryUri, 'design'));
	await copyDirectoryRecursive(vscode.Uri.joinPath(kitRootUri, 'layouts'), vscode.Uri.joinPath(documentDirectoryUri, 'layouts'));

	const document: LearningDocumentRecord = {
		id: slug,
		type,
		title,
		slug,
		relativeDirectory,
		indexFile,
		sourceDirectory,
		promptFile,
		manifestFile,
		createdAt,
		updatedAt: createdAt,
		sources: []
	};

	await writeDocumentManifest(workspaceFolder, document);
	await writeState(context, workspaceFolder, {
		activeDocumentId: document.id,
		documents: [...state.documents, document]
	});

	return document;
}

function buildUniqueTargetFileName(existingNames: Set<string>, sourceUri: vscode.Uri): string {
	const parsedPath = path.parse(sourceUri.fsPath);
	const safeBaseName = sanitizeFileNameSegment(parsedPath.name) || 'source';
	const safeExtension = sanitizeFileNameSegment(parsedPath.ext);
	let candidate = `${safeBaseName}${safeExtension}`;
	let counter = 2;
	while (existingNames.has(candidate.toLowerCase())) {
		candidate = `${safeBaseName}-${counter}${safeExtension}`;
		counter += 1;
	}

	existingNames.add(candidate.toLowerCase());
	return candidate;
}

export async function importSourcesIntoLearningDocument(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder,
	document: LearningDocumentRecord,
	sourceUris: vscode.Uri[]
): Promise<LearningDocumentRecord> {
	const state = await reconcileLearningDocumentState(context, workspaceFolder);
	const existingDocument = state.documents.find((candidate) => candidate.id === document.id);
	if (!existingDocument) {
		throw new Error('Learning document not found in workspace state.');
	}

	const sourceDirectoryUri = vscode.Uri.joinPath(workspaceFolder.uri, ...existingDocument.sourceDirectory.split('/'));
	await vscode.workspace.fs.createDirectory(sourceDirectoryUri);

	const existingNames = new Set(existingDocument.sources.map((source) => path.basename(source.relativePath).toLowerCase()));
	const importedAt = new Date().toISOString();
	const appendedSources: LearningDocumentSourceRecord[] = [];

	for (const sourceUri of sourceUris) {
		const targetFileName = buildUniqueTargetFileName(existingNames, sourceUri);
		const targetUri = vscode.Uri.joinPath(sourceDirectoryUri, targetFileName);
		await vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite: false });
		appendedSources.push({
			label: path.basename(sourceUri.fsPath),
			relativePath: path.posix.join(existingDocument.sourceDirectory, targetFileName),
			importedAt,
			originPath: sourceUri.fsPath
		});
	}

	const updatedDocument: LearningDocumentRecord = {
		...existingDocument,
		updatedAt: importedAt,
		sources: [...existingDocument.sources, ...appendedSources]
	};

	const updatedDocuments = state.documents.map((candidate) => candidate.id === updatedDocument.id ? updatedDocument : candidate);
	await writeState(context, workspaceFolder, {
		activeDocumentId: updatedDocument.id,
		documents: updatedDocuments
	});
	await writeDocumentManifest(workspaceFolder, updatedDocument);

	return updatedDocument;
}