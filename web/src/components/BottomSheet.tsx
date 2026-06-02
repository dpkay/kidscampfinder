import { useEffect, useRef, useState } from "react";

// Draggable bottom sheet with three snap points (collapsed / half / full).
// Drag the handle to move; release snaps to the nearest point.
const SNAPS = { collapsed: 0.08, half: 0.45, full: 0.92 }; // fraction of viewport height
type Snap = keyof typeof SNAPS;

export function BottomSheet({
  header,
  children,
  initial = "half",
  onHeightChange,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  initial?: Snap;
  onHeightChange?: (px: number) => void;
}) {
  const [snap, setSnap] = useState<Snap>(initial);
  const [dragH, setDragH] = useState<number | null>(null); // px height while dragging
  const startY = useRef(0);
  const startH = useRef(0);

  const vh = () => window.innerHeight;
  const targetH = dragH ?? SNAPS[snap] * vh();

  // notify on settled height (open/close), not during drag, so the map can keep its
  // visible center fixed as the sheet covers/uncovers the bottom.
  useEffect(() => {
    onHeightChange?.(SNAPS[snap] * window.innerHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  useEffect(() => {
    if (dragH == null) return;
    const onMove = (e: PointerEvent) => {
      const dy = e.clientY - startY.current;
      const h = Math.max(40, Math.min(vh() * 0.95, startH.current - dy));
      setDragH(h);
    };
    const onUp = () => {
      // snap to nearest
      const frac = (dragH ?? 0) / vh();
      const nearest = (Object.entries(SNAPS) as [Snap, number][]).reduce((a, b) =>
        Math.abs(b[1] - frac) < Math.abs(a[1] - frac) ? b : a,
      )[0];
      setSnap(nearest);
      setDragH(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragH]);

  const onHandleDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    startH.current = targetH;
    setDragH(targetH);
  };

  const cycle = () => setSnap((s) => (s === "collapsed" ? "half" : s === "half" ? "full" : "collapsed"));

  return (
    <div
      className="sheet"
      style={{ height: targetH, transition: dragH == null ? "height .25s cubic-bezier(.4,0,.2,1)" : "none" }}
    >
      <div className="sheet-handle-area" onPointerDown={onHandleDown} onClick={cycle}>
        <div className="sheet-handle" />
      </div>
      <div className="sheet-header">{header}</div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
