// Two-thumb min/max range slider built from two overlaid native range inputs.
// The min input's z-index is raised when the thumbs get close so it stays grabbable.
export function RangeSlider({
  min,
  max,
  step = 1,
  valueMin,
  valueMax,
  onChange,
  format = (n) => String(n),
}: {
  min: number;
  max: number;
  step?: number;
  valueMin: number;
  valueMax: number;
  onChange: (lo: number, hi: number) => void;
  format?: (n: number) => string;
}) {
  const span = Math.max(1, max - min);
  const loPct = ((valueMin - min) / span) * 100;
  const hiPct = ((valueMax - min) / span) * 100;
  // when the min thumb is in the upper part of the range, lift its input above the max one
  const minOnTop = valueMin > max - span * 0.15;
  // knob center, inset by half a knob (11px) so it never clips at the track ends
  const knobLeft = (pct: number) => `calc(11px + ${pct / 100} * (100% - 22px))`;

  return (
    <div className="rs2">
      <div className="rs2-track">
        <div className="rs2-rail" />
        <div
          className="rs2-fill"
          style={{ left: knobLeft(loPct), width: `calc(${(hiPct - loPct) / 100} * (100% - 22px))` }}
        />
        {/* transparent native inputs handle interaction */}
        <input
          type="range" min={min} max={max} step={step} value={valueMin}
          onChange={(e) => onChange(Math.min(Number(e.target.value), valueMax), valueMax)}
          aria-label="Minimum" className="rs2-input" style={{ zIndex: minOnTop ? 4 : 3 }}
        />
        <input
          type="range" min={min} max={max} step={step} value={valueMax}
          onChange={(e) => onChange(valueMin, Math.max(Number(e.target.value), valueMin))}
          aria-label="Maximum" className="rs2-input" style={{ zIndex: minOnTop ? 3 : 4 }}
        />
        {/* visible knobs (always render, regardless of browser) */}
        <div className="rs2-knob" style={{ left: knobLeft(loPct) }} />
        <div className="rs2-knob" style={{ left: knobLeft(hiPct) }} />
      </div>
      <div className="rs2-vals">
        <span>{format(valueMin)}</span>
        <span>{format(valueMax)}</span>
      </div>
    </div>
  );
}

// Single-thumb "max" slider (Airbnb-style price cap).
export function MaxSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  format = (n) => String(n),
  maxLabel,
}: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  format?: (n: number) => string;
  maxLabel?: string;
}) {
  const span = Math.max(1, max - min);
  const pct = ((value - min) / span) * 100;
  const atMax = value >= max;
  return (
    <div className="rs">
      <div className="rs-track">
        <div className="rs-fill" style={{ left: 0, right: `${100 - pct}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Maximum"
          className="rs-input single"
        />
      </div>
      <div className="rs-values">
        <span>{format(min)}</span>
        <span className="rs-current">{atMax && maxLabel ? maxLabel : format(value)}</span>
      </div>
    </div>
  );
}
