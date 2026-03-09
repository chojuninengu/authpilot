//! MCP Protocol Handler — Prompt Opinion integration
//! Implements the Model Context Protocol so Prompt Opinion
//! can discover and invoke AuthPilot's tools natively.

use axum::{extract::State, Json};
use std::sync::Arc;
use crate::AppState;

/// MCP Manifest — tells Prompt Opinion what tools we expose
pub async fn get_manifest() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "schema_version": "1.0",
        "name": "authpilot",
        "display_name": "AuthPilot — Prior Authorization AI",
        "description": "AI-powered prior authorization agent that reads patient FHIR data, evaluates payer criteria, builds clinical justifications using Gemini 2.5 Flash, and submits FHIR-compliant PA requests. Eliminates 10+ hours/week of physician administrative burden.",
        "version": "1.0.0",
        "author": "AuthPilot Team",
        "sharp_compatible": true,
        "fhir_version": "R4",
        "tools": [
            {
                "name": "get_patient_clinical_context",
                "description": "Fetches a patient's complete clinical record from FHIR — conditions, medications, labs, allergies, and coverage. Returns a structured summary ready for PA processing.",
                "input_schema": {
                    "type": "object",
                    "required": ["patient_id"],
                    "properties": {
                        "patient_id": {"type": "string", "description": "FHIR Patient resource ID"},
                        "fhir_base_url": {"type": "string", "description": "FHIR server base URL (injected from SHARP context)"},
                        "fhir_token": {"type": "string", "description": "Bearer token for FHIR access (injected from SHARP context)"}
                    }
                }
            },
            {
                "name": "check_prior_auth_required",
                "description": "Determines if prior authorization is required for a given service and payer, returns specific criteria that must be satisfied.",
                "input_schema": {
                    "type": "object",
                    "required": ["service_code", "service_description"],
                    "properties": {
                        "service_code": {"type": "string", "description": "CPT or HCPCS procedure code"},
                        "service_description": {"type": "string", "description": "Human-readable service name"},
                        "payer_id": {"type": "string"},
                        "payer_name": {"type": "string"},
                        "diagnosis_codes": {"type": "array", "items": {"type": "string"}}
                    }
                }
            },
            {
                "name": "build_clinical_justification",
                "description": "Uses Gemini 2.5 Flash AI to analyze patient clinical data against payer criteria and generate a compelling, evidence-based medical necessity letter with confidence scoring.",
                "input_schema": {
                    "type": "object",
                    "required": ["patient_context", "pa_requirements", "requested_service", "service_code"],
                    "properties": {
                        "patient_context": {"type": "object", "description": "Output from get_patient_clinical_context"},
                        "pa_requirements": {"type": "object", "description": "Output from check_prior_auth_required"},
                        "requested_service": {"type": "string"},
                        "service_code": {"type": "string"},
                        "ordering_provider": {"type": "string"},
                        "clinical_notes": {"type": "string"}
                    }
                }
            },
            {
                "name": "submit_prior_auth_request",
                "description": "Constructs a FHIR Da Vinci PAS-compliant Claim bundle and submits the prior authorization request. Creates DocumentReference and Provenance audit trail. Requires clinician confirmation (human-in-the-loop).",
                "input_schema": {
                    "type": "object",
                    "required": ["patient_id", "service_code", "service_description", "justification", "patient_context", "clinician_confirmed"],
                    "properties": {
                        "patient_id": {"type": "string"},
                        "service_code": {"type": "string"},
                        "service_description": {"type": "string"},
                        "justification": {"type": "object", "description": "Output from build_clinical_justification"},
                        "patient_context": {"type": "object"},
                        "clinician_confirmed": {"type": "boolean", "description": "REQUIRED: Clinician must confirm before submission"},
                        "fhir_base_url": {"type": "string"},
                        "fhir_token": {"type": "string"}
                    }
                }
            }
        ]
    }))
}

/// Handle incoming MCP JSON-RPC requests from Prompt Opinion
pub async fn handle_mcp_request(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> Json<serde_json::Value> {

    let method = body["method"].as_str().unwrap_or("");
    let id = body["id"].clone();

    tracing::debug!("MCP request: method={}", method);

    match method {
        "tools/list" => Json(serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "tools": get_tool_list()
            }
        })),

        "tools/call" => {
            let tool_name = body["params"]["name"].as_str().unwrap_or("");
            let args = body["params"]["arguments"].clone();

            let result = dispatch_tool(State(state), tool_name, args).await;
            Json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "content": [{"type": "text", "text": result.to_string()}]
                }
            }))
        },

        "initialize" => Json(serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "authpilot", "version": "1.0.0"}
            }
        })),

        _ => Json(serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {"code": -32601, "message": format!("Method not found: {}", method)}
        }))
    }
}

async fn dispatch_tool(
    State(state): State<Arc<AppState>>,
    tool_name: &str,
    args: serde_json::Value,
) -> serde_json::Value {
    use crate::tools::*;
    use axum::extract::State as AxumState;

    match tool_name {
        "get_patient_clinical_context" => {
            match serde_json::from_value(args) {
                Ok(req) => {
                    let resp = fhir_fetch::get_patient_clinical_context(AxumState(state), axum::Json(req)).await;
                    resp.0
                }
                Err(e) => serde_json::json!({"error": format!("Invalid args: {}", e)})
            }
        }
        "check_prior_auth_required" => {
            match serde_json::from_value(args) {
                Ok(req) => {
                    let resp = auth_check::check_prior_auth_required(AxumState(state), axum::Json(req)).await;
                    resp.0
                }
                Err(e) => serde_json::json!({"error": format!("Invalid args: {}", e)})
            }
        }
        "build_clinical_justification" => {
            match serde_json::from_value(args) {
                Ok(req) => {
                    let resp = justification::build_clinical_justification(AxumState(state), axum::Json(req)).await;
                    resp.0
                }
                Err(e) => serde_json::json!({"error": format!("Invalid args: {}", e)})
            }
        }
        "submit_prior_auth_request" => {
            match serde_json::from_value(args) {
                Ok(req) => {
                    let resp = pa_submit::submit_prior_auth_request(AxumState(state), axum::Json(req)).await;
                    resp.0
                }
                Err(e) => serde_json::json!({"error": format!("Invalid args: {}", e)})
            }
        }
        _ => serde_json::json!({"error": format!("Unknown tool: {}", tool_name)})
    }
}

fn get_tool_list() -> serde_json::Value {
    serde_json::json!([
        {"name": "get_patient_clinical_context", "description": "Fetch patient FHIR clinical context"},
        {"name": "check_prior_auth_required", "description": "Check if PA is required for a service"},
        {"name": "build_clinical_justification", "description": "AI-powered clinical justification generation"},
        {"name": "submit_prior_auth_request", "description": "Submit FHIR-compliant PA request with audit trail"}
    ])
}
