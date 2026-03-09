import * as vscode from 'vscode';

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/[\s-]+/g, '-')
		.replace(/^-|-$/g, '');
}

function isValidSlug(slug: string): boolean {
	return /^[a-z0-9][a-z0-9-]{0,38}$/.test(slug);
}

async function generateSlugWithAI(briefText: string): Promise<string | undefined> {
	try {
		const models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
		if (!models || models.length === 0) {
			return undefined;
		}

		const model = models[0];
		const messages = [
			vscode.LanguageModelChatMessage.User(
				`Generate a short git branch name slug (max 40 chars, lowercase letters, digits and hyphens only, no leading/trailing hyphens) for this task: "${briefText}". Respond with ONLY the slug, nothing else.`
			)
		];

		const response = await model.sendRequest(messages, {});
		let result = '';
		for await (const chunk of response.text) {
			result += chunk;
		}

		const slug = result.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
		return isValidSlug(slug) ? slug : undefined;
	} catch {
		return undefined;
	}
}

export async function generateBranchName(prefix: string, briefText: string): Promise<string> {
	const aiSlug = await generateSlugWithAI(briefText);
	if (aiSlug) {
		return prefix + aiSlug;
	}

	const fallbackSlug = slugify(briefText).slice(0, 40);
	const slug = isValidSlug(fallbackSlug) ? fallbackSlug : 'task-' + Date.now();
	return prefix + slug;
}
