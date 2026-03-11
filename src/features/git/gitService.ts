import { spawn } from 'child_process';
import type { GitOperationResult } from '../workflow/types.js';

function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
	return new Promise((resolve) => {
		const child = spawn('git', args, { cwd, shell: false });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
		child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
		child.on('close', (code) => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code ?? 1 }));
	});
}

export async function isGitRepository(cwd: string): Promise<boolean> {
	const result = await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
	return result.code === 0;
}

export async function getCurrentBranch(cwd: string): Promise<string | undefined> {
	const result = await runGit(cwd, ['branch', '--show-current']);
	return result.code === 0 ? result.stdout : undefined;
}

export async function createBranch(cwd: string, name: string): Promise<GitOperationResult> {
	const result = await runGit(cwd, ['checkout', '-b', name]);
	if (result.code === 0) {
		return { success: true, branchName: name };
	}

	const alreadyExists = result.stderr.includes('already exists');
	return {
		success: false,
		error: alreadyExists
			? `Branch "${name}" already exists. Choose a different name.`
			: result.stderr || 'Failed to create branch.'
	};
}

export async function mergeInto(cwd: string, sourceBranch: string, targetBranch: string): Promise<GitOperationResult> {
	const checkoutResult = await runGit(cwd, ['checkout', targetBranch]);
	if (checkoutResult.code !== 0) {
		return { success: false, error: `Failed to checkout ${targetBranch}: ${checkoutResult.stderr}` };
	}

	const mergeResult = await runGit(cwd, ['merge', '--no-ff', sourceBranch]);
	if (mergeResult.code === 0) {
		return { success: true, branchName: targetBranch };
	}

	const hasConflicts = mergeResult.stdout.includes('CONFLICT') || mergeResult.stderr.includes('CONFLICT');
	return {
		success: false,
		error: hasConflicts
			? `Merge conflict detected. Resolve conflicts in ${targetBranch} manually.`
			: mergeResult.stderr || mergeResult.stdout || 'Merge failed.'
	};
}

export async function isWorkingTreeClean(cwd: string): Promise<boolean> {
	const result = await runGit(cwd, ['status', '--porcelain']);
	return result.code === 0 && result.stdout === '';
}
