import * as vscode from "vscode";
import type { ArtifactPlan, WorkflowExecutionPlan, ContextMetadata, GeneratedArtifact, ProviderTarget, WorkflowRole, WorkflowPreset, CostProfile, ProjectContext } from "../workflow/types.js";
import { GENERATED_SECTION_START, GENERATED_SECTION_END } from "../workflow/constants.js";
import { formatListForMarkdown, capitalize } from "../../utils/index.js";
import { CONTEXT_FILE_NAME, WORKFLOW_SESSION_FILE, WORKFLOW_BRIEF_FILE } from "../workflow/constants.js";
import { serializeList } from "../../utils/index.js";
import { getProviderLabel, formatProviderModel } from "../providers/providerService.js";
import { getProviderCapabilities } from "../providers/providerCatalog.js";
import { getLearningDocumentTypeLabel } from "../documents/service.js";
import { getWorkflowIntentCopy } from "../workflow/presets.js";
import { formatWorkflowRoles } from "../workflow/ui.js";
import { buildClaudeLaunchCommand, buildGeminiLaunchCommand } from "./agentLauncher.js";

export function buildArtifactPlan(workspaceUri: vscode.Uri, workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): ArtifactPlan {
	const files: GeneratedArtifact[] = [];
	void workspaceUri;
	files.push(buildInstructionArtifact(workflowPlan, metadata));
	for (const role of workflowPlan.roles) {
		files.push(buildAgentArtifact(workflowPlan, metadata, role));
	}
	files.push(buildSkillArtifact(workflowPlan, metadata));

	return {
		provider: workflowPlan.provider,
		files
	};
}
export function buildInstructionArtifact(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): GeneratedArtifact {
	const relativePath = getInstructionArtifactPath(workflowPlan.provider);
	const content = buildInstructionArtifactContent(workflowPlan, metadata);
	return {
		relativePath,
		kind: 'instruction',
		content
	};
}
export function getInstructionArtifactPath(provider: ProviderTarget): string {
	return getProviderCapabilities(provider).instructionArtifactPath;
}
export function buildInstructionArtifactContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): string {
	switch (workflowPlan.provider) {
		case 'claude':
			return buildClaudeInstructionArtifactContent(workflowPlan, metadata);
		case 'gemini':
			return buildGeminiInstructionArtifactContent(workflowPlan, metadata);
		case 'copilot':
		default:
			return buildCopilotInstructionArtifactContent(workflowPlan, metadata);
	}
}
function getPresetExecutionProfile(preset: WorkflowPreset): {
	priorities: string[];
	completion: string[];
	avoid: string[];
} {
	switch (preset) {
		case 'explore':
			return {
				priorities: [
					'Map the relevant code paths, extension points, and reusable patterns before proposing changes.',
					'Keep the output descriptive and grounded in files instead of speculative solutioning.'
				],
				completion: [
					'Stop once the user has a clear map of the relevant surface and the likely next action.',
					'Do not edit code unless a later instruction explicitly converts exploration into implementation.'
				],
				avoid: [
					'Do not drift into implementation detail that the exploration evidence does not justify.',
					'Do not broaden the scan beyond the user-relevant area of the repository.'
				]
			};
		case 'plan':
			return {
				priorities: [
					'Turn the gathered context into a constrained implementation plan with explicit checkpoints.',
					'Prefer reuse and low-complexity changes over fresh abstractions.'
				],
				completion: [
					'Stop once the plan is concrete enough to implement without design guesswork.',
					'Keep code changes out of scope unless the user explicitly requests implementation.'
				],
				avoid: [
					'Do not present multiple equivalent plans when one clear recommendation is defensible.',
					'Do not hide tradeoffs or prerequisites.'
				]
			};
		case 'build':
			return {
				priorities: [
					'Validate the plan quickly, then move toward a minimal end-to-end implementation milestone.',
					'Keep verification focused and explicit before stopping.'
				],
				completion: [
					'Stop once the requested path is implemented and verified with the smallest relevant checks.',
					'Call out any remaining risks or intentionally deferred work.'
				],
				avoid: [
					'Do not expand scope into unrelated cleanup or architecture changes.',
					'Do not stop at partial implementation when a narrow end-to-end slice is achievable.'
				]
			};
		case 'debug':
			return {
				priorities: [
					'Reproduce or tightly characterize the failing behavior before editing code.',
					'Identify the root cause and apply the smallest valid fix.'
				],
				completion: [
					'Stop once the root cause is explicit and the fix is verified by the smallest relevant checks.',
					'Distinguish confirmed causes from remaining hypotheses.'
				],
				avoid: [
					'Do not patch symptoms without explaining the underlying cause.',
					'Do not run broad verification when a narrow reproduction or focused test is enough.'
				]
			};
		case 'review':
			return {
				priorities: [
					'Lead with correctness, regression risk, and missing verification.',
					'Keep findings concrete, severity-ordered, and backed by repository evidence.'
				],
				completion: [
					'Stop once findings, open questions, and verification gaps are explicit.',
					'Keep any summary or suggested edits secondary to the findings.'
				],
				avoid: [
					'Do not rewrite code by default during review.',
					'Do not dilute real risks with low-signal style commentary.'
				]
			};
		case 'test':
			return {
				priorities: [
					'Select the smallest test surface that proves or disproves the change.',
					'Only adjust implementation when a failing test or testability issue requires it.'
				],
				completion: [
					'Stop once the focused checks have passed or failed with clear evidence.',
					'Call out coverage gaps that still matter for regression confidence.'
				],
				avoid: [
					'Do not default to broad suite runs when a focused check is sufficient.',
					'Do not add coverage that does not reduce a real regression risk.'
				]
			};
	}
}

