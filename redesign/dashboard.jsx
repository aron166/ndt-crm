// ============================================================
// Dashboard
// ============================================================
/* global React, MOCK, I, Avatar, Badge, PipelineBadge, Sparkline, AreaChart, BarChart, Donut, Oscilloscope, StackBar */

function PipelineStrip({ onCellClick }) {
  return (
    <div className="pipe-strip">
      {MOCK.PIPE.map((p, i) => {
        const count = MOCK.PIPE_COUNTS[i];
        const total = MOCK.PIPE_COUNTS.reduce((s,x)=>s+x,0);
        const pct = (count/Math.max(...MOCK.PIPE_COUNTS)) * 100;
        const colorMap = {
          slate: 'oklch(0.55 0.014 255)', amber: 'var(--amber)', sky: 'var(--sky)',
          coral: 'var(--coral)', indigo: 'var(--indigo)', mint: 'var(--mint)'
        };
        return (
          <div key={p.code} className="pipe-cell" style={{'--accent': colorMap[p.tone]}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
              <span className="code">{p.code}</span>
              <span className="code" style={{color:'var(--fg-faint)'}}>{((count/total)*100).toFixed(1)}%</span>
            </div>
            <div className="pcount tnum">{count.toLocaleString('hu-HU').replace(/,/g,' ')}</div>
            <div className="label">{p.label}</div>
            <div className="pbar" style={{width: pct+'%'}}/>
          </div>
        );
      })}
    </div>
  );
}

function KPI({ label, value, delta, deltaUp, accent, data, mono=true, unit='' }) {
  return (
    <div className="kpi mount" style={{'--accent': accent}}>
      <div className="k-label">{label}</div>
      <div className={`k-value ${mono?'mono':''}`}>{value}<span style={{fontSize:14, color:'var(--fg-mute)', marginLeft:4}}>{unit}</span></div>
      <div className={`k-delta ${deltaUp ? 'up' : 'down'}`}>
        {deltaUp ? I.arrowUp() : I.arrowDown()} {delta} <span style={{color:'var(--fg-faint)'}}>vs last 30d</span>
      </div>
      <div className="k-spark">
        <Sparkline data={data} width={120} height={36} color={accent}/>
      </div>
    </div>
  );
}

function Dashboard({ setRoute }) {
  const series = useMemo(() => MOCK.pipelineSeries(), []);
  const kpis = [
    { label: 'Active deals',       value: '156',     delta: '+12.4%', up: true,  accent: 'var(--indigo)' },
    { label: 'Closed Won · 30d',   value: '€84.2K',  delta: '+22.1%', up: true,  accent: 'var(--mint)' },
    { label: 'Avg. response time', value: '00:18:42', delta: '−6m 12s', up: true,  accent: 'var(--amber)' },
    { label: 'Tasks overdue',      value: '3',       delta: '−2',     up: true,  accent: 'var(--coral)' },
  ].map((k, i) => ({...k, data: Array.from({length:24}, () => Math.random()*40 + (i===2?40:20))}));

  const today = new Date();
  const greet = today.getHours() < 11 ? 'Jó reggelt' : today.getHours() < 18 ? 'Jó napot' : 'Jó estét';

  // Recent activity
  const recents = MOCK.INTERACTIONS.slice().sort((a,b) => b.at.localeCompare(a.at)).slice(0, 6);

  // Top relationships by signal
  const topPersons = MOCK.PERSONS.slice().sort((a,b) => b.signal - a.signal).slice(0, 5);

  // Conversion this month
  const monthBars = [
    { label: 'jan', v: 14, color: 'var(--indigo)' },
    { label: 'feb', v: 11, color: 'var(--indigo)' },
    { label: 'mar', v: 19, color: 'var(--indigo)' },
    { label: 'apr', v: 22, color: 'var(--indigo)' },
    { label: 'máj', v: 16, color: 'var(--indigo-dim)' },
  ];

  // Type mix of NDT methods used by clients (donut)
  const methodMix = [
    { label: 'UT (ultra)',    value: 38, color: 'var(--indigo)' },
    { label: 'RT (radio)',    value: 24, color: 'var(--amber)' },
    { label: 'MT (mágneses)', value: 17, color: 'var(--mint)' },
    { label: 'PT (penetráns)', value: 13, color: 'var(--sky)' },
    { label: 'VT / egyéb',    value: 8,  color: 'var(--violet)' },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {greet}, Péter
            <span className="badge mint" style={{marginLeft:8}}>14 task ma</span>
          </h1>
          <div className="page-sub">Csütörtök · 2026.05.12 · összesen 3 helyszíni szemle a héten</div>
        </div>
        <div className="page-actions">
          <div className="chip"><span className="mono">30d</span></div>
          <div className="chip active"><span>This month</span></div>
          <div className="chip"><span>QTD</span></div>
          <button className="btn ghost">{I.filter()} Filters</button>
          <button className="btn">{I.trend()} Export</button>
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map((k, i) => <KPI key={i} {...k} deltaUp={k.up}/>)}
      </div>

      <div className="divider"/>

      {/* Pipeline pulse — flagship visualization */}
      <div className="panel mount d1" style={{marginBottom:16, overflow:'hidden', position:'relative'}}>
        <div className="panel-head">
          <div className="panel-title"><span className="live-dot"></span>Pipeline pulse · last 30 days</div>
          <div style={{display:'flex', alignItems:'center', gap:12}}>
            <span style={{fontSize:11, color:'var(--fg-mute)', fontFamily:'var(--font-mono)'}}>3 050 active contacts</span>
            <button className="btn sm ghost" onClick={()=>setRoute({page:'pipeline'})}>{I.arrow()} Open pipeline</button>
          </div>
        </div>
        <div style={{padding:20}}>
          <PipelineStrip onCellClick={()=>{}}/>
          <div style={{marginTop:18, position:'relative'}}>
            <AreaChart data={series} height={180} color="var(--indigo)" />
          </div>
        </div>
      </div>

      <div className="split-grid mount d2">
        {/* Today queue */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">{I.bolt()} Today · prioritized by AI</div>
            <button className="btn sm ghost" onClick={()=>setRoute({page:'tasks'})}>Open kanban {I.arrow()}</button>
          </div>
          <div style={{padding:'8px 8px 12px'}}>
            {MOCK.TASKS.filter(t => t.status !== 'done').slice(0, 6).map((t, i) => {
              const p = MOCK.getPerson(t.personId);
              const c = MOCK.getCompany(t.companyId);
              const overdue = t.due < '2026-05-12';
              return (
                <div key={t.id} style={{
                  display:'grid', gridTemplateColumns:'auto 1fr auto auto auto', gap:12,
                  alignItems:'center', padding:'10px 12px', borderRadius:6,
                  cursor:'pointer', transition:'background .15s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{
                    width:18, height:18, borderRadius:5, border:'1.5px solid var(--line)',
                    display:'grid', placeItems:'center', cursor:'pointer'
                  }}/>
                  <div>
                    <div style={{fontSize:13, fontWeight:500}}>{t.title}</div>
                    <div style={{fontSize:11, color:'var(--fg-mute)', marginTop:2}}>
                      <span className="row-link" onClick={(e)=>{e.stopPropagation(); setRoute({page:'persons', id: p.id})}}>{MOCK.personName(p)}</span>
                      <span style={{margin:'0 6px', color:'var(--fg-faint)'}}>·</span>
                      <span className="row-link" onClick={(e)=>{e.stopPropagation(); setRoute({page:'companies', id: c.id})}}>{c.short}</span>
                      <span style={{margin:'0 6px', color:'var(--fg-faint)'}}>·</span>
                      <span className="mono">{t.est}m est</span>
                    </div>
                  </div>
                  <Badge tone={t.priority === 'high' ? 'coral' : t.priority === 'med' ? 'amber' : 'slate'} dot={false}>{t.priority.toUpperCase()}</Badge>
                  <span className={`mono ${overdue ? '' : ''}`} style={{fontSize:11, color: overdue ? 'var(--coral)' : 'var(--fg-mute)'}}>{t.due.slice(5)}</span>
                  <Avatar seed={t.assignee.charCodeAt(0)} label={t.assignee} size="sm"/>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity feed — oscilloscope style */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title"><span className="live-dot"/>Live activity</div>
            <span style={{fontSize:11, color:'var(--fg-mute)'}} className="mono">last sync 4s</span>
          </div>
          <div style={{padding:'14px 20px', borderBottom:'1px solid var(--line-soft)', position:'relative'}}>
            <Oscilloscope width={360} height={48} color="var(--indigo)" />
          </div>
          <div style={{padding:'14px 20px'}}>
            <div className="tl">
              {recents.map((r, i) => {
                const p = MOCK.getPerson(r.personId);
                const c = MOCK.getCompany(r.companyId);
                const u = MOCK.getUser(r.user);
                const typeColor = {
                  call: 'var(--mint)', email: 'var(--sky)', meeting: 'var(--violet)',
                  note: 'var(--fg-mute)', site_visit: 'var(--amber)'
                }[r.type] || 'var(--indigo)';
                const typeLabel = {
                  call: 'Hívás', email: 'E-mail', meeting: 'Egyeztetés', note: 'Jegyzet', site_visit: 'Helyszín'
                }[r.type];
                return (
                  <div key={r.id} className="tl-item" style={{'--accent': typeColor}}>
                    <div className="tl-dot"/>
                    <div className="tl-head">
                      <span className="who">
                        <span style={{color:'var(--fg-mute)', fontWeight:400}}>{u.name}</span>
                        <span style={{color:'var(--fg-faint)', margin:'0 6px'}}>·</span>
                        {typeLabel} →
                        <span className="row-link" onClick={()=>setRoute({page:'persons', id:p.id})} style={{marginLeft:4}}>{MOCK.personName(p)}</span>
                      </span>
                      <span className="when">{r.at.slice(11)}</span>
                    </div>
                    <div className="tl-body">{r.note}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginTop:16}} className="mount d3">
        {/* Method mix donut */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">NDT method mix · 90d</div>
            <span className="mono" style={{fontSize:11, color:'var(--fg-mute)'}}>n=412</span>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:18, padding:18, alignItems:'center'}}>
            <Donut segments={methodMix} centerValue="412" centerLabel="Tests"/>
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              {methodMix.map((m, i) => (
                <div key={i} style={{display:'flex', alignItems:'center', gap:8, fontSize:12}}>
                  <span style={{width:8, height:8, borderRadius:2, background:m.color, boxShadow:`0 0 6px ${m.color}`}}/>
                  <span style={{flex:1, color:'var(--fg-soft)'}}>{m.label}</span>
                  <span className="mono tnum" style={{color:'var(--fg-mute)'}}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly CW count */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Closed Won / month</div>
            <span className="mono" style={{fontSize:11, color:'var(--mint)'}}>+38% YoY</span>
          </div>
          <div style={{padding:'18px 18px 8px'}}>
            <BarChart data={monthBars} height={140}/>
          </div>
        </div>

        {/* Top relationships — signal strength */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Top relationships</div>
            <span style={{fontSize:11, color:'var(--fg-mute)'}}>by signal strength</span>
          </div>
          <div style={{padding:'10px 14px 14px', display:'flex', flexDirection:'column', gap:2}}>
            {topPersons.map((p, i) => {
              const c = MOCK.getCompany(p.companyId);
              return (
                <div key={p.id} style={{
                  display:'grid', gridTemplateColumns:'auto 1fr auto', gap:10,
                  alignItems:'center', padding:'8px 6px', borderRadius:6, cursor:'pointer'
                }}
                onClick={()=>setRoute({page:'persons', id:p.id})}
                onMouseEnter={e=>e.currentTarget.style.background='var(--bg-2)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <Avatar seed={p.id} label={MOCK.personInitials(p)} size="sm"/>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:500}}>{MOCK.personName(p)}</div>
                    <div style={{fontSize:10, color:'var(--fg-mute)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p.role} · {c.short}</div>
                  </div>
                  <SignalMeter level={p.signal}/>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalMeter({ level=3, max=6 }) {
  return (
    <div className="signal-meter" style={{'--accent': level >= 5 ? 'var(--mint)' : level >= 3 ? 'var(--amber)' : 'var(--coral)'}}>
      {[1,2,3,4,5,6].map(i => <i key={i} className={i <= level ? 'on' : ''}/>)}
    </div>
  );
}
window.SignalMeter = SignalMeter;
window.Dashboard = Dashboard;
window.PipelineStrip = PipelineStrip;
