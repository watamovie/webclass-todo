# iPhoneショートカット設定ガイド

WebClassの「課題実施状況一覧」からデータを取得し、ToDoアプリに一括登録するためのショートカット設定方法です。

## 前提条件

- iPhone/iPadに「ショートカット」アプリがインストールされていること。
- WebClassにログイン済みであること。

## ショートカットの作成手順

1. **ショートカットアプリを開く**
   - 「マイショートカット」タブの右上にある「＋」ボタンをタップして新規ショートカットを作成します。

2. **アクションを追加: "WebページでJavaScriptを実行"**
   - 検索バーに「JavaScript」と入力し、「WebページでJavaScriptを実行」を選択します。
   - アクションの設定で「**Webページ**」が選択されていることを確認します（通常はデフォルト）。

3. **JavaScriptコードを入力**
   - デフォルトのコードを削除し、以下のコードを貼り付けます。

   ```javascript
   // 完了ハンドラを呼び出す関数
   var completion = completion || function(result) { return result; };

   // テーブルのデータを抽出
   var table = document.querySelector('table'); // 必要に応じてセレクタを調整してください
   if (!table) {
       // WebClassの課題一覧テーブルが見つからない場合のフォールバック
       // 具体的なクラス名やIDがわかればそれを使います。例: #assignment-list
       var tables = document.getElementsByTagName('table');
       if (tables.length > 0) {
           table = tables[0];
       } else {
           completion("Error: テーブルが見つかりません");
       }
   }

   var csv = [];
   // ヘッダーを追加 (アプリが期待する形式)
   csv.push('"学部","学科","コース名","教材","締切","状態"');

   // 行を反復処理
   var rows = table.querySelectorAll('tr');
   // ヘッダー行をスキップするためにインデックス1から開始するか、内容で判定
   for (var i = 0; i < rows.length; i++) {
       var row = rows[i];
       var cells = row.querySelectorAll('td, th');
       if (cells.length < 4) continue; // 列が足りない行はスキップ

       // 各列のデータを取得 (WebClassの列順に合わせて調整が必要)
       // 仮定: 0:コース名, 1:教材, 2:締切, 3:状態 ... など
       // 実際のWebClassのHTML構造に合わせてインデックスを変更してください。

       // 例として、テキスト内容をそのまま取得してCSV形式に整形
       var rowData = [];
       // 学部・学科は空でも良い
       rowData.push('""'); // 学部
       rowData.push('""'); // 学科

       // コース名、教材、締切、状態を探す
       // WebClassのテーブル構造に依存します。
       // 以下は一般的な推定です。必要に応じて書き換えてください。
       var courseName = "";
       var materialName = "";
       var deadline = "";
       var status = "";

       // セルのテキストを取得するヘルパー
       function getText(cell) {
           return cell ? cell.innerText.trim().replace(/"/g, '""') : "";
       }

       // ここで列のインデックスを指定します
       // 例:
       // courseName = getText(cells[0]);
       // materialName = getText(cells[1]);
       // deadline = getText(cells[2]);
       // status = getText(cells[3]);

       // とりあえず全列を結合してCSV行を作る（簡易版）
       // 正確なマッピングのためにはHTML構造の確認が必要です。

       // もしHTML構造が不明な場合は、全テキストを含めることで
       // ユーザーがCSVを手動修正する余地を残すか、
       // または特定のキーワード（"締切"など）を含む列を探すロジックが必要です。

       // 簡易ロジック:
       for(var j=0; j<cells.length; j++) {
           rowData.push('"' + getText(cells[j]) + '"');
       }

       // csv.push(rowData.join(","));

       // 注意: アプリ側の期待するヘッダーは "学部","学科","コース名","教材","締切" です。
       // これに合わせてデータを整形して返すのがベストです。
   }

   // テスト用データ（WebClassの構造が特定できない場合のプレースホルダー）
   // 実際には上記のループで構築したCSV文字列を返します。

   // テーブル全体をCSV文字列として取得する汎用スクリプト
   var resultCsv = "";
   // ヘッダー
   resultCsv += '"学部","学科","コース名","教材","締切","状態"\n';

   // 行データ
   for (var i = 0; i < rows.length; i++) {
       var cells = rows[i].querySelectorAll('td');
       if (cells.length === 0) continue;

       // ここでWebClassの列定義に合わせてデータをマッピングしてください
       // 例:
       // コース名: cells[0]
       // 教材: cells[1]
       // 期限: cells[2]
       // 状態: cells[3]

       var c_course = cells[0] ? cells[0].innerText.trim().replace(/"/g, '""') : "";
       var c_material = cells[1] ? cells[1].innerText.trim().replace(/"/g, '""') : "";
       var c_deadline = cells[2] ? cells[2].innerText.trim().replace(/"/g, '""') : "";
       var c_status = cells[3] ? cells[3].innerText.trim().replace(/"/g, '""') : "";

       // アプリが期待する列順: 学部, 学科, コース名, 教材, 締切, 状態
       var line = [
           '""', // 学部
           '""', // 学科
           '"' + c_course + '"',
           '"' + c_material + '"',
           '"' + c_deadline + '"',
           '"' + c_status + '"'
       ].join(",");

       resultCsv += line + "\n";
   }

   completion(resultCsv);
   ```

4. **アクションを追加: "URLを開く"**
   - 「URLを開く」アクションを追加します。
   - URLの欄には以下のように入力します。
     `https://your-app-url.vercel.app/?csv=`
   - 続けて、「JavaScriptの結果」変数を追加します。
   - 最終的なURL欄は `https://your-app-url.vercel.app/?csv=JavaScriptの結果` のようになります。
   - **重要:** 「JavaScriptの結果」をタップし、「URLエンコード」オプションがあれば有効にしてください。もしなければ、JavaScriptコード内で `encodeURIComponent(resultCsv)` してから返すように修正が必要かもしれません（ショートカットアプリが自動処理する場合もあります）。

5. **ショートカットを実行**
   - SafariでWebClassの「課題実施状況一覧」ページを開きます。
   - 共有シート（四角から矢印が出ているアイコン）をタップし、作成したショートカットを選択します。
   - アプリが開き、データが自動的に読み込まれます。

## 注意点

- WebClassのページ構造（HTML）が変更されると、JavaScriptコードの修正が必要になる場合があります。
- アプリのURL (`https://your-app-url.vercel.app/`) は、実際にデプロイされているURLに置き換えてください。
