import * as vscode from "vscode";
import { CONTEXT_FILE_NAME, GENERATED_SECTION_START, GENERATED_SECTION_END, WORKFLOW_SESSION_FILE, WORKFLOW_BRIEF_FILE, WORKFLOW_STAGE_DIRECTORY, WORKFLOW_STATE_DIRECTORY } from "../workflow/constants.js";
import type { ContextMetadata, OptimizationResult, ExtensionConfiguration, AdditionalContextResult, CostProfile, WorkflowExecutionPlan, PackageDetails, WorkflowPreset, ProviderTarget, ContextRefreshMode, ClaudeEffortLevel, WorkflowSessionState, WorkflowBrief, ProjectContext, ArtifactPlan, WorkflowStageRecord } from "../workflow/types.js";
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
	].filter((value): value is string => Boolean(value)).join('\n');
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
		`Key files: ${serializeList(metadata.keyFiles)}`,
		`Instruction files: ${serializeList(metadata.instructionFiles)}`,
		`Suggested commands: ${serializeList(metadata.commands)}`,
		`Native artifacts: ${serializeList(metadata.artifactFiles)}`,
		'',
		optimizedContent
	].join('\n');
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
		artifactFiles: parseList(values.get('Native artifacts'))
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

		const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
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

	const entries = await vscode.workspace.fs.readDirectory(folder);
	const sortedEntries = entries
		.sort(([leftName, leftType], [rightName, rightType]) => {
			if (leftType !== rightType) {
				return leftType === vscode.FileType.Directory ? -1 : 1;
			}

			return leftName.localeCompare(rightName);
		});

	const lines: string[] = [];
	let includedEntries = 0;
	let omittedEntries = 0;

	for (const [name, type] of sortedEntries) {
		const prefix = `${'  '.repeat(depth)}- `;
		if (type === vscode.FileType.Directory && isIgnoredDirectory(name)) {
			if (configuration.showIgnoredDirectories) {
				lines.push(`${prefix}${name}/ (excluded)`);
			}
			continue;
		}

		if (name === CONTEXT_FILE_NAME) {
			continue;
		}

		if (!shouldIncludeEntry(name, type, depth)) {
			omittedEntries += 1;
			continue;
		}

		if (includedEntries >= configuration.maxEntriesPerDirectory) {
			omittedEntries += 1;
			continue;
		}

		includedEntries += 1;
		if (type === vscode.FileType.Directory) {
			lines.push(`${prefix}${name}/`);
			if (depth < configuration.treeDepth) {
				lines.push(...await buildWorkspaceTree(vscode.Uri.joinPath(folder, name), depth + 1, configuration));
			}
			continue;
		}

		lines.push(`${prefix}${name}`);
	}

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
	outputChannel: vscode.OutputChannel,
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
			const reusedProjectContext = await tryReuseExistingContext(contextFile, workspaceFolder, workflowPlan, outputChannel, 'Reused existing context file by user request.');
			if (reusedProjectContext) {
				return reusedProjectContext;
			}
		}

		const configuration = getExtensionConfiguration();
		const [treeLines, readmeLines, packageDetails, additionalContext, keyFiles] = await Promise.all([
			buildWorkspaceTree(workspaceFolder.uri, 0, configuration),
			readReadmeSummary(workspaceFolder.uri, configuration.readmePreviewLines),
			readPackageDetails(workspaceFolder.uri),
			readAdditionalContextFiles(workspaceFolder.uri, configuration.extraContextFiles, configuration.contextFilePreviewLines),
			collectKeyFiles(workspaceFolder.uri)
		]);

		const detectedTech = detectTechStack(packageDetails.summary, treeLines, readmeLines);
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
				outputChannel,
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
			artifactFiles: []
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

		outputChannel.appendLine(`[context] Generated ${CONTEXT_FILE_NAME} for ${workspaceFolder.name}`);
		outputChannel.appendLine(`[context] Workflow=${workflowPlan.preset} provider=${workflowPlan.provider} refresh=${workflowPlan.refreshMode} cost=${workflowPlan.costProfile}`);
		outputChannel.appendLine(`[context] Optimizer requested=${workflowPlan.optimizeWithCopilot} applied=${optimization.applied} model=${optimization.modelName ?? 'n/a'} note=${optimization.reason}`);
		if (artifactPlan) {
			outputChannel.appendLine(`[artifacts] Generated ${artifactPlan.files.length} ${workflowPlan.provider} artifact(s)`);
		}
		outputChannel.appendLine(`[workflow] Prepared shared handoff ${workflowArtifacts.stage.stageFile}`);
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
		outputChannel.appendLine(`[error] ${message}`);
		vscode.window.showErrorMessage(`Failed to generate ${CONTEXT_FILE_NAME}: ${message}`);
		return undefined;
	}
}
export function detectTechStack(packageSummary: string, treeLines: string[], readmeLines: string[]): string[] {
	const detected = new Set<string>();
	const summary = packageSummary.toLowerCase();
	const tree = treeLines.join('\n').toLowerCase();
	const readme = readmeLines.join('\n').toLowerCase();
	const combined = `${summary}\n${tree}\n${readme}`;

	if (combined.includes('typescript') || tree.includes('.ts') || tree.includes('.tsx')) {
		detected.add('TypeScript');
	}
	if (combined.includes('react') || tree.includes('.jsx')) {
		detected.add('React');
	}
	if (summary.includes('@types/vscode')) {
		detected.add('VS Code Extension');
	}
	if (combined.includes('eslint')) {
		detected.add('ESLint');
	}
	if (combined.includes('esbuild')) {
		detected.add('esbuild');
	}
	if (combined.includes('mocha')) {
		detected.add('Mocha');
	}
	if (tree.includes('index.html') || tree.includes('.html')) {
		detected.add('HTML');
	}
	if (tree.includes('.css') || tree.includes('.scss')) {
		detected.add('CSS');
	}
	if (tree.includes('.js') || summary.includes('package.json')) {
		detected.add('JavaScript');
	}
	if (tree.includes('server.js') || combined.includes('express') || combined.includes('fastify') || combined.includes('koa')) {
		detected.add('Node.js');
	}
	if (/\.worker\.(js|ts)/.test(tree)) {
		detected.add('Web Workers');
	}

	return [...detected];
}
export async function readPackageDetails(workspaceUri: vscode.Uri): Promise<PackageDetails> {
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

		const dependencies = formatDependencyList(packageJson.dependencies);
		const devDependencies = formatDependencyList(packageJson.devDependencies);
		const scripts = packageJson.scripts
			? Object.keys(packageJson.scripts)
				.sort((left, right) => left.localeCompare(right))
				.slice(0, 8)
			: [];

		return {
			summary: [
				`Name: ${packageJson.name ?? 'unknown'}`,
				`Version: ${packageJson.version ?? 'unknown'}`,
				`Description: ${packageJson.description ?? 'n/a'}`,
				`Dependencies: ${dependencies}`,
				`Dev dependencies: ${devDependencies}`,
				`Scripts: ${scripts.length > 0 ? scripts.join(', ') : 'none'}`
			].join('\n'),
			scripts
		};
	} catch {
		return {
			summary: 'package.json not found.',
			scripts: []
		};
	}
}
export async function collectKeyFiles(workspaceUri: vscode.Uri): Promise<string[]> {
	try {
		const entries = await vscode.workspace.fs.readDirectory(workspaceUri);
		return entries
			.filter(([name, type]) => type === vscode.FileType.File && isRelevantFile(name) && name !== CONTEXT_FILE_NAME)
			.map(([name]) => name)
			.sort((left, right) => left.localeCompare(right))
			.slice(0, 8);
	} catch {
		return [];
	}
}
export function formatDependencyList(dependencies: Record<string, string> | undefined): string {
	if (!dependencies || Object.keys(dependencies).length === 0) {
		return 'none';
	}

	return Object.entries(dependencies)
		.sort(([left], [right]) => left.localeCompare(right))
		.slice(0, 12)
		.map(([name, version]) => `${name}@${version}`)
		.join(', ');
}
export async function tryReuseExistingContext(
	contextFile: vscode.Uri,
	workspaceFolder: vscode.WorkspaceFolder,
	workflowPlan: WorkflowExecutionPlan,
	outputChannel: vscode.OutputChannel,
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

		outputChannel.appendLine(`[context] ${reason}`);
		if (artifactPlan) {
			outputChannel.appendLine(`[artifacts] Refreshed ${artifactPlan.files.length} ${workflowPlan.provider} artifact(s) while reusing context`);
		}
		outputChannel.appendLine(`[workflow] Prepared shared handoff ${workflowArtifacts.stage.stageFile}`);

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
	} catch {
		return undefined;
	}
}
export * from './workflowPersistence.js';
