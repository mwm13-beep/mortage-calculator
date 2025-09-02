# Mortgage Calculator (Web)

## Quick Summary

This app calculates mortgage payments, schedules, and summaries with a focus on Canadian defaults. Key concepts are modeled explicitly:

- **Amortization period** (e.g., 25–30 years): total time to pay off the mortgage.
- **Term** (e.g., 1–5 years): length of the current contract/rate with the lender.

Calculations use standard amortization formulas; outputs include a breakdown (principal/interest over time) and API fields suitable for PDF/Excel export.

By default, the app validates inputs according to Canadian rules (see below) but is being refactored to support region switching so other jurisdictions can be added without changing validation code.

---

## Mortgage Rules (Canada)

### Core Concepts

#### Amortization vs. Term
Canada’s financial consumer agency explains these as distinct: amortization is the total payoff horizon; term is the current contract window (often 1–5 years).

- FCAC overview of terms & amortization: https://www.canada.ca/en/financial-consumer-agency/services/mortgages/mortgage-terms-amortization.html  
- FCAC mortgage calculator: https://itools-ioutils.fcac-acfc.gc.ca/MBC-FTC/

### Regulatory/Policy Guardrails

**Maximum amortization (insured mortgages)**  
Federal changes (Budget 2024) allow 30-year amortizations for first-time buyers of newly built homes; otherwise, insured mortgages typically cap at 25 years.

- Department of Finance Canada (news release): https://www.canada.ca/en/department-finance/news/2024/04/supporting-first-time-homebuyers.html  
- Canada.ca (Department of Finance): https://www.canada.ca/en/department-finance.html

**Uninsured mortgages (≥20% down)**  
Lender policy sets the max amortization (commonly up to 30 years). The FCAC guidance differentiates insured vs. uninsured treatment.

- FCAC home mortgages hub: https://www.canada.ca/en/financial-consumer-agency/services/mortgages.html

**Stress test / Minimum Qualifying Rate (MQR)**  
For uninsured mortgages, OSFI’s MQR guidance: qualify at the greater of contract rate + 2% or 5.25% (with certain renewal exceptions introduced in 2024).

- OSFI MQR page: https://www.osfi-bsif.gc.ca/Eng/fi-if/in-ai/Pages/mqr.aspx

**CMHC programs**  
CMHC program pages reflect the policy environment (e.g., program-specific criteria that may reference amortization caps).

- CMHC: https://www.cmhc-schl.gc.ca/

**Why terms are separate from amortization in Canada**  
Canadian mortgages commonly pair a long amortization (e.g., 25 years) with a short term (1–5 years) so conditions can be renegotiated as markets change—unlike the U.S., where the term often equals the amortization.

- FCAC explanation of terms & amortization: https://www.canada.ca/en/financial-consumer-agency/services/mortgages/mortgage-terms-amortization.html  
- Department of Finance Canada: https://www.canada.ca/en/department-finance.html

---

## Local development

### Prereqs

- Node 20+ (or 18+ should work, but we target 20)
- npm (repo has a package-lock.json)
- Vercel CLI: npm i -g vercel

The Vercel project’s **Root Directory** is set to `frontend/`.  
Run `vercel dev` from the **repo root**, not from `frontend/`.

### One-time setup

    # from repo root
    npm ci
    vercel login

    # pull the Development env vars your serverless function needs (e.g. Upstash + UI_ORIGIN)
    vercel env pull frontend/.env.local

Ensure `frontend/.env.local` contains:

    # used by the API handler for CORS during local dev
    UI_ORIGIN=http://localhost:3000
    # Upstash (rate limit) — these come from Vercel env
    UPSTASH_REDIS_REST_URL=...
    UPSTASH_REDIS_REST_TOKEN=...

### Full-stack dev (UI + API)

    # from repo root
    vercel dev
    # then open http://localhost:3000

- `vercel dev` runs Vite for the UI and your serverless function at `/api/mortgage`.
- The frontend posts to `/api/mortgage` on the same origin, so no extra config is needed.

---

## Debugging the serverless function with Chrome DevTools

You can attach Chrome’s Node inspector to the serverless function process started by `vercel dev`.

### 1) Start `vercel dev` with the Node inspector

macOS / Linux (bash/zsh):

    # pause on first line (easiest to catch startup)
    NODE_OPTIONS="--inspect-brk=9229" vercel dev

    # or attach without pausing:
    NODE_OPTIONS="--inspect=9229" vercel dev

Windows PowerShell:

    # pause on first line
    $env:NODE_OPTIONS="--inspect-brk=9229"; vercel dev

    # or without pausing:
    $env:NODE_OPTIONS="--inspect=9229"; vercel dev

Tip: If you use `--inspect` (no `-brk`), add a `debugger;` line in `frontend/api/mortgage.ts` or set a breakpoint after attaching so execution stops where you want.

### 2) Attach from Chrome

1. Open Chrome and go to `chrome://inspect/#devices`.
2. Click “Open dedicated DevTools for Node”.
3. If you don’t see a target, click **Configure…** and add `localhost:9229`.
4. You’ll see one or more Node targets (Vite and the Vercel function runner). Pick the one whose sources include `.vercel/` and `api/...` paths, or open each target and look for your function file (`frontend/api/mortgage.ts`) in the **Sources** panel.

### 3) Set breakpoints & debug

- In DevTools **Sources**, open `frontend/api/mortgage.ts` (source maps map back to TS).
- Set breakpoints (e.g., inside the handler) and then trigger the function by submitting the form in the UI.
- Use the standard step/continue controls to inspect variables and call stacks.

### 4) Clean up

- Stop `vercel dev` with `Ctrl+C`.
- Remove the `NODE_OPTIONS` setting when you’re done debugging so the inspector isn’t opened every time.

Notes

- If multiple Node processes start (Vite + functions), you may see multiple “targets” in Chrome. Choose the one that pauses in your handler when you hit a breakpoint, or look for the one whose working directory/sources show `.vercel` and `api/mortgage`.
- If port `9229` is busy, pick another free port: `--inspect-brk=9231` and add that port in `chrome://inspect`.
