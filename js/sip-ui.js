window.ETHTRENDsSIPUI = (() => {
  const SIP = window.ETHTRENDsSIP;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatMoney(value, currency = "USD") {
    const symbol = currency === "INR" ? "₹" : "$";

    return `${symbol}${Number(value || 0).toLocaleString(
      currency === "INR" ? "en-IN" : "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )}`;
  }

  function formatEth(value) {
    return `${Number(value || 0).toFixed(4)} ETH`;
  }

  function formatPct(value) {
    const n = Number(value || 0);
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  }

  function signedMoney(value, currency = "USD") {
    const n = Number(value || 0);
    return `${n >= 0 ? "+" : "-"}${formatMoney(Math.abs(n), currency)}`;
  }

  function renderScenarioCard(scenario, currency) {
    const pnl = Number(scenario.totalPnl || 0);
    const roi = Number(scenario.roiPercent || 0);

    return `
      <div class="sip-scenario-card">
        <div class="sip-scenario-header">
          <div>
            <div class="sip-scenario-name">
              ${escapeHtml(scenario.label || scenario.name || "")}
            </div>
            <div class="sip-scenario-description">
              ${escapeHtml(scenario.description || "")}
            </div>
          </div>

          <div class="sip-scenario-roi ${roi >= 0 ? "positive" : "negative"}">
            ${formatPct(roi)}
          </div>
        </div>

        <div class="sip-scenario-grid">
          <div>
            <span>Total SIP</span>
            <strong>${formatMoney(scenario.totalSip, currency)}</strong>
          </div>

          <div>
            <span>Trading P&amp;L</span>
            <strong class="${pnl >= 0 ? "positive" : "negative"}">
              ${signedMoney(pnl, currency)}
            </strong>
          </div>

          <div>
            <span>Final Corpus</span>
            <strong>${formatMoney(scenario.finalCorpus, currency)}</strong>
          </div>

          <div>
            <span>Final Position</span>
            <strong>${formatEth(scenario.finalPositionEth)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  function renderYearTable(yearData, currency) {
    if (!yearData || !yearData.length) return "";

    return `
      <div class="sip-year-table-wrap">
        <table class="sip-year-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>SIP</th>
              <th>Position</th>
              <th>Trading P&amp;L</th>
              <th>Corpus</th>
            </tr>
          </thead>

          <tbody>
            ${yearData.map(year => `
              <tr>
                <td>Year ${year.year}</td>
                <td>${formatMoney(year.sipContribution, currency)}</td>
                <td>${formatEth(year.positionEth)}</td>
                <td class="${Number(year.tradingPnl) >= 0 ? "positive" : "negative"}">
                  ${signedMoney(year.tradingPnl, currency)}
                </td>
                <td>${formatMoney(year.corpus, currency)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderMonthlyTable(months, currency) {
    if (!months || !months.length) return "";

    return `
      <div class="sip-monthly-section">
        <div class="sip-section-title">
          MONTHLY PROJECTION
        </div>

        <div class="sip-monthly-table-wrap">
          <table class="sip-monthly-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Position</th>
                <th>Historical Points</th>
                <th>Trading P&amp;L</th>
                <th>Corpus</th>
              </tr>
            </thead>

            <tbody>
              ${months.map(month => `
                <tr>
                  <td>${escapeHtml(month.label || month.month || "")}</td>

                  <td>
                    ${formatEth(month.positionEth)}
                  </td>

                  <td>
                    ${Number(month.points || 0).toFixed(2)}
                  </td>

                  <td class="${Number(month.tradingPnl) >= 0 ? "positive" : "negative"}">
                    ${signedMoney(month.tradingPnl, currency)}
                  </td>

                  <td>
                    ${formatMoney(month.corpus, currency)}
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderProjection(scenario, container, currency) {
    if (!container || !scenario) return;

    container.innerHTML = `
      <div class="sip-result-header">
        <div>
          <div class="sip-result-kicker">
            ${escapeHtml(scenario.label || "PROJECTION")}
          </div>

          <div class="sip-result-title">
            ${formatMoney(scenario.finalCorpus, currency)}
          </div>

          <div class="sip-result-subtitle">
            Projected final corpus after ${scenario.months?.length || 0} months
          </div>
        </div>

        <div class="sip-result-roi ${Number(scenario.roiPercent) >= 0 ? "positive" : "negative"}">
          ${formatPct(scenario.roiPercent)}
        </div>
      </div>

      <div class="sip-summary-grid">

        <div class="sip-summary-box">
          <span>Total SIP Invested</span>
          <strong>
            ${formatMoney(scenario.totalSip, currency)}
          </strong>
        </div>

        <div class="sip-summary-box">
          <span>Total Trading P&amp;L</span>
          <strong class="${Number(scenario.totalPnl) >= 0 ? "positive" : "negative"}">
            ${signedMoney(scenario.totalPnl, currency)}
          </strong>
        </div>

        <div class="sip-summary-box">
          <span>Final Position</span>
          <strong>
            ${formatEth(scenario.finalPositionEth)}
          </strong>
        </div>

        <div class="sip-summary-box">
          <span>Leverage</span>
          <strong>10×</strong>
        </div>

      </div>

      ${renderYearTable(scenario.yearly, currency)}
      ${renderMonthlyTable(scenario.months, currency)}
    `;
  }

  function renderResults(result, root, currency) {
    if (!root || !result) return;

    const scenarios = result.scenarios || {};

    root.innerHTML = `
      <div class="sip-results">

        <div class="sip-results-heading">
          <div class="section-kicker">
            SIP PROJECTION
          </div>

          <h2>
            ETHTRENDs Long-Term Corpus Simulation
          </h2>

          <p>
            Projection based on historical ETHTRENDs trading performance.
            Historical results are not a guarantee of future returns.
          </p>
        </div>

        <div class="sip-scenario-list">

          ${scenarios.worst
            ? renderScenarioCard(scenarios.worst, currency)
            : ""}

          ${scenarios.base
            ? renderScenarioCard(scenarios.base, currency)
            : ""}

          ${scenarios.best
            ? renderScenarioCard(scenarios.best, currency)
            : ""}

        </div>

        <div class="sip-primary-projection">
          ${
            scenarios.base
              ? `
                <div class="sip-section-title">
                  BASE PROJECTION
                </div>

                <div id="sipBaseProjection"></div>
              `
              : ""
          }
        </div>

      </div>
    `;

    if (scenarios.base) {
      const baseContainer = root.querySelector("#sipBaseProjection");

      renderProjection(
        scenarios.base,
        baseContainer,
        currency
      );
    }
  }

  return {
    renderResults,
    renderProjection
  };
})();