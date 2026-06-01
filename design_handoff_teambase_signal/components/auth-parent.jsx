/* global React */
// TeamBase — Login + Athlete Join + Parent Dashboard (Direction D · Signal)
// Faithful to LoginScreen.js, AthleteJoinScreen.js, ParentDashboard.js.

const AX = {
  white:'#FFFFFF', paper:'#FAFBFC', paper2:'#F4F5F7', line:'#E6E8EC',
  ink:'#0B0D12', inkSoft:'#2A2E38', mute:'#6B7280', mute2:'#9AA0AB',
  indigo:'#4F46E5', violet:'#7C3AED', pink:'#EC4899', coral:'#FB7185',
  amber:'#F59E0B', lime:'#84CC16', emerald:'#10B981', cyan:'#06B6D4',
};

function AXStyles() {
  return <style>{`
    .ax { font-family:'Inter Tight', sans-serif; color:${AX.ink}; letter-spacing:-0.01em; height:100%; overflow:auto; background:${AX.paper2}; }
    .ax .display { font-family:'Instrument Serif', serif; letter-spacing:-0.02em; }
    .ax .mono { font-family:'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
    .ax .num { font-family:'Inter Tight', sans-serif; font-variant-numeric:tabular-nums; letter-spacing:-0.03em; font-weight:600; }
    .ax .eyebrow { font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:${AX.mute}; font-weight:500; }
    .ax .card { background:${AX.white}; border:1px solid ${AX.line}; border-radius:14px; }
    .ax .field { width:100%; box-sizing:border-box; padding:13px 15px; border-radius:11px; border:1px solid ${AX.line}; background:${AX.white}; font-family:'Inter Tight', sans-serif; font-size:15px; color:${AX.ink}; }
  `}</style>;
}

