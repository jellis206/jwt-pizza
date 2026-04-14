# Self-Attack Prompt for JWT Pizza Penetration Testing

Copy everything below the line into a new Claude Code session.

---

I need you to execute a penetration test against my own JWT Pizza deployment and produce attack records for my CS 329 deliverable. My deployment details:

- **Frontend:** https://pizza.urjellis.com (assumed — adjust if different)
- **Backend API:** https://pizza-service.urjellis.com
- **Pizza Factory:** https://pizza-factory.cs329.click

## Context

Read the full vulnerability reports first:

- `/Users/jayellis/dev/byu/cs329/jwt-pizza/penetrationTests/vulnerability-report-frontend.md`
- `/Users/jayellis/dev/byu/cs329/jwt-pizza/penetrationTests/vulnerability-report-backend.md`

These contain the results of a prior static code review identifying ~50 vulnerabilities across the frontend and backend.

## Your task

Execute **at least 5 distinct attacks** against my live deployment, each targeting a different OWASP Top 10 category. For each attack, you should actually run the attack (using curl, node scripts, or whatever tools you need) against my production URLs above, capture the results, and document them.

### Attacks to attempt (prioritized by impact)

**Attack 1 — A03 Injection: SQL Injection via PUT /api/user**

- Log in as a normal user first (register one if needed)
- Attempt SQL injection through the `email` or `name` field on `PUT /api/auth` then `PUT /api/user/{id}`
- Try payloads like: `' OR '1'='1`, `'; SELECT * FROM user; --`, union-based extraction
- Document what data you can extract or what errors reveal

**Attack 2 — A01 Broken Access Control: Unauthenticated Franchise Deletion**

- First, GET /api/franchise to see existing franchises
- Then attempt `DELETE /api/franchise/{id}` with NO Authorization header
- Document whether it succeeds (create a test franchise first via admin so we have something safe to delete)

**Attack 3 — A04 Insecure Design: Order Pizza for $0**

- Log in, get the menu via `GET /api/order/menu`, get franchise list
- Submit a POST /api/order with `price: 0` for all items
- Document whether the order succeeds and what the JWT pizza verification response looks like

**Attack 4 — A07 Authentication Failures: Default Admin Credentials**

- Attempt to log in with `a@jwt.com` / `admin`
- If it works, document what admin capabilities are available
- Attempt brute force by trying common passwords against known email addresses

**Attack 5 — A02 Cryptographic Failures: JWT Forgery**

- Try signing a forged admin JWT using the default secret `dev-secret-key-change-in-production`
- Use the forged token to access admin-only endpoints
- Also try the `alg: none` attack against token verification

**Attack 6 — A07 Authentication Failures: Burp Suite Brute-Force**

- This attack uses Burp Suite (required by the Burp Suite prerequisite exercise) rather than curl
- Open Burp Suite Community Edition, open its built-in browser, and navigate to your JWT Pizza login page
- Intercept the login request via Proxy, then send it to Intruder
- Mark the password field as the injection point and load a wordlist (e.g., admin, password, 123456, pizza, test, letmein, etc.)
- Run the Sniper attack and identify successful logins by response length difference
- Take screenshots of: the intercepted request, the Intruder payload config, and the results window showing a successful hit
- This demonstrates the lack of rate limiting and account lockout on the login endpoint

**Bonus attacks if time permits:**

- A05 Security Misconfiguration: Check if `window.__coverage__` is exposed on the production frontend, probe `/api/docs` for leaked config
- A01: CORS exploitation — craft a request from a different origin with credentials
- Stack trace harvesting from error responses

### Output format

For each attack, produce a record in this exact markdown table format:

```markdown
| Item           | Result                                                                                 |
| -------------- | -------------------------------------------------------------------------------------- |
| Date           | April 11, 2026                                                                         |
| Target         | pizza-service.urjellis.com                                                             |
| Classification | [OWASP category]                                                                       |
| Severity       | [0-4]                                                                                  |
| Description    | [What you did and what happened]                                                       |
| Images         | [Paste the raw curl output or script output as a code block — this serves as evidence] |
| Corrections    | [What code change would fix this]                                                      |
```

Write all attack records to `/Users/jayellis/dev/byu/cs329/jwt-pizza/penetrationTests/selfAttackRecords.md`.

### Important notes

- Create a test user for attacks — don't rely solely on the default accounts in case credentials were changed
- If an attack fails against production (meaning the vuln was already patched), document it as severity 0 with what you tried
- Be methodical — show your work with actual curl commands and responses
- After documenting attacks, list specific code fixes I should make to harden my deployment
