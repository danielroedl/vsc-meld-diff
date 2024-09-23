import * as vscode from 'vscode';

import { window, commands } from 'vscode';
import { existsSync, writeFile, createReadStream, unlink, statSync } from 'fs';
import * as os from 'os';
import { join, basename, dirname } from 'path';
import * as streamEqual from 'stream-equal';
import * as cp from 'child_process';

let fillListDone = false;
let filesToRemove: string[] = [];
const filesToRemoveGlobal: string[] = [];
const outputChannel = window.createOutputChannel(`MeldDiff`);

function printAndShowError(msg: string, showErrorMessages = true) {
	outputChannel.appendLine(msg);
	if (showErrorMessages) {
		window.showErrorMessage(msg);
	}
}

function addFileToRemove(file: string) {
	filesToRemove.push(file);
	filesToRemoveGlobal.push(file);
}

function showMeld(files: string[]) {
	let diffTool = vscode.workspace.getConfiguration('meld-diff').diffCommand;
	if (diffTool.match(/(?<!\\) /)) {
		// diffTool path includes not escaped spaces so it must be enclosed in quotes
		if (!diffTool.match(/^(["']).*\1$/)) {
			// the diffTool is not enclosed in quotes
			diffTool = '"' + diffTool + '"';
		}
	}
	const diffFiles = files.filter(v => existsSync(v.toString())).slice(0, 3);

	if (diffFiles.length < 2) {
		printAndShowError("Meld Diff Error: Minimum two files are needed to diff!");
		return;
	}

	// files should not be compared with directories because this is not possible
	let fileInDiffFiles = false;
	let directoriesInDiffFiles = false;
	diffFiles.forEach(entry => {
		const stat = statSync(entry);
		fileInDiffFiles = fileInDiffFiles || stat.isFile();
		directoriesInDiffFiles = directoriesInDiffFiles || stat.isDirectory();
	});
	if (fileInDiffFiles && directoriesInDiffFiles) {
		printAndShowError("Meld Diff Error: Meld can't compare files with directories!");
		return;
	}

	// construct cmd
	let argsConf = "";
	if (diffFiles.length == 2) {
		argsConf = vscode.workspace.getConfiguration('meld-diff').diffArgumentsTwoWay;
	} else if (diffFiles.length == 3) {
		argsConf = vscode.workspace.getConfiguration('meld-diff').diffArgumentsThreeWay;
	}
	//replace placeholder in argsConf
	if (diffFiles.length >= 2) {
		argsConf = argsConf.replace("$1", diffFiles[0]);
		argsConf = argsConf.replace("$2", diffFiles[1]);
	}
	if (diffFiles.length == 3) {
		argsConf = argsConf.replace("$3", diffFiles[2]);
	}

	const cmd = diffTool + " " + argsConf;

	outputChannel.appendLine("Run: " + cmd);
	return cp.exec(
		cmd,
		(error: cp.ExecException | null, stdout: string, stderr: string) => {
			if (error) {
				if (error.message.match(/meld: not found/)) {
					printAndShowError("Meld Diff Error: Meld is not installed!");
				} else {
					printAndShowError(
						"Meld Diff Error: Error running diff command! ErrorCode: " + error.code + " StdErr: " + stderr,
						!vscode.workspace.getConfiguration('meld-diff').suppressErrorMessageWhenExitCodeNotZero);
				}
			}
		});
}

function showListAndDiff(current: string, possible_diffs: string[], filesToRemove: string[]) {
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
function doIt(current: string, possible_diffs: string[], filesToRemove: string[]) {
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
	return Math.random().toString(36).substring(2, 10);
}

/**
 * Simple random file creation
 *
 * @see https://github.com/microsoft/vscode/blob/main/extensions/emmet/src/test/testUtils.ts
 */
function createRandomFile({ contents = '', prefix = 'tmp' }: { contents?: string; prefix?: string; } = {}): Thenable<vscode.Uri> {
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

async function writeTempFileOnDisk(content: string, prefix = "tmp_"): Promise<string> {
	try {
		const promise = await createRandomFile({ contents: content, prefix: prefix });
		return promise.fsPath;
	} catch (error: any) {
		printAndShowError("Error writing tmp file!");
		return new Promise((resolve) => {
			resolve("Error writing tmp file!");
		});
	}
}

async function areFilesEqual(files: string[]): Promise<boolean> {
	const [path1, path2] = files;
	const readStream1 = createReadStream(path1);
	const readStream2 = createReadStream(path2);

	return await streamEqual(readStream1, readStream2);
}

function cleanupTmpFiles(files: string[]) {
	files.forEach((file) => unlink(file, (err) => {
		if (err) {
			outputChannel.appendLine('Unable to delete tmp file: ' + file);
		}
		// remove entry from global list
		const index = filesToRemoveGlobal.indexOf(file);
		if (index > -1) {
			filesToRemoveGlobal.splice(index);
		}
	}));
}

async function getFileNameOfDocument(document: vscode.TextDocument) {
	if (document.isUntitled) {
		//compare untitled file or changed content of file instead of saved file
		let prefix = "untitled_";
		if (!document.isUntitled) {
			prefix = basename(document.fileName) + "_";
		}
		const documentContent = document.getText();
		const fileName = await writeTempFileOnDisk(documentContent, prefix);
		return { name: fileName, tmp: true };
	} else {
		return { name: document.fileName, tmp: false };
	}
}

interface Callback {
	(tmpFile: string, error: any): void;
}

async function runGit(selectedFile: string, gitCmd: string, prefix: string, callback: Callback) {
	const selectedFileBasename = basename(selectedFile);
	const selectedFileDir = dirname(selectedFile);

	const simpleGit = await import('simple-git');
	let tmpData = "";
	simpleGit(selectedFileDir).outputHandler((cmd: any, stdOut: any) => {
		stdOut.on('data', async (data: any) => {
			tmpData += data.toString('utf8');
		});
		stdOut.on('end', async (data: any) => {
			// write staged content to temp file
			const staged = await writeTempFileOnDisk(tmpData, prefix + "_" + selectedFileBasename + "_");
			addFileToRemove(staged);

			if (!existsSync(staged)) {
				callback("", "Meld Diff Error: Can't create temp file!");
			}

			// start meld
			callback(staged, null);
		});
	}).raw(
		["show", gitCmd + selectedFileBasename]
	).catch((err: any) => {
		callback("", "Meld Diff Error: " + err);
	});
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
			printAndShowError("Meld Diff Error: Can't compare! " + fileCount + " visible in editor!");
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
				return b.time - a.time;
			})
			.map(function (v) {
				return v.name;
			});

		// TODO add areFilesEqual to every step
		const process = showMeld(open_files);
		if (process && filesToRemove.length > 0) {
			const files = [...filesToRemove];
			process.on('exit', () => cleanupTmpFiles(files));
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffCurrentToOtherOpen', async () => {
		if (!window.activeTextEditor) {
			printAndShowError("Meld Diff Error: Current window is not an editor!");
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
			printAndShowError("Meld Diff Error: Current window is not an editor!");
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

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.openFromDiffView', async () => {
		const tab : vscode.Tab | undefined = vscode.window.tabGroups.activeTabGroup.activeTab;
		const tabInput = tab?.input;

		if (!(tabInput instanceof vscode.TabInputTextDiff)) {
			printAndShowError('Meld Diff Error: Current tab is not a text comparison');
			return;
		}

		//tabInput.original.scheme is not 'file' but e.g. 'git', thus we have to write content to temp folder for comparison
		const bufferArray = await vscode.workspace.fs.readFile(tabInput.original); 
		const originalContent = Buffer.from(bufferArray).toString();
		const originalFile = await writeTempFileOnDisk(originalContent, "original_");
		addFileToRemove(originalFile);
		// here just take the saved version
		const modifiedFile = tabInput.modified.fsPath;

		const process = showMeld([originalFile, modifiedFile]);
		if (process && filesToRemove.length > 0) {
			const files = [...filesToRemove];
			process.on('exit', () => cleanupTmpFiles(files));
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffWithClipboard', async () => {
		const editor = window.activeTextEditor;
		if (!editor) {
			printAndShowError("Meld Diff Error: Current window is not an editor!");
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
			window.showInformationMessage('Meld Diff: No difference');
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
			printAndShowError("Meld Diff Error: Current window is not an editor!");
			return;
		}

		if (editor.document.isUntitled) {
			printAndShowError("Meld Diff Error: No saved version found to compare with!");
			return;
		}

		if (!editor.document.isDirty) {
			window.showInformationMessage("Meld Diff: No difference to saved version of the file.");
			return;
		}

		filesToRemove = [];

		const editorContent = editor.document.getText();
		const currentSaved = editor.document.fileName;
		const current = await writeTempFileOnDisk(editorContent, basename(currentSaved) + "_changed_");
		addFileToRemove(current);
		const sameContent = await areFilesEqual([current, currentSaved]);

		if (sameContent) {
			window.showInformationMessage('Meld Diff: No difference to saved version of the file.');
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

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffFromFileListMultiple', (_, selectedFiles) => {
		if (selectedFiles) {
			const files = [];
			console.log(typeof selectedFiles[0]);
			for (let i = 0; i < selectedFiles.length; i++) {
				files.push(selectedFiles[i].fsPath);
			}

			outputChannel.appendLine("Compare multiple files: " + files);
			showMeld(files);
		} else {
			window.showInformationMessage('Meld Diff: Command can only be used from file list.');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffFromFileListSelect', (_) => {
		if (!_) {
			if (window.activeTextEditor) {
				if (window.activeTextEditor.document.isUntitled) {
					printAndShowError("Meld Diff Error: Unsaved editors can not be selected for meld diff comparison!");
					return;
				}
				selected = window.activeTextEditor.document.fileName;
			} else {
				printAndShowError("Meld Diff Error: Current window is not an editor!");
				return;
			}
		} else {
			selected = _.fsPath;
		}
		vscode.commands.executeCommand('setContext', 'meld-diff.FileSelectedForMeldDiff', true);
		outputChannel.appendLine("Select for meld compare: " + selected);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffFromFileList', async (_) => {
		let path = "";
		filesToRemove = [];

		if (!_) {
			if (window.activeTextEditor) {
				const fileName = await getFileNameOfDocument(window.activeTextEditor.document);
				if (fileName.tmp) {
					addFileToRemove(fileName.name);
				}
				path = fileName.name;
			} else {
				printAndShowError("Meld Diff Error: Current window is not an editor!");
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
			printAndShowError("Meld Diff Error: First select a file to compare with!");
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('meld-diff.diffScm', async (_) => {
		if (!_) {
			printAndShowError("Meld Diff Error: First select a changed file in source control window and use context menu.");
			return;
		}

		const selectedFile = _.resourceUri._fsPath;

		filesToRemove = [];

		switch (_.type) {
			case 5: // unstaged changes
				// get content of staging version of the selected file
				runGit(selectedFile, ":./", "staged", (staged, err) => {
					if (err) {
						return printAndShowError(err);
					}
					// start meld
					const process = showMeld([staged, selectedFile]);
					if (process && filesToRemove.length > 0) {
						const files = [...filesToRemove];
						process.on('exit', () => cleanupTmpFiles(files));
					}
				});
				break;

			case 0: // staged changes
				// get content of staging version of the selected file
				runGit(selectedFile, ":./", "staged", (staged, err) => {
					if (err) {
						return printAndShowError(err);
					}
					// get content of head version of the selected file
					runGit(selectedFile, "HEAD:./", "head", (head, err) => {
						if (err) {
							return printAndShowError(err);
						}
						// start meld
						const process = showMeld([head, staged]);
						if (process && filesToRemove.length > 0) {
							const files = [...filesToRemove];
							process.on('exit', () => cleanupTmpFiles(files));
						}
					});
				});
				break;

			case 16: // merge conflicts
			case 17: // merge conflicts from code version 1.79
				// get content of head version of the selected file
				runGit(selectedFile, ":2:./", "current", (head, err) => {
					if (err) {
						return printAndShowError(err);
					}
					// get content of incoming version of the selected file
					runGit(selectedFile, ":3:./", "incoming", (incoming, err) => {
						if (err) {
							return printAndShowError(err);
						}
						// start meld
						const process = showMeld([head, selectedFile, incoming]);
						if (process && filesToRemove.length > 0) {
							const files = [...filesToRemove];
							process.on('exit', () => cleanupTmpFiles(files));
						}
					});
				});
				break;

			case 7: // untracked file
				window.showInformationMessage("Meld Diff: No diff possible for untracked files!");
				break;

			case 1: // staged new file
				window.showInformationMessage("Meld Diff: No diff possible for files not yet commited!");
				break;

			default:
				printAndShowError("Meld Diff Error: Scm diff type " + _.type + " not supported.");
				break;
		}
	}));
}

export function deactivate() {
	// delete all tmp files that are not yet deleted because vscode is closed before meld
	if (vscode.workspace.getConfiguration('meld-diff').cleanUpTempFilesOnCodeClose) {
		filesToRemoveGlobal.forEach((file) => unlink(file, (err) => {
			if (err) {
				outputChannel.appendLine('Unable to delete tmp file: ' + file);
			}
		}));
	}
}
