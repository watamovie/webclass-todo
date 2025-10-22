import React, { useCallback, useRef, useState } from "react";

const SVG_SHAPE_SELECTOR =
  "path, rect, circle, ellipse, polygon, polyline, line, use, g";

const parseNumeric = (value) => {
  if (value == null) return Number.NaN;
  if (typeof value === "number") return value;
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  const num = parseFloat(trimmed);
  return Number.isFinite(num) ? num : Number.NaN;
};

const getSvgMetrics = (svgEl) => {
  const metrics = {
    width: Number.NaN,
    height: Number.NaN,
    minX: 0,
    minY: 0,
  };

  const widthAttr = svgEl.getAttribute("width");
  const heightAttr = svgEl.getAttribute("height");
  const width = parseNumeric(widthAttr);
  const height = parseNumeric(heightAttr);
  if (Number.isFinite(width)) metrics.width = width;
  if (Number.isFinite(height)) metrics.height = height;

  const viewBoxAttr = svgEl.getAttribute("viewBox");
  if (viewBoxAttr) {
    const parts = viewBoxAttr
      .replace(/,/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const [minX, minY, vbWidth, vbHeight] = parts;
      metrics.minX = minX;
      metrics.minY = minY;
      if (!Number.isFinite(metrics.width)) metrics.width = vbWidth;
      if (!Number.isFinite(metrics.height)) metrics.height = vbHeight;
    }
  }

  const vb = svgEl.viewBox?.baseVal;
  if (vb) {
    metrics.minX = vb.x;
    metrics.minY = vb.y;
    if (!Number.isFinite(metrics.width)) metrics.width = vb.width;
    if (!Number.isFinite(metrics.height)) metrics.height = vb.height;
  }

  return metrics;
};

const approxEqual = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

const matchesDimension = (attr, expected, tolerance) => {
  if (!Number.isFinite(expected)) return false;
  if (!attr) return false;
  const value = attr.trim();
  if (!value) return false;
  if (value.endsWith("%")) {
    const percentage = parseFloat(value);
    return Number.isFinite(percentage) && Math.abs(percentage - 100) < 0.01;
  }
  const numeric = parseNumeric(value);
  if (!Number.isFinite(numeric)) return false;
  return approxEqual(numeric, expected, tolerance);
};

const matchesPosition = (attr, expected, tolerance) => {
  if (!attr) return approxEqual(0, expected, tolerance);
  const value = attr.trim();
  if (!value) return approxEqual(0, expected, tolerance);
  if (value.endsWith("%")) {
    const percentage = parseFloat(value);
    return Number.isFinite(percentage) && Math.abs(percentage) < 0.01;
  }
  const numeric = parseNumeric(value);
  if (!Number.isFinite(numeric)) return false;
  return approxEqual(numeric, expected, tolerance);
};

const removeCanvasSizedShapes = (svgEl, metrics) => {
  const { width, height, minX, minY } = metrics;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  const tolerance = Math.max(width, height) * 0.005 + 0.5;

  const candidates = svgEl.querySelectorAll(
    "rect, path, polygon, polyline, circle, ellipse, g, use",
  );

  candidates.forEach((node) => {
    if (node.closest("defs")) return;

    if (node.tagName.toLowerCase() === "rect") {
      const widthAttr = node.getAttribute("width");
      const heightAttr = node.getAttribute("height");
      const xAttr = node.getAttribute("x");
      const yAttr = node.getAttribute("y");
      if (
        matchesDimension(widthAttr, width, tolerance) &&
        matchesDimension(heightAttr, height, tolerance) &&
        matchesPosition(xAttr, minX, tolerance) &&
        matchesPosition(yAttr, minY, tolerance)
      ) {
        node.remove();
        return;
      }
    }

    const getBBox = node.getBBox;
    if (typeof getBBox === "function") {
      try {
        const box = getBBox.call(node);
        if (
          approxEqual(box.width, width, tolerance) &&
          approxEqual(box.height, height, tolerance) &&
          approxEqual(box.x, minX, tolerance) &&
          approxEqual(box.y, minY, tolerance)
        ) {
          node.remove();
        }
      } catch (error) {
        // ignore rendering errors when computing BBox
      }
    }
  });
};

const applyFillColor = (svgEl, fillColor) => {
  if (!fillColor) return;
  const shapes = svgEl.querySelectorAll(SVG_SHAPE_SELECTOR);
  shapes.forEach((node) => {
    if (node.closest("defs")) return;
    const current = (node.getAttribute("fill") || "").trim().toLowerCase();
    const styleFill = node.style?.fill?.toLowerCase();
    if (current === "none" || styleFill === "none") return;
    node.setAttribute("fill", fillColor);
    if (node.style) {
      node.style.fill = fillColor;
    }
  });
};

const serializeSvg = (svgEl) => {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgEl);
};

