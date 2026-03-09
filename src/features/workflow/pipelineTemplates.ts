import type { PipelineTemplateId, PipelineTemplateDefinition } from './types.js';

export const PIPELINE_TEMPLATES: Record<PipelineTemplateId, PipelineTemplateDefinition> = {
	'add-feature': {
		id: 'add-feature',
		label: 'Add Feature',
		description: 'Explore the codebase, plan the feature, then build it.',
		steps: ['explore', 'plan', 'build'],
		gitBranchPrefix: 'feat/'
	},
	'bug-fix': {
		id: 'bug-fix',
		label: 'Bug Fix',
		description: 'Explore the issue, debug the root cause, then verify with tests.',
		steps: ['explore', 'debug', 'test'],
		gitBranchPrefix: 'fix/'
	},
	'code-review': {
		id: 'code-review',
		label: 'Code Review',
		description: 'Review the code quality and verify test coverage.',
		steps: ['review', 'test'],
		skipGit: true
	},
	'refactor': {
		id: 'refactor',
		label: 'Refactor',
		description: 'Explore, plan, build, then review the refactored result.',
		steps: ['explore', 'plan', 'build', 'review'],
		gitBranchPrefix: 'refactor/'
	}
};
