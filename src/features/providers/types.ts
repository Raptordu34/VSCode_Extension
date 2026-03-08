import type { WorkflowPreset, ClaudeEffortLevel } from '../workflow/types.js';

export interface ContextBudget {
	profile: string;
	treeDepth: number;
	maxEntriesPerDirectory: number;
	readmePreviewLines: number;
	contextFilePreviewLines: number;
	maxDependencies: number;
	maxDevDependencies: number;
	maxScripts: number;
	maxKeyFiles: number;
	maxInstructionFiles: number;
}

export type ProviderTarget = 'claude' | 'gemini' | 'copilot';
export type ProviderStatusAvailability = 'ready' | 'needs-config' | 'warning' | 'error' | 'unavailable';
export type ProviderModelTier = 'stable' | 'preview' | 'alias' | 'custom';

export interface ProviderModelDescriptor {
	id: string;
	label: string;
	tier: ProviderModelTier;
	detail: string;
	description?: string;
	isDefaultCandidate?: boolean;
}

export interface ProviderCapabilities {
	provider: ProviderTarget;
	label: string;
	instructionArtifactPath: string;
	supportsNativeOptimization: boolean;
	supportsNativeHandoffs: boolean;
	supportsStableAliases: boolean;
	modelCatalog: ProviderModelDescriptor[];
	recommendedDetail: Record<WorkflowPreset, string>;
}

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
