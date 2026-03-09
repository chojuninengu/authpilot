<div align="center">

# 🏥 AuthPilot
### AI-Powered Prior Authorization · MCP + A2A + FHIR R4

[![Build](https://img.shields.io/badge/build-passing-22c55e?style=flat-square&logo=github)](https://github.com/yourusername/authpilot)
[![FHIR](https://img.shields.io/badge/FHIR-R4%20Compliant-0066ff?style=flat-square)](https://hl7.org/fhir/R4/)
[![MCP](https://img.shields.io/badge/Protocol-MCP%20%2B%20A2A-a78bfa?style=flat-square)](https://modelcontextprotocol.io)
[![License](https://img.shields.io/badge/license-MIT-f59e0b?style=flat-square)](LICENSE)
[![Hackathon](https://img.shields.io/badge/Agents%20Assemble-2026-ef4444?style=flat-square)](https://devpost.com)

**[🚀 Live Demo](https://authpilot.vercel.app)** · **[📊 Status Page](https://stats.uptimerobot.com/authpilot)** · **[🏪 Prompt Opinion Marketplace](#)**

> *A physician in the US spends 10+ hours weekly on prior authorizations — not treating patients, filling out forms. AuthPilot doesn't just automate that paperwork. It reads the patient's clinical story, understands what the payer needs, and builds the argument. That's not automation. That's intelligence.*

</div>

---

## ✨ What AuthPilot Does

AuthPilot is a **dual submission** — both an **MCP Superpower** (4-tool server) and an **A2A Agent** that orchestrates those tools. It eliminates the #1 administrative burden in US healthcare.

```
Clinician orders MRI  →  AuthPilot assembles  →  PA submitted in minutes, not days
```

### The 4-Tool Pipeline

| # | Tool | What it does |
|---|------|-------------|
| 1 | `get_patient_clinical_context` | Fetches Patient, Conditions, Meds, Labs, Coverage from FHIR concurrently |
| 2 | `check_prior_auth_required` | Evaluates payer criteria (Da Vinci CRD-compatible) |
| 3 | `build_clinical_justification` | **Gemini 2.5 Flash** reasons across clinical data → generates medical necessity letter with confidence score |
| 4 | `submit_prior_auth_request` | Constructs FHIR PAS Bundle → submits → writes DocumentReference + Provenance back to record |

### The Human-in-the-Loop Gate

Tool 4 requires `clinician_confirmed: true` before submission. AuthPilot is designed for **augmentation, not replacement** — the clinician reviews the AI-generated justification before any PA is submitted.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VERCEL  (frontend)                       │
│              Next.js 14 · IBM Plex Mono · Dark UI           │
│         PA Case Tracker · New Request · Analytics           │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────────┐
│                    RENDER  (backend)                        │
│               Rust + Axum · Always Online                   │
│   /health  /mcp  /mcp/manifest  /tools/*                    │
│   MCP Protocol · SHARP Context · FHIR R4 Client            │
└──────────┬──────────────────────────┬───────────────────────┘
           │ FHIR R4                  │ Gemini 2.5 Flash
┌──────────▼──────────┐    ┌──────────▼────────────────────────┐
│  HAPI FHIR Server   │    │     Google AI Studio (free)       │
│  (public R4)        │    │     1000 req/day · zero cost       │
└─────────────────────┘    └───────────────────────────────────┘
           │ kept alive by
┌──────────▼──────────────────┐
│  UptimeRobot (5-min pings)  │  ← public status page
│  cron-job.org  (10-min)     │  ← backup pinger
└─────────────────────────────┘
```

### Deployed on $0/month

| Service | Purpose | Cost |
|---------|---------|------|
| Render.com | Rust backend | Free |
| Vercel | Next.js frontend | Free |
| HAPI FHIR | Patient data | Free |
| Google AI Studio | Gemini 2.5 Flash | Free (1k req/day) |
| UptimeRobot | Keep-alive + status | Free |
| cron-job.org | Backup pinger | Free |

---

## 🚀 Quick Start

### Prerequisites
- Rust 1.75+ (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Node.js 20+
- A free [Google AI Studio](https://aistudio.google.com) API key

### Backend

```bash
cd backend
cp .env.example .env
# Add your GEMINI_API_KEY to .env

cargo run
# Server starts at http://localhost:8081
# Health check: http://localhost:8081/health
# MCP manifest: http://localhost:8081/mcp/manifest
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_BACKEND_URL=http://localhost:8081

npm run dev
# Dashboard at http://localhost:3000
```

---

## 🔌 MCP Integration (Prompt Opinion)

AuthPilot is published to the Prompt Opinion Marketplace. To add it to your workspace:

1. Open Prompt Opinion platform
2. Search "AuthPilot" in the Marketplace
3. Click **Add to Workspace**
4. SHARP context (patient ID + FHIR token) is injected automatically

### Invoke a tool directly:

```json
POST /mcp
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_patient_clinical_context",
    "arguments": {
      "patient_id": "592011",
      "fhir_base_url": "https://hapi.fhir.org/baseR4"
    }
  }
}
```

---

## 🩺 FHIR Resources Used

| Resource | Purpose |
|----------|---------|
| `Patient` | Demographics |
| `Condition` | Active diagnoses |
| `MedicationRequest` | Active medications |
| `Observation` | Labs and vitals |
| `AllergyIntolerance` | Contraindications |
| `Coverage` | Payer information |
| `Claim` | PA request (Da Vinci PAS profile) |
| `DocumentReference` | Medical necessity letter |
| `Provenance` | Audit trail |

Da Vinci IG profiles: CRD · DTR · PAS

---

## 📁 Repository Structure

```
authpilot/
├── backend/                    # Rust + Axum MCP Server
│   ├── src/
│   │   ├── main.rs             # Server entry, routes
│   │   ├── health.rs           # /health endpoint
│   │   ├── tools/
│   │   │   ├── fhir_fetch.rs   # Tool 1: Patient context
│   │   │   ├── auth_check.rs   # Tool 2: PA requirement
│   │   │   ├── justification.rs # Tool 3: Gemini AI
│   │   │   └── pa_submit.rs    # Tool 4: FHIR submission
│   │   ├── fhir/mod.rs         # FHIR R4 client
│   │   └── mcp/mod.rs          # MCP protocol handler
│   ├── Cargo.toml
│   └── render.yaml
├── frontend/                   # Next.js 14 Dashboard
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx            # Main dashboard
│   ├── vercel.json
│   └── package.json
├── fhir-samples/               # Synthea test patients
├── docs/                       # Architecture diagrams
├── .github/workflows/          # CI/CD pipelines
└── README.md
```

---

## 🎯 Judging Criteria Addressed

| Criterion | How AuthPilot delivers |
|-----------|----------------------|
| **The AI Factor** | Gemini 2.5 Flash performs clinical narrative reasoning — maps unstructured patient data to structured payer criteria. Impossible with rule-based systems. |
| **Potential Impact** | $31B annual prior authorization cost in US. 10+ physician hours/week. CMS mandating FHIR PA APIs by 2027 — AuthPilot is ready today. |
| **Feasibility** | FHIR R4 compliant. Human-in-the-loop gate. Provenance audit trail. Da Vinci IG profiles. SHARP context propagation. Built for production. |

---

## 🛣️ Roadmap

- [ ] Real-time payer CRD endpoint integration
- [ ] SMART on FHIR authentication
- [ ] Denial appeal agent (A2A)
- [ ] Multi-payer criteria database
- [ ] EHR launch context (Epic, Cerner)

---
 
 ## 🚀 Deployment Configuration
 
 To enable automated deployments via GitHub Actions, you must configure the following **GitHub Secrets** in your repository settings (`Settings > Secrets and variables > Actions`):
 
 | Secret | Description |
 |--------|-------------|
 | `RENDER_DEPLOY_HOOK` | The "Deploy Hook" URL from your Render Service dashboard. |
 | `BACKEND_URL` | The public URL of your deployed backend (e.g., `https://authpilot-api.onrender.com`). |
 | `GEMINI_API_KEY` | Your Google AI Studio API key (used by the frontend for build-time config). |
 
 *Note: The deployment workflows will skip the deployment step if these secrets are missing.*
 
 ---
 
 ## 📄 License

MIT — free to use, modify, and deploy.

---

<div align="center">
Built for the <strong>Agents Assemble: The Healthcare AI Endgame</strong> hackathon<br/>
MCP · A2A · FHIR R4 · Prompt Opinion · Gemini 2.5 Flash
</div>
