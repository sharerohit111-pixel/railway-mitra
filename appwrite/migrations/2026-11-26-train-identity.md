# Train movement report schema migration — train identity

Status: **PREPARED ONLY — NOT APPLIED TO THE CONNECTED APPWRITE PROJECT**

Database: `railway_mitra`  
Table: `train_movement_reports`  
Project: `6b070890000e2fca34fd`

## Why this migration is required

The current table has 13 columns and does not contain a train number/identity column. A movement report currently identifies a route, station, direction, movement and train type, but not which physical train produced the report. Reports from different trains could therefore be incorrectly correlated.

The proximity gate now fails closed unless the previous and current reports carry the same train number.

## Required schema change

Create one optional, queryable string column:

| Key | Type | Size | Required | Encrypted |
|---|---|---:|---|---|
| `trainNumber` | string | 10 | false | false |

Do not create an `alertEligible` column; the API derives it from the presence of a valid `trainNumber`.

Recommended index for future per-train queries:

- Key: `route_train_created_desc`
- Type: key
- Columns: `routeId ASC`, `trainNumber ASC`, `createdAtMs DESC`

The existing `route_created_desc` index should remain until query usage is reviewed.

## Compatibility and validation

- Existing rows remain valid with `trainNumber = null`; they are never eligible for proximity alerts.
- Passenger train numbers accept 4–6 digits.
- Goods identifiers accept 2–10 uppercase letters, digits or hyphens.
- Blank train number remains allowed for ordinary community display, but `alertEligible` is false.
- The existing required `speedKmh` column is retained for schema compatibility only. Its legacy nominal value must never be treated as measured train speed or used by the proximity engine.
- The proximity engine requires equal, non-empty previous/current train numbers before evaluating approach.

## Safe rollout order

1. Review this migration and approve a maintenance window.
2. Create the optional `trainNumber` column and recommended index in Appwrite.
3. Verify the new column is available using `tables_db_list_columns`.
4. Deploy the reviewed Appwrite function version that writes/reads `trainNumber`.
5. Verify old rows still list successfully and show as not alert-eligible.
6. Only after real report identity, chainage and direction checks pass should alert evaluation be connected.

## Rollback

1. Revert the Appwrite function to a version that does not read/write `trainNumber`.
2. Keep the optional column and collected values until a retention/export decision is made.
3. Do not delete the column as part of an immediate rollback.

No Appwrite production schema mutation or function deployment was performed while preparing this migration.
