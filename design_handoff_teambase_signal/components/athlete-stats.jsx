/* global React */
// TeamBase — Athlete Stats (Direction D · Signal), faithful to screens/AthleteAnalytics.js
// Expandable numbered sections: Volume → Easy-Hard → Race → Readiness → Season in Review.

const ASX = {
  white:'#FFFFFF', paper:'#FAFBFC', paper2:'#F4F5F7', line:'#E6E8EC',
  ink:'#0B0D12', inkSoft:'#2A2E38', mute:'#6B7280', mute2:'#9AA0AB',
  indigo:'#4F46E5', violet:'#7C3AED', pink:'#EC4899', coral:'#FB7185',
  amber:'#F59E0B', lime:'#84CC16', emerald:'#10B981', cyan:'#06B6D4', red:'#DC2626',
};
const ASX_EFFORT = ['','#10B981','#10B981','#84CC16','#84CC16','#F59E0B','#F59E0B','#FB7185','#FB7185','#EF4444','#DC2626'];

function ASXStyles() {
  return <style>{`
    .asx { font-family:'Inter Tight', sans-serif; color:${ASX.ink}; letter-spacing:-0.01em; height:100%; overflow:auto; background:${ASX.paper2}; }
    .asx .display { font-family:'Instrument Serif', serif; letter-spacing:-0.02em; }
    .asx .mono { font-family:'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
    .asx .num { font-family:'Inter Tight', sans-serif; font-variant-numeric:tabular-nums; letter-spacing:-0.03em; font-weight:600; }
    .asx .eyebrow { font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:${ASX.mute}; font-weight:500; }
    .asx .card { background:${ASX.white}; border:1px solid ${ASX.line}; border-radius:16px; }
  `}</style>;
}