function formatPresetProfileSections(preset: WorkflowPreset, headings: {
	priorities: string;
	completion: string;
	avoid: string;
}): string[] {
	const profile = getPresetExecutionProfile(preset);
	return [
		headings.priorities,
		...profile.priorities.map((entry) => `- ${entry}`),
		'',
		headings.completion,
		...profile.completion.map((entry) => `- ${entry}`),
		'',
		headings.avoid,
		...profile.avoid.map((entry) => `- ${entry}`)
	];
}

function buildInstructionMetadataLines(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): string[] {
	return [
		`- Workflow preset: ${workflowPlan.preset}`,
		`- Roles prepared: ${workflowPlan.roles.join(', ')}`,
		`- Refresh mode: ${workflowPlan.refreshMode}`,
		`- Cost profile: ${workflowPlan.costProfile}`,
		`- Context file: ${CONTEXT_FILE_NAME}`,
		metadata.contextBudgetProfile ? `- Context budget profile: ${metadata.contextBudgetProfile}` : undefined,
		metadata.contextBudgetSummary ? `- Context budget summary: ${metadata.contextBudgetSummary}` : undefined
	].filter((value): value is string => value !== undefined);
}

function buildClaudeInstructionArtifactContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): string {
	const intentCopy = getWorkflowIntentCopy(workflowPlan.preset, workflowPlan.workspaceMode);
	return [
		'## AI Context Orchestrator',
		'',
		...buildInstructionMetadataLines(workflowPlan, metadata),
		'',
		'<workflow>',
		intentCopy.launchInstruction,
		...getPresetExecutionProfile(workflowPlan.preset).priorities,
		'</workflow>',
		'',
		'<context>',
		'Read the generated context pack first and treat it as the primary grounded source for this run.',
		'Reuse existing project patterns before inventing new abstractions.',
		'Keep edits minimal and verify with the smallest relevant checks.',
		metadata.contextBudgetSummary ? `Context budget for this run: ${metadata.contextBudgetSummary}.` : undefined,
		'</context>',
		'',
		'<when_to_delegate>',
		'Use subagents when work can run in parallel, when isolated context helps, or when a role can return a compact summary.',
		'Avoid delegating simple sequential work, single-file edits, or tasks where maintaining shared context is more valuable than isolation.',
		'</when_to_delegate>',
		'',
		'### Preset priorities',
		...formatPresetProfileSections(workflowPlan.preset, {
			priorities: 'Focus now:',
			completion: 'Stop when:',
			avoid: 'Avoid:'
		}),
		'',
		'### Key files',
		...formatListForMarkdown(metadata.keyFiles, 'No key files detected.'),
		'',
		'### Useful commands',
		...formatListForMarkdown(metadata.commands, 'No package scripts detected.'),
		'',
		'### Instruction files already present',
		...formatListForMarkdown(metadata.instructionFiles, 'No provider-specific instruction files were detected during generation.')
	].filter((value): value is string => value !== undefined).join('\n');
}

function buildGeminiInstructionArtifactContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): string {
	const intentCopy = getWorkflowIntentCopy(workflowPlan.preset, workflowPlan.workspaceMode);
	return [
		'## AI Context Orchestrator',
		'',
		...buildInstructionMetadataLines(workflowPlan, metadata),
		'',
		'### Context First',
		'Use the generated context pack as the primary source of truth for repository structure, key files, commands, and constraints.',
		metadata.contextBudgetSummary ? `This run uses a bounded context budget: ${metadata.contextBudgetSummary}.` : undefined,
		'Prefer direct, well-structured reasoning with grounded file evidence over speculative expansion.',
		'',
		'### Operating Style',
		'- Keep the workflow explicit instead of blending exploration, planning, implementation, and review together.',
		'- Work in short iterations and reassess after each concrete finding or edit.',
		'- Prefer stable project patterns and minimal edits over flexible abstractions.',
		'',
		'### Task',
		intentCopy.launchInstruction,
		'',
		...formatPresetProfileSections(workflowPlan.preset, {
			priorities: '### Preset Priorities',
			completion: '### Completion Criteria',
			avoid: '### Avoid'
		}),
		'',
		'### Key files',
		...formatListForMarkdown(metadata.keyFiles, 'No key files detected.'),
		'',
		'### Useful commands',
		...formatListForMarkdown(metadata.commands, 'No package scripts detected.'),
		'',
		'### Instruction files already present',
		...formatListForMarkdown(metadata.instructionFiles, 'No provider-specific instruction files were detected during generation.')
	].filter((value): value is string => value !== undefined).join('\n');
}

function buildCopilotInstructionArtifactContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): string {
	const intentCopy = getWorkflowIntentCopy(workflowPlan.preset, workflowPlan.workspaceMode);
	return [
		'## AI Context Orchestrator',
		'',
		...buildInstructionMetadataLines(workflowPlan, metadata),
		'',
		'### Repository-wide rules',
		'- Read the generated context pack before acting when the workflow references it.',
		'- Keep repository-wide instructions short here; move reusable procedures into skills and role-specific behavior into agents.',
		'- Prefer handoffs when another prepared role can complete the next step more precisely.',
		'- Keep edits minimal and verification explicit.',
		'',
		'### Current objective',
		intentCopy.launchInstruction,
		'',
		...formatPresetProfileSections(workflowPlan.preset, {
			priorities: '### Preset priorities',
			completion: '### Done when',
			avoid: '### Avoid'
		}),
		'',
		'### Key files',
		...formatListForMarkdown(metadata.keyFiles, 'No key files detected.'),
		'',
		'### Useful commands',
		...formatListForMarkdown(metadata.commands, 'No package scripts detected.'),
		'',
		'### Instruction files already present',
		...formatListForMarkdown(metadata.instructionFiles, 'No provider-specific instruction files were detected during generation.')
	].join('\n');
}
export function buildAgentArtifact(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata, role: WorkflowRole): GeneratedArtifact {
	switch (workflowPlan.provider) {
		case 'claude':
			return {
				relativePath: `.claude/agents/orchestrator-${role}.md`,
				kind: 'agent',
				content: buildClaudeAgentContent(workflowPlan, metadata, role)
			};
		case 'gemini':
			return {
				relativePath: `.gemini/agents/orchestrator-${role}.md`,
				kind: 'agent',
				content: buildGeminiAgentContent(workflowPlan, metadata, role)
			};
		case 'copilot':
			return {
				relativePath: `.github/agents/orchestrator-${role}.agent.md`,
				kind: 'agent',
				content: buildCopilotAgentContent(workflowPlan, metadata, role)
			};
	}
}
export function buildClaudeAgentContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata, role: WorkflowRole): string {
	const intentCopy = getWorkflowIntentCopy(workflowPlan.preset, workflowPlan.workspaceMode);
	return [
		'---',
		`name: orchestrator-${role}`,
		`description: ${getRoleDescription(role)}`,
		`tools: ${getClaudeToolsForRole(role)}`,
		`model: ${getClaudeModelForRole(role, workflowPlan.costProfile)}`,
		'---',
		'',
		`You are the ${role} role for AI Context Orchestrator.`,
		`Current workflow preset: ${workflowPlan.preset}.`,
		`Workflow objective: ${intentCopy.launchInstruction}`,
		`Context file: ${CONTEXT_FILE_NAME}.`,
		'',
		'Primary responsibilities:',
		...getRoleInstructions(role),
		'',
		'Preset-specific focus:',
		...getPresetSpecificInstructions(workflowPlan.preset, role),
		'',
		'Project signals:',
		...formatListForMarkdown(metadata.keyFiles, 'No key files were detected.'),
		'',
		'Useful commands:',
		...formatListForMarkdown(metadata.commands, 'No package scripts were detected.'),
		'',
		'Execution rules:',
		'- Read the generated context pack before acting.',
		'- Stay inside your role boundary instead of trying to solve the whole workflow.',
		'- Prefer existing project patterns, utilities, and file layouts over invention.',
		'- Verify with the smallest relevant check before stopping when your role edits code or tests.',
		'',
		'Delegation and stop conditions:',
		...getRoleDelegationGuidance(workflowPlan, role),
		'',
		'Output contract:',
		...getRoleOutputContract(role)
	].join('\n');
}
export function buildGeminiAgentContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata, role: WorkflowRole): string {
	const intentCopy = getWorkflowIntentCopy(workflowPlan.preset, workflowPlan.workspaceMode);
	return [
		'---',
		`name: orchestrator-${role}`,
		`description: ${getRoleDescription(role)}`,
		'kind: local',
		'tools:',
		...getGeminiToolsForRole(role).map((tool) => `  - ${tool}`),
		`model: ${getGeminiModelForRole(role, workflowPlan.costProfile)}`,
		'max_turns: 12',
		'---',
		'',
		`You are the ${role} role for AI Context Orchestrator.`,
		`Current workflow preset: ${workflowPlan.preset}.`,
		`Workflow objective: ${intentCopy.launchInstruction}`,
		`Context file: ${CONTEXT_FILE_NAME}.`,
		'',
		'Primary responsibilities:',
		...getRoleInstructions(role),
		'',
		'Preset-specific focus:',
		...getPresetSpecificInstructions(workflowPlan.preset, role),
		'',
		'Useful project files:',
		...formatListForMarkdown(metadata.keyFiles, 'No key files were detected.'),
		'',
		'Useful commands:',
		...formatListForMarkdown(metadata.commands, 'No package scripts were detected.'),
		'',
		'Execution rules:',
		'- Read the generated context pack before acting.',
		'- Use concise steps and re-evaluate after each concrete finding or edit.',
		'- Prefer grounded file evidence over speculative reasoning.',
		'- Escalate only when the current role is blocked by missing context or ownership.',
		'',
		'Delegation and stop conditions:',
		...getRoleDelegationGuidance(workflowPlan, role),
		'',
		'Output contract:',
		...getRoleOutputContract(role)
	].join('\n');
}
export function buildCopilotAgentContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata, role: WorkflowRole): string {
	const intentCopy = getWorkflowIntentCopy(workflowPlan.preset, workflowPlan.workspaceMode);
	const handoffs = getCopilotHandoffsForRole(workflowPlan, role);
	const handoffLines = handoffs.flatMap((handoff) => [
		`  - label: ${handoff.label}`,
		`    agent: ${handoff.agent}`,
		`    prompt: ${handoff.prompt}`,
		`    send: ${handoff.send ? 'true' : 'false'}`
	]);

	return [
		'---',
		`name: Orchestrator ${capitalize(role)}`,
		`description: ${getRoleDescription(role)}`,
		`tools: [${getCopilotToolsForRole(role).map((tool) => `'${tool}'`).join(', ')}]`,
		`user-invocable: ${role === 'implementer' || role === 'reviewer' ? 'true' : 'false'}`,
		'disable-model-invocation: false',
		`agents: [${getCopilotAllowedSubagents(workflowPlan, role).map((agent) => `'${agent}'`).join(', ')}]`,
		...(handoffs.length > 0 ? ['handoffs:', ...handoffLines] : []),
		'---',
		'',
		`You are the ${role} role for AI Context Orchestrator.`,
		`Current workflow preset: ${workflowPlan.preset}.`,
		`Workflow objective: ${intentCopy.launchInstruction}`,
		`Read ${CONTEXT_FILE_NAME} before acting.`,
		'',
		'Primary responsibilities:',
		...getRoleInstructions(role),
		'',
		'Preset-specific focus:',
		...getPresetSpecificInstructions(workflowPlan.preset, role),
		'',
		'Key files to inspect first:',
		...formatListForMarkdown(metadata.keyFiles, 'No key files were detected.'),
		'',
		'Useful commands:',
		...formatListForMarkdown(metadata.commands, 'No package scripts were detected.'),
		'',
		'Execution rules:',
		'- Keep the conversation anchored in the generated context pack and the files you verify directly.',
		'- Use handoffs or subagents when another role can complete the next step more precisely than you can.',
		'- Prefer minimal edits, minimal test scope, and explicit risk reporting.',
		'',
		'Delegation and stop conditions:',
		...getRoleDelegationGuidance(workflowPlan, role),
		'',
		'Output contract:',
		...getRoleOutputContract(role),
		'',
		`Preferred cost policy for this run: ${workflowPlan.costProfile}.`
	].join('\n');
}
export function buildSkillArtifact(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): GeneratedArtifact {
	switch (workflowPlan.provider) {
		case 'claude':
			return {
				relativePath: `.claude/skills/${workflowPlan.presetDefinition.artifactSkillName}/SKILL.md`,
				kind: 'skill',
				content: buildClaudeSkillContent(workflowPlan, metadata)
			};
		case 'gemini':
			return {
				relativePath: `.gemini/skills/${workflowPlan.presetDefinition.artifactSkillName}/SKILL.md`,
				kind: 'skill',
				content: buildGeminiSkillContent(workflowPlan, metadata)
			};
		case 'copilot':
			return {
				relativePath: `.github/skills/${workflowPlan.presetDefinition.artifactSkillName}/SKILL.md`,
				kind: 'skill',
				content: buildCopilotSkillContent(workflowPlan, metadata)
			};
	}
}
export function buildClaudeSkillContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): string {
	const intentCopy = getWorkflowIntentCopy(workflowPlan.preset, workflowPlan.workspaceMode);
	return [
		'---',
		`name: ${workflowPlan.presetDefinition.artifactSkillName}`,
		`description: ${workflowPlan.presetDefinition.description}`,
		'disable-model-invocation: true',
		'context: fork',
		`agent: ${getClaudeSkillAgent(workflowPlan.preset)}`,
		'---',
		'',
		intentCopy.launchInstruction,
		'',
		'When to use this skill:',
		`- Use it when the request matches the ${intentCopy.label.toLowerCase()} workflow.`,
		'- Use the prepared roles instead of improvising a new workflow structure.',
		'',
		'Execution loop:',
		'- Read the generated context pack and relevant instruction files first.',
		'- Pick the smallest number of roles needed for the task.',
		'- Keep each role scoped to its responsibility and stop after a concrete result.',
		'- Verify with focused checks before handing back to the user.',
		'',
		...formatPresetProfileSections(workflowPlan.preset, {
			priorities: 'Preset priorities:',
			completion: 'Completion criteria:',
			avoid: 'Avoid:'
		}),
		'',
		'Use these roles as references:',
		...formatListForMarkdown(workflowPlan.roles.map((role) => `orchestrator-${role}`), 'No roles defined.'),
		'',
		'Workflow signals:',
		...formatListForMarkdown(metadata.keyFiles, 'No key files detected.'),
		'',
		`Read ${CONTEXT_FILE_NAME} before acting.`,
		`Suggested commands: ${serializeList(metadata.commands)}.`
	].join('\n');
}
export function buildGeminiSkillContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): string {
	const intentCopy = getWorkflowIntentCopy(workflowPlan.preset, workflowPlan.workspaceMode);
	return [
		'---',
		`name: ${workflowPlan.presetDefinition.artifactSkillName}`,
		`description: ${workflowPlan.presetDefinition.description}`,
		'---',
		'',
		'# Workflow Skill',
		'',
		intentCopy.launchInstruction,
		'',
		'When to use this skill:',
		`- Use it when the request needs the ${intentCopy.label.toLowerCase()} workflow.`,
		'- Keep the role chain explicit instead of blending exploration, implementation, review, and testing together.',
		'',
		'Execution loop:',
		'- Read the generated context pack and relevant files first.',
		'- Work in short iterations with concrete evidence from files or command output.',
		'- Stop after a role-specific result and hand off if another role is more appropriate.',
		'',
		...formatPresetProfileSections(workflowPlan.preset, {
			priorities: 'Preset priorities:',
			completion: 'Completion criteria:',
			avoid: 'Avoid:'
		}),
		'',
		'Roles prepared for this workflow:',
		...formatListForMarkdown(workflowPlan.roles, 'No roles defined.'),
		'',
		'Workflow signals:',
		...formatListForMarkdown(metadata.keyFiles, 'No key files detected.'),
		'',
		`Read ${CONTEXT_FILE_NAME} first.`,
		`Useful commands: ${serializeList(metadata.commands)}.`
	].join('\n');
}
export function buildCopilotSkillContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): string {
	const intentCopy = getWorkflowIntentCopy(workflowPlan.preset, workflowPlan.workspaceMode);
	return [
		'---',
		`name: ${workflowPlan.presetDefinition.artifactSkillName}`,
		`description: ${workflowPlan.presetDefinition.description}`,
		'---',
		'',
		'# Workflow Skill',
		'',
		intentCopy.launchInstruction,
		'',
		'When to use this skill:',
		`- Use it when the user request maps to the ${intentCopy.label.toLowerCase()} workflow.`,
		'- Keep the work split across the prepared agents and handoffs rather than treating everything as one generic chat.',
		'',
		'Execution loop:',
		'- Read the generated context pack first.',
		'- Route the task to the narrowest valid role.',
		'- Use handoffs when the next step is better owned by another prepared agent.',
		'- End with verification status, open risks, and the next concrete action.',
		'',
		...formatPresetProfileSections(workflowPlan.preset, {
			priorities: 'Preset priorities:',
			completion: 'Completion criteria:',
			avoid: 'Avoid:'
		}),
		'',
		'Workflow roles to invoke or hand off to:',
		...formatListForMarkdown(workflowPlan.roles.map((role) => `Orchestrator ${capitalize(role)}`), 'No roles defined.'),
		'',
		'Workflow signals:',
		...formatListForMarkdown(metadata.keyFiles, 'No key files detected.'),
		'',
		`Read ${CONTEXT_FILE_NAME} first.`,
		`Useful commands: ${serializeList(metadata.commands)}.`
	].join('\n');
}
export function getPresetSpecificInstructions(preset: WorkflowPreset, role: WorkflowRole): string[] {
	switch (preset) {
		case 'explore':
			return role === 'explorer'
				? ['- Map the relevant code paths, dependencies, and extension points without editing code.', '- Surface the fastest path to answer the user request.']
				: ['- Stay lightweight and avoid proposing implementation depth that the exploration does not justify yet.'];
		case 'plan':
			return role === 'architect'
				? ['- Turn the context into a small implementation plan with explicit constraints and checkpoints.', '- Reject unnecessary abstractions before they enter the plan.']
				: ['- Support planning with concrete evidence, not speculative design.'];
		case 'build':
			return role === 'implementer'
				? ['- Translate the validated plan into minimal code changes.', '- Leave the codebase in a verifiable state before stopping.']
				: ['- Keep the build workflow moving toward a concrete implementation milestone.'];
		case 'debug':
			return role === 'debugger'
				? ['- Isolate the root cause before proposing edits.', '- Prefer reproduction evidence, logs, and narrow experiments.']
				: ['- Keep all reasoning tied to the reported symptom and the most plausible root cause.'];
		case 'review':
			return role === 'reviewer'
				? ['- Prioritize correctness, regression risk, and missing verification.', '- Keep findings concrete and severity-driven.']
				: ['- Support review with concise evidence instead of broad rewrites.'];
		case 'test':
			return role === 'tester'
				? ['- Select the smallest test surface that proves or disproves the change.', '- Add or adjust coverage only where it reduces real regression risk.']
				: ['- Support testing with explicit scope, edge cases, and pass-fail criteria.'];
	}

	return [];
}
export function getRoleDelegationGuidance(workflowPlan: WorkflowExecutionPlan, role: WorkflowRole): string[] {
	const availableOtherRoles = workflowPlan.roles.filter((candidateRole) => candidateRole !== role);
	const nextRoleText = availableOtherRoles.length > 0 ? availableOtherRoles.join(', ') : 'none';

	switch (role) {
		case 'explorer':
			return [
				`- Stop once the relevant map is clear enough for downstream roles. Available downstream roles: ${nextRoleText}.`,
				'- Do not implement code unless the workflow explicitly routes that responsibility back to you.'
			];
		case 'architect':
			return [
				`- Stop after the design constraints and implementation path are clear. Available downstream roles: ${nextRoleText}.`,
				'- Hand off once the plan is concrete enough to execute without design guesswork.'
			];
		case 'implementer':
			return [
				`- Stop after the requested code path is implemented and minimally verified. Available downstream roles: ${nextRoleText}.`,
				'- Hand off when review or testing would add more precision than continued coding.'
			];
		case 'reviewer':
			return [
				`- Stop after findings, risks, and verification gaps are explicit. Available downstream roles: ${nextRoleText}.`,
				'- Do not rewrite the implementation unless the workflow specifically requires it.'
			];
		case 'tester':
			return [
				`- Stop after the targeted checks have passed or failed with clear evidence. Available downstream roles: ${nextRoleText}.`,
				'- Escalate back only when a failure reveals a product bug, flaky test, or missing prerequisite.'
			];
		case 'debugger':
			return [
				`- Stop after the root cause and smallest valid fix are identified or applied. Available downstream roles: ${nextRoleText}.`,
				'- Hand off once verification or follow-up implementation becomes the dominant task.'
			];
	}

	return [];
}
export function getRoleOutputContract(role: WorkflowRole): string[] {
	switch (role) {
		case 'explorer':
			return ['- Return a compact map of files, dependencies, and reusable patterns.', '- Call out uncertainties explicitly instead of filling gaps with guesses.'];
		case 'architect':
			return ['- Return a short plan with constraints, tradeoffs, and the recommended approach.', '- Make the expected edit scope and validation path explicit.'];
		case 'implementer':
			return ['- Return the concrete change made, the files touched, and the verification performed.', '- Mention any remaining risk or intentionally deferred work.'];
		case 'reviewer':
			return ['- Return findings first, ordered by severity and backed by concrete evidence.', '- Keep the summary brief and secondary to the findings.'];
		case 'tester':
			return ['- Return the checks performed, their outcomes, and the exact failing surface if any.', '- Call out gaps in coverage or confidence explicitly.'];
		case 'debugger':
			return ['- Return the observed symptom, root cause, and the smallest valid fix.', '- Distinguish confirmed causes from hypotheses that still need validation.'];
	}

	return [];
}
export function getRoleDescription(role: WorkflowRole): string {
	switch (role) {
		case 'explorer':
			return 'Map the codebase, identify key files, dependencies, and reusable patterns before implementation.';
		case 'architect':
			return 'Validate plans and implementations against existing project architecture and reusable patterns.';
		case 'implementer':
			return 'Write or modify code to implement the requested behavior while respecting project conventions.';
		case 'reviewer':
			return 'Review code for correctness, maintainability, consistency, and risk.';
		case 'tester':
			return 'Add, run, and repair tests with a focus on focused verification and regression safety.';
		case 'debugger':
			return 'Investigate symptoms, generate hypotheses, isolate the root cause, and propose or apply the smallest valid fix.';
	}
}
export function getRoleInstructions(role: WorkflowRole): string[] {
	switch (role) {
		case 'explorer':
			return [
				'- Read only what is needed to map the relevant area of the codebase.',
				'- Identify entry points, key dependencies, and reusable utilities.',
				'- Return a concise map with concrete file references.'
			];
		case 'architect':
			return [
				'- Challenge duplication, unnecessary abstractions, and pattern drift.',
				'- Prefer the smallest design that fits the existing codebase.',
				'- Highlight constraints before code is written when possible.'
			];
		case 'implementer':
			return [
				'- Implement the requested change with minimal, focused edits.',
				'- Reuse existing patterns and utilities before introducing new ones.',
				'- Verify with the smallest relevant checks before stopping.'
			];
		case 'reviewer':
			return [
				'- Prioritize bugs, regressions, and missing verification over style nits.',
				'- Report findings clearly with concrete evidence and impact.',
				'- Keep summaries brief after findings.'
			];
		case 'tester':
			return [
				'- Prefer focused tests over broad suite runs when possible.',
				'- Cover edge cases and regression paths that are easy to miss.',
				'- If tests fail, isolate whether the bug is in the code or the test expectation.'
			];
		case 'debugger':
			return [
				'- Start from the symptom and work backward toward the root cause.',
				'- Prefer reproductions, logs, and tight hypotheses over speculative edits.',
				'- Explain the root cause before or alongside the fix.'
			];
	}
}
export function getClaudeToolsForRole(role: WorkflowRole): string {
	switch (role) {
		case 'explorer':
		case 'architect':
		case 'reviewer':
			return 'Read, Grep, Glob';
		case 'tester':
		case 'debugger':
			return 'Read, Grep, Glob, Bash';
		case 'implementer':
		default:
			return 'Read, Grep, Glob, Edit, Bash';
	}
}
export function getClaudeModelForRole(role: WorkflowRole, costProfile: CostProfile): string {
	if (costProfile === 'fast') {
		return role === 'architect' || role === 'reviewer' ? 'sonnet' : 'haiku';
	}

	if (costProfile === 'strong') {
		return role === 'implementer' || role === 'tester' ? 'sonnet' : 'opus';
	}

	return role === 'explorer' || role === 'tester' ? 'haiku' : 'sonnet';
}
export function getGeminiToolsForRole(role: WorkflowRole): string[] {
	switch (role) {
		case 'explorer':
		case 'architect':
		case 'reviewer':
			return ['read_file', 'grep_search'];
		case 'tester':
		case 'debugger':
			return ['read_file', 'grep_search', 'run_shell_command'];
		case 'implementer':
		default:
			return ['read_file', 'grep_search', 'replace', 'run_shell_command'];
	}
}
export function getGeminiModelForRole(role: WorkflowRole, costProfile: CostProfile): string {
	if (costProfile === 'fast') {
		return 'gemini-3-flash-preview';
	}

	if (costProfile === 'strong') {
		return role === 'explorer' || role === 'tester' ? 'gemini-3-flash-preview' : 'gemini-3.1-pro-preview';
	}

	return role === 'architect' || role === 'reviewer' ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';
}
export function getCopilotToolsForRole(role: WorkflowRole): string[] {
	switch (role) {
		case 'explorer':
		case 'architect':
		case 'reviewer':
			return ['read', 'search'];
		case 'tester':
		case 'debugger':
			return ['read', 'search', 'runTests'];
		case 'implementer':
		default:
			return ['agent', 'read', 'search', 'edit', 'runTests'];
	}
}
export function getCopilotAllowedSubagents(workflowPlan: WorkflowExecutionPlan, role: WorkflowRole): string[] {
	if (role === 'implementer') {
		return workflowPlan.roles
			.filter((candidateRole) => candidateRole !== 'implementer')
			.map((candidateRole) => `Orchestrator ${capitalize(candidateRole)}`);
	}

	return [];
}
export function getCopilotHandoffsForRole(
	workflowPlan: WorkflowExecutionPlan,
	role: WorkflowRole
): Array<{ label: string; agent: string; prompt: string; send: boolean }> {
	if (role === 'explorer' && workflowPlan.roles.includes('architect')) {
		return [{
			label: 'Turn Map Into Plan',
			agent: 'orchestrator-architect',
			prompt: 'Use the exploration results and generated context pack to produce a constrained implementation plan.',
			send: false
		}];
	}

	if (role === 'architect' && workflowPlan.roles.includes('implementer')) {
		return [{
			label: 'Start Implementation',
			agent: 'orchestrator-implementer',
			prompt: 'Now implement the validated plan using the generated context pack and provider artifacts.',
			send: false
		}];
	}

	if (role === 'implementer' && workflowPlan.roles.includes('reviewer')) {
		return [{
			label: 'Review Changes',
			agent: 'orchestrator-reviewer',
			prompt: 'Review the current implementation for correctness, consistency, and missing verification.',
			send: false
		}, ...(workflowPlan.roles.includes('tester') ? [{
			label: 'Verify With Tests',
			agent: 'orchestrator-tester',
			prompt: 'Run or extend the smallest relevant tests for the current implementation and report any verification gaps.',
			send: false
		}] : [])];
	}

	if (role === 'reviewer' && workflowPlan.roles.includes('tester')) {
		return [{
			label: 'Validate Reviewed Surface',
			agent: 'orchestrator-tester',
			prompt: 'Validate the reviewed change with the smallest relevant verification and report remaining confidence gaps.',
			send: false
		}];
	}

	if (role === 'debugger' && workflowPlan.roles.includes('tester')) {
		return [{
			label: 'Verify Fix',
			agent: 'orchestrator-tester',
			prompt: 'Run the smallest relevant verification for the identified bug fix and report any gaps.',
			send: false
		}];
	}

	return [];
}
export function getClaudeSkillAgent(preset: WorkflowPreset): string {
	switch (preset) {
		case 'explore':
		case 'plan':
		case 'review':
			return 'Explore';
		default:
			return 'general-purpose';
	}
}
export function replaceManagedBlock(existingContent: string, managedBlock: string): string {
	const startIndex = existingContent.indexOf(GENERATED_SECTION_START);
	const endIndex = existingContent.indexOf(GENERATED_SECTION_END);
	if (startIndex >= 0 && endIndex > startIndex) {
		const prefix = existingContent.slice(0, startIndex).trimEnd();
		const suffix = existingContent.slice(endIndex + GENERATED_SECTION_END.length).trimStart();
		return [prefix, managedBlock.trimEnd(), suffix].filter((part) => part.length > 0).join('\n\n') + '\n';
	}

	if (existingContent.trim().length === 0) {
		return managedBlock;
	}

	return `${existingContent.trimEnd()}\n\n${managedBlock}`;
}
export function buildWorkflowSummary(projectContext: ProjectContext): string {
	const intentCopy = getWorkflowIntentCopy(projectContext.workflowPlan.preset, projectContext.workflowPlan.workspaceMode);
	const parts = [
		`${intentCopy.label} -> ${getProviderLabel(projectContext.workflowPlan.provider)}`,
		`Model: ${formatProviderModel(projectContext.workflowPlan.provider, projectContext.workflowPlan.providerModel)}`,
		projectContext.workflowPlan.provider === 'claude' ? `Claude account: ${projectContext.workflowPlan.claudeAccountId ?? 'default'}` : undefined,
		projectContext.workflowPlan.provider === 'claude' ? `Claude effort: ${projectContext.workflowPlan.claudeEffort ?? 'default'}` : undefined,
		`Preset id: ${projectContext.workflowPlan.preset}`,
		`Roles: ${formatWorkflowRoles(projectContext.workflowPlan.roles)}`,
		`Refresh: ${projectContext.workflowPlan.refreshMode}`,
		`Cost: ${projectContext.workflowPlan.costProfile}`,
		projectContext.reused ? 'Context reused' : 'Context regenerated'
	].filter((value): value is string => Boolean(value));

	if (projectContext.artifactPlan) {
		parts.push(`Artifacts: ${projectContext.artifactPlan.files.length}`);
	}

	return parts.join(' | ');
}
export function buildProviderLaunchPrompt(projectContext: ProjectContext): string {
	const sharedInstruction = buildSharedWorkflowInstruction(projectContext);
	switch (projectContext.workflowPlan.provider) {
		case 'claude':
			return buildClaudeLaunchCommand(projectContext, sharedInstruction);
		case 'gemini':
			return buildGeminiLaunchCommand(projectContext, sharedInstruction);
		case 'copilot':
			return sharedInstruction;
	}
}
export function buildSharedWorkflowInstruction(projectContext: ProjectContext): string {
	switch (projectContext.workflowPlan.provider) {
		case 'claude':
			return buildClaudeWorkflowInstruction(projectContext);
		case 'gemini':
			return buildGeminiWorkflowInstruction(projectContext);
		case 'copilot':
		default:
			return buildCopilotWorkflowInstruction(projectContext);
	}
}

