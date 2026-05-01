import { useState, useMemo, useEffect, useCallback } from "react";

// ── API CLIENT (calls our Vercel proxy, not OfficeRND directly) ───────────────
async function apiGet(endpoint, params = {}) {
  const url = new URL("/api/officernd", window.location.origin);
  url.searchParams.set("endpoint", endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function fetchBookings(startDate, endDate) {
  const data = await apiGet("bookings", { startDate, endDate });
  const arr = Array.isArray(data) ? data : data.results || [];
  return arr.map(b => ({
    id: b._id,
    room: b.resource?.name || b.resourceName || "Room",
    member: b.member?.name || b.memberName || "Guest",
    company: b.team?.name || "",
    start: b.start ? new Date(b.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "",
    end: b.end ? new Date(b.end).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "",
    date: b.start ? b.start.split("T")[0] : startDate,
    status: b.status === "cancelled" ? "cancelled" : "confirmed",
  }));
}

async function fetchDayPasses(startDate, endDate) {
  const data = await apiGet("day-passes", { startDate, endDate });
  const arr = Array.isArray(data) ? data : data.results || [];
  return arr.map(p => ({
    id: p._id,
    name: p.member?.name || p.memberName || "Visitor",
    email: p.member?.email || p.memberEmail || "",
    date: p.date ? p.date.split("T")[0] : startDate,
    checkIn: p.checkedInAt ? new Date(p.checkedInAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : null,
    status: p.checkedInAt ? "checked-in" : "booked",
  }));
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
const fmt = (d) => d.toISOString().split("T")[0];
const TODAY = new Date();

function getWeekDates(anchor) {
  const d = new Date(anchor + "T12:00:00");
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return fmt(x);
  });
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDateLong(s) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function formatDateShort(s) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const c = {
  bg: "#F7F6F3", surface: "#FFFFFF", border: "#E2DFD8",
  text: "#1A1814", muted: "#7A756C",
  accent: "#1B4F72", accentLight: "#EBF3FA",
  green: "#1A5C3A", greenLight: "#E8F5EE",
  amber: "#7A4A0A", amberLight: "#FDF3E3",
  red: "#7A1A1A", redLight: "#FDEAEA",
};

// ── SMALL UI HELPERS ──────────────────────────────────────────────────────────
const Badge = ({ col, bg, children }) => (
  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: bg, color: col, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>{children}</span>
);

const Pip = ({ col, bg, children }) => (
  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: bg, color: col, marginBottom: 3, display: "block" }}>{children}</span>
);

const Spinner = () => (
  <div style={{ padding: 32, textAlign: "center", color: c.muted, fontSize: 13 }}>Loading from OfficeRND…</div>
);

// ── ROWS ──────────────────────────────────────────────────────────────────────
function BookingRow({ b }) {
  const cancelled = b.status === "cancelled";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${c.border}`, opacity: cancelled ? 0.5 : 1 }}>
      <div style={{ width: 4, height: 36, borderRadius: 2, background: cancelled ? "#ccc" : c.accent, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{b.room}</div>
        <div style={{ fontSize: 12, color: c.muted }}>{b.member}{b.company ? ` · ${b.company}` : ""}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{b.start}–{b.end}</div>
        {cancelled && <Badge col={c.red} bg={c.redLight}>Cancelled</Badge>}
      </div>
    </div>
  );
}

function DayPassRow({ dp }) {
  const ci = dp.status === "checked-in";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${c.border}` }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: ci ? c.greenLight : c.amberLight, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: ci ? c.green : c.amber, flexShrink: 0 }}>
        {dp.name.charAt(0)}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{dp.name}</div>
        <div style={{ fontSize: 12, color: c.muted }}>{dp.email}</div>
      </div>
      {ci ? <Badge col={c.green} bg={c.greenLight}>In · {dp.checkIn}</Badge> : <Badge col={c.amber} bg={c.amberLight}>Booked</Badge>}
    </div>
  );
}

