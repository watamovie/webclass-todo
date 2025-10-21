import React, { useEffect, useMemo, useRef, useState } from "react";

const UNIT_DEFINITIONS = [
  { value: "px", label: "px", toPx: (v) => v },
  { value: "mm", label: "mm", toPx: (v) => (v / 25.4) * 96 },
];

const NEUTRAL_PALETTE = [
  "#f5f5f5",
  "#e7e5e4",
  "#d4d4d8",
  "#a8a29e",
  "#1f2937",
];

const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 120;
const DEFAULT_RATIO = DEFAULT_WIDTH / DEFAULT_HEIGHT;

const DEFAULT_SVG = `
<svg viewBox="0 0 ${DEFAULT_WIDTH} ${DEFAULT_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="${DEFAULT_WIDTH - 20}" height="${DEFAULT_HEIGHT - 20}" rx="12" fill="#4f46e5" />
  <circle cx="70" cy="60" r="18" fill="#22d3ee" />
  <circle cx="130" cy="60" r="18" fill="#f97316" />
</svg>`;

const MAX_PREVIEW_SIZE = 420;

const clampNumber = (value) => (Number.isFinite(value) ? value : null);

const parseNumeric = (value) => {
  if (typeof value !== "string") return clampNumber(Number(value));
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed.replace(/,/g, "."));
  return clampNumber(parsed);
};

const normalizeHex = (hex) => {
  if (!hex) return null;
  const cleaned = hex.replace(/[^0-9a-f]/gi, "");
  if (cleaned.length === 3) {
    return cleaned
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (cleaned.length === 6) return cleaned;
  if (cleaned.length === 8) return cleaned.slice(0, 6);
  return null;
};

const hexToRgb = (hex) => {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
};

const rgbStringToRgb = (value) => {
  const result = value.match(/rgba?\(([^)]+)\)/i);
  if (!result) return null;
  const parts = result[1]
    .split(",")
    .map((part) => part.trim())
    .slice(0, 3)
    .map((part) => {
      if (part.endsWith("%")) {
        const num = Number.parseFloat(part.slice(0, -1));
        return clampNumber((num / 100) * 255);
      }
      return clampNumber(Number.parseFloat(part));
    });
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return { r: parts[0], g: parts[1], b: parts[2] };
};

const colorDistance = (a, b) =>
  Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);

const extractSvgColors = (svg) => {
  if (!svg) return [];
  const matches = svg.match(/#(?:[0-9a-f]{3,8})\b|rgba?\([^)]*\)/gi) || [];
  return matches
    .map((token) =>
      token.startsWith("#") ? hexToRgb(token) : rgbStringToRgb(token),
    )
    .filter(Boolean);
};

const chooseNeutralBackground = (colors) => {
  const palette = NEUTRAL_PALETTE.map((hex) => ({ hex, rgb: hexToRgb(hex) }));
  if (!colors.length) return palette[0].hex;
  let best = palette[0];
  let bestScore = -Infinity;
  palette.forEach((candidate) => {
    const score = colors.reduce(
      (min, color) => Math.min(min, colorDistance(candidate.rgb, color)),
      Infinity,
    );
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });
  return best.hex;
};

const backgroundBrightness = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return 255;
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
};

const formatDimension = (input, unit, { round, showLabel, label }) => {
  const trimmed = (input ?? "").toString().trim();
  const parsed = parseNumeric(trimmed);
  const value =
    round && Number.isFinite(parsed)
      ? Math.round(parsed).toString()
      : trimmed || "0";
  const suffix = `${value}${unit}`;
  return showLabel ? `${label} ${suffix}` : suffix;
};

