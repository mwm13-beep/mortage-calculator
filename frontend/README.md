Mortgage Calculator (Web)
Quick Summary

This app calculates mortgage payments, schedules, and summaries with a focus on Canadian defaults. Key concepts are modeled explicitly:

Amortization period (e.g., 25–30 years): total time to pay off the mortgage.

Term (e.g., 1–5 years): length of the current contract/rate with the lender.

Calculations use standard amortization formulas; outputs include a breakdown (principal/interest over time) and API fields suitable for PDF/Excel export.

By default, the app validates inputs according to Canadian rules (see below) but is being refactored to support region switching so other jurisdictions can be added without changing validation code.

Mortgage Rules (Canada)
Core Concepts

Amortization vs. Term
Canada’s financial consumer agency explains these as distinct: amortization is the total payoff horizon; term is the current contract window (often 1–5 years). 
Canada.ca
itools-ioutils.fcac-acfc.gc.ca

Regulatory/Policy Guardrails

Maximum amortization (insured mortgages)
Federal changes (Budget 2024) allow 30‑year amortizations for first‑time buyers of newly built homes; otherwise, insured mortgages typically cap at 25 years. 
Canada.ca
+2
Canada.ca
+2

Uninsured mortgages (≥20% down)
Lender policy sets the max amortization (commonly up to 30 years). The FCAC guidance differentiates insured vs. uninsured treatment. 
Canada.ca

Stress test / Minimum Qualifying Rate (MQR)
For uninsured mortgages, OSFI’s MQR guidance: qualify at the greater of contract rate + 2% or 5.25% (with certain renewal exceptions introduced in 2024). 
OSFI
+1

CMHC programs
CMHC program pages reflect the policy environment (e.g., Home Start indicates max amortization 30 years, program‑specific criteria). 
cmhc-schl.gc.ca

Why terms are separate from amortization in Canada
Canadian mortgages commonly pair a long amortization (e.g., 25 years) with a short term (1–5 years) so conditions can be renegotiated as markets change—unlike the U.S., where the term often equals the amortization. (For user education copy, cite FCAC and Department of Finance releases above.) 
Canada.ca
+1