// ── CARD ──────────────────────────────────────────────────────────────────────
function Card({ title, count, col, bg, loading, children }) {
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>{title}</span>
        <Badge col={col} bg={bg}>{loading ? "…" : count}</Badge>
      </div>
      {loading ? <Spinner /> : children}
    </div>
  );
}

function Empty({ msg }) {
  return <div style={{ padding: 20, textAlign: "center", color: c.muted, fontSize: 13 }}>{msg}</div>;
}

function ErrorBox({ msg }) {
  return <div style={{ background: c.redLight, border: `1px solid ${c.red}`, borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: c.red }}>⚠ {msg}</div>;
}

// ── VIEWS ─────────────────────────────────────────────────────────────────────
function DayView({ date, bookings, passes, loading, error }) {
  const b = bookings.filter(x => x.date === date);
  const p = passes.filter(x => x.date === date);
  return (
    <div>
      <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 26, fontWeight: 400, marginBottom: 4 }}>{formatDateLong(date)}</div>
      <div style={{ fontSize: 13, color: c.muted, marginBottom: 20 }}>Daily summary · StoryLabs</div>
      {error && <ErrorBox msg={error} />}
      <Card title="Conference Room Bookings" count={`${b.length} booking${b.length !== 1 ? "s" : ""}`} col={c.accent} bg={c.accentLight} loading={loading}>
        {b.length === 0 ? <Empty msg="No bookings today" /> : b.map(x => <BookingRow key={x.id} b={x} />)}
      </Card>
      <Card title="Day Pass Visitors" count={`${p.length} visitor${p.length !== 1 ? "s" : ""}`} col={c.green} bg={c.greenLight} loading={loading}>
        {p.length === 0 ? <Empty msg="No day pass visitors today" /> : p.map(x => <DayPassRow key={x.id} dp={x} />)}
      </Card>
    </div>
  );
}