const sanitizeSvgMarkup = (svgMarkup, width, height, unit) => {
  if (typeof window === "undefined" || !svgMarkup) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
    if (doc.querySelector("parsererror")) return "";
    const svg = doc.querySelector("svg");
    if (!svg) return "";

    svg.querySelectorAll("script").forEach((node) => node.remove());
    const walker = document.createTreeWalker(svg, NodeFilter.SHOW_ELEMENT);
    const toClean = [];
    while (walker.nextNode()) {
      toClean.push(walker.currentNode);
    }
    toClean.forEach((node) => {
      Array.from(node.attributes).forEach((attr) => {
        if (attr.name.toLowerCase().startsWith("on")) {
          node.removeAttribute(attr.name);
        }
      });
    });

    const widthValue = Number.isFinite(width) && width > 0 ? width : DEFAULT_WIDTH;
    const heightValue = Number.isFinite(height) && height > 0 ? height : DEFAULT_HEIGHT;

    svg.setAttribute("width", `${widthValue}${unit}`);
    svg.setAttribute("height", `${heightValue}${unit}`);
    if (!svg.hasAttribute("viewBox")) {
      svg.setAttribute("viewBox", `0 0 ${widthValue} ${heightValue}`);
    }
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    return svg.outerHTML;
  } catch (error) {
    console.warn("SVG parse failed", error);
    return "";
  }
};

