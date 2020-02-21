# Compare files or folders with the tool meld directly from vscode

This extension open two files (or folders) in the external tool meld.

There are five commands to do different ways to choose the files for comparing. It is also possible to choose the files (or folders) from the file list.

Hit `Ctrl` + `Shift` + `P` to open the command menu and type `Meld Diff`.

![All commands](images/all_cmds.png)

*Folder comparison is only possible from file list (see hint in command description 'Select for meld compare' and 'Compare with selected for meld compare')*

**Important:**
Meld tool must be available on your system. In a command line the command `meld <file1> <file2>` should work.
On Windows you maybe have to add the executable folder of meld to your PATH.

# Detailed command information
## All visible documents
To use this command two files have to be visible side by side.

![Compare side by side files](images/files_side_by_side.png)

## Current file to one other open file in editor
The current selected file will be the first to compare (left side in meld).
The second file to compare (right side in meld) is selected by menu which shows all open files.

![Compare file to other open file](images/compare_to_open_file.png)

## Current file to one other file (not open in editor)
The current selected file will be the first to compare (left side in meld).
The second file to compare (right side in meld) is selected by open file dialog.

## Select for meld compare
Set the current selected file as the first to compare (left side in meld).

This is also possible in the file list.

![Compare file to compare to from file list](images/select_for_compare.png)

## Compare with selected for meld compare
Compare current file (right side in meld) to the file selected before.

This is also possible in the file list.

![Compare to selected from file list](images/compare_to_selected.png)

# Usage with file list (also folder comparison possible)
## Select for meld compare
Select the the first file or folder to compare (left side in meld) by right click on file list and hit '*Select for meld compare*'.

![Compare file to compare to from file list](images/select_for_compare.png)

## Compare with selected for meld compare
Select the file or folder to compare to the file or folder selected before (right side in meld) by right click on file list and hit '*Compare with selected for meld compare*'.

![Compare to selected from file list](images/compare_to_selected.png)
