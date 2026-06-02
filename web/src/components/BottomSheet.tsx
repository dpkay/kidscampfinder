import { useEffect, useRef, useState } from "react";

// Draggable bottom sheet with three snap points (collapsed / half / full).
// Grab anywhere on the header; a small flick up/down moves one snap level.
const SNAPS = { collapsed: 0.1, half: 0.45, full: 0.92 } as const; // fraction of viewport height
type Snap = keyof typeof SNAPS;
const ORDER: Snap[] = ["collapsed", "half", "full"];
const FLICK = 36; // px of drag that counts as a deliberate flick

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
  const [idx, setIdx] = useState(ORDER.indexOf(initial));
  const [dragH, setDragH] = useState<number | null>(null);
  const startY = useRef(0);
  const startH = useRef(0);
  const curH = useRef(0);
  const moved = useRef(false);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  const snap = ORDER[idx];
  const vh = () => window.innerHeight;
  const targetH = dragH ?? SNAPS[snap] * vh();

  useEffect(() => {
    onHeightChange?.(SNAPS[ORDER[idx]] * window.innerHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  useEffect(() => {
    if (dragH == null) return;
    const onMove = (e: PointerEvent) => {
      const dy = e.clientY - startY.current;
      if (Math.abs(dy) > 5) moved.current = true;
      const h = Math.max(48, Math.min(vh() * 0.95, startH.current - dy));
      curH.current = h;
      setDragH(h);
    };
    const onUp = () => {
      let next = idxRef.current;
      if (moved.current) {
        const delta = curH.current - startH.current; // +up, -down
        if (delta > FLICK) next = Math.min(ORDER.length - 1, idxRef.current + 1);
        else if (delta < -FLICK) next = Math.max(0, idxRef.current - 1);
        else next = nearest(curH.current / vh());
      }
      setIdx(next);
      setDragH(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragH]);

  const onGrab = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    startH.current = targetH;
    curH.current = targetH;
    moved.current = false;
    setDragH(targetH);
  };
  const onClick = () => {
    if (moved.current) return; // it was a drag, not a tap
    setIdx((i) => (i + 1) % ORDER.length); // tap to cycle
  };

  return (
    <div
      className="sheet"
      style={{ height: targetH, transition: dragH == null ? "height .25s cubic-bezier(.4,0,.2,1)" : "none" }}
    >
      <div className="sheet-grab" onPointerDown={onGrab} onClick={onClick}>
        <div className="sheet-handle" />
        <div className="sheet-header">{header}</div>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}

function nearest(frac: number): number {
  let best = 0, bestD = Infinity;
  ORDER.forEach((s, i) => {
    const d = Math.abs(SNAPS[s] - frac);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