function buildWorkflowInstructionCommonParts(projectContext: ProjectContext): {
	stageFile?: string;
	stageWriteInstruction: string;
	providerAccountInstruction: string;
	providerModelInstruction: string;
	providerEffortInstruction: string;
	artifactInstruction: string;
	budgetInstruction?: string;
	learningDocumentInstructions: string[];
	presetPriorityInstructions: string[];
	presetCompletionInstructions: string[];
	presetAvoidInstructions: string[];
} {
	const stageFile = projectContext.currentStage?.stageFile;
	const stageWriteInstruction = stageFile
		? `Read ${stageFile} and write your findings or results back into that file before stopping.`
		: 'Write your findings into the shared workflow stage file before stopping.';
	const presetProfile = getPresetExecutionProfile(projectContext.workflowPlan.preset);
	const learningDocument = projectContext.activeLearningDocument;
	const learningDocumentInstructions = learningDocument
		? [
			`The primary output target is the learning document "${learningDocument.title}" (${getLearningDocumentTypeLabel(learningDocument.type)}).`,
			`Read ${learningDocument.indexFile}, ${learningDocument.promptFile}, and any imported files under ${learningDocument.sourceDirectory} before proposing or generating content.`,
			'Keep the result aligned with the learning-kit template structure, tone, and sectioning already present in the target document.',
			'When the brief is ambiguous, improve or extend the targeted learning document instead of defaulting to generic code-oriented output.'
		]
		: [];

	return {
		stageFile,
		stageWriteInstruction,
		providerAccountInstruction: projectContext.workflowPlan.providerAccountId
			? `Use the configured ${getProviderLabel(projectContext.workflowPlan.provider)} account ${projectContext.workflowPlan.providerAccountId}.`
			: `Use the active ${getProviderLabel(projectContext.workflowPlan.provider)} account for this workflow.`,
		providerModelInstruction: projectContext.workflowPlan.providerModel
			? `Use provider model ${projectContext.workflowPlan.providerModel}.`
			: 'Use the provider default model.',
		providerEffortInstruction: projectContext.workflowPlan.provider === 'claude' && projectContext.workflowPlan.claudeEffort
			? `Use Claude effort level ${projectContext.workflowPlan.claudeEffort}.`
			: 'Use the default reasoning effort for the selected provider.',
		artifactInstruction: projectContext.artifactPlan
			? `Use the generated ${getProviderLabel(projectContext.workflowPlan.provider)} artifacts when they help.`
			: 'Work directly from the context pack and shared workflow files.',
		budgetInstruction: projectContext.metadata.contextBudgetSummary
			? `This run was generated with a bounded context budget: ${projectContext.metadata.contextBudgetSummary}.`
			: undefined,
		learningDocumentInstructions,
		presetPriorityInstructions: presetProfile.priorities,
		presetCompletionInstructions: presetProfile.completion,
		presetAvoidInstructions: presetProfile.avoid
	};
}

