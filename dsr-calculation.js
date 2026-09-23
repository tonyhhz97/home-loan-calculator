/* =========================================================================
   DSR CALCULATION — helper page
   -------------------------------------------------------------------------
   A detailed, standalone breakdown of exactly what counts toward a buyer's
   monthly debt commitments for DSR purposes. Lives at its own URL
   (dsr-calculation.html) alongside the main calculator (index.html) — the
   topbar's "DSR Calculation" button links here.

   Each commitment category (house loan, car loan, PTPTN, personal loan,
   credit card) is a LIST — a buyer can add as many entries as they actually
   have (e.g. two house loans, one under their own name and one joint), and
   remove any entry. A category with zero entries simply contributes RM 0 —
   there is no separate "no existing loan" toggle to manage.

   JOINT APPLICANT: ticking "Joint Applicant" near the top adds a Main
   Applicant / Joint Applicant TAB inside every commitment section — the
   buyer fills in the Main Applicant's loans on one tab, switches to the
   Joint Applicant tab to fill in the co-applicant's loans separately, and
   the section's total always adds both together automatically. Section 06
   also gets a second income + age block — the eligibility estimate uses the
   combined income of both applicants, and the younger applicant's age to cap
   tenure.

   The final CTA sends a plain-text summary of everything filled in
   (income/age, every commitment, and the estimated eligibility) straight to
   Tony's WhatsApp via a wa.me link — this page's purpose is to hand Tony a
   ready-to-act-on lead, not just to bounce the buyer back to the calculator.

   PERSISTENCE: everything typed in is kept in sessionStorage, so navigating
   away (e.g. "Back to Calculator") and returning restores exactly what was
   filled in. It only resets when the browser tab is closed.

   HAND-OFF TO THE MAIN CALCULATOR: alongside the full state above, a small
   summary (income, each commitment category's total + entry count, and the
   estimated eligibility) is saved separately under a "dsrCalcSummary" key.
   The main calculator's Section 03 (DSR) reads that summary — once it
   exists, Section 03 shows it as a read-only recap instead of asking for
   income/commitments again, and (in Comparison mode) shares it across both
   projects rather than asking twice.

   Deliberately independent of app.js: this page has no comparison mode, no
   multi-instance factory — just one flat state object and a re-render.
   ========================================================================= */
