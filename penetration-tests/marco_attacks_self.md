# Self-Attack Records — Marco Attacks Marco

**Tester:** Marco Sotomarino
**Date:** April 11–13, 2026
**Target:** pizza-service.marcosotomarino.com / pizza.marcosotomarino.com

---

## Attack 1 — Unauthenticated Franchise Deletion

<table>
  <tr><td><b>Item</b></td><td><b>Result</b></td></tr>
  <tr><td>Date</td><td>April 13, 2026</td></tr>
  <tr><td>Target</td><td>pizza-service.marcosotomarino.com</td></tr>
  <tr><td>Classification</td><td>A01 Broken Access Control</td></tr>
  <tr><td>Severity</td><td>4</td></tr>
  <tr><td>Description</td><td>Sent an unauthenticated <code>DELETE</code> request to <code>/api/franchise/1</code> using Burp Repeater with no <code>Authorization</code> header. The server processed the request successfully and deleted the franchise. The endpoint does not enforce authentication or authorization checks, allowing any user to perform destructive actions.</td></tr>
  <tr><td>Images</td><td>See below</td></tr>
  <tr><td>Corrections</td><td>Require authentication and enforce admin role authorization before allowing franchise deletion.</td></tr>
</table>

<img src="images/self_unauth_franchise_delete.png" alt="Burp Repeater — unauthenticated DELETE franchise request succeeds" width="700">

---

## Attack 2 — Client-Side Price Manipulation

<table>
  <tr><td><b>Item</b></td><td><b>Result</b></td></tr>
  <tr><td>Date</td><td>April 13, 2026</td></tr>
  <tr><td>Target</td><td>pizza-service.marcosotomarino.com</td></tr>
  <tr><td>Classification</td><td>A04 Insecure Design</td></tr>
  <tr><td>Severity</td><td>3</td></tr>
  <tr><td>Description</td><td>Changed the <code>price</code> field of the order items to <code>0.0001</code> using Burp Repeater. The server accepted the request and processed the order using the manipulated prices instead of validating them against the menu. The backend trusts client-side input for pricing, allowing attackers to purchase items at arbitrary prices.</td></tr>
  <tr><td>Images</td><td>See below</td></tr>
  <tr><td>Corrections</td><td>Do not trust client-provided pricing. The backend should retrieve the correct price from the database using the <code>menuId</code> and ignore any price sent by the client.</td></tr>
</table>

<img src="images/self_price_manipulation.png" alt="Burp Repeater — order accepted with manipulated price of 0.0001" width="700">

---

## Attack 3 — Stack Trace Information Disclosure

<table>
  <tr><td><b>Item</b></td><td><b>Result</b></td></tr>
  <tr><td>Date</td><td>April 13, 2026</td></tr>
  <tr><td>Target</td><td>pizza-service.marcosotomarino.com</td></tr>
  <tr><td>Classification</td><td>A05 Security Misconfiguration</td></tr>
  <tr><td>Severity</td><td>2</td></tr>
  <tr><td>Description</td><td>Sent a malformed request to <code>PUT /api/auth</code> by replacing the JSON body with invalid input. The server responded with a detailed error message including a full stack trace and internal file paths. This reveals sensitive implementation details such as framework usage and backend structure, which can aid an attacker in further exploitation.</td></tr>
  <tr><td>Images</td><td>See below</td></tr>
  <tr><td>Corrections</td><td>Do not expose stack traces in production. Replace detailed error responses with generic error messages and log the full error internally on the server.</td></tr>
</table>

<img src="images/self_stack_trace_disclosure.png" alt="Burp Repeater — malformed auth request returns full stack trace" width="700">

---

## Attack 4 — CORS Misconfiguration

