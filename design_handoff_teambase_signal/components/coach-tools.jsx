/* global React */
// TeamBase — Wellness Check-in + Workout Library + Athlete Detail (Direction D · Signal)
// Faithful to WellnessCheckIn.js, WorkoutLibrary.js, AthleteDetailScreen.js.

const VX = {
  white:'#FFFFFF', paper:'#FAFBFC', paper2:'#F4F5F7', line:'#E6E8EC',
  ink:'#0B0D12', inkSoft:'#2A2E38', mute:'#6B7280', mute2:'#9AA0AB',
  indigo:'#4F46E5', violet:'#7C3AED', pink:'#EC4899', coral:'#FB7185',
  amber:'#F59E0B', lime:'#84CC16', emerald:'#10B981', cyan:'#06B6D4',
};
const VX_TYPE = { Easy:'#84CC16', 'Long Run':'#06B6D4', Tempo:'#F59E0B', Intervals:'#FB7185', Hills:'#7C3AED', 'Race Effort':'#EC4899' };

function VXStyles() {
  return <style>{`
    .vx { font-family:'Inter Tight', sans-serif; color:${VX.ink}; letter-spacing:-0.01em; height:100%; overflow:auto; background:${VX.paper2}; display:flex; flex-direction:column; }
    .vx .display { font-family:'Instrument Serif', serif; letter-spacing:-0.02em; }
    .vx .mono { font-family:'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
    .vx .num { font-family:'Inter Tight', sans-serif; font-variant-numeric:tabular-nums; letter-spacing:-0.03em; font-weight:600; }
    .vx .eyebrow { font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:${VX.mute}; font-weight:500; }
    .vx .card { background:${VX.white}; border:1px solid ${VX.line}; border-radius:14px; }
  `}</style>;
}

/* ─────────────────────────── Wellness Check-in ─────────────────────────── */
const SLEEP_OPTS = [[1,'Terrible','😴'],[2,'Poor','😪'],[3,'OK','😐'],[4,'Good','🙂'],[5,'Great','😁']];
const LEGS_OPTS  = [[1,'Dead','🪨'],[2,'Heavy','😓'],[3,'OK','😐'],[4,'Good','🙂'],[5,'Fresh','⚡']];
const MOOD_OPTS  = [[1,'Terrible','😤'],[2,'Low','😞'],[3,'Neutral','😐'],[4,'Good','🙂'],[5,'Pumped','🔥']];
const INJURY_LOC = ['Knee','Shin','Ankle','Foot','Hip','Hamstring','Calf','Quad','Back','Other'];

