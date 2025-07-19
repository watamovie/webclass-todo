import React, { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import { DateTime } from "luxon";
import { v4 as uuidv4 } from "uuid";
import { createEvents } from "ics";
// import domtoimage from 'dom-to-image';
import html2canvas from "html2canvas";

const TODAY = DateTime.local().toISODate(); // 例: "2025-07-19"
const DEFAULT_SPAN_DAYS = 7; // 期間

function useDefaultFilters() {
  const [days, setDays] = useState(DEFAULT_SPAN_DAYS);
  const [startDate, setStartDate] = useState(TODAY);
  const [endDate, setEndDate] = useState(
    DateTime.local().plus({ days: DEFAULT_SPAN_DAYS }).toISODate(),
  );
  const [keyword, setKeyword] = useState("");
  const [statusOpt, setStatusOpt] = useState([]);

  /** 条件をデフォルトへ戻す */
  const resetFilters = () => {
    setDays(DEFAULT_SPAN_DAYS);
    setStartDate(TODAY);
    setEndDate(DateTime.local().plus({ days: DEFAULT_SPAN_DAYS }).toISODate());
    setKeyword("");
    setStatusOpt([]);
  };

  return {
    days,
    startDate,
    endDate,
    keyword,
    statusOpt,
    setDays,
    setStartDate,
    setEndDate,
    setKeyword,
    setStatusOpt,
    resetFilters,
  };
}

function downloadBlob(data, fileName, mimeType) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function App() {
  // State
  const [data, setData] = useState([]);
  const [daysFilter, setDaysFilter] = useState(DEFAULT_SPAN_DAYS);
  const [startDate, setStartDate] = useState(DateTime.local().toISODate());
  const [endDate, setEndDate] = useState(
    DateTime.local().plus({ days: daysFilter }).toISODate(),
  );
  const [statuses, setStatuses] = useState([]);
  const [keyword, setKeyword] = useState("");

  // Filter accordion open state (desktop open by default)
  const [isFilterOpen, setIsFilterOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches,
  );

  // ファイル入力要素をクリアするための ref
  const fileInputRef = useRef(null);

  // テーブルとモバイル用コンテナの参照（忘れるとレンダリング時にエラーになります）
  const tableRef = useRef(null);
  const mobileRef = useRef(null);
  const [preview, setPreview] = useState(null); // {url, name, mime, blob}

  // startDate または daysFilter が変わったら endDate を自動更新
  useEffect(() => {
    const sd = DateTime.fromISO(startDate);
    setEndDate(sd.plus({ days: daysFilter }).toISODate());
  }, [startDate, daysFilter]);

  // マウント時に常に sessionStorage から状態を復元
  useEffect(() => {
    const restore = () => {
      const stored = sessionStorage.getItem("webclass-todo");
      if (!stored) return;
      try {
        const { data: raw, filters } = JSON.parse(stored);
        const parsed = raw.map((r) => ({
          ...r,
          締切: DateTime.fromISO(r.締切, { zone: "Asia/Tokyo" }),
        }));
        setData(parsed);
        setDaysFilter(filters.days);
        setStartDate(filters.startDate);
        setEndDate(filters.endDate);
        setStatuses(filters.statuses);
        setKeyword(filters.keyword);
      } catch (e) {
        console.error("State restore failed:", e);
      }
    };

    // 初回マウント
    restore();
    // 「戻る」で bfcache から復帰したときにも呼ぶ
    window.addEventListener("pageshow", restore);

    return () => {
      window.removeEventListener("pageshow", restore);
    };
  }, []);

  // Persist
  useEffect(() => {
    if (!data.length) return;
    const toStore = {
      data: data.map((r) => ({
        締切: r.締切.toISO(),
        教材: r.教材,
        コース名: r.コース名,
        状態: r.状態,
      })),
      filters: { days: daysFilter, startDate, endDate, statuses, keyword },
    };
    sessionStorage.setItem("webclass-todo", JSON.stringify(toStore));
  }, [data, daysFilter, startDate, endDate, statuses, keyword]);

  // File upload parsing
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ({ target }) => {
      const lines = target.result.split(/\r?\n/);
      const idx = lines.findIndex((l) =>
        l.startsWith('"学部","学科","コース名","教材","締切"'),
      );
      if (idx < 0) {
        alert("ヘッダー行が見つかりません");
        return;
      }
      const csvText = lines.slice(idx).join("\n");
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data: rows, meta }) => {
          const map = {
            締切: ["締切", "締切日", "期限"],
            教材: ["教材", "課題", "タイトル"],
            コース名: ["コース名", "科目名", "講義名"],
            状態: ["状態", "ステータス", "提出状況"],
          };
          const fieldMap = {};
          Object.entries(map).forEach(([key, aliases]) => {
            const found = meta.fields.find((f) => aliases.includes(f));
            if (found) fieldMap[key] = found;
          });
          const missing = Object.keys(map).filter((k) => !fieldMap[k]);
          if (missing.length) {
            alert(`列が見つかりません: ${missing.join(", ")}`);
            return;
          }
          const parsed = rows.map((r) => {
            let dt = DateTime.fromISO(r[fieldMap["締切"]], {
              zone: "Asia/Tokyo",
            });
            if (!dt.isValid)
              dt = DateTime.fromFormat(
                r[fieldMap["締切"]],
                "yyyy-MM-dd HH:mm",
                { zone: "Asia/Tokyo" },
              );
            return {
              締切: dt,
              教材: r[fieldMap["教材"]] || "",
              コース名: r[fieldMap["コース名"]] || "",
              状態: r[fieldMap["状態"]] || "",
            };
          });
          setData(parsed);
        },
      });
    };
    reader.readAsText(file, "utf-8");
  };

  // Filter
  const filtered = data
    .filter((r) => r.締切.isValid)
    .filter((r) => {
      const d = r.締切;
      const s = DateTime.fromISO(startDate);
      const e = DateTime.fromISO(endDate);
      return d >= s && d <= e;
    })
    .filter((r) => !statuses.length || statuses.includes(r.状態))
    .filter(
      (r) =>
        !keyword || r.教材.includes(keyword) || r.コース名.includes(keyword),
    )
    .sort((a, b) => a.締切 - b.締切);

  // Utils
  const saveFile = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openPreview = (blob, name, mime) => {
    if (mime === "text/csv") {
      blob.text().then((text) => {
        const { data: rows } = Papa.parse(text.trim());
        setPreview({ name, mime, blob, rows });
      });
    } else {
      const url = URL.createObjectURL(blob);
      setPreview({ url, name, mime, blob });
    }
  };

  const closePreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const confirmDownload = () => {
    if (preview) {
      saveFile(preview.blob, preview.name);
      closePreview();
    }
  };

  const exportCSV = () => {
    const csv = Papa.unparse(filtered, {
      columns: ["締切", "教材", "コース名", "状態"],
    });
    const blob = new Blob([csv], { type: "text/csv" });
    openPreview(blob, "todo_filtered.csv", "text/csv");
  };

  const exportICS = () => {
    if (!filtered.length) return;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//WebClass ToDo//JP",
      "CALSCALE:GREGORIAN",
      "X-WR-TIMEZONE:Asia/Tokyo",
      "BEGIN:VTIMEZONE",
      "TZID:Asia/Tokyo",
      "BEGIN:STANDARD",
      "TZOFFSETFROM:+0900",
      "TZOFFSETTO:+0900",
      "TZNAME:JST",
      "DTSTART:19700101T000000",
      "END:STANDARD",
      "END:VTIMEZONE",
    ];
    const now = DateTime.utc().toFormat("yyyyMMdd'T'HHmmss'Z'");
    filtered.forEach((r) => {
      const dt = r.締切.setZone("Asia/Tokyo");
      const dtStr = dt.toFormat("yyyyMMdd'T'HHmmss");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uuidv4()}@webclass`,
        `DTSTAMP:${now}`,
        `DTSTART;TZID=Asia/Tokyo:${dtStr}`,
        `SUMMARY:${r.教材} (${r.コース名})`,
        "END:VEVENT",
      );
    });
    lines.push("END:VCALENDAR");
    downloadBlob(lines.join("\r\n"), "webclass_todo.ics", "text/calendar");
  };

  const exportTodoist = () => {
    const recs = filtered.map((r) => ({
      TYPE: "task",
      CONTENT: `${r.教材} (${r.コース名})`,
      DATE: r.締切.toFormat("yyyy-MM-dd HH:mm"),
      DATE_LANG: "ja",
      TIMEZONE: "Asia/Tokyo",
    }));
    const csv = Papa.unparse(recs);
    const blob = new Blob([csv], { type: "text/csv" });
    openPreview(blob, "todoist_template.csv", "text/csv");
  };

  const exportPNGList = () => {
    // Current theme colors
    const styles = getComputedStyle(document.documentElement);
    const bg = styles.getPropertyValue("--bg").trim() || "#ffffff";
    const surface = styles.getPropertyValue("--surface").trim() || "#ffffff";
    const border = styles.getPropertyValue("--border").trim() || "#ddd";
    const text = styles.getPropertyValue("--text").trim() || "#000";

    // 縦型: フィルタ済みデータから手動でカード要素を生成
    let wrapper = document.createElement("div");
    wrapper.style.backgroundColor = bg;
    wrapper.style.color = text;
    wrapper.style.padding = "1rem";
    filtered.forEach((r) => {
      const card = document.createElement("div");
      card.style.margin = "0.5rem 0";
      card.style.padding = "0.75rem";
      card.style.border = `1px solid ${border}`;
      card.style.borderRadius = "4px";
      card.style.background = surface;
      const fields = [
        ["締切", r.締切.toFormat("yyyy-MM-dd HH:mm")],
        ["教材", r.教材],
        ["コース", r.コース名],
        ["状態", r.状態],
      ];
      fields.forEach(([label, value]) => {
        const row = document.createElement("div");
        row.style.marginBottom = "0.25rem";
        const keyEl = document.createElement("span");
        keyEl.style.fontWeight = "bold";
        keyEl.textContent = `${label}: `;
        const valEl = document.createElement("span");
        valEl.textContent = value;
        row.appendChild(keyEl);
        row.appendChild(valEl);
        card.appendChild(row);
      });
      wrapper.appendChild(card);
    });
    document.body.appendChild(wrapper);
    html2canvas(wrapper, {
      scale: 2,
      backgroundColor: bg,
      useCORS: true,
      width: wrapper.scrollWidth,
      height: wrapper.scrollHeight,
    })
      .then((canvas) =>
        canvas.toBlob(
          (blob) => openPreview(blob, "webclass_todo_mobile.png", "image/png"),
          "image/png",
        ),
      )
      .catch(() => alert("webclass_todo_mobile.png の生成に失敗しました"))
      .finally(() => {
        if (wrapper) document.body.removeChild(wrapper);
      });
  };

  const exportPNGTable = (isMobile) => {
    const name = isMobile
      ? "webclass_todo_mobile.png"
      : "webclass_todo_table.png";
    const styles = getComputedStyle(document.documentElement);
    const bg = styles.getPropertyValue("--bg").trim() || "#ffffff";
    const surface = styles.getPropertyValue("--surface").trim() || "#ffffff";
    const border = styles.getPropertyValue("--border").trim() || "#ddd";
    const text = styles.getPropertyValue("--text").trim() || "#000";

    let wrapper = null;
    if (isMobile) {
      // 縦型: フィルタ済みデータから手動でカード要素を生成
      wrapper = document.createElement("div");
      wrapper.style.backgroundColor = bg;
      wrapper.style.color = text;
      wrapper.style.padding = "1rem";
      filtered.forEach((r) => {
        const card = document.createElement("div");
        card.style.margin = "0.5rem 0";
        card.style.padding = "0.75rem";
        card.style.border = `1px solid ${border}`;
        card.style.borderRadius = "4px";
        card.style.background = surface;
        const fields = [
          ["締切", r.締切.toFormat("yyyy-MM-dd HH:mm")],
          ["教材", r.教材],
          ["コース", r.コース名],
          ["状態", r.状態],
        ];
        fields.forEach(([label, value]) => {
          const row = document.createElement("div");
          row.style.marginBottom = "0.25rem";
          const keyEl = document.createElement("span");
          keyEl.style.fontWeight = "bold";
          keyEl.textContent = `${label}: `;
          const valEl = document.createElement("span");
          valEl.textContent = value;
          row.appendChild(keyEl);
          row.appendChild(valEl);
          card.appendChild(row);
        });
        wrapper.appendChild(card);
      });
      document.body.appendChild(wrapper);
    } else {
      // 横型: テーブルをクローンしてラッパーに入れる
      const container = tableRef.current;
      if (!container) return;
      const tableEl = container.querySelector("table");
      if (!tableEl) return;
      wrapper = document.createElement("div");
      wrapper.style.backgroundColor = bg;
      wrapper.style.color = text;
      wrapper.style.padding = "1rem";
      wrapper.appendChild(tableEl.cloneNode(true));
      document.body.appendChild(wrapper);
    }
    // html2canvas でキャプチャ
    html2canvas(wrapper, {
      scale: 2,
      backgroundColor: bg,
      useCORS: true,
      width: wrapper.scrollWidth,
      height: wrapper.scrollHeight,
    })
      .then((canvas) =>
        canvas.toBlob(
          (blob) => openPreview(blob, name, "image/png"),
          "image/png",
        ),
      )
      .catch(() => alert(`${name} の生成に失敗しました`))
      .finally(() => {
        if (wrapper) document.body.removeChild(wrapper);
      });
  };

  const shareToReminders = () => {
    if (!navigator.canShare || !navigator.canShare({ files: [] })) return;
    const { error, value } = createEvents({
      events: filtered.map((r) => ({
        start: [
          r.締切.year,
          r.締切.month,
          r.締切.day,
          r.締切.hour,
          r.締切.minute,
        ],
        title: `${r.教材} (${r.コース名})`,
      })),
    });
    if (!error) {
      const file = new File(
        [new Blob([value], { type: "text/calendar" })],
        "webclass_todo.ics",
      );
      navigator.share({ files: [file], title: "WebClass To-Do" });
    }
  };

  // ファイル選択＆抽出結果をリセット
  const clearFile = () => {
    setData([]);

    // 抽出条件のリセット
    const today = DateTime.local().toISODate();
    setDaysFilter(DEFAULT_SPAN_DAYS);
    setStartDate(today);
    setEndDate(
      DateTime.fromISO(today).plus({ days: DEFAULT_SPAN_DAYS }).toISODate(),
    );
    setStatuses([]);
    setKeyword("");

    sessionStorage.removeItem("webclass-todo");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Render
  return (
    <>
      <div className="container">
        <header>
          <h1 onClick={clearFile} style={{ cursor: "pointer" }}>📋 WebClass To-Do</h1>
          {/* ファイル解除ボタンはデータ読み込み後だけ表示 */}
          {data.length > 0 && (
            <button onClick={clearFile} style={{ marginLeft: "1rem" }}>
              🚪 ファイル選択解除
            </button>
          )}
        </header>
        {!data.length && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFile}
            />
            <p>課題実施状況一覧のCSVを選択してください。</p>
          </>
        )}
        {data.length > 0 && (
          <>
            <aside className="sidebar">
              <details
                className="filter-accordion"
                open={isFilterOpen}
                onToggle={(e) => setIsFilterOpen(e.target.open)}
              >
                <summary>🔍 抽出条件</summary>
                <div className="filter-fields">
                  <label htmlFor="daysFilter">期間を指定（日）:</label>
                  <div className="number-spinner">
                    <button
                      type="button"
                      onClick={() => setDaysFilter((d) => Math.max(0, d - 1))}
                      aria-label="減らす"
                    >
                      −
                    </button>
                    <input
                      id="daysFilter"
                      type="number"
                      min={0}
                      value={daysFilter}
                      onChange={(e) => setDaysFilter(Number(e.target.value))}
                    />
                    <button
                      type="button"
                      onClick={() => setDaysFilter((d) => d + 1)}
                      aria-label="増やす"
                    >
                      ＋
                    </button>
                  </div>
                  <label>
                    開始日:
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </label>
                  <label>
                    終了日:
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </label>
                  <label>
                    状態で絞り込み:
                    <select
                      multiple
                      value={statuses}
                      onChange={(e) =>
                        setStatuses(
                          Array.from(e.target.selectedOptions, (o) => o.value),
                        )
                      }
                    >
                      {[...new Set(data.map((r) => r.状態))].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    キーワード:
                    <input
                      type="text"
                      placeholder="例: Python"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                    />
                  </label>
                </div>
              </details>
            </aside>
            <main className="main">
              <div className="metrics">
                <span>抽出件数: {filtered.length}</span>
                {filtered.length > 0 && (
                  <span>
                    次の締切: {filtered[0].締切.toFormat("yyyy-MM-dd")}
                  </span>
                )}
              </div>
              <div
                className="table-container"
                ref={tableRef}
                style={{ overflowX: "auto" }}
              >
                <table style={{ fontSize: "0.875rem", lineHeight: "1.4" }}>
                  <thead>
                    <tr>
                      <th>締切</th>
                      <th>教材</th>
                      <th>コース名</th>
                      <th>状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <tr key={i}>
                        <td>{r.締切.toFormat("yyyy-MM-dd HH:mm")}</td>
                        <td>{r.教材}</td>
                        <td>{r.コース名}</td>
                        <td>{r.状態}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="button-group">
                <button onClick={exportCSV}>CSV ダウンロード</button>
                <button onClick={exportICS}>
                  iCalendar (.ics) ダウンロード
                </button>
                <button onClick={exportTodoist}>
                  Todoist CSV ダウンロード
                </button>
                <button onClick={() => exportPNGTable(false)}>
                  PNG（テーブル）
                </button>
                <button onClick={exportPNGList}>PNG（縦リスト）</button>
              </div>
              <div
                className="mobile-container"
                ref={mobileRef}
                style={{ display: "none" }}
              >
                {filtered.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      margin: "0.5rem 0",
                      padding: "0.75rem",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      background: "#fff",
                    }}
                  >
                    <div>
                      <strong>締切:</strong>{" "}
                      {r.締切.toFormat("yyyy-MM-dd HH:mm")}
                    </div>
                    <div>
                      <strong>教材:</strong> {r.教材}
                    </div>
                    <div>
                      <strong>コース:</strong> {r.コース名}
                    </div>
                    <div>
                      <strong>状態:</strong> {r.状態}
                    </div>
                  </div>
                ))}
              </div>
            </main>
          </>
        )}
      </div>
      {preview && (
        <div className="modal-overlay" onClick={closePreview}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {preview.mime.startsWith("image/") ? (
              <img
                src={preview.url}
                alt={preview.name}
                style={{
                  maxWidth: "80vw",
                  maxHeight: "80vh",
                  objectFit: "contain",
                }}
              />
            ) : preview.mime === "text/csv" ? (
              <div className="csv-preview">
                <table>
                  <thead>
                    <tr>
                      {preview.rows[0].map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(1).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <iframe
                src={preview.url}
                title="preview"
                style={{ width: "80vw", height: "60vh", border: "none" }}
              />
            )}
            <div style={{ textAlign: "right", marginTop: "1rem" }}>
              <button onClick={confirmDownload} className="primary">
                ダウンロード
              </button>
              <button onClick={closePreview} style={{ marginLeft: "0.5rem" }}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
