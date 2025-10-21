import React, { useCallback, useEffect, useMemo, useState } from "react";

const SAMPLE_SVG = `
<svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg">
  <rect x="12" y="12" width="136" height="96" rx="14" fill="#f97316" stroke="#1f2937" stroke-width="4" />
  <circle cx="64" cy="60" r="26" fill="#38bdf8" opacity="0.85" />
  <path d="M116 30 L140 60 L116 90 Z" fill="#22c55e" stroke="#065f46" stroke-width="3" />
  <text x="80" y="64" font-size="18" text-anchor="middle" fill="#0f172a" font-family="'Noto Sans JP', sans-serif">Sample</text>
</svg>
`;

const NEUTRAL_PALETTE = [
  "#f8fafc",
  "#f3f4f6",
  "#e5e7eb",
  "#d1d5db",
  "#cbd5f5",
  "#94a3b8",
];

function parseLength(raw, fallback) {
  if (!raw) return fallback;
  const match = String(raw).match(/-?\d+(?:\.\d+)?/);
  if (!match) return fallback;
  const value = parseFloat(match[0]);
  return Number.isFinite(value) ? value : fallback;
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  if (s <= 0) {
    const channel = clampChannel(l * 255);
    return { r: channel, g: channel, b: channel };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = hue / 360;
  const channel = (t) => {
    let temp = t;
    if (temp < 0) temp += 1;
    if (temp > 1) temp -= 1;
    if (temp < 1 / 6) return p + (q - p) * 6 * temp;
    if (temp < 1 / 2) return q;
    if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6;
    return p;
  };
  return {
    r: clampChannel(channel(hk + 1 / 3) * 255),
    g: clampChannel(channel(hk) * 255),
    b: clampChannel(channel(hk - 1 / 3) * 255),
  };
}

let namedColorResolver = null;

function parseColorString(value) {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || raw === "none" || raw === "transparent" || raw.startsWith("url(")) {
    return null;
  }
  if (raw.startsWith("#")) {
    let hex = raw.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].every((n) => Number.isFinite(n))) {
        return { r, g, b };
      }
    }
    return null;
  }
  if (raw.startsWith("rgb")) {
    const numbers = raw
      .replace(/rgba?\(|\)/g, "")
      .split(",")
      .map((n) => parseFloat(n.trim()));
    if (numbers.length >= 3) {
      return {
        r: clampChannel(numbers[0]),
        g: clampChannel(numbers[1]),
        b: clampChannel(numbers[2]),
      };
    }
  }
  if (raw.startsWith("hsl")) {
    const parts = raw
      .replace(/hsla?\(|\)/g, "")
      .split(",")
      .map((n) => n.trim());
    if (parts.length >= 3) {
      const h = parseFloat(parts[0]);
      const s = parseFloat(parts[1]) / 100;
      const l = parseFloat(parts[2]) / 100;
      if ([h, s, l].every((n) => Number.isFinite(n))) {
        return hslToRgb(h, s, l);
      }
    }
  }
  if (typeof document !== "undefined") {
    if (!namedColorResolver) {
      namedColorResolver = document.createElement("span");
      namedColorResolver.style.display = "none";
      document.body.appendChild(namedColorResolver);
    }
    namedColorResolver.style.color = raw;
    const computed = window.getComputedStyle(namedColorResolver).color;
    if (computed && computed !== raw) {
      return parseColorString(computed);
    }
  }
  return null;
}

