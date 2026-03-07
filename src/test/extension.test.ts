import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { normalizeWorkspaceRelativePath } from '../core/workspace.js';
import { commitFileTransaction, persistWorkflowArtifacts, readWorkflowSessionState, type WorkspaceWriteOperation } from '../features/context/workflowPersistence.js';
import type { ArtifactPlan, ContextMetadata, WorkflowExecutionPlan, WorkflowSessionState } from '../features/workflow/types.js';
import { computeSignature, escapeShellArg, createNonce } from '../utils/index.js';
import { detectTechStack } from '../features/context/contextBuilder.js';
import { WORKFLOW_PRESETS } from '../features/workflow/presets.js';

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
		const stack = detectTechStack('', ['src/index.ts'], []);
		assert.ok(stack.includes('TypeScript'));
	});

	test('detects React from dependency in summary', () => {
		const stack = detectTechStack('react', ['src/App.tsx'], []);
		assert.ok(stack.includes('React'));
	});

	test('does NOT detect React from .tsx alone (no react dep)', () => {
		const stack = detectTechStack('', ['src/Component.tsx'], []);
		assert.ok(!stack.includes('React'));
	});

	test('detects React from .jsx file without dependency', () => {
		const stack = detectTechStack('', ['src/App.jsx'], []);
		assert.ok(stack.includes('React'));
	});

	test('detects VS Code Extension from @types/vscode in summary', () => {
		const stack = detectTechStack('@types/vscode devdependencies', [], []);
		assert.ok(stack.includes('VS Code Extension'));
	});

	test('does NOT detect VS Code Extension from "vscode" word alone', () => {
		const stack = detectTechStack('mentions vscode in readme', [], ['uses vscode']);
		assert.ok(!stack.includes('VS Code Extension'));
	});

	test('detects Web Workers from .worker.ts file', () => {
		const stack = detectTechStack('', ['src/my.worker.ts'], []);
		assert.ok(stack.includes('Web Workers'));
	});

	test('detects Web Workers from .worker.js file', () => {
		const stack = detectTechStack('', ['dist/worker.worker.js'], []);
		assert.ok(stack.includes('Web Workers'));
	});

	test('does NOT detect Web Workers from file named "worker"', () => {
		const stack = detectTechStack('', ['src/workerUtils.ts', 'src/worker/index.ts'], []);
		assert.ok(!stack.includes('Web Workers'));
	});

	test('detects ESLint from summary', () => {
		const stack = detectTechStack('eslint ^8.0.0', [], []);
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
});
