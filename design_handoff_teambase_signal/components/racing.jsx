/* global React */
// TeamBase — Race Manager + Meet Detail + Race Results (Direction D · Signal)
// Faithful to RaceManager.js, MeetDetail.js, RaceResults.js.

const RX = {
  white:'#FFFFFF', paper:'#FAFBFC', paper2:'#F4F5F7', line:'#E6E8EC',
  ink:'#0B0D12', inkSoft:'#2A2E38', mute:'#6B7280', mute2:'#9AA0AB',
  indigo:'#4F46E5', violet:'#7C3AED', pink:'#EC4899', coral:'#FB7185',
  amber:'#F59E0B', lime:'#84CC16', emerald:'#10B981', cyan:'#06B6D4',
};

function RXStyles() {
  return <style>{`
    .rx { font-family:'Inter Tight', sans-serif; color:${RX.ink}; letter-spacing:-0.01em; height:100%; overflow:auto; background:${RX.paper2}; }
    .rx .display { font-family:'Instrument Serif', serif; letter-spacing:-0.02em; }
    .rx .mono { font-family:'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
    .rx .num { font-family:'Inter Tight', sans-serif; font-variant-numeric:tabular-nums; letter-spacing:-0.03em; font-weight:600; }
    .rx .eyebrow { font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:${RX.mute}; font-weight:500; }
    .rx .card { background:${RX.white}; border:1px solid ${RX.line}; border-radius:14px; }
  `}</style>;
}

/* ─────────────────────────── Race Manager ─────────────────────────── */
function RaceManagerFaithful() {
  const upcoming = [
    {name:'League Championships', date:'Sat, May 17', loc:'Crystal Springs', days:'24d'},
    {name:'Twilight Invitational', date:'Fri, May 30', loc:'Davis HS', days:'37d'},
  ];
  const past = [
    {name:'Crystal Springs Invite', date:'Oct 8', loc:'Crystal Springs', tag:'Oct 8'},
    {name:'Mt. SAC Invitational', date:'Sep 14', loc:'Walnut, CA', tag:'Sep 14'},
    {name:'Woodbridge XC Classic', date:'Aug 24', loc:'Norco, CA', tag:'Aug 24'},
  ];
  return (
    <div className="rx">
      <RXStyles />
      <div style={{padding:'52px 18px 14px', background:RX.white, borderBottom:`1px solid ${RX.line}`, display:'flex', alignItems:'center', gap:10}}>
        <span style={{fontSize:20, color:RX.inkSoft}}>‹</span>
        <div className="display" style={{flex:1, fontSize:24, fontStyle:'italic'}}>Races</div>
        <button style={{padding:'7px 13px', borderRadius:10, background:RX.ink, color:'#fff', border:'none', fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>+ Add</button>
      </div>

      <div style={{padding:'16px 14px 110px'}}>
        <div className="eyebrow" style={{marginBottom:10, paddingLeft:4}}>Upcoming</div>
        <div style={{display:'flex', flexDirection:'column', gap:8, marginBottom:22}}>
          {upcoming.map((m,i) => (
            <div key={i} className="card" style={{padding:14, display:'flex', gap:13, alignItems:'center'}}>
              <div style={{minWidth:54, padding:'8px 4px', borderRadius:10, background:RX.indigo, color:'#fff', textAlign:'center'}}>
                <div className="num" style={{fontSize:16}}>{m.days}</div>
                <div style={{fontSize:8.5, opacity:0.85, letterSpacing:'0.08em'}}>OUT</div>
              </div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:15, fontWeight:700}}>{m.name}</div>
                <div style={{fontSize:11.5, color:RX.mute, marginTop:2}}>{m.date} · {m.loc}</div>
              </div>
              <span style={{color:RX.mute2, fontSize:18}}>›</span>
            </div>
          ))}
        </div>

        <div className="eyebrow" style={{marginBottom:10, paddingLeft:4}}>Past meets</div>
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {past.map((m,i) => (
            <div key={i} className="card" style={{padding:14, display:'flex', gap:13, alignItems:'center'}}>
              <div style={{minWidth:54, padding:'8px 4px', borderRadius:10, background:RX.paper2, color:RX.mute, textAlign:'center', border:`1px solid ${RX.line}`}}>
                <div className="num" style={{fontSize:13, color:RX.inkSoft}}>{m.tag}</div>
              </div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:15, fontWeight:700}}>{m.name}</div>
                <div style={{fontSize:11.5, color:RX.mute, marginTop:2}}>{m.date} · {m.loc}</div>
              </div>
              <span style={{color:RX.mute2, fontSize:18}}>›</span>
            </div>
          ))}
        </div>
      </div>
      <RXTabBar active="meets" />
    </div>
  );
}

