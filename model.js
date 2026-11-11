/*
 * Kansas Farm Decision Model: keep wheat or switch to sorghum
 * ------------------------------------------------------------
 * Expected (average-year) net return per acre for two crop choices facing a
 * Kansas grain farmer. All numbers are rounded, planning-level values; see the
 * "Where the numbers come from" section of index.html for sources.
 */
(function (root) {
  "use strict";

  var FARM = {
    acres: 780,   // avg Kansas farm size, 2022 Census of Agriculture
    horizon: 20   // years over which one-time switching costs are spread
  };

  var OPTIONS = {
    wheat: {
      key: "wheat",
      label: "Keep winter wheat",
      dryYield: 48, irrYield: 75,  // bu/acre (USDA NASS Kansas, ~10-yr avg)
      price: 5.75,                 // $/bu (USDA long-run baseline)
      prodCost: 200,               // $/acre operating + machinery, excl. land (K-State budgets)
      irrCost: 110,                // extra $/acre on irrigated acres (wheat needs ~10 in. of water)
      basePremium: 12,             // farmer-paid crop insurance $/acre (USDA RMA, Kansas)
      droughtLoss: 0.38,           // fraction of yield lost in a drought year (2022–23 Kansas wheat)
      heatSens: 0.06,              // fractional yield loss per °C of warming (Tack et al. 2015)
      oneTime: 0
    },
    sorghum: {
      key: "sorghum",
      label: "Switch to grain sorghum",
      dryYield: 80, irrYield: 112,
      price: 3.90,
      prodCost: 245,
      irrCost: 125,                // summer crop, needs more water (~14 in.)
      basePremium: 12,
      droughtLoss: 0.20,           // sorghum tolerates drought better than wheat
      heatSens: 0.035,             // sorghum's heat threshold is higher (C4 crop)
      oneTime: 50                  // $/acre: row-crop planter, header, learning curve
    }
  };

  var HEAT_BASE = 1.0; // how close Kansas crops already sit to their heat thresholds

  /**
   * s = { warming (°C), drought (drought years per decade), irrigation (0–1),
   *       premiumRise (0–1.5 = +0–150 %) }
   * Returns a per-acre, per-year breakdown for one crop.
   */
  function evaluate(opt, s) {
    var o = OPTIONS[opt];
    var dT = s.warming;
    var irr = s.irrigation;

    var baseYield = (1 - irr) * o.dryYield + irr * o.irrYield;

    // Heat: non-linear — each extra degree hurts more. Irrigation cools the canopy a little.
    var heatLoss = o.heatSens * dT * (1 + 0.15 * (dT + HEAT_BASE)) * (1 - 0.35 * irr);
    heatLoss = Math.min(0.9, Math.max(0, heatLoss));

    // Drought: probability x severity. Irrigation (VULNERABILITY) removes most of the
    // exposure, and heat makes each drought worse (higher evaporation).
    var exposure = 1 - 0.85 * irr;   // irrigated acres lose ~85 % less in a drought
    var droughtLoss = (s.drought / 10) * o.droughtLoss * exposure * (1 + 0.12 * dT);
    droughtLoss = Math.min(0.9, droughtLoss);

    var yieldAfterHeat = baseYield * (1 - heatLoss);
    var expYield = yieldAfterHeat * (1 - droughtLoss);
    var revenue = expYield * o.price;

    // Revenue-protection insurance repays roughly 40 % of drought losses on average
    var payout = 0.4 * yieldAfterHeat * droughtLoss * o.price;

    // Premiums rise with the slider AND with risk (more droughts, more heat);
    // irrigated acres are insured at lower rates, so exposure matters here too
    var premium = o.basePremium * (1 + s.premiumRise) * (0.4 + 0.2 * s.drought * exposure) * (1 + 0.1 * dT);

    // Irrigation gets more expensive as heat raises crop water demand
    var irrigation = irr * o.irrCost * (1 + 0.1 * dT);

    var oneTime = o.oneTime / FARM.horizon;

    var net = revenue + payout - o.prodCost - irrigation - premium - oneTime;

    return {
      key: opt, label: o.label,
      baseYield: baseYield, heatLossPct: heatLoss * 100, droughtLossPct: droughtLoss * 100,
      expYield: expYield, revenue: revenue, payout: payout,
      prodCost: o.prodCost, irrigation: irrigation, premium: premium,
      oneTime: oneTime, net: net, farmNet: net * FARM.acres
    };
  }

  function evaluateAll(s) {
    return ["wheat", "sorghum"].map(function (k) { return evaluate(k, s); });
  }

  function best(s) {
    var r = evaluateAll(s);
    return r[1].net > r[0].net ? r[1] : r[0];
  }

  root.FarmModel = { FARM: FARM, OPTIONS: OPTIONS, evaluate: evaluate, evaluateAll: evaluateAll, best: best };
})(typeof window !== "undefined" ? window : this);
