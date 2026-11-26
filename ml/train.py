import os
import random
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.neighbors import NearestNeighbors
from scipy.optimize import linear_sum_assignment
import joblib

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)

SEGMENTS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"]

FEATURE_NAMES = [
    "sim_age_months",
    "topup_regularity",
    "avg_monthly_topup_kz",
    "spend_stability",
    "airtime_loans_repaid_ratio",
    "wallet_level",
]

def assign_rule_based_segment(c):
    """
    Standard rule-based segment assignment representing the legacy rules:
    S10: Postpaid / High-value subscriber
    S7: Salaried formal worker
    S8: Self-employed / Informal trader
    S6: Banked digital, hybrid with wallet
    S5: Banked, branch/ATM
    S9: Remittance-dependent
    S3: Smartphone, unbanked, wallet app
    S2: Button phone with USSD wallet
    S4: Agent-assisted cash user
    S1: Button phone, cash-only
    """
    topup = c["avg_monthly_topup_kz"]
    sim_age = c["sim_age_months"]
    reg = c["topup_regularity"]
    stab = c["spend_stability"]
    wl = c["wallet_level"]

    if topup >= 80000 and sim_age >= 24:
        return "S10"
    if stab >= 0.82 and reg >= 0.78 and topup >= 35000:
        return "S7"
    if wl >= 3 or (wl == 2 and topup >= 45000 and reg >= 0.75):
        return "S8"
    if wl == 2 and reg >= 0.70 and topup >= 30000:
        return "S6"
    if topup >= 25000 and wl >= 1 and sim_age >= 12:
        return "S5"
    if reg >= 0.45 and topup >= 15000 and wl == 1 and stab < 0.70:
        return "S9"
    if wl == 2:
        return "S3"
    if wl == 1:
        return "S2"
    if reg >= 0.35 and topup >= 6000:
        return "S4"
    return "S1"

def generate_synthetic_data(n_samples=500, seed=42):
    random.seed(seed)
    np.random.seed(seed)

    # 10 archetypes corresponding to S1..S10
    archetypes = [
        # S1: Button phone, cash-only
        {"sim_age": (3, 30), "reg": (0.20, 0.45), "topup": (1000, 6000), "stab": (0.25, 0.55), "repaid": (0.50, 0.85), "wl": [0]},
        # S2: Button phone with USSD wallet
        {"sim_age": (6, 42), "reg": (0.40, 0.68), "topup": (4000, 14000), "stab": (0.40, 0.68), "repaid": (0.65, 0.92), "wl": [1]},
        # S3: Smartphone, unbanked, wallet app
        {"sim_age": (6, 36), "reg": (0.50, 0.82), "topup": (8000, 26000), "stab": (0.45, 0.75), "repaid": (0.70, 0.95), "wl": [2]},
        # S4: Agent-assisted cash user
        {"sim_age": (12, 54), "reg": (0.35, 0.60), "topup": (6000, 18000), "stab": (0.30, 0.60), "repaid": (0.60, 0.90), "wl": [0, 1]},
        # S5: Banked, branch and ATM user
        {"sim_age": (18, 72), "reg": (0.60, 0.88), "topup": (25000, 60000), "stab": (0.60, 0.85), "repaid": (0.80, 0.98), "wl": [1]},
        # S6: Banked digital, hybrid with wallet
        {"sim_age": (14, 60), "reg": (0.70, 0.94), "topup": (30000, 75000), "stab": (0.70, 0.90), "repaid": (0.85, 0.99), "wl": [2]},
        # S7: Salaried formal worker
        {"sim_age": (24, 96), "reg": (0.82, 0.99), "topup": (40000, 90000), "stab": (0.84, 0.98), "repaid": (0.90, 1.00), "wl": [2]},
        # S8: Self-employed or informal trader
        {"sim_age": (14, 68), "reg": (0.76, 0.98), "topup": (50000, 115000), "stab": (0.62, 0.86), "repaid": (0.82, 0.98), "wl": [3]},
        # S9: Remittance-dependent household
        {"sim_age": (12, 78), "reg": (0.42, 0.68), "topup": (16000, 42000), "stab": (0.38, 0.66), "repaid": (0.75, 0.95), "wl": [1]},
        # S10: Postpaid or high-value subscriber
        {"sim_age": (36, 120), "reg": (0.90, 1.00), "topup": (85000, 200000), "stab": (0.88, 0.99), "repaid": (0.94, 1.00), "wl": [2, 3]},
    ]

    records = []
    samples_per_arch = n_samples // len(archetypes)

    for i, arch in enumerate(archetypes):
        for j in range(samples_per_arch):
            sim_age = round(np.random.uniform(*arch["sim_age"]))
            reg = round(float(np.random.uniform(*arch["reg"])), 3)
            topup = round(float(np.random.uniform(*arch["topup"])), -2)
            stab = round(float(np.random.uniform(*arch["stab"])), 3)
            repaid = round(float(np.random.uniform(*arch["repaid"])), 3)
            wl = int(random.choice(arch["wl"]))

            c = {
                "id": f"CUST-{1000 + len(records) + 1}",
                "sim_age_months": sim_age,
                "topup_regularity": reg,
                "avg_monthly_topup_kz": topup,
                "spend_stability": stab,
                "airtime_loans_repaid_ratio": repaid,
                "wallet_level": wl,
            }

            rule_seg = assign_rule_based_segment(c)
            c["rule_segment"] = rule_seg

            # Realistic correlation for repayment outcome:
            # Positive factors: tenure, regularity, spend, stability, airtime repayment history, wallet level
            score_latent = (
                -2.8
                + 0.025 * sim_age
                + 2.8 * reg
                + 0.000018 * min(topup, 120000)
                + 2.4 * stab
                + 3.2 * (repaid - 0.5)
                + 0.35 * wl
                + np.random.normal(0, 0.45)
            )
            prob_repaid = 1.0 / (1.0 + np.exp(-score_latent))
            outcome = "repaid on time" if np.random.rand() < prob_repaid else "paid late"
            c["outcome"] = outcome

            records.append(c)

    # If any remainder to reach exactly n_samples
    while len(records) < n_samples:
        arch = random.choice(archetypes)
        sim_age = round(np.random.uniform(*arch["sim_age"]))
        reg = round(float(np.random.uniform(*arch["reg"])), 3)
        topup = round(float(np.random.uniform(*arch["topup"])), -2)
        stab = round(float(np.random.uniform(*arch["stab"])), 3)
        repaid = round(float(np.random.uniform(*arch["repaid"])), 3)
        wl = int(random.choice(arch["wl"]))
        c = {
            "id": f"CUST-{1000 + len(records) + 1}",
            "sim_age_months": sim_age,
            "topup_regularity": reg,
            "avg_monthly_topup_kz": topup,
            "spend_stability": stab,
            "airtime_loans_repaid_ratio": repaid,
            "wallet_level": wl,
        }
        c["rule_segment"] = assign_rule_based_segment(c)
        score_latent = -2.8 + 0.025 * sim_age + 2.8 * reg + 0.000018 * min(topup, 120000) + 2.4 * stab + 3.2 * (repaid - 0.5) + 0.35 * wl + np.random.normal(0, 0.45)
        c["outcome"] = "repaid on time" if np.random.rand() < (1.0 / (1.0 + np.exp(-score_latent))) else "paid late"
        records.append(c)

    return pd.DataFrame(records)

