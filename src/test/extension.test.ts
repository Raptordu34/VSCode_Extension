import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { normalizeWorkspaceRelativePath } from '../core/workspace.js';
import { commitFileTransaction, persistWorkflowArtifacts, readWorkflowSessionState, type WorkspaceWriteOperation } from '../features/context/workflowPersistence.js';
import { archiveActiveWorkflowState, cleanActiveWorkflowFiles, forkWorkflowFromHistory, forkWorkflowFromHistoryAtStage, readWorkflowArchiveManifest, readWorkflowHistoryIndex, restoreWorkflowFromHistory } from '../features/context/workflowHistory.js';
import { initializeSourceAnalysisBatch, readReconciledSourceAnalysisBatch, readSourceAnalysisBatch, updateSourceAnalysisJobStatus } from '../features/context/sourceAnalysisBatch.js';
import type { ArtifactPlan, ContextMetadata, ExtensionConfiguration, ProjectContext, SourceAnalysisBatch, WorkflowDashboardState, WorkflowExecutionPlan, WorkflowSessionState } from '../features/workflow/types.js';
import { computeSignature, escapeShellArg, createNonce } from '../utils/index.js';
import { applyContextBudgetConfiguration, detectTechStack } from '../features/context/contextBuilder.js';
import { buildContextBudget, getProviderModelCatalog } from '../features/providers/providerCatalog.js';
import { buildInstructionArtifactContent, buildSharedWorkflowInstruction } from '../features/aiAgents/promptBuilder.js';
import { WORKFLOW_PRESETS } from '../features/workflow/presets.js';
import { GENERATED_SECTION_END, GENERATED_SECTION_START, WORKFLOW_SOURCE_ANALYSIS_BATCH_FILE } from '../features/workflow/constants.js';
import { getWorkflowControlHtml } from '../features/workflow/ui.js';
import { clearLearningDocumentState, createLearningDocument, getLearningDocuments } from '../features/documents/service.js';

function createTestExtensionContext(extensionUri?: vscode.Uri): vscode.ExtensionContext {
	const workspaceStateStore = new Map<string, unknown>();
	return {
		extensionUri: extensionUri ?? vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(process.cwd()),
		workspaceState: {
			get: <T>(key: string, defaultValue?: T) => (workspaceStateStore.has(key) ? workspaceStateStore.get(key) as T : defaultValue as T),
			keys: () => [...workspaceStateStore.keys()],
			update: async (key: string, value: unknown) => {
				if (value === undefined) {
					workspaceStateStore.delete(key);
					return;
				}
				workspaceStateStore.set(key, value);
			}
		} as unknown as vscode.Memento
	} as vscode.ExtensionContext;
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});

suite('computeSignature', () => {
	test('same input produces same signature', () => {
		assert.strictEqual(computeSignature('hello'), computeSignature('hello'));
	});

	test('different inputs produce different signatures', () => {
		assert.notStrictEqual(computeSignature('hello'), computeSignature('world'));
		assert.notStrictEqual(computeSignature('abc'), computeSignature('abd'));
	});

	test('output is prefixed with sig-', () => {
		assert.ok(computeSignature('test').startsWith('sig-'));
	});

	test('single character change produces different signature', () => {
		const a = computeSignature('The quick brown fox');
		const b = computeSignature('The quick brown foy');
		assert.notStrictEqual(a, b);
	});

	test('empty string produces stable signature', () => {
		assert.strictEqual(computeSignature(''), computeSignature(''));
	});
});

suite('escapeShellArg', () => {
	test('escapes double quotes', () => {
		assert.strictEqual(escapeShellArg('say "hello"'), 'say \\"hello\\"');
	});

	test('escapes backticks', () => {
		assert.strictEqual(escapeShellArg('run `cmd`'), 'run \\`cmd\\`');
	});

	test('escapes dollar signs', () => {
		assert.strictEqual(escapeShellArg('$HOME'), '\\$HOME');
	});

	test('plain text is unchanged', () => {
		assert.strictEqual(escapeShellArg('hello world'), 'hello world');
	});

	test('escapes combined special chars', () => {
		const input = '"$USER" is `id`';
		const result = escapeShellArg(input);
		assert.ok(!result.includes('"') || result.includes('\\"'));
		assert.ok(!result.includes('`') || result.includes('\\`'));
		assert.ok(!result.includes('$') || result.includes('\\$'));
	});
});

suite('createNonce', () => {
	test('produces a non-empty string', () => {
		assert.ok(createNonce().length > 0);
	});

	test('produces different values each call', () => {
		const a = createNonce();
		const b = createNonce();
		assert.notStrictEqual(a, b);
	});
});

suite('detectTechStack', () => {
	test('detects TypeScript from .ts extension', () => {
		const stack = detectTechStack({ summary: '', scripts: [], dependencies: {}, devDependencies: {} }, ['src/index.ts'], []);
		assert.ok(stack.includes('TypeScript'));
	});

	test('detects React from dependency in summary', () => {
		const stack = detectTechStack({ summary: '', scripts: [], dependencies: { 'react': '18.0.0' }, devDependencies: {} }, ['src/App.tsx'], []);
		assert.ok(stack.includes('React'));
	});

	test('does NOT detect React from .tsx alone (no react dep)', () => {
		const stack = detectTechStack({ summary: '', scripts: [], dependencies: {}, devDependencies: {} }, ['src/Component.tsx'], []);
		assert.ok(!stack.includes('React'));
	});

	test('detects React from .jsx file without dependency', () => {
		const stack = detectTechStack({ summary: '', scripts: [], dependencies: {}, devDependencies: {} }, ['src/App.jsx'], []);
		assert.ok(stack.includes('React'));
	});

	test('detects VS Code Extension from @types/vscode in summary', () => {
		const stack = detectTechStack({ summary: '', scripts: [], dependencies: {}, devDependencies: { '@types/vscode': '^1.0.0' } }, [], []);
		assert.ok(stack.includes('VS Code Extension'));
	});

	test('does NOT detect VS Code Extension from "vscode" word alone', () => {
		const stack = detectTechStack({ summary: 'mentions vscode in readme', scripts: [], dependencies: {}, devDependencies: {} }, [], ['uses vscode']);
		assert.ok(!stack.includes('VS Code Extension'));
	});

	test('detects Web Workers from .worker.ts file', () => {
		const stack = detectTechStack({ summary: '', scripts: [], dependencies: {}, devDependencies: {} }, ['src/my.worker.ts'], []);
		assert.ok(stack.includes('Web Workers'));
	});

	test('detects Web Workers from .worker.js file', () => {
		const stack = detectTechStack({ summary: '', scripts: [], dependencies: {}, devDependencies: {} }, ['dist/worker.worker.js'], []);
		assert.ok(stack.includes('Web Workers'));
	});

	test('does NOT detect Web Workers from file named "worker"', () => {
		const stack = detectTechStack({ summary: '', scripts: [], dependencies: {}, devDependencies: {} }, ['src/workerUtils.ts', 'src/worker/index.ts'], []);
		assert.ok(!stack.includes('Web Workers'));
	});

	test('detects ESLint from summary', () => {
		const stack = detectTechStack({ summary: '', scripts: [], dependencies: { 'eslint': '^8.0.0' }, devDependencies: {} }, [], []);
		assert.ok(stack.includes('ESLint'));
	});
});

suite('provider-aware context budgets', () => {
	test('caps Copilot fast budgets below workspace maxima', () => {
		const configuration: ExtensionConfiguration = {
			treeDepth: 6,
			readmePreviewLines: 120,
			contextFilePreviewLines: 300,
			extraContextFiles: ['A.md', 'B.md', 'C.md', 'D.md', 'E.md'],
			showIgnoredDirectories: true,
			maxEntriesPerDirectory: 100,
			optimizeWithCopilot: false,
			modelFamily: '',
			defaultClaudeModel: 'claude-sonnet-4-6',
			defaultGeminiModel: 'gemini-2.5-pro',
			defaultClaudeEffort: 'medium',
			claudeAccounts: [],
			geminiAccounts: [],
			copilotAccounts: [],
			autoGenerateOnStartup: false,
			defaultPreset: 'build',
			defaultProvider: 'copilot',
			contextRefreshMode: 'smart-refresh',
			costProfile: 'balanced',
			generateNativeArtifacts: true,
			enabledProviders: ['claude', 'gemini', 'copilot']
		};

		const budget = buildContextBudget('copilot', 'fast', configuration);
		const applied = applyContextBudgetConfiguration(configuration, budget);

		assert.strictEqual(budget.profile, 'copilot-fast');
		assert.strictEqual(budget.treeDepth, 2);
		assert.strictEqual(budget.maxEntriesPerDirectory, 16);
		assert.strictEqual(budget.maxInstructionFiles, 3);
		assert.strictEqual(applied.treeDepth, 2);
		assert.strictEqual(applied.maxEntriesPerDirectory, 16);
		assert.strictEqual(applied.extraContextFiles.length, 3);
		assert.strictEqual(applied.readmePreviewLines, 16);
	});

	test('keeps stable Gemini models ahead of previews in the catalog', () => {
		const catalog = getProviderModelCatalog('gemini');
		assert.strictEqual(catalog[0].id, 'gemini-2.5-pro');
		assert.strictEqual(catalog[0].tier, 'stable');
		assert.ok(catalog.some((model) => model.id === 'gemini-3.1-pro-preview' && model.tier === 'preview'));
	});
});

