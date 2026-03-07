export class UiRefreshDebouncer {
	private debounceHandle: ReturnType<typeof setTimeout> | undefined;
	private readonly pendingReasons = new Set<string>();

	constructor(private readonly debounceMs = 250) {}

	enqueue(reason: string, callback: () => void | Promise<void>): void {
		this.pendingReasons.add(reason);
		if (this.debounceHandle) {
			clearTimeout(this.debounceHandle);
		}

		this.debounceHandle = setTimeout(() => {
			this.pendingReasons.clear();
			void callback();
			this.debounceHandle = undefined;
		}, this.debounceMs);
	}

	dispose(): void {
		if (this.debounceHandle) {
			clearTimeout(this.debounceHandle);
			this.debounceHandle = undefined;
		}
		this.pendingReasons.clear();
	}
}