function buildClaudeWorkflowInstruction(projectContext: ProjectContext): string {
	const common = buildWorkflowInstructionCommonParts(projectContext);
	const intentCopy = getWorkflowIntentCopy(projectContext.workflowPlan.preset, projectContext.workflowPlan.workspaceMode);
	return [
		'<workflow>',
		`Use the ${intentCopy.label} workflow for this project.`,
		intentCopy.launchInstruction,
		'</workflow>',
		'',
		'<context>',
		`Start by reading ${CONTEXT_FILE_NAME}.`,
		`Read ${WORKFLOW_SESSION_FILE} if it exists.`,
		`Read ${WORKFLOW_BRIEF_FILE} if it exists.`,
		common.stageFile ? `Read upstream handoffs referenced by ${common.stageFile} before acting.` : 'Read any upstream stage handoffs before acting.',
		...common.learningDocumentInstructions,
		common.budgetInstruction,
		'</context>',
		'',
		'<provider>',
		common.providerAccountInstruction,
		common.providerModelInstruction,
		common.providerEffortInstruction,
		'</provider>',
		'',
		'<execution>',
		...common.presetPriorityInstructions,
		'Use subagents when work can run in parallel, when isolated context helps, or when another role can return a concise summary.',
		'Avoid spawning subagents for simple sequential work, single-file edits, or tasks where direct work is faster and keeps context intact.',
		...common.presetAvoidInstructions,
		common.artifactInstruction,
		common.stageWriteInstruction,
		...common.presetCompletionInstructions,
		'</execution>'
	].filter((value): value is string => value !== undefined).join('\n');
}

