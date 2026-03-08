export type LearningDocumentType =
	| 'compte-rendu'
	| 'presentation'
	| 'fiche-revision'
	| 'td-exercice'
	| 'synthese-article'
	| 'rapport-projet'
	| 'comparatif'
	| 'one-pager'
	| 'cheat-sheet';

export interface LearningDocumentDefinition {
	type: LearningDocumentType;
	label: string;
	description: string;
	templateFolderName: string;
}

export interface LearningDocumentSourceRecord {
	label: string;
	relativePath: string;
	importedAt: string;
	originPath?: string;
}

export interface LearningDocumentRecord {
	id: string;
	type: LearningDocumentType;
	title: string;
	slug: string;
	relativeDirectory: string;
	indexFile: string;
	sourceDirectory: string;
	promptFile: string;
	manifestFile: string;
	createdAt: string;
	updatedAt: string;
	sources: LearningDocumentSourceRecord[];
}

export interface LearningDocumentState {
	activeDocumentId?: string;
	documents: LearningDocumentRecord[];
}