import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Interface representing the target string and its range for editing
interface EditTarget {
  body: string;
  selection: vscode.Selection;
}

// Interface holding information about temporary files
interface TempFileInfo {
  filePath: string;
  originalUri: vscode.Uri;
  originalSelection: vscode.Selection;
}

// Temporary file management class
class TempFileManager {
  private _tempFiles = new Map<string, TempFileInfo>();
  private _disposables: vscode.Disposable[] = [];

  constructor() {
    // Register event listener when editor is closed
    this._disposables.push(
      vscode.workspace.onDidCloseTextDocument(document => {
        const filePath = document.uri.fsPath;
        if (this._tempFiles.has(filePath)) {
          this.deleteTempFile(filePath).catch(err => {
            console.error(`Failed to delete temporary file: ${err}`);
          });
        }
      })
    );

    // Register event listener when file is saved
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument(async document => {
        const filePath = document.uri.fsPath;
        if (this._tempFiles.has(filePath)) {
          await this.saveToOriginalDocument(document).catch(err => {
            vscode.window.showErrorMessage(`Failed to save to original document: ${err}`);
          });
        }
      })
    );
  }

  // Save the temporary file content to the original document
  public async saveToOriginalDocument(document: vscode.TextDocument): Promise<void> {
    const filePath = document.uri.fsPath;
    const tempFileInfo = this._tempFiles.get(filePath);

    if (!tempFileInfo) {
      return;
    }

    // Get JSON content
    let jsonContent = document.getText().trim();

    // Open the original document
    const originalDocument = await vscode.workspace.openTextDocument(tempFileInfo.originalUri);
    const originalEditor = await vscode.window.showTextDocument(originalDocument);

    try {
      // Convert JSON to escaped string
      try {
        jsonContent = JSON.stringify(JSON.parse(jsonContent)).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      } catch (e) {
        vscode.window.showErrorMessage('Not a valid JSON string: ' + jsonContent);
        jsonContent = JSON.parse(JSON.stringify({ content: jsonContent })).content;
      }

      // Edit the original document
      await originalEditor.edit((editBuilder: vscode.TextEditorEdit) => {
        editBuilder.replace(tempFileInfo.originalSelection, jsonContent);
      });

      // Close temporary file editor
      const tabs = vscode.window.tabGroups.all
        .flatMap(group => group.tabs)
        .filter(tab => tab.input instanceof vscode.TabInputText &&
          tab.input.uri.fsPath === document.uri.fsPath);
      await vscode.window.tabGroups.close(tabs);

      // Delete temporary file
      await this.deleteTempFile(filePath);

      vscode.window.showInformationMessage('JSON string has been updated in the original document');
    } catch (error) {
      if (error instanceof Error) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
      } else {
        vscode.window.showErrorMessage('An unknown error occurred');
      }
      throw error;
    }
  }

  // Create a temporary file
  public async createTempFile(content: string, originalUri: vscode.Uri, originalSelection: vscode.Selection): Promise<string> {
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const fileName = `stringified_json_${timestamp}.json`;
    const filePath = path.join(tempDir, fileName);

    // Write content to file
    await fs.promises.writeFile(filePath, content, 'utf8');

    // Save information
    this._tempFiles.set(filePath, {
      filePath,
      originalUri,
      originalSelection,
    });

    return filePath;
  }

  // Get temporary file information
  public getTempFileInfo(filePath: string): TempFileInfo | undefined {
    return this._tempFiles.get(filePath);
  }

  // Delete a temporary file
  public async deleteTempFile(filePath: string): Promise<void> {
    try {
      await fs.promises.unlink(filePath);
      this._tempFiles.delete(filePath);
    } catch (error) {
      console.error(`Failed to delete temporary file: ${error}`);
    }
  }

  // Delete all temporary files
  public async deleteAllTempFiles(): Promise<void> {
    for (const [filePath] of this._tempFiles) {
      await this.deleteTempFile(filePath);
    }
  }

  // Release resources
  public dispose(): void {
    this._disposables.forEach(d => d.dispose());
    this.deleteAllTempFiles().catch(err => {
      console.error(`Failed to delete all temporary files: ${err}`);
    });
  }
}

// Function to check if two positions are equal
function positionEquals(a: vscode.Position, b: vscode.Position): boolean {
  return a.line === b.line && a.character === b.character;
}

// Function to detect a string at cursor position
function getTarget(editor: vscode.TextEditor): EditTarget | null {
  const document = editor.document;
  const selection = editor.selection;

  // Use selected range if exists
  if (!positionEquals(selection.start, selection.end)) {
    const selectedText = document.getText(selection);
    return { body: selectedText, selection };
  }

  // Detect string from cursor position
  const line = document.lineAt(selection.start.line);
  const lineText = line.text;

  // Search for quoted strings using regex
  const regex = /"([^"\\]*(\\.[^"\\]*)*)"/g;

  let match;
  while ((match = regex.exec(lineText)) !== null) {
    const start = match.index + 1; // Character after the quote
    const end = start + match[1].length;

    // Check if cursor is within the string range
    if (selection.start.character >= match.index && selection.start.character <= match.index + match[0].length) {
      return {
        body: match[1],
        selection: new vscode.Selection(
          new vscode.Position(selection.start.line, start),
          new vscode.Position(selection.start.line, end)
        )
      };
    }
  }

  return null;
}

export function activate(context: vscode.ExtensionContext) {
  // Create an instance of the temporary file manager
  const tempFileManager = new TempFileManager();
  context.subscriptions.push({ dispose: () => tempFileManager.dispose() });

  // Command to edit JSON strings
  const editJsonStringCommand = vscode.commands.registerCommand('stringified-json-editor.editJsonString', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor');
      return;
    }

    // Get JSON string from selection or cursor position
    const target = getTarget(editor);
    if (!target) {
      vscode.window.showErrorMessage('No JSON string found. Please select a JSON string.');
      return;
    }

    try {
      let selectedText = target.body;
      // Check if the selected text is a JSON string
      let jsonContent: string = selectedText.replace(/\\n/g, "\n");

      try {
        // Process escaped characters
        selectedText = selectedText.replace(/^"/, '').replace(/"$/, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

        try {
          jsonContent = JSON.stringify(JSON.parse(selectedText), null, 2);
        } catch (_e) {
          // noop
        }
      } catch (e) {
        if (e instanceof Error) {
          vscode.window.showErrorMessage(`Error: ${e.message}`);
        } else {
          vscode.window.showErrorMessage('An unknown error occurred');
        }
        return;
      }

      // Create temporary file
      const tempFilePath = await tempFileManager.createTempFile(
        jsonContent,
        editor.document.uri,
        target.selection,
      );

      // Open temporary file
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(tempFilePath));
      await vscode.window.showTextDocument(document, { preview: false });

      // Set language mode to JSON
      vscode.languages.setTextDocumentLanguage(document, 'json');

      vscode.window.showInformationMessage('JSON string opened as JSON. Edit and save (Ctrl+S) to update the original document.');
    } catch (error) {
      if (error instanceof Error) {
        vscode.window.showErrorMessage(`Error: ${error.message} ${error.stack}`);
      } else {
        vscode.window.showErrorMessage('An unknown error occurred');
      }
    }
  });

  context.subscriptions.push(editJsonStringCommand);
}

export function deactivate() {
  // Processing when the extension becomes inactive
  // TempFileManager's dispose is automatically called because it's registered in context.subscriptions
}
