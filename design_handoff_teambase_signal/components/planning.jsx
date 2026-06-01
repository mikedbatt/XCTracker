/* global React */
// TeamBase — Season Planner + Weekly Planner + Manage Roster (Direction D · Signal)
// Faithful to SeasonPlanner.js, WeeklyPlanner.js, ManageRoster.js.

const PX = {
  white:'#FFFFFF', paper:'#FAFBFC', paper2:'#F4F5F7', line:'#E6E8EC',
  ink:'#0B0D12', inkSoft:'#2A2E38', mute:'#6B7280', mute2:'#9AA0AB',
  indigo:'#4F46E5', violet:'#7C3AED', pink:'#EC4899', coral:'#FB7185',
  amber:'#F59E0B', lime:'#84CC16', emerald:'#10B981', cyan:'#06B6D4',
};
const PX_TYPE = { Easy:'#84CC16', Tempo:'#F59E0B', Long:'#06B6D4', Intervals:'#7C3AED', Rest:'#9AA0AB', Race:'#EC4899' };

function PXStyles() {
  return <style>{`
    .px { font-family:'Inter Tight', sans-serif; color:${PX.ink}; letter-spacing:-0.01em; height:100%; overflow:auto; background:${PX.paper2}; }
    .px .display { font-family:'Instrument Serif', serif; letter-spacing:-0.02em; }
    .px .mono { font-family:'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
    .px .num { font-family:'Inter Tight', sans-serif; font-variant-numeric:tabular-nums; letter-spacing:-0.03em; font-weight:600; }
    .px .eyebrow { font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:${PX.mute}; font-weight:500; }
    .px .card { background:${PX.white}; border:1px solid ${PX.line}; border-radius:14px; }
  `}</style>;
}

