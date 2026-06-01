/* global React */
// TeamBase — Team Calendar (Direction D · Signal), faithful to screens/CalendarScreen.js
// Month grid (multi-dot) + legend + selected-day items/runs + Upcoming.

const CLX = {
  white:'#FFFFFF', paper:'#FAFBFC', paper2:'#F4F5F7', line:'#E6E8EC',
  ink:'#0B0D12', inkSoft:'#2A2E38', mute:'#6B7280', mute2:'#9AA0AB',
  indigo:'#4F46E5', violet:'#7C3AED', pink:'#EC4899', coral:'#FB7185',
  amber:'#F59E0B', lime:'#84CC16', emerald:'#10B981', cyan:'#06B6D4',
};
// Workout/event type → color (mirrors training.js TYPE_COLORS, Direction D hues)
const CLX_TYPE = {
  Easy:'#84CC16', Tempo:'#F59E0B', 'Long Run':'#06B6D4', Intervals:'#7C3AED',
  Speed:'#EC4899', Recovery:'#9AA0AB', 'Time Trial':'#FB7185',
  Race:'#DC2626', 'Team Meeting':'#0EA5E9', 'Team Party':'#F59E0B',
};
const CLX_RUN = '#9AA0AB';

// April 2026 events keyed by day-of-month
const CLX_EVENTS = {
  2:[{type:'Tempo'}], 4:[{type:'Intervals'}], 6:[{type:'Long Run'},{type:'Team Meeting'}],
  9:[{type:'Tempo'}], 11:[{type:'Intervals'}], 13:[{type:'Long Run'}], 15:[{type:'Easy'}],
  18:[{type:'Intervals'}], 20:[{type:'Long Run'}],
  22:[{type:'Tempo'}], 24:[{type:'Tempo'}], 25:[{type:'Long Run'}],
  28:[{type:'Intervals'}], 30:[{type:'Race'}],
};
// athlete's own logged runs (gray dot)
const CLX_RUNS = { 1:true,2:true,4:true,6:true,8:true,9:true,11:true,13:true,15:true,18:true,20:true,21:true,22:true };

function CLXStyles() {
  return <style>{`
    .clx { font-family:'Inter Tight', sans-serif; color:${CLX.ink}; letter-spacing:-0.01em; height:100%; overflow:auto; background:${CLX.paper2}; }
    .clx .display { font-family:'Instrument Serif', serif; letter-spacing:-0.02em; }
    .clx .mono { font-family:'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
    .clx .num { font-family:'Inter Tight', sans-serif; font-variant-numeric:tabular-nums; letter-spacing:-0.03em; font-weight:600; }
    .clx .eyebrow { font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:${CLX.mute}; font-weight:500; }
    .clx .card { background:${CLX.white}; border:1px solid ${CLX.line}; border-radius:16px; }
  `}</style>;
}

