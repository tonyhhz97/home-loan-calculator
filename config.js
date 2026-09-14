/* =========================================================================
   PROPERTY CALCULATOR — CONFIGURATION
   -------------------------------------------------------------------------
   Edit this file to re-brand the tool or to spin up a project-specific
   version (e.g. one link per new-launch project you're marketing).

   You can ALSO override any "project" field live via URL parameters,
   without touching this file — handy for sending a unique link per
   project while keeping one shared codebase. Example:

   https://yoursite.netlify.app/?name=Queenswoodz&price=650000&size=850
     &rental=2200&maint=0.35&rebate=5000&rate=3.85&ltv=90&mode=invest

   Supported URL params: name, price, size, rental, maint (RM/sqft/month),
   rebatePct, rate, ltv, tenure, mode (own | invest), income, borrowers.
   ========================================================================= */

window.CALC_CONFIG = {

  branding: {
    // Short form — used in the footer ("Prepared by ...")
    agentName: "Tony Hoo",
    // Header line 1 (topbar, next to the logo icon)
    agentTitle: "Tony Hoo | Your Neighbourhood Home Advisor",
    // Header line 2
    agentTagline: "IQI Realty · Klang Valley New Launches · @tonyhoo_97",
    handle: "@tonyhoo_97",
    // Black & gold palette — matches the KL Project Atlas (KLPC) branding used
    // elsewhere in this project. Times New Roman serif throughout for the
    // same editorial, premium feel.
    fontFamily: "'Times New Roman', Times, serif",
    colors: {
      // Warm ivory / soft-paper theme — see styles.css for the full token set.
      ink:        "#332b1f",   // warm charcoal — primary text
      inkSoft:    "#655945",   // secondary text
      bg:         "#f4ecdd",   // page background (warm ivory)
      surface:    "#eee2cc",   // card background (a shade darker than the page)
      border:     "#ddcda8",
      primary:    "#332b1f",   // ink used as the "dark" brand color (summary card, buttons)
      primaryDk:  "#221c13",
      accent:     "#a8763a",   // softened gold
      accentDark: "#7d5726",
      accentLight:"#e6d3ac",
      good:       "#2f7a4d",
      warn:       "#7d5726",
      bad:        "#c0392b"
    },
    disclaimer:
      "All figures shown are estimates for illustration and planning purposes only. " +
      "They do not constitute a loan offer, loan approval, or financial advice. " +
      "Actual loan eligibility, interest rate, margin of financing and approved terms " +
      "are determined solely by the relevant bank(s) based on your credit assessment, " +
      "income documents and prevailing lending guidelines (including Bank Negara Malaysia " +
      "responsible financing rules). Stamp duty, legal fee and rebate/subsidy figures are " +
      "based on prevailing published scales and current project terms, and are subject to " +
      "change by the government / developer without notice. Please consult your banker, " +
      "lawyer and Tony Hoo for figures specific to your actual purchase."
  },

  /* ---------------------------------------------------------------------
     PROJECT-SPECIFIC DEFAULTS
     Change these per project, or leave as a generic starting point and
     let the buyer adjust everything themselves.
  --------------------------------------------------------------------- */
  project: {
    name: "Queenswoodz",
    location: "Bukit Jalil",
    unitNumber: "B-22-12",
    unitSizeSqft: 800,
    propertyPrice: 650000,

    // Financing defaults
    loanMarginPct: 90,      // LTV %
    interestRatePct: 3.65,  // effective lending rate, annual
    tenureYears: 35,

    // Rental / investment defaults
    expectedMonthlyRental: 3000,
    maintenanceFeePerSqft: 0.35,   // RM per sqft per month (incl. sinking fund)

    // Incentives (edit per project — not all rebates/subsidies apply to every project)
    rebatePct: 0,                // Developer's Rebate, % of price — amount is calculated automatically
    legalFeeSpaAbsorbedByDeveloper: true,
    legalFeeLoanAbsorbedByDeveloper: true,
    stampDutyLoanAbsorbedByDeveloper: true,   // loan agreement stamp duty — absorbed by default
    miscAbsorbedByDeveloper: true,            // disbursement / admin fees — absorbed by default
    renovationPackageRm: 35000,   // expected value of free renovation / furnishing package
  },

  /* ---------------------------------------------------------------------
     GENERAL ASSUMPTIONS — realistic Malaysian defaults, all editable
     in the UI. Change the starting numbers here if your typical buyer
     profile differs.
  --------------------------------------------------------------------- */
  assumptions: {
    buyerMonthlyIncome: 6000,
    numberOfBorrowers: 1,
    dsrThresholdPct: 70,   // indicative bank DSR ceiling used for the estimate

    // Existing monthly commitments, broken out by category so the buyer can
    // see what's driving their DSR.
    existingPropertyLoanInstalment: 0,  // "House Loan"
    carLoanCommitment: 0,
    ptptnCommitment: 0,
    personalLoanCommitment: 0,
    creditCardCommitment: 0,             // "Credit Card Outstanding"

    miscUpfrontCostRm: 3000,   // valuation fee, disbursements, admin, etc.
    loanAgreementMiscFeeRm: 1200
  }
};
