import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// 編集対象の文字列とその範囲を表すインターフェース
interface EditTarget {
  body: string;
  selection: vscode.Selection;
}

// テンポラリファイルの情報を保持するインターフェース
interface TempFileInfo {
  filePath: string;
  originalUri: vscode.Uri;
  originalSelection: vscode.Selection;
}

// テンポラリファイル管理クラス
class TempFileManager {
  private _tempFiles = new Map<string, TempFileInfo>();
  private _disposables: vscode.Disposable[] = [];

  constructor() {
    // エディタが閉じられたときのイベントリスナーを登録
    this._disposables.push(
      vscode.workspace.onDidCloseTextDocument(document => {
        const filePath = document.uri.fsPath;
        if (this._tempFiles.has(filePath)) {
          this.deleteTempFile(filePath).catch(err => {
            console.error(`テンポラリファイルの削除に失敗しました: ${err}`);
          });
        }
      })
    );

    // ファイルが保存されたときのイベントリスナーを登録
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument(async document => {
        const filePath = document.uri.fsPath;
        if (this._tempFiles.has(filePath)) {
          await this.saveToOriginalDocument(document).catch(err => {
            vscode.window.showErrorMessage(`元のドキュメントへの保存に失敗しました: ${err}`);
          });
        }
      })
    );
  }

  // テンポラリファイルの内容を元のドキュメントに保存
  public async saveToOriginalDocument(document: vscode.TextDocument): Promise<void> {
    const filePath = document.uri.fsPath;
    const tempFileInfo = this._tempFiles.get(filePath);

    if (!tempFileInfo) {
      return;
    }

    // JSONコンテンツを取得
    let jsonContent = document.getText().trim();

    // 元のドキュメントを開く
    const originalDocument = await vscode.workspace.openTextDocument(tempFileInfo.originalUri);
    const originalEditor = await vscode.window.showTextDocument(originalDocument);

    try {
      // JSONをエスケープした文字列に変換
      try {
        jsonContent = JSON.stringify(JSON.parse(jsonContent)).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      } catch (e) {
        vscode.window.showErrorMessage('JSON文字列ではありません。: ' + jsonContent);
        jsonContent = JSON.parse(JSON.stringify({ content: jsonContent })).content;
      }

      // 元のドキュメントを編集
      await originalEditor.edit((editBuilder: vscode.TextEditorEdit) => {
        editBuilder.replace(tempFileInfo.originalSelection, jsonContent);
      });

      // テンポラリファイルのエディタを閉じる
      const tabs = vscode.window.tabGroups.all
        .flatMap(group => group.tabs)
        .filter(tab => tab.input instanceof vscode.TabInputText &&
          tab.input.uri.fsPath === document.uri.fsPath);
      await vscode.window.tabGroups.close(tabs);

      // テンポラリファイルを削除
      await this.deleteTempFile(filePath);

      vscode.window.showInformationMessage('JSON文字列を元のドキュメントに反映しました');
    } catch (error) {
      if (error instanceof Error) {
        vscode.window.showErrorMessage(`エラー: ${error.message}`);
      } else {
        vscode.window.showErrorMessage('不明なエラーが発生しました');
      }
      throw error;
    }
  }

  // テンポラリファイルを作成
  public async createTempFile(content: string, originalUri: vscode.Uri, originalSelection: vscode.Selection): Promise<string> {
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const fileName = `stringified_json_${timestamp}.json`;
    const filePath = path.join(tempDir, fileName);

    // ファイルに内容を書き込む
    await fs.promises.writeFile(filePath, content, 'utf8');

    // 情報を保存
    this._tempFiles.set(filePath, {
      filePath,
      originalUri,
      originalSelection,
    });

    return filePath;
  }

  // テンポラリファイル情報を取得
  public getTempFileInfo(filePath: string): TempFileInfo | undefined {
    return this._tempFiles.get(filePath);
  }

  // テンポラリファイルを削除
  public async deleteTempFile(filePath: string): Promise<void> {
    try {
      await fs.promises.unlink(filePath);
      this._tempFiles.delete(filePath);
    } catch (error) {
      console.error(`テンポラリファイルの削除に失敗しました: ${error}`);
    }
  }

  // 全てのテンポラリファイルを削除
  public async deleteAllTempFiles(): Promise<void> {
    for (const [filePath] of this._tempFiles) {
      await this.deleteTempFile(filePath);
    }
  }

  // リソースを解放
  public dispose(): void {
    this._disposables.forEach(d => d.dispose());
    this.deleteAllTempFiles().catch(err => {
      console.error(`全てのテンポラリファイルの削除に失敗しました: ${err}`);
    });
  }
}

