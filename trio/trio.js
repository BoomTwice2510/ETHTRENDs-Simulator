(() => {
  'use strict';
  // Calls the same-origin Vercel proxy. The Railway API key stays server-side.
  const API = '/api/trio/v1';
  const ASSETS = {
    GOLD: {name:'Gold', symbol:'XAUUSDT'},
    SILVER: {name:'Silver', symbol:'XAGUSDT'},
    CRUDE: {name:'Crude', symbol:'CLUSDT'}
  };
  const $ = id => document.getElementById(id);
  let tradeCache = {};
  let lastResult = null;

  function n(value) { const x = Number(value); return Number.isFinite(x) ? x : 0; }
  function money(value) { return (value < 0 ? '-$' : '$') + Math.abs(n(value)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function signedMoney(value) { return (n(value) > 0 ? '+' : n(value) < 0 ? '-' : '') + '$' + Math.abs(n(value)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function num(value, digits=4) { return n(value).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:digits}); }
  function pct(value) { return `${n(value).toFixed(2)}%`; }
  function setApiState(state, text) { const el=$('apiState'); el.textContent=text; el.parentElement.className='api-state '+state; }
  function showError(message) { const el=$('error'); el.textContent=message; el.hidden=false; }
  function clearError() { $('error').hidden=true; $('error').textContent=''; }

  async function getJson(url) {
    const response = await fetch(url,{method:'GET',headers:{'Accept':'application/json'},cache:'no-store'});
    if (!response.ok) {
      let detail=''; try { const body=await response.json(); detail=body.detail||body.message||''; } catch (_) {}
      throw new Error(detail || `API request failed (${response.status})`);
    }
    return response.json();
  }

  async function loadTrades(asset, force=false) {
    if (!force && tradeCache[asset]) return tradeCache[asset];
    $('historyLabel').textContent='Loading historical trades…';
    const payload=await getJson(`${API}/assets/${asset}/trades?limit=20000`);
    if (!payload || !Array.isArray(payload.trades)) throw new Error(`The ${asset} endpoint returned no trade list.`);
    const trades=payload.trades.map((t,index)=>({
      number:index+1,
      side:String(t.side||'').toUpperCase(),
      entry:n(t.entry_price), exit:n(t.exit_price), points:n(t.points),
      entryTime:t.entry_time_utc||'', exitTime:t.exit_time_utc||'',
      result:String(t.result||'').toUpperCase()
    })).filter(t => ['LONG','SHORT'].includes(t.side) && t.entry>0 && t.exit>0);
    if (!trades.length) throw new Error(`No completed ${asset} trades were returned by the API.`);
    tradeCache[asset]={...payload,trades};
    $('historyLabel').textContent=`${trades.length.toLocaleString()} closed trades loaded`;
    return tradeCache[asset];
  }

  async function boot() {
    try {
      // Prevent the parent ETH simulator's service worker from serving stale content on this route.
      if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(regs=>regs.forEach(reg=>reg.unregister())).catch(()=>{});
      const health=await getJson(`${API}/health`);
      if (!health.bot_initialized || !health.historical_data_ready) throw new Error('Trio bot is online, but historical data is not ready yet. Try again shortly.');
      const assets=await getJson(`${API}/assets`);
      const available=new Set((assets.assets||[]).map(a=>a.code));
      if (!Object.keys(ASSETS).every(code=>available.has(code))) throw new Error('The Trio API did not return all three assets.');
      setApiState('online','TRIO API ONLINE');
      await loadTrades($('asset').value);
    } catch (error) {
      setApiState('offline','API CONNECTION ISSUE');
      $('historyLabel').textContent='Historical data unavailable';
      showError(`${error.message} Check the Railway API and try again.`);
    }
  }

  function simulate(asset, input, source) {
    let balance=input.capital, peak=balance, maxDrawdown=0, lowest=balance;
    let wins=0, losses=0, breakeven=0;
    const executed=[];
    let stoppedReason='';
    source.trades.forEach((trade,index)=>{
      if (stoppedReason) return;
      // Match the existing ETHSim scenario convention: historical signed points scaled by size and leverage.
      const pnl=trade.points*input.size*input.leverage;
      const before=balance;
      balance=before+pnl;
      if (balance<=0) {
        balance=0;
        stoppedReason='Simulation stopped because the modeled balance reached zero.';
      }
      if (pnl>0) wins++; else if (pnl<0) losses++; else breakeven++;
      peak=Math.max(peak,balance);
      maxDrawdown=Math.max(maxDrawdown,peak-balance);
      lowest=Math.min(lowest,balance);
      executed.push({...trade,number:index+1,pnl,balanceBefore:before,balanceAfter:balance});
    });
    const netPnl=balance-input.capital;
    return {asset,input,source, trades:executed,startingCapital:input.capital,finalBalance:balance,netPnl,roiPercent:input.capital?(netPnl/input.capital)*100:0,wins,losses,breakeven,winRate:executed.length?(wins/executed.length)*100:0,maxDrawdown,lowest,stoppedReason};
  }

  function renderChart(result) {
    const values=[result.startingCapital,...result.trades.map(t=>t.balanceAfter)];
    const width=900,height=210,left=10,right=10,top=12,bottom=16;
    const min=Math.min(...values),max=Math.max(...values),range=max-min||1;
    const x=i=>left+(i/Math.max(1,values.length-1))*(width-left-right);
    const y=v=>top+((max-v)/range)*(height-top-bottom);
    const points=values.map((v,i)=>`${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
    const zeroY=y(Math.max(min,Math.min(max,0)));
    const area=`${left},${height-bottom} ${points} ${width-right},${height-bottom}`;
    const color=result.netPnl>=0?'#087f5b':'#c43b4d';
    $('chart').innerHTML=`<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Balance curve across ${result.trades.length} historical trades"><defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".17"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><line x1="${left}" y1="${top+45}" x2="${width-right}" y2="${top+45}" stroke="#edf1f4"/><line x1="${left}" y1="${top+100}" x2="${width-right}" y2="${top+100}" stroke="#edf1f4"/><line x1="${left}" y1="${top+155}" x2="${width-right}" y2="${top+155}" stroke="#edf1f4"/><polygon points="${area}" fill="url(#areaFill)"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.7" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="${x(values.length-1)}" cy="${y(values[values.length-1])}" r="4" fill="${color}" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function render(result) {
    lastResult=result;
    $('empty').hidden=true; $('results').hidden=false;
    const asset=ASSETS[result.asset];
    $('resultAsset').textContent=`${asset.name.toUpperCase()} · ${asset.symbol} · HISTORICAL REPLAY`;
    $('resultPeriod').textContent=`${result.trades.length} of ${result.source.trades.length} historical closed trades processed${result.stoppedReason?' · '+result.stoppedReason:''}.`;
    $('finalBalance').textContent=money(result.finalBalance);
    $('balanceChange').textContent=`From ${money(result.startingCapital)} starting capital`;
    $('netPnl').textContent=signedMoney(result.netPnl); $('netPnl').className=result.netPnl>=0?'positive':'negative';
    $('roi').textContent=pct(result.roiPercent); $('roi').className=result.roiPercent>=0?'positive':'negative';
    $('winRate').textContent=pct(result.winRate);
    $('tradeCount').textContent=`${result.trades.length} trades executed`;
    $('wins').textContent=result.wins; $('losses').textContent=result.losses;
    $('drawdown').textContent=money(result.maxDrawdown); $('resultLeverage').textContent=`${result.input.leverage}×`;
    $('chartStart').textContent=money(result.startingCapital); $('lowestBalance').textContent=money(result.lowest); $('chartEnd').textContent=money(result.finalBalance);
    $('tradeCountBadge').textContent=`${result.trades.length} TRADES`;
    $('tableFoot').textContent=result.stoppedReason ? `${result.stoppedReason} ${result.source.trades.length-result.trades.length} later trades were not simulated.` : `All ${result.trades.length} returned closed trades were replayed in chronological order.`;
    const body=$('tradeRows'); body.textContent='';
    const frag=document.createDocumentFragment();
    result.trades.forEach(t=>{
      const tr=document.createElement('tr');
      const vals=[String(t.number),t.side,num(t.entry,6),num(t.exit,6),`${t.points>0?'+':''}${num(t.points,6)}`,signedMoney(t.pnl),money(t.balanceAfter)];
      vals.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;if(i===1)td.className=t.side==='LONG'?'side-long':'side-short';if(i===4||i===5)td.className+=(t.points>0?' positive':t.points<0?' negative':'');tr.appendChild(td);});
      frag.appendChild(tr);
    });
    body.appendChild(frag); renderChart(result);
    $('results').scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function run() {
    clearError();
    const button=$('run');
    const asset=$('asset').value;
    const input={capital:n($('capital').value),size:n($('size').value),leverage:n($('leverage').value)};
    if (!(input.capital>0) || !(input.size>0) || !(input.leverage>=1 && input.leverage<=125) || !Number.isInteger(input.leverage)) {
      showError('Enter a positive starting capital and position size. Leverage must be a whole number between 1× and 125×.'); return;
    }
    button.disabled=true; button.querySelector('span').textContent='FETCHING HISTORICAL TRADES…';
    try {
      setApiState('online','LOADING HISTORICAL DATA');
      const source=await loadTrades(asset);
      const result=simulate(asset,input,source);
      render(result); setApiState('online','TRIO API ONLINE');
    } catch(error) {
      setApiState('offline','API CONNECTION ISSUE'); showError(error.message || 'Could not run the simulation.');
    } finally {
      button.disabled=false; button.querySelector('span').textContent='RUN SIMULATION';
    }
  }

  $('run').addEventListener('click',run);
  $('asset').addEventListener('change',async()=>{
    clearError();
    try { const data=await loadTrades($('asset').value); $('historyLabel').textContent=`${data.trades.length.toLocaleString()} closed trades loaded`; if(lastResult) $('historyLabel').textContent=`${data.trades.length.toLocaleString()} closed trades loaded`; }
    catch(error) { $('historyLabel').textContent='Historical data unavailable'; showError(error.message); }
  });
  document.querySelectorAll('[data-lev]').forEach(button=>button.addEventListener('click',()=>{
    $('leverage').value=button.dataset.lev;
    document.querySelectorAll('[data-lev]').forEach(b=>b.classList.toggle('chosen',b===button));
  }));
  $('leverage').addEventListener('input',()=>document.querySelectorAll('[data-lev]').forEach(b=>b.classList.toggle('chosen',Number(b.dataset.lev)===Number($('leverage').value))));
  boot();
})();
