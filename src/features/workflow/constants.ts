export const CONTEXT_FILE_NAME = '.ai-context.md';
export const GENERATED_SECTION_START = '<!-- ai-context-orchestrator:generated:start -->';
export const GENERATED_SECTION_END = '<!-- ai-context-orchestrator:generated:end -->';
export const IGNORED_DIRECTORIES = new Set([
	'.git',
	'.hg',
	'.next',
	'.turbo',
	'.venv',
	'dist',
	'node_modules',
	'out',
	'target'
]);
export const DEFAULT_CONTEXT_FILES = [
	'AGENTS.md',
	'CLAUDE.md',
	'Claude.md',
	'claude.md',
	'COPILOT.md',
	'Copilot.md',
	'copilot.md',
	'GEMINI.md',
	'Gemini.md',
	'gemini.md',
	'.github/copilot-instructions.md'
];

export const WORKFLOW_STATE_DIRECTORY = '.ai-orchestrator';
export const WORKFLOW_STAGE_DIRECTORY = '.ai-orchestrator/stages';
export const WORKFLOW_SESSION_FILE = '.ai-orchestrator/session.json';
export const WORKFLOW_BRIEF_FILE = '.ai-orchestrator/brief.md';
export const WORKFLOW_HISTORY_DIRECTORY = '.ai-orchestrator/history';
export const WORKFLOW_HISTORY_INDEX_FILE = '.ai-orchestrator/history/index.json';
export const PROVIDER_STATUS_CACHE_KEY = 'aiContextOrchestrator.providerStatusCache';
export const PROVIDER_ACCOUNT_SECRET_PREFIX = 'provider-account-secret';
export const CLAUDE_DEFAULT_MODELS = [
	'claude-opus-4-6',
	'claude-sonnet-4-6',
	'claude-haiku-4-5-20251001',
	'claude-opus-4-5',
	'claude-sonnet-4-5'
] as const;
export const GEMINI_DEFAULT_MODELS = [
	'gemini-3.1-pro-preview',
	'gemini-3.1-flash-lite-preview',
	'gemini-3-flash-preview',
	'gemini-2.5-pro',
	'gemini-2.5-flash',
	'gemini-2.5-flash-lite'
] as const;

export const WORKFLOW_CONTROL_VIEW_ID = 'aiContextOrchestrator.workflowControl';

export const LAST_WORKFLOW_CONFIG_KEY = 'aiContextOrchestrator.lastWorkflowConfig';
