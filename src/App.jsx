import React, { useState, useRef, useEffect, useMemo } from "react";
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

// ------ Image helper utilities ------
const getThemeColors = () => {
  const styles = getComputedStyle(document.documentElement);
  return {
    bg: styles.getPropertyValue("--bg").trim() || "#ffffff",
    surface: styles.getPropertyValue("--surface").trim() || "#ffffff",
    border: styles.getPropertyValue("--border").trim() || "#ddd",
    text: styles.getPropertyValue("--text").trim() || "#000",
  };
};

const buildImageWrapper = (isMobile, filtered, tableRef) => {
  const { bg, surface, border, text } = getThemeColors();
  const wrapper = document.createElement("div");
  wrapper.style.backgroundColor = bg;
  wrapper.style.color = text;
  wrapper.style.padding = "1rem";
  if (isMobile) {
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
  } else {
    const container = tableRef.current;
    if (!container) return null;
    const tableEl = container.querySelector("table");
    if (!tableEl) return null;
    wrapper.appendChild(tableEl.cloneNode(true));
  }
  return wrapper;
};

const captureAndPreview = async (wrapper, name, openPreview) => {
  if (!wrapper) return;
  const { bg } = getThemeColors();
  document.body.appendChild(wrapper);
  try {
    const canvas = await html2canvas(wrapper, {
      scale: window.devicePixelRatio || 2,
      backgroundColor: bg,
      useCORS: true,
      width: wrapper.scrollWidth,
      height: wrapper.scrollHeight,
    });
    canvas.toBlob((blob) => openPreview(blob, name, "image/png"), "image/png");
  } catch (e) {
    alert(`${name} の生成に失敗しました`);
  } finally {
    document.body.removeChild(wrapper);
  }
};

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
  const [sortField, setSortField] = useState("締切");
  const [sortAsc, setSortAsc] = useState(true);

  // Filter accordion open state (desktop open by default)
  const [isFilterOpen, setIsFilterOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches,
  );

  // ファイル入力要素をクリアするための ref
  const fileInputRef = useRef(null);

  // テーブルの参照（PNG 書き出し用）
  const tableRef = useRef(null);
  const [preview, setPreview] = useState(null); // {url, name, mime, blob}
  const [reminderModal, setReminderModal] = useState(null);

  // refs for latest handlers (used by hotkeys)
  const handlersRef = useRef({});

  // フィルタ条件のみリセット
  const resetFilters = () => {
    const today = DateTime.local().toISODate();
    setDaysFilter(DEFAULT_SPAN_DAYS);
    setStartDate(today);
    setEndDate(
      DateTime.fromISO(today).plus({ days: DEFAULT_SPAN_DAYS }).toISODate(),
    );
    setStatuses([]);
    setKeyword("");
    setSortField("締切");
    setSortAsc(true);
  };

  // startDate または daysFilter が変わったら endDate を自動更新
  useEffect(() => {
    const sd = DateTime.fromISO(startDate);
    setEndDate(sd.plus({ days: daysFilter }).toISODate());
  }, [startDate, daysFilter]);

  const prevStateRef = useRef(null);

  // マウント時に履歴・sessionStorage から状態を復元
  useEffect(() => {
    const applyState = (state) => {
      if (!state) return;
      try {
        const { data: raw, filters } = state;
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
        if (filters.sortField) setSortField(filters.sortField);
        if (typeof filters.sortAsc === "boolean") setSortAsc(filters.sortAsc);
        prevStateRef.current = JSON.stringify(state);
      } catch (e) {
        console.error("State apply failed:", e);
      }
    };

    const restore = () => {
      let state = window.history.state;
      if (!state) {
        const stored = sessionStorage.getItem("webclass-todo");
        if (stored) {
          try {
            state = JSON.parse(stored);
          } catch {}
        }
      }
      if (state) {
        applyState(state);
        window.history.replaceState(state, "");
      }
    };

    restore();
    window.addEventListener("pageshow", restore);
    const onPop = (e) => applyState(e.state);
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("popstate", onPop);
    };
  }, [preview]);

  // Persist and push history
  useEffect(() => {
    const state = {
      data: data.map((r) => ({
        締切: r.締切.toISO(),
        教材: r.教材,
        コース名: r.コース名,
        状態: r.状態,
      })),
      filters: {
        days: daysFilter,
        startDate,
        endDate,
        statuses,
        keyword,
        sortField,
        sortAsc,
      },
    };
    const json = JSON.stringify(state);
    if (prevStateRef.current === null) {
      window.history.replaceState(state, "");
    } else if (prevStateRef.current !== json) {
      window.history.pushState(state, "");
    }
    prevStateRef.current = json;

    if (data.length) {
      sessionStorage.setItem("webclass-todo", json);
    } else {
      sessionStorage.removeItem("webclass-todo");
    }
  }, [data, daysFilter, startDate, endDate, statuses, keyword, sortField, sortAsc]);

  // Keep latest handlers for hotkeys
  useEffect(() => {
    handlersRef.current = {
      exportCSV,
      exportICS,
      exportTodoist,
      exportPNGTable,
      exportPNGList,
      closePreview,
      confirmDownload,
      resetFilters,
    };
  });

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      const h = handlersRef.current;
      if (e.target.closest('input,textarea,select')) return;
      if (e.key === 'Escape') {
        if (reminderModal) {
          closeReminderModal();
          return;
        }
        h.closePreview();
      } else if (e.key === 'Enter' && preview) {
        e.preventDefault();
        h.confirmDownload();
      } else if (e.key === 'o' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        fileInputRef.current?.click();
      } else if (e.key === 'c' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        h.exportCSV();
      } else if (e.key === 'i' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        h.exportICS();
      } else if (e.key === 't' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        h.exportTodoist();
      } else if (e.key === 'p' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        h.exportPNGTable(false);
      } else if (e.key === 'l' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        h.exportPNGList();
      } else if (e.key === 'r' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        h.resetFilters();
      } else if (e.key === 'h' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        window.open('./usage.html', '_blank');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preview, reminderModal]);

  // Global error handling
  useEffect(() => {
    const onError = (e) => {
      console.error('Unhandled error:', e.error || e);
      alert('エラーが発生しました: ' + (e.error?.message || e.message));
    };
    const onRejection = (e) => {
      console.error('Unhandled promise rejection:', e.reason);
      alert('エラーが発生しました: ' + e.reason);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

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
    .sort((a, b) => {
      const va =
        sortField === "締切" ? a.締切.toMillis() : a[sortField] || "";
      const vb =
        sortField === "締切" ? b.締切.toMillis() : b[sortField] || "";
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

  const nextDeadline = filtered.reduce((min, r) => {
    if (!min || r.締切 < min) return r.締切;
    return min;
  }, null);

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

  const closeReminderModal = () => setReminderModal(null);

  const confirmDownload = () => {
    if (preview) {
      saveFile(preview.blob, preview.name);
      closePreview();
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const exportCSV = () => {
    try {
      const csv = Papa.unparse(filtered, {
        columns: ["締切", "教材", "コース名", "状態"],
      });
      const blob = new Blob([csv], { type: "text/csv" });
      openPreview(blob, "todo_filtered.csv", "text/csv");
    } catch (e) {
      console.error(e);
      alert("CSV の生成に失敗しました");
    }
  };

  const exportICS = () => {
    if (!filtered.length) return;
    try {
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
    } catch (e) {
      console.error(e);
      alert("iCalendar の生成に失敗しました");
    }
  };

  const exportTodoist = () => {
    try {
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
    } catch (e) {
      console.error(e);
      alert("Todoist CSV の生成に失敗しました");
    }
  };

  const exportPNGList = () => {
    const wrapper = buildImageWrapper(true, filtered, tableRef);
    captureAndPreview(wrapper, "webclass_todo_mobile.png", openPreview);
  };

  const exportPNGTable = (isMobile) => {
    const name = isMobile
      ? "webclass_todo_mobile.png"
      : "webclass_todo_table.png";
    const wrapper = buildImageWrapper(isMobile, filtered, tableRef);
    captureAndPreview(wrapper, name, openPreview);
  };

  const shareReminders = async (records) => {
    if (!records.length) {
      alert("追加できる項目がありません");
      return;
    }
    try {
      const { error, value } = createEvents({
        events: records.map((r) => ({
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
      if (error) throw error;

      const blob = new Blob([value], { type: "text/calendar" });
      const fileName = "webclass_todo_reminders.ics";

      if (navigator.canShare && navigator.canShare({ files: [] })) {
        const file = new File([blob], fileName, { type: "text/calendar" });
        try {
          await navigator.share({ files: [file], title: "WebClass To-Do" });
        } catch (shareError) {
          if (shareError?.name !== "AbortError") {
            throw shareError;
          }
        }
      } else {
        downloadBlob(value, fileName, "text/calendar");
        alert("共有機能が利用できないため、iCalendar ファイルをダウンロードしました。");
      }
    } catch (e) {
      console.error(e);
      alert("リマインダーへの追加に失敗しました");
    }
  };

  const EXCLUDED_STATUS_KEYWORDS = ["合格", "実施済", "提出済", "完了"];

  const statusLabel = (status) =>
    status && status.trim() ? status : "(状態なし)";

  const openReminderModal = () => {
    if (!filtered.length) {
      alert("追加できる項目がありません");
      return;
    }
    const availableStatuses = [
      ...new Set(filtered.map((r) => statusLabel(r.状態))),
    ];
    const defaultSelected = availableStatuses.filter(
      (status) =>
        !EXCLUDED_STATUS_KEYWORDS.some((keyword) =>
          status.includes(keyword),
        ),
    );
    setReminderModal({
      sortField,
      sortAsc,
      selectedStatuses:
        defaultSelected.length > 0 ? defaultSelected : availableStatuses,
      availableStatuses,
    });
  };

  const reminderPreview = useMemo(() => {
    if (!reminderModal) return [];
    let rows = filtered;
    if (reminderModal.selectedStatuses?.length) {
      rows = rows.filter((r) =>
        reminderModal.selectedStatuses.includes(statusLabel(r.状態)),
      );
    }
    const sorted = [...rows].sort((a, b) => {
      const field = reminderModal.sortField;
      const asc = reminderModal.sortAsc;
      const va =
        field === "締切" ? a.締切.toMillis() : (a[field] || "").toString();
      const vb =
        field === "締切" ? b.締切.toMillis() : (b[field] || "").toString();
      if (va < vb) return asc ? -1 : 1;
      if (va > vb) return asc ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filtered, reminderModal]);

  const handleReminderStatusChange = (status) => {
    if (!reminderModal) return;
    const current = new Set(reminderModal.selectedStatuses || []);
    if (current.has(status)) {
      current.delete(status);
    } else {
      current.add(status);
    }
    setReminderModal({ ...reminderModal, selectedStatuses: [...current] });
  };

  const handleReminderSortField = (field) => {
    if (!reminderModal) return;
    setReminderModal({ ...reminderModal, sortField: field });
  };

  const handleReminderSortAsc = (asc) => {
    if (!reminderModal) return;
    setReminderModal({ ...reminderModal, sortAsc: asc });
  };

  const confirmReminderShare = async () => {
    if (!reminderModal) return;
    await shareReminders(reminderPreview);
    closeReminderModal();
  };

  // ファイル選択＆抽出結果をリセット
  const clearFile = () => {
    setData([]);

    // 抽出条件のリセット
    resetFilters();

    sessionStorage.removeItem("webclass-todo");

    const state = { data: [], filters: {
      days: DEFAULT_SPAN_DAYS,
      startDate: TODAY,
      endDate: DateTime.fromISO(TODAY).plus({ days: DEFAULT_SPAN_DAYS }).toISODate(),
      statuses: [],
      keyword: "",
      sortField: "締切",
      sortAsc: true,
    }};
    window.history.replaceState(state, "");
    prevStateRef.current = JSON.stringify(state);

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
            <p>
              <a href="./usage.html" target="_blank" rel="noopener" className="button">
                使い方を見る
              </a>
            </p>
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
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="reset-btn"
                  >
                    条件リセット
                  </button>
                </div>
              </details>
            </aside>
            <main className="main">
              <div className="metrics">
                <span>抽出件数: {filtered.length}</span>
                {nextDeadline && (
                  <span>次の締切: {nextDeadline.toFormat("yyyy-MM-dd")}</span>
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
                      <th onClick={() => handleSort("締切")} className="sortable">
                        締切
                        {sortField === "締切" && (
                          <span className="arrow">{sortAsc ? "▲" : "▼"}</span>
                        )}
                      </th>
                      <th onClick={() => handleSort("教材")} className="sortable">
                        教材
                        {sortField === "教材" && (
                          <span className="arrow">{sortAsc ? "▲" : "▼"}</span>
                        )}
                      </th>
                      <th onClick={() => handleSort("コース名")} className="sortable">
                        コース名
                        {sortField === "コース名" && (
                          <span className="arrow">{sortAsc ? "▲" : "▼"}</span>
                        )}
                      </th>
                      <th onClick={() => handleSort("状態")} className="sortable">
                        状態
                        {sortField === "状態" && (
                          <span className="arrow">{sortAsc ? "▲" : "▼"}</span>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: "center" }}>
                          該当するデータがありません
                        </td>
                      </tr>
                    ) : (
                      filtered.map((r, i) => (
                        <tr key={i}>
                          <td>{r.締切.toFormat("yyyy-MM-dd HH:mm")}</td>
                          <td>{r.教材}</td>
                          <td>{r.コース名}</td>
                          <td>{r.状態}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="button-group">
                <button onClick={exportCSV}>CSV ダウンロード</button>
                <button onClick={exportICS}>
                  iCalendar (.ics) ダウンロード
                </button>
                <button onClick={openReminderModal}>
                  📲 iPhone リマインダーに一括追加
                </button>
                <button onClick={exportTodoist}>
                  Todoist CSV ダウンロード
                </button>
                <button onClick={() => exportPNGTable(false)}>
                  PNG（テーブル）
                </button>
                <button onClick={exportPNGList}>PNG（縦リスト）</button>
              </div>
              <div className="list-container">
                {Object.entries(
                  filtered.reduce((acc, r) => {
                    const d = r.締切.toFormat("yyyy-MM-dd");
                    acc[d] = acc[d] ? [...acc[d], r] : [r];
                    return acc;
                  }, {})
                )
                  .sort(([a], [b]) => (a < b ? -1 : 1))
                  .map(([date, rows]) => (
                    <div key={date} className="list-day">
                      <h3 className="list-date">{date}</h3>
                      {rows.map((r, i) => (
                        <div key={i} className="list-item">
                          <div className="list-title">{r.教材}</div>
                          <div className="list-meta">
                            <span>{r.締切.toFormat("HH:mm")}</span>
                            <span>{r.コース名}</span>
                            <span>{r.状態}</span>
                          </div>
                        </div>
                      ))}
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
      {reminderModal && (
        <div className="modal-overlay" onClick={closeReminderModal}>
          <div
            className="modal reminder-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>iPhone リマインダーに一括追加</h2>
            <p className="reminder-modal__description">
              現在の抽出結果から追加する課題を確認し、ソートや状態を調整してから
              リマインダーに送信できます。
            </p>
            <div className="reminder-modal__section">
              <h3>ソート条件</h3>
              <div className="reminder-modal__sort-fields">
                {["締切", "教材", "コース名", "状態"].map((field) => (
                  <label key={field} className="reminder-modal__radio">
                    <input
                      type="radio"
                      name="reminder-sort-field"
                      value={field}
                      checked={reminderModal.sortField === field}
                      onChange={() => handleReminderSortField(field)}
                    />
                    <span>{field}</span>
                  </label>
                ))}
              </div>
              <div className="reminder-modal__sort-order">
                <label className="reminder-modal__radio">
                  <input
                    type="radio"
                    name="reminder-sort-order"
                    value="asc"
                    checked={reminderModal.sortAsc}
                    onChange={() => handleReminderSortAsc(true)}
                  />
                  <span>昇順</span>
                </label>
                <label className="reminder-modal__radio">
                  <input
                    type="radio"
                    name="reminder-sort-order"
                    value="desc"
                    checked={!reminderModal.sortAsc}
                    onChange={() => handleReminderSortAsc(false)}
                  />
                  <span>降順</span>
                </label>
              </div>
            </div>
            <div className="reminder-modal__section">
              <h3>状態で除外</h3>
              {reminderModal.availableStatuses.length ? (
                <div className="reminder-modal__status-list">
                  {reminderModal.availableStatuses.map((status) => {
                    const checked = reminderModal.selectedStatuses.includes(status);
                    return (
                      <label
                        key={status}
                        className={`reminder-modal__status${
                          checked ? " is-selected" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleReminderStatusChange(status)}
                        />
                        <span>{status}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="reminder-modal__empty">状態の情報がありません。</p>
              )}
            </div>
            <div className="reminder-modal__section">
              <h3>追加プレビュー ({reminderPreview.length} 件)</h3>
              <div className="reminder-modal__preview">
                {reminderPreview.length ? (
                  <ul>
                    {reminderPreview.map((r, idx) => (
                      <li key={`${r.教材}-${idx}`}>
                        <div className="reminder-modal__preview-title">
                          {r.教材} <span className="reminder-modal__course">({r.コース名})</span>
                        </div>
                        <div className="reminder-modal__preview-meta">
                          <span>{r.締切.toFormat("yyyy-MM-dd HH:mm")}</span>
                          <span>{statusLabel(r.状態)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="reminder-modal__empty">
                    選択された条件に該当する課題がありません。
                  </p>
                )}
              </div>
            </div>
            <div className="reminder-modal__actions">
              <button
                onClick={confirmReminderShare}
                className="primary"
                disabled={!reminderPreview.length}
              >
                リマインダーに追加
              </button>
              <button onClick={closeReminderModal}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
