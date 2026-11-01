# Optional advanced extension: demand forecasting (NOT implemented; core app works without it)
**Idea:** forecast next-30-day units per product to suggest reorder quantities.
**Data needed:** daily units sold per product for at least 1-2 years (the demo seed has only ~6 months of *synthetic* data, so it cannot validate a model); consistent stock-out flags (zero sales while out of stock is censored demand, not zero demand).
**Method (keep it simple):** baselines first - last-period value, 4-week moving average, same-weekday average - then one model such as exponential smoothing (Holt-Winters) via a small separate script that reads the daily-sales SQL result.
**Evaluation:** time-ordered split (train on the past, test on the most recent weeks, never shuffle); compare MAE and MAPE/WAPE against the baselines; report per-product and aggregate. Claim improvement only if it beats the best baseline on held-out data.
**Limitations:** promotions, price changes, new products and stock-outs distort demand; small shops have sparse, noisy series; forecasts need regular re-checking.
