import type { ContextBudget, ProviderCapabilities, ProviderModelDescriptor, ProviderTarget } from './types.js';
import type {
	CostProfile,
	ExtensionConfiguration,
	WorkflowPreset
} from '../workflow/types.js';

const CLAUDE_MODEL_CATALOG: ProviderModelDescriptor[] = [
	{
		id: 'claude-opus-4-6',
		label: 'claude-opus-4-6',
		tier: 'stable',
		detail: 'Highest reasoning depth for long-horizon implementation, debugging, and review.',
		description: 'Frontier reasoning'
	},
	{
		id: 'claude-sonnet-4-6',
		label: 'claude-sonnet-4-6',
		tier: 'stable',
		detail: 'Best default balance for most coding workflows on Claude 4.6.',
		description: 'Balanced default',
		isDefaultCandidate: true
	},
	{
		id: 'claude-haiku-4-5-20251001',
		label: 'claude-haiku-4-5-20251001',
		tier: 'stable',
		detail: 'Fastest Claude option for lightweight exploration and tight loops.',
		description: 'Fast and inexpensive'
	},
	{
		id: 'claude-opus-4-5',
		label: 'claude-opus-4-5',
		tier: 'stable',
		detail: 'Previous Opus generation kept for compatibility with existing account defaults.',
		description: 'Compatibility'
	},
	{
		id: 'claude-sonnet-4-5',
		label: 'claude-sonnet-4-5',
		tier: 'stable',
		detail: 'Previous Sonnet generation kept for compatibility and controlled migrations.',
		description: 'Compatibility'
	}
];

const GEMINI_MODEL_CATALOG: ProviderModelDescriptor[] = [
	{
		id: 'gemini-2.5-pro',
		label: 'gemini-2.5-pro',
		tier: 'stable',
		detail: 'Stable high-reasoning Gemini model for complex planning, review, and code changes.',
		description: 'Stable reasoning',
		isDefaultCandidate: true
	},
	{
		id: 'gemini-2.5-flash',
		label: 'gemini-2.5-flash',
		tier: 'stable',
		detail: 'Stable low-latency model with strong price-performance for iterative coding work.',
		description: 'Stable fast path'
	},
	{
		id: 'gemini-2.5-flash-lite',
		label: 'gemini-2.5-flash-lite',
		tier: 'stable',
		detail: 'Smallest stable Gemini option for cheap classification and compact exploration.',
		description: 'Stable budget'
	},
	{
		id: 'gemini-3.1-pro-preview',
		label: 'gemini-3.1-pro-preview',
		tier: 'preview',
		detail: 'Latest preview reasoning model. Keep opt-in because previews can deprecate faster.',
		description: 'Preview frontier'
	},
	{
		id: 'gemini-3.1-flash-lite-preview',
		label: 'gemini-3.1-flash-lite-preview',
		tier: 'preview',
		detail: 'Latest preview fast-lite path for experimentation with newer Gemini 3.1 behavior.',
		description: 'Preview fast-lite'
	},
	{
		id: 'gemini-3-flash-preview',
		label: 'gemini-3-flash-preview',
		tier: 'preview',
		detail: 'Preview flash model for low-latency reasoning. Keep because existing workflows already reference it.',
		description: 'Preview fast path'
	}
];

const COPILOT_MODEL_CATALOG: ProviderModelDescriptor[] = [
	{
		id: 'gpt-5.4',
		label: 'gpt-5.4',
		tier: 'alias',
		detail: 'Strong Copilot family for planning, implementation, and review when available.',
		description: 'Preferred family',
		isDefaultCandidate: true
	},
	{
		id: 'gpt-5.4-mini',
		label: 'gpt-5.4-mini',
		tier: 'alias',
		detail: 'Lower-cost Copilot family for lighter workflows and preview generation.',
		description: 'Fast family'
	}
];

function buildRecommendedDetail(provider: ProviderTarget): Record<WorkflowPreset, string> {
	if (provider === 'claude') {
		return {
			explore: 'Use Claude when exploration needs deeper synthesis or explicit subagent-style decomposition.',
			plan: 'Use Claude when planning needs stronger architectural reasoning and tradeoff analysis.',
			build: 'Use Claude when implementation quality matters more than raw latency.',
			debug: 'Use Claude when root-cause isolation needs deeper reasoning over several hypotheses.',
			review: 'Use Claude when you want a more critical, reasoning-heavy review pass.',
			test: 'Use Claude when tests need broader diagnosis and repair rather than fast loops.'
		};
	}

	if (provider === 'gemini') {
		return {
			explore: 'Use Gemini when you want a broad, low-latency read of the repo with explicit structure.',
			plan: 'Use Gemini when planning should stay concise, grounded, and cost-aware.',
			build: 'Use Gemini when iterative implementation speed matters more than deepest reasoning.',
			debug: 'Use Gemini when debugging benefits from compact evidence-driven loops.',
			review: 'Use Gemini when review should stay crisp and focused on grounded file evidence.',
			test: 'Use Gemini when test generation and repair should optimize for speed and cost.'
		};
	}

	return {
		explore: 'Use Copilot when the workflow should stay fully inside VS Code with custom agents and references.',
		plan: 'Use Copilot when you want agent handoffs and workspace-native instructions for planning.',
		build: 'Use Copilot when the work should remain in-editor and benefit from custom agent routing.',
		debug: 'Use Copilot when fast local investigation and test execution inside VS Code are preferred.',
		review: 'Use Copilot when review should rely on workspace agents, handoffs, and skills.',
		test: 'Use Copilot when the test loop should stay tightly integrated with editor-native tools.'
	};
}

