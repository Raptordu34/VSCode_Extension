import type {
	DocumentWorkflowIntentDefinition,
	DocumentWorkflowIntentId,
	WorkflowPreset,
	WorkflowPresetDefinition
} from './types.js';
import type { WorkspaceMode } from '../workspace/types.js';
import type { LearningDocumentType } from '../documents/types.js';

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

export interface WorkflowIntentCopy {
	label: string;
	description: string;
	detail: string;
	launchInstruction: string;
	briefPrompt: string;
	briefPlaceholder: string;
}

const DOCUMENT_WORKFLOW_INTENTS: Record<DocumentWorkflowIntentId, DocumentWorkflowIntentDefinition> = {
	'compte-rendu-plan': {
		id: 'compte-rendu-plan',
		preset: 'plan',
		label: 'Plan du compte-rendu',
		description: 'Structurer les sections et priorités du document de cours',
		detail: 'Définit un plan exploitable pour le compte-rendu avant la phase de rédaction.',
		launchInstruction: 'Build a concrete plan for the selected compte-rendu: define the sections, ordering, source coverage, and transitions needed before drafting content.',
		briefPrompt: 'Quel plan ou quelle structure faut-il préparer pour ce compte-rendu ?',
		briefPlaceholder: 'Exemple: Structurer le compte-rendu avec introduction, notions clés, démonstrations, exemples et synthèse finale'
	},
	'compte-rendu-source-exploitation': {
		id: 'compte-rendu-source-exploitation',
		preset: 'build',
		label: 'Exploitation des sources',
		description: 'Lire les sources et les intégrer proprement dans le compte-rendu',
		detail: 'Le provider doit lire les fichiers importés, reformuler, compléter et intégrer le contenu dans le document cible.',
		launchInstruction: 'Read the imported sources for the selected compte-rendu, extract the useful material, reformulate it when needed, and integrate it cleanly into the existing document structure.',
		briefPrompt: 'Quelles sources ou quelles parties du cours faut-il exploiter dans ce compte-rendu ?',
		briefPlaceholder: 'Exemple: Intégrer les PDF importés sur les réseaux bayésiens dans les sections définition, intuition et exemple'
	},
	'compte-rendu-note-integration': {
		id: 'compte-rendu-note-integration',
		preset: 'build',
		label: 'Conversion de notes',
		description: 'Transformer des notes brutes en contenu structuré dans le compte-rendu',
		detail: 'Le provider part des notes ou mots-clés donnés par l’utilisateur et les convertit en contenu clair, cohérent et complété.',
		launchInstruction: 'Treat the brief as raw class notes or keywords, infer the intended meaning, and integrate them into the selected compte-rendu as polished, coherent course content.',
		briefPrompt: 'Quelles notes, mots-clés ou éléments bruts faut-il intégrer dans le compte-rendu ?',
		briefPlaceholder: 'Exemple: Notes de cours sur la loi a priori, le théorème de Bayes et un exemple médical à intégrer dans le compte-rendu'
	},
	'compte-rendu-review': {
		id: 'compte-rendu-review',
		preset: 'review',
		label: 'Relecture / amélioration',
		description: 'Clarifier, homogénéiser et améliorer le compte-rendu',
		detail: 'Relit le document comme support d’apprentissage et améliore clarté, cohérence et qualité rédactionnelle.',
		launchInstruction: 'Review the selected compte-rendu for clarity, pedagogy, consistency, and completeness, then improve weak sections without breaking the template structure.',
		briefPrompt: 'Quelle partie du compte-rendu faut-il relire ou améliorer ?',
		briefPlaceholder: 'Exemple: Revoir la section sur l’inférence pour la rendre plus claire et mieux reliée aux exemples'
	}
};

function buildDefaultWorkflowIntentCopy(preset: WorkflowPreset): WorkflowIntentCopy {
	const definition = WORKFLOW_PRESETS[preset];
	return {
		label: definition.label,
		description: definition.description,
		detail: definition.detail,
		launchInstruction: definition.launchInstruction,
		briefPrompt: getDefaultBriefPrompt(preset),
		briefPlaceholder: getDefaultBriefPlaceholder(preset)
	};
}

function getDefaultBriefPrompt(preset: WorkflowPreset): string {
	switch (preset) {
		case 'plan':
			return 'What should be planned next? Describe the feature, fix, or change to prepare.';
		case 'build':
			return 'What should be implemented next?';
		case 'debug':
			return 'What bug or failing behavior should be investigated next?';
		case 'review':
			return 'What code or change set should be reviewed next?';
		case 'test':
			return 'What test surface or regression should be covered next?';
		case 'explore':
		default:
			return 'What area of the codebase should be explored?';
	}
}