suite('provider-specific prompt builder output', () => {
	function createWorkflowPlan(provider: WorkflowExecutionPlan['provider']): WorkflowExecutionPlan {
		return {
			preset: 'build',
			provider,
			providerAccountId: `${provider}-account`,
			providerModel: provider === 'gemini' ? 'gemini-2.5-pro' : provider === 'claude' ? 'claude-sonnet-4-6' : 'gpt-5',
			refreshMode: 'smart-refresh',
			costProfile: 'balanced',
			roles: ['architect', 'implementer', 'reviewer'],
			optimizeWithCopilot: false,
			presetDefinition: WORKFLOW_PRESETS.build,
			generateNativeArtifacts: true,
			claudeEffort: provider === 'claude' ? 'medium' : undefined
		};
	}

	function createMetadata(): ContextMetadata {
		return {
			generatedAt: '2026-03-08T12:00:00.000Z',
			signature: 'sig-test',
			preset: 'build',
			provider: 'gemini',
			providerModel: 'gemini-2.5-pro',
			providerAccountId: 'gemini-account',
			refreshMode: 'smart-refresh',
			costProfile: 'balanced',
			reused: false,
			keyFiles: ['src/extension.ts', 'src/features/aiAgents/promptBuilder.ts'],
			commands: ['npm run compile', 'npm test'],
			instructionFiles: ['.github/copilot-instructions.md'],
			artifactFiles: ['.github/copilot-instructions.md'],
			contextBudgetProfile: 'gemini-balanced',
			contextBudgetSummary: 'tree 4, readme 48, files 5'
		};
	}

	function createProjectContext(provider: WorkflowExecutionPlan['provider']): ProjectContext {
		const workflowPlan = createWorkflowPlan(provider);
		return {
			workspaceFolder: {
				uri: vscode.Uri.file(path.join(os.tmpdir(), 'prompt-builder-workspace')),
				name: 'prompt-builder-workspace',
				index: 0
			} as vscode.WorkspaceFolder,
			contextFile: vscode.Uri.file(path.join(os.tmpdir(), '.ai-context.md')),
			content: '# Context',
			optimization: {
				content: '# Context',
				applied: true,
				reason: 'test fixture'
			},
			metadata: {
				...createMetadata(),
				provider,
				providerModel: workflowPlan.providerModel,
				providerAccountId: workflowPlan.providerAccountId,
				claudeEffort: workflowPlan.claudeEffort
			},
			workflowPlan,
			artifactPlan: {
				provider,
				files: []
			},
			reused: false,
			currentStage: {
				index: 2,
				preset: workflowPlan.preset,
				provider,
				providerModel: workflowPlan.providerModel,
				providerAccountId: workflowPlan.providerAccountId,
				status: 'prepared',
				stageFile: '.ai-orchestrator/stages/02-implement.md',
				generatedAt: '2026-03-08T12:00:00.000Z',
				briefSummary: 'Implement provider-specific prompt shaping',
				contextFile: '.ai-context.md',
				artifactFiles: [],
				upstreamStageFiles: ['.ai-orchestrator/stages/01-plan.md'],
				claudeEffort: workflowPlan.claudeEffort
			}
		};
	}

	test('builds Claude instruction artifacts with workflow and delegation sections', () => {
		const content = buildInstructionArtifactContent(createWorkflowPlan('claude'), createMetadata());

		assert.ok(content.includes('<workflow>'));
		assert.ok(content.includes('<when_to_delegate>'));
		assert.ok(content.includes('Context budget summary: tree 4, readme 48, files 5'));
	});

	test('builds Gemini launch prompts with context-first structure', () => {
		const instruction = buildSharedWorkflowInstruction(createProjectContext('gemini'));

		assert.ok(instruction.startsWith('## Context'));
		assert.ok(instruction.includes('## Provider'));
		assert.ok(instruction.includes('## Task'));
		assert.ok(instruction.includes('This run was generated with a bounded context budget: tree 4, readme 48, files 5.'));
		assert.ok(instruction.includes('Use provider model gemini-2.5-pro.'));
	});

	test('builds Copilot review prompts with findings-first review guidance', () => {
		const reviewContext: ProjectContext = {
			...createProjectContext('copilot'),
			workflowPlan: {
				...createWorkflowPlan('copilot'),
				preset: 'review',
				presetDefinition: WORKFLOW_PRESETS.review,
				roles: ['reviewer', 'architect']
			},
			metadata: {
				...createMetadata(),
				preset: 'review',
				provider: 'copilot',
				providerModel: 'gpt-5',
				providerAccountId: 'copilot-account'
			}
		};

		const instruction = buildSharedWorkflowInstruction(reviewContext);

		assert.ok(instruction.includes('Preset priorities: Lead with correctness, regression risk, and missing verification'));
		assert.ok(instruction.includes('Done when: Stop once findings, open questions, and verification gaps are explicit'));
		assert.ok(instruction.includes('Avoid: Do not rewrite code by default during review'));
	});

	test('builds Claude debug instruction artifacts with root-cause-first guidance', () => {
		const debugPlan: WorkflowExecutionPlan = {
			...createWorkflowPlan('claude'),
			preset: 'debug',
			presetDefinition: WORKFLOW_PRESETS.debug,
			roles: ['debugger', 'implementer', 'tester']
		};
		const debugMetadata: ContextMetadata = {
			...createMetadata(),
			preset: 'debug',
			provider: 'claude',
			providerModel: 'claude-sonnet-4-6',
			providerAccountId: 'claude-account',
			claudeEffort: 'medium'
		};

		const content = buildInstructionArtifactContent(debugPlan, debugMetadata);

		assert.ok(content.includes('Reproduce or tightly characterize the failing behavior before editing code.'));
		assert.ok(content.includes('Identify the root cause and apply the smallest valid fix.'));
		assert.ok(content.includes('Do not patch symptoms without explaining the underlying cause.'));
	});

	test('targets a single assigned source when distributed source analysis is active', () => {
		const context = createProjectContext('claude');
		context.activeLearningDocument = {
			id: 'doc-1',
			type: 'compte-rendu',
			title: 'Compte-rendu',
			slug: 'compte-rendu',
			relativeDirectory: 'learning-documents/compte-rendu',
			indexFile: 'learning-documents/compte-rendu/index.html',
			sourceDirectory: 'learning-documents/compte-rendu/sources',
			promptFile: 'learning-documents/compte-rendu/PROMPT.md',
			manifestFile: 'learning-documents/compte-rendu/document.json',
			createdAt: '2026-03-09T00:00:00.000Z',
			updatedAt: '2026-03-09T00:00:00.000Z',
			sources: [{
				label: 'cours-01.pdf',
				relativePath: 'learning-documents/compte-rendu/sources/cours-01.pdf',
				importedAt: '2026-03-09T00:00:00.000Z'
			}]
		};
		context.workflowPlan = {
			...context.workflowPlan,
			documentIntentId: 'compte-rendu-source-exploitation',
			sourceAnalysisMode: 'distributed',
			sourceAnalysisBatchId: 'batch-1',
			sourceAnalysisJobId: 'job-1',
			targetSourceRelativePath: 'learning-documents/compte-rendu/sources/cours-01.pdf',
			targetSourceOutputFile: '.ai-orchestrator/analysis/analysis-01-cours-01.md'
		};
		context.sourceAnalysisBatch = {
			batchId: 'batch-1',
			workflowId: 'workflow-1',
			stageIndex: 2,
			mode: 'distributed',
			learningDocumentId: 'doc-1',
			learningDocumentTitle: 'Compte-rendu',
			provider: 'claude',
			providerModel: 'claude-sonnet-4-6',
			briefGoal: 'Analyser chaque source',
			jobs: [],
			createdAt: '2026-03-09T00:00:00.000Z',
			updatedAt: '2026-03-09T00:00:00.000Z'
		};
		context.sourceAnalysisJob = {
			id: 'job-1',
			sourceRelativePath: 'learning-documents/compte-rendu/sources/cours-01.pdf',
			sourceLabel: 'cours-01.pdf',
			outputFile: '.ai-orchestrator/analysis/analysis-01-cours-01.md',
			status: 'running',
			provider: 'claude',
			providerModel: 'claude-sonnet-4-6'
		};

		const instruction = buildSharedWorkflowInstruction(context);

		assert.ok(instruction.includes('only the assigned source file learning-documents/compte-rendu/sources/cours-01.pdf'));
		assert.ok(instruction.includes('write only to .ai-orchestrator/analysis/analysis-01-cours-01.md'));
		assert.ok(instruction.includes('Do not edit the learning document directly during this job'));
	});

	test('instructs synthesis runs to use distributed source analysis reports', () => {
		const context = createProjectContext('gemini');
		context.activeLearningDocument = {
			id: 'doc-1',
			type: 'compte-rendu',
			title: 'Compte-rendu',
			slug: 'compte-rendu',
			relativeDirectory: 'learning-documents/compte-rendu',
			indexFile: 'learning-documents/compte-rendu/index.html',
			sourceDirectory: 'learning-documents/compte-rendu/sources',
			promptFile: 'learning-documents/compte-rendu/PROMPT.md',
			manifestFile: 'learning-documents/compte-rendu/document.json',
			createdAt: '2026-03-09T00:00:00.000Z',
			updatedAt: '2026-03-09T00:00:00.000Z',
			sources: []
		};
		context.workflowPlan = {
			...context.workflowPlan,
			documentIntentId: 'compte-rendu-source-exploitation',
			sourceAnalysisMode: 'distributed',
			sourceAnalysisBatchId: 'batch-1'
		};
		context.sourceAnalysisBatch = {
			batchId: 'batch-1',
			workflowId: 'workflow-1',
			stageIndex: 2,
			mode: 'distributed',
			learningDocumentId: 'doc-1',
			learningDocumentTitle: 'Compte-rendu',
			provider: 'gemini',
			providerModel: 'gemini-2.5-pro',
			briefGoal: 'Synthétiser les sources',
			jobs: [{
				id: 'job-1',
				sourceRelativePath: 'learning-documents/compte-rendu/sources/cours-01.pdf',
				sourceLabel: 'cours-01.pdf',
				outputFile: '.ai-orchestrator/analysis/analysis-01-cours-01.md',
				status: 'completed',
				provider: 'gemini',
				providerModel: 'gemini-2.5-pro'
			}],
			createdAt: '2026-03-09T00:00:00.000Z',
			updatedAt: '2026-03-09T00:00:00.000Z'
		};

		const instruction = buildSharedWorkflowInstruction(context);

		assert.ok(instruction.includes('distributed source analysis reports under .ai-orchestrator/analysis'));
		assert.ok(instruction.includes('Use the batch batch-1 reports as your primary source evidence for synthesis.'));
	});
});

