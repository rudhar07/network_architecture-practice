window.PAGE = {
 "title": "Quiz 1",
 "questions": [
  {
   "quiz": 1,
   "qn": 1,
   "lecture": 1,
   "title": "Client vs Server System Calls",
   "q": "A TCP server is built from seven system calls. Which one is never made by an ordinary TCP client?",
   "options": [
    "socket()",
    "accept()",
    "write()",
    "close()"
   ],
   "answer": 1,
   "explanation": "accept() is purely a server call: it takes the next completed handshake off the listening socket's queue and returns a brand-new descriptor for that one client. A TCP server makes seven calls (socket, bind, listen, accept, read, write, close), but a client only needs socket(), connect(), read/write and close(), because it never waits for anyone to connect to it. The client never calls listen or accept, and bind is optional (the kernel picks an ephemeral port).",
   "distractors": "socket(), write() and close() are made by both sides: every endpoint needs a socket, sends data and eventually closes its descriptor.",
   "lectureRef": "The client side and ephemeral ports",
   "id": "Q1-1",
   "ref": "<a href=\"../lectures/lecture-01.html#n-the-client-side-and-ephemeral-ports\">Lecture 1: The client side and ephemeral ports</a>"
  },
  {
   "quiz": 1,
   "qn": 2,
   "lecture": 1,
   "title": "Byte Order and htons()",
   "q": "addr.sin_port = htons(2026); and on the wire the port bytes read 07 EA. Why is htons() needed?",
   "options": [
    "To reserve the port with the kernel before bind()",
    "To widen the port from 8 to 16 bits",
    "Because x86 stores 0x07EA little-endian (EA 07) and network byte order is big-endian",
    "Because ports above 1024 must be encoded as unsigned"
   ],
   "answer": 2,
   "explanation": "Network byte order is big-endian (most significant byte first), while x86 stores integers little-endian. 2026 is 0x07EA, so in x86 memory it sits as EA 07; htons() swaps the two bytes so the header carries 07 EA, which every host on the network reads the same way. Without it the peer would read the port as 0xEA07 = 59911.",
   "distractors": "htons() does not reserve anything with the kernel (bind does that), ports are already 16-bit, and signedness has nothing to do with port 1024; the only job of htons is reordering bytes.",
   "lectureRef": "Addresses, INADDR_ANY and byte order (htons/htonl)",
   "id": "Q1-2",
   "ref": "<a href=\"../lectures/lecture-01.html#n-addresses-inaddr-any-and-byte-order-htons-htonl\">Lecture 1: Addresses, INADDR_ANY and byte order (htons/htonl)</a>"
  },
  {
   "quiz": 1,
   "qn": 3,
   "lecture": 1,
   "title": "Privileged Ports and Front Proxies",
   "q": "Why do real deployments bind 8080 as an unprivileged user and let a front proxy own 80 and 443?",
   "options": [
    "Because 8080 is handled by a faster kernel path",
    "Ports below 1024 require root, and a bug in an app's request parser running as root is a root compromise",
    "Because HTTP/1.1 keep-alive only works above 1024",
    "Because the kernel reserves 80 and 443 for TLS termination"
   ],
   "answer": 1,
   "explanation": "On Linux/Unix only root can bind ports below 1024 (the lecture demo failed to bind port 50 as a normal user). If the application itself bound 80 it would have to run as root, so any bug in its request parsing would hand an attacker root. Instead the app runs unprivileged on a high port such as 8080, and a small, hardened front proxy (e.g. nginx, whose master binds 80/443 and whose workers do the I/O) owns the privileged ports and forwards traffic.",
   "distractors": "There is no faster kernel path for 8080, keep-alive works on any port, and the kernel does not reserve 80/443 for TLS; the reason is purely the root requirement for ports below 1024.",
   "lectureRef": "Ports: range, privileged ports and famous numbers",
   "id": "Q1-3",
   "ref": "<a href=\"../lectures/lecture-01.html#n-ports-range-privileged-ports-and-famous-numbers\">Lecture 1: Ports: range, privileged ports and famous numbers</a>"
  },
  {
   "quiz": 1,
   "qn": 4,
   "lecture": 1,
   "title": "TLV Forward Compatibility",
   "q": "TLV (type-length-value) is called forward compatible. What property gives it that?",
   "options": [
    "Types are sorted, so a parser can binary-search for the field it wants",
    "Every value is a fixed size, so field offsets never move",
    "Values are base64-encoded, so unknown bytes always survive",
    "The length tells a parser how far to jump, so it can skip a field type it has never seen"
   ],
   "answer": 3,
   "explanation": "In TLV every field announces its type and its length before the value. A receiver that meets a type it does not know can still read the length and jump that many bytes to the next field, so a new version can add field types without breaking old parsers. That ability to skip the unknown is what makes TLV forward compatible (ASN.1 BER and FastCGI records use the same idea).",
   "distractors": "TLV values are variable-length, not fixed-size; types need not be sorted; and nothing about TLV involves Base64.",
   "lectureRef": "Designing a protocol: framing, text vs binary, Base64, ASN.1/protobuf, RPC",
   "id": "Q1-4",
   "ref": "<a href=\"../lectures/lecture-01.html#n-designing-a-protocol-framing-text-vs-binary-base64-asn-1-protobuf-rpc\">Lecture 1: Designing a protocol: framing, text vs binary, Base64, ASN.1/protobuf, RPC</a>"
  },
  {
   "quiz": 1,
   "qn": 5,
   "lecture": 1,
   "title": "Base64 Overhead",
   "q": "Base64 exists so binary can travel through text-only channels. What does it cost?",
   "options": [
    "About 33% more bytes: 3 input bytes become 4 output characters",
    "Exactly 2x the bytes: each byte becomes two characters",
    "Nothing — it is the same size, just re-encoded",
    "About 12% more bytes, plus a 4-byte header per message"
   ],
   "answer": 0,
   "explanation": "Base64 maps every 3 bytes (24 bits) onto 4 characters of 6 bits each, drawn from 64 safe characters (A-Z, a-z, 0-9, +, /, with = as padding). Four output bytes for every three input bytes is 4/3 the size, roughly 33% bigger. That is the price of making arbitrary binary safe for text-only channels such as email or JWTs.",
   "distractors": "Exactly 2x is the cost of hex encoding (two characters per byte), not Base64; it is never free; and there is no 12% figure or per-message header.",
   "lectureRef": "Designing a protocol: framing, text vs binary, Base64, ASN.1/protobuf, RPC",
   "id": "Q1-5",
   "ref": "<a href=\"../lectures/lecture-01.html#n-designing-a-protocol-framing-text-vs-binary-base64-asn-1-protobuf-rpc\">Lecture 1: Designing a protocol: framing, text vs binary, Base64, ASN.1/protobuf, RPC</a>"
  },
  {
   "quiz": 1,
   "qn": 6,
   "lecture": 2,
   "title": "MSS on a 1500-byte MTU",
   "q": "An Ethernet link with a 1500-byte MTU carrying IPv4 and TCP, neither with options. What is the MSS?",
   "options": [
    "1500 bytes",
    "1480 bytes",
    "1518 bytes",
    "1460 bytes"
   ],
   "answer": 3,
   "explanation": "The MTU (1500 bytes) limits the whole IP packet. Take away the 20-byte IPv4 header and the 20-byte TCP header (both without options) and 1500 - 20 - 20 = 1460 bytes are left for TCP payload, which is the MSS each side announces in its SYN.",
   "distractors": "1500 is the MTU itself, 1480 subtracts only the IP header, and 1518 is the full Ethernet frame (with 14-byte header and 4-byte FCS), not a TCP payload size.",
   "lectureRef": "Encapsulation, headers, checksums, MTU and MSS",
   "id": "Q1-6",
   "ref": "<a href=\"../lectures/lecture-02.html#n-encapsulation-headers-checksums-mtu-and-mss\">Lecture 2: Encapsulation, headers, checksums, MTU and MSS</a>"
  },
  {
   "quiz": 1,
   "qn": 7,
   "lecture": 2,
   "title": "Why Closing Takes Four Segments",
   "q": "Opening a TCP connection takes three segments, but closing it takes four. Why the extra one?",
   "options": [
    "TIME_WAIT needs its own round trip before the socket is released",
    "SYN and ACK can share one segment, but each side's FIN needs its own ACK — the peer may still have data to send",
    "The active closer must send FIN twice in case the first is lost",
    "Closing carries no sequence numbers, so an extra confirmation is required"
   ],
   "answer": 1,
   "explanation": "Each direction of a TCP connection closes independently (half-close): A sends FIN and B ACKs it, but B's application may still have data to send, so B sits in CLOSE_WAIT until it calls close() and sends its own FIN, which A then ACKs. In the handshake the server can combine its SYN and its ACK into one SYN-ACK, but at close time B's FIN usually cannot ride on the ACK because B is not done yet. That gives FIN, ACK, FIN, ACK: four segments.",
   "distractors": "TIME_WAIT is a timer on the active closer, not an extra segment; FIN is not sent twice by design; and teardown segments do carry sequence numbers.",
   "lectureRef": "Teardown, TIME_WAIT and why connections are costly",
   "id": "Q1-7",
   "ref": "<a href=\"../lectures/lecture-02.html#n-teardown-time-wait-and-why-connections-are-costly\">Lecture 2: Teardown, TIME_WAIT and why connections are costly</a>"
  },
  {
   "quiz": 1,
   "qn": 8,
   "lecture": 2,
   "title": "Cost of SYN Cookies",
   "q": "SYN cookies stop backlog exhaustion by encoding the connection parameters into the server's own initial sequence number. What is the cost of doing that?",
   "options": [
    "The handshake needs a fourth segment to confirm the cookie",
    "Initial sequence numbers become predictable, reopening the Mitnick attack",
    "There are only 32 bits of ISN, so most TCP options — window scale, SACK, timestamps — are lost for that connection",
    "The client must support TCP Fast Open"
   ],
   "answer": 2,
   "explanation": "A SYN cookie stores no half-open state: the server packs a keyed hash of the connection details (addresses, ports, time, an MSS code) into its 32-bit initial sequence number and rebuilds the connection from the returning ACK. Thirty-two bits is very little room, so options negotiated in the SYN, such as window scale, SACK and timestamps, cannot all be remembered and are lost for that connection (MSS is squeezed into a few bits). That is why kernels use cookies only when the SYN queue is under pressure.",
   "distractors": "The handshake stays three segments; the hash is keyed so ISNs are not predictable; and TCP Fast Open is a separate, unrelated feature.",
   "lectureRef": "TCP handshake, window scaling, SYN floods and SYN cookies",
   "id": "Q1-8",
   "ref": "<a href=\"../lectures/lecture-02.html#n-tcp-handshake-window-scaling-syn-floods-and-syn-cookies\">Lecture 2: TCP handshake, window scaling, SYN floods and SYN cookies</a>"
  },
  {
   "quiz": 1,
   "qn": 9,
   "lecture": 2,
   "title": "SMS Limit Under UCS-2",
   "q": "GSM-7 packing fits 160 characters into 140 octets. A student adds one emoji, so TP-DCS switches to UCS-2. What is the new character limit?",
   "options": [
    "160 characters",
    "140 characters",
    "80 characters",
    "70 characters"
   ],
   "answer": 3,
   "explanation": "An SMS payload is 140 bytes. With GSM 7-bit packing, 140 x 8 = 1120 bits / 7 = 160 characters. A single character outside the GSM alphabet (such as an emoji) switches the whole message to 16-bit UCS-2, so 140 bytes / 2 bytes per character = 70 characters.",
   "distractors": "160 is the GSM-7 limit, 140 would assume 8 bits per character, and 80 has no basis; the payload stays 140 bytes and each UCS-2 character takes two of them.",
   "lectureRef": "Byte-level warm-ups: htons by hand, IP and MAC sizes, SMS 7-bit packing",
   "id": "Q1-9",
   "ref": "<a href=\"../lectures/lecture-02.html#n-byte-level-warm-ups-htons-by-hand-ip-and-mac-sizes-sms-7-bit-packing\">Lecture 2: Byte-level warm-ups: htons by hand, IP and MAC sizes, SMS 7-bit packing</a>"
  },
  {
   "quiz": 1,
   "qn": 10,
   "lecture": 2,
   "title": "Decoding a PASV Reply",
   "q": "An FTP server answers PASV with: 227 Entering Passive Mode (127,0,0,1,117,48). Which port does the client open the data connection to?",
   "options": [
    "117",
    "30000",
    "11748",
    "48"
   ],
   "answer": 1,
   "explanation": "In the PASV reply the first four numbers are the IP (127.0.0.1) and the last two are the high byte and low byte of a 16-bit port. Port = 117 x 256 + 48 = 29952 + 48 = 30000, which matches the 30000-30009 passive range the demo server reserved. It is the same byte arithmetic as htons.",
   "distractors": "117 and 48 are just the two bytes; 11748 glues the digits together as text, which is not how a 16-bit number is built from bytes.",
   "lectureRef": "FTP hands-on: separate control and data connections, passive mode",
   "id": "Q1-10",
   "ref": "<a href=\"../lectures/lecture-02.html#n-ftp-hands-on-separate-control-and-data-connections-passive-mode\">Lecture 2: FTP hands-on: separate control and data connections, passive mode</a>"
  },
  {
   "quiz": 1,
   "qn": 11,
   "lecture": 2,
   "title": "SMTP Envelope vs Header",
   "q": "You telnet into SMTP and send MAIL FROM:<jeet@example.com> but put From: someone-else@bank.com inside DATA. What does the base protocol do about the mismatch?",
   "options": [
    "It rejects the message with a 550",
    "It rewrites the From: header to match MAIL FROM",
    "Nothing — MAIL FROM is the envelope and From: is text on the letter; the base protocol checks neither",
    "It accepts the mail but strips the DATA headers"
   ],
   "answer": 2,
   "explanation": "MAIL FROM is the envelope sender used for delivery and bounces, while the From: header is just text inside the message that the reader sees. Base SMTP checks neither against the other, which is why sender forgery was so easy before SPF, DKIM and authenticated submission were bolted on. The lecture demo showed they can simply differ.",
   "distractors": "No 550 rejection, no rewriting and no stripping of headers happens in the base protocol; those behaviours only come from later anti-spam policies, not SMTP itself.",
   "lectureRef": "Email protocols hands-on: SMTP, POP3, IMAP, MIME",
   "id": "Q1-11",
   "ref": "<a href=\"../lectures/lecture-02.html#n-email-protocols-hands-on-smtp-pop3-imap-mime\">Lecture 2: Email protocols hands-on: SMTP, POP3, IMAP, MIME</a>"
  },
  {
   "quiz": 1,
   "qn": 12,
   "lecture": 3,
   "title": "select() and FD_SETSIZE",
   "q": "Your select()-based server dies at descriptor 1024 and ulimit -n 65536 changes nothing. Why not?",
   "options": [
    "The kernel refuses more than 1024 sockets per process",
    "fd_set is a fixed-width bitmap — FD_SETSIZE is compiled into a header, so fd 1024 cannot be represented at all",
    "select() takes maxfd as a 10-bit argument",
    "The listen() backlog silently caps at 1024"
   ],
   "answer": 1,
   "explanation": "select() works on an fd_set, a fixed-size bitmap whose width is FD_SETSIZE, compiled in as 1024. Descriptors 0..1023 fit; descriptor 1024 has no bit to set, so raising the process limit with ulimit -n does not help. The fixes are poll or epoll (or rebuilding with a larger FD_SETSIZE).",
   "distractors": "The kernel allows far more than 1024 sockets once ulimit is raised; maxfd is an ordinary int, not 10 bits; and the listen backlog limits the accept queue, not descriptor numbers.",
   "lectureRef": "Limits of select, and its successors",
   "id": "Q1-12",
   "ref": "<a href=\"../lectures/lecture-03.html#n-limits-of-select-and-its-successors\">Lecture 3: Limits of select, and its successors</a>"
  },
  {
   "quiz": 1,
   "qn": 13,
   "lecture": 4,
   "title": "select vs epoll at Scale",
   "q": "10,000 connections are open and 10 of them have data waiting. How do select and epoll compare?",
   "options": [
    "Both do work proportional to the 10 ready descriptors",
    "select is O(ready) and epoll is O(watched)",
    "epoll must rebuild its interest set on every call, so it is slower at this scale",
    "select rebuilds and scans all 10,000 every call; epoll returns only the 10 that fired"
   ],
   "answer": 3,
   "explanation": "With select you rebuild the fd_set before every call, the kernel scans every registered descriptor, and you then loop over all of them with FD_ISSET, so the cost is O(all watched descriptors). With epoll you register descriptors once (epoll_ctl) and epoll_wait() returns only the ready ones. The instructor's exact example: 10,000 idle connections and 10 active, select walks all 10,000 while epoll hands you just the 10.",
   "distractors": "The other options reverse the truth: select is O(watched), epoll is O(ready), and epoll keeps its interest set in the kernel instead of rebuilding it on each call.",
   "lectureRef": "epoll vs select",
   "id": "Q1-13",
   "ref": "<a href=\"../lectures/lecture-04.html#n-epoll-vs-select\">Lecture 4: epoll vs select</a>"
  },
  {
   "quiz": 1,
   "qn": 14,
   "lecture": 3,
   "title": "Little's Law and Requests in Flight",
   "q": "A service handles 500 requests/sec at 200 ms average latency. Roughly how many requests are in flight, and what happens if latency rises to 1 second?",
   "options": [
    "100 now, rising to 500",
    "500 now, rising to 2,500",
    "100 now, unchanged — latency does not affect concurrency",
    "2,500 now, falling to 500"
   ],
   "answer": 0,
   "explanation": "Little's law: requests in flight = arrival rate x time per request. 500 req/s x 0.2 s = 100 in flight; if latency rises to 1 s, 500 x 1 = 500 in flight, five times the memory, threads and descriptors. This is the spiral the lecture warned about: more in flight means more contention, which means more latency, which means even more in flight.",
   "distractors": "500 and 2,500 multiply by the wrong values, and the 'unchanged' and 'falling' options contradict the law: at the same arrival rate, higher latency always means more concurrency.",
   "lectureRef": "Latency drives concurrency, and slow connections",
   "id": "Q1-14",
   "ref": "<a href=\"../lectures/lecture-03.html#n-latency-drives-concurrency-and-slow-connections\">Lecture 3: Latency drives concurrency, and slow connections</a>"
  },
  {
   "quiz": 1,
   "qn": 15,
   "lecture": 3,
   "title": "Cost of In-Process Modules",
   "q": "mod_php and mod_perl removed CGI's fork+exec by compiling the application into the web server. What was the trade-off?",
   "options": [
    "Requests became stateful, so load balancing broke",
    "The application could no longer read CGI environment variables",
    "The application shares an address space with the web server, so one segfault takes both down",
    "Each request needed a second TCP connection to the module"
   ],
   "answer": 2,
   "explanation": "mod_php and mod_perl load the interpreter into Apache as a shared module, so there is no fork per request. The price is that the application code now lives inside the web server's process and address space, so a crash (segfault) or memory bug in the app takes the web server worker down with it. FastCGI later separated them again into a persistent, separate app process (e.g. PHP-FPM).",
   "distractors": "Requests did not become stateful, CGI-style variables were still available, and no second TCP connection was involved; the issue is the shared process.",
   "lectureRef": "From CGI to modules to FastCGI",
   "id": "Q1-15",
   "ref": "<a href=\"../lectures/lecture-03.html#n-from-cgi-to-modules-to-fastcgi\">Lecture 3: From CGI to modules to FastCGI</a>"
  },
  {
   "quiz": 1,
   "qn": 16,
   "lecture": 3,
   "title": "End of FastCGI Parameters",
   "q": "In FastCGI, how does the responder know the environment parameters are finished?",
   "options": [
    "A CRLF CRLF sequence, as in HTTP headers",
    "A PARAMS record with content length zero — the empty record is the delimiter",
    "CONTENT_LENGTH counting down to zero",
    "The arrival of the FCGI_END_REQUEST record"
   ],
   "answer": 1,
   "explanation": "FastCGI sends everything as length-prefixed records. The parameters (CGI names such as REQUEST_METHOD and QUERY_STRING, now as name-value pairs) travel in PARAMS records, and an empty record with content length 0 marks the end of that stream; the empty record is the delimiter. The same rule ends the STDIN stream.",
   "distractors": "CRLF CRLF is HTTP's header delimiter, CONTENT_LENGTH describes the request body rather than the params, and FCGI_END_REQUEST is sent by the application at the end of the response.",
   "lectureRef": "From CGI to modules to FastCGI",
   "id": "Q1-16",
   "ref": "<a href=\"../lectures/lecture-03.html#n-from-cgi-to-modules-to-fastcgi\">Lecture 3: From CGI to modules to FastCGI</a>"
  },
  {
   "quiz": 1,
   "qn": 17,
   "lecture": 3,
   "title": "CGI Header Variable Names",
   "q": "A request arrives carrying the header User-Agent: curl. What does CGI hand the program?",
   "options": [
    "USER_AGENT=curl",
    "HTTP_USER-AGENT=curl",
    "CGI_HTTP_USERAGENT=curl",
    "HTTP_USER_AGENT=curl"
   ],
   "answer": 3,
   "explanation": "CGI passes request headers to the program as environment variables: every header becomes HTTP_ followed by its name in upper case, with hyphens turned into underscores. So User-Agent: curl arrives as HTTP_USER_AGENT=curl, just like Referer becomes HTTP_REFERER.",
   "distractors": "USER_AGENT lacks the HTTP_ prefix, a hyphen is not valid in a shell variable name, and there is no CGI_ prefix.",
   "lectureRef": "CGI: Apache emulating the shell",
   "id": "Q1-17",
   "ref": "<a href=\"../lectures/lecture-03.html#n-cgi-apache-emulating-the-shell\">Lecture 3: CGI: Apache emulating the shell</a>"
  },
  {
   "quiz": 1,
   "qn": 18,
   "lecture": 3,
   "title": "Goroutine vs Thread Stack",
   "q": "You plan for 10,000 concurrent requests. An OS thread reserves ~8 MB of stack up front. What does a goroutine start with?",
   "options": [
    "2 KB, grown on demand",
    "64 KB, grown on demand",
    "2 MB, fixed",
    "8 MB, but shared between goroutines"
   ],
   "answer": 0,
   "explanation": "An OS thread reserves a large stack up front (commonly up to 8 MB), so 10,000 threads means tens of gigabytes reserved. A goroutine starts with a tiny stack of about 2 KB that the Go runtime grows only when that goroutine needs more, and many goroutines are multiplexed onto a few OS threads. That is why Go can run huge numbers of concurrent tasks without bloating memory, as the lecture noted.",
   "distractors": "64 KB and 2 MB are far larger than a goroutine's starting stack, and goroutines do not share one stack: each has its own small, growable one.",
   "lectureRef": "The four limits you hit when scaling a server",
   "id": "Q1-18",
   "ref": "<a href=\"../lectures/lecture-03.html#n-the-four-limits-you-hit-when-scaling-a-server\">Lecture 3: The four limits you hit when scaling a server</a>"
  },
  {
   "quiz": 1,
   "qn": 19,
   "lecture": 4,
   "title": "sendfile vs gzip",
   "q": "sendfile on; and gzip on; fight each other. Why?",
   "options": [
    "sendfile copies entirely kernel-side, so to compress (or encrypt) the bytes they must be brought into user space",
    "sendfile only works on files smaller than 64 KiB, and gzip buffers more than that",
    "gzip needs the file mmap'd, which sendfile forbids",
    "sendfile cannot set Content-Length, which gzip requires"
   ],
   "answer": 0,
   "explanation": "sendfile() moves bytes straight from the kernel page cache to the socket buffer with no copy into user space; that is its whole benefit. gzip (or TLS encryption) has to transform the bytes, which can only happen in user space, so nginx must read the data up anyway and the zero-copy advantage is lost for compressed responses.",
   "distractors": "sendfile has no 64 KiB limit, gzip does not require mmap, and sendfile is unrelated to Content-Length (headers are written before the body).",
   "lectureRef": "sendfile, the page cache and mmap",
   "id": "Q1-19",
   "ref": "<a href=\"../lectures/lecture-04.html#n-sendfile-the-page-cache-and-mmap\">Lecture 4: sendfile, the page cache and mmap</a>"
  },
  {
   "quiz": 1,
   "qn": 20,
   "lecture": 4,
   "title": "try_files Fallback",
   "q": "For try_files $uri $uri/ /index.html?$args;, what is the role of the final argument?",
   "options": [
    "It is tested like the others, and returns 404 if missing",
    "It is the fallback — the only entry that is never tested as a file",
    "It is tested first, so a real /index.html short-circuits the rest",
    "It is ignored unless error_page is also configured"
   ],
   "answer": 1,
   "explanation": "try_files checks each argument in order as a file or directory ($uri, then $uri/) and serves the first that exists. The last argument is different: it is never tested, it is the fallback, an internal redirect taken when nothing else matched. That is the WordPress/SPA pattern from the lecture: serve the real file if it exists, otherwise send the request to index.php (or index.html) to decide.",
   "distractors": "The last argument is not tested and does not return 404 on its own, it is checked last rather than first, and it works without error_page.",
   "lectureRef": "Load balancing and fallbacks",
   "id": "Q1-20",
   "ref": "<a href=\"../lectures/lecture-04.html#n-load-balancing-and-fallbacks\">Lecture 4: Load balancing and fallbacks</a>"
  },
  {
   "quiz": 1,
   "qn": 21,
   "lecture": 4,
   "title": "Efficient Encoding for Game Commands",
   "q": "You want to send up/down/left/right and space keys on a gaming protocol. Which of these encodings sends those commands most efficiently?",
   "options": [
    "7-bit",
    "BCD",
    "Base64",
    "Base32"
   ],
   "answer": 1,
   "explanation": "Five commands (up, down, left, right, space) need only 3 bits each (2^3 = 8 >= 5). Of the options, BCD packs one symbol into a 4-bit nibble, so two commands fit in a byte. That is the closest to 3 bits and the most compact. The lecture's packing rule: use the fewest bits that cover your symbol set (27 symbols need 5 bits, GSM needs 7).",
   "distractors": "7-bit codes spend 7 bits per command, and Base64/Base32 are text-safe encodings that send each 6- or 5-bit group as a full 8-bit character, so they are larger, not smaller.",
   "lectureRef": "End-of-class quiz: Base64 and compact encodings",
   "keyNote": "BCD is designed for decimal digits rather than command codes, so the deeper idea is 'use the smallest fixed-width code that covers your symbols' (a custom 3-bit code would be smaller still). Among the four options given, the 4-bit BCD nibble is the most compact, which is why it is the official answer.",
   "id": "Q1-21",
   "ref": "<a href=\"../lectures/lecture-04.html#n-end-of-class-quiz-base64-and-compact-encodings\">Lecture 4: End-of-class quiz: Base64 and compact encodings</a>"
  },
  {
   "quiz": 1,
   "qn": 22,
   "lecture": 2,
   "title": "Defending Against SYN Floods",
   "q": "How does the TCP protocol defend against SYN flood attacks?",
   "options": [
    "TLS",
    "HTTPS",
    "SYN Cookies",
    "Sword and Shield"
   ],
   "answer": 2,
   "explanation": "A SYN flood fills the server's half-open (SYN) queue with connections that never complete. SYN cookies defend against it inside TCP itself: the server stores nothing and encodes the connection state into its initial sequence number, rebuilding it only when a genuine ACK returns. A flood then costs the attacker as much as the server.",
   "distractors": "TLS and HTTPS sit above TCP, so they cannot protect the TCP handshake (the L5 recap repeated this exact point), and 'Sword and Shield' is a joke option.",
   "lectureRef": "TCP handshake, window scaling, SYN floods and SYN cookies",
   "id": "Q1-22",
   "ref": "<a href=\"../lectures/lecture-02.html#n-tcp-handshake-window-scaling-syn-floods-and-syn-cookies\">Lecture 2: TCP handshake, window scaling, SYN floods and SYN cookies</a>"
  },
  {
   "quiz": 1,
   "qn": 23,
   "lecture": 1,
   "title": "Meaning of AF_INET",
   "q": "What does AF_INET represent in a socket call?",
   "options": [
    "IP socket",
    "TCP socket",
    "UDP socket",
    "Unix socket"
   ],
   "answer": 0,
   "explanation": "AF_INET is the address family for IPv4, so socket(AF_INET, ...) creates an IP (version 4) socket. Whether it is TCP or UDP is chosen by the second argument: SOCK_STREAM for TCP, SOCK_DGRAM for UDP.",
   "distractors": "TCP and UDP come from the socket type, not the family, and Unix-domain sockets use AF_UNIX.",
   "lectureRef": "The server lifecycle: socket, bind, listen, accept, read/write, close",
   "id": "Q1-23",
   "ref": "<a href=\"../lectures/lecture-01.html#n-the-server-lifecycle-socket-bind-listen-accept-read-write-close\">Lecture 1: The server lifecycle: socket, bind, listen, accept, read/write, close</a>"
  },
  {
   "quiz": 1,
   "qn": 24,
   "lecture": 4,
   "title": "Output of htons(2026)",
   "q": "What would be the output of htons(2026)?",
   "options": [
    "2026",
    "59911",
    "10000",
    "2620"
   ],
   "answer": 1,
   "explanation": "2026 = 0x07EA. On a little-endian x86 host, htons() swaps the two bytes to produce 0xEA07, so that the wire carries 07 EA. If you print that result as a host integer you get 0xEA07 = 234 x 256 + 7 = 59911.",
   "distractors": "2026 would only be the output on a big-endian host (where htons does nothing); 10000 and 2620 do not correspond to any byte arrangement of 0x07EA.",
   "lectureRef": "Warm-up quiz: byte order, framing, fork and friends",
   "id": "Q1-24",
   "ref": "<a href=\"../lectures/lecture-04.html#n-warm-up-quiz-byte-order-framing-fork-and-friends\">Lecture 4: Warm-up quiz: byte order, framing, fork and friends</a>"
  },
  {
   "quiz": 1,
   "qn": 25,
   "lecture": 3,
   "title": "Return Value of fork()",
   "q": "If the return value of fork() is zero (0), which process are you in?",
   "options": [
    "Parent process",
    "Child process",
    "Zombie process",
    "Root process"
   ],
   "answer": 1,
   "explanation": "fork() returns twice: it returns 0 in the child and the child's PID in the parent (and -1 on failure). A return value of 0 therefore means you are in the child. The child can find its parent with getppid(); the parent uses the returned PID to monitor and respawn workers.",
   "distractors": "The parent gets the child's PID (a positive number), not 0. A zombie is a terminated child that has not been reaped, and 'root process' is not a fork concept.",
   "lectureRef": "fork() refresher and why it is expensive",
   "id": "Q1-25",
   "ref": "<a href=\"../lectures/lecture-03.html#n-fork-refresher-and-why-it-is-expensive\">Lecture 3: fork() refresher and why it is expensive</a>"
  }
 ]
};