// 2つの位置が等しいかどうかを確認する関数
function positionEquals(a: vscode.Position, b: vscode.Position): boolean {
  return a.line === b.line && a.character === b.character;
}

// カーソル位置の文字列を検出する関数
function getTarget(editor: vscode.TextEditor): EditTarget | null {
  const document = editor.document;
  const selection = editor.selection;

  // 選択範囲がある場合はその範囲を使用
  if (!positionEquals(selection.start, selection.end)) {
    const selectedText = document.getText(selection);
    return { body: selectedText, selection };
  }

  // カーソル位置から文字列を検出
  const line = document.lineAt(selection.start.line);
  const lineText = line.text;

  // 正規表現でクォートで囲まれた文字列を検索
  const regex = /"([^"\\]*(\\.[^"\\]*)*)"/g;

  let match;
  while ((match = regex.exec(lineText)) !== null) {
    const start = match.index + 1; // クォートの次の文字
    const end = start + match[1].length;

    // カーソルが文字列の範囲内にあるか確認
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
  console.log('拡張機能 "stringified-json-editor" が有効化されました');

  // テンポラリファイル管理クラスのインスタンスを作成
  const tempFileManager = new TempFileManager();
  context.subscriptions.push({ dispose: () => tempFileManager.dispose() });

  // JSON文字列を編集するコマンド
  const editJsonStringCommand = vscode.commands.registerCommand('stringified-json-editor.editJsonString', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('アクティブなエディタがありません');
      return;
    }

    // 選択範囲またはカーソル位置のJSON文字列を取得
    const target = getTarget(editor);
    if (!target) {
      vscode.window.showErrorMessage('JSON文字列が見つかりません。JSON文字列を選択してください。');
      return;
    }

    try {
      let selectedText = target.body;
      // 選択されたテキストがJSON文字列かどうかを確認
      let jsonContent: string = selectedText;

      try {
        // エスケープされた文字を処理
        selectedText = selectedText.replace(/^"/, '').replace(/"$/, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

        try {
          jsonContent = JSON.stringify(JSON.parse(selectedText), null, 2);
        } catch (_e) {
          // noop
        }
      } catch (e) {
        if (e instanceof Error) {
          vscode.window.showErrorMessage(`エラー: ${e.message}`);
        } else {
          vscode.window.showErrorMessage('不明なエラーが発生しました');
        }
        return;
      }

      // テンポラリファイルを作成
      const tempFilePath = await tempFileManager.createTempFile(
        jsonContent,
        editor.document.uri,
        target.selection,
      );

      // テンポラリファイルを開く
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(tempFilePath));
      await vscode.window.showTextDocument(document, { preview: false });

      // 言語モードをJSONに設定
      vscode.languages.setTextDocumentLanguage(document, 'json');

      vscode.window.showInformationMessage('JSON文字列をJSONとして開きました。編集後は保存（Ctrl+S）すると自動的に元のドキュメントに反映されます。');
    } catch (error) {
      if (error instanceof Error) {
        vscode.window.showErrorMessage(`エラー: ${error.message} ${error.stack}`);
      } else {
        vscode.window.showErrorMessage('不明なエラーが発生しました');
      }
    }
  });

  context.subscriptions.push(editJsonStringCommand);
}

export function deactivate() {
  // 拡張機能が非アクティブになったときの処理
  // TempFileManagerのdisposeはcontext.subscriptionsに登録されているので自動的に呼ばれる
}
