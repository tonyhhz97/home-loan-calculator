const CFG_DEBUG = false;

function fmtRM(n){
  if (n === null || n === undefined || isNaN(n)) return 'RM 0';
  const rounded = Math.round(n);
  return 'RM ' + rounded.toLocaleString('en-MY');
}
function fmtPct(n, dp=2){
  if (n === null || n === undefined || isNaN(n)) return '0%';
  return n.toFixed(dp) + '%';
}
function clamp(v, min, max){ return Math.min(Math.max(v, min), max); }
function uid(){ return 'id' + Math.random().toString(36).slice(2, 10); }

const pageState = { comparison: false };

function createInstance(id, label){
  const state = {
    id, label,
    projectName: '',
    price: 600000,
    layoutSize: '',
    loanPct: 90,
    tenure: 35,
    interestRate: 4.0,
    grossIncome: 8000,
    commitments: 1500,
    dsrLimit: 70,
    rebatePct: 0,
    subsidies: [],
    legalFeeWaived: false,
    mrtaCost: 0,
    monthlyRentalEstimate: 0,
    exitPlan: false,
  };

  let D = {};

  function recalc(){
    const loanAmount = state.price * (state.loanPct/100);
    const downPaymentBase = state.price - loanAmount;
    const rebateAmount = state.price * (state.rebatePct/100);
    const subsidyTotal = state.subsidies.reduce((sum, s) => sum + (s.amount||0), 0);

    const legalFeeEstimate = state.legalFeeWaived ? 0 : Math.round(state.price * 0.01 + 1500);
    const loanLegalFeeEstimate = Math.round(loanAmount * 0.01 + 1000);
    const stampDutyEstimate = Math.round(state.price * 0.03);
    const valuationFeeEstimate = Math.round(loanAmount * 0.0025);
    const bookingFee = 3000;

    const upfrontCashRaw = downPaymentBase + legalFeeEstimate + loanLegalFeeEstimate + stampDutyEstimate + valuationFeeEstimate + bookingFee - rebateAmount - subsidyTotal;
    const upfrontCash = Math.max(0, upfrontCashRaw);

    const monthlyRate = (state.interestRate/100)/12;
    const n = state.tenure * 12;
    let monthlyInstalment = 0;
    if (monthlyRate > 0){
      monthlyInstalment = loanAmount * (monthlyRate * Math.pow(1+monthlyRate, n)) / (Math.pow(1+monthlyRate, n) - 1);
    } else {
      monthlyInstalment = loanAmount / n;
    }

    const maxDsrAmount = state.grossIncome * (state.dsrLimit/100);
    const availableForLoan = maxDsrAmount - state.commitments;
    const dsrUsed = state.grossIncome > 0 ? ((state.commitments + monthlyInstalment) / state.grossIncome) * 100 : 0;
    const dsrPass = dsrUsed <= state.dsrLimit;

    const totalFinancing = loanAmount;
    const netCashRequired = upfrontCash;

    D = {
      loanAmount, downPaymentBase, rebateAmount, subsidyTotal,
      legalFeeEstimate, loanLegalFeeEstimate, stampDutyEstimate, valuationFeeEstimate, bookingFee,
      upfrontCash, monthlyInstalment, maxDsrAmount, availableForLoan, dsrUsed, dsrPass,
      totalFinancing, netCashRequired,
    };
  }

  function addSubsidy(){
    state.subsidies.push({ id: uid(), label: '', amount: 0 });
  }
  function removeSubsidy(sid){
    state.subsidies = state.subsidies.filter(s => s.id !== sid);
  }

  function renderBody(){
    recalc();
    const subsidyRowsHtml = state.subsidies.map(s => `
      <div class="subsidy-row" data-sid="${s.id}">
        <input type="text" class="subsidy-label-input" data-field="subsidy-label" data-sid="${s.id}" value="${s.label}" placeholder="e.g. Developer rebate">
        <div class="input-affix">
          <span class="affix-pre">RM</span>
          <input type="number" class="affix-input" data-field="subsidy-amount" data-sid="${s.id}" value="${s.amount}">
        </div>
        <button class="subsidy-remove-btn" data-action="remove-subsidy" data-sid="${s.id}">&times;</button>
      </div>
    `).join('');

    return `
      <div class="card">
        <div class="section-header">
          <div class="section-no">01</div>
          <div>
            <h2>Property & Loan Details</h2>
            <div class="sub">Enter the property price and financing assumptions.</div>
          </div>
        </div>
        <div class="field">
          <div class="field-label">Project Name</div>
          <input type="text" data-field="projectName" data-id="${id}" value="${state.projectName}" placeholder="e.g. Kingswoodz">
        </div>
        <div class="section-grid">
          <div class="field">
            <div class="field-label">Property Price <span class="field-value editable-num">${fmtRM(state.price)}</span></div>
            <input type="range" min="200000" max="3000000" step="5000" data-field="price" data-id="${id}" value="${state.price}">
          </div>
          <div class="field">
            <div class="field-label">Loan Amount % <span class="field-value editable-num">${state.loanPct}%</span></div>
            <input type="range" min="50" max="95" step="1" data-field="loanPct" data-id="${id}" value="${state.loanPct}">
          </div>
        </div>
        <div class="layout-size-row">
          <input type="text" class="layout-input" data-field="layoutSize" data-id="${id}" value="${state.layoutSize}" placeholder="Layout & Size (e.g. Type A, 950 sf)">
        </div>
        <div class="section-grid">
          <div class="field">
            <div class="field-label">Loan Tenure <span class="field-value editable-num">${state.tenure} yrs</span></div>
            <input type="range" min="5" max="35" step="1" data-field="tenure" data-id="${id}" value="${state.tenure}">
          </div>
          <div class="field">
            <div class="field-label">Interest Rate <span class="field-value editable-num">${fmtPct(state.interestRate)}</span></div>
            <input type="range" min="2.5" max="6" step="0.05" data-field="interestRate" data-id="${id}" value="${state.interestRate}">
          </div>
        </div>
        <div class="mini-head">Extra Subsidy</div>
        <div class="subsidy-list">${subsidyRowsHtml}</div>
        <button class="subsidy-add-btn" data-action="add-subsidy">+ Add Subsidy</button>
        <div class="section-grid single-col" style="margin-top:16px;">
          <div class="field">
            <div class="field-label">Developer's Rebate % <span class="field-value editable-num">${state.rebatePct}%</span></div>
            <input type="range" min="0" max="15" step="0.5" data-field="rebatePct" data-id="${id}" value="${state.rebatePct}">
          </div>
        </div>
        <div class="toggle-row">
          <div><div class="t-label">Legal Fee Waived</div><div class="t-sub">Developer covers SPA legal fee</div></div>
          <label class="switch"><input type="checkbox" data-field="legalFeeWaived" data-id="${id}" ${state.legalFeeWaived ? 'checked' : ''}><span class="track"></span></label>
        </div>
      </div>

      <div class="card">
        <div class="section-header">
          <div class="section-no">02</div>
          <div>
            <h2>Your Financial Profile</h2>
            <div class="sub">Used to estimate loan entitlement (DSR).</div>
          </div>
        </div>
        <div class="section-grid">
          <div class="field">
            <div class="field-label">Gross Monthly Income <span class="field-value editable-num">${fmtRM(state.grossIncome)}</span></div>
            <input type="range" min="2000" max="50000" step="500" data-field="grossIncome" data-id="${id}" value="${state.grossIncome}">
          </div>
          <div class="field">
            <div class="field-label">Existing Commitments <span class="field-value editable-num">${fmtRM(state.commitments)}</span></div>
            <input type="range" min="0" max="20000" step="100" data-field="commitments" data-id="${id}" value="${state.commitments}">
          </div>
        </div>
        <div class="field">
          <div class="field-label">DSR Limit <span class="field-value editable-num">${state.dsrLimit}%</span></div>
          <input type="range" min="40" max="90" step="1" data-field="dsrLimit" data-id="${id}" value="${state.dsrLimit}">
        </div>
        <div class="chain-result">
          <div class="chain-item"><span class="l">Max DSR-based repayment</span><span class="v gold">${fmtRM(D.maxDsrAmount)}</span></div>
          <div class="chain-item"><span class="l">Less existing commitments</span><span class="v">-${fmtRM(state.commitments)}</span></div>
          <div class="chain-item highlight"><span class="l">Available for new loan</span><span class="v green big">${fmtRM(D.availableForLoan)}</span></div>
        </div>
      </div>

      <div class="card summary-card">
        <div class="section-header">
          <div class="section-no">03</div>
          <div>
            <h2>Financial Summary</h2>
            <div class="sub">Key figures at a glance.</div>
          </div>
        </div>
        <div class="summary-top">
          <div>
            <div class="summary-eyebrow">Project</div>
            <div class="summary-project">${state.projectName || 'Untitled Project'}</div>
          </div>
          <div class="summary-actions">
            <span class="status-pill ${D.dsrPass ? 'status-good' : 'status-bad'}">${D.dsrPass ? 'DSR OK' : 'DSR Exceeded'}</span>
          </div>
        </div>
        <div class="summary-grid">
          <div class="summary-item"><div class="label">Size & Layout</div><div class="value">${state.layoutSize || '—'}</div></div>
          <div class="summary-item"><div class="label">Loan Amount</div><div class="value">${fmtRM(D.loanAmount)}</div></div>
          <div class="summary-item"><div class="label">Monthly Instalment</div><div class="value green">${fmtRM(D.monthlyInstalment)}</div></div>
          <div class="summary-item"><div class="label">Upfront Cash</div><div class="value orange">${fmtRM(D.upfrontCash)}</div></div>
        </div>
        <div class="disclaimer"><b>Note:</b> These are estimated figures based on the assumptions above. Actual bank approval and final financing terms may differ. Please verify with your banker before making a decision.</div>
      </div>
    `;
  }

  function bindEvents(){}

  return { id, label, state, get D(){ return D; }, recalc, renderBody, bindEvents, addSubsidy, removeSubsidy };
}

