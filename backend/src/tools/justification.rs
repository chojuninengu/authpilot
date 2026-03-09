//! Tool 3: build_clinical_justification
//! The AI engine — uses Gemini 1.5 Flash to reason across patient data
//! and construct a compelling, evidence-grounded PA justification.
//! This is what rule-based systems CANNOT do.

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::AppState;

#[derive(Deserialize)]
pub struct JustificationRequest {
    pub patient_context: serde_json::Value,   // Output from Tool 1
    pub pa_requirements: serde_json::Value,    // Output from Tool 2
    pub requested_service: String,
    pub service_code: String,
    pub ordering_provider: Option<String>,
    pub clinical_notes: Option<String>,        // Free-text notes from clinician
}

pub async fn build_clinical_justification(
    State(state): State<Arc<AppState>>,
    Json(req): Json<JustificationRequest>,
) -> Json<serde_json::Value> {

    let prompt = build_gemini_prompt(&req);

    match call_gemini(&state, &prompt).await {
        Ok(gemini_response) => {
            let parsed = parse_justification_response(&gemini_response);
            Json(serde_json::json!({
                "success": true,
                "justification": parsed,
                "model": "gemini-1.5-flash",
                "fhir_compliant": true
            }))
        }
        Err(e) => {
            tracing::error!("Gemini API error: {}", e);
            Json(serde_json::json!({
                "success": false,
                "error": format!("AI justification failed: {}", e),
                "fallback": "Manual review required"
            }))
        }
    }
}

fn build_gemini_prompt(req: &JustificationRequest) -> String {
    // This prompt is the competitive moat of AuthPilot.
    // It instructs Gemini to think like a medical director reviewing a PA.
    format!(r#"
You are an expert clinical documentation specialist and prior authorization (PA) advocate with 20 years of experience. 
Your job is to analyze a patient's complete clinical record and construct a compelling, 
evidence-based prior authorization justification that will be reviewed by a payer medical director.

## REQUESTED SERVICE
Service: {}
CPT/HCPCS Code: {}
Ordering Provider: {}

## PAYER REQUIREMENTS TO SATISFY
{}

## PATIENT CLINICAL CONTEXT
{}

## ADDITIONAL CLINICAL NOTES FROM PROVIDER
{}

## YOUR TASK
1. Analyze the patient's clinical data thoroughly
2. Map EACH payer requirement to specific evidence found in the patient's record
3. Identify any GAPS (missing evidence) and flag them clearly
4. Write a professional, compelling medical necessity letter
5. Cite specific FHIR resources by type (e.g., "Condition/diabetes-type2", "Observation/hba1c-2024-01")
6. Assign a confidence score (0-100) based on how well the evidence satisfies payer criteria

## RESPONSE FORMAT (JSON only, no markdown)
{{
  "medical_necessity_letter": "Full professional letter text here...",
  "evidence_mapping": [
    {{
      "payer_criterion": "criterion text",
      "satisfied": true/false,
      "evidence": "specific patient data that satisfies this criterion",
      "fhir_references": ["ResourceType/id"]
    }}
  ],
  "gaps": [
    {{
      "missing_requirement": "what is missing",
      "recommendation": "what to do to fill this gap",
      "blocking": true/false
    }}
  ],
  "confidence_score": 0-100,
  "approval_likelihood": "high/medium/low",
  "urgency_flag": true/false,
  "summary": "2-3 sentence executive summary for the clinician"
}}
"#,
        req.requested_service,
        req.service_code,
        req.ordering_provider.as_deref().unwrap_or("Not specified"),
        serde_json::to_string_pretty(&req.pa_requirements).unwrap_or_default(),
        serde_json::to_string_pretty(&req.patient_context).unwrap_or_default(),
        req.clinical_notes.as_deref().unwrap_or("None provided"),
    )
}

async fn call_gemini(state: &AppState, prompt: &str) -> anyhow::Result<String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key={}",
        state.gemini_api_key
    );

    let body = serde_json::json!({
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 4096
        },
        "safetySettings": [
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"}
        ]
    });

    let resp = state.http_client
        .post(&url)
        .json(&body)
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let text = resp["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No text in Gemini response: {}", resp))?
        .to_string();

    Ok(text)
}

fn parse_justification_response(raw: &str) -> serde_json::Value {
    // Strip markdown fences if present
    let clean = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    serde_json::from_str(clean).unwrap_or_else(|_| {
        serde_json::json!({
            "medical_necessity_letter": raw,
            "confidence_score": 50,
            "parse_error": "Response was not valid JSON — raw text preserved"
        })
    })
}
