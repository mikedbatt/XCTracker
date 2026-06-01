/* global React */
// TeamBase — Coach Analytics (Direction D · Signal), faithful to screens/CoachAnalytics.js
// Two tabs: Training Analytics (6 expandable sections) + Race Analytics (pack spread).

const CAX = {
  white:'#FFFFFF', paper:'#FAFBFC', paper2:'#F4F5F7', line:'#E6E8EC',
  ink:'#0B0D12', inkSoft:'#2A2E38', mute:'#6B7280', mute2:'#9AA0AB',
  indigo:'#4F46E5', violet:'#7C3AED', pink:'#EC4899', coral:'#FB7185',
  amber:'#F59E0B', lime:'#84CC16', emerald:'#10B981', cyan:'#06B6D4',
};

const CAX_ATH = [
  {f:'Mia',l:'Laurent',c:'#EC4899',w:[31,33,32],tgt:35,st:'on',easy:96,sleep:4.2,legs:4.4,mood:4.6,att:[12,12,0,0]},
  {f:'Diego',l:'Alvarez',c:'#06B6D4',w:[28,29,30],tgt:30,st:'on',easy:95,sleep:4.0,legs:4.1,mood:4.3,att:[11,12,1,0]},
  {f:'Sam',l:'Okafor',c:'#F59E0B',w:[18,17,12],tgt:22,st:'under',easy:64,sleep:2.4,legs:3.1,mood:3.0,att:[8,12,3,1]},
  {f:'Noah',l:'Reyes',c:'#FB7185',w:[5,6,11],tgt:18,st:'over',easy:78,sleep:3.6,legs:3.8,mood:4.0,att:[10,11,1,0]},
  {f:'Ben',l:'Stern',c:'#F59E0B',w:[19,20,19],tgt:24,st:'under',easy:58,sleep:3.2,legs:3.4,mood:3.6,att:[9,12,2,1]},
];

function CAXStyles() {
  return <style>{`
    .cax { font-family:'Inter Tight', sans-serif; color:${CAX.ink}; letter-spacing:-0.01em; height:100%; overflow:auto; background:${CAX.paper2}; }
    .cax .display { font-family:'Instrument Serif', serif; letter-spacing:-0.02em; }
    .cax .mono { font-family:'JetBrains Mono', monospace; font-variant-numeric:tabular-nums; }
    .cax .num { font-family:'Inter Tight', sans-serif; font-variant-numeric:tabular-nums; letter-spacing:-0.03em; font-weight:600; }
    .cax .eyebrow { font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:${CAX.mute}; font-weight:500; }
    .cax .card { background:${CAX.white}; border:1px solid ${CAX.line}; border-radius:16px; }
  `}</style>;
}

