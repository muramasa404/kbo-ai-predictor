# KBO Prediction Model Design (2026-04-14)

## Summary
Build real prediction models for KBO games with three targets: win/loss probability, run differential, and total runs. Priorities: interpretability, T‑3h prediction timing, and **current season only** for training data.

## Goals
- Provide three outputs per game: win/loss probability, expected run differential, expected total runs.
- Ensure interpretability: stable feature importance and human‑readable explanations.
- Use T‑3h snapshot inputs only.
- Model training limited to the **current season**.

## Non‑Goals
- Pitch‑by‑pitch or tracking‑data models.
- Real‑time in‑game updates.
- Betting/odds integration.

## Constraints & Assumptions
- Data sources are those already defined in KBO specs and collectors.
- Feature availability at T‑3h is required; missing data must follow documented fallback rules.
- Prediction service runs in `apps/worker` and writes to existing `predictions` table (extend if needed).

## Architecture Overview
1) **Feature Store (DB)**
- Use `game_prediction_features` with `snapshotAt` fixed at T‑3h.
- Ensure the same features are used for training and serving.

2) **Model Training Pipeline (`packages/model`)**
- Extract training data from DB.
- Validate feature completeness and ranges.
- Train three models:
  - Win/Loss (classification)
  - Run Differential (regression)
  - Total Runs (regression)
- Prefer LightGBM or XGBoost for interpretability and feature importance.

3) **Model Registry**
- Store metadata in a `model_versions` table:
  - version, trained_at, data_range, feature_version, metrics
- Store model artifacts on disk (`models/`) or remote storage (S3) with versioned paths.

4) **Serving (`apps/worker`)**
- `PredictionService` loads a fixed model version and produces three outputs.
- Persist predictions + explanations for each game.

## Data & Feature Design
### Feature Groups (T‑3h snapshot)
- Team form: recent 5/10 win %, home/away, rank, recent runs for/against
- Starting pitcher: recent ERA/FIP/WHIP, rest days, season K‑BB%
- Lineup: projected OPS, recent OPS, availability penalty
- Bullpen/fatigue: 3‑7 day usage, travel/fatigue proxies
- Matchup proxies: handedness, indirect matchup features

### Missing Data Strategy
Follow the fallback rules in `KBO_feature_builder_spec.md`:
- If starter unknown → team average starter proxy
- If lineup unknown → recent most frequent lineup
- If pitch data missing → handedness or cluster‑proxy features

## Modeling Strategy (Interpretability First)
- Three separate tree models using the same feature set.
- Produce top‑N reasons per prediction using:
  - Gain importance (baseline)
  - SHAP (preferred if feasible)
- Store explanations in `predictions.top_reasons_json`.

## Evaluation & Validation
### Time‑aware validation
- Rolling window splits within the current season.
- Metrics:
  - Win/Loss: LogLoss, Brier
  - Run Differential: MAE/RMSE
  - Total Runs: MAE/RMSE
  - Interpretability: stability of top features across folds

## Batch Flow (T‑3h)
1) Generate T‑3h feature snapshots
2) Load model version
3) Predict win prob / run diff / total runs
4) Save predictions + explanations
5) Cache for API/web

## Risks & Mitigations
- **Sparse data early season** → use strong fallbacks, reduce feature set if needed.
- **Feature drift within season** → monitor metrics weekly, retrain as needed.
- **Interpretability noise** → use stable feature selection and pruning.

## Open Questions (Resolved)
- Targets: Win/Loss + Run Differential + Total Runs (confirmed)
- Timing: T‑3h (confirmed)
- Training range: current season only (confirmed)
