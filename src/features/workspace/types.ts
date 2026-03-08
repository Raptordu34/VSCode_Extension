export type WorkspaceMode = 'code' | 'research' | 'study' | 'blank';

export interface WorkspaceModeDefinition {
	mode: WorkspaceMode;
	label: string;
	description: string;
	detail: string;
	supportsLearningDocuments: boolean;
}

export interface WorkspaceModeState {
	mode: WorkspaceMode;
	selectedAt: string;
	updatedAt: string;
}