function getDefaultBriefPlaceholder(preset: WorkflowPreset): string {
	switch (preset) {
		case 'plan':
			return 'Example: Plan a save/load flow for custom obstacles without changing the rendering pipeline';
		case 'build':
			return 'Example: Implement a save/load system for custom obstacles with focused verification';
		case 'debug':
			return 'Example: Investigate why the preset selector stops updating the active controls';
		case 'review':
			return 'Example: Review the latest provider launch changes for regressions and missing tests';
		case 'test':
			return 'Example: Add regression coverage for the workflow drawer launch options';
		case 'explore':
		default:
			return 'Example: Explore the workflow launch pipeline and identify extension points';
	}
}

function buildResearchWorkflowIntentCopy(preset: WorkflowPreset): WorkflowIntentCopy {
	switch (preset) {
		case 'explore':
			return {
				label: 'Explorer le sujet',
				description: 'Cartographier les sources, concepts et angles utiles',
				detail: 'Prépare une exploration documentaire avant toute rédaction afin d’identifier notions, arguments et lacunes.',
				launchInstruction: 'Start by reviewing the available sources, identify the main concepts, arguments, and gaps, and summarize the subject structure before drafting anything.',
				briefPrompt: 'Quel sujet, corpus ou angle de recherche doit être exploré ?',
				briefPlaceholder: 'Exemple: Explorer les sources disponibles sur les réseaux bayésiens et extraire les notions clés'
			};
		case 'plan':
			return {
				label: 'Structurer le livrable',
				description: 'Définir un plan solide pour le document cible',
				detail: 'Organise les sections, priorités et sources à mobiliser avant la phase de rédaction.',
				launchInstruction: 'Investigate the sources, propose a structure for the target learning document, and identify the sections, arguments, and evidence to prioritize before drafting.',
				briefPrompt: 'Quel livrable ou quelle structure documentaire faut-il préparer ?',
				briefPlaceholder: 'Exemple: Structurer une synthèse d’article avec méthodologie, résultats et limites'
			};
		case 'build':
			return {
				label: 'Rédiger le livrable',
				description: 'Produire ou enrichir le document à partir des sources',
				detail: 'Lance une rédaction documentaire guidée par le template learning-kit et le document sélectionné.',
				launchInstruction: 'Use the selected learning document, its prompt, and imported sources to draft or extend the target deliverable end-to-end.',
				briefPrompt: 'Quel contenu faut-il rédiger ou enrichir maintenant ?',
				briefPlaceholder: 'Exemple: Rédiger les sections contexte, méthode et résultats du document sélectionné'
			};
		case 'debug':
			return {
				label: 'Corriger le document',
				description: 'Traiter un blocage de structure, de clarté ou de cohérence',
				detail: 'Isole les parties fragiles du document et corrige les incohérences sans casser la structure.',
				launchInstruction: 'Investigate inconsistencies, missing links, or unclear passages in the selected learning document, fix them, and preserve the intended structure.',
				briefPrompt: 'Quel problème documentaire ou éditorial faut-il corriger ?',
				briefPlaceholder: 'Exemple: Corriger les répétitions et les transitions faibles entre deux sections du document'
			};
		case 'review':
			return {
				label: 'Relire de façon critique',
				description: 'Évaluer la qualité, la rigueur et la couverture des sources',
				detail: 'Fait une relecture critique avant publication ou partage du livrable.',
				launchInstruction: 'Review the selected learning document for clarity, structure, accuracy, and evidence coverage. Report findings before making edits.',
				briefPrompt: 'Quel document ou quelles sections doivent être relus de façon critique ?',
				briefPlaceholder: 'Exemple: Relire le document pour détecter les zones floues, les sauts logiques et les manques de sources'
			};
		case 'test':
		default:
			return {
				label: 'Vérifier la solidité',
				description: 'Contrôler l’alignement avec les objectifs et les sources',
				detail: 'Vérifie que le document couvre bien les attentes, exemples, preuves ou cas d’usage attendus.',
				launchInstruction: 'Check the selected learning document against the expected goals, examples, and source coverage, and add focused validation artifacts only when they help.',
				briefPrompt: 'Quel aspect du document faut-il vérifier ou valider ?',
				briefPlaceholder: 'Exemple: Vérifier que chaque section importante est couverte par des sources explicites'
			};
	}
}

