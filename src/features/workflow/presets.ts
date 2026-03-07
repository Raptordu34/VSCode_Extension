import type { WorkflowPreset, WorkflowPresetDefinition } from './types.js';

export const WORKFLOW_PRESETS: Record<WorkflowPreset, WorkflowPresetDefinition> = {
	explore: {
		preset: 'explore',
		label: 'Explore',
		description: 'Understand the codebase before changing anything',
		detail: 'Prepare explorer and architect roles to map the repository and find reusable patterns.',
		recommendedProvider: 'copilot',
		roles: ['explorer', 'architect'],
		launchInstruction: 'Start by understanding the codebase, summarize key files, and wait for the next instruction before editing anything.',
		artifactSkillName: 'orchestrator-explore-workflow'
	},
	plan: {
		preset: 'plan',
		label: 'Plan',
		description: 'Produce a concrete implementation plan',
		detail: 'Prepare explorer and architect roles to investigate and then challenge the proposed implementation plan.',
		recommendedProvider: 'copilot',
		roles: ['explorer', 'architect'],
		launchInstruction: 'Investigate the codebase, produce an implementation plan, and highlight reuse opportunities before any code changes.',
		artifactSkillName: 'orchestrator-plan-workflow'
	},
	build: {
		preset: 'build',
		label: 'Build',
		description: 'Implement a feature end-to-end',
		detail: 'Prepare architect, implementer, reviewer, and tester roles for a delivery workflow.',
		recommendedProvider: 'claude',
		roles: ['architect', 'implementer', 'reviewer', 'tester'],
		launchInstruction: 'Validate the plan, implement the feature, review the result, and run focused verification before finishing.',
		artifactSkillName: 'orchestrator-build-workflow'
	},
	debug: {
		preset: 'debug',
		label: 'Debug',
		description: 'Investigate and fix a bug',
		detail: 'Prepare debugger, implementer, and tester roles to isolate root cause and verify the fix.',
		recommendedProvider: 'claude',
		roles: ['debugger', 'implementer', 'tester'],
		launchInstruction: 'Investigate the failing behavior, identify the root cause, apply the fix, and verify it with the smallest relevant checks.',
		artifactSkillName: 'orchestrator-debug-workflow'
	},
	review: {
		preset: 'review',
		label: 'Review',
		description: 'Review code with specialized lenses',
		detail: 'Prepare reviewer and architect roles to inspect correctness, consistency, and risk.',
		recommendedProvider: 'copilot',
		roles: ['reviewer', 'architect'],
		launchInstruction: 'Review the code or changes for correctness, maintainability, reuse, and risk. Report findings before suggesting edits.',
		artifactSkillName: 'orchestrator-review-workflow'
	},
	test: {
		preset: 'test',
		label: 'Test',
		description: 'Add or repair tests',
		detail: 'Prepare tester and implementer roles to write, run, and repair tests efficiently.',
		recommendedProvider: 'gemini',
		roles: ['tester', 'implementer'],
		launchInstruction: 'Focus on testing: add or repair tests, run focused checks, and only change implementation when required by failing tests.',
		artifactSkillName: 'orchestrator-test-workflow'
	}
};