suite('normalizeWorkspaceRelativePath', () => {
	test('normalizes Windows separators and dot segments', () => {
		assert.strictEqual(normalizeWorkspaceRelativePath('src\\features\\..\\utils\\index.ts'), 'src/utils/index.ts');
	});

	test('removes leading and repeated separators', () => {
		assert.strictEqual(normalizeWorkspaceRelativePath('/.github//copilot-instructions.md'), '.github/copilot-instructions.md');
	});
});

suite('commitFileTransaction', () => {
	test('rolls back files when a later write fails', async () => {
		const originalUri = vscode.Uri.file('/tmp/original.txt');
		const newUri = vscode.Uri.file('/tmp/new.txt');
		const store = new Map<string, Uint8Array>([
			[originalUri.toString(), Buffer.from('before', 'utf8')]
		]);
		const operations: WorkspaceWriteOperation[] = [
			{ uri: originalUri, content: Buffer.from('after', 'utf8') },
			{ uri: newUri, content: Buffer.from('created', 'utf8') }
		];

		await assert.rejects(async () => {
			await commitFileTransaction({
				readFile: async (uri) => {
					const value = store.get(uri.toString());
					if (!value) {
						throw new Error('missing');
					}
					return value;
				},
				writeFile: async (uri, content) => {
					if (uri.toString() === newUri.toString()) {
						throw new Error('write failure');
					}
					store.set(uri.toString(), content);
				},
				delete: async (uri) => {
					store.delete(uri.toString());
				},
				createDirectory: async () => undefined
			}, operations);
		});

		assert.strictEqual(Buffer.from(store.get(originalUri.toString()) ?? []).toString('utf8'), 'before');
		assert.strictEqual(store.has(newUri.toString()), false);
	});
});

