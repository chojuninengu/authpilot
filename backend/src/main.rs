use axum::{
    routing::{get, post},
    Router,
};
use std::sync::Arc;
use tower_http::cors::{CorsLayer, Any};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod tools;
mod fhir;
mod mcp;
mod health;

use tools::{
    fhir_fetch::get_patient_clinical_context,
    auth_check::check_prior_auth_required,
    justification::build_clinical_justification,
    pa_submit::submit_prior_auth_request,
};

#[derive(Clone)]
pub struct AppState {
    pub fhir_base_url: String,
    pub gemini_api_key: String,
    pub http_client: reqwest::Client,
}

#[tokio::main]
async fn main() {
    // Load .env in development
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "authpilot=debug,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let state = Arc::new(AppState {
        fhir_base_url: std::env::var("FHIR_BASE_URL")
            .unwrap_or_else(|_| "https://hapi.fhir.org/baseR4".to_string()),
        gemini_api_key: std::env::var("GEMINI_API_KEY")
            .expect("GEMINI_API_KEY must be set"),
        http_client: reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap(),
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        // ── Health & status ──────────────────────────────────────
        .route("/health",         get(health::health_check))
        .route("/",               get(health::root))

        // ── MCP Tool endpoints ───────────────────────────────────
        .route("/tools/patient-context",   post(get_patient_clinical_context))
        .route("/tools/auth-check",        post(check_prior_auth_required))
        .route("/tools/justification",     post(build_clinical_justification))
        .route("/tools/submit-pa",         post(submit_prior_auth_request))

        // ── MCP Protocol endpoint (Prompt Opinion integration) ───
        .route("/mcp",            post(mcp::handle_mcp_request))
        .route("/mcp/manifest",   get(mcp::get_manifest))

        .layer(cors)
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "8081".to_string());
    let addr = format!("0.0.0.0:{}", port);

    tracing::info!("🏥 AuthPilot MCP Server starting on {}", addr);
    tracing::info!("📋 FHIR endpoint: https://hapi.fhir.org/baseR4");
    tracing::info!("🤖 Gemini 2.5 Flash: ready");
    tracing::info!("✅ Health check: http://{}/health", addr);
    tracing::info!("🚀 Default port is now 8081");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
