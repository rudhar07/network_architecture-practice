window.PAGE = {
 "num": 7,
 "title": "Economics of cloud tech",
 "summary": "Although this recording is filed as 'Economics of cloud tech', the session taught designing for failure. It builds a map of everything that can fail in a request (socket, DNS, connect, TLS, write, read, CDN hops, HTTP status codes), then teaches when to retry versus reattempt (idempotency, timeouts, 408/429/Retry-After) and how to retry safely: max attempts, exponential backoff and jitter to avoid thundering herds, plus circuit breakers. It ends with video-player retry policies, fallbacks and graceful degradation, and lessons from the 2021 Fastly outage.",
 "notes": [
  {
   "heading": "Where this lecture fits: from 'happy path' to designing for failure",
   "body": "Weeks 1-6 built a basic server and client, TCP/IP, server scaling techniques, nginx, the evolution of HTTP and CDNs. Each time the instructor said \"there will be failures, but we are not handling them yet\". This session is the one that handles them. (The recording is filed under \"Economics of cloud tech\", but the material taught is failure handling, retries and fallbacks. The cost material appears in the next session.)\n\nThe plan of the class:\n\n1. Build a **mind map of everything that can fail**, walking through the simple server and client from lecture 1 (socket, connect, write, read), then DNS, TLS, CDNs and HTTP.\n2. Decide **whether a failure is retriable at all**.\n3. Learn **how to retry** properly (max attempts, exponential backoff, jitter) and when to stop calling a sick upstream (**circuit breakers**).\n4. **Fallbacks and graceful degradation**: what to do when retrying will not help.\n\nMany examples are from video streaming (players, manifests, segments) because the final lecture designs a large-scale video system, and video uses more network than almost anything else.\n\nThe instructor's framing: you may never use a B-tree or Dijkstra at work, but you will use the internet every day, so this is the part to really learn. In real production code the business logic is often about **one tenth** of the error-handling code."
  },
  {
   "heading": "What can fail on the client: socket, DNS and connect",
   "body": "### socket()\n- Can fail if the process has **too many open file descriptors**. The usual per-process limit (`ulimit -n`) is **1024** by default.\n- The ~**65,000 ephemeral ports** is a different limit: it limits outgoing connections to the *same* destination IP:port. Connections to different destinations can reuse local ports, so you can have more.\n- This is a **transient** error: retry after some time (sockets may get freed), but also log and raise an alarm, because it means something is wrong. Today people often just restart the container, which cleans everything up.\n\n### htons() and friends\n- `htons` only swaps byte order. If it \"fails\", the CPU or memory is broken: a **catastrophic** failure; shut the machine down. (Bit flips from radiation are a real concern on satellites and Mars rovers, rarely on Earth.)\n\n### DNS lookup (before connect)\n- The name has no record at all (a random .com that does not exist).\n- The same network problems that hit connect (packet loss, no network, a firewall) also hit DNS. When your laptop is offline, Chrome usually shows **DNS_PROBE_FAILED**: the first thing that fails is DNS.\n- The **resolver is misconfigured or overwhelmed**. Many ISP resolvers are, which is why public resolvers like **8.8.8.8 (Google)** and **1.1.1.1 (Cloudflare)** and OpenDNS exist.\n- **Stale answers**: a resolver can hand out an old (non-authoritative) answer even after the TTL expired. The host behind that IP may be dead, so the next step fails with \"host unreachable\".\n- You can fake DNS locally by editing `/etc/hosts` (Linux/macOS) to map a name to any IP.\n\n### connect()\n- **Host unreachable**: wrong IP, no route, or the network is down.\n- **Firewall / security rules** block the IP or port. The usual first rule for a cloud instance: block everything except **80 and 443**, and allow **22** only from known IPs or VPCs.\n- **Nobody listening** on that port (e.g. nothing on 8080): the connection is refused.\n- **The server is out of resources**: too many open connections (the server's ulimit, not the port range).\n- **The handshake times out**: your SYN or its SYN-ACK was dropped on a flaky network. Mobile is worse than wired; Wi-Fi at the edge of coverage is bad too.\n- Connecting to a port below 1024 (80, 443) is **not** a failure for a client. Only *binding* to a privileged port needs root."
  },
  {
   "heading": "What can fail on write and read",
   "body": "### write()\n- **Packets are dropped** even though TCP retransmits. TCP gives up after a number of retries. **Beyond the lecture:** on Linux `net.ipv4.tcp_retries2` defaults to 15, which is roughly 15 minutes before an established connection is declared dead.\n- **Something shuts down mid-connection**: the server, any router on the path, your access point, or someone pulls the cable or turns off Wi-Fi.\n- **Rate limiting**: you wrote too much on one connection or sent too many requests (e.g. a calculator server allowing 10 questions per minute).\n- **Payload too large**: the server refuses or is overwhelmed by a huge body.\n- **Server business logic** decides to close the connection or stop reading.\n\n### read()\n- **Network lost mid-response** (common while downloading big files): a firewall appears, the ISP or router dies, the router overheats.\n- **Access denied**: business logic says you do not have access.\n- **Rate limited**: often this is where you find out. Good servers tell you explicitly.\n- **Server bug or crash**: your request crashed the server.\n- **Silent connection drop**: an overloaded or restarting server just drops the connection.\n\n### How failures show up to you\n| Where it failed | What you usually see |\n|---|---|\n| DNS / connect | DNS error, connect (dial) timeout, connection refused |\n| Writing the request | write timeout or a disconnect |\n| Waiting for or reading the response | read timeout or a disconnect |\n\nHigh-level libraries often hide this. Browser `fetch` and Axios just say \"timeout\" or \"network error\"; you cannot tell a DNS timeout from a read timeout. Lower-level clients (Java / Android) can tell them apart, so the instructor's teams **retry with Google or Cloudflare DNS** when the device's DNS fails. On the web that option does not exist. The higher-level your API, the less you can detect and handle."
  },
  {
   "heading": "CDN and TLS layers add more failure points",
   "body": "### CDNs\nA CDN adds hops: **client -> edge -> tiered cache (mid-tier) -> origin**. **Every hop can fail in every way listed above** (DNS, connect, write, read, restarts, silent drops). A CDN also adds its own failures:\n- Anycast or DNS steering sends you to a **misbehaving edge** (overloaded or restarting).\n- The edge serves **stale or wrong content** because of a bug or a bad configuration.\n- The edge cannot take the request (socket buffers full), so it drops it.\n\n### TLS (on top of TCP: all TCP errors still apply, plus new ones)\n- **Invalid certificate**: the certificate is for a different domain (certificates are issued per fully-qualified domain name), it has been tampered with, or it has **expired**.\n- **Protocol version mismatch**: e.g. the client offers TLS 1.1/1.2 but the server accepts only TLS 1.3.\n- **Cipher-suite mismatch**: no common cipher after the hello exchange.\n- **Certificate-pinning mismatch**: mobile apps used to ship with 2-3 pinned certificates and reject the server if it presented a different one. The instructor says pinning is dying out.\n- **Wrong clock**: set your machine's date into the past and most HTTPS sites fail, because the certificate looks not-yet-valid or expired.\n- **TLS handshake timeout**: a network problem underneath, not a certificate problem.\n\nWith **QUIC**, timeouts come from UDP/IP instead of TCP, but they still exist."
  },
  {
   "heading": "What can fail in HTTP",
   "body": "For most people the internet *is* HTTP, so its failures matter most.\n\n- **Version not supported**: either side can refuse 0.9, 1.0, 1.1, 2 or 3. **Beyond the lecture:** the odd-looking `PRI * HTTP/2.0` line the instructor mentioned is the **HTTP/2 connection preface**. An HTTP/1.x server that sees it fails to parse it.\n- **Missing required headers**: a custom secret header such as `X-Platform: <random key>` that the backend requires to block unofficial clients or to authenticate server-to-server calls (security by obscurity). Or a protocol rule: a POST needs `Content-Length` *or* chunked encoding, and sending both is an error.\n- **Auth failures**: **401** (origin) or **407** (proxy), or an HTML \"please log in\" page.\n- **404** (wrong path) and **403** (forbidden). Generally 4xx means *you* made a mistake: wrong header, wrong method (**405**), wrong auth, wrong path.\n- **5xx**: something is wrong on the server side: **502** bad gateway, **503** unavailable, **504** gateway timeout. A slow database, slow server or slow CDN shows up as a 504.\n- **CORS**: before a cross-origin request with credentials, the browser sends an **OPTIONS preflight**. If the server does not allow the origin (`Access-Control-Allow-Origin` etc.), the browser blocks the request.\n- **3xx redirect loops**: X redirects to Y, Y back to X... Chrome stops with \"too many redirects\". **Beyond the lecture:** Chrome's limit is about 20 redirects (`ERR_TOO_MANY_REDIRECTS`).\n- **1xx** means \"received, keep going\": nothing to handle. **2xx** (200, 204) is success.\n- All the TCP/TLS errors still apply underneath.\n\nPure business validation (passwords do not match, bad form input) is **not** this topic's concern.\n\n### The failure list in one place (not exhaustive)\nDNS resolution, TCP handshake, TLS handshake (certificate, key exchange, expiry), write, server processing or its upstream being slow, and read. The instructor has compiled about 95 such scenarios over the years, and no reference he has seen is complete."
  },
  {
   "heading": "Retry vs reattempt: classify before you retry",
   "body": "**Retry** = do *exactly the same thing again*. **Reattempt** (the instructor's own word; not a standard textbook term) = *change something first*, then try: refresh DNS, switch DNS provider, connect to a different IP, switch CDN, log in again (refresh the token), or ask for a lower bitrate.\n\nThe core question: **\"If I do this again, will anything be different? If not, what should I change first?\"**\n\nRetries are usually a setting in your HTTP library. Reattempts are custom logic you design, and they are never available out of the box. The instructor spent around three months redesigning the retry and reattempt logic of a large OTT video player.\n\n### Classification checklist\n1. **Where in the request lifecycle did it fail?** Before or during DNS, connect or the TLS handshake, *nothing has reached the server*, so it is always safe to retry.\n2. **Who is admitting fault?** 4xx (you) or 5xx (server)?\n3. **Is it idempotent?** Can I do this hundreds of times without side effects?\n4. **Is it transient?** Sockets, DNS and connect failures often recover.\n5. **Would a longer timeout fix it?**\n6. Is there an **alternate path** (other DNS, other CDN, other origin)?\n7. Is it an **upstream dependency** that could cascade? Then use a circuit breaker.\n8. If nothing works, show a **graceful fallback** (a placeholder image, alt text, a degraded page).\n\n### Timeouts: always set them yourself\n- Library defaults can be **30 seconds or 2 minutes**. If the response normally comes in 5 ms, wait maybe 1 s, then retry or fail. **Fail fast.**\n- **Connect timeout should be much shorter than read timeout.** Many people set them to the same value, which is a mistake.\n- Read timeouts should depend on the payload: a small text file needs a shorter one than a video segment.\n- The **Go default HTTP client has no timeout**. A misbehaving server can hang such clients forever, so good engineers configure their own dialer and client timeouts."
  },
  {
   "heading": "Should I retry? Stage by stage",
   "body": "| Failure | Retry? | Why / how |\n|---|---|---|\n| `socket()` fails | Yes, after a pause | Transient, since descriptors get freed; also alert |\n| DNS lookup fails or times out | Reattempt | Switch resolver (8.8.8.8 / 1.1.1.1) or CDN. Retrying the same broken resolver rarely helps, unless you are waiting for a new record to propagate |\n| `connect()` refused, no server | Usually no | Nothing will change. Re-resolve DNS and try a different IP |\n| `connect()` timed out (SYN lost) | Yes / reattempt | Flaky network. Do a fresh DNS resolution, maybe get a different IP |\n| TLS certificate / version / cipher error | **No** | Nothing changes until a certificate or config changes |\n| TLS handshake *timeout* | Yes | It is a network problem underneath |\n| Write fails *before the request was fully sent* | Yes | The server never got a complete request |\n| Write/read fails *after* the full request was sent | **Only if idempotent** | You cannot know whether the server (or a mid-tier) already processed it |\n| Read timeout / 5xx on GET | Yes | GET is idempotent |\n| 5xx / timeout on POST (payment, account creation) | **No** | It may already have been processed; send the error back to the user |\n| 429 Too Many Requests | Yes, **after `Retry-After`** | You are probably retrying too fast already |\n| 408 Request Timeout | Yes, even if not idempotent | The server says it could not even read your request, so it did not process it |\n| 401/403/404, CORS failure, geo-block | No (with exceptions) | Nothing changes unless you change auth, the request or location |\n\nMost retries happen at **read**: connects rarely fail (if they do, your connection is flaky, so reconnect), and clients spend most of their time waiting for and reading responses. A read retry means **reconnecting and resending**, so it is allowed only if the request is idempotent.\n\n### Exceptions where retrying a 404 makes sense\n- You just uploaded a file to S3, an eventually-consistent distributed store, and are checking for it: it *will* appear.\n- **Live video streaming**: the manifest is a small text file that is updated quickly, while the big segment files are still propagating through the distributed object store. A segment 404 during a live stream is worth retrying. A 404 on a normal web page is not, because the page will not reappear by itself.\n\nCDN mid-tiers should hold connections to **multiple origins** and retry idempotent requests on another one without even telling the client: \"don't respond to me with an error, just try the other one\"."
  },
  {
   "heading": "Idempotency, HTTP methods and compare-and-swap",
   "body": "An operation is **idempotent** if doing it many times has the same effect on the server as doing it once.\n\n| Method | Retry blindly? | Notes |\n|---|---|---|\n| GET | Yes | If a GET is not idempotent, the system is badly designed |\n| PUT | Usually yes | Replaces a resource with the same content |\n| DELETE | Yes | Deleting by ID again just gives \"already deleted / not found\" |\n| POST | **No, unless you know the system** | Creates things, transfers money, submits forms |\n\nA common interview trap is **POST vs PUT**. A practical definition: if repeating a POST changes nothing, why was it not a PUT?\n\n**Financial systems** do not blindly retry. They send the error back to the customer, or they use **compare-and-swap (CAS)**: every record has a **version**; a write says \"update from version N to N+1\". If the current version is no longer N (someone else, or your own earlier attempt, already wrote it), the write is rejected. This prevents duplicate writes and lost updates from multiple dashboards or retries.\n\n**Beyond the lecture:** another standard technique is an **idempotency key**: the client sends a unique ID with a POST, and the server stores the result per key, so a retried POST returns the stored result instead of charging twice. Payment APIs such as Stripe use this."
  },
  {
   "heading": "How to retry: max attempts, exponential backoff, jitter",
   "body": "The instructor said this is his favourite topic and that it will be on the quiz.\n\n### The naive (bad) loop\n```\nwhile (true) {\n  try { return fetch(url) } catch (e) { /* try again immediately */ }\n}\n```\nIt has three bugs:\n1. **No max count**: it retries forever.\n2. **No delay**: it hammers the server. A healthy server gets overloaded, or you get rate limited.\n3. **No jitter**: every client retries at the same moment.\n\n### The right policy\n- **Max attempts**: stop after N tries (2, 3 or even 30) and show the error. The exception is apps like Gmail and Slack: they retry without a max count, but they **tell the user** (\"retrying...\", \"trying again in 10 s\") and offer a **manual retry** button that is disabled for a while after each click.\n- **Exponential backoff**: `delay = min(cap, base * 2^attempt)`, e.g. 1, 2, 4, 8 s. The instructor's own policy is 1, 2, 4, 8 and then **stay at the 8 s cap** for about four more tries. Bases of 0.5 s or 0.2 s are fine too. It is `base * 2^n`, **not** `base^n`. He tried exponent 3, but it grows too fast, so he went back to 2.\n- **Jitter**: add a **uniformly random** component so clients spread out. For example, instead of exactly 2 s, wait anywhere in 0-2 s (\"full jitter\"), or 2 s plus a random 0-1 s.\n\n```\nattempt = 0\nwhile attempt < MAX_ATTEMPTS:\n    try: return do_request()\n    except RetriableError:\n        delay = min(CAP, BASE * 2 ** attempt)     # e.g. BASE = 0.2 s, CAP = 8 s\n        sleep(random.uniform(0, delay))           # jitter\n        attempt += 1\nraise GiveUp()\n```\nWith BASE = 0.2 s, the un-jittered delays are 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, then 8 (the cap).\n\n### Why all three matter\n- No max: infinite retries, with or without backoff.\n- No backoff (a fixed gap): servers and CDN edges never get time to recover.\n- No jitter: failures happen to everyone **at the same moment**, so even with backoff everyone retries **at the same moment**.\n\n### Thundering herd / stampede / cascade\nServers die, millions of clients retry together, the servers come back up and immediately die again. With **50 million** viewers online, one synchronized retry is **50 million requests per second**, which more than all the CDN edges in India *combined* can serve. It is very easy to **DDoS yourself**. The instructor once found his team had shipped **36 retries with no wait**."
  },
  {
   "heading": "Server hints: 429, 503 and 408",
   "body": "- **429 Too Many Requests**: you are rate limited. It usually comes with a **`Retry-After`** header, so retry after that time. Retrying sooner just gets you limited again. AI coding tools that show \"your limit resets at <time>\" are a friendly use of the same idea.\n- **503 Service Unavailable**: when configured for **planned maintenance**, it also sends `Retry-After`. An unplanned 503 usually does not.\n- **408 Request Timeout**: the server could not **read your request** in time. This is different from \"the server read it but its database was slow\" (which shows up as 504 or 5xx). Because the request was never processed, **you can retry it even if it is not idempotent**.\n\n### Custom error codes (used in industry, not in the RFCs)\n- The instructor has used **419** for years to mean \"your auth token expired, refresh it\". His clients understand it as \"refresh, then retry\" (a reattempt).\n- Specific codes for known cases, such as **geo-blocked users** (outside India, using a VPN), let the app show a clear message and let customer care answer quickly.\n- Give errors in different places different codes: the same 404 or timeout on a *manifest* and on a *segment* should be distinct codes, so you can see which happens most and break it down further.\n- **Do not** reuse 401, 403 or 429 for custom meanings: proxies and CDNs in between understand those and may act on them. Use unused numbers."
  },
  {
   "heading": "Circuit breakers",
   "body": "Needed when you have millions of users rather than thousands. Picture a service that talks to a database during a traffic spike: the database stops responding in time, and requests time out or disconnect. You **already know** the upstream is unhealthy, so stop asking.\n\n**Open the circuit**: stop sending requests upstream (no current flows) and immediately return whatever fallback you would have returned after the failure. This lets the upstream recover and prevents **cascading failures** (a stampede is one kind of cascade).\n\n```\n          failures exceed threshold\n CLOSED ---------------------------------> OPEN  (fail fast, no upstream calls)\n   ^                                         |\n   | probe succeeds                          | after a wait (10/20/30 s)\n   |                                         v\n   +---------------------------------- HALF-OPEN (let a few probes through,\n          probe fails -> back to OPEN          e.g. 1 in 1000 requests)\n```\n- **You must implement the recovery probe.** People often write breakers that never close again.\n- How soon and how often to probe depends on the business, the workload, how many machines you have and your promises to customers.\n- A misleading side effect: there were maybe 10 real upstream failures, but customers see 1,000 errors because the circuit is open. The upstream team then says \"I only got 10 requests, I was never overwhelmed\". That is exactly because the breaker protected them.\n- Many services add a **response header or log line** saying \"answered without calling upstream; the circuit was open\".\n- Use them anywhere one service calls another: microservices, API gateways, load balancers, proxies, CDNs.\n\nCombine them with retries: \"I already tried 5 times, now I wait\" is a mini breaker."
  },
  {
   "heading": "Retries in a video player",
   "body": "A player is trickier, but also more forgiving, because **all its requests are idempotent GETs**. An API failure shows up as an exception or a 5xx. A player failure shows up as a spinner or even a **frozen frame**.\n\nOne OTT playback makes hundreds of requests: a **manifest** (a small text file), a **DRM licence key**, and many **video segments**. Each needs its own policy:\n- **Manifests** can be retried more often, with shorter intervals.\n- **DRM key**: do not hammer it hundreds of times.\n- **Segments** can be retried. In a **live** stream, a failing segment can even be **skipped**.\n- Fall back to a **lower bitrate** rendition when a segment download is slow or times out.\n- **Business errors** (invalid DRM key, unsupported device capabilities): no point retrying.\n- **Connect** retries can be faster and more numerous. **Read** retries need larger timeouts and longer gaps.\n- On DNS failure: retry, switch resolver, **or switch CDN** (the instructor's player works with about five CDNs).\n- Mobile users constantly switch Wi-Fi to 4G/5G or move between hotspots (home to car), so a segment GET retried after the switch often just works.\n- Do not retry silently for too long: tell users there is a network problem, as Gmail and Slack do, or they will blame your site.\n- Every player error has a **documented error code** with customer FAQs, so you can see which errors happen most.\n- **hls.js** (the open-source HLS player) since about v1.4 lets you configure retry policies separately for manifests and segments and per error type."
  },
  {
   "heading": "Fallbacks and graceful degradation",
   "body": "**Fallback** = when the ideal path cannot work, give a slightly worse but working experience *by design*. The AWS Builders' Library article \"Avoiding fallback in distributed systems\" argues against fallbacks, and it is right **for AWS's own infrastructure** (rarely exercised fallback paths can themselves fail). The instructor, working on consumer video, designs fallbacks most of the time. It is **domain-specific**.\n\nExamples from the lecture:\n- **DRM levels**: Widevine **L1** decrypts in hardware, **L3** in software. Studios forbid the top resolution on L3. Rather than refusing to play, play a lower resolution and explain it is a device limitation.\n- **Gmail on a slow network** (2G/3G) offers a basic HTML version with plain page loads instead of heavy AJAX/XHR. Google Sheets also degrades well.\n- **Codec fallback**: if the new **AV1** decoder fails (AV2 is the newest), fall back to **AVC (H.264)**: more bytes on the wire, but the video plays.\n- **Protocol fallback**: if the **MPEG-DASH** manifest (MPD) fails, try **HLS**.\n- **Ads fail, so skip the ad** and keep playing the content (which is why ad blockers work).\n- **Platform quirks**: on an iOS/tvOS AVPlayer \"media services were reset\" error, tear down and rebuild the player.\n- **Images**: if the large GIF fails, show a low-res JPEG/PNG, then a placeholder image, then alt text.\n- **Bitrate ladder**: 1080p timed out, so try 720p, then 540p...\n- **Network retries are easy; business retries are not**: never automatically pay again on a payment gateway.\n\n### Degradation levers at scale\n- Keep video streaming even if AWS has problems (you lose revenue, but the video works). Ask: can we still run video *and* make money if the AWS databases fail?\n- **Turn off the expensive parts**: with 20 trays on the home page and the database overheating, turn off 10 and the load halves. Turn off recommendations (deep ML models) and \"continue watching\", or serve **pre-cached** responses. Security is expensive too; do not turn it off lightly, but keep the option.\n- **Primary/backup**: every live video sends two copies to one CDN origin, another copy to a second CDN's origin, has a separate encoding pipeline used about once a year, and a satellite downlink used once in eight years. **Backups are insurance: they must cost much less than the primary.**\n- Example from AI tooling: if the primary hosted LLM is down, switch to a weaker local model.\n\n### Test your failure handling\n- **Chrome DevTools network throttling**: Fast 4G, 3G, offline, custom profiles with latency and packet loss.\n- **Charles Proxy** or **Proxyman**: inject delays and random errors."
  },
  {
   "heading": "Thundering herds and the Fastly outage",
   "body": "### A thundering herd without any failure\nDuring a big cricket match with about **70 million** viewers, the last ball is bowled and huge numbers go back to the **home page** at once (like everyone going to the washroom when a movie ends). Autoscaling based on current RPS or memory had shrunk the home-page fleet because nobody was on it. You must **pre-scale** for predictable herds.\n\n### Fastly outage (2021)\n- In June 2021 a configuration-triggered bug took Fastly down for roughly 50 minutes, taking many large sites with it.\n- About **85%** of requests returned errors, but about **15% still worked**, served from cache. They used **caches, circuit breakers, serve-stale and \"stale forever\"**.\n- The lesson: a distributed system (edges -> mid-tiers -> origins) can be **designed to fail partially**. Without that design you only ever see 0% or 100% working.\n- Fastly and Cloudflare both publish excellent **post-mortems (RCAs)**. Read them to learn how releases, circuit breakers and cascading failures play out.\n\n### LLM proxies\nProxies such as LiteLLM or Bifrost sit between you and upstream LLM APIs, and can convert protocols. The same rules apply: retries must not be so aggressive that they set your own system on fire."
  },
  {
   "heading": "Quick revision",
   "body": "- Business logic is often about one tenth of production error-handling code.\n- socket() fails from fd exhaustion (`ulimit -n`, default 1024). It is transient, so retry and alert.\n- The ~65k ephemeral ports limit connections per destination, not overall.\n- DNS fails from NXDOMAIN, network loss, a broken or overloaded ISP resolver, or stale answers. Fix: switch to 8.8.8.8 / 1.1.1.1.\n- connect fails from unreachable hosts, firewalls, no listener (refused), server connection limits, or lost SYNs.\n- TLS fails from a wrong-domain or expired certificate, version or cipher mismatch, pinning, or a bad clock. Do not retry unless it was a timeout.\n- 4xx = your fault (do not retry, with exceptions); 5xx = server's fault (retry if idempotent).\n- Retry = the same action again. Reattempt = change something (DNS, CDN, IP, token, bitrate) and try again.\n- Before the request is fully written, a retry is always safe. After it, retry only if idempotent.\n- GET, PUT and DELETE are idempotent; POST is not. Payments use compare-and-swap (versions) or idempotency keys.\n- Set timeouts yourself; connect timeout << read timeout. The Go default HTTP client has none.\n- A retry policy needs max attempts + exponential backoff (`base * 2^n`, capped) + uniform jitter.\n- No jitter means synchronized retries, a thundering herd, and DDoSing yourself.\n- 429 and maintenance 503 carry `Retry-After`. 408 is retriable even for POST.\n- A circuit breaker goes closed, then open (fail fast), then half-open (probe), then closed. Always implement the probe.\n- Players retry manifests, segments and DRM keys differently. A live-segment 404 is worth retrying (eventual consistency).\n- Custom codes (e.g. 419 = refresh token) are fine. Never overload 401, 403 or 429.\n- Graceful degradation: lower bitrate, AVC instead of AV1, HLS instead of DASH, skip ads, basic HTML Gmail, turn off recommendations.\n- Backups are insurance: cheaper than the primary.\n- Fastly 2021: about 15% kept working thanks to caches, serve-stale and circuit breakers."
  },
  {
   "heading": "Exam traps",
   "body": "- **\"Connecting to port 80 fails because it is privileged.\"** Wrong. Only *binding* to a port below 1024 needs root. Clients connect to 80 and 443 all the time.\n- **1024 vs 65,535**: 1024 is the default per-process **file-descriptor** limit; ~65k is the number of **ports**. They are different limits.\n- **Exponential backoff alone is not enough.** Without jitter, synchronized clients still retry together; without a max, they retry forever.\n- **Backoff formula**: `base * 2^attempt` (e.g. 0.2 * 2^2 = 0.8 s), **not** `base^attempt`.\n- **A read/write timeout on a POST is not safe to retry**: the server may already have processed it. A failure *before* the request was fully sent is safe.\n- **408 vs 504**: 408 = the server could not read your request (safe to retry). 504 = a gateway timed out waiting on an upstream that may have processed it.\n- **Not every 404 is final**: freshly uploaded objects and live-stream segments on eventually-consistent storage can appear moments later.\n- **TLS certificate errors are not retriable**; TLS *timeouts* are.\n- **A circuit breaker makes the upstream look healthy** (\"I only got 10 requests\") because it shields it. Without a probe it never recovers.\n- **Retry vs reattempt**: switching DNS provider or CDN is a reattempt, not a pure retry.\n- **Do not repurpose 401/403/429** for custom app meanings; intermediaries interpret them.\n- **Browser fetch/Axios cannot tell a DNS timeout from a read timeout**; Android/Java clients can.\n- **Fallbacks are domain-specific**: AWS argues against them for infrastructure, while consumer video designs for them."
  }
 ],
 "keyTerms": [
  {
   "term": "Transient failure",
   "def": "A failure that may go away by itself (fd exhaustion, flaky network, DNS hiccup), so a delayed retry can succeed."
  },
  {
   "term": "Catastrophic failure",
   "def": "A failure that means the machine itself is broken (e.g. htons failing); shut it down rather than retry."
  },
  {
   "term": "Retry",
   "def": "Repeating exactly the same request again."
  },
  {
   "term": "Reattempt",
   "def": "The instructor's term for changing something (DNS resolver, IP, CDN, token, bitrate) before trying again."
  },
  {
   "term": "Idempotent",
   "def": "Doing it N times has the same server-side effect as doing it once (GET, PUT, DELETE; not POST)."
  },
  {
   "term": "Compare-and-swap (CAS)",
   "def": "A versioned write that succeeds only if the record is still at the expected version; prevents duplicate or lost writes."
  },
  {
   "term": "Connect (dial) timeout",
   "def": "How long to wait to establish the TCP (and TLS) connection; should be short."
  },
  {
   "term": "Read timeout",
   "def": "How long to wait for response data after sending the request; longer, and depends on payload size."
  },
  {
   "term": "Exponential backoff",
   "def": "Retry delay grows as base x 2^attempt, usually up to a cap (e.g. 0.2, 0.4, 0.8 ... 8 s)."
  },
  {
   "term": "Jitter",
   "def": "A uniformly random component added to the retry delay so clients do not retry in lockstep."
  },
  {
   "term": "Max attempts",
   "def": "An upper bound on retries, after which the client gives up and shows an error."
  },
  {
   "term": "Thundering herd / stampede",
   "def": "Huge numbers of clients hitting a service at the same instant (synchronized retries, or everyone returning to the home page)."
  },
  {
   "term": "Cascading failure",
   "def": "One component's failure overloads its callers or dependents, which then fail in turn."
  },
  {
   "term": "Circuit breaker",
   "def": "Stops calling an upstream known to be unhealthy (open), fails fast, then probes (half-open) before closing again."
  },
  {
   "term": "Retry-After",
   "def": "A response header on 429 (or maintenance 503) telling the client when it may retry."
  },
  {
   "term": "408 Request Timeout",
   "def": "The server could not read the full request in time; safe to retry since nothing was processed."
  },
  {
   "term": "429 Too Many Requests",
   "def": "Rate-limited; back off, ideally until Retry-After."
  },
  {
   "term": "Fallback",
   "def": "A deliberately worse but working alternative path (lower bitrate, older codec, basic HTML UI)."
  },
  {
   "term": "Graceful degradation",
   "def": "Switching off expensive or non-essential features under stress so the core keeps working."
  },
  {
   "term": "Certificate pinning",
   "def": "The app ships with expected server certificates and rejects any other; now being phased out."
  },
  {
   "term": "Widevine L1 / L3",
   "def": "DRM security levels: L1 decrypts in hardware (top quality allowed), L3 in software (studios cap resolution)."
  },
  {
   "term": "Serve stale",
   "def": "A CDN/cache returns an expired copy when the origin fails, instead of an error."
  },
  {
   "term": "Post-mortem / RCA",
   "def": "A root-cause-analysis report published after an incident (e.g. by Fastly or Cloudflare)."
  }
 ],
 "mcqs": [
  {
   "q": "A client's socket() call starts failing with 'Too many open files'. What is the best classification and response?",
   "options": [
    "Catastrophic: shut the machine down immediately",
    "Permanent: the port range is exhausted, never retry",
    "Transient: retry after a delay, and log/alert because something is leaking or overloaded",
    "A DNS error: switch to 8.8.8.8"
   ],
   "answer": 2,
   "explanation": "fd exhaustion (ulimit -n, default 1024) is recoverable as descriptors get freed, so a delayed retry can work. It still deserves an alarm (or a container restart) because it signals a leak or overload.",
   "distractors": "Catastrophic is for things like htons failing; the 65k port range is a different limit; DNS is unrelated to socket().",
   "source": "lecture",
   "id": "L07-m1"
  },
  {
   "q": "Why can a client normally connect to port 443 without root, even though it is below 1024?",
   "options": [
    "The privileged-port rule applies only to binding/listening on a port, not to connecting to one",
    "Port 443 is exempt because it is used for TLS",
    "Clients always run as root on Linux",
    "The kernel maps 443 to an ephemeral port before connecting"
   ],
   "answer": 0,
   "explanation": "Only binding to a port below 1024 needs privileges; connecting to a remote port 80/443 is what every browser does.",
   "distractors": "There is no special TLS exemption, clients do not run as root, and the remote port is not remapped.",
   "source": "lecture",
   "id": "L07-m2"
  },
  {
   "q": "A server's response normally arrives within 5 ms. The HTTP library's default timeout is 2 minutes. What does the lecture recommend?",
   "options": [
    "Keep the default so slow responses are never cut off",
    "Disable timeouts and rely on TCP keepalive",
    "Set the connect and read timeouts to the same large value",
    "Set an explicit, much smaller timeout (e.g. ~1 s) and fail fast or retry"
   ],
   "answer": 3,
   "explanation": "Set timeouts yourself based on expected latency so you fail fast and can retry or fall back, instead of hanging for library defaults of 30 s to 2 min.",
   "distractors": "Identical connect/read timeouts and relying on defaults or keepalive are exactly the mistakes called out.",
   "source": "lecture",
   "id": "L07-m3"
  },
  {
   "q": "Which timeout pairing is most sensible for a video player?",
   "options": [
    "Connect 10 s, read 1 s",
    "Connect short (fast fail); read longer and sized to the payload (manifest < segment)",
    "Connect and read both 30 s",
    "No connect timeout; read timeout 1 s"
   ],
   "answer": 1,
   "explanation": "Connects should succeed quickly, so a short connect timeout fails fast. Reads take longer and depend on size: a small text manifest needs less time than a video segment.",
   "distractors": "Reversing them, equalizing them or omitting the connect timeout loses fast failure detection.",
   "source": "lecture",
   "id": "L07-m4"
  },
  {
   "q": "A client sent a complete POST /transfer request and then the connection dropped before any response. What should it do?",
   "options": [
    "Retry immediately; TCP guarantees the server did not process it",
    "Retry with exponential backoff and jitter",
    "Not blindly retry: the server may already have processed it. Surface the error or use a versioned/idempotent mechanism",
    "Switch DNS provider and resend"
   ],
   "answer": 2,
   "explanation": "Once the full request has been written you cannot know whether the server or a mid-tier processed it. Non-idempotent operations like transfers must not be blindly retried; use compare-and-swap or an idempotency key, or tell the user.",
   "distractors": "Backoff and DNS switching do not solve duplicate side effects, and TCP gives no such guarantee.",
   "source": "lecture",
   "id": "L07-m5"
  },
  {
   "q": "Which HTTP method is generally NOT safe to retry blindly?",
   "options": [
    "POST",
    "PUT",
    "DELETE",
    "GET"
   ],
   "answer": 0,
   "explanation": "GET, PUT and DELETE are idempotent by convention (DELETE again just gives 'already deleted'); POST usually creates something or has side effects.",
   "distractors": "The other three are idempotent under REST conventions.",
   "source": "lecture",
   "id": "L07-m6"
  },
  {
   "q": "Using delay = base x 2^attempt with base = 0.2 s, what is the un-jittered delay before the attempt with index 2 (attempts counted from 0)?",
   "options": [
    "0.04 s",
    "0.4 s",
    "1.6 s",
    "0.8 s"
   ],
   "answer": 3,
   "explanation": "0.2 x 2^2 = 0.2 x 4 = 0.8 s. The exponent is applied to 2, not to the base.",
   "distractors": "0.04 s is 0.2^2 (the mistake the instructor corrected live); 0.4 s is attempt 1 and 1.6 s is attempt 3.",
   "source": "lecture",
   "id": "L07-m7"
  },
  {
   "q": "Millions of clients use exponential backoff with a max-attempt limit but NO jitter. A server outage happens. What is the main remaining risk?",
   "options": [
    "Clients retry forever",
    "Clients still retry in lockstep, causing synchronized spikes (thundering herd) that can re-kill the recovering servers",
    "Retries become too slow to ever succeed",
    "TLS handshakes fail more often"
   ],
   "answer": 1,
   "explanation": "Everyone failed at the same moment, so everyone's 1 s, 2 s, 4 s retries also land at the same moments. Jitter spreads them out.",
   "distractors": "The max-attempt limit prevents infinite retries; slowness and TLS are not the issue.",
   "source": "lecture",
   "id": "L07-m8"
  },
  {
   "q": "A server returns 429 with 'Retry-After: 30'. What should a well-behaved client do?",
   "options": [
    "Retry immediately with a different User-Agent",
    "Treat it as permanent and never retry",
    "Wait about 30 s before retrying; retrying sooner just gets rate limited again",
    "Switch to POST so the rate limiter does not apply"
   ],
   "answer": 2,
   "explanation": "429 means rate limited and Retry-After says when the limit resets. Honour it.",
   "distractors": "Tricks to dodge the limiter or giving up entirely are wrong; 429 is explicitly retriable later.",
   "source": "lecture",
   "id": "L07-m9"
  },
  {
   "q": "Which status code can be retried even for a non-idempotent request, because the server says it never finished reading the request?",
   "options": [
    "408 Request Timeout",
    "504 Gateway Timeout",
    "500 Internal Server Error",
    "502 Bad Gateway"
   ],
   "answer": 0,
   "explanation": "408 means the server could not read your request in time, so it was not processed and repeating it is harmless.",
   "distractors": "504, 500 and 502 can happen after an upstream has already processed the request.",
   "source": "lecture",
   "id": "L07-m10"
  },
  {
   "q": "The TLS handshake fails because the server presents a certificate issued for a different domain. Should the client retry?",
   "options": [
    "Yes, with exponential backoff",
    "Yes, after switching DNS provider",
    "Yes, but only over QUIC",
    "No: unless the certificate or configuration changes, the result will be the same"
   ],
   "answer": 3,
   "explanation": "Certificate, version and cipher mismatches are deterministic. Only a TLS handshake timeout (a network problem underneath) is worth retrying.",
   "distractors": "Backoff, DNS changes or QUIC will not make an invalid certificate valid.",
   "source": "lecture",
   "id": "L07-m11"
  },
  {
   "q": "What is the key difference between a circuit breaker's OPEN and HALF-OPEN states?",
   "options": [
    "OPEN sends all traffic upstream; HALF-OPEN sends half",
    "OPEN fails fast without calling upstream; HALF-OPEN lets a few probe requests through to test recovery",
    "OPEN is for reads, HALF-OPEN for writes",
    "OPEN retries with jitter; HALF-OPEN without"
   ],
   "answer": 1,
   "explanation": "Open = stop calling the sick dependency and return the fallback immediately. After a wait, half-open lets probes through; success closes the circuit, failure re-opens it.",
   "distractors": "It is not a traffic percentage split by state, nor tied to reads/writes or jitter.",
   "source": "lecture",
   "id": "L07-m12"
  },
  {
   "q": "After a circuit breaker opened, the upstream team says 'we only received 10 requests, we were never overloaded'. What is the best explanation?",
   "options": [
    "The upstream is lying about its metrics",
    "The load balancer dropped the requests",
    "The breaker shielded the upstream: requests failed fast at the caller, so the upstream saw little traffic and could recover",
    "DNS cached a stale IP"
   ],
   "answer": 2,
   "explanation": "With the circuit open the caller stops sending requests, so customers see many errors while the upstream sees few. That shielding is the point of the breaker.",
   "distractors": "No lying, LB drop or DNS problem is needed to explain it.",
   "source": "lecture",
   "id": "L07-m13"
  },
  {
   "q": "During a LIVE HLS stream, a player gets a 404 for the newest segment listed in the manifest. What is the most reasonable action?",
   "options": [
    "Retry the segment shortly: the small manifest may be updated before the larger segment has propagated through eventually-consistent storage",
    "Treat it as permanent and stop playback",
    "Switch the request to POST",
    "Clear cookies and re-login"
   ],
   "answer": 0,
   "explanation": "In live streaming the manifest is updated quickly while segments are still being copied in an eventually-consistent store like S3, so a brief retry often succeeds. A 404 on a normal web page is not worth retrying.",
   "distractors": "Stopping playback, changing the method or re-authenticating do not address the propagation delay.",
   "source": "lecture",
   "id": "L07-m14"
  },
  {
   "q": "An app needs a custom status meaning 'access token expired, refresh it and retry'. Which choice follows the lecture's advice?",
   "options": [
    "Reuse 401 because it already means unauthorized",
    "Reuse 429 because the client must retry",
    "Return 200 with an error string in the body",
    "Use an otherwise-unused code (the instructor uses 419) that only your clients interpret"
   ],
   "answer": 3,
   "explanation": "Proxies and CDNs understand 401/403/429 and may act on them, so custom meanings should use unused codes, like the instructor's 419 for token refresh.",
   "distractors": "Overloading standard codes confuses intermediaries; a 200 hides the error from monitoring.",
   "source": "lecture",
   "id": "L07-m15"
  },
  {
   "q": "A device lacks Widevine L1 (hardware DRM) and only has L3. Which handling matches the lecture's 'fallback' philosophy?",
   "options": [
    "Refuse playback with 'device not supported'",
    "Play at a lower resolution permitted for L3 and explain it is a device limitation",
    "Retry the DRM licence request until L1 is detected",
    "Serve the highest resolution without DRM"
   ],
   "answer": 1,
   "explanation": "Studios forbid the top resolution on software (L3) decryption, so the graceful fallback is a lower resolution that still plays.",
   "distractors": "Refusing is unnecessary, retrying will not change the hardware, and dropping DRM breaks studio contracts.",
   "source": "lecture",
   "id": "L07-m16"
  },
  {
   "q": "About 70 million viewers watch the final ball of a match, and most then go to the home page. Home-page servers were autoscaled down because nobody was on them. What is this an example of?",
   "options": [
    "A cascading DNS failure",
    "TCP head-of-line blocking",
    "A thundering herd caused by user behaviour rather than a failure",
    "A redirect loop"
   ],
   "answer": 2,
   "explanation": "A huge synchronized burst of requests is a thundering herd even without any failure. Reactive autoscaling on RPS or memory is too slow, so you must pre-scale.",
   "distractors": "DNS, HOL blocking and redirects are unrelated.",
   "source": "lecture",
   "id": "L07-m17"
  },
  {
   "q": "In the 2021 Fastly outage, roughly 15% of requests still succeeded. What does the lecture take from this?",
   "options": [
    "The system was designed to fail partially: caches, serve-stale and circuit breakers kept some traffic working",
    "Fastly had no caches",
    "Clients switched to HTTP/1.0",
    "15% of users had VPNs"
   ],
   "answer": 0,
   "explanation": "A distributed CDN with edges, mid-tiers and origins plus serve-stale and breakers can degrade partially. Without that design you would only ever see 0% or 100% working.",
   "distractors": "The other options are not the stated mechanism.",
   "source": "lecture",
   "id": "L07-m18"
  },
  {
   "q": "Your Android app's DNS lookup fails, but you suspect the ISP resolver is broken. What does the lecture call switching to 8.8.8.8 or 1.1.1.1 and trying again, and can a browser fetch() do it?",
   "options": [
    "A pure retry; yes, fetch can choose resolvers",
    "A fallback to HTTP/3; no",
    "A circuit breaker; yes",
    "A reattempt (changing something before trying); fetch cannot choose resolvers and does not even expose a DNS-specific timeout"
   ],
   "answer": 3,
   "explanation": "Changing the resolver is a reattempt. Low-level clients (Android/Java) can detect DNS errors and switch resolvers; browser fetch/Axios only report a generic timeout.",
   "distractors": "It is not a pure retry or a circuit breaker, and browsers do not let pages pick resolvers.",
   "source": "lecture",
   "id": "L07-m19"
  },
  {
   "q": "Which statement about backup systems matches the lecture?",
   "options": [
    "A backup must be identical in cost and capacity to the primary",
    "Backups are insurance: they should be much cheaper than the primary, even if rarely used (e.g. a satellite downlink used once in eight years)",
    "Backups are unnecessary if you use a CDN",
    "Backups should handle 50% of traffic at all times"
   ],
   "answer": 1,
   "explanation": "Like insurance premiums, backup paths (second CDN origin, spare encoding pipeline, satellite) must cost far less than the primary while still existing for rare events.",
   "distractors": "Equal cost defeats the purpose; CDNs also fail (Fastly), and a fixed 50% split is not the idea.",
   "source": "lecture",
   "id": "L07-m20"
  }
 ],
 "short": [
  {
   "q": "Explain the difference between a retry and a reattempt, and give two examples of reattempts.",
   "checks": [
    {
     "label": "Retry = same request again",
     "patterns": [
      "same (request|action|thing|step)",
      "exactly the same",
      "identical"
     ]
    },
    {
     "label": "Reattempt = change something first",
     "patterns": [
      "chang",
      "different",
      "modif"
     ]
    },
    {
     "label": "Example: switch DNS resolver or re-resolve",
     "patterns": [
      "dns",
      "resolver"
     ]
    },
    {
     "label": "Second example: CDN / IP / token / bitrate",
     "patterns": [
      "cdn",
      "token",
      "bitrate",
      "\\bip\\b",
      "login",
      "resolution"
     ]
    }
   ],
   "modelAnswer": "A retry repeats exactly the same request or action again, hoping a transient problem (packet loss, a busy server) has passed.\nA reattempt first changes something about the request or path, because repeating it unchanged would give the same result. Examples: switching the DNS resolver to 8.8.8.8 / 1.1.1.1 or doing a fresh DNS resolution to get a different IP; switching to another CDN; refreshing an expired auth token (e.g. on a 419) and resending; requesting a lower bitrate rendition after a 1080p segment timed out.",
   "explanation": "The key idea is 'will anything be different if I do it again?'. A reattempt changes the path or the request.",
   "id": "L07-s1"
  },
  {
   "q": "Design a client retry policy for a service with millions of clients. Name the three essential ingredients and explain what goes wrong if each is missing.",
   "checks": [
    {
     "label": "Max attempts / limit",
     "patterns": [
      "max(imum)? (attempt|retr|count)",
      "limit"
     ]
    },
    {
     "label": "Exponential backoff",
     "patterns": [
      "exponential",
      "backoff",
      "back-off"
     ]
    },
    {
     "label": "Jitter / randomness",
     "patterns": [
      "jitter",
      "random"
     ]
    },
    {
     "label": "Thundering herd / synchronized retries / self-DDoS",
     "patterns": [
      "thundering",
      "herd",
      "stampede",
      "same (time|moment)",
      "ddos",
      "lockstep",
      "synchroni"
     ]
    }
   ],
   "modelAnswer": "1. Max attempts: cap the number of retries (e.g. 5) and then show an error or a manual retry button. Without it clients retry forever.\n2. Exponential backoff: delay = min(cap, base * 2^attempt), e.g. 0.2, 0.4, 0.8 ... up to 8 s. Without it a fixed or zero gap hammers the servers and gives them no time to recover, and rate limits kick in.\n3. Jitter: randomize each delay uniformly (e.g. sleep(random(0, delay))). Without it every client that failed at the same moment retries at the same moments, a thundering herd. With 50 million users that is 50 million requests per second, so you DDoS yourself.\nAlso honour Retry-After on 429/503, retry only retriable or idempotent requests, and tell the user you are retrying.",
   "explanation": "The examiner wants all three (max, backoff, jitter) and the thundering-herd reasoning.",
   "id": "L07-s2"
  },
  {
   "q": "When is it safe to retry a failed HTTP request? Discuss where it failed and the method used.",
   "checks": [
    {
     "label": "Before the request was fully sent / at DNS, connect or TLS it is safe",
     "patterns": [
      "before",
      "not (yet )?(fully )?(sent|written)",
      "connect",
      "handshake"
     ]
    },
    {
     "label": "Idempotency matters",
     "patterns": [
      "idempoten"
     ]
    },
    {
     "label": "GET/PUT/DELETE OK",
     "patterns": [
      "\\bget\\b",
      "\\bput\\b",
      "delete"
     ]
    },
    {
     "label": "POST / payments not safe",
     "patterns": [
      "post",
      "payment"
     ]
    }
   ],
   "modelAnswer": "If the failure happened before the request was fully written (DNS lookup, TCP connect, TLS handshake, or a partial write), nothing reached the server, so it is always safe to retry.\nIf the full request was sent and then a write/read timeout, disconnect or 5xx occurred, the server or a mid-tier may already have processed it. Retry only if the request is idempotent: GET, PUT and DELETE (deleting again just gives 'already deleted').\nPOST (payments, account creation, transfers) must not be blindly retried. Send the error back to the user, or use compare-and-swap with versions or an idempotency key.\nAlso: 408 is retriable for any method, 429 after Retry-After, while 4xx such as 401/403/404 and TLS certificate errors are not worth retrying.",
   "explanation": "Two axes: where in the lifecycle it failed, and whether the operation is idempotent.",
   "id": "L07-s3"
  },
  {
   "q": "Explain how a circuit breaker works and why its recovery probe matters.",
   "checks": [
    {
     "label": "Open state stops calls upstream / fails fast",
     "patterns": [
      "open",
      "stop (sending|calling)",
      "fail fast"
     ]
    },
    {
     "label": "Lets upstream recover / prevents cascade",
     "patterns": [
      "recover",
      "cascad"
     ]
    },
    {
     "label": "Half-open / probe after a wait",
     "patterns": [
      "half",
      "probe",
      "trial",
      "test request"
     ]
    },
    {
     "label": "Closes again on success",
     "patterns": [
      "clos"
     ]
    }
   ],
   "modelAnswer": "When calls to an upstream (e.g. a database) keep failing or timing out, the caller opens the circuit: it stops sending requests and immediately returns a fallback (fails fast). This lets the upstream recover and prevents a cascading failure.\nAfter a wait (e.g. 10-30 s) the breaker goes half-open: it lets a small number of probe requests through (e.g. 1 in 1000). If they succeed the circuit closes and normal traffic resumes; if they fail it opens again.\nWithout the probe the breaker never closes: a handful of real upstream errors becomes thousands of customer-visible errors, while the upstream team reports it saw almost no traffic.",
   "explanation": "Look for the closed/open/half-open cycle, fail-fast plus upstream recovery, and why recovery must be implemented.",
   "id": "L07-s4"
  },
  {
   "q": "A video player fetches a manifest, a DRM key and many segments. How should its retry and fallback behaviour differ for these, and what can it do when a 1080p segment keeps timing out?",
   "checks": [
    {
     "label": "Manifest retried more / faster",
     "patterns": [
      "manifest"
     ]
    },
    {
     "label": "DRM key not hammered",
     "patterns": [
      "drm",
      "licen[cs]e",
      "key"
     ]
    },
    {
     "label": "Segments retried or skipped (live)",
     "patterns": [
      "segment"
     ]
    },
    {
     "label": "Fallback to lower bitrate / resolution",
     "patterns": [
      "720",
      "lower",
      "bitrate",
      "resolution"
     ]
    }
   ],
   "modelAnswer": "All player requests are idempotent GETs, so they can be retried, but each type gets its own policy. The manifest is a small text file: retry it more often with short intervals. The DRM licence key must not be retried hundreds of times; business errors there (invalid key, unsupported device) are not retriable at all. Segments can be retried, a 404 on a live segment often appears moments later because of eventually-consistent storage, and in live playback a bad segment can even be skipped.\nIf a 1080p segment keeps timing out, fall back down the ladder: fetch the same segment at 720p, then 540p, and so on. Other reattempts: switch CDN or DNS resolver. Show the user an error code or a 'network is slow' message instead of retrying silently forever.",
   "explanation": "Different file types need different retry policies, and the fallback is a lower rendition.",
   "id": "L07-s5"
  },
  {
   "q": "Give four examples of graceful degradation or fallback from the lecture, and explain why backups should be cheaper than the primary.",
   "checks": [
    {
     "label": "Lower bitrate / L3 resolution",
     "patterns": [
      "bitrate",
      "resolution",
      "720",
      "l3"
     ]
    },
    {
     "label": "Codec / protocol fallback",
     "patterns": [
      "av1",
      "avc",
      "h\\.?264",
      "hls",
      "dash",
      "codec"
     ]
    },
    {
     "label": "Turn off expensive features / Gmail basic HTML",
     "patterns": [
      "recommend",
      "tray",
      "gmail",
      "basic html",
      "continue watch"
     ]
    },
    {
     "label": "Backups = insurance, cheaper",
     "patterns": [
      "insurance",
      "cheaper",
      "premium",
      "less (cost|expensive)"
     ]
    }
   ],
   "modelAnswer": "Examples: (1) on a Widevine L3 device, play at a lower resolution instead of refusing; (2) if the AV1 decoder fails, fall back to the older AVC/H.264 codec, or if the DASH manifest fails, try HLS; (3) if a 1080p segment times out, drop to 720p or 540p; (4) Gmail offers a basic HTML version on 2G/3G; (5) under load, turn off expensive home-page trays, recommendations and continue watching, or serve pre-cached responses; (6) skip a failed ad instead of blocking the video.\nBackups (a second CDN origin, a spare encoding pipeline, a satellite downlink used once in eight years) are insurance. They exist for rare events, so like insurance premiums they must cost much less than the primary; otherwise the redundancy is unaffordable.",
   "explanation": "Several concrete, domain-appropriate fallbacks, plus the insurance analogy for cost.",
   "id": "L07-s6"
  },
  {
   "q": "List the failure points a single HTTPS request can hit, from name lookup to reading the response, with one cause for each.",
   "checks": [
    {
     "label": "DNS",
     "patterns": [
      "dns"
     ]
    },
    {
     "label": "TCP connect / handshake",
     "patterns": [
      "connect",
      "syn",
      "tcp handshake"
     ]
    },
    {
     "label": "TLS",
     "patterns": [
      "tls",
      "ssl",
      "certificate"
     ]
    },
    {
     "label": "Write / send",
     "patterns": [
      "write",
      "send"
     ]
    },
    {
     "label": "Read / response",
     "patterns": [
      "read",
      "response"
     ]
    }
   ],
   "modelAnswer": "1. DNS resolution: the name does not exist, the resolver is misconfigured or overloaded, there is no network, or a stale record points to a dead host.\n2. TCP connect: host unreachable, a firewall or security group blocks the port, nobody is listening (connection refused), the server is at its connection limit, or the SYN or SYN-ACK is lost on a flaky network.\n3. TLS handshake: an invalid, wrong-domain or expired certificate, a version or cipher mismatch, a pinning mismatch, or a wrong system clock.\n4. Write: packets dropped despite TCP retransmits, a router or server shuts down, rate limiting, or the payload is too large.\n5. Server processing / upstream: slow database (504), bugs or crashes (5xx).\n6. Read: the connection is lost mid-response, access denied, rate limited (429), a silent drop, or a read timeout.\nWith a CDN, each hop (client-edge, edge-mid-tier, mid-tier-origin) can fail in all these ways.",
   "explanation": "Covering every stage in order with a realistic cause shows you built the failure map.",
   "id": "L07-s7"
  }
 ],
 "subtitle": "What was actually taught: designing for failure (timeouts, retries, backoff and jitter, circuit breakers, fallbacks)",
 "quiz": [
  {
   "quiz": 2,
   "qn": 20,
   "lecture": 7,
   "title": "Which Methods Are Safe to Retry",
   "q": "Which HTTP methods are generally safe to retry blindly, and what does POST need to be retried safely?",
   "options": [
    "GET/PUT/DELETE are idempotent by definition",
    "Only GET; POST, PUT and DELETE should never be retried",
    "All methods are always safe to retry",
    "POST is idempotent by default in HTTP/1.1"
   ],
   "answer": 0,
   "explanation": "A method is idempotent if repeating it has the same effect as doing it once. GET reads, PUT replaces with the same content, and DELETE of the same ID just ends up 'already deleted', so they are safe to retry. POST creates things or moves money, so the lecture said never retry it blindly; it needs protection such as compare-and-swap with version numbers (or an idempotency key) first.",
   "distractors": "PUT and DELETE are also idempotent, not every method is safe to retry, and POST is not idempotent by default.",
   "lectureRef": "Idempotency, HTTP methods and compare-and-swap",
   "keyNote": "The official option answers only the first half of the question ('which methods'); the second half ('what POST needs') is not in any option. From the lecture: POST is safe to retry only with a guard such as compare-and-swap (version N to N+1) or an idempotency key. The lecture also marked PUT as 'usually' rather than always safe.",
   "id": "Q2-20",
   "ref": "<a href=\"../lectures/lecture-07.html#n-idempotency-http-methods-and-compare-and-swap\">Lecture 7: Idempotency, HTTP methods and compare-and-swap</a>"
  },
  {
   "quiz": 2,
   "qn": 21,
   "lecture": 7,
   "title": "Beyond Exponential Backoff",
   "q": "Naive infinite retry (no backoff) causes named failure modes. What's the key refinement beyond simple exponential growth that fixes the worst of them?",
   "options": [
    "Retrying only once, ever",
    "Disabling retries below status code 500",
    "Switching every retry to a different HTTP method",
    "Adding 'full jitter'"
   ],
   "answer": 3,
   "explanation": "Exponential backoff spaces retries out (base x 2^attempt, capped), but if every client fails at the same moment they still retry at the same moments, producing a synchronized thundering herd. Full jitter waits a uniformly random time between 0 and the backoff delay, so clients spread out and recovering servers are not hit all at once. The lecture's three-part fix: max attempts, exponential backoff, jitter.",
   "distractors": "Retrying only once gives up on recoverable errors, status-code filtering does not desynchronize clients, and changing the HTTP method changes the meaning of the request.",
   "lectureRef": "How to retry: max attempts, exponential backoff, jitter",
   "id": "Q2-21",
   "ref": "<a href=\"../lectures/lecture-07.html#n-how-to-retry-max-attempts-exponential-backoff-jitter\">Lecture 7: How to retry: max attempts, exponential backoff, jitter</a>"
  },
  {
   "quiz": 2,
   "qn": 22,
   "lecture": 7,
   "title": "Honouring Retry-After",
   "q": "What does a well-behaved client do differently upon receiving a 429 or 503 response that includes a Retry-After header?",
   "options": [
    "It ignores the header and uses its own exponential backoff regardless",
    "It immediately retries without waiting",
    "It honors the server-specified wait time from Retry-After",
    "It opens its circuit breaker permanently"
   ],
   "answer": 2,
   "explanation": "A 429 (rate limited) or planned-maintenance 503 with Retry-After is the server stating when it can take you back. A well-behaved client waits at least that long before retrying; retrying sooner just gets it rate-limited again and adds load.",
   "distractors": "Ignoring the header or retrying immediately makes the overload worse, and a single 429/503 is not a reason to open a circuit breaker permanently.",
   "lectureRef": "Server hints: 429, 503 and 408",
   "id": "Q2-22",
   "ref": "<a href=\"../lectures/lecture-07.html#n-server-hints-429-503-and-408\">Lecture 7: Server hints: 429, 503 and 408</a>"
  },
  {
   "quiz": 2,
   "qn": 23,
   "lecture": 7,
   "title": "The Narrow 404 Retry Exception",
   "q": "A video-player case study describes a narrow exception to 'never retry a 404.' What is it?",
   "options": [
    "Retrying any 404 up to three times, always",
    "Retrying a 404 for a live stream's newest segment",
    "Retrying 404s only on Wi-Fi, never on cellular",
    "Treating every 404 as equivalent to a 500 and retrying with backoff"
   ],
   "answer": 1,
   "explanation": "A 404 normally means 'wrong path', and retrying will not make it appear. In a live stream, though, the manifest (a small text file) is updated quickly while the newest segment may still be propagating through the eventually-consistent object store and CDN, so a 404 on that newest segment is temporary and worth retrying.",
   "distractors": "Blanket retries of every 404, Wi-Fi-only rules and treating 404 like a 500 ignore why this exception exists: the resource is about to exist.",
   "lectureRef": "Should I retry? Stage by stage",
   "id": "Q2-23",
   "ref": "<a href=\"../lectures/lecture-07.html#n-should-i-retry-stage-by-stage\">Lecture 7: Should I retry? Stage by stage</a>"
  }
 ],
 "prev": {
  "num": 6,
  "file": "lecture-06.html"
 },
 "next": {
  "num": 8,
  "file": "lecture-08.html"
 }
};