function CoachAnalyticsFaithful() {
  const [tab, setTab] = React.useState('training');
  const [open, setOpen] = React.useState({ vol:true, intensity:false, load:false, att:false, pack:true, well:false });
  const [packG, setPackG] = React.useState('boys');
  const toggle = (k) => setOpen(s => ({ ...s, [k]: !s[k] }));

  return (
    <div className="cax">
      <CAXStyles />

      {/* Header */}
      <div style={{background:CAX.white, borderBottom:`1px solid ${CAX.line}`}}>
        <div style={{padding:'52px 18px 12px', display:'flex', alignItems:'center', gap:10}}>
          <span style={{fontSize:20, color:CAX.inkSoft}}>‹</span>
          <div style={{flex:1}}>
            <div className="display" style={{fontSize:24, lineHeight:1, fontStyle:'italic'}}>Team analytics</div>
            <div className="eyebrow" style={{marginTop:3}}>Varsity XC · 22 athletes · Fall '25</div>
          </div>
        </div>
        {/* Tabs */}
        <div style={{display:'flex', padding:'0 8px'}}>
          {[['training','Training'],['race','Race']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{flex:1, padding:'11px 0', background:'transparent', border:'none', borderBottom: tab===k?`2px solid ${CAX.indigo}`:'2px solid transparent', color: tab===k?CAX.indigo:CAX.mute, fontSize:13.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>{l} Analytics</button>
          ))}
        </div>
      </div>

      {tab === 'training' ? (
        <div style={{padding:'14px 14px 110px', display:'flex', flexDirection:'column', gap:12}}>

          {/* 1 · Mileage Compliance */}
          <CAXSection n="1" title="Mileage Compliance" sub="Last 3 weeks vs target" open={open.vol} onToggle={() => toggle('vol')}
            summary={<CAXSummary cells={[['3','Under',CAX.amber],['8','On target',CAX.emerald],['1','Over',CAX.coral]]} />}>
            {CAX_ATH.filter(a => a.st!=='on').map(a => <CAXVolRow key={a.f} a={a} />)}
          </CAXSection>

          {/* 2 · Easy-Hard Balance */}
          <CAXSection n="2" title="Easy-Hard Balance" sub="Is the team running easy enough?" open={open.intensity} onToggle={() => toggle('intensity')}
            summary={<div style={{display:'flex', alignItems:'baseline', gap:10, marginTop:10}}>
              <span className="num" style={{fontSize:30, color:CAX.emerald}}>82%</span>
              <span style={{fontSize:11.5, color:CAX.mute}}>team avg easy · <b>2 too hard</b>, 1 needs paces</span>
            </div>}>
            <CAXGroupLabel color={CAX.coral}>Too hard (easy &lt; 68%)</CAXGroupLabel>
            {CAX_ATH.filter(a => a.easy<68).map(a => <CAXEasyRow key={a.f} a={a} tone={CAX.coral}/>)}
            <CAXGroupLabel color={CAX.emerald} style={{marginTop:10}}>On target (≥ 78%)</CAXGroupLabel>
            {CAX_ATH.filter(a => a.easy>=78).map(a => <CAXEasyRow key={a.f} a={a} tone={CAX.emerald}/>)}
          </CAXSection>

          {/* 3 · Load & Injury Risk */}
          <CAXSection n="3" title="Load & Injury Risk" sub="Last wk vs prior 2-wk avg" open={open.load} onToggle={() => toggle('load')}
            summary={<CAXSummary cells={[['2','At risk',CAX.coral]]} />}>
            {CAX_ATH.filter(a => a.st==='over' || a.easy<60).map(a => {
              const prior = ((a.w[0]+a.w[1])/2);
              const chg = Math.round(((a.w[2]-prior)/prior)*100);
              return (
                <div key={a.f} style={{display:'flex', gap:10, padding:'9px 0', borderBottom:`1px solid ${CAX.line}`, alignItems:'flex-start'}}>
                  <CAXAvatar a={a} size={28}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13, fontWeight:600}}>{a.f} {a.l}</div>
                    <div style={{fontSize:10.5, color:CAX.mute, marginTop:1}}>Last wk {a.w[2]} mi (prior {prior.toFixed(0)}){chg>15?` · ${chg}% up`:''}</div>
                    <div style={{fontSize:10.5, color:CAX.coral, marginTop:2}}>• ACWR spike vs adapted baseline</div>
                  </div>
                </div>
              );
            })}
          </CAXSection>

          {/* 4 · Attendance */}
          <CAXSection n="4" title="Attendance" sub="Last 30 days · 12 practice days" open={open.att} onToggle={() => toggle('att')}
            summary={<CAXSummary cells={[['91%','Team rate',CAX.emerald],['2','< 90%',CAX.amber]]} />}>
            {CAX_ATH.map(a => {
              const [pres,total,abs,exc] = a.att;
              const rate = Math.round((pres/total)*100);
              const col = rate>=90?CAX.emerald:rate>=75?CAX.amber:CAX.coral;
              return (
                <div key={a.f} style={{display:'flex', gap:10, padding:'8px 0', borderBottom:`1px solid ${CAX.line}`, alignItems:'center'}}>
                  <CAXAvatar a={a} size={28}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13, fontWeight:600}}>{a.f} {a.l}</div>
                    <div style={{fontSize:10.5, color:CAX.mute, marginTop:1}}><b style={{color:col}}>{rate}%</b> · {pres}/{total} present{abs>0?` · ${abs} absent`:''}{exc>0?` · ${exc} excused`:''}</div>
                  </div>
                </div>
              );
            })}
          </CAXSection>

          {/* 5 · Pack Compression */}
          <CAXSection n="5" title="Pack Compression" sub="Top 5 spread & bench depth" open={open.pack} onToggle={() => toggle('pack')}
            summary={<div style={{display:'flex', gap:20, marginTop:10}}>
              <div><div className="eyebrow" style={{fontSize:9}}>Boys top 5</div><div className="num" style={{fontSize:22, color:CAX.indigo}}>1:42</div></div>
              <div><div className="eyebrow" style={{fontSize:9}}>Girls top 5</div><div className="num" style={{fontSize:22, color:CAX.indigo}}>2:08</div></div>
            </div>}>
            <div style={{display:'flex', gap:6, marginBottom:12}}>
              {[['boys','Boys'],['girls','Girls']].map(([k,l]) => (
                <button key={k} onClick={() => setPackG(k)} style={{padding:'5px 14px', borderRadius:8, border:packG===k?'none':`1px solid ${CAX.line}`, background:packG===k?CAX.indigo:CAX.white, color:packG===k?'#fff':CAX.inkSoft, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>{l}</button>
              ))}
            </div>
            <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:10}}>
              <span className="num" style={{fontSize:20, color:CAX.indigo}}>{packG==='boys'?'1:42':'2:08'}</span>
              <span style={{fontSize:11.5, color:CAX.mute}}>spread #1–#5</span>
            </div>
            {/* Top runners mileage bars */}
            {(packG==='boys'
              ? [['Diego A.',30.1,1],['Train B.',24.6,1],['Eli W.',27.8,1],['Ben S.',19.4,1],['Noah R.',11,1],['Owen K.',16,0],['Will P.',14,0]]
              : [['Mia L.',32.4,1],['Ava C.',28.9,1],['Sophie P.',26,1],['Lily N.',21.5,1],['Grace R.',12,1],['Tess M.',15,0]]
            ).map(([nm, mi, top5], i) => (
              <div key={nm} style={{display:'flex', alignItems:'center', gap:9, padding:'5px 0'}}>
                <span className="mono" style={{fontSize:10, color: top5?CAX.mute:CAX.mute2, width:20}}>#{i+1}</span>
                <span style={{fontSize:12, flex:'0 0 64px', color: top5?CAX.ink:CAX.mute}}>{nm}</span>
                <div style={{flex:1, height:7, background:CAX.line, borderRadius:999, overflow:'hidden'}}>
                  <div style={{height:'100%', width:`${(mi/35)*100}%`, background: top5?CAX.indigo:CAX.mute2}}/>
                </div>
                <span className="num" style={{fontSize:11, width:34, textAlign:'right', color: top5?CAX.ink:CAX.mute}}>{mi.toFixed(1)}</span>
              </div>
            ))}
            <div style={{fontSize:10.5, color:CAX.mute, marginTop:6}}>Faded = bench (#6+). Tighter top-5 spread = stronger scoring pack.</div>
          </CAXSection>

          {/* 6 · Wellness & Readiness */}
          <CAXSection n="6" title="Wellness & Readiness" sub="Last 7 days · 18/22 reporting" open={open.well} onToggle={() => toggle('well')}
            summary={<div style={{display:'flex', gap:14, marginTop:10}}>
              {[['😴','Sleep',3.8],['🦵','Legs',4.0],['😊','Mood',4.3]].map(([e,l,v]) => (
                <div key={l} style={{display:'flex', alignItems:'center', gap:5}}>
                  <span style={{fontSize:14}}>{e}</span>
                  <span className="num" style={{fontSize:15}}>{v}</span>
                  <span style={{fontSize:10, color:CAX.mute}}>{l}</span>
                </div>
              ))}
            </div>}>
            <div style={{padding:'10px 12px', borderRadius:10, background:`${CAX.coral}0D`, marginBottom:10}}>
              <div style={{fontSize:11.5, fontWeight:700, color:CAX.coral, marginBottom:4}}>🩹 Active injuries this week</div>
              <div style={{fontSize:11, color:CAX.inkSoft}}>Jordan P. — Knee (moderate) · 3 of 7d</div>
            </div>
            {CAX_ATH.map(a => {
              const concern = a.sleep<2.5 || a.legs<2.5;
              return (
                <div key={a.f} style={{display:'flex', gap:10, padding:'8px 0', borderBottom:`1px solid ${CAX.line}`, alignItems:'center', background: concern?`${CAX.coral}08`:'transparent', borderRadius: concern?8:0, paddingLeft: concern?6:0}}>
                  <CAXAvatar a={a} size={28}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13, fontWeight:600}}>{a.f} {a.l}</div>
                    {concern && <div style={{fontSize:10, color:CAX.coral, marginTop:1}}>• Poor sleep</div>}
                  </div>
                  <div style={{display:'flex', gap:8}}>
                    <span style={{fontSize:11, fontWeight:700, color: a.sleep<2.5?CAX.coral:a.sleep<3.5?CAX.amber:CAX.emerald}}>😴 {a.sleep.toFixed(1)}</span>
                    <span style={{fontSize:11, fontWeight:700, color: a.legs<2.5?CAX.coral:a.legs<3.5?CAX.amber:CAX.emerald}}>🦵 {a.legs.toFixed(1)}</span>
                    <span style={{fontSize:11, fontWeight:700, color: a.mood<2.5?CAX.coral:a.mood<3.5?CAX.amber:CAX.emerald}}>😊 {a.mood.toFixed(1)}</span>
                  </div>
                </div>
              );
            })}
          </CAXSection>

          {/* Season in review */}
          <div className="card" style={{padding:16}}>
            <div style={{fontSize:14, fontWeight:600, marginBottom:10}}>Season in Review</div>
            {[['🏔️','Fall \u201925 · Cross Country','Aug – Nov 2025'],['🏃','Spring \u201925 · Outdoor Track','Mar – May 2025']].map(([ic,nm,dt], i) => (
              <div key={i} style={{display:'flex', gap:11, alignItems:'center', padding:'9px 0', borderBottom: i<1?`1px solid ${CAX.line}`:'none'}}>
                <span style={{fontSize:20}}>{ic}</span>
                <div style={{flex:1}}><div style={{fontSize:13, fontWeight:600}}>{nm}</div><div style={{fontSize:10.5, color:CAX.mute, marginTop:1}}>{dt}</div></div>
                <span style={{color:CAX.mute2, fontSize:18}}>›</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ── Race Analytics tab ── */
        <div style={{padding:'14px 14px 110px', display:'flex', flexDirection:'column', gap:12}}>
          {/* Season overview */}
          <div className="card" style={{padding:16}}>
            <div style={{display:'flex', gap:11, alignItems:'flex-start', marginBottom:12}}>
              <span style={{width:26, height:26, borderRadius:999, background:`${CAX.indigo}14`, color:CAX.indigo, display:'grid', placeItems:'center', fontSize:12, fontWeight:700}}>3</span>
              <div><div style={{fontSize:14, fontWeight:600}}>Races with Results</div><div className="eyebrow" style={{marginTop:2}}>Season pack spread trend</div></div>
            </div>
            <div style={{display:'flex', gap:10}}>
              <div style={{flex:1, padding:14, borderRadius:12, background:`${CAX.emerald}0D`, textAlign:'center'}}>
                <div className="num" style={{fontSize:24, color:CAX.emerald}}>↓ 0:14</div>
                <div style={{fontSize:10.5, color:CAX.mute, marginTop:2}}>Spread change</div>
              </div>
              <div style={{flex:1, padding:14, borderRadius:12, background:`${CAX.indigo}0D`, textAlign:'center'}}>
                <div className="num" style={{fontSize:24, color:CAX.indigo}}>1:42</div>
                <div style={{fontSize:10.5, color:CAX.mute, marginTop:2}}>Current 1–5 spread</div>
              </div>
            </div>
          </div>

          {/* Per-race breakdown */}
          {[
            {meet:'Crystal Springs', race:'Varsity Boys 5K', date:'Oct 08', spread:'1:42', avg:'17:51', score:42, r6:'Owen K. (+0:18)', r7:'Will P. (+0:31)'},
            {meet:'Mt. SAC Invite', race:'Varsity Boys 5K', date:'Sep 14', spread:'1:48', avg:'18:04', score:51, r6:'Owen K. (+0:22)', r7:'Will P. (+0:38)'},
            {meet:'Woodbridge', race:'Varsity Boys 5K', date:'Aug 24', spread:'1:56', avg:'18:20', score:58, r6:'Sam O. (+0:26)', r7:'Will P. (+0:44)'},
          ].map((ra, i) => (
            <div key={i} className="card" style={{padding:16}}>
              <div style={{fontSize:14, fontWeight:600}}>{ra.meet}</div>
              <div className="eyebrow" style={{marginTop:2}}>{ra.race} · {ra.date}</div>
              <div style={{display:'flex', gap:8, marginTop:12}}>
                {[['1–5 Spread',ra.spread],['Team Avg',ra.avg],['Score',ra.score]].map(([l,v]) => (
                  <div key={l} style={{flex:1, padding:'10px 8px', borderRadius:10, background:CAX.paper2, textAlign:'center'}}>
                    <div className="num" style={{fontSize:16}}>{v}</div>
                    <div style={{fontSize:9.5, color:CAX.mute, marginTop:2}}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:11, color:CAX.mute, marginTop:10}}>#6 {ra.r6} · #7 {ra.r7}</div>
            </div>
          ))}
        </div>
      )}

      <CAXTabBar active="analytics" />
    </div>
  );
}

