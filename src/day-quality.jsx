import { useState, useEffect, useMemo, useRef, useCallback } from "react";

const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = d => d.toISOString().split("T")[0];

const PRESETS = [
  { label: "Grey & cold", v: { minSun: 4, minDay: 10, minTemp: 5, maxTemp: 50, maxRain: 1 } },
  { label: "Heat-averse", v: { minSun: 0, minDay: 4, minTemp: -10, maxTemp: 28, maxRain: 4 } },
  { label: "Perfect day", v: { minSun: 5, minDay: 10, minTemp: 15, maxTemp: 28, maxRain: 0.5 } },
];

const SLIDER_DEFS = [
  { key: "minSun", label: "Min sunshine", unit: "h", min: 0, max: 14, step: 0.5, color: "#facc15" },
  { key: "minDay", label: "Min daylight", unit: "h", min: 4, max: 18, step: 0.5, color: "#38bdf8" },
  { key: "minTemp", label: "Min daily high", unit: "°C", min: -10, max: 35, step: 1, color: "#f87171" },
  { key: "maxTemp", label: "Max daily high", unit: "°C", min: -10, max: 50, step: 1, color: "#fb923c" },
  { key: "maxRain", label: "Max rain hours", unit: "h", min: 0, max: 12, step: 0.5, color: "#818cf8" },
];

function getRange() {
  const e = new Date(); e.setDate(e.getDate() - 1);
  const s = new Date(e); s.setFullYear(s.getFullYear() - 1); s.setDate(s.getDate() + 1);
  return { start: fmt(s), end: fmt(e) };
}

const ckey = c => `${c.lat.toFixed(2)}_${c.lon.toFixed(2)}`;

async function fetchWeather(city, range) {
  // Try main forecast API first (supports historical via start/end dates), fallback to archive API
  const endpoints = [
    `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&start_date=${range.start}&end_date=${range.end}&daily=sunshine_duration,daylight_duration,temperature_2m_max,precipitation_hours&timezone=auto`,
    `https://archive-api.open-meteo.com/v1/archive?latitude=${city.lat}&longitude=${city.lon}&start_date=${range.start}&end_date=${range.end}&daily=sunshine_duration,daylight_duration,temperature_2m_max,precipitation_hours&timezone=auto`,
  ];
  let lastErr;
  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      const json = await res.json();
      if (json.error) { lastErr = new Error(json.reason || "API error"); continue; }
      if (json.daily?.time?.length > 0) return json.daily;
      lastErr = new Error("No data returned");
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("All endpoints failed");
}

function classify(d, i, sl) {
  const sun = (d.sunshine_duration?.[i] ?? 0) / 3600;
  const day = (d.daylight_duration?.[i] ?? 0) / 3600;
  const temp = d.temperature_2m_max?.[i];
  const rain = d.precipitation_hours?.[i] ?? 0;
  if (temp == null) return null;
  return sun >= sl.minSun && day >= sl.minDay && temp >= sl.minTemp && temp <= sl.maxTemp && rain <= sl.maxRain;
}

function getStats(d, sl) {
  if (!d?.time) return null;
  let good = 0, bs = 0, mbs = 0, gs = 0, mgs = 0;
  let failSun = 0, failDay = 0, failMinTemp = 0, failMaxTemp = 0, failRain = 0;
  const mo = {};
  for (let i = 0; i < d.time.length; i++) {
    const g = classify(d, i, sl);
    const m = d.time[i].slice(0, 7);
    if (!mo[m]) mo[m] = { g: 0, t: 0 };
    mo[m].t++;
    if (g) { good++; mo[m].g++; gs++; mgs = Math.max(mgs, gs); bs = 0; }
    else {
      bs++; mbs = Math.max(mbs, bs); gs = 0;
      const sun = (d.sunshine_duration?.[i] ?? 0) / 3600;
      const day = (d.daylight_duration?.[i] ?? 0) / 3600;
      const temp = d.temperature_2m_max?.[i];
      const rain = d.precipitation_hours?.[i] ?? 0;
      if (sun < sl.minSun) failSun++;
      if (day < sl.minDay) failDay++;
      if (temp != null && temp < sl.minTemp) failMinTemp++;
      if (temp != null && temp > sl.maxTemp) failMaxTemp++;
      if (rain > sl.maxRain) failRain++;
    }
  }
  return { good, total: d.time.length, maxBad: mbs, maxGood: mgs, monthly: mo,
    failSun, failDay, failMinTemp, failMaxTemp, failRain };
}

