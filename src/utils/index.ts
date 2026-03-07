import { exec } from 'child_process';

export function execShellCommand(command: string, env: NodeJS.ProcessEnv): Promise<string> {
	return new Promise((resolve, reject) => {
		exec(command, { env, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(stderr.trim() || error.message));
				return;
			}

			resolve(stdout.trim());
		});
	});
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let index = 0; index < 32; index += 1) {
		nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
	}
	return nonce;
}

export function serializeList(values: string[]): string {
	return values.length > 0 ? values.join(', ') : 'none';
}

export function parseList(value: string | undefined): string[] {
	if (!value || value === 'none') {
		return [];
	}

	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

export function computeSignature(input: string): string {
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return `sig-${(hash >>> 0).toString(16)}`;
}

export function clampNumber(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function formatListForMarkdown(values: string[], fallback: string): string[] {
	if (values.length === 0) {
		return [fallback];
	}

	return values.map((value) => `- ${value}`);
}

export function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
