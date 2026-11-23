import type { CSSProperties } from "react";

/**
 * Small, low-opacity platform mark for movie/series artwork and playback.
 * The source artwork and uploaded media files are never modified.
 */
export function BrandWatermark() {
  const style: CSSProperties = {
    position: "absolute", top: "10px", left: "10px", zIndex: 15,
    width: "34px", height: "34px", objectFit: "contain", opacity: 0.24,
    pointerEvents: "none", userSelect: "none",
    filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.45))",
  };
  return <img src="/brand/icon-mark.png" alt="" aria-hidden="true" draggable={false} className="select-none" style={style} />;
}
