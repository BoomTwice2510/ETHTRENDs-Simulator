/* ============================================================
   ETHTRENDs SIP PROJECTION ENGINE
   ------------------------------------------------------------
   Responsibilities:
   - Validate SIP inputs
   - Calculate ETH position schedule
   - Replay historical bot P&L
   - Build monthly/yearly corpus evolution
   - Generate Worst / Base / Best scenarios
   - Keep FX conversion outside the calculation engine
   ============================================================ */

window.ETHTRENDsSIP = (() => {

  // ============================================================
  // FIXED SIP RULES
  // ============================================================

  const CONFIG = Object.freeze({
    MIN_SIP: 2000,

    // Every ₹1,000 SIP = 0.01 ETH base position
    SIP_UNIT_INR: 1000,
    ETH_PER_SIP_UNIT: 0.01,

    // SIP trading leverage is fixed
    LEVERAGE: 10,

    // Projection limit
    MAX_YEARS: 5,

    // Year-wise position scaling
    //
    // Year 1:
    // Month 1 = 1x base
    // Month 2 = 2x base
    // Month 3 = 3x base
    // Month 4 = 4x base
    // Month 5-12 = 5x base
    //
    // Year 2 = 10x base
    // Year 3 = 20x base
    // Year 4 = 30x base
    // Year 5 = 40x base
    YEAR_MULTIPLIERS: Object.freeze({
      1: 5,
      2: 10,
      3: 20,
      4: 30,
      5: 40
    })
  });


  // ============================================================
  // BASIC HELPERS
  // ============================================================

  function number(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }


  function round(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round((number(value) + Number.EPSILON) * factor) / factor;
  }


  // ============================================================
  // INPUT VALIDATION
  // ============================================================

  function validateInput({
    monthlySIP,
    years
  }) {
    const sip = number(monthlySIP);
    const period = number(years);

    if (sip < CONFIG.MIN_SIP) {
      throw new Error(
        `Minimum monthly SIP is ₹${CONFIG.MIN_SIP.toLocaleString('en-IN')}.`
      );
    }

    if (sip % CONFIG.SIP_UNIT_INR !== 0) {
      throw new Error(
        'Monthly SIP must be in multiples of ₹1,000.'
      );
    }

    if (![1, 2, 3, 4, 5].includes(period)) {
      throw new Error(
        'Projection period must be between 1 and 5 years.'
      );
    }

    return {
      monthlySIP: sip,
      years: period
    };
  }


  // ============================================================
  // BASE POSITION
  // ============================================================

  /*
     Example:

     ₹2,000  → 0.02 ETH
     ₹5,000  → 0.05 ETH
     ₹10,000 → 0.10 ETH

     Formula:

     (SIP / 1000) × 0.01 ETH
  */

  function calculateBasePosition(monthlySIP) {
    const sip = number(monthlySIP);

    return round(
      (sip / CONFIG.SIP_UNIT_INR) *
      CONFIG.ETH_PER_SIP_UNIT,
      4
    );
  }


  // ============================================================
  // MONTHLY POSITION SCHEDULE
  // ============================================================

  function calculatePosition(monthlySIP, monthNumber) {

    const basePosition = calculateBasePosition(monthlySIP);

    const month = number(monthNumber);

    if (month < 1) {
      return 0;
    }

    const year = Math.ceil(month / 12);
    const monthInYear = ((month - 1) % 12) + 1;

    let multiplier;

    if (year === 1) {

      // First five months ramp up:
      //
      // M1 = 1x
      // M2 = 2x
      // M3 = 3x
      // M4 = 4x
      // M5-M12 = 5x

      multiplier = Math.min(monthInYear, 5);

    } else {

      multiplier =
        CONFIG.YEAR_MULTIPLIERS[
          Math.min(year, CONFIG.MAX_YEARS)
        ];
    }

    return round(basePosition * multiplier, 4);
  }


  // ============================================================
  // COMPLETE POSITION SCHEDULE
  // ============================================================

  function buildPositionSchedule(monthlySIP, years) {

    const totalMonths = years * 12;
    const schedule = [];

    for (let month = 1; month <= totalMonths; month++) {

      const year = Math.ceil(month / 12);
      const monthInYear = ((month - 1) % 12) + 1;

      schedule.push({
        month,
        year,
        monthInYear,
        monthlySIP: number(monthlySIP),
        positionETH: calculatePosition(monthlySIP, month),
        leverage: CONFIG.LEVERAGE
      });
    }

    return schedule;
  }


  // ============================================================
  // TRADE DATA NORMALIZATION
  // ============================================================

  /*
     The backend may eventually return slightly different field
     names. Keep normalization here so the rest of SIP engine
     doesn't care about API naming.
  */

  function normalizeTrade(trade) {

    const points = number(
      trade.points ??
      trade.pnlPoints ??
      trade.performancePoints ??
      trade.movement ??
      0
    );

    const pnl = number(
      trade.pnl ??
      trade.profitLoss ??
      trade.netPnl ??
      0
    );

    const exitTime =
      trade.exitTime ??
      trade.exit_time ??
      trade.exitTimeUtc ??
      trade.exit_time_utc ??
      trade.closeTime ??
      trade.close_time ??
      null;

    return {
      ...trade,
      points,
      pnl,
      exitTime
    };
  }


  // ============================================================
  // EXTRACT HISTORICAL PERFORMANCE
  // ============================================================

  /*
     IMPORTANT:

     SIP projection should preferably use POINTS from the bot.

     Why?

     Existing historical P&L depends on position size.

     SIP has its own dynamically changing ETH position.

     Therefore:

        SIP Trade P&L
        =
        Bot Trade Points × SIP ETH Position

     We do NOT reuse historical dollar P&L directly.
  */

  function extractPoints(trade) {

    const t = normalizeTrade(trade);

    if (Number.isFinite(t.points) && t.points !== 0) {
      return t.points;
    }

    /*
       If backend gives entry/exit + side but no points,
       calculate points from prices.
    */

    const entry = number(
      trade.entryPrice ??
      trade.entry_price
    );

    const exit = number(
      trade.exitPrice ??
      trade.exit_price
    );

    const side = String(
      trade.side ??
      trade.direction ??
      ''
    ).toUpperCase();

    if (
      Number.isFinite(entry) &&
      Number.isFinite(exit) &&
      entry > 0 &&
      exit > 0
    ) {

      if (side === 'SHORT') {
        return entry - exit;
      }

      return exit - entry;
    }

    return 0;
  }


  // ============================================================
  // GROUP HISTORICAL DATA BY EXIT MONTH
  // ============================================================

  /*
     Existing simulator uses completed trade exit month.

     SIP follows the same realized-performance principle.
  */

  function getMonthKey(dateValue) {

    if (!dateValue) {
      return null;
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return (
      `${date.getUTCFullYear()}-` +
      String(date.getUTCMonth() + 1).padStart(2, '0')
    );
  }


  function groupPointsByMonth(trades) {

    const monthly = {};

    for (const rawTrade of trades || []) {

      const trade = normalizeTrade(rawTrade);
      const monthKey = getMonthKey(trade.exitTime);

      if (!monthKey) {
        continue;
      }

      const points = extractPoints(trade);

      if (!monthly[monthKey]) {
        monthly[monthKey] = {
          month: monthKey,
          points: 0,
          trades: 0
        };
      }

      monthly[monthKey].points += points;
      monthly[monthKey].trades += 1;
    }

    return Object.values(monthly)
      .sort((a, b) => a.month.localeCompare(b.month));
  }


  // ============================================================
  // BUILD HISTORICAL BASELINE
  // ============================================================

  function buildHistoricalBaseline(trades) {

    const monthly = groupPointsByMonth(trades);

    if (!monthly.length) {
      throw new Error(
        'No completed historical trade performance was returned by the API.'
      );
    }

    const totalPoints = monthly.reduce(
      (sum, item) => sum + number(item.points),
      0
    );

    const averageMonthlyPoints =
      totalPoints / monthly.length;

    return {
      months: monthly,
      totalPoints: round(totalPoints, 4),
      monthCount: monthly.length,
      averageMonthlyPoints: round(averageMonthlyPoints, 4)
    };
  }


  // ============================================================
  // SCENARIO FACTORS
  // ============================================================

  /*
     These are performance scenarios, NOT probabilities.

     Worst = 50% of historical performance
     Base  = 100%
     Best  = 150%

     This makes the distinction explicit so the UI can explain
     that these are scenario assumptions, not guarantees.
  */

  const SCENARIOS = Object.freeze({
    worst: {
      key: 'worst',
      label: 'WORST',
      factor: 0.50
    },

    base: {
      key: 'base',
      label: 'BASE',
      factor: 1.00
    },

    best: {
      key: 'best',
      label: 'BEST',
      factor: 1.50
    }
  });


  // ============================================================
  // PROJECT ONE SCENARIO
  // ============================================================

  function projectScenario({
    monthlySIP,
    years,
    historicalMonths,
    scenarioFactor
  }) {

    const schedule =
      buildPositionSchedule(monthlySIP, years);

    const totalMonths = years * 12;

    let corpus = 0;
    let totalContribution = 0;
    let totalTradingPnl = 0;

    const months = [];

    for (let monthIndex = 0; monthIndex < totalMonths; monthIndex++) {

      const monthNumber = monthIndex + 1;
      const position = schedule[monthIndex];

      /*
         Historical months are repeated cyclically.

         Example:
         Month 9 projection uses historical month 1 again
         Month 10 uses historical month 2, etc.

         When newer bot data is added, this historical pool
         automatically changes because the API data changes.
      */

      const historical =
        historicalMonths[
          monthIndex % historicalMonths.length
        ];

      const historicalPoints =
        number(historical.points);

      /*
         Scenario performance adjustment.
      */

      const scenarioPoints =
        historicalPoints * scenarioFactor;

      /*
         Trading P&L:

         points × ETH position

         Leverage is NOT multiplied again.
      */

      const tradingPnl =
        scenarioPoints * position.positionETH;

      const contribution =
        number(monthlySIP);

      corpus += contribution;
      corpus += tradingPnl;

      totalContribution += contribution;
      totalTradingPnl += tradingPnl;

      months.push({
        month: monthNumber,
        year: position.year,
        monthInYear: position.monthInYear,

        contribution: round(contribution, 2),

        positionETH: position.positionETH,
        leverage: CONFIG.LEVERAGE,

        sourceMonth: historical.month,
        sourcePoints: round(historicalPoints, 4),

        scenarioPoints: round(scenarioPoints, 4),

        tradingPnl: round(tradingPnl, 2),

        corpus: round(corpus, 2)
      });
    }


    const roi =
      totalContribution > 0
        ? (totalTradingPnl / totalContribution) * 100
        : 0;

    return {
      scenarioFactor,

      finalCorpus: round(corpus, 2),

      totalContribution:
        round(totalContribution, 2),

      totalTradingPnl:
        round(totalTradingPnl, 2),

      roiPercent:
        round(roi, 2),

      months
    };
  }


  // ============================================================
  // PROJECT ALL SCENARIOS
  // ============================================================

  function project({
    monthlySIP,
    years,
    trades
  }) {

    const validated =
      validateInput({
        monthlySIP,
        years
      });

    const historical =
      buildHistoricalBaseline(trades);

    const scenarios = {};

    for (const scenario of Object.values(SCENARIOS)) {

      scenarios[scenario.key] =
        projectScenario({
          monthlySIP: validated.monthlySIP,
          years: validated.years,
          historicalMonths: historical.months,
          scenarioFactor: scenario.factor
        });
    }


    // ==========================================================
    // YEARLY SUMMARY
    // ==========================================================

    const yearly = {};

    for (const [key, scenario] of Object.entries(scenarios)) {

      yearly[key] = [];

      for (let year = 1; year <= validated.years; year++) {

        const yearMonths =
          scenario.months.filter(
            item => item.year === year
          );

        if (!yearMonths.length) {
          continue;
        }

        const last =
          yearMonths[yearMonths.length - 1];

        const contribution =
          yearMonths.reduce(
            (sum, item) => sum + item.contribution,
            0
          );

        const tradingPnl =
          yearMonths.reduce(
            (sum, item) => sum + item.tradingPnl,
            0
          );

        yearly[key].push({
          year,

          contribution:
            round(contribution, 2),

          tradingPnl:
            round(tradingPnl, 2),

          corpus:
            round(last.corpus, 2),

          positionAtYearEnd:
            last.positionETH
        });
      }
    }


    return {
      input: {
        monthlySIP: validated.monthlySIP,
        years: validated.years,

        basePositionETH:
          calculateBasePosition(validated.monthlySIP),

        leverage: CONFIG.LEVERAGE
      },

      rules: {
        minSIP: CONFIG.MIN_SIP,
        sipUnitINR: CONFIG.SIP_UNIT_INR,
        ethPerUnit: CONFIG.ETH_PER_SIP_UNIT,
        leverage: CONFIG.LEVERAGE
      },

      historical: {
        monthCount: historical.monthCount,

        totalPoints:
          historical.totalPoints,

        averageMonthlyPoints:
          historical.averageMonthlyPoints,

        months:
          historical.months
      },

      scenarios,

      yearly,

      positionSchedule:
        buildPositionSchedule(
          validated.monthlySIP,
          validated.years
        )
    };
  }


  // ============================================================
  // PUBLIC API
  // ============================================================

  return Object.freeze({

    CONFIG,

    SCENARIOS,

    validateInput,

    calculateBasePosition,

    calculatePosition,

    buildPositionSchedule,

    normalizeTrade,

    extractPoints,

    groupPointsByMonth,

    buildHistoricalBaseline,

    project

  });

})();