/* ─────────────────────────── Meet Detail ─────────────────────────── */
function MeetDetailFaithful() {
  const races = [
    {label:'Varsity Boys 5K', gender:'Boys', level:'Varsity', dist:'5K', entries:7, results:7},
    {label:'Varsity Girls 5K', gender:'Girls', level:'Varsity', dist:'5K', entries:7, results:7},
    {label:'JV Boys 5K', gender:'Boys', level:'JV', dist:'5K', entries:12, results:0},
    {label:'JV Girls 5K', gender:'Girls', level:'JV', dist:'5K', entries:9, results:0},
  ];
  return (
    <div className="rx">
      <RXStyles />
      <div style={{padding:'52px 18px 10px', background:RX.white, display:'flex', alignItems:'center', gap:10}}>
        <span style={{fontSize:14, color:RX.inkSoft, fontWeight:600}}>‹ Back</span>
        <div className="display" style={{flex:1, fontSize:19, fontStyle:'italic', textAlign:'center'}}>Crystal Springs Invite</div>
        <span style={{fontSize:22, color:RX.indigo}}>+</span>
      </div>
      <div style={{padding:'0 18px 14px', background:RX.white, borderBottom:`1px solid ${RX.line}`}}>
        <div style={{fontSize:12.5, color:RX.mute}}>Saturday, October 8, 2025</div>
        <div style={{fontSize:12.5, color:RX.mute, marginTop:2}}>Crystal Springs · 2.95 mi XC course</div>
      </div>

      <div style={{padding:'16px 14px 110px', display:'flex', flexDirection:'column', gap:10}}>
        {races.map((r,i) => (
          <div key={i} className="card" style={{padding:'14px 16px', display:'flex', gap:12, alignItems:'center'}}>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:14.5, fontWeight:700}}>{r.label}</div>
              <div style={{display:'flex', gap:6, marginTop:6, flexWrap:'wrap'}}>
                <span style={{fontSize:10.5, padding:'2px 8px', borderRadius:999, background:RX.paper2, color:RX.inkSoft, fontWeight:600}}>{r.gender}</span>
                <span style={{fontSize:10.5, padding:'2px 8px', borderRadius:999, background:RX.paper2, color:RX.inkSoft, fontWeight:600}}>{r.level}</span>
                <span style={{fontSize:10.5, padding:'2px 8px', borderRadius:999, background:RX.paper2, color:RX.inkSoft, fontWeight:600}}>{r.dist}</span>
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              {r.results > 0
                ? <span style={{fontSize:11, fontWeight:700, color:RX.emerald, background:`${RX.emerald}14`, padding:'4px 10px', borderRadius:999}}>{r.results} results</span>
                : <span style={{fontSize:11, fontWeight:600, color:RX.mute, background:RX.paper2, padding:'4px 10px', borderRadius:999}}>{r.entries} entries</span>}
            </div>
            <span style={{color:RX.mute2, fontSize:18}}>›</span>
          </div>
        ))}
      </div>
      <RXTabBar active="meets" />
    </div>
  );
}

