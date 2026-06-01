/* global React */
// TeamBase — Workout Detail + Log a Run + Athlete Profile (Direction D · Signal)
// Faithful to WorkoutDetailModal.js, the log-run modal in AthleteDashboard.js, and AthleteProfile.js.

const WX = {
  white:'#FFFFFF', paper:'#FAFBFC', paper2:'#F4F5F7', line:'#E6E8EC',
  ink:'#0B0D12', inkSoft:'#2A2E38', mute:'#6B7280', mute2:'#9AA0AB',
  indigo:'#4F46E5', violet:'#7C3AED', pink:'#EC4899', coral:'#FB7185',
  amber:'#F59E0B', lime:'#84CC16', emerald:'#10B981', cyan:'#06B6D4',
};
const WX_TYPE = { Easy:'#84CC16', Tempo:'#F59E0B', 'Long Run':'#06B6D4', Intervals:'#7C3AED', Race:'#DC2626' };
const WX_EFFORT = ['','#10B981','#10B981','#84CC16','#84CC16','#F59E0B','#F59E0B','#FB7185','#FB7185','#EF4444','#DC2626'];
const WX_AVATAR = ['#4F46E5','#1e6f5c','#7c3aed','#dc2626','#ea580c','#0891b2','#EC4899','#059669','#d946ef','#78716c'];

function WXStyles() {
  return <style>{`
    .wx { font-family:'Inter Tight', sans-serif; color:${WX.ink}; letter-spacing:-0.01em; height:100%; overflow:auto; background:${WX.paper2}; }
    .wx .display { font-family:'Instrument Serif', serif; letter-spacing:-0.02em; }
    .wx .mono { font-family:'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
    .wx .num { font-family:'Inter Tight', sans-serif; font-variant-numeric:tabular-nums; letter-spacing:-0.03em; font-weight:600; }
    .wx .eyebrow { font-size:10.5px; letter-spacing:0.13em; text-transform:uppercase; color:${WX.mute}; font-weight:500; }
    .wx .card { background:${WX.white}; border:1px solid ${WX.line}; border-radius:14px; }
  `}</style>;
}

