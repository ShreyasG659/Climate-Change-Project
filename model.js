/*
 * Kansas Farm Decision Model
 * --------------------------
 * Expected (average-year) net return per acre for three choices facing a
 * Kansas grain farmer. All numbers are rounded, planning-level values; see the
 * "Where the numbers come from" section of index.html for sources.
 */
(function (root) {
  "use strict";

  // Farm-level assumptions
  var FARM = {
    acres: 780,          // avg Kansas farm size, 2022 Census of Agriculture
    ksLandValue: 2600,   // $/acre, Kansas cropland (USDA NASS Land Values 2024, rounded)
    sellCostPct: 0.06,   // realtor/auction + closing costs when selling land
    loanRate: 0.065,     // farm real-estate loan rate (Kansas City Fed ag credit survey, 2024)
    horizon: 20,         // years over which one-time costs are spread
    moveCost: 150000     // moving household + equipment, re-establishing ($, one-time)
  };

  // Crop / location options
  var OPTIONS = {
    wheat: {
      key: "wheat",
      label: "Stay: winter wheat (Kansas)",
      short: "Stay — wheat",
      kansas: true,
      dryYield: 48, irrYield: 70,  // bu/acre (USDA NASS Kansas, ~10-yr avg)
      price: 5.75,                 // $/bu (USDA long-run baseline)
      prodCost: 200,               // $/acre operating + machinery, excl. land (K-State budgets)
      irrCost: 140,                // extra $/acre on irrigated acres (pumping, water, equipment)
      basePremium: 12,             // farmer-paid crop insurance $/acre (USDA RMA, Kansas)
      droughtLoss: 0.35,           // fraction of yield lost in a drought year (2022–23 Kansas wheat)
      heatSens: 0.06,              // fractional yield loss per °C of warming (Tack et al. 2015)
      heatBase: 1.0,               // how close the crop already sits to its heat threshold
      oneTime: 0
    },
    sorghum: {
      key: "sorghum",
      label: "Switch: grain sorghum (Kansas)",
      short: "Switch — sorghum",
      kansas: true,
      dryYield: 80, irrYield: 115,
      price: 3.90,
      prodCost: 245,
      irrCost: 120,
      basePremium: 14,
      droughtLoss: 0.22,           // sorghum tolerates drought better than wheat/corn
      heatSens: 0.035,             // sorghum's heat threshold is higher (C4 crop)
      heatBase: 1.0,
      oneTime: 50                  // $/acre: row-crop planter, header, learning curve
    },
    texas: {
      key: "texas",
      label: "Move: corn on Texas Blackland Prairie",
      short: "Move — Texas",
      kansas: false,               // Blackland Prairie is mostly dryland (no irrigation)
      dryYield: 125, irrYield: 125,
      price: 4.40,
      prodCost: 370,
      irrCost: 0,
      basePremium: 28,
      droughtLoss: 0.28,           // deeper clay soils + ~38 in. rain buffer drought
      heatSens: 0.065,             // corn is very heat-sensitive (Schlenker & Roberts 2009)
      heatBase: 2.0,               // Central Texas summers already near corn's 29 °C threshold
      oneTime: 0
    }
  };

  /**
   * s = { warming (°C), drought (drought years per decade), irrigation (0–1),
   *       premiumRise (0–1.5 = +0–150 %), txLand ($/acre) }
   * Returns per-acre, per-year breakdown for one option.
   */
  function evaluate(opt, s) {
    var o = OPTIONS[opt];
    var dT = s.warming;
    var irr = o.kansas ? s.irrigation : 0;

    var baseYield = (1 - irr) * o.dryYield + irr * o.irrYield;

    // Heat: non-linear — each extra degree hurts more, and hotter places hurt sooner.
    // Irrigation cools the canopy a little.
    var heatLoss = o.heatSens * dT * (1 + 0.15 * (dT + o.heatBase)) * (1 - 0.35 * irr);
    heatLoss = Math.min(0.9, Math.max(0, heatLoss));

    // Drought: probability x severity. Irrigation buffers most of the loss
    // (VULNERABILITY), and heat makes each drought worse (higher evaporation).
    var pDrought = s.drought / 10;
    var exposure = 1 - 0.85 * irr;   // irrigated acres lose ~85 % less in a drought
    var droughtLoss = pDrought * o.droughtLoss * exposure * (1 + 0.12 * dT);
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
    if (opt === "texas") {
      var cashFromSale = FARM.ksLandValue * (1 - FARM.sellCostPct);
      var borrowed = Math.max(0, s.txLand - cashFromSale);
      oneTime += borrowed * FARM.loanRate + FARM.moveCost / FARM.acres / FARM.horizon;
    }

    var net = revenue + payout - o.prodCost - irrigation - premium - oneTime;

    return {
      key: opt, label: o.label, short: o.short,
      baseYield: baseYield, heatLossPct: heatLoss * 100, droughtLossPct: droughtLoss * 100,
      expYield: expYield, revenue: revenue, payout: payout,
      prodCost: o.prodCost, irrigation: irrigation, premium: premium,
      oneTime: oneTime, net: net, farmNet: net * FARM.acres
    };
  }

  function evaluateAll(s) {
    return ["wheat", "sorghum", "texas"].map(function (k) { return evaluate(k, s); });
  }

  function best(s) {
    var r = evaluateAll(s);
    return r.reduce(function (a, b) { return b.net > a.net ? b : a; });
  }

  root.FarmModel = { FARM: FARM, OPTIONS: OPTIONS, evaluate: evaluate, evaluateAll: evaluateAll, best: best };
})(typeof window !== "undefined" ? window : this);
