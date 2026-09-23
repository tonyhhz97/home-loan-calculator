/* =========================================================================
   PROPERTY CALCULATOR — APP / UI LAYER
   -------------------------------------------------------------------------
   ARCHITECTURE NOTE: this is ONE connected calculation chain per calculator
   instance, not a set of separate calculators. Each instance has its own
   `state` object (raw inputs) and its own `recalc()` pass that derives every
   downstream number from it into `D` (derived values). No component
   re-enters or re-derives a number that already exists upstream — e.g. the
   DSR section reads D.monthlyInstalment, it never asks the buyer to type
   the instalment again.

   Chain (per instance):
   propertyPrice → loanMarginPct → loanAmount → downPayment
                 → rebate + extraSubsidies → finalNettPrice
                 → (+ interestRatePct, tenureYears) → monthlyInstalment
                 → costSavingBreakdown (Section 02, informational)
                 → (+ income, existingCommitments) → estimatedDSR
                 → Exit Plan → Rental ROI (Section 05, shown on demand)

   COMPARISON MODE: clicking "Comparison" in the topbar mounts a second,
   fully independent instance side by side, so a buyer can compare two
   projects or two layouts. Each instance keeps its own state, DOM subtree
   and event bindings — editing one never touches the other.
   ========================================================================= */
