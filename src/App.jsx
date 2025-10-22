import React, { useState, useRef, useEffect, useCallback } from "react";
import Papa from "papaparse";
import { DateTime } from "luxon";
import { v4 as uuidv4 } from "uuid";
import { createEvents } from "ics";
// import domtoimage from 'dom-to-image';
import html2canvas from "html2canvas";

const TODAY = DateTime.local().toISODate(); // 例: "2025-07-19"
const DEFAULT_SPAN_DAYS = 7; // 期間
const REMINDER_SHORTCUT_NAME = "WebClass Reminders";
const REMINDER_INSTALL_URL =
  "https://www.icloud.com/shortcuts/fdadcf1171ad4a8a82f7b2d6f494a57f";
const REMINDER_EXCLUDED_STATUSES = ["合格", "回答済み"];

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

const parseLength = (value) => {
  if (value == null) return null;
  const num = parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
};

const getCanvasDimensions = (svgEl) => {
  if (!svgEl) return { width: null, height: null };
  let width = parseLength(svgEl.getAttribute("width"));
  let height = parseLength(svgEl.getAttribute("height"));
  const viewBox = svgEl.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map((n) => Number(n))
      .filter((n) => !Number.isNaN(n));
    if (parts.length === 4) {
      if (width == null) width = parts[2];
      if (height == null) height = parts[3];
    }
  }
  return { width, height };
};

const approxEqual = (a, b, tolerance) => {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
};

const removeCanvasSizedBackgrounds = (svgEl, width, height) => {
  if (width == null || height == null) {
    return { removed: 0, attempted: false };
  }
  const rects = Array.from(svgEl.querySelectorAll("rect"));
  let removed = 0;
  const tolW = Math.max(Math.abs(width) * 0.001, 0.01);
  const tolH = Math.max(Math.abs(height) * 0.001, 0.01);
  const tolPos = Math.max(Math.abs(width), Math.abs(height), 1) * 0.001;
  rects.forEach((rect) => {
    if (rect.closest("defs")) return;
    const w = parseLength(rect.getAttribute("width"));
    const h = parseLength(rect.getAttribute("height"));
    const x = parseLength(rect.getAttribute("x")) || 0;
    const y = parseLength(rect.getAttribute("y")) || 0;
    if (
      w != null &&
      h != null &&
      approxEqual(w, width, tolW) &&
      approxEqual(h, height, tolH) &&
      Math.abs(x) <= tolPos &&
      Math.abs(y) <= tolPos
    ) {
      rect.parentNode?.removeChild(rect);
      removed += 1;
    }
  });
  return { removed, attempted: true };
};

const overrideFillInStyle = (style, fillColor) => {
  const declarations = style
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
  let found = false;
  const next = declarations.map((decl) => {
    const [prop, ...rest] = decl.split(":");
    if (!prop || rest.length === 0) return decl;
    const key = prop.trim();
    const value = rest.join(":").trim();
    if (key.toLowerCase() === "fill") {
      found = true;
      return `${key}: ${fillColor}`;
    }
    return `${key}: ${value}`;
  });
  if (!found) {
    next.push(`fill: ${fillColor}`);
  }
  return next.join("; ");
};

const applyFillColorToSvg = (svgEl, fillColor) => {
  const selector = "path, rect, circle, ellipse, polygon, polyline, use";
  const elements = Array.from(svgEl.querySelectorAll(selector));
  let updated = 0;
  elements.forEach((el) => {
    if (el.closest("defs")) return;
    el.setAttribute("fill", fillColor);
    const style = el.getAttribute("style");
    if (style) {
      el.setAttribute("style", overrideFillInStyle(style, fillColor));
    }
    updated += 1;
  });
  return updated;
};

