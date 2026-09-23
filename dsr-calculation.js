/* =========================================================================
   DSR CALCULATION — helper page
   -------------------------------------------------------------------------
   A detailed, standalone breakdown of exactly what counts toward a buyer's
   monthly debt commitments for DSR purposes. Lives at its own URL
   (dsr-calculation.html) alongside the main calculator (index.html) — the
   topbar's "DSR Calculation" button links here, and this page's "Use These
   Figures in the Calculator" button links back with the computed numbers
   pre-filled via URL params (house, car, ptptn, personal, cc — see
   config.js's URL-param docs and app.js's defaultSeed()).

   Each commitment category (house loan, car loan, PTPTN, personal loan,
   credit card) is a LIST — a buyer can add as many entries as they actually
   have (e.g. two house loans, one under their own name and one joint), and
   remove any entry. A category with zero entries simply contributes RM 0 —
   there is no separate "no existing loan" toggle to manage.

   Deliberately independent of app.js: this page has no comparison mode, no
   multi-instance factory — just one flat state object and a re-render.
   ========================================================================= */
(function () {
  const CFG = window.CALC_CONFIG;
  const C = CFG.branding.colors;

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
  const groupNum = (n, decimals = 0) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const cleanNum = (s) => String(s == null ? '' : s).replace(/,/g, '');
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  // -------------------------------------------------------------------
  // State — five commitment categories, each a list of entries, plus the
  // buyer's nett income and age (used for the healthy-DSR-range and
  // maximum-loan estimate at the bottom of the page).
  // -------------------------------------------------------------------
  const CAT_ARRAY = { house: 'houseLoans', car: 'carLoans', ptptn: 'ptptnList', personal: 'personalLoans', cc: 'creditCards' };
  const ENTRY_DEFAULTS = {
    house: () => ({ status: 'own', instalment: 0 }),
    car: () => ({ instalment: 0 }),
    ptptn: () => ({ payment: 0 }),
    personal: () => ({ payment: 0 }),
    cc: () => ({ mode: 'clear', outstanding: 0, installmentAmount: 0 }),
  };

  const state = {
    houseLoans: [],
    carLoans: [],
    ptptnList: [],
    personalLoans: [],
    creditCards: [],
    nettIncome: 0,
    age: 30,
  };
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

  function recalc() {
    const houseCommitment = round2(state.houseLoans.reduce((sum, e) => sum + (e.status === 'joint' ? e.instalment / 2 : e.instalment), 0));
    const carCommitment = round2(state.carLoans.reduce((sum, e) => sum + e.instalment, 0));
    const ptptnCommitment = round2(state.ptptnList.reduce((sum, e) => sum + e.payment, 0));
    const personalCommitment = round2(state.personalLoans.reduce((sum, e) => sum + e.payment, 0));
    const ccCommitment = round2(state.creditCards.reduce((sum, e) => sum + (e.mode === 'installment' ? e.installmentAmount : 0), 0));
    const total = round2(houseCommitment + carCommitment + ptptnCommitment + personalCommitment + ccCommitment);

    // ---- Healthy DSR range + maximum property loan estimate — only once
    // the buyer has filled in a nett income.
    let eligibility = null;
    if (state.nettIncome > 0) {
      const range = dsrRangeForIncome(state.nettIncome);
      const maxAgeAtLoanMaturity = 70; // assumption — see disclaimer
      const tenureYears = Math.max(1, Math.min(35, maxAgeAtLoanMaturity - (state.age || 0)));
      const rate = CFG.project.interestRatePct;
      const atPct = (pct) => CALC.calcMaxLoanEligibility({
        monthlyIncome: state.nettIncome, monthlyCommitments: total, numberOfBorrowers: 1,
        dsrThresholdPct: pct, annualRatePct: rate, tenureYears
      });
      eligibility = { range, tenureYears, rate, low: atPct(range.min), high: atPct(range.max) };
    }

    D = { houseCommitment, carCommitment, ptptnCommitment, personalCommitment, ccCommitment, total, eligibility };
  }

  function set(key, val) { state[key] = val; recalcAndRender(); }
  function setEntryField(cat, index, field, val) {
    const arr = state[CAT_ARRAY[cat]];
    if (arr && arr[index]) arr[index][field] = val;
    recalcAndRender();
  }
  function addEntry(cat) {
    const arr = state[CAT_ARRAY[cat]];
    if (arr) arr.push(ENTRY_DEFAULTS[cat]());
    recalcAndRender();
  }
  function removeEntry(cat, index) {
    const arr = state[CAT_ARRAY[cat]];
    if (arr) arr.splice(index, 1);
    recalcAndRender();
  }
  function recalcAndRender() { recalc(); render(); }

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
  // ownership status, or this card's clear/installment mode) — same visual
  // language as the rest of the page.
  function pillGroupEntry(cat, index, field, options, current) {
    return `<div class="dsr-pill-group">
      ${options.map(opt => `
        <button type="button" class="dsr-pill ${opt.value === current ? 'active' : ''}" data-entry-pill="${cat}:${index}:${field}" data-entry-pill-value="${opt.value}">${opt.label}</button>
      `).join('')}
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

  function calloutBox(text) {
    return `<div class="dsr-callout">${text}</div>`;
  }

  // Renders a category's list of entries (each wrapped in a removable
  // .dsr-entry card) plus the "+ Add" button underneath.
  function renderEntryList(cat, entries, renderEntryFields, { addLabel = '+ Add', emptyNote = '' } = {}) {
    const rows = entries.map((entry, i) => `
      <div class="dsr-entry">
        <button type="button" class="dsr-entry-remove" data-entry-remove="${cat}:${i}" title="Remove">&times;</button>
        ${renderEntryFields(entry, i)}
      </div>`).join('');
    return `
      ${entries.length ? rows : (emptyNote ? `<div class="dsr-empty-note">${emptyNote}</div>` : '')}
      <button type="button" class="subsidy-add-btn" data-entry-add="${cat}" style="margin-top:${entries.length ? '10px' : '4px'};">${addLabel}</button>
    `;
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
          ${renderEntryList('house', state.houseLoans, (entry, i) => `
            <div class="field-label"><span>House Loan ${i + 1} — Ownership</span></div>
            ${pillGroupEntry('house', i, 'status', [
              { value: 'own', label: 'Under My Name' },
              { value: 'joint', label: 'Joint Name' },
            ], entry.status)}
            <div class="section-grid" style="margin-top:12px;">
              ${moneyFieldEntry('Monthly Instalment', 'house', i, 'instalment', entry.instalment)}
            </div>
            <div class="chain-result" style="margin-top:4px;">
              <div class="chain-item highlight"><div class="l">Your Commitment${entry.status === 'joint' ? ' (50% share)' : ''}</div><div class="v orange">${rm(entry.status === 'joint' ? round2(entry.instalment / 2) : entry.instalment)}</div></div>
            </div>
          `, { addLabel: '+ Add House Loan', emptyNote: 'No existing house loan added.' })}
        </div>

        ${state.houseLoans.length ? `
          <div class="chain-result" style="margin-top:14px;">
            <div class="chain-item highlight"><div class="l">Total House Loan Commitment</div><div class="v orange big">${rm(D.houseCommitment)}</div></div>
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
          ${renderEntryList('car', state.carLoans, (entry, i) => `
            <div class="section-grid">
              ${moneyFieldEntry(`Car Loan ${i + 1} — Monthly Instalment`, 'car', i, 'instalment', entry.instalment)}
            </div>
          `, { addLabel: '+ Add Car Loan', emptyNote: 'No existing car loan added.' })}
        </div>

        ${state.carLoans.length ? `
          <div class="chain-result" style="margin-top:14px;">
            <div class="chain-item highlight"><div class="l">Total Car Loan Commitment</div><div class="v orange big">${rm(D.carCommitment)}</div></div>
          </div>` : ''}
      </section>`;
  }

  function renderPtptnSection() {
    return `
      <section class="card" id="sec-dsr-3">
        ${sectionHeader('03', 'PTPTN', 'Your current monthly PTPTN repayment(s), if any.')}
        <div style="margin-top:2px;">
          ${renderEntryList('ptptn', state.ptptnList, (entry, i) => `
            <div class="section-grid">
              ${moneyFieldEntry(`PTPTN ${i + 1} — Monthly Payment`, 'ptptn', i, 'payment', entry.payment)}
            </div>
          `, { addLabel: '+ Add PTPTN', emptyNote: 'No existing PTPTN repayment added.' })}
        </div>
        ${state.ptptnList.length ? `
          <div class="chain-result" style="margin-top:14px;">
            <div class="chain-item highlight"><div class="l">Total PTPTN Commitment</div><div class="v orange big">${rm(D.ptptnCommitment)}</div></div>
          </div>` : ''}
      </section>`;
  }

  function renderPersonalLoanSection() {
    return `
      <section class="card" id="sec-dsr-4">
        ${sectionHeader('04', 'Personal Loan', 'Monthly repayment for every personal loan (bank or otherwise), if any.')}
        <div style="margin-top:2px;">
          ${renderEntryList('personal', state.personalLoans, (entry, i) => `
            <div class="section-grid">
              ${moneyFieldEntry(`Personal Loan ${i + 1} — Monthly Payment`, 'personal', i, 'payment', entry.payment)}
            </div>
          `, { addLabel: '+ Add Personal Loan', emptyNote: 'No existing personal loan added.' })}
        </div>
        ${state.personalLoans.length ? `
          <div class="chain-result" style="margin-top:14px;">
            <div class="chain-item highlight"><div class="l">Total Personal Loan Commitment</div><div class="v orange big">${rm(D.personalCommitment)}</div></div>
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
          ${renderEntryList('cc', state.creditCards, (entry, i) => `
            <div class="field-label"><span>Credit Card ${i + 1}</span></div>
            ${pillGroupEntry('cc', i, 'mode', [
              { value: 'clear', label: 'Clear Outstanding Balance On Time' },
              { value: 'installment', label: 'Having Installment Plans' },
            ], entry.mode)}
            ${entry.mode === 'installment' ? `
              <div class="section-grid" style="margin-top:12px;">
                ${moneyFieldEntry('Outstanding Balance', 'cc', i, 'outstanding', entry.outstanding)}
                ${moneyFieldEntry('Total Installment Amount', 'cc', i, 'installmentAmount', entry.installmentAmount)}
              </div>
            ` : ''}
          `, { addLabel: '+ Add Credit Card', emptyNote: 'No credit card added.' })}
        </div>

        ${state.creditCards.length ? `
          <div class="chain-result" style="margin-top:14px;">
            <div class="chain-item highlight"><div class="l">Total Credit Card Commitment</div><div class="v orange big">${rm(D.ccCommitment)}</div></div>
          </div>` : ''}
      </section>`;
  }

  function renderIncomeAgeSection() {
    return `
      <section class="card" id="sec-dsr-6">
        ${sectionHeader('06', 'Your Income & Age', 'This is what your commitments are measured against — and what determines your healthy DSR range and maximum loan tenure below.')}
        <div class="section-grid">
          ${moneyField('Nett Income (After deducted EPF, SOCSO and etc.)', 'nettIncome', state.nettIncome, { max: 100000 })}
          <div class="field">
            <div class="field-label"><span>Age</span></div>
            <div class="input-affix">
              <input type="text" inputmode="decimal" class="affix-input" data-bind-manual="age" data-min="18" data-max="70" value="${groupNum(state.age)}">
              <span class="affix-suf">years old</span>
            </div>
          </div>
        </div>
      </section>`;
  }

  function renderSummarySection() {
    const params = new URLSearchParams({
      house: D.houseCommitment, car: D.carCommitment, ptptn: D.ptptnCommitment,
      personal: D.personalCommitment, cc: D.ccCommitment,
    });
    const elig = D.eligibility;
    return `
      <section class="card summary-card" id="sec-dsr-summary">
        ${sectionHeader('07', 'Estimated Home Loan Eligibility', 'Your Total Monthly Commitments vs Your Monthly Nett Income')}

        <div class="result-block">
          ${resultRow('House Loan', rm(D.houseCommitment))}
          ${resultRow('Car Loan', rm(D.carCommitment))}
          ${resultRow('PTPTN', rm(D.ptptnCommitment))}
          ${resultRow('Personal Loan', rm(D.personalCommitment))}
          ${resultRow('Credit Card', rm(D.ccCommitment))}
          <div class="result-row total">
            <span class="k">Your Total Monthly Commitments</span>
            <span class="v">${rm(D.total)}</span>
          </div>
          ${state.nettIncome > 0 ? resultRow('Your Nett Income', `<span style="color:var(--value-green);">${rm(state.nettIncome)}</span>`) : ''}
        </div>

        ${elig ? `
          <div class="divider"></div>
          <h3 class="mini-head">Healthy DSR Range &amp; Maximum Property Loan</h3>
          <div class="dsr-callout">
            Based on a nett income of ${rm(state.nettIncome)}, a healthy indicative DSR range for you is
            <b>${elig.range.min === elig.range.max ? elig.range.min + '%' : elig.range.min + '%–' + elig.range.max + '%'}</b>.
            At age ${state.age}, assuming banks generally lend up to age 70, your maximum loan tenure works out to
            <b>${elig.tenureYears} years</b> (capped at 35 years).
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

        <a href="index.html?${params.toString()}" class="exitplan-btn active" style="display:block; text-align:center; text-decoration:none; margin-top:16px;">Use These Figures in the Calculator &rarr;</a>

        <div class="disclaimer" style="margin-top:16px;">Estimate only, for planning purposes. The healthy DSR ranges, maximum loan tenure (assumes banks lend up to age 70) and maximum loan shown above are general guidelines based on nett income and age, not a bank policy. Actual DSR calculation method, limit, tenure and loan eligibility — and which commitments are included — are determined solely by the bank based on your CTOS/CCRIS credit report, product type and internal policies. Please confirm with your banker before relying on this breakdown.</div>
      </section>`;
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
          ${renderHouseLoanSection()}
          ${renderCarLoanSection()}
          ${renderPtptnSection()}
          ${renderPersonalLoanSection()}
          ${renderCreditCardSection()}
          ${renderIncomeAgeSection()}
          ${renderSummarySection()}
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
    // Top-level fields (Nett Income, Age)
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
