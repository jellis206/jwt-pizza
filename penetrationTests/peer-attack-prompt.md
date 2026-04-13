# Peer Attack Prompt — Marco Sotomarino's JWT Pizza

Copy everything below the line into a new Claude Code session.

---

I need you to execute a penetration test against my peer Marco Sotomarino's JWT Pizza deployment for our CS 329 (DevOps) deliverable at BYU. This is an authorized peer penetration test — both parties have agreed to participate as part of the course assignment. Marco's contact: marco97@byu.edu / 801-651-1440.

## Target Details

- **Frontend:** https://pizza.marcosotomarino.com
- **Backend API:** https://pizza-service.marcosotomarino.com
- **Factory:** https://pizza-factory.cs329.click
- **DB Host (leaked):** jwt-pizza-db.csdC8skiue7b.us-east-1.rds.amazonaws.com

## Pre-gathered Recon

Read the full recon report first:
- `/Users/jayellis/dev/byu/cs329/jwt-pizza/penetrationTests/recon-marco.md`

Also read our own vulnerability reports (Marco uses the same base codebase):
- `/Users/jayellis/dev/byu/cs329/jwt-pizza/penetrationTests/vulnerability-report-backend.md`
- `/Users/jayellis/dev/byu/cs329/jwt-pizza/penetrationTests/vulnerability-report-frontend.md`

### Confirmed intel (April 13, 2026):

**PATCHED (don't waste time on these):**
- All default accounts removed (`a@jwt.com`, `d@jwt.com`, `f@jwt.com`, `t@jwt.com`)
- Error messages unified (both wrong password and unknown user return same error)
- JWT secret changed from default (forgery fails with `dev-secret-key-change-in-production` and 10 other common secrets)

**CONFIRMED VULNERABLE:**
- SQL injection on `PUT /api/user/:userId` — `admin'-- ` in name field hits user ID 1 (privilege escalation)
- Unauthenticated `DELETE /api/franchise/:id` — 200 OK with no auth header
- Price manipulation on `POST /api/order` — accepts `price: 0.0001` and even `price: -100`
- Stack traces on all errors — reveals `/app/src/database/database.js:107`, Node.js, module paths
- DB host exposed in `GET /api/docs` config section
- CORS reflects arbitrary origins with `credentials: true`
- JWT tokens have no `exp` claim (never expire)
- No rate limiting on any endpoint
- `X-Powered-By: Express` present, no CSP/HSTS/X-Frame-Options

**NOT VULNERABLE:**
- Role injection via user update body — roles field ignored
- Chaos endpoint — returns 404
- Frontend — clean build, no coverage instrumentation

**Our test account:**
- `pentest2` / `pentest2@test.com` / `pentest123` — User ID 17, role: diner
- Re-login to get a fresh token before attacking

**Current state:**
- Menu: 5 items (IDs 2-6). Use **menuId 2** (Veggie, $0.0038) for order attacks.
- Franchises: 2 — "My Pizza Franchise" (ID 1, has store), "SLC" (ID 2, no stores).
  Use **franchise ID 2** ("SLC") as safe deletion target.

## Your Task

Execute **at least 5 distinct attacks** against Marco's deployment. Use curl, node scripts, or Burp Suite. Capture full request/response evidence for every attack.

### Attack Plan (prioritized — 5 required + 2 bonus)

1. **A03 Injection: SQL Injection** — `PUT /api/user/17` with `{"name":"admin'-- "}`. Documents privilege escalation + error-based SQL structure disclosure.
2. **A01 Broken Access Control: Unauth Franchise Deletion** — `DELETE /api/franchise/2` with no auth. Only delete franchise 2 ("SLC", no stores).
3. **A04 Insecure Design: Free Pizza** — `POST /api/order` with `price: 0.0001`. Also try `price: -100`.
4. **A05 Security Misconfiguration: Info Disclosure** — Combine: leaked DB host in `/api/docs`, stack traces, `X-Powered-By`, missing headers, CORS reflection.
5. **A02 Cryptographic Failures: JWT Forgery + No Expiry** — Forge admin token with default secret (will fail = severity 0). Document missing `exp` claim (severity 2).
6. **(Bonus) A07 Auth Failures: Brute Force via Burp** — Use Burp Suite Intruder on login endpoint to show no rate limiting.
7. **(Bonus) A05: CORS Exploitation** — Standalone CORS attack record with exploitation scenario.

## Output Format

For each attack, use this markdown table:

```markdown
| Item           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| Date           | [date]                                                        |
| Target         | pizza-service.marcosotomarino.com                             |
| Classification | [OWASP category]                                              |
| Severity       | [0-4]                                                         |
| Description    | [What you did, what happened, why it matters]                 |
| Images         | See below                                                     |
| Corrections    | [What code change would fix this]                             |
```

Write all attack records to `/Users/jayellis/dev/byu/cs329/jwt-pizza/penetrationTests/peerAttackRecords.md`.

## Important Notes
- Re-login as pentest2 first to get a fresh token. If deleted, register pentest3.
- Be careful with destructive tests. Only delete empty franchises (never ID 1).
- Document EVERYTHING including failed attacks (severity 0).
- The SQL injection modifies ALL users' names (no WHERE clause) — note this in your documentation.
- After all attacks, add a summary section listing patched vs. unpatched vulnerabilities.
