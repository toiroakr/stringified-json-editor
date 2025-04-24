# Stringified JSON Editor

VS Code拡張機能「Stringified JSON Editor」は、JSONファイル内に文字列として格納されているJSONを、通常のJSONとして編集できるようにするツールです。

## 機能

この拡張機能は、JSONファイル内の文字列化されたJSON（例：`{"config": "{\"name\":\"test\",\"value\":123}"}`）を検出し、それを通常のJSONとして編集できるようにします。

![機能のデモ](images/demo.gif)

## 使い方

1. JSONファイルを開きます
2. 以下のいずれかの方法でJSON文字列を編集します：
   - **選択方式**: JSON文字列部分を選択します（クォーテーションを含めても含めなくても動作します）
   - **カーソル方式**: JSON文字列内にカーソルを置きます（選択不要）
3. 右クリックして「Edit as JSON」を選択します
4. 新しいエディタでJSONが整形されて表示されます
5. JSONを編集します
6. 編集が完了したら、右クリックして「Save JSON to parent document」を選択します
7. 編集内容が元のJSONファイルに文字列として保存されます

## 例

### 元のJSONファイル
```json
{
  "name": "Example",
  "config": "{\"server\":\"localhost\",\"port\":8080,\"settings\":{\"debug\":true}}"
}
```

### 編集可能なJSON
```json
{
  "server": "localhost",
  "port": 8080,
  "settings": {
    "debug": true
  }
}
```

### 編集後の元JSONファイル
```json
{
  "name": "Example",
  "config": "{\"server\":\"localhost\",\"port\":9000,\"settings\":{\"debug\":false}}"
}
```

## 要件

- VS Code 1.99.0以上

## 拡張機能の設定

この拡張機能には特別な設定はありません。

## 既知の問題

- 非常に大きなJSON文字列の場合、パフォーマンスが低下する可能性があります
- ネストされたJSON文字列（JSON文字列内にさらにJSON文字列がある場合）は現在サポートされていません

## リリースノート

### 0.0.1

- 初期リリース
- JSONファイル内のJSON文字列を検出して編集する機能
- 編集したJSONを元のファイルに保存する機能

---

**Enjoy!**
