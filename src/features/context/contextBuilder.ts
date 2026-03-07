import * as vscode from "vscode";
import { CONTEXT_FILE_NAME, GENERATED_SECTION_START, GENERATED_SECTION_END, WORKFLOW_SESSION_FILE, WORKFLOW_BRIEF_FILE, WORKFLOW_STAGE_DIRECTORY, WORKFLOW_STATE_DIRECTORY } from "../workflow/constants.js";
import type { ContextMetadata, OptimizationResult, ExtensionConfiguration, AdditionalContextResult, CostProfile, WorkflowExecutionPlan, PackageDetails, WorkflowPreset, ProviderTarget, ContextRefreshMode, ClaudeEffortLevel, WorkflowSessionState, WorkflowBrief, ProjectContext, ArtifactPlan, WorkflowStageRecord } from "../workflow/types.js";
import { readUtf8, buildWorkspaceUri, isIgnoredDirectory, shouldIncludeEntry } from "../../core/workspace.js";
import { computeSignature, serializeList, parseList } from "../../utils/index.js";
import { formatProviderModel } from "../providers/providerService.js";
import { buildArtifactPlan } from "../aiAgents/promptBuilder.js";
import { getExtensionConfiguration } from "../../core/configuration.js";
import { isRelevantFile } from "../../core/workspace.js";
import { replaceManagedBlock } from "../aiAgents/promptBuilder.js";
import { relativizeToWorkspace } from "../../core/workspace.js";
import { getProviderLabel } from "../providers/providerService.js";
import { formatWorkflowRoles } from "../workflow/ui.js";

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
		const sanitizedPath = relativePath.trim();
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
	workflowPlan: WorkflowExecutionPlan
): Promise<ProjectContext | undefined> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
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
		await vscode.workspace.fs.writeFile(contextFile, Buffer.from(content, 'utf8'));

		if (artifactPlan) {
			await writeArtifactPlan(workspaceFolder.uri, artifactPlan);
		}
		const workflowArtifacts = await persistWorkflowArtifacts(workspaceFolder, workflowPlan, metadata, contextFile, artifactPlan);

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
export async function readWorkflowSessionState(workspaceUri: vscode.Uri): Promise<WorkflowSessionState | undefined> {
	const sessionUri = buildWorkspaceUri(workspaceUri, WORKFLOW_SESSION_FILE);
	if (!sessionUri) {
		return undefined;
	}

	try {
		const content = await readUtf8(sessionUri);
		return JSON.parse(content) as WorkflowSessionState;
	} catch {
		return undefined;
	}
}
export async function readWorkflowBrief(workspaceUri: vscode.Uri): Promise<WorkflowBrief | undefined> {
	const briefUri = buildWorkspaceUri(workspaceUri, WORKFLOW_BRIEF_FILE);
	if (!briefUri) {
		return undefined;
	}

	try {
		const content = await readUtf8(briefUri);
		const lines = content.split(/\r?\n/);
		const taskType = lines.find((line) => line.startsWith('Type:'))?.slice('Type:'.length).trim() ?? 'general';
		const goal = lines.find((line) => line.startsWith('Goal:'))?.slice('Goal:'.length).trim() ?? '';
		return {
			taskType,
			goal,
			constraints: lines.filter((line) => line.startsWith('- ')).map((line) => line.slice(2).trim()),
			rawText: content.trim()
		};
	} catch {
		return undefined;
	}
}
export async function writeArtifactPlan(workspaceUri: vscode.Uri, artifactPlan: ArtifactPlan): Promise<void> {
	for (const artifact of artifactPlan.files) {
		const fileUri = buildWorkspaceUri(workspaceUri, artifact.relativePath);
		if (!fileUri) {
			continue;
		}

		await ensureParentDirectory(fileUri);
		if (artifact.kind === 'instruction') {
			await upsertManagedMarkdown(fileUri, artifact.content);
			continue;
		}

		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(artifact.content.trimEnd() + '\n', 'utf8'));
	}
}
export async function ensureParentDirectory(fileUri: vscode.Uri): Promise<void> {
	const path = fileUri.path;
	const lastSlashIndex = path.lastIndexOf('/');
	if (lastSlashIndex <= 0) {
		return;
	}

	const parentPath = path.slice(0, lastSlashIndex);
	const parentUri = fileUri.with({ path: parentPath });
	await vscode.workspace.fs.createDirectory(parentUri);
}
export async function upsertManagedMarkdown(fileUri: vscode.Uri, generatedContent: string): Promise<void> {
	const managedBlock = `${GENERATED_SECTION_START}\n${generatedContent.trim()}\n${GENERATED_SECTION_END}\n`;
	try {
		const existingContent = await readUtf8(fileUri);
		const nextContent = replaceManagedBlock(existingContent, managedBlock);
		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(nextContent, 'utf8'));
	} catch {
		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(managedBlock, 'utf8'));
	}
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
		if (artifactPlan) {
			await writeArtifactPlan(workspaceFolder.uri, artifactPlan);
		}
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
export async function persistWorkflowArtifacts(
	workspaceFolder: vscode.WorkspaceFolder,
	workflowPlan: WorkflowExecutionPlan,
	metadata: ContextMetadata,
	contextFile: vscode.Uri,
	artifactPlan?: ArtifactPlan
): Promise<{ session: WorkflowSessionState; stage: WorkflowStageRecord; brief?: WorkflowBrief }> {
	const existingSession = await readWorkflowSessionState(workspaceFolder.uri);
	const brief = workflowPlan.brief ?? await readWorkflowBrief(workspaceFolder.uri);
	if (brief) {
		await writeWorkflowBrief(workspaceFolder.uri, brief);
	}

	const nextIndex = (existingSession?.currentStageIndex ?? 0) + 1;
	const stageFile = `${WORKFLOW_STAGE_DIRECTORY}/${String(nextIndex).padStart(2, '0')}-${workflowPlan.preset}.md`;
	const upstreamStageFiles = existingSession?.stages.map((stage) => stage.stageFile) ?? [];
	const stage: WorkflowStageRecord = {
		index: nextIndex,
		preset: workflowPlan.preset,
		provider: workflowPlan.provider,
		providerModel: workflowPlan.providerModel,
		providerAccountId: workflowPlan.providerAccountId,
		status: 'prepared',
		stageFile,
		generatedAt: new Date().toISOString(),
		briefSummary: brief?.goal ?? (workflowPlan.preset === 'explore' ? 'Explore the repository and identify reusable patterns.' : 'No brief provided.'),
		contextFile: relativizeToWorkspace(workspaceFolder.uri, contextFile),
		claudeAccountId: workflowPlan.claudeAccountId,
		claudeEffort: workflowPlan.claudeEffort,
		artifactFiles: artifactPlan?.files.map((file) => file.relativePath) ?? [],
		upstreamStageFiles
	};

	await writeWorkflowStageFile(workspaceFolder.uri, stageFile, buildWorkflowStageContent(workflowPlan, stage, brief));

	const session: WorkflowSessionState = {
		workspaceName: workspaceFolder.name,
		updatedAt: new Date().toISOString(),
		currentStageIndex: nextIndex,
		currentPreset: workflowPlan.preset,
		currentProvider: workflowPlan.provider,
		currentProviderModel: workflowPlan.providerModel,
		currentProviderAccountId: workflowPlan.providerAccountId,
		currentClaudeAccountId: workflowPlan.claudeAccountId,
		currentClaudeEffort: workflowPlan.claudeEffort,
		briefFile: WORKFLOW_BRIEF_FILE,
		stages: [...(existingSession?.stages ?? []), stage]
	};

	await writeWorkflowSessionState(workspaceFolder.uri, session);
	return { session, stage, brief };
}
export function buildContextGenerationMessage(projectContext: ProjectContext): string {
	const parts = [
		`${projectContext.workflowPlan.presetDefinition.label} workflow prepared for ${projectContext.workflowPlan.provider}.`,
		projectContext.reused
			? 'Existing context pack reused.'
			: projectContext.optimization.applied
				? `Context optimized by Copilot (${projectContext.optimization.modelName ?? 'model unknown'}).`
				: `Context generated without Copilot optimization. ${projectContext.optimization.reason}`
	];

	if (projectContext.artifactPlan) {
		parts.push(`${projectContext.artifactPlan.files.length} native artifact(s) prepared.`);
	}

	if (projectContext.currentStage) {
		parts.push(`Shared handoff prepared at ${projectContext.currentStage.stageFile}.`);
	}

	return parts.join(' ');
}
export async function writeWorkflowBrief(workspaceUri: vscode.Uri, brief: WorkflowBrief): Promise<void> {
	const briefUri = buildWorkspaceUri(workspaceUri, WORKFLOW_BRIEF_FILE);
	if (!briefUri) {
		return;
	}

	await ensureParentDirectory(briefUri);
	const content = [
		'# User Brief',
		'',
		`Type: ${brief.taskType}`,
		`Goal: ${brief.goal}`,
		'',
		'Constraints:',
		...(brief.constraints.length > 0 ? brief.constraints.map((constraint) => `- ${constraint}`) : ['- none provided']),
		'',
		'Raw:',
		brief.rawText
	].join('\n');
	await vscode.workspace.fs.writeFile(briefUri, Buffer.from(content.trimEnd() + '\n', 'utf8'));
}
export async function writeWorkflowSessionState(workspaceUri: vscode.Uri, session: WorkflowSessionState): Promise<void> {
	const sessionUri = buildWorkspaceUri(workspaceUri, WORKFLOW_SESSION_FILE);
	if (!sessionUri) {
		return;
	}

	await ensureParentDirectory(sessionUri);
	await vscode.workspace.fs.writeFile(sessionUri, Buffer.from(`${JSON.stringify(session, null, 2)}\n`, 'utf8'));
}
export async function writeWorkflowStageFile(workspaceUri: vscode.Uri, relativePath: string, content: string): Promise<void> {
	const fileUri = buildWorkspaceUri(workspaceUri, relativePath);
	if (!fileUri) {
		return;
	}

	await ensureParentDirectory(fileUri);
	await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content.trimEnd() + '\n', 'utf8'));
}
export function buildWorkflowStageContent(
	workflowPlan: WorkflowExecutionPlan,
	stage: WorkflowStageRecord,
	brief?: WorkflowBrief
): string {
	return [
		`# Stage ${String(stage.index).padStart(2, '0')} ${workflowPlan.presetDefinition.label}`,
		'',
		`- Provider: ${getProviderLabel(workflowPlan.provider)}`,
		`- Provider model: ${formatProviderModel(workflowPlan.provider, stage.providerModel)}`,
		`- Provider account: ${stage.providerAccountId ?? 'default'}`,
		workflowPlan.provider === 'claude' ? `- Claude account: ${stage.claudeAccountId ?? 'default'}` : undefined,
		workflowPlan.provider === 'claude' ? `- Claude effort: ${stage.claudeEffort ?? 'default'}` : undefined,
		`- Preset: ${workflowPlan.preset}`,
		`- Roles: ${formatWorkflowRoles(workflowPlan.roles)}`,
		`- Status: ${stage.status}`,
		`- Generated at: ${stage.generatedAt}`,
		'',
		'## Objective',
		workflowPlan.presetDefinition.launchInstruction,
		'',
		'## User Brief',
		brief ? brief.goal : 'No explicit brief provided for this stage.',
		'',
		'## Upstream Handoffs',
		...(stage.upstreamStageFiles.length > 0 ? stage.upstreamStageFiles.map((file) => `- ${file}`) : ['- none']),
		'',
		'## Instructions For The Active Provider',
		'- Read .ai-context.md first.',
		'- Read .ai-orchestrator/brief.md if it exists.',
		'- Read upstream stage handoffs before acting.',
		'- Write findings, decisions, or results back into this file before stopping.',
		'- Keep the content concrete and reusable by the next provider.',
		'',
		'## Working Notes',
		'- Fill this section with exploration findings, plans, implementation notes, review findings, or test results.',
		'',
		'## Recommended Next Step',
		`- Suggested preset: ${buildSuggestedNextPresets(workflowPlan.preset)[0]}`,
		'- Suggested provider: choose the assistant best suited for the next stage.'
	].filter((value): value is string => Boolean(value)).join('\n');
}
export function buildSuggestedNextPresets(currentPreset: WorkflowPreset): WorkflowPreset[] {
	switch (currentPreset) {
		case 'explore':
			return ['plan', 'debug', 'review', 'build', 'test'];
		case 'plan':
			return ['build', 'review', 'debug', 'test', 'explore'];
		case 'build':
			return ['review', 'test', 'debug', 'plan', 'explore'];
		case 'debug':
			return ['test', 'review', 'build', 'plan', 'explore'];
		case 'review':
			return ['build', 'test', 'debug', 'plan', 'explore'];
		case 'test':
		default:
			return ['build', 'review', 'debug', 'plan', 'explore'];
	}
}
