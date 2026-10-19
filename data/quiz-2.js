window.PAGE = {
 "title": "Quiz 2",
 "questions": [
  {
   "quiz": 2,
   "qn": 1,
   "lecture": 2,
   "title": "Transport Layer in the OSI Model",
   "q": "What is the OSI layer at which TCP and UDP operate?",
   "options": [
    "Layer 3 (Network)",
    "Layer 4 (Transport)",
    "Layer 5 (Session)",
    "Layer 7 (Application)"
   ],
   "answer": 1,
   "explanation": "TCP and UDP are transport protocols, layer 4 of OSI. That is why ports, which are a TCP/UDP concept, only exist from layer 4 up: IP (layer 3) knows addresses only, which is also why an L4 load balancer can route by IP + port but an L7 one can read HTTP.",
   "distractors": "Layer 3 is IP, layer 5 (session) has no real protocol in TCP/IP, and layer 7 is where HTTP, SMTP and DNS live.",
   "lectureRef": "OSI layers with real examples",
   "id": "Q2-1",
   "ref": "<a href=\"../lectures/lecture-02.html#n-osi-layers-with-real-examples\">Lecture 2: OSI layers with real examples</a>"
  },
  {
   "quiz": 2,
   "qn": 2,
   "lecture": 2,
   "title": "Why UCS-2 Halves the SMS Limit",
   "q": "GSM-7 packing fits 160 characters into 140 octets. A student adds one emoji, TP-DCS switches to UCS-2, and the character limit drops to 70. Why does it fall so much further than the 160→~137 you might expect?",
   "options": [
    "UCS-2 uses 16 bits per character with no 7-bit packing",
    "Emoji require a second SMS header reserved for Unicode",
    "UCS-2 messages are capped at 70 octets by the GSM standard, not 140",
    "The carrier halves the frame size whenever Unicode is detected"
   ],
   "answer": 0,
   "explanation": "The 160-character limit only works because GSM-7 packs characters back to back in 7 bits (1120 / 7 = 160). UCS-2 drops that packing and spends a full 16 bits on every character, so the same 140 bytes hold 1120 / 16 = 70 characters. It is not one character getting bigger, the whole message switches encoding.",
   "distractors": "There is no extra Unicode header, the payload is still 140 octets, and carriers do not halve the frame; the drop comes entirely from 16 bits per character instead of 7.",
   "lectureRef": "Byte-level warm-ups: htons by hand, IP and MAC sizes, SMS 7-bit packing",
   "id": "Q2-2",
   "ref": "<a href=\"../lectures/lecture-02.html#n-byte-level-warm-ups-htons-by-hand-ip-and-mac-sizes-sms-7-bit-packing\">Lecture 2: Byte-level warm-ups: htons by hand, IP and MAC sizes, SMS 7-bit packing</a>"
  },
  {
   "quiz": 2,
   "qn": 3,
   "lecture": 1,
   "title": "Skipping Unknown TLV Fields",
   "q": "TLV (type-length-value) framing is called forward compatible. What property gives it that?",
   "options": [
    "It compresses the value field automatically",
    "It is always shorter than fixed-width framing",
    "A receiver that doesn't recognize a type can skip it using the length field",
    "It requires a delimiter byte that never appears in the payload"
   ],
   "answer": 2,
   "explanation": "In TLV every field carries its own type and length. A receiver that does not recognize a type can read the length and skip exactly that many bytes, so newer senders can add fields without breaking older receivers. That is forward compatibility.",
   "distractors": "TLV does no compression, it is often longer than fixed-width framing because of the type and length bytes, and it needs no delimiter: the length is used instead.",
   "lectureRef": "Designing a protocol: framing, text vs binary, Base64, ASN.1/protobuf, RPC",
   "id": "Q2-3",
   "ref": "<a href=\"../lectures/lecture-01.html#n-designing-a-protocol-framing-text-vs-binary-base64-asn-1-protobuf-rpc\">Lecture 1: Designing a protocol: framing, text vs binary, Base64, ASN.1/protobuf, RPC</a>"
  },
  {
   "quiz": 2,
   "qn": 4,
   "lecture": 1,
   "title": "Cost of Base64 Safety",
   "q": "Base64 lets binary data travel safely through text-only channels. What does that safety cost?",
   "options": [
    "About 33% size overhead (4 output characters per 3 input bytes)",
    "A mandatory extra round trip to negotiate encoding",
    "Loss of one bit of precision per byte",
    "Roughly 200% size overhead"
   ],
   "answer": 0,
   "explanation": "Base64 turns every 3 input bytes into 4 output characters (6 bits each), so the output is 4/3 the size, about 33% larger. That is the cost of carrying binary through text-only channels such as email attachments, JWTs and CI variables.",
   "distractors": "Base64 needs no negotiation round trip, it is lossless (it decodes back exactly), and 200% overhead is far off (even hex is only 100%).",
   "lectureRef": "Designing a protocol: framing, text vs binary, Base64, ASN.1/protobuf, RPC",
   "id": "Q2-4",
   "ref": "<a href=\"../lectures/lecture-01.html#n-designing-a-protocol-framing-text-vs-binary-base64-asn-1-protobuf-rpc\">Lecture 1: Designing a protocol: framing, text vs binary, Base64, ASN.1/protobuf, RPC</a>"
  },
  {
   "quiz": 2,
   "qn": 5,
   "lecture": 2,
   "title": "PASV Port Arithmetic",
   "q": "An FTP server replies to PASV with: 227 Entering Passive Mode (127,0,0,1,117,48). Which TCP port will the data connection use?",
   "options": [
    "11,748",
    "30000",
    "2121",
    "4808"
   ],
   "answer": 1,
   "explanation": "The last two numbers of the PASV reply are the port's high byte and low byte: 117 x 256 + 48 = 30000. The client then opens the data connection to 127.0.0.1:30000, inside the 30000-30009 passive range the lecture's demo server reserved.",
   "distractors": "11,748 concatenates the digits, and 2121 and 4808 do not come from the byte arithmetic.",
   "lectureRef": "FTP hands-on: separate control and data connections, passive mode",
   "id": "Q2-5",
   "ref": "<a href=\"../lectures/lecture-02.html#n-ftp-hands-on-separate-control-and-data-connections-passive-mode\">Lecture 2: FTP hands-on: separate control and data connections, passive mode</a>"
  },
  {
   "quiz": 2,
   "qn": 6,
   "lecture": 4,
   "title": "Why Thread-per-Client Stopped Scaling",
   "q": "Why did thread-per-client designs lose out at scale, motivating select()/epoll instead?",
   "options": [
    "Threads cannot open network sockets",
    "Each thread reserves a stack (~8 MB by default)",
    "Threads cannot coexist with fork()",
    "The OS limits every process to 100 threads"
   ],
   "answer": 1,
   "explanation": "Every OS thread reserves its own stack, about 8 MB by default. The lecture's C10K arithmetic: 10,000 connections x 8 MB = 80 GB of memory, so thread-per-client could not scale. Event loops (select, then epoll) serve thousands of connections from one thread, where each connection costs only a few hundred bytes of state.",
   "distractors": "Threads can open sockets, threads and fork() coexist, and there is no 100-thread limit per process.",
   "lectureRef": "History: from Apache's fork to nginx",
   "id": "Q2-6",
   "ref": "<a href=\"../lectures/lecture-04.html#n-history-from-apache-s-fork-to-nginx\">Lecture 4: History: from Apache&#x27;s fork to nginx</a>"
  },
  {
   "quiz": 2,
   "qn": 7,
   "lecture": 3,
   "title": "The Per-Request Cost FastCGI Removes",
   "q": "What is CGI's biggest per-request cost that FastCGI is specifically designed to remove?",
   "options": [
    "TLS handshake overhead",
    "DNS resolution for the backend",
    "fork()+exec() of a new process for every request",
    "The cost of parsing HTTP headers"
   ],
   "answer": 2,
   "explanation": "CGI does what a shell does on every request: fork() plus exec() of a fresh process that is thrown away afterwards (copying, say, 5 MB of RAM each time), a fixed latency no matter how fast your code is. FastCGI keeps the CGI conventions but runs the program persistently (e.g. PHP-FPM) and sends it many requests over a socket, removing the per-request fork+exec.",
   "distractors": "TLS, DNS and HTTP parsing are not what FastCGI targets; the front web server still parses HTTP and FastCGI does not touch TLS or DNS.",
   "lectureRef": "From CGI to modules to FastCGI",
   "id": "Q2-7",
   "ref": "<a href=\"../lectures/lecture-03.html#n-from-cgi-to-modules-to-fastcgi\">Lecture 3: From CGI to modules to FastCGI</a>"
  },
  {
   "quiz": 2,
   "qn": 8,
   "lecture": 3,
   "title": "Requests in Flight at 300 req/s",
   "q": "By Little's Law (concurrency = throughput × latency), a service handling 300 requests/sec at 150 ms average latency has roughly how many requests in flight?",
   "options": [
    "20",
    "45",
    "150",
    "300"
   ],
   "answer": 1,
   "explanation": "Little's law: in flight = throughput x latency = 300 req/s x 0.15 s = 45 requests. If latency doubled, in-flight requests would double too, which is the lecture's point that latency drives concurrency.",
   "distractors": "20 divides instead of multiplying, 150 confuses milliseconds with a count, and 300 ignores latency entirely.",
   "lectureRef": "Latency drives concurrency, and slow connections",
   "id": "Q2-8",
   "ref": "<a href=\"../lectures/lecture-03.html#n-latency-drives-concurrency-and-slow-connections\">Lecture 3: Latency drives concurrency, and slow connections</a>"
  },
  {
   "quiz": 2,
   "qn": 9,
   "lecture": 4,
   "title": "The Question nginx Asked",
   "q": "Instead of trying to make each worker cheaper, what question did nginx's architecture ask that Apache's decade of MPM tuning hadn't?",
   "options": [
    "Why not use more RAM per worker?",
    "Why is there a worker per connection?",
    "Why not skip TCP entirely?",
    "Why not require HTTPS everywhere?"
   ],
   "answer": 1,
   "explanation": "Apache spent years making a worker per connection cheaper (fork, pre-fork, MPMs, threads). nginx asked instead, 'why does a connection need a worker at all?' A connection only needs a few hundred bytes of state; only work needs a thread. So nginx runs one event loop per core doing I/O and hands the heavy work to upstream app servers.",
   "distractors": "More RAM per worker is the old approach, nginx still uses TCP, and HTTPS has nothing to do with its architecture.",
   "lectureRef": "nginx's key idea: change the question",
   "id": "Q2-9",
   "ref": "<a href=\"../lectures/lecture-04.html#n-nginx-s-key-idea-change-the-question\">Lecture 4: nginx&#x27;s key idea: change the question</a>"
  },
  {
   "quiz": 2,
   "qn": 10,
   "lecture": 4,
   "title": "Why sendfile and gzip Conflict",
   "q": "sendfile on; and gzip on; conflict with each other in nginx. Why?",
   "options": [
    "sendfile copies data in the kernel without userspace, but gzip happens in userspace",
    "gzip disables the sendfile syscall permanently once loaded",
    "sendfile only works over UDP",
    "gzip requires TLS to be disabled first"
   ],
   "answer": 0,
   "explanation": "sendfile() moves file data from the kernel page cache to the socket without ever copying it into user space. gzip compresses in user space, so the bytes must be brought up from the kernel anyway, and the zero-copy benefit disappears for compressed responses.",
   "distractors": "gzip does not disable sendfile permanently, sendfile has nothing to do with UDP, and gzip does not depend on TLS.",
   "lectureRef": "sendfile, the page cache and mmap",
   "id": "Q2-10",
   "ref": "<a href=\"../lectures/lecture-04.html#n-sendfile-the-page-cache-and-mmap\">Lecture 4: sendfile, the page cache and mmap</a>"
  },
  {
   "quiz": 2,
   "qn": 11,
   "lecture": 4,
   "title": "Location Matching Precedence",
   "q": "A config has both location ^~ /images/ and location ~ \\.php$. Which one serves a request for /images/logo.php?",
   "options": [
    "The regex location, because regex always wins ties",
    "^~ stops nginx from checking the regex locations once it matches",
    "Neither — nginx returns 404",
    "Whichever is declared first in the file"
   ],
   "answer": 1,
   "explanation": "nginx first finds the longest matching prefix location. If that prefix is marked ^~, nginx uses it immediately and does not test any regex locations. /images/logo.php matches the prefix ^~ /images/, so the \\.php$ regex is never checked.",
   "distractors": "Regex locations only win when the longest prefix lacks ^~, the request is served (not 404), and declaration order matters only between regexes.",
   "lectureRef": "location matching and the data structures behind it",
   "id": "Q2-11",
   "ref": "<a href=\"../lectures/lecture-04.html#n-location-matching-and-the-data-structures-behind-it\">Lecture 4: location matching and the data structures behind it</a>"
  },
  {
   "quiz": 2,
   "qn": 12,
   "lecture": 4,
   "title": "What keys_zone Holds",
   "q": "In proxy_cache_path ... keys_zone=demo:10m max_size=100m;, what does the 10m of keys_zone actually hold?",
   "options": [
    "The cached response bodies themselves",
    "A hash of the nginx config file",
    "An in-memory index of cache keys and metadata",
    "The upstream server's TLS certificate cache"
   ],
   "answer": 2,
   "explanation": "keys_zone=demo:10m sizes a shared-memory zone that holds the cache index: the keys and their metadata. The cached response bodies live on disk under the cache path, limited by max_size=100m with LRU eviction. The lecture compared it to a database index pointing at the real data.",
   "distractors": "The bodies are on disk (bounded by max_size), and keys_zone has nothing to do with config hashes or TLS certificates.",
   "lectureRef": "Caching in nginx",
   "id": "Q2-12",
   "ref": "<a href=\"../lectures/lecture-04.html#n-caching-in-nginx\">Lecture 4: Caching in nginx</a>"
  },
  {
   "quiz": 2,
   "qn": 13,
   "lecture": 5,
   "title": "Persistent Connections in HTTP/1.1",
   "q": "HTTP/1.0 (RFC 1945) opens one TCP connection per response. What changed by default in early HTTP/1.1 (RFC 2068)?",
   "options": [
    "Connections became persistent by default",
    "Nothing changed until HTTP/2",
    "Requests were compressed by default",
    "UDP replaced TCP as the transport"
   ],
   "answer": 0,
   "explanation": "In HTTP/1.0 the server closes the connection after every response, so every resource pays for a new TCP handshake. HTTP/1.1 made connections persistent by default: they stay open unless someone sends Connection: close. In 1.0, Connection: keep-alive had been only a non-standard extension.",
   "distractors": "HTTP/1.1 changed a lot before HTTP/2; requests were not compressed by default (HPACK came with HTTP/2); and HTTP never replaced TCP with UDP until QUIC/HTTP/3.",
   "lectureRef": "HTTP/1.1: persistent connections, Host, ETags",
   "id": "Q2-13",
   "ref": "<a href=\"../lectures/lecture-05.html#n-http-1-1-persistent-connections-host-etags\">Lecture 5: HTTP/1.1: persistent connections, Host, ETags</a>"
  },
  {
   "quiz": 2,
   "qn": 14,
   "lecture": 5,
   "title": "What ETag Catches That Timestamps Miss",
   "q": "HTTP/1.1 describes ETag as a fingerprint, not a clock. What problem does ETag catch that Last-Modified/If-Modified-Since (clock-based) can miss?",
   "options": [
    "A resource changing within the same clock tick",
    "Requests sent without a Host header",
    "TLS certificate expiry",
    "Requests that exceed the Range limit"
   ],
   "answer": 0,
   "explanation": "Last-Modified has one-second granularity and depends on clocks, so two versions saved within the same second look identical, and skew or mtime changes add errors. An ETag is an opaque version identifier, often a content hash, so any change produces a new tag regardless of clocks, and If-None-Match catches it.",
   "distractors": "Host headers, TLS expiry and Range limits have nothing to do with cache validators.",
   "lectureRef": "HTTP/1.1: persistent connections, Host, ETags",
   "id": "Q2-14",
   "ref": "<a href=\"../lectures/lecture-05.html#n-http-1-1-persistent-connections-host-etags\">Lecture 5: HTTP/1.1: persistent connections, Host, ETags</a>"
  },
  {
   "quiz": 2,
   "qn": 15,
   "lecture": 5,
   "title": "The Two-Connection Guidance",
   "q": "RFC 2068 told clients they 'SHOULD NOT maintain more than 2 connections' per server. What problem was this guidance addressing?",
   "options": [
    "TLS handshake cost",
    "Load from many connections from one client on a server",
    "DNS cache poisoning",
    "Cookie size limits"
   ],
   "answer": 1,
   "explanation": "The early HTTP/1.1 RFCs (section 8.1.4) told clients to keep at most 2 persistent connections per server, to limit the load one client could place on a server and the network. The side effect from the lecture: sites invented domain sharding (img1/img2/img3, 3 x 6 = 18 connections today) and bundlers, and the rule was later dropped while browsers settled on about 6 per host.",
   "distractors": "The rule predates any TLS concern and has nothing to do with DNS poisoning or cookie sizes.",
   "lectureRef": "More 1.1 additions: OPTIONS, Via, 100-continue, redirects",
   "id": "Q2-15",
   "ref": "<a href=\"../lectures/lecture-05.html#n-more-1-1-additions-options-via-100-continue-redirects\">Lecture 5: More 1.1 additions: OPTIONS, Via, 100-continue, redirects</a>"
  },
  {
   "quiz": 2,
   "qn": 16,
   "lecture": 5,
   "title": "Targeting Repeated Header Bytes",
   "q": "We measured HTTP headers repeating 97.5% byte-for-byte across 80 requests. Which HTTP/2 mechanism directly targets this waste?",
   "options": [
    "Server push",
    "QUIC connection IDs",
    "The 9-byte frame header",
    "HPACK header compression"
   ],
   "answer": 3,
   "explanation": "HPACK is HTTP/2's header compression, aimed at exactly this repetition. A static table of 61 common headers and a dynamic table both sides build during the connection let a repeated header be sent as a small index instead of the full text, with Huffman coding for literals. It avoids plain gzip because compressed length can leak secrets such as cookies (CRIME).",
   "distractors": "Server push sends whole resources, QUIC connection IDs support migration, and the 9-byte frame header is overhead HTTP/2 adds, not a fix for repeated headers.",
   "lectureRef": "HTTP/2: multiplexing, HPACK and server push",
   "id": "Q2-16",
   "ref": "<a href=\"../lectures/lecture-05.html#n-http-2-multiplexing-hpack-and-server-push\">Lecture 5: HTTP/2: multiplexing, HPACK and server push</a>"
  },
  {
   "quiz": 2,
   "qn": 17,
   "lecture": 5,
   "title": "Why QUIC Rides on UDP",
   "q": "Why does QUIC run its transport logic over UDP instead of extending TCP directly?",
   "options": [
    "UDP is inherently faster at the wire level than TCP",
    "Middleboxes across the internet effectively veto changes to TCP",
    "TCP cannot carry encrypted payloads",
    "UDP guarantees in-order delivery, which QUIC needs"
   ],
   "answer": 1,
   "explanation": "Routers, NATs, firewalls and load balancers worldwide only understand TCP and UDP and make assumptions about TCP's fields, so a modified TCP or a new transport protocol gets dropped or mangled (ossification). Building on UDP lets QUIC put reliability, streams and TLS 1.3 in user space, and encrypting almost all headers stops middleboxes from freezing it again. The lecture's summary: TCP can only be replaced by building on UDP.",
   "distractors": "UDP is not faster on the wire, TCP carries encrypted payloads every day (TLS), and UDP guarantees no ordering at all; QUIC adds ordering itself.",
   "lectureRef": "TCP head-of-line blocking and why HTTP/3 uses QUIC over UDP",
   "id": "Q2-17",
   "ref": "<a href=\"../lectures/lecture-05.html#n-tcp-head-of-line-blocking-and-why-http-3-uses-quic-over-udp\">Lecture 5: TCP head-of-line blocking and why HTTP/3 uses QUIC over UDP</a>"
  },
  {
   "quiz": 2,
   "qn": 18,
   "lecture": 6,
   "title": "What CDNs Exist to Address",
   "q": "The Akamai 2010 distance-cost table and the Mathis model both illustrate what physical constraint CDNs exist to address?",
   "options": [
    "DNS resolution time grows with distance",
    "Packet size must shrink over long links",
    "TLS handshakes fail over long distances",
    "Round-trip latency scales with distance"
   ],
   "answer": 3,
   "explanation": "Light in fibre covers about 1,000 km per 4.9 ms one way, so round-trip time grows with distance no matter how good the servers are, and the Mathis model shows TCP throughput falling as RTT (and loss) rises. The Akamai distance table shows the same file being about 100x slower across continents. CDNs exist to move content closer and cut the number of long round trips.",
   "distractors": "DNS time, packet size and TLS failures are not what those tables measure; both point to RTT rising with distance.",
   "lectureRef": "Distance, packet loss and throughput",
   "id": "Q2-18",
   "ref": "<a href=\"../lectures/lecture-06.html#n-distance-packet-loss-and-throughput\">Lecture 6: Distance, packet loss and throughput</a>"
  },
  {
   "quiz": 2,
   "qn": 19,
   "lecture": 6,
   "title": "Serving Stale on Error",
   "q": "What does stale-if-error let a CDN edge do?",
   "options": [
    "Automatically fail over to a secondary origin",
    "Continue serving a previously cached response",
    "Force all clients to retry with backoff",
    "Purge the cache immediately on any 5xx"
   ],
   "answer": 1,
   "explanation": "stale-if-error lets the edge keep serving the copy it already has, even after its TTL, when the origin is erroring or unreachable (Cloudflare's 'always online', cf-cache-status STALE, nginx proxy_cache_use_stale). The site stays up from cache even while the origin is dead.",
   "distractors": "It does not fail over to a second origin, tell clients to back off, or purge anything; in fact it keeps old content instead of discarding it.",
   "lectureRef": "What gets cached, the cache key, and cache statuses",
   "id": "Q2-19",
   "ref": "<a href=\"../lectures/lecture-06.html#n-what-gets-cached-the-cache-key-and-cache-statuses\">Lecture 6: What gets cached, the cache key, and cache statuses</a>"
  },
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
 ]
};