function parseSvg(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { svg: "", viewBox: null, colors: [], error: null };
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, "image/svg+xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      return {
        svg: "",
        viewBox: null,
        colors: [],
        error: parserError.textContent || "SVG の解析に失敗しました",
      };
    }
    const svg = doc.querySelector("svg");
    if (!svg) {
      return {
        svg: "",
        viewBox: null,
        colors: [],
        error: "<svg> 要素が見つかりません",
      };
    }
    let viewBox;
    const viewBoxAttr = svg.getAttribute("viewBox");
    if (viewBoxAttr) {
      const parts = viewBoxAttr
        .split(/[ ,]+/)
        .map((part) => parseFloat(part));
      if (parts.length === 4 && parts.every((part) => Number.isFinite(part))) {
        viewBox = {
          x: parts[0],
          y: parts[1],
          width: parts[2] || 1,
          height: parts[3] || 1,
        };
      }
    }
    if (!viewBox) {
      const widthAttr = parseLength(svg.getAttribute("width"), 160);
      const heightAttr = parseLength(svg.getAttribute("height"), 120);
      viewBox = { x: 0, y: 0, width: widthAttr || 160, height: heightAttr || 120 };
      svg.setAttribute(
        "viewBox",
        `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
      );
    }
    if (!svg.getAttribute("preserveAspectRatio")) {
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }

    const seen = new Set();
    const colors = [];
    const registerColor = (value) => {
      const rgb = parseColorString(value);
      if (!rgb) return;
      const key = `${rgb.r}-${rgb.g}-${rgb.b}`;
      if (seen.has(key)) return;
      seen.add(key);
      colors.push(rgb);
    };

    const registerStyleColors = (style) => {
      style
        .split(";")
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .forEach((chunk) => {
          const [prop, val] = chunk.split(":");
          if (!prop || !val) return;
          const name = prop.trim().toLowerCase();
          if (name === "fill" || name === "stroke" || name === "stop-color") {
            registerColor(val.trim());
          }
        });
    };

    svg.querySelectorAll("*").forEach((el) => {
      registerColor(el.getAttribute("fill"));
      registerColor(el.getAttribute("stroke"));
      registerColor(el.getAttribute("stop-color"));
      const style = el.getAttribute("style");
      if (style) registerStyleColors(style);
    });

    const serializer = new XMLSerializer();
    const markup = serializer.serializeToString(svg);
    return { svg: markup, viewBox, colors, error: null };
  } catch (error) {
    return {
      svg: "",
      viewBox: null,
      colors: [],
      error: error instanceof Error ? error.message : "SVG の解析に失敗しました",
    };
  }
}

function hexToRgb(hex) {
  let normalized = hex.trim();
  if (normalized.startsWith("#")) normalized = normalized.slice(1);
  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (normalized.length !== 6) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function colorDistance(a, b) {
  return Math.sqrt(
    (a.r - b.r) * (a.r - b.r) +
      (a.g - b.g) * (a.g - b.g) +
      (a.b - b.b) * (a.b - b.b),
  );
}

function getLuminance({ r, g, b }) {
  const toLinear = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const linearR = toLinear(r);
  const linearG = toLinear(g);
  const linearB = toLinear(b);
  return 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;
}

function chooseNeutralColor(colors) {
  const palette = NEUTRAL_PALETTE.map((hex) => ({
    hex,
    rgb: hexToRgb(hex),
  })).filter((entry) => entry.rgb);
  if (!colors || !colors.length) {
    return palette[1]?.hex || "#f3f4f6";
  }
  const avgLuminance =
    colors.reduce((sum, color) => sum + getLuminance(color), 0) / colors.length;
  let best = palette[0];
  let bestScore = -Infinity;
  palette.forEach((candidate) => {
    const minDistance = colors.reduce(
      (min, color) => Math.min(min, colorDistance(candidate.rgb, color)),
      Infinity,
    );
    const luminanceDelta = Math.abs(getLuminance(candidate.rgb) - avgLuminance);
    const score = minDistance * 0.8 + luminanceDelta * 260;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });
  return best?.hex || "#f3f4f6";
}

function formatNumberForInput(value) {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 1000) / 1000;
  return rounded.toString();
}

function formatDimension(value, unit, roundValues) {
  if (!Number.isFinite(value)) return "";
  if (roundValues) {
    return `${Math.round(value)} ${unit}`.trim();
  }
  const rounded = Math.round(value * 100) / 100;
  let text = rounded.toFixed(2);
  text = text.replace(/0+$/, "").replace(/\.$/, "");
  return `${text} ${unit}`.trim();
}

function DimensionOverlay({
  viewBox,
  widthValue,
  heightValue,
  unit,
  roundValues,
  showDimensionLines,
  showDimensionLabels,
}) {
  if (!viewBox || !showDimensionLines) {
    return null;
  }
  const safeWidth = viewBox.width || 1;
  const safeHeight = viewBox.height || 1;
  const span = Math.max(safeWidth, safeHeight);
  const spacing = span * 0.18;
  const extension = span * 0.04;
  const lineWidth = Math.max(span * 0.01, 0.6);
  const extensionWidth = Math.max(lineWidth * 0.6, 0.4);
  const horizontalLineY = viewBox.y - spacing;
  const verticalLineX = viewBox.x + safeWidth + spacing;
  const valueFontSize = Math.max(span * 0.07, 8);
  const labelFontSize = Math.max(span * 0.05, 6);
  const arrowColor = "#1f2937";
  const extensionColor = "#6b7280";
  const textColor = "#0f172a";

  const widthText = formatDimension(widthValue, unit, roundValues);
  const heightText = formatDimension(heightValue, unit, roundValues);

  return (
    <svg
      className="dimension-overlay"
      viewBox={`${viewBox.x} ${viewBox.y} ${safeWidth} ${safeHeight}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ overflow: "visible" }}
    >
      <defs>
        <marker
          id="dimension-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="5"
          refY="5"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 L2,5 Z" fill={arrowColor} />
        </marker>
      </defs>
      <g strokeLinecap="round" fill="none">
        <g stroke={extensionColor} strokeWidth={extensionWidth}>
          <line
            x1={viewBox.x}
            y1={viewBox.y}
            x2={viewBox.x}
            y2={horizontalLineY - extension}
          />
          <line
            x1={viewBox.x + safeWidth}
            y1={viewBox.y}
            x2={viewBox.x + safeWidth}
            y2={horizontalLineY - extension}
          />
          <line
            x1={viewBox.x + safeWidth}
            y1={viewBox.y}
            x2={verticalLineX + extension}
            y2={viewBox.y}
          />
          <line
            x1={viewBox.x + safeWidth}
            y1={viewBox.y + safeHeight}
            x2={verticalLineX + extension}
            y2={viewBox.y + safeHeight}
          />
        </g>
        <line
          x1={viewBox.x}
          y1={horizontalLineY}
          x2={viewBox.x + safeWidth}
          y2={horizontalLineY}
          stroke={arrowColor}
          strokeWidth={lineWidth}
          markerStart="url(#dimension-arrow)"
          markerEnd="url(#dimension-arrow)"
        />
        <line
          x1={verticalLineX}
          y1={viewBox.y}
          x2={verticalLineX}
          y2={viewBox.y + safeHeight}
          stroke={arrowColor}
          strokeWidth={lineWidth}
          markerStart="url(#dimension-arrow)"
          markerEnd="url(#dimension-arrow)"
        />
      </g>
      {widthText && (
        <text
          x={viewBox.x + safeWidth / 2}
          y={horizontalLineY - extension * 1.4}
          textAnchor="middle"
          fill={textColor}
          fontWeight="600"
          fontSize={valueFontSize}
        >
          {widthText}
        </text>
      )}
      {showDimensionLabels && (
        <text
          x={viewBox.x + safeWidth / 2}
          y={horizontalLineY - extension * 2.4}
          textAnchor="middle"
          fill={textColor}
          fontSize={labelFontSize}
        >
          幅
        </text>
      )}
      {heightText && (
        <text
          x={verticalLineX + extension * 1.6}
          y={viewBox.y + safeHeight / 2}
          textAnchor="middle"
          fill={textColor}
          fontWeight="600"
          fontSize={valueFontSize}
          transform={`rotate(-90 ${verticalLineX + extension * 1.6} ${
            viewBox.y + safeHeight / 2
          })`}
        >
          {heightText}
        </text>
      )}
      {showDimensionLabels && (
        <text
          x={verticalLineX + extension * 2.6}
          y={viewBox.y + safeHeight / 2}
          textAnchor="middle"
          fill={textColor}
          fontSize={labelFontSize}
          transform={`rotate(-90 ${verticalLineX + extension * 2.6} ${
            viewBox.y + safeHeight / 2
          })`}
        >
          高さ
        </text>
      )}
    </svg>
  );
}

