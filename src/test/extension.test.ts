import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { normalizeWorkspaceRelativePath } from '../core/workspace.js';
import { commitFileTransaction, persistWorkflowArtifacts, readWorkflowSessionState, type WorkspaceWriteOperation } from '../features/context/workflowPersistence.js';
import { archiveActiveWorkflowState, cleanActiveWorkflowFiles, forkWorkflowFromHistory, forkWorkflowFromHistoryAtStage, readWorkflowArchiveManifest, readWorkflowHistoryIndex, restoreWorkflowFromHistory } from '../features/context/workflowHistory.js';
import type { ArtifactPlan, ContextMetadata, WorkflowDashboardState, WorkflowExecutionPlan, WorkflowSessionState } from '../features/workflow/types.js';
import { computeSignature, escapeShellArg, createNonce } from '../utils/index.js';
import { detectTechStack } from '../features/context/contextBuilder.js';
import { WORKFLOW_PRESETS } from '../features/workflow/presets.js';
import { GENERATED_SECTION_END, GENERATED_SECTION_START } from '../features/workflow/constants.js';
import { getWorkflowControlHtml } from '../features/workflow/ui.js';

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
		assert.ok(html.includes('Forked from Workflow A @ stage 2'));
		assert.ok(html.includes('data-command="forkWorkflowFromHistory"'));
		assert.ok(html.includes('data-command="forkWorkflowFromArchivedStage"'));
		assert.ok(html.includes('data-command="forkWorkflowFromStage"'));
		assert.ok(html.includes('data-command="restoreWorkflowFromHistory"'));
	});
});
