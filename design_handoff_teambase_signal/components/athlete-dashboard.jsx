/* global React */
// TeamBase — Athlete Dashboard (Direction D · Signal), faithful to screens/AthleteDashboard.js
// Real flow: prompt-driven. Hero weekly miles (expandable pace zones) → conditional
// prompt cards → upcoming workouts → timeframe → team leaderboard → my runs.

const ADX = {
  white:'#FFFFFF', paper:'#FAFBFC', paper2:'#F4F5F7', line:'#E6E8EC',
  ink:'#0B0D12', inkSoft:'#2A2E38', mute:'#6B7280', mute2:'#9AA0AB',
  indigo:'#4F46E5', violet:'#7C3AED', pink:'#EC4899', coral:'#FB7185',
  amber:'#F59E0B', lime:'#84CC16', emerald:'#10B981', cyan:'#06B6D4',
};
const ADX_TYPE = { Easy:'#84CC16', Tempo:'#F59E0B', 'Long Run':'#06B6D4', Intervals:'#7C3AED', Race:'#EC4899', Recovery:'#9AA0AB' };
// Pace zones (VDOT): Easy / Marathon / Threshold / Interval / Rep
const ADX_PZ = [
  {k:'E', name:'Easy',      min:148, color:'#84CC16'},
  {k:'M', name:'Marathon',  min:22,  color:'#10B981'},
  {k:'T', name:'Threshold', min:14,  color:'#F59E0B'},
  {k:'I', name:'Interval',  min:6,   color:'#FB7185'},
  {k:'R', name:'Rep',       min:3,   color:'#7C3AED'},
];

function ADXStyles() {
  return <style>{`
    .adx { font-family:'Inter Tight', sans-serif; color:${ADX.ink}; letter-spacing:-0.01em; height:100%; overflow:auto; background:#fff; }
    .adx .display { font-family:'Instrument Serif', serif; letter-spacing:-0.02em; }
    .adx .mono { font-family:'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
    .adx .num { font-family:'Inter Tight', sans-serif; font-variant-numeric:tabular-nums; letter-spacing:-0.03em; font-weight:600; }
    .adx .eyebrow { font-size:11px; letter-spacing:0.13em; text-transform:uppercase; color:${ADX.mute}; font-weight:500; }
    .adx .card { background:${ADX.white}; border:1px solid ${ADX.line}; border-radius:16px; }
  `}</style>;
}

