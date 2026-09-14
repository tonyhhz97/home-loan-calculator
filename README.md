# Property Financial Calculator

A client-facing, interactive property loan / affordability / rental ROI calculator you can host on Netlify and share as a link with buyers.

No build step, no backend, no dependencies. Everything runs client-side in the browser.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell — loads the 3 scripts below in order. |
| `config.js` | **Edit this for branding + project defaults.** Agent name, colors, disclaimer text, and the property-specific numbers (price, rental, maintenance, rebates...). |
| `calculations.js` | Pure calculation engine — loan math, Malaysian stamp duty tiers, legal fee scale, rental ROI. No UI code. |
| `app.js` | UI logic — state, rendering, tabs, events. |
| `styles.css` | All visual styling. Colors are pulled from `config.js` at runtime. |
| `netlify.toml` | Tells Netlify this is a static site (no build command needed). |

## Deploying to Netlify

**Fastest way (drag-and-drop):**
1. Go to https://app.netlify.com/drop
2. Drag this whole folder into the browser window.
3. Netlify gives you a live URL in seconds (e.g. `random-name-123.netlify.app`).
4. Rename the site under Site settings → Change site name, to get a nicer link, e.g. `tonyhoo-calculator.netlify.app`.

**Recommended way (Git-connected, so updates redeploy automatically):**
1. Push this folder to a GitHub repo.
2. In Netlify: Add new site → Import an existing project → pick the repo.
3. Build command: leave blank. Publish directory: `.` (already set in `netlify.toml`).
4. Deploy.

## Creating a project-specific version

You don't need a separate codebase per project. Two options:

**Option A — URL parameters (fastest, one shared deployment):**
Append parameters to the link you send a buyer:

```
https://yoursite.netlify.app/?name=Queenswoodz&price=650000&size=850&rental=2200&maint=0.35&discountPct=3&rate=3.85&ltv=90&mode=invest
```

Supported params: `name`, `price`, `size`, `rental`, `maint` (RM/sqft/month), `discountPct`, `rebateAmount`, `rate`, `ltv`, `tenure`, `mode` (`own` or `invest`), `income`, `commitments`, `borrowers`.

**Option B — Edit `config.js` and redeploy:**
Change the `project` object defaults directly, then redeploy (or push to Git if connected). Better when you want the *default* link (no params) to already reflect one specific project.

## What to customize

- **Branding** — `config.js` → `branding` (name, tagline, handle, colors, disclaimer text).
- **Project defaults** — `config.js` → `project` (price, size, rental, maintenance, rebate settings).
- **General assumptions** — `config.js` → `assumptions` (income/commitment defaults, occupancy, management fee %, DSR ceiling, misc cost estimates).
- **Disclaimer wording** — `config.js` → `branding.disclaimer`.
- **Colors** — `config.js` → `branding.colors`. They flow through to `styles.css` automatically at runtime — no CSS editing needed for a simple palette change.

## Calculation notes (so you can sanity-check the numbers)

- **Loan instalment**: standard amortizing formula (monthly reducing balance), matches what banks quote.
- **MOT stamp duty**: current published ad-valorem scale — 1% / 2% / 3% / 4% tiers.
- **Loan agreement stamp duty**: flat 0.5% of loan amount.
- **Legal fees** (SPA and Loan Agreement): Solicitors' Remuneration Order 2023 tiered scale, RM500 minimum.
- **Rental yield**: Gross = annual rental ÷ price. Net = (rental − vacancy − management fee − maintenance − insurance − assessment tax − other) ÷ price.
- **Max loan eligibility**: reverse-amortization from a DSR-based available monthly budget — a rough planning estimate, not a bank pre-approval.

All of the above are clearly labelled as estimates in the UI, with a disclaimer that final terms depend on the bank's own assessment.

## Recommended next addition

Once you've reviewed the MVP, the segment most worth adding next is a **holding-period wealth projection** that layers in an editable annual property appreciation assumption alongside the existing cash-flow view — showing estimated equity built through loan paydown *and* (separately, clearly labeled as speculative) capital appreciation, plus a rough net exit position after RPGT and disposal costs at different holding years. This turns the tool from "monthly affordability" into a genuine "should I hold this 5 vs 10 years" decision aid — but it introduces real speculation (future price growth), so it should stay clearly separated from the estimate-grounded sections above.
