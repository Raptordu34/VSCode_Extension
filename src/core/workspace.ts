import * as vscode from 'vscode';
import { IGNORED_DIRECTORIES } from '../features/workflow/constants.js';

export function normalizeWorkspaceRelativePath(inputPath: string): string {
	const trimmedPath = inputPath.trim().replace(/\\+/g, '/');
	if (!trimmedPath) {
		return '';
	}

	const normalizedSegments: string[] = [];
	for (const segment of trimmedPath.split('/')) {
		const normalizedSegment = segment.trim();
		if (!normalizedSegment || normalizedSegment === '.') {
			continue;
		}

		if (normalizedSegment === '..') {
			if (normalizedSegments.length > 0) {
				normalizedSegments.pop();
			}
			continue;
		}

		normalizedSegments.push(normalizedSegment);
	}

	return normalizedSegments.join('/');
}

export function relativizeToWorkspace(workspaceUri: vscode.Uri, targetUri: vscode.Uri): string {
	const workspacePath = workspaceUri.path.endsWith('/') ? workspaceUri.path : `${workspaceUri.path}/`;
	if (!targetUri.path.startsWith(workspacePath)) {
		return targetUri.path;
	}

	return normalizeWorkspaceRelativePath(targetUri.path.slice(workspacePath.length));
}

export function isIgnoredDirectory(name: string): boolean {
	return IGNORED_DIRECTORIES.has(name);
}

export function shouldIncludeEntry(name: string, type: vscode.FileType, depth: number): boolean {
	if (type === vscode.FileType.Directory) {
		return true;
	}

	if (depth === 0) {
		return !isBinaryLikeFile(name);
	}

	return isRelevantFile(name);
}

export function isRelevantFile(name: string): boolean {
	const normalized = name.toLowerCase();
	const relevantNames = new Set([
		'dockerfile',
		'makefile',
		'package-lock.json',
		'package.json',
		'pnpm-lock.yaml',
		'pyproject.toml',
		'readme.md',
		'requirements.txt',
		'tsconfig.json',
		'vite.config.ts',
		'vite.config.js',
		'webpack.config.js',
		'yarn.lock'
	]);

	if (relevantNames.has(normalized)) {
		return true;
	}

	const relevantExtensions = new Set([
		'.c',
		'.cc',
		'.cpp',
		'.cs',
		'.css',
		'.env',
		'.go',
		'.graphql',
		'.h',
		'.hpp',
		'.html',
		'.java',
		'.js',
		'.json',
		'.jsx',
		'.md',
		'.mjs',
		'.php',
		'.ps1',
		'.py',
		'.rb',
		'.rs',
		'.scss',
		'.sh',
		'.sql',
		'.toml',
		'.ts',
		'.tsx',
		'.txt',
		'.vue',
		'.xml',
		'.yaml',
		'.yml'
	]);

	for (const extension of relevantExtensions) {
		if (normalized.endsWith(extension)) {
			return true;
		}
	}

	return false;
}

export function isBinaryLikeFile(name: string): boolean {
	const normalized = name.toLowerCase();
	const ignoredExtensions = [
		'.7z',
		'.dll',
		'.exe',
		'.gif',
		'.ico',
		'.jpeg',
		'.jpg',
		'.mp3',
		'.mp4',
		'.pdf',
		'.png',
		'.svg',
		'.webp',
		'.zip'
	];

	return ignoredExtensions.some((extension) => normalized.endsWith(extension));
}

export function buildWorkspaceUri(workspaceUri: vscode.Uri, relativePath: string): vscode.Uri | undefined {
	const normalizedRelativePath = normalizeWorkspaceRelativePath(relativePath);
	const segments = normalizedRelativePath
		.split('/')
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);

	if (segments.length === 0) {
		return undefined;
	}

	return vscode.Uri.joinPath(workspaceUri, ...segments);
}
export async function fileExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}
export async function readUtf8(uri: vscode.Uri): Promise<string> {
	const bytes = await vscode.workspace.fs.readFile(uri);
	return Buffer.from(bytes).toString('utf8');
}
