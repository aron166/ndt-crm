// ============================================================
// Mock data — NDT industry, Hungarian names, person-centric
// ============================================================

window.MOCK = (function() {

  const COMPANIES = [
    { id: 1,  name: 'Acélvizsgáló Mérnöki Kft.',     short: 'AVM',   vat: 'HU12345678', city: 'Budapest',   industry: 'Acélipar',          status: 5, accountType: 'Active', headcount: 42,  revenue: '€2.4M', tags: ['UT','PT'] },
    { id: 2,  name: 'Hegesztéstechnika Zrt.',        short: 'HEGT',  vat: 'HU23456789', city: 'Győr',       industry: 'Hegesztés',         status: 8, accountType: 'Active', headcount: 128, revenue: '€11.2M', tags: ['RT','UT','MT'] },
    { id: 3,  name: 'Roncsolásmentes Vizsg. Kft.',   short: 'RVK',   vat: 'HU34567890', city: 'Debrecen',   industry: 'NDT szolgáltató',   status: 5, accountType: 'Active', headcount: 18,  revenue: '€840K',  tags: ['UT'] },
    { id: 4,  name: 'Műszerkalibráló Központ',       short: 'MKK',   vat: 'HU45678901', city: 'Miskolc',    industry: 'Kalibrálás',        status: 3, accountType: 'Lead',   headcount: 9,   revenue: '€420K',  tags: ['CAL'] },
    { id: 5,  name: 'Anyagvizsgáló Egyesület',       short: 'ANYV',  vat: 'HU56789012', city: 'Szeged',     industry: 'Egyesület',         status: 2, accountType: 'Lead',   headcount: 4,   revenue: '€95K',   tags: ['EDU'] },
    { id: 6,  name: 'Csőgyár Kelet Zrt.',            short: 'CSGY',  vat: 'HU67890123', city: 'Tiszaújváros', industry: 'Csőgyártás',      status: 6, accountType: 'Active', headcount: 340, revenue: '€48M',   tags: ['UT','RT'] },
    { id: 7,  name: 'Vasszerkezet Gyártó Kft.',      short: 'VSZ',   vat: 'HU78901234', city: 'Pécs',       industry: 'Vasszerkezet',      status: 4, accountType: 'Cold',   headcount: 56,  revenue: '€3.1M',  tags: ['MT','VT'] },
    { id: 8,  name: 'Turbinaipar Magyarország',      short: 'TIM',   vat: 'HU89012345', city: 'Paks',       industry: 'Energetika',        status: 8, accountType: 'Active', headcount: 220, revenue: '€32M',   tags: ['UT','RT','ET'] },
    { id: 9,  name: 'Hídépítő Konzorcium',           short: 'HID',   vat: 'HU90123456', city: 'Budapest',   industry: 'Építőipar',         status: 3, accountType: 'Lead',   headcount: 78,  revenue: '€18M',   tags: ['UT','MT'] },
    { id: 10, name: 'Olajipari Karbantartó',         short: 'OIK',   vat: 'HU01234567', city: 'Százhalombatta', industry: 'Olajipar',     status: 7, accountType: 'Inactive', headcount: 95, revenue: '€14M',  tags: ['RT','UT'] },
    { id: 11, name: 'Vasúti Műszaki Kft.',           short: 'VMK',   vat: 'HU11122233', city: 'Szolnok',    industry: 'Vasút',             status: 1, accountType: 'Cold',   headcount: 28,  revenue: '€1.2M',  tags: ['MT','PT'] },
    { id: 12, name: 'Présházgép Kft.',               short: 'PHG',   vat: 'HU22233344', city: 'Eger',       industry: 'Gépészet',          status: 5, accountType: 'Active', headcount: 14,  revenue: '€680K',  tags: ['UT'] },
  ];

  const PERSONS = [
    { id: 101, first: 'Béla',    last: 'Kovács',     email: 'kovacs.bela@avm.hu',     phone: '+36 30 111 2233', city: 'Budapest',  role: 'Műszaki igazgató',  companyId: 1, signal: 6, since: '2021-03-04' },
    { id: 102, first: 'Anna',    last: 'Szabó',      email: 'anna.szabo@hegt.hu',     phone: '+36 30 222 3344', city: 'Győr',      role: 'Beszerzési vezető', companyId: 2, signal: 5, since: '2022-09-12' },
    { id: 103, first: 'István',  last: 'Nagy',       email: 'i.nagy@rvk.hu',          phone: '+36 30 333 4455', city: 'Debrecen',  role: 'Ügyvezető',         companyId: 3, signal: 6, since: '2020-11-22' },
    { id: 104, first: 'Gábor',   last: 'Tóth',       email: 'g.toth@mkk.hu',          phone: '+36 30 444 5566', city: 'Miskolc',   role: 'Labvezető',         companyId: 4, signal: 3, since: '2024-01-15' },
    { id: 105, first: 'Eszter',  last: 'Horváth',    email: 'horvath.e@csgy.hu',      phone: '+36 30 555 6677', city: 'Tiszaújváros', role: 'QA vezető',      companyId: 6, signal: 5, since: '2023-06-08' },
    { id: 106, first: 'Péter',   last: 'Varga',      email: 'varga.p@tim.hu',         phone: '+36 30 666 7788', city: 'Paks',      role: 'Karbantartási vez.', companyId: 8, signal: 6, since: '2019-04-17' },
    { id: 107, first: 'Zoltán',  last: 'Kiss',       email: 'kiss.z@hid.hu',          phone: '+36 30 777 8899', city: 'Budapest',  role: 'Projektmérnök',     companyId: 9, signal: 4, since: '2023-02-28' },
    { id: 108, first: 'András',  last: 'Molnár',     email: 'molnar.a@oik.hu',        phone: '+36 30 888 9900', city: 'Százhalombatta', role: 'Üzemvezető',   companyId: 10, signal: 2, since: '2018-08-30' },
    { id: 109, first: 'László',  last: 'Németh',     email: 'l.nemeth@vmk.hu',        phone: '+36 30 999 0011', city: 'Szolnok',   role: 'Beszerző',          companyId: 11, signal: 2, since: '2024-11-04' },
    { id: 110, first: 'Gergő',   last: 'Farkas',     email: 'farkas.g@phg.hu',        phone: '+36 30 121 2334', city: 'Eger',      role: 'Tulajdonos',        companyId: 12, signal: 5, since: '2022-05-19' },
    { id: 111, first: 'Katalin', last: 'Balogh',     email: 'k.balogh@vsz.hu',        phone: '+36 30 232 3445', city: 'Pécs',      role: 'Minőségbiztosítás', companyId: 7, signal: 3, since: '2023-10-02' },
    { id: 112, first: 'Tamás',   last: 'Lakatos',    email: 't.lakatos@anyv.hu',      phone: '+36 30 343 4556', city: 'Szeged',    role: 'Titkár',            companyId: 5, signal: 2, since: '2024-07-21' },
    { id: 113, first: 'Júlia',   last: 'Papp',       email: 'papp.j@hegt.hu',         phone: '+36 30 454 5667', city: 'Győr',      role: 'NDT mérnök',        companyId: 2, signal: 4, since: '2024-02-14' },
    { id: 114, first: 'Márton',  last: 'Juhász',     email: 'm.juhasz@tim.hu',        phone: '+36 30 565 6778', city: 'Paks',      role: 'Megfelelőség',      companyId: 8, signal: 5, since: '2022-11-08' },
  ];

  // Pipeline status codes 0..8 (matches design-system.md)
  const PIPE = [
    { code: 0, label: 'KUKA',                short: 'KUKA',    tone: 'slate'  },
    { code: 1, label: 'NEM HÍVTUK',          short: 'NEM',     tone: 'slate'  },
    { code: 2, label: 'NEM ÉRT. EL',         short: 'N/É',     tone: 'amber'  },
    { code: 3, label: 'ÉRDEKEL',             short: 'ÉRD',     tone: 'sky'    },
    { code: 4, label: 'NEM KELL',            short: 'NK',      tone: 'coral'  },
    { code: 5, label: 'KELL',                short: 'KELL',    tone: 'indigo' },
    { code: 6, label: 'PENDING',             short: 'PEND',    tone: 'amber'  },
    { code: 7, label: 'CL · Closed Lost',    short: 'CL',      tone: 'coral'  },
    { code: 8, label: 'CW · Closed Won',     short: 'CW',      tone: 'mint'   },
  ];

  const PIPE_COUNTS = [847, 1240, 312, 198, 94, 156, 41, 89, 73];

  const TASKS = [
    // Not started
    { id: 'T-4011', title: 'Hívd fel Kovács Bélát az UT-jegyzőkönyvről',  status: 'todo',  priority: 'high',   due: '2026-05-13', personId: 101, companyId: 1, assignee: 'PJ', category: 'sales',     est: 15 },
    { id: 'T-4012', title: 'Készítsd elő az árajánlatot — Csőgyár Kelet', status: 'todo',  priority: 'high',   due: '2026-05-14', personId: 105, companyId: 6, assignee: 'AK', category: 'sales',     est: 90 },
    { id: 'T-4013', title: 'Egyeztetés Paks turbinacsarnok hozzáférésről', status: 'todo',  priority: 'med',    due: '2026-05-16', personId: 106, companyId: 8, assignee: 'PJ', category: 'ops',       est: 30 },
    { id: 'T-4014', title: 'LinkedIn üzenet — Molnár András',              status: 'todo',  priority: 'low',    due: '2026-05-18', personId: 108, companyId: 10, assignee: 'PJ', category: 'outreach', est: 10 },
    { id: 'T-4015', title: 'Vasszerkezet auditra tervtanulmány',           status: 'todo',  priority: 'med',    due: '2026-05-20', personId: 111, companyId: 7, assignee: 'AK', category: 'compliance', est: 120 },

    // In progress
    { id: 'T-3987', title: 'UT vizsgálati jelentés — Acélvizsgáló',        status: 'doing', priority: 'high',   due: '2026-05-12', personId: 101, companyId: 1, assignee: 'PJ', category: 'reports',   est: 180 },
    { id: 'T-3992', title: 'Kalibráció jegyzőkönyv — Műszerkalibráló',     status: 'doing', priority: 'med',    due: '2026-05-15', personId: 104, companyId: 4, assignee: 'AK', category: 'reports',   est: 60 },
    { id: 'T-3995', title: 'RT film értékelés — Hegesztéstechnika',        status: 'doing', priority: 'high',   due: '2026-05-13', personId: 102, companyId: 2, assignee: 'KK', category: 'reports',   est: 240 },
    { id: 'T-3998', title: 'Szerződéstervezet — Hídépítő Konzorcium',      status: 'doing', priority: 'med',    due: '2026-05-19', personId: 107, companyId: 9, assignee: 'PJ', category: 'legal',     est: 90 },

    // Review
    { id: 'T-3970', title: 'Helyszíni jegyzőkönyv — Présházgép',           status: 'review', priority: 'low',   due: '2026-05-11', personId: 110, companyId: 12, assignee: 'AK', category: 'reports', est: 45 },
    { id: 'T-3974', title: 'Audit checklist véglegesítés — Turbinaipar',   status: 'review', priority: 'high',  due: '2026-05-12', personId: 114, companyId: 8, assignee: 'PJ', category: 'compliance', est: 75 },
    { id: 'T-3978', title: 'Aláírt teljesítésigazolás — Csőgyár',          status: 'review', priority: 'med',   due: '2026-05-14', personId: 105, companyId: 6, assignee: 'KK', category: 'legal',     est: 30 },

    // Done
    { id: 'T-3941', title: 'CW lezárás — Hegesztéstechnika Zrt.',          status: 'done', priority: 'high',   due: '2026-05-08', personId: 102, companyId: 2, assignee: 'PJ', category: 'sales',     est: 30 },
    { id: 'T-3945', title: 'Kiküldött ajánlat — Roncsolásmentes Kft.',     status: 'done', priority: 'med',    due: '2026-05-09', personId: 103, companyId: 3, assignee: 'AK', category: 'sales',     est: 45 },
    { id: 'T-3950', title: 'Számla 2026-0412 elküldve',                    status: 'done', priority: 'low',    due: '2026-05-10', personId: 106, companyId: 8, assignee: 'KK', category: 'billing',   est: 15 },
    { id: 'T-3953', title: 'Beszerzési kérdőív — Anyagvizsgáló',           status: 'done', priority: 'low',    due: '2026-05-07', personId: 112, companyId: 5, assignee: 'PJ', category: 'outreach',  est: 20 },
  ];

  const INTERACTIONS = [
    { id: 1, personId: 101, companyId: 1, type: 'call',       dir: 'outbound', at: '2026-05-12 09:14', user: 'PJ', note: 'Egyeztettük az UT vizsgálat ütemtervét. Béla kéri az ajánlatot pénteken.' },
    { id: 2, personId: 101, companyId: 1, type: 'email',      dir: 'outbound', at: '2026-05-11 16:32', user: 'PJ', note: 'Kiküldött ajánlat-tervezet (v2.1). Nyitva tartam: 14 nap.' },
    { id: 3, personId: 102, companyId: 2, type: 'meeting',    dir: 'inbound',  at: '2026-05-11 11:00', user: 'AK', note: 'Anna személyes egyeztetés, Győrben. Megerősítette a CW-státuszt.' },
    { id: 4, personId: 101, companyId: 1, type: 'site_visit', dir: 'outbound', at: '2026-05-08 08:00', user: 'PJ', note: 'Helyszíni szemle — 3 csőszakasz, UT és MT felmérve. Jegyzőkönyv 24h.' },
    { id: 5, personId: 101, companyId: 1, type: 'note',       dir: '',         at: '2026-05-06 14:22', user: 'PJ', note: 'Béla LinkedIn-en jelezte hogy érdekli a következő hídprojekt is.' },
    { id: 6, personId: 105, companyId: 6, type: 'call',       dir: 'inbound',  at: '2026-05-12 10:45', user: 'AK', note: 'Eszter sürgeti az árajánlatot — Csőgyár Q2 audit közeleg.' },
    { id: 7, personId: 106, companyId: 8, type: 'email',      dir: 'inbound',  at: '2026-05-12 08:02', user: 'KK', note: 'Péter visszaigazolta a turbinacsarnok hozzáférést kedd reggelre.' },
  ];

  const USERS = [
    { initials: 'PJ', name: 'Péter J.',   color: 'oklch(0.66 0.19 278)' },  // indigo
    { initials: 'AK', name: 'Áron K.',    color: 'oklch(0.80 0.15 75)' },   // amber
    { initials: 'KK', name: 'Krisztina K.', color: 'oklch(0.80 0.13 165)' }, // mint
    { initials: 'BS', name: 'Balázs S.',  color: 'oklch(0.72 0.16 305)' },  // violet
  ];

  function pipeStatus(code) { return PIPE[code] || PIPE[0]; }
  function getCompany(id) { return COMPANIES.find(c => c.id === id); }
  function getPerson(id)  { return PERSONS.find(p => p.id === id); }
  function getUser(initials) { return USERS.find(u => u.initials === initials); }

  // deterministic avatar color from id
  const AVATAR_HUES = [278, 75, 165, 305, 230, 25];
  function avatarColor(seed) {
    const idx = (typeof seed === 'number' ? seed : (seed||'').charCodeAt(0)) % AVATAR_HUES.length;
    const h = AVATAR_HUES[idx];
    return `linear-gradient(135deg, oklch(0.55 0.16 ${h}), oklch(0.32 0.10 ${(h+30)%360}))`;
  }

  function personInitials(p) { return (p.first[0] + p.last[0]).toUpperCase(); }
  function personName(p) { return `${p.last} ${p.first}`; }   // Hungarian order

  // Pipeline timeseries (last 30 days, total active deals)
  function pipelineSeries() {
    const out = [];
    let v = 800;
    for (let i = 0; i < 30; i++) {
      v += Math.round((Math.sin(i*0.4) * 18) + (Math.random()*16 - 6));
      out.push(Math.max(720, v));
    }
    return out;
  }

  // Wave for hero/oscilloscope decoration
  function wave(width, height, seed=1) {
    let d = `M 0 ${height/2}`;
    const step = 6;
    for (let x = 0; x <= width; x += step) {
      const y = height/2
        + Math.sin((x * 0.045) + seed) * (height*0.20)
        + Math.sin((x * 0.012) + seed*1.7) * (height*0.10);
      d += ` L ${x} ${y.toFixed(1)}`;
    }
    return d;
  }

  return {
    COMPANIES, PERSONS, PIPE, PIPE_COUNTS, TASKS, INTERACTIONS, USERS,
    pipeStatus, getCompany, getPerson, getUser,
    avatarColor, personInitials, personName,
    pipelineSeries, wave,
  };
})();
