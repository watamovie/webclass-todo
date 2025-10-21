import React, { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="320" height="180" viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
  <rect width="320" height="180" rx="20" fill="#2870B4" />
  <circle cx="84" cy="92" r="38" fill="#F2C744" />
  <path d="M142 56h146l-26 99H162z" fill="#F8F9FB" />
  <path d="M208 88c14 0 26 12 26 26s-12 26-26 26-26-12-26-26 12-26 26-26z" fill="#26303B" />
  <text x="56" y="107" font-family="'Noto Sans JP', sans-serif" font-size="28" fill="#1F2428" font-weight="600">Sample</text>
</svg>`;

const DEFAULT_OPTIONS = {
  unit: "px",
  maintainAspect: true,
  backgroundTransparent: false,
  showDimensionLines: true,
  showDimensionLabels: false,
  roundDimensionValues: false,
};

const PRECISION_DIGITS = 2;
const isBrowser = typeof window !== "undefined" && typeof DOMParser !== "undefined";

function parseLength(value) {
  if (!value) return undefined;
  const match = String(value).match(/(-?\d*\.?\d+)/);
  if (!match) return undefined;
  const num = parseFloat(match[1]);
  return Number.isFinite(num) ? num : undefined;
}

function parseSvgMeta(svgText) {
  if (!isBrowser) {
    return {
      width: 320,
      height: 180,
      viewBox: "0 0 320 180",
      signature: "",
      colors: [],
      error: undefined,
    };
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      return {
        width: 320,
        height: 180,
        viewBox: "0 0 320 180",
        signature: "",
        colors: [],
        error: parserError.textContent || "SVG の解析に失敗しました",
      };
    }
    const svgEl = doc.documentElement;
    if (!svgEl || svgEl.tagName.toLowerCase() !== "svg") {
      return {
        width: 320,
        height: 180,
        viewBox: "0 0 320 180",
        signature: "",
        colors: [],
        error: "SVG ルート要素が見つかりません",
      };
    }
    let width = parseLength(svgEl.getAttribute("width"));
    let height = parseLength(svgEl.getAttribute("height"));
    const viewBox = svgEl.getAttribute("viewBox");
    if ((!width || !height) && viewBox) {
      const [, , vbWidth, vbHeight] = viewBox
        .split(/\s+/)
        .map((part) => parseFloat(part));
      if (!width && Number.isFinite(vbWidth)) width = vbWidth;
      if (!height && Number.isFinite(vbHeight)) height = vbHeight;
    }
    if (!width) width = 320;
    if (!height) height = 180;
    const colorSet = new Set();
    svgEl.querySelectorAll("*").forEach((el) => {
      ["fill", "stroke"].forEach((attr) => {
        const val = el.getAttribute(attr);
        if (val && val !== "none" && !val.startsWith("url(")) {
          colorSet.add(val.trim());
        }
      });
      const style = el.getAttribute("style");
      if (style) {
        style
          .split(";")
          .map((decl) => decl.trim())
          .forEach((decl) => {
            if (!decl) return;
            const [prop, val] = decl.split(":").map((part) => part && part.trim());
            if (!prop || !val) return;
            if ((prop === "fill" || prop === "stroke") && val !== "none" && !val.startsWith("url(")) {
              colorSet.add(val);
            }
          });
      }
    });
    return {
      width,
      height,
      viewBox: viewBox || `0 0 ${width} ${height}`,
      signature: `${width}|${height}|${viewBox || "-"}`,
      colors: Array.from(colorSet),
      error: undefined,
    };
  } catch (error) {
    return {
      width: 320,
      height: 180,
      viewBox: "0 0 320 180",
      signature: "",
      colors: [],
      error: error instanceof Error ? error.message : "SVG 解析中に不明なエラーが発生しました",
    };
  }
}

function parseColorToRgb(color) {
  if (!isBrowser || !color) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = "#000";
  ctx.fillStyle = color;
  const computed = ctx.fillStyle;
  if (!computed) return undefined;
  if (computed.startsWith("#")) {
    const hex = computed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b };
    }
  }
  const match = computed.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
    };
  }
  return undefined;
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = ((gn - bn) / delta) % 6;
        break;
      case gn:
        h = (bn - rn) / delta + 2;
        break;
      default:
        h = (rn - gn) / delta + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;
  if (h >= 0 && h < 60) {
    rPrime = c;
    gPrime = x;
  } else if (h >= 60 && h < 120) {
    rPrime = x;
    gPrime = c;
  } else if (h >= 120 && h < 180) {
    gPrime = c;
    bPrime = x;
  } else if (h >= 180 && h < 240) {
    gPrime = x;
    bPrime = c;
  } else if (h >= 240 && h < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }
  const r = Math.round((rPrime + m) * 255);
  const g = Math.round((gPrime + m) * 255);
  const b = Math.round((bPrime + m) * 255);
  const toHex = (value) => value.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function computeNeutralBackground(colors) {
  const fallback = { color: "#f5f5f5", lightness: 0.94 };
  if (!isBrowser || !colors || colors.length === 0) return fallback;
  const rgbs = colors
    .map((color) => parseColorToRgb(color))
    .filter((value) => value);
  if (!rgbs.length) return fallback;
  const sum = rgbs.reduce(
    (acc, rgb) => ({ r: acc.r + rgb.r, g: acc.g + rgb.g, b: acc.b + rgb.b }),
    { r: 0, g: 0, b: 0 },
  );
  const mean = { r: sum.r / rgbs.length, g: sum.g / rgbs.length, b: sum.b / rgbs.length };
  const { h, l } = rgbToHsl(mean.r, mean.g, mean.b);
  let lightness;
  if (l > 0.7) {
    lightness = 0.25;
  } else if (l < 0.3) {
    lightness = 0.9;
  } else {
    lightness = 0.86;
  }
  const color = hslToHex(h, 0, lightness);
  return { color, lightness };
}

function sanitizeSvg(svgText) {
  if (!svgText) return "";
  return svgText.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
}

function formatNumberForInput(value) {
  if (!Number.isFinite(value)) return "";
  const fixed = value.toFixed(PRECISION_DIGITS);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function formatDimensionValue(value, roundToInteger) {
  if (!Number.isFinite(value)) return "";
  if (roundToInteger) {
    return Math.round(value).toString();
  }
  return value.toFixed(PRECISION_DIGITS).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export default function App() {
  const [svgText, setSvgText] = useState(DEFAULT_SVG);
  const [unit, setUnit] = useState(DEFAULT_OPTIONS.unit);
  const [maintainAspect, setMaintainAspect] = useState(DEFAULT_OPTIONS.maintainAspect);
  const [backgroundTransparent, setBackgroundTransparent] = useState(
    DEFAULT_OPTIONS.backgroundTransparent,
  );
  const [showDimensionLines, setShowDimensionLines] = useState(
    DEFAULT_OPTIONS.showDimensionLines,
  );
  const [showDimensionLabels, setShowDimensionLabels] = useState(
    DEFAULT_OPTIONS.showDimensionLabels,
  );
  const [roundDimensionValues, setRoundDimensionValues] = useState(
    DEFAULT_OPTIONS.roundDimensionValues,
  );
  const [widthInput, setWidthInput] = useState("320");
  const [heightInput, setHeightInput] = useState("180");

  const aspectRatioRef = useRef(320 / 180);
  const lastSignatureRef = useRef(null);
  const markerIdRef = useRef(null);
  if (!markerIdRef.current) {
    markerIdRef.current = `dim-arrow-${Math.random().toString(36).slice(2, 10)}`;
  }
  const markerId = markerIdRef.current;

  const svgMeta = useMemo(() => parseSvgMeta(svgText), [svgText]);
  const neutralBackground = useMemo(
    () => computeNeutralBackground(svgMeta.colors),
    [svgMeta.colors],
  );
  const sanitizedSvg = useMemo(() => sanitizeSvg(svgText), [svgText]);

  useEffect(() => {
    if (!svgMeta.signature || svgMeta.signature === lastSignatureRef.current) return;
    if (svgMeta.width) setWidthInput(formatNumberForInput(svgMeta.width));
    if (svgMeta.height) setHeightInput(formatNumberForInput(svgMeta.height));
    if (svgMeta.width && svgMeta.height && svgMeta.height !== 0) {
      aspectRatioRef.current = svgMeta.width / svgMeta.height;
    }
    lastSignatureRef.current = svgMeta.signature;
  }, [svgMeta.signature, svgMeta.width, svgMeta.height]);

  useEffect(() => {
    const width = parseFloat(widthInput);
    const height = parseFloat(heightInput);
    if (Number.isFinite(width) && Number.isFinite(height) && height !== 0) {
      aspectRatioRef.current = width / height;
    }
  }, [widthInput, heightInput]);

  useEffect(() => {
    if (!maintainAspect) return;
    const width = parseFloat(widthInput);
    const height = parseFloat(heightInput);
    if (Number.isFinite(width) && Number.isFinite(height) && height !== 0) {
      aspectRatioRef.current = width / height;
    }
  }, [maintainAspect]);

  const parsedWidth = parseFloat(widthInput);
  const parsedHeight = parseFloat(heightInput);
  const widthIsValid = Number.isFinite(parsedWidth) && parsedWidth > 0;
  const heightIsValid = Number.isFinite(parsedHeight) && parsedHeight > 0;
  const fallbackWidth = svgMeta.width || 320;
  const fallbackHeight = svgMeta.height || 180;
  const widthValue = widthIsValid ? parsedWidth : fallbackWidth;
  const heightValue = heightIsValid ? parsedHeight : fallbackHeight;
  const safeWidth = widthValue > 0 ? widthValue : 1;
  const safeHeight = heightValue > 0 ? heightValue : 1;

  const backgroundColor = backgroundTransparent ? "transparent" : neutralBackground.color;
  const overlayColor = backgroundTransparent
    ? "#1f1f1f"
    : neutralBackground.lightness < 0.45
    ? "#f5f7f9"
    : "#1b1f24";

  const widthDisplay =
    widthValue > 0
      ? `${showDimensionLabels ? "幅 " : ""}${formatDimensionValue(
          widthValue,
          roundDimensionValues,
        )}${unit}`
      : "";
  const heightDisplay =
    heightValue > 0
      ? `${showDimensionLabels ? "高さ " : ""}${formatDimensionValue(
          heightValue,
          roundDimensionValues,
        )}${unit}`
      : "";

  const maxSide = Math.max(safeWidth, safeHeight);
  const margin = Math.max(maxSide * 0.15, 20);
  const widthLineY = -margin * 0.6;
  const heightLineX = -margin * 0.6;
  const extensionOvershoot = margin * 0.2;
  const widthTextY = widthLineY - margin * 0.2;
  const heightTextX = heightLineX - margin * 0.2;
  const viewBox = `${-margin} ${-margin} ${safeWidth + margin * 2} ${safeHeight + margin * 2}`;
  const lineWidth = Math.max(Math.min(maxSide * 0.012, 4), 1.1);
  const fontSize = Math.max(Math.min(maxSide * 0.1, 26), 12);
  const colorCount = svgMeta.colors.length;

  const handleWidthChange = (event) => {
    const { value } = event.target;
    setWidthInput(value);
    if (!maintainAspect) return;
    const numeric = parseFloat(value);
    const ratio = aspectRatioRef.current;
    if (!Number.isFinite(numeric) || !Number.isFinite(ratio) || ratio === 0) return;
    const nextHeight = numeric / ratio;
    if (Number.isFinite(nextHeight) && nextHeight > 0) {
      setHeightInput(formatNumberForInput(nextHeight));
    }
  };

  const handleHeightChange = (event) => {
    const { value } = event.target;
    setHeightInput(value);
    if (!maintainAspect) return;
    const numeric = parseFloat(value);
    const ratio = aspectRatioRef.current;
    if (!Number.isFinite(numeric) || !Number.isFinite(ratio) || !ratio) return;
    const nextWidth = numeric * ratio;
    if (Number.isFinite(nextWidth) && nextWidth > 0) {
      setWidthInput(formatNumberForInput(nextWidth));
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => {
        setSvgText(text);
      })
      .catch(() => {
        alert("SVG ファイルの読み込みに失敗しました");
      });
    event.target.value = "";
  };

  const handleSvgTextChange = (event) => setSvgText(event.target.value);

  const handleReset = () => {
    setUnit(DEFAULT_OPTIONS.unit);
    setMaintainAspect(DEFAULT_OPTIONS.maintainAspect);
    setBackgroundTransparent(DEFAULT_OPTIONS.backgroundTransparent);
    setShowDimensionLines(DEFAULT_OPTIONS.showDimensionLines);
    setShowDimensionLabels(DEFAULT_OPTIONS.showDimensionLabels);
    setRoundDimensionValues(DEFAULT_OPTIONS.roundDimensionValues);
    setSvgText(DEFAULT_SVG);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>SVG 寸法アノテーション</h1>
        <p>アップロードした SVG に工業図面風の寸法線を重ね、設定をリアルタイムで確認できます。</p>
      </header>
      <main className="app-layout">
        <section className="panel panel-controls">
          <div className="panel-heading">
            <h2>設定</h2>
            <button type="button" className="btn ghost" onClick={handleReset}>
              デフォルトに戻す
            </button>
          </div>
          <div className="form-grid">
            <label>
              <span className="label">幅</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={widthInput}
                onChange={handleWidthChange}
              />
            </label>
            <label>
              <span className="label">高さ</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={heightInput}
                onChange={handleHeightChange}
              />
            </label>
            <label>
              <span className="label">単位</span>
              <select value={unit} onChange={(event) => setUnit(event.target.value)}>
                <option value="px">px</option>
                <option value="mm">mm</option>
              </select>
            </label>
          </div>
          <div className="toggle-group">
            <label className="toggle">
              <input
                type="checkbox"
                checked={maintainAspect}
                onChange={(event) => setMaintainAspect(event.target.checked)}
              />
              <span className="toggle-indicator" />
              <span>アスペクト比を維持</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={backgroundTransparent}
                onChange={(event) => setBackgroundTransparent(event.target.checked)}
              />
              <span className="toggle-indicator" />
              <span>背景を透過</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showDimensionLines}
                onChange={(event) => setShowDimensionLines(event.target.checked)}
              />
              <span className="toggle-indicator" />
              <span>寸法線を表示</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showDimensionLabels}
                onChange={(event) => setShowDimensionLabels(event.target.checked)}
              />
              <span className="toggle-indicator" />
              <span>寸法ラベル（幅/高さ）を表示</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={roundDimensionValues}
                onChange={(event) => setRoundDimensionValues(event.target.checked)}
              />
              <span className="toggle-indicator" />
              <span>寸法値を正数に丸める</span>
            </label>
          </div>
          <p className="helper muted">背景色は SVG の配色を解析して無彩色を自動選択します。</p>
          <div className="upload-section">
            <label className="file-input">
              <span>SVG ファイルを読み込む</span>
              <input type="file" accept="image/svg+xml,.svg" onChange={handleFileUpload} />
            </label>
            <p className="helper">ファイルを読み込むか、下のテキストエリアに SVG コードを貼り付けてください。</p>
          </div>
          <label className="textarea-label">
            <span className="label">SVG ソース</span>
            <textarea
              value={svgText}
              onChange={handleSvgTextChange}
              rows={12}
              spellCheck={false}
            />
          </label>
        </section>
        <section className="panel panel-preview">
          <h2 className="panel-title">プレビュー</h2>
          {svgMeta.error ? (
            <div className="alert error">
              <p>{svgMeta.error}</p>
            </div>
          ) : (
            <div className="preview-stack">
              <div
                className="svg-stage"
                style={{
                  background: backgroundColor,
                  color: overlayColor,
                  "--aspect-ratio": `${safeWidth} / ${safeHeight}`,
                }}
              >
                <div className="svg-content" dangerouslySetInnerHTML={{ __html: sanitizedSvg }} />
                {showDimensionLines && (
                  <svg
                    className="dimension-overlay"
                    viewBox={viewBox}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <defs>
                      <marker
                        id={markerId}
                        markerWidth="8"
                        markerHeight="8"
                        refX="8"
                        refY="3"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M0,3 L8,6 L8,0 Z" fill={overlayColor} />
                      </marker>
                    </defs>
                    <g
                      stroke={overlayColor}
                      strokeWidth={lineWidth}
                      fill="none"
                      strokeLinecap="square"
                    >
                      <line x1={0} y1={0} x2={0} y2={widthLineY + extensionOvershoot} />
                      <line
                        x1={safeWidth}
                        y1={0}
                        x2={safeWidth}
                        y2={widthLineY + extensionOvershoot}
                      />
                      <line x1={heightLineX + extensionOvershoot} y1={0} x2={0} y2={0} />
                      <line
                        x1={heightLineX + extensionOvershoot}
                        y1={safeHeight}
                        x2={0}
                        y2={safeHeight}
                      />
                      <line
                        x1={0}
                        y1={widthLineY}
                        x2={safeWidth}
                        y2={widthLineY}
                        markerStart={`url(#${markerId})`}
                        markerEnd={`url(#${markerId})`}
                      />
                      <line
                        x1={heightLineX}
                        y1={0}
                        x2={heightLineX}
                        y2={safeHeight}
                        markerStart={`url(#${markerId})`}
                        markerEnd={`url(#${markerId})`}
                      />
                    </g>
                    {widthDisplay && (
                      <text
                        x={safeWidth / 2}
                        y={widthTextY}
                        fill={overlayColor}
                        fontSize={fontSize}
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {widthDisplay}
                      </text>
                    )}
                    {heightDisplay && (
                      <text
                        x={heightTextX}
                        y={safeHeight / 2}
                        fill={overlayColor}
                        fontSize={fontSize}
                        textAnchor="middle"
                        dominantBaseline="central"
                        transform={`rotate(-90 ${heightTextX} ${safeHeight / 2})`}
                      >
                        {heightDisplay}
                      </text>
                    )}
                  </svg>
                )}
              </div>
              <dl className="dimension-summary">
                <div>
                  <dt>幅</dt>
                  <dd>{widthDisplay || "—"}</dd>
                </div>
                <div>
                  <dt>高さ</dt>
                  <dd>{heightDisplay || "—"}</dd>
                </div>
                <div>
                  <dt>背景色</dt>
                  <dd>
                    <span
                      className="color-chip"
                      style={{
                        background: backgroundTransparent ? overlayColor : backgroundColor,
                      }}
                    />
                    {backgroundTransparent ? "透過" : backgroundColor}
                  </dd>
                </div>
                <div>
                  <dt>検出した色</dt>
                  <dd>
                    {colorCount > 0 ? (
                      <div className="color-list">
                        {svgMeta.colors.slice(0, 6).map((color) => (
                          <span
                            key={color}
                            className="color-chip"
                            style={{ background: color }}
                            title={color}
                          />
                        ))}
                        {colorCount > 6 && <span className="color-more">+{colorCount - 6}</span>}
                      </div>
                    ) : (
                      <span>なし</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
