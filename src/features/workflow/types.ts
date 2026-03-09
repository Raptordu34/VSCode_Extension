import * as vscode from 'vscode';
import type { ProviderTarget, ProviderAccountConfiguration, ProviderStatusSnapshot } from '../providers/types.js';
import type { WorkspaceMode, WorkspaceModeState } from '../workspace/types.js';
import type { LearningDocumentRecord } from '../documents/types.js';

export type { ProviderTarget, ProviderAccountConfiguration, ProviderStatusSnapshot };


export type WorkflowPreset = 'explore' | 'plan' | 'build' | 'debug' | 'review' | 'test';
export type DocumentWorkflowIntentId =
	| 'compte-rendu-plan'
	| 'compte-rendu-source-exploitation'
	| 'compte-rendu-note-integration'
	| 'compte-rendu-review';
export type ContextRefreshMode = 'reuse' | 'smart-refresh' | 'full-rebuild';
export type CostProfile = 'fast' | 'balanced' | 'strong';
export type WorkflowRole = 'explorer' | 'architect' | 'implementer' | 'reviewer' | 'tester' | 'debugger';
export type ArtifactKind = 'instruction' | 'agent' | 'skill';
export type WorkflowStageStatus = 'prepared' | 'in-progress' | 'completed';
export type ClaudeEffortLevel = 'low' | 'medium' | 'high';
export type WorkflowArchivedFileKind = 'full' | 'managed-markdown' | 'session-json' | 'brief-markdown';

export interface OptimizationResult {
	content: string;
	applied: boolean;
	modelName?: string;
	reason: string;
}

export interface WorkflowPresetDefinition {
	preset: WorkflowPreset;
	label: string;
	description: string;
	detail: string;
	recommendedProvider: ProviderTarget;
	roles: WorkflowRole[];
	launchInstruction: string;
	artifactSkillName: string;
}

export interface DocumentWorkflowIntentDefinition {
	id: DocumentWorkflowIntentId;
	preset: WorkflowPreset;
	label: string;
	description: string;
	detail: string;
	launchInstruction: string;
	briefPrompt: string;
	briefPlaceholder: string;
}

export interface WorkflowExecutionPlan {
	preset: WorkflowPreset;
	documentIntentId?: DocumentWorkflowIntentId;
	provider: ProviderTarget;
	providerModel?: string;
	providerAccountId?: string;
	workspaceMode?: WorkspaceMode;
	learningDocumentId?: string;
	workflowId?: string;
	branchId?: string;
	startNewWorkflow?: boolean;
	roles: WorkflowRole[];
	refreshMode: ContextRefreshMode;
	costProfile: CostProfile;
	optimizeWithCopilot: boolean;
	generateNativeArtifacts: boolean;
	claudeAccountId?: string;
	claudeEffort?: ClaudeEffortLevel;
	presetDefinition: WorkflowPresetDefinition;
	brief?: WorkflowBrief;
}

export interface ContextMetadata {
	generatedAt: string;
	signature: string;
	workspaceMode?: string;
	activeLearningDocumentTitle?: string;
	activeLearningDocumentPath?: string;
	activeLearningDocumentType?: string;
	documentIntentId?: DocumentWorkflowIntentId;
	preset: WorkflowPreset;
	provider: ProviderTarget;
	providerModel?: string;
	providerAccountId?: string;
	claudeAccountId?: string;
	claudeEffort?: ClaudeEffortLevel;
	refreshMode: ContextRefreshMode;
	costProfile: CostProfile;
	reused: boolean;
	keyFiles: string[];
	instructionFiles: string[];
	commands: string[];
	artifactFiles: string[];
	contextBudgetProfile?: string;
	contextBudgetSummary?: string;
}

export interface GeneratedArtifact {
	relativePath: string;
	kind: ArtifactKind;
	content: string;
}

export interface ArtifactPlan {
	provider: ProviderTarget;
	files: GeneratedArtifact[];
}

export interface WorkflowStageRecord {
	index: number;
	workflowId?: string;
	branchId?: string;
	preset: WorkflowPreset;
	provider: ProviderTarget;
	providerModel?: string;
	providerAccountId?: string;
	status: WorkflowStageStatus;
	stageFile: string;
	generatedAt: string;
	briefSummary: string;
	contextFile: string;
	claudeAccountId?: string;
	claudeEffort?: ClaudeEffortLevel;
	artifactFiles: string[];
	upstreamStageFiles: string[];
}

export interface WorkflowSessionState {
	workspaceName: string;
	workspaceFolderId?: string;
	workflowId?: string;
	branchId?: string;
	parentWorkflowId?: string;
	parentStageIndex?: number;
	createdAt?: string;
	label?: string;
	updatedAt: string;
	currentStageIndex: number;
	currentPreset: WorkflowPreset;
	currentProvider: ProviderTarget;
	currentProviderModel?: string;
	currentProviderAccountId?: string;
	currentClaudeAccountId?: string;
	currentClaudeEffort?: ClaudeEffortLevel;
	briefFile: string;
	stages: WorkflowStageRecord[];
}

