export interface PackageDetails {
	summary: string;
	scripts: string[];
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
}

export interface AdditionalContextResult {
	sections: string[];
	foundPaths: string[];
}
