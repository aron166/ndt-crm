// ============================================================
// Companies — list + detail
// ============================================================
/* global React, MOCK, I, Avatar, Badge, PipelineBadge, Sparkline, AreaChart, StackBar */

function CompaniesList({ setRoute }) {
  const [q, setQ] = React.useState('');
  const filtered = MOCK.COMPANIES.filter(c => {
    if (!q) return true;
    return (c.name + c.city + c.industry + c.vat).toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Companies <span className="mono tnum" style={{fontSize:14, color:'var(--fg-mute)', fontWeight:400}}>· {MOCK.COMPANIES.length} of 2 463</span></h1>
          <div className="page-sub">Deduplicated by VAT number. Person history persists across employer changes.</div>
        </div>
        <div className="page-actions">
          <input className="input" placeholder="Search companies, VAT…" value={q} onChange={e=>setQ(e.target.value)} style={{width:280}}/>
          <button className="btn">{I.filter()} Filters</button>
          <button className="btn primary">{I.plus()} New company</button>
        </div>
      </div>

      <div style={{display:'flex', gap:6, marginBottom:14, flexWrap:'wrap', alignItems:'center'}}>
        <div className="chip active">All accounts</div>
        <div className="chip">Active <span style={{color:'var(--fg-faint)'}}>· 1 204</span></div>
        <div className="chip">Lead <span style={{color:'var(--fg-faint)'}}>· 712</span></div>
        <div className="chip">Cold <span style={{color:'var(--fg-faint)'}}>· 384</span></div>
        <div className="chip">Inactive · 163</div>
        <div style={{width:1, height:18, background:'var(--line-soft)', margin:'0 6px'}}/>
        <div className="chip">Industry · Acélipar</div>
        <div className="chip">Headcount &gt; 50</div>
        <div style={{marginLeft:'auto', fontSize:11, color:'var(--fg-mute)', fontFamily:'var(--font-mono)'}}>showing {filtered.length}</div>
      </div>

      <div className="panel mount" style={{overflow:'hidden'}}>
        <table className="tbl">
          <thead>
            <tr>
              <th></th>
              <th>Company</th>
              <th>Industry · Region</th>
              <th>Pipeline</th>
              <th style={{textAlign:'right'}}>Headcount</th>
              <th style={{textAlign:'right'}}>Revenue</th>
              <th>Activity (90d)</th>
              <th>VAT</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, idx) => {
              const activity = Array.from({length:18}, () => Math.random()*40 + 20);
              return (
                <tr key={c.id} className="mount" style={{animationDelay:`${idx*30}ms`}} onClick={() => setRoute({page:'companies', id:c.id})}>
                  <td>
                    <div style={{width:32, height:32, borderRadius:7, background:MOCK.avatarColor(c.id), display:'grid', placeItems:'center', fontFamily:'var(--font-mono)', fontWeight:600, fontSize:11, color:'var(--fg)'}}>{c.short.slice(0,2)}</div>
                  </td>
                  <td className="name">
                    {c.name}
                    <div className="sub mono">{c.short} · {c.tags.join(', ')}</div>
                  </td>
                  <td>
                    {c.industry}
                    <div className="sub">{c.city}, HU</div>
                  </td>
                  <td><PipelineBadge code={c.status}/></td>
                  <td className="num" style={{textAlign:'right'}}>{c.headcount}</td>
                  <td className="num" style={{textAlign:'right', color:'var(--fg)'}}>{c.revenue}</td>
                  <td><Sparkline data={activity} width={100} height={28} color="var(--indigo)" fill={false}/></td>
                  <td className="num">{c.vat}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompanyDetail({ id, setRoute }) {
  const c = MOCK.getCompany(id);
  const contacts = MOCK.PERSONS.filter(p => p.companyId === id);
  const tasks    = MOCK.TASKS.filter(t => t.companyId === id);
  const inter    = MOCK.INTERACTIONS.filter(i => i.companyId === id);
  const [tab, setTab] = React.useState('overview');

  const revSeries = Array.from({length:24}, (_,i) => 60 + i*3 + Math.sin(i*0.7)*15 + Math.random()*8);

  return (
    <div>
      <div className="detail-header mount">
        <div style={{display:'flex', gap:18, alignItems:'flex-start'}}>
          <div style={{width:72, height:72, borderRadius:14, background:MOCK.avatarColor(c.id), display:'grid', placeItems:'center', fontFamily:'var(--font-mono)', fontWeight:600, fontSize:22, color:'var(--fg)', position:'relative'}}>
            {c.short.slice(0,3)}
            <div style={{position:'absolute', inset:0, borderRadius:14, boxShadow:'inset 0 1px 0 oklch(1 0 0 / 0.1), inset 0 -8px 16px oklch(0 0 0 / 0.2)'}}/>
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
              <h1 style={{margin:0, fontSize:26, fontWeight:600, letterSpacing:'-0.02em'}}>{c.name}</h1>
              <PipelineBadge code={c.status}/>
              <Badge tone="indigo" dot={false}>{c.accountType}</Badge>
            </div>
            <div style={{marginTop:6, color:'var(--fg-soft)', fontSize:14}}>{c.industry} · {c.city} · {c.headcount} employees</div>
            <div style={{display:'flex', gap:18, marginTop:14, flexWrap:'wrap'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--fg-soft)'}}><span style={{color:'var(--fg-faint)'}}>VAT</span> <span className="mono">{c.vat}</span></div>
              <div style={{display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--fg-soft)'}}>{I.pin()} {c.city}, Hungary</div>
              <div style={{display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--fg-soft)'}}>{I.link()} {c.short.toLowerCase()}.hu</div>
            </div>
          </div>

          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            <button className="btn primary">{I.plus()} Log interaction</button>
            <button className="btn">{I.note()} New task</button>
            <button className="btn ghost">{I.more()} More</button>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{marginTop:18, display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12}}>
          {[
            { label:'Revenue (yr)', value: c.revenue,    accent:'var(--mint)' },
            { label:'Contacts',     value: contacts.length, accent:'var(--indigo)' },
            { label:'Open tasks',   value: tasks.filter(t=>t.status!=='done').length, accent:'var(--amber)' },
            { label:'Interactions · 30d', value: inter.length + 12, accent:'var(--sky)' },
          ].map((k, i) => (
            <div key={i} style={{padding:14, background:'var(--bg-0)', border:'1px solid var(--line-soft)', borderRadius:8, position:'relative', overflow:'hidden'}}>
              <div className="field-label">{k.label}</div>
              <div className="mono" style={{fontSize:22, marginTop:4}}>{k.value}</div>
              <div style={{position:'absolute', left:0, top:0, bottom:0, width:2, background:k.accent, boxShadow:`0 0 10px ${k.accent}`}}/>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{marginTop:18}}>
        {[
          ['overview', 'Overview'],
          ['contacts', `Contacts · ${contacts.length}`],
          ['activity', 'Activity'],
          ['deals',    'Deals'],
          ['invoices', 'Invoices'],
        ].map(([k,l]) => (
          <div key={k} className={`tab ${tab===k?'active':''}`} onClick={()=>setTab(k)}>{l}</div>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginTop:16}}>
          <div className="panel mount">
            <div className="panel-head">
              <div className="panel-title">Revenue trajectory · 24m</div>
              <span className="mono" style={{fontSize:11, color:'var(--mint)'}}>+42% YoY</span>
            </div>
            <div style={{padding:18}}>
              <AreaChart data={revSeries} height={200} color="var(--indigo)"/>
              <div style={{marginTop:14, display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14}}>
                <div>
                  <div className="field-label">Lifetime value</div>
                  <div className="mono" style={{fontSize:18, marginTop:2}}>€312.4K</div>
                </div>
                <div>
                  <div className="field-label">Avg deal size</div>
                  <div className="mono" style={{fontSize:18, marginTop:2}}>€8.2K</div>
                </div>
                <div>
                  <div className="field-label">Win rate</div>
                  <div className="mono" style={{fontSize:18, marginTop:2, color:'var(--mint)'}}>68%</div>
                </div>
              </div>
            </div>
          </div>

          <div className="panel mount d2">
            <div className="panel-head"><div className="panel-title">Engagement split</div></div>
            <div className="panel-pad">
              <StackBar segments={[
                { label:'Calls',   value: 32, color:'var(--mint)' },
                { label:'Emails',  value: 28, color:'var(--sky)' },
                { label:'Meetings', value: 14, color:'var(--violet)' },
                { label:'Site visits', value: 8, color:'var(--amber)' },
              ]}/>
              <div style={{marginTop:14, display:'flex', flexDirection:'column', gap:8}}>
                {[
                  {l:'Calls', v:32, c:'var(--mint)'},
                  {l:'Emails', v:28, c:'var(--sky)'},
                  {l:'Meetings', v:14, c:'var(--violet)'},
                  {l:'Site visits', v:8, c:'var(--amber)'},
                ].map((x,i) => (
                  <div key={i} style={{display:'flex', alignItems:'center', gap:8, fontSize:12}}>
                    <span style={{width:6, height:6, borderRadius:999, background:x.c, boxShadow:`0 0 6px ${x.c}`}}/>
                    <span style={{flex:1, color:'var(--fg-soft)'}}>{x.l}</span>
                    <span className="mono">{x.v}</span>
                  </div>
                ))}
              </div>
              <div className="divider"/>
              <div className="field-label">Equipment used on site</div>
              <div style={{display:'flex', flexWrap:'wrap', gap:6, marginTop:8}}>
                {c.tags.map(t => <Badge key={t} tone="indigo" dot={false}>{t}</Badge>)}
                <Badge tone="slate" dot={false}>EN ISO 17640</Badge>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="panel mount" style={{marginTop:16, overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr><th></th><th>Contact</th><th>Role</th><th>Signal</th><th>Since</th><th>Owner</th></tr></thead>
            <tbody>
              {contacts.map((p, i) => (
                <tr key={p.id} onClick={()=>setRoute({page:'persons', id:p.id})}>
                  <td><Avatar seed={p.id} label={MOCK.personInitials(p)} size="sm"/></td>
                  <td className="name">{MOCK.personName(p)}<div className="sub mono">{p.email}</div></td>
                  <td>{p.role}</td>
                  <td><SignalMeter level={p.signal}/></td>
                  <td className="num">{p.since}</td>
                  <td><Avatar seed={i*73 + 5} label="PJ" size="sm"/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'activity' && (
        <div className="panel mount" style={{marginTop:16, padding:'18px 22px'}}>
          <div className="tl">
            {inter.length ? inter.map(r => {
              const p = MOCK.getPerson(r.personId);
              return (
                <div key={r.id} className="tl-item" style={{'--accent':'var(--indigo)'}}>
                  <div className="tl-dot"/>
                  <div className="tl-head">
                    <span className="who">{r.type} · <span className="row-link" onClick={()=>setRoute({page:'persons', id:p.id})}>{MOCK.personName(p)}</span></span>
                    <span className="when">{r.at}</span>
                  </div>
                  <div className="tl-body">{r.note}</div>
                </div>
              );
            }) : <div style={{textAlign:'center', color:'var(--fg-mute)', padding:'32px 0'}}>No activity</div>}
          </div>
        </div>
      )}

      {tab === 'deals' && (
        <div className="panel mount" style={{marginTop:16, padding:18, fontSize:13, color:'var(--fg-mute)'}}>2 active deals · €25.6K combined</div>
      )}
      {tab === 'invoices' && (
        <div className="panel mount" style={{marginTop:16, padding:18, fontSize:13, color:'var(--fg-mute)'}}>14 invoices · 3 outstanding · €4 200 due</div>
      )}
    </div>
  );
}

window.CompaniesList = CompaniesList;
window.CompanyDetail = CompanyDetail;
