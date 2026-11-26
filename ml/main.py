import os
from typing import List, Optional
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import joblib

from .train import MODELS_DIR, FEATURE_NAMES, train_and_save

app = FastAPI(
    title="Unitel Credit Scoring ML Service",
    description="FastAPI service for K-Means Customer Segmentation & KNN Similar Customers",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory cached models and synthetic dataset
state = {
    "scaler": None,
    "kmeans": None,
    "knn": None,
    "cluster_to_segment": None,
    "synthetic_customers": None,
    "metrics": None,
}

def load_models_into_memory():
    scaler_path = os.path.join(MODELS_DIR, "scaler.joblib")
    kmeans_path = os.path.join(MODELS_DIR, "kmeans.joblib")
    knn_path = os.path.join(MODELS_DIR, "knn.joblib")
    c2s_path = os.path.join(MODELS_DIR, "cluster_to_segment.joblib")
    cust_path = os.path.join(MODELS_DIR, "synthetic_customers.joblib")
    metrics_path = os.path.join(MODELS_DIR, "metrics.joblib")

    if not (os.path.exists(scaler_path) and os.path.exists(kmeans_path) and os.path.exists(metrics_path)):
        print("[ML Service] Pre-trained models not found. Running initial training pipeline...")
        train_and_save()

    state["scaler"] = joblib.load(scaler_path)
    state["kmeans"] = joblib.load(kmeans_path)
    state["knn"] = joblib.load(knn_path)
    state["cluster_to_segment"] = joblib.load(c2s_path)
    state["synthetic_customers"] = joblib.load(cust_path)
    state["metrics"] = joblib.load(metrics_path)
    print(f"[ML Service] Models loaded. Dataset size: {len(state['synthetic_customers'])}, Agreement: {state['metrics']['agreement_pct']}%")

# Load models on module import / startup
load_models_into_memory()

class CustomerFeatures(BaseModel):
    sim_age_months: float = Field(..., ge=0, description="Tenure of the SIM card in months")
    topup_regularity: float = Field(..., ge=0, le=1.0, description="Ratio of active topup activity (0.0 to 1.0)")
    avg_monthly_topup_kz: float = Field(..., ge=0, description="Average monthly airtime topup in Kz")
    spend_stability: float = Field(..., ge=0, le=1.0, description="Stability of monthly telecom spend (0.0 to 1.0)")
    airtime_loans_repaid_ratio: float = Field(..., ge=0, le=1.0, description="Ratio of emergency airtime advances repaid (0.0 to 1.0)")
    wallet_level: float = Field(..., ge=0, le=3.0, description="0: None/cash, 1: USSD, 2: Smartphone App, 3: Merchant/High-velocity")

def vectorize_features(c: CustomerFeatures) -> np.ndarray:
    return np.array([[
        c.sim_age_months,
        c.topup_regularity,
        c.avg_monthly_topup_kz,
        c.spend_stability,
        c.airtime_loans_repaid_ratio,
        c.wallet_level,
    ]], dtype=float)

@app.get("/health")
def health_check():
    metrics = state["metrics"] or {}
    return {
        "status": "ok",
        "service": "unitel-credit-ml",
        "version": "1.0.0",
        "models_loaded": state["kmeans"] is not None,
        "n_synthetic_customers": len(state["synthetic_customers"]) if state["synthetic_customers"] else 0,
        "agreement_pct": metrics.get("agreement_pct", 0.0),
    }

@app.get("/validation")
def get_validation_metrics():
    if not state["metrics"]:
        raise HTTPException(status_code=500, detail="Metrics not loaded")
    return state["metrics"]

@app.post("/segment")
def predict_segment(features: CustomerFeatures):
    if state["scaler"] is None or state["kmeans"] is None:
        raise HTTPException(status_code=503, detail="ML model is not loaded")

    vec = vectorize_features(features)
    scaled_vec = state["scaler"].transform(vec)
    cluster_id = int(state["kmeans"].predict(scaled_vec)[0])

    # Calculate distance to cluster centers for confidence score
    distances = state["kmeans"].transform(scaled_vec)[0]
    min_dist = distances[cluster_id]
    # Softmax-style or inverse distance confidence
    inv_dists = 1.0 / (distances + 1e-4)
    confidence = float(inv_dists[cluster_id] / np.sum(inv_dists))

    segment_code = state["cluster_to_segment"].get(cluster_id, f"S{cluster_id + 1}")

    return {
        "success": True,
        "segment_code": segment_code,
        "cluster_id": cluster_id,
        "confidence": round(confidence, 3),
        "cluster_distance": round(float(min_dist), 3),
        "model": "K-Means (k=10) on StandardScaler features",
    }

@app.post("/similar")
def find_similar_customers(features: CustomerFeatures, n_neighbors: int = 5):
    if state["scaler"] is None or state["knn"] is None or state["synthetic_customers"] is None:
        raise HTTPException(status_code=503, detail="KNN model or customer history is not loaded")

    vec = vectorize_features(features)
    scaled_vec = state["scaler"].transform(vec)

    distances, indices = state["knn"].kneighbors(scaled_vec, n_neighbors=n_neighbors)

    similar = []
    repaid_count = 0
    late_count = 0

    all_custs = state["synthetic_customers"]

    for dist, idx in zip(distances[0], indices[0]):
        cust = dict(all_custs[int(idx)])
        outcome = cust.get("outcome", "repaid on time")
        if outcome == "repaid on time":
            repaid_count += 1
        else:
            late_count += 1

        similar.append({
            "id": cust.get("id"),
            "sim_age_months": int(cust.get("sim_age_months", 0)),
            "topup_regularity": round(float(cust.get("topup_regularity", 0)), 2),
            "avg_monthly_topup_kz": int(cust.get("avg_monthly_topup_kz", 0)),
            "spend_stability": round(float(cust.get("spend_stability", 0)), 2),
            "airtime_loans_repaid_ratio": round(float(cust.get("airtime_loans_repaid_ratio", 0)), 2),
            "wallet_level": int(cust.get("wallet_level", 0)),
            "outcome": outcome,
            "segment": cust.get("ml_segment") or cust.get("rule_segment"),
            "distance": round(float(dist), 3),
        })

    repayment_chance_pct = int(round((repaid_count / max(n_neighbors, 1)) * 100))
    summary_line = (
        f"{n_neighbors} similar customers: {repaid_count} repaid on time, {late_count} paid late. "
        f"Estimated repayment chance: {repayment_chance_pct}%."
    )

    return {
        "success": True,
        "similar_customers": similar,
        "repaid_on_time_count": repaid_count,
        "paid_late_count": late_count,
        "repayment_chance_pct": repayment_chance_pct,
        "summary_line": summary_line,
        "disclaimer": "Based on synthetic demo history",
    }

@app.post("/retrain")
def retrain_models():
    new_metrics = train_and_save()
    load_models_into_memory()
    return {
        "success": True,
        "message": "Models retrained successfully",
        "metrics": new_metrics,
    }
