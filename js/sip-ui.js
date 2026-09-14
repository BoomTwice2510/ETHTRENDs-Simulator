/* ETHTRENDs SIP UI */
(function(){
  "use strict";
  const inr=v=>"₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:0});
  const usd=(v,fx)=>"$"+(Number(v||0)/Math.max(.000001,Number(fx)||102)).toLocaleString("en-US",{maximumFractionDigits:2});
  const money=(v,c,fx)=>c==="USD"?usd(v,fx):inr(v);
  const signed=(v,c,fx)=>{const x=Number(v||0);return(x>=0?"+":"−")+money(Math.abs(x),c,fx)};
  const pct=v=>(Number(v||0)>=0?"+":"−")+Math.abs(Number(v||0)).toLocaleString("en-IN",{minimumFractionDigits:1,maximumFractionDigits:1})+"%";
  const cls=v=>Number(v||0)>=0?"sip-positive":"sip-negative";
  const inputMoney=(r,fx)=>r.inputSipCurrency==="USD" ? "$"+Number(r.inputSipAmount||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "₹"+Number(r.inputSipAmount||r.monthlySip||0).toLocaleString("en-IN",{maximumFractionDigits:0});

  function multiplierForYear(y){return y<=1?5:y<=5?({2:10,3:20,4:30,5:40}[y]||40):40+(y-5)*10}

  function positionText(s,y){
    const rows=s.monthly.filter(m=>m.year===y);
    if(!rows.length)return"—";
    if(y===1){
      const m1=rows.find(m=>m.month===1)?.positionEth||rows[0].positionEth;
      const m4=rows.find(m=>m.month===4)?.positionEth||m1;
      const m5=rows.find(m=>m.month===5)?.positionEth||rows[rows.length-1].positionEth;
      return `${m1.toFixed(4)} → ${m4.toFixed(4)} → ${m5.toFixed(4)} ETH`;
    }
    return `${rows[0].positionEth.toFixed(4)} ETH · ${multiplierForYear(y)}× base`;
  }

  function yearTable(s,currency){
    const fx=s.fxRate;
    return `<div class="sip-detail-section">
      <div class="sip-section-title">YEAR-BY-YEAR DETAILS</div>
      <div class="sip-table-wrap"><table class="sip-table sip-year-table">
      <thead><tr><th>YEAR</th><th>POSITION</th><th>SIP CONTRIBUTION</th><th>TRADING P&amp;L</th><th>ENDING CORPUS</th><th>RETURN</th></tr></thead>
      <tbody>${s.yearly.map(y=>`<tr><td><strong>Y${y.year}</strong></td><td>${positionText(s,y.year)}</td><td>${money(y.investedINR,currency,fx)}</td><td class="${cls(y.pnlINR)}">${signed(y.pnlINR,currency,fx)}</td><td><strong>${money(y.closingINR,currency,fx)}</strong></td><td class="${cls(y.returnPercent)}">${pct(y.returnPercent)}</td></tr>`).join("")}</tbody>
      </table></div></div>`;
  }

  function monthlyTable(s,currency){
    const fx=s.fxRate,years={};
    s.monthly.forEach(m=>(years[m.year]||=[]).push(m));
    return `<div class="sip-monthly-accordion">
      <button class="sip-monthly-toggle" type="button" aria-expanded="false">
        <span><b>MONTHLY DETAILS</b><small>Click to open the complete monthly projection</small></span><strong>＋</strong>
      </button>
      <div class="sip-monthly-body">${Object.entries(years).map(([year,rows])=>`
        <div class="sip-month-group">
          <div class="sip-month-group-title"><span>YEAR ${year}</span><span>${multiplierForYear(Number(year))}× BASE</span></div>
          <div class="sip-table-wrap"><table class="sip-table sip-month-table">
          <thead><tr><th>MONTH</th><th>SOURCE</th><th>POSITION</th><th>SIP</th><th>TRADING P&amp;L</th><th>OPENING CORPUS</th><th>CLOSING CORPUS</th></tr></thead>
          <tbody>${rows.map(m=>`<tr><td><strong>M${m.month}</strong></td><td>${m.sourceMonth}</td><td>${m.positionEth.toFixed(4)} ETH</td><td>${money(m.contributionINR,currency,fx)}</td><td class="${cls(m.pnlINR)}">${signed(m.pnlINR,currency,fx)}</td><td>${money(m.openingINR,currency,fx)}</td><td><strong>${money(m.closingINR,currency,fx)}</strong></td></tr>`).join("")}</tbody>
          </table></div>
        </div>`).join("")}</div>
    </div>`;
  }

  function resultLeverageLabel(s){return `${Number(s.leverage||10)}×`;}

  function sourceIntelligence(s,currency,sourceTotals){
    const fx=Number(s.fxRate)||102;
    const baseline=s.baselineCostTotals||{};
    const totals=sourceTotals||{};
    const tradingFees=Number.isFinite(Number(baseline.tradingFees))?Number(baseline.tradingFees):Number(totals.tradingFees||0);
    const funding=Number.isFinite(Number(baseline.funding))?Number(baseline.funding):Number(totals.funding||0);
    const slippage=Number.isFinite(Number(baseline.slippage))?Number(baseline.slippage):Number(totals.slippage||0);
    const latencyCost=Number.isFinite(Number(baseline.latencyCost))?Number(baseline.latencyCost):Number(totals.latencyCost||0);
    const trades=Number.isFinite(Number(baseline.trades))&&Number(baseline.trades)>0?Number(baseline.trades):Number(totals.totalTrades||s.trades||0);
    const evidence=s.evidenceCount?Number(s.evidenceTotal||0)/Number(s.evidenceCount):null;
    const accepted=Number(s.riskAccepts||0);
    const rejected=Number(s.riskRejects||0);
    const executionCosts=funding+slippage+latencyCost;
    return `<div class="sip-intelligence-card">
      <div class="sip-intelligence-head"><div><div class="sip-section-title">SOURCE TRADE INTELLIGENCE</div><p>Execution and decision metadata carried from the real Simulator API trade records. The SIP projection itself still uses historical signal points at the selected scenario scale.</p></div><span class="sip-intelligence-badge">${trades} SOURCE TRADES</span></div>
      <div class="sip-intelligence-grid">
        <div><span>AVG EVIDENCE SCORE</span><strong>${evidence==null?"—":evidence.toFixed(1)+"/100"}</strong><small>Across the source trades in this baseline month</small></div>
        <div><span>RISK DECISION</span><strong>${accepted} ACCEPT${rejected?` · ${rejected} REJECT`:""}</strong><small>Recorded execution decisions</small></div>
        <div><span>TRADING FEES</span><strong>${money(tradingFees*fx,currency,fx)}</strong><small>${tradingFees.toFixed(2)} USD across ${trades} baseline trades</small></div>
        <div><span>EXECUTION COSTS</span><strong>${money(executionCosts*fx,currency,fx)}</strong><small>Funding ${funding.toFixed(2)} + slippage ${slippage.toFixed(2)} + latency ${latencyCost.toFixed(2)} USD</small></div>
      </div>
    </div>`;
  }

  function riskControl(s,currency){
    const fx=s.fxRate;let worstLoss=0,worstMonth=null,worstRatio=0;
    s.monthly.forEach(m=>{if(m.pnlINR<worstLoss){worstLoss=m.pnlINR;worstMonth=m.month;worstRatio=Math.abs(m.pnlINR)/Math.max(1,m.openingINR+m.contributionINR)*100}});
    const finalMultiplier=multiplierForYear(s.years);
    const level=worstRatio<10?"LOW":worstRatio<25?"MODERATE":worstRatio<50?"HIGH":"VERY HIGH";
    return `<div class="sip-risk-card">
      <div class="sip-risk-head"><div><div class="sip-section-title">RISK CONTROL SYSTEM</div><p>Model stress indicators for the selected horizon. These controls do not guarantee a positive result.</p></div><span class="sip-risk-badge ${level==="LOW"?"low":level==="MODERATE"?"moderate":"high"}">${level} STRESS</span></div>
      <div class="sip-risk-grid">
        <div><span>MAX HISTORICAL MONTHLY LOSS</span><strong class="sip-negative">${signed(worstLoss,currency,fx)}</strong><small>${worstMonth?`Projection month M${worstMonth}`:"No negative month in baseline"}</small></div>
        <div><span>WORST LOSS / AVAILABLE CORPUS</span><strong>${worstRatio.toFixed(1)}%</strong><small>Loss relative to opening corpus + SIP</small></div>
        <div><span>LEVERAGE</span><strong>${resultLeverageLabel(s)}</strong><small>Selected leverage for this projection</small></div>
        <div><span>FINAL-YEAR POSITION</span><strong>${finalMultiplier}× BASE</strong><small>Y${s.years} · ${s.monthly[s.monthly.length-1].positionEth.toFixed(4)} ETH</small></div>
      </div>
      <div class="sip-risk-note"><b>CONTROL RULE:</b> If the projected position size or required capital becomes unsuitable for your actual account, reduce the SIP amount or choose a shorter horizon. This is a historical mathematical scenario, not a guaranteed compounding path.</div>
    </div>`;
  }

  function scenarioCard(s,key,label,desc,currency,selected){
    const fx=s.fxRate;
    return `<button class="sip-scenario-card ${selected?"selected":""}" type="button" data-scenario="${key}" aria-pressed="${selected}">
      <div class="sip-scenario-top"><div><div class="sip-scenario-name">${label}</div><div class="sip-scenario-description">${desc}</div></div><div class="sip-scenario-arrow">${selected?"●":"○"}</div></div>
      <div class="sip-scenario-summary">
        <div><span>FINAL CORPUS</span><strong>${money(s.finalCorpusINR,currency,fx)}</strong></div>
        <div><span>NET P&amp;L</span><strong class="${cls(s.netPnlINR)}">${signed(s.netPnlINR,currency,fx)}</strong></div>
        <div><span>INVESTED</span><strong>${money(s.investedINR,currency,fx)}</strong></div>
        <div><span>MODEL</span><strong>${s.multiplier.toFixed(2)}×</strong></div>
      </div>
      <div class="sip-card-hint">${selected?"SELECTED · FULL DETAILS BELOW":"CLICK TO VIEW FULL DETAILS BELOW"}</div>
    </button>`;
  }

  function renderSelected(result,target,currency,key){
    const s=result.scenarios[key],fx=s.fxRate,detail=target.querySelector("#sipSelectedDetail");
    if(!detail)return;
    detail.innerHTML=`<section class="sip-selected-detail">
      <div class="sip-selected-head"><div><div class="sip-selected-kicker">${key==="base"?"BASE · 40%":key==="worst"?"WORST · 20%":"BEST · 60%"} SCENARIO</div><h3 class="sip-total-amount-breathing">${money(s.finalCorpusINR,currency,fx)}</h3><p>${result.years}-year projection · ${money(s.investedINR,currency,fx)} total SIP contributions · ${pct(s.roiPercent)} modeled return</p></div><div class="sip-selected-roi ${cls(s.roiPercent)}">${pct(s.roiPercent)}</div></div>
      <div class="sip-detail-summary">
        <div><span>NET TRADING P&amp;L</span><strong class="${cls(s.netPnlINR)}">${signed(s.netPnlINR,currency,fx)}</strong></div>
        <div><span>FINAL POSITION</span><strong>${s.monthly[s.monthly.length-1].positionEth.toFixed(4)} ETH</strong></div>
        <div><span>FINAL YEAR MULTIPLIER</span><strong>${multiplierForYear(result.years)}× BASE</strong></div>
        <div><span>HISTORICAL BASELINE</span><strong>${result.baselineMonths.length} MONTHS</strong></div>
      </div>
      ${yearTable(s,currency)}${monthlyTable(s,currency)}${sourceIntelligence({
        ...result.baselineMonths.reduce((a,m)=>({
          trades:a.trades+m.trades, evidenceTotal:a.evidenceTotal+m.evidenceTotal, evidenceCount:a.evidenceCount+m.evidenceCount,
          riskAccepts:a.riskAccepts+m.riskAccepts, riskRejects:a.riskRejects+m.riskRejects
        }),{trades:0,evidenceTotal:0,evidenceCount:0,riskAccepts:0,riskRejects:0}),
        fxRate:s.fxRate, baselineCostTotals:result.baselineCostTotals
      },currency,result.sourceTotals)}${riskControl(s,currency)}
    </section>`;
    const toggle=detail.querySelector(".sip-monthly-toggle");
    toggle.addEventListener("click",()=>{const box=toggle.closest(".sip-monthly-accordion"),open=box.classList.toggle("open");toggle.setAttribute("aria-expanded",open);toggle.querySelector("strong").textContent=open?"−":"＋"});
  }

  function renderResults(result,target,currency){
    if(!target||!result)return;
    let selected="base";
    const draw=()=>{
      const base=result.scenarios.base,fx=base.fxRate;
      target.innerHTML=`<div class="sip-results-heading"><div class="result-label">REAL BOT DATA · SIP PROJECTION</div><h2>${money(base.finalCorpusINR,currency,fx)} projected corpus</h2><p>${result.years}-year model · latest ${result.baselineMonths.length} completed historical months (${result.baselineMonths[0].month} → ${result.baselineMonths[result.baselineMonths.length-1].month}) from the simulator API. Historical monthly points are reused cyclically for the selected horizon.</p></div>
      <div class="sip-summary"><div class="sip-summary-box"><span>MONTHLY SIP</span><strong>${inputMoney(result,fx)}</strong></div><div class="sip-summary-box"><span>BASE POSITION</span><strong>${result.basePositionEth.toFixed(4)} ETH</strong></div><div class="sip-summary-box"><span>LEVERAGE</span><strong>${Number(result.leverage||10)}×</strong></div><div class="sip-summary-box"><span>HORIZON</span><strong>${result.years} YEARS</strong></div></div>
      <div class="sip-conservative-disclaimer">
        <div class="sip-conservative-title">⚠ CONSERVATIVE HISTORICAL PROJECTION</div>
        <div class="sip-conservative-copy">Future returns are modeled at <span class="projection-rate rate-20">20%</span> / <span class="projection-rate rate-40">40%</span> / <span class="projection-rate rate-60">60%</span> of historical performance for Worst / Base / Best scenarios. Losses are included and compounded normally. This is a mathematical scenario based on historical data, <strong>not a return guarantee.</strong></div>
        <div class="sip-conservative-copy">Actual results can differ materially because of market conditions, volatility, fees, funding, slippage, execution, leverage, liquidity, position sizing, missed trades and other factors.</div>
        <div class="sip-conservative-warning">NO GUARANTEED RETURNS · NOT FINANCIAL ADVICE · HISTORICAL DATA ONLY</div>
      </div>
      <div class="sip-scenario-list">${scenarioCard(result.scenarios.base,"base","BASE · 40%","Historical monthly performance at 40% scale.",currency,selected==="base")}${scenarioCard(result.scenarios.worst,"worst","WORST · 20%","Historical monthly performance at 20% scale.",currency,selected==="worst")}${scenarioCard(result.scenarios.best,"best","BEST · 60%","Historical monthly performance at 60% scale.",currency,selected==="best")}</div>
      <div id="sipSelectedDetail"></div>`;
      target.querySelectorAll(".sip-scenario-card").forEach(card=>card.addEventListener("click",()=>{selected=card.dataset.scenario;draw();requestAnimationFrame(()=>target.querySelector("#sipSelectedDetail")?.scrollIntoView({behavior:"smooth",block:"start"}))}));
      renderSelected(result,target,currency,selected);
    };
    draw();
  }
  window.ETHTRENDsSIPUI={renderResults};
})();