// ============================================================
// Persons — list + detail
// ============================================================
/* global React, MOCK, I, Avatar, Badge, PipelineBadge, Sparkline, SignalMeter, Oscilloscope */

function PersonsList({ setRoute }) {
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState('all');

  const filtered = MOCK.PERSONS.filter(p => {
    if (q) {
      const s = (p.first + ' ' + p.last + ' ' + p.email + ' ' + p.city).toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    if (filter === 'high') return p.signal >= 5;
    if (filter === 'cold') return p.signal <= 2;
    return true;
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Persons <span className="mono tnum" style={{fontSize:14, color:'var(--fg-mute)', fontWeight:400}}>· {MOCK.PERSONS.length} of 7 991</span></h1>
          <div className="page-sub">Person-centric — the human persists when they change employer.</div>
        </div>
        <div className="page-actions">
          <input className="input" placeholder="Search persons…" value={q} onChange={e => setQ(e.target.value)} style={{width:260}}/>
          <button className="btn">{I.filter()} Filters</button>
          <button className="btn primary">{I.plus()} New person</button>
        </div>
      </div>

      <div style={{display:'flex', gap:6, marginBottom:14, flexWrap:'wrap', alignItems:'center'}}>
        <div className={`chip ${filter==='all'?'active':''}`} onClick={()=>setFilter('all')}>All <span style={{color:'var(--fg-faint)'}}>· 7 991</span></div>
        <div className={`chip ${filter==='high'?'active':''}`} onClick={()=>setFilter('high')}>Strong signal <span style={{color:'var(--fg-faint)'}}>· 412</span></div>
        <div className={`chip ${filter==='cold'?'active':''}`} onClick={()=>setFilter('cold')}>Going cold <span style={{color:'var(--fg-faint)'}}>· 1 124</span></div>
        <div style={{width:1, height:18, background:'var(--line-soft)', margin:'0 6px'}}/>
        <div className="chip">NDT certified · UT</div>
        <div className="chip">Last seen 30d</div>
        <div className="chip">Job changed 90d</div>
        <div style={{marginLeft:'auto', fontSize:11, color:'var(--fg-mute)', fontFamily:'var(--font-mono)'}}>showing {filtered.length}</div>
      </div>

      <div className="panel mount" style={{overflow:'hidden'}}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{width:34}}></th>
              <th>Person</th>
              <th>Role · Company</th>
              <th>Pipeline</th>
              <th>Signal</th>
              <th>Last contact</th>
              <th style={{textAlign:'right'}}>Owner</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, idx) => {
              const c = MOCK.getCompany(p.companyId);
              const pipe = c?.status ?? 1;
              const lastDays = Math.floor(Math.random()*40) + 1;
              return (
                <tr key={p.id} className="mount" style={{animationDelay: `${idx*40}ms`}} onClick={() => setRoute({ page: 'persons', id: p.id })}>
                  <td><Avatar seed={p.id} label={MOCK.personInitials(p)} size="sm"/></td>
                  <td className="name">
                    {MOCK.personName(p)}
                    <div className="sub mono">{p.email}</div>
                  </td>
                  <td>
                    {p.role}
                    <div className="sub">{c?.name}</div>
                  </td>
                  <td><PipelineBadge code={pipe}/></td>
                  <td><SignalMeter level={p.signal}/></td>
                  <td className="num">
                    <span style={{color: lastDays < 14 ? 'var(--fg-soft)' : 'var(--fg-mute)'}}>{lastDays}d</span>
                    <div className="sub">{p.city}</div>
                  </td>
                  <td style={{textAlign:'right'}}>
                    <Avatar seed={(idx*73)%6 + 1} label={['PJ','AK','KK','BS','PJ','AK'][idx % 6]} size="sm"/>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PersonDetail({ id, setRoute }) {
  const p = MOCK.getPerson(id);
  const c = MOCK.getCompany(p.companyId);
  const [tab, setTab] = React.useState('activity');
  const interactions = MOCK.INTERACTIONS.filter(i => i.personId === id);
  const tasks = MOCK.TASKS.filter(t => t.personId === id);

  // Generate a fake career timeline (current + 2 past contacts)
  const career = [
    { from: '2021-03', to: 'now',     companyId: p.companyId, role: p.role,         current: true },
    { from: '2017-06', to: '2021-02', companyId: 7,           role: 'NDT mérnök' },
    { from: '2013-09', to: '2017-05', companyId: 11,          role: 'Műszaki gyakornok' },
  ];

  // Engagement sparkline
  const engagement = Array.from({length: 24}, (_, i) => 20 + Math.sin(i*0.5)*15 + Math.random()*10 + (i>15?15:0));

  return (
    <div>
      <div className="detail-header mount">
        <div style={{display:'flex', gap:18, alignItems:'flex-start'}}>
          <Avatar seed={p.id} label={MOCK.personInitials(p)} size="xl" online={true}/>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
              <h1 style={{margin:0, fontSize:26, fontWeight:600, letterSpacing:'-0.02em'}}>{MOCK.personName(p)}</h1>
              <PipelineBadge code={c.status}/>
              <Badge tone="indigo" dot={false}>Person · #{p.id}</Badge>
            </div>
            <div style={{marginTop:6, color:'var(--fg-soft)', fontSize:14}}>
              {p.role} <span style={{color:'var(--fg-faint)'}}>at</span> <span className="row-link" onClick={()=>setRoute({page:'companies', id:c.id})}>{c.name}</span>
            </div>
            <div style={{display:'flex', gap:18, marginTop:14, flexWrap:'wrap'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--fg-soft)'}}>{I.mail()} <span className="mono">{p.email}</span></div>
              <div style={{display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--fg-soft)'}}>{I.phone()} <span className="mono">{p.phone}</span></div>
              <div style={{display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--fg-soft)'}}>{I.pin()} {p.city}</div>
              <div style={{display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--fg-soft)'}}>{I.link()} linkedin.com/in/{p.last.toLowerCase()}-{p.first.toLowerCase()}</div>
            </div>
          </div>

          {/* Signal strength block */}
          <div style={{minWidth:200, background:'var(--bg-1)', border:'1px solid var(--line-soft)', borderRadius:8, padding:14}}>
            <div className="field-label">Relationship signal</div>
            <div style={{display:'flex', alignItems:'baseline', gap:8, marginTop:4}}>
              <span className="mono" style={{fontSize:24, fontWeight:500}}>{p.signal}.0</span>
              <span style={{fontSize:11, color:'var(--fg-mute)'}}>/ 6.0</span>
            </div>
            <SignalMeter level={p.signal}/>
            <div style={{fontSize:11, color:'var(--fg-mute)', marginTop:8, lineHeight:1.4}}>
              {p.signal >= 5 ? 'Hot — engaged in last 7 days' : p.signal >= 3 ? 'Steady — quarterly touchpoints' : 'Cold — no contact 90+ days'}
            </div>
          </div>

          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            <button className="btn primary">{I.phone()} Call</button>
            <button className="btn">{I.mail()} Email</button>
            <button className="btn">{I.note()} Log note</button>
          </div>
        </div>

        {/* Engagement strip */}
        <div style={{marginTop:18, padding:14, background:'var(--bg-0)', borderRadius:8, border:'1px solid var(--line-soft)', display:'grid', gridTemplateColumns:'1fr 2fr', gap:16, alignItems:'center'}}>
          <div>
            <div className="field-label">Engagement — last 24 weeks</div>
            <div style={{display:'flex', gap:14, marginTop:6}}>
              <div><div className="mono" style={{fontSize:18}}>{interactions.length}</div><div style={{fontSize:10, color:'var(--fg-mute)'}}>interactions</div></div>
              <div><div className="mono" style={{fontSize:18}}>{tasks.length}</div><div style={{fontSize:10, color:'var(--fg-mute)'}}>open tasks</div></div>
              <div><div className="mono" style={{fontSize:18}}>4.6y</div><div style={{fontSize:10, color:'var(--fg-mute)'}}>relationship</div></div>
            </div>
          </div>
          <Sparkline data={engagement} width={420} height={48} color="var(--indigo)" />
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:18}}>
        <div className="tabs">
          {[
            ['activity', 'Activity', interactions.length],
            ['career',   'Career',   3],
            ['tasks',    'Tasks',    tasks.length],
            ['deals',    'Deals',    2],
            ['files',    'Files',    7],
          ].map(([key, label, count]) => (
            <div key={key} className={`tab ${tab===key?'active':''}`} onClick={() => setTab(key)}>
              {label}<span className="tcount mono">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:16, marginTop:16}}>
        <div className="panel mount d1">
          {tab === 'activity' && <ActivityTab interactions={interactions}/>}
          {tab === 'career'   && <CareerTab career={career} setRoute={setRoute}/>}
          {tab === 'tasks'    && <PersonTasksTab tasks={tasks} setRoute={setRoute}/>}
          {tab === 'deals'    && <PersonDealsTab/>}
          {tab === 'files'    && <PersonFilesTab/>}
        </div>

        {/* Side panel — context */}
        <div style={{display:'flex', flexDirection:'column', gap:16}}>
          <div className="panel mount d2">
            <div className="panel-head"><div className="panel-title">Current employer</div></div>
            <div className="panel-pad">
              <div style={{display:'flex', alignItems:'center', gap:12}}>
                <div style={{width:42, height:42, borderRadius:8, background:MOCK.avatarColor(c.id), display:'grid', placeItems:'center', fontFamily:'var(--font-mono)', fontWeight:600, fontSize:13}}>{c.short.slice(0,2)}</div>
                <div style={{minWidth:0, flex:1}}>
                  <div className="row-link" style={{fontWeight:500}} onClick={()=>setRoute({page:'companies', id:c.id})}>{c.name}</div>
                  <div style={{fontSize:11, color:'var(--fg-mute)', marginTop:2}}>{c.industry} · {c.city}</div>
                </div>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:14}}>
                <div><div className="field-label">VAT</div><div className="field-value mono">{c.vat}</div></div>
                <div><div className="field-label">Headcount</div><div className="field-value mono">{c.headcount}</div></div>
                <div><div className="field-label">Revenue</div><div className="field-value mono">{c.revenue}</div></div>
                <div><div className="field-label">Status</div><PipelineBadge code={c.status}/></div>
              </div>
            </div>
          </div>

          <div className="panel mount d3">
            <div className="panel-head"><div className="panel-title">{I.ai()} Árpil suggests</div></div>
            <div className="panel-pad" style={{fontSize:13, color:'var(--fg-soft)', lineHeight:1.5}}>
              <p style={{margin:'0 0 10px'}}>
                <span style={{color:'var(--indigo)', fontWeight:500}}>Hívd fel Bélát ma délután.</span> Az átlagos 22 másodperces válaszidő alapján a délutáni 14:00–16:00 sáv a leghatékonyabb.
              </p>
              <p style={{margin:0, fontSize:12, color:'var(--fg-mute)'}}>
                Korreláció: a 22 mp alatt érkezett ajánlatok 73%-a CW-ben végződött az elmúlt 18 hónapban.
              </p>
              <div style={{display:'flex', gap:6, marginTop:12}}>
                <button className="btn sm primary">Schedule call</button>
                <button className="btn sm ghost">Dismiss</button>
              </div>
            </div>
          </div>

          <div className="panel mount d4">
            <div className="panel-head"><div className="panel-title">Tags</div></div>
            <div className="panel-pad" style={{display:'flex', gap:6, flexWrap:'wrap'}}>
              <Badge tone="indigo" dot={false}>UT certified</Badge>
              <Badge tone="indigo" dot={false}>EN ISO 9712</Badge>
              <Badge tone="mint" dot={false}>Decision maker</Badge>
              <Badge tone="amber" dot={false}>Quarterly check-in</Badge>
              <Badge tone="slate" dot={false}>+ add tag</Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityTab({ interactions }) {
  const TYPE = {
    call:       { color: 'var(--mint)',   label: 'Hívás',     icon: I.phone },
    email:      { color: 'var(--sky)',    label: 'E-mail',    icon: I.mail  },
    meeting:    { color: 'var(--violet)', label: 'Egyeztetés', icon: I.meet  },
    site_visit: { color: 'var(--amber)',  label: 'Helyszín',  icon: I.site  },
    note:       { color: 'var(--fg-mute)', label: 'Jegyzet',   icon: I.note  },
  };
  return (
    <div style={{padding:'18px 22px'}}>
      <div className="tl">
        {interactions.map((r, i) => {
          const t = TYPE[r.type];
          return (
            <div key={r.id} className="tl-item" style={{'--accent': t.color}}>
              <div className="tl-dot"/>
              <div className="tl-head">
                <span className="who">
                  <span style={{color: t.color, fontWeight:500}}>{t.label}</span>
                  <span style={{color:'var(--fg-faint)', margin:'0 6px'}}>·</span>
                  <span style={{color:'var(--fg-mute)'}}>{r.dir || 'note'}</span>
                  <span style={{color:'var(--fg-faint)', margin:'0 6px'}}>·</span>
                  <span style={{color:'var(--fg-mute)'}}>{r.user}</span>
                </span>
                <span className="when">{r.at}</span>
              </div>
              <div className="tl-body">{r.note}</div>
            </div>
          );
        })}
        {interactions.length === 0 && <div style={{padding:'30px 0', textAlign:'center', color:'var(--fg-mute)', fontSize:13}}>No interactions yet</div>}
      </div>
    </div>
  );
}

function CareerTab({ career, setRoute }) {
  return (
    <div style={{padding:'22px 24px'}}>
      <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:16}}>
        <span className="h-section" style={{margin:0}}>Career path</span>
        <span style={{fontSize:11, color:'var(--fg-mute)', fontFamily:'var(--font-mono)'}}>3 contacts · 2 employers</span>
      </div>
      <div className="tl">
        {career.map((c, i) => {
          const co = MOCK.getCompany(c.companyId);
          return (
            <div key={i} className="tl-item" style={{'--accent': c.current ? 'var(--indigo)' : 'var(--fg-mute)'}}>
              <div className="tl-dot"/>
              <div className="tl-head">
                <span className="who">
                  <span style={{fontWeight:500}}>{c.role}</span>
                  <span style={{color:'var(--fg-faint)', margin:'0 6px'}}>at</span>
                  <span className="row-link" onClick={()=>setRoute({page:'companies', id:co.id})}>{co.name}</span>
                  {c.current && <Badge tone="indigo" dot={false} >current</Badge>}
                </span>
                <span className="when">{c.from} → {c.to}</span>
              </div>
              <div className="tl-body">
                {co.industry} · {co.city} · {co.headcount} employees
              </div>
            </div>
          );
        })}
      </div>
      <div style={{marginTop:18, padding:14, border:'1px dashed var(--line-soft)', borderRadius:8, fontSize:12, color:'var(--fg-mute)', display:'flex', gap:10, alignItems:'flex-start'}}>
        <span style={{color:'var(--indigo)'}}>{I.ai()}</span>
        <div>
          <div style={{color:'var(--fg)', fontWeight:500, marginBottom:4}}>Why we keep career history</div>
          When Béla moves to a new company, this entire history follows him. The relationship is the asset — not the contact record at any single employer.
        </div>
      </div>
    </div>
  );
}

function PersonTasksTab({ tasks, setRoute }) {
  return (
    <div style={{padding:'8px 12px'}}>
      {tasks.map((t, i) => {
        const overdue = t.due < '2026-05-12';
        const c = MOCK.getCompany(t.companyId);
        return (
          <div key={t.id} style={{padding:'12px 12px', borderBottom:'1px solid var(--line-soft)', display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:12, alignItems:'center'}}>
            <div style={{width:18, height:18, borderRadius:5, border:`1.5px solid ${t.status==='done' ? 'var(--mint)' : 'var(--line)'}`, background: t.status==='done' ? 'var(--mint-soft)' : 'transparent', display:'grid', placeItems:'center'}}>
              {t.status === 'done' && <span style={{color:'var(--mint)'}}>{I.check()}</span>}
            </div>
            <div>
              <div style={{fontSize:13, fontWeight:500, textDecoration: t.status==='done' ? 'line-through' : 'none', color: t.status==='done' ? 'var(--fg-mute)' : 'var(--fg)'}}>{t.title}</div>
              <div style={{fontSize:11, color:'var(--fg-mute)', marginTop:2}}>
                <span className="mono">{t.id}</span> · {c.short} · <span className="mono">{t.est}m est</span>
              </div>
            </div>
            <Badge tone={t.priority==='high' ? 'coral' : t.priority==='med' ? 'amber' : 'slate'} dot={false}>{t.priority}</Badge>
            <span className="mono" style={{fontSize:11, color: overdue ? 'var(--coral)' : 'var(--fg-mute)'}}>{t.due.slice(5)}</span>
          </div>
        );
      })}
      {tasks.length === 0 && <div style={{padding:'30px 0', textAlign:'center', color:'var(--fg-mute)', fontSize:13}}>No tasks yet</div>}
    </div>
  );
}

function PersonDealsTab() {
  const deals = [
    { id:'D-2025-041', name:'Q2 UT vizsgálati keret', stage: 5, value:'€18 400', closeDate:'2026-06-30' },
    { id:'D-2025-038', name:'Csőszakasz audit 14db',  stage: 8, value:'€7 200',  closeDate:'2026-04-22' },
  ];
  return (
    <div style={{padding:'18px'}}>
      <table className="tbl">
        <thead><tr><th>Deal</th><th>Stage</th><th>Value</th><th>Close</th></tr></thead>
        <tbody>
          {deals.map(d => (
            <tr key={d.id}>
              <td className="name">{d.name}<div className="sub mono">{d.id}</div></td>
              <td><PipelineBadge code={d.stage}/></td>
              <td className="num">{d.value}</td>
              <td className="num">{d.closeDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PersonFilesTab() {
  const files = [
    { name: 'UT_jegyzokonyv_2026-04-12.pdf', size:'2.4 MB', when:'4 days ago' },
    { name: 'Arajanlat_v2.1.pdf',            size:'1.1 MB', when:'1 week ago' },
    { name: 'EN_ISO_9712_certificate.pdf',   size:'380 KB', when:'2 months ago' },
  ];
  return (
    <div style={{padding:'18px', display:'flex', flexDirection:'column', gap:8}}>
      {files.map((f,i) => (
        <div key={i} style={{padding:12, border:'1px solid var(--line-soft)', borderRadius:6, display:'flex', alignItems:'center', gap:12, cursor:'pointer'}}>
          <div style={{width:32, height:32, borderRadius:6, background:'var(--bg-2)', display:'grid', placeItems:'center', color:'var(--fg-mute)'}}>{I.note()}</div>
          <div style={{flex:1}}>
            <div className="mono" style={{fontSize:13}}>{f.name}</div>
            <div style={{fontSize:11, color:'var(--fg-mute)', marginTop:2}}>{f.size} · {f.when}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

window.PersonsList = PersonsList;
window.PersonDetail = PersonDetail;
