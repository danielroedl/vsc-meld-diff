import * as vscode from 'vscode';

import { window, commands } from 'vscode';
import { existsSync, open } from 'fs';

const cp = require('child_process')
let fillListDone = false

export function showMeld(files: String[]) {
	cp.exec('meld ' + files.filter(v => existsSync(v.toString())).slice(0,3).join(" "), (error: Error, stdout: string, stderr: string) => {
		if (error) {
			if (error.message.match(/meld: not found/)) {
				window.showErrorMessage("Meld Diff Error: Meld is not installed!");
			} else {
				window.showErrorMessage("Meld Diff Error: Error running meld! StdErr: " + stderr);
			}
		}
	});
}

export function showListAndDiff(current: String, possible_diffs: String[]) {
	// remove current editor
	let possible = possible_diffs.filter(function(value, index, arr) {
		return value != current;
	});

	let a = Array();
	possible.forEach(_ => {
		a.push(_);
	});

	window.showQuickPick(a, {
		placeHolder: 'Filename to diff'
	}).then(result => {
		if (existsSync(result)) {
			showMeld([current, result]);
		}
	});
}

// workaround because there is no function to get all open editors from API
export function doIt(current: String, possible_diffs: String[]) {
	if (fillListDone) {
		showListAndDiff(current, possible_diffs);
	} else {
		if (window.activeTextEditor) {
			possible_diffs.push(window.activeTextEditor.document.fileName);
		}
		commands.executeCommand("workbench.action.nextEditor").then(_ => {
			if (window.activeTextEditor) {
				if (window.activeTextEditor.document.fileName != current) {
					doIt(current, possible_diffs);
				} else {
					fillListDone = true;
					showListAndDiff(current, possible_diffs);
				}
			} else {
				// the window is not a text editor, skip it
				doIt(current, possible_diffs);
			}
		});
	}
}

export function activate(context: vscode.ExtensionContext) {
	let open_files_event = Array();

	vscode.workspace.onDidOpenTextDocument(event => {
		// add file to array on opening
		if (fillListDone && open_files_event.indexOf(event.fileName) === -1) {
			if (existsSync(event.fileName)) {
				open_files_event.push(event.fileName);
			}
		}
	});

	vscode.workspace.onDidCloseTextDocument(event => {
		//remove file from list on closing
		let index = open_files_event.indexOf(event.fileName)
		if (fillListDone && index !== -1) {
			open_files_event.splice(index, 1);
		}
	});

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffVisible', () => {
		let open_files: String[] = [];
		window.visibleTextEditors.forEach(editor => {
			open_files.push(editor.document.fileName.toString());
		});

		if (open_files.length < 2) {
			window.showErrorMessage("Meld Diff:\nCan't diff: Only one file is visible in editor!")
			return;
		}

		showMeld(open_files);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffCurrentToOtherOpen', () => {
		let open_files: String[] = [];

		if (!window.activeTextEditor) {
			window.showErrorMessage("Meld Diff:\nCurrent window is not a file!")
			return;
		}

		// add active file
		open_files.push(window.activeTextEditor.document.fileName);

		// let possible_diffs= Array();
		let current = window.activeTextEditor.document.fileName;

		doIt(current, open_files_event);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffCurrentToOther', () => {
		if (!window.activeTextEditor) {
			window.showErrorMessage("Meld Diff:\nNo file selected for diff!")
			return;
		}

		let current = window.activeTextEditor.document.fileName;

		const options: vscode.OpenDialogOptions = {
			canSelectMany: false,
			openLabel: 'Diff'
	   	};

		window.showOpenDialog(options).then(_ => {
			cp.exec('meld ' + current + " " + _);
		});

	}));

	let selected:String = "";

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffFromFileListSelect', (_) => {
		if (! _) {
			if (window.activeTextEditor) {
				selected = window.activeTextEditor.document.fileName;
			} else {
				return;
			}
		} else {
			selected = _.path;
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffFromFileList', (_) => {
		let path = "";
		if (! _) {
			if (window.activeTextEditor) {
				path = window.activeTextEditor.document.fileName;
			} else {
				return;
			}
		} else {
			path = _.path;
		}
		if (selected.length > 0) {
			showMeld([selected, path]);
		} else {
			window.showErrorMessage("Meld Diff: First select a file to compare to!")
		}
	}));
}

export function deactivate() {}