const instances = [createInstance('a', 'A')];

function renderInstanceColumn(inst){
  return `<div class="calc-instance">${pageState.comparison ? `<div class="instance-label">${inst.label}</div>` : ''}${inst.renderBody()}</div>`;
}

function bindTopEvents(){
  document.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('input', (e) => {
      const field = e.target.dataset.field;
      const instId = e.target.dataset.id;
      const inst = instances.find(i => i.id === instId);
      if (!inst) return;
      if (field === 'legalFeeWaived'){
        inst.state[field] = e.target.checked;
      } else if (field === 'projectName' || field === 'layoutSize'){
        inst.state[field] = e.target.value;
      } else if (field === 'subsidy-label'){
        const s = inst.state.subsidies.find(x => x.id === e.target.dataset.sid);
        if (s) s.label = e.target.value;
      } else if (field === 'subsidy-amount'){
        const s = inst.state.subsidies.find(x => x.id === e.target.dataset.sid);
        if (s) s.amount = parseFloat(e.target.value) || 0;
      } else {
        inst.state[field] = parseFloat(e.target.value);
      }
      render();
    });
  });
  document.querySelectorAll('[data-action="add-subsidy"]').forEach(el => {
    el.addEventListener('click', () => { instances[0].addSubsidy(); render(); });
  });
  document.querySelectorAll('[data-action="remove-subsidy"]').forEach(el => {
    el.addEventListener('click', (e) => { instances[0].removeSubsidy(e.target.dataset.sid); render(); });
  });
}