/* ─────────────────────────── Season Planner ─────────────────────────── */
function SeasonPlannerFaithful() {
  const phases = [
    {name:'Pre-Season Base', weeks:'1–4', icon:'🌱', color:PX.lime, desc:'Build aerobic base. Easy mileage, no intensity.'},
    {name:'Build', weeks:'5–8', icon:'🔨', color:PX.amber, desc:'Introduce quality. Tempo + threshold work.', current:true},
    {name:'Competition', weeks:'9–11', icon:'🏁', color:PX.coral, desc:'Pack work + race-specific sharpening.'},
    {name:'Peak', weeks:'12–13', icon:'⚡', color:PX.violet, desc:'Short, sharp sessions. Convert fitness to speed.'},
    {name:'Taper', weeks:'14', icon:'🛟', color:PX.cyan, desc:'Easy runs only. Rest, sleep, confidence.'},
  ];
  return (
    <div className="px">
      <PXStyles />
      <div style={{padding:'52px 18px 14px', background:PX.white, borderBottom:`1px solid ${PX.line}`, display:'flex', alignItems:'center', gap:10}}>
        <span style={{fontSize:20, color:PX.inkSoft}}>‹</span>
        <div className="display" style={{flex:1, fontSize:24, fontStyle:'italic'}}>Season planner</div>
        <button style={{padding:'7px 13px', borderRadius:10, background:PX.amber, color:'#fff', border:'none', fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>+ Add</button>
      </div>

      {/* Active phase badge */}
      <div style={{margin:'14px 14px 0', padding:'10px 14px', borderRadius:12, background:`${PX.amber}14`, border:`1px solid ${PX.amber}33`, textAlign:'center'}}>
        <span style={{fontSize:13, fontWeight:700, color:PX.amber}}>🔨 Currently in Build phase · Week 6 of 14</span>
      </div>

      <div style={{padding:'18px 14px 110px'}}>
        {/* Your seasons */}
        <div className="eyebrow" style={{marginBottom:10, paddingLeft:4}}>Your seasons</div>
        <div style={{display:'flex', flexDirection:'column', gap:8, marginBottom:24}}>
          {[{name:'Fall 2025 Cross Country', dates:'Aug 4 – Nov 15', sport:'🏔️', color:PX.emerald, active:true},
            {name:'Spring 2026 Track', dates:'Mar 2 – May 30', sport:'🏃', color:PX.coral, active:false}].map((s,i) => (
            <div key={i} className="card" style={{padding:0, overflow:'hidden', display:'flex', borderColor: s.active?s.color:PX.line, borderWidth: s.active?2:1}}>
              <div style={{width:5, background:s.color}}/>
              <div style={{flex:1, padding:'13px 14px', display:'flex', alignItems:'center', gap:12}}>
                <span style={{fontSize:22}}>{s.sport}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:14.5, fontWeight:700}}>{s.name}</div>
                  <div style={{fontSize:11.5, color:PX.mute, marginTop:2}}>{s.dates}</div>
                </div>
                {s.active && <span style={{fontSize:10, fontWeight:700, color:s.color, background:`${s.color}14`, padding:'3px 9px', borderRadius:999}}>ACTIVE</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Phase guide */}
        <div className="eyebrow" style={{marginBottom:10, paddingLeft:4}}>Cross Country phase guide</div>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {phases.map((p,i) => (
            <div key={i} className="card" style={{padding:0, overflow:'hidden', borderLeft:`5px solid ${p.color}`}}>
              <div style={{display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:`${p.color}10`}}>
                <span style={{fontSize:20}}>{p.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:14, fontWeight:700}}>{p.name} Phase{p.current && <span style={{fontSize:10, fontWeight:700, color:p.color, marginLeft:8}}>● NOW</span>}</div>
                  <div style={{fontSize:11, color:PX.mute, marginTop:1}}>Weeks {p.weeks}</div>
                </div>
              </div>
              <div style={{padding:'10px 14px', fontSize:12.5, color:PX.inkSoft, lineHeight:1.45}}>{p.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <PXTabBar active="training" />
    </div>
  );
}

/* ─────────────────────────── Weekly Planner ─────────────────────────── */
function WeeklyPlannerFaithful() {
  const week = [
    {day:'Mon', date:'Apr 20', type:'Easy', v:6, jv:5},
    {day:'Tue', date:'Apr 21', type:'Intervals', v:'8×400m', jv:'6×400m'},
    {day:'Wed', date:'Apr 22', type:'Easy', v:6, jv:5, today:true},
    {day:'Thu', date:'Apr 23', type:'Tempo', v:6, jv:5},
    {day:'Fri', date:'Apr 24', type:'Easy', v:6, jv:4},
    {day:'Sat', date:'Apr 25', type:'Long', v:10, jv:8},
    {day:'Sun', date:'Apr 26', type:'Rest', v:'—', jv:'—'},
  ];
  return (
    <div className="px">
      <PXStyles />
      <div style={{padding:'52px 18px 12px', background:PX.white, display:'flex', alignItems:'center', gap:10}}>
        <span style={{fontSize:20, color:PX.inkSoft}}>‹</span>
        <div className="display" style={{flex:1, fontSize:22, fontStyle:'italic', textAlign:'center'}}>Weekly plans</div>
        <span style={{width:20}}/>
      </div>
      {/* Week nav */}
      <div style={{padding:'10px 18px', background:PX.white, borderBottom:`1px solid ${PX.line}`, borderTop:`1px solid ${PX.line}`, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <span style={{fontSize:18, color:PX.mute2}}>‹</span>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:14, fontWeight:700}}>Week 6 · Build</div>
          <div style={{fontSize:11, color:PX.mute}}>Apr 20 – 26</div>
        </div>
        <span style={{fontSize:18, color:PX.mute2}}>›</span>
      </div>

      <div style={{padding:'14px 14px 110px'}}>
        {/* Intensity bar */}
        <div className="card" style={{padding:14, marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8}}>
            <span className="eyebrow">Easy-hard balance</span>
            <span style={{fontSize:12.5, fontWeight:700, color:PX.emerald}}>83% easy · balanced</span>
          </div>
          <div style={{display:'flex', height:10, borderRadius:999, overflow:'hidden', gap:2}}>
            <div style={{flex:83, background:PX.emerald}}/><div style={{flex:17, background:PX.amber}}/>
          </div>
        </div>

        {/* Template hint */}
        <div style={{padding:'10px 14px', borderRadius:11, background:`${PX.indigo}0A`, border:`1px dashed ${PX.indigo}40`, marginBottom:14, fontSize:12, color:PX.indigo}}>
          ✦ Recommended for Build: <b>Tempo Tuesday / Long Saturday</b> template
        </div>

        {/* Day cards */}
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {week.map((d,i) => {
            const c = PX_TYPE[d.type] || PX.indigo;
            const rest = d.type === 'Rest';
            return (
              <div key={i} className="card" style={{padding:'12px 14px', borderLeft:`3px solid ${rest?PX.line:c}`, background: d.today?`${PX.indigo}06`:PX.white, borderColor: d.today?`${PX.indigo}33`:PX.line}}>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <div style={{minWidth:44}}>
                    <div style={{fontSize:13, fontWeight:700, color: d.today?PX.indigo:PX.ink}}>{d.day}</div>
                    <div style={{fontSize:10, color:PX.mute}}>{d.date.split(' ')[1]}</div>
                  </div>
                  {!rest ? (
                    <span style={{display:'inline-flex', gap:5, alignItems:'center', padding:'3px 9px', borderRadius:999, background:`${c}1A`, color:c, fontSize:11, fontWeight:600}}>
                      <span style={{width:5, height:5, borderRadius:999, background:c}}/>{d.type}
                    </span>
                  ) : <span style={{fontSize:12, color:PX.mute2, fontStyle:'italic'}}>Rest day</span>}
                  <div style={{flex:1}}/>
                  {!rest && (
                    <div style={{display:'flex', gap:8}}>
                      <div style={{textAlign:'right'}}><div className="num" style={{fontSize:13}}>{d.v}{typeof d.v==='number'?' mi':''}</div><div style={{fontSize:8.5, color:PX.mute}}>VARSITY</div></div>
                      <div style={{textAlign:'right'}}><div className="num" style={{fontSize:13, color:PX.mute}}>{d.jv}{typeof d.jv==='number'?' mi':''}</div><div style={{fontSize:8.5, color:PX.mute}}>JV</div></div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Group totals */}
        <div style={{display:'flex', gap:8, marginTop:14}}>
          {[['Varsity','40 / 38 mi',true],['JV','33 / 32 mi',true]].map(([n,v,ok]) => (
            <div key={n} className="card" style={{flex:1, padding:'12px 14px', display:'flex', alignItems:'center', gap:8}}>
              <span style={{fontSize:14, color: ok?PX.emerald:PX.amber}}>{ok?'✓':'!'}</span>
              <div><div style={{fontSize:12.5, fontWeight:700}}>{n}</div><div className="num" style={{fontSize:11, color:PX.mute}}>{v}</div></div>
            </div>
          ))}
        </div>
      </div>
      <PXTabBar active="training" />
    </div>
  );
}

/* ─────────────────────────── Manage Roster ─────────────────────────── */
function ManageRosterFaithful() {
  const roster = [
    {first:'Noah', last:'Reyes', group:'Unassigned', email:'noah.r@davis.edu', c:'#FB7185', pending:true},
    {first:'Tess', last:'Mowery', group:'Unassigned', email:'tess.m@davis.edu', c:'#7C3AED', pending:true},
    {first:'Mia', last:'Laurent', group:'Varsity Girls', email:'mia.l@davis.edu', c:'#EC4899'},
    {first:'Diego', last:'Alvarez', group:'Varsity Boys', email:'diego.a@davis.edu', c:'#06B6D4'},
    {first:'Train', last:'Bradshaw', group:'Varsity Boys', email:'train.b@davis.edu', c:'#10B981'},
    {first:'Ava', last:'Chen', group:'Varsity Girls', email:'ava.c@davis.edu', c:'#7C3AED'},
    {first:'Ben', last:'Stern', group:'JV Boys', email:'ben.s@davis.edu', c:'#F59E0B'},
  ];
  const pending = roster.filter(a => a.pending).length;
  return (
    <div className="px" style={{background:PX.white}}>
      <PXStyles />
      <div style={{padding:'52px 18px 12px', background:PX.white, borderBottom:`1px solid ${PX.line}`, display:'flex', alignItems:'center', gap:10}}>
        <span style={{fontSize:20, color:PX.inkSoft}}>‹</span>
        <div className="display" style={{flex:1, fontSize:22, fontStyle:'italic', textAlign:'center'}}>Roster</div>
        <span style={{width:20}}/>
      </div>

      <div style={{padding:'16px 14px 40px'}}>
        <div style={{fontSize:13, color:PX.inkSoft, fontWeight:600, paddingLeft:4}}>{roster.length - pending} active · <span style={{color:PX.amber}}>{pending} pending</span></div>
        <div style={{fontSize:11.5, color:PX.mute, marginTop:3, marginBottom:14, paddingLeft:4}}>Approve athletes who've requested to join with code <b style={{color:PX.ink}}>R7QX</b>.</div>

        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {roster.map((a,i) => (
            <div key={i} className="card" style={{padding:'12px 14px', display:'flex', gap:11, alignItems:'center', borderColor: a.pending?`${PX.amber}44`:PX.line, background: a.pending?`${PX.amber}06`:PX.white}}>
              <div style={{width:36, height:36, borderRadius:999, background:a.c, color:'#fff', display:'grid', placeItems:'center', fontSize:12, fontWeight:700, flexShrink:0}}>{a.first[0]}{a.last[0]}</div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', gap:7, alignItems:'center'}}>
                  <span style={{fontSize:14, fontWeight:600}}>{a.first} {a.last}</span>
                  {a.pending && <span style={{fontSize:9.5, fontWeight:700, color:'#c2410c', background:'#fff7ed', border:'1px solid #fb923c', borderRadius:6, padding:'1px 6px'}}>Pending</span>}
                </div>
                <div style={{fontSize:11, color:PX.mute, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{a.group} · {a.email}</div>
              </div>
              {a.pending ? (
                <div style={{display:'flex', gap:6, flexShrink:0}}>
                  <button style={{padding:'7px 11px', borderRadius:9, background:PX.emerald, color:'#fff', border:'none', fontSize:11.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>Approve</button>
                  <button style={{padding:'7px 10px', borderRadius:9, background:PX.white, color:PX.coral, border:`1px solid ${PX.coral}55`, fontSize:11.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Deny</button>
                </div>
              ) : (
                <button style={{padding:'7px 12px', borderRadius:9, background:PX.white, color:PX.coral, border:`1px solid ${PX.coral}55`, fontSize:11.5, fontWeight:600, cursor:'pointer', flexShrink:0, fontFamily:'inherit'}}>Remove</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PXTabBar({active}) {
  const tabs = [['team','Team'],['training','Training'],['meets','Meets'],['feed','Feed'],['me','Me']];
  return (
    <div style={{position:'absolute', bottom:0, left:0, right:0, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderTop:`1px solid ${PX.line}`, padding:'10px 8px 22px', display:'flex', justifyContent:'space-around'}}>
      {tabs.map(([id,l]) => (
        <div key={id} style={{textAlign:'center'}}>
          <div style={{fontSize:11, fontWeight:600, color: active===id ? PX.indigo : PX.mute2}}>{l}</div>
          {active===id && <div style={{margin:'4px auto 0', width:4, height:4, borderRadius:999, background:PX.indigo}}/>}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { SeasonPlannerFaithful, WeeklyPlannerFaithful, ManageRosterFaithful });