export default function App() {
  const [unit, setUnit] = useState("px");
  const [widthInput, setWidthInput] = useState(String(DEFAULT_WIDTH));
  const [heightInput, setHeightInput] = useState(String(DEFAULT_HEIGHT));
  const [lockAspect, setLockAspect] = useState(true);
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [showDimensionLines, setShowDimensionLines] = useState(true);
  const [showDimensionLabels, setShowDimensionLabels] = useState(false);
  const [roundDimensionValues, setRoundDimensionValues] = useState(false);
  const [svgMarkup, setSvgMarkup] = useState(DEFAULT_SVG);
  const [autoBackground, setAutoBackground] = useState(NEUTRAL_PALETTE[0]);

  const fileInputRef = useRef(null);
  const ratioRef = useRef(DEFAULT_RATIO);

  useEffect(() => {
    const widthValue = parseNumeric(widthInput);
    const heightValue = parseNumeric(heightInput);
    if (Number.isFinite(widthValue) && Number.isFinite(heightValue) && heightValue) {
      ratioRef.current = widthValue / heightValue;
    }
  }, [widthInput, heightInput]);

  useEffect(() => {
    if (!lockAspect) return;
    const widthValue = parseNumeric(widthInput);
    const heightValue = parseNumeric(heightInput);
    if (Number.isFinite(widthValue) && Number.isFinite(heightValue) && heightValue) {
      ratioRef.current = widthValue / heightValue;
    }
  }, [lockAspect]);

  useEffect(() => {
    if (transparentBackground) return;
    const colors = extractSvgColors(svgMarkup);
    setAutoBackground(chooseNeutralBackground(colors));
  }, [svgMarkup, transparentBackground]);

  const unitDefinition = UNIT_DEFINITIONS.find((item) => item.value === unit);

  const widthNumber = parseNumeric(widthInput);
  const heightNumber = parseNumeric(heightInput);

  const widthPx = Number.isFinite(widthNumber) && unitDefinition
    ? unitDefinition.toPx(widthNumber)
    : null;
  const heightPx = Number.isFinite(heightNumber) && unitDefinition
    ? unitDefinition.toPx(heightNumber)
    : null;

  const hasValidDimensions =
    Number.isFinite(widthPx) && widthPx > 0 && Number.isFinite(heightPx) && heightPx > 0;

  const baseWidth = hasValidDimensions ? widthPx : DEFAULT_WIDTH;
  const baseHeight = hasValidDimensions ? heightPx : DEFAULT_HEIGHT;

  const scale = Math.min(1, MAX_PREVIEW_SIZE / Math.max(baseWidth, baseHeight));
  const drawingWidth = baseWidth * scale;
  const drawingHeight = baseHeight * scale;

  const leftMargin = showDimensionLines ? 88 : 36;
  const topMargin = showDimensionLines ? 120 : 36;
  const rightMargin = showDimensionLines ? 148 : 36;
  const bottomMargin = showDimensionLines ? 72 : 36;

  const canvasWidth = drawingWidth + leftMargin + rightMargin;
  const canvasHeight = drawingHeight + topMargin + bottomMargin;

  const contentX = leftMargin;
  const contentY = topMargin;
  const contentRight = contentX + drawingWidth;
  const contentBottom = contentY + drawingHeight;

  const dimensionGap = 24;
  const extensionOvershoot = 14;

  const processedSvg = useMemo(
    () =>
      sanitizeSvgMarkup(
        svgMarkup,
        Number.isFinite(widthNumber) ? widthNumber : DEFAULT_WIDTH,
        Number.isFinite(heightNumber) ? heightNumber : DEFAULT_HEIGHT,
        unit,
      ),
    [svgMarkup, widthNumber, heightNumber, unit],
  );

  const backgroundColor = transparentBackground ? "transparent" : autoBackground;
  const overlayColor =
    backgroundColor === "transparent" || backgroundBrightness(backgroundColor) > 150
      ? "#111827"
      : "#f8fafc";

  const formattedWidth = useMemo(
    () =>
      formatDimension(widthInput, unit, {
        round: roundDimensionValues,
        showLabel: showDimensionLabels,
        label: "幅",
      }),
    [widthInput, unit, roundDimensionValues, showDimensionLabels],
  );

  const formattedHeight = useMemo(
    () =>
      formatDimension(heightInput, unit, {
        round: roundDimensionValues,
        showLabel: showDimensionLabels,
        label: "高さ",
      }),
    [heightInput, unit, roundDimensionValues, showDimensionLabels],
  );

  const handleWidthChange = (next) => {
    setWidthInput(next);
    if (!lockAspect) return;
    const numeric = parseNumeric(next);
    if (!Number.isFinite(numeric)) return;
    const ratio = ratioRef.current || 1;
    const linked = numeric / ratio;
    if (Number.isFinite(linked)) {
      setHeightInput(linked.toFixed(3).replace(/\.0+$/, "").replace(/\.$/, ""));
    }
  };

  const handleHeightChange = (next) => {
    setHeightInput(next);
    if (!lockAspect) return;
    const numeric = parseNumeric(next);
    if (!Number.isFinite(numeric)) return;
    const ratio = ratioRef.current || 1;
    const linked = numeric * ratio;
    if (Number.isFinite(linked)) {
      setWidthInput(linked.toFixed(3).replace(/\.0+$/, "").replace(/\.$/, ""));
    }
  };

  const handleUnitChange = (value) => {
    setUnit(value);
  };

  const handleSvgUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = typeof e.target?.result === "string" ? e.target.result : "";
      if (result.trim()) {
        setSvgMarkup(result.trim());
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const resetSvg = () => {
    setSvgMarkup(DEFAULT_SVG);
  };

  return (
    <div className="app">
      <header>
        <h1>SVG 寸法ガイド</h1>
        <p>寸法線を工業図面風に整え、単位や背景を柔軟に調整できます。</p>
      </header>
      <main className="layout">
        <section className="panel">
          <h2>基本設定</h2>
          <div className="field">
            <label htmlFor="unit">単位</label>
            <select
              id="unit"
              value={unit}
              onChange={(event) => handleUnitChange(event.target.value)}
            >
              {UNIT_DEFINITIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <div className="field">
              <label htmlFor="width">幅</label>
              <input
                id="width"
                type="number"
                inputMode="decimal"
                value={widthInput}
                onChange={(event) => handleWidthChange(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="height">高さ</label>
              <input
                id="height"
                type="number"
                inputMode="decimal"
                value={heightInput}
                onChange={(event) => handleHeightChange(event.target.value)}
              />
            </div>
          </div>
          <div className="toggle-group">
            <label>
              <input
                type="checkbox"
                checked={lockAspect}
                onChange={(event) => setLockAspect(event.target.checked)}
              />
              アスペクト比を維持
            </label>
            <label>
              <input
                type="checkbox"
                checked={transparentBackground}
                onChange={(event) => setTransparentBackground(event.target.checked)}
              />
              背景を透過
            </label>
            <label>
              <input
                type="checkbox"
                checked={showDimensionLines}
                onChange={(event) => setShowDimensionLines(event.target.checked)}
              />
              寸法線を表示
            </label>
            <label>
              <input
                type="checkbox"
                checked={showDimensionLabels}
                onChange={(event) => setShowDimensionLabels(event.target.checked)}
              />
              寸法ラベル（幅/高さ）
            </label>
            <label>
              <input
                type="checkbox"
                checked={roundDimensionValues}
                onChange={(event) => setRoundDimensionValues(event.target.checked)}
              />
              寸法値を正数に丸める
            </label>
          </div>
          <div className="background-info">
            <span>背景色:</span>
            <span className="swatch" style={{ backgroundColor }} />
            <code>{transparentBackground ? "transparent" : backgroundColor}</code>
          </div>
        </section>
        <section className="preview">
          <h2>プレビュー</h2>
          <div
            className="preview-surface"
            style={{
              width: `${Math.max(canvasWidth, DEFAULT_WIDTH)}px`,
              height: `${Math.max(canvasHeight, DEFAULT_HEIGHT)}px`,
              backgroundColor,
            }}
          >
            <div
              className="svg-stage"
              style={{
                width: drawingWidth,
                height: drawingHeight,
                top: contentY,
                left: contentX,
              }}
            >
              {processedSvg ? (
                <div
                  className="svg-wrapper"
                  dangerouslySetInnerHTML={{ __html: processedSvg }}
                />
              ) : (
                <div className="invalid">SVG が正しく読み込めませんでした。</div>
              )}
            </div>
            {showDimensionLines && hasValidDimensions && (
              <svg
                className="dimension-overlay"
                width={canvasWidth}
                height={canvasHeight}
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="arrow-head"
                    markerWidth="10"
                    markerHeight="10"
                    refX="5"
                    refY="5"
                    orient="auto-start-reverse"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L10,5 L0,10 Z" fill={overlayColor} />
                  </marker>
                </defs>
                <g stroke={overlayColor} strokeWidth="1.6" fill="none">
                  <line
                    x1={contentX}
                    y1={contentY - extensionOvershoot}
                    x2={contentX}
                    y2={contentBottom + extensionOvershoot}
                  />
                  <line
                    x1={contentRight}
                    y1={contentY - extensionOvershoot}
                    x2={contentRight}
                    y2={contentBottom + extensionOvershoot}
                  />
                  <line
                    x1={contentX}
                    y1={contentY - dimensionGap}
                    x2={contentRight}
                    y2={contentY - dimensionGap}
                    markerStart="url(#arrow-head)"
                    markerEnd="url(#arrow-head)"
                  />
                  <line
                    x1={contentRight - extensionOvershoot}
                    y1={contentY}
                    x2={contentRight + dimensionGap}
                    y2={contentY}
                  />
                  <line
                    x1={contentRight - extensionOvershoot}
                    y1={contentBottom}
                    x2={contentRight + dimensionGap}
                    y2={contentBottom}
                  />
                  <line
                    x1={contentRight + dimensionGap}
                    y1={contentY}
                    x2={contentRight + dimensionGap}
                    y2={contentBottom}
                    markerStart="url(#arrow-head)"
                    markerEnd="url(#arrow-head)"
                  />
                </g>
                <text
                  x={(contentX + contentRight) / 2}
                  y={contentY - dimensionGap - 12}
                  fill={overlayColor}
                  fontSize="13"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {formattedWidth}
                </text>
                <text
                  fill={overlayColor}
                  fontSize="13"
                  fontWeight="600"
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`translate(${contentRight + dimensionGap}, ${
                    (contentY + contentBottom) / 2
                  }) rotate(-90) translate(0, -14)`}
                >
                  {formattedHeight}
                </text>
              </svg>
            )}
          </div>
          <div className="svg-inputs">
            <label htmlFor="svg-text">SVG コード</label>
            <textarea
              id="svg-text"
              value={svgMarkup}
              onChange={(event) => setSvgMarkup(event.target.value)}
              rows={10}
            />
            <div className="svg-actions">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                SVG ファイルを読み込む
              </button>
              <button type="button" className="ghost" onClick={resetSvg}>
                サンプルに戻す
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/svg+xml,.svg"
                onChange={handleSvgUpload}
                hidden
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
