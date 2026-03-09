import * as path from 'path';
import * as vscode from 'vscode';
import { buildWorkspaceUri, normalizeWorkspaceRelativePath, readUtf8 } from '../../core/workspace.js';
import { createNonce } from '../../utils/index.js';
import { WORKFLOW_SOURCE_ANALYSIS_BATCH_FILE, WORKFLOW_SOURCE_ANALYSIS_DIRECTORY } from '../workflow/constants.js';
import type {
	ProjectContext,
	SourceAnalysisBatch,
	SourceAnalysisJob,
	SourceAnalysisJobStatus,
	WorkflowSessionState
} from '../workflow/types.js';
import { commitFileTransaction, type WorkspaceWriteOperation, readWorkflowSessionState, writeWorkflowSessionState } from './workflowPersistence.js';

function toUtf8Bytes(content: string): Uint8Array {
	return Buffer.from(content, 'utf8');
}

function isSourceAnalysisJob(value: unknown): value is SourceAnalysisJob {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<SourceAnalysisJob>;
	return typeof candidate.id === 'string'
		&& typeof candidate.sourceRelativePath === 'string'
		&& typeof candidate.sourceLabel === 'string'
		&& typeof candidate.outputFile === 'string'
		&& typeof candidate.status === 'string'
		&& typeof candidate.provider === 'string';
}

function isSourceAnalysisBatch(value: unknown): value is SourceAnalysisBatch {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<SourceAnalysisBatch>;
	return typeof candidate.batchId === 'string'
		&& typeof candidate.workflowId === 'string'
		&& typeof candidate.stageIndex === 'number'
		&& typeof candidate.mode === 'string'
		&& typeof candidate.learningDocumentId === 'string'
		&& typeof candidate.learningDocumentTitle === 'string'
		&& typeof candidate.provider === 'string'
		&& typeof candidate.briefGoal === 'string'
		&& typeof candidate.createdAt === 'string'
		&& typeof candidate.updatedAt === 'string'
		&& Array.isArray(candidate.jobs)
		&& candidate.jobs.every((job) => isSourceAnalysisJob(job));
}

function buildBatchContent(batch: SourceAnalysisBatch): string {
	return `${JSON.stringify(batch, null, 2)}\n`;
}

function normalizeAnalysisContent(content: string): string {
	return content.replace(/\r\n/g, '\n').trimEnd();
}

function buildInitialAnalysisFileContentForBatch(batch: Pick<SourceAnalysisBatch, 'batchId' | 'briefGoal' | 'createdAt'>, job: SourceAnalysisJob): string {
	return [
		`# Source Analysis ${job.sourceLabel}`,
		'',
		`- Batch: ${batch.batchId}`,
		`- Job: ${job.id}`,
		`- Source: ${job.sourceRelativePath}`,
		`- Provider: ${job.provider}`,
		`- Provider model: ${job.providerModel ?? 'default'}`,
		`- Status: ${job.status}`,
		`- Created at: ${batch.createdAt}`,
		'',
		'## Objective',
		batch.briefGoal,
		'',
		'## Source Scope',
		`- Read only the assigned source file: ${job.sourceRelativePath}`,
		'- Use the active learning document and its prompt as the target frame for extraction.',
		'- Do not edit the target learning document directly in this job.',
		'',
		'## Expected Output',
		'- Key concepts and definitions',
		'- Important arguments, facts, or examples',
		'- Sections of the compte-rendu that should reuse this source',
		'- Ambiguities, contradictions, or missing context',
		'',
		'## Analysis Notes',
		'- Fill this file with the analysis for the assigned source only.'
	].join('\n').trimEnd() + '\n';
}

function buildInitialAnalysisFileContent(projectContext: ProjectContext, job: SourceAnalysisJob): string {
	return buildInitialAnalysisFileContentForBatch({
		batchId: projectContext.sourceAnalysisBatch?.batchId ?? 'unknown',
		briefGoal: projectContext.brief?.goal ?? 'Analyze the assigned source and extract reusable material for the learning document.',
		createdAt: projectContext.sourceAnalysisBatch?.createdAt ?? new Date().toISOString()
	}, job);
}

function isCompletedAnalysisOutput(content: string, batch: SourceAnalysisBatch, job: SourceAnalysisJob): boolean {
	const normalizedActualContent = normalizeAnalysisContent(content);
	if (!normalizedActualContent) {
		return false;
	}

	const normalizedInitialContent = normalizeAnalysisContent(buildInitialAnalysisFileContentForBatch(batch, job));
	return normalizedActualContent !== normalizedInitialContent;
}

