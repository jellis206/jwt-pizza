# Reconnaissance Report: Marco Sotomarino's JWT Pizza

**Target:** https://pizza.marcosotomarino.com (frontend), https://pizza-service.marcosotomarino.com (backend API)
**Date:** April 13, 2026 (third recon — original April 11, updated April 12, refreshed April 13)
**Contact:** marco97@byu.edu / 801-651-1440

---

## Infrastructure

- **Backend:** Express (leaked via `X-Powered-By: Express` header)
- **Database:** AWS RDS — `jwt-pizza-db.csdC8skiue7b.us-east-1.rds.amazonaws.com` (leaked via `/api/docs`)
- **Factory:** `https://pizza-factory.cs329.click`
- **API Version:** `00010101.010101`
- **Frontend Version:** `20000101.000000` (from `/version.json`)
- **Frontend:** React SPA served via **CloudFront / S3** (headers: `server: AmazonS3`, `x-cache: RefreshHit from cloudfront`)
- **Frontend last modified:** April 9, 2026
- **Container root:** `/app/` (from stack trace)
- **Node.js dependencies:** body-parser, raw-body, express, mysql2 (from stack traces)

## Key Findings (All Confirmed April 13)

### 1. Default Accounts — ALL Removed (PATCHED)

Marco removed every default account during his self-attack:
- `a@jwt.com` — "unknown user"
- `d@jwt.com` — "unknown user"
- `f@jwt.com` — "unknown user"
- `t@jwt.com` — "unknown user"

Default credential attacks will fail. Need SQL injection or JWT forgery for escalation.

### 2. Error Messages — Unified (PATCHED)

Both "unknown user" and "wrong password" return the same error message. User enumeration via error content is blocked. Timing-based enumeration may still be possible (bcrypt comparison vs. immediate rejection).

### 3. SQL Injection — CONFIRMED VULNERABLE

`PUT /api/user/:userId` uses string concatenation. Injecting `admin'-- ` in the `name` field comments out the WHERE clause. The UPDATE hits user ID 1 instead of the authenticated user. Server returns a JWT for user ID 1 — privilege escalation.

Error-based injection reveals: MySQL database, table `user`, columns `id, name, email, password`, file path `/app/src/database/database.js`.

### 4. Unauthenticated Franchise Deletion — CONFIRMED VULNERABLE

`DELETE /api/franchise/:franchiseId` requires NO authentication. Any anonymous request returns 200 with `{"message":"franchise deleted"}`.

Note: `POST /api/franchise` DOES require auth + admin role (403 for non-admin). Store deletion also requires auth (401). Only the franchise DELETE is unprotected.

### 5. Price Manipulation — CONFIRMED VULNERABLE

Server accepts any client-supplied price including:
- Zero/near-zero prices: `"price": 0.0001` — accepted, factory issues valid JWT
- **Negative prices:** `"price": -100` — also accepted! Factory issues valid JWT

No server-side price validation against the menu table.

### 6. JWT Forgery — PATCHED (Secret Changed)

Default secret `dev-secret-key-change-in-production` is **rejected** by the server. Also tested 10 common secrets (secret, password, changeme, pizza, etc.) — all rejected. Marco is using a strong/custom JWT secret.

### 7. JWT Expiry — VULNERABLE (No exp Claim)

Tokens contain `iat` only, no `exp`. Tokens never expire. A stolen token is valid forever.

### 8. Stack Traces — CONFIRMED VULNERABLE

All error responses include full Node.js stack traces:

Auth errors reveal:
```
/app/src/database/database.js:107
/app/src/routes/authRouter.js:110
```

JSON parse errors reveal:
```
/app/node_modules/body-parser/lib/types/json.js:169
/app/node_modules/body-parser/lib/read.js:128
/app/node_modules/raw-body/index.js:238
```

Franchise auth errors reveal:
```
/app/src/routes/franchiseRouter.js:114
/app/src/endpointHelper.js:9
/app/src/routes/authRouter.js:81
```

