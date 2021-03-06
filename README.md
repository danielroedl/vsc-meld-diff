# Compare files or folders with the tool meld (or other like WinMerge, Beyond Compare, ...) directly from vs code

This extension open two files (or folders) in the external tool meld (or ony other diff tool you want).

There are five commands to do different ways to choose the files for comparing. It is also possible to choose the files (or folders) from the file list.

Hit `Ctrl` + `Shift` + `P` to open the command menu and type `Meld Diff`.

![All commands](images/all_cmds.png)

*Folder comparison is only possible from file list (see hint in command description 'Select for meld compare' and 'Compare with selected for meld compare')*

**Important:**
Meld tool must be available on your system. In a command line the command `meld <file1> <file2>` should work.
On Windows you maybe have to add the executable folder of meld to your PATH.

It is also possible to change the compare tool (see [Customize settings](#customize-settings)).

# Detailed command information
This chapter describes every command in detail.

## Compare all visible documents (two or three)
Up to three visible files can be compared with this command. To use it two or three files have to be visible side by side.

![Compare side by side files](images/files_side_by_side.png)

If there are more than three files visible the three files with the newest modification timestamp are used.

## Compare current file with one other open file in editor
The current selected file will be the first file for the comparison (left side in meld).

The second file for the comparison (right side in meld) is selected by menu which shows all open files.

![Compare file to other open file](images/compare_to_open_file.png)

## Compare current file with one other file (not open in editor)
The current selected file will be the first file for the comparison (left side in meld).

The second file file for the comparison (right side in meld) is selected by open file dialog.

## Select for meld compare
Set the current selected file as the first file for the comparison (left side in meld).

This command is also available in the [file list](#usage-with-file-list-also-folder-comparison-possible) and the [editor title context menu](#usage-with-editor-title-context-menu).

![Compare file to compare to from file list](images/select_for_compare.png)

## Compare with selected for meld compare
Compare the current file (right side in meld) with the file selected before by '*Select for meld compare*'.

This command is also available in the [file list](#usage-with-file-list-also-folder-comparison-possible) and the [editor title context menu](#usage-with-editor-title-context-menu).

![Compare to selected from file list](images/compare_to_selected.png)

## Compare with clipboard
Compare the current file or the current selected text with the content of the clipboard.

1. Select text in an editor
2. Start '*Compare with clipboard*' from global menu or right click menu

If no text is selected the whole content of the editor is taken as selection.

If the selection is equal to the clipboard just a message will appear and no meld is started.

If the selection is not equal meld will be started comparing the saved file with the clipboard (not the maybe unsaved content).

This command is also available in the [editor context menu](#usage-with-editor-context-menu).

## Compare with saved version of the file
Compare the changed version in the current editor with it's saved version.

Change the contend in an editor and call the function. The changed content will be compared with the saved content in meld.

This command is also available in the [editor title context menu](#usage-with-editor-title-context-menu).

# Usage with file list (also folder comparison possible)
## Select for meld compare
Select the first file or folder to compare (left side in meld) by right click on file list and hit '*Select for meld compare*'.

![Compare file to compare to from file list](images/select_for_compare.png)

## Compare with selected for meld compare
Select the file or folder to compare to the file or folder selected before (right side in meld) by right click on file list and hit '*Compare with selected for meld compare*'.

![Compare to selected from file list](images/compare_to_selected.png)

# Usage with editor context menu
The command '*Compare with clipboard*' is also available in the context menu of a text editor.

![Editor context menu](images/editor_context_menu.png)

# Usage with editor title context menu
The commands '*Select for meld compare*', '*Compare with selected for meld compare*' and '*Compare current file with saved version*' are also available in the context menu of a text editor title.

![Editor context menu](images/editor_title_context_menu.png)

# Customize settings
## Use other tools than meld
In the settings for Meld Diff it is possible to customize the tool to use. Instead of Meld other tools like WinMerge or Beyond Compare can be used. Also the given arguments can be configured.

The default values are:

![Compare to selected from file list](images/settings.png)

## Don't delete temp files if visual studio code is closed before meld
By default all temporary files created for comparison of unsaved files, selections and clipboard are removed on closing visual studio code. This is done even if meld instances are running.

To prevent deleting of temp files that are used by meld instances on closing visual studio code uncheck the settings entry `Temporary files (created for clipboard or unsaved comparison) are deleted if visual studio code is closed before meld`.