function AthleteStatsFaithful() {
  const [open, setOpen] = React.useState({ volume:true, intensity:true, race:false, readiness:false });
  const toggle = (k) => setOpen(s => ({ ...s, [k]: !s[k] }));

  // Volume — 11 weeks: target + actual
  const weeks = [
    {t:18,a:17},{t:20,a:19},{t:22,a:23},{t:24,a:22},{t:26,a:25},
    {t:35,a:24.6,now:true},{t:30,a:null},{t:32,a:null},{t:30,a:null},{t:26,a:null},{t:20,a:null}
  ];
  const maxV = 35;

  const trend = [null, 99, 95, 93, 94];
  const paceZones = [
    {k:'E', name:'Easy', pct:74, color:ASX.lime},
    {k:'M', name:'Marathon', pct:11, color:ASX.emerald},
    {k:'T', name:'Threshold', pct:8, color:ASX.amber},
    {k:'I', name:'Interval', pct:4, color:ASX.coral},
    {k:'R', name:'Rep', pct:3, color:ASX.violet},
  ];
  const effortDist = [0, 3, 8, 12, 9, 4, 3, 5, 7, 4, 1];
  const maxEffort = Math.max(...effortDist);

  const races = [
    {meet:'Woodbridge XC', date:'Aug 24', dist:'5K', place:'4th', time:'17:56', pace:'5:46', pr:false},
    {meet:'Mt. SAC Invite', date:'Sep 14', dist:'5K', place:'6th', time:'17:42', pace:'5:42', pr:false},
    {meet:'Crystal Springs', date:'Oct 08', dist:'5K', place:'2nd', time:'17:28', pace:'5:38', pr:true},
  ];

  return (
    <div className="asx">
      <ASXStyles />

      {/* Header */}
      <div style={{padding:'52px 18px 14px', background:ASX.white, borderBottom:`1px solid ${ASX.line}`, display:'flex', alignItems:'center', gap:10}}>
        <span style={{fontSize:20, color:ASX.inkSoft}}>‹</span>
        <div style={{flex:1}}>
          <div className="display" style={{fontSize:24, lineHeight:1, fontStyle:'italic'}}>My stats</div>
          <div className="eyebrow" style={{marginTop:4}}>Season VI · Build · 40d to championship</div>
        </div>
        <span style={{padding:'4px 10px', borderRadius:999, background:`${ASX.indigo}14`, color:ASX.indigo, fontSize:11, fontWeight:600}}>VDOT 47.2</span>
      </div>

      <div style={{padding:'14px 14px 110px', display:'flex', flexDirection:'column', gap:12}}>

        {/* 1 · Mileage Volume */}
        <ASXSection n="1" title="Mileage Volume" sub="Week 6 of 11 · Build · 40d to champs" open={open.volume} onToggle={() => toggle('volume')}>
          {/* Phase strip */}
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:14}}>
            {['Base','Build','Peak','Taper'].map(p => (
              <span key={p} style={{padding:'4px 11px', borderRadius:999, fontSize:11, fontWeight:600, background: p==='Build'?ASX.indigo:ASX.paper, color: p==='Build'?'#fff':ASX.mute, border: p==='Build'?'none':`1px solid ${ASX.line}`}}>{p}</span>
            ))}
          </div>
          {/* Volume bars: target ghost + actual */}
          <div style={{display:'flex', alignItems:'flex-end', gap:4, height:96}}>
            {weeks.map((w, i) => {
              const tH = (w.t/maxV)*100;
              const aH = w.a != null ? (w.a/maxV)*100 : 0;
              const ratio = w.a != null ? w.a/w.t : null;
              const col = w.a == null ? ASX.line : ratio>=0.9&&ratio<=1.1 ? ASX.emerald : ratio<0.9 ? ASX.amber : ASX.coral;
              return (
                <div key={i} style={{flex:1, height:'100%', display:'flex', flexDirection:'column', justifyContent:'flex-end', alignItems:'center', position:'relative', borderRadius:4, border: w.now?`1.5px solid ${ASX.indigo}`:'1.5px solid transparent', padding:1}}>
                  <div style={{width:'100%', height:`${tH}%`, position:'absolute', bottom:1, background:ASX.paper2, border:`1px solid ${ASX.line}`, borderRadius:3}}/>
                  {w.a != null && <div style={{width:'100%', height:`${aH}%`, background:col, borderRadius:3, position:'relative', zIndex:1}}/>}
                  {w.now && <div className="mono" style={{position:'absolute', top:-15, fontSize:8, color:ASX.indigo, fontWeight:700}}>NOW</div>}
                </div>
              );
            })}
          </div>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:6}}>
            <span className="mono" style={{fontSize:9, color:ASX.mute}}>W1</span>
            <span className="mono" style={{fontSize:9, color:ASX.mute}}>W11</span>
          </div>
          {/* Summary + legend */}
          <div style={{marginTop:10, fontSize:12.5, color:ASX.inkSoft}}>This week: <b>24.6</b> of 35 mi target <b style={{color:ASX.amber}}>(70%)</b></div>
          <div style={{display:'flex', gap:14, marginTop:10}}>
            {[['Target',ASX.paper2],['On track',ASX.emerald],['Under',ASX.amber],['Over',ASX.coral]].map(([l,c]) => (
              <span key={l} style={{display:'flex', gap:5, alignItems:'center', fontSize:10.5, color:ASX.mute}}>
                <span style={{width:8, height:8, borderRadius:3, background:c, border:c===ASX.paper2?`1px solid ${ASX.line}`:'none'}}/>{l}
              </span>
            ))}
          </div>
        </ASXSection>

        {/* 2 · Easy-Hard Balance */}
        <ASXSection n="2" title="Easy-Hard Balance" sub="Last 30 days · 80/20 compliance" open={open.intensity} onToggle={() => toggle('intensity')}>
          {/* Hero gauge */}
          <div style={{textAlign:'center', marginBottom:12}}>
            <div className="num" style={{fontSize:48, color:ASX.emerald, lineHeight:1}}>94%</div>
            <div style={{fontSize:11.5, color:ASX.mute, marginTop:2}}>Easy running (by pace) <span style={{color:ASX.emerald, fontWeight:600}}>· Precise ✓</span></div>
          </div>
          {/* 4-week trend dots */}
          <div style={{display:'flex', justifyContent:'center', gap:18, marginBottom:16}}>
            {trend.map((p, i) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{width:12, height:12, borderRadius:999, margin:'0 auto', background: p==null?ASX.line : p>=78?ASX.emerald : p>=70?ASX.amber:ASX.coral}}/>
                <div className="mono" style={{fontSize:9, color:ASX.mute, marginTop:4}}>{p!=null?`${p}%`:'—'}</div>
              </div>
            ))}
            <div style={{alignSelf:'center', fontSize:9, color:ASX.mute2}}>← 4wk</div>
          </div>
          {/* Pace zone breakdown */}
          <div className="eyebrow" style={{marginBottom:8}}>Pace zone breakdown</div>
          <div style={{display:'flex', height:12, borderRadius:6, overflow:'hidden', marginBottom:10}}>
            {paceZones.map(z => <div key={z.k} style={{flex:z.pct, background:z.color}}/>)}
          </div>
          {paceZones.map(z => (
            <div key={z.k} style={{display:'flex', alignItems:'center', gap:9, padding:'3px 0'}}>
              <span style={{width:9, height:9, borderRadius:999, background:z.color}}/>
              <span style={{flex:1, fontSize:11.5, color:ASX.inkSoft}}>{z.k} · {z.name}</span>
              <span className="num" style={{fontSize:12}}>{z.pct}%</span>
            </div>
          ))}
          {/* Effort polarization */}
          <div className="eyebrow" style={{marginTop:14, marginBottom:3}}>Effort distribution</div>
          <div style={{fontSize:10.5, color:ASX.mute, marginBottom:8}}>Peaks at 3–4 and 8–9 = polarized (good).</div>
          <div style={{display:'flex', alignItems:'flex-end', gap:4, height:64}}>
            {effortDist.map((v, n) => n===0 ? null : (
              <div key={n} style={{flex:1, textAlign:'center'}}>
                <div style={{height:`${Math.max((v/maxEffort)*54, 3)}px`, background:ASX_EFFORT[n], borderRadius:3}}/>
                <div style={{fontSize:9, color:ASX.mute, marginTop:3}}>{n}</div>
              </div>
            ))}
          </div>
        </ASXSection>

        {/* 3 · Race Performance */}
        <ASXSection n="3" title="Race Performance" sub="3 races this season" open={open.race} onToggle={() => toggle('race')}>
          <div style={{padding:'10px 12px', borderRadius:11, background:`${ASX.pink}0D`, border:`1px solid ${ASX.pink}33`, marginBottom:12}}>
            <div style={{fontSize:13, fontWeight:700}}>🏆 5K PR: 17:28 — Crystal Springs</div>
            <div style={{fontSize:11.5, color:ASX.emerald, fontWeight:600, marginTop:3}}>↓ 0:28 improvement this season</div>
          </div>
          {races.map((r, i) => (
            <div key={i} style={{display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom: i<races.length-1?`1px solid ${ASX.line}`:'none'}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13, fontWeight:600}}>{r.meet}</div>
                <div style={{fontSize:10.5, color:ASX.mute, marginTop:1}}>{r.date} · {r.dist} · {r.place}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div className="num" style={{fontSize:17, color: r.pr?ASX.pink:ASX.ink}}>{r.time}</div>
                <div className="mono" style={{fontSize:10, color:ASX.mute}}>{r.pace}/mi {r.pr && <span style={{color:ASX.pink, fontWeight:700}}>▼PR</span>}</div>
              </div>
            </div>
          ))}
        </ASXSection>

        {/* 4 · Readiness & Recovery */}
        <ASXSection n="4" title="Readiness & Recovery" sub="Based on last 7 days" open={open.readiness} onToggle={() => toggle('readiness')}>
          <div style={{display:'flex', gap:16, alignItems:'center', marginBottom:14}}>
            <ASXRing value={7.4} />
            <div style={{flex:1}}>
              <ASXGauge label="Sleep" v={3.6} color={ASX.amber}/>
              <ASXGauge label="Legs" v={4.1} color={ASX.emerald}/>
              <ASXGauge label="Mood" v={4.9} color={ASX.indigo}/>
            </div>
          </div>
          <div style={{fontSize:12, color:ASX.inkSoft, marginBottom:8}}>Weekly load: <b>24.6 mi</b> · 3-wk avg 22.1 <span style={{color:ASX.amber}}>(+11%)</span></div>
          <div style={{padding:'10px 12px', borderRadius:10, background:`${ASX.amber}10`}}>
            <div style={{fontSize:11.5, fontWeight:700, color:ASX.amber, marginBottom:4}}>⚠️ Watch out</div>
            <div style={{fontSize:11, color:ASX.inkSoft, lineHeight:1.5}}>• Sleep trending low (3.6/5)<br/>• Load up 11% vs 3-week average</div>
          </div>
        </ASXSection>

        {/* 5 · Season in Review */}
        <div className="card" style={{padding:16}}>
          <div style={{display:'flex', gap:11, alignItems:'flex-start', marginBottom:12}}>
            <span style={{width:26, height:26, borderRadius:999, background:`${ASX.indigo}14`, color:ASX.indigo, display:'grid', placeItems:'center', fontSize:12, fontWeight:700}}>5</span>
            <div>
              <div style={{fontSize:14, fontWeight:600}}>Season in Review</div>
              <div className="eyebrow" style={{marginTop:2}}>Tap a season to see your recap</div>
            </div>
          </div>
          {[
            {name:'Fall \u201925 · Cross Country', date:'Aug – Nov 2025', icon:'🏔️'},
            {name:'Spring \u201925 · Outdoor Track', date:'Mar – May 2025', icon:'🏃'},
            {name:'Fall \u201924 · Cross Country', date:'Aug – Nov 2024', icon:'🏔️'},
          ].map((s, i) => (
            <div key={i} style={{display:'flex', gap:11, alignItems:'center', padding:'10px 0', borderBottom: i<2?`1px solid ${ASX.line}`:'none'}}>
              <span style={{fontSize:22}}>{s.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13, fontWeight:600}}>{s.name}</div>
                <div style={{fontSize:10.5, color:ASX.mute, marginTop:1}}>{s.date}</div>
              </div>
              <span style={{color:ASX.mute2, fontSize:18}}>›</span>
            </div>
          ))}
        </div>
      </div>

      <ASXTabBar active="stats" />
    </div>
  );
}

