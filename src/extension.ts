import * as vscode from 'vscode';

import { window, commands } from 'vscode';
import { existsSync, writeFile, createReadStream, unlink, statSync } from 'fs';
import * as os from 'os';
import { join, basename } from 'path';
import * as streamEqual from 'stream-equal';
import * as cp from 'child_process';

let fillListDone = false;
let filesToRemove: string[] = [];
const filesToRemoveGlobal: string[] = [];

export function addFileToRemove(file: string) {
	filesToRemove.push(file);
	filesToRemoveGlobal.push(file);
}

export function showMeld(files: string[]) {
	const diffTool = vscode.workspace.getConfiguration('meld-diff').diffCommand;
	const diffFiles = files.filter(v => existsSync(v.toString())).slice(0, 3);

	// construct cmd
	let argsConf = "";
	if (diffFiles.length == 2) {
		argsConf = vscode.workspace.getConfiguration('meld-diff').diffArgumentsTwoWay;
	} else if (diffFiles.length == 3) {
		argsConf = vscode.workspace.getConfiguration('meld-diff').diffArgumentsThreeWay;
	} else {
		window.showErrorMessage("Meld Diff Error: Minimum two files are neede to diff!");
		return;
	}
	//replace placeholder in argsConf
	if (diffFiles.length >= 2) {
		argsConf = argsConf.replace("$1", diffFiles[0])
		argsConf = argsConf.replace("$2", diffFiles[1])
	}
	if (diffFiles.length == 3) {
		argsConf = argsConf.replace("$3", diffFiles[2])
	}

	const cmd = diffTool + " " + argsConf;

	console.log("Run: " + cmd);
	return cp.exec(
		cmd,
		(error: cp.ExecException | null, stdout: string, stderr: string) => {
			if (error) {
				if (error.message.match(/meld: not found/)) {
					window.showErrorMessage("Meld Diff Error: Meld is not installed!");
				} else {
					window.showErrorMessage("Meld Diff Error: Error running diff command! StdErr: " + stderr)
				}
			}
		});
}

export function showListAndDiff(current: string, possible_diffs: string[], filesToRemove: string[]) {
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
			const process = showMeld([current, result]);
			if (process && filesToRemove.length > 0) {
				const files = [...filesToRemove];
				process.on('exit', () => cleanupTmpFiles(files));
			}
		}
	});
}

