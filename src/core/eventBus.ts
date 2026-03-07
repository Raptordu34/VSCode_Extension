import * as vscode from 'vscode';

export class EventBus {
	private static emitter = new vscode.EventEmitter<string>();
	
	public static readonly onDidChange = this.emitter.event;
	
	public static fire(event: string) {
		this.emitter.fire(event);
	}
}