function AthleteDashboardFaithful() {
  const [zoneOpen, setZoneOpen] = React.useState(false);
  const [board, setBoard] = React.useState('all'); // all | mygroup
  const [tf, setTf] = React.useState('Week');

  const weeklyMiles = 24.6, target = 35;
  const pct = Math.min(weeklyMiles / target, 1);
  const totalMin = ADX_PZ.reduce((s, z) => s + z.min, 0);
  const easyMin = ADX_PZ[0].min + ADX_PZ[1].min;
  const easyPct = Math.round((easyMin / totalMin) * 100);

  const leaders = [
    {rank:1, first:'Mia', last:'Laurent', c:'#EC4899', mi:32.4, me:false},
    {rank:2, first:'Diego', last:'Alvarez', c:'#06B6D4', mi:30.1, me:false},
    {rank:3, first:'Ava', last:'Chen', c:'#7C3AED', mi:28.9, me:false},
    {rank:4, first:'Eli', last:'Wong', c:'#7C3AED', mi:27.8, me:false},
    {rank:5, first:'Train', last:'Bradshaw', c:'#10B981', mi:24.6, me:true},
  ];

  const runs = [
    {mi:6.0, date:'Today', dur:'48:12', effort:4},
    {mi:9.6, date:'Apr 21', dur:'1:18:40', effort:6},
    {mi:5.0, date:'Apr 20', dur:'42:30', effort:null},
    {mi:6.2, date:'Apr 18', dur:'50:05', effort:3},
  ];

  return (
    <div className="adx">
      <ADXStyles />

      {/* ── Header ── */}
      <div style={{padding:'52px 18px 14px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
          <div>
            <div className="display" style={{fontSize:32, lineHeight:1}}>Hey, <em style={{fontStyle:'italic', color:ADX.indigo}}>Train</em></div>
            <div className="eyebrow" style={{marginTop:6}}>Davis HS · Cross Country</div>
          </div>
          <div style={{position:'relative'}}>
            <div style={{width:40, height:40, borderRadius:999, background:'linear-gradient(135deg, #10B981, #06B6D4)', display:'grid', placeItems:'center', color:'#fff', fontWeight:700, fontSize:13}}>TB</div>
            <div style={{position:'absolute', top:-3, right:-3, minWidth:16, height:16, padding:'0 4px', borderRadius:999, background:ADX.coral, color:'#fff', fontSize:10, fontWeight:700, display:'grid', placeItems:'center', border:'2px solid #fff'}}>1</div>
          </div>
        </div>
      </div>

      <div style={{paddingBottom:110}}>

        {/* ── Weekly miles hero ── */}
        <div style={{padding:'0 14px'}}>
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'16px 18px 14px'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                <span className="eyebrow">This week</span>
                <span style={{fontSize:12, fontWeight:600, color:ADX.amber}}>{(target-weeklyMiles).toFixed(1)} mi to go</span>
              </div>
              <div style={{display:'flex', alignItems:'baseline', gap:8, marginTop:6}}>
                <span className="num" style={{fontSize:46, lineHeight:0.9}}>{weeklyMiles}</span>
                <span style={{fontSize:14, color:ADX.mute}}>/ {target} mi</span>
              </div>
              <div style={{height:8, background:ADX.line, borderRadius:999, marginTop:14, overflow:'hidden'}}>
                <div style={{height:'100%', width:`${pct*100}%`, background:`linear-gradient(90deg, ${ADX.indigo}, ${ADX.cyan})`}}/>
              </div>
            </div>
            {/* Pace zone expand */}
            <button onClick={() => setZoneOpen(o => !o)} style={{width:'100%', display:'flex', alignItems:'center', gap:10, padding:'11px 18px', background:ADX.paper, border:'none', borderTop:`1px solid ${ADX.line}`, cursor:'pointer', fontFamily:'inherit'}}>
              <div style={{flex:1, display:'flex', height:8, borderRadius:999, overflow:'hidden', gap:1.5}}>
                {ADX_PZ.map(z => <div key={z.k} style={{flex:z.min, background:z.color}}/>)}
              </div>
              <span style={{fontSize:11.5, color:ADX.inkSoft, fontWeight:600}}>Pace zones</span>
              <span style={{fontSize:9, fontWeight:700, color:ADX.emerald, background:`${ADX.emerald}18`, padding:'2px 6px', borderRadius:5, letterSpacing:'0.06em'}}>GPS</span>
              <span style={{color:ADX.mute2, fontSize:12, transform:zoneOpen?'rotate(180deg)':'none'}}>▾</span>
            </button>
            {zoneOpen && (
              <div style={{padding:'12px 18px 16px', borderTop:`1px solid ${ADX.line}`}}>
                {ADX_PZ.map(z => (
                  <div key={z.k} style={{display:'flex', alignItems:'center', gap:10, padding:'4px 0'}}>
                    <span style={{width:9, height:9, borderRadius:999, background:z.color}}/>
                    <span style={{flex:1, fontSize:12, color:ADX.inkSoft}}>{z.k} · {z.name}</span>
                    <div style={{width:70, height:5, background:ADX.line, borderRadius:999, overflow:'hidden'}}>
                      <div style={{height:'100%', width:`${(z.min/totalMin)*100}%`, background:z.color}}/>
                    </div>
                    <span className="mono" style={{fontSize:11, color:ADX.mute, minWidth:42, textAlign:'right'}}>{z.min}m</span>
                  </div>
                ))}
                <div style={{marginTop:10, padding:'9px 12px', borderRadius:10, background:`${ADX.emerald}10`, fontSize:11.5, color:ADX.emerald, fontWeight:600}}>
                  Easy {easyPct}% · Hard {100-easyPct}% — great balance!
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Daily check-in prompt ── */}
        <div style={{padding:'14px 14px 0'}}>
          <div style={{padding:16, borderRadius:16, background:`linear-gradient(135deg, ${ADX.indigo}, ${ADX.violet})`, color:'#fff', position:'relative', overflow:'hidden'}}>
            <div style={{position:'absolute', top:-20, right:-20, width:90, height:90, borderRadius:999, background:'rgba(255,255,255,0.08)'}}/>
            <div style={{position:'relative'}}>
              <div style={{fontSize:10.5, letterSpacing:'0.13em', textTransform:'uppercase', opacity:0.78}}>Daily check-in</div>
              <div className="display" style={{fontSize:23, lineHeight:1.1, marginTop:4, fontStyle:'italic'}}>How are you feeling today?</div>
              <div style={{fontSize:12, opacity:0.85, marginTop:6}}>Quick check-in helps your coach keep you healthy.</div>
              <button style={{marginTop:13, width:'100%', background:'#fff', color:ADX.indigo, border:'none', padding:12, borderRadius:11, fontWeight:600, fontSize:14, cursor:'pointer', fontFamily:'inherit'}}>Check in →</button>
            </div>
          </div>
        </div>

        {/* ── Strava connect prompt (conditional) ── */}
        <div style={{padding:'10px 14px 0'}}>
          <div className="card" style={{padding:14, display:'flex', gap:12, alignItems:'center'}}>
            <div style={{width:34, height:34, borderRadius:9, background:'#FC4C0218', display:'grid', placeItems:'center', color:'#FC4C02', fontWeight:800, fontSize:16}}>S</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13.5, fontWeight:600}}>Connect Strava</div>
              <div style={{fontSize:11, color:ADX.mute, marginTop:1}}>Auto-sync runs so you never log manually.</div>
            </div>
            <button style={{padding:'8px 14px', borderRadius:10, background:ADX.ink, color:'#fff', border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Connect</button>
          </div>
        </div>

        {/* ── Upcoming workouts ── */}
        <div style={{padding:'22px 18px 8px'}}>
          <h2 className="display" style={{fontSize:22, margin:0, fontStyle:'italic'}}>Upcoming workouts</h2>
        </div>
        <div style={{padding:'0 14px', display:'flex', flexDirection:'column', gap:8}}>
          <ADXWorkout type="Tempo" title="Thursday Tempo" miles="6" pace="7:02–7:28/mi" date="Thu · Apr 24" desc="2mi wu · 3mi @ T · 1mi cd" />
          <ADXWorkout type="Long Run" title="Saturday Long" miles="10" pace="8:50–9:40/mi" date="Sat · Apr 26" desc="Trails OK. Bring water." />
        </div>

        {/* ── Timeframe ── */}
        <div style={{padding:'22px 14px 0', display:'flex', gap:6}}>
          {['Week','Month','Season'].map(t => (
            <button key={t} onClick={() => setTf(t)} style={{padding:'6px 14px', borderRadius:999, border:tf===t?'none':`1px solid ${ADX.line}`, background:tf===t?ADX.ink:ADX.paper, color:tf===t?'#fff':ADX.inkSoft, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>{t}</button>
          ))}
        </div>

        {/* ── Team leaderboard ── */}
        <div style={{padding:'14px 18px 8px', display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
          <h2 className="display" style={{fontSize:22, margin:0, fontStyle:'italic'}}>Team leaderboard</h2>
        </div>
        <div style={{padding:'0 14px 0', display:'flex', gap:6, marginBottom:10}}>
          {[['all','All'],['mygroup','Varsity Boys']].map(([k,l]) => (
            <button key={k} onClick={() => setBoard(k)} style={{padding:'5px 12px', borderRadius:999, border:board===k?'none':`1px solid ${ADX.line}`, background:board===k?ADX.indigo:ADX.white, color:board===k?'#fff':ADX.inkSoft, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>{l}</button>
          ))}
        </div>
        <div style={{padding:'0 14px', display:'flex', flexDirection:'column', gap:6}}>
          {leaders.map(a => <ADXLeader key={a.rank} a={a} />)}
        </div>

        {/* ── My runs ── */}
        <div style={{padding:'22px 18px 8px'}}>
          <h2 className="display" style={{fontSize:22, margin:0, fontStyle:'italic'}}>My runs</h2>
        </div>
        <div style={{padding:'0 14px', display:'flex', flexDirection:'column', gap:8}}>
          {runs.map((r, i) => <ADXRun key={i} r={r} />)}
        </div>
      </div>

      <ADXTabBar active="home" />
    </div>
  );
}

function ADXWorkout({type, title, miles, pace, date, desc}) {
  const c = ADX_TYPE[type] || ADX.indigo;
  return (
    <div className="card" style={{padding:14, display:'flex', gap:12, alignItems:'center', borderLeft:`3px solid ${c}`}}>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <span style={{display:'inline-flex', gap:5, alignItems:'center', padding:'3px 9px', borderRadius:999, background:`${c}1A`, color:c, fontSize:11, fontWeight:600}}>
            <span style={{width:5, height:5, borderRadius:999, background:c}}/>{type}
          </span>
        </div>
        <div style={{fontSize:14, fontWeight:600, marginTop:5}}>{title} <span style={{color:ADX.mute, fontWeight:500}}>— {miles} mi</span></div>
        <div className="mono" style={{fontSize:11, color:ADX.indigo, marginTop:2}}>Target {pace}</div>
        <div style={{fontSize:11, color:ADX.mute, marginTop:2}}>{date} · {desc}</div>
      </div>
      <span style={{color:ADX.mute2, fontSize:18}}>›</span>
    </div>
  );
}

function ADXLeader({a}) {
  return (
    <div style={{display:'flex', gap:11, alignItems:'center', padding:'10px 12px', borderRadius:12, background: a.me ? `${ADX.indigo}0D` : ADX.white, border:`1px solid ${a.me ? ADX.indigo+'55' : ADX.line}`}}>
      <span className="num" style={{fontSize:13, width:22, color: a.me ? ADX.indigo : ADX.mute2}}>#{a.rank}</span>
      <div style={{width:32, height:32, borderRadius:999, background:a.c, color:'#fff', display:'grid', placeItems:'center', fontSize:11, fontWeight:700}}>{a.first[0]}{a.last[0]}</div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13.5, fontWeight: a.me ? 700 : 600, color: a.me ? ADX.indigo : ADX.ink}}>{a.me ? 'You' : `${a.first} ${a.last}`}</div>
        {!a.me && <div style={{fontSize:10.5, color:ADX.mute, marginTop:1}}>Tap to view profile</div>}
      </div>
      <span className="num" style={{fontSize:15, color: a.me ? ADX.indigo : ADX.ink}}>{a.mi.toFixed(1)} <span style={{fontSize:10, color:ADX.mute, fontWeight:500}}>mi</span></span>
    </div>
  );
}

function ADXRun({r}) {
  const effortColor = r.effort == null ? ADX.mute2 : r.effort <= 3 ? ADX.emerald : r.effort <= 6 ? ADX.amber : ADX.coral;
  return (
    <div className="card" style={{padding:'13px 14px', display:'flex', gap:12, alignItems:'center'}}>
      <div style={{minWidth:54}}>
        <div className="num" style={{fontSize:18}}>{r.mi}<span style={{fontSize:10, color:ADX.mute, marginLeft:2}}>mi</span></div>
        <div style={{fontSize:10.5, color:ADX.mute, marginTop:1}}>{r.date}</div>
      </div>
      <div style={{flex:1}}>
        <div className="mono" style={{fontSize:12, color:ADX.inkSoft}}>{r.dur}</div>
      </div>
      {r.effort != null ? (
        <div style={{textAlign:'right'}}>
          <div className="eyebrow" style={{fontSize:9}}>Effort</div>
          <div className="num" style={{fontSize:15, color:effortColor}}>{r.effort}/10</div>
        </div>
      ) : (
        <button style={{padding:'7px 12px', borderRadius:9, border:`1px solid ${ADX.line}`, background:ADX.paper, color:ADX.indigo, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Rate effort</button>
      )}
    </div>
  );
}

function ADXTabBar({active}) {
  const tabs = [['home','Home'],['log','Log'],['calendar','Calendar'],['stats','Stats'],['feed','Feed']];
  return (
    <div style={{position:'absolute', bottom:0, left:0, right:0, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderTop:`1px solid ${ADX.line}`, padding:'10px 8px 22px', display:'flex', justifyContent:'space-around'}}>
      {tabs.map(([id,l]) => (
        <div key={id} style={{textAlign:'center'}}>
          <div style={{fontSize:11, fontWeight:600, color: active===id ? ADX.indigo : ADX.mute2}}>{l}</div>
          {active===id && <div style={{margin:'4px auto 0', width:4, height:4, borderRadius:999, background:ADX.indigo}}/>}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { AthleteDashboardFaithful });
