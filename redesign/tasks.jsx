// ============================================================
// Tasks · Kanban board
// ============================================================
/* global React, MOCK, I, Avatar, Badge */

const COLUMNS = [
  { key: 'todo',   title: 'Not started', color: 'var(--fg-mute)' },
  { key: 'doing',  title: 'In progress', color: 'var(--indigo)' },
  { key: 'review', title: 'Review',      color: 'var(--amber)' },
  { key: 'done',   title: 'Done',        color: 'var(--mint)' },
];

function priorityTone(p) {
  return p === 'high' ? 'coral' : p === 'med' ? 'amber' : 'slate';
}
function categoryTone(c) {
  return ({ sales:'indigo', outreach:'sky', reports:'violet', legal:'amber', compliance:'amber', ops:'mint', billing:'mint' })[c] || 'slate';
}

function KanbanCard({ task, onDragStart, onDragEnd, dragging, setRoute }) {
  const p = MOCK.getPerson(task.personId);
  const c = MOCK.getCompany(task.companyId);
  const overdue = task.due < '2026-05-12' && task.status !== 'done';
  return (
    <div
      className={`kcard ${dragging ? 'dragging' : ''}`}
      draggable
      onDragStart={() => onDragStart(task.id)}
      onDragEnd={onDragEnd}
    >
      <div className="kcard-top">
        <span className="kcard-id mono">{task.id}</span>
        <div style={{display:'flex', gap:6}}>
          <Badge tone={priorityTone(task.priority)} dot={false}>{task.priority}</Badge>
        </div>
      </div>
      <div className="kcard-title">{task.title}</div>
      <div style={{display:'flex', gap:6, marginTop:8}}>
        <Badge tone={categoryTone(task.category)} dot={false}>{task.category}</Badge>
        <span className="badge slate no-dot mono" style={{height:18, padding:'0 6px'}}>{task.est}m</span>
      </div>
      <div className="kcard-sub">
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:6}}>
          <div style={{display:'flex', alignItems:'center', gap:6, minWidth:0, flex:1}}>
            <Avatar seed={p.id} label={MOCK.personInitials(p)} size="sm"/>
            <span className="row-link" onClick={(e)=>{e.stopPropagation(); setRoute({page:'persons', id:p.id})}} style={{minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--fg-soft)'}}>{MOCK.personName(p)}</span>
          </div>
          <span style={{color:'var(--fg-faint)'}}>·</span>
          <span className="row-link" onClick={(e)=>{e.stopPropagation(); setRoute({page:'companies', id:c.id})}} style={{color:'var(--fg-mute)'}}>{c.short}</span>
        </div>
      </div>
      <div className="kcard-meta">
        <span className="mtag">{I.clock()} <span className={`kcard-due ${overdue?'overdue':''}`}>{task.due.slice(5)}</span></span>
        <span style={{flex:1}}/>
        <Avatar seed={task.assignee.charCodeAt(0)*7} label={task.assignee} size="sm"/>
      </div>
    </div>
  );
}