function CalendarFaithful() {
  const [sel, setSel] = React.useState(22);

  // April 2026: Apr 1 = Wednesday → 3 leading blanks (Sun-first grid)
  const leading = 3, days = 30;
  const cells = [];
  for (let i=0;i<leading;i++) cells.push(null);
  for (let d=1;d<=days;d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const dow = (d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][(d-1+3)%7];
  const selEvents = CLX_EVENTS[sel] || [];
  const TITLES = { Easy:'Easy Run', Tempo:'Tempo Run', 'Long Run':'Long Run', Intervals:'Mile Repeats', Race:'League Championships', 'Team Meeting':'Team Meeting' };
  const PACES = { Easy:'8:41–10:23/mi', Tempo:'7:02–7:28/mi', 'Long Run':'8:50–9:40/mi', Intervals:'5:38/mi (R)' };
  const MILES = { Easy:'6', Tempo:'6', 'Long Run':'10', Intervals:'8×400m' };

  // upcoming (after Apr 22)
  const upcoming = Object.keys(CLX_EVENTS).map(Number).filter(d => d > 22).sort((a,b)=>a-b)
    .flatMap(d => CLX_EVENTS[d].map(e => ({ d, ...e })));

  return (
    <div className="clx">
      <CLXStyles />

      {/* Header */}
      <div style={{padding:'52px 18px 14px', background:CLX.white, borderBottom:`1px solid ${CLX.line}`, display:'flex', alignItems:'center', gap:10}}>
        <span style={{fontSize:20, color:CLX.inkSoft}}>‹</span>
        <div style={{flex:1}}>
          <div className="display" style={{fontSize:24, lineHeight:1, fontStyle:'italic'}}>Team calendar</div>
          <div className="eyebrow" style={{marginTop:3}}>Davis HS · April 2026</div>
        </div>
        <button style={{padding:'7px 13px', borderRadius:10, background:CLX.ink, color:'#fff', border:'none', fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>+ Add</button>
      </div>

      <div style={{padding:'14px 14px 110px'}}>
        {/* Month grid */}
        <div className="card" style={{padding:'14px 12px'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 4px 10px'}}>
            <span className="display" style={{fontSize:20, fontStyle:'italic'}}>April</span>
            <div style={{display:'flex', gap:14, color:CLX.mute2}}>
              <span style={{cursor:'pointer'}}>‹</span><span style={{cursor:'pointer'}}>›</span>
            </div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:2, marginBottom:4}}>
            {['S','M','T','W','T','F','S'].map((d,i) => <div key={i} style={{textAlign:'center', fontSize:10, color:CLX.mute2, fontWeight:600}}>{d}</div>)}
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:2}}>
            {cells.map((d, i) => {
              if (d == null) return <div key={i} style={{height:46}}/>;
              const evs = CLX_EVENTS[d] || [];
              const hasRun = CLX_RUNS[d];
              const isSel = d === sel;
              const isToday = d === 22;
              return (
                <button key={i} onClick={() => setSel(d)} style={{height:46, borderRadius:9, border:'none', cursor:'pointer', background: isSel?CLX.indigo:'transparent', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, fontFamily:'inherit', padding:0}}>
                  <span className="num" style={{fontSize:13, color: isSel?'#fff':(isToday?CLX.indigo:CLX.ink), fontWeight: isToday||isSel?700:600}}>{d}</span>
                  <div style={{display:'flex', gap:2, height:5, alignItems:'center'}}>
                    {evs.slice(0,3).map((e, j) => <span key={j} style={{width:5, height:5, borderRadius:999, background: isSel?'#fff':(CLX_TYPE[e.type]||CLX.indigo)}}/>)}
                    {hasRun && <span style={{width:5, height:5, borderRadius:999, background: isSel?'rgba(255,255,255,0.6)':CLX_RUN}}/>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div style={{display:'flex', gap:12, overflowX:'auto', padding:'12px 4px 2px'}}>
          {Object.entries({Easy:CLX_TYPE.Easy, Tempo:CLX_TYPE.Tempo, 'Long Run':CLX_TYPE['Long Run'], Intervals:CLX_TYPE.Intervals, Race:CLX_TYPE.Race, 'My run':CLX_RUN}).map(([l,c]) => (
            <span key={l} style={{display:'flex', gap:5, alignItems:'center', fontSize:10.5, color:CLX.mute, whiteSpace:'nowrap'}}>
              <span style={{width:7, height:7, borderRadius:999, background:c}}/>{l}
            </span>
          ))}
        </div>

        {/* Selected day */}
        <div style={{marginTop:14}}>
          <div className="eyebrow" style={{paddingLeft:4, marginBottom:8}}>{dow(sel)}, April {sel}</div>
          {selEvents.length === 0 ? (
            <div className="card" style={{padding:'18px 16px', textAlign:'center'}}>
              <div style={{fontSize:12.5, color:CLX.mute}}>No items on this day.</div>
              <button style={{marginTop:10, padding:'8px 14px', borderRadius:10, border:`1px solid ${CLX.indigo}`, background:'transparent', color:CLX.indigo, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>+ Add item</button>
            </div>
          ) : (
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              {selEvents.map((e, i) => {
                const c = CLX_TYPE[e.type] || CLX.indigo;
                return (
                  <div key={i} className="card" style={{padding:13, display:'flex', gap:12, alignItems:'center', borderLeft:`3px solid ${c}`}}>
                    <span style={{display:'inline-flex', gap:5, alignItems:'center', padding:'3px 9px', borderRadius:999, background:`${c}1A`, color:c, fontSize:11, fontWeight:600, flexShrink:0}}>
                      <span style={{width:5, height:5, borderRadius:999, background:c}}/>{e.type}
                    </span>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:13.5, fontWeight:600}}>{TITLES[e.type]||e.type}{MILES[e.type] && <span style={{color:CLX.mute, fontWeight:500}}> — {MILES[e.type]} mi</span>}</div>
                      {PACES[e.type] && <div className="mono" style={{fontSize:11, color:CLX.indigo, marginTop:2}}>Target {PACES[e.type]}</div>}
                    </div>
                    <span style={{color:CLX.mute2, fontSize:18}}>›</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* My logged runs for this day */}
          {CLX_RUNS[sel] && (
            <div style={{marginTop:12}}>
              <div className="eyebrow" style={{paddingLeft:4, marginBottom:8}}>My logged runs</div>
              <div className="card" style={{padding:13, display:'flex', gap:12, alignItems:'center'}}>
                <span style={{width:8, height:8, borderRadius:999, background:CLX_RUN, flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div className="num" style={{fontSize:14}}>6.0 miles</div>
                  <div className="mono" style={{fontSize:11, color:CLX.mute, marginTop:1}}>48:12 · 142 bpm</div>
                </div>
                <span style={{fontSize:12, color:CLX.emerald, fontWeight:600}}>Effort 4/10</span>
                <span style={{color:CLX.mute2, fontSize:16}}>›</span>
              </div>
            </div>
          )}
        </div>

        {/* Upcoming */}
        <div style={{marginTop:22}}>
          <h2 className="display" style={{fontSize:22, margin:'0 0 10px', paddingLeft:4, fontStyle:'italic'}}>Upcoming ({upcoming.length})</h2>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            {upcoming.map((e, i) => {
              const c = CLX_TYPE[e.type] || CLX.indigo;
              return (
                <div key={i} className="card" style={{padding:'12px 14px', display:'flex', gap:11, alignItems:'center'}}>
                  <div style={{width:42, textAlign:'center', flexShrink:0}}>
                    <div style={{fontSize:9.5, color:CLX.mute2, fontWeight:600, textTransform:'uppercase'}}>{dow(e.d)}</div>
                    <div className="num" style={{fontSize:17}}>{e.d}</div>
                  </div>
                  <div style={{width:1, alignSelf:'stretch', background:CLX.line}}/>
                  <span style={{display:'inline-flex', gap:5, alignItems:'center', padding:'3px 9px', borderRadius:999, background:`${c}1A`, color:c, fontSize:11, fontWeight:600, flexShrink:0}}>
                    <span style={{width:5, height:5, borderRadius:999, background:c}}/>{e.type}
                  </span>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:600}}>{TITLES[e.type]||e.type}</div>
                  </div>
                  <span style={{color:CLX.mute2, fontSize:18}}>›</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <CLXTabBar active="calendar" />
    </div>
  );
}

function CLXTabBar({active}) {
  const tabs = [['home','Home'],['log','Log'],['calendar','Calendar'],['stats','Stats'],['feed','Feed']];
  return (
    <div style={{position:'absolute', bottom:0, left:0, right:0, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderTop:`1px solid ${CLX.line}`, padding:'10px 8px 22px', display:'flex', justifyContent:'space-around'}}>
      {tabs.map(([id,l]) => (
        <div key={id} style={{textAlign:'center'}}>
          <div style={{fontSize:11, fontWeight:600, color: active===id ? CLX.indigo : CLX.mute2}}>{l}</div>
          {active===id && <div style={{margin:'4px auto 0', width:4, height:4, borderRadius:999, background:CLX.indigo}}/>}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { CalendarFaithful });