export interface WorkflowBrief {
	taskType: string;
	goal: string;
	constraints: string[];
	rawText: string;
}

export interface WorkflowArchivedFile {
	relativePath: string;
	kind: WorkflowArchivedFileKind;
	archivePath?: string;
	generatedContent?: string;
}

export interface WorkflowHistoryEntry {
	workflowId: string;
	branchId: string;
	parentWorkflowId?: string;
	parentStageIndex?: number;
	label: string;
	createdAt: string;
	updatedAt: string;
	currentStageIndex: number;
	stageCount: number;
	currentPreset: WorkflowPreset;
	currentProvider: ProviderTarget;
	briefSummary: string;
	manifestPath: string;
	latestStageFile?: string;
	isCollapsed?: boolean;
}

export interface WorkflowHistoryIndex {
	version: number;
	activeWorkflowId?: string;
	entries: WorkflowHistoryEntry[];
}

export interface WorkflowArchiveManifest {
	workflowId: string;
	branchId: string;
	label: string;
	createdAt: string;
	updatedAt: string;
	session: WorkflowSessionState;
	brief?: WorkflowBrief;
	files: WorkflowArchivedFile[];
}

export interface ProjectContext {
	workspaceFolder: vscode.WorkspaceFolder;
	contextFile: vscode.Uri;
	content: string;
	optimization: OptimizationResult;
	metadata: ContextMetadata;
	workflowPlan: WorkflowExecutionPlan;
	activeLearningDocument?: LearningDocumentRecord;
	artifactPlan?: ArtifactPlan;
	reused: boolean;
	workflowSession?: WorkflowSessionState;
	currentStage?: WorkflowStageRecord;
	brief?: WorkflowBrief;
}

export interface ExtensionConfiguration {
	treeDepth: number;
	readmePreviewLines: number;
	contextFilePreviewLines: number;
	extraContextFiles: string[];
	showIgnoredDirectories: boolean;
	maxEntriesPerDirectory: number;
	optimizeWithCopilot: boolean;
	modelFamily: string;
	defaultClaudeModel: string;
	defaultGeminiModel: string;
	defaultClaudeEffort: ClaudeEffortLevel;
	claudeAccounts: ProviderAccountConfiguration[];
	activeClaudeAccountId?: string;
	geminiAccounts: ProviderAccountConfiguration[];
	activeGeminiAccountId?: string;
	copilotAccounts: ProviderAccountConfiguration[];
	activeCopilotAccountId?: string;
	autoGenerateOnStartup: boolean;
	defaultPreset: WorkflowPreset;
	defaultProvider: ProviderTarget;
	contextRefreshMode: ContextRefreshMode;
	costProfile: CostProfile;
	generateNativeArtifacts: boolean;
	enabledProviders: ProviderTarget[];
}

export interface WorkflowQuickPickItem extends vscode.QuickPickItem {
	presetDefinition?: WorkflowPresetDefinition;
	documentIntentId?: DocumentWorkflowIntentId;
	provider?: ProviderTarget;
	refreshMode?: ContextRefreshMode;
	costProfile?: CostProfile;
	booleanValue?: boolean;
	action?: 'launch' | 'open-context' | 'inspect-artifacts' | 'stop';
}

export interface ArtifactGovernancePolicy {
	gitignoreExists: boolean;
	hasBlock: boolean;
	managedPathsCovered: boolean;
}

export interface WorkflowDashboardState {
	workspaceFolder?: vscode.WorkspaceFolder;
	workspaceSelectionRequired?: boolean;
	workspaceModeState?: WorkspaceModeState;
	learningDocuments?: LearningDocumentRecord[];
	activeLearningDocument?: LearningDocumentRecord;
	session?: WorkflowSessionState;
	brief?: WorkflowBrief;
	historyEntries?: WorkflowHistoryEntry[];
	activeWorkflowId?: string;
	latestStage?: WorkflowStageRecord;
	selectedStage?: WorkflowStageRecord;
	contextFileExists: boolean;
	nextSuggestedPresets: WorkflowPreset[];
	artifactCount: number;
	configuration?: ExtensionConfiguration;
	providerStatuses: ProviderStatusSnapshot[];
	providerStatusUpdatedAt?: string;
	copilotPendingPrompt?: string;
	artifactGovernance?: ArtifactGovernancePolicy;
}

export interface WorkflowTreeNode {
	id: string;
	label: string;
	description?: string;
	tooltip?: string;
	icon?: vscode.ThemeIcon;
	contextValue?: string;
	relativePath?: string;
	stageIndex?: number;
	collapsibleState?: vscode.TreeItemCollapsibleState;
	command?: vscode.Command;
	children?: WorkflowTreeNode[];
}

export interface LastWorkflowConfig {
  preset: WorkflowPreset;
	documentIntentId?: DocumentWorkflowIntentId;
  provider: ProviderTarget;
  providerModel?: string;
  claudeEffort?: ClaudeEffortLevel;
	learningDocumentId?: string;
  brief?: string;
}