function buildGeminiWorkflowInstruction(projectContext: ProjectContext): string {
	const common = buildWorkflowInstructionCommonParts(projectContext);
	const intentCopy = getWorkflowIntentCopy(projectContext.workflowPlan.preset, projectContext.workflowPlan.workspaceMode);
	return [
		'## Context',
		`Start by reading ${CONTEXT_FILE_NAME}.`,
		`Read ${WORKFLOW_SESSION_FILE} if it exists.`,
		`Read ${WORKFLOW_BRIEF_FILE} if it exists.`,
		common.stageFile ? `Read upstream handoffs referenced by ${common.stageFile} before acting.` : 'Read any upstream stage handoffs before acting.',
		...common.learningDocumentInstructions,
		common.budgetInstruction,
		'',
		'## Provider',
		common.providerAccountInstruction,
		common.providerModelInstruction,
		'Prefer concise, direct reasoning grounded in the provided repository context.',
		'',
		'## Constraints',
		'- Keep the workflow explicit instead of blending unrelated stages together.',
		'- Re-evaluate after each concrete finding or edit.',
		'- Prefer grounded file evidence and minimal changes.',
		...common.presetAvoidInstructions.map((entry) => `- ${entry}`),
		common.artifactInstruction,
		'',
		'## Priorities',
		...common.presetPriorityInstructions.map((entry) => `- ${entry}`),
		'',
		'## Task',
		`Use the ${intentCopy.label} workflow for this project.`,
		intentCopy.launchInstruction,
		common.stageWriteInstruction,
		'',
		'## Done When',
		...common.presetCompletionInstructions.map((entry) => `- ${entry}`)
	].filter((value): value is string => value !== undefined).join('\n');
}