// workaround because there is no function to get all open editors from API
export function doIt(current: string, possible_diffs: string[], filesToRemove: string[]) {
	if (fillListDone) {
		showListAndDiff(current, possible_diffs, filesToRemove);
	} else {
		if (window.activeTextEditor) {
			possible_diffs.push(window.activeTextEditor.document.fileName);
		}
		commands.executeCommand("workbench.action.nextEditor").then(_ => {
			if (window.activeTextEditor) {
				if (window.activeTextEditor.document.fileName != current) {
					doIt(current, possible_diffs, filesToRemove);
				} else {
					fillListDone = true;
					showListAndDiff(current, possible_diffs, filesToRemove);
				}
			} else {
				// the window is not a text editor, skip it
				doIt(current, possible_diffs, filesToRemove);
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

export async function writeTempFileOnDisk(content: string, prefix: string = "tmp_"): Promise<string> {
	return (await createRandomFile({ contents: content, prefix: prefix })).fsPath;
}

export async function areFilesEqual(files: string[]): Promise<boolean> {
	const [path1, path2] = files;
	const readStream1 = createReadStream(path1);
	const readStream2 = createReadStream(path2);

	return await streamEqual(readStream1, readStream2);
}

export function cleanupTmpFiles(files: string[]) {
	files.forEach((file) => unlink(file, (err) => {
		if (err) {
			console.log('Unable to delete file: ', file);
		}
		// remove entry from global list
		const index = filesToRemoveGlobal.indexOf(file);
		if (index > -1) {
			filesToRemoveGlobal.splice(index);
		}
	}));
}

export async function getFileNameOfDocument(document: vscode.TextDocument) {
	if (document.isUntitled) {
		//compare untitled file or changed content of file instead of saved file
		let prefix = "untitled_";
		if (! document.isUntitled) {
			prefix = basename(document.fileName) + "_";
		}
		const documentContent = document.getText();
		const fileName = await writeTempFileOnDisk(documentContent, prefix);
		return { name: fileName, tmp: true };
	} else {
		return { name: document.fileName, tmp: false };
	}
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

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffVisible', async () => {
		let open_files: string[] = [];
		filesToRemove = [];

		for (const editor of window.visibleTextEditors) {
			const fileName = await getFileNameOfDocument(editor.document);
			open_files.push(fileName.name);
			if (fileName.tmp) {
				addFileToRemove(fileName.name);
			}
		}

		if (open_files.length < 2) {
			let fileCount = "Only one file is";
			if (open_files.length == 0) {
				fileCount = "No files are";
			}
			window.showErrorMessage("Can't compare! " + fileCount + " visible in editor!");
			return;
		}

		// sort open files by last modification, newest first
		open_files = open_files.map(function (fileName) {
			return {
			  name: fileName,
			  time: statSync(fileName).mtime.getTime()
			};
		  })
		  .sort(function (a, b) {
			return b.time - a.time; })
		  .map(function (v) {
			return v.name; });

		// TODO add areFilesEqual to every step
		const process = showMeld(open_files);
		if (process && filesToRemove.length > 0) {
			const files = [...filesToRemove];
			process.on('exit', () => cleanupTmpFiles(files));
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffCurrentToOtherOpen', async () => {
		if (!window.activeTextEditor) {
			window.showErrorMessage("Current window is not an editor!");
			return;
		}

		filesToRemove = [];
		const current = await getFileNameOfDocument(window.activeTextEditor.document);
		if (current.tmp) {
			addFileToRemove(current.name);
		}

		doIt(current.name, open_files_event, filesToRemove);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffCurrentToOther', async () => {
		if (!window.activeTextEditor) {
			window.showErrorMessage("Current window is not an editor!")
			return;
		}

		filesToRemove = [];
		const current = await getFileNameOfDocument(window.activeTextEditor.document);
		if (current.tmp) {
			addFileToRemove(current.name);
		}

		const options: vscode.OpenDialogOptions = {
			canSelectMany: false,
			openLabel: 'Diff'
		};

		window.showOpenDialog(options).then(_ => {
			if (_) {
				const process = showMeld([current.name, _[0].fsPath]);
				if (process && filesToRemove.length > 0) {
					const files = [...filesToRemove];
					process.on('exit', () => cleanupTmpFiles(files));
				}
			}
		});

	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffWithClipboard', async () => {
		const editor = window.activeTextEditor;
		if (!editor) {
			window.showErrorMessage("Current window is not an editor!");
			return;
		}

		filesToRemove = [];
		const clipboardContent = await vscode.env.clipboard.readText();
		const clipboard = await writeTempFileOnDisk(clipboardContent, "clipboard_");
		addFileToRemove(clipboard);

		//by default compare clipboard against current file
		let sameContent;
		let current = editor.document.fileName;
		const selection = editor.selection;
		if (!selection.isEmpty) {
			//compare against current selection
			const editorContent = editor.document.getText(selection);
			current = await writeTempFileOnDisk(editorContent, "selection_");
			addFileToRemove(current);
			sameContent = await areFilesEqual([current, clipboard]);
		} else if (editor.document.isUntitled) {
			//compare against untitled file
			const editorContent = editor.document.getText();
			current = await writeTempFileOnDisk(editorContent, "untitled_");
			addFileToRemove(current);
			sameContent = await areFilesEqual([current, clipboard]);
		} else if (editor.document.isDirty) {
			//compore against dirty content but invoke meld with current saved file
			const editorContent = editor.document.getText();
			const tmpCheck = await writeTempFileOnDisk(editorContent);
			addFileToRemove(tmpCheck);
			sameContent = await areFilesEqual([tmpCheck, clipboard]);
		} else {
			sameContent = await areFilesEqual([current, clipboard]);
		}

		if (sameContent) {
			window.showInformationMessage('No difference');
			cleanupTmpFiles(filesToRemove);
		} else {
			const process = showMeld([current, clipboard]);
			if (process && filesToRemove.length > 0) {
				const files = [...filesToRemove];
				process.on('exit', () => cleanupTmpFiles(files));
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffSavedVersion', async () => {
		const editor = window.activeTextEditor;
		if (!editor) {
			window.showErrorMessage("Current window is not an editor!");
			return;
		}

		if (editor.document.isUntitled) {
			window.showErrorMessage("No saved version found to compare with!");
			return;
		}

		if (!editor.document.isDirty) {
			window.showInformationMessage("No difference to saved version of the file.");
			return;
		}

		filesToRemove = [];

		const editorContent = editor.document.getText();
		const currentSaved = editor.document.fileName;
		const current = await writeTempFileOnDisk(editorContent, basename(currentSaved)+"_changed_");
		addFileToRemove(current);
		const sameContent = await areFilesEqual([current, currentSaved]);

		if (sameContent) {
			window.showInformationMessage('No difference to saved version of the file.');
			cleanupTmpFiles(filesToRemove);
		} else {
			const process = showMeld([current, currentSaved]);
			if (process && filesToRemove.length > 0) {
				const files = [...filesToRemove];
				process.on('exit', () => cleanupTmpFiles(files));
			}
		}
	}));

	let selected = "";

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffFromFileListSelect', (_) => {
		if (!_) {
			if (window.activeTextEditor) {
				if (window.activeTextEditor.document.isUntitled) {
					window.showErrorMessage("Unsaved editors can not be selected for meld diff comparison!");
					return;
				}
				selected = window.activeTextEditor.document.fileName;
			} else {
				window.showErrorMessage("Current window is not an editor!");
				return;
			}
		} else {
			selected = _.fsPath;
		}
		console.log("Select for meld compare: " + selected);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffFromFileList', async (_) => {
		let path = "";
		filesToRemove = [];

		if (!_) {
			if (window.activeTextEditor) {
				let fileName = await getFileNameOfDocument(window.activeTextEditor.document);
				if (fileName.tmp) {
					addFileToRemove(fileName.name);
				}
				path = fileName.name;
			} else {
				window.showErrorMessage("Current window is not an editor!");
				return;
			}
		} else {
			path = _.fsPath;
		}
		if (selected.length > 0) {
			const process = showMeld([selected, path]);
			if (process && filesToRemove.length > 0) {
				const files = [...filesToRemove];
				process.on('exit', () => cleanupTmpFiles(files));
			}
		} else {
			window.showErrorMessage("First select a file to compare with!");
		}
	}));
}

export function deactivate() {
	// delete all tmp files that are not yet deleted because vscode is closed before meld
	if (vscode.workspace.getConfiguration('meld-diff').cleanUpTempFilesOnCodeClose) {
		filesToRemoveGlobal.forEach((file) => unlink(file, (err) => {
			if (err) {
				console.log('Unable to delete file: ', file);
			}
		}));
	}
}
