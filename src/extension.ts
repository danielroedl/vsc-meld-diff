import * as vscode from 'vscode';

import { window, commands } from 'vscode';
import { existsSync, writeFile, createReadStream, unlink } from 'fs';
import * as os from 'os';
import { join } from 'path';
import * as streamEqual from 'stream-equal';
import * as cp from 'child_process';

let fillListDone = false;
let tmpFiles: string[] = [];

export function showMeld(files: string[]) {
	const cmd = 'meld "' + files.filter(v => existsSync(v.toString())).slice(0, 3).join('" "') + '"';
	console.log("Run: " + cmd);
	const process = cp.exec(
		cmd,
		(error: cp.ExecException | null, stdout: string, stderr: string) => {
			if (error) {
				if (error.message.match(/meld: not found/)) {
					window.showErrorMessage("Meld Diff Error: Meld is not installed!");
				} else {
					window.showErrorMessage("Meld Diff Error: Error running meld! StdErr: " + stderr);
				}
			}
		});

	process.on('exit', cleanupTmpFiles);
}

export function showListAndDiff(current: string, possible_diffs: string[]) {
	// remove current editor
	const possible = possible_diffs.filter(function (value, index, arr) {
		return value != current;
	});

	const a: any[] | Thenable<any[]> = [];
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
export function doIt(current: string, possible_diffs: string[]) {
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


function rndName() {
	return Math.random().toString(36).substr(2, 10);
}

/**
 * Simple random file creation
 * 
 * @see https://github.com/microsoft/vscode/blob/main/extensions/emmet/src/test/testUtils.ts
 */
export function createRandomFile({ contents = '', prefix = 'tmp' }: { contents?: string; prefix?: string; } = {}): Thenable<vscode.Uri> {
	return new Promise((resolve, reject) => {
		const tmpFile = join(os.tmpdir(), prefix + rndName());
		writeFile(tmpFile, contents, (error) => {
			if (error) {
				return reject(error);
			}

			resolve(vscode.Uri.file(tmpFile));
		});
	});
}

export async function writeFileOnDisk(content: string): Promise<string> {
	const path = (await createRandomFile({ contents: content })).fsPath;
	tmpFiles.push(path);
	return path;
}

export async function areFilesEqual(files: string[]): Promise<boolean> {
	const [path1, path2] = files;
	const readStream1 = createReadStream(path1);
	const readStream2 = createReadStream(path2);

	return await streamEqual(readStream1, readStream2);
}

export function cleanupTmpFiles() {
	tmpFiles.forEach((file) => unlink(file, (err) => {
		if (err) {
			console.log('Unable to delete file: ', file);
		}
	}));
	tmpFiles = [];
}

export function activate(context: vscode.ExtensionContext) {
	const open_files_event: string[] = [];

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
		const index = open_files_event.indexOf(event.fileName);
		if (fillListDone && index !== -1) {
			open_files_event.splice(index, 1);
		}
	});

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffVisible', () => {
		const open_files: string[] = [];
		window.visibleTextEditors.forEach(editor => {
			open_files.push(editor.document.fileName.toString());
		});

		if (open_files.length < 2) {
			window.showErrorMessage("Meld Diff:\nCan't diff: Only one file is visible in editor!");
			return;
		}

		showMeld(open_files);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffCurrentToOtherOpen', () => {
		const open_files: string[] = [];

		if (!window.activeTextEditor) {
			window.showErrorMessage("Meld Diff:\nCurrent window is not a file!");
			return;
		}

		// add active file
		open_files.push(window.activeTextEditor.document.fileName);

		// let possible_diffs= Array();
		const current = window.activeTextEditor.document.fileName;

		doIt(current, open_files_event);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffCurrentToOther', () => {
		if (!window.activeTextEditor) {
			window.showErrorMessage("Meld Diff:\nNo file selected for diff!");
			return;
		}

		const current = window.activeTextEditor.document.fileName;

		const options: vscode.OpenDialogOptions = {
			canSelectMany: false,
			openLabel: 'Diff'
		};

		window.showOpenDialog(options).then(_ => {
			if (_) {
				showMeld([current, _[0].fsPath]);
			}
		});

	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffWithClipboard', async () => {
		const editor = window.activeTextEditor;
		if (!editor) {
			window.showErrorMessage("Meld Diff:\nCurrent window is not a file!");
			return;
		}

		const clipboardContent = await vscode.env.clipboard.readText();
		const clipboard = await writeFileOnDisk(clipboardContent);

		//by default compare clipboard against current file
		let sameContent;
		let current = editor.document.fileName;
		const selection = editor.selection;
		if (!selection.isEmpty) {
			//compare against current selection
			const editorContent = editor.document.getText(selection);
			current = await writeFileOnDisk(editorContent);
			sameContent = await areFilesEqual([current, clipboard]);
		} else if (editor.document.isUntitled) {
			//compare against untitled file
			const editorContent = editor.document.getText();
			current = await writeFileOnDisk(editorContent);
			sameContent = await areFilesEqual([current, clipboard]);
		} else if (editor.document.isDirty) {
			//compore against dirty content but invoke meld with current saved file
			const editorContent = editor.document.getText();
			const tmpCheck = await writeFileOnDisk(editorContent);
			sameContent = await areFilesEqual([tmpCheck, clipboard]);
		} else {
			sameContent = await areFilesEqual([current, clipboard]);
		}

		if (sameContent) {
			window.showInformationMessage('No difference');
			cleanupTmpFiles();
		} else {
			showMeld([current, clipboard]);
		}
	}));

	let selected = "";

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffFromFileListSelect', (_) => {
		if (!_) {
			if (window.activeTextEditor) {
				selected = window.activeTextEditor.document.fileName;
			} else {
				return;
			}
		} else {
			selected = _.fsPath;
		}
		console.log("Select for meld compare: " + selected);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffFromFileList', (_) => {
		let path = "";
		if (!_) {
			if (window.activeTextEditor) {
				path = window.activeTextEditor.document.fileName;
			} else {
				return;
			}
		} else {
			path = _.fsPath;
		}
		if (selected.length > 0) {
			showMeld([selected, path]);
		} else {
			window.showErrorMessage("Meld Diff: First select a file to compare to!");
		}
	}));
}


// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() { }
