/* ETHTRENDs SIP UI */
(function () {
  "use strict";

  const moneyINR = (v) =>
    "₹" + Number(v || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 0
    });

  const moneyUSD = (v, fx) =>
    "$" + (Number(v || 0) / Math.max(0.000001, Number(fx) || 102)).toLocaleString("en-US", {
      maximumFractionDigits: 2
    });

  function money(v, currency, fx) {
    return currency === "USD" ? moneyUSD(v, fx) : moneyINR(v);
  }

  function signed(v, currency, fx) {
    const x = Number(v || 0);
    return (x >= 0 ? "+" : "−") + money(Math.abs(x), currency, fx);
  }

  function pct(v) {
    const x = Number(v || 0);
    return (x >= 0 ? "+" : "−") + Math.abs(x).toLocaleString("en-IN", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + "%";
  }

  function cls(v) {
    return Number(v || 0) >= 0 ? "sip-positive" : "sip-negative";
  }

  function scenarioCard(scenario, label, description, result, currency) {
    const fx = result.scenarios.base.fxRate;
    return `
      <div class="sip-scenario-card ${scenario === "base" ? "base" : ""}">
        <div class="sip-scenario-header">
          <div>
            <div class="sip-scenario-name">${label}</div>
            <div class="sip-scenario-description">${description}</div>
          </div>
          <div class="sip-scenario-roi ${cls(result.scenarios[scenario].roiPercent)}">
            ${pct(result.scenarios[scenario].roiPercent)}
          </div>
        </div>
        <div class="sip-scenario-grid">
          <div><span>FINAL CORPUS</span><strong>${money(result.scenarios[scenario].finalCorpusINR, currency, fx)}</strong></div>
          <div><span>NET P&amp;L</span><strong class="${cls(result.scenarios[scenario].netPnlINR)}">${signed(result.scenarios[scenario].netPnlINR, currency, fx)}</strong></div>
          <div><span>INVESTED</span><strong>${money(result.scenarios[scenario].investedINR, currency, fx)}</strong></div>
          <div><span>5-YEAR MODEL</span><strong>${result.scenarios[scenario].multiplier.toFixed(2)}×</strong></div>
        </div>
      </div>
    `;
  }

  function renderYearTable(base, currency) {
    const fx = base.fxRate;
    return `
      <div class="sip-section-title">YEAR-BY-YEAR CORPUS</div>
      <div class="sip-table-wrap">
        <table class="sip-table">
          <thead>
            <tr>
              <th>YEAR</th><th>POSITION</th><th>INVESTED</th><th>TRADING P&amp;L</th><th>ENDING CORPUS</th>
            </tr>
          </thead>
          <tbody>
            ${base.yearly.map(y => {
              const pos = y.year === 1
                ? `${base.monthly.find(m => m.year === 1)?.positionEth.toFixed(4)} ETH → 5×`
                : `${y.year === 2 ? "10×" : y.year === 3 ? "20×" : y.year === 4 ? "30×" : "40×"} base`;
              return `
                <tr>
                  <td>YEAR ${y.year}</td>
                  <td>${pos}</td>
                  <td>${money(y.investedINR, currency, fx)}</td>
                  <td class="${cls(y.pnlINR)}">${signed(y.pnlINR, currency, fx)}</td>
                  <td><strong>${money(y.closingINR, currency, fx)}</strong></td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderMonthlyTable(base, currency) {
    const fx = base.fxRate;
    return `
      <div class="sip-section-title">MONTHLY PROJECTION · BASE SCENARIO</div>
      <div class="sip-table-wrap">
        <table class="sip-table">
          <thead>
            <tr>
              <th>MONTH</th><th>SOURCE</th><th>POSITION</th><th>SIP</th><th>TRADING P&amp;L</th><th>CORPUS</th>
            </tr>
          </thead>
          <tbody>
            ${base.monthly.map(m => `
              <tr>
                <td>M${m.month} · Y${m.year}</td>
                <td>${m.sourceMonth}</td>
                <td>${m.positionEth.toFixed(4)} ETH</td>
                <td>${money(m.contributionINR, currency, fx)}</td>
                <td class="${cls(m.pnlINR)}">${signed(m.pnlINR, currency, fx)}</td>
                <td><strong>${money(m.closingINR, currency, fx)}</strong></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderResults(result, target, currency) {
    if (!target || !result) return;

    const base = result.scenarios.base;
    const fx = base.fxRate;
    const first = result.positionSchedule.slice(0, 5);

    target.innerHTML = `
      <div class="sip-results-heading">
        <div class="result-label">REAL BOT DATA · SIP PROJECTION</div>
        <h2>${money(base.finalCorpusINR, currency, fx)} projected corpus</h2>
        <p>
          Based on the latest ${result.baselineMonths.length} completed historical months
          (${result.baselineMonths[0].month} → ${result.baselineMonths[result.baselineMonths.length - 1].month})
          from the simulator API. Historical points are reused cyclically for the projection.
        </p>
      </div>

      <div class="sip-summary">
        <div class="sip-summary-box"><span>MONTHLY SIP</span><strong>${money(result.monthlySip, "INR", fx)}</strong></div>
        <div class="sip-summary-box"><span>BASE POSITION</span><strong>${result.basePositionEth.toFixed(4)} ETH</strong></div>
        <div class="sip-summary-box"><span>LEVERAGE</span><strong>${result.leverage}× FIXED</strong></div>
        <div class="sip-summary-box"><span>HISTORICAL POINTS</span><strong>${result.baselineTotalPoints.toFixed(2)}</strong></div>
      </div>

      <div class="sip-scenario-list">
        ${scenarioCard("worst", "WORST · 50%", "Historical monthly performance at half scale.", result, currency)}
        ${scenarioCard("base", "BASE · 100%", "Historical monthly performance repeated at full scale.", result, currency)}
        ${scenarioCard("best", "BEST · 150%", "Historical monthly performance at 1.5× scale.", result, currency)}
      </div>

      <div class="sip-result-card sip-primary-projection">
        <div class="sip-result-header">
          <div>
            <div class="sip-result-kicker">BASE SCENARIO · 100% HISTORICAL SCALE</div>
            <div class="sip-result-title">${money(base.finalCorpusINR, currency, fx)}</div>
            <div class="sip-result-subtitle">5-year projected corpus · ${money(base.investedINR, currency, fx)} total SIP contributions</div>
          </div>
          <div class="sip-result-roi ${cls(base.roiPercent)}">${pct(base.roiPercent)}</div>
        </div>

        <div class="sip-summary">
          <div class="sip-summary-box"><span>NET TRADING P&amp;L</span><strong class="${cls(base.netPnlINR)}">${signed(base.netPnlINR, currency, fx)}</strong></div>
          <div class="sip-summary-box"><span>YEAR 1 POSITION</span><strong>${first.map(x => x.positionEth.toFixed(2)).join(" → ")} ETH</strong></div>
          <div class="sip-summary-box"><span>YEAR 2</span><strong>10× BASE</strong></div>
          <div class="sip-summary-box"><span>YEAR 3–5</span><strong>20× / 30× / 40×</strong></div>
        </div>

        ${renderYearTable(base, currency)}
        ${renderMonthlyTable(base, currency)}

        <div class="sip-disclaimer">
          Historical performance is not a forecast or guarantee. Worst/Base/Best are scaling scenarios,
          not probabilities. Actual results can differ because of market conditions, fees, funding,
          slippage, execution, leverage and other factors.
        </div>
      </div>
    `;
  }

  window.ETHTRENDsSIPUI = { renderResults };
})();
