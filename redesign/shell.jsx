// ============================================================
// Sidebar + Topbar + StatusBar shell
// ============================================================
/* global React, I, Avatar, LiveClock, Oscilloscope */

const NAV = [
  { group: 'WORKSPACE', items: [
    { id: 'dashboard', label: 'Dashboard',  icon: 'dashboard', badge: '' },
    { id: 'tasks',     label: 'Tasks',      icon: 'tasks',     badge: '14' },
    { id: 'inbox',     label: 'Briefing',   icon: 'inbox',     badge: 'AI' },
  ]},
  { group: 'RELATIONSHIPS', items: [
    { id: 'persons',   label: 'Persons',    icon: 'persons',   badge: '7 991' },
    { id: 'companies', label: 'Companies',  icon: 'building',  badge: '2 463' },
    { id: 'pipeline',  label: 'Pipeline',   icon: 'pipe',      badge: '' },
  ]},
  { group: 'OPERATIONS', items: [
    { id: 'invoices',  label: 'Invoices',   icon: 'invoice',   badge: '' },
    { id: 'ai',        label: 'Ask Árpil',  icon: 'ai',        badge: 'β' },
    { id: 'settings',  label: 'Settings',   icon: 'settings',  badge: '' },
  ]},
];

function Sidebar({ route, setRoute }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M3 12 C7 4, 11 20, 15 12 S 21 4, 21 12" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <div style={{lineHeight:1.1}}>
          <div className="brand-name">Árpil</div>
          <div className="brand-tenant">NDT · Controllabor</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(group => (
          <div key={group.group}>
            <div className="nav-label">{group.group}</div>
            {group.items.map(it => (
              <div key={it.id}
                   className={`nav-item ${route.page === it.id ? 'active' : ''}`}
                   onClick={() => setRoute({ page: it.id })}>
                <span className="nav-icon">{I[it.icon] && I[it.icon]()}</span>
                {it.label}
                {it.badge && <span className="nav-badge">{it.badge}</span>}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-card">
          <Avatar seed={278} label="PJ" online={true} />
          <div style={{lineHeight:1.1, flex:1, minWidth:0}}>
            <div style={{fontSize:12, fontWeight:500}}>Péter Józsa</div>
            <div style={{fontSize:10, color:'var(--fg-mute)', fontFamily:'var(--font-mono)'}}>admin@controllabor.hu</div>
          </div>
          <span className="icon-btn" style={{width:24, height:24}}>{I.more()}</span>
        </div>
      </div>
    </aside>
  );
}
window.Sidebar = Sidebar;

const CRUMB_LABELS = {
  dashboard: 'Dashboard',
  tasks: 'Tasks · Kanban',
  inbox: 'Morning briefing',
  persons: 'Persons',
  companies: 'Companies',
  pipeline: 'Pipeline',
  invoices: 'Invoices',
  ai: 'Ask Árpil',
  settings: 'Settings',
};

function Topbar({ route, setRoute }) {
  let crumbs = [<span key="root" className="crumb-sep">Árpil</span>, <span key="s1" className="crumb-sep">/</span>];
  if (route.page === 'persons' && route.id) {
    const p = MOCK.getPerson(route.id);
    crumbs.push(<span key="p" className="row-link" onClick={()=>setRoute({page:'persons'})}>Persons</span>);
    crumbs.push(<span key="s2" className="crumb-sep">/</span>);
    crumbs.push(<span key="now" className="now">{MOCK.personName(p)}</span>);
  } else if (route.page === 'companies' && route.id) {
    const c = MOCK.getCompany(route.id);
    crumbs.push(<span key="c" className="row-link" onClick={()=>setRoute({page:'companies'})}>Companies</span>);
    crumbs.push(<span key="s2" className="crumb-sep">/</span>);
    crumbs.push(<span key="now" className="now">{c.name}</span>);
  } else {
    crumbs.push(<span key="now" className="now">{CRUMB_LABELS[route.page] || 'Dashboard'}</span>);
  }

  return (
    <div className="topbar">
      <div className="crumbs">{crumbs}</div>

      <div className="command">
        {I.search()}
        <span>Jump to person, company, task…</span>
        <span className="kbd">⌘K</span>
      </div>

      <div className="signal-bar" title="Live sync — last event 4s ago"><i/><i/><i/><i/><i/></div>

      <button className="icon-btn" title="Notifications">
        {I.bell()}
      </button>
      <button className="btn primary">
        {I.plus()} New
      </button>
    </div>
  );
}
window.Topbar = Topbar;

function StatusBar() {
  return (
    <div className="status-bar">
      <span className="sb"><span className="dot"></span>Supabase · live</span>
      <span className="sb"><span className="dot"></span>Trigger.dev · 0 backlog</span>
      <span className="sb warn"><span className="dot"></span>3 tasks overdue</span>
      <span className="sb">EU · CET</span>
      <span className="right mono"><LiveClock/></span>
      <span className="mono">v0.4.2 · branch <span style={{color:'var(--indigo)'}}>feat/dashboard</span></span>
    </div>
  );
}
window.StatusBar = StatusBar;
