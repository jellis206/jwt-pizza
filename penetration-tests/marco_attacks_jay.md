# Peer Attack Records — Marco Attacks Jay

**Tester:** Marco Sotomarino
**Date:** April 13, 2026
**Target:** pizza-service.urjellis.com / pizza.urjellis.com

---

## Attack 1 — Broken Access Control (Admin Endpoint)

<table>
  <tr><td><b>Item</b></td><td><b>Result</b></td></tr>
  <tr><td>Date</td><td>April 13, 2026</td></tr>
  <tr><td>Target</td><td>pizza.urjellis.com</td></tr>
  <tr><td>Classification</td><td>A01 Broken Access Control</td></tr>
  <tr><td>Severity</td><td>0</td></tr>
  <tr><td>Description</td><td>Attempted to perform an administrative action by replaying a <code>POST /api/franchise</code> request using a normal user JWT token in Burp Repeater. The request originally succeeded with an admin token, but when the token was replaced with a normal user token, the server correctly rejected the request.</td></tr>
  <tr><td>Images</td><td>See below</td></tr>
  <tr><td>Corrections</td><td>No corrections required. The backend correctly enforces role-based access control and prevents unauthorized users from executing admin-level operations.</td></tr>
</table>

<img src="images/burp_admin_access_control.png" alt="Burp Repeater — admin endpoint rejected with normal user token" width="700">

---

## Attack 2 — Client-Side Price Manipulation

<table>
  <tr><td><b>Item</b></td><td><b>Result</b></td></tr>
  <tr><td>Date</td><td>April 13, 2026</td></tr>
  <tr><td>Target</td><td>pizza.urjellis.com</td></tr>
  <tr><td>Classification</td><td>A04 Insecure Design / Input Validation</td></tr>
  <tr><td>Severity</td><td>0</td></tr>
  <tr><td>Description</td><td>Modified the <code>price</code> field in the order request body to <code>0.001</code> using Burp Repeater. The request was accepted by the server; however, the response showed that the backend recalculated and enforced the correct price instead of using the client-provided value.</td></tr>
  <tr><td>Images</td><td>See below</td></tr>
  <tr><td>Corrections</td><td>No corrections required. The backend correctly validates pricing by ignoring client-side values and recalculating prices server-side.</td></tr>
</table>

<img src="images/burp_price_manipulation.png" alt="Burp Repeater — price manipulation rejected by server" width="700">

---

## Attack 3 — Unauthenticated Request

<table>
  <tr><td><b>Item</b></td><td><b>Result</b></td></tr>
  <tr><td>Date</td><td>April 13, 2026</td></tr>
  <tr><td>Target</td><td>pizza.urjellis.com</td></tr>
  <tr><td>Classification</td><td>A07 Identification and Authentication Failures</td></tr>
  <tr><td>Severity</td><td>0</td></tr>
  <tr><td>Description</td><td>Removed the <code>Authorization</code> header using Burp Repeater to simulate an unauthenticated request. The server rejected the request with a <code>401 Unauthorized</code> response, indicating that authentication is properly required.</td></tr>
  <tr><td>Images</td><td>See below</td></tr>
  <tr><td>Corrections</td><td>No corrections required. The endpoint correctly enforces authentication and prevents unauthenticated access.</td></tr>
</table>

<img src="images/burp_no_auth_header.png" alt="Burp Repeater — request without auth header returns 401" width="700">

---

## Attack 4 — Invalid Menu ID (Improper Error Handling)

<table>
  <tr><td><b>Item</b></td><td><b>Result</b></td></tr>
  <tr><td>Date</td><td>April 13, 2026</td></tr>
  <tr><td>Target</td><td>pizza.urjellis.com</td></tr>
  <tr><td>Classification</td><td>A04 Insecure Design / Improper Input Handling</td></tr>
  <tr><td>Severity</td><td>1</td></tr>
  <tr><td>Description</td><td>Modified the <code>menuId</code> to an invalid value in Burp Repeater. The server responded with a <code>500 Internal Server Error</code> and a message indicating the ID was not found. While no sensitive internal information was exposed, the use of a 500 error suggests improper error handling for invalid input.</td></tr>
  <tr><td>Images</td><td>See below</td></tr>
  <tr><td>Corrections</td><td>The backend should validate input more robustly and return appropriate client error responses such as <code>400 Bad Request</code> instead of a <code>500 Internal Server Error</code>.</td></tr>
</table>

<img src="images/burp_invalid_menuid.png" alt="Burp Repeater — invalid menuId triggers 500 error" width="700">

---

## Attack 5 — Brute Force Login (No Rate Limiting)

<table>
  <tr><td><b>Item</b></td><td><b>Result</b></td></tr>
  <tr><td>Date</td><td>April 13, 2026</td></tr>
  <tr><td>Target</td><td>pizza.urjellis.com</td></tr>
  <tr><td>Classification</td><td>A07 Identification and Authentication Failures</td></tr>
  <tr><td>Severity</td><td>2</td></tr>
  <tr><td>Description</td><td>Used Burp Intruder to perform multiple login attempts against the <code>PUT /api/auth</code> endpoint by varying the password field while keeping the email constant. The system processed all requests without any noticeable delay, rate limiting, or account lockout, indicating that brute force protections are not implemented.</td></tr>
  <tr><td>Images</td><td>See below</td></tr>
  <tr><td>Corrections</td><td>Implement rate limiting, account lockout mechanisms, or progressive delays after multiple failed login attempts to prevent brute force attacks.</td></tr>
</table>

<img src="images/burp_brute_force_intruder.png" alt="Burp Intruder — multiple login attempts with no rate limiting" width="700">

---

## Summary of Findings

| #   | Attack                      | OWASP Category              | Severity | Exploitable?  |
| --- | --------------------------- | --------------------------- | -------- | ------------- |
| 1   | Admin Endpoint Access       | A01 Broken Access Control   | 0        | NO (defended) |
| 2   | Client-Side Price Tampering | A04 Insecure Design         | 0        | NO (defended) |
| 3   | Unauthenticated Request     | A07 Authentication Failures | 0        | NO (defended) |
| 4   | Invalid Menu ID Handling    | A04 Insecure Design         | 1        | YES           |
| 5   | Brute Force Login           | A07 Authentication Failures | 2        | YES           |

## Recommended Fixes

### Low Priority

1. **Input Validation** (`orderRouter.js`): Validate `menuId` against the database and return `400 Bad Request` for invalid IDs instead of letting a `500` propagate.
2. **Rate Limiting** (`authRouter.js`): Add rate limiting or progressive delays on the `PUT /api/auth` endpoint to prevent brute force password guessing.