function render(){
  const app = document.getElementById('app');
  app.classList.toggle('is-comparison', pageState.comparison);
  app.innerHTML = `
      <div class="page-bg" aria-hidden="true">
        <div class="page-bg-image"></div>
        <div class="page-bg-overlay"></div>
      </div>

      <div class="hero-frame">
        <div class="topbar">
          <div class="logo-badge">${CFG.branding.initials || 'T'}</div>
          <div>
            <div class="brand-name">${CFG.branding.agentName}</div>
            <div class="brand-tag">${CFG.branding.handle}</div>
          </div>
          <button class="comparison-btn ${pageState.comparison ? 'active' : ''}" data-action="toggle-comparison">${pageState.comparison ? 'Single View' : 'Compare Projects'}</button>
        </div>
        <div class="hero-title-box">
          <h1>Integrated Home Loan Calculator</h1>
          <p>Understand your loan entitlement, upfront cash, and monthly commitment — all in one place.</p>
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
    visible.forEach(i => i.bindEvents());

  document.querySelectorAll('[data-action="toggle-comparison"]').forEach(el => {
    el.addEventListener('click', () => {
      pageState.comparison = !pageState.comparison;
      if (pageState.comparison && instances.length < 2){
        instances.push(createInstance('b', 'B'));
      }
      render();
    });
  });
}

render();
