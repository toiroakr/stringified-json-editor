# Change Log

All notable changes to the "stringified-json-editor" extension will be documented in this file.

## [0.0.2] - 2025-04-24

### Changed
- 仮想ドキュメント（TextDocumentContentProvider）からテンポラリファイルを使用する実装に変更
  - 読み取り専用の問題を解決
  - エディタが閉じられたときにテンポラリファイルを自動的に削除する機能を追加
- テンポラリファイルの保存をトリガーに元ファイルに自動反映する機能を追加
  - 通常の保存操作（Ctrl+S）で元のドキュメントに反映
  - 手動保存用の「Save JSON to parent document」コマンドを削除
- コンテキストメニューの表示条件を更新

## [0.0.1] - 2025-04-24

### Added
- 初期リリース
- JSONファイル内のJSON文字列を検出する機能
  - 選択されたテキストからJSON文字列を検出
  - カーソル位置からJSON文字列を自動検出
- 検出したJSON文字列を別のエディタで開いて編集できる機能
- 編集後のJSONを元のJSON文字列形式に戻して保存する機能
- JSONファイル内のコンテキストメニュー「Edit as JSON」
- JSON文字列エディタ内のコンテキストメニュー「Save JSON to parent document」
