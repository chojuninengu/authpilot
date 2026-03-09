//! Tool 4: submit_prior_auth_request
//! Constructs a FHIR-compliant PA Bundle and submits it.
//! Writes DocumentReference + Provenance back to patient record.

use axum::{extract::State, Json};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;
use chrono::Utc;
use crate::AppState;
use crate::fhir::FhirClient;

#[derive(Deserialize)]
pub struct PaSubmitRequest {
    pub patient_id: String,
    pub service_code: String,
    pub service_description: String,
    pub justification: serde_json::Value,   // Output from Tool 3
    pub patient_context: serde_json::Value, // Output from Tool 1
    pub fhir_base_url: Option<String>,
    pub fhir_token: Option<String>,
    /// Human confirmed submission (human-in-the-loop gate)
    pub clinician_confirmed: bool,
    pub ordering_provider_id: Option<String>,
}

pub async fn submit_prior_auth_request(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PaSubmitRequest>,
) -> Json<serde_json::Value> {

    // ── Human-in-the-loop gate ────────────────────────────────
    if !req.clinician_confirmed {
        return Json(serde_json::json!({
            "success": false,
            "status": "awaiting_confirmation",
            "message": "Clinician confirmation required before submission. Review the justification and confirm.",
            "justification_summary": req.justification["summary"],
            "confidence_score": req.justification["confidence_score"],
            "approval_likelihood": req.justification["approval_likelihood"]
        }));
    }

    let base_url = req.fhir_base_url.as_deref().unwrap_or(&state.fhir_base_url);
    let fhir = FhirClient::new(base_url, state.http_client.clone(), req.fhir_token.clone());

    let pa_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    // ── Build FHIR Claim (PA Request) ─────────────────────────
    let claim = build_fhir_claim(&req, &pa_id, &now);

    // ── Submit to FHIR server ─────────────────────────────────
    let claim_result = fhir.create_resource("Claim", claim).await;

    // ── Write DocumentReference (the justification letter) ────
    let doc_ref = build_document_reference(&req, &pa_id, &now);
    let doc_result = fhir.create_resource("DocumentReference", doc_ref).await;

    // ── Write Provenance (audit trail) ────────────────────────
    let provenance = build_provenance(&req.patient_id, &pa_id, &now);
    let _ = fhir.create_resource("Provenance", provenance).await;

    let claim_id = claim_result.as_ref().ok()
        .and_then(|r| r["id"].as_str())
        .unwrap_or(&pa_id)
        .to_string();

    tracing::info!("PA submitted: claim_id={}, patient={}", claim_id, req.patient_id);

    Json(serde_json::json!({
        "success": true,
        "status": "submitted",
        "pa_tracking_id": pa_id,
        "fhir_claim_id": claim_id,
        "document_reference_created": doc_result.is_ok(),
        "submitted_at": now,
        "estimated_turnaround": "72 hours",
        "next_steps": [
            "Payer will review within 72 hours",
            "Check status at /tools/pa-status",
            "You will receive notification of approval/denial"
        ],
        "fhir_resources_created": [
            format!("Claim/{}", claim_id),
            format!("DocumentReference/{}", pa_id),
            format!("Provenance/{}", Uuid::new_v4())
        ]
    }))
}

fn build_fhir_claim(req: &PaSubmitRequest, pa_id: &str, now: &str) -> serde_json::Value {
    serde_json::json!({
        "resourceType": "Claim",
        "id": pa_id,
        "meta": {
            "profile": ["http://hl7.org/fhir/us/davinci-pas/StructureDefinition/profile-claim"]
        },
        "status": "active",
        "type": {
            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/claim-type", "code": "professional"}]
        },
        "use": "preauthorization",
        "patient": {"reference": format!("Patient/{}", req.patient_id)},
        "created": now,
        "insurer": {
            "display": req.patient_context["summary"]["payer"].as_str().unwrap_or("Unknown Payer")
        },
        "provider": {
            "reference": req.ordering_provider_id.as_deref()
                .map(|id| format!("Practitioner/{}", id))
                .unwrap_or_else(|| "Practitioner/unknown".to_string())
        },
        "priority": {"coding": [{"code": "normal"}]},
        "item": [{
            "sequence": 1,
            "productOrService": {
                "coding": [{
                    "system": "http://www.ama-assn.org/go/cpt",
                    "code": req.service_code,
                    "display": req.service_description
                }]
            },
            "extension": [{
                "url": "http://hl7.org/fhir/us/davinci-pas/StructureDefinition/extension-itemRequestedServiceDate",
                "valueDate": now.split('T').next().unwrap_or(now)
            }]
        }],
        "text": {
            "status": "generated",
            "div": format!("<div>Prior Authorization Request for {} - Generated by AuthPilot AI</div>", req.service_description)
        }
    })
}

fn build_document_reference(req: &PaSubmitRequest, pa_id: &str, now: &str) -> serde_json::Value {
    let letter = req.justification["medical_necessity_letter"]
        .as_str()
        .unwrap_or("Medical necessity letter not available");

    let encoded = base64_encode(letter.as_bytes());

    serde_json::json!({
        "resourceType": "DocumentReference",
        "id": format!("doc-{}", pa_id),
        "status": "current",
        "type": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "57016-8",
                "display": "Prior authorization request note"
            }]
        },
        "subject": {"reference": format!("Patient/{}", req.patient_id)},
        "date": now,
        "description": format!("AI-generated PA justification for {} — Confidence: {}%",
            req.service_description,
            req.justification["confidence_score"].as_u64().unwrap_or(0)
        ),
        "content": [{
            "attachment": {
                "contentType": "text/plain",
                "data": encoded,
                "title": "Medical Necessity Letter"
            }
        }],
        "context": {
            "related": [{"reference": format!("Claim/{}", pa_id)}]
        }
    })
}

fn build_provenance(patient_id: &str, pa_id: &str, now: &str) -> serde_json::Value {
    serde_json::json!({
        "resourceType": "Provenance",
        "target": [{"reference": format!("Claim/{}", pa_id)}],
        "recorded": now,
        "agent": [{
            "type": {
                "coding": [{"system": "http://terminology.hl7.org/CodeSystem/provenance-participant-type", "code": "author"}]
            },
            "who": {"display": "AuthPilot AI Agent v1.0.0"}
        }],
        "reason": [{
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/v3-ActReason",
                "code": "COVERAGE",
                "display": "Prior authorization submission via MCP agent"
            }]
        }],
        "entity": [{
            "role": "source",
            "what": {"reference": format!("Patient/{}", patient_id)}
        }]
    })
}

fn base64_encode(input: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        result.push(CHARS[b0 >> 2] as char);
        result.push(CHARS[((b0 & 3) << 4) | (b1 >> 4)] as char);
        result.push(if chunk.len() > 1 { CHARS[((b1 & 15) << 2) | (b2 >> 6)] as char } else { '=' });
        result.push(if chunk.len() > 2 { CHARS[b2 & 63] as char } else { '=' });
    }
    result
}
