# AuthPilot 🏥⚡
> AI-powered Prior Authorization agent built on MCP + A2A + FHIR

[Build: Passing] [Deploy: Live] [Uptime: 99.9%] [FHIR: R4] [License: MIT]

AuthPilot eliminates the 10+ hours physicians spend weekly on prior 
authorizations by deploying intelligent agents that read clinical 
context, reason against payer criteria, and submit FHIR-compliant 
PA requests — autonomously.

## Live Demo → authpilot.vercel.app
## Status   → status.authpilot.uptimerobot.com
## Platform → Prompt Opinion Marketplace

## Architecture
[diagram here]

## Stack
- Backend:  Rust + Axum → Render
- Frontend: Next.js 14 + shadcn → Vercel  
- AI Brain: Gemini 2.5 Flash (free tier)
- FHIR:     HAPI R4 Public Server
- IDE:      Google Antigravity
- Platform: Prompt Opinion (MCP + A2A)