export const PROVIDER_CAPABILITIES: Record<ProviderTarget, ProviderCapabilities> = {
	claude: {
		provider: 'claude',
		label: 'Claude',
		instructionArtifactPath: 'CLAUDE.md',
		supportsNativeOptimization: false,
		supportsNativeHandoffs: false,
		supportsStableAliases: true,
		modelCatalog: CLAUDE_MODEL_CATALOG,
		recommendedDetail: buildRecommendedDetail('claude')
	},
	gemini: {
		provider: 'gemini',
		label: 'Gemini',
		instructionArtifactPath: 'GEMINI.md',
		supportsNativeOptimization: false,
		supportsNativeHandoffs: false,
		supportsStableAliases: true,
		modelCatalog: GEMINI_MODEL_CATALOG,
		recommendedDetail: buildRecommendedDetail('gemini')
	},
	copilot: {
		provider: 'copilot',
		label: 'Copilot',
		instructionArtifactPath: '.github/copilot-instructions.md',
		supportsNativeOptimization: true,
		supportsNativeHandoffs: true,
		supportsStableAliases: false,
		modelCatalog: COPILOT_MODEL_CATALOG,
		recommendedDetail: buildRecommendedDetail('copilot')
	}
};

export function getProviderCapabilities(provider: ProviderTarget): ProviderCapabilities {
	return PROVIDER_CAPABILITIES[provider];
}

export function getProviderModelCatalog(provider: ProviderTarget): ProviderModelDescriptor[] {
	return getProviderCapabilities(provider).modelCatalog;
}

function getBudgetSeed(costProfile: CostProfile): Omit<ContextBudget, 'profile'> {
	switch (costProfile) {
		case 'fast':
			return {
				treeDepth: 2,
				maxEntriesPerDirectory: 16,
				readmePreviewLines: 16,
				contextFilePreviewLines: 36,
				maxDependencies: 8,
				maxDevDependencies: 6,
				maxScripts: 6,
				maxKeyFiles: 6,
				maxInstructionFiles: 3
			};
		case 'strong':
			return {
				treeDepth: 4,
				maxEntriesPerDirectory: 40,
				readmePreviewLines: 36,
				contextFilePreviewLines: 120,
				maxDependencies: 12,
				maxDevDependencies: 12,
				maxScripts: 12,
				maxKeyFiles: 10,
				maxInstructionFiles: 6
			};
		case 'balanced':
		default:
			return {
				treeDepth: 3,
				maxEntriesPerDirectory: 28,
				readmePreviewLines: 24,
				contextFilePreviewLines: 72,
				maxDependencies: 10,
				maxDevDependencies: 8,
				maxScripts: 8,
				maxKeyFiles: 8,
				maxInstructionFiles: 4
			};
	}
}

export function buildContextBudget(provider: ProviderTarget, costProfile: CostProfile, configuration: ExtensionConfiguration): ContextBudget {
	const seed = getBudgetSeed(costProfile);
	const providerAdjusted = { ...seed };

	if (provider === 'copilot') {
		providerAdjusted.treeDepth = Math.min(providerAdjusted.treeDepth, 3);
		providerAdjusted.maxEntriesPerDirectory = Math.min(providerAdjusted.maxEntriesPerDirectory, 24);
		providerAdjusted.maxInstructionFiles = Math.min(providerAdjusted.maxInstructionFiles, 3);
		providerAdjusted.contextFilePreviewLines = Math.min(providerAdjusted.contextFilePreviewLines, 64);
	}

	if (provider === 'gemini') {
		providerAdjusted.readmePreviewLines += costProfile === 'strong' ? 4 : 2;
		providerAdjusted.contextFilePreviewLines += costProfile === 'fast' ? 4 : 8;
	}

	if (provider === 'claude' && costProfile !== 'fast') {
		providerAdjusted.maxInstructionFiles += 1;
	}

	return {
		profile: `${provider}-${costProfile}`,
		treeDepth: Math.min(configuration.treeDepth, providerAdjusted.treeDepth),
		maxEntriesPerDirectory: Math.min(configuration.maxEntriesPerDirectory, providerAdjusted.maxEntriesPerDirectory),
		readmePreviewLines: Math.min(configuration.readmePreviewLines, providerAdjusted.readmePreviewLines),
		contextFilePreviewLines: Math.min(configuration.contextFilePreviewLines, providerAdjusted.contextFilePreviewLines),
		maxDependencies: providerAdjusted.maxDependencies,
		maxDevDependencies: providerAdjusted.maxDevDependencies,
		maxScripts: providerAdjusted.maxScripts,
		maxKeyFiles: providerAdjusted.maxKeyFiles,
		maxInstructionFiles: Math.min(configuration.extraContextFiles.length || providerAdjusted.maxInstructionFiles, providerAdjusted.maxInstructionFiles)
	};
}

export function formatContextBudgetSummary(budget: ContextBudget): string {
	return [
		`treeDepth=${budget.treeDepth}`,
		`entries=${budget.maxEntriesPerDirectory}`,
		`readmeLines=${budget.readmePreviewLines}`,
		`instructionLines=${budget.contextFilePreviewLines}`,
		`deps=${budget.maxDependencies}`,
		`devDeps=${budget.maxDevDependencies}`,
		`scripts=${budget.maxScripts}`,
		`keyFiles=${budget.maxKeyFiles}`,
		`instructionFiles=${budget.maxInstructionFiles}`
	].join(', ');
}