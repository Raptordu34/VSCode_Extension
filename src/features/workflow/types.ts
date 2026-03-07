import * as vscode from 'vscode';

export type ProviderTarget = 'claude' | 'gemini' | 'copilot';
export type WorkflowPreset = 'explore' | 'plan' | 'build' | 'debug' | 'review' | 'test';
export type ContextRefreshMode = 'reuse' | 'smart-refresh' | 'full-rebuild';
export type CostProfile = 'fast' | 'balanced' | 'strong';
export type WorkflowRole = 'explorer' | 'architect' | 'implementer' | 'reviewer' | 'tester' | 'debugger';
export type ArtifactKind = 'instruction' | 'agent' | 'skill';
export type WorkflowStageStatus = 'prepared' | 'in-progress' | 'completed';
export type ClaudeEffortLevel = 'low' | 'medium' | 'high';
export type ProviderStatusAvailability = 'ready' | 'needs-config' | 'warning' | 'error' | 'unavailable';

export interface MetricDisplay {
	label: string;
	value: string;
	tone?: 'normal' | 'warning' | 'critical';
}

export interface ProviderAccountConfiguration {
	id: string;
	provider: ProviderTarget;
	label: string;
	defaultModel?: string;
	defaultClaudeEffort?: ClaudeEffortLevel;
	configDir?: string;
	authMode?: string;
	authCommand?: string;
	apiKeyEnvVar?: string;
	adminApiKeyEnvVar?: string;
	workspaceId?: string;
	apiKeyId?: string;
	quotaCommand?: string;
	accountHint?: string;
	notes?: string;
}

export interface ProviderAccountStatus {
	id: string;
	provider: ProviderTarget;
	label: string;
	configDir?: string;
	authMode?: string;
	accountHint?: string;
	isActive: boolean;
	availability: ProviderStatusAvailability;
	summary: string;
	detail: string;
	metrics: MetricDisplay[];
	lastCheckedAt?: string;
	errorMessage?: string;
}

export interface ProviderStatusSnapshot {
	provider: ProviderTarget;
	availability: ProviderStatusAvailability;
	summary: string;
	detail: string;
	metrics: MetricDisplay[];
	lastCheckedAt?: string;
	accounts?: ProviderAccountStatus[];
}

export interface ProviderStatusCache {
	updatedAt: string;
	providers: ProviderStatusSnapshot[];
}

export interface PackageDetails {
	summary: string;
	scripts: string[];
}

export interface AdditionalContextResult {
	sections: string[];
	foundPaths: string[];
}

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

export interface WorkflowExecutionPlan {
	preset: WorkflowPreset;
	provider: ProviderTarget;
	providerModel?: string;
	providerAccountId?: string;
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

export interface ProjectContext {
	workspaceFolder: vscode.WorkspaceFolder;
	contextFile: vscode.Uri;
	content: string;
	optimization: OptimizationResult;
	metadata: ContextMetadata;
	workflowPlan: WorkflowExecutionPlan;
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
	provider?: ProviderTarget;
	refreshMode?: ContextRefreshMode;
	costProfile?: CostProfile;
	booleanValue?: boolean;
	action?: 'launch' | 'open-context' | 'inspect-artifacts' | 'stop';
}

export interface WorkflowDashboardState {
	workspaceFolder?: vscode.WorkspaceFolder;
	workspaceSelectionRequired?: boolean;
	session?: WorkflowSessionState;
	brief?: WorkflowBrief;
	latestStage?: WorkflowStageRecord;
	selectedStage?: WorkflowStageRecord;
	contextFileExists: boolean;
	nextSuggestedPresets: WorkflowPreset[];
	artifactCount: number;
	configuration?: ExtensionConfiguration;
	providerStatuses: ProviderStatusSnapshot[];
	providerStatusUpdatedAt?: string;
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