/* ─────────────────────────── Login / Sign up ─────────────────────────── */
function LoginFaithful() {
  const [signup, setSignup] = React.useState(true);
  const [role, setRole] = React.useState('athlete');
  const ROLES = [
    {k:'admin_coach', label:'Head Coach', desc:'Set up and manage your program'},
    {k:'assistant_coach', label:'Assistant Coach', desc:'Help manage an existing program'},
    {k:'athlete', label:'Athlete', desc:'Track your training and races'},
    {k:'parent', label:'Parent', desc:'Follow your athlete\u2019s season'},
  ];
  return (
    <div className="ax" style={{background:AX.white}}>
      <AXStyles />
      <div style={{padding:'60px 24px 40px', minHeight:'100%', boxSizing:'border-box'}}>
        {/* Brand header */}
        <div style={{textAlign:'center', marginBottom:28}}>
          <div style={{width:60, height:60, borderRadius:16, background:`linear-gradient(135deg, ${AX.indigo}, ${AX.violet})`, margin:'0 auto 14px', display:'grid', placeItems:'center', color:'#fff', fontSize:24, fontWeight:700, fontFamily:"'Instrument Serif', serif", fontStyle:'italic'}}>TB</div>
          <div className="display" style={{fontSize:38, lineHeight:1}}>TeamBase</div>
          <div style={{fontSize:13.5, color:AX.mute, marginTop:6}}>Building championship teams</div>
        </div>

        {signup && <>
          <div className="eyebrow" style={{marginBottom:10}}>I am a</div>
          <div style={{display:'flex', flexDirection:'column', gap:8, marginBottom:18}}>
            {ROLES.map(r => {
              const on = role === r.k;
              return (
                <button key={r.k} onClick={() => setRole(r.k)} style={{display:'flex', alignItems:'center', gap:12, padding:'13px 15px', borderRadius:12, border: on?`2px solid ${AX.indigo}`:`1.5px solid ${AX.line}`, background: on?`${AX.indigo}0A`:AX.white, cursor:'pointer', textAlign:'left', fontFamily:'inherit'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14.5, fontWeight:600, color: on?AX.indigo:AX.ink}}>{r.label}</div>
                    <div style={{fontSize:11.5, color:AX.mute, marginTop:1}}>{r.desc}</div>
                  </div>
                  <div style={{width:20, height:20, borderRadius:999, border:`2px solid ${on?AX.indigo:AX.line}`, display:'grid', placeItems:'center', flexShrink:0}}>
                    {on && <div style={{width:10, height:10, borderRadius:999, background:AX.indigo}}/>}
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{display:'flex', gap:10, marginBottom:10}}>
            <input className="field" placeholder="First name" style={{flex:1}}/>
            <input className="field" placeholder="Last name" style={{flex:1}}/>
          </div>
        </>}

        <input className="field" placeholder="Email address" style={{marginBottom:10}}/>
        <input className="field" type="password" placeholder="Password" defaultValue="••••••••" style={{marginBottom:18}}/>

        {signup && role === 'athlete' && (
          <div style={{marginBottom:18}}>
            <div className="eyebrow" style={{marginBottom:8}}>I compete on the</div>
            <div style={{display:'flex', gap:8}}>
              {['Boys','Girls'].map((g,i) => (
                <div key={g} style={{flex:1, textAlign:'center', padding:'11px 0', borderRadius:11, fontSize:13.5, fontWeight:600, background:i===0?AX.indigo:AX.paper, color:i===0?'#fff':AX.inkSoft, border:i===0?'none':`1px solid ${AX.line}`}}>{g}</div>
              ))}
            </div>
          </div>
        )}

        <button style={{width:'100%', padding:15, borderRadius:12, background:AX.indigo, color:'#fff', border:'none', fontSize:16, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>{signup?'Create account':'Sign in'}</button>

        {!signup && <button style={{width:'100%', marginTop:10, padding:14, borderRadius:12, background:AX.white, color:AX.inkSoft, border:`1.5px solid ${AX.line}`, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Sign in with Face ID</button>}

        <div onClick={() => setSignup(s=>!s)} style={{textAlign:'center', marginTop:18, fontSize:13.5, color:AX.indigo, fontWeight:600, cursor:'pointer'}}>
          {signup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Athlete Join ─────────────────────────── */
function AthleteJoinFaithful() {
  return (
    <div className="ax">
      <AXStyles />
      <div style={{padding:'60px 22px 40px'}}>
        <div style={{textAlign:'center', marginBottom:26}}>
          <div style={{fontSize:34, marginBottom:8}}>🏫</div>
          <div className="display" style={{fontSize:30, lineHeight:1}}>Find your school</div>
          <div style={{fontSize:13.5, color:AX.mute, marginTop:6}}>Join your team's program</div>
        </div>

        {/* Join by code */}
        <div className="card" style={{padding:18, marginBottom:16}}>
          <div className="eyebrow" style={{marginBottom:10}}>Have a join code?</div>
          <input className="field" placeholder="Enter code (e.g. R7QX)" style={{textAlign:'center', letterSpacing:'0.2em', fontWeight:700, fontSize:18, textTransform:'uppercase'}}/>
          <button style={{width:'100%', marginTop:12, padding:14, borderRadius:11, background:AX.indigo, color:'#fff', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>Join team</button>
        </div>

        <div style={{display:'flex', alignItems:'center', gap:12, margin:'6px 0 16px'}}>
          <div style={{flex:1, height:1, background:AX.line}}/>
          <span style={{fontSize:11.5, color:AX.mute2}}>or search</span>
          <div style={{flex:1, height:1, background:AX.line}}/>
        </div>

        {/* Search */}
        <input className="field" placeholder="🔍 School name…" style={{marginBottom:12}}/>
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {[{name:'Davis High School', mascot:'Bulldogs', loc:'Davis, CA', c:AX.indigo},
            {name:'Davis Senior High', mascot:'Blue Devils', loc:'Davis, CA', c:AX.cyan}].map((s,i) => (
            <div key={i} className="card" style={{padding:0, overflow:'hidden', display:'flex', alignItems:'stretch'}}>
              <div style={{width:5, background:s.c}}/>
              <div style={{flex:1, padding:'13px 14px', display:'flex', alignItems:'center', gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:14.5, fontWeight:700}}>{s.name}</div>
                  <div style={{fontSize:11.5, color:AX.mute, marginTop:2}}>{s.mascot} · {s.loc}</div>
                </div>
                <button style={{padding:'7px 14px', borderRadius:9, background:AX.paper2, color:AX.indigo, border:`1px solid ${AX.indigo}44`, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>Join</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{textAlign:'center', marginTop:20, fontSize:13, color:AX.mute}}>Skip for now</div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Parent Dashboard ─────────────────────────── */
function ParentDashboardFaithful() {
  const [athlete, setAthlete] = React.useState(0);
  const kids = [
    {first:'Train', last:'Bradshaw', c:'#10B981', grade:'Sr', week:24.6, target:35, last:'Easy 6 mi · today', ready:7.4},
    {first:'Casey', last:'Bradshaw', c:'#EC4899', grade:'So', week:18.2, target:22, last:'Tempo 5 mi · today', ready:6.8},
  ];
  const a = kids[athlete];
  return (
    <div className="ax">
      <AXStyles />
      <div style={{padding:'52px 18px 12px', background:AX.white, borderBottom:`1px solid ${AX.line}`}}>
        <div className="eyebrow">Parent view · Davis HS</div>
        <div className="display" style={{fontSize:26, lineHeight:1.05, marginTop:4}}>Following <em style={{fontStyle:'italic', color:AX.indigo}}>your athletes</em></div>
        {/* Athlete switcher */}
        {kids.length > 1 && (
          <div style={{display:'flex', gap:6, marginTop:12}}>
            {kids.map((k,i) => (
              <button key={i} onClick={() => setAthlete(i)} style={{display:'flex', alignItems:'center', gap:7, padding:'6px 12px', borderRadius:999, border: athlete===i?'none':`1px solid ${AX.line}`, background: athlete===i?AX.ink:AX.white, color: athlete===i?'#fff':AX.inkSoft, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>
                <span style={{width:18, height:18, borderRadius:999, background:k.c, color:'#fff', display:'grid', placeItems:'center', fontSize:9, fontWeight:700}}>{k.first[0]}{k.last[0]}</span>
                {k.first}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{padding:'16px 14px 110px', display:'flex', flexDirection:'column', gap:12}}>
        {/* Athlete summary */}
        <div className="card" style={{padding:16}}>
          <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:14}}>
            <div style={{width:46, height:46, borderRadius:999, background:a.c, color:'#fff', display:'grid', placeItems:'center', fontSize:16, fontWeight:700}}>{a.first[0]}{a.last[0]}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:16, fontWeight:700}}>{a.first} {a.last}</div>
              <div style={{fontSize:11.5, color:AX.mute, marginTop:1}}>{a.grade} · Davis HS Cross Country</div>
            </div>
          </div>
          <div style={{display:'flex', gap:10}}>
            <div style={{flex:1, padding:'12px', borderRadius:11, background:AX.paper2, textAlign:'center'}}>
              <div className="num" style={{fontSize:22}}>{a.week}</div>
              <div style={{fontSize:9.5, color:AX.mute, marginTop:2}}>OF {a.target} MI THIS WK</div>
            </div>
            <div style={{flex:1, padding:'12px', borderRadius:11, background:AX.paper2, textAlign:'center'}}>
              <div className="num" style={{fontSize:22, color: a.ready>=7?AX.emerald:AX.amber}}>{a.ready}</div>
              <div style={{fontSize:9.5, color:AX.mute, marginTop:2}}>READINESS / 10</div>
            </div>
          </div>
          <div style={{marginTop:12, padding:'10px 12px', borderRadius:10, background:`${AX.emerald}0D`, fontSize:12, color:AX.inkSoft}}>
            <b style={{color:AX.emerald}}>● Last activity:</b> {a.last}
          </div>
        </div>

        {/* Upcoming meets */}
        <div className="eyebrow" style={{paddingLeft:4}}>Upcoming meets</div>
        <div style={{display:'flex', gap:10, overflowX:'auto', paddingBottom:4}}>
          {[{name:'League Championships', date:'May 17', loc:'Crystal Springs'},{name:'Twilight Invite', date:'May 30', loc:'Davis HS'}].map((m,i) => (
            <div key={i} className="card" style={{padding:14, minWidth:170, borderLeft:`4px solid ${AX.pink}`}}>
              <div style={{fontSize:10.5, color:AX.mute, fontWeight:600}}>{m.date}</div>
              <div style={{fontSize:14, fontWeight:700, marginTop:3}}>{m.name}</div>
              <div style={{fontSize:11, color:AX.mute, marginTop:2}}>{m.loc}</div>
            </div>
          ))}
        </div>

        {/* Coach feed glimpse */}
        <div className="eyebrow" style={{paddingLeft:4, marginTop:6}}>From the coach</div>
        <div className="card" style={{padding:14}}>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:6}}>
            <span style={{fontSize:12, fontWeight:700, color:AX.indigo}}>Coach Reyes</span>
            <span style={{fontSize:11, color:AX.mute2}}>Apr 21</span>
          </div>
          <div style={{fontSize:13.5, color:AX.inkSoft, lineHeight:1.45}}>Taper week — easy runs only. Championship Saturday at Crystal Springs. Bus leaves 7am sharp. 🏆</div>
        </div>

        {/* Linked athletes / profile */}
        <div className="eyebrow" style={{paddingLeft:4, marginTop:6}}>Linked athletes</div>
        {kids.map((k,i) => (
          <div key={i} className="card" style={{padding:13, display:'flex', gap:11, alignItems:'center'}}>
            <div style={{width:36, height:36, borderRadius:999, background:k.c, color:'#fff', display:'grid', placeItems:'center', fontSize:12, fontWeight:700}}>{k.first[0]}{k.last[0]}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:14, fontWeight:600}}>{k.first} {k.last}</div>
              <div style={{fontSize:11, color:AX.mute, marginTop:1}}>{k.grade} · Davis HS</div>
            </div>
            <span style={{color:AX.mute2, fontSize:18}}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { LoginFaithful, AthleteJoinFaithful, ParentDashboardFaithful });
