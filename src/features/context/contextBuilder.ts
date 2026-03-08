import * as vscode from "vscode";
import { Logger } from "../../core/logger.js";
import { CONTEXT_FILE_NAME, GENERATED_SECTION_START, GENERATED_SECTION_END, WORKFLOW_SESSION_FILE, WORKFLOW_BRIEF_FILE, WORKFLOW_STAGE_DIRECTORY, WORKFLOW_STATE_DIRECTORY } from "../workflow/constants.js";
import type { ContextMetadata, OptimizationResult, ExtensionConfiguration, CostProfile, WorkflowExecutionPlan, WorkflowPreset, ProviderTarget, ContextRefreshMode, ClaudeEffortLevel, WorkflowSessionState, WorkflowBrief, ProjectContext, ArtifactPlan, WorkflowStageRecord } from "../workflow/types.js";
import type { ContextBudget } from "../providers/types.js";
import type { PackageDetails, AdditionalContextResult } from "./types.js";
import { readUtf8, buildWorkspaceUri, isIgnoredDirectory, normalizeWorkspaceRelativePath, shouldIncludeEntry } from "../../core/workspace.js";
import { computeSignature, serializeList, parseList } from "../../utils/index.js";
import { formatProviderModel } from "../providers/providerService.js";
import { buildArtifactPlan } from "../aiAgents/promptBuilder.js";
import { getExtensionConfiguration } from "../../core/configuration.js";
import { isRelevantFile } from "../../core/workspace.js";
import { replaceManagedBlock } from "../aiAgents/promptBuilder.js";
import { relativizeToWorkspace } from "../../core/workspace.js";
import { getProviderLabel } from "../providers/providerService.js";
import { formatWorkflowRoles } from "../workflow/ui.js";
import { buildContextBudget, formatContextBudgetSummary } from "../providers/providerCatalog.js";
import { readWorkflowSessionState, readWorkflowBrief, buildSuggestedNextPresets, buildContextGenerationMessage, persistWorkflowArtifacts } from './workflowPersistence.js';