<table>
  <tr><td><b>Item</b></td><td><b>Result</b></td></tr>
  <tr><td>Date</td><td>April 13, 2026</td></tr>
  <tr><td>Target</td><td>pizza-service.marcosotomarino.com</td></tr>
  <tr><td>Classification</td><td>A05 Security Misconfiguration</td></tr>
  <tr><td>Severity</td><td>3</td></tr>
  <tr><td>Description</td><td>Sent a request to <code>GET /api/franchise</code> with a malicious <code>Origin</code> header (<code>https://evil-attacker.com</code>). The server responded by reflecting the origin in the <code>Access-Control-Allow-Origin</code> header and allowed credentials. The backend does not properly restrict trusted origins and allows any external site to make authenticated requests.</td></tr>
  <tr><td>Images</td><td>See below</td></tr>
  <tr><td>Corrections</td><td>Restrict CORS to trusted domains only. Do not dynamically reflect the <code>Origin</code> header. Disable <code>Access-Control-Allow-Credentials</code> unless absolutely necessary.</td></tr>
</table>

<img src="images/self_cors_misconfiguration.png" alt="Burp Repeater — evil origin reflected in CORS response headers" width="700">

---

## Attack 5 — Brute Force Login (No Rate Limiting)

<table>
  <tr><td><b>Item</b></td><td><b>Result</b></td></tr>
  <tr><td>Date</td><td>April 13, 2026</td></tr>
  <tr><td>Target</td><td>pizza-service.marcosotomarino.com</td></tr>
  <tr><td>Classification</td><td>A07 Identification and Authentication Failures</td></tr>
  <tr><td>Severity</td><td>2</td></tr>
  <tr><td>Description</td><td>Used Burp Intruder to perform a brute force attack on the <code>PUT /api/auth</code> endpoint by testing multiple password values. The server allowed repeated login attempts without rate limiting or account lockout, enabling password guessing. The authentication mechanism does not prevent automated attacks, allowing an attacker to eventually gain unauthorized access to accounts.</td></tr>
  <tr><td>Images</td><td>See below</td></tr>
  <tr><td>Corrections</td><td>Implement rate limiting and account lockout mechanisms to mitigate brute force attacks. Additionally, monitor for suspicious login patterns to identify and respond to automated exploitation attempts.</td></tr>
</table>

<img src="images/self_brute_force_login.png" alt="Burp Intruder — multiple login attempts with no rate limiting" width="700">

---

## Attack 6 — Invalid Menu ID Error Handling

<table>
  <tr><td><b>Item</b></td><td><b>Result</b></td></tr>
  <tr><td>Date</td><td>April 11, 2026</td></tr>
  <tr><td>Target</td><td>pizza.marcosotomarino.com</td></tr>
  <tr><td>Classification</td><td>A05 Security Misconfiguration</td></tr>
  <tr><td>Severity</td><td>1</td></tr>
  <tr><td>Description</td><td>Modified the <code>menuId</code> field in a <code>POST /api/order</code> request to an invalid value (<code>9999</code>). The server responded with a <code>500 Internal Server Error</code> and exposed internal stack trace details. This indicates improper input validation and error handling, revealing backend implementation details that could be leveraged by an attacker.</td></tr>
  <tr><td>Images</td><td>See below</td></tr>
  <tr><td>Corrections</td><td>Validate all input before processing and return user-friendly error messages. Ensure that stack trace exposure is disabled in production environments to prevent sensitive information disclosure.</td></tr>
</table>

<img src="images/self_invalid_menuid_error.png" alt="Burp Repeater — invalid menuId triggers 500 with stack trace" width="700">

---

## Summary of Findings

| #   | Attack                          | OWASP Category                            | Severity | Exploitable? |
| --- | ------------------------------- | ----------------------------------------- | -------- | ------------ |
| 1   | Unauthenticated Franchise Delete | A01 Broken Access Control                | 4        | YES          |
| 2   | Client-Side Price Manipulation  | A04 Insecure Design                       | 3        | YES          |
| 3   | Stack Trace Info Disclosure     | A05 Security Misconfiguration             | 2        | YES          |
| 4   | CORS Misconfiguration           | A05 Security Misconfiguration             | 3        | YES          |
| 5   | Brute Force Login               | A07 Identification and Authentication Failures | 2   | YES          |
| 6   | Invalid Menu ID Error Handling  | A05 Security Misconfiguration             | 1        | YES          |

## Recommended Fixes

### Critical

1. **Auth Middleware on Franchise Deletion** (`franchiseRouter.js`): Add authentication and admin role authorization to the `DELETE /api/franchise/:franchiseId` endpoint to prevent anonymous destructive actions.

### High

2. **Server-Side Price Validation** (`orderRouter.js`): Retrieve correct prices from the database using the `menuId` instead of trusting client-provided values.
3. **CORS Allowlist** (`config.js`): Restrict `Access-Control-Allow-Origin` to trusted production domains. Do not reflect arbitrary `Origin` headers.

### Medium

4. **Suppress Stack Traces** (`app.js`): Return generic error messages in production and log detailed errors server-side only.
5. **Rate Limiting on Login** (`authRouter.js`): Add rate limiting or progressive delays on `PUT /api/auth` to prevent brute force password guessing.

### Low

6. **Input Validation for Menu IDs** (`orderRouter.js`): Validate `menuId` against the database and return `400 Bad Request` for invalid IDs instead of letting a `500` propagate.