const ensureNamespace = (svgEl) => {
  if (!svgEl.getAttribute("xmlns")) {
    svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  if (!svgEl.getAttribute("xmlns:xlink")) {
    svgEl.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  }
};

export default function SvgTools() {
  const [svgSource, setSvgSource] = useState("");
  const [processedSvg, setProcessedSvg] = useState("");
  const [removeBackground, setRemoveBackground] = useState(false);
  const [changeFill, setChangeFill] = useState(true);
  const [fillColor, setFillColor] = useState("#3b82f6");
  const [colorPickerValue, setColorPickerValue] = useState("#3b82f6");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);

  const processSvgContent = useCallback(
    (source, options) => {
      if (!source || !source.trim()) {
        setProcessedSvg("");
        setError("");
        return;
      }

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(source, "image/svg+xml");
        const parserError = doc.querySelector("parsererror");
        if (parserError) {
          throw new Error(
            parserError.textContent?.replace(/\s+/g, " ") ||
              "SVG を解析できませんでした",
          );
        }

        const svgEl = doc.querySelector("svg");
        if (!svgEl) {
          throw new Error("SVG 要素が見つかりません");
        }

        ensureNamespace(svgEl);

        const metrics = getSvgMetrics(svgEl);
        if (options.removeBackground) {
          removeCanvasSizedShapes(svgEl, metrics);
        }
        if (options.changeFill) {
          applyFillColor(svgEl, options.fillColor);
        }

        const serialized = serializeSvg(svgEl);
        setProcessedSvg(serialized);
        setError("");
      } catch (err) {
        console.error("Failed to process SVG", err);
        setProcessedSvg("");
        setError(err.message || "SVG の処理に失敗しました");
      }
    },
    [setProcessedSvg, setError],
  );

  const handleApply = useCallback(() => {
    processSvgContent(svgSource, {
      removeBackground,
      changeFill,
      fillColor,
    });
  }, [processSvgContent, svgSource, removeBackground, changeFill, fillColor]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || "");
      setSvgSource(text);
      processSvgContent(text, {
        removeBackground,
        changeFill,
        fillColor,
      });
    };
    reader.onerror = () => {
      setError("ファイルの読み込みに失敗しました");
    };
    reader.readAsText(file, "utf-8");
  };

  const handleRemoveBackgroundChange = (event) => {
    const next = event.target.checked;
    setRemoveBackground(next);
    if (svgSource.trim()) {
      processSvgContent(svgSource, { changeFill, fillColor, removeBackground: next });
    }
  };

  const handleChangeFillToggle = (event) => {
    const next = event.target.checked;
    setChangeFill(next);
    if (svgSource.trim()) {
      processSvgContent(svgSource, { removeBackground, changeFill: next, fillColor });
    }
  };

  const handleColorChange = (event) => {
    const { value, type } = event.target;
    if (type === "color") {
      setColorPickerValue(value);
      setFillColor(value);
      if (svgSource.trim() && changeFill) {
        processSvgContent(svgSource, {
          removeBackground,
          changeFill,
          fillColor: value,
        });
      }
      return;
    }

    setFillColor(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      setColorPickerValue(value);
    }
    if (svgSource.trim() && changeFill) {
      processSvgContent(svgSource, {
        removeBackground,
        changeFill,
        fillColor: value,
      });
    }
  };

  const handleTextAreaChange = (event) => {
    setSvgSource(event.target.value);
  };

  const handleReset = () => {
    setSvgSource("");
    setProcessedSvg("");
    setFileName("");
    setFillColor("#3b82f6");
    setColorPickerValue("#3b82f6");
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDownload = () => {
    if (!processedSvg) return;
    const blob = new Blob([processedSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName ? fileName.replace(/\.svg$/i, "_processed.svg") : "processed.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="svg-tools" aria-labelledby="svg-tools-heading">
      <div className="svg-tools__header">
        <h2 id="svg-tools-heading">🖼️ SVG ツール</h2>
        <p>
          SVG の背景を取り除いたり、塗りつぶし色を一括で変更したりできます。ファイルを選ぶか、直接 SVG
          コードを貼り付けてください。
        </p>
      </div>

      <div className="svg-tools__inputs">
        <div className="svg-tools__file">
          <label className="svg-tools__label" htmlFor="svgUpload">
            SVG ファイルを選択
          </label>
          <input
            ref={fileInputRef}
            id="svgUpload"
            type="file"
            accept=".svg"
            onChange={handleFileChange}
          />
          {fileName && <span className="svg-tools__file-name">{fileName}</span>}
        </div>
        <textarea
          placeholder="ここに SVG コードを貼り付けてください"
          value={svgSource}
          onChange={handleTextAreaChange}
          spellCheck={false}
        />
      </div>

      <div className="svg-tools__controls">
        <label className="svg-tools__checkbox">
          <input
            type="checkbox"
            checked={removeBackground}
            onChange={handleRemoveBackgroundChange}
          />
          キャンバスと同じサイズの図形を削除
        </label>
        <label className="svg-tools__checkbox">
          <input type="checkbox" checked={changeFill} onChange={handleChangeFillToggle} />
          塗りつぶし色を変更
        </label>
        <div className="svg-tools__color" aria-hidden={!changeFill}>
          <label htmlFor="svgFillColor">塗りつぶし色</label>
          <input
            id="svgFillColor"
            type="color"
            value={colorPickerValue}
            onChange={handleColorChange}
            disabled={!changeFill}
            aria-disabled={!changeFill}
          />
          <input
            type="text"
            value={fillColor}
            onChange={handleColorChange}
            disabled={!changeFill}
            aria-label="塗りつぶし色 (CSS カラー形式)"
          />
        </div>
        <div className="svg-tools__actions">
          <button type="button" onClick={handleApply}>
            SVG を変換
          </button>
          <button type="button" onClick={handleReset}>
            クリア
          </button>
        </div>
      </div>

      {error && <div className="svg-tools__error">{error}</div>}

      {processedSvg && (
        <div className="svg-tools__result">
          <div>
            <h3>プレビュー</h3>
            <div
              className="svg-tools__preview"
              dangerouslySetInnerHTML={{ __html: processedSvg }}
            />
          </div>
          <div className="svg-tools__output">
            <h3>変換後の SVG</h3>
            <textarea value={processedSvg} readOnly spellCheck={false} />
            <button type="button" onClick={handleDownload}>
              SVG をダウンロード
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