function WellnessCheckInFaithful() {
  const [sleep, setSleep] = React.useState(4);
  const [legs, setLegs] = React.useState(4);
  const [mood, setMood] = React.useState(5);
  const [issue, setIssue] = React.useState(null); // null | false | true
  const [locs, setLocs] = React.useState([]);
  const toggleLoc = (l) => setLocs(p => p.includes(l) ? p.filter(x=>x!==l) : [...p, l]);

  const done = sleep && legs && mood && issue !== null;

  return (
    <div className="vx">
      <VXStyles />
      {/* Header */}
      <div style={{padding:'52px 22px 18px', background:VX.white, borderBottom:`1px solid ${VX.line}`, display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0}}>
        <div>
          <div className="display" style={{fontSize:26, fontStyle:'italic'}}>Quick check-in</div>
          <div style={{fontSize:13.5, color:VX.mute, marginTop:4}}>How are you feeling before this run?</div>
        </div>
        <span style={{fontSize:22, color:VX.mute2}}>✕</span>
      </div>

      <div style={{flex:1, overflow:'auto', padding:'8px 18px 18px'}}>
        <VXOptLabel>Sleep last night</VXOptLabel>
        <VXOptRow opts={SLEEP_OPTS} sel={sleep} onSel={setSleep} />
        <VXOptLabel>How are your legs?</VXOptLabel>
        <VXOptRow opts={LEGS_OPTS} sel={legs} onSel={setLegs} />
        <VXOptLabel>Mood right now</VXOptLabel>
        <VXOptRow opts={MOOD_OPTS} sel={mood} onSel={setMood} />

        <div style={{height:1, background:VX.line, margin:'22px 0 4px'}}/>
        <VXOptLabel>Any pain or illness today?</VXOptLabel>
        <div style={{display:'flex', gap:12}}>
          <button onClick={() => {setIssue(false); setLocs([]);}} style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'15px', borderRadius:14, border: issue===false?'none':`1.5px solid ${VX.line}`, background: issue===false?VX.emerald:VX.white, color: issue===false?'#fff':VX.inkSoft, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}><span style={{fontSize:20}}>👍</span> I'm good</button>
          <button onClick={() => setIssue(true)} style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'15px', borderRadius:14, border: issue===true?'none':`1.5px solid ${VX.line}`, background: issue===true?VX.amber:VX.white, color: issue===true?'#fff':VX.inkSoft, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}><span style={{fontSize:20}}>🤕</span> Something's up</button>
        </div>

        {issue && (
          <div style={{marginTop:18, padding:16, borderRadius:14, background:VX.white, border:`1px solid ${VX.amber}55`}}>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
              <span style={{fontSize:16}}>🩹</span>
              <span style={{fontSize:14, fontWeight:700}}>Injury — where does it hurt?</span>
            </div>
            <div style={{display:'flex', flexWrap:'wrap', gap:7}}>
              {INJURY_LOC.map(l => {
                const on = locs.includes(l);
                return <button key={l} onClick={() => toggleLoc(l)} style={{padding:'7px 13px', borderRadius:999, border: on?'none':`1.5px solid ${VX.line}`, background: on?VX.amber:VX.paper, color: on?'#fff':VX.inkSoft, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>{l}</button>;
              })}
            </div>
            {locs.length > 0 && locs.map(l => (
              <div key={l} style={{marginTop:12, paddingTop:10, borderTop:`1px solid ${VX.line}`}}>
                <div style={{fontSize:12.5, fontWeight:600, marginBottom:6}}>{l}</div>
                <div style={{display:'flex', gap:7}}>
                  {[['mild','🟡 Mild'],['moderate','🟠 Moderate'],['severe','🔴 Severe']].map(([k,lab]) => (
                    <span key={k} style={{padding:'5px 11px', borderRadius:999, border:`1px solid ${VX.line}`, background:VX.paper, fontSize:11.5, color:VX.inkSoft}}>{lab}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{flexShrink:0, padding:'16px 18px 28px', background:VX.white, borderTop:`1px solid ${VX.line}`}}>
        <button style={{width:'100%', padding:15, borderRadius:13, background: done?VX.indigo:VX.line, color: done?'#fff':VX.mute2, border:'none', fontSize:16, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>Submit</button>
        <div style={{textAlign:'center', marginTop:10, fontSize:13.5, color:VX.mute}}>Skip check-in</div>
      </div>
    </div>
  );
}

function VXOptLabel({children}) {
  return <div style={{fontSize:14, fontWeight:700, margin:'18px 0 10px'}}>{children}</div>;
}
function VXOptRow({opts, sel, onSel}) {
  return (
    <div style={{display:'flex', gap:7}}>
      {opts.map(([v,l,e]) => {
        const on = sel === v;
        return (
          <button key={v} onClick={() => onSel(v)} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'11px 2px', borderRadius:12, border: on?'none':`1.5px solid ${VX.line}`, background: on?VX.indigo:VX.white, cursor:'pointer', fontFamily:'inherit'}}>
            <span style={{fontSize:19}}>{e}</span>
            <span style={{fontSize:10.5, fontWeight: on?700:500, color: on?'#fff':VX.mute}}>{l}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Workout Library ─────────────────────────── */
const VX_PHASES = ['Summer Base','Pre-Season Base','Build','Competition','Peak','Taper'];
const VX_WORKOUTS = {
  'Build': [
    {name:'Classic tempo run', type:'Tempo', dur:'50 min', desc:'15 min warmup, 20 min continuous tempo at lactate threshold (comfortably hard — 7/10), 15 min cooldown.'},
    {name:'Cruise intervals', type:'Intervals', dur:'55 min', desc:'15 min warmup, 5×5min at tempo pace w/ 60 sec jog recovery, 15 min cooldown.'},
    {name:'1-mile repeats', type:'Intervals', dur:'60 min', desc:'15 min warmup, 4×1 mile at 5K pace w/ 3 min jog recovery, 10 min cooldown.'},
    {name:'Fartlek run', type:'Tempo', dur:'45 min', desc:'30 min continuous w/ random surges of 1–3 min at tempo effort mixed with easy recovery.'},
  ],
  'Summer Base': [
    {name:'Easy long run', type:'Long Run', dur:'60–75 min', desc:'Conversational pace the entire run. Run by feel — no watch-checking.'},
    {name:'Team group run', type:'Easy', dur:'40–50 min', desc:'All athletes run together at the slowest pace. Culture run — conversation required.'},
    {name:'Strides workout', type:'Easy', dur:'35 min + strides', desc:'30 min easy, then 6×20-sec strides at 5K effort w/ 90 sec walk recovery.'},
  ],
};

function WorkoutLibraryFaithful() {
  const [tab, setTab] = React.useState('builtin');
  const [phase, setPhase] = React.useState('Build');
  const list = VX_WORKOUTS[phase] || [];

  return (
    <div className="vx">
      <VXStyles />
      {/* Header */}
      <div style={{padding:'52px 18px 12px', background:VX.white, display:'flex', alignItems:'center', gap:10, flexShrink:0}}>
        <span style={{fontSize:20, color:VX.inkSoft}}>‹</span>
        <div className="display" style={{flex:1, fontSize:22, fontStyle:'italic', textAlign:'center'}}>Workout library</div>
        <span style={{width:20}}/>
      </div>
      {/* Tabs */}
      <div style={{background:VX.white, display:'flex', padding:'0 8px', borderBottom:`1px solid ${VX.line}`, flexShrink:0}}>
        {[['builtin','Classic workouts'],['saved','Your library (4)']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{flex:1, padding:'11px 0', background:'transparent', border:'none', borderBottom: tab===k?`2px solid ${VX.indigo}`:'2px solid transparent', color: tab===k?VX.indigo:VX.mute, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>{l}</button>
        ))}
      </div>
      {/* Phase chips */}
      <div style={{background:VX.white, display:'flex', gap:7, overflowX:'auto', padding:'12px 14px', borderBottom:`1px solid ${VX.line}`, flexShrink:0}}>
        {VX_PHASES.map(p => (
          <button key={p} onClick={() => setPhase(p)} style={{padding:'6px 13px', borderRadius:999, border: phase===p?'none':`1px solid ${VX.line}`, background: phase===p?VX.indigo:VX.white, color: phase===p?'#fff':VX.inkSoft, fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit'}}>{p}</button>
        ))}
      </div>

      <div style={{flex:1, overflow:'auto', padding:'14px 14px 40px'}}>
        <div className="eyebrow" style={{marginBottom:10, paddingLeft:2}}>{list.length} workouts for {phase} phase</div>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {list.map((w, i) => {
            const c = VX_TYPE[w.type] || VX.indigo;
            return (
              <div key={i} className="card" style={{padding:16, borderLeft:`3px solid ${c}`}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6}}>
                  <div style={{fontSize:15, fontWeight:700}}>{w.name}</div>
                  <span className="mono" style={{fontSize:11, color:VX.mute, flexShrink:0, marginLeft:8}}>{w.dur}</span>
                </div>
                <span style={{display:'inline-flex', gap:5, alignItems:'center', padding:'3px 9px', borderRadius:999, background:`${c}1A`, color:c, fontSize:11, fontWeight:600, marginBottom:8}}>
                  <span style={{width:5, height:5, borderRadius:999, background:c}}/>{w.type}
                </span>
                <div style={{fontSize:13, color:VX.inkSoft, lineHeight:1.5}}>{w.desc}</div>
                <button style={{marginTop:12, padding:'8px 14px', borderRadius:10, border:`1px solid ${VX.indigo}`, background:'transparent', color:VX.indigo, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>+ Save to library</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Athlete Detail (coach) ─────────────────────────── */
function AthleteDetailFaithful() {
  const [open, setOpen] = React.useState({ volume:true, intensity:false, readiness:false, race:false, runs:false, att:false });
  const toggle = (k) => setOpen(s => ({ ...s, [k]: !s[k] }));

  const weeks = [{t:18,a:17},{t:20,a:19},{t:22,a:23},{t:24,a:22},{t:26,a:25},{t:35,a:24.6,now:true},{t:30,a:null},{t:32,a:null},{t:30,a:null},{t:26,a:null},{t:20,a:null}];
  const maxV = 35;
  const runs = [{mi:6.0,date:'Today',dur:'48:12',ef:4},{mi:9.6,date:'Apr 21',dur:'1:18:40',ef:6},{mi:5.0,date:'Apr 20',dur:'42:30',ef:5},{mi:6.2,date:'Apr 18',dur:'50:05',ef:3}];

  return (
    <div className="vx">
      <VXStyles />
      {/* Header */}
      <div style={{padding:'52px 18px 16px', background:VX.white, borderBottom:`1px solid ${VX.line}`, flexShrink:0}}>
        <div style={{display:'flex', alignItems:'center', gap:4, marginBottom:14, color:VX.inkSoft, fontSize:14, fontWeight:600}}>‹ Back to team</div>
        <div style={{display:'flex', gap:12, alignItems:'center'}}>
          <div style={{width:48, height:48, borderRadius:999, background:'#10B981', color:'#fff', display:'grid', placeItems:'center', fontSize:17, fontWeight:700}}>TB</div>
          <div>
            <div style={{fontSize:18, fontWeight:700}}>Train Bradshaw</div>
            <div style={{fontSize:12, color:VX.mute, marginTop:1}}>train.b@davis.edu · Varsity Boys</div>
          </div>
        </div>
        <div style={{display:'flex', marginTop:16, padding:'12px 0', background:VX.paper, borderRadius:12}}>
          {[['24.6','This week'],['98.2','This month'],['41','Total runs'],['94%','Easy 30d']].map(([n,l], i) => (
            <div key={l} style={{flex:1, textAlign:'center', borderLeft: i>0?`1px solid ${VX.line}`:'none'}}>
              <div className="num" style={{fontSize:17, color: l==='Easy 30d'?VX.emerald:VX.ink}}>{n}</div>
              <div style={{fontSize:9.5, color:VX.mute, marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{flex:1, overflow:'auto', padding:'14px 14px 40px', display:'flex', flexDirection:'column', gap:12}}>
        {/* Coach action bar */}
        <div style={{display:'flex', gap:10}}>
          <button style={{flex:1, padding:11, borderRadius:11, background:VX.indigo, color:'#fff', border:'none', fontSize:13.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Message</button>
          <button style={{flex:1, padding:11, borderRadius:11, background:VX.white, border:`1.5px solid ${VX.line}`, color:VX.inkSoft, fontSize:13.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Adjust plan</button>
        </div>

        {/* 1 Mileage Volume */}
        <VXSection n="1" title="Mileage Volume" sub="Week 6 of 11 · Build" open={open.volume} onToggle={() => toggle('volume')}>
          <div style={{display:'flex', alignItems:'flex-end', gap:4, height:90}}>
            {weeks.map((w,i) => {
              const tH=(w.t/maxV)*100, aH=w.a!=null?(w.a/maxV)*100:0;
              const ratio=w.a!=null?w.a/w.t:null;
              const col=w.a==null?VX.line:ratio>=0.9&&ratio<=1.1?VX.emerald:ratio<0.9?VX.amber:VX.coral;
              return (
                <div key={i} style={{flex:1, height:'100%', display:'flex', flexDirection:'column', justifyContent:'flex-end', alignItems:'center', position:'relative', borderRadius:4, border:w.now?`1.5px solid ${VX.indigo}`:'1.5px solid transparent', padding:1}}>
                  <div style={{width:'100%', height:`${tH}%`, position:'absolute', bottom:1, background:VX.paper2, border:`1px solid ${VX.line}`, borderRadius:3}}/>
                  {w.a!=null && <div style={{width:'100%', height:`${aH}%`, background:col, borderRadius:3, position:'relative', zIndex:1}}/>}
                  {w.now && <div className="mono" style={{position:'absolute', top:-15, fontSize:8, color:VX.indigo, fontWeight:700}}>NOW</div>}
                </div>
              );
            })}
          </div>
          <div style={{marginTop:10, fontSize:12.5, color:VX.inkSoft}}>This week: <b>24.6</b> of 35 mi <b style={{color:VX.amber}}>(70%)</b></div>
        </VXSection>

        {/* 2 Easy-Hard */}
        <VXSection n="2" title="Easy-Hard Balance" sub="Last 30 days · 80/20" open={open.intensity} onToggle={() => toggle('intensity')}>
          <div style={{textAlign:'center', margin:'4px 0 12px'}}>
            <span className="num" style={{fontSize:40, color:VX.emerald}}>94%</span>
            <div style={{fontSize:11.5, color:VX.mute}}>easy running</div>
          </div>
          <div style={{display:'flex', height:10, borderRadius:999, overflow:'hidden', gap:2}}>
            <div style={{flex:94, background:VX.emerald}}/><div style={{flex:6, background:VX.coral}}/>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:8, fontSize:11, color:VX.mute}}>
            <span>● Easy 94%</span><span>Hard 6% ●</span>
          </div>
        </VXSection>

        {/* 3 Readiness */}
        <VXSection n="3" title="Readiness & Recovery" sub="Last 7 days" open={open.readiness} onToggle={() => toggle('readiness')}>
          <div style={{display:'flex', gap:16, alignItems:'center'}}>
            <VXRing value={7.4}/>
            <div style={{flex:1}}>
              <VXGauge label="Sleep" v={3.6} color={VX.amber}/>
              <VXGauge label="Legs" v={4.1} color={VX.emerald}/>
              <VXGauge label="Mood" v={4.9} color={VX.indigo}/>
            </div>
          </div>
        </VXSection>

        {/* 4 Race */}
        <VXSection n="4" title="Race Performance" sub="3 races this season" open={open.race} onToggle={() => toggle('race')}>
          <div style={{padding:'9px 12px', borderRadius:10, background:`${VX.pink}0D`, fontSize:12.5, fontWeight:700, marginBottom:8}}>5K PR: 17:28 — Crystal Springs</div>
          {[['Woodbridge','Aug 24','17:56'],['Mt. SAC','Sep 14','17:42'],['Crystal Springs','Oct 08','17:28']].map(([m,d,t],i) => (
            <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom: i<2?`1px solid ${VX.line}`:'none'}}>
              <div><div style={{fontSize:13, fontWeight:600}}>{m}</div><div style={{fontSize:10.5, color:VX.mute}}>{d} · 5K</div></div>
              <span className="num" style={{fontSize:16}}>{t}</span>
            </div>
          ))}
        </VXSection>

        {/* 5 Run History */}
        <VXSection n="5" title="Run History" sub="41 runs logged" open={open.runs} onToggle={() => toggle('runs')}>
          {runs.map((r,i) => {
            const ec = r.ef<=3?VX.emerald:r.ef<=6?VX.amber:VX.coral;
            return (
              <div key={i} style={{display:'flex', gap:12, alignItems:'center', padding:'9px 0', borderBottom: i<runs.length-1?`1px solid ${VX.line}`:'none'}}>
                <div style={{minWidth:50}}><div className="num" style={{fontSize:15}}>{r.mi} mi</div><div style={{fontSize:10, color:VX.mute}}>{r.date}</div></div>
                <div className="mono" style={{flex:1, fontSize:11.5, color:VX.inkSoft}}>{r.dur}</div>
                <span style={{fontSize:12, fontWeight:600, color:ec}}>Effort {r.ef}/10</span>
              </div>
            );
          })}
        </VXSection>

        {/* 6 Attendance */}
        <VXSection n="6" title="Attendance" sub="93% · last 30 days" open={open.att} onToggle={() => toggle('att')}>
          <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
            {Array.from({length:24}).map((_,i) => {
              const s = i===7||i===18 ? 'absent' : i===12 ? 'excused' : 'present';
              const c = s==='present'?VX.emerald:s==='absent'?VX.coral:VX.amber;
              return <span key={i} style={{width:18, height:18, borderRadius:5, background:`${c}`, opacity:0.85}}/>;
            })}
          </div>
          <div style={{display:'flex', gap:14, marginTop:10, fontSize:10.5, color:VX.mute}}>
            <span>● Present</span><span style={{color:VX.amber}}>● Excused</span><span style={{color:VX.coral}}>● Absent</span>
          </div>
        </VXSection>
      </div>
    </div>
  );
}

function VXSection({n, title, sub, open, onToggle, children}) {
  return (
    <div className="card" style={{padding:0, overflow:'hidden'}}>
      <button onClick={onToggle} style={{width:'100%', display:'flex', gap:11, alignItems:'center', padding:16, background:'transparent', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit'}}>
        <span style={{width:24, height:24, borderRadius:999, background:`${VX.indigo}14`, color:VX.indigo, display:'grid', placeItems:'center', fontSize:11.5, fontWeight:700, flexShrink:0}}>{n}</span>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:13.5, fontWeight:600}}>{title}</div>
          <div className="eyebrow" style={{marginTop:2}}>{sub}</div>
        </div>
        <span style={{color:VX.mute2, fontSize:12, transform:open?'rotate(180deg)':'none'}}>▾</span>
      </button>
      {open && <div style={{padding:'0 16px 16px'}}>{children}</div>}
    </div>
  );
}
function VXRing({value}) {
  const pct=value/10, r=28, c=2*Math.PI*r;
  const color=value<4?VX.coral:value<7?VX.amber:VX.emerald;
  return (
    <div style={{width:72, height:72, position:'relative', flexShrink:0}}>
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} stroke={VX.line} strokeWidth="6" fill="none"/>
        <circle cx="36" cy="36" r={r} stroke={color} strokeWidth="6" fill="none" strokeDasharray={c} strokeDashoffset={c*(1-pct)} transform="rotate(-90 36 36)" strokeLinecap="round"/>
      </svg>
      <div style={{position:'absolute', inset:0, display:'grid', placeItems:'center'}}>
        <div style={{textAlign:'center'}}><div className="num" style={{fontSize:18}}>{value}</div><div style={{fontSize:8, color:VX.mute}}>/ 10</div></div>
      </div>
    </div>
  );
}
function VXGauge({label, v, color}) {
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:3}}>
        <span style={{fontSize:11.5, color:VX.inkSoft, fontWeight:500}}>{label}</span>
        <span className="num" style={{fontSize:11.5}}>{v.toFixed(1)}<span style={{color:VX.mute}}>/5</span></span>
      </div>
      <div style={{height:5, background:VX.line, borderRadius:999, overflow:'hidden'}}><div style={{height:'100%', width:`${(v/5)*100}%`, background:color}}/></div>
    </div>
  );
}

Object.assign(window, { WellnessCheckInFaithful, WorkoutLibraryFaithful, AthleteDetailFaithful });