function ASXSection({n, title, sub, open, onToggle, children}) {
  return (
    <div className="card" style={{padding:0, overflow:'hidden'}}>
      <button onClick={onToggle} style={{width:'100%', display:'flex', gap:11, alignItems:'center', padding:16, background:'transparent', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit'}}>
        <span style={{width:26, height:26, borderRadius:999, background:`${ASX.indigo}14`, color:ASX.indigo, display:'grid', placeItems:'center', fontSize:12, fontWeight:700, flexShrink:0}}>{n}</span>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:14, fontWeight:600}}>{title}</div>
          <div className="eyebrow" style={{marginTop:2}}>{sub}</div>
        </div>
        <span style={{color:ASX.mute2, fontSize:13, transform: open?'rotate(180deg)':'none'}}>▾</span>
      </button>
      {open && <div style={{padding:'0 16px 16px'}}>{children}</div>}
    </div>
  );
}

function ASXRing({value}) {
  const pct = value/10, r=30, c=2*Math.PI*r;
  const color = value<4?ASX.coral:value<7?ASX.amber:ASX.emerald;
  return (
    <div style={{width:76, height:76, position:'relative', flexShrink:0}}>
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} stroke={ASX.line} strokeWidth="6" fill="none"/>
        <circle cx="38" cy="38" r={r} stroke={color} strokeWidth="6" fill="none" strokeDasharray={c} strokeDashoffset={c*(1-pct)} transform="rotate(-90 38 38)" strokeLinecap="round"/>
      </svg>
      <div style={{position:'absolute', inset:0, display:'grid', placeItems:'center'}}>
        <div style={{textAlign:'center'}}>
          <div className="num" style={{fontSize:19, lineHeight:1}}>{value}</div>
          <div style={{fontSize:8, color:ASX.mute, letterSpacing:'0.1em'}}>/ 10</div>
        </div>
      </div>
    </div>
  );
}