/* ─────────────────────────── Race Results ─────────────────────────── */
function RaceResultsFaithful() {
  const results = [
    {tp:1, pl:4,  name:'Diego Alvarez', time:'17:28', pace:'5:55', gap:'—'},
    {tp:2, pl:9,  name:'Train Bradshaw', time:'17:42', pace:'6:00', gap:'+0:14'},
    {tp:3, pl:14, name:'Eli Wong', time:'17:58', pace:'6:05', gap:'+0:30'},
    {tp:4, pl:19, name:'Ben Stern', time:'18:46', pace:'6:21', gap:'+1:18'},
    {tp:5, pl:23, name:'Sam Okafor', time:'19:10', pace:'6:30', gap:'+1:42'},
    {tp:6, pl:31, name:'Owen Kessler', time:'19:46', pace:'6:42', gap:'+2:18', disp:true},
    {tp:7, pl:38, name:'Will Park', time:'20:13', pace:'6:51', gap:'+2:45', disp:true},
  ];
  return (
    <div className="rx" style={{background:RX.white}}>
      <RXStyles />
      <div style={{padding:'52px 18px 12px', background:RX.white, borderBottom:`1px solid ${RX.line}`, display:'flex', alignItems:'center', gap:10}}>
        <span style={{fontSize:14, color:RX.inkSoft, fontWeight:600}}>‹ Back</span>
        <div style={{flex:1, textAlign:'center'}}>
          <div className="display" style={{fontSize:18, fontStyle:'italic'}}>Varsity Boys 5K</div>
          <div className="eyebrow" style={{marginTop:2}}>5K · Crystal Springs Invite</div>
        </div>
        <span style={{fontSize:13, color:RX.indigo, fontWeight:600}}>Edit</span>
      </div>

      {/* Pack stats */}
      <div style={{padding:'14px 14px 0'}}>
        <div className="card" style={{padding:16}}>
          <div style={{display:'flex', gap:8, marginBottom:12}}>
            {[['1:42','1–5 Spread'],['17:51','Team Avg'],['42','Score']].map(([v,l]) => (
              <div key={l} style={{flex:1, padding:'10px 6px', borderRadius:10, background:RX.paper2, textAlign:'center'}}>
                <div className="num" style={{fontSize:17, color:RX.indigo}}>{v}</div>
                <div style={{fontSize:9.5, color:RX.mute, marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0', borderTop:`1px solid ${RX.line}`, fontSize:12}}>
            <span style={{color:RX.inkSoft}}>#6 Owen Kessler</span>
            <span style={{color:RX.amber, fontWeight:600}}>+0:36 from #5</span>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0', borderTop:`1px solid ${RX.line}`, fontSize:12}}>
            <span style={{color:RX.inkSoft}}>#7 Will Park</span>
            <span style={{color:RX.amber, fontWeight:600}}>+1:03 from #5</span>
          </div>
        </div>
      </div>

      {/* Results table */}
      <div style={{padding:'16px 0 40px'}}>
        <div style={{display:'flex', padding:'0 18px 8px', fontSize:10, color:RX.mute2, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em'}}>
          <span style={{width:24, textAlign:'center'}}>#</span>
          <span style={{width:28, textAlign:'center'}}>Pl</span>
          <span style={{flex:1, paddingLeft:8}}>Athlete</span>
          <span style={{width:50, textAlign:'right'}}>Time</span>
          <span style={{width:44, textAlign:'right'}}>Pace</span>
          <span style={{width:44, textAlign:'right'}}>Gap</span>
        </div>
        {results.map((r,i) => {
          const scorer = r.tp <= 5;
          return (
            <div key={i} style={{display:'flex', alignItems:'center', padding:'11px 18px', borderBottom:`1px solid ${RX.line}`, background: scorer?`${RX.indigo}08`:(r.disp?`${RX.amber}0A`:RX.white)}}>
              <span className="num" style={{width:24, textAlign:'center', fontSize:13, color: scorer?RX.indigo:RX.mute}}>{r.tp}</span>
              <span style={{width:28, textAlign:'center', fontSize:12.5, color:RX.inkSoft}}>{r.pl}</span>
              <span style={{flex:1, paddingLeft:8, fontSize:13, fontWeight: scorer?700:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.name}</span>
              <span className="num" style={{width:50, textAlign:'right', fontSize:13, color: scorer?RX.indigo:RX.ink}}>{r.time}</span>
              <span className="mono" style={{width:44, textAlign:'right', fontSize:11, color:RX.mute}}>{r.pace}</span>
              <span className="mono" style={{width:44, textAlign:'right', fontSize:11, color:RX.mute}}>{r.gap}</span>
            </div>
          );
        })}
        <div style={{display:'flex', gap:14, padding:'12px 18px 0', fontSize:10.5, color:RX.mute}}>
          <span><span style={{display:'inline-block', width:9, height:9, borderRadius:3, background:`${RX.indigo}30`, marginRight:5, verticalAlign:'middle'}}/>Scorers (1–5)</span>
          <span><span style={{display:'inline-block', width:9, height:9, borderRadius:3, background:`${RX.amber}30`, marginRight:5, verticalAlign:'middle'}}/>Displacers (6–7)</span>
        </div>
      </div>
    </div>
  );
}

function RXTabBar({active}) {
  const tabs = [['team','Team'],['training','Training'],['meets','Meets'],['feed','Feed'],['me','Me']];
  return (
    <div style={{position:'absolute', bottom:0, left:0, right:0, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderTop:`1px solid ${RX.line}`, padding:'10px 8px 22px', display:'flex', justifyContent:'space-around'}}>
      {tabs.map(([id,l]) => (
        <div key={id} style={{textAlign:'center'}}>
          <div style={{fontSize:11, fontWeight:600, color: active===id ? RX.indigo : RX.mute2}}>{l}</div>
          {active===id && <div style={{margin:'4px auto 0', width:4, height:4, borderRadius:999, background:RX.indigo}}/>}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { RaceManagerFaithful, MeetDetailFaithful, RaceResultsFaithful });