export function buildRawContextContent(
	workflowPlan: WorkflowExecutionPlan,
	workspaceFolder: vscode.WorkspaceFolder,
	detectedTech: string[],
	readmeLines: string[],
	packageDetails: PackageDetails,
	treeLines: string[],
	additionalSections: string[],
	keyFiles: string[]
): string {
	return [
		'# AI Workflow Context Pack',
		'',
		`Workspace: ${workspaceFolder.name}`,
		`Workflow preset: ${workflowPlan.presetDefinition.label}`,
		`Target provider: ${workflowPlan.provider}`,
		`Provider model: ${formatProviderModel(workflowPlan.provider, workflowPlan.providerModel)}`,
		`Provider account: ${workflowPlan.providerAccountId ?? 'default'}`,
		workflowPlan.provider === 'claude' ? `Claude account: ${workflowPlan.claudeAccountId ?? 'default'}` : undefined,
		workflowPlan.provider === 'claude' ? `Claude effort: ${workflowPlan.claudeEffort ?? 'default'}` : undefined,
		`Role set: ${workflowPlan.roles.join(', ')}`,
		`Cost policy: ${workflowPlan.costProfile}`,
		'',
		'## Workflow Goal',
		workflowPlan.presetDefinition.launchInstruction,
		'',
		'## Workflow Shared Files',
		`Session file: ${WORKFLOW_SESSION_FILE}`,
		`Brief file: ${WORKFLOW_BRIEF_FILE}`,
		`Stage directory: ${WORKFLOW_STAGE_DIRECTORY}`,
		workflowPlan.brief ? `Current brief: ${workflowPlan.brief.goal}` : 'Current brief: none provided for this stage',
		'',
		'## Project Summary',
		detectedTech.length > 0 ? `Detected stack: ${detectedTech.join(', ')}` : 'Detected stack: Unknown',
		keyFiles.length > 0 ? `Key files: ${keyFiles.join(', ')}` : 'Key files: none detected',
		packageDetails.scripts.length > 0 ? `Useful commands: ${packageDetails.scripts.join(', ')}` : 'Useful commands: none detected',
		'',
		'## README Preview',
		readmeLines.length > 0 ? readmeLines.join('\n') : 'README.md not found.',
		'',
		'## Package Summary',
		packageDetails.summary,
		'',
		'## Workspace Tree',
		treeLines.length > 0 ? treeLines.join('\n') : '(workspace is empty)',
		'',
		'## Additional AI Instruction Files',
		additionalSections.length > 0 ? additionalSections.join('\n\n') : 'No assistant-specific instruction files found.',
		''
	].filter((value): value is string => value !== undefined).join('\n');
}
export function buildContextFileContent(metadata: ContextMetadata, optimizedContent: string, optimization: OptimizationResult): string {
	return [
		'# Context Generation Metadata',
		'',
		`Generated at: ${metadata.generatedAt}`,
		`Context signature: ${metadata.signature}`,
		`Workflow preset: ${metadata.preset}`,
		`Workflow provider: ${metadata.provider}`,
		`Workflow provider model: ${metadata.providerModel ?? 'default'}`,
		`Workflow provider account: ${metadata.providerAccountId ?? 'default'}`,
		`Claude account: ${metadata.claudeAccountId ?? 'default'}`,
		`Claude effort: ${metadata.claudeEffort ?? 'default'}`,
		`Context refresh mode: ${metadata.refreshMode}`,
		`Cost profile: ${metadata.costProfile}`,
		`Context reused: ${metadata.reused ? 'yes' : 'no'}`,
		`Optimizer applied: ${optimization.applied ? 'yes' : 'no'}`,
		`Optimizer model: ${optimization.modelName ?? 'n/a'}`,
		`Optimizer note: ${optimization.reason}`,
		metadata.contextBudgetProfile ? `Context budget profile: ${metadata.contextBudgetProfile}` : undefined,
		metadata.contextBudgetSummary ? `Context budget summary: ${metadata.contextBudgetSummary}` : undefined,
		`Key files: ${serializeList(metadata.keyFiles)}`,
		`Instruction files: ${serializeList(metadata.instructionFiles)}`,
		`Suggested commands: ${serializeList(metadata.commands)}`,
		`Native artifacts: ${serializeList(metadata.artifactFiles)}`,
		'',
		optimizedContent
	].filter((value): value is string => value !== undefined).join('\n');
}
export function parseContextMetadata(content: string): ContextMetadata | undefined {
	const lines = content.split(/\r?\n/);
	if (lines.length === 0 || lines[0].trim() !== '# Context Generation Metadata') {
		return undefined;
	}

	const values = new Map<string, string>();
	for (const line of lines.slice(1)) {
		if (!line.trim()) {
			break;
		}
		const separatorIndex = line.indexOf(':');
		if (separatorIndex <= 0) {
			continue;
		}
		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		values.set(key, value);
	}

	const preset = values.get('Workflow preset') as WorkflowPreset | undefined;
	const provider = values.get('Workflow provider') as ProviderTarget | undefined;
	const refreshMode = values.get('Context refresh mode') as ContextRefreshMode | undefined;
	const costProfile = values.get('Cost profile') as CostProfile | undefined;
	const providerModel = values.get('Workflow provider model') || undefined;
	const providerAccountId = values.get('Workflow provider account') || undefined;
	const claudeAccountId = values.get('Claude account') || undefined;
	const claudeEffort = values.get('Claude effort') as ClaudeEffortLevel | undefined;
	const signature = values.get('Context signature');
	const generatedAt = values.get('Generated at');
	if (!preset || !provider || !refreshMode || !costProfile || !signature || !generatedAt) {
		return undefined;
	}

	return {
		generatedAt,
		signature,
		preset,
		provider,
		providerModel,
		providerAccountId,
		claudeAccountId,
		claudeEffort,
		refreshMode,
		costProfile,
		reused: values.get('Context reused') === 'yes',
		keyFiles: parseList(values.get('Key files')),
		instructionFiles: parseList(values.get('Instruction files')),
		commands: parseList(values.get('Suggested commands')),
		artifactFiles: parseList(values.get('Native artifacts')),
		contextBudgetProfile: values.get('Context budget profile') || undefined,
		contextBudgetSummary: values.get('Context budget summary') || undefined
	};
}

