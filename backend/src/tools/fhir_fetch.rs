//! Tool 1: get_patient_clinical_context
//! Fetches and summarizes a patient's full clinical record from FHIR

use axum::{extract::State, Json};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;
use crate::AppState;
use crate::fhir::FhirClient;

#[derive(Deserialize)]
pub struct PatientContextRequest {
    pub patient_id: String,
    /// Optional FHIR base URL override (from SHARP context)
    pub fhir_base_url: Option<String>,
    /// Optional bearer token (from SHARP context)
    pub fhir_token: Option<String>,
}

// Note: PatientContextResponse and PatientSummary structs were removed as they were unused.
// The response is built dynamically using serde_json::json! in build_summary.

pub async fn get_patient_clinical_context(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PatientContextRequest>,
) -> Json<Value> {
    let base_url = req.fhir_base_url.as_deref()
        .unwrap_or(&state.fhir_base_url);

    let client = FhirClient::new(base_url, state.http_client.clone(), req.fhir_token);

    match client.get_patient_bundle(&req.patient_id).await {
        Ok(ctx) => {
            let summary = build_summary(&ctx);
            Json(serde_json::json!({
                "success": true,
                "patient_id": req.patient_id,
                "summary": summary,
                "raw_context": {
                    "patient": ctx.patient,
                    "conditions": ctx.conditions,
                    "medications": ctx.medications,
                    "observations": ctx.observations,
                    "allergies": ctx.allergies,
                    "coverage": ctx.coverage
                }
            }))
        }
        Err(e) => {
            tracing::error!("FHIR fetch error: {}", e);
            Json(serde_json::json!({
                "success": false,
                "error": e.to_string(),
                "patient_id": req.patient_id
            }))
        }
    }
}

fn build_summary(ctx: &crate::fhir::PatientClinicalContext) -> Value {
    let name = ctx.patient["name"][0]["text"]
        .as_str()
        .or_else(|| ctx.patient["name"][0]["family"].as_str())
        .unwrap_or("Unknown")
        .to_string();

    let gender = ctx.patient["gender"].as_str().map(String::from);
    let birth_date = ctx.patient["birthDate"].as_str().map(String::from);

    let active_conditions: Vec<String> = ctx.conditions.iter()
        .filter(|c| c["clinicalStatus"]["coding"][0]["code"].as_str() == Some("active"))
        .filter_map(|c| c["code"]["text"].as_str().map(String::from))
        .take(10)
        .collect();

    let active_medications: Vec<String> = ctx.medications.iter()
        .filter_map(|m| m["medicationCodeableConcept"]["text"].as_str().map(String::from))
        .take(10)
        .collect();

    let recent_labs: Vec<String> = ctx.observations.iter()
        .filter_map(|o| {
            let name = o["code"]["text"].as_str()?;
            let value = o["valueQuantity"]["value"].as_f64()
                .map(|v| format!("{:.1}", v))
                .or_else(|| o["valueString"].as_str().map(String::from))
                .unwrap_or_else(|| "N/A".to_string());
            let unit = o["valueQuantity"]["unit"].as_str().unwrap_or("");
            Some(format!("{}: {} {}", name, value, unit).trim().to_string())
        })
        .take(8)
        .collect();

    let allergies: Vec<String> = ctx.allergies.iter()
        .filter_map(|a| a["code"]["text"].as_str().map(String::from))
        .collect();

    let payer = ctx.coverage.first()
        .and_then(|c| c["payor"][0]["display"].as_str().map(String::from));

    let member_id = ctx.coverage.first()
        .and_then(|c| c["subscriberId"].as_str().map(String::from));

    serde_json::json!({
        "name": name,
        "gender": gender,
        "birth_date": birth_date,
        "active_conditions": active_conditions,
        "active_medications": active_medications,
        "recent_labs": recent_labs,
        "allergies": allergies,
        "payer": payer,
        "member_id": member_id
    })
}
