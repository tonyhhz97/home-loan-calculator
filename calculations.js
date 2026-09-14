/* =========================================================================
   PROPERTY CALCULATOR — CALCULATION ENGINE
   -------------------------------------------------------------------------
   Pure functions only — no DOM access here. Everything takes plain
   numbers/objects in and returns plain numbers/objects out, so this file
   can be unit-tested or reused (e.g. in a Node script) independently of
   the UI in app.js.
   ========================================================================= */

const CALC = (function () {

  // ---- small helpers -----------------------------------------------------
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const clampMin0 = (n) => (isFinite(n) && n > 0 ? n : 0);

  // ---- tiered scale helper (used for stamp duty + legal fees) -----------
  // tiers: [{ upTo: number|Infinity, rate: percentAsDecimal }]
  function applyTieredScale(amount, tiers) {
    let remaining = clampMin0(amount);
    let lower = 0;
    let total = 0;
    for (const tier of tiers) {
      if (remaining <= 0) break;
      const bandSize = (tier.upTo === Infinity ? remaining : tier.upTo - lower);
      const taxableInBand = Math.min(remaining, bandSize);
      total += taxableInBand * tier.rate;
      remaining -= taxableInBand;
      lower = tier.upTo;
    }
    return round2(total);
  }

  // ---- Malaysia MOT stamp duty (ad valorem, current published scale) ----
  // 1% first 100k / 2% next 400k / 3% next 500k / 4% thereafter
  const MOT_STAMP_DUTY_TIERS = [
    { upTo: 100000, rate: 0.01 },
    { upTo: 500000, rate: 0.02 },
    { upTo: 1000000, rate: 0.03 },
    { upTo: Infinity, rate: 0.04 },
  ];

  function calcMotStampDuty(price, { firstTimeBuyerExemption = false, exemptionCapRm = 0 } = {}) {
    if (firstTimeBuyerExemption && price <= exemptionCapRm) return 0;
    if (firstTimeBuyerExemption && price > exemptionCapRm) {
      // exemption applies only to the exempted portion; duty payable on the
      // full price minus duty on the exempted cap (simplified, common approach)
      const dutyFull = applyTieredScale(price, MOT_STAMP_DUTY_TIERS);
      const dutyOnCap = applyTieredScale(exemptionCapRm, MOT_STAMP_DUTY_TIERS);
      return round2(clampMin0(dutyFull - dutyOnCap));
    }
    return applyTieredScale(price, MOT_STAMP_DUTY_TIERS);
  }

  // Loan agreement stamp duty: flat 0.5% of loan amount (statutory rate)
  function calcLoanStampDuty(loanAmount, { firstTimeBuyerExemption = false, exemptionCapRm = 0, priceForExemptionCheck = 0 } = {}) {
    if (firstTimeBuyerExemption && priceForExemptionCheck <= exemptionCapRm) return 0;
    return round2(loanAmount * 0.005);
  }

  // ---- Legal fee scale — Solicitors' Remuneration Order 2023 -----------
  // Used for both the SPA (on price) and the Loan Agreement (on loan amount)
  const LEGAL_FEE_TIERS = [
    { upTo: 500000, rate: 0.0125 },
    { upTo: 1000000, rate: 0.01 },
    { upTo: 3000000, rate: 0.008 },
    { upTo: 5000000, rate: 0.007 },
    { upTo: 7500000, rate: 0.006 },
    { upTo: Infinity, rate: 0.005 },
  ];
  const LEGAL_FEE_MINIMUM = 500;

  function calcLegalFee(amount) {
    return Math.max(LEGAL_FEE_MINIMUM, applyTieredScale(amount, LEGAL_FEE_TIERS));
  }

  // ---- Loan mechanics -----------------------------------------------------
  // Standard amortizing monthly instalment (PMT)
  function calcMonthlyInstalment(principal, annualRatePct, tenureYears) {
    const P = clampMin0(principal);
    const n = tenureYears * 12;
    const r = (annualRatePct / 100) / 12;
    if (P === 0 || n === 0) return 0;
    if (r === 0) return round2(P / n);
    const instalment = (P * r) / (1 - Math.pow(1 + r, -n));
    return round2(instalment);
  }

  function calcTotalRepayment(monthlyInstalment, tenureYears) {
    return round2(monthlyInstalment * tenureYears * 12);
  }

  function calcTotalInterest(totalRepayment, principal) {
    return round2(clampMin0(totalRepayment - principal));
  }

  // Reverse-PMT: given a monthly payment budget, back out max loan amount
  function calcMaxLoanFromInstalment(monthlyBudget, annualRatePct, tenureYears) {
    const n = tenureYears * 12;
    const r = (annualRatePct / 100) / 12;
    if (monthlyBudget <= 0 || n === 0) return 0;
    if (r === 0) return round2(monthlyBudget * n);
    const maxLoan = monthlyBudget * (1 - Math.pow(1 + r, -n)) / r;
    return round2(maxLoan);
  }

  // Estimated max loan eligibility from income using a DSR ceiling
  function calcMaxLoanEligibility({ monthlyIncome, monthlyCommitments, numberOfBorrowers = 1,
                                     dsrThresholdPct, annualRatePct, tenureYears }) {
    const totalIncome = clampMin0(monthlyIncome) * Math.max(1, numberOfBorrowers === 0 ? 1 : 1); // income already assumed combined if joint
    const maxAllowableCommitment = totalIncome * (dsrThresholdPct / 100);
    const availableForNewLoan = clampMin0(maxAllowableCommitment - clampMin0(monthlyCommitments));
    const maxLoan = calcMaxLoanFromInstalment(availableForNewLoan, annualRatePct, tenureYears);
    return { maxAllowableCommitment: round2(maxAllowableCommitment), availableForNewLoan: round2(availableForNewLoan), maxLoan };
  }

  // ---- Upfront cost ---------------------------------------------------
  function calcUpfrontCost({
    price, downPaymentPct, bookingFeeAmount, loanAmount,
    legalFeeSpaAbsorbed, legalFeeLoanAbsorbed,
    stampDutySpaAbsorbed, stampDutyLoanAbsorbed,
    miscUpfrontCostRm, loanAgreementMiscFeeRm,
    firstTimeBuyerExemption, exemptionCapRm
  }) {
    const downPayment = round2(price * (downPaymentPct / 100));
    const legalFeeSpa = calcLegalFee(price);
    const legalFeeLoan = calcLegalFee(loanAmount);
    const stampDutySpa = calcMotStampDuty(price, { firstTimeBuyerExemption, exemptionCapRm });
    const stampDutyLoan = calcLoanStampDuty(loanAmount, { firstTimeBuyerExemption, exemptionCapRm, priceForExemptionCheck: price });

    const legalFeeSpaPayable = legalFeeSpaAbsorbed ? 0 : legalFeeSpa;
    const legalFeeLoanPayable = legalFeeLoanAbsorbed ? 0 : legalFeeLoan;
    const stampDutySpaPayable = stampDutySpaAbsorbed ? 0 : stampDutySpa;
    const stampDutyLoanPayable = stampDutyLoanAbsorbed ? 0 : stampDutyLoan;

    const grossComponents = {
      bookingFeeAmount: round2(bookingFeeAmount),
      downPaymentBalance: round2(clampMin0(downPayment - bookingFeeAmount)),
      legalFeeSpa: legalFeeSpaPayable,
      legalFeeLoan: legalFeeLoanPayable,
      stampDutySpa: stampDutySpaPayable,
      stampDutyLoan: stampDutyLoanPayable,
      miscUpfrontCostRm: round2(miscUpfrontCostRm),
      loanAgreementMiscFeeRm: round2(loanAgreementMiscFeeRm),
    };

    const absorbedComponents = {
      legalFeeSpa: legalFeeSpaAbsorbed ? legalFeeSpa : 0,
      legalFeeLoan: legalFeeLoanAbsorbed ? legalFeeLoan : 0,
      stampDutySpa: stampDutySpaAbsorbed ? stampDutySpa : 0,
      stampDutyLoan: stampDutyLoanAbsorbed ? stampDutyLoan : 0,
    };

    const totalUpfront = round2(Object.values(grossComponents).reduce((a, b) => a + b, 0));
    const totalAbsorbedByDeveloper = round2(Object.values(absorbedComponents).reduce((a, b) => a + b, 0));

    return { downPayment, grossComponents, absorbedComponents, totalUpfront, totalAbsorbedByDeveloper };
  }

  // ---- Tiered / compounding discount -------------------------------------
  // Applies a sequence of % discounts one after another, each off the
  // REMAINING (nett) price rather than the original — this matches how
  // Malaysian developers commonly structure a "7% + 3%" rebate: the second
  // 3% is 3% of the price AFTER the first 7% comes off, not 3% of the
  // original price. A single-tier ("straight") discount is just this
  // function called with one tier.
  function calcTieredDiscount(price, tierPcts) {
    let running = clampMin0(price);
    const steps = [];
    (tierPcts || []).forEach((pct) => {
      const p = clampMin0(pct);
      if (p <= 0) return;
      const priceBefore = running;
      const discountValue = round2(priceBefore * (p / 100));
      const priceAfter = round2(priceBefore - discountValue);
      steps.push({ pct: p, priceBefore, discountValue, priceAfter });
      running = priceAfter;
    });
    const finalPrice = round2(running);
    const totalDiscountValue = round2(clampMin0(price - finalPrice));
    const effectiveDiscountPct = price > 0 ? round2((totalDiscountValue / price) * 100) : 0;
    return { steps, finalPrice, totalDiscountValue, effectiveDiscountPct };
  }

  // ---- Final Nett Price --------------------------------------------------
  // SPA price, less the Developer's Rebate and any Extra Subsidy items the
  // buyer has listed. This is the plain "what you're really paying" figure —
  // it does NOT change the loan basis (banks lend against the SPA price).
  function calcFinalNettPrice(price, rebateAmount, subsidyTotal) {
    return round2(clampMin0(price - clampMin0(rebateAmount) - clampMin0(subsidyTotal)));
  }

  // Sums a list of { raw } extra-subsidy rows where `raw` is whatever the
  // buyer typed (a number — comma-formatted or not — or "N/A" / blank
  // meaning no extra). Non-numeric entries simply contribute 0 — this is
  // what lets "N/A" work as a value.
  function calcListTotal(items, key = 'raw') {
    return round2((items || []).reduce((sum, it) => {
      const cleaned = String((it && it[key]) || '').replace(/,/g, '');
      const v = parseFloat(cleaned);
      return sum + (isFinite(v) && v > 0 ? v : 0);
    }, 0));
  }

  // ---- Cost Saving Breakdown (Section 02) --------------------------------
  // What the developer absorbs on the buyer's behalf: legal fee (SPA), legal
  // fee (loan agreement), loan agreement stamp duty, and disbursement/admin
  // fees — plus a straight cash value for any renovation/furnishing package.
  // MOT stamp duty is deliberately NOT part of this breakdown.
  function calcCostSavingBreakdown({
    price, loanAmount,
    legalFeeSpaAbsorbed, legalFeeLoanAbsorbed, stampDutyLoanAbsorbed, miscAbsorbed,
    miscUpfrontCostRm, loanAgreementMiscFeeRm, renovationPackageRm
  }) {
    const legalFeeSpa = calcLegalFee(price);
    const legalFeeLoan = calcLegalFee(loanAmount);
    const stampDutyLoan = calcLoanStampDuty(loanAmount, {});
    const disbursement = round2(clampMin0(miscUpfrontCostRm) + clampMin0(loanAgreementMiscFeeRm));

    const items = [
      { key: 'legalFeeSpa', label: "Legal Fee (SPA)", amount: legalFeeSpa, absorbed: !!legalFeeSpaAbsorbed },
      { key: 'legalFeeLoan', label: "Legal Fee (Loan Agreement)", amount: legalFeeLoan, absorbed: !!legalFeeLoanAbsorbed },
      { key: 'stampDutyLoan', label: "Stamp Duty (Loan Agreement)", amount: stampDutyLoan, absorbed: !!stampDutyLoanAbsorbed },
      { key: 'disbursement', label: "Disbursement & Admin Fees", amount: disbursement, absorbed: !!miscAbsorbed },
    ];
    const savingsFromFees = round2(items.reduce((sum, it) => sum + (it.absorbed ? it.amount : 0), 0));
    const renovation = round2(clampMin0(renovationPackageRm));
    const total = round2(savingsFromFees + renovation);

    return { items, savingsFromFees, renovation, total };
  }

  // ---- Rental ROI (Section 05) — deliberately simple ---------------------
  // Maintenance Fee + Sinking Fund: buyer keys in a RM/sqft rate, this
  // multiplies it out by the unit size into one total.
  function calcMaintenanceTotal(feePerSqft, unitSizeSqft) {
    return round2(clampMin0(feePerSqft) * clampMin0(unitSizeSqft));
  }

  // Expected Monthly Return = rent collected, less the loan instalment
  // (from Section 01), less maintenance + sinking fund. A straight cash-in/
  // cash-out figure — no occupancy, management fee or other assumptions.
  function calcExpectedMonthlyReturn(monthlyRental, monthlyInstalment, maintenanceTotal) {
    return round2(clampMin0(monthlyRental) - clampMin0(monthlyInstalment) - clampMin0(maintenanceTotal));
  }

  // ROI Calculation = annual rental ÷ nett housing price (Final Nett Price
  // from Section 01), as a %. A simple gross rental-yield-style figure.
  function calcRentalRoiPct(rentalPerYear, priceNett) {
    return priceNett > 0 ? round2((rentalPerYear / priceNett) * 100) : 0;
  }

  // ---- DSR / affordability position ------------------------------------
  // The new property's instalment is passed in already-calculated (from
  // Section 1) — this function never re-derives it, so there is exactly
  // one source of truth for the instalment figure across the whole page.
  function calcDsrPosition({ monthlyIncome, existingCommitmentsTotal, newInstalment, dsrThresholdPct }) {
    const totalMonthlyCommitments = round2(clampMin0(existingCommitmentsTotal) + clampMin0(newInstalment));
    const dsrPct = monthlyIncome > 0 ? round2((totalMonthlyCommitments / monthlyIncome) * 100) : 0;
    const withinRange = dsrPct <= dsrThresholdPct;
    return { totalMonthlyCommitments, dsrPct, withinRange };
  }

  return {
    round2, clampMin0, applyTieredScale,
    MOT_STAMP_DUTY_TIERS, LEGAL_FEE_TIERS,
    calcMotStampDuty, calcLoanStampDuty, calcLegalFee,
    calcMonthlyInstalment, calcTotalRepayment, calcTotalInterest,
    calcMaxLoanFromInstalment, calcMaxLoanEligibility,
    calcUpfrontCost, calcTieredDiscount,
    calcFinalNettPrice, calcListTotal, calcCostSavingBreakdown,
    calcMaintenanceTotal, calcExpectedMonthlyReturn, calcRentalRoiPct,
    calcDsrPosition
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CALC;