function Slider({ def, value, onChange }) {
  const pct = ((value - def.min) / (def.max - def.min)) * 100;
  return (
    <div style={{ flex: "1 1 160px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, alignItems: "baseline" }}>
        <span style={{ fontSize: 11, color: "#8892a4", letterSpacing: "0.02em", fontWeight: 500 }}>{def.label}</span>
        <span style={{
          fontSize: 13, fontWeight: 700, color: def.color,
          fontVariantNumeric: "tabular-nums",
          minWidth: 42, textAlign: "right",
        }}>{value}{def.unit}</span>
      </div>
      <div style={{ position: "relative", height: 20, display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", left: 0, right: 0, height: 4, borderRadius: 2, background: "#1a2236" }} />
        <div style={{ position: "absolute", left: 0, width: `${pct}%`, height: 4, borderRadius: 2, background: `${def.color}55` }} />
        <input type="range" min={def.min} max={def.max} step={def.step} value={value}
          onChange={e => onChange(+e.target.value)}
          style={{
            position: "absolute", left: 0, right: 0, width: "100%",
            appearance: "none", WebkitAppearance: "none", background: "transparent",
            height: 20, margin: 0, cursor: "pointer", outline: "none",
          }}
        />
      </div>
    </div>
  );
}

function DotStrip({ data, sliders }) {
  const [hov, setHov] = useState(null);
  const ref = useRef();
  const n = data.time.length;

  const months = useMemo(() => {
    const m = []; let c = "";
    data.time.forEach((t, i) => {
      const mo = t.slice(0, 7);
      if (mo !== c) { m.push({ label: MO[parseInt(t.slice(5, 7)) - 1], idx: i, key: mo }); c = mo; }
    });
    return m;
  }, [data.time]);

  const unit = 2.8;
  const w = n * unit;
  const dotH = 18;
  const labelH = 28;
  const totalH = dotH + labelH;

  const hovData = hov !== null ? {
    date: data.time[hov],
    sun: ((data.sunshine_duration?.[hov] ?? 0) / 3600).toFixed(1),
    day: ((data.daylight_duration?.[hov] ?? 0) / 3600).toFixed(1),
    temp: data.temperature_2m_max?.[hov]?.toFixed(1) ?? "—",
    rain: (data.precipitation_hours?.[hov] ?? 0).toFixed(1),
    good: classify(data, hov, sliders),
  } : null;

  return (
    <div style={{ position: "relative" }}>
      <div ref={ref} style={{ overflowX: "auto", overflowY: "hidden", paddingBottom: 2 }}>
        <svg viewBox={`0 0 ${w} ${totalH}`}
          style={{ width: "100%", minWidth: 680, display: "block" }}>
          {data.time.map((t, i) => {
            const g = classify(data, i, sliders);
            const x = i * unit;
            const bw = unit - 0.4;
            const isHov = hov === i;
            return (
              <g key={t}>
                <rect x={x} y={0} width={bw} height={dotH} rx={0.4}
                  fill={g === null ? "#334155" : g ? "#22c55e" : "none"}
                  stroke={g === null ? "none" : g ? (isHov ? "#86efac" : "#22c55e") : "#ef4444"}
                  strokeWidth={g ? 0 : 0.35}
                  opacity={g === null ? 0.3 : g ? (isHov ? 1 : 0.85) : (isHov ? 0.9 : 0.5)}
                />
                <rect x={x} y={0} width={bw} height={dotH}
                  fill="transparent"
                  onMouseEnter={() => setHov(i)}
                  onMouseLeave={() => setHov(null)}
                  style={{ cursor: "crosshair" }}
                />
              </g>
            );
          })}
          {months.map(({ label, idx }) => (
            <text key={idx} x={idx * unit + 1} y={totalH - 4} fontSize="9" fill="#64748b"
              style={{ fontFamily: "system-ui", userSelect: "none" }}>
              {label}
            </text>
          ))}
        </svg>
      </div>
      {hovData && (
        <div style={{
          position: "absolute", top: -72, left: "50%", transform: "translateX(-50%)",
          background: "#0f172a", border: "1px solid #334155", borderRadius: 8,
          padding: "8px 12px", fontSize: 11, color: "#cbd5e1",
          pointerEvents: "none", zIndex: 20, whiteSpace: "nowrap",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: hovData.good ? "#22c55e" : "#ef4444" }}>
            {hovData.date} — {hovData.good === null ? "No data" : hovData.good ? "Good day" : "Bad day"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 14px", fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: +hovData.sun < sliders.minSun ? "#ef4444" : "#cbd5e1" }}>☀ Sun: {hovData.sun}h</span>
            <span style={{ color: +hovData.temp > sliders.maxTemp ? "#ef4444" : +hovData.temp < sliders.minTemp ? "#ef4444" : "#cbd5e1" }}>🌡 High: {hovData.temp}°C</span>
            <span style={{ color: +hovData.day < sliders.minDay ? "#ef4444" : "#cbd5e1" }}>◑ Daylight: {hovData.day}h</span>
            <span style={{ color: +hovData.rain > sliders.maxRain ? "#ef4444" : "#cbd5e1" }}>🌧 Rain: {hovData.rain}h</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthlyBars({ monthly }) {
  const entries = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div style={{ display: "flex", gap: 3, marginTop: 10, alignItems: "end", height: 40 }}>
      {entries.map(([m, { g, t }]) => {
        const pct = t > 0 ? (g / t) * 100 : 0;
        const label = MO[parseInt(m.slice(5, 7)) - 1];
        return (
          <div key={m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ fontSize: 8, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
              {Math.round(pct)}%
            </div>
            <div style={{
              width: "100%", maxWidth: 28,
              height: Math.max(2, pct * 0.28),
              borderRadius: 2,
              background: pct > 60 ? "#22c55e" : pct > 30 ? "#eab308" : "#ef4444",
              opacity: 0.75,
              transition: "height 0.3s, background 0.3s",
            }} />
            <div style={{ fontSize: 7, color: "#475569" }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: "#0f172a", borderRadius: 6, padding: "4px 10px",
      fontSize: 11, color: "#94a3b8",
    }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

export default function DayQualityTracker() {
  const [cities, setCities] = useState([]);
  const [weatherData, setWeatherData] = useState({});
  const [loadState, setLoadState] = useState({});
  const [sl, setSl] = useState({ minSun: 3, minDay: 9, minTemp: 10, maxTemp: 50, maxRain: 2 });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const timer = useRef();
  const range = useMemo(() => getRange(), []);

  const load = useCallback(async (city) => {
    const k = ckey(city);
    setLoadState(p => ({ ...p, [k]: "loading" }));
    try {
      const d = await fetchWeather(city, range);
      setWeatherData(p => ({ ...p, [k]: d }));
      setLoadState(p => ({ ...p, [k]: "done" }));
    } catch (e) {
      setLoadState(p => ({ ...p, [k]: `error: ${e.message}` }));
    }
  }, [range]);

  useEffect(() => {}, [load]);

  const search = (q) => {
    setQuery(q);
    clearTimeout(timer.current);
    if (q.length < 2) { setResults([]); setShowDropdown(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`);
        const j = await r.json();
        setResults(j.results || []);
        setShowDropdown(true);
      } catch { setResults([]); }
    }, 300);
  };

  const add = (r) => {
    const city = { name: `${r.name}, ${r.country || ""}`.replace(/, $/, ""), lat: r.latitude, lon: r.longitude };
    if (!cities.some(c => ckey(c) === ckey(city))) {
      setCities(p => [...p, city]);
      load(city);
    }
    setQuery(""); setResults([]); setShowDropdown(false);
  };

  const remove = (i) => setCities(p => p.filter((_, j) => j !== i));

  return (
    <div style={{
      fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
      background: "linear-gradient(180deg, #0a0f1c 0%, #0f172a 100%)",
      minHeight: "100vh", color: "#e2e8f0", padding: "24px 16px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700&family=JetBrains+Mono:wght@400;600&display=swap');
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: #e2e8f0; border: 2px solid #334155;
          cursor: pointer; margin-top: -5px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        }
        input[type=range]::-moz-range-thumb {
          width: 12px; height: 12px; border-radius: 50%;
          background: #e2e8f0; border: 2px solid #334155;
          cursor: pointer;
        }
        input[type=range]::-webkit-slider-runnable-track { height: 4px; background: transparent; }
        input[type=range]::-moz-range-track { height: 4px; background: transparent; }
        .city-card { transition: box-shadow 0.2s; }
        .city-card:hover { box-shadow: 0 0 0 1px #334155, 0 8px 32px rgba(0,0,0,0.3); }
        ::selection { background: #22c55e44; }
        .search-result:hover { background: #1e293b !important; }
      `}</style>

      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            fontSize: 26, fontWeight: 700, margin: 0,
            background: "linear-gradient(135deg, #22c55e, #38bdf8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: "-0.02em",
          }}>
            Bad Weather Tracker
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "6px 0 0", lineHeight: 1.5 }}>
            How many <span style={{ color: "#22c55e", fontWeight: 600 }}>good</span> vs <span style={{ color: "#ef4444", fontWeight: 600 }}>bad</span> weather days did your city have in the last year? Search for a location, adjust the thresholds, and compare cities side by side.
          </p>
        </div>

        {/* Sliders panel */}
        <div style={{
          background: "#131b2e", borderRadius: 14, padding: "18px 20px 14px",
          marginBottom: 14, border: "1px solid #1e293b",
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 24px" }}>
            {SLIDER_DEFS.map(def => (
              <Slider key={def.key} def={def} value={sl[def.key]}
                onChange={v => setSl(p => ({ ...p, [def.key]: v }))} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {PRESETS.map(p => {
              const active = Object.entries(p.v).every(([k, v]) => sl[k] === v);
              return (
                <button key={p.label} onClick={() => setSl(p.v)}
                  style={{
                    fontSize: 10, padding: "5px 12px", borderRadius: 20,
                    border: active ? "1px solid #22c55e" : "1px solid #293548",
                    background: active ? "#22c55e18" : "transparent",
                    color: active ? "#22c55e" : "#64748b",
                    cursor: "pointer", fontWeight: 600, letterSpacing: "0.03em",
                    textTransform: "uppercase", transition: "all 0.15s",
                  }}>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search bar */}
        <div style={{ position: "relative", marginBottom: 20 }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: cities.length === 0 ? 16 : 12, top: "50%", transform: "translateY(-50%)", fontSize: cities.length === 0 ? 18 : 14, color: "#475569" }}>
              {cities.length === 0 ? "🔍" : "+"}
            </span>
            <input value={query} onChange={e => search(e.target.value)}
              onFocus={() => results.length && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder={cities.length === 0 ? "Search for a city to get started..." : "Add another city to compare..."}
              autoFocus={cities.length === 0}
              style={{
                width: "100%",
                padding: cities.length === 0 ? "16px 18px 16px 44px" : "10px 14px 10px 32px",
                borderRadius: cities.length === 0 ? 14 : 10,
                border: cities.length === 0 ? "1px solid #334155" : "1px solid #1e293b",
                background: "#131b2e", color: "#e2e8f0",
                fontSize: cities.length === 0 ? 16 : 13,
                boxSizing: "border-box", outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>
          {showDropdown && results.length > 0 && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
              background: "#131b2e", border: "1px solid #293548", borderRadius: 10,
              zIndex: 50, overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            }}>
              {results.map((r, i) => (
                <div key={i} className="search-result"
                  onMouseDown={() => add(r)}
                  style={{
                    padding: "10px 14px", cursor: "pointer", fontSize: 13,
                    borderBottom: i < results.length - 1 ? "1px solid #1a2236" : "none",
                    color: "#cbd5e1", transition: "background 0.1s",
                  }}>
                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                  <span style={{ color: "#64748b" }}>{r.admin1 ? `, ${r.admin1}` : ""}, {r.country}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* City cards */}
        {cities.map((city, ci) => {
          const k = ckey(city);
          const d = weatherData[k];
          const ls = loadState[k];
          const stats = d?.time ? getStats(d, sl) : null;

          return (
            <div key={k} className="city-card" style={{
              background: "#131b2e", borderRadius: 14, padding: "18px 20px",
              marginBottom: 14, border: "1px solid #1e293b",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>{city.name}</h2>
                  {stats && (
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: "#22c55e",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {((stats.good / stats.total) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                {cities.length > 1 && (
                  <button onClick={() => remove(ci)}
                    style={{
                      background: "none", border: "none", color: "#475569",
                      cursor: "pointer", fontSize: 16, padding: "4px 8px",
                      borderRadius: 6, lineHeight: 1,
                    }}>
                    ✕
                  </button>
                )}
              </div>

              {ls === "loading" && (
                <div style={{ color: "#475569", fontSize: 13, padding: "20px 0" }}>
                  <span style={{ display: "inline-block", animation: "pulse 1.5s infinite" }}>Fetching 365 days of weather data...</span>
                </div>
              )}

              {ls?.startsWith("error") && (
                <div style={{ color: "#ef4444", fontSize: 13, padding: "8px 0" }}>
                  <span>{ls}</span>
                  <button onClick={() => load(city)} style={{
                    marginLeft: 12, padding: "4px 12px", borderRadius: 6,
                    border: "1px solid #ef4444", background: "transparent",
                    color: "#ef4444", fontSize: 12, cursor: "pointer",
                  }}>Retry</button>
                </div>
              )}

              {d?.time && (
                <>
                  <DotStrip data={d} sliders={sl} />

                  {stats && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      <StatPill label="Good days" value={stats.good} color="#22c55e" />
                      <StatPill label="Bad days" value={stats.total - stats.good} color="#ef4444" />
                      <StatPill label="Worst streak" value={`${stats.maxBad}d`} color="#ef4444" />
                      <StatPill label="Best streak" value={`${stats.maxGood}d`} color="#22c55e" />
                    </div>
                  )}

                  {stats && (stats.total - stats.good) > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 10, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                        Bad day causes
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {[
                          { label: "Low sunshine", count: stats.failSun, color: "#facc15" },
                          { label: "Short daylight", count: stats.failDay, color: "#38bdf8" },
                          { label: "Too cold", count: stats.failMinTemp, color: "#f87171" },
                          { label: "Too hot", count: stats.failMaxTemp, color: "#fb923c" },
                          { label: "Too much rain", count: stats.failRain, color: "#818cf8" },
                        ].filter(r => r.count > 0)
                         .sort((a, b) => b.count - a.count)
                         .map(r => (
                          <div key={r.label} style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            background: "#0f172a", borderRadius: 6, padding: "4px 10px",
                            fontSize: 11, color: "#94a3b8",
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: r.color, display: "inline-block" }} />
                            <span>{r.label}</span>
                            <span style={{ fontWeight: 700, color: r.color, fontVariantNumeric: "tabular-nums" }}>
                              {r.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {stats && <MonthlyBars monthly={stats.monthly} />}
                </>
              )}
            </div>
          );
        })}

        {/* Legend + footer */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 8, padding: "0 4px", flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#475569" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#22c55e", display: "inline-block" }} /> Good
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, border: "1px solid #ef4444", display: "inline-block" }} /> Bad
            </span>
          </div>
          <div style={{ fontSize: 10, color: "#334155" }}>
            Data: Open-Meteo.com · ERA5 reanalysis · last ~2 days may lag
          </div>
        </div>
      </div>
    </div>
  );
}