suite('workflow persistence', () => {
	test('initializes distributed source analysis batch files and syncs session state', async () => {
		const tempRoot = vscode.Uri.file(path.join(os.tmpdir(), `aio-source-batch-${Date.now()}`));
		await vscode.workspace.fs.createDirectory(tempRoot);

		const workspaceFolder = {
			uri: tempRoot,
			name: 'source-batch-workspace',
			index: 0
		} as vscode.WorkspaceFolder;
		const workflowPlan: WorkflowExecutionPlan = {
			preset: 'build',
			provider: 'claude',
			providerModel: 'claude-sonnet-4-6',
			providerAccountId: 'claude-main',
			claudeAccountId: 'claude-main',
			claudeEffort: 'medium',
			learningDocumentId: 'doc-1',
			documentIntentId: 'compte-rendu-source-exploitation',
			roles: [...WORKFLOW_PRESETS.build.roles],
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			optimizeWithCopilot: false,
			generateNativeArtifacts: false,
			presetDefinition: WORKFLOW_PRESETS.build,
			brief: {
				taskType: 'feature',
				goal: 'Analyser les sources une par une',
				constraints: [],
				rawText: 'Analyser les sources une par une'
			}
		};
		const projectContext: ProjectContext = {
			workspaceFolder,
			contextFile: vscode.Uri.joinPath(tempRoot, '.ai-context.md'),
			content: '# Context',
			optimization: {
				content: '# Context',
				applied: false,
				reason: 'fixture'
			},
			metadata: {
				generatedAt: '2026-03-09T00:00:00.000Z',
				signature: 'sig-batch',
				preset: 'build',
				provider: 'claude',
				providerModel: 'claude-sonnet-4-6',
				providerAccountId: 'claude-main',
				claudeAccountId: 'claude-main',
				claudeEffort: 'medium',
				refreshMode: 'full-rebuild',
				costProfile: 'balanced',
				reused: false,
				keyFiles: [],
				instructionFiles: [],
				commands: [],
				artifactFiles: []
			},
			workflowPlan,
			activeLearningDocument: {
				id: 'doc-1',
				type: 'compte-rendu',
				title: 'Compte-rendu',
				slug: 'compte-rendu',
				relativeDirectory: 'learning-documents/compte-rendu',
				indexFile: 'learning-documents/compte-rendu/index.html',
				sourceDirectory: 'learning-documents/compte-rendu/sources',
				promptFile: 'learning-documents/compte-rendu/PROMPT.md',
				manifestFile: 'learning-documents/compte-rendu/document.json',
				createdAt: '2026-03-09T00:00:00.000Z',
				updatedAt: '2026-03-09T00:00:00.000Z',
				sources: [
					{ label: 'cours-01.pdf', relativePath: 'learning-documents/compte-rendu/sources/cours-01.pdf', importedAt: '2026-03-09T00:00:00.000Z' },
					{ label: 'cours-02.pdf', relativePath: 'learning-documents/compte-rendu/sources/cours-02.pdf', importedAt: '2026-03-09T00:00:00.000Z' }
				]
			},
			reused: false,
			workflowSession: {
				workspaceName: 'source-batch-workspace',
				workspaceFolderId: tempRoot.toString(),
				workflowId: 'workflow-1',
				branchId: 'main',
				updatedAt: '2026-03-09T00:00:00.000Z',
				currentStageIndex: 1,
				currentPreset: 'build',
				currentProvider: 'claude',
				currentProviderModel: 'claude-sonnet-4-6',
				currentProviderAccountId: 'claude-main',
				currentClaudeAccountId: 'claude-main',
				currentClaudeEffort: 'medium',
				briefFile: '.ai-orchestrator/brief.md',
				stages: [{
					index: 1,
					workflowId: 'workflow-1',
					branchId: 'main',
					preset: 'build',
					provider: 'claude',
					providerModel: 'claude-sonnet-4-6',
					providerAccountId: 'claude-main',
					status: 'prepared',
					stageFile: '.ai-orchestrator/stages/01-build.md',
					generatedAt: '2026-03-09T00:00:00.000Z',
					briefSummary: 'Analyser les sources une par une',
					contextFile: '.ai-context.md',
					claudeAccountId: 'claude-main',
					claudeEffort: 'medium',
					artifactFiles: [],
					upstreamStageFiles: []
				}]
			},
			currentStage: {
				index: 1,
				workflowId: 'workflow-1',
				branchId: 'main',
				preset: 'build',
				provider: 'claude',
				providerModel: 'claude-sonnet-4-6',
				providerAccountId: 'claude-main',
				status: 'prepared',
				stageFile: '.ai-orchestrator/stages/01-build.md',
				generatedAt: '2026-03-09T00:00:00.000Z',
				briefSummary: 'Analyser les sources une par une',
				contextFile: '.ai-context.md',
				claudeAccountId: 'claude-main',
				claudeEffort: 'medium',
				artifactFiles: [],
				upstreamStageFiles: []
			},
			brief: workflowPlan.brief
		};

		const batch = await initializeSourceAnalysisBatch(projectContext);
		const persistedBatch = await readSourceAnalysisBatch(tempRoot) as SourceAnalysisBatch;
		const persistedSession = await readWorkflowSessionState(tempRoot) as WorkflowSessionState;

		assert.strictEqual(batch.jobs.length, 2);
		assert.strictEqual(persistedBatch.jobs.length, 2);
		assert.strictEqual(persistedSession.sourceAnalysisBatch?.batchId, batch.batchId);
		assert.strictEqual(normalizeWorkspaceRelativePath(batch.jobs[0].outputFile).startsWith('ai-orchestrator'), false);
		assert.ok(await vscode.workspace.fs.stat(vscode.Uri.joinPath(tempRoot, '.ai-orchestrator', 'analysis')).then(() => true, () => false));
		assert.ok(await vscode.workspace.fs.stat(vscode.Uri.joinPath(tempRoot, ...WORKFLOW_SOURCE_ANALYSIS_BATCH_FILE.split('/'))).then(() => true, () => false));

		const updatedBatch = await updateSourceAnalysisJobStatus(tempRoot, batch.jobs[0].id, 'completed', 'Done');
		assert.strictEqual(updatedBatch?.jobs[0].status, 'completed');
		assert.strictEqual(updatedBatch?.jobs[0].notes, 'Done');
	});

	test('reconciles distributed source jobs from analysis file content and syncs session state', async () => {
		const tempRoot = vscode.Uri.file(path.join(os.tmpdir(), `aio-batch-reconcile-${Date.now()}`));
		await vscode.workspace.fs.createDirectory(tempRoot);

		const workspaceFolder = {
			uri: tempRoot,
			name: 'temp-workspace',
			index: 0
		} as vscode.WorkspaceFolder;
		const presetDefinition = WORKFLOW_PRESETS.build;
		const workflowPlan: WorkflowExecutionPlan = {
			preset: 'build',
			provider: 'claude',
			providerModel: 'claude-sonnet-4-6',
			providerAccountId: 'claude-main',
			roles: [...presetDefinition.roles],
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			optimizeWithCopilot: false,
			generateNativeArtifacts: true,
			presetDefinition,
			learningDocumentId: 'doc-1',
			documentIntentId: 'compte-rendu-source-exploitation',
			brief: {
				taskType: 'analysis',
				goal: 'Analyser les sources une par une',
				constraints: [],
				rawText: 'Analyser les sources une par une'
			}
		};
		const projectContext: ProjectContext = {
			workspaceFolder,
			contextFile: vscode.Uri.joinPath(tempRoot, '.ai-context.md'),
			content: '',
			optimization: {
				content: '',
				applied: false,
				reason: 'test'
			},
			metadata: {
				generatedAt: '2026-03-09T00:00:00.000Z',
				signature: 'sig-batch',
				preset: 'build',
				provider: 'claude',
				providerModel: 'claude-sonnet-4-6',
				providerAccountId: 'claude-main',
				refreshMode: 'full-rebuild',
				costProfile: 'balanced',
				reused: false,
				keyFiles: [],
				instructionFiles: [],
				commands: [],
				artifactFiles: []
			},
			workflowPlan,
			activeLearningDocument: {
				id: 'doc-1',
				title: 'Compte rendu test',
				type: 'compte-rendu',
				slug: 'compte-rendu-test',
				relativeDirectory: 'learning-documents/doc-1',
				manifestFile: 'learning-documents/doc-1/document.json',
				indexFile: 'learning-documents/doc-1/index.html',
				promptFile: 'learning-documents/doc-1/.instructions.md',
				sourceDirectory: 'learning-documents/doc-1/sources',
				createdAt: '2026-03-09T00:00:00.000Z',
				updatedAt: '2026-03-09T00:00:00.000Z',
				sources: [
					{ relativePath: 'sources/source-a.md', label: 'Source A', importedAt: '2026-03-09T00:00:00.000Z' },
					{ relativePath: 'sources/source-b.md', label: 'Source B', importedAt: '2026-03-09T00:00:00.000Z' }
				]
			},
			reused: false,
			workflowSession: {
				workspaceName: 'temp-workspace',
				workspaceFolderId: tempRoot.toString(),
				workflowId: 'workflow-1',
				branchId: 'main',
				createdAt: '2026-03-09T00:00:00.000Z',
				updatedAt: '2026-03-09T00:00:00.000Z',
				currentStageIndex: 1,
				currentPreset: 'build',
				currentProvider: 'claude',
				currentProviderModel: 'claude-sonnet-4-6',
				currentProviderAccountId: 'claude-main',
				currentClaudeAccountId: 'claude-main',
				currentClaudeEffort: 'medium',
				briefFile: '.ai-orchestrator/brief.md',
				stages: [{
					index: 1,
					workflowId: 'workflow-1',
					branchId: 'main',
					preset: 'build',
					provider: 'claude',
					providerModel: 'claude-sonnet-4-6',
					providerAccountId: 'claude-main',
					status: 'prepared',
					stageFile: '.ai-orchestrator/stages/01-build.md',
					generatedAt: '2026-03-09T00:00:00.000Z',
					briefSummary: 'Analyser les sources une par une',
					contextFile: '.ai-context.md',
					claudeAccountId: 'claude-main',
					claudeEffort: 'medium',
					artifactFiles: [],
					upstreamStageFiles: []
				}]
			},
			currentStage: {
				index: 1,
				workflowId: 'workflow-1',
				branchId: 'main',
				preset: 'build',
				provider: 'claude',
				providerModel: 'claude-sonnet-4-6',
				providerAccountId: 'claude-main',
				status: 'prepared',
				stageFile: '.ai-orchestrator/stages/01-build.md',
				generatedAt: '2026-03-09T00:00:00.000Z',
				briefSummary: 'Analyser les sources une par une',
				contextFile: '.ai-context.md',
				claudeAccountId: 'claude-main',
				claudeEffort: 'medium',
				artifactFiles: [],
				upstreamStageFiles: []
			},
			brief: workflowPlan.brief
		};

		const batch = await initializeSourceAnalysisBatch(projectContext);
		const jobFileUri = vscode.Uri.joinPath(tempRoot, ...batch.jobs[0].outputFile.split('/'));
		await vscode.workspace.fs.writeFile(jobFileUri, Buffer.from('# Source Analysis Source A\n\n## Analysis Notes\n- Extra content\n', 'utf8'));

		const reconciledBatch = await readReconciledSourceAnalysisBatch(tempRoot) as SourceAnalysisBatch;
		const syncedSession = await readWorkflowSessionState(tempRoot) as WorkflowSessionState;

		assert.strictEqual(reconciledBatch.jobs[0].status, 'completed');
		assert.ok(reconciledBatch.jobs[0].completedAt);
		assert.strictEqual(reconciledBatch.jobs[1].status, 'queued');
		assert.strictEqual(syncedSession.sourceAnalysisBatch?.jobs[0]?.status, 'completed');
	});

	test('rejects malformed persisted session state', async () => {
		const tempRoot = vscode.Uri.file(path.join(os.tmpdir(), `aio-invalid-session-${Date.now()}`));
		await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(tempRoot, '.ai-orchestrator'));
		await vscode.workspace.fs.writeFile(
			vscode.Uri.joinPath(tempRoot, '.ai-orchestrator', 'session.json'),
			Buffer.from('{"workspaceName":"demo"}', 'utf8')
		);

		const session = await readWorkflowSessionState(tempRoot);
		assert.strictEqual(session, undefined);
	});

	test('persists context, artifacts, stage, and session together', async () => {
		const tempRoot = vscode.Uri.file(path.join(os.tmpdir(), `aio-persist-${Date.now()}`));
		await vscode.workspace.fs.createDirectory(tempRoot);

		const workspaceFolder = {
			uri: tempRoot,
			name: 'temp-workspace',
			index: 0
		} as vscode.WorkspaceFolder;
		const presetDefinition = WORKFLOW_PRESETS.build;
		const workflowPlan: WorkflowExecutionPlan = {
			preset: 'build',
			provider: 'copilot',
			providerModel: 'gpt-5.4',
			providerAccountId: 'copilot-main',
			roles: [...presetDefinition.roles],
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			optimizeWithCopilot: false,
			generateNativeArtifacts: true,
			presetDefinition,
			brief: {
				taskType: 'feature',
				goal: 'Implement persistence test fixture',
				constraints: ['keep transaction atomic'],
				rawText: 'Implement persistence test fixture'
			}
		};
		const metadata: ContextMetadata = {
			generatedAt: new Date().toISOString(),
			signature: 'sig-test',
			preset: 'build',
			provider: 'copilot',
			providerModel: 'gpt-5.4',
			providerAccountId: 'copilot-main',
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			reused: false,
			keyFiles: ['src/extension.ts'],
			instructionFiles: ['.github/copilot-instructions.md'],
			commands: ['compile'],
			artifactFiles: ['.github/agents/orchestrator-implementer.agent.md']
		};
		const artifactPlan: ArtifactPlan = {
			provider: 'copilot',
			files: [{
				relativePath: '.github\\agents\\orchestrator-implementer.agent.md',
				kind: 'agent',
				content: '# test artifact'
			}]
		};
		const contextFile = vscode.Uri.joinPath(tempRoot, '.ai-context.md');

		const result = await persistWorkflowArtifacts(
			workspaceFolder,
			workflowPlan,
			metadata,
			contextFile,
			artifactPlan,
			'# Context Generation Metadata\n\nGenerated at: now\n'
		);

		const session = await readWorkflowSessionState(tempRoot) as WorkflowSessionState;
		assert.ok(session);
		assert.strictEqual(session.workspaceFolderId, tempRoot.toString());
		assert.strictEqual(session.stages.length, 1);
		assert.strictEqual(session.stages[0].stageFile, '.ai-orchestrator/stages/01-build.md');
		assert.deepStrictEqual(session.stages[0].artifactFiles, ['.github/agents/orchestrator-implementer.agent.md']);
		assert.strictEqual(result.stage.contextFile, '.ai-context.md');

		const stageContent = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(tempRoot, '.ai-orchestrator', 'stages', '01-build.md'))).toString('utf8');
		const artifactContent = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(tempRoot, '.github', 'agents', 'orchestrator-implementer.agent.md'))).toString('utf8');
		const contextContent = Buffer.from(await vscode.workspace.fs.readFile(contextFile)).toString('utf8');

		assert.ok(stageContent.includes('Implement persistence test fixture'));
		assert.ok(artifactContent.includes('# test artifact'));
		assert.ok(contextContent.includes('# Context Generation Metadata'));
		assert.strictEqual(normalizeWorkspaceRelativePath(result.stage.artifactFiles[0]), '.github/agents/orchestrator-implementer.agent.md');
	});

	test('archives workflow history after persistence and restores managed instruction blocks', async () => {
		const tempRoot = vscode.Uri.file(path.join(os.tmpdir(), `aio-history-${Date.now()}`));
		await vscode.workspace.fs.createDirectory(tempRoot);

		const workspaceFolder = {
			uri: tempRoot,
			name: 'history-workspace',
			index: 0
		} as vscode.WorkspaceFolder;
		const presetDefinition = WORKFLOW_PRESETS.build;
		const workflowPlan: WorkflowExecutionPlan = {
			preset: 'build',
			provider: 'copilot',
			providerModel: 'gpt-5.4',
			providerAccountId: 'copilot-main',
			roles: [...presetDefinition.roles],
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			optimizeWithCopilot: false,
			generateNativeArtifacts: true,
			presetDefinition,
			startNewWorkflow: true,
			brief: {
				taskType: 'feature',
				goal: 'Workflow A',
				constraints: [],
				rawText: 'Workflow A'
			}
		};
		const metadata: ContextMetadata = {
			generatedAt: new Date().toISOString(),
			signature: 'sig-history-a',
			preset: 'build',
			provider: 'copilot',
			providerModel: 'gpt-5.4',
			providerAccountId: 'copilot-main',
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			reused: false,
			keyFiles: ['src/extension.ts'],
			instructionFiles: ['.github/copilot-instructions.md'],
			commands: ['compile'],
			artifactFiles: ['.github/copilot-instructions.md']
		};
		const artifactPlan: ArtifactPlan = {
			provider: 'copilot',
			files: [{
				relativePath: '.github/copilot-instructions.md',
				kind: 'instruction',
				content: '## Workflow A instruction'
			}]
		};
		const contextFile = vscode.Uri.joinPath(tempRoot, '.ai-context.md');

		const resultA = await persistWorkflowArtifacts(
			workspaceFolder,
			workflowPlan,
			metadata,
			contextFile,
			artifactPlan,
			'# Context A\n'
		);

		const instructionUri = vscode.Uri.joinPath(tempRoot, '.github', 'copilot-instructions.md');
		await vscode.workspace.fs.writeFile(
			instructionUri,
			Buffer.from(`Intro\n${GENERATED_SECTION_START}\n## Workflow A instruction\n${GENERATED_SECTION_END}\nOutro\n`, 'utf8')
		);
		await archiveActiveWorkflowState(workspaceFolder, resultA.session, resultA.brief);

		const workflowPlanB: WorkflowExecutionPlan = {
			...workflowPlan,
			providerModel: 'gpt-5.4-mini',
			startNewWorkflow: true,
			brief: {
				taskType: 'feature',
				goal: 'Workflow B',
				constraints: [],
				rawText: 'Workflow B'
			}
		};
		const artifactPlanB: ArtifactPlan = {
			provider: 'copilot',
			files: [{
				relativePath: '.github/copilot-instructions.md',
				kind: 'instruction',
				content: '## Workflow B instruction'
			}]
		};
		const resultB = await persistWorkflowArtifacts(
			workspaceFolder,
			workflowPlanB,
			{ ...metadata, signature: 'sig-history-b', providerModel: 'gpt-5.4-mini' },
			contextFile,
			artifactPlanB,
			'# Context B\n'
		);

		const historyIndex = await readWorkflowHistoryIndex(tempRoot);
		assert.ok(historyIndex.entries.length >= 2);
		assert.strictEqual(historyIndex.activeWorkflowId, resultB.session.workflowId);

		await restoreWorkflowFromHistory(workspaceFolder, resultA.session.workflowId as string);

		const restoredInstruction = Buffer.from(await vscode.workspace.fs.readFile(instructionUri)).toString('utf8');
		const restoredSession = await readWorkflowSessionState(tempRoot);
		assert.ok(restoredInstruction.includes('Intro'));
		assert.ok(restoredInstruction.includes('Outro'));
		assert.ok(restoredInstruction.includes('## Workflow A instruction'));
		assert.strictEqual(restoredSession?.workflowId, resultA.session.workflowId);
	});

	test('cleans active workflow files while preserving user content around managed blocks', async () => {
		const tempRoot = vscode.Uri.file(path.join(os.tmpdir(), `aio-clean-${Date.now()}`));
		await vscode.workspace.fs.createDirectory(tempRoot);

		const workspaceFolder = {
			uri: tempRoot,
			name: 'cleanup-workspace',
			index: 0
		} as vscode.WorkspaceFolder;
		const presetDefinition = WORKFLOW_PRESETS.build;
		const workflowPlan: WorkflowExecutionPlan = {
			preset: 'build',
			provider: 'copilot',
			providerModel: 'gpt-5.4',
			providerAccountId: 'copilot-main',
			roles: [...presetDefinition.roles],
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			optimizeWithCopilot: false,
			generateNativeArtifacts: true,
			presetDefinition,
			startNewWorkflow: true,
			brief: {
				taskType: 'feature',
				goal: 'Cleanup workflow',
				constraints: [],
				rawText: 'Cleanup workflow'
			}
		};
		const metadata: ContextMetadata = {
			generatedAt: new Date().toISOString(),
			signature: 'sig-clean',
			preset: 'build',
			provider: 'copilot',
			providerModel: 'gpt-5.4',
			providerAccountId: 'copilot-main',
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			reused: false,
			keyFiles: ['src/extension.ts'],
			instructionFiles: ['.github/copilot-instructions.md'],
			commands: ['compile'],
			artifactFiles: ['.github/copilot-instructions.md', '.github/agents/orchestrator-implementer.agent.md']
		};
		const artifactPlan: ArtifactPlan = {
			provider: 'copilot',
			files: [
				{
					relativePath: '.github/copilot-instructions.md',
					kind: 'instruction',
					content: '## Cleanup instruction'
				},
				{
					relativePath: '.github/agents/orchestrator-implementer.agent.md',
					kind: 'agent',
					content: '# cleanup agent'
				}
			]
		};

		await persistWorkflowArtifacts(
			workspaceFolder,
			workflowPlan,
			metadata,
			vscode.Uri.joinPath(tempRoot, '.ai-context.md'),
			artifactPlan,
			'# Cleanup Context\n'
		);

		const instructionUri = vscode.Uri.joinPath(tempRoot, '.github', 'copilot-instructions.md');
		await vscode.workspace.fs.writeFile(
			instructionUri,
			Buffer.from(`Header\n${GENERATED_SECTION_START}\n## Cleanup instruction\n${GENERATED_SECTION_END}\nFooter\n`, 'utf8')
		);
		const session = await readWorkflowSessionState(tempRoot);
		assert.ok(session?.workflowId);
		await archiveActiveWorkflowState(workspaceFolder, session as WorkflowSessionState, {
			taskType: 'feature',
			goal: 'Cleanup workflow',
			constraints: [],
			rawText: 'Cleanup workflow'
		});

		const cleaned = await cleanActiveWorkflowFiles(workspaceFolder);
		assert.strictEqual(cleaned, true);

		const cleanedInstruction = Buffer.from(await vscode.workspace.fs.readFile(instructionUri)).toString('utf8');
		assert.strictEqual(cleanedInstruction, 'Header\nFooter\n');
		await assert.rejects(async () => vscode.workspace.fs.readFile(vscode.Uri.joinPath(tempRoot, '.ai-context.md')));
		await assert.rejects(async () => vscode.workspace.fs.readFile(vscode.Uri.joinPath(tempRoot, '.ai-orchestrator', 'session.json')));
		await assert.rejects(async () => vscode.workspace.fs.readFile(vscode.Uri.joinPath(tempRoot, '.github', 'agents', 'orchestrator-implementer.agent.md')));

		const historyIndex = await readWorkflowHistoryIndex(tempRoot);
		assert.strictEqual(historyIndex.activeWorkflowId, undefined);
		const archivedManifest = await readWorkflowArchiveManifest(tempRoot, session?.workflowId as string);
		assert.ok(archivedManifest);
	});

	test('restore and cleanup never touch unrelated repository files', async () => {
		const tempRoot = vscode.Uri.file(path.join(os.tmpdir(), `aio-boundary-${Date.now()}`));
		await vscode.workspace.fs.createDirectory(tempRoot);

		const workspaceFolder = {
			uri: tempRoot,
			name: 'boundary-workspace',
			index: 0
		} as vscode.WorkspaceFolder;
		const repoFileUri = vscode.Uri.joinPath(tempRoot, 'src', 'app.ts');
		await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(tempRoot, 'src'));
		await vscode.workspace.fs.writeFile(repoFileUri, Buffer.from('export const untouched = true;\n', 'utf8'));

		const presetDefinition = WORKFLOW_PRESETS.build;
		const workflowPlan: WorkflowExecutionPlan = {
			preset: 'build',
			provider: 'copilot',
			providerModel: 'gpt-5.4',
			providerAccountId: 'copilot-main',
			roles: [...presetDefinition.roles],
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			optimizeWithCopilot: false,
			generateNativeArtifacts: true,
			presetDefinition,
			startNewWorkflow: true,
			brief: {
				taskType: 'feature',
				goal: 'Boundary workflow A',
				constraints: [],
				rawText: 'Boundary workflow A'
			}
		};
		const metadata: ContextMetadata = {
			generatedAt: new Date().toISOString(),
			signature: 'sig-boundary-a',
			preset: 'build',
			provider: 'copilot',
			providerModel: 'gpt-5.4',
			providerAccountId: 'copilot-main',
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			reused: false,
			keyFiles: ['src/app.ts'],
			instructionFiles: ['.github/copilot-instructions.md'],
			commands: ['compile'],
			artifactFiles: ['.github/copilot-instructions.md']
		};
		const artifactPlan: ArtifactPlan = {
			provider: 'copilot',
			files: [{
				relativePath: '.github/copilot-instructions.md',
				kind: 'instruction',
				content: '## Boundary workflow A'
			}]
		};

		const resultA = await persistWorkflowArtifacts(
			workspaceFolder,
			workflowPlan,
			metadata,
			vscode.Uri.joinPath(tempRoot, '.ai-context.md'),
			artifactPlan,
			'# Boundary Context A\n'
		);
		await archiveActiveWorkflowState(workspaceFolder, resultA.session, resultA.brief);

		const workflowPlanB: WorkflowExecutionPlan = {
			...workflowPlan,
			brief: {
				taskType: 'feature',
				goal: 'Boundary workflow B',
				constraints: [],
				rawText: 'Boundary workflow B'
			}
		};
		const resultB = await persistWorkflowArtifacts(
			workspaceFolder,
			workflowPlanB,
			{ ...metadata, signature: 'sig-boundary-b' },
			vscode.Uri.joinPath(tempRoot, '.ai-context.md'),
			artifactPlan,
			'# Boundary Context B\n'
		);
		await archiveActiveWorkflowState(workspaceFolder, resultB.session, resultB.brief);

		await restoreWorkflowFromHistory(workspaceFolder, resultA.session.workflowId as string);
		let repoFileContent = Buffer.from(await vscode.workspace.fs.readFile(repoFileUri)).toString('utf8');
		assert.strictEqual(repoFileContent, 'export const untouched = true;\n');

		await cleanActiveWorkflowFiles(workspaceFolder);
		repoFileContent = Buffer.from(await vscode.workspace.fs.readFile(repoFileUri)).toString('utf8');
		assert.strictEqual(repoFileContent, 'export const untouched = true;\n');
	});

	test('forks a workflow archive into a new active lineage with parent metadata', async () => {
		const tempRoot = vscode.Uri.file(path.join(os.tmpdir(), `aio-fork-${Date.now()}`));
		await vscode.workspace.fs.createDirectory(tempRoot);

		const workspaceFolder = {
			uri: tempRoot,
			name: 'fork-workspace',
			index: 0
		} as vscode.WorkspaceFolder;
		const presetDefinition = WORKFLOW_PRESETS.build;
		const workflowPlan: WorkflowExecutionPlan = {
			preset: 'build',
			provider: 'copilot',
			providerModel: 'gpt-5.4',
			providerAccountId: 'copilot-main',
			roles: [...presetDefinition.roles],
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			optimizeWithCopilot: false,
			generateNativeArtifacts: true,
			presetDefinition,
			startNewWorkflow: true,
			brief: {
				taskType: 'feature',
				goal: 'Fork source workflow',
				constraints: [],
				rawText: 'Fork source workflow'
			}
		};
		const metadata: ContextMetadata = {
			generatedAt: new Date().toISOString(),
			signature: 'sig-fork',
			preset: 'build',
			provider: 'copilot',
			providerModel: 'gpt-5.4',
			providerAccountId: 'copilot-main',
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			reused: false,
			keyFiles: ['src/extension.ts'],
			instructionFiles: ['.github/copilot-instructions.md'],
			commands: ['compile'],
			artifactFiles: ['.github/agents/orchestrator-implementer.agent.md']
		};
		const artifactPlan: ArtifactPlan = {
			provider: 'copilot',
			files: [{
				relativePath: '.github/agents/orchestrator-implementer.agent.md',
				kind: 'agent',
				content: '# fork source agent'
			}]
		};

		const source = await persistWorkflowArtifacts(
			workspaceFolder,
			workflowPlan,
			metadata,
			vscode.Uri.joinPath(tempRoot, '.ai-context.md'),
			artifactPlan,
			'# Fork Source Context\n'
		);
		await archiveActiveWorkflowState(workspaceFolder, source.session, source.brief);

		const forkedManifest = await forkWorkflowFromHistory(workspaceFolder, source.session.workflowId as string);
		assert.ok(forkedManifest);
		assert.notStrictEqual(forkedManifest?.workflowId, source.session.workflowId);
		assert.strictEqual(forkedManifest?.session.parentWorkflowId, source.session.workflowId);
		assert.strictEqual(forkedManifest?.session.parentStageIndex, source.session.currentStageIndex);

		const historyIndex = await readWorkflowHistoryIndex(tempRoot);
		const forkedEntry = historyIndex.entries.find((entry) => entry.workflowId === forkedManifest?.workflowId);
		assert.ok(forkedEntry);
		assert.strictEqual(forkedEntry?.parentWorkflowId, source.session.workflowId);
	});

	test('forks a workflow from a selected stage and truncates later stages', async () => {
		const tempRoot = vscode.Uri.file(path.join(os.tmpdir(), `aio-stage-fork-${Date.now()}`));
		await vscode.workspace.fs.createDirectory(tempRoot);

		const workspaceFolder = {
			uri: tempRoot,
			name: 'stage-fork-workspace',
			index: 0
		} as vscode.WorkspaceFolder;
		const basePlan: WorkflowExecutionPlan = {
			preset: 'build',
			provider: 'copilot',
			providerModel: 'gpt-5.4',
			providerAccountId: 'copilot-main',
			roles: [...WORKFLOW_PRESETS.build.roles],
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			optimizeWithCopilot: false,
			generateNativeArtifacts: true,
			presetDefinition: WORKFLOW_PRESETS.build,
			startNewWorkflow: true,
			brief: {
				taskType: 'feature',
				goal: 'Stage fork source',
				constraints: [],
				rawText: 'Stage fork source'
			}
		};
		const baseMetadata: ContextMetadata = {
			generatedAt: new Date().toISOString(),
			signature: 'sig-stage-fork-1',
			preset: 'build',
			provider: 'copilot',
			providerModel: 'gpt-5.4',
			providerAccountId: 'copilot-main',
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			reused: false,
			keyFiles: ['src/extension.ts'],
			instructionFiles: ['.github/copilot-instructions.md'],
			commands: ['compile'],
			artifactFiles: ['.github/agents/orchestrator-implementer.agent.md']
		};
		const artifactPlan: ArtifactPlan = {
			provider: 'copilot',
			files: [{
				relativePath: '.github/agents/orchestrator-implementer.agent.md',
				kind: 'agent',
				content: '# stage fork source agent'
			}]
		};

		const stageOne = await persistWorkflowArtifacts(
			workspaceFolder,
			basePlan,
			baseMetadata,
			vscode.Uri.joinPath(tempRoot, '.ai-context.md'),
			artifactPlan,
			'# Stage 1\n'
		);

		const stageTwoPlan: WorkflowExecutionPlan = {
			...basePlan,
			preset: 'review',
			providerModel: 'gpt-5.4-mini',
			presetDefinition: WORKFLOW_PRESETS.review,
			roles: [...WORKFLOW_PRESETS.review.roles],
			startNewWorkflow: false,
			brief: {
				taskType: 'review',
				goal: 'Stage two review',
				constraints: [],
				rawText: 'Stage two review'
			}
		};
		const stageTwo = await persistWorkflowArtifacts(
			workspaceFolder,
			stageTwoPlan,
			{ ...baseMetadata, signature: 'sig-stage-fork-2', preset: 'review', providerModel: 'gpt-5.4-mini' },
			vscode.Uri.joinPath(tempRoot, '.ai-context.md'),
			artifactPlan,
			'# Stage 2\n'
		);

		const stageThreePlan: WorkflowExecutionPlan = {
			...basePlan,
			preset: 'explore',
			providerModel: 'gpt-5.4-nano',
			presetDefinition: WORKFLOW_PRESETS.explore,
			roles: [...WORKFLOW_PRESETS.explore.roles],
			startNewWorkflow: false,
			brief: {
				taskType: 'analysis',
				goal: 'Stage three explore',
				constraints: [],
				rawText: 'Stage three explore'
			}
		};
		const stageThree = await persistWorkflowArtifacts(
			workspaceFolder,
			stageThreePlan,
			{ ...baseMetadata, signature: 'sig-stage-fork-3', preset: 'explore', providerModel: 'gpt-5.4-nano' },
			vscode.Uri.joinPath(tempRoot, '.ai-context.md'),
			artifactPlan,
			'# Stage 3\n'
		);
		await archiveActiveWorkflowState(workspaceFolder, stageThree.session, stageThree.brief);

		const forkedManifest = await forkWorkflowFromHistoryAtStage(workspaceFolder, stageThree.session.workflowId as string, 2);
		assert.ok(forkedManifest);
		assert.notStrictEqual(forkedManifest?.workflowId, stageThree.session.workflowId);
		assert.strictEqual(forkedManifest?.session.parentWorkflowId, stageThree.session.workflowId);
		assert.strictEqual(forkedManifest?.session.parentStageIndex, 2);
		assert.strictEqual(forkedManifest?.session.currentStageIndex, 2);
		assert.strictEqual(forkedManifest?.session.currentPreset, stageTwo.session.currentPreset);
		assert.strictEqual(forkedManifest?.session.currentProviderModel, stageTwo.session.currentProviderModel);
		assert.strictEqual(forkedManifest?.session.stages.length, 2);
		assert.deepStrictEqual(forkedManifest?.session.stages.map((stage) => stage.index), [1, 2]);
		assert.ok(forkedManifest?.session.stages.every((stage) => stage.artifactFiles.length === 0));
		assert.ok(forkedManifest?.files.every((file) => !file.relativePath.includes('03-')));

		await restoreWorkflowFromHistory(workspaceFolder, forkedManifest?.workflowId as string);
		const restoredSession = await readWorkflowSessionState(tempRoot);
		assert.strictEqual(restoredSession?.workflowId, forkedManifest?.workflowId);
		assert.strictEqual(restoredSession?.currentStageIndex, 2);

		const historyIndex = await readWorkflowHistoryIndex(tempRoot);
		const forkedEntry = historyIndex.entries.find((entry) => entry.workflowId === forkedManifest?.workflowId);
		assert.ok(forkedEntry);
		assert.strictEqual(forkedEntry?.parentWorkflowId, stageThree.session.workflowId);
		assert.strictEqual(forkedEntry?.parentStageIndex, 2);
		assert.strictEqual(stageOne.session.workflowId, stageThree.session.workflowId);
	});

	test('forks a stage from an archived workflow while another workflow is active', async () => {
		const tempRoot = vscode.Uri.file(path.join(os.tmpdir(), `aio-archived-stage-fork-${Date.now()}`));
		await vscode.workspace.fs.createDirectory(tempRoot);

		const workspaceFolder = {
			uri: tempRoot,
			name: 'archived-stage-fork-workspace',
			index: 0
		} as vscode.WorkspaceFolder;
		const artifactPlan: ArtifactPlan = {
			provider: 'copilot',
			files: [{
				relativePath: '.github/agents/orchestrator-implementer.agent.md',
				kind: 'agent',
				content: '# archived stage fork agent'
			}]
		};
		const baseMetadata: ContextMetadata = {
			generatedAt: new Date().toISOString(),
			signature: 'sig-archived-stage-1',
			preset: 'build',
			provider: 'copilot',
			providerModel: 'gpt-5.4',
			providerAccountId: 'copilot-main',
			refreshMode: 'full-rebuild',
			costProfile: 'balanced',
			reused: false,
			keyFiles: ['src/extension.ts'],
			instructionFiles: ['.github/copilot-instructions.md'],
			commands: ['compile'],
			artifactFiles: ['.github/agents/orchestrator-implementer.agent.md']
		};

		const sourceStageOne = await persistWorkflowArtifacts(
			workspaceFolder,
			{
				preset: 'build',
				provider: 'copilot',
				providerModel: 'gpt-5.4',
				providerAccountId: 'copilot-main',
				roles: [...WORKFLOW_PRESETS.build.roles],
				refreshMode: 'full-rebuild',
				costProfile: 'balanced',
				optimizeWithCopilot: false,
				generateNativeArtifacts: true,
				presetDefinition: WORKFLOW_PRESETS.build,
				startNewWorkflow: true,
				brief: {
					taskType: 'feature',
					goal: 'Archived source stage one',
					constraints: [],
					rawText: 'Archived source stage one'
				}
			},
			baseMetadata,
			vscode.Uri.joinPath(tempRoot, '.ai-context.md'),
			artifactPlan,
			'# Archived Stage 1\n'
		);

		const sourceStageTwo = await persistWorkflowArtifacts(
			workspaceFolder,
			{
				preset: 'review',
				provider: 'copilot',
				providerModel: 'gpt-5.4-mini',
				providerAccountId: 'copilot-main',
				workflowId: sourceStageOne.session.workflowId,
				branchId: sourceStageOne.session.branchId,
				roles: [...WORKFLOW_PRESETS.review.roles],
				refreshMode: 'full-rebuild',
				costProfile: 'balanced',
				optimizeWithCopilot: false,
				generateNativeArtifacts: true,
				presetDefinition: WORKFLOW_PRESETS.review,
				startNewWorkflow: false,
				brief: {
					taskType: 'review',
					goal: 'Archived source stage two',
					constraints: [],
					rawText: 'Archived source stage two'
				}
			},
			{ ...baseMetadata, signature: 'sig-archived-stage-2', preset: 'review', providerModel: 'gpt-5.4-mini' },
			vscode.Uri.joinPath(tempRoot, '.ai-context.md'),
			artifactPlan,
			'# Archived Stage 2\n'
		);

		const sourceStageThree = await persistWorkflowArtifacts(
			workspaceFolder,
			{
				preset: 'explore',
				provider: 'copilot',
				providerModel: 'gpt-5.4-nano',
				providerAccountId: 'copilot-main',
				workflowId: sourceStageOne.session.workflowId,
				branchId: sourceStageOne.session.branchId,
				roles: [...WORKFLOW_PRESETS.explore.roles],
				refreshMode: 'full-rebuild',
				costProfile: 'balanced',
				optimizeWithCopilot: false,
				generateNativeArtifacts: true,
				presetDefinition: WORKFLOW_PRESETS.explore,
				startNewWorkflow: false,
				brief: {
					taskType: 'analysis',
					goal: 'Archived source stage three',
					constraints: [],
					rawText: 'Archived source stage three'
				}
			},
			{ ...baseMetadata, signature: 'sig-archived-stage-3', preset: 'explore', providerModel: 'gpt-5.4-nano' },
			vscode.Uri.joinPath(tempRoot, '.ai-context.md'),
			artifactPlan,
			'# Archived Stage 3\n'
		);
		await archiveActiveWorkflowState(workspaceFolder, sourceStageThree.session, sourceStageThree.brief);

		const activeWorkflow = await persistWorkflowArtifacts(
			workspaceFolder,
			{
				preset: 'test',
				provider: 'copilot',
				providerModel: 'gpt-5.4',
				providerAccountId: 'copilot-main',
				roles: [...WORKFLOW_PRESETS.test.roles],
				refreshMode: 'full-rebuild',
				costProfile: 'balanced',
				optimizeWithCopilot: false,
				generateNativeArtifacts: true,
				presetDefinition: WORKFLOW_PRESETS.test,
				startNewWorkflow: true,
				brief: {
					taskType: 'test',
					goal: 'Currently active workflow',
					constraints: [],
					rawText: 'Currently active workflow'
				}
			},
			{ ...baseMetadata, signature: 'sig-archived-stage-active', preset: 'test' },
			vscode.Uri.joinPath(tempRoot, '.ai-context.md'),
			artifactPlan,
			'# Active Workflow\n'
		);
		await archiveActiveWorkflowState(workspaceFolder, activeWorkflow.session, activeWorkflow.brief);

		const forkedManifest = await forkWorkflowFromHistoryAtStage(workspaceFolder, sourceStageThree.session.workflowId as string, 2);
		assert.ok(forkedManifest);
		assert.notStrictEqual(forkedManifest?.workflowId, activeWorkflow.session.workflowId);
		assert.strictEqual(forkedManifest?.session.parentWorkflowId, sourceStageThree.session.workflowId);
		assert.strictEqual(forkedManifest?.session.parentStageIndex, 2);
		assert.deepStrictEqual(forkedManifest?.session.stages.map((stage) => stage.index), [1, 2]);

		await restoreWorkflowFromHistory(workspaceFolder, forkedManifest?.workflowId as string);
		const restoredSession = await readWorkflowSessionState(tempRoot);
		assert.strictEqual(restoredSession?.workflowId, forkedManifest?.workflowId);
		assert.strictEqual(restoredSession?.currentPreset, sourceStageTwo.session.currentPreset);
	});
});

