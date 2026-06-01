/* global React */
// TeamBase — Team Feed (Direction D · Signal), faithful to screens/TeamFeed.js
// Chat-bubble channel feed: own = right/indigo, others = left/white w/ author + role badge.
// Compose bar at bottom (image + input + Post).

const TFX = {
  white:'#FFFFFF', paper:'#FAFBFC', paper2:'#F4F5F7', line:'#E6E8EC',
  ink:'#0B0D12', inkSoft:'#2A2E38', mute:'#6B7280', mute2:'#9AA0AB',
  indigo:'#4F46E5', violet:'#7C3AED', pink:'#EC4899', coral:'#FB7185',
  amber:'#F59E0B', lime:'#84CC16', emerald:'#10B981', cyan:'#06B6D4',
};

const TFX_POSTS = [
  {id:1, author:'Coach Reyes', role:'coach', color:'#4F46E5', text:'Taper week, everyone. Easy runs only — sleep well, eat well, and trust the work. Championship Saturday. 🏆', time:'8:02 AM', own:false},
  {id:2, author:'Mia Laurent', role:'captain', color:'#EC4899', text:'Let\u2019s go Bulldogs!! Who\u2019s carpooling to Crystal Springs?', time:'8:14 AM', own:false},
  {id:3, author:'Diego Alvarez', role:null, color:'#06B6D4', text:'I\u2019ve got room for 3. Leaving from the school lot at 6:45.', time:'8:21 AM', own:false},
  {id:4, author:'You', role:null, color:'#10B981', text:'Put me down for Diego\u2019s car 🙏', time:'8:23 AM', own:true},
  {id:5, author:'Coach Reyes', role:'coach', color:'#4F46E5', text:'Bus leaves at 7:00 sharp for everyone not carpooling. Spikes, uniform, and a warmup top — it\u2019ll be cold at the start.', time:'8:30 AM', own:false, image:true},
  {id:6, author:'Ava Chen', role:null, color:'#7C3AED', text:'Pasta dinner at my place Friday 6pm — bring a side!', time:'9:05 AM', own:false},
  {id:7, author:'You', role:null, color:'#10B981', text:'I\u2019ll bring garlic bread 🍞', time:'9:11 AM', own:true},
];

function TFXStyles() {
  return <style>{`
    .tfx { font-family:'Inter Tight', sans-serif; color:${TFX.ink}; letter-spacing:-0.01em; height:100%; display:flex; flex-direction:column; background:${TFX.paper2}; }
    .tfx .display { font-family:'Instrument Serif', serif; letter-spacing:-0.02em; }
    .tfx .mono { font-family:'JetBrains Mono', monospace; }
    .tfx .eyebrow { font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:${TFX.mute}; font-weight:500; }
  `}</style>;
}

function TeamFeedFaithful() {
  return (
    <div className="tfx">
      <TFXStyles />

      {/* Header */}
      <div style={{padding:'52px 18px 12px', background:TFX.white, borderBottom:`1px solid ${TFX.line}`, display:'flex', alignItems:'center', gap:10, flexShrink:0}}>
        <span style={{fontSize:20, color:TFX.inkSoft}}>‹</span>
        <div style={{flex:1, textAlign:'center'}}>
          <div className="display" style={{fontSize:21, lineHeight:1, fontStyle:'italic'}}>Whole Team</div>
          <div className="eyebrow" style={{marginTop:3}}>Davis HS · Cross Country</div>
        </div>
        <span style={{fontSize:18, color:TFX.mute2}}>ⓘ</span>
      </div>

      {/* Posts */}
      <div style={{flex:1, overflow:'auto', padding:'16px 14px', display:'flex', flexDirection:'column', gap:10}}>
        <div style={{textAlign:'center', marginBottom:4}}>
          <span style={{fontSize:10.5, color:TFX.mute2, background:TFX.white, padding:'3px 12px', borderRadius:999, border:`1px solid ${TFX.line}`}}>Today</span>
        </div>
        {TFX_POSTS.map(p => <TFXBubble key={p.id} p={p} />)}
      </div>

      {/* Compose bar */}
      <div style={{flexShrink:0, background:TFX.white, borderTop:`1px solid ${TFX.line}`, padding:'10px 12px 26px', display:'flex', alignItems:'center', gap:10}}>
        <span style={{fontSize:22, color:TFX.mute2, cursor:'pointer'}}>⊞</span>
        <div style={{flex:1, background:TFX.paper2, border:`1px solid ${TFX.line}`, borderRadius:20, padding:'9px 14px', fontSize:14, color:TFX.mute2}}>Message the team…</div>
        <button style={{borderRadius:20, padding:'9px 16px', background:TFX.indigo, color:'#fff', border:'none', fontSize:13.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>Post</button>
      </div>
    </div>
  );
}

function TFXBubble({p}) {
  const roleColor = p.role === 'coach' ? TFX.indigo : p.role === 'captain' ? TFX.pink : null;
  const roleLabel = p.role === 'coach' ? 'COACH' : p.role === 'captain' ? 'CAPTAIN' : null;
  if (p.own) {
    return (
      <div style={{display:'flex', justifyContent:'flex-end'}}>
        <div style={{maxWidth:'76%', background:TFX.indigo, color:'#fff', borderRadius:18, borderBottomRightRadius:5, padding:'9px 13px'}}>
          {p.text && <div style={{fontSize:14.5, lineHeight:1.4}}>{p.text}</div>}
          <div style={{fontSize:10.5, color:'rgba(255,255,255,0.65)', marginTop:4, textAlign:'right'}}>{p.time}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{display:'flex', gap:8, alignItems:'flex-end'}}>
      <div style={{width:30, height:30, borderRadius:999, background:p.color, color:'#fff', display:'grid', placeItems:'center', fontSize:11, fontWeight:700, flexShrink:0}}>
        {p.author.split(' ').map(s=>s[0]).slice(0,2).join('')}
      </div>
      <div style={{maxWidth:'76%', background:TFX.white, border:`1px solid ${TFX.line}`, borderRadius:18, borderBottomLeftRadius:5, padding:'9px 13px'}}>
        <div style={{display:'flex', gap:6, alignItems:'center', marginBottom:3}}>
          <span style={{fontSize:12.5, fontWeight:700, color:TFX.inkSoft}}>{p.author}</span>
          {roleLabel && <span style={{fontSize:9, fontWeight:700, color:'#fff', background:roleColor, padding:'1px 6px', borderRadius:6, letterSpacing:'0.04em'}}>{roleLabel}</span>}
        </div>
        {p.image && (
          <div style={{height:120, borderRadius:11, background:`linear-gradient(135deg, ${TFX.cyan}, ${TFX.indigo})`, marginBottom:7, display:'grid', placeItems:'center', color:'rgba(255,255,255,0.85)', fontSize:12, fontWeight:600}}>🏁 Crystal Springs course map</div>
        )}
        {p.text && <div style={{fontSize:14.5, color:TFX.ink, lineHeight:1.4}}>{p.text}</div>}
        <div style={{fontSize:10.5, color:TFX.mute2, marginTop:4}}>{p.time}</div>
      </div>
    </div>
  );
}

Object.assign(window, { TeamFeedFaithful });
