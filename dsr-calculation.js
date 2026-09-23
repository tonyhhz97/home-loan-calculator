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
  // State — five commitment categories, plus how the house loan is held
  // (this is the one category where ownership structure changes what
  // actually counts).
  // -------------------------------------------------------------------
  const state = {
    houseLoanStatus: 'none',      // 'none' | 'own' | 'joint'
    houseLoanInstalment: 0,
    carLoanInstalment: 0,
    ptptnPayment: 0,
    personalLoanPayment: 0,
    ccOutstanding: 0,
  };
  let D = {};

  function recalc() {
    const houseCommitment =
      state.houseLoanStatus === 'own' ? round2(state.houseLoanInstalment) :
      state.houseLoanStatus === 'joint' ? round2(state.houseLoanInstalment / 2) : 0;
    const carCommitment = round2(state.carLoanInstalment);
    const ptptnCommitment = round2(state.ptptnPayment);
    const personalCommitment = round2(state.personalLoanPayment);
    const ccCommitment = round2(state.ccOutstanding * 0.05);
    const total = round2(houseCommitment + carCommitment + ptptnCommitment + personalCommitment + ccCommitment);
    D = { houseCommitment, carCommitment, ptptnCommitment, personalCommitment, ccCommitment, total };
  }

  function set(key, val) { state[key] = val; recalcAndRender(); }
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

  // A three-way pill selector (used for the House Loan ownership status) —
  // built from the same visual language as the rest of the page (accent
  // color, pill radius) rather than native radio inputs, so it reads as a
  // clear, tappable choice rather than a form control.
  function pillGroup(name, options, current) {
    return `<div class="dsr-pill-group" data-pill-group="${name}">
      ${options.map(opt => `
        <button type="button" class="dsr-pill ${opt.value === current ? 'active' : ''}" data-pill="${name}" data-pill-value="${opt.value}">${opt.label}</button>
      `).join('')}
    </div>`;
  }

  function moneyField(label, key, value, { placeholder = '0' } = {}) {
    return `
      <div class="field">
        <div class="field-label"><span>${label}</span></div>
        <div class="input-affix">
          <span class="affix-pre">RM</span>
          <input type="text" inputmode="decimal" class="affix-input" data-bind-manual="${key}" data-min="0" data-max="100000" placeholder="${placeholder}" value="${groupNum(value)}">
        </div>
      </div>`;
  }

  function moneyFieldReadonly(label, displayValue) {
    return `
      <div class="field">
        <div class="field-label"><span>${label}</span></div>
        <div class="input-affix" style="background:var(--bg); opacity:.9;">
          <span class="affix-pre">RM</span>
          <input type="text" class="affix-input" value="${displayValue}" readonly tabindex="-1" style="cursor:default;">
        </div>
      </div>`;
  }

  function calloutBox(text) {
    return `<div class="dsr-callout">${text}</div>`;
  }

  // -------------------------------------------------------------------
  // Sections
  // -------------------------------------------------------------------
  function renderHouseLoanSection() {
    const showInput = state.houseLoanStatus !== 'none';
    return `
      <section class="card" id="sec-dsr-1">
        ${sectionHeader('01', 'Existing House Loan',
          'Whether this counts — and how much of it counts — depends on how the loan is held, not just whether you own a property.')}

        ${calloutBox(
          'If the property is fully paid off (SPA settled, no active bank loan), it does not appear as a commitment at all. ' +
          'If there is an active loan and it is under your own name, the full monthly instalment counts. ' +
          'If the loan is under joint names, only half of the monthly instalment is counted as your share — banks typically split a joint commitment evenly between borrowers.'
        )}

        <div class="field" style="margin-top:14px;">
          <div class="field-label"><span>Loan Status</span></div>
          ${pillGroup('houseLoanStatus', [
            { value: 'none', label: 'No Existing Loan' },
            { value: 'own', label: 'Under My Name' },
            { value: 'joint', label: 'Joint Name' },
          ], state.houseLoanStatus)}
        </div>

        ${showInput ? `
          <div class="section-grid" style="margin-top:14px;">
            ${moneyField('Monthly Instalment', 'houseLoanInstalment', state.houseLoanInstalment)}
          </div>
          <div class="chain-result" style="margin-top:4px;">
            <div class="chain-item highlight"><div class="l">Your Commitment${state.houseLoanStatus === 'joint' ? ' (50% share)' : ''}</div><div class="v orange big">${rm(D.houseCommitment)}</div></div>
          </div>
        ` : ''}
      </section>`;
  }

  function renderCarLoanSection() {
    return `
      <section class="card" id="sec-dsr-2">
        ${sectionHeader('02', 'Existing Car Loan', 'Monthly instalment for any car loan currently registered under your name.')}

        ${calloutBox(
          'Even if someone else — a parent, spouse or other family member — is the one actually paying the monthly instalment, the bank still counts it as your own commitment for as long as the loan is registered under your name.'
        )}

        <div class="section-grid" style="margin-top:14px;">
          ${moneyField('Monthly Instalment', 'carLoanInstalment', state.carLoanInstalment)}
        </div>
      </section>`;
  }

  function renderPtptnSection() {
    return `
      <section class="card" id="sec-dsr-3">
        ${sectionHeader('03', 'PTPTN', 'Your current monthly PTPTN repayment, if any.')}
        <div class="section-grid">
          ${moneyField('Monthly Payment', 'ptptnPayment', state.ptptnPayment)}
        </div>
      </section>`;
  }

  function renderPersonalLoanSection() {
    return `
      <section class="card" id="sec-dsr-4">
        ${sectionHeader('04', 'Personal Loan', 'Monthly repayment for any personal loan (bank or otherwise), if any.')}
        <div class="section-grid">
          ${moneyField('Monthly Payment', 'personalLoanPayment', state.personalLoanPayment)}
        </div>
      </section>`;
  }

  function renderCreditCardSection() {
    return `
      <section class="card" id="sec-dsr-5">
        ${sectionHeader('05', 'Credit Card Outstanding Balance', 'Banks typically count only a portion of your outstanding balance as a monthly commitment — not the balance itself.')}

        ${calloutBox('A common industry rule of thumb is 5% of the outstanding balance, counted as the monthly commitment. Enter your outstanding balance and this is worked out for you automatically.')}

        <div class="section-grid" style="margin-top:14px;">
          ${moneyField('Outstanding Balance', 'ccOutstanding', state.ccOutstanding)}
          ${moneyFieldReadonly('Monthly Commitment (5%)', groupNum(D.ccCommitment))}
        </div>
      </section>`;
  }

  function renderSummarySection() {
    const params = new URLSearchParams({
      house: D.houseCommitment, car: D.carCommitment, ptptn: D.ptptnCommitment,
      personal: D.personalCommitment, cc: D.ccCommitment,
    });
    return `
      <section class="card summary-card" id="sec-dsr-summary">
        ${sectionHeader('06', 'Your Total Monthly Commitments', 'This is the figure that feeds into your DSR — carried over item by item, exactly as worked out above.')}

        <div class="result-block">
          <div class="result-row"><span class="k">House Loan</span><span class="v">${rm(D.houseCommitment)}</span></div>
          <div class="result-row"><span class="k">Car Loan</span><span class="v">${rm(D.carCommitment)}</span></div>
          <div class="result-row"><span class="k">PTPTN</span><span class="v">${rm(D.ptptnCommitment)}</span></div>
          <div class="result-row"><span class="k">Personal Loan</span><span class="v">${rm(D.personalCommitment)}</span></div>
          <div class="result-row"><span class="k">Credit Card (5%)</span><span class="v">${rm(D.ccCommitment)}</span></div>
          <div class="result-row total"><span class="k">Total Monthly Commitments</span><span class="v">${rm(D.total)}</span></div>
        </div>

        <a href="index.html?${params.toString()}" class="exitplan-btn active" style="display:block; text-align:center; text-decoration:none; margin-top:16px;">Use These Figures in the Calculator →</a>

        <div class="disclaimer" style="margin-top:16px;">Estimate only, for planning purposes. Actual DSR calculation, and which commitments are included, are determined solely by the bank based on your CTOS/CCRIS credit report and internal policies — this may differ from the figures above. Please confirm with your banker before relying on this breakdown.</div>
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
    rootEl.querySelectorAll('[data-pill]').forEach(el => {
      el.addEventListener('click', () => {
        const name = el.getAttribute('data-pill');
        const value = el.getAttribute('data-pill-value');
        set(name, value);
      });
    });
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
  }

  // -------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------
  recalcAndRender();
})();
