"use client";

import { RDSButton } from "@/components/rds";

export function MatrixDownloadButton() {
  function handleDownload() {
    const svg = document.getElementById("positioning-matrix-svg");
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rival-matrix.svg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <RDSButton variant="ghost" size="sm" onClick={handleDownload}>
      Download SVG
    </RDSButton>
  );
}
