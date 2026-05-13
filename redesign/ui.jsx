// ============================================================
// Shared UI primitives, icons, charts
// ============================================================
/* global React, MOCK */

const { useState, useEffect, useRef, useMemo } = React;

// ----- Lucide-ish stroke icons (hand-rolled minimal set) -----
const I = {
  dashboard: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>,
  persons: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  building: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="2" width="16" height="20" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/><path d="M10 22v-4h4v4"/></svg>,
  tasks: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/></svg>,
  pipe: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18l-4 6 4 6H3"/></svg>,
  inbox: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>,
  bell: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  search: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  invoice: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>,
  ai: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3.5"/></svg>,
  settings: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.15.69.35 1 .6.31.25.6.55.85.85.25.31.45.64.6 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  arrow: (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="9 18 15 12 9 6"/></svg>,
  arrowUp: (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="18 15 12 9 6 15"/></svg>,
  arrowDown: (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="6 9 12 15 18 9"/></svg>,
  plus: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  filter: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  phone: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  mail: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/></svg>,
  meet: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M17 11a5 5 0 0 1-10 0"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="7" r="3"/></svg>,
  note: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  site: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  link: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  pin: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="10" r="3"/><path d="M12 22s-8-6.5-8-12a8 8 0 0 1 16 0c0 5.5-8 12-8 12z"/></svg>,
  trend: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>,
  user: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  clock: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>,
  cmd: (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>,
  bolt: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  more: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
  check: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="20 6 9 17 4 12"/></svg>,
};
window.I = I;

// ----- Avatar -----
function Avatar({ seed, label, size, online }) {
  const cls = ['avatar', size, online ? 'avatar-online' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} style={{ background: MOCK.avatarColor(seed) }}>
      {label}
    </div>
  );
}
window.Avatar = Avatar;

// ----- Badge -----
function Badge({ tone='slate', children, dot=true }) {
  return <span className={`badge ${tone} ${dot ? '' : 'no-dot'}`}>{children}</span>;
}
window.Badge = Badge;

function PipelineBadge({ code }) {
  const p = MOCK.pipeStatus(code);
  return <Badge tone={p.tone}>{p.code} · {p.label}</Badge>;
}
window.PipelineBadge = PipelineBadge;

// ----- Sparkline -----
function Sparkline({ data, width=120, height=36, color='var(--indigo)', fill=true, animate=true }) {
  if (!data || !data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = (max - min) || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => [i*stepX, height - ((v-min)/range)*height*0.85 - height*0.075]);
  const d = pts.map((p,i)=> (i===0?'M':'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const dFill = d + ` L ${width} ${height} L 0 ${height} Z`;
  // Approx length for dasharray (proportional to width)
  const len = Math.round(width * 2);
  const grad = `spark-grad-${Math.random().toString(36).slice(2,7)}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{display:'block'}}>
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {fill && <path d={dFill} fill={`url(#${grad})`} />}
      <path
        d={d} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
        className={animate ? 'spark-path' : ''}
        style={animate ? { '--dashlen': len } : {}}
      />
    </svg>
  );
}
window.Sparkline = Sparkline;

// ----- AreaChart (larger) -----
function AreaChart({ data, height=180, color='var(--indigo)', label='', gridY=4 }) {
  const ref = useRef(null);
  const [width, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      setW(entries[0].contentRect.width);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const min = Math.min(...data), max = Math.max(...data);
  const range = (max - min) || 1;
  const pad = 8;
  const w = width;
  const h = height;
  const innerH = h - 36;
  const stepX = (w - pad*2) / (data.length - 1);
  const pts = data.map((v, i) => [pad + i*stepX, 20 + innerH - ((v-min)/range)*innerH*0.85 - innerH*0.075]);
  const d = pts.map((p,i)=> (i===0?'M':'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const dFill = d + ` L ${w-pad} ${h-8} L ${pad} ${h-8} Z`;
  const grad = `area-grad-${Math.random().toString(36).slice(2,7)}`;
  const len = Math.round(w * 2);
  // Gridlines
  const lines = [];
  for (let i=0; i<=gridY; i++) {
    const y = 20 + (innerH * (i/gridY));
    lines.push(<line key={i} x1={pad} x2={w-pad} y1={y} y2={y} stroke="oklch(0.35 0.014 255 / 0.25)" strokeDasharray="2 4"/>);
  }
  return (
    <div ref={ref} style={{width:'100%'}}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:'block'}}>
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.55"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {lines}
        <path d={dFill} fill={`url(#${grad})`} />
        <path d={d} fill="none" stroke={color} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              className="spark-path" style={{'--dashlen': len}}/>
        {/* end-dot */}
        {pts.length > 0 && (
          <g>
            <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="9" fill={color} opacity="0.18"/>
            <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="3.5" fill={color}/>
          </g>
        )}
      </svg>
    </div>
  );
}
window.AreaChart = AreaChart;

// ----- Horizontal segmented bar -----
function StackBar({ segments, height=10 }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div style={{display:'flex', gap:2, height, borderRadius:999, overflow:'hidden', background:'var(--bg-2)'}}>
      {segments.map((s, i) => (
        <div key={i} title={`${s.label}: ${s.value}`}
             style={{ width: `${(s.value/total)*100}%`, background: s.color, transition:'width .6s ease' }}/>
      ))}
    </div>
  );
}
window.StackBar = StackBar;

// ----- Bar chart (vertical) -----
function BarChart({ data, height=140, color='var(--indigo)' }) {
  const ref = useRef(null);
  const [width, setW] = useState(400);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(e => setW(e[0].contentRect.width));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  const max = Math.max(...data.map(d => d.v));
  const pad = 8;
  const gap = 6;
  const bw = (width - pad*2 - gap*(data.length-1)) / data.length;
  return (
    <div ref={ref} style={{width:'100%'}}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{display:'block'}}>
        {data.map((d, i) => {
          const bh = ((d.v / max) * (height - 30));
          const x = pad + i*(bw+gap);
          const y = height - 22 - bh;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={bh}
                    rx="3" fill={d.color || color} opacity="0.85"
                    style={{transition: 'all .8s cubic-bezier(.2,.7,.2,1)'}}>
                <animate attributeName="height" from="0" to={bh} dur="0.7s" fill="freeze"/>
                <animate attributeName="y" from={height-22} to={y} dur="0.7s" fill="freeze"/>
              </rect>
              <text x={x + bw/2} y={height-6} textAnchor="middle"
                    fontFamily="JetBrains Mono" fontSize="10" fill="var(--fg-faint)">{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
window.BarChart = BarChart;

// ----- Donut -----
function Donut({ segments, size=140, thickness=14, centerLabel='', centerValue='' }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness)/2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{position:'relative', width:size, height:size}}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{transform:'rotate(-90deg)'}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-2)" strokeWidth={thickness}/>
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const off = c - len;
          const dash = `${len} ${c-len}`;
          const rot = (acc / total) * 360;
          acc += s.value;
          return (
            <circle key={i} cx={size/2} cy={size/2} r={r}
                    fill="none" stroke={s.color}
                    strokeWidth={thickness}
                    strokeDasharray={dash}
                    strokeDashoffset="0"
                    style={{ transform:`rotate(${rot}deg)`, transformOrigin: 'center', transition:'all .6s ease' }}/>
          );
        })}
      </svg>
      <div style={{position:'absolute', inset:0, display:'grid', placeItems:'center', textAlign:'center'}}>
        <div>
          <div className="mono tnum" style={{fontSize:24, fontWeight:500, letterSpacing:'-0.02em'}}>{centerValue}</div>
          <div style={{fontSize:10, color:'var(--fg-mute)', textTransform:'uppercase', letterSpacing:'0.1em', marginTop:2}}>{centerLabel}</div>
        </div>
      </div>
    </div>
  );
}
window.Donut = Donut;

// ----- Oscilloscope wave decoration -----
function Oscilloscope({ width=560, height=70, color='var(--indigo)', speed=18 }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    let raf;
    const t0 = performance.now();
    const loop = (t) => {
      setPhase(((t - t0) / 1000) * (speed/10));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [speed]);
  const d = MOCK.wave(width, height, phase);
  const d2 = MOCK.wave(width, height, phase + 1.4);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{display:'block'}}>
      <path d={d2} fill="none" stroke={color} strokeWidth="1" opacity="0.25"/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" opacity="0.9"/>
    </svg>
  );
}
window.Oscilloscope = Oscilloscope;

// ----- Live ticker time -----
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
window.LiveClock = LiveClock;