function buildStudyWorkflowIntentCopy(preset: WorkflowPreset): WorkflowIntentCopy {
	switch (preset) {
		case 'explore':
			return {
				label: 'Comprendre le cours',
				description: 'Identifier les notions, définitions et exemples à retenir',
				detail: 'Prépare une lecture structurée du sujet avant de produire une fiche ou une synthèse.',
				launchInstruction: 'Start by reviewing the available material, identify the key notions, definitions, and examples, and summarize what matters before drafting study content.',
				briefPrompt: 'Quel cours, chapitre ou sujet faut-il comprendre en premier ?',
				briefPlaceholder: 'Exemple: Comprendre les notions essentielles et exemples autour des réseaux bayésiens'
			};
		case 'plan':
			return {
				label: 'Organiser la fiche',
				description: 'Définir le plan pédagogique du support',
				detail: 'Découpe le sujet en sections claires pour une fiche, une présentation ou un support de révision.',
				launchInstruction: 'Investigate the course material, propose a pedagogical structure for the target learning document, and prioritize the concepts, examples, and exercises before drafting.',
				briefPrompt: 'Quel support pédagogique faut-il structurer ?',
				briefPlaceholder: 'Exemple: Organiser une fiche de révision avec définitions, intuition, exemples et pièges'
			};
		case 'build':
			return {
				label: 'Rédiger le support',
				description: 'Produire le document pédagogique ciblé',
				detail: 'Rédige ou complète le support en restant fidèle au template learning-kit choisi.',
				launchInstruction: 'Use the selected learning document, its prompt, and imported sources to draft or extend the pedagogical support end-to-end.',
				briefPrompt: 'Quel support faut-il rédiger ou compléter ?',
				briefPlaceholder: 'Exemple: Rédiger les sections notion, intuition et exemple guidé du document actif'
			};
		case 'debug':
			return {
				label: 'Clarifier / corriger',
				description: 'Réparer une explication floue ou une structure bancale',
				detail: 'Corrige les passages ambigus, trop denses ou mal reliés sans casser la pédagogie.',
				launchInstruction: 'Investigate unclear explanations, structural issues, or inconsistencies in the selected learning document, fix them, and preserve pedagogical clarity.',
				briefPrompt: 'Quelle explication ou quelle partie du support faut-il corriger ?',
				briefPlaceholder: 'Exemple: Clarifier une explication trop dense et corriger les transitions entre sections'
			};
		case 'review':
			return {
				label: 'Relire pour apprendre',
				description: 'Évaluer lisibilité, progressivité et utilité pédagogique',
				detail: 'Passe le document au crible pour voir s’il aide réellement à comprendre et mémoriser.',
				launchInstruction: 'Review the selected learning document for clarity, pedagogy, structure, and usefulness for revision. Report findings before making edits.',
				briefPrompt: 'Quel support faut-il relire pour améliorer l’apprentissage ?',
				briefPlaceholder: 'Exemple: Relire la fiche pour vérifier qu’elle est claire, progressive et mémorisable'
			};
		case 'test':
		default:
			return {
				label: 'S’entraîner / vérifier',
				description: 'Contrôler compréhension, exercices et points de vigilance',
				detail: 'Vérifie la couverture des exemples, exercices, pièges et objectifs d’apprentissage.',
				launchInstruction: 'Check the selected learning document against the expected learning goals, examples, and exercises, and add focused validation content only when it helps.',
				briefPrompt: 'Quel point de compréhension ou quel exercice faut-il vérifier ?',
				briefPlaceholder: 'Exemple: Vérifier que la fiche couvre bien les exercices types et les erreurs fréquentes'
			};
	}
}

export function getWorkflowIntentCopy(preset: WorkflowPreset, workspaceMode?: WorkspaceMode): WorkflowIntentCopy {
	if (workspaceMode === 'research') {
		return buildResearchWorkflowIntentCopy(preset);
	}

	if (workspaceMode === 'study' || workspaceMode === 'blank') {
		return buildStudyWorkflowIntentCopy(preset);
	}

	return buildDefaultWorkflowIntentCopy(preset);
}

export function getDocumentWorkflowIntent(documentIntentId: DocumentWorkflowIntentId | undefined): DocumentWorkflowIntentDefinition | undefined {
	if (!documentIntentId) {
		return undefined;
	}

	return DOCUMENT_WORKFLOW_INTENTS[documentIntentId];
}

export function getDocumentWorkflowIntents(documentType: LearningDocumentType | undefined): DocumentWorkflowIntentDefinition[] {
	if (documentType !== 'compte-rendu') {
		return [];
	}

	return [
		DOCUMENT_WORKFLOW_INTENTS['compte-rendu-plan'],
		DOCUMENT_WORKFLOW_INTENTS['compte-rendu-source-exploitation'],
		DOCUMENT_WORKFLOW_INTENTS['compte-rendu-note-integration'],
		DOCUMENT_WORKFLOW_INTENTS['compte-rendu-review']
	];
}

export function getEffectiveWorkflowIntentCopy(
	preset: WorkflowPreset,
	workspaceMode?: WorkspaceMode,
	documentIntentId?: DocumentWorkflowIntentId
): WorkflowIntentCopy {
	const documentIntent = getDocumentWorkflowIntent(documentIntentId);
	if (documentIntent) {
		return {
			label: documentIntent.label,
			description: documentIntent.description,
			detail: documentIntent.detail,
			launchInstruction: documentIntent.launchInstruction,
			briefPrompt: documentIntent.briefPrompt,
			briefPlaceholder: documentIntent.briefPlaceholder
		};
	}

	return getWorkflowIntentCopy(preset, workspaceMode);
}
