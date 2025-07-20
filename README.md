# WebClass To-Do 抽出ツール

**WebClass の課題一覧 CSV から、To-Do タスクを抽出して整形・エクスポートできるWeb アプリです。**  
モバイル対応・インストール不要・サクサク動作。



---

## 🔧 主な機能

- 📂 CSV アップロード（WebClass 課題一覧）
- 🔍 条件抽出（締切・状態・キーワード）
- 📅 エクスポート形式
  - iCalendar (.ics)
  - Todoist インポートCSV
  - PNG（縦／表形式）
- 📱 iPhone Safari でも動作確認済み
- ☁️ [Cloudflare Pages でホスティング中](https://webclass-todo.pages.dev)

---

## ⌨️ キーボードショートカット

| 操作                        | ショートカット                     |
|-----------------------------|------------------------------------|
| ファイルを開く              | `Ctrl/Cmd + O`                     |
| CSV エクスポート            | `Ctrl/Cmd + Shift + C`             |
| iCalendar エクスポート      | `Ctrl/Cmd + Shift + I`             |
| Todoist CSV エクスポート    | `Ctrl/Cmd + Shift + T`             |
| PNG（テーブル）エクスポート | `Ctrl/Cmd + Shift + P`             |
| PNG（縦リスト）エクスポート | `Ctrl/Cmd + Shift + L`             |
| ヘルプ表示                  | `Ctrl/Cmd + H`                     |
| プレビューを閉じる          | `Esc`                              |

---

## 📦 技術スタック

| 技術       | 用途               |
|------------|--------------------|
| [Vite](https://vitejs.dev/)       | フロントエンドビルド         |
| React      | UI コンポーネント         |
| Luxon      | 日付操作（タイムゾーン対応） |
| PapaParse  | CSVパース           |
| html2canvas| PNG 画像化         |
| ics        | iCalendar 生成      |

---

## 🚀 開発・ビルド手順

```bash
# 依存パッケージのインストール
npm install

# 開発サーバー起動（http://localhost:5173）
npm run dev

# ビルド（dist フォルダ生成）
npm run build
```