export function applyContextBudgetConfiguration(
	configuration: ExtensionConfiguration,
	budget: ContextBudget
): ExtensionConfiguration {
	return {
		...configuration,
		treeDepth: Math.min(configuration.treeDepth, budget.treeDepth),
		readmePreviewLines: Math.min(configuration.readmePreviewLines, budget.readmePreviewLines),
		contextFilePreviewLines: Math.min(configuration.contextFilePreviewLines, budget.contextFilePreviewLines),
		maxEntriesPerDirectory: Math.min(configuration.maxEntriesPerDirectory, budget.maxEntriesPerDirectory),
		extraContextFiles: configuration.extraContextFiles.slice(0, budget.maxInstructionFiles)
	};
}
export async function optimizeContextWithCopilot(
	rawContext: string,
	configuration: ExtensionConfiguration,
	costProfile: CostProfile
): Promise<OptimizationResult> {
	try {
		const selector = configuration.modelFamily
			? { vendor: 'copilot', family: configuration.modelFamily }
			: getOptimizationSelector(costProfile);
		const models = await vscode.lm.selectChatModels(selector);
		if (models.length === 0) {
			return {
				content: rawContext,
				applied: false,
				reason: 'No Copilot chat model was available for optimization.'
			};
		}

		const [model] = models;
		const messages = [
			vscode.LanguageModelChatMessage.User([
				'You are optimizing a repository workflow context file for coding assistants.',
				'Rewrite the context as compact markdown.',
				'Keep only project-relevant structure, important files, instructions, stack details, constraints, key commands, and likely entry points.',
				'Do not invent facts.',
				'Keep the workflow goal and the provider-specific focus intact.',
				'Return only the optimized markdown that should be written to .ai-context.md.',
				'',
				'Raw context:',
				rawContext
			].join('\n'))
		];

		const tokenSource = new vscode.CancellationTokenSource();
		try {
			const response = await model.sendRequest(messages, {}, tokenSource.token);
			let optimized = '';
			for await (const fragment of response.text) {
				optimized += fragment;
			}

			const trimmed = optimized.trim();
			if (trimmed.length === 0) {
				return {
					content: rawContext,
					applied: false,
					reason: 'Copilot returned an empty optimization result.',
					modelName: model.name
				};
			}

			return {
				content: trimmed,
				applied: true,
				modelName: model.name,
				reason: 'Copilot rewrote the raw workflow context successfully.'
			};
		} finally {
			tokenSource.dispose();
		}
	} catch (error) {
		if (error instanceof vscode.LanguageModelError) {
			return {
				content: rawContext,
				applied: false,
				reason: `Copilot optimization unavailable: ${error.message}`
			};
		}

		return {
			content: rawContext,
			applied: false,
			reason: error instanceof Error ? error.message : 'Unknown optimization error.'
		};
	}
}
export async function readReadmeSummary(workspaceUri: vscode.Uri, maxLines: number): Promise<string[]> {
	const candidates = ['README.md', 'Readme.md', 'readme.md'];
	for (const candidate of candidates) {
		const file = vscode.Uri.joinPath(workspaceUri, candidate);
		try {
			const content = await readUtf8(file);
			return content.split(/\r?\n/).slice(0, maxLines);
		} catch {
			continue;
		}
	}

	return [];
}
export async function readAdditionalContextFiles(
	workspaceUri: vscode.Uri,
	filePaths: string[],
	maxLines: number
): Promise<AdditionalContextResult> {
	const sections: string[] = [];
	const foundPaths: string[] = [];

	for (const relativePath of filePaths) {
		const sanitizedPath = normalizeWorkspaceRelativePath(relativePath);
		if (!sanitizedPath) {
			continue;
		}

		const fileUri = buildWorkspaceUri(workspaceUri, sanitizedPath);
		if (!fileUri) {
			continue;
		}

		try {
			const content = await readUtf8(fileUri);
			const preview = content.split(/\r?\n/).slice(0, maxLines).join('\n');
			sections.push(`### ${sanitizedPath}\n\n${preview}`);
			foundPaths.push(sanitizedPath);
		} catch {
			continue;
		}
	}

	return { sections, foundPaths };
}
export async function buildWorkspaceTree(folder: vscode.Uri, depth: number, configuration: ExtensionConfiguration): Promise<string[]> {
	if (depth > configuration.treeDepth) {
		return [];
	}

	let entries: [string, vscode.FileType][] = [];
	try {
		entries = await vscode.workspace.fs.readDirectory(folder);
	} catch (error) {
		Logger.warn(`Failed to read directory ${folder.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
		return [];
	}

	const sortedEntries = entries
		.sort(([leftName, leftType], [rightName, rightType]) => {
			if (leftType !== rightType) {
				return leftType === vscode.FileType.Directory ? -1 : 1;
			}
			return leftName.localeCompare(rightName);
		});

	let includedEntries = 0;
	let omittedEntries = 0;

	// Prepare entries to process
	const validEntries = sortedEntries.filter(([name, type]) => {
		if (type === vscode.FileType.Directory && isIgnoredDirectory(name)) {
			return true; // Keep to show as excluded if needed
		}
		if (name === CONTEXT_FILE_NAME) {
			return false;
		}
		if (!shouldIncludeEntry(name, type, depth)) {
			omittedEntries += 1;
			return false;
		}
		if (includedEntries >= configuration.maxEntriesPerDirectory) {
			omittedEntries += 1;
			return false;
		}
		includedEntries += 1;
		return true;
	});

	// Process them in parallel
	const prefix = `${'  '.repeat(depth)}- `;
	const linesPromises = validEntries.map(async ([name, type]) => {
		if (type === vscode.FileType.Directory && isIgnoredDirectory(name)) {
			if (configuration.showIgnoredDirectories) {
				return [`${prefix}${name}/ (excluded)`];
			}
			return [];
		}

		if (type === vscode.FileType.Directory) {
			const dirLines = [`${prefix}${name}/`];
			if (depth < configuration.treeDepth) {
				const subLines = await buildWorkspaceTree(vscode.Uri.joinPath(folder, name), depth + 1, configuration);
				dirLines.push(...subLines);
			}
			return dirLines;
		}

		return [`${prefix}${name}`];
	});

	const resolvedLinesArrays = await Promise.all(linesPromises);
	const lines = resolvedLinesArrays.flat();

	if (omittedEntries > 0) {
		lines.push(`${'  '.repeat(depth)}- ... ${omittedEntries} additional entries omitted`);
	}

	return lines;
}
export function getOptimizationSelector(costProfile: CostProfile): { vendor: string; family?: string } {
	switch (costProfile) {
		case 'fast':
			return { vendor: 'copilot', family: 'gpt-4o-mini' };
		case 'strong':
			return { vendor: 'copilot', family: 'gpt-4o' };
		case 'balanced':
		default:
			return { vendor: 'copilot' };
	}
}
export async function gatherProjectContext(
	isStartupAutoGeneration: boolean,
	workflowPlan: WorkflowExecutionPlan,
	workspaceFolderOverride?: vscode.WorkspaceFolder
): Promise<ProjectContext | undefined> {
	const workspaceFolder = workspaceFolderOverride ?? vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showWarningMessage('Open a workspace folder before running AI Context Orchestrator.');
		return undefined;
	}

	const contextFile = vscode.Uri.joinPath(workspaceFolder.uri, CONTEXT_FILE_NAME);

	try {
		if (workflowPlan.refreshMode === 'reuse') {
			const reusedProjectContext = await tryReuseExistingContext(contextFile, workspaceFolder, workflowPlan, 'Reused existing context file by user request.');
			if (reusedProjectContext) {
				return reusedProjectContext;
			}
		}

		const configuration = getExtensionConfiguration();
		const contextBudget = buildContextBudget(workflowPlan.provider, workflowPlan.costProfile, configuration);
		const budgetedConfiguration = applyContextBudgetConfiguration(configuration, contextBudget);
		const [treeLines, readmeLines, packageDetails, additionalContext, keyFiles] = await Promise.all([
			buildWorkspaceTree(workspaceFolder.uri, 0, budgetedConfiguration),
			readReadmeSummary(workspaceFolder.uri, budgetedConfiguration.readmePreviewLines),
			readPackageDetails(workspaceFolder.uri, contextBudget),
			readAdditionalContextFiles(workspaceFolder.uri, budgetedConfiguration.extraContextFiles, budgetedConfiguration.contextFilePreviewLines),
			collectKeyFiles(workspaceFolder.uri, contextBudget.maxKeyFiles)
		]);

		const detectedTech = detectTechStack(packageDetails, treeLines, readmeLines);
		const signatureSource = [
			workflowPlan.preset,
			workflowPlan.provider,
			workflowPlan.providerModel ?? 'default',
			workflowPlan.providerAccountId ?? 'default',
			workflowPlan.claudeAccountId ?? 'default',
			workflowPlan.claudeEffort ?? 'default',
			workflowPlan.costProfile,
			packageDetails.summary,
			readmeLines.join('\n'),
			treeLines.join('\n'),
			additionalContext.sections.join('\n')
		].join('\n');
		const signature = computeSignature(signatureSource);

		if (workflowPlan.refreshMode === 'smart-refresh') {
			const reusedProjectContext = await tryReuseExistingContext(
				contextFile,
				workspaceFolder,
				workflowPlan,
				'Smart refresh reused the existing context file because the workspace signature matched.',
				signature
			);
			if (reusedProjectContext) {
				return reusedProjectContext;
			}
		}

		const rawContent = buildRawContextContent(workflowPlan, workspaceFolder, detectedTech, readmeLines, packageDetails, treeLines, additionalContext.sections, keyFiles);
		const optimization = workflowPlan.optimizeWithCopilot
			? await optimizeContextWithCopilot(rawContent, configuration, workflowPlan.costProfile)
			: {
				content: rawContent,
				applied: false,
				reason: 'Copilot optimization disabled for this run.'
			};

		const baseMetadata: ContextMetadata = {
			generatedAt: new Date().toISOString(),
			signature,
			preset: workflowPlan.preset,
			provider: workflowPlan.provider,
			providerModel: workflowPlan.providerModel,
			providerAccountId: workflowPlan.providerAccountId,
			claudeAccountId: workflowPlan.claudeAccountId,
			claudeEffort: workflowPlan.claudeEffort,
			refreshMode: workflowPlan.refreshMode,
			costProfile: workflowPlan.costProfile,
			reused: false,
			keyFiles,
			instructionFiles: additionalContext.foundPaths,
			commands: packageDetails.scripts,
			artifactFiles: [],
			contextBudgetProfile: contextBudget.profile,
			contextBudgetSummary: formatContextBudgetSummary(contextBudget)
		};

		const preliminaryArtifactPlan = workflowPlan.generateNativeArtifacts
			? buildArtifactPlan(workspaceFolder.uri, workflowPlan, baseMetadata)
			: undefined;
		const metadata: ContextMetadata = {
			...baseMetadata,
			artifactFiles: preliminaryArtifactPlan?.files.map((file) => file.relativePath) ?? []
		};
		const artifactPlan = workflowPlan.generateNativeArtifacts
			? buildArtifactPlan(workspaceFolder.uri, workflowPlan, metadata)
			: undefined;

		const content = buildContextFileContent(metadata, optimization.content, optimization);
		const workflowArtifacts = await persistWorkflowArtifacts(workspaceFolder, workflowPlan, metadata, contextFile, artifactPlan, content);

		Logger.info(`Generated ${CONTEXT_FILE_NAME} for ${workspaceFolder.name}`);
		Logger.info(`Workflow=${workflowPlan.preset} provider=${workflowPlan.provider} refresh=${workflowPlan.refreshMode} cost=${workflowPlan.costProfile}`);
		Logger.info(`Optimizer requested=${workflowPlan.optimizeWithCopilot} applied=${optimization.applied} model=${optimization.modelName ?? 'n/a'} note=${optimization.reason}`);
		if (artifactPlan) {
			Logger.info(`Generated ${artifactPlan.files.length} ${workflowPlan.provider} artifact(s)`);
		}
		Logger.info(`Prepared shared handoff ${workflowArtifacts.stage.stageFile}`);
		if (!isStartupAutoGeneration) {
			void vscode.window.setStatusBarMessage(buildContextGenerationMessage({
				workspaceFolder,
				contextFile,
				content,
				optimization,
				metadata,
				workflowPlan,
				artifactPlan,
				reused: false,
				workflowSession: workflowArtifacts.session,
				currentStage: workflowArtifacts.stage,
				brief: workflowArtifacts.brief
			}), 6000);
		}

		return {
			workspaceFolder,
			contextFile,
			content,
			optimization,
			metadata,
			workflowPlan,
			artifactPlan,
			reused: false,
			workflowSession: workflowArtifacts.session,
			currentStage: workflowArtifacts.stage,
			brief: workflowArtifacts.brief
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		Logger.error(message);
		vscode.window.showErrorMessage(`Failed to generate ${CONTEXT_FILE_NAME}: ${message}`);
		return undefined;
	}
}
export function detectTechStack(packageDetails: PackageDetails, treeLines: string[], readmeLines: string[]): string[] {
	const detected = new Set<string>();
	const tree = treeLines.join('\n').toLowerCase();
	const combinedDeps = { ...packageDetails.dependencies, ...packageDetails.devDependencies };

	if (combinedDeps['typescript'] || tree.includes('.ts') || tree.includes('.tsx')) {
		detected.add('TypeScript');
	}
	if (combinedDeps['react'] || combinedDeps['react-dom'] || tree.includes('.jsx')) {
		detected.add('React');
	}
	if (combinedDeps['@types/vscode']) {
		detected.add('VS Code Extension');
	}
	if (combinedDeps['eslint']) {
		detected.add('ESLint');
	}
	if (combinedDeps['esbuild']) {
		detected.add('esbuild');
	}
	if (combinedDeps['mocha']) {
		detected.add('Mocha');
	}
	if (tree.includes('index.html') || tree.includes('.html')) {
		detected.add('HTML');
	}
	if (tree.includes('.css') || tree.includes('.scss')) {
		detected.add('CSS');
	}
	if (Object.keys(combinedDeps).length > 0 || tree.includes('.js')) {
		detected.add('JavaScript');
	}
	if (combinedDeps['express'] || combinedDeps['fastify'] || combinedDeps['koa'] || tree.includes('server.js')) {
		detected.add('Node.js');
	}
	if (/\.worker\.(js|ts)/.test(tree)) {
		detected.add('Web Workers');
	}

	return [...detected];
}
	export async function readPackageDetails(workspaceUri: vscode.Uri, budget?: Pick<ContextBudget, 'maxDependencies' | 'maxDevDependencies' | 'maxScripts'>): Promise<PackageDetails> {
	const packageUri = vscode.Uri.joinPath(workspaceUri, 'package.json');
	try {
		const packageContent = await readUtf8(packageUri);
		const packageJson = JSON.parse(packageContent) as {
			name?: string;
			version?: string;
			description?: string;
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
			scripts?: Record<string, string>;
		};

		const devDependenciesText = formatDependencyList(packageJson.devDependencies, budget?.maxDevDependencies);
		const scripts = packageJson.scripts
			? Object.keys(packageJson.scripts)
				.sort((left, right) => left.localeCompare(right))
				.slice(0, budget?.maxScripts ?? 8)
			: [];

		return {
			summary: [
				`Name: ${packageJson.name ?? 'unknown'}`,
				`Version: ${packageJson.version ?? 'unknown'}`,
				`Description: ${packageJson.description ?? 'n/a'}`,
				`Dependencies: ${formatDependencyList(packageJson.dependencies, budget?.maxDependencies)}`,
				`Dev dependencies: ${devDependenciesText}`,
				`Scripts: ${scripts.length > 0 ? scripts.join(', ') : 'none'}`
			].join('\n'),
			scripts,
			dependencies: packageJson.dependencies ?? {},
			devDependencies: packageJson.devDependencies ?? {}
		};
	} catch (error) {
		Logger.warn(`Failed to read package.json: ${error instanceof Error ? error.message : String(error)}`);
		return {
			summary: 'package.json not found.',
			scripts: [],
			dependencies: {},
			devDependencies: {}
		};
	}
}
export async function collectKeyFiles(workspaceUri: vscode.Uri, limit = 8): Promise<string[]> {
	try {
		const entries = await vscode.workspace.fs.readDirectory(workspaceUri);
		return entries
			.filter(([name, type]) => type === vscode.FileType.File && isRelevantFile(name) && name !== CONTEXT_FILE_NAME)
			.map(([name]) => name)
			.sort((left, right) => left.localeCompare(right))
			.slice(0, limit);
	} catch {
		return [];
	}
}
export function formatDependencyList(dependencies: Record<string, string> | undefined, limit = 12): string {
	if (!dependencies || Object.keys(dependencies).length === 0) {
		return 'none';
	}

	return Object.entries(dependencies)
		.sort(([left], [right]) => left.localeCompare(right))
		.slice(0, limit)
		.map(([name, version]) => `${name}@${version}`)
		.join(', ');
}
export async function tryReuseExistingContext(
	contextFile: vscode.Uri,
	workspaceFolder: vscode.WorkspaceFolder,
	workflowPlan: WorkflowExecutionPlan,
	reason: string,
	expectedSignature?: string
): Promise<ProjectContext | undefined> {
	try {
		const content = await readUtf8(contextFile);
		const parsedMetadata = parseContextMetadata(content);
		if (!parsedMetadata) {
			return undefined;
		}

		if (expectedSignature && parsedMetadata.signature !== expectedSignature) {
			return undefined;
		}

		if (expectedSignature && (
			parsedMetadata.preset !== workflowPlan.preset ||
			parsedMetadata.provider !== workflowPlan.provider ||
			(parsedMetadata.providerModel ?? 'default') !== (workflowPlan.providerModel ?? 'default') ||
			(parsedMetadata.providerAccountId ?? 'default') !== (workflowPlan.providerAccountId ?? 'default') ||
			parsedMetadata.costProfile !== workflowPlan.costProfile
		)) {
			return undefined;
		}

		const metadata: ContextMetadata = {
			...parsedMetadata,
			reused: true,
			providerModel: workflowPlan.providerModel,
			providerAccountId: workflowPlan.providerAccountId,
			claudeAccountId: workflowPlan.claudeAccountId,
			claudeEffort: workflowPlan.claudeEffort,
			refreshMode: workflowPlan.refreshMode,
			preset: workflowPlan.preset,
			provider: workflowPlan.provider,
			costProfile: workflowPlan.costProfile
		};
		const artifactPlan = workflowPlan.generateNativeArtifacts
			? buildArtifactPlan(workspaceFolder.uri, workflowPlan, metadata)
			: undefined;
		const workflowArtifacts = await persistWorkflowArtifacts(workspaceFolder, workflowPlan, metadata, contextFile, artifactPlan);

		Logger.info(reason);
		if (artifactPlan) {
			Logger.info(`Refreshed ${artifactPlan.files.length} ${workflowPlan.provider} artifact(s) while reusing context`);
		}
		Logger.info(`Prepared shared handoff ${workflowArtifacts.stage.stageFile}`);

		return {
			workspaceFolder,
			contextFile,
			content,
			optimization: {
				content,
				applied: false,
				reason
			},
			metadata,
			workflowPlan,
			artifactPlan,
			reused: true,
			workflowSession: workflowArtifacts.session,
			currentStage: workflowArtifacts.stage,
			brief: workflowArtifacts.brief
		};
	} catch (error) {
		Logger.warn(`Failed to reuse context: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}
}
export * from './workflowPersistence.js';