def train_and_save():
    df = generate_synthetic_data(500, seed=42)
    X = df[FEATURE_NAMES].values

    # 1. Scaler
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # 2. KMeans (k=10)
    k = len(SEGMENTS)
    kmeans = KMeans(n_clusters=k, random_state=42, n_init=15)
    cluster_labels = kmeans.fit_predict(X_scaled)
    df["cluster_id"] = cluster_labels

    # 3. Optimal Majority Bipartite Matching: Cluster -> Segment
    # Build contingency matrix of counts: contingency[cluster_i, segment_j]
    contingency = np.zeros((k, len(SEGMENTS)), dtype=int)
    for c_id, seg in zip(cluster_labels, df["rule_segment"]):
        seg_idx = SEGMENTS.index(seg)
        contingency[c_id, seg_idx] += 1

    # Maximize agreement using Hungarian algorithm
    row_ind, col_ind = linear_sum_assignment(-contingency)
    cluster_to_segment = {int(c): SEGMENTS[s] for c, s in zip(row_ind, col_ind)}

    # Map clusters to predicted segment codes
    df["ml_segment"] = df["cluster_id"].map(cluster_to_segment)

    # Compute agreement percentage
    agreed_count = (df["ml_segment"] == df["rule_segment"]).sum()
    agreement_pct = round(float(agreed_count / len(df) * 100), 1)

    # Compute confusion matrix [true_rule_segment][pred_ml_segment]
    confusion_table = []
    for true_seg in SEGMENTS:
        row = {"true_segment": true_seg}
        sub_df = df[df["rule_segment"] == true_seg]
        for pred_seg in SEGMENTS:
            row[pred_seg] = int((sub_df["ml_segment"] == pred_seg).sum())
        row["total"] = len(sub_df)
        confusion_table.append(row)

    # Cluster sizes
    cluster_sizes = []
    for c_id in range(k):
        mapped_seg = cluster_to_segment[c_id]
        count = int((df["cluster_id"] == c_id).sum())
        cluster_sizes.append({
            "cluster_id": c_id,
            "mapped_segment": mapped_seg,
            "count": count,
            "share_pct": round(count / len(df) * 100, 1),
        })

    # 4. KNN for Similar Customers (k=5)
    knn = NearestNeighbors(n_neighbors=5, metric="euclidean")
    knn.fit(X_scaled)

    # 5. Persist models and synthetic customers with joblib
    joblib.dump(scaler, os.path.join(MODELS_DIR, "scaler.joblib"))
    joblib.dump(kmeans, os.path.join(MODELS_DIR, "kmeans.joblib"))
    joblib.dump(knn, os.path.join(MODELS_DIR, "knn.joblib"))
    joblib.dump(cluster_to_segment, os.path.join(MODELS_DIR, "cluster_to_segment.joblib"))
    joblib.dump(df.to_dict(orient="records"), os.path.join(MODELS_DIR, "synthetic_customers.joblib"))

    metrics = {
        "agreement_pct": agreement_pct,
        "n_samples": len(df),
        "k_clusters": k,
        "segments": SEGMENTS,
        "cluster_sizes": cluster_sizes,
        "confusion_table": confusion_table,
        "cluster_to_segment": cluster_to_segment,
    }
    joblib.dump(metrics, os.path.join(MODELS_DIR, "metrics.joblib"))

    print(f"[ML Train] Successfully trained models on {len(df)} synthetic customers.")
    print(f"[ML Train] Agreement with old rule-based labels: {agreement_pct}%")
    for cs in cluster_sizes:
        print(f"  - Cluster {cs['cluster_id']} -> {cs['mapped_segment']}: {cs['count']} ({cs['share_pct']}%)")

    return metrics

if __name__ == "__main__":
    train_and_save()