export default function App() {
  const [rawSvg, setRawSvg] = useState(SAMPLE_SVG);
  const [unit, setUnit] = useState("px");
  const [preserveAspect, setPreserveAspect] = useState(true);
  const [transparentBg, setTransparentBg] = useState(false);
  const [showDimensionLines, setShowDimensionLines] = useState(true);
  const [showDimensionLabels, setShowDimensionLabels] = useState(false);
  const [roundValues, setRoundValues] = useState(false);
  const [baseDimensions, setBaseDimensions] = useState({ width: 160, height: 120 });
  const [widthInput, setWidthInput] = useState("160");
  const [heightInput, setHeightInput] = useState("120");

  const parsed = useMemo(() => parseSvg(rawSvg), [rawSvg]);

  useEffect(() => {
    if (!parsed.viewBox) return;
    const { width, height } = parsed.viewBox;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    setBaseDimensions({ width, height });
    setWidthInput(formatNumberForInput(width));
    setHeightInput(formatNumberForInput(height));
  }, [parsed.viewBox?.width, parsed.viewBox?.height]);

  const handleWidthChange = useCallback(
    (value) => {
      setWidthInput(value);
      const numeric = parseFloat(value);
      if (!preserveAspect) return;
      if (!Number.isFinite(numeric) || !baseDimensions.width) return;
      const ratio = baseDimensions.height / baseDimensions.width;
      if (!Number.isFinite(ratio)) return;
      const computed = numeric * ratio;
      if (Number.isFinite(computed)) {
        setHeightInput(formatNumberForInput(computed));
      }
    },
    [preserveAspect, baseDimensions.height, baseDimensions.width],
  );

  const handleHeightChange = useCallback(
    (value) => {
      setHeightInput(value);
      const numeric = parseFloat(value);
      if (!preserveAspect) return;
      if (!Number.isFinite(numeric) || !baseDimensions.height) return;
      const ratio = baseDimensions.width / baseDimensions.height;
      if (!Number.isFinite(ratio)) return;
      const computed = numeric * ratio;
      if (Number.isFinite(computed)) {
        setWidthInput(formatNumberForInput(computed));
      }
    },
    [preserveAspect, baseDimensions.height, baseDimensions.width],
  );

  useEffect(() => {
    if (!preserveAspect) return;
    const numeric = parseFloat(widthInput);
    if (!Number.isFinite(numeric) || !baseDimensions.width) return;
    const ratio = baseDimensions.height / baseDimensions.width;
    if (!Number.isFinite(ratio)) return;
    const computed = numeric * ratio;
    if (Number.isFinite(computed)) {
      setHeightInput(formatNumberForInput(computed));
    }
  }, [preserveAspect]);

  const widthValue = useMemo(() => {
    const numeric = parseFloat(widthInput);
    return Number.isFinite(numeric) ? numeric : baseDimensions.width;
  }, [widthInput, baseDimensions.width]);

  const heightValue = useMemo(() => {
    const numeric = parseFloat(heightInput);
    return Number.isFinite(numeric) ? numeric : baseDimensions.height;
  }, [heightInput, baseDimensions.height]);

  const autoBackground = chooseNeutralColor(parsed.colors);
  const previewBackground = transparentBg ? "transparent" : autoBackground;

  const handleUnitChange = (nextUnit) => {
    setUnit(nextUnit);
  };

  const backgroundLabel = transparentBg ? "transparent" : previewBackground;

  return (
    <div className="dimension-app">
      <header className="dimension-header">
        <h1>SVG 寸法アシスタント</h1>
        <p>
          SVG の内容にあわせた背景色と工業図面風の寸法線を自動生成します。
          寸法値は単位を切り替えても変換せず、そのままの数値を保持します。
        </p>
      </header>
      <main className="dimension-main">
        <div className="dimension-panel">
          <section className="card dimension-editor">
            <div className="section-title">SVG マークアップ</div>
            <textarea
              value={rawSvg}
              onChange={(e) => setRawSvg(e.target.value)}
              spellCheck="false"
              aria-label="SVG markup"
            />
            {parsed.error && <p className="error">{parsed.error}</p>}
          </section>
          <section className="card dimension-controls">
            <div className="section-title">設定</div>
            <div className="dimension-inputs">
              <label>
                <span>幅</span>
                <div className="input-composite">
                  <input
                    type="number"
                    step="0.1"
                    value={widthInput}
                    onChange={(e) => handleWidthChange(e.target.value)}
                  />
                  <select value={unit} onChange={(e) => handleUnitChange(e.target.value)}>
                    <option value="px">px</option>
                    <option value="mm">mm</option>
                  </select>
                </div>
              </label>
              <label>
                <span>高さ</span>
                <div className="input-composite">
                  <input
                    type="number"
                    step="0.1"
                    value={heightInput}
                    onChange={(e) => handleHeightChange(e.target.value)}
                  />
                  <div className="unit-label">{unit}</div>
                </div>
              </label>
            </div>
            <div className="toggle-group">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={preserveAspect}
                  onChange={(e) => setPreserveAspect(e.target.checked)}
                />
                アスペクト比を維持
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={transparentBg}
                  onChange={(e) => setTransparentBg(e.target.checked)}
                />
                背景を透過
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={showDimensionLines}
                  onChange={(e) => setShowDimensionLines(e.target.checked)}
                />
                寸法線を表示
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={showDimensionLabels}
                  onChange={(e) => setShowDimensionLabels(e.target.checked)}
                />
                寸法ラベル（幅・高さ）
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={roundValues}
                  onChange={(e) => setRoundValues(e.target.checked)}
                />
                寸法値を正数に丸める
              </label>
            </div>
            <div className="background-preview">
              <span className="swatch" style={{ background: previewBackground }} />
              <span className="swatch-label">背景色: {backgroundLabel}</span>
            </div>
          </section>
        </div>
        <section className="card dimension-preview">
          <div className="section-title">プレビュー</div>
          <div
            className="preview-frame"
            style={{ background: previewBackground }}
          >
            {parsed.svg ? (
              <div className="preview-stage">
                <div
                  className="svg-content"
                  dangerouslySetInnerHTML={{ __html: parsed.svg }}
                />
                <DimensionOverlay
                  viewBox={parsed.viewBox}
                  widthValue={widthValue}
                  heightValue={heightValue}
                  unit={unit}
                  roundValues={roundValues}
                  showDimensionLines={showDimensionLines}
                  showDimensionLabels={showDimensionLabels}
                />
              </div>
            ) : (
              <div className="preview-empty">SVG を入力してください。</div>
            )}
          </div>
          {parsed.viewBox && (
            <dl className="viewbox-info">
              <div>
                <dt>viewBox</dt>
                <dd>
                  {parsed.viewBox.x} {parsed.viewBox.y} {parsed.viewBox.width}{" "}
                  {parsed.viewBox.height}
                </dd>
              </div>
              <div>
                <dt>検出した色数</dt>
                <dd>{parsed.colors.length}</dd>
              </div>
            </dl>
          )}
        </section>
      </main>
    </div>
  );
}
