window.PAGE = {
 "num": 2,
 "title": "Computer Networking Eagle Eye View",
 "summary": "A fast bird's-eye tour of the stack: Unix file descriptors, byte-level warm-ups (htons, MAC/IP sizes, SMS 7-bit packing), the OSI layers with real examples, TCP vs UDP, hubs/switches/Wi-Fi/satellite, encapsulation, MTU/MSS and checksums. It covers TCP congestion control (sawtooth vs BBR), the handshake with window scaling, SYN floods and SYN cookies, teardown, and a QUIC preview, then gets hands-on with SMTP, POP3, IMAP and FTP passive mode, plus a non-examinable SS7 telephony detour and a Hotstar scaling Q&A.",
 "notes": [
  {
   "heading": "Recap: everything is a file, pipes, and logging to stdout",
   "body": "The lecture opened by revising lecture 1 (socket, bind, listen, accept, connect, read, write, close).\n\n- **In Unix everything is a file.** The `sd` returned by `socket()` is a **file descriptor**, just like a file, a pipe or a printer, so the same `read`/`write` calls work on all of them. Linux copied this philosophy from Unix.\n- `2>&1` redirects **fd 2 (stderr)** into **fd 1 (stdout)**. These are file descriptors too, and in `cat x | less` the `|` is a **pipe**, another pair of fds. (`more` came first; `less` replaced it.)\n- When a shell or `subprocess` starts a program it does **fork + execve** and hands the child a set of fds/pipes for stdin, stdout and stderr. The parent can read whatever the child prints.\n- That is why modern ops says **just log to stdout/stderr**: container runtimes and cloud platforms capture those streams and ship them to a log server. The older style of writing to log files and log devices is mostly gone (in roughly the last 10 years).\n- When you run `app.listen(3000)` in Node, socket, bind and listen have already happened inside the framework and your code starts at accept. Frameworks also hide `htons`.\n- Clients are usually wrapped by libraries so thoroughly that you don't notice you are writing one, so most engineers end up writing servers."
  },
  {
   "heading": "Byte-level warm-ups: htons by hand, IP and MAC sizes, SMS 7-bit packing",
   "body": "### Writing htons yourself\nA short is 2 bytes; htons just **swaps the two bytes**:\n\n```c\nuint16_t my_htons(uint16_t x) {\n    return (uint16_t)((x << 8) | (x >> 8));   // little-endian host\n}\n```\n\nCasting to one byte keeps the low byte; shifting right by 8 gets the high byte. A `memcpy` into a reversed buffer also works. For 4 bytes (htonl) you reverse all four.\n\n### Sizes to know\n- **IPv4 address = 32 bits = 4 bytes.** Each dotted part is one byte (0–255): in 127.0.0.1, 127 = **0x7F**.\n- **MAC address = 48 bits = 6 bytes**, written as six hex pairs (`a4:83:e7:12:34:56`).\n- Speeds are in **bits** per second: an ISP's \"100 Mbps\" is megabits (about 12.5 MB/s), not megabytes. Old dial-up/telephony channels ran at **64 kbps** (56k modems).\n\n### SMS: 160 characters in 140 bytes\nThe GSM default alphabet needs only **7 bits** per character, so characters are packed back to back: 140 × 8 = 1120 bits, and 1120 / 7 = **160 characters**. In the captured SMS, \"Hello...\" begins with byte **0xC8**: the low 7 bits are `H` (0x48 = 1001000) and the top bit is the first bit of the next character `e`. That is why the message has fewer bytes than characters.\n\nIf you include **one** character outside that alphabet (an emoji, Arabic, many accented letters), the whole message switches to **16-bit UCS-2/Unicode**: 140 bytes / 2 = **70 characters**, so the same text may cost **two SMSs**.\n\n### Tools homework\n- Learn **curl**. In Chrome/Firefox DevTools, Network tab, choose *Copy as cURL* to replay any request from the terminal.\n- Install **Wireshark** and try **tcpdump**."
  },
  {
   "heading": "OSI layers with real examples",
   "body": "| # | Layer | What happens | Examples |\n|---|---|---|---|\n| 7 | Application | the protocol your program speaks | HTTP, SMTP, FTP, DNS, POP, IMAP |\n| 6 | Presentation | encoding, encryption, compression (a \"force fit\") | TLS is sometimes placed here |\n| 5 | Session | session management (often merged into 7) | |\n| 4 | Transport | process-to-process, ports | TCP, UDP |\n| 3 | Network | addressing and routing between networks | IP, ICMP (ping, traceroute) |\n| 2 | Data link | frames on one link, MAC addresses | Ethernet, Wi-Fi MAC, ARP, STP, switches |\n| 1 | Physical | bits as voltage/light/radio | copper cables, fibre, radio, satellite |\n\n- Physical isn't only copper: Wi-Fi and satellite are **radio**. Multiplexing schemes such as **CDMA/TDMA** live down here and are worth exploring.\n- **Homework:** run `ping` and `traceroute` and find out which protocol they use (**ICMP**, a layer-3 helper protocol that runs directly on IP).\n- Many diagrams leave out layers 5 and 6. Real stacks follow OSI only loosely."
  },
  {
   "heading": "TCP vs UDP: why video calls use UDP",
   "body": "| | TCP | UDP |\n|---|---|---|\n| Connection | 3-way handshake | none |\n| Reliability | ACKs, retransmission, in-order delivery | none (do it yourself if you care) |\n| Congestion/flow control | yes (window, congestion control) | no |\n| Header | 20+ bytes | **8 bytes** |\n| Typical use | web, mail, file transfer, APIs | Zoom/video calls, DNS, games, live media, QUIC |\n\n- The instructor's student-days view (\"why would I ever use UDP?\") was wrong: **this very class on Zoom runs over UDP**.\n- For real-time media, a **late packet is useless**, so you **drop it** instead of waiting for a retransmission. Zoom goes further: after a gap it plays audio slightly faster (about 10%) to catch up.\n- TCP has very good congestion control and error recovery, but retransmitting and waiting is the wrong behaviour for live media.\n- Live broadcast contribution (studio to cloud) is moving from RTP/RTMP-style setups to **SRT**. **Beyond the lecture:** SRT (Secure Reliable Transport) runs over **UDP** and adds its own selective retransmission within a latency budget. RTMP runs over TCP; RTP normally runs over UDP.\n\n**UDP header** (8 bytes): source port, destination port, length, checksum. There are no sequence numbers, ACKs or window."
  },
  {
   "heading": "Physical and link layer: voltages, hubs vs switches, Wi-Fi, satellite",
   "body": "- On a wire, 0 and 1 are just **different voltage levels**, changed over time (think Morse code). Ethernet cables carry separate pairs for sending and receiving.\n- The **NIC** (network interface card) turns frames into signals. A raw socket in **promiscuous** mode can see every frame that reaches the NIC.\n\n### Hubs vs switches\n- A **hub** repeats every frame out of **every** port, without caring about source or destination. It was the simplest thing that worked (\"no intelligence needed, just broadcast\"). Two hosts sending at once **collide**; both detect it, **back off a random time** and retry (CSMA/CD with random/exponential backoff, descended from the ALOHA idea).\n- A **switch** learns which **MAC address** is on which port and forwards each frame only there. It is far more efficient, has no shared collision domain, and is what everyone uses today.\n\n### Wi-Fi\n- **A radio can't listen while it transmits**, so it can't detect collisions. Wi-Fi uses **collision avoidance**: listen first, and if the channel is busy wait a **random backoff**, then send.\n- The receiver **ACKs at layer 2**, and if no ACK comes back the frame is **retransmitted**. So reliability is **not only TCP's job**: Wi-Fi (and SS7's MTP2) do retries at layer 2.\n- Many routers on the same band and channel interfere with each other. This and the retries cause **jitter** (variation in delay), which is why Wi-Fi is less reliable than a cable.\n\n### Satellite\nRound-trip time over geostationary satellite is very high. Satellite TV (Tata Sky/Dish) goes up and down **twice**, so it lags cable (Hathway) by seconds: the cable viewers next door cheer the last-ball wicket first. **Avoid TCP over high-RTT satellite links where you can**, because every handshake and ACK costs a long RTT."
  },
  {
   "heading": "Telephony detour: SS7, MTP, SMS and call flows (not examinable)",
   "body": "The instructor said this section **will not be in assessments** (bonus at most). It shows that TCP/IP is not the only stack and gives patterns worth copying.\n\n- **Blue box (1970s):** phone networks used **in-band** signalling, with control tones on the same channel as the voice. A whistle or box that played the right tone (2600 Hz) got free long-distance calls; Apple's founders famously sold blue boxes. The fix was **SS7 (Signalling System No. 7)**, which moved control (call setup, ringing, answer, disconnect) to a **separate channel** from the media (voice). This is **separation of control plane and data plane**.\n- The SS7 stack lines up with TCP/IP:\n\n| SS7 | Role | TCP/IP analogue |\n|---|---|---|\n| MTP1 | physical (64 kbps links) | L1 |\n| MTP2 | link reliability: forward/backward sequence numbers (FSN/BSN), retransmission **per hop** | L2 (with TCP-like reliability) |\n| MTP3 | routing by **point codes** (integer addresses) | IP |\n| SCCP | **subsystem numbers** that identify the application | ports |\n| TCAP | transactions | |\n| MAP / ISUP | SMS, roaming, location / call setup | application |\n\n- A signal unit carries at most **272 bytes** (the fixed-length framing example from lecture 1). MAP is defined in **ASN.1**. A parallel tap on the copper (MTP1) is used for debugging and lawful interception.\n- **SMS flow:** the phone sends an SMS-SUBMIT to the **SMSC** (SMS service centre, which stores and forwards). The SMSC asks the recipient's **HLR** (home location register) with **SRI-for-SM** (send routing info) where the user is, then delivers via the **MSC/VLR** (visitor location register) serving them. Identifiers: **MSISDN** (phone number), **IMSI** (SIM identity), **MSRN** (temporary roaming number from a pool, which is why a misrouted call can reach a stranger).\n- **Call setup (ISUP):** **IAM** (initial address), **ACM** (address complete, it's ringing), **CPG** (call progress, which was used to play caller-ring-back tunes), **ANM** (answer: open the voice circuits); then release. Every MSC hop on the path relays these.\n- War story: a malformed length field in a hand-built SMS could crash and restart Nokia phones whose software didn't check lengths. **Always validate lengths.**\n- **SIGTRAN/SCTP** later carried SS7's upper layers over IP, replacing a ₹7-lakh telecom card with a ₹1,500 Ethernet card while the applications never noticed. Layering works, and it is allowed to swap or collapse layers. 4G/5G voice uses **SIP**, an HTTP-like text protocol (try the free Asterisk PBX)."
  },
  {
   "heading": "Encapsulation, headers, checksums, MTU and MSS",
   "body": "Each layer wraps the layer above: **its header + payload (+ sometimes a trailer/checksum)**, nested like Russian dolls.\n\n```\n| Eth hdr 14B | IP hdr 20B | TCP hdr 20B | HTTP data ...      | FCS 4B |\n| dst MAC, src MAC, type | ver, len, TTL, proto, csum, src IP, dst IP | src port, dst port, seq, ack, flags, window, csum |\n```\n\n- **Ethernet frame:** destination MAC, source MAC, EtherType (e.g. IPv4), payload, **FCS** (a CRC-32 check).\n- **IPv4 header:** total length, **TTL**, protocol (TCP=6, UDP=17), header checksum, **source then destination** IP.\n- **TCP header:** source/destination **ports**, **sequence number**, **ack number**, flags, **window size**, checksum.\n- Field order is not consistent across protocols: Ethernet puts the **destination** first, IP puts the **source** first. You have to remember each one.\n\n### Checksums\nChecks appear everywhere data moves: **CRC** (cyclic redundancy check, used in Ethernet), simple **sums** (IP/TCP/UDP one's-complement checksum: weak, but good enough), **MD5**, **Adler-32**, the **Luhn** check digit on credit cards, and **HMAC** signing JWTs (a keyed MAC, which also protects against tampering, not only accidents).\n\n### MTU and MSS\n- **MTU** (maximum transmission unit) of Ethernet = **1500 bytes** of IP packet.\n- **MSS** (maximum segment size) = TCP payload per segment = **1500 − 20 (IP) − 20 (TCP) = 1460 bytes**. MSS is announced in the SYN.\n- DNS began on UDP. Answers with many IPs exceeded the UDP size limit, so DNS also runs over **TCP** (see lecture 1's war story)."
  },
  {
   "heading": "TCP reliability and congestion control: sawtooth vs BBR",
   "body": "TCP numbers every byte. The receiver ACKs what it has received, and a segment that is never ACKed counts as **lost** and is **retransmitted**.\n\n- **Loss-based congestion control** (Reno/CUBIC): grow the congestion window steadily; when a loss is detected, **cut it (roughly halve it)** and grow again. Plotted over time this gives the **TCP sawtooth**. The assumption is \"loss = congestion\", which is wrong on Wi-Fi or long-distance links, where loss is often just noise.\n- You can simulate loss: a middlebox or `iptables`/`tc netem` rule that drops 50% of packets, or simply walking away from the access point while running `ping`.\n- **BBR** (Google): instead of reacting to loss, continuously **measure the bottleneck bandwidth and the round-trip time (RTT)** (bytes ACKed per unit time) and send at that rate. Occasional loss doesn't collapse throughput. Google reported very large gains on lossy paths.\n- The same idea drives **adaptive bitrate (ABR)** in OTT video (YouTube, Hotstar, Netflix): measure how fast the last segments downloaded (size / time), smooth it (average, median or weighted average of the last few measurements), and pick the video quality that fits. ABR works at layer 7, so it works whichever TCP algorithm is underneath.\n\n**Beyond the lecture:** **Nagle's algorithm** (which came up in class) is different. It delays small writes to coalesce them into fuller segments (disabled with `TCP_NODELAY`). The **receive window** is flow control (how much the receiver can buffer); the **congestion window** is the sender's estimate of what the network can take. TCP sends min(rwnd, cwnd)."
  },
  {
   "heading": "TCP handshake, window scaling, SYN floods and SYN cookies",
   "body": "```\nClient                    Server\n  | --- SYN (seq=x, MSS, WS) ---------> |  server stores half-open state\n  | <-- SYN-ACK (seq=y, ack=x+1, MSS) - |\n  | --- ACK (ack=y+1) ----------------> |  ESTABLISHED, data can flow\n```\n\n- The SYNs exchange options, notably **MSS** and **window scale**.\n- **Window scaling:** the TCP window field is **16 bits** (max 65,535 bytes). The scale option is a shift count: the advertised window is left-shifted by it, and **each left shift doubles** it. The maximum shift of 14 gives about **1 GB**. The window is how much unacknowledged data can be \"in the pipe\" between the two hosts, so large windows are needed for high bandwidth × high RTT paths. Window size and MSS are point-to-point (end to end), unlike SS7's per-hop MTP2.\n\n### SYN flood\nOn a SYN the server records the half-open connection (client seq, MSS and so on) in memory and waits for the final ACK. An attacker sends **huge numbers of SYNs and never ACKs**. Even 4 bytes × a million is 4 MB, and real entries are much bigger, so memory and the SYN queue fill up and real clients are refused. It was a well-known attack in the mid-90s.\n\n### SYN cookies\n**Don't store anything; encode the state into the reply.** The server puts a keyed hash of the connection details (addresses, ports, time, MSS) into its **initial sequence number** in the SYN-ACK and forgets the connection. If a genuine ACK comes back, the ack number (cookie + 1) lets the server **verify and rebuild** the state. A flood now costs the attacker as much as the server.\n\n### The cookie pattern\nIt is the same pattern as **HTTP cookies**. HTTP servers are **stateless**, so state is sent down to the client and the client returns it on every request. Early sites naively stored `user_id=42` in plain cookies and anyone could forge them. Today cookies hold an **opaque key** or a **signed/HMAC'd** value. Engineers solve a problem once and then reuse the pattern everywhere. (Homework: which came first? **Beyond the lecture:** HTTP cookies (Netscape, 1994) predate SYN cookies (1996).)"
  },
  {
   "heading": "Teardown, TIME_WAIT and why connections are costly",
   "body": "```\nA --FIN--> B      A: FIN_WAIT_1\nA <--ACK-- B      B: CLOSE_WAIT (app still has to close)\nA <--FIN-- B      B: LAST_ACK\nA --ACK--> B      A: TIME_WAIT (~2*MSL, ~60 s) then CLOSED\n```\n\n- The teardown takes **four steps** because each direction closes independently (half-close).\n- `lsof -i` (Mac/Linux) or `ss -tan` shows many sockets sitting in **CLOSE_WAIT** and **TIME_WAIT** on a busy server. Lots of CLOSE_WAIT usually means the application forgot to `close()`.\n- **Connecting and disconnecting are expensive:** each system call switches between **user space and kernel space**, and data is copied across. A loop that just connects and disconnects can burn CPU. Reuse connections (keep-alive, pools).\n- One full **round trip** (the handshake) happens before any data. TLS adds more (2 RTT for TLS 1.2, 1 RTT for TLS 1.3). **TCP Fast Open** tried to send data in the SYN, but it needs trust and middlebox support, so few use it.\n- **Beyond the lecture:** **QUIC** merges the transport and crypto handshakes into **1 RTT** (0-RTT on resumption).\n- \"Crypto\" here means cryptography (encryption between two parties), not blockchain or cryptocurrency."
  },
  {
   "heading": "QUIC preview: reliability in user space over UDP",
   "body": "A full lecture on QUIC comes later; this was the preview.\n\n```\nHTTP/1.1, HTTP/2        HTTP/3\n     TLS                 QUIC  (streams, reliability, congestion control, TLS 1.3 built in)\n     TCP                 UDP\n     IP                  IP\n```\n\n- QUIC runs on **UDP** and rebuilds what TCP gave (ordering, retransmission, congestion control) **itself**, together with the TLS handshake, so a single handshake sets up both transport and crypto.\n- HTTP/2 and HTTP/3 in practice insist on TLS. HTTP/2 introduced **multiplexing** of many requests over one connection, which is easy to picture if you know CDMA/TDMA (multiplexing in telecom came first).\n- **Why UDP?** **TCP lives in the kernel**, so changing it means changing every OS, and every send or receive is a system call (a context switch). UDP is minimal, so the reliability logic can live in **user space**, in the application or library, and evolve quickly. Some projects (NVIDIA among them) bypass the kernel or offload TCP to hardware for the same reason.\n- **Responsibilities are porous:** reliability can sit at layer 2 (Wi-Fi, MTP2), layer 4 (TCP) or layer 7 (QUIC). **Media over QUIC (MoQ)** may become the streaming standard in the next 2–5 years.\n- UDP also allows **broadcast/multicast**, used for things like device discovery on a LAN. Homework: change the lecture-1 socket code to `SOCK_DGRAM`, send messages to each other, and capture them in Wireshark."
  },
  {
   "heading": "Email protocols hands-on: SMTP, POP3, IMAP, MIME",
   "body": "The demo ran a test mail server in a container (GreenMail/Mailpit) on port **1025** rather than 25, because ports below 1024 need root. Talking to it with `nc`/`telnet`:\n\n```\nEHLO me\nMAIL FROM:<a@test.local>\nRCPT TO:<b@test.local>\nDATA\nSubject: hi\n\nhello\n.            <- a line with a single dot ends the message (delimiter framing)\nQUIT\n```\n\nPressing Enter in DATA does nothing special (unlike HTTP's blank line). Only `.` on its own line ends the message.\n\n| Port | Use |\n|---|---|\n| 25 | SMTP server-to-server relay (plain) |\n| 587 | submission with **STARTTLS** (upgrade to TLS) |\n| 465 | SMTP over implicit TLS |\n| 110 / 995 | POP3 / POP3S |\n| 143 / 993 | IMAP / IMAPS |\n\n- Gmail won't accept anonymous mail on 25 from you. It requires an authenticated, encrypted connection (465/587) and checks **SPF** and **DKIM** DNS records that prove you may send for that domain. Use Mailpit or GreenMail for testing.\n- **POP3** (Post Office Protocol): `USER`/`PASS` in **plain text**, `LIST`, `RETR n`, `DELE n`, `QUIT`. Simple download-and-delete. It still works today.\n- **IMAP** is the improved protocol that desktop clients (Outlook, Apple Mail) use: server-side **folders**, read/unread **flags**, rich **search**.\n- **Envelope vs header:** `MAIL FROM` is the envelope sender used for delivery. The `From:` header is what the reader sees. They can differ.\n- **Raw email** (Gmail, *Show original*): `Message-ID` (replies reference it, which is how Zendesk-style tools thread conversations), `Date` (historically inconsistent formats), From/To/Subject, DKIM/SPF results, then **MIME multipart** with a random **boundary**: a `text/plain` part, a `text/html` part (inline CSS, `quoted-printable`), and attachments in **Base64**.\n- **Email is not end-to-end secure.** TLS protects each hop, but mail is **store-and-forward** through relays that can store it or pass it on in plain text. That is the contrast WhatsApp draws with \"end-to-end encryption\". Encrypt sensitive attachments yourself."
  },
  {
   "heading": "FTP hands-on: separate control and data connections, passive mode",
   "body": "- FTP keeps **commands** on a **control connection (port 21)** and moves **file data** over a **separate data connection**. Every command is plain text and login is unencrypted, so the demo's anonymous login worked with no password. That is why **SFTP** (file transfer over SSH) and FTPS exist.\n- **Active mode (old):** the client tells the server its own IP and port, and the server connects **back** from **port 20**. This breaks behind NAT and firewalls.\n- **Passive mode (today):** the client sends `PASV`, and the server replies with an IP and port where it is listening. The client opens the data connection, so the client stays \"dumb\" and the setup is firewall-friendly. The demo server reserved ports **30000–30009** for this.\n\n```\n227 Entering Passive Mode (127,0,0,1,117,48)\nport = 117*256 + 48 = 29952 + 48 = 30000\n```\n\nThe last two numbers are the **high byte and low byte** of a 16-bit port: multiply the first by 256 and add the second (the same byte arithmetic as htons). With `(…,117,56)` the port is 30008.\n- Commands: `USER`, `PASS`, `PASV`, `LIST`, `RETR file` (download), `STOR file` (upload, which is the homework).\n\n### Framing styles across protocols\n- **Delimiter:** SMTP's `.` line, CRLF-terminated commands.\n- **Fixed/length:** SS7's 272-byte units.\n- **Both:** HTTP delimits headers with an empty line, then uses `Content-Length` for the body.\n- **Separate channel:** FTP never mixes commands and data."
  },
  {
   "heading": "Binding 0.0.0.0 vs 127.0.0.1, and the Hotstar Q&A",
   "body": "### 0.0.0.0 vs 127.0.0.1\nBinding the demo server to **127.0.0.1** means only processes on the **same machine** can connect (loopback). Binding **0.0.0.0** (INADDR_ANY) means every interface, so external clients can connect too. You can also pick one interface's IP (say only the LAN NIC) to expose the server selectively.\n\n### Streaming at scale (Q&A, from the instructor's work at Hotstar)\n- Hotstar runs **HTTP/2** for APIs and video but falls back to **HTTP/1.1** more than they would like, because CDNs find HTTP/2 up to about **15% costlier** to serve and offer more capacity on 1.1. Video itself is delivered with **HLS and DASH** (segmented streaming over HTTP).\n- They use **multiple CDNs** (Akamai, CloudFront, Cloudflare, Fastly, Azure CDN): whoever has capacity.\n- **Capacity planning** is disciplined, not clever. They use years of history of requests per second at the toss and at the match start. If one pod handles 1,000 RPS and the expected load is 5,000 RPS, run **5 pods plus a buffer** for spikes. Services scale by their own driver: concurrency-driven services (stream security, screen limits, heartbeats/beacons) peak *during* the match, while the **home page** spikes when the match ends or it rains, the **\"cinema-hall washroom effect\"** (everyone moves at once).\n- **Video security:** once video is on the internet it can be pirated. HTTPS only stops *others* reading your traffic. **DRM** protects keys, but decoded frames sit in buffers and HDMI output can be captured. The only fully secure video is one that is never released."
  },
  {
   "heading": "Quick revision",
   "body": "- Everything in Unix is a file: sockets, pipes, stdin/stdout/stderr are fds; `2>&1` sends stderr to stdout.\n- Containers and clouds collect logs from stdout/stderr.\n- htons = swap two bytes: `(x<<8)|(x>>8)`.\n- IPv4 = 4 bytes, MAC = 6 bytes, 127 = 0x7F; Mbps = megabits.\n- SMS: 7-bit packing gives 160 chars in 140 bytes; one Unicode char drops it to 70 chars.\n- OSI: Physical, Data link, Network, Transport, Session, Presentation, Application; ping/traceroute use ICMP.\n- UDP header 8 bytes, no ACK/seq/window; video calls drop late packets.\n- Hub broadcasts to all ports (collisions); switch forwards by learned MAC.\n- Wi-Fi can't detect collisions, so it uses random backoff plus layer-2 ACK/retry; this causes jitter.\n- Satellite RTT is huge; avoid TCP over it.\n- Encapsulation = header + payload (+ trailer) at each layer; Ethernet FCS is CRC-32.\n- MTU 1500, MSS 1460 (minus 20 IP and 20 TCP).\n- Loss-based TCP gives the sawtooth (halve on loss); BBR measures bandwidth and RTT; OTT ABR uses the same idea.\n- Handshake: SYN, SYN-ACK, ACK; MSS and window scale are exchanged.\n- Window field 16 bits; scale is a left shift (each shift doubles), max about 1 GB.\n- SYN flood exhausts half-open state; SYN cookies encode the state in the ISN.\n- Teardown is 4 steps; TIME_WAIT about 60 s; many CLOSE_WAIT means the app forgot close().\n- QUIC = UDP + user-space reliability + TLS 1.3; TCP lives in the kernel.\n- SMTP DATA ends with a line containing `.`; 587 STARTTLS, 465 TLS, 110 POP3, 143 IMAP.\n- FTP: control on 21, data separate; PASV port = p1×256 + p2."
  },
  {
   "heading": "Exam traps",
   "body": "- **Mbps vs MBps:** network speeds are megabits. 100 Mbps is about 12.5 megabytes per second.\n- **MSS is not MTU:** MSS (1460) is TCP payload; MTU (1500) is the whole IP packet.\n- **Reliability isn't only layer 4:** Wi-Fi retransmits at L2, and QUIC does it at L7/user space over UDP.\n- **Hub vs switch:** a hub has no MAC awareness; a switch learns MAC-to-port. Neither routes by IP (that's a router, L3).\n- **ICMP is not TCP or UDP.** ping uses ICMP echo directly over IP, so it has no ports.\n- **Window scale is a shift count, not a multiplier value:** scale 7 means × 2^7 = 128.\n- **SYN cookies don't stop the packets arriving;** they stop the server storing state for them.\n- **The receive window (flow control) is not the congestion window;** Nagle is about small-packet coalescing, not bandwidth measurement.\n- **UDP still has a checksum.** What it lacks is sequence numbers, ACKs and windows.\n- **FTP passive mode:** the *client* opens the data connection. In active mode the server connects back from port 20.\n- **STARTTLS (587) upgrades a plain connection**, while 465 is TLS from the first byte.\n- **SMTP envelope MAIL FROM can differ from the From: header.**\n- **TLS on each hop does not make email end-to-end encrypted.**\n- **127.0.0.1 binding is local only;** a server \"not reachable from my phone\" is often bound to loopback.\n- **SS7 details are explicitly non-examinable** per the instructor; know the control/data-plane separation idea."
  }
 ],
 "keyTerms": [
  {
   "term": "File descriptor",
   "def": "Integer handle for any open file, socket or pipe; 0=stdin, 1=stdout, 2=stderr."
  },
  {
   "term": "2>&1",
   "def": "Shell redirection that points fd 2 (stderr) at wherever fd 1 (stdout) goes."
  },
  {
   "term": "fork + execve",
   "def": "How a shell launches programs: copy itself, then replace the copy with the new program."
  },
  {
   "term": "MAC address",
   "def": "48-bit (6-byte) layer-2 hardware address of a network interface."
  },
  {
   "term": "GSM 7-bit packing",
   "def": "Packing 7-bit characters back to back so 140 bytes carry 160 SMS characters."
  },
  {
   "term": "UCS-2 SMS",
   "def": "16-bit SMS encoding used when any non-GSM character appears; 70 characters per SMS."
  },
  {
   "term": "ICMP",
   "def": "Internet Control Message Protocol, a layer-3 helper used by ping and traceroute."
  },
  {
   "term": "Hub",
   "def": "Layer-1 device that repeats every frame to all ports; shared collision domain."
  },
  {
   "term": "Switch",
   "def": "Layer-2 device that learns MAC addresses per port and forwards frames only where needed."
  },
  {
   "term": "CSMA/CD vs CSMA/CA",
   "def": "Wired Ethernet detects collisions and backs off; Wi-Fi avoids them with random backoff and ACKs."
  },
  {
   "term": "Jitter",
   "def": "Variation in packet delay, high on Wi-Fi due to contention and retries."
  },
  {
   "term": "SS7",
   "def": "Signalling System No. 7: telephony control network separating signalling from voice."
  },
  {
   "term": "Point code",
   "def": "Integer node address in SS7's MTP3 layer, analogous to an IP address."
  },
  {
   "term": "HLR / VLR / SMSC",
   "def": "Home register of subscribers / register for the visited network / SMS store-and-forward centre."
  },
  {
   "term": "Encapsulation",
   "def": "Each layer wraps the payload from above with its own header (and maybe trailer)."
  },
  {
   "term": "CRC / FCS",
   "def": "Cyclic redundancy check; Ethernet's Frame Check Sequence is a CRC-32."
  },
  {
   "term": "MTU",
   "def": "Maximum Transmission Unit: largest IP packet on a link (1500 bytes on Ethernet)."
  },
  {
   "term": "MSS",
   "def": "Maximum Segment Size: largest TCP payload per segment, typically 1460 bytes."
  },
  {
   "term": "Congestion window",
   "def": "Sender-side limit on unacknowledged data, adjusted by congestion control."
  },
  {
   "term": "TCP sawtooth",
   "def": "Window grows then halves on loss, repeatedly, under loss-based congestion control."
  },
  {
   "term": "BBR",
   "def": "Google's congestion control that paces sending by measured bottleneck bandwidth and RTT."
  },
  {
   "term": "Adaptive bitrate (ABR)",
   "def": "Video players choosing quality from measured download throughput."
  },
  {
   "term": "Window scale",
   "def": "TCP option giving a left-shift count for the 16-bit window (max shift 14, about 1 GB)."
  },
  {
   "term": "SYN flood",
   "def": "DoS attack sending many SYNs without completing handshakes to exhaust server state."
  },
  {
   "term": "SYN cookie",
   "def": "Encoding connection state in the SYN-ACK sequence number so no state is stored until the final ACK."
  },
  {
   "term": "TIME_WAIT / CLOSE_WAIT",
   "def": "Post-close wait (~60 s) on the active closer / peer closed but local app hasn't called close()."
  },
  {
   "term": "QUIC",
   "def": "UDP-based transport with built-in TLS 1.3, streams and user-space reliability; carries HTTP/3."
  },
  {
   "term": "STARTTLS",
   "def": "Command that upgrades an existing plain-text connection (e.g. SMTP on 587) to TLS."
  },
  {
   "term": "POP3 vs IMAP",
   "def": "POP3 downloads (and deletes) mail; IMAP manages mail on the server with folders, flags and search."
  },
  {
   "term": "SPF / DKIM",
   "def": "DNS-based email authentication: allowed sending IPs / cryptographic signature of the message."
  },
  {
   "term": "MIME boundary",
   "def": "Random delimiter string separating parts (text, HTML, attachments) of a multipart email."
  },
  {
   "term": "FTP passive mode",
   "def": "Server announces a data port (p1*256+p2) and the client connects to it."
  }
 ],
 "mcqs": [
  {
   "q": "An SMS contains 140 bytes of user data using the GSM 7-bit alphabet. How many characters fit, and how many if one emoji is added?",
   "options": [
    "140 and 140",
    "160 and 140",
    "160 and 70",
    "153 and 67"
   ],
   "answer": 2,
   "explanation": "7-bit packing gives 140×8/7 = 160 characters. One character outside the GSM alphabet switches the whole message to 16-bit UCS-2, so 140/2 = 70 characters.",
   "distractors": "153/67 are the per-part limits of multipart (concatenated) SMS, and the encoding does change when an emoji is added.",
   "source": "lecture",
   "id": "L02-m1"
  },
  {
   "q": "Which implementation of htons is correct for a little-endian host (x is a uint16_t)?",
   "options": [
    "(x << 8) | (x >> 8), truncated to 16 bits",
    "x >> 16",
    "x * 256",
    "~x"
   ],
   "answer": 0,
   "explanation": "htons swaps the two bytes: the low byte moves up 8 bits and the high byte down 8 bits.",
   "distractors": "Shifting by 16 or multiplying by 256 loses a byte, and bitwise NOT flips bits instead of reordering bytes.",
   "source": "lecture",
   "id": "L02-m2"
  },
  {
   "q": "An ISP sells a '200 Mbps' plan. Ignoring overhead, roughly how long does a 1 GB (1000 MB) file take to download?",
   "options": [
    "5 seconds",
    "0.6 seconds",
    "8 minutes",
    "40 seconds"
   ],
   "answer": 3,
   "explanation": "200 Mbps = 25 MB/s (divide bits by 8). 1000 MB / 25 MB/s = 40 s.",
   "distractors": "5 s treats megabits as megabytes, and the other two are arithmetic errors.",
   "source": "lecture",
   "id": "L02-m3"
  },
  {
   "q": "Which protocol do `ping` and (by default on Windows) `tracert` use, and at what layer?",
   "options": [
    "UDP, layer 4",
    "ICMP, layer 3",
    "TCP, layer 4",
    "ARP, layer 2"
   ],
   "answer": 1,
   "explanation": "ping sends ICMP Echo Request/Reply, a control protocol that rides directly on IP at the network layer, with no ports.",
   "distractors": "ARP resolves MACs, and TCP/UDP have ports which ping doesn't use (Linux traceroute sends UDP by default, but the replies are still ICMP).",
   "source": "lecture",
   "id": "L02-m4"
  },
  {
   "q": "Why does a video-calling app like Zoom prefer UDP over TCP for media?",
   "options": [
    "UDP encrypts traffic automatically",
    "A late packet is useless for live media, so dropping it beats waiting for TCP retransmission",
    "UDP guarantees in-order delivery",
    "TCP cannot carry audio"
   ],
   "answer": 1,
   "explanation": "For real-time audio and video, waiting for a retransmission adds delay that is worse than a tiny gap. UDP lets the app drop late frames (and Zoom speeds playback up slightly to catch up).",
   "distractors": "UDP gives no encryption or ordering, and TCP can carry audio, just with head-of-line delay.",
   "source": "lecture",
   "id": "L02-m5"
  },
  {
   "q": "What is the key difference between a hub and a switch?",
   "options": [
    "A hub routes by IP address; a switch by port number",
    "There is no difference other than speed",
    "A switch broadcasts every frame; a hub filters by MAC",
    "A hub repeats frames to every port; a switch learns MAC addresses and forwards only to the right port"
   ],
   "answer": 3,
   "explanation": "A hub is a dumb repeater (one collision domain). A switch keeps a MAC-to-port table and forwards frames selectively.",
   "distractors": "Neither device routes by IP (that is a router), and the filtering roles are the other way round.",
   "source": "lecture",
   "id": "L02-m6"
  },
  {
   "q": "Why can't Wi-Fi use collision *detection* the way classic wired Ethernet did?",
   "options": [
    "A radio cannot listen while it is transmitting, so it avoids collisions with random backoff and relies on ACKs",
    "Wi-Fi has no MAC addresses",
    "Wi-Fi uses TCP for collisions",
    "Wi-Fi frames are too small to collide"
   ],
   "answer": 0,
   "explanation": "A transmitting radio drowns out its own receiver, so Wi-Fi uses carrier sensing, random backoff and layer-2 ACK/retransmission (CSMA/CA).",
   "distractors": "Wi-Fi does have MACs, its frames collide like any others, and TCP plays no part at layer 2.",
   "source": "lecture",
   "id": "L02-m7"
  },
  {
   "q": "Which statement best shows that 'reliability' is not exclusively a layer-4 job?",
   "options": [
    "IP retransmits lost packets",
    "UDP has sequence numbers",
    "Wi-Fi retransmits unacknowledged frames at layer 2 and QUIC retransmits in user space over UDP",
    "Ethernet hubs buffer and resend frames"
   ],
   "answer": 2,
   "explanation": "Wi-Fi (and SS7's MTP2) do ACK/retry at the link layer, and QUIC implements retransmission above UDP, outside the kernel's TCP.",
   "distractors": "IP is best-effort, UDP has no sequence numbers, and hubs don't resend anything.",
   "source": "lecture",
   "id": "L02-m8"
  },
  {
   "q": "With an Ethernet MTU of 1500 bytes and no IP/TCP options, what is the TCP MSS?",
   "options": [
    "1500",
    "1480",
    "1460",
    "1440"
   ],
   "answer": 2,
   "explanation": "MSS = MTU − 20 (IPv4 header) − 20 (TCP header) = 1460 bytes.",
   "distractors": "1480 subtracts only one header, and 1440 is what you get with IPv6's 40-byte header.",
   "source": "lecture",
   "id": "L02-m9"
  },
  {
   "q": "Under classic loss-based TCP congestion control (Reno/CUBIC), what happens to the congestion window when packet loss is detected?",
   "options": [
    "It is reduced sharply (roughly halved), producing the sawtooth pattern",
    "It doubles",
    "It is left unchanged",
    "The connection is closed"
   ],
   "answer": 0,
   "explanation": "Loss-based algorithms treat loss as congestion: grow, cut on loss, and grow again. That gives the sawtooth.",
   "distractors": "Doubling is slow-start growth, not the reaction to loss, and TCP does not close the connection on loss.",
   "source": "lecture",
   "id": "L02-m10"
  },
  {
   "q": "What does Google's BBR use to decide how fast to send?",
   "options": [
    "Only packet loss events",
    "The DNS TTL",
    "The receiver's MTU",
    "Measured bottleneck bandwidth and round-trip time"
   ],
   "answer": 3,
   "explanation": "BBR continuously estimates bottleneck bandwidth (delivery rate) and minimum RTT and paces at that rate, so random loss doesn't collapse throughput.",
   "distractors": "Pure loss reaction is Reno/CUBIC, and MTU and TTL have nothing to do with sending rate.",
   "source": "lecture",
   "id": "L02-m11"
  },
  {
   "q": "A TCP connection advertises a window of 65,535 and a window-scale value of 7. What is the effective receive window?",
   "options": [
    "65,535 × 7 bytes",
    "65,535 × 128 bytes (about 8 MB)",
    "65,535 + 7 bytes",
    "65,535 × 2 bytes"
   ],
   "answer": 1,
   "explanation": "The scale is a left-shift count: 2^7 = 128, so 65,535 × 128 ≈ 8.4 MB. Each shift doubles the window, up to shift 14 (about 1 GB).",
   "distractors": "The scale is not a plain multiplier or an addend; it is a power of two.",
   "source": "lecture",
   "id": "L02-m12"
  },
  {
   "q": "What does a SYN flood attack exhaust, and how do SYN cookies defend against it?",
   "options": [
    "Bandwidth; cookies compress packets",
    "Server memory/state for half-open connections; cookies encode that state in the SYN-ACK sequence number so nothing is stored until the final ACK",
    "Client ports; cookies assign new ports",
    "DNS caches; cookies lower the TTL"
   ],
   "answer": 1,
   "explanation": "Each SYN makes the server store half-open state. SYN cookies make the server stateless at that stage and rebuild the state from the returned ACK number.",
   "distractors": "The attack targets server state, not bandwidth, ports or DNS.",
   "source": "lecture",
   "id": "L02-m13"
  },
  {
   "q": "`ss -tan` on a server shows thousands of sockets in CLOSE_WAIT. What is the most likely cause?",
   "options": [
    "A SYN flood",
    "The MTU is too large",
    "Normal TIME_WAIT behaviour",
    "The remote peers closed but the application never called close() on its sockets"
   ],
   "answer": 3,
   "explanation": "CLOSE_WAIT means the peer sent FIN and the local app has not closed yet, which is usually a socket/fd leak in the application.",
   "distractors": "SYN floods show SYN_RECV, and TIME_WAIT is a different state found on the side that closed first.",
   "source": "lecture",
   "id": "L02-m14"
  },
  {
   "q": "Why can QUIC evolve faster than TCP?",
   "options": [
    "QUIC is implemented in user space on top of UDP, so apps and libraries can ship changes without OS upgrades",
    "QUIC runs inside the kernel",
    "QUIC has no congestion control",
    "QUIC does not use encryption"
   ],
   "answer": 0,
   "explanation": "TCP lives in the kernel and in middleboxes, so changes take years. QUIC's reliability, congestion control and TLS 1.3 sit in user space over UDP.",
   "distractors": "QUIC does have congestion control and mandatory encryption, and it is not in the kernel.",
   "source": "lecture",
   "id": "L02-m15"
  },
  {
   "q": "During an SMTP session you are inside the DATA command. How do you tell the server the message is finished?",
   "options": [
    "Press Enter twice",
    "Close the TCP connection",
    "Send a line containing only a single dot (.)",
    "Send a Content-Length header"
   ],
   "answer": 2,
   "explanation": "SMTP uses delimiter framing: CRLF.CRLF (a line with just '.') ends the message body.",
   "distractors": "A blank line is HTTP's header terminator, and SMTP has no Content-Length.",
   "source": "lecture",
   "id": "L02-m16"
  },
  {
   "q": "A mail client submits to port 587 and then issues STARTTLS. What does that mean?",
   "options": [
    "Mail is sent without any encryption",
    "The connection is TLS from the first byte",
    "The connection starts in plain text and is upgraded to TLS in-band",
    "It switches to POP3"
   ],
   "answer": 2,
   "explanation": "Port 587 (submission) begins as plain SMTP. STARTTLS upgrades the same connection to TLS. Port 465 is implicit TLS from the start.",
   "distractors": "Implicit TLS is 465, and STARTTLS is an encryption upgrade, not a protocol switch.",
   "source": "lecture",
   "id": "L02-m17"
  },
  {
   "q": "An FTP server replies `227 Entering Passive Mode (10,0,0,5,117,48)`. Where does the client open the data connection?",
   "options": [
    "10.0.0.5 port 30000",
    "10.0.0.5 port 165",
    "10.0.0.5 port 11748",
    "117.48.0.0 port 21"
   ],
   "answer": 0,
   "explanation": "The last two numbers are the port's high and low bytes: 117×256 + 48 = 30000. The first four are the IP.",
   "distractors": "Adding the bytes (165) or concatenating them (11748) is not how a 16-bit value is assembled.",
   "source": "lecture",
   "id": "L02-m18"
  },
  {
   "q": "A developer's server works with `curl localhost:8080` but not from a phone on the same Wi-Fi. The firewall is open. What is the most likely cause?",
   "options": [
    "TCP doesn't work over Wi-Fi",
    "Port 8080 is privileged",
    "The phone uses IPv4",
    "The server bound to 127.0.0.1 instead of 0.0.0.0"
   ],
   "answer": 3,
   "explanation": "Binding to 127.0.0.1 accepts only loopback connections from the same machine. Binding to 0.0.0.0 (or the LAN IP) exposes the server on the network.",
   "distractors": "8080 is above 1024, IPv4 is fine, and TCP works over Wi-Fi.",
   "source": "lecture",
   "id": "L02-m19"
  },
  {
   "q": "Why is email considered not end-to-end secure even when every hop uses TLS?",
   "options": [
    "TLS is broken",
    "Email is store-and-forward: each relay decrypts, stores and re-sends, and may forward in plain text",
    "Base64 is reversible",
    "SPF exposes the message"
   ],
   "answer": 1,
   "explanation": "TLS protects only each hop. Relays see the plaintext, store it, and may forward it insecurely. End-to-end needs encryption of the content itself (e.g. PGP/S-MIME).",
   "distractors": "TLS works per hop, Base64 is encoding rather than security, and SPF only authorises sending IPs.",
   "source": "lecture",
   "id": "L02-m20"
  }
 ],
 "short": [
  {
   "q": "Explain what a SYN flood is and how SYN cookies defeat it. Relate the idea to HTTP cookies.",
   "checks": [
    {
     "label": "Describes many SYNs without the final ACK / half-open connections",
     "patterns": [
      "half.?open|never.{0,30}ack|without.{0,30}ack|no.{0,10}ack"
     ]
    },
    {
     "label": "Server state/memory/queue exhausted",
     "patterns": [
      "memory|state|queue|ram"
     ]
    },
    {
     "label": "Cookie encoded in the SYN-ACK sequence number (hash)",
     "patterns": [
      "sequence|isn|seq"
     ]
    },
    {
     "label": "Server stores nothing until the final ACK and verifies/rebuilds it",
     "patterns": [
      "store|stateless"
     ]
    },
    {
     "label": "Analogy to HTTP cookies: client carries state for a stateless server",
     "patterns": [
      "http cookie|web cookie"
     ]
    }
   ],
   "modelAnswer": "In the TCP handshake the server receives a SYN, records a half-open connection (client seq, MSS and so on) in memory, sends SYN-ACK and waits for the final ACK. A SYN flood sends huge numbers of SYNs (often from spoofed addresses) and never ACKs, so the server's memory/SYN queue fills and real clients are refused. With SYN cookies the server stores nothing: it encodes the connection details (addresses, ports, time, MSS) as a keyed hash in the initial sequence number of its SYN-ACK. If a real ACK comes back, ack-1 is the cookie, which the server verifies and uses to rebuild the state, so it stays stateless until the handshake completes. This is the same idea as HTTP cookies: a stateless server hands state to the client, which sends it back, signed/opaque so it can't be forged.",
   "explanation": "Needs the attack mechanism, the resource exhausted, where the cookie lives, why it means no stored state, and the HTTP cookie analogy.",
   "id": "L02-s1"
  },
  {
   "q": "Compare loss-based TCP congestion control with BBR, and explain how video streaming apps use a similar idea.",
   "checks": [
    {
     "label": "Loss-based halves/reduces the window on loss",
     "patterns": [
      "halv|half|reduc|cut"
     ]
    },
    {
     "label": "Mentions sawtooth or Reno/CUBIC",
     "patterns": [
      "sawtooth|reno|cubic"
     ]
    },
    {
     "label": "BBR measures bandwidth and RTT",
     "patterns": [
      "rtt|round.?trip"
     ]
    },
    {
     "label": "Loss is not always congestion (Wi-Fi / random loss)",
     "patterns": [
      "wi.?fi|random|noise|not always"
     ]
    },
    {
     "label": "ABR / OTT picks bitrate from measured throughput",
     "patterns": [
      "bitrate|abr|quality"
     ]
    }
   ],
   "modelAnswer": "Loss-based algorithms (Reno, CUBIC) grow the congestion window until a packet is lost, then cut it (roughly halve it) and grow again. The window over time is the TCP sawtooth. They assume loss = congestion, but on Wi-Fi or long paths loss is often random noise, so throughput collapses needlessly. Google's BBR instead continuously measures the bottleneck bandwidth (bytes delivered per unit time) and the minimum round-trip time (RTT) and paces sending to match, so occasional loss doesn't stop it. OTT apps (YouTube, Hotstar, Netflix) use the same idea in adaptive bitrate (ABR): they measure how fast recent segments downloaded (size/time), smooth it (average, median or weighted average of the last few) and pick the video quality that fits. This happens at layer 7, so it works whichever TCP algorithm is underneath.",
   "explanation": "Contrast reacting to loss with measuring bandwidth and RTT, and connect it to ABR.",
   "id": "L02-s2"
  },
  {
   "q": "Calculate the TCP MSS on standard Ethernet and explain each number. Then explain why the window-scale option is needed and the maximum window it allows.",
   "checks": [
    {
     "label": "MTU 1500",
     "patterns": [
      "1500"
     ]
    },
    {
     "label": "20-byte IP and 20-byte TCP headers",
     "patterns": [
      "20"
     ]
    },
    {
     "label": "MSS 1460",
     "patterns": [
      "1460"
     ]
    },
    {
     "label": "Window field is 16 bits / 65535",
     "patterns": [
      "16.?bit|65,?535|64 ?kb"
     ]
    },
    {
     "label": "Scale = left shift / power of two, max ~1 GB",
     "patterns": [
      "shift|2\\^|power of two|1 ?gb|gib"
     ]
    }
   ],
   "modelAnswer": "Ethernet MTU = 1500 bytes is the largest IP packet. An IPv4 header without options is 20 bytes and a TCP header is 20 bytes, so MSS = 1500 - 20 - 20 = 1460 bytes of TCP payload per segment, announced in the SYN. The TCP window field is only 16 bits, max 65,535 bytes. On a high-bandwidth, high-RTT path you need more data in flight than that (bandwidth x RTT). The window-scale option, exchanged in the SYN, gives a left-shift count: the window is multiplied by 2^shift, and each shift doubles it. The maximum shift of 14 gives about 65,535 x 16,384, roughly 1 GB.",
   "explanation": "The arithmetic, the 16-bit limit, and the shift (power-of-two) semantics.",
   "id": "L02-s3"
  },
  {
   "q": "Walk through an FTP download in passive mode, including how the client computes the data port from `227 Entering Passive Mode (127,0,0,1,117,56)`. Why did passive mode replace active mode?",
   "checks": [
    {
     "label": "Control connection on port 21",
     "patterns": [
      "21"
     ]
    },
    {
     "label": "PASV command",
     "patterns": [
      "pasv|passive"
     ]
    },
    {
     "label": "Port computed as p1*256+p2 = 30008",
     "patterns": [
      "30008"
     ]
    },
    {
     "label": "RETR to download over the separate data connection",
     "patterns": [
      "retr"
     ]
    },
    {
     "label": "Active mode: server connects back (port 20) which breaks with NAT/firewalls",
     "patterns": [
      "nat|firewall"
     ]
    }
   ],
   "modelAnswer": "1. The client opens the control connection to port 21 and sends USER/PASS (plain text).\n2. It sends PASV. The server replies 227 with six numbers: the first four are the IP (127.0.0.1) and the last two are the port's high and low bytes, so port = 117*256 + 56 = 29952 + 56 = 30008.\n3. The client opens a second TCP connection to 127.0.0.1:30008 for data.\n4. It sends RETR file on the control connection, and the file bytes arrive over the data connection, which then closes.\nIn active mode the client told the server its own port and the server connected back from port 20. Connections coming in to the client are blocked by NAT and firewalls, so passive mode, where the client initiates both connections, replaced it.",
   "explanation": "Separate control and data channels, the byte arithmetic, and the NAT/firewall reason.",
   "id": "L02-s4"
  },
  {
   "q": "Explain why QUIC is built on UDP rather than being a modification of TCP, and what QUIC has to implement itself.",
   "checks": [
    {
     "label": "TCP lives in the kernel / OS (and middleboxes), so it is slow to change",
     "patterns": [
      "kernel|operating system|\\bos\\b"
     ]
    },
    {
     "label": "QUIC runs in user space / application libraries",
     "patterns": [
      "user.?space|librar|application"
     ]
    },
    {
     "label": "Implements reliability: retransmission/ordering/acks",
     "patterns": [
      "retransmi|reliab|ack"
     ]
    },
    {
     "label": "Implements congestion control",
     "patterns": [
      "congestion"
     ]
    },
    {
     "label": "Built-in TLS 1.3 / combined handshake",
     "patterns": [
      "tls|crypto|encrypt"
     ]
    }
   ],
   "modelAnswer": "TCP is implemented in the OS kernel (and baked into middleboxes), so changing it needs every OS and network device to upgrade, and every send/receive is a system call with a user-to-kernel context switch. UDP is minimal (ports, length, checksum) and passes through middleboxes, so QUIC builds on it and implements everything else in user space, in the application or library: reliability (ACKs, retransmission, ordering per stream), flow and congestion control, multiplexed streams, and a built-in TLS 1.3 handshake combined with the transport handshake (1 RTT, 0-RTT on resumption). That means browsers and servers can ship protocol improvements as ordinary software updates. It carries HTTP/3.",
   "explanation": "Kernel vs user space is the core argument, plus the list of responsibilities QUIC takes over.",
   "id": "L02-s5"
  },
  {
   "q": "Describe what happens when you send an email by hand to an SMTP server, and explain why email is not end-to-end secure. Mention the ports involved.",
   "checks": [
    {
     "label": "SMTP commands EHLO/HELO, MAIL FROM, RCPT TO, DATA",
     "patterns": [
      "mail from"
     ]
    },
    {
     "label": "Message ends with a lone dot line",
     "patterns": [
      "dot|\\."
     ]
    },
    {
     "label": "Ports 25 and 587/465",
     "patterns": [
      "587|465"
     ]
    },
    {
     "label": "Store-and-forward relays",
     "patterns": [
      "relay|store.?and.?forward"
     ]
    },
    {
     "label": "TLS protects only each hop",
     "patterns": [
      "hop"
     ]
    }
   ],
   "modelAnswer": "Connect with nc/telnet to the server (port 25 for relay, or 1025 on a test container; real submission uses 587 with STARTTLS or 465 with implicit TLS). Send EHLO (greeting), MAIL FROM:<sender> (envelope sender), RCPT TO:<recipient>, then DATA, the headers (From, To, Subject), a blank line and the body, and finally a line containing only a dot (.) to end the message: delimiter framing. QUIT closes. Gmail-style providers also require authentication plus SPF/DKIM. Email is not end-to-end secure because it is store-and-forward: the message passes through several relays, each of which terminates TLS, stores the plaintext and forwards it, possibly without TLS. TLS protects only each hop, not the content end to end, so sensitive content needs its own encryption.",
   "explanation": "The command sequence, the dot terminator, the ports, and the per-hop vs end-to-end distinction.",
   "id": "L02-s6"
  },
  {
   "q": "A colleague asks why Wi-Fi feels less reliable than a wired connection. Explain using what happens at layer 2, and contrast hubs, switches and Wi-Fi.",
   "checks": [
    {
     "label": "Hub broadcasts and causes collisions",
     "patterns": [
      "hub"
     ]
    },
    {
     "label": "Switch forwards by MAC",
     "patterns": [
      "switch"
     ]
    },
    {
     "label": "Radio can't listen while transmitting / can't detect collisions",
     "patterns": [
      "listen|detect"
     ]
    },
    {
     "label": "Random backoff and retransmission / ACK at layer 2",
     "patterns": [
      "backoff|back off|retr"
     ]
    },
    {
     "label": "Jitter / interference from shared channels",
     "patterns": [
      "jitter|interfer|channel"
     ]
    }
   ],
   "modelAnswer": "On wired Ethernet, an old hub repeated every frame to all ports, so simultaneous senders collided, detected it, backed off a random time and retried. A switch learns which MAC is on which port and forwards frames only there, so modern wired links are effectively collision-free. Wi-Fi is a shared radio medium, and a radio cannot listen while it transmits, so it cannot detect collisions. Instead it senses the channel, waits a random backoff, sends, and expects a layer-2 ACK, retransmitting if none arrives. Neighbouring routers on the same channel interfere with each other, so contention and retries vary the delay (jitter) and add loss, which is why Wi-Fi feels less reliable than a cable.",
   "explanation": "The hub/switch distinction, why Wi-Fi can't detect collisions, backoff/retry, and jitter.",
   "id": "L02-s7"
  }
 ],
 "subtitle": "",
 "quiz": [
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
  }
 ],
 "prev": {
  "num": 1,
  "file": "lecture-01.html"
 },
 "next": {
  "num": 3,
  "file": "lecture-03.html"
 }
};
