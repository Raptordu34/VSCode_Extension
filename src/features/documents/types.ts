export type LearningDocumentType = 'compte-rendu';

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