function CAXSection({n, title, sub, open, onToggle, summary, children}) {
  return (
    <div className="card" style={{padding:0, overflow:'hidden'}}>
      <button onClick={onToggle} style={{width:'100%', display:'block', padding:16, background:'transparent', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit'}}>
        <div style={{display:'flex', gap:11, alignItems:'center'}}>
          <span style={{width:26, height:26, borderRadius:999, background:`${CAX.indigo}14`, color:CAX.indigo, display:'grid', placeItems:'center', fontSize:12, fontWeight:700, flexShrink:0}}>{n}</span>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:14, fontWeight:600}}>{title}</div>
            <div className="eyebrow" style={{marginTop:2}}>{sub}</div>
          </div>
          <span style={{color:CAX.mute2, fontSize:13, transform: open?'rotate(180deg)':'none'}}>▾</span>
        </div>
        {summary}
      </button>
      {open && <div style={{padding:'0 16px 16px'}}>{children}</div>}
    </div>
  );
}

function CAXSummary({cells}) {
  return (
    <div style={{display:'flex', gap:8, marginTop:12}}>
      {cells.map(([num, label, color]) => (
        <div key={label} style={{flex:1, padding:'10px 6px', borderRadius:10, background:`${color}12`, textAlign:'center'}}>
          <div className="num" style={{fontSize:20, color}}>{num}</div>
          <div style={{fontSize:10, color:CAX.mute, marginTop:1}}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function CAXGroupLabel({color, children, style}) {
  return <div style={{fontSize:10.5, fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase', color, marginBottom:6, ...style}}>{children}</div>;
}

function CAXAvatar({a, size=28}) {
  return <div style={{width:size, height:size, borderRadius:999, background:a.c, color:'#fff', display:'grid', placeItems:'center', fontSize:size*0.36, fontWeight:700, flexShrink:0}}>{a.f[0]}{a.l[0]}</div>;
}

function CAXVolRow({a}) {
  const dots = [{l:'3w',m:a.w[0]},{l:'2w',m:a.w[1]},{l:'1w',m:a.w[2]}];
  const dStatus = (m) => { const r=m/a.tgt; return r>=0.9&&r<=1.12?'on':r<0.9?'under':'over'; };
  const icon = {on:'✓',under:'↓',over:'↑'}, col = {on:CAX.emerald,under:CAX.amber,over:CAX.coral};
  return (
    <div style={{display:'flex', gap:10, alignItems:'center', padding:'9px 0', borderBottom:`1px solid ${CAX.line}`}}>
      <CAXAvatar a={a}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:600}}>{a.f} {a.l}</div>
        <div style={{fontSize:10.5, color:CAX.mute, marginTop:1}}>Target {a.tgt} mi/wk</div>
      </div>
      <div style={{display:'flex', gap:8}}>
        {dots.map(d => { const s=dStatus(d.m); return (
          <div key={d.l} style={{textAlign:'center', minWidth:24}}>
            <div className="num" style={{fontSize:11.5, color:col[s]}}>{icon[s]}{d.m}</div>
            <div style={{fontSize:8, color:CAX.mute2, marginTop:1}}>{d.l}</div>
          </div>
        );})}
      </div>
      <span style={{padding:'3px 8px', borderRadius:6, fontSize:10, fontWeight:700, background:`${a.st==='under'?CAX.amber:CAX.coral}18`, color: a.st==='under'?CAX.amber:CAX.coral}}>{a.st==='under'?'Under':'Over'}</span>
    </div>
  );
}

function CAXEasyRow({a, tone}) {
  return (
    <div style={{display:'flex', gap:10, alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${CAX.line}`}}>
      <CAXAvatar a={a}/>
      <div style={{flex:1}}><div style={{fontSize:13, fontWeight:600}}>{a.f} {a.l}</div><div style={{fontSize:10.5, color:CAX.mute, marginTop:1}}>Easy {a.easy}% · target 80%</div></div>
      <span className="num" style={{fontSize:15, color:tone}}>{a.easy}%</span>
    </div>
  );
}

function CAXTabBar({active}) {
  const tabs = [['team','Team'],['training','Training'],['calendar','Calendar'],['feed','Feed'],['me','Me']];
  return (
    <div style={{position:'absolute', bottom:0, left:0, right:0, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderTop:`1px solid ${CAX.line}`, padding:'10px 8px 22px', display:'flex', justifyContent:'space-around'}}>
      {tabs.map(([id,l]) => (
        <div key={id} style={{textAlign:'center'}}>
          <div style={{fontSize:11, fontWeight:600, color: active===id||id==='training' ? CAX.indigo : CAX.mute2}}>{l}</div>
          {id==='training' && <div style={{margin:'4px auto 0', width:4, height:4, borderRadius:999, background:CAX.indigo}}/>}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { CoachAnalyticsFaithful });
