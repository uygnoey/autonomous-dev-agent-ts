/**
 * 대시보드 UI HTML 생성 / Dashboard UI HTML generator
 *
 * @description
 * KR: 단일 HTML 파일로 대시보드 UI를 인라인 생성한다.
 *     외부 의존성 없이 순수 HTML/CSS/JS로 실시간 모니터링을 제공한다.
 * EN: Generates a single inline HTML file for the dashboard UI.
 *     Pure HTML/CSS/JS with no external dependencies for real-time monitoring.
 */

/**
 * 대시보드 HTML 문자열을 반환한다 / Returns the dashboard HTML string
 *
 * @returns 인라인 CSS/JS를 포함한 HTML 문자열 / HTML string with inline CSS/JS
 */
export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>adev Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0f1117;--surface:#1a1d27;--border:#2a2d3a;
  --text:#e4e6f0;--text-dim:#8b8fa3;--accent:#6c5ce7;
  --green:#00b894;--yellow:#fdcb6e;--red:#e17055;--blue:#74b9ff;
  --phase-design:#a29bfe;--phase-code:#74b9ff;--phase-test:#fdcb6e;--phase-verify:#00b894;
}
body{font-family:'SF Mono','Cascadia Code','Fira Code',monospace;background:var(--bg);color:var(--text);font-size:13px;line-height:1.5}
.header{padding:12px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px}
.header h1{font-size:16px;font-weight:600;color:var(--accent)}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.conn-status{font-size:11px;color:var(--text-dim)}
.grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto auto;gap:12px;padding:12px 20px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px;overflow:hidden}
.card-title{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:12px}
.phase-bar{display:flex;gap:4px;margin-bottom:16px}
.phase-step{flex:1;padding:8px 12px;border-radius:6px;text-align:center;font-size:12px;font-weight:600;background:var(--border);color:var(--text-dim);transition:all .3s}
.phase-step.active{color:#fff;transform:scale(1.02)}
.phase-step.DESIGN.active{background:var(--phase-design)}
.phase-step.CODE.active{background:var(--phase-code)}
.phase-step.TEST.active{background:var(--phase-test)}
.phase-step.VERIFY.active{background:var(--phase-verify)}
.phase-step.done{opacity:.6}
.agents-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.agent-card{padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--bg)}
.agent-name{font-weight:600;font-size:12px;margin-bottom:4px}
.agent-state{font-size:11px;display:flex;align-items:center;gap:4px}
.agent-state .dot{width:6px;height:6px;border-radius:50%}
.dot.idle{background:var(--text-dim)}.dot.running{background:var(--green);animation:pulse 1s infinite}
.dot.completed{background:var(--blue)}.dot.failed{background:var(--red)}
.features-list{display:flex;flex-direction:column;gap:6px}
.feature-row{display:flex;align-items:center;gap:8px;padding:8px;border-radius:4px;background:var(--bg)}
.feature-id{font-weight:600;font-size:12px;min-width:80px}
.feature-phase{font-size:11px;padding:2px 8px;border-radius:3px;background:var(--border)}
.progress-bar{flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden}
.progress-fill{height:100%;border-radius:3px;background:var(--accent);transition:width .5s}
.metrics-log{max-height:200px;overflow-y:auto;font-size:11px;display:flex;flex-direction:column;gap:2px}
.metric-entry{padding:4px 8px;border-radius:3px;background:var(--bg);display:flex;gap:8px}
.metric-time{color:var(--text-dim);min-width:80px}
.metric-name{color:var(--accent);min-width:120px}
.metric-value{color:var(--green)}
.token-bar{margin-top:8px}
.token-track{height:8px;background:var(--border);border-radius:4px;overflow:hidden}
.token-fill{height:100%;border-radius:4px;transition:width .5s,background .5s}
.token-label{font-size:11px;color:var(--text-dim);margin-top:4px;display:flex;justify-content:space-between}
.history-list{max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:4px}
.history-entry{display:flex;gap:8px;padding:4px 8px;border-radius:3px;background:var(--bg);font-size:11px}
.history-arrow{color:var(--accent)}
.empty{color:var(--text-dim);font-style:italic;font-size:12px}
@media(max-width:768px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="header">
  <h1>adev Dashboard</h1>
  <div class="status-dot" id="statusDot"></div>
  <span class="conn-status" id="connStatus">connecting...</span>
</div>

<div class="grid">
  <div class="card" style="grid-column:1/-1">
    <div class="card-title">Phase FSM</div>
    <div class="phase-bar" id="phaseBar">
      <div class="phase-step DESIGN" data-phase="DESIGN">DESIGN</div>
      <div class="phase-step CODE" data-phase="CODE">CODE</div>
      <div class="phase-step TEST" data-phase="TEST">TEST</div>
      <div class="phase-step VERIFY" data-phase="VERIFY">VERIFY</div>
    </div>
    <div class="token-bar">
      <div class="token-track"><div class="token-fill" id="tokenFill" style="width:100%;background:var(--green)"></div></div>
      <div class="token-label"><span>Token Budget</span><span id="tokenPct">100%</span></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Agents</div>
    <div class="agents-grid" id="agentsGrid"><div class="empty">waiting for data...</div></div>
  </div>

  <div class="card">
    <div class="card-title">Features</div>
    <div class="features-list" id="featuresList"><div class="empty">no features tracked</div></div>
  </div>

  <div class="card">
    <div class="card-title">Phase History</div>
    <div class="history-list" id="historyList"><div class="empty">no transitions yet</div></div>
  </div>

  <div class="card">
    <div class="card-title">Metrics Feed</div>
    <div class="metrics-log" id="metricsLog"><div class="empty">waiting for metrics...</div></div>
  </div>
</div>

<script>
(function(){
  const PHASES = ['DESIGN','CODE','TEST','VERIFY'];
  const PHASE_PROGRESS = {pending:0,designing:0.25,coding:0.5,testing:0.75,verifying:0.9,complete:1,failed:0};
  let ws = null;
  let reconnectTimer = null;

  const $ = (id) => document.getElementById(id);

  function connect(){
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws');

    ws.onopen = () => {
      $('statusDot').style.background = 'var(--green)';
      $('connStatus').textContent = 'connected';
      if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null}
    };

    ws.onclose = () => {
      $('statusDot').style.background = 'var(--red)';
      $('connStatus').textContent = 'disconnected — reconnecting...';
      reconnectTimer = setTimeout(connect, 2000);
    };

    ws.onerror = () => { ws.close(); };

    ws.onmessage = (ev) => {
      try{
        const msg = JSON.parse(ev.data);
        handleMessage(msg);
      }catch(e){/* ignore malformed */}
    };
  }

  function handleMessage(msg){
    switch(msg.type){
      case 'snapshot': applySnapshot(msg.data); break;
      case 'phase_change': updatePhase(msg.data); break;
      case 'agent_update': updateAgent(msg.data); break;
      case 'metric': addMetric(msg.data); break;
      case 'feature_update': updateFeature(msg.data); break;
    }
  }

  function applySnapshot(s){
    setActivePhase(s.currentPhase);
    updateTokenBar(s.tokenUsage);
    renderAgents(s.agents);
    renderFeatures(s.features);
    renderHistory(s.phaseHistory);
    $('metricsLog').innerHTML = '';
    for(const m of (s.recentMetrics||[]).slice(-50)){addMetric(m)}
  }

  function setActivePhase(phase){
    const idx = PHASES.indexOf(phase);
    document.querySelectorAll('.phase-step').forEach((el,i) => {
      el.classList.remove('active','done');
      if(i === idx) el.classList.add('active');
      else if(i < idx) el.classList.add('done');
    });
  }

  function updatePhase(entry){
    setActivePhase(entry.to);
    const list = $('historyList');
    if(list.querySelector('.empty')) list.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'history-entry';
    const t = new Date(entry.timestamp).toLocaleTimeString();
    el.innerHTML = '<span class="metric-time">'+t+'</span>'
      +'<span>'+entry.from+'</span>'
      +'<span class="history-arrow">&rarr;</span>'
      +'<span>'+entry.to+'</span>'
      +'<span class="metric-name">'+entry.reason+'</span>';
    list.prepend(el);
  }

  function updateTokenBar(tu){
    if(!tu) return;
    const fill = $('tokenFill');
    fill.style.width = tu.remainingPct+'%';
    fill.style.background = tu.isPaused?'var(--red)':tu.isThrottled?'var(--yellow)':'var(--green)';
    $('tokenPct').textContent = Math.round(tu.remainingPct)+'%';
  }

  function renderAgents(agents){
    const grid = $('agentsGrid');
    if(!agents||agents.length===0){grid.innerHTML='<div class="empty">no agents active</div>';return}
    grid.innerHTML = agents.map(a =>
      '<div class="agent-card">'
      +'<div class="agent-name">'+a.name+'</div>'
      +'<div class="agent-state"><div class="dot '+a.state+'"></div>'+a.state+'</div>'
      +'</div>'
    ).join('');
  }

  function updateAgent(a){
    const grid = $('agentsGrid');
    if(grid.querySelector('.empty')) grid.innerHTML = '';
    let card = grid.querySelector('[data-agent="'+a.name+'"]');
    if(!card){
      card = document.createElement('div');
      card.className = 'agent-card';
      card.setAttribute('data-agent', a.name);
      grid.appendChild(card);
    }
    card.innerHTML = '<div class="agent-name">'+a.name+'</div>'
      +'<div class="agent-state"><div class="dot '+a.state+'"></div>'+a.state+'</div>';
  }

  function renderFeatures(features){
    const list = $('featuresList');
    if(!features||features.length===0){list.innerHTML='<div class="empty">no features tracked</div>';return}
    list.innerHTML = features.map(f => featureHtml(f)).join('');
  }

  function updateFeature(f){
    const list = $('featuresList');
    if(list.querySelector('.empty')) list.innerHTML = '';
    let row = list.querySelector('[data-feature="'+f.featureId+'"]');
    if(!row){
      row = document.createElement('div');
      row.setAttribute('data-feature', f.featureId);
      list.appendChild(row);
    }
    row.outerHTML = featureHtml(f);
  }

  function featureHtml(f){
    const pct = Math.round((PHASE_PROGRESS[f.status]||0)*100);
    return '<div class="feature-row" data-feature="'+f.featureId+'">'
      +'<span class="feature-id">'+f.featureId+'</span>'
      +'<span class="feature-phase">'+f.currentPhase+'</span>'
      +'<div class="progress-bar"><div class="progress-fill" style="width:'+pct+'%"></div></div>'
      +'<span style="font-size:11px;color:var(--text-dim)">'+f.status+'</span>'
      +'</div>';
  }

  function renderHistory(history){
    const list = $('historyList');
    if(!history||history.length===0){list.innerHTML='<div class="empty">no transitions yet</div>';return}
    list.innerHTML = history.slice().reverse().map(e => {
      const t = new Date(e.timestamp).toLocaleTimeString();
      return '<div class="history-entry">'
        +'<span class="metric-time">'+t+'</span>'
        +'<span>'+e.from+'</span>'
        +'<span class="history-arrow">&rarr;</span>'
        +'<span>'+e.to+'</span>'
        +'<span class="metric-name">'+e.reason+'</span>'
        +'</div>';
    }).join('');
  }

  function addMetric(m){
    const log = $('metricsLog');
    if(log.querySelector('.empty')) log.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'metric-entry';
    const t = new Date(m.timestamp).toLocaleTimeString();
    const labels = Object.entries(m.labels||{}).map(([k,v])=>k+'='+v).join(' ');
    el.innerHTML = '<span class="metric-time">'+t+'</span>'
      +'<span class="metric-name">'+m.name+'</span>'
      +'<span class="metric-value">'+m.value+'</span>'
      +'<span style="color:var(--text-dim)">'+labels+'</span>';
    log.prepend(el);
    while(log.children.length > 100) log.removeChild(log.lastChild);
  }

  connect();
})();
</script>
</body>
</html>`;
}