function SvgTools() {
  const [svgInput, setSvgInput] = useState("");
  const [svgOutput, setSvgOutput] = useState("");
  const [removeBackground, setRemoveBackground] = useState(true);
  const [applyFill, setApplyFill] = useState(true);
  const [fillColor, setFillColor] = useState("#000000");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [downloadName, setDownloadName] = useState("edited.svg");
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ({ target }) => {
      if (typeof target?.result !== "string") return;
      setSvgInput(target.result);
      setSvgOutput("");
      setStatus("");
      setError("");
    };
    reader.readAsText(file, "utf-8");
    const baseName = file.name.replace(/\.svg$/i, "");
    setDownloadName(`${baseName || "svg"}-edited.svg`);
  };

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleProcess = () => {
    setError("");
    setStatus("");
    if (!svgInput.trim()) {
      setError("SVG を入力してください。");
      return;
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgInput, "image/svg+xml");
      const parseError = doc.querySelector("parsererror");
      if (parseError) {
        throw new Error(parseError.textContent || "SVG の解析に失敗しました。");
      }
      const svgEl = doc.querySelector("svg");
      if (!svgEl) {
        throw new Error("<svg> 要素が見つかりませんでした。");
      }
      const { width, height } = getCanvasDimensions(svgEl);
      const statusParts = [];
      if (removeBackground) {
        const { removed, attempted } = removeCanvasSizedBackgrounds(
          svgEl,
          width,
          height,
        );
        if (!attempted) {
          statusParts.push("キャンバスサイズを取得できなかったため背景を削除できませんでした。");
        } else if (removed) {
          statusParts.push(`背景矩形を ${removed} 件削除しました。`);
        } else {
          statusParts.push("削除対象の背景は見つかりませんでした。");
        }
      }
      if (applyFill) {
        const changed = applyFillColorToSvg(svgEl, fillColor);
        statusParts.push(
          changed
            ? `図形 ${changed} 件の塗りつぶしを ${fillColor} に変更しました。`
            : "塗りつぶしを変更する図形が見つかりませんでした。",
        );
      }
      const serializer = new XMLSerializer();
      const xmlDeclMatch = svgInput.match(/^\s*<\?xml[^>]*>/i);
      const serialized = serializer.serializeToString(svgEl);
      const output = (xmlDeclMatch ? `${xmlDeclMatch[0]}\n` : "") + serialized;
      setSvgOutput(output);
      setStatus(statusParts.filter(Boolean).join(" / ") || "変更はありませんでした。");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
      setSvgOutput("");
    }
  };

  const handleDownload = () => {
    if (!svgOutput) return;
    downloadBlob(svgOutput, downloadName, "image/svg+xml");
  };

  const handleClear = () => {
    setSvgInput("");
    setSvgOutput("");
    setStatus("");
    setError("");
    setDownloadName("edited.svg");
    resetFileInput();
  };

  return (
    <section className="svg-tools" aria-labelledby="svg-tools-heading">
      <h2 id="svg-tools-heading">🖼️ SVG ツール</h2>
      <p>
        SVG の背景を削除したり、塗りつぶし色を一括変更するための簡易ツールです。
        ファイルを読み込むかソースコードを貼り付けてから実行してください。
      </p>
      <div className="svg-tools-controls">
        <div className="svg-tools-options">
          <label>
            <input type="checkbox" checked={removeBackground} onChange={(e) => setRemoveBackground(e.target.checked)} />
            キャンバスと同じサイズの背景を削除
          </label>
          <label>
            <input type="checkbox" checked={applyFill} onChange={(e) => setApplyFill(e.target.checked)} />
            塗りつぶし色を一括変更
          </label>
          <input
            type="color"
            value={fillColor}
            onChange={(e) => setFillColor(e.target.value)}
            disabled={!applyFill}
            aria-label="塗りつぶし色"
          />
          <span className="svg-tools-color-value">{fillColor}</span>
        </div>
        <div className="svg-tools-file-row">
          <input
            ref={fileInputRef}
            type="file"
            accept=".svg,image/svg+xml"
            onChange={handleFileChange}
          />
          <div className="svg-tools-action-buttons">
            <button type="button" onClick={handleProcess} disabled={!svgInput.trim()}>
              変換を実行
            </button>
            <button type="button" onClick={handleClear}>
              クリア
            </button>
          </div>
        </div>
      </div>
      <div className="svg-tools-textareas">
        <div>
          <h3>入力 SVG</h3>
          <textarea
            value={svgInput}
            onChange={(e) => setSvgInput(e.target.value)}
            placeholder="SVG のソースを貼り付けるか、ファイルを選択してください。"
          />
        </div>
        <div>
          <h3>変換結果</h3>
          <textarea
            value={svgOutput}
            onChange={(e) => setSvgOutput(e.target.value)}
            placeholder="変換結果がここに表示されます。"
          />
          <div className="svg-tools-actions">
            <button type="button" onClick={handleDownload} disabled={!svgOutput}>
              SVG をダウンロード
            </button>
            {status && <span className="svg-tools-status">{status}</span>}
          </div>
          <div className="svg-tools-preview">
            {svgOutput ? (
              <div dangerouslySetInnerHTML={{ __html: svgOutput }} />
            ) : (
              <span className="svg-tools-empty-preview">ここにプレビューが表示されます。</span>
            )}
          </div>
        </div>
      </div>
      {error && <div className="svg-tools-error">{error}</div>}
    </section>
  );
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
      const isFormElement = e.target.closest('input,textarea,select');
      if (isFormElement && e.key !== 'Escape') return;
      if (e.key === 'Escape') {
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
  }, [preview]);

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

  const runReminderShortcut = useCallback((items) => {
    if (!items.length) {
      alert("送信できる項目がありません。");
      return false;
    }
    if (typeof window === "undefined") return false;
    const ua = window.navigator?.userAgent || "";
    const isIOS = /iP(hone|od|ad)/.test(ua);
    if (!isIOS) {
      alert("iPhone / iPad の Safari からアクセスして実行してください。");
      return false;
    }
    const payload = JSON.stringify({
      tasks: items.map((item) => ({
        title: `${item.教材} (${item.コース名})`,
        note: `状態: ${item.状態 || "未設定"}`,
        dueDate: item.締切.setZone("Asia/Tokyo").toISO(),
      })),
    });
    const url = `shortcuts://run-shortcut?name=${encodeURIComponent(
      REMINDER_SHORTCUT_NAME,
    )}&input=text&text=${encodeURIComponent(payload)}`;

    let fallbackTimer = 0;
    let didLeavePage = false;

    function cleanup() {
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        didLeavePage = true;
        cleanup();
      }
    }

    function handlePageHide() {
      didLeavePage = true;
      cleanup();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    fallbackTimer = window.setTimeout(() => {
      if (!didLeavePage) {
        cleanup();
        const shouldInstall = window.confirm(
          "ショートカットを起動できませんでした。インストールページを開きますか？",
        );
        if (shouldInstall) {
          window.location.href = REMINDER_INSTALL_URL;
        }
      }
    }, 2000);

    window.location.href = url;
    return true;
  }, []);

  const handleReminderButtonClick = () => {
    const exclusions = new Set(
      REMINDER_EXCLUDED_STATUSES.map((status) => status.trim()),
    );
    const items = filtered.filter((item) => {
      const status = (item.状態 || "").trim();
      return !exclusions.has(status);
    });
    runReminderShortcut(items);
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

  const shareToReminders = () => {
    try {
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
    } catch (e) {
      console.error(e);
      alert("共有に失敗しました");
    }
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
                <button onClick={exportTodoist}>
                  Todoist CSV ダウンロード
                </button>
                <button onClick={() => exportPNGTable(false)}>
                  PNG（テーブル）
                </button>
                <button onClick={exportPNGList}>PNG（縦リスト）</button>
                <button onClick={handleReminderButtonClick} className="primary">
                  📲 リマインダーに追加
                </button>
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
      <SvgTools />
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