function ASXGauge({label, v, color}) {
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:3}}>
        <span style={{fontSize:11.5, color:ASX.inkSoft, fontWeight:500}}>{label}</span>
        <span className="num" style={{fontSize:11.5}}>{v.toFixed(1)}<span style={{color:ASX.mute}}>/5</span></span>
      </div>
      <div style={{height:5, background:ASX.line, borderRadius:999, overflow:'hidden'}}>
        <div style={{height:'100%', width:`${(v/5)*100}%`, background:color}}/>
      </div>
    </div>
  );
}

function ASXTabBar({active}) {
  const tabs = [['home','Home'],['log','Log'],['calendar','Calendar'],['stats','Stats'],['feed','Feed']];
  return (
    <div style={{position:'absolute', bottom:0, left:0, right:0, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderTop:`1px solid ${ASX.line}`, padding:'10px 8px 22px', display:'flex', justifyContent:'space-around'}}>
      {tabs.map(([id,l]) => (
        <div key={id} style={{textAlign:'center'}}>
          <div style={{fontSize:11, fontWeight:600, color: active===id ? ASX.indigo : ASX.mute2}}>{l}</div>
          {active===id && <div style={{margin:'4px auto 0', width:4, height:4, borderRadius:999, background:ASX.indigo}}/>}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { AthleteStatsFaithful });