function Kanban({ setRoute }) {
  const [tasks, setTasks] = React.useState(MOCK.TASKS.slice());
  const [draggingId, setDraggingId] = React.useState(null);
  const [hoverCol, setHoverCol] = React.useState(null);
  const [filter, setFilter] = React.useState('all');
  const [groupBy, setGroupBy] = React.useState('status');

  const total = tasks.length;
  const counts = COLUMNS.map(col => tasks.filter(t => t.status === col.key).length);

  function onDragStart(id) { setDraggingId(id); }
  function onDragEnd() { setDraggingId(null); setHoverCol(null); }
  function onDropToCol(colKey) {
    if (!draggingId) return;
    setTasks(prev => prev.map(t => t.id === draggingId ? { ...t, status: colKey } : t));
    setDraggingId(null); setHoverCol(null);
  }

  const filtered = tasks.filter(t => {
    if (filter === 'mine') return t.assignee === 'PJ';
    if (filter === 'high') return t.priority === 'high';
    if (filter === 'overdue') return t.due < '2026-05-12' && t.status !== 'done';
    return true;
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Tasks · Kanban
            <span className="mono tnum" style={{fontSize:14, color:'var(--fg-mute)', fontWeight:400, marginLeft:8}}>{filtered.length} / {total}</span>
          </h1>
          <div className="page-sub">Drag cards between columns. Every state change is timestamped.</div>
        </div>
        <div className="page-actions">
          <button className="btn">{I.filter()} Filters</button>
          <button className="btn ghost">Group: <span className="mono" style={{marginLeft:4, color:'var(--fg)'}}>{groupBy}</span> {I.arrowDown()}</button>
          <button className="btn primary">{I.plus()} New task</button>
        </div>
      </div>

      <div style={{display:'flex', gap:6, marginBottom:14, alignItems:'center', flexWrap:'wrap'}}>
        <div className={`chip ${filter==='all'?'active':''}`} onClick={()=>setFilter('all')}>All <span style={{color:'var(--fg-faint)'}}>· {total}</span></div>
        <div className={`chip ${filter==='mine'?'active':''}`} onClick={()=>setFilter('mine')}>Assigned to me</div>
        <div className={`chip ${filter==='high'?'active':''}`} onClick={()=>setFilter('high')}>High priority</div>
        <div className={`chip ${filter==='overdue'?'active':''}`} onClick={()=>setFilter('overdue')}>Overdue · 3</div>
        <div style={{width:1, height:18, background:'var(--line-soft)', margin:'0 6px'}}/>
        <div className="chip">Category · Sales</div>
        <div className="chip">Due this week</div>
        <div style={{marginLeft:'auto', display:'flex', gap:14, fontSize:11, color:'var(--fg-mute)', fontFamily:'var(--font-mono)'}}>
          <span><span style={{color:'var(--mint)'}}>●</span> {counts[3]} done</span>
          <span><span style={{color:'var(--amber)'}}>●</span> {counts[2]} review</span>
          <span><span style={{color:'var(--indigo)'}}>●</span> {counts[1]} active</span>
          <span><span style={{color:'var(--fg-mute)'}}>●</span> {counts[0]} todo</span>
        </div>
      </div>

      <div className="kanban">
        {COLUMNS.map((col, ci) => {
          const colTasks = filtered.filter(t => t.status === col.key);
          const totalEst = colTasks.reduce((s, t) => s + (t.est||0), 0);
          const hours = Math.floor(totalEst / 60);
          const mins = totalEst % 60;
          return (
            <div
              key={col.key}
              className="kcol mount"
              style={{
                animationDelay: `${ci*70}ms`,
                borderColor: hoverCol === col.key ? col.color : undefined,
                background: hoverCol === col.key ? `${col.color.replace('var(--', 'oklch(0.66 0.19 278 / 0.06)')}` : undefined,
                transition: 'border-color .15s, background .15s'
              }}
              onDragOver={(e) => { e.preventDefault(); setHoverCol(col.key); }}
              onDragLeave={() => setHoverCol(prev => prev === col.key ? null : prev)}
              onDrop={() => onDropToCol(col.key)}
            >
              <div className="kcol-head">
                <span className="kcol-dot" style={{background: col.color, boxShadow: `0 0 8px ${col.color}`}}/>
                <span className="kcol-title">{col.title}</span>
                <span className="kcol-count mono">{colTasks.length}</span>
                <span style={{fontSize:10, color:'var(--fg-faint)', fontFamily:'var(--font-mono)', marginLeft:6}}>{hours}h{mins ? ' ' + mins + 'm' : ''}</span>
              </div>

              <div className="kcol-body">
                {colTasks.map(t => (
                  <KanbanCard
                    key={t.id}
                    task={t}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    dragging={draggingId === t.id}
                    setRoute={setRoute}
                  />
                ))}

                <button className="btn ghost" style={{justifyContent:'flex-start', width:'100%', height:30, fontSize:12, color:'var(--fg-mute)'}}>
                  {I.plus()} Add task
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.Kanban = Kanban;