function WeekView({ weekDates, bookings, passes, loading, error, onSelectDay }) {
  const wb = bookings.filter(x => weekDates.includes(x.date));
  const wp = passes.filter(x => weekDates.includes(x.date));
  return (
    <div>
      <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 26, fontWeight: 400, marginBottom: 4 }}>
        {formatDateShort(weekDates[0])} – {formatDateShort(weekDates[6])}
      </div>
      <div style={{ fontSize: 13, color: c.muted, marginBottom: 20 }}>Weekly overview · tap any day for details</div>
      {error && <ErrorBox msg={error} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginBottom: 20 }}>
        {weekDates.map((d, i) => {
          const isToday = d === fmt(TODAY);
          const db = bookings.filter(x => x.date === d && x.status !== "cancelled");
          const dp = passes.filter(x => x.date === d);
          return (
            <div key={d} onClick={() => onSelectDay(d)} style={{ borderRadius: 10, border: `1px solid ${isToday ? c.accent : c.border}`, background: isToday ? c.accentLight : c.surface, padding: "12px 10px", minHeight: 100, cursor: "pointer" }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: isToday ? c.accent : c.muted, marginBottom: 4 }}>{DAY_LABELS[i]}</div>
              <div style={{ fontSize: 20, fontFamily: "'DM Serif Display', Georgia, serif", color: isToday ? c.accent : c.text, marginBottom: 8 }}>{new Date(d + "T12:00:00").getDate()}</div>
              {loading ? <Pip col={c.muted} bg={c.border}>…</Pip> : <>
                {db.length > 0 && <Pip col={c.accent} bg={c.accentLight}>{db.length} room{db.length > 1 ? "s" : ""}</Pip>}
                {dp.length > 0 && <Pip col={c.green} bg={c.greenLight}>{dp.length} pass{dp.length > 1 ? "es" : ""}</Pip>}
              </>}
            </div>
          );
        })}
      </div>

      <Card title="Conference Room Bookings — This Week" count={`${wb.length} total`} col={c.accent} bg={c.accentLight} loading={loading}>
        {wb.length === 0 ? <Empty msg="No bookings this week" /> : wb.map(x => (
          <div key={x.id}>
            <div style={{ padding: "4px 20px 0", fontSize: 11, fontWeight: 600, color: c.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{formatDateShort(x.date)}</div>
            <BookingRow b={x} />
          </div>
        ))}
      </Card>

      <Card title="Day Pass Visitors — This Week" count={`${wp.length} visitors`} col={c.green} bg={c.greenLight} loading={loading}>
        {wp.length === 0 ? <Empty msg="No day pass visitors this week" /> : wp.map(x => (
          <div key={x.id}>
            <div style={{ padding: "4px 20px 0", fontSize: 11, fontWeight: 600, color: c.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{formatDateShort(x.date)}</div>
            <DayPassRow dp={x} />
          </div>
        ))}
      </Card>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("day");
  const [selectedDate, setSelectedDate] = useState(fmt(TODAY));
  const [bookings, setBookings] = useState([]);
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const load = useCallback(async (dates) => {
    setLoading(true);
    setError(null);
    try {
      const [b, p] = await Promise.all([
        fetchBookings(dates[0], dates[dates.length - 1]),
        fetchDayPasses(dates[0], dates[dates.length - 1]),
      ]);
      setBookings(b);
      setPasses(p);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(view === "day" ? [selectedDate] : weekDates);
  }, [view, selectedDate]);

  function shift(n) {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + (view === "day" ? n : n * 7));
    setSelectedDate(fmt(d));
  }

  const btn = { border: "none", fontFamily: "inherit", cursor: "pointer" };

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", background: c.bg, minHeight: "100vh", color: c.text }}>

      {/* Header */}
      <div style={{ background: c.accent, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <div>
          <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 20, color: "#fff" }}>StoryLabs</span>
          <span style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", marginLeft: 6 }}>Host Connect</span>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
      </div>

      {/* Nav */}
      <div style={{ background: c.surface, borderBottom: `1px solid ${c.border}`, padding: "0 32px", display: "flex", alignItems: "center", gap: 4, height: 48 }}>
        {["day", "week"].map(v => (
          <button key={v} onClick={() => setView(v)} style={{ ...btn, padding: "6px 16px", borderRadius: 6, background: view === v ? c.accent : "transparent", color: view === v ? "#fff" : c.muted, fontSize: 13, fontWeight: 500, textTransform: "capitalize" }}>{v}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setSelectedDate(fmt(TODAY))} style={{ ...btn, fontSize: 12, fontWeight: 500, padding: "4px 12px", borderRadius: 6, border: `1px solid ${c.border}`, background: c.surface, color: c.muted }}>Today</button>
      </div>

      {/* Date nav */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button onClick={() => shift(-1)} style={{ ...btn, width: 32, height: 32, border: `1px solid ${c.border}`, borderRadius: 8, background: c.surface, color: c.muted, fontSize: 16 }}>‹</button>
          <button onClick={() => shift(1)} style={{ ...btn, width: 32, height: 32, border: `1px solid ${c.border}`, borderRadius: 8, background: c.surface, color: c.muted, fontSize: 16 }}>›</button>
          {view === "week" && <span style={{ fontSize: 13, color: c.muted }}>{formatDateShort(weekDates[0])} – {formatDateShort(weekDates[6])}</span>}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 40px" }}>
        {view === "day" && <DayView date={selectedDate} bookings={bookings} passes={passes} loading={loading} error={error} />}
        {view === "week" && <WeekView weekDates={weekDates} bookings={bookings} passes={passes} loading={loading} error={error} onSelectDay={(d) => { setSelectedDate(d); setView("day"); }} />}
      </div>

      <div style={{ textAlign: "center", padding: "0 0 32px", fontSize: 11, color: c.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        Live · OfficeRND · storylabs
      </div>
    </div>
  );
}
