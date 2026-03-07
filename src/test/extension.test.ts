import * as assert from 'assert';
import * as vscode from 'vscode';
import { computeSignature, escapeShellArg, createNonce } from '../utils/index.js';
import { detectTechStack } from '../features/context/contextBuilder.js';

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
