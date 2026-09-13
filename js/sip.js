/* ETHTRENDs SIP ENGINE
   Source of truth: simulator API trade record.
   No hard-coded historical P&L.
*/
(function () {
  "use strict";

  const CONFIG = Object.freeze({
    MIN_SIP: 2000,
    SIP_UNIT_INR: 1000,
    ETH_PER_SIP_UNIT: 0.01,
    LEVERAGE: 10,
    YEARS: 5,
    BASELINE_MONTHS: 8,
    YEAR_MULTIPLIERS: Object.freeze({
      1: 5,
      2: 10,
      3: 20,
      4: 30,
      5: 40
    }),
    SCENARIOS: Object.freeze({
      worst: 0.50,
      base: 1.00,
      best: 1.50
    })
  });

  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };

  function validateSip(monthlySip) {
    const sip = n(monthlySip);
    if (sip < CONFIG.MIN_SIP || sip % CONFIG.SIP_UNIT_INR !== 0) {
      throw new Error("Monthly SIP must be at least ₹2,000 and in ₹1,000 multiples.");
    }
    return sip;
  }

  function basePosition(monthlySip) {
    return (validateSip(monthlySip) / CONFIG.SIP_UNIT_INR) * CONFIG.ETH_PER_SIP_UNIT;
  }

  function calculatePosition(monthlySip, monthIndex) {
    const base = basePosition(monthlySip);
    const m = Math.max(1, Math.floor(n(monthIndex)));
    if (m <= 4) return base * m;
    if (m <= 12) return base * 5;

    const year = Math.min(CONFIG.YEARS, Math.ceil(m / 12));
    return base * CONFIG.YEAR_MULTIPLIERS[year];
  }

  function buildPositionSchedule(monthlySip) {
    validateSip(monthlySip);
    const rows = [];
    for (let month = 1; month <= CONFIG.YEARS * 12; month++) {
      rows.push({
        month,
        year: Math.ceil(month / 12),
        positionEth: calculatePosition(monthlySip, month)
      });
    }
    return rows;
  }

  function extractPoints(trade) {
    if (trade && Number.isFinite(Number(trade.points))) return Number(trade.points);

    const entry = n(trade && (trade.entryPrice ?? trade.entry_price));
    const exit = n(trade && (trade.exitPrice ?? trade.exit_price));
    const side = String(trade && trade.side || "").toUpperCase();

    if (!entry || !exit) return 0;
    return side === "SHORT" ? entry - exit : exit - entry;
  }

  function normalizeTrade(trade, index) {
    const exitTime = trade && (trade.exitTime ?? trade.exit_time ?? trade.closedAt ?? trade.exit_time_utc);
    const entryTime = trade && (trade.entryTime ?? trade.entry_time ?? trade.entry_time_utc);
    return {
      index,
      side: String(trade && trade.side || "").toUpperCase(),
      entryTime: entryTime ? String(entryTime) : "",
      exitTime: exitTime ? String(exitTime) : "",
      entryPrice: n(trade && (trade.entryPrice ?? trade.entry_price)),
      exitPrice: n(trade && (trade.exitPrice ?? trade.exit_price)),
      points: extractPoints(trade)
    };
  }

  function monthKey(value) {
    const s = String(value || "");
    const m = s.match(/^(\d{4})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}` : "";
  }

  function getCompletedMonths(trades) {
    const keys = [...new Set(
      trades.map(t => monthKey(t.exitTime)).filter(Boolean)
    )].sort();

    if (!keys.length) return [];

    // Never use the current partial calendar month as a historical baseline.
    const now = new Date();
    const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const completed = keys.filter(k => k < currentKey);

    return completed.slice(-CONFIG.BASELINE_MONTHS);
  }

  function groupPointsByMonth(trades) {
    const normalized = trades.map(normalizeTrade);
    const baselineKeys = getCompletedMonths(normalized);
    const baselineSet = new Set(baselineKeys);

    const groups = {};
    for (const t of normalized) {
      const key = monthKey(t.exitTime);
      if (!baselineSet.has(key)) continue;
      if (!groups[key]) {
        groups[key] = { month: key, points: 0, trades: 0, wins: 0, losses: 0 };
      }
      groups[key].points += t.points;
      groups[key].trades += 1;
      if (t.points > 0) groups[key].wins += 1;
      else if (t.points < 0) groups[key].losses += 1;
    }

    return baselineKeys.map(key => groups[key] || {
      month: key, points: 0, trades: 0, wins: 0, losses: 0
    });
  }

  function projectScenario(monthlySip, baselineMonths, multiplier, fxRate) {
    const sip = validateSip(monthlySip);
    const fx = Math.max(0.000001, n(fxRate) || 102);
    const baseline = baselineMonths.length ? baselineMonths : [{month:"N/A",points:0,trades:0,wins:0,losses:0}];

    let corpusINR = 0;
    const monthly = [];

    for (let month = 1; month <= CONFIG.YEARS * 12; month++) {
      const year = Math.ceil(month / 12);
      const positionEth = calculatePosition(sip, month);
      const source = baseline[(month - 1) % baseline.length];

      const scenarioPoints = source.points * multiplier;
      const pnlUSD = scenarioPoints * positionEth;
      const pnlINR = pnlUSD * fx;
      const contributionINR = sip;
      const openingINR = corpusINR;
      corpusINR = openingINR + contributionINR + pnlINR;

      monthly.push({
        month,
        year,
        sourceMonth: source.month,
        sourcePoints: source.points,
        scenarioPoints,
        positionEth,
        contributionINR,
        pnlUSD,
        pnlINR,
        openingINR,
        closingINR: corpusINR
      });
    }

    const investedINR = sip * 60;
    const netPnlINR = corpusINR - investedINR;
    const roiPercent = investedINR ? (netPnlINR / investedINR) * 100 : 0;

    return {
      monthly,
      finalCorpusINR: corpusINR,
      investedINR,
      netPnlINR,
      roiPercent,
      fxRate: fx,
      multiplier
    };
  }

  function yearSummaries(monthly) {
    const out = [];
    for (let year = 1; year <= CONFIG.YEARS; year++) {
      const rows = monthly.filter(x => x.year === year);
      if (!rows.length) continue;
      const invested = rows.reduce((s, x) => s + x.contributionINR, 0);
      const pnl = rows.reduce((s, x) => s + x.pnlINR, 0);
      const opening = rows[0].openingINR;
      const closing = rows[rows.length - 1].closingINR;
      out.push({
        year,
        investedINR: invested,
        pnlINR: pnl,
        openingINR: opening,
        closingINR: closing,
        returnPercent: invested ? (pnl / invested) * 100 : 0
      });
    }
    return out;
  }

  function run({ monthlySip, trades, fxRate = 102 }) {
    const sip = validateSip(monthlySip);
    if (!Array.isArray(trades) || !trades.length) {
      throw new Error("No completed historical trades were returned by the API.");
    }

    const baselineMonths = groupPointsByMonth(trades);
    if (!baselineMonths.length) {
      throw new Error("The API returned trades, but no completed historical months were available.");
    }

    const scenarios = {};
    for (const [name, multiplier] of Object.entries(CONFIG.SCENARIOS)) {
      const projected = projectScenario(sip, baselineMonths, multiplier, fxRate);
      scenarios[name] = {
        name,
        multiplier,
        ...projected,
        yearly: yearSummaries(projected.monthly)
      };
    }

    return {
      monthlySip: sip,
      basePositionEth: basePosition(sip),
      leverage: CONFIG.LEVERAGE,
      baselineMonths,
      baselineAveragePoints:
        baselineMonths.reduce((s, x) => s + x.points, 0) / baselineMonths.length,
      baselineTotalPoints:
        baselineMonths.reduce((s, x) => s + x.points, 0),
      scenarios,
      positionSchedule: buildPositionSchedule(sip),
      generatedAt: new Date().toISOString()
    };
  }

  window.ETHTRENDsSIP = {
    CONFIG,
    validateSip,
    basePosition,
    calculatePosition,
    buildPositionSchedule,
    normalizeTrade,
    groupPointsByMonth,
    run
  };
})();
