/* global React */
// TeamBase — Coach Dashboard (Direction D · Signal), faithful to screens/CoachDashboard.js
// Structure mirrors the real app: Today's Plan → expandable triage cards
// (Mileage Volume / Easy-Hard / Injury·Illness / ACWR Injury Risk) → Team roster → Upcoming.

const CDX = {
  white:'#FFFFFF', paper:'#FAFBFC', paper2:'#F4F5F7', line:'#E6E8EC',
  ink:'#0B0D12', inkSoft:'#2A2E38', mute:'#6B7280', mute2:'#9AA0AB',
  indigo:'#4F46E5', violet:'#7C3AED', pink:'#EC4899', coral:'#FB7185',
  amber:'#F59E0B', lime:'#84CC16', emerald:'#10B981', cyan:'#06B6D4',
};

// Workout type → Direction D color
const CDX_TYPE = {
  Easy:'#84CC16', Tempo:'#F59E0B', 'Long Run':'#06B6D4', Intervals:'#7C3AED',
  Speed:'#EC4899', Recovery:'#9AA0AB', Race:'#EC4899', Strength:'#4F46E5',
};

// One roster, multiple analyses — like the real app.
// w = [3wk ago, 2wk ago, last wk] miles; tgt = weekly target.
const CDX_ROSTER = [
  {first:'Mia',   last:'Laurent', yr:'Sr', g:'girls', c:'#EC4899', mi:32.4, w:[31,33,32], tgt:35, easy:96, acwr:1.08, inj:null,                        ill:null,  lastRun:'Easy 6.2 mi · today'},
  {first:'Diego', last:'Alvarez', yr:'Jr', g:'boys',  c:'#06B6D4', mi:30.1, w:[28,29,30], tgt:30, easy:95, acwr:1.12, inj:null,                        ill:null,  lastRun:'Tempo 6 mi · today'},
  {first:'Train', last:'Bradshaw',yr:'Sr', g:'boys',  c:'#10B981', mi:24.6, w:[30,28,21], tgt:35, easy:94, acwr:0.74, inj:null,                        ill:null,  lastRun:'Easy 6 mi · today'},
  {first:'Ava',   last:'Chen',    yr:'Sr', g:'girls', c:'#7C3AED', mi:28.9, w:[27,30,29], tgt:32, easy:82, acwr:1.18, inj:null,                        ill:null,  lastRun:'Long 10 mi · yest'},
  {first:'Sam',   last:'Okafor',  yr:'So', g:'boys',  c:'#F59E0B', mi:15.2, w:[18,17,12], tgt:22, easy:64, acwr:1.04, inj:null,                        ill:{sym:['congestion','fatigue'], sev:'mild'}, lastRun:'Tempo 5 mi · 2d'},
  {first:'Lily',  last:'Novak',   yr:'So', g:'girls', c:'#4F46E5', mi:21.5, w:[20,22,21], tgt:26, easy:92, acwr:0.98, inj:null,                        ill:null,  lastRun:'Easy 5 mi · today'},
  {first:'Noah',  last:'Reyes',   yr:'Fr', g:'boys',  c:'#FB7185', mi:8.3,  w:[5,6,11],   tgt:18, easy:78, acwr:1.62, inj:null,                        ill:null,  lastRun:'Intervals · today'},
  {first:'Jordan',last:'Park',    yr:'Jr', g:'boys',  c:'#84CC16', mi:18.1, w:[22,20,18], tgt:28, easy:88, acwr:1.34, inj:{loc:['knee'], sev:'moderate', note:'tight on hills'}, ill:null, lastRun:'— missed · 3d'},
  {first:'Sophie',last:'Park',    yr:'Jr', g:'girls', c:'#0EA5E9', mi:26.0, w:[25,26,26], tgt:28, easy:90, acwr:1.05, inj:null,                        ill:null,  lastRun:'Easy 7 mi · today'},
  {first:'Ben',   last:'Stern',   yr:'So', g:'boys',  c:'#F59E0B', mi:19.4, w:[19,20,19], tgt:24, easy:58, acwr:1.21, inj:null,                        ill:null,  lastRun:'Tempo 6 mi · yest'},
  {first:'Grace', last:'Riley',   yr:'Fr', g:'girls', c:'#EC4899', mi:12.0, w:[13,12,12], tgt:16, easy:91, acwr:0.92, inj:null,                        ill:null,  lastRun:'Easy 4 mi · today'},
  {first:'Eli',   last:'Wong',    yr:'Sr', g:'boys',  c:'#7C3AED', mi:27.8, w:[26,28,28], tgt:30, easy:93, acwr:1.09, inj:{loc:['ankle'], sev:'mild', note:''}, ill:null, lastRun:'Long 12 mi · yest'},
];

function CDXStyles() {
  return <style>{`
    .cdx { font-family:'Inter Tight', sans-serif; color:${CDX.ink}; letter-spacing:-0.01em; height:100%; overflow:auto; background:#fff; }
    .cdx .display { font-family:'Instrument Serif', serif; letter-spacing:-0.02em; }
    .cdx .mono { font-family:'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
    .cdx .num { font-family:'Inter Tight', sans-serif; font-variant-numeric:tabular-nums; letter-spacing:-0.03em; font-weight:600; }
    .cdx .eyebrow { font-size:11px; letter-spacing:0.13em; text-transform:uppercase; color:${CDX.mute}; font-weight:500; }
    .cdx .card { background:${CDX.white}; border:1px solid ${CDX.line}; border-radius:16px; }
  `}</style>;
}

function CoachDashboardFaithful() {
  const [exp, setExp] = React.useState({ volume: true, intensity: false, injury: false, acwr: false });
  const [gender, setGender] = React.useState('all');
  const [group, setGroup] = React.useState('all');
  const [tf, setTf] = React.useState('Week');
  const toggle = (k) => setExp(s => ({ ...s, [k]: !s[k] }));

  // ── Derive analyses from the single roster (like the real app) ──
  const wkStatus = (lastWk, tgt) => {
    const r = lastWk / tgt;
    if (r >= 0.9 && r <= 1.12) return 'on';
    return r < 0.9 ? 'under' : 'over';
  };
  const volume = CDX_ROSTER.map(a => ({ ...a, status: wkStatus(a.w[2], a.tgt) }));
  const under = volume.filter(a => a.status === 'under');
  const over = volume.filter(a => a.status === 'over');
  const onTrack = volume.filter(a => a.status === 'on');

  const tooHard = CDX_ROSTER.filter(a => a.easy < 68);
  const caution = CDX_ROSTER.filter(a => a.easy >= 68 && a.easy < 78);
  const easyOk = CDX_ROSTER.filter(a => a.easy >= 78);

  const injured = CDX_ROSTER.filter(a => a.inj || a.ill);

  const acwrBucket = (r) => r > 1.5 ? 'spike' : r >= 1.3 ? 'elevated' : r < 0.8 ? 'ramp' : 'sweet';
  const acwr = { spike: [], elevated: [], ramp: [], sweet: [] };
  CDX_ROSTER.forEach(a => acwr[acwrBucket(a.acwr)].push(a));

  // Team roster (filtered + sorted by miles)
  let roster = [...CDX_ROSTER];
  if (gender !== 'all') roster = roster.filter(a => a.g === gender);
  roster.sort((x, y) => y.mi - x.mi);

  const teamMiles = CDX_ROSTER.reduce((s, a) => s + a.mi, 0);
  const checkedIn = 9;

  return (
    <div className="cdx">
      <CDXStyles />

      {/* ── Header ── */}
      <div style={{padding:'52px 18px 12px', borderBottom:`1px solid ${CDX.line}`}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
          <div>
            <div className="display" style={{fontSize:30, lineHeight:1}}>Coach <em style={{fontStyle:'italic', color:CDX.indigo}}>Reyes</em></div>
            <div className="eyebrow" style={{marginTop:6}}>Davis HS · Cross Country</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div className="num" style={{fontSize:15}}>{CDX_ROSTER.length}</div>
            <div style={{fontSize:10, color:CDX.mute}}>athletes</div>
            <div className="mono" style={{fontSize:10, color:CDX.mute, marginTop:4}}>Code <span style={{color:CDX.ink, fontWeight:700}}>R7QX</span></div>
          </div>
        </div>
      </div>

      <div style={{paddingBottom:110}}>

        {/* ── Today's plan ── */}
        <div style={{padding:'16px 14px 0'}}>
          <div className="eyebrow" style={{marginBottom:8, paddingLeft:4}}>Today · Wed Apr 22</div>
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <PlanRow type="Tempo"     title="Varsity — 4×1mi @ 5K pace" miles="7" desc="2mi wu · 4×1mi · 1mi cd" />
            <PlanRow type="Easy"      title="JV — Conversational run" miles="5" desc="Keep it relaxed, Z1–Z2" border />
            <button style={{width:'100%', padding:'13px', background:CDX.paper, border:'none', borderTop:`1px solid ${CDX.line}`, color:CDX.indigo, fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'inherit'}}>
              💬 Send daily message to team
            </button>
          </div>
        </div>

        {/* ── Triage cards ── */}
        <div style={{padding:'14px 14px 0', display:'flex', flexDirection:'column', gap:10}}>

          {/* Mileage Volume */}
          <ExpandCard
            open={exp.volume} onToggle={() => toggle('volume')}
            icon="📈" iconColor={CDX.indigo}
            title="Mileage Volume"
            summary={<><b style={{color:CDX.emerald}}>{onTrack.length} on track</b>{under.length>0 && <>, <b style={{color:CDX.amber}}>{under.length} under</b></>}{over.length>0 && <>, <b style={{color:CDX.coral}}>{over.length} over</b></>}</>}
          >
            <div style={{paddingTop:4}}>
              {under.length > 0 && <GroupLabel color={CDX.amber}>Under target</GroupLabel>}
              {under.map(a => <VolumeRow key={a.last+a.first} a={a} />)}
              {over.length > 0 && <GroupLabel color={CDX.coral} style={{marginTop:10}}>Over target</GroupLabel>}
              {over.map(a => <VolumeRow key={a.last+a.first} a={a} />)}
              {under.length === 0 && over.length === 0 && <Empty>All athletes on target the last 3 weeks.</Empty>}
            </div>
          </ExpandCard>

          {/* Easy-Hard Balance */}
          <ExpandCard
            open={exp.intensity} onToggle={() => toggle('intensity')}
            icon="⚖️" iconColor={CDX.indigo}
            title="Easy-Hard Balance"
            summary={<><b style={{color:CDX.emerald}}>{easyOk.length} running easy</b>{tooHard.length>0 && <>, <b style={{color:CDX.coral}}>{tooHard.length} too hard</b></>}</>}
          >
            <div style={{paddingTop:4}}>
              {tooHard.length > 0 && <GroupLabel color={CDX.coral}>Too hard (easy &lt; 68%)</GroupLabel>}
              {tooHard.map(a => <EasyRow key={a.first} a={a} tone={CDX.coral} />)}
              {caution.length > 0 && <GroupLabel color={CDX.amber} style={{marginTop:10}}>Caution (68–77%)</GroupLabel>}
              {caution.map(a => <EasyRow key={a.first} a={a} tone={CDX.amber} />)}
              {easyOk.length > 0 && <GroupLabel color={CDX.emerald} style={{marginTop:10}}>On target (≥ 78%)</GroupLabel>}
              {easyOk.slice(0,4).map(a => <EasyRow key={a.first} a={a} tone={CDX.emerald} />)}
            </div>
          </ExpandCard>

          {/* Injury / Illness alert (tinted) */}
          <ExpandCard
            open={exp.injury} onToggle={() => toggle('injury')}
            icon="⚠️" iconColor={CDX.coral} alert
            title={`${injured.length} reporting injury or illness`}
          >
            <div style={{paddingTop:4}}>
              {injured.map(a => <InjuryRow key={a.first} a={a} />)}
            </div>
          </ExpandCard>

          {/* Injury Risk (ACWR) */}
          <ExpandCard
            open={exp.acwr} onToggle={() => toggle('acwr')}
            icon="🛡️" iconColor={CDX.indigo}
            title="Injury Risk · ACWR"
            summary={<>{acwr.sweet.length} sweet{acwr.elevated.length>0 && <> · <b style={{color:CDX.amber}}>{acwr.elevated.length} elevated</b></>}{acwr.spike.length>0 && <> · <b style={{color:CDX.coral}}>{acwr.spike.length} spike</b></>}{acwr.ramp.length>0 && <> · {acwr.ramp.length} ramping</>}</>}
          >
            <div style={{paddingTop:4}}>
              {acwr.spike.length > 0 && <GroupLabel color={CDX.coral}>Spike (&gt;1.5) — high risk</GroupLabel>}
              {acwr.spike.map(a => <AcwrRow key={a.first} a={a} tone={CDX.coral} />)}
              {acwr.elevated.length > 0 && <GroupLabel color={CDX.amber} style={{marginTop:10}}>Elevated (1.3–1.5)</GroupLabel>}
              {acwr.elevated.map(a => <AcwrRow key={a.first} a={a} tone={CDX.amber} />)}
              {acwr.ramp.length > 0 && <GroupLabel color={CDX.cyan} style={{marginTop:10}}>Ramping up (&lt;0.8)</GroupLabel>}
              {acwr.ramp.map(a => <AcwrRow key={a.first} a={a} tone={CDX.cyan} />)}
              <div style={{marginTop:10, fontSize:10.5, color:CDX.mute, lineHeight:1.5}}>ACWR compares last-7-day load to the 4-week average. Above 1.5 signals a spike vs. the athlete's adapted baseline.</div>
            </div>
          </ExpandCard>
        </div>

        {/* ── Team roster ── */}
        <div style={{padding:'22px 18px 6px', display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
          <h2 className="display" style={{fontSize:22, margin:0, fontStyle:'italic'}}>Team</h2>
          <span className="eyebrow" style={{color:CDX.indigo}}>Share ↗</span>
        </div>

        {/* Timeframe */}
        <div style={{padding:'4px 14px 0', display:'flex', gap:6}}>
          {['Week','Month','Season'].map(t => (
            <button key={t} onClick={() => setTf(t)} style={{padding:'6px 14px', borderRadius:999, border:tf===t?'none':`1px solid ${CDX.line}`, background:tf===t?CDX.ink:CDX.paper, color:tf===t?'#fff':CDX.inkSoft, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>{t}</button>
          ))}
        </div>
        {/* Gender filter */}
        <div style={{padding:'8px 14px 0', display:'flex', gap:6}}>
          {[['all','All'],['boys','Boys'],['girls','Girls']].map(([k,l]) => (
            <button key={k} onClick={() => setGender(k)} style={{padding:'5px 12px', borderRadius:999, border:gender===k?'none':`1px solid ${CDX.line}`, background:gender===k?CDX.indigo:CDX.white, color:gender===k?'#fff':CDX.inkSoft, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>{l}</button>
          ))}
        </div>
        {/* Group chips */}
        <div style={{padding:'8px 14px 0', display:'flex', gap:6, overflow:'auto'}}>
          {['All','By Group','Varsity','JV','Unassigned'].map(gp => (
            <button key={gp} onClick={() => setGroup(gp)} style={{padding:'5px 12px', borderRadius:999, border:group===gp?'none':`1px solid ${CDX.line}`, background:group===gp?CDX.indigo:CDX.white, color:group===gp?'#fff':CDX.mute, fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit'}}>{gp}</button>
          ))}
        </div>

        {/* Athlete rows */}
        <div style={{padding:'12px 14px 0', display:'flex', flexDirection:'column', gap:8}}>
          {roster.map((a, i) => <AthleteRowX key={a.first+a.last} a={a} rank={i+1} />)}
        </div>

        {/* ── Upcoming training ── */}
        <div style={{padding:'22px 18px 6px'}}>
          <h2 className="display" style={{fontSize:22, margin:0, fontStyle:'italic'}}>Upcoming training</h2>
        </div>
        <div style={{padding:'0 14px', display:'flex', flexDirection:'column', gap:8}}>
          <UpcomingX type="Long Run" title="Saturday Long Run" miles="10" date="Sat · Apr 25" />
          <UpcomingX type="Intervals" title="Mile Repeats" miles="8" date="Tue · Apr 28" />
          <UpcomingX type="Race" title="League Championships" miles="" date="Sat · May 17" />
        </div>
      </div>

      <CDXTabBar active="team" />
    </div>
  );
}

/* ── Sub-components ── */

function PlanRow({type, title, miles, desc, border}) {
  const c = CDX_TYPE[type] || CDX.indigo;
  return (
    <div style={{display:'flex', gap:11, padding:'13px 16px', alignItems:'center', borderTop: border ? `1px solid ${CDX.line}` : 'none', borderLeft:`3px solid ${c}`}}>
      <span style={{display:'inline-flex', gap:5, alignItems:'center', padding:'3px 9px', borderRadius:999, background:`${c}1A`, color:c, fontSize:11, fontWeight:600, flexShrink:0}}>
        <span style={{width:5, height:5, borderRadius:999, background:c}}/>{type}
      </span>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13.5, fontWeight:600}}>{title}{miles && <span style={{color:CDX.mute, fontWeight:500}}> — {miles} mi</span>}</div>
        <div style={{fontSize:11, color:CDX.mute, marginTop:1}}>{desc}</div>
      </div>
      <span style={{color:CDX.mute2, fontSize:18}}>›</span>
    </div>
  );
}

function ExpandCard({open, onToggle, icon, iconColor, title, summary, alert, children}) {
  return (
    <div className="card" style={{padding:0, overflow:'hidden', borderColor: alert ? `${CDX.coral}55` : CDX.line, background: alert ? `${CDX.coral}08` : CDX.white}}>
      <button onClick={onToggle} style={{width:'100%', display:'flex', gap:11, alignItems:'center', padding:'14px 16px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit'}}>
        <span style={{width:30, height:30, borderRadius:9, background: alert?`${CDX.coral}18`:`${iconColor}12`, display:'grid', placeItems:'center', fontSize:15, flexShrink:0}}>{icon}</span>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:14, fontWeight:600, color: alert?CDX.coral:CDX.ink}}>{title}</div>
          {summary && <div style={{fontSize:11.5, color:CDX.mute, marginTop:2}}>{summary}</div>}
        </div>
        <span style={{color:CDX.mute2, fontSize:13, transform: open?'rotate(180deg)':'none', transition:'transform .15s'}}>▾</span>
      </button>
      {open && <div style={{padding:'0 16px 14px'}}>{children}</div>}
    </div>
  );
}

function GroupLabel({color, children, style}) {
  return <div style={{fontSize:10.5, fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase', color, marginBottom:6, ...style}}>{children}</div>;
}

function Empty({children}) {
  return <div style={{fontSize:12.5, color:CDX.mute, textAlign:'center', padding:'10px 0'}}>{children}</div>;
}

function Avatar({a, size=30, op=1}) {
  return (
    <div style={{width:size, height:size, borderRadius:999, background:a.c, opacity:op, color:'#fff', display:'grid', placeItems:'center', fontSize:size*0.36, fontWeight:700, flexShrink:0}}>
      {a.first[0]}{a.last[0]}
    </div>
  );
}

function VolumeRow({a}) {
  const dots = [{l:'3w', m:a.w[0]}, {l:'2w', m:a.w[1]}, {l:'1w', m:a.w[2]}];
  const dStatus = (m) => { const r = m/a.tgt; return r>=0.9&&r<=1.12?'on':r<0.9?'under':'over'; };
  const icon = { on:'✓', under:'↓', over:'↑' };
  const col = { on:CDX.emerald, under:CDX.amber, over:CDX.coral };
  return (
    <div style={{display:'flex', gap:10, alignItems:'center', padding:'9px 0', borderBottom:`1px solid ${CDX.line}`}}>
      <Avatar a={a} size={30}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:600}}>{a.first} {a.last}</div>
        <div style={{fontSize:10.5, color:CDX.mute, marginTop:1}}>Target {a.tgt} mi/wk</div>
      </div>
      <div style={{display:'flex', gap:9}}>
        {dots.map(d => { const s = dStatus(d.m); return (
          <div key={d.l} style={{textAlign:'center', minWidth:26}}>
            <div className="num" style={{fontSize:12, color:col[s]}}>{icon[s]}{d.m}</div>
            <div style={{fontSize:8, color:CDX.mute2, marginTop:1}}>{d.l}</div>
          </div>
        );})}
      </div>
    </div>
  );
}

function EasyRow({a, tone}) {
  return (
    <div style={{display:'flex', gap:10, alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${CDX.line}`}}>
      <Avatar a={a} size={28}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:600}}>{a.first} {a.last}</div>
        <div style={{fontSize:10.5, color:CDX.mute, marginTop:1}}>Easy {a.easy}% · target 80%</div>
      </div>
      <span className="num" style={{fontSize:15, color:tone}}>{a.easy}%</span>
    </div>
  );
}

function InjuryRow({a}) {
  const sev = a.inj?.sev || a.ill?.sev || 'mild';
  const sevColor = sev === 'severe' ? CDX.coral : sev === 'moderate' ? CDX.amber : CDX.inkSoft;
  const rec = sev === 'severe' ? 'Recommend rest day' : sev === 'moderate' ? 'Consider modified workout' : 'Monitor during practice';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <div style={{display:'flex', gap:10, padding:'10px 0', borderBottom:`1px solid ${CDX.coral}22`}}>
      <Avatar a={a} size={32}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:600}}>{a.first} {a.last} <span style={{fontSize:10.5, color:CDX.mute, fontWeight:400}}>· today</span></div>
        {a.inj && <div style={{fontSize:11.5, color:CDX.inkSoft, marginTop:2}}>🩹 {a.inj.loc.map(cap).join(', ')} ({a.inj.sev}){a.inj.note && <span style={{color:CDX.mute}}> — “{a.inj.note}”</span>}</div>}
        {a.ill && <div style={{fontSize:11.5, color:CDX.inkSoft, marginTop:2}}>🤒 {a.ill.sym.map(s=>s.replace(/_/g,' ')).join(', ')} — <b style={{color:sevColor}}>{a.ill.sev}</b></div>}
        <div style={{fontSize:11, color:sevColor, marginTop:3, fontWeight:600}}>{rec}</div>
      </div>
      <span style={{color:CDX.mute2, fontSize:18}}>›</span>
    </div>
  );
}

function AcwrRow({a, tone}) {
  const chronic = (a.w[0]+a.w[1]+a.w[2])/3;
  return (
    <div style={{display:'flex', gap:10, alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${CDX.line}`}}>
      <Avatar a={a} size={28}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:600}}>{a.first} {a.last}</div>
      </div>
      <span style={{padding:'3px 9px', borderRadius:7, background:`${tone}1A`, color:tone, fontSize:12, fontWeight:700, fontFamily:"'JetBrains Mono', monospace"}}>{a.acwr.toFixed(2)}</span>
      <span className="mono" style={{fontSize:10, color:CDX.mute, minWidth:54, textAlign:'right'}}>{Math.round(a.w[2])}/{Math.round(chronic)} mi</span>
    </div>
  );
}

function AthleteRowX({a, rank}) {
  return (
    <div className="card" style={{padding:'12px 14px', display:'flex', gap:11, alignItems:'center'}}>
      <span className="num" style={{fontSize:13, color: rank<=3 ? CDX.indigo : CDX.mute2, width:18}}>{rank}</span>
      <Avatar a={a} size={36}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:14, fontWeight:600}}>{a.first} {a.last} <span style={{fontSize:10.5, color:CDX.mute, fontWeight:400}}>{a.yr}</span></div>
        <div style={{fontSize:11, color:CDX.mute, marginTop:1}}>{a.lastRun}</div>
      </div>
      <div style={{textAlign:'right'}}>
        <div className="num" style={{fontSize:16, color:CDX.indigo}}>{a.mi.toFixed(1)}</div>
        <div style={{fontSize:9, color:CDX.mute, letterSpacing:'0.08em', textTransform:'uppercase'}}>miles</div>
      </div>
      <span style={{color:CDX.mute2, fontSize:18}}>›</span>
    </div>
  );
}

function UpcomingX({type, title, miles, date}) {
  const c = CDX_TYPE[type] || CDX.indigo;
  return (
    <div className="card" style={{padding:'12px 14px', display:'flex', gap:11, alignItems:'center'}}>
      <span style={{display:'inline-flex', gap:5, alignItems:'center', padding:'3px 9px', borderRadius:999, background:`${c}1A`, color:c, fontSize:11, fontWeight:600, flexShrink:0}}>
        <span style={{width:5, height:5, borderRadius:999, background:c}}/>{type}
      </span>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13.5, fontWeight:600}}>{title}{miles && <span style={{color:CDX.mute, fontWeight:500}}> — {miles} mi</span>}</div>
        <div className="mono" style={{fontSize:10.5, color:CDX.mute, marginTop:1}}>{date}</div>
      </div>
      <span style={{color:CDX.mute2, fontSize:18}}>›</span>
    </div>
  );
}

function CDXTabBar({active}) {
  const tabs = [['team','Team'],['training','Training'],['calendar','Calendar'],['feed','Feed'],['me','Me']];
  return (
    <div style={{position:'absolute', bottom:0, left:0, right:0, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderTop:`1px solid ${CDX.line}`, padding:'10px 8px 22px', display:'flex', justifyContent:'space-around'}}>
      {tabs.map(([id,l]) => (
        <div key={id} style={{textAlign:'center'}}>
          <div style={{fontSize:11, fontWeight:600, color: active===id ? CDX.indigo : CDX.mute2}}>{l}</div>
          {active===id && <div style={{margin:'4px auto 0', width:4, height:4, borderRadius:999, background:CDX.indigo}}/>}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { CoachDashboardFaithful });