(function () {
  const CFG = window.CALC_CONFIG;
  const C = CFG.branding.colors;
  const WHATSAPP_NUMBER = '601113207364';
  const STORAGE_KEY = 'dsrCalc:v1';
  const SUMMARY_KEY = 'dsrCalcSummary:v1';

  // Same brand CSS variables app.js applies — kept identical so this page
  // matches the main calculator exactly even if config.js is re-branded.
  const root = document.documentElement.style;
  root.setProperty('--primary', C.primary);
  root.setProperty('--primary-dk', C.primaryDk);
  root.setProperty('--accent', C.accent);
  root.setProperty('--accent-dark', C.accentDark);
  root.setProperty('--font-family', CFG.branding.fontFamily || "'Times New Roman', Times, serif");

  // ---- formatting helpers (same behaviour as app.js, kept local so this
  // page has no dependency on it) ------------------------------------------
  const fmt = new Intl.NumberFormat('en-MY', { maximumFractionDigits: 0 });
  const rm = (n) => 'RM ' + fmt.format(Math.round(n || 0));
  const rmK = (n) => 'RM' + Math.round((n || 0) / 1000) + 'k';
  const groupNum = (n, decimals = 0) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const cleanNum = (s) => String(s == null ? '' : s).replace(/,/g, '');
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  // -------------------------------------------------------------------
  // Persistence — sessionStorage only (cleared when the tab is closed,
  // kept across navigating to/from the main calculator or reloading).
  // -------------------------------------------------------------------
  function loadSaved() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveState() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable — fail silently */ }
  }
  // Small hand-off summary for the main calculator's Section 03 — saved
  // separately from the full state above so app.js never has to know this
  // page's internal shape (multi-entry lists, tabs, etc.), only the totals.
  function saveSummary() {
    try {
      sessionStorage.setItem(SUMMARY_KEY, JSON.stringify({
        income: D.combinedIncome,
        jointApplicant: state.jointApplicant,
        house: D.houseCommitment, houseCount: state.houseLoans.length,
        car: D.carCommitment, carCount: state.carLoans.length,
        ptptn: D.ptptnCommitment, ptptnCount: state.ptptnList.length,
        personal: D.personalCommitment, personalCount: state.personalLoans.length,
        cc: D.ccCommitment, ccCount: state.creditCards.length,
        total: D.total,
        eligibility: D.eligibility,
        updatedAt: Date.now(),
      }));
    } catch (e) { /* storage unavailable — fail silently */ }
  }

  // -------------------------------------------------------------------
  // State — five commitment categories, each a list of entries, plus the
  // buyer's (and, if joint, the co-applicant's) nett income and age, plus
  // which applicant's tab is currently active inside each section.
  // -------------------------------------------------------------------
  const CAT_ARRAY = { house: 'houseLoans', car: 'carLoans', ptptn: 'ptptnList', personal: 'personalLoans', cc: 'creditCards' };
  const ENTRY_DEFAULTS = {
    house: () => ({ status: 'own', instalment: 0, applicant: 'main' }),
    car: () => ({ instalment: 0, applicant: 'main' }),
    ptptn: () => ({ payment: 0, applicant: 'main' }),
    personal: () => ({ payment: 0, applicant: 'main' }),
    cc: () => ({ mode: 'clear', outstanding: 0, installmentAmount: 0, applicant: 'main' }),
  };

  // Section 08 — optional supporting documents (financial assets a buyer can
  // show the bank alongside income, which can help loan approval odds and
  // the rate offered). Each is a simple tick + optional amount; the amount
  // is never required.
  const SUPPORTING_DOC_ITEMS = [
    { key: 'fixedDeposit', label: 'Fixed Deposit' },
    { key: 'stocksBonds', label: 'Stocks & Bonds' },
    { key: 'unitTrust', label: 'Unit Trust' },
    { key: 'moneyMarket', label: 'Money Market Funds' },
    { key: 'others', label: 'Others' },
  ];
  function defaultSupportingDocs() {
    const docs = {};
    SUPPORTING_DOC_ITEMS.forEach(it => { docs[it.key] = { checked: false, amount: 0 }; });
    return docs;
  }

  const state = {
    jointApplicant: false,
    houseLoans: [],
    carLoans: [],
    ptptnList: [],
    personalLoans: [],
    creditCards: [],
    nettIncome: 5000,
    age: 26,
    nettIncomeJoint: 0,
    ageJoint: 30,
    // Which applicant's entries are shown/added-to right now, per category —
    // only relevant once Joint Applicant is ticked.
    activeTab: { house: 'main', car: 'main', ptptn: 'main', personal: 'main', cc: 'main' },
    supportingDocs: defaultSupportingDocs(),
  };
  {
    const saved = loadSaved();
    if (saved) Object.assign(state, saved);
    if (!state.activeTab) state.activeTab = { house: 'main', car: 'main', ptptn: 'main', personal: 'main', cc: 'main' };
    if (!state.supportingDocs) state.supportingDocs = defaultSupportingDocs();
  }
  let D = {};

  // Healthy indicative DSR range by nett income band — a simple, transparent
  // rule of thumb (not a bank policy): the more comfortable the income, the
  // wider the range a buyer can reasonably stretch to.
  function dsrRangeForIncome(income) {
    if (income >= 6000) return { min: 80, max: 85 };
    if (income >= 5000) return { min: 70, max: 80 };
    if (income >= 4000) return { min: 60, max: 70 };
    return { min: 60, max: 60 };
  }

  // How much a single entry contributes toward the monthly commitment total
  // — shared by recalc() (whole-category totals) and applicantSubtotal()
  // (per-applicant subtotals shown once Joint Applicant is ticked).
  function entryContribution(cat, entry) {
    if (cat === 'house') return entry.status === 'joint' ? round2(entry.instalment / 2) : entry.instalment;
    if (cat === 'car') return entry.instalment;
    if (cat === 'ptptn') return entry.payment;
    if (cat === 'personal') return entry.payment;
    if (cat === 'cc') return entry.mode === 'installment' ? entry.installmentAmount : 0;
    return 0;
  }
  function applicantSubtotal(cat, applicant) {
    const arr = state[CAT_ARRAY[cat]];
    return round2(arr.filter(e => e.applicant === applicant).reduce((sum, e) => sum + entryContribution(cat, e), 0));
  }

  function recalc() {
    const houseCommitment = round2(state.houseLoans.reduce((sum, e) => sum + entryContribution('house', e), 0));
    const carCommitment = round2(state.carLoans.reduce((sum, e) => sum + entryContribution('car', e), 0));
    const ptptnCommitment = round2(state.ptptnList.reduce((sum, e) => sum + entryContribution('ptptn', e), 0));
    const personalCommitment = round2(state.personalLoans.reduce((sum, e) => sum + entryContribution('personal', e), 0));
    const ccCommitment = round2(state.creditCards.reduce((sum, e) => sum + entryContribution('cc', e), 0));
    const total = round2(houseCommitment + carCommitment + ptptnCommitment + personalCommitment + ccCommitment);

    const combinedIncome = round2(state.nettIncome + (state.jointApplicant ? state.nettIncomeJoint : 0));

    // ---- Healthy DSR range + maximum property loan estimate — only once
    // the buyer has filled in a nett income.
    let eligibility = null;
    if (combinedIncome > 0) {
      const range = dsrRangeForIncome(combinedIncome);
      const maxAgeAtLoanMaturity = 70; // assumption — see disclaimer
      // Tenure is based on whichever applicant is younger (the longer runway
      // to age 70), rather than the more conservative older-applicant basis.
      const ageBasis = state.jointApplicant ? Math.min(state.age || 0, state.ageJoint || 0) : (state.age || 0);
      const tenureYears = Math.max(1, Math.min(35, maxAgeAtLoanMaturity - ageBasis));
      const rate = CFG.project.interestRatePct;
      const atPct = (pct) => CALC.calcMaxLoanEligibility({
        monthlyIncome: combinedIncome, monthlyCommitments: total, numberOfBorrowers: state.jointApplicant ? 2 : 1,
        dsrThresholdPct: pct, annualRatePct: rate, tenureYears
      });
      eligibility = { range, tenureYears, rate, ageBasis, low: atPct(range.min), high: atPct(range.max) };
    }

    D = { houseCommitment, carCommitment, ptptnCommitment, personalCommitment, ccCommitment, total, combinedIncome, eligibility };
  }

  function set(key, val) { state[key] = val; recalcAndRender(); }
  function setEntryField(cat, index, field, val) {
    const arr = state[CAT_ARRAY[cat]];
    if (arr && arr[index]) arr[index][field] = val;
    recalcAndRender();
  }
  function addEntry(cat) {
    const arr = state[CAT_ARRAY[cat]];
    if (arr) {
      const entry = ENTRY_DEFAULTS[cat]();
      // Tag the new entry to whichever applicant tab is currently active,
      // so it shows up where the buyer is actually looking.
      if (state.jointApplicant) entry.applicant = state.activeTab[cat];
      arr.push(entry);
    }
    recalcAndRender();
  }
  function removeEntry(cat, index) {
    const arr = state[CAT_ARRAY[cat]];
    if (arr) arr.splice(index, 1);
    recalcAndRender();
  }
  function setActiveTab(cat, applicant) {
    state.activeTab[cat] = applicant;
    recalcAndRender();
  }
  function setDocChecked(key, checked) {
    if (state.supportingDocs[key]) state.supportingDocs[key].checked = checked;
    recalcAndRender();
  }
  function setDocAmount(key, val) {
    if (state.supportingDocs[key]) state.supportingDocs[key].amount = val;
    recalcAndRender();
  }
  function recalcAndRender() { recalc(); render(); saveState(); saveSummary(); }

  // -------------------------------------------------------------------
  // Small UI builders
  // -------------------------------------------------------------------
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

  function sectionHeader(no, title, sub) {
    return `<div class="section-header"><div class="section-no">${no}</div><div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
  }

  function resultRow(k, v, cls = '') {
    return `<div class="result-row ${cls}"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  }

  // A pill selector for a single entry field (e.g. this house loan's
  // ownership status, this card's clear/installment mode) — same visual
  // language throughout.
  function pillGroupEntry(cat, index, field, options, current) {
    return `<div class="dsr-pill-group">
      ${options.map(opt => `
        <button type="button" class="dsr-pill ${opt.value === current ? 'active' : ''}" data-entry-pill="${cat}:${index}:${field}" data-entry-pill-value="${opt.value}">${opt.label}</button>
      `).join('')}
    </div>`;
  }

  // Shown at the top of every commitment section, but only once Joint
  // Applicant is ticked — switches which applicant's entries are visible
  // and which applicant new entries get tagged to. The section total below
  // always adds both applicants together, whichever tab is active.
  function applicantTabSwitcher(cat) {
    if (!state.jointApplicant) return '';
    const current = state.activeTab[cat];
    return `
      <div class="dsr-pill-group" style="margin-bottom:4px;">
        <button type="button" class="dsr-pill ${current === 'main' ? 'active' : ''}" data-tab-switch="${cat}:main">Main Applicant</button>
        <button type="button" class="dsr-pill ${current === 'joint' ? 'active' : ''}" data-tab-switch="${cat}:joint">Joint Applicant</button>
      </div>
      <div class="dsr-empty-note" style="margin-bottom:10px; font-style:normal;">Filling in for the <b>${current === 'main' ? 'Main' : 'Joint'} Applicant</b> — switch tabs above to fill in the other applicant's commitments. Both are added together in the total below.</div>
    `;
  }

  // Per-applicant subtotal rows, shown under the entry list once Joint
  // Applicant is ticked and there's at least one entry on either side.
  function applicantSubtotalRows(cat) {
    if (!state.jointApplicant) return '';
    const arr = state[CAT_ARRAY[cat]];
    if (!arr.length) return '';
    const mainTotal = applicantSubtotal(cat, 'main');
    const jointTotal = applicantSubtotal(cat, 'joint');
    return `
      <div class="result-block" style="margin-top:10px;">
        ${resultRow('Main Applicant Subtotal', rm(mainTotal))}
        ${resultRow('Joint Applicant Subtotal', rm(jointTotal))}
      </div>`;
  }

  function moneyField(label, key, value, { placeholder = '0', max = 100000 } = {}) {
    return `
      <div class="field">
        <div class="field-label"><span>${label}</span></div>
        <div class="input-affix">
          <span class="affix-pre">RM</span>
          <input type="text" inputmode="decimal" class="affix-input" data-bind-manual="${key}" data-min="0" data-max="${max}" placeholder="${placeholder}" value="${groupNum(value)}">
        </div>
      </div>`;
  }

  function ageField(key, value) {
    return `
      <div class="field">
        <div class="field-label"><span>Age</span></div>
        <div class="input-affix">
          <input type="text" inputmode="decimal" class="affix-input" data-bind-manual="${key}" data-min="18" data-max="70" value="${groupNum(value)}">
          <span class="affix-suf">years old</span>
        </div>
      </div>`;
  }

  function moneyFieldEntry(label, cat, index, field, value, { placeholder = '0', max = 100000 } = {}) {
    return `
      <div class="field">
        <div class="field-label"><span>${label}</span></div>
        <div class="input-affix">
          <span class="affix-pre">RM</span>
          <input type="text" inputmode="decimal" class="affix-input" data-entry-field="${cat}:${index}:${field}" data-min="0" data-max="${max}" placeholder="${placeholder}" value="${groupNum(value)}">
        </div>
      </div>`;
  }

  // Amount field for a Section 08 supporting document — always optional,
  // so the placeholder says so and a blank/zero entry is never a problem.
  function moneyFieldDoc(label, key, value) {
    return `
      <div class="field">
        <div class="field-label"><span>${label}</span></div>
        <div class="input-affix">
          <span class="affix-pre">RM</span>
          <input type="text" inputmode="decimal" class="affix-input" data-doc-field="${key}" data-min="0" data-max="10000000" placeholder="0 (optional)" value="${groupNum(value)}">
        </div>
      </div>`;
  }

  function calloutBox(text) {
    return `<div class="dsr-callout">${text}</div>`;
  }

  // Renders one category's currently-visible entries (each wrapped in a
  // removable .dsr-entry card) plus the "+ Add" button underneath.
  // `items` is an array of {entry, index, pos} — `index` is the entry's
  // real position in the underlying full array (used for field/remove
  // bindings), `pos` is its position within the currently visible list
  // (used for the "House Loan 1 / 2 / ..." display numbering).
  function renderEntryList(cat, items, renderEntryFields, { addLabel = '+ Add', emptyNote = '' } = {}) {
    const rows = items.map(({ entry, index, pos }) => `
      <div class="dsr-entry">
        <button type="button" class="dsr-entry-remove" data-entry-remove="${cat}:${index}" title="Remove">&times;</button>
        ${renderEntryFields(entry, index, pos)}
      </div>`).join('');
    return `
      ${items.length ? rows : (emptyNote ? `<div class="dsr-empty-note">${emptyNote}</div>` : '')}
      <button type="button" class="subsidy-add-btn" data-entry-add="${cat}" style="margin-top:${items.length ? '10px' : '4px'};">${addLabel}</button>
    `;
  }

  // Builds the {entry, index, pos} list for a category, filtered to the
  // currently active applicant tab (or every entry, when not joint).
  function visibleEntries(cat) {
    const arr = state[CAT_ARRAY[cat]];
    const all = arr.map((entry, index) => ({ entry, index }));
    const filtered = state.jointApplicant ? all.filter(x => x.entry.applicant === state.activeTab[cat]) : all;
    return filtered.map((x, pos) => ({ entry: x.entry, index: x.index, pos }));
  }

  // Count suffix for the summary box, e.g. "House Loan (x2)" — always shown
  // once there's at least one entry, so Tony can see at a glance how many
  // properties/loans are already financed (relevant to loan margin: a 3rd
  // residential property is typically capped lower by the bank).
  function countSuffix(n) {
    return n >= 1 ? ` (x${n})` : '';
  }

  // -------------------------------------------------------------------
  // Joint Applicant toggle
  // -------------------------------------------------------------------
  function renderJointApplicantToggle() {
    return `
      <section class="card" id="sec-dsr-joint">
        <label style="display:flex; align-items:center; gap:12px; cursor:pointer;">
          <input type="checkbox" data-joint-toggle="1" ${state.jointApplicant ? 'checked' : ''} style="width:21px; height:21px; accent-color:var(--accent); flex:none; cursor:pointer;">
          <span style="font-size:19px; font-weight:700;">Joint Applicant</span>
        </label>
        <div class="dsr-empty-note" style="margin-top:8px; font-style:normal;">
          Applying together with a co-borrower (spouse, family member, etc.)? Tick this to get a Main Applicant / Joint Applicant tab inside every commitment section below — fill each applicant's loans separately, and the totals combine automatically.
        </div>
      </section>`;
  }

  // -------------------------------------------------------------------
  // Sections
  // -------------------------------------------------------------------
  function renderHouseLoanSection() {
    return `
      <section class="card" id="sec-dsr-1">
        ${sectionHeader('01', 'Existing House Loan',
          'Whether — and how much — each loan counts depends on how it is held, not just whether you own a property.')}

        ${calloutBox(
          'A property that is fully paid off, or still only under SPA with no active bank loan, does not count as a commitment at all. ' +
          'A loan under your own name counts in full; a loan under joint names counts at half the monthly instalment — banks typically split a joint commitment evenly between borrowers. ' +
          'If you currently have more than one house loan, add each one separately below.'
        )}

        <div style="margin-top:14px;">
          ${applicantTabSwitcher('house')}
          ${renderEntryList('house', visibleEntries('house'), (entry, index, pos) => `
            <div class="field-label"><span>House Loan ${pos + 1} — Ownership</span></div>
            ${pillGroupEntry('house', index, 'status', [
              { value: 'own', label: 'Under My Name' },
              { value: 'joint', label: 'Joint Name' },
            ], entry.status)}
            <div class="section-grid" style="margin-top:12px;">
              ${moneyFieldEntry('Monthly Instalment', 'house', index, 'instalment', entry.instalment)}
            </div>
            <div class="chain-result" style="margin-top:4px;">
              <div class="chain-item highlight"><div class="l">Commitment${entry.status === 'joint' ? ' (50% bank-loan share)' : ''}</div><div class="v orange">${rm(entry.status === 'joint' ? round2(entry.instalment / 2) : entry.instalment)}</div></div>
            </div>
          `, { addLabel: '+ Add House Loan', emptyNote: 'No existing house loan added.' })}
          ${applicantSubtotalRows('house')}
        </div>

        ${state.houseLoans.length ? `
          <div class="chain-result" style="margin-top:14px;">
            <div class="chain-item highlight"><div class="l">Total House Loan Commitment${countSuffix(state.houseLoans.length)}</div><div class="v orange big">${rm(D.houseCommitment)}</div></div>
          </div>` : ''}
      </section>`;
  }

  function renderCarLoanSection() {
    return `
      <section class="card" id="sec-dsr-2">
        ${sectionHeader('02', 'Existing Car Loan', 'Monthly instalment for every car loan currently registered under your name.')}

        ${calloutBox(
          'Even if someone else — a parent, spouse or other family member — is the one actually paying the monthly instalment, the bank still counts it as your own commitment for as long as the loan is registered under your name. Add each car loan you have separately below.'
        )}

        <div style="margin-top:14px;">
          ${applicantTabSwitcher('car')}
          ${renderEntryList('car', visibleEntries('car'), (entry, index, pos) => `
            <div class="section-grid">
              ${moneyFieldEntry(`Car Loan ${pos + 1} — Monthly Instalment`, 'car', index, 'instalment', entry.instalment)}
            </div>
          `, { addLabel: '+ Add Car Loan', emptyNote: 'No existing car loan added.' })}
          ${applicantSubtotalRows('car')}
        </div>

        ${state.carLoans.length ? `
          <div class="chain-result" style="margin-top:14px;">
            <div class="chain-item highlight"><div class="l">Total Car Loan Commitment${countSuffix(state.carLoans.length)}</div><div class="v orange big">${rm(D.carCommitment)}</div></div>
          </div>` : ''}
      </section>`;
  }

  function renderPtptnSection() {
    return `
      <section class="card" id="sec-dsr-3">
        ${sectionHeader('03', 'PTPTN', 'Your current monthly PTPTN repayment(s), if any.')}
        <div style="margin-top:2px;">
          ${applicantTabSwitcher('ptptn')}
          ${renderEntryList('ptptn', visibleEntries('ptptn'), (entry, index, pos) => `
            <div class="section-grid">
              ${moneyFieldEntry(`PTPTN ${pos + 1} — Monthly Payment`, 'ptptn', index, 'payment', entry.payment)}
            </div>
          `, { addLabel: '+ Add PTPTN', emptyNote: 'No existing PTPTN repayment added.' })}
          ${applicantSubtotalRows('ptptn')}
        </div>
        ${state.ptptnList.length ? `
          <div class="chain-result" style="margin-top:14px;">
            <div class="chain-item highlight"><div class="l">Total PTPTN Commitment${countSuffix(state.ptptnList.length)}</div><div class="v orange big">${rm(D.ptptnCommitment)}</div></div>
          </div>` : ''}
      </section>`;
  }

  function renderPersonalLoanSection() {
    return `
      <section class="card" id="sec-dsr-4">
        ${sectionHeader('04', 'Personal Loan', 'Monthly repayment for every personal loan (bank or otherwise), if any.')}
        <div style="margin-top:2px;">
          ${applicantTabSwitcher('personal')}
          ${renderEntryList('personal', visibleEntries('personal'), (entry, index, pos) => `
            <div class="section-grid">
              ${moneyFieldEntry(`Personal Loan ${pos + 1} — Monthly Payment`, 'personal', index, 'payment', entry.payment)}
            </div>
          `, { addLabel: '+ Add Personal Loan', emptyNote: 'No existing personal loan added.' })}
          ${applicantSubtotalRows('personal')}
        </div>
        ${state.personalLoans.length ? `
          <div class="chain-result" style="margin-top:14px;">
            <div class="chain-item highlight"><div class="l">Total Personal Loan Commitment${countSuffix(state.personalLoans.length)}</div><div class="v orange big">${rm(D.personalCommitment)}</div></div>
          </div>` : ''}
      </section>`;
  }

  function renderCreditCardSection() {
    return `
      <section class="card" id="sec-dsr-5">
        ${sectionHeader('05', 'Credit Card', 'Only a card with an active installment plan is treated as a commitment — a card you clear in full every month is not.')}

        ${calloutBox(
          'If you always clear the statement balance on time, choose "Clear Outstanding Balance On Time" — it is not counted. ' +
          'If you are currently on an installment plan (e.g. a 0% instalment purchase), choose "Having Installment Plans" and fill in the outstanding balance and the total installment amount — the installment amount you enter is counted in full as your monthly commitment. Add each card separately below.'
        )}

        <div style="margin-top:14px;">
          ${applicantTabSwitcher('cc')}
          ${renderEntryList('cc', visibleEntries('cc'), (entry, index, pos) => `
            <div class="field-label"><span>Credit Card ${pos + 1}</span></div>
            ${pillGroupEntry('cc', index, 'mode', [
              { value: 'clear', label: 'Clear Outstanding Balance On Time' },
              { value: 'installment', label: 'Having Installment Plans' },
            ], entry.mode)}
            ${entry.mode === 'installment' ? `
              <div class="section-grid" style="margin-top:12px;">
                ${moneyFieldEntry('Outstanding Balance', 'cc', index, 'outstanding', entry.outstanding)}
                ${moneyFieldEntry('Total Installment Amount', 'cc', index, 'installmentAmount', entry.installmentAmount)}
              </div>
            ` : ''}
          `, { addLabel: '+ Add Credit Card', emptyNote: 'No credit card added.' })}
          ${applicantSubtotalRows('cc')}
        </div>

        ${state.creditCards.length ? `
          <div class="chain-result" style="margin-top:14px;">
            <div class="chain-item highlight"><div class="l">Total Credit Card Commitment${countSuffix(state.creditCards.length)}</div><div class="v orange big">${rm(D.ccCommitment)}</div></div>
          </div>` : ''}
      </section>`;
  }

  function renderIncomeAgeSection() {
    return `
      <section class="card" id="sec-dsr-6">
        ${sectionHeader('06', 'Your Income & Age', 'This is what your commitments are measured against — and what determines your healthy DSR range and maximum loan tenure below.')}

        <div class="field-label"><span>${state.jointApplicant ? 'Main Applicant' : 'Your Details'}</span></div>
        <div class="section-grid">
          ${moneyField('Nett Income (After deducted EPF, SOCSO and etc.)', 'nettIncome', state.nettIncome, { max: 100000 })}
          ${ageField('age', state.age)}
        </div>

        ${state.jointApplicant ? `
          <div class="divider"></div>
          <div class="field-label"><span>Joint Applicant</span></div>
          <div class="section-grid">
            ${moneyField('Nett Income (After deducted EPF, SOCSO and etc.)', 'nettIncomeJoint', state.nettIncomeJoint, { max: 100000 })}
            ${ageField('ageJoint', state.ageJoint)}
          </div>
          <div class="chain-result" style="margin-top:4px;">
            <div class="chain-item highlight"><div class="l">Combined Nett Income</div><div class="v green big">${rm(D.combinedIncome)}</div></div>
          </div>
        ` : ''}
      </section>`;
  }

  function renderSummarySection() {
    const elig = D.eligibility;
    return `
      <section class="card summary-card" id="sec-dsr-summary">
        ${sectionHeader('07', 'Estimated Home Loan Eligibility', 'Your Total Monthly Commitments vs Your Monthly Nett Income')}

        <div class="result-block">
          ${resultRow(`House Loan${countSuffix(state.houseLoans.length)}`, rm(D.houseCommitment))}
          ${resultRow(`Car Loan${countSuffix(state.carLoans.length)}`, rm(D.carCommitment))}
          ${resultRow(`PTPTN${countSuffix(state.ptptnList.length)}`, rm(D.ptptnCommitment))}
          ${resultRow(`Personal Loan${countSuffix(state.personalLoans.length)}`, rm(D.personalCommitment))}
          ${resultRow(`Credit Card${countSuffix(state.creditCards.length)}`, rm(D.ccCommitment))}
          <div class="result-row total">
            <span class="k">Your Total Monthly Commitments</span>
            <span class="v">${rm(D.total)}</span>
          </div>
          ${D.combinedIncome > 0 ? resultRow(state.jointApplicant ? 'Your Combined Nett Income' : 'Your Nett Income', `<span style="color:var(--value-green);">${rm(D.combinedIncome)}</span>`) : ''}
        </div>

        ${elig ? `
          <div class="divider"></div>
          <h3 class="mini-head">Healthy DSR Range &amp; Maximum Property Loan (Estimated)</h3>
          <div class="dsr-callout">
            Based on a${state.jointApplicant ? ' combined' : ''} nett income of ${rm(D.combinedIncome)}, a healthy indicative DSR range for you is usually
            <b>${elig.range.min === elig.range.max ? elig.range.min + '%' : elig.range.min + '%–' + elig.range.max + '%'}</b>.
            ${state.jointApplicant
              ? `Based on the younger applicant's age of ${elig.ageBasis}, assuming banks generally lend up to age 70,`
              : `At age ${elig.ageBasis}, assuming banks generally lend up to age 70,`}
            your maximum loan tenure works out to <b>${elig.tenureYears} years</b> (capped at 35 years).
          </div>
          <div class="result-block" style="margin-top:12px;">
            ${resultRow('Maximum Monthly Instalment You Can Afford', `${rm(elig.low.availableForNewLoan)} – ${rm(elig.high.availableForNewLoan)}`)}
            ${resultRow('Loan Tenure Used', elig.tenureYears + ' years')}
            ${resultRow('Indicative Interest Rate Used', elig.rate.toFixed(2) + '% p.a.')}
          </div>
          <div class="chain-result" style="margin-top:4px;">
            <div class="chain-item highlight"><div class="l">Estimated Maximum Property Loan You May Qualify For</div><div class="v orange big">${rm(elig.low.maxLoan)} – ${rm(elig.high.maxLoan)}</div></div>
          </div>
        ` : `
          <div class="dsr-callout" style="margin-top:14px;">Fill in your Nett Income and Age above (Section 06) to see your healthy DSR range and estimated maximum property loan.</div>
        `}
      </section>`;
  }

  // -------------------------------------------------------------------
  // SECTION 08 — Supporting Documents (optional)
  // -------------------------------------------------------------------
  function renderSupportingDocsSection() {
    return `
      <section class="card" id="sec-dsr-8">
        ${sectionHeader('08', 'Strengthen Your Loan Approval & Interest Rate',
          'Showing the bank extra financial standing beyond your salary can help your approval odds and may support a better interest rate offer.')}

        ${calloutBox(
          'Fixed deposits, investments and other liquid assets reassure the bank of your financial strength on top of income alone. ' +
          'Tick anything you hold — the amount is completely optional, a tick alone already gives Tony useful context to work with.'
        )}

        <div class="field-label" style="margin-top:12px;"><span>Supporting Documents</span></div>
        <div style="margin-top:8px;">
          ${SUPPORTING_DOC_ITEMS.map(it => renderSupportingDocRow(it.key, it.label)).join('')}
        </div>
      </section>`;
  }

  function renderSupportingDocRow(key, label) {
    const doc = state.supportingDocs[key];
    return `
      <div class="dsr-entry">
        <label style="display:flex; align-items:center; gap:12px; cursor:pointer;">
          <input type="checkbox" data-doc-toggle="${key}" ${doc.checked ? 'checked' : ''} style="width:20px; height:20px; accent-color:var(--accent); flex:none; cursor:pointer;">
          <span style="font-size:16.5px; font-weight:700; flex:1;">${label}</span>
        </label>
        ${doc.checked ? `
          <div class="section-grid" style="margin-top:12px;">
            ${moneyFieldDoc('Amount (Optional)', key, doc.amount)}
          </div>
        ` : ''}
      </div>`;
  }

  // -------------------------------------------------------------------
  // Final CTA — WhatsApp handoff + carry-over link (back into the main
  // calculator) + disclaimer.
  // -------------------------------------------------------------------
  function renderCtaSection() {
    return `
      <section class="card" id="sec-dsr-cta">
        <a href="${buildWhatsAppLink()}" target="_blank" rel="noopener" class="exitplan-btn active" style="display:block; text-align:center; text-decoration:none;">Send My Details to Tony (For Projects Comparison)</a>
        <a href="index.html?${buildCarryOverParams().toString()}" style="display:block; text-align:center; margin-top:10px; font-size:15.5px; color:var(--ink-soft);">or bring these figures back into the Calculator &rarr;</a>

        <div class="disclaimer" style="margin-top:16px;"><b>Estimated only.</b></div>
      </section>`;
  }

  // -------------------------------------------------------------------
  // Carry-over link (back into the main calculator) + WhatsApp handoff
  // -------------------------------------------------------------------
  function buildCarryOverParams() {
    return new URLSearchParams({
      house: D.houseCommitment, car: D.carCommitment, ptptn: D.ptptnCommitment,
      personal: D.personalCommitment, cc: D.ccCommitment,
    });
  }

  // Builds the plain-text WhatsApp message — every income/age figure and
  // every commitment spelled out (with the same "(x2)"-style counts as the
  // summary box), then the estimated eligibility, so Tony receives a
  // ready-to-act-on lead rather than just a set of numbers.
  function buildWhatsAppMessage() {
    const elig = D.eligibility;
    const lines = [];
    lines.push("Hi Tony, here's my DSR & Home Loan Eligibility summary from your calculator:");
    lines.push('');
    lines.push('*My Income & Age*');
    if (state.jointApplicant) {
      lines.push(`Main Applicant = ${rm(state.nettIncome)} (age ${state.age})`);
      lines.push(`Joint Applicant = ${rm(state.nettIncomeJoint)} (age ${state.ageJoint})`);
      lines.push(`Combined Nett Income = ${rm(D.combinedIncome)}`);
    } else {
      lines.push(`Nett Income = ${rm(state.nettIncome)} (age ${state.age})`);
    }
    lines.push('');
    lines.push('*My Monthly Commitments*');
    lines.push(`House Loan${countSuffix(state.houseLoans.length)} = ${rm(D.houseCommitment)}`);
    lines.push(`Car Loan${countSuffix(state.carLoans.length)} = ${rm(D.carCommitment)}`);
    lines.push(`PTPTN${countSuffix(state.ptptnList.length)} = ${rm(D.ptptnCommitment)}`);
    lines.push(`Personal Loan${countSuffix(state.personalLoans.length)} = ${rm(D.personalCommitment)}`);
    lines.push(`Credit Card${countSuffix(state.creditCards.length)} = ${rm(D.ccCommitment)}`);
    lines.push(`Total Monthly Commitments = ${rm(D.total)}`);
    lines.push('');
    if (elig) {
      lines.push('*Estimated Eligibility*');
      lines.push(`Healthy DSR Range = ${elig.range.min === elig.range.max ? elig.range.min + '%' : elig.range.min + '%–' + elig.range.max + '%'}`);
      lines.push(`Max Loan Tenure = ${elig.tenureYears} years`);
      lines.push(`Estimated Maximum Property Loan = ${rm(elig.low.maxLoan)} – ${rm(elig.high.maxLoan)}`);
      lines.push('');
      lines.push(`Based on my income and commitments, I understand I may be entitled to a property of around ${rmK(elig.high.maxLoan)}. Can you help me find the right project?`);
    } else {
      lines.push("I haven't filled in my income yet — can you help me work out my eligibility?");
    }
    const checkedDocs = SUPPORTING_DOC_ITEMS.filter(it => state.supportingDocs[it.key].checked);
    if (checkedDocs.length) {
      lines.push('');
      lines.push('*Supporting Documents*');
      checkedDocs.forEach(it => {
        const amount = state.supportingDocs[it.key].amount;
        lines.push(`${it.label}${amount > 0 ? ' = ' + rm(amount) : ''}`);
      });
    }
    return lines.join('\n');
  }

  function buildWhatsAppLink() {
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppMessage())}`;
  }

  // -------------------------------------------------------------------
  // Page render
  // -------------------------------------------------------------------
  function render() {
    const appEl = document.getElementById('app');
    appEl.innerHTML = `
      <div class="hero-frame">
        <div class="topbar">
          <div class="logo-badge">${CALC_ICON}</div>
          <div>
            <div class="brand-name">${CFG.branding.agentTitle}</div>
            <div class="brand-tag">${CFG.branding.agentTagline}</div>
          </div>
          <a href="index.html" class="comparison-btn" style="margin-left:auto; text-decoration:none; text-align:center;">&larr; Back to Calculator</a>
        </div>
        <div class="hero-title-box">
          <h1>DSR Calculation</h1>
          <p>A closer look at exactly what counts toward your monthly commitments — so your DSR estimate reflects reality, not just a guess.</p>
        </div>
      </div>

      <div class="calc-columns">
        <div class="calc-instance">
          ${renderJointApplicantToggle()}
          ${renderHouseLoanSection()}
          ${renderCarLoanSection()}
          ${renderPtptnSection()}
          ${renderPersonalLoanSection()}
          ${renderCreditCardSection()}
          ${renderIncomeAgeSection()}
          ${renderSummarySection()}
          ${renderSupportingDocsSection()}
          ${renderCtaSection()}
        </div>
      </div>

      <div class="footer-note">
        Prepared by <b>${CFG.branding.agentName}</b> (${CFG.branding.handle}) &middot; IQI Realty<br>
        For illustration purposes. Please verify all figures with Tony and the recommended bankers before making a decision.
      </div>
    `;
    bindEvents(appEl);
  }

  function bindEvents(rootEl) {
    // Joint Applicant toggle
    rootEl.querySelectorAll('[data-joint-toggle]').forEach(el => {
      el.addEventListener('change', () => set('jointApplicant', el.checked));
    });

    // Main / Joint Applicant tab switchers (inside each commitment section)
    rootEl.querySelectorAll('[data-tab-switch]').forEach(el => {
      el.addEventListener('click', () => {
        const [cat, applicant] = el.getAttribute('data-tab-switch').split(':');
        setActiveTab(cat, applicant);
      });
    });

    // Section 08 — Supporting Documents (tick + optional amount)
    rootEl.querySelectorAll('[data-doc-toggle]').forEach(el => {
      el.addEventListener('change', () => setDocChecked(el.getAttribute('data-doc-toggle'), el.checked));
    });
    rootEl.querySelectorAll('[data-doc-field]').forEach(el => {
      const commit = () => {
        const key = el.getAttribute('data-doc-field');
        const min = parseFloat(el.getAttribute('data-min'));
        const max = parseFloat(el.getAttribute('data-max'));
        let val = parseFloat(cleanNum(el.value));
        if (isNaN(val)) val = min;
        val = Math.min(max, Math.max(min, val));
        setDocAmount(key, val);
      };
      el.addEventListener('change', commit);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    });

    // Top-level fields (Nett Income, Age, and the joint-applicant equivalents)
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

    // Per-entry money fields (e.g. house:0:instalment)
    rootEl.querySelectorAll('[data-entry-field]').forEach(el => {
      const commit = () => {
        const [cat, idx, field] = el.getAttribute('data-entry-field').split(':');
        const min = parseFloat(el.getAttribute('data-min'));
        const max = parseFloat(el.getAttribute('data-max'));
        let val = parseFloat(cleanNum(el.value));
        if (isNaN(val)) val = min;
        val = Math.min(max, Math.max(min, val));
        setEntryField(cat, parseInt(idx, 10), field, val);
      };
      el.addEventListener('change', commit);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    });

    // Per-entry pill selectors (e.g. house:0:status, cc:0:mode)
    rootEl.querySelectorAll('[data-entry-pill]').forEach(el => {
      el.addEventListener('click', () => {
        const [cat, idx, field] = el.getAttribute('data-entry-pill').split(':');
        const value = el.getAttribute('data-entry-pill-value');
        setEntryField(cat, parseInt(idx, 10), field, value);
      });
    });

    // Add / remove entry buttons
    rootEl.querySelectorAll('[data-entry-add]').forEach(el => {
      el.addEventListener('click', () => addEntry(el.getAttribute('data-entry-add')));
    });
    rootEl.querySelectorAll('[data-entry-remove]').forEach(el => {
      el.addEventListener('click', () => {
        const [cat, idx] = el.getAttribute('data-entry-remove').split(':');
        removeEntry(cat, parseInt(idx, 10));
      });
    });
  }

  // -------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------
  recalcAndRender();
})();