(function () {
  const CFG = window.CALC_CONFIG;
  const C = CFG.branding.colors;

  // -------------------------------------------------------------------
  // Apply brand accent colors + font as CSS variables (config.js stays
  // the single source of truth for branding). Neutral tokens (ink, bg,
  // surface, border) live in styles.css as a single fixed light theme.
  // -------------------------------------------------------------------
  const root = document.documentElement.style;
  root.setProperty('--primary', C.primary);
  root.setProperty('--primary-dk', C.primaryDk);
  root.setProperty('--accent', C.accent);
  root.setProperty('--accent-dark', C.accentDark);
  root.setProperty('--font-family', CFG.branding.fontFamily || "'Times New Roman', Times, serif");

  // -------------------------------------------------------------------
  // Number formatting (shared across every instance)
  // -------------------------------------------------------------------
  const fmt = new Intl.NumberFormat('en-MY', { maximumFractionDigits: 0 });
  const rm = (n) => 'RM ' + fmt.format(Math.round(n || 0));
  const pct = (n) => (isFinite(n) ? n.toFixed(2) : '0.00') + '%';
  const signedRm = (n) => (n >= 0 ? '+' : '– ') + rm(Math.abs(n));
  const esc = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;');
  // Every number on the page — inside manual-entry boxes included — is
  // shown with thousand separators ("3,000", "300,000"). cleanNum() strips
  // them back out before parsing whatever the buyer typed.
  const groupNum = (n, decimals = 0) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const cleanNum = (s) => String(s == null ? '' : s).replace(/,/g, '');

  // -------------------------------------------------------------------
  // URL param overrides (seed defaults for the first instance)
  // -------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const p = CFG.project, a = CFG.assumptions;
  const num = (v, fallback) => (v !== null && v !== '' && !isNaN(v) ? parseFloat(v) : fallback);

  const projectName = params.get('name') || p.name;
  const initLocation = params.get('location') || p.location || '';
  const initUnitNumber = params.get('unit') || p.unitNumber || '';
  const initPrice = num(params.get('price'), p.propertyPrice);
  const initSize = num(params.get('size'), p.unitSizeSqft);
  const initRental = num(params.get('rental'), p.expectedMonthlyRental);
  const initMaint = num(params.get('maint'), p.maintenanceFeePerSqft);
  const initRebatePct = num(params.get('rebatePct'), p.rebatePct);
  const initRate = num(params.get('rate'), p.interestRatePct);
  const initLtv = num(params.get('ltv'), p.loanMarginPct);
  const initTenure = num(params.get('tenure'), p.tenureYears);
  const initIncome = num(params.get('income'), a.buyerMonthlyIncome);
  const initBorrowers = num(params.get('borrowers'), a.numberOfBorrowers);
  // Populated by the DSR Calculation helper page ("Use These Figures in the
  // Calculator" button) — falls back to the usual assumption defaults when
  // not present, so a plain visit to this page is unaffected.
  const initExistingHouse = num(params.get('house'), a.existingPropertyLoanInstalment);
  const initExistingCar = num(params.get('car'), a.carLoanCommitment);
  const initExistingPtptn = num(params.get('ptptn'), a.ptptnCommitment);
  const initExistingPersonal = num(params.get('personal'), a.personalLoanCommitment);
  const initExistingCc = num(params.get('cc'), a.creditCardCommitment);

  // -------------------------------------------------------------------
  // Tooltip content (shared)
  // -------------------------------------------------------------------
  const TIP = {
    ltv: 'Loan-to-Value: the % of the property price the bank lends you. A 90% LTV means you finance 90% and pay the remaining 10% as down payment.',
    dsr: 'Debt Service Ratio: the % of your monthly income going toward all debt repayments (this loan + existing commitments). Banks use their own internal ceilings — this is an indicative benchmark, not a bank policy.',
    dti: 'Estimated only. Your bank will assess your actual eligibility using your payslips, credit report (CTOS/CCRIS) and internal policies — this may differ from the figure shown here.',
    absorption: 'When switched on, this cost is assumed to be paid by the developer (a common promotional incentive), so it will not appear in your out-of-pocket upfront cost.',
    roi: 'A simple gross measure: annual rental ÷ nett housing price. It does not deduct the loan instalment or maintenance — compare it alongside Expected Monthly Return for the full picture.'
  };

  // -------------------------------------------------------------------
  // Small UI builders (stateless — shared across every instance)
  // -------------------------------------------------------------------
  // Every numeric input on the page is manual entry only (no sliders) — type
  // a value, it commits on blur/Enter, and every dependent number downstream
  // re-renders automatically.
  function fieldEditable({ label, tip, value, onInput, min, max, step, prefix = '', suffix = '', decimals = 0 }) {
    const tipHtml = tip ? `<span class="tip" data-tip="${tip.replace(/"/g,'&quot;')}">?</span>` : '';
    const shownValue = groupNum(value, decimals);
    return `
      <div class="field">
        <div class="field-label"><span>${label}${tipHtml}</span></div>
        <div class="input-affix">
          ${prefix ? `<span class="affix-pre">${prefix}</span>` : ''}
          <input type="text" inputmode="decimal" class="affix-input" data-bind-manual="${onInput}" data-min="${min}" data-max="${max}" value="${shownValue}">
          ${suffix ? `<span class="affix-suf">${suffix}</span>` : ''}
        </div>
      </div>`;
  }

  function toggle({ label, sub, checked, onBind }) {
    return `
      <div class="toggle-row">
        <div><div class="t-label">${label}</div>${sub ? `<div class="t-sub">${sub}</div>` : ''}</div>
        <label class="switch">
          <input type="checkbox" ${checked ? 'checked' : ''} data-toggle="${onBind}">
          <span class="track"></span>
        </label>
      </div>`;
  }

  function resultRow(k, v, cls = '') {
    return `<div class="result-row ${cls}"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  }

  // Same as resultRow, but meant to sit inside a two-column CSS grid (see
  // the wrapping .result-block below) instead of a flex row — this keeps
  // labels in one aligned column and values in a second aligned column,
  // with a modest, fixed gap between them (no more, no less, on every row).
  function resultRowTight(k, v) {
    return `<div class="result-row" style="display:contents;"><span class="k">${k}</span><span class="v" style="justify-self:end; text-align:right;">${v}</span></div>`;
  }

  function sectionHeader(no, title, sub) {
    return `<div class="section-header"><div class="section-no">${no}</div><div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
  }

  // Count suffix for a DSR-summary commitment row, e.g. "House Loan (x2)"
  function countSuffix(n) { return n > 1 ? ` (x${n})` : ''; }

  const CALC_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2"></rect>
    <line x1="8" y1="6" x2="16" y2="6"></line>
    <line x1="8" y1="10.5" x2="8" y2="10.5"></line>
    <line x1="12" y1="10.5" x2="12" y2="10.5"></line>
    <line x1="16" y1="10.5" x2="16" y2="10.5"></line>
    <line x1="8" y1="14.5" x2="8" y2="14.5"></line>
    <line x1="12" y1="14.5" x2="12" y2="14.5"></line>
    <line x1="16" y1="14.5" x2="16" y2="14.5"></line>
    <line x1="8" y1="18.5" x2="8" y2="18.5"></line>
    <line x1="12" y1="18.5" x2="16" y2="18.5"></line>
  </svg>`;

  // -------------------------------------------------------------------
  // Shared tooltip popover (one singleton for the whole page — stateless,
  // safe to share across both comparison instances)
  // -------------------------------------------------------------------
  let tooltipEl = null;
  function showTip(e, text) {
    hideTip();
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip-pop';
    tooltipEl.textContent = text;
    document.body.appendChild(tooltipEl);
    const r = e.target.getBoundingClientRect();
    const top = Math.min(window.innerHeight - 120, r.bottom + 8);
    const left = Math.min(window.innerWidth - 270, Math.max(10, r.left - 100));
    tooltipEl.style.top = top + 'px';
    tooltipEl.style.left = left + 'px';
  }
  function hideTip() { if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; } }
  function bindTips(rootEl) {
    rootEl.querySelectorAll('.tip').forEach(el => {
      el.addEventListener('mouseenter', (e) => showTip(e, el.getAttribute('data-tip')));
      el.addEventListener('mouseleave', hideTip);
      el.addEventListener('click', (e) => { e.stopPropagation(); showTip(e, el.getAttribute('data-tip')); setTimeout(hideTip, 3500); });
    });
  }

  // -------------------------------------------------------------------
  // Persistence — sessionStorage only (cleared when the tab is closed,
  // kept across navigating to/from the DSR Calculation page or reloading).
  // Whichever field a URL param explicitly sets (e.g. the DSR page's
  // "bring these figures back into the Calculator" carry-over link) always
  // wins over a restored value for that same field.
  // -------------------------------------------------------------------
  const STORAGE_KEY = 'homeLoanCalc:v1';
  const PARAM_FIELD_MAP = {
    name: 'projectNamePart', location: 'projectLocationPart', unit: 'unitNumber',
    price: 'price', size: 'unitSizeSqft', rebatePct: 'rebatePct', rate: 'interestRatePct',
    ltv: 'loanMarginPct', tenure: 'tenureYears', income: 'income', borrowers: 'borrowers',
    house: 'existingPropertyLoanInstalment', car: 'carLoanCommitment', ptptn: 'ptptnCommitment',
    personal: 'personalLoanCommitment', cc: 'creditCardCommitment',
    rental: 'monthlyRental', maint: 'maintenanceFeePerSqft',
  };
  function loadSavedPageState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function savePageState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        comparison: pageState.comparison,
        a: instances[0].state,
        b: instances[1].state,
      }));
    } catch (e) { /* storage unavailable — fail silently */ }
  }

  // -------------------------------------------------------------------
  // DSR Calculation page hand-off — once the buyer has filled in their
  // income + every commitment on the DSR Calculation page (its own
  // sessionStorage summary), that becomes the single source of truth for
  // Section 03 here: shown as a read-only summary instead of re-asking for
  // the same numbers, and shared automatically across both projects in
  // Comparison mode (income doesn't change just because the project does).
  // Read once at page load — a fresh read happens naturally every time this
  // page is (re)loaded, including navigating back from the DSR page.
  // -------------------------------------------------------------------
  const DSR_SUMMARY_KEY = 'dsrCalcSummary:v1';
  function loadDsrSummary() {
    try {
      const raw = sessionStorage.getItem(DSR_SUMMARY_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  const dsrSummary = loadDsrSummary();

  // Healthy indicative DSR range by nett income band — identical bands to
  // the DSR Calculation page's own guideline (dsrRangeForIncome there).
  // Section 03 here always uses the MINIMUM of the band for the buyer's
  // current income as its "Indicative DSR Limit" — it is derived, not a
  // number the buyer sets themselves.
  function dsrRangeForIncome(income) {
    if (income >= 6000) return { min: 80, max: 85 };
    if (income >= 5000) return { min: 70, max: 80 };
    if (income >= 4000) return { min: 60, max: 70 };
    return { min: 60, max: 60 };
  }

  // -------------------------------------------------------------------
  // Default seed — every new instance (including a comparison partner)
  // starts from the same project config / URL-param defaults.
  // -------------------------------------------------------------------
  function defaultSeed() {
    return {
      // Project identity — shown split into two boxes ("Name" @ "Location")
      // plus a separate Unit Number box, then combined for display as
      // "Queenswoodz @ Bukit Jalil (B-22-12)".
      projectNamePart: projectName,
      projectLocationPart: initLocation,
      unitNumber: initUnitNumber,
      price: initPrice,
      unitSizeSqft: initSize,
      loanMarginPct: initLtv,
      interestRatePct: initRate,
      tenureYears: initTenure,

      income: initIncome,
      borrowers: Math.max(1, initBorrowers),
      dsrThresholdPct: a.dsrThresholdPct,
      existingPropertyLoanInstalment: initExistingHouse,
      carLoanCommitment: initExistingCar,
      ptptnCommitment: initExistingPtptn,
      personalLoanCommitment: initExistingPersonal,
      creditCardCommitment: initExistingCc,

      monthlyRental: initRental,
      maintenanceFeePerSqft: initMaint,

      // Layout — free-form text (e.g. "3R, 2B") shown next to unit size,
      // both in Section 01 and in the Financial Summary's "Size & Layout" tile.
      layout: '3R, 2B',

      // Developer's Rebate (a %, so it scales automatically with the price)
      // + Extra Subsidy — the only incentive inputs now. Extra subsidies are
      // a free-form list: label + raw amount, where "raw" can be a number
      // (comma-formatted or not) OR text like "N/A" (treated as 0 everywhere).
      rebatePct: initRebatePct,
      extraSubsidies: [{ label: '', raw: '' }],

      legalFeeSpaAbsorbed: p.legalFeeSpaAbsorbedByDeveloper,
      legalFeeLoanAbsorbed: p.legalFeeLoanAbsorbedByDeveloper,
      stampDutyLoanAbsorbed: p.stampDutyLoanAbsorbedByDeveloper,
      miscAbsorbed: p.miscAbsorbedByDeveloper,
      miscUpfrontCostRm: a.miscUpfrontCostRm,
      loanAgreementMiscFeeRm: a.loanAgreementMiscFeeRm,
      renovationPackageRm: p.renovationPackageRm,

      // Exit Plan — off by default; clicking the button next to the
      // Financial Summary reveals the Rental ROI section on demand.
      showRentalRoi: false,
    };
  }

  // =====================================================================
  // INSTANCE FACTORY — everything that used to be a single global
  // state/recalc/render/bindEvents is now scoped to one instance, so two
  // of these can run side by side (Comparison mode) with zero cross-talk.
  // =====================================================================
  function createInstance(id, label, savedState) {
    const fresh = defaultSeed();
    const state = Object.assign({}, fresh, savedState || {});
    // Explicit URL params always win over a restored session value for the
    // same field (e.g. a fresh carry-over from the DSR Calculation page).
    Object.keys(PARAM_FIELD_MAP).forEach(pKey => {
      if (params.has(pKey)) state[PARAM_FIELD_MAP[pKey]] = fresh[PARAM_FIELD_MAP[pKey]];
    });
    let D = {};

    function recalc() {
      const loanAmount = CALC.round2(state.price * (state.loanMarginPct / 100));
      const downPaymentPct = 100 - state.loanMarginPct;
      const downPayment = CALC.round2(state.price - loanAmount);
      const monthlyInstalment = CALC.calcMonthlyInstalment(loanAmount, state.interestRatePct, state.tenureYears);
      const totalRepayment = CALC.calcTotalRepayment(monthlyInstalment, state.tenureYears);
      const totalInterest = CALC.calcTotalInterest(totalRepayment, loanAmount);

      // ---- Rebate (%) + Extra Subsidy → Final Nett Price
      const rebateAmount = CALC.round2(state.price * (state.rebatePct / 100));
      const subsidyTotal = CALC.calcListTotal(state.extraSubsidies, 'raw');
      const finalNettPrice = CALC.calcFinalNettPrice(state.price, rebateAmount, subsidyTotal);

      // ---- Cost Saving Breakdown (Section 02) — informational, does not
      // feed back into the loan/price chain.
      const costSaving = CALC.calcCostSavingBreakdown({
        price: state.price, loanAmount,
        legalFeeSpaAbsorbed: state.legalFeeSpaAbsorbed, legalFeeLoanAbsorbed: state.legalFeeLoanAbsorbed,
        stampDutyLoanAbsorbed: state.stampDutyLoanAbsorbed, miscAbsorbed: state.miscAbsorbed,
        miscUpfrontCostRm: state.miscUpfrontCostRm, loanAgreementMiscFeeRm: state.loanAgreementMiscFeeRm,
        renovationPackageRm: state.renovationPackageRm
      });

      // ---- DSR & Affordability — reads monthlyInstalment, never re-enters it.
      // Section 03 no longer collects income/commitments itself — it needs
      // the DSR Calculation page filled in (at minimum, an income) before it
      // shows anything beyond the "Check Your Home Loan Eligibility" CTA.
      // The Indicative DSR Limit is derived automatically from that income
      // (the minimum of the healthy range for that income band), never
      // manually set.
      const hasDsrIncome = !!(dsrSummary && dsrSummary.income > 0);
      const dsrIncome = hasDsrIncome ? dsrSummary.income : 0;
      const existingCommitmentsTotal = hasDsrIncome ? CALC.round2(dsrSummary.total) : 0;
      const dsrThresholdPct = dsrRangeForIncome(dsrIncome).min;
      const dsr = CALC.calcDsrPosition({
        monthlyIncome: dsrIncome, existingCommitmentsTotal, newInstalment: monthlyInstalment,
        dsrThresholdPct
      });

      const eligibility = CALC.calcMaxLoanEligibility({
        monthlyIncome: dsrIncome, monthlyCommitments: existingCommitmentsTotal,
        numberOfBorrowers: (dsrSummary && dsrSummary.jointApplicant) ? 2 : state.borrowers,
        dsrThresholdPct,
        annualRatePct: state.interestRatePct, tenureYears: state.tenureYears
      });

      // ---- Rental ROI (Section 05) — deliberately simple: rental income
      // less the Section 01 instalment less maintenance, and a straight
      // rental-yield-style ROI off the Final Nett Price.
      const maintenanceFeeMonthly = CALC.calcMaintenanceTotal(state.maintenanceFeePerSqft, state.unitSizeSqft);
      const expectedMonthlyReturn = CALC.calcExpectedMonthlyReturn(state.monthlyRental, monthlyInstalment, maintenanceFeeMonthly);
      const rentalPerYear = CALC.round2(state.monthlyRental * 12);
      const rentalRoiPct = CALC.calcRentalRoiPct(rentalPerYear, finalNettPrice);

      // ---- Combined project identity for display, e.g.
      // "Queenswoodz @ Bukit Jalil (B-22-12)"
      const projectDisplayName =
        (state.projectNamePart || '') +
        (state.projectLocationPart ? ' @ ' + state.projectLocationPart : '') +
        (state.unitNumber ? ' (' + state.unitNumber + ')' : '');

      D = {
        loanAmount, downPaymentPct, downPayment, monthlyInstalment, totalRepayment, totalInterest,
        rebateAmount, subsidyTotal, finalNettPrice, costSaving,
        existingCommitmentsTotal, dsr, eligibility, dsrThresholdPct, hasDsrIncome,
        maintenanceFeeMonthly, expectedMonthlyReturn, rentalPerYear, rentalRoiPct,
        projectDisplayName
      };
    }

    function set(key, val) { state[key] = val; inst.recalcAndRender(); }

    // -----------------------------------------------------------------
    // SECTION 01 — Property & Financing
    // -----------------------------------------------------------------
    function renderSection1() {
      return `
      <section class="card" id="sec-1-${id}">
        ${sectionHeader('01', 'Property &amp; Financing', 'Type in the property price and loan margin — the loan amount, down payment and monthly instalment all update automatically below.')}

        <div class="field">
          <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
            <div style="flex:2.4; min-width:180px;">
              <div class="field-label"><span>Project's Name &amp; Location</span></div>
              <div style="display:flex; gap:4px; align-items:stretch;">
                <input type="text" style="flex:1.3; min-width:80px; text-align:center;" data-bind-text="projectNamePart" value="${esc(state.projectNamePart)}" placeholder="e.g. Queenswoodz">
                <span style="flex:none; display:flex; align-items:center; font-weight:700; color:var(--ink-soft); font-size:15px; padding:0 2px;">@</span>
                <input type="text" style="flex:1.3; min-width:80px; text-align:center;" data-bind-text="projectLocationPart" value="${esc(state.projectLocationPart)}" placeholder="e.g. Bukit Jalil">
              </div>
            </div>
            <div style="flex:1; min-width:100px;">
              <div class="field-label"><span>Unit Number</span></div>
              <input type="text" style="width:100%; text-align:center;" data-bind-text="unitNumber" value="${esc(state.unitNumber)}" placeholder="e.g. B-22-12">
            </div>
          </div>
        </div>

        <div class="section-grid">
          ${fieldEditable({label:'Property Purchase Price', tip:null, value:state.price, onInput:'price', min:100000, max:5000000, step:5000, prefix:'RM'})}
          ${fieldEditable({label:'Loan Margin', tip:null, value:state.loanMarginPct, onInput:'loanMarginPct', min:50, max:100, step:1, suffix:'%'})}
        </div>

        <div class="chain-result">
          <div class="chain-item"><div class="l">Property Price</div><div class="v">${rm(state.price)}</div></div>
          <div class="chain-item"><div class="l">Estimated Loan Amount (${state.loanMarginPct}%)</div><div class="v orange">${rm(D.loanAmount)}</div></div>
        </div>

        <div class="section-grid" style="margin-top:2px;">
          ${fieldEditable({label:"Developer's Rebate", tip:null, value:state.rebatePct, onInput:'rebatePct', min:0, max:30, step:0.5, suffix:'%'})}
          <div class="field">
            <div class="field-label"><span>Layout &amp; Size</span></div>
            <div class="layout-size-row">
              <input type="text" class="layout-input" data-bind-text="layout" value="${esc(state.layout)}" placeholder="3R, 2B">
              <div class="input-affix">
                <input type="text" inputmode="decimal" class="affix-input" data-bind-manual="unitSizeSqft" data-min="100" data-max="5000" value="${groupNum(state.unitSizeSqft)}">
                <span class="affix-suf">sqft</span>
              </div>
            </div>
          </div>
        </div>
        <div class="chain-result" style="margin-top:0;">
          <div class="chain-item"><div class="l">Developer's Rebate (${state.rebatePct}%)</div><div class="v">${rm(D.rebateAmount)}</div></div>
          <div class="chain-item"><div class="l">Estimated Down Payment (${D.downPaymentPct}%)</div><div class="v orange">${rm(D.downPayment)}</div></div>
        </div>

        <div class="divider"></div>
        <h3 class="mini-head">Extra Subsidy</h3>
        <div class="subsidy-list">
          ${renderSubsidyRows()}
        </div>
        <button type="button" class="subsidy-add-btn" data-subsidy-add="1">+ Add Subsidy</button>

        <div class="chain-result" style="margin-top:14px;">
          <div class="chain-item"><div class="l">SPA Price</div><div class="v">${rm(state.price)}</div></div>
          <div class="chain-item"><div class="l">– Developer's Rebate (${state.rebatePct}%)</div><div class="v">${rm(D.rebateAmount)}</div></div>
          <div class="chain-item"><div class="l">– Extra Subsidy (total)</div><div class="v">${rm(D.subsidyTotal)}</div></div>
          <div class="chain-item highlight"><div class="l">Final Nett Price</div><div class="v orange big">${rm(D.finalNettPrice)}</div></div>
        </div>

        <div class="divider"></div>

        <div class="section-grid">
          ${fieldEditable({label:'Interest Rate', tip:null, value:state.interestRatePct, onInput:'interestRatePct', min:2.5, max:6.5, step:0.05, suffix:'%', decimals:2})}
          ${fieldEditable({label:'Loan Tenure', tip:null, value:state.tenureYears, onInput:'tenureYears', min:5, max:35, step:1, suffix:' years'})}
        </div>

        <div class="chain-result">
          <div class="chain-item"><div class="l">Loan Amount</div><div class="v">${rm(D.loanAmount)}</div></div>
          <div class="chain-item highlight"><div class="l">Estimated Monthly Instalment</div><div class="v green big">${rm(D.monthlyInstalment)}</div></div>
        </div>

        <div class="disclaimer"><b>Estimated only.</b></div>
      </section>`;
    }

    function renderSubsidyRows() {
      return state.extraSubsidies.map((s, i) => `
        <div class="subsidy-row">
          <input type="text" class="subsidy-label-input" placeholder="e.g. Cashback / Free MOT" data-subsidy-label="${i}" value="${esc(s.label)}">
          <div class="input-affix">
            <span class="affix-pre">RM</span>
            <input type="text" inputmode="decimal" class="affix-input" style="text-align:center;" placeholder="0 or N/A" data-subsidy-amount="${i}" value="${esc(s.raw)}">
          </div>
          <button type="button" class="subsidy-remove-btn" data-subsidy-remove="${i}" title="Remove">&times;</button>
        </div>`).join('');
    }

    // -----------------------------------------------------------------
    // SECTION 02 — Cost Saving Breakdown
    // -----------------------------------------------------------------
    function renderSection2() {
      const cs = D.costSaving;
      return `
      <section class="card" id="sec-2-${id}">
        ${sectionHeader('02', 'Cost Saving Breakdown', "Costs the developer may absorb on your behalf, plus any renovation package — so you can see exactly how much you save.")}

        <div class="result-block" style="display:grid; grid-template-columns:max-content 1fr; column-gap:26px; row-gap:10px; align-items:baseline;">
          ${cs.items.map(it => resultRowTight(it.label, it.absorbed ? `<span style="color:var(--value-green);">Saved – ${rm(it.amount)}</span>` : `<span style="color:var(--ink-faint); font-weight:600;">Not absorbed</span>`)).join('')}
        </div>

        <h3 class="mini-head">Cost absorption toggles (edit to match this project)</h3>
        ${toggle({label:'Legal Fee (SPA) absorbed by developer', checked:state.legalFeeSpaAbsorbed, onBind:'legalFeeSpaAbsorbed'})}
        ${toggle({label:'Legal Fee (Loan Agreement) absorbed by developer', checked:state.legalFeeLoanAbsorbed, onBind:'legalFeeLoanAbsorbed'})}
        ${toggle({label:'Stamp Duty (Loan Agreement) absorbed by developer', checked:state.stampDutyLoanAbsorbed, onBind:'stampDutyLoanAbsorbed'})}
        ${toggle({label:'Disbursement &amp; Admin Fees absorbed by developer', checked:state.miscAbsorbed, onBind:'miscAbsorbed'})}

        <div class="field" style="margin-top:14px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div class="field-label" style="margin:0; flex:1 1 220px;"><span>Renovation Package (expected value of free renovation / furnishing)</span></div>
            <div class="input-affix" style="flex:1 1 240px; max-width:280px;">
              <span class="affix-pre">RM</span>
              <input type="text" inputmode="decimal" class="affix-input" data-bind-manual="renovationPackageRm" data-min="0" data-max="150000" value="${groupNum(state.renovationPackageRm)}">
            </div>
          </div>
        </div>

        <div class="chain-result" style="margin-top:4px;">
          <div class="chain-item highlight"><div class="l">Total Cost Savings</div><div class="v green big">${rm(cs.total)}</div></div>
        </div>

        <div class="disclaimer">Legal fee and stamp duty figures follow the Solicitors' Remuneration Order 2023 scale and the current loan agreement stamp duty rate. Confirm exact figures, and which costs this specific project actually absorbs, with your appointed lawyer.</div>
      </section>`;
    }

    // -----------------------------------------------------------------
    // SECTION 03 — DSR (Debt-Service-Ratio)
    // -----------------------------------------------------------------
    function renderSection3() {
      // Until the DSR Calculation page has been filled in with at least an
      // income, Section 03 stops right after the CTA — no numbers to show
      // yet, and no manual income/commitments fields here any more (the DSR
      // Calculation page is the one place that collects them).
      if (!D.hasDsrIncome) {
        return `
        <section class="card" id="sec-3-${id}">
          ${sectionHeader('03', 'DSR (Debt-Service-Ratio)', 'Can you reasonably afford this? Your new instalment is carried over automatically from Section 01.')}
          <a href="dsr-calculation.html" class="exitplan-btn active" style="display:block; text-align:center; text-decoration:none;">Check Your Home Loan Eligibility &rarr;</a>
        </section>`;
      }

      const posClass = D.dsr.withinRange ? 'good' : 'bad';
      const posLabel = D.dsr.withinRange ? 'Within Indicative Range' : 'Above Indicative Range';
      return `
      <section class="card" id="sec-3-${id}">
        ${sectionHeader('03', 'DSR (Debt-Service-Ratio)', 'Can you reasonably afford this? Your new instalment is carried over automatically from Section 01.')}

        <a href="dsr-calculation.html" class="exitplan-btn active" style="display:block; text-align:center; text-decoration:none; margin-bottom:16px;">Check Your Home Loan Eligibility &rarr;</a>

        <div class="result-block">
          <div class="field-label" style="margin-bottom:10px;"><span>From Your DSR Calculation${dsrSummary.jointApplicant ? ' (Joint Applicant)' : ''}</span></div>
          ${resultRow(dsrSummary.jointApplicant ? 'Combined Nett Income' : 'Nett Income', rm(dsrSummary.income))}
          ${dsrSummary.houseCount ? resultRow('House Loan' + countSuffix(dsrSummary.houseCount), rm(dsrSummary.house)) : ''}
          ${dsrSummary.carCount ? resultRow('Car Loan' + countSuffix(dsrSummary.carCount), rm(dsrSummary.car)) : ''}
          ${dsrSummary.ptptnCount ? resultRow('PTPTN' + countSuffix(dsrSummary.ptptnCount), rm(dsrSummary.ptptn)) : ''}
          ${dsrSummary.personalCount ? resultRow('Personal Loan' + countSuffix(dsrSummary.personalCount), rm(dsrSummary.personal)) : ''}
          ${dsrSummary.ccCount ? resultRow('Credit Card' + countSuffix(dsrSummary.ccCount), rm(dsrSummary.cc)) : ''}
          <div class="result-row total"><span class="k">Total Existing Commitments</span><span class="v">${rm(dsrSummary.total)}</span></div>
        </div>

        <div class="chain-result">
          <div class="chain-item"><div class="l">Existing Commitments (total)</div><div class="v">${rm(D.existingCommitmentsTotal)}</div></div>
          <div class="chain-item"><div class="l">+ New Property Estimated Instalment (from Section 01)</div><div class="v">${rm(D.monthlyInstalment)}</div></div>
          <div class="chain-item highlight"><div class="l">Total Monthly Debt Commitments</div><div class="v orange big">${rm(D.dsr.totalMonthlyCommitments)}</div></div>
        </div>

        <div class="result-block" style="margin-top:14px;">
          <div class="field-label" style="margin-bottom:10px;"><span>Estimated Financing Position</span><span class="badge badge-${posClass}">${posLabel}</span></div>
          ${resultRow('Estimated DSR', pct(D.dsr.dsrPct))}
          ${resultRow('Indicative DSR Limit (based on your income)', D.dsrThresholdPct + '%')}
          ${resultRow('Estimated maximum loan you may qualify for (income-based)', rm(D.eligibility.maxLoan), 'total')}
        </div>

        <div class="disclaimer"><b>Estimated only.</b></div>
      </section>`;
    }

    // -----------------------------------------------------------------
    // SECTION 04 — Financial Summary (+ Exit Plan button)
    // -----------------------------------------------------------------
    function renderSection4() {
      const posClass = D.dsr.withinRange ? 'status-good' : 'status-bad';
      const posLabel = D.dsr.withinRange ? 'Within Indicative DSR Range' : 'Above Indicative DSR Range';
      return `
      <section class="card summary-card" id="sec-4-${id}">
        ${sectionHeader('04', 'Financial Summary', 'The full picture in one place.')}

        <div class="summary-top">
          <div>
            <div class="summary-eyebrow">Financial Snapshot</div>
            <div class="summary-project">${esc(D.projectDisplayName)}</div>
          </div>
          <div class="summary-actions">
            <div class="status-pill ${posClass}">${posLabel}</div>
            <button type="button" class="exitplan-btn ${state.showRentalRoi ? 'active' : ''}" data-exitplan="1">${state.showRentalRoi ? 'Hide Rental ROI' : 'Exit Plan'}</button>
          </div>
        </div>

        <div class="summary-grid">
          <div class="summary-item"><div class="label">Property Price</div><div class="value">${rm(state.price)}</div></div>
          <div class="summary-item"><div class="label">Estimated Loan</div><div class="value orange">${rm(D.loanAmount)}</div></div>
          <div class="summary-item"><div class="label">Final Nett Price</div><div class="value orange">${rm(D.finalNettPrice)}</div></div>
          <div class="summary-item"><div class="label">Monthly Instalment</div><div class="value green">${rm(D.monthlyInstalment)}</div></div>
          <div class="summary-item"><div class="label">Size &amp; Layout</div><div class="value">${groupNum(state.unitSizeSqft)} SFT (${esc(state.layout)})</div></div>
          <div class="summary-item"><div class="label">Interest Rate</div><div class="value">${state.interestRatePct.toFixed(2)}%</div></div>
          <div class="summary-item"><div class="label">Loan Tenure</div><div class="value">${state.tenureYears} years</div></div>
          <div class="summary-item"><div class="label">Extra Subsidy</div><div class="value green">${rm(D.subsidyTotal)}</div></div>
        </div>

        <div class="disclaimer" style="margin-top:16px; background:transparent; border:1px solid var(--border);">${CFG.branding.disclaimer}</div>
      </section>`;
    }

    // -----------------------------------------------------------------
    // SECTION 05 — Rental ROI (shown only after "Exit Plan" is clicked)
    // -----------------------------------------------------------------
    function renderRentalSection() {
      return `
      <section class="card" id="sec-5-${id}">
        ${sectionHeader('05', 'Rental ROI', 'Same property, same loan — now layered with expected rental income.')}

        <div class="chain-result">
          <div class="chain-item"><div class="l">Monthly Instalment (from Section 01)</div><div class="v">${rm(D.monthlyInstalment)}</div></div>
          <div class="chain-item"><div class="l">Unit Size &amp; Layout (from Section 01)</div><div class="v">${groupNum(state.unitSizeSqft)} sqft (${esc(state.layout)})</div></div>
        </div>

        <div class="section-grid" style="margin-top:10px;">
          ${fieldEditable({label:'Expected Monthly Rental', tip:null, value:state.monthlyRental, onInput:'monthlyRental', min:0, max:20000, step:50, prefix:'RM'})}
        </div>
        <div class="section-grid">
          ${fieldEditable({label:'Maintenance Fee + Sinking Fund', tip:'Per sqft per month — the total below is this rate × your unit size.', value:state.maintenanceFeePerSqft, onInput:'maintenanceFeePerSqft', min:0, max:2, step:0.01, prefix:'RM', suffix:'/sqft', decimals:2})}
        </div>
        <div class="chain-result" style="margin-top:0;">
          <div class="chain-item"><div class="l">Maintenance Fee + Sinking Fund (total)</div><div class="v orange">${rm(D.maintenanceFeeMonthly)}</div></div>
        </div>

        <div class="divider"></div>
        <div class="chain-result">
          <div class="chain-item"><div class="l">Expected Monthly Rental</div><div class="v">${rm(state.monthlyRental)}</div></div>
          <div class="chain-item"><div class="l">– Monthly Instalment</div><div class="v">${rm(D.monthlyInstalment)}</div></div>
          <div class="chain-item"><div class="l">– Maintenance Fee + Sinking Fund</div><div class="v">${rm(D.maintenanceFeeMonthly)}</div></div>
          <div class="chain-item highlight"><div class="l">Expected Monthly Return</div><div class="v ${D.expectedMonthlyReturn>=0?'green':'orange'} big">${signedRm(D.expectedMonthlyReturn)}</div></div>
        </div>

        <div class="divider"></div>
        <h3 class="mini-head">ROI Calculation</h3>
        <div class="result-block">
          ${resultRow('Rental / Month', rm(state.monthlyRental))}
          ${resultRow('Rental / Year', rm(D.rentalPerYear))}
          ${resultRow('Monthly Instalment', rm(D.monthlyInstalment))}
          ${resultRow('Housing Price (Nett)', rm(D.finalNettPrice))}
        </div>
        <div class="chain-result" style="margin-top:0;">
          <div class="chain-item highlight"><div class="l">ROI Calculation (Rental / Year ÷ Housing Price Nett)<span class="tip" data-tip="${TIP.roi}">?</span></div><div class="v green big">${pct(D.rentalRoiPct)}</div></div>
        </div>

        <div class="disclaimer">Rental figures are the buyer's / agent's estimate based on current market comparables, not a guaranteed income.</div>
      </section>`;
    }

    // -----------------------------------------------------------------
    // Body markup for this instance (everything inside its column)
    // -----------------------------------------------------------------
    function renderBody() {
      // In Comparison mode, Section 03 (DSR) is shown once only — attached
      // to Project A — rather than duplicated per project: the buyer's
      // income and commitments don't change depending on which project is
      // being looked at, so there is no need to fill it in twice.
      const showDsrSection = !pageState.comparison || id === 'a';
      return `
        ${renderSection1()}
        ${renderSection2()}
        ${showDsrSection ? renderSection3() : ''}
        ${renderSection4()}
        ${state.showRentalRoi ? renderRentalSection() : ''}
      `;
    }

    // -----------------------------------------------------------------
    // Event binding — SCOPED to this instance's own root element, so
    // editing one calculator in Comparison mode never touches the other.
    // -----------------------------------------------------------------
    function bindEvents(rootEl) {
      rootEl.querySelectorAll('[data-toggle]').forEach(el => {
        el.addEventListener('change', (e) => {
          const key = el.getAttribute('data-toggle');
          set(key, e.target.checked);
        });
      });
      // Manual "type it in" fields — commit on blur or Enter, not on every
      // keystroke, so re-rendering the page doesn't steal focus mid-type.
      rootEl.querySelectorAll('[data-bind-manual]').forEach(el => {
        const commit = () => {
          const key = el.getAttribute('data-bind-manual');
          const min = parseFloat(el.getAttribute('data-min'));
          const max = parseFloat(el.getAttribute('data-max'));
          let val = parseFloat(cleanNum(el.value));
          if (isNaN(val)) val = min;
          val = Math.min(max, Math.max(min, val));
          set(key, val);
        };
        el.addEventListener('change', commit);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
      });
      // Free-form text fields (e.g. Layout — "3R, 2B") — commit as typed, no
      // numeric cleaning/clamping.
      rootEl.querySelectorAll('[data-bind-text]').forEach(el => {
        const commit = () => {
          const key = el.getAttribute('data-bind-text');
          set(key, el.value);
        };
        el.addEventListener('change', commit);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
      });
      // Extra Subsidy rows — free-form label + amount ("N/A" allowed)
      rootEl.querySelectorAll('[data-subsidy-label]').forEach(el => {
        const commit = () => {
          const i = parseInt(el.getAttribute('data-subsidy-label'), 10);
          if (state.extraSubsidies[i]) state.extraSubsidies[i].label = el.value;
          inst.recalcAndRender();
        };
        el.addEventListener('change', commit);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
      });
      rootEl.querySelectorAll('[data-subsidy-amount]').forEach(el => {
        const commit = () => {
          const i = parseInt(el.getAttribute('data-subsidy-amount'), 10);
          if (state.extraSubsidies[i]) {
            const cleaned = cleanNum(el.value).trim();
            const n = parseFloat(cleaned);
            // A numeric entry gets reformatted with thousand separators; text
            // like "N/A" (or blank) is kept exactly as typed.
            state.extraSubsidies[i].raw = (cleaned !== '' && isFinite(n)) ? groupNum(n) : el.value;
          }
          inst.recalcAndRender();
        };
        el.addEventListener('change', commit);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
      });
      rootEl.querySelectorAll('[data-subsidy-remove]').forEach(el => {
        el.addEventListener('click', () => {
          const i = parseInt(el.getAttribute('data-subsidy-remove'), 10);
          state.extraSubsidies.splice(i, 1);
          inst.recalcAndRender();
        });
      });
      rootEl.querySelectorAll('[data-subsidy-add]').forEach(el => {
        el.addEventListener('click', () => {
          state.extraSubsidies.push({ label: '', raw: '' });
          inst.recalcAndRender();
        });
      });
      // Exit Plan — reveals/hides the Rental ROI section for this instance only
      rootEl.querySelectorAll('[data-exitplan]').forEach(el => {
        el.addEventListener('click', () => {
          state.showRentalRoi = !state.showRentalRoi;
          inst.recalcAndRender();
        });
      });
      bindTips(rootEl);
    }

    const inst = { id, label, state, recalc, renderBody, bindEvents, recalcAndRender: () => { recalc(); pageRender(); } };
    recalc();
    return inst;
  }

  // =====================================================================
  // PAGE LEVEL — topbar, hero, Comparison toggle, one or two instances
  // side by side, footer.
  // =====================================================================
  const savedPageState = loadSavedPageState();
  const pageState = { comparison: !!(savedPageState && savedPageState.comparison) };
  const instances = [
    createInstance('a', 'Project A', savedPageState && savedPageState.a),
    createInstance('b', 'Project B', savedPageState && savedPageState.b),
  ];

  function renderInstanceColumn(inst) {
    return `<div class="calc-instance" id="calc-root-${inst.id}">
      ${pageState.comparison ? `<div class="instance-label">${inst.label}</div>` : ''}
      ${inst.renderBody()}
    </div>`;
  }

  function pageRender() {
    const appEl = document.getElementById('app');
    appEl.classList.toggle('is-comparison', pageState.comparison);
    appEl.innerHTML = `
      <div class="hero-frame">
        <div class="topbar">
          <div class="logo-badge">${CALC_ICON}</div>
          <div>
            <div class="brand-name">${CFG.branding.agentTitle}</div>
            <div class="brand-tag">${CFG.branding.agentTagline}</div>
          </div>
        </div>
        <div class="hero-title-row" style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-top:16px;">
          <div class="hero-title-box" style="margin-top:0;">
            <h1>Integrated Home Loan Calculator</h1>
            <p>A Calculator That Makes Everything Clear.</p>
          </div>
          <div class="topbar-actions" style="display:flex; flex-direction:column; align-items:flex-end; gap:8px; flex:none;">
            <button type="button" class="comparison-btn ${pageState.comparison ? 'active' : ''}" style="margin-left:0; -webkit-appearance:none; appearance:none; display:inline-flex; align-items:center; justify-content:center; line-height:1.3; white-space:nowrap;" data-comparison-toggle="1">Comparison</button>
            <a href="dsr-calculation.html" class="comparison-btn" style="margin-left:0; text-decoration:none; text-align:center; display:inline-flex; align-items:center; justify-content:center; line-height:1.3; white-space:nowrap;">DSR Calculation</a>
          </div>
        </div>
      </div>

      <div class="calc-columns">
        ${pageState.comparison ? instances.map(renderInstanceColumn).join('') : renderInstanceColumn(instances[0])}
      </div>

      <div class="footer-note">
        Prepared by <b>${CFG.branding.agentName}</b> (${CFG.branding.handle}) · IQI Realty<br>
        For illustration purposes. Please verify all figures with Tony and the recommended bankers before making a decision.
      </div>
    `;
    bindTopEvents();
    const visible = pageState.comparison ? instances : [instances[0]];
    visible.forEach(inst => {
      const rootEl = document.getElementById('calc-root-' + inst.id);
      if (rootEl) inst.bindEvents(rootEl);
    });
    savePageState();
  }

  function bindTopEvents() {
    const btn = document.querySelector('[data-comparison-toggle]');
    if (btn) btn.addEventListener('click', () => { pageState.comparison = !pageState.comparison; pageRender(); });
  }

  // -------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------
  pageRender();
})();
