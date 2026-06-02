import { useEffect, useState } from "react";
import { fetchAdmin, type AdminData } from "../api.ts";
import { makeT, type Lang } from "../i18n.ts";
import { prettySource } from "../util.ts";

export function Admin({ lang, onBack }: { lang: Lang; onBack: () => void }) {
  const { t } = makeT(lang);
  const [data, setData] = useState<AdminData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchAdmin().then(setData).catch((e) => setErr(String(e)));
  }, []);

  return (
    <div className="admin">
      <header className="topbar">
        <div className="brand">
          <span className="logo">📊</span>
          <div>
            <h1>KidsCampFinder · Admin</h1>
            <p className="sub">Crawl health · metadata coverage · true potential</p>
          </div>
        </div>
        <a className="admin-link" href="#" onClick={onBack}>← {t("close")}</a>
      </header>

      <div className="admin-body">
        {err && <p className="err">Failed to load admin data: {err}</p>}
        {!data && !err && <p>Loading…</p>}
        {data && <Dashboard data={data} />}
      </div>
    </div>
  );
}

function Dashboard({ data }: { data: AdminData }) {
  const crawledTotal = data.totals.uniqueCourses;
  const potentialTotal = data.potential.reduce((a, p) => a + p.estimate, crawledTotal);

  return (
    <>
      <section className="stat-row">
        <Stat n={data.totals.uniqueCourses} label="unique courses" />
        <Stat n={data.totals.occasions} label="occasions (date instances)" />
        <Stat n={data.bySource.length} label="sources" />
        <Stat n={data.totals.duplicates} label="cross-source duplicates" muted />
      </section>

      <div className="admin-grid">
        <Panel title="📡 Crawl health (latest runs)">
          <table className="runs">
            <thead>
              <tr><th>source</th><th>parsed</th><th>new</th><th>upd</th><th>err</th><th>when</th></tr>
            </thead>
            <tbody>
              {latestPerSource(data.runs).map((r) => (
                <tr key={r.id} className={r.note ? "alert" : ""}>
                  <td>{prettySource(r.source)}</td>
                  <td>{r.parsed}</td>
                  <td>{r.new}</td>
                  <td>{r.updated}</td>
                  <td className={r.errors ? "err-cell" : ""}>{r.errors}</td>
                  <td className="when">{timeAgo(r.finished_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.runs.some((r) => r.note) && (
            <div className="alerts">
              {data.runs.filter((r) => r.note).slice(0, 3).map((r) => (
                <div key={r.id} className="alert-line">⚠️ {prettySource(r.source)}: {r.note}</div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="✅ Metadata coverage">
          {Object.entries(data.coverage).map(([k, v]) => (
            <Bar key={k} label={k} pct={v.pct} text={`${v.n} (${v.pct}%)`} good={v.pct >= 90} />
          ))}
        </Panel>

        <Panel title="🏷 By topic">
          <DistBars dist={data.byTopic} />
        </Panel>

        <Panel title="💰 By cost / format">
          <DistBars dist={data.byCost} />
          <div className="divider" />
          <DistBars dist={data.byFormat} />
        </Panel>

        <Panel title="📦 By source">
          {data.bySource.map((s) => (
            <Bar
              key={s.source}
              label={prettySource(s.source)}
              pct={Math.round((100 * s.courses) / data.totals.uniqueCourses)}
              text={`${s.courses} courses · ${s.occasions} dates`}
            />
          ))}
        </Panel>

        <Panel title="📍 Top communes">
          <DistBars dist={Object.fromEntries(data.byCommune.slice(0, 12).map((c) => [c.commune, c.count]))} />
        </Panel>

        <Panel title="🚀 True potential — if we crawl harder" wide>
          <p className="potential-lead">
            Currently <strong>{crawledTotal}</strong> unique courses. Estimated reachable with
            more crawl effort: <strong>~{potentialTotal.toLocaleString()}</strong>.
          </p>
          <div className="potential-bar">
            <div className="seg crawled" style={{ flex: crawledTotal }} title={`crawled ${crawledTotal}`} />
            {data.potential.map((p, i) => (
              <div key={i} className={"seg " + p.status} style={{ flex: p.estimate }} title={`${p.label} ~${p.estimate}`} />
            ))}
          </div>
          <table className="potential-table">
            <thead><tr><th>lever</th><th>status</th><th>est. +courses</th><th>basis</th></tr></thead>
            <tbody>
              <tr>
                <td>Currently crawled</td>
                <td><span className="tag crawled">crawled</span></td>
                <td>{crawledTotal}</td>
                <td>Feriennet fleet + ferienprogramm.ch</td>
              </tr>
              {data.potential.map((p, i) => (
                <tr key={i}>
                  <td>{p.label}</td>
                  <td><span className={"tag " + p.status}>{p.status}</span></td>
                  <td>+{p.estimate.toLocaleString()}</td>
                  <td className="basis">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}

function Stat({ n, label, muted }: { n: number; label: string; muted?: boolean }) {
  return (
    <div className={"stat" + (muted ? " muted" : "")}>
      <div className="stat-n">{n.toLocaleString()}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

function Panel({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={"panel" + (wide ? " wide" : "")}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Bar({ label, pct, text, good }: { label: string; pct: number; text: string; good?: boolean }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className={"bar-fill" + (good ? " good" : "")} style={{ width: Math.min(100, pct) + "%" }} />
      </div>
      <span className="bar-text">{text}</span>
    </div>
  );
}

function DistBars({ dist }: { dist: Record<string, number> }) {
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return (
    <>
      {entries.map(([k, v]) => (
        <Bar key={k} label={k} pct={Math.round((100 * v) / max)} text={String(v)} />
      ))}
    </>
  );
}

function latestPerSource(runs: AdminData["runs"]) {
  const seen = new Set<string>();
  const out: AdminData["runs"] = [];
  for (const r of runs) {
    if (!seen.has(r.source)) {
      seen.add(r.source);
      out.push(r);
    }
  }
  return out;
}

function timeAgo(iso: string): string {
  if (!iso) return "—";
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return Math.round(h * 60) + "m";
  if (h < 24) return Math.round(h) + "h";
  return Math.round(h / 24) + "d";
}