function buildCopilotWorkflowInstruction(projectContext: ProjectContext): string {
	const common = buildWorkflowInstructionCommonParts(projectContext);
	const intentCopy = getWorkflowIntentCopy(projectContext.workflowPlan.preset, projectContext.workflowPlan.workspaceMode);
	return [
		`Use the ${intentCopy.label} workflow for this project.`,
		`Start by reading ${CONTEXT_FILE_NAME}.`,
		common.providerAccountInstruction,
		common.providerModelInstruction,
		`Read ${WORKFLOW_SESSION_FILE} if it exists.`,
		`Read ${WORKFLOW_BRIEF_FILE} if it exists.`,
		common.stageFile ? `Read upstream handoffs referenced by ${common.stageFile} before acting.` : 'Read any upstream stage handoffs before acting.',
		...common.learningDocumentInstructions,
		common.budgetInstruction,
		common.artifactInstruction,
		`Preset priorities: ${serializeList(common.presetPriorityInstructions)}.`,
		`Done when: ${serializeList(common.presetCompletionInstructions)}.`,
		`Avoid: ${serializeList(common.presetAvoidInstructions)}.`,
		'Keep repository-wide instructions concise here; rely on prepared skills and agents for detailed procedures.',
		'Prefer handoffs when another prepared role can complete the next step more precisely.',
		intentCopy.launchInstruction,
		common.stageWriteInstruction
	].filter((value): value is string => value !== undefined).join(' ');
}