### 9. CORS — CONFIRMED VULNERABLE

API endpoints reflect ANY `Origin` header with `Access-Control-Allow-Credentials: true`.

Note: the root endpoint (`/`) returns `access-control-allow-origin: *` (wildcard), but all `/api/*` endpoints reflect the exact origin.

### 10. Database Host — CONFIRMED VULNERABLE

`GET /api/docs` is publicly accessible. Config section reveals:
```json
{
  "factory": "https://pizza-factory.cs329.click",
  "db": "jwt-pizza-db.csdC8skiue7b.us-east-1.rds.amazonaws.com"
}
```

### 11. Missing Security Headers — CONFIRMED

**Backend:**
- `X-Powered-By: Express` present (info leak)
- No `Content-Security-Policy`
- No `Strict-Transport-Security`
- No `X-Frame-Options`
- No `X-Content-Type-Options`

**Frontend:**
- `server: AmazonS3` exposed
- No CSP, HSTS, X-Frame-Options

### 12. No Rate Limiting

Registration, login, and order endpoints have no rate limiting, CAPTCHA, or account lockout. Brute force attacks are feasible.

### 13. Role Injection via User Update — FAILS

Sending `"roles":[{"role":"admin"}]` in the `PUT /api/user` request body does NOT escalate privileges. The roles field is ignored. Roles are stored in a separate `userRole` table, not modifiable via the user update endpoint.

### 14. Chaos Endpoint — NOT PRESENT

`GET /api/support/chaos` returns 404 "unknown endpoint". Not deployed.

### 15. Frontend — Clean Production Build

No `__coverage__`, `istanbul`, or `cov_` markers in the JS bundle.

## Current System State (April 13)

**Menu:** 5 items (unchanged)
```json
[
  {"id": 2, "title": "Veggie",          "price": 0.0038},
  {"id": 3, "title": "Margarita",       "price": 0.0014},
  {"id": 4, "title": "Crusty",          "price": 0.0024},
  {"id": 5, "title": "Charred Leopard", "price": 0.005},
  {"id": 6, "title": "Pepperoni",       "price": 0.0042}
]
```

**Franchises:** 2 remaining
```json
[
  {"id": 1, "name": "My Pizza Franchise", "stores": [{"id": 1, "name": "Main Store"}]},
  {"id": 2, "name": "SLC", "stores": []}
]
```

**Our test account:**
- pentest2 / pentest2@test.com / pentest123 — User ID 17, role: diner
- Token (no expiry): re-login to get fresh one

## Attack Surface Summary

| Vector                              | Status                   | Severity |
| ----------------------------------- | ------------------------ | -------- |
| SQL injection (PUT /api/user)       | **CONFIRMED VULNERABLE** | 4        |
| Unauth franchise deletion           | **CONFIRMED VULNERABLE** | 4        |
| Price manipulation (incl. negative) | **CONFIRMED VULNERABLE** | 3        |
| Stack trace leakage                 | **CONFIRMED VULNERABLE** | 2        |
| DB host exposure (/api/docs)        | **CONFIRMED VULNERABLE** | 2        |
| CORS origin reflection              | **CONFIRMED VULNERABLE** | 3        |
| No JWT expiry                       | **CONFIRMED VULNERABLE** | 2        |
| Missing security headers            | **CONFIRMED VULNERABLE** | 1        |
| X-Powered-By leak                   | **CONFIRMED VULNERABLE** | 1        |
| No rate limiting                    | **CONFIRMED VULNERABLE** | 2        |
| Default admin credentials           | **PATCHED**              | 0        |
| JWT forgery (default secret)        | **PATCHED**              | 0        |
| Error message enumeration           | **PATCHED**              | 0        |
| Role injection via user update      | **NOT VULNERABLE**       | 0        |
| Chaos endpoint                      | **NOT PRESENT**          | N/A      |
| Coverage instrumentation            | **NOT PRESENT**          | N/A      |