/* ─────────────────────────── Workout Detail ─────────────────────────── */
function WorkoutDetailFaithful() {
  const type = 'Tempo', c = WX_TYPE[type];
  return (
    <div className="wx">
      <WXStyles />
      {/* Header */}
      <div style={{padding:'52px 22px 22px', background:WX.white, borderBottom:`1px solid ${WX.line}`}}>
        <div style={{display:'flex', alignItems:'center', gap:4, marginBottom:16, color:WX.inkSoft, fontSize:15, fontWeight:600}}>‹ Close</div>
        <span style={{display:'inline-block', padding:'4px 10px', borderRadius:7, background:c, color:'#fff', fontSize:11, fontWeight:700, letterSpacing:'0.04em'}}>TRAINING · TEMPO</span>
        <div className="display" style={{fontSize:30, marginTop:12, lineHeight:1.05}}>Thursday Tempo</div>
        <div style={{fontSize:14, color:WX.mute, marginTop:5}}>Thursday, April 24, 2026</div>
      </div>

      <div style={{padding:'16px 16px 40px', display:'flex', flexDirection:'column', gap:12}}>
        <div className="card" style={{padding:16}}>
          <div className="eyebrow" style={{marginBottom:8}}>Distance — Varsity Boys</div>
          <div className="num" style={{fontSize:24, color:WX.indigo}}>6 miles</div>
        </div>
        <div style={{padding:16, borderRadius:14, background:`${WX.indigo}0D`, border:`1px solid ${WX.indigo}22`}}>
          <div className="eyebrow" style={{marginBottom:8, color:WX.indigo}}>Threshold pace</div>
          <div className="num" style={{fontSize:22, color:WX.indigo}}>7:02 – 7:28 /mi</div>
        </div>
        <div className="card" style={{padding:16}}>
          <div className="eyebrow" style={{marginBottom:8}}>Location</div>
          <div style={{fontSize:15}}>Davis HS track + greenbelt loop</div>
        </div>
        <div className="card" style={{padding:16}}>
          <div className="eyebrow" style={{marginBottom:8}}>Workout details</div>
          <div style={{fontSize:15, lineHeight:1.5, color:WX.inkSoft}}>2 mi easy warmup · 3 mi @ threshold effort (comfortably hard, controlled breathing) · 1 mi easy cooldown. Keep the tempo segment honest — even splits beat a fast start.</div>
        </div>
        <div className="card" style={{padding:16}}>
          <div className="eyebrow" style={{marginBottom:8}}>Posted by</div>
          <div style={{fontSize:15}}>Coach Reyes</div>
        </div>
        <div style={{display:'flex', gap:12, marginTop:4}}>
          <button style={{flex:1, padding:'12px', borderRadius:11, border:`1.5px solid ${WX.line}`, background:WX.white, color:c, fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Edit</button>
          <button style={{flex:1, padding:'12px', borderRadius:11, border:`1.5px solid #fecaca`, background:'#fef2f2', color:WX.coral, fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Log a Run ─────────────────────────── */
function LogRunFaithful() {
  const [effort, setEffort] = React.useState(5);
  const [miles, setMiles] = React.useState('6.0');
  return (
    <div className="wx">
      <WXStyles />
      {/* Header */}
      <div style={{padding:'52px 18px 14px', background:WX.white, borderBottom:`1px solid ${WX.line}`, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <span style={{fontSize:15, color:WX.mute, fontWeight:600}}>Cancel</span>
        <span className="display" style={{fontSize:20, fontStyle:'italic'}}>Log a run</span>
        <span style={{fontSize:15, color:WX.mute2, fontWeight:600}}>Save</span>
      </div>

      <div style={{padding:'16px 16px 40px', display:'flex', flexDirection:'column', gap:12}}>
        {/* Distance + duration */}
        <div className="card" style={{padding:16}}>
          <div className="eyebrow" style={{marginBottom:10}}>Distance</div>
          <div style={{display:'flex', alignItems:'baseline', gap:8}}>
            <input value={miles} onChange={e => setMiles(e.target.value)} style={{width:90, fontFamily:"'Inter Tight', sans-serif", fontVariantNumeric:'tabular-nums', letterSpacing:'-0.03em', fontWeight:600, fontSize:40, border:'none', outline:'none', color:WX.ink, background:'transparent'}}/>
            <span style={{fontSize:16, color:WX.mute}}>miles</span>
          </div>
        </div>
        <div style={{display:'flex', gap:12}}>
          <div className="card" style={{padding:16, flex:1}}>
            <div className="eyebrow" style={{marginBottom:8}}>Duration</div>
            <div className="num" style={{fontSize:22}}>48:12</div>
          </div>
          <div className="card" style={{padding:16, flex:1}}>
            <div className="eyebrow" style={{marginBottom:8}}>Date</div>
            <div style={{fontSize:16, fontWeight:600, paddingTop:3}}>Today</div>
          </div>
        </div>

        {/* Effort picker */}
        <div className="card" style={{padding:16}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:12}}>
            <div className="eyebrow">How did it feel?</div>
            <div style={{fontSize:13, fontWeight:600, color:WX_EFFORT[effort]}}>{['','Very easy','Easy','Moderate','Moderate','Medium','Medium hard','Hard','Very hard','Max effort','All out'][effort]}</div>
          </div>
          <div style={{display:'flex', gap:5}}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} onClick={() => setEffort(n)} style={{flex:1, aspectRatio:'1', borderRadius:9, border: effort===n?`2px solid ${WX_EFFORT[n]}`:`1px solid ${WX.line}`, background: effort===n?`${WX_EFFORT[n]}1A`:WX.paper, color: effort===n?WX_EFFORT[n]:WX.mute, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>{n}</button>
            ))}
          </div>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontSize:10, color:WX.mute2}}>
            <span>1 · Very easy</span><span>10 · All out</span>
          </div>
        </div>

        {/* Optional fields */}
        <div className="card" style={{padding:0, overflow:'hidden'}}>
          <LogField label="Heart rate" value="142 bpm" />
          <LogField label="Workout type" value="Tempo" chip="#F59E0B" border />
          <LogField label="Notes" value="Felt strong on the tempo segment" border />
        </div>

        <button style={{width:'100%', padding:14, borderRadius:12, background:WX.indigo, color:'#fff', border:'none', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Save run</button>
      </div>
    </div>
  );
}

function LogField({label, value, chip, border}) {
  return (
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 16px', borderTop: border?`1px solid ${WX.line}`:'none'}}>
      <span style={{fontSize:13.5, color:WX.mute, fontWeight:500}}>{label}</span>
      <div style={{display:'flex', gap:7, alignItems:'center'}}>
        {chip && <span style={{width:7, height:7, borderRadius:999, background:chip}}/>}
        <span style={{fontSize:14, color:WX.ink, fontWeight:500}}>{value}</span>
        <span style={{color:WX.mute2, fontSize:16}}>›</span>
      </div>
    </div>
  );
}

/* ─────────────────────────── Athlete Profile ─────────────────────────── */
function AthleteProfileFaithful() {
  const [tab, setTab] = React.useState('profile');
  const [avatar, setAvatar] = React.useState('#4F46E5');
  const [hrZones, setHrZones] = React.useState(true);
  const [vdotDist, setVdotDist] = React.useState('5K');

  return (
    <div className="wx">
      <WXStyles />
      {/* Header */}
      <div style={{padding:'52px 18px 12px', background:WX.white, display:'flex', alignItems:'center', gap:10}}>
        <span style={{fontSize:20, color:WX.inkSoft}}>‹</span>
        <div className="display" style={{flex:1, fontSize:22, fontStyle:'italic', textAlign:'center'}}>My profile</div>
        <span style={{width:20}}/>
      </div>
      {/* Avatar block */}
      <div style={{background:WX.white, padding:'8px 18px 18px', textAlign:'center', borderBottom:`1px solid ${WX.line}`}}>
        <div style={{width:72, height:72, borderRadius:999, background:avatar, color:'#fff', display:'grid', placeItems:'center', fontSize:26, fontWeight:700, margin:'0 auto'}}>TB</div>
        <div style={{fontSize:18, fontWeight:700, marginTop:10}}>Train Bradshaw</div>
        <div style={{fontSize:12.5, color:WX.mute, marginTop:2}}>Senior · Davis HS Cross Country</div>
      </div>
      {/* Tabs */}
      <div style={{background:WX.white, display:'flex', padding:'0 8px', borderBottom:`1px solid ${WX.line}`, position:'sticky', top:0, zIndex:2}}>
        {[['profile','Profile'],['messages','Messages (3)'],['connections','Connections']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{flex:1, padding:'11px 0', background:'transparent', border:'none', borderBottom: tab===k?`2px solid ${WX.indigo}`:'2px solid transparent', color: tab===k?WX.indigo:WX.mute, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>{l}</button>
        ))}
      </div>

      <div style={{padding:'14px 14px 40px', display:'flex', flexDirection:'column', gap:12}}>
        {tab === 'profile' && <>
          {/* Identity card */}
          <div className="card" style={{padding:16}}>
            <div style={{fontSize:14, fontWeight:700, marginBottom:14}}>Personal info</div>
            <PField label="First name" value="Train"/>
            <PField label="Last name" value="Bradshaw"/>
            <div className="eyebrow" style={{marginTop:14, marginBottom:8}}>Gender</div>
            <div style={{display:'flex', gap:8}}>
              {['Boys','Girls','Other'].map((g,i) => (
                <div key={g} style={{flex:1, textAlign:'center', padding:'9px 0', borderRadius:9, fontSize:12.5, fontWeight:600, background:i===0?WX.indigo:WX.paper, color:i===0?'#fff':WX.inkSoft, border:i===0?'none':`1px solid ${WX.line}`}}>{g}</div>
              ))}
            </div>
            <div className="eyebrow" style={{marginTop:14, marginBottom:8}}>Avatar color</div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              {WX_AVATAR.map(c => (
                <button key={c} onClick={() => setAvatar(c)} style={{width:30, height:30, borderRadius:999, background:c, border: avatar===c?`2.5px solid ${WX.ink}`:'2.5px solid transparent', cursor:'pointer', display:'grid', placeItems:'center', color:'#fff', fontSize:14}}>{avatar===c?'✓':''}</button>
              ))}
            </div>
            <button style={{width:'100%', marginTop:16, padding:12, borderRadius:11, background:WX.ink, color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Save changes</button>
          </div>

          {/* Training preferences */}
          <div className="card" style={{padding:16}}>
            <div style={{fontSize:14, fontWeight:700, marginBottom:12}}>Training preferences</div>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13.5, fontWeight:600}}>Show heart rate zones</div>
                <div style={{fontSize:11.5, color:WX.mute, marginTop:2, lineHeight:1.4}}>Turn off if you train by feel or don't use an HR monitor.</div>
              </div>
              <button onClick={() => setHrZones(v => !v)} style={{width:46, height:28, borderRadius:999, border:'none', background: hrZones?WX.indigo:WX.line, position:'relative', cursor:'pointer', flexShrink:0, transition:'background .15s'}}>
                <span style={{position:'absolute', top:3, left: hrZones?21:3, width:22, height:22, borderRadius:999, background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left .15s'}}/>
              </button>
            </div>
          </div>

          {/* VDOT paces */}
          <div className="card" style={{padding:16}}>
            <div style={{fontSize:14, fontWeight:700, marginBottom:4}}>Training paces (VDOT)</div>
            <div style={{fontSize:11.5, color:WX.mute, marginBottom:12}}>Enter a recent race time to calculate personalized paces.</div>
            <div style={{display:'flex', gap:7, marginBottom:10}}>
              {['1 mi','3K','5K','10K'].map(d => (
                <button key={d} onClick={() => setVdotDist(d)} style={{padding:'7px 12px', borderRadius:9, fontSize:12, fontWeight:600, border: vdotDist===d?'none':`1px solid ${WX.line}`, background: vdotDist===d?WX.indigo:WX.white, color: vdotDist===d?'#fff':WX.inkSoft, cursor:'pointer', fontFamily:'inherit'}}>{d}</button>
              ))}
            </div>
            <div style={{display:'flex', gap:8, marginBottom:14}}>
              <div style={{flex:1, padding:'11px 14px', borderRadius:10, background:WX.paper, border:`1px solid ${WX.line}`, fontSize:15, color:WX.ink, fontWeight:600}} className="mono">17:28</div>
              <button style={{padding:'0 18px', borderRadius:10, background:WX.indigo, color:'#fff', border:'none', fontSize:13.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Calculate</button>
            </div>
            {/* Result */}
            <div style={{padding:14, borderRadius:11, background:`${WX.indigo}0A`, border:`1px solid ${WX.indigo}22`}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:10}}>
                <span className="eyebrow" style={{color:WX.indigo}}>VDOT score</span>
                <span className="num" style={{fontSize:22, color:WX.indigo}}>47.2</span>
              </div>
              {[['E','Easy','8:41 – 10:23',WX.lime],['M','Marathon','7:58',WX.emerald],['T','Threshold','7:15',WX.amber],['I','Interval','6:38',WX.coral],['R','Rep','6:08',WX.violet]].map(([k,name,pace,col]) => (
                <div key={k} style={{display:'flex', alignItems:'center', gap:10, padding:'5px 0'}}>
                  <span style={{width:20, height:20, borderRadius:6, background:`${col}1A`, color:col, display:'grid', placeItems:'center', fontSize:10, fontWeight:700}}>{k}</span>
                  <span style={{flex:1, fontSize:12.5, color:WX.inkSoft}}>{name}</span>
                  <span className="mono" style={{fontSize:12.5, fontWeight:600}}>{pace}/mi</span>
                </div>
              ))}
              <button style={{width:'100%', marginTop:12, padding:11, borderRadius:10, background:WX.indigo, color:'#fff', border:'none', fontSize:13.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Save paces</button>
            </div>
          </div>
        </>}

        {tab === 'messages' && <>
          <div className="eyebrow" style={{paddingLeft:4}}>Coach messages — last 30 days</div>
          {[
            {text:'Taper week — easy runs only. Sleep well, trust the work. Championship Saturday. 🏆', date:'Apr 21'},
            {text:'Great job at Mt. SAC everyone. Pack ran tight — that\u2019s how we score points.', date:'Apr 14'},
            {text:'Reminder: pasta dinner Friday at Ava\u2019s. Bring a side dish.', date:'Apr 11'},
          ].map((m, i) => (
            <div key={i} className="card" style={{padding:14}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6}}>
                <span style={{fontSize:12, fontWeight:700, color:WX.indigo}}>Coach Reyes</span>
                <span style={{fontSize:11, color:WX.mute2}}>{m.date}</span>
              </div>
              <div style={{fontSize:14, color:WX.inkSoft, lineHeight:1.45}}>{m.text}</div>
            </div>
          ))}
        </>}

        {tab === 'connections' && <>
          <div className="eyebrow" style={{paddingLeft:4}}>Connected apps</div>
          <div className="card" style={{padding:14, display:'flex', gap:12, alignItems:'center'}}>
            <div style={{width:36, height:36, borderRadius:9, background:'#FC4C0218', display:'grid', placeItems:'center', color:'#FC4C02', fontWeight:800, fontSize:17}}>S</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13.5, fontWeight:600}}>Strava</div>
              <div style={{fontSize:11.5, color:WX.emerald, marginTop:1}}>● Connected · auto-syncing</div>
            </div>
            <span style={{fontSize:12.5, color:WX.coral, fontWeight:600}}>Disconnect</span>
          </div>

          <div className="eyebrow" style={{paddingLeft:4, marginTop:6}}>Connected parents</div>
          {[['Karen Bradshaw','Mom','#EC4899'],['Mike Bradshaw','Dad','#06B6D4']].map(([nm,rel,c]) => (
            <div key={nm} className="card" style={{padding:14, display:'flex', gap:12, alignItems:'center'}}>
              <div style={{width:34, height:34, borderRadius:999, background:c, color:'#fff', display:'grid', placeItems:'center', fontSize:12, fontWeight:700}}>{nm.split(' ').map(s=>s[0]).join('')}</div>
              <div style={{flex:1}}><div style={{fontSize:13.5, fontWeight:600}}>{nm}</div><div style={{fontSize:11.5, color:WX.mute}}>{rel}</div></div>
              <span style={{fontSize:12.5, color:WX.mute2}}>Remove</span>
            </div>
          ))}

          <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:8}}>
            <button style={{width:'100%', padding:12, borderRadius:11, background:WX.white, border:`1.5px solid ${WX.line}`, color:WX.inkSoft, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Leave team</button>
            <button style={{width:'100%', padding:12, borderRadius:11, background:'#fef2f2', border:'1.5px solid #fecaca', color:WX.coral, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Sign out</button>
          </div>
        </>}
      </div>
    </div>
  );
}

function PField({label, value}) {
  return (
    <div style={{marginBottom:10}}>
      <div className="eyebrow" style={{marginBottom:5}}>{label}</div>
      <div style={{padding:'10px 14px', borderRadius:10, background:WX.paper, border:`1px solid ${WX.line}`, fontSize:14.5, fontWeight:500}}>{value}</div>
    </div>
  );
}

Object.assign(window, { WorkoutDetailFaithful, LogRunFaithful, AthleteProfileFaithful });
