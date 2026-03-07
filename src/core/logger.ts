import * as vscode from 'vscode';

export class Logger {
	private static channel: vscode.OutputChannel;

	public static initialize(channelName: string) {
		this.channel = vscode.window.createOutputChannel(channelName);
	}

	public static info(message: string) {
		if (!this.channel) {return;}
		this.channel.appendLine(`[info] ${message}`);
	}

	public static warn(message: string) {
		if (!this.channel) {return;}
		this.channel.appendLine(`[warn] ${message}`);
	}

	public static error(message: string) {
		if (!this.channel) {return;}
		this.channel.appendLine(`[error] ${message}`);
	}

	public static debug(message: string) {
		if (!this.channel) {return;}
		this.channel.appendLine(`[debug] ${message}`);
	}

	public static getChannel() {
		return this.channel;
	}
}
