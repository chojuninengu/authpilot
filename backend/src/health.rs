use axum::Json;
use serde_json::{json, Value};
use chrono::Utc;

pub async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "authpilot-mcp-server",
        "version": "1.0.0",
        "timestamp": Utc::now().to_rfc3339(),
        "tools": [
            "get_patient_clinical_context",
            "check_prior_auth_required",
            "build_clinical_justification",
            "submit_prior_auth_request"
        ],
        "fhir": "R4",
        "protocols": ["MCP", "A2A", "FHIR"]
    }))
}

pub async fn root() -> Json<Value> {
    Json(json!({
        "name": "AuthPilot",
        "description": "AI-powered Prior Authorization MCP Server",
        "docs": "https://github.com/chojuninengu/authpilot",
        "health": "/health",
        "mcp_manifest": "/mcp/manifest"
    }))
}
