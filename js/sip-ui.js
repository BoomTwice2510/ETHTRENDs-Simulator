/* ETHTRENDs SIP UI — expandable scenarios + yearly/monthly details */
(function(){
  'use strict';
  const inr = v => '₹' + Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:0});
  const usd = (v,fx) => '$' + (Number(v||0)/Math.max(.000001,Number(fx)||102)).toLocaleString('en-US',{maximumFractionDigits:2});
  const money=(v,c,fx)=>c==='USD'?usd(v,fx):inr(v);
  const signed=(v,c,fx)=>{const x=Number(v||0);return (x>=0?'+':'−')+money(Math.abs(x),c,fx)};
  const pct=v=>(Number(v||0)>=0?'+':'−')+Math.abs(Number(v||0)).toLocaleString('en-IN',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
  const cls=v=>Number(v||0)>=0?'sip-positive':'sip-negative';

  function positionText(s, year){
    const y = s.yearly.find(x=>x.year===year);
    if(!y) return '—';
    if(year===1) return `${s.monthly[0].positionEth.toFixed(4)} → ${s.monthly[3].positionEth.toFixed(4)} → ${s.monthly[4].positionEth.toFixed(4)} ETH`;
    return `${(s.monthly.find(m=>m.year===year)||{}).positionEth?.toFixed(4) || '—'} ETH`;
  }

  function yearTable(s,currency){
    const fx=s.fxRate;
    return `<div class="sip-detail-block">
      <div class="sip-section-title">YEAR-BY-YEAR DETAILS</div>
      <div class="sip-table-wrap"><table class="sip-table sip-year-table"><thead><tr><th>YEAR</th><th>POSITION</th><th>SIP CONTRIBUTION</th><th>TRADING P&amp;L</th><th>ENDING CORPUS</th><th>RETURN</th></tr></thead><tbody>
      ${s.yearly.map(y=>`<tr><td><strong>Y${y.year}</strong></td><td>${positionText(s,y.year)}${y.year>=5?' <small>· '+(y.year*10-10)+'×</small>':''}</td><td>${money(y.investedINR,currency,fx)}</td><td class="${cls(y.pnlINR)}">${signed(y.pnlINR,currency,fx)}</td><td><strong>${money(y.closingINR,currency,fx)}</strong></td><td class="${cls(y.returnPercent)}">${pct(y.returnPercent)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  function monthlyTable(s,currency){
    const fx=s.fxRate;
    const years={};
    s.monthly.forEach(m=>(years[m.year] ||= []).push(m));
    return `<div class="sip-monthly-accordion" data-sip-monthly>
      <button class="sip-monthly-toggle" type="button" aria-expanded="false">
        <span><b>MONTHLY DETAILS</b><small>Tap to open all ${s.monthly.length} months</small></span><strong>＋</strong>
      </button>
      <div class="sip-monthly-body">
        ${Object.entries(years).map(([year,rows])=>`<div class="sip-month-group"><div class="sip-month-group-title">YEAR ${year}</div><div class="sip-table-wrap"><table class="sip-table sip-month-table"><thead><tr><th>MONTH</th><th>SOURCE</th><th>POSITION</th><th>SIP</th><th>TRADING P&amp;L</th><th>CORPUS</th></tr></thead><tbody>${rows.map(m=>`<tr><td><strong>M${m.month}</strong></td><td>${m.sourceMonth}</td><td>${m.positionEth.toFixed(4)} ETH</td><td>${money(m.contributionINR,currency,fx)}</td><td class="${cls(m.pnlINR)}">${signed(m.pnlINR,currency,fx)}</td><td><strong>${money(m.closingINR,currency,fx)}</strong></td></tr>`).join('')}</tbody></table></div></div>`).join('')}
      </div>
    </div>`;
  }

  function riskControl(s,currency){
    const fx=s.fxRate;
    const rows=s.monthly;
    let worstLoss=0,worstMonth=null,worstRatio=0;
    rows.forEach(m=>{
      const loss=Math.min(0,m.pnlINR);
      if(loss<worstLoss){worstLoss=loss;worstMonth=m.month;worstRatio=Math.abs(loss)/Math.max(1,m.openingINR+m.contributionINR)*100;}
    });
    const marginWorst = rows.reduce((mx,m)=>Math.max(mx, Math.abs(m.positionEth)*Math.max(1,Math.abs(m.sourcePoints))*0),0);
    const level = worstRatio<10?'LOW':worstRatio<25?'MODERATE':worstRatio<50?'HIGH':'VERY HIGH';
    return `<div class="sip-risk-card">
      <div class="sip-risk-head"><div><div class="sip-section-title">RISK CONTROL SYSTEM</div><p>Historical stress indicators for this SIP model. These are controls, not guarantees.</p></div><span class="sip-risk-badge ${level==='LOW'?'low':level==='MODERATE'?'moderate':'high'}">${level} STRESS</span></div>
      <div class="sip-risk-grid">
        <div><span>MAX HISTORICAL MONTHLY LOSS</span><strong class="sip-negative">${signed(worstLoss,currency,fx)}</strong><small>${worstMonth?`Model month M${worstMonth}`:'No negative month in selected baseline'}</small></div>
        <div><span>WORST LOSS / CAPITAL</span><strong>${worstRatio.toFixed(1)}%</strong><small>Compared with that month's available corpus + SIP</small></div>
        <div><span>LEVERAGE</span><strong>10× FIXED</strong><small>Leverage is not multiplied into P&amp;L again</small></div>
        <div><span>POSITION CAP</span><strong>${s.yearly.length>=6?'Y'+s.yearly.length+' · '+(s.yearly.length*10-10)+'×':'Y5 · 40×'}</strong><small>Position continues increasing by 10× base each year after Y2.</small></div>
      </div>
      <div class="sip-risk-note"><b>CONTROL RULE:</b> If projected required exposure becomes unsuitable for your available capital, reduce the SIP amount or selected horizon. Do not treat the projection as a guaranteed compounding path.</div>
    </div>`;
  }

  function scenario(s,key,label,desc,result,currency,open){
    const fx=s.fxRate;
    return `<section class="sip-scenario-card ${key==='base'?'base':''} ${open?'open':''}" data-scenario="${key}">
      <button class="sip-scenario-toggle" type="button" aria-expanded="${open}">
        <div><div class="sip-scenario-name">${label}</div><div class="sip-scenario-description">${desc}</div></div>
        <div class="sip-scenario-right"><strong class="${cls(s.roiPercent)}">${pct(s.roiPercent)}</strong><span>⌄</span></div>
      </button>
      <div class="sip-scenario-summary"><div><span>FINAL CORPUS</span><strong>${money(s.finalCorpusINR,currency,fx)}</strong></div><div><span>NET P&amp;L</span><strong class="${cls(s.netPnlINR)}">${signed(s.netPnlINR,currency,fx)}</strong></div><div><span>INVESTED</span><strong>${money(s.investedINR,currency,fx)}</strong></div><div><span>MODEL</span><strong>${s.multiplier.toFixed(2)}×</strong></div></div>
      <div class="sip-scenario-details">${yearTable(s,currency)}${monthlyTable(s,currency)}${riskControl(s,currency)}</div>
    </section>`;
  }

  function renderResults(result,target,currency){
    if(!target||!result)return;
    const base=result.scenarios.base,fx=base.fxRate, years=result.years;
    target.innerHTML=`<div class="sip-results-heading"><div class="result-label">REAL BOT DATA · SIP PROJECTION</div><h2>${money(base.finalCorpusINR,currency,fx)} projected corpus</h2><p>${years}-year model · latest ${result.baselineMonths.length} completed historical months (${result.baselineMonths[0].month} → ${result.baselineMonths[result.baselineMonths.length-1].month}) from the simulator API. Historical monthly points are reused cyclically for the selected horizon.</p></div>
      <div class="sip-summary"><div class="sip-summary-box"><span>MONTHLY SIP</span><strong>${inr(result.monthlySip)}</strong></div><div class="sip-summary-box"><span>BASE POSITION</span><strong>${result.basePositionEth.toFixed(4)} ETH</strong></div><div class="sip-summary-box"><span>LEVERAGE</span><strong>10× FIXED</strong></div><div class="sip-summary-box"><span>HORIZON</span><strong>${years} YEARS</strong></div></div>
      <div class="sip-scenario-list">${scenario(base,'base','BASE · 100%','Historical monthly performance repeated at full scale.',result,currency,true)}${scenario(result.scenarios.worst,'worst','WORST · 50%','Historical monthly performance at half scale.',result,currency,false)}${scenario(result.scenarios.best,'best','BEST · 150%','Historical monthly performance at 1.5× scale.',result,currency,false)}</div>
      <div class="sip-disclaimer"><b>HISTORICAL MODEL · NOT A FORECAST</b><br>Past performance does not guarantee future performance. Worst/Base/Best are scaling scenarios, not probabilities. Actual results may differ due to market conditions, volatility, fees, funding, slippage, execution, leverage, position sizing and missed trades.</div>`;

    target.querySelectorAll('.sip-scenario-toggle').forEach(btn=>btn.addEventListener('click',()=>{
      const card=btn.closest('.sip-scenario-card');
      const was=card.classList.contains('open');
      target.querySelectorAll('.sip-scenario-card').forEach(c=>c.classList.remove('open'));
      if(!was) card.classList.add('open');
      target.querySelectorAll('.sip-scenario-toggle').forEach(b=>b.setAttribute('aria-expanded',b.closest('.sip-scenario-card').classList.contains('open')));
    }));
    target.querySelectorAll('.sip-monthly-toggle').forEach(btn=>btn.addEventListener('click',()=>{
      const box=btn.closest('.sip-monthly-accordion'), open=box.classList.toggle('open');
      btn.setAttribute('aria-expanded',open);btn.querySelector('strong').textContent=open?'−':'＋';
    }));
  }
  window.ETHTRENDsSIPUI={renderResults};
})();
