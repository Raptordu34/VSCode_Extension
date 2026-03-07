import * as vscode from "vscode";
import type { ArtifactPlan, WorkflowExecutionPlan, ContextMetadata, GeneratedArtifact, ProviderTarget, WorkflowRole, WorkflowPreset, CostProfile, ProjectContext } from "../workflow/types.js";
import { GENERATED_SECTION_START, GENERATED_SECTION_END } from "../workflow/constants.js";
import { formatListForMarkdown, capitalize } from "../../utils/index.js";
import { CONTEXT_FILE_NAME, WORKFLOW_SESSION_FILE, WORKFLOW_BRIEF_FILE } from "../workflow/constants.js";
import { serializeList } from "../../utils/index.js";
import { getProviderLabel, formatProviderModel } from "../providers/providerService.js";
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
	switch (provider) {
		case 'claude':
			return 'CLAUDE.md';
		case 'gemini':
			return 'GEMINI.md';
		case 'copilot':
			return '.github/copilot-instructions.md';
	}
}
export function buildInstructionArtifactContent(workflowPlan: WorkflowExecutionPlan, metadata: ContextMetadata): string {
	return [
		'## AI Context Orchestrator',
		'',
		`- Workflow preset: ${workflowPlan.preset}`,
		`- Roles prepared: ${workflowPlan.roles.join(', ')}`,
		`- Refresh mode: ${workflowPlan.refreshMode}`,
		`- Cost profile: ${workflowPlan.costProfile}`,
		`- Context file: ${CONTEXT_FILE_NAME}`,
		'',
		'### Current objective',
		workflowPlan.presetDefinition.launchInstruction,
		'',
		'### Key files',
		...formatListForMarkdown(metadata.keyFiles, 'No key files detected.'),
		'',
		'### Useful commands',
		...formatListForMarkdown(metadata.commands, 'No package scripts detected.'),
		'',
		'### Instruction files already present',
		...formatListForMarkdown(metadata.instructionFiles, 'No provider-specific instruction files were detected during generation.'),
		'',
		'### Working rules',
		'- Read the generated context pack before acting.',
		'- Reuse existing project patterns before introducing new abstractions.',
		'- Keep edits minimal and verify with the smallest relevant checks.',
		'- Escalate to stronger reasoning only if the current role or model policy is insufficient.'
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
		`Workflow objective: ${workflowPlan.presetDefinition.launchInstruction}`,
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
		`Workflow objective: ${workflowPlan.presetDefinition.launchInstruction}`,
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
		`Workflow objective: ${workflowPlan.presetDefinition.launchInstruction}`,
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
	return [
		'---',
		`name: ${workflowPlan.presetDefinition.artifactSkillName}`,
		`description: ${workflowPlan.presetDefinition.description}`,
		'disable-model-invocation: true',
		'context: fork',
		`agent: ${getClaudeSkillAgent(workflowPlan.preset)}`,
		'---',
		'',
		workflowPlan.presetDefinition.launchInstruction,
		'',
		'When to use this skill:',
		`- Use it when the request matches the ${workflowPlan.presetDefinition.label.toLowerCase()} workflow.`,
		'- Use the prepared roles instead of improvising a new workflow structure.',
		'',
		'Execution loop:',
		'- Read the generated context pack and relevant instruction files first.',
		'- Pick the smallest number of roles needed for the task.',
		'- Keep each role scoped to its responsibility and stop after a concrete result.',
		'- Verify with focused checks before handing back to the user.',
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
	return [
		'---',
		`name: ${workflowPlan.presetDefinition.artifactSkillName}`,
		`description: ${workflowPlan.presetDefinition.description}`,
		'---',
		'',
		'# Workflow Skill',
		'',
		workflowPlan.presetDefinition.launchInstruction,
		'',
		'When to use this skill:',
		`- Use it when the request needs the ${workflowPlan.presetDefinition.label.toLowerCase()} workflow.`,
		'- Keep the role chain explicit instead of blending exploration, implementation, review, and testing together.',
		'',
		'Execution loop:',
		'- Read the generated context pack and relevant files first.',
		'- Work in short iterations with concrete evidence from files or command output.',
		'- Stop after a role-specific result and hand off if another role is more appropriate.',
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
	return [
		'---',
		`name: ${workflowPlan.presetDefinition.artifactSkillName}`,
		`description: ${workflowPlan.presetDefinition.description}`,
		'---',
		'',
		'# Workflow Skill',
		'',
		workflowPlan.presetDefinition.launchInstruction,
		'',
		'When to use this skill:',
		`- Use it when the user request maps to the ${workflowPlan.presetDefinition.label.toLowerCase()} workflow.`,
		'- Keep the work split across the prepared agents and handoffs rather than treating everything as one generic chat.',
		'',
		'Execution loop:',
		'- Read the generated context pack first.',
		'- Route the task to the narrowest valid role.',
		'- Use handoffs when the next step is better owned by another prepared agent.',
		'- End with verification status, open risks, and the next concrete action.',
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
		return 'gemini-2.5-flash';
	}

	if (costProfile === 'strong') {
		return role === 'explorer' || role === 'tester' ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
	}

	return role === 'architect' || role === 'reviewer' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
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
	const parts = [
		`${projectContext.workflowPlan.presetDefinition.label} -> ${getProviderLabel(projectContext.workflowPlan.provider)}`,
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
	const stageFile = projectContext.currentStage?.stageFile;
	const stageWriteInstruction = stageFile
		? `Read ${stageFile} and write your findings or results back into that file before stopping.`
		: 'Write your findings into the shared workflow stage file before stopping.';

	return [
		`Use the ${projectContext.workflowPlan.presetDefinition.label} workflow for this project.`,
		`Start by reading ${CONTEXT_FILE_NAME}.`,
		projectContext.workflowPlan.providerAccountId ? `Use the configured ${getProviderLabel(projectContext.workflowPlan.provider)} account ${projectContext.workflowPlan.providerAccountId}.` : `Use the active ${getProviderLabel(projectContext.workflowPlan.provider)} account for this workflow.`,
		`Read ${WORKFLOW_SESSION_FILE} if it exists.`,
		`Read ${WORKFLOW_BRIEF_FILE} if it exists.`,
		projectContext.workflowPlan.providerModel
			? `Use provider model ${projectContext.workflowPlan.providerModel}.`
			: 'Use the provider default model.',
		projectContext.workflowPlan.provider === 'claude' && projectContext.workflowPlan.claudeEffort
			? `Use Claude effort level ${projectContext.workflowPlan.claudeEffort}.`
			: 'Use the default reasoning effort for the selected provider.',
		stageFile ? `Read upstream handoffs referenced by ${stageFile} before acting.` : 'Read any upstream stage handoffs before acting.',
		projectContext.artifactPlan
			? `Use the generated ${getProviderLabel(projectContext.workflowPlan.provider)} artifacts when they help.`
			: 'Work directly from the context pack and shared workflow files.',
		projectContext.workflowPlan.presetDefinition.launchInstruction,
		stageWriteInstruction
	].join(' ');
}