suite('workflow control html', () => {
	test('creates a full learning document structure and keeps it discoverable', async () => {
		const tempRoot = vscode.Uri.file(path.join(os.tmpdir(), `aio-learning-doc-${Date.now()}`));
		await vscode.workspace.fs.createDirectory(tempRoot);
		const workspaceFolder = {
			uri: tempRoot,
			name: 'learning-doc-workspace',
			index: 0
		} as vscode.WorkspaceFolder;
		const context = createTestExtensionContext(vscode.workspace.workspaceFolders?.[0]?.uri);

		const document = await createLearningDocument(context, workspaceFolder, 'compte-rendu', 'Réseaux bayésiens - séance 03');
		const expectedPaths = [
			document.indexFile,
			path.posix.join(document.relativeDirectory, 'components.css'),
			document.promptFile,
			path.posix.join(document.relativeDirectory, 'section-EXAMPLE.html'),
			path.posix.join(document.relativeDirectory, '.github', 'copilot-instructions.md'),
			path.posix.join(document.relativeDirectory, 'design'),
			path.posix.join(document.relativeDirectory, 'layouts'),
			document.sourceDirectory,
			document.manifestFile
		];

		for (const relativePath of expectedPaths) {
			await assert.doesNotReject(async () => {
				await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceFolder.uri, ...relativePath.split('/')));
			});
		}

		const discoveredDocuments = await getLearningDocuments(context, workspaceFolder);
		assert.strictEqual(discoveredDocuments.length, 1);
		assert.strictEqual(discoveredDocuments[0]?.title, 'Réseaux bayésiens - séance 03');
		assert.strictEqual(discoveredDocuments[0]?.type, 'compte-rendu');
	});

	test('reconciles learning documents from disk when workspace state is empty', async () => {
		const tempRoot = vscode.Uri.file(path.join(os.tmpdir(), `aio-learning-reconcile-${Date.now()}`));
		await vscode.workspace.fs.createDirectory(tempRoot);
		const workspaceFolder = {
			uri: tempRoot,
			name: 'learning-reconcile-workspace',
			index: 0
		} as vscode.WorkspaceFolder;
		const context = createTestExtensionContext(vscode.workspace.workspaceFolders?.[0]?.uri);

		const createdDocument = await createLearningDocument(context, workspaceFolder, 'compte-rendu', 'Compte rendu test');
		await clearLearningDocumentState(context, workspaceFolder);

		const reconciledDocuments = await getLearningDocuments(context, workspaceFolder);
		assert.strictEqual(reconciledDocuments.length, 1);
		assert.strictEqual(reconciledDocuments[0]?.title, createdDocument.title);
		assert.strictEqual(reconciledDocuments[0]?.manifestFile, createdDocument.manifestFile);
		assert.strictEqual(reconciledDocuments[0]?.sourceDirectory, createdDocument.sourceDirectory);
	});

	test('shows create-document guidance when study mode has no learning documents', () => {
		const html = getWorkflowControlHtml(
			{} as vscode.Webview,
			{
				workspaceModeState: {
					mode: 'study',
					selectedAt: '2026-03-09T10:00:00.000Z',
					updatedAt: '2026-03-09T10:00:00.000Z'
				},
				learningDocuments: [],
				contextFileExists: false,
				nextSuggestedPresets: [],
				artifactCount: 0,
				providerStatuses: []
			} as WorkflowDashboardState,
			'nonce',
			{
				createNonce,
				escapeHtml: (value: string) => value,
				getProviderLabel: (provider) => provider,
				getExtensionConfiguration: () => ({
					treeDepth: 2,
					readmePreviewLines: 20,
					contextFilePreviewLines: 80,
					extraContextFiles: [],
					showIgnoredDirectories: true,
					maxEntriesPerDirectory: 40,
					optimizeWithCopilot: false,
					modelFamily: '',
					defaultClaudeModel: 'claude-sonnet-4-6',
					defaultGeminiModel: 'gemini-3.1-pro-preview',
					defaultClaudeEffort: 'medium',
					claudeAccounts: [],
					geminiAccounts: [],
					copilotAccounts: [],
					autoGenerateOnStartup: false,
					defaultPreset: 'explore',
					defaultProvider: 'copilot',
					contextRefreshMode: 'smart-refresh',
					costProfile: 'balanced',
					generateNativeArtifacts: true,
					enabledProviders: ['claude', 'gemini', 'copilot']
				}),
				findProviderAccount: () => undefined
			},
			false,
			undefined
		);

		assert.ok(html.includes('Créer votre premier document'));
		assert.ok(html.includes('Commencez par créer un document de travail'));
	});

	test('renders distributed source batch mini-view with direct job actions', () => {
		const html = getWorkflowControlHtml(
			{} as vscode.Webview,
			{
				workspaceModeState: {
					mode: 'study',
					selectedAt: '2026-03-09T10:00:00.000Z',
					updatedAt: '2026-03-09T10:00:00.000Z'
				},
				activeLearningDocument: {
					id: 'doc-1',
					title: 'Compte rendu test',
					type: 'compte-rendu',
					slug: 'compte-rendu-test',
					relativeDirectory: 'learning-documents/doc-1',
					manifestFile: 'learning-documents/doc-1/document.json',
					indexFile: 'learning-documents/doc-1/index.html',
					promptFile: 'learning-documents/doc-1/.instructions.md',
					sourceDirectory: 'learning-documents/doc-1/sources',
					createdAt: '2026-03-09T00:00:00.000Z',
					updatedAt: '2026-03-09T00:00:00.000Z',
					sources: [
						{ relativePath: 'sources/source-a.md', label: 'Source A', importedAt: '2026-03-09T00:00:00.000Z' },
						{ relativePath: 'sources/source-b.md', label: 'Source B', importedAt: '2026-03-09T00:00:00.000Z' }
					]
				},
				sourceAnalysisBatch: {
					batchId: 'batch-1',
					workflowId: 'workflow-1',
					stageIndex: 1,
					mode: 'distributed',
					learningDocumentId: 'doc-1',
					learningDocumentTitle: 'Compte rendu test',
					provider: 'claude',
					briefGoal: 'Analyser les sources',
					jobs: [
						{
							id: 'job-1',
							sourceRelativePath: 'sources/source-a.md',
							sourceLabel: 'Source A',
							outputFile: '.ai-orchestrator/analysis/analysis-01-source-a.md',
							status: 'completed',
							provider: 'claude',
							completedAt: '2026-03-09T10:05:00.000Z'
						},
						{
							id: 'job-2',
							sourceRelativePath: 'sources/source-b.md',
							sourceLabel: 'Source B',
							outputFile: '.ai-orchestrator/analysis/analysis-02-source-b.md',
							status: 'queued',
							provider: 'claude'
						}
					],
					createdAt: '2026-03-09T10:00:00.000Z',
					updatedAt: '2026-03-09T10:05:00.000Z'
				},
				learningDocuments: [],
				contextFileExists: false,
				nextSuggestedPresets: [],
				artifactCount: 0,
				providerStatuses: []
			} as WorkflowDashboardState,
			'nonce',
			{
				createNonce,
				escapeHtml: (value: string) => value,
				getProviderLabel: (provider) => provider,
				getExtensionConfiguration: () => ({
					treeDepth: 2,
					readmePreviewLines: 20,
					contextFilePreviewLines: 80,
					extraContextFiles: [],
					showIgnoredDirectories: true,
					maxEntriesPerDirectory: 40,
					optimizeWithCopilot: false,
					modelFamily: '',
					defaultClaudeModel: 'claude-sonnet-4-6',
					defaultGeminiModel: 'gemini-3.1-pro-preview',
					defaultClaudeEffort: 'medium',
					claudeAccounts: [],
					geminiAccounts: [],
					copilotAccounts: [],
					autoGenerateOnStartup: false,
					defaultPreset: 'explore',
					defaultProvider: 'copilot',
					contextRefreshMode: 'smart-refresh',
					costProfile: 'balanced',
					generateNativeArtifacts: true,
					enabledProviders: ['claude', 'gemini', 'copilot']
				}),
				findProviderAccount: () => undefined
			},
			false,
			undefined
		);

		assert.ok(html.includes('Batch batch-1 · 1/2 job(s) completed'));
		assert.ok(html.includes('Source A'));
		assert.ok(html.includes('Open report'));
		assert.ok(html.includes('setDistributedSourceAnalysisJobStatus'));
		assert.ok(html.includes('openDistributedSourceAnalysisReport'));
	});

	test('renders workflow history actions when archived workflows exist', () => {
		const html = getWorkflowControlHtml(
			{} as vscode.Webview,
			{
				session: {
					workspaceFolderId: 'workspace-a',
					workspaceName: 'workspace-a',
					currentPreset: 'build',
					currentProvider: 'copilot',
					currentProviderModel: 'gpt-5.4',
					briefFile: '.ai-orchestrator/brief.md',
					currentStageIndex: 2,
					stages: [
						{
							index: 1,
							preset: 'build',
							provider: 'copilot',
							providerModel: 'gpt-5.4',
							status: 'completed',
							generatedAt: '2026-03-08T12:00:00.000Z',
							briefSummary: 'Workflow A stage 1',
							stageFile: '.ai-orchestrator/stages/01-build.md',
							contextFile: '.ai-context.md',
							artifactFiles: [],
							upstreamStageFiles: [],
							workflowId: 'workflow-a',
							branchId: 'main'
						},
						{
							index: 2,
							preset: 'review',
							provider: 'copilot',
							providerModel: 'gpt-5.4-mini',
							status: 'in-progress',
							generatedAt: '2026-03-08T12:30:00.000Z',
							briefSummary: 'Workflow A stage 2',
							stageFile: '.ai-orchestrator/stages/02-review.md',
							contextFile: '.ai-context.md',
							artifactFiles: [],
							upstreamStageFiles: ['.ai-orchestrator/stages/01-build.md'],
							workflowId: 'workflow-a',
							branchId: 'main'
						}
					],
					workflowId: 'workflow-a',
					branchId: 'main',
					createdAt: '2026-03-08T12:00:00.000Z',
					updatedAt: '2026-03-08T12:30:00.000Z',
					label: 'Workflow A'
				},
				contextFileExists: true,
				nextSuggestedPresets: ['build'],
				artifactCount: 3,
				providerStatuses: [],
				historyEntries: [
					{
						workflowId: 'workflow-a',
						branchId: 'main',
						label: 'Workflow A',
						createdAt: '2026-03-08T12:00:00.000Z',
						updatedAt: '2026-03-08T12:30:00.000Z',
						currentStageIndex: 2,
						stageCount: 2,
						currentPreset: 'build',
						currentProvider: 'copilot',
						briefSummary: 'Workflow A summary',
						manifestPath: '.ai-orchestrator/history/workflow-a/manifest.json',
						latestStageFile: '.ai-orchestrator/stages/02-build.md'
						},
						{
							workflowId: 'workflow-b',
							branchId: 'main',
							parentWorkflowId: 'workflow-a',
							parentStageIndex: 2,
							label: 'Workflow B',
							createdAt: '2026-03-08T13:00:00.000Z',
							updatedAt: '2026-03-08T13:15:00.000Z',
							currentStageIndex: 2,
							stageCount: 2,
							currentPreset: 'review',
							currentProvider: 'claude',
							briefSummary: 'Workflow B summary',
							manifestPath: '.ai-orchestrator/history/workflow-b/manifest.json',
							latestStageFile: '.ai-orchestrator/stages/02-review.md'
					}
				],
				activeWorkflowId: 'workflow-a'
			} as WorkflowDashboardState,
			'nonce',
			{
				createNonce,
				escapeHtml: (value: string) => value,
				getProviderLabel: (provider) => provider,
				getExtensionConfiguration: () => ({
					treeDepth: 2,
					readmePreviewLines: 20,
					contextFilePreviewLines: 80,
					extraContextFiles: [],
					showIgnoredDirectories: true,
					maxEntriesPerDirectory: 40,
					optimizeWithCopilot: false,
					modelFamily: '',
					defaultClaudeModel: 'claude-sonnet-4-6',
					defaultGeminiModel: 'gemini-3.1-pro-preview',
					defaultClaudeEffort: 'medium',
					claudeAccounts: [],
					geminiAccounts: [],
					copilotAccounts: [],
					autoGenerateOnStartup: false,
					defaultPreset: 'explore',
					defaultProvider: 'copilot',
					contextRefreshMode: 'smart-refresh',
					costProfile: 'balanced',
					generateNativeArtifacts: true,
					enabledProviders: ['claude', 'gemini', 'copilot']
				}),
				findProviderAccount: () => undefined
			},
			false,
			undefined
		);

		assert.ok(html.includes('Workflow History'));
		assert.ok(html.includes('Workflow A'));
		assert.ok(html.includes('Clean Active Generated Files'));
		assert.ok(html.includes('data-command="forkWorkflowFromHistory"'));
		assert.ok(html.includes('data-command="forkWorkflowFromArchivedStage"'));
		assert.ok(html.includes('data-command="forkWorkflowFromStage"'));
		assert.ok(html.includes('data-command="restoreWorkflowFromHistory"'));
	});
});