async function syncBatchIntoWorkflowSession(workspaceUri: vscode.Uri, batch: SourceAnalysisBatch): Promise<void> {
	const session = await readWorkflowSessionState(workspaceUri);
	if (!session) {
		return;
	}

	const nextSession: WorkflowSessionState = {
		...session,
		updatedAt: batch.updatedAt,
		sourceAnalysisBatch: batch
	};
	await writeWorkflowSessionState(workspaceUri, nextSession);
}

export function getSourceAnalysisOutputFileName(index: number, sourceRelativePath: string): string {
	const sourceBaseName = path.posix.basename(sourceRelativePath, path.posix.extname(sourceRelativePath))
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || `source-${index}`;
	return normalizeWorkspaceRelativePath(`${WORKFLOW_SOURCE_ANALYSIS_DIRECTORY}/analysis-${String(index).padStart(2, '0')}-${sourceBaseName}.md`);
}

export async function readSourceAnalysisBatch(workspaceUri: vscode.Uri): Promise<SourceAnalysisBatch | undefined> {
	const batchUri = buildWorkspaceUri(workspaceUri, WORKFLOW_SOURCE_ANALYSIS_BATCH_FILE);
	if (!batchUri) {
		return undefined;
	}

	try {
		const content = await readUtf8(batchUri);
		const parsed = JSON.parse(content) as unknown;
		return isSourceAnalysisBatch(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export async function writeSourceAnalysisBatch(workspaceUri: vscode.Uri, batch: SourceAnalysisBatch): Promise<void> {
	const batchUri = buildWorkspaceUri(workspaceUri, WORKFLOW_SOURCE_ANALYSIS_BATCH_FILE);
	if (!batchUri) {
		return;
	}

	await commitFileTransaction({
		readFile: (uri) => vscode.workspace.fs.readFile(uri),
		writeFile: (uri, content) => vscode.workspace.fs.writeFile(uri, content),
		delete: (uri) => vscode.workspace.fs.delete(uri, { recursive: false, useTrash: false }),
		createDirectory: (uri) => vscode.workspace.fs.createDirectory(uri)
	}, [{
		uri: batchUri,
		content: toUtf8Bytes(buildBatchContent(batch))
	}]);

	await syncBatchIntoWorkflowSession(workspaceUri, batch);
	}

export async function initializeSourceAnalysisBatch(projectContext: ProjectContext): Promise<SourceAnalysisBatch> {
	if (!projectContext.activeLearningDocument) {
		throw new Error('An active learning document is required to initialize distributed source analysis.');
	}
	if (!projectContext.workflowSession?.workflowId) {
		throw new Error('A workflow session is required to initialize distributed source analysis.');
	}

	const createdAt = new Date().toISOString();
	const batchId = `batch-${Date.now().toString(36)}-${createNonce().slice(0, 8)}`;
	const jobs = projectContext.activeLearningDocument.sources.map((source, index) => ({
		id: `job-${index + 1}-${createNonce().slice(0, 6)}`,
		sourceRelativePath: normalizeWorkspaceRelativePath(source.relativePath),
		sourceLabel: source.label,
		outputFile: getSourceAnalysisOutputFileName(index + 1, source.relativePath),
		status: 'queued' as const,
		provider: projectContext.workflowPlan.provider,
		providerModel: projectContext.workflowPlan.providerModel,
		providerAccountId: projectContext.workflowPlan.providerAccountId,
		claudeAccountId: projectContext.workflowPlan.claudeAccountId,
		claudeEffort: projectContext.workflowPlan.claudeEffort
	}));

	const batch: SourceAnalysisBatch = {
		batchId,
		workflowId: projectContext.workflowSession.workflowId,
		branchId: projectContext.workflowSession.branchId,
		stageIndex: projectContext.currentStage?.index ?? projectContext.workflowSession.currentStageIndex,
		mode: 'distributed',
		learningDocumentId: projectContext.activeLearningDocument.id,
		learningDocumentTitle: projectContext.activeLearningDocument.title,
		documentIntentId: projectContext.workflowPlan.documentIntentId,
		provider: projectContext.workflowPlan.provider,
		providerModel: projectContext.workflowPlan.providerModel,
		providerAccountId: projectContext.workflowPlan.providerAccountId,
		claudeAccountId: projectContext.workflowPlan.claudeAccountId,
		claudeEffort: projectContext.workflowPlan.claudeEffort,
		briefGoal: projectContext.brief?.goal ?? projectContext.workflowPlan.brief?.goal ?? 'Analyze each source and prepare a synthesis-ready handoff.',
		jobs,
		createdAt,
		updatedAt: createdAt
	};

	const operations: WorkspaceWriteOperation[] = [];
	const batchUri = buildWorkspaceUri(projectContext.workspaceFolder.uri, WORKFLOW_SOURCE_ANALYSIS_BATCH_FILE);
	if (batchUri) {
		operations.push({ uri: batchUri, content: toUtf8Bytes(buildBatchContent(batch)) });
	}

	for (const job of jobs) {
		const outputUri = buildWorkspaceUri(projectContext.workspaceFolder.uri, job.outputFile);
		if (!outputUri) {
			continue;
		}
		operations.push({
			uri: outputUri,
			content: toUtf8Bytes(buildInitialAnalysisFileContent({ ...projectContext, sourceAnalysisBatch: batch, sourceAnalysisJob: job }, job))
		});
	}

	await commitFileTransaction({
		readFile: (uri) => vscode.workspace.fs.readFile(uri),
		writeFile: (uri, content) => vscode.workspace.fs.writeFile(uri, content),
		delete: (uri) => vscode.workspace.fs.delete(uri, { recursive: false, useTrash: false }),
		createDirectory: (uri) => vscode.workspace.fs.createDirectory(uri)
	}, operations);

	const nextSession: WorkflowSessionState = {
		...projectContext.workflowSession,
		updatedAt: new Date().toISOString(),
		sourceAnalysisBatch: batch
	};
	await writeWorkflowSessionState(projectContext.workspaceFolder.uri, nextSession);

	return batch;
}

export async function updateSourceAnalysisJobStatus(
	workspaceUri: vscode.Uri,
	jobId: string,
	status: SourceAnalysisJobStatus,
	notes?: string
): Promise<SourceAnalysisBatch | undefined> {
	const existingBatch = await readSourceAnalysisBatch(workspaceUri);
	if (!existingBatch) {
		return undefined;
	}

	const now = new Date().toISOString();
	const jobs = existingBatch.jobs.map((job) => {
		if (job.id !== jobId) {
			return job;
		}

		return {
			...job,
			status,
			launchedAt: status === 'running' ? now : job.launchedAt,
			completedAt: status === 'completed' || status === 'failed' ? now : job.completedAt,
			notes: notes ?? job.notes
		};
	});

	const nextBatch: SourceAnalysisBatch = {
		...existingBatch,
		jobs,
		updatedAt: now
	};

	await writeSourceAnalysisBatch(workspaceUri, nextBatch);
	return nextBatch;
}

export async function reconcileSourceAnalysisBatch(workspaceUri: vscode.Uri, batch: SourceAnalysisBatch): Promise<SourceAnalysisBatch> {
	let didChange = false;
	const reconciledJobs = await Promise.all(batch.jobs.map(async (job) => {
		const outputUri = buildWorkspaceUri(workspaceUri, job.outputFile);
		if (!outputUri) {
			return job;
		}

		try {
			const content = await readUtf8(outputUri);
			if (!isCompletedAnalysisOutput(content, batch, job) || job.status === 'completed') {
				return job;
			}

			didChange = true;
			return {
				...job,
				status: 'completed' as const,
				completedAt: job.completedAt ?? new Date().toISOString()
			};
		} catch {
			return job;
		}
	}));

	if (!didChange) {
		await syncBatchIntoWorkflowSession(workspaceUri, batch);
		return batch;
	}

	const nextBatch: SourceAnalysisBatch = {
		...batch,
		jobs: reconciledJobs,
		updatedAt: new Date().toISOString()
	};
	await writeSourceAnalysisBatch(workspaceUri, nextBatch);
	return nextBatch;
}

export async function readReconciledSourceAnalysisBatch(workspaceUri: vscode.Uri): Promise<SourceAnalysisBatch | undefined> {
	const batch = await readSourceAnalysisBatch(workspaceUri);
	if (!batch) {
		return undefined;
	}

	return reconcileSourceAnalysisBatch(workspaceUri, batch);
}

export async function buildSourceAnalysisSynthesisSection(workspaceUri: vscode.Uri, batch: SourceAnalysisBatch): Promise<string> {
	const sections = await Promise.all(batch.jobs.map(async (job) => {
		const outputUri = buildWorkspaceUri(workspaceUri, job.outputFile);
		if (!outputUri) {
			return `## ${job.sourceLabel}\n\nOutput file not found.`;
		}

		try {
			const content = await readUtf8(outputUri);
			return `## ${job.sourceLabel}\n\nSource: ${job.sourceRelativePath}\nStatus: ${job.status}\n\n${content.trim()}`;
		} catch {
			return `## ${job.sourceLabel}\n\nSource: ${job.sourceRelativePath}\nStatus: ${job.status}\n\nOutput file not found.`;
		}
	}));

	return [
		'# Distributed Source Analysis',
		'',
		`Batch: ${batch.batchId}`,
		`Learning document: ${batch.learningDocumentTitle}`,
		`Brief: ${batch.briefGoal}`,
		'',
		...sections
	].join('\n').trimEnd() + '\n';
}