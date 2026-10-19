window.PAGE = {
 "num": 3,
 "title": "Server Side Considerations for scale",
 "summary": "How servers grew from serving one client at a time to serving thousands: fork per request, threads, pre-forked worker pools and the select() event loop, plus the limits (file descriptors, memory, context switches, queues) you hit on the way. It then traces dynamic web content from CGI to embedded modules to FastCGI, and surveys forward/reverse proxies, L4 vs L7 load balancing and the concurrency models of Apache, HAProxy, Varnish and nginx.",
 "notes": [
  {
   "heading": "Recap: the stateless pattern keeps coming back",
   "body": "The lecture opened with a theme the instructor stressed repeatedly: **the same problem shows up again and again, and the same solution gets reused (\"abused\") again and again.** Syntax does not matter (the instructor explicitly said to remind him of this if he ever asks syntax questions); the concept does.\n\nThe problem: a server does not want to keep per-client state (memory, slots) for every client that talks to it. The solution: hand the state back to the client and make the client bring it every time.\n\n- **TCP SYN cookie**: instead of storing a half-open connection after a SYN, the server encodes the connection info into its initial sequence number. A genuine client echoes it back in the final ACK, and only then does the server allocate state.\n- **Web (HTTP) cookie**: the server sets a cookie; the browser sends it with every later request so a stateless server can recognise the user/session.\n- **LLM chat APIs**: the model server keeps no conversation memory, so the client re-sends the entire conversation (the whole context) on every call.\n\nStateless servers are easy to scale (any server can answer any request), but the price is that the client must send context again and again."
  },
  {
   "heading": "Four ways to serve many clients at once",
   "body": "Our first echo server served exactly **one client at a time**. The lecture walked through how servers grew out of that.\n\n| Model | How it works | Cost / problem |\n|---|---|---|\n| Fork per request | `accept()` then `fork()`; the child serves that client | A full copy of the process per request; fine at \"1999 scale\", broke around 2000, dead by ~2007 |\n| Thread per request | Spawn a thread per connection | Much cheaper than a process, but multithreaded code brings race conditions, deadlocks, livelocks |\n| Pre-fork / worker pool | Create N processes or threads **in advance**; each takes the next connection | No fork on the hot path; parent must monitor and respawn dead workers |\n| Workers + event loop | Each pre-created worker runs `select`/`poll`/`epoll` to serve many connections | Very efficient if each request is short-lived; one slow handler stalls its loop |\n\nThe instructor's rough feel for the difference: if a fork-based server does ~**200 TPS**, a thread-based one will probably do ~**2000 TPS** or more.\n\n### Worker pool analogy: a bank\nA bank has 5 to 6 counters (workers). Each customer (task) waits in one line and goes to whichever worker becomes free next. Software worker pools work the same way: a fixed set of workers, a queue of tasks, the next free worker picks the next task.\n\nModern servers combine the ideas: a **pool of processes or threads created at startup, each running its own event loop** (select/epoll) so that one worker can serve many clients."
  },
  {
   "heading": "fork() refresher and why it is expensive",
   "body": "- `fork()` creates a **copy of the current program**: stack, heap, globals and open file descriptors are all copied.\n- You tell the copies apart by the return value: the **child gets 0**, the **parent gets the child's PID** (which it can use to monitor or reap the child); -1 means failure.\n- In a forking server, `accept()` returns a new connected file descriptor; after `fork()` the child uses that descriptor and the parent closes its copy and goes back to `accept()`.\n- After the fork the processes do not talk to each other unless you work hard (pipes, shared memory), so they are naturally **isolated**: one child crashing does not hurt the others.\n\n### The shell does fork + exec\nWhen you type a command, the shell **forks** itself and the child **execs** the new program. If the shell is 5 MB, you briefly need 10 MB, then the copy is thrown away and replaced by the new program: wasteful. (`vfork`/`posix_spawn` style calls exist to reduce this.)\n\n**Beyond the lecture:** modern kernels use copy-on-write, so pages are only physically copied when one side writes to them; but page tables, process creation and teardown still cost far more than handling a request in an existing worker."
  },
  {
   "heading": "select(): the original event loop",
   "body": "The instructor showed a C echo server that serves many clients from **one process, one thread** using `select()`. Setup is the usual `socket(AF_INET, SOCK_STREAM, 0)`, `htons(port)`, `bind`, `listen`; the new part is the loop.\n\n```c\nfd_set readfds;\nwhile (1) {\n    FD_ZERO(&readfds);                 /* clear the set: rebuilt every iteration */\n    FD_SET(server_fd, &readfds);       /* register the listening socket */\n    int max_fd = server_fd;\n    for (int i = 0; i < n_clients; i++) {\n        FD_SET(clients[i], &readfds);  /* register every connected client */\n        if (clients[i] > max_fd) max_fd = clients[i];\n    }\n    select(max_fd + 1, &readfds, NULL, NULL, NULL);   /* (demo: no write set, no timeout) */\n\n    if (FD_ISSET(server_fd, &readfds))           /* new connection waiting */\n        clients[n_clients++] = accept(server_fd, NULL, NULL);\n\n    for (int i = 0; i < n_clients; i++)          /* O(n) scan of all clients */\n        if (FD_ISSET(clients[i], &readfds)) {\n            int n = recv(clients[i], buf, sizeof buf, 0);\n            send(clients[i], buf, n, 0);         /* echo back */\n        }\n}\n```\n\nKey ideas:\n- `fd_set` is a **bitmask** of descriptors; `FD_ZERO` clears it, `FD_SET` adds one, `FD_ISSET` tests one. Registering descriptors is the observer / pub-sub pattern: \"tell me when any of these has an event\".\n- Signature: `select(nfds, readfds, writefds, exceptfds, timeout)` where `nfds` = highest descriptor + 1.\n- **select returns for one of four reasons:** a descriptor is **readable** (new data, or a new connection on the listening socket), **writable**, has an **exception/error**, or the **timeout** expired.\n- If the listening socket is readable, the server must `accept()`; otherwise it loops over clients and reads/writes those that are ready.\n- `select` modifies the set in place, so the set is **rebuilt every loop** (keeping a master copy and working on a throw-away copy is a common pattern).\n- The demo omitted the write set and the timeout; the instructor called both bad practice. **A NULL timeout means block forever.** You should always pass a timeout (it also gives you a periodic chance to clean up).\n- The point: **a single loop, with no extra processes, now serves multiple clients.** This is the earliest form of the event loop / asynchronous programming.\n\nStandard file descriptor numbers: 0 = stdin, 1 = stdout, 2 = stderr, so the first socket you open is usually 3."
  },
  {
   "heading": "Limits of select, and its successors",
   "body": "- **`FD_SETSIZE` defaults to 1024**: a select set can hold descriptors 0..1023 only. Raising it needs rebuilding/kernel-level changes. Check per-process limits with `ulimit -a` (open files: `ulimit -n`).\n- Each call is **O(n)**: you rebuild the set, the kernel scans every registered descriptor whether ready or not, and your code scans them all again with `FD_ISSET`.\n- Successors: **`poll`** (no 1024 cap, still O(n)), **`epoll`** on Linux (only ready descriptors are returned), **`kqueue`** on BSD/macOS, and **`io_uring`** on newer Linux (a ring of submissions/completions instead of a single call). They differ in implementation; the concept is the same event loop.\n- **The C10K problem**: how to serve 10,000 concurrent connections on one machine. Fork/thread per connection and plain select could not; event loops with epoll/kqueue did.\n\n### The slow-handler problem\nIf one client's handler is slow (e.g. it sleeps for 10 seconds), the loop cannot get back to `select()`, so **every other client waits**, even ones whose data is ready. Under load this shows up as rising latency; work piles up, memory grows, and the server can crash."
  },
  {
   "heading": "Cooperative vs preemptive multitasking",
   "body": "A single-threaded event loop has **no scheduler**: each handler must do a little work and return quickly so others get a turn. This is **cooperative multitasking**: if a task does not cooperate, it hogs the CPU. Whole operating systems once worked like this, and games use such loops heavily.\n\n- **Python generators and `yield`** are the classic cooperative mechanism: \"I am done for now, take the CPU back\".\n- **Preemptive multitasking** is what modern OSes do: the **kernel** owns the schedule and will switch away from a task even if it gets stuck (except while it is inside certain system calls).\n\nSo: event loop = cooperative inside your process; threads/processes = preemptively scheduled by the kernel."
  },
  {
   "heading": "Worker pools in the wild, and timeouts",
   "body": "- **Chrome** uses a **separate process per tab** (a brave choice the lecture contrasted with the earlier thread-based approach of Mozilla). A crashing tab does not kill the browser, at the cost of lots of RAM (Chrome often uses GBs).\n- Typical server startup: **pre-fork a pool of workers** (processes or threads), each running a select/epoll loop and accepting connections. If one worker process dies, the others keep serving. If all die and only the parent is left, you are in trouble, so the **parent watches and respawns** workers as needed.\n- **Apache httpd** calls these pluggable strategies **MPMs (Multi-Processing Modules)**. **nginx** uses a master + worker processes.\n- **Go goroutines** and **Java virtual threads (Java 19+/21)** give you the same effect behind the scenes: cheap logical threads multiplexed onto a few OS threads with an event loop underneath.\n\n### Never wait indefinitely\nTimeouts are important everywhere. Example from the lecture: Go's default HTTP client has **no timeout** (it can wait forever), so always construct your own client with a timeout. In `select`, a NULL timeout blocks forever."
  },
  {
   "heading": "CGI: Apache emulating the shell",
   "body": "**CGI (Common Gateway Interface)** is one of the oldest ways web servers made the web dynamic. A request for something like `/xyz.cgi` makes the server (Apache httpd, `mod_cgi`) do exactly what a shell does: **fork + exec** the program for every request.\n\nHow the request and response are wired:\n- **Request body -> stdin** of the program (the server creates a pipe, like a shell pipe `a | b`). For POST, the body comes after the headers and the blank line (CRLF CRLF), and can be binary.\n- **stdout -> response**: the program just writes to stdout; the web server reads it and relays it to the client.\n- **stderr -> server error log.**\n- **HTTP headers and request info -> environment variables** (plus command-line args are possible).\n\n| Environment variable | Comes from |\n|---|---|\n| `REQUEST_METHOD` | GET / POST ... |\n| `QUERY_STRING` | everything after `?` in the URL |\n| `HTTP_USER_AGENT` | `User-Agent` header (every header becomes `HTTP_` + upper-case name) |\n| `HTTP_REFERER` | `Referer` header (misspelled in the original RFC; the spelling stuck) |\n| `SERVER_PROTOCOL`, `SERVER_PORT`, `REQUEST_URI`, `SCRIPT_NAME`, `PATH_INFO`, `GATEWAY_INTERFACE` | request/server details |\n\nBecause a CGI program only sees env vars and stdin, you can **test it without a web server**: `export REQUEST_METHOD=GET QUERY_STRING=...` in a shell script and run the program.\n\nThe program's output must **start with headers**, at least `Content-Type: text/html`, then a blank line, then the body. The classic beginner mistake (PHP/Perl/C) was printing content first: Apache then fails the request with a **500 Internal Server Error**.\n\nShell aside from the lecture: `$?` holds the exit status of the last command (0 = success)."
  },
  {
   "heading": "From CGI to modules to FastCGI",
   "body": "CGI forks and execs a fresh process (copying, say, 5 MB of RAM and throwing it away) on **every request**, so there is a fixed latency no matter how good your C++ is.\n\n1. **Embedded modules** (`mod_php`, `mod_perl`): load the interpreter into Apache as a dynamically loaded shared module. No fork per request, but now app code lives inside the web server.\n2. **FastCGI**: keep the CGI conventions (same variable names, stdin/stdout ideas) but **do not destroy the program after each request**: it runs persistently and receives many requests over a socket. **PHP-FPM** (FastCGI Process Manager) was and still is the popular implementation.\n\nThe resulting architecture, still used everywhere:\n\n```\nclient --HTTP--> nginx / Apache httpd --HTTP or FastCGI--> app server (PHP-FPM, Gunicorn, Express, Jetty, Tomcat)\n                 (handles slow clients, buffering)          (long-running, no fork per request)\n```\n\n- The front server deals with **slow connections**: a slow client reading a response would otherwise tie up an app worker's memory. The front server absorbs the response quickly and trickles it out. App developers no longer need to understand buffering and slow clients.\n- Between front and app server you can use plain HTTP or FastCGI (a pre-parsed, smaller vocabulary).\n\n### FastCGI wire format\n- Data travels as **records**; every record header carries the **content length** (length-prefixed framing).\n- An **empty record** (length 0) marks the end of a stream: it is the delimiter.\n- Params are still CGI names (`REQUEST_METHOD`, `QUERY_STRING`, `SCRIPT_NAME`...), no longer env vars but name-value pairs; the request body travels in the `FCGI_STDIN` stream and the response in `FCGI_STDOUT`.\n- The instructor admitted his slide simplified the layout and suggested capturing real FastCGI traffic with tcpdump/Wireshark.\n\n**Beyond the lecture:** a FastCGI record header is 8 bytes: version, type, request ID (2 bytes), content length (2 bytes), padding length, reserved."
  },
  {
   "heading": "App servers, non-HTTP protocols and protocol-aware proxies",
   "body": "- **Java servlets**: Tomcat/Jetty speak HTTP and hand each request to a servlet; Spring Boot still sits on a servlet (**Beyond the lecture:** the front-controller servlet is Spring's `DispatcherServlet`). Java's threading model made pre-created threads the norm.\n- HTTP is everywhere: home Wi-Fi routers and modems have admin web servers, agent tools and config UIs expose HTTP, Kafka has REST proxies, Firestore exposes DB operations over the web.\n- **But not everything is HTTP**: Redis, MySQL, Postgres, MQTT (IoT), Kafka and many messaging back ends use their own text or binary protocols.\n\n### Protocol-aware proxies\nDatabases have a **number-of-connections problem** (every connection costs a descriptor and memory). Proxies such as **AWS RDS Proxy** and Twitter's memcache/Redis proxy accept 10,000 to 20,000 client connections but open only a **limited pool of connections to the upstream DB** (connection pooling), so the DB does database work, not networking work. They can also cache results.\n\nIf you understand a protocol (e.g. by reading it in tcpdump), you can build a proxy for it, and there are proxies for Redis, Postgres, MySQL and practically everything else."
  },
  {
   "heading": "The four limits you hit when scaling a server",
   "body": "Web servers scale because they are **stateless**; try hard to keep yours stateless. Even so, every server hits these limits:\n\n1. **File descriptors**: every connection is a descriptor (select caps at 1024; per-process `ulimit -n`). Largely solved by tuning limits.\n2. **Memory**: a forked process is a full copy; an OS thread reserves a large stack (commonly up to **8 MB**); goroutines start tiny and grow only when they do a lot of work.\n3. **Context switches**: switching between processes/threads saves and restores state, and every `read`/`write` crosses the **user <-> kernel boundary**, copying data each time.\n4. **Queue / number of in-flight requests**: the listen backlog and request queue; beyond it, requests are rejected or dropped.\n\nSome people argue the ultimate fix is **kernel bypass** (doing networking in user space).\n\n### Zero copy with sendfile\nServing a file the naive way: `read()` the file (kernel -> user copy), then `write()` it to the socket (user -> kernel copy): two crossings and two copies for no reason. **`sendfile(socket, file, ...)`** tells the kernel \"send this file on this socket\", so the bytes never enter user space. nginx uses it. (The system call still happens; the useless copying does not.)\n\n```\nnaive:     disk -> kernel page cache -> user buffer -> kernel socket buffer -> NIC\nsendfile:  disk -> kernel page cache --------------> kernel socket buffer -> NIC\n```\n\nGo and Erlang became popular for servers because they can run huge numbers of concurrent tasks **without bloating memory**."
  },
  {
   "heading": "Latency drives concurrency, and slow connections",
   "body": "The instructor stressed a point people miss: **the number of simultaneous requests depends on latency, and it feeds on itself.**\n\n**Little's law** (standard name for the relationship): concurrent requests in flight = arrival rate x time each request takes.\n\n- 1,000 requests/s x 0.1 s = **100** requests in flight.\n- Latency slips to 0.2 s: **200** in flight, twice the memory, threads and descriptors.\n- More in flight -> more memory and contention -> even slower -> even more in flight. Many systems crash from exactly this spiral.\n\nSo the rule is: event loops and worker pools are easy **when requests are short-lived**. When requests take long, either memory grows (more workers) or the queue grows (more latency).\n\n### Slow connections and slow disconnects\n- **Keep-alive / persistent connections** save handshakes, but an idle open socket still occupies a descriptor and, in a process/thread-per-connection server, a whole worker.\n- After a close, the kernel may keep the socket around (the 4-way FIN close and its waiting states), so the resource is not freed immediately.\n- Hence: **you need more threads, processes and file descriptors than you think you need**, because of slow clients and slow disconnects."
  },
  {
   "heading": "Proxies: forward vs reverse, L4 vs L7",
   "body": "### Forward proxies (client side)\nWhen images exploded on the early web, ISPs deployed **caching proxies** (e.g. Squid) and told customers to configure them in the browser's proxy settings. If your neighbour already fetched an image, the ISP served it from cache instead of paying for upstream bandwidth again. Colleges did the same. The instructor called them the original \"jugaad\". Every browser still has a proxy setting (tools like Charles Proxy use it for debugging).\n\n### Reverse proxies (server side)\nSame idea, placed **next to the servers**: a client connects to the proxy, which forwards to one of several upstream servers and can keep a small cache: a **caching reverse proxy**. It was named \"reverse\" because \"proxy\" was already taken by the forward kind. nginx and Varnish are the big ones.\n\n### Layer 4 vs layer 7 load balancing\n- Early load balancers were mostly **hardware, layer 4**: they see **IP + port** and pick one of N backends.\n- **Layer 7** balancers understand HTTP: they can route by **Host header**, path or **cookies**. Since one IP can host many websites, L7 was badly needed. That need is what made **HAProxy** explode onto the scene after the dot-com bust: a software L7 load balancer that is also good at handling slow connections and keeping persistent connections to backends.\n- (Layer 3 = routing on IP addresses alone, which routers do.)"
  },
  {
   "heading": "The big four servers compared",
   "body": "| Server | Concurrency model | Origin / strength |\n|---|---|---|\n| **Apache httpd** | Pre-fork worker pool (MPMs), later threads + event | The original web server of the dot-com boom; CGI, `mod_*` modules |\n| **HAProxy** | Started with select, moved to epoll, recently epoll + multithreaded | Software L4/L7 load balancer / HTTP proxy |\n| **Varnish** | An **acceptor thread + one worker thread per active connection**, no select inside the thread | Caching reverse proxy configured in **VCL**; great at caching but can run out of threads/RAM sooner. Fastly's edge still uses VCL |\n| **nginx** | **Master + one worker per core, each running one epoll loop**; `sendfile` for files | Reverse proxy, load balancer, cache; many CDNs are built on it |\n\nIf you join a company with a few million users you will meet these in one form or another. (The lecture's next class is a full nginx deep dive.)\n\nSuggested practice from the lecture (optional): load-test the fork, thread and select servers (netcat loops or an HTTP load tester) and compare how many simultaneous connections each takes; run a CGI program in Docker; capture FastCGI traffic in tcpdump/Wireshark; add artificial latency and watch requests pile up and memory grow."
  },
  {
   "heading": "Quick revision",
   "body": "- Recurring pattern: to stay stateless, give state to the client (SYN cookie, web cookie, LLM context).\n- Fork per request -> thread per request -> pre-fork pool -> pool of workers each running an event loop.\n- Rough instructor numbers: fork ~200 TPS, threads ~2000 TPS.\n- `fork()` returns 0 in the child, the child's PID in the parent, -1 on error.\n- Shell runs a program with fork + exec.\n- `select(nfds, read, write, except, timeout)`; nfds = max fd + 1; returns on readable, writable, exception or timeout.\n- `FD_ZERO`, `FD_SET`, `FD_ISSET`; the set is rebuilt each loop; scanning is O(n).\n- `FD_SETSIZE` = 1024 by default; check limits with `ulimit -a`.\n- NULL timeout = block forever; always set timeouts (Go's default HTTP client has none).\n- One slow handler stalls a single-threaded event loop (cooperative multitasking).\n- epoll (Linux), kqueue (BSD/macOS), io_uring: better versions of the same event-loop idea; C10K = 10,000 concurrent connections.\n- CGI: fork+exec per request; body on stdin, response on stdout, errors on stderr, headers as `HTTP_*` env vars.\n- CGI output must begin with headers (Content-Type) + blank line, otherwise 500.\n- FastCGI: persistent app process (PHP-FPM); length-prefixed records; empty record ends a stream.\n- Four scaling limits: file descriptors, memory, context switches, queue/backlog.\n- `sendfile` avoids copying file data through user space.\n- In-flight requests = rate x latency, so slower responses mean more concurrency and a downward spiral.\n- Forward proxy = client side (ISP/college cache); reverse proxy = server side (nginx, Varnish).\n- L4 LB: IP + port; L7 LB: Host header, path, cookies (HAProxy).\n- Apache = pre-fork pool; HAProxy = select -> epoll (+threads); Varnish = thread per active connection; nginx = master + worker per core with epoll."
  },
  {
   "heading": "Exam traps",
   "body": "- **fork return values**: the child gets **0**, not its own PID; the parent gets the **child's** PID.\n- **select's first argument** is the highest descriptor **+ 1**, not the number of descriptors you registered.\n- **select returns because of an event or a timeout**; it does not tell you which descriptor, so you must test each with `FD_ISSET`.\n- **NULL timeout** does not mean \"return immediately\"; it means **wait forever** (a zero-valued timeval means poll and return immediately).\n- **An event loop is not parallel**: one slow handler blocks everyone in that loop. Concurrency is not parallelism.\n- **CGI does not use argv for headers**: headers arrive as environment variables; the body arrives on stdin.\n- **FastCGI is not \"faster CGI per request\" by magic**: its win is that the process stays alive (no fork+exec per request).\n- **sendfile still makes a system call**; what it saves is the user-space copy (and extra crossings).\n- **Forward vs reverse proxy**: ISP/college caches act for clients (forward); nginx/Varnish in front of your servers act for servers (reverse).\n- **L4 balancers cannot route by hostname or cookie**: they only see IP and port; that needs L7.\n- **Little's law direction**: higher latency at the same arrival rate means **more** concurrent requests, not fewer.\n- **Varnish vs nginx**: Varnish dedicates a thread to every active connection; nginx multiplexes thousands of connections per worker with epoll."
  }
 ],
 "keyTerms": [
  {
   "term": "Stateless server",
   "def": "A server that keeps no per-client state between requests; the client re-sends whatever context is needed (cookies, SYN cookies, LLM context)."
  },
  {
   "term": "fork()",
   "def": "System call that copies the current process; returns 0 in the child and the child's PID in the parent."
  },
  {
   "term": "Pre-fork / worker pool",
   "def": "Creating a fixed set of worker processes or threads in advance; each takes the next task when free."
  },
  {
   "term": "select()",
   "def": "System call that blocks until any registered descriptor is readable, writable or has an error, or a timeout expires."
  },
  {
   "term": "fd_set",
   "def": "Bitmask of file descriptors used by select(); manipulated with FD_ZERO, FD_SET, FD_ISSET; capped at FD_SETSIZE (1024)."
  },
  {
   "term": "Event loop",
   "def": "A single thread repeatedly waiting for I/O events and running short handlers for each ready connection."
  },
  {
   "term": "epoll / kqueue / io_uring",
   "def": "Scalable successors of select on Linux, BSD/macOS and newer Linux that avoid scanning every descriptor."
  },
  {
   "term": "C10K problem",
   "def": "The challenge of serving 10,000 concurrent connections on a single machine."
  },
  {
   "term": "Cooperative multitasking",
   "def": "Tasks voluntarily yield control (e.g. Python yield, event-loop handlers); a task that does not yield blocks others."
  },
  {
   "term": "Preemptive multitasking",
   "def": "The kernel scheduler switches tasks whether or not they are finished."
  },
  {
   "term": "CGI",
   "def": "Common Gateway Interface: web server fork+execs a program per request, passing headers as env vars, body on stdin, response on stdout."
  },
  {
   "term": "FastCGI",
   "def": "CGI-compatible protocol where a persistent application process (e.g. PHP-FPM) receives many requests as length-prefixed records over a socket."
  },
  {
   "term": "PHP-FPM",
   "def": "FastCGI Process Manager, the common persistent FastCGI runtime for PHP behind nginx or Apache."
  },
  {
   "term": "MPM",
   "def": "Apache httpd's Multi-Processing Module: the pluggable concurrency strategy (prefork, worker, event)."
  },
  {
   "term": "Context switch",
   "def": "Saving one task's state and loading another's; also the cost of crossing the user/kernel boundary on every read/write."
  },
  {
   "term": "sendfile()",
   "def": "Zero-copy system call that has the kernel send a file directly to a socket without copying it through user space."
  },
  {
   "term": "Little's law",
   "def": "Average requests in flight = arrival rate x time per request; higher latency means more concurrency."
  },
  {
   "term": "Forward proxy",
   "def": "Proxy acting for clients (e.g. ISP/college Squid cache saving upstream bandwidth)."
  },
  {
   "term": "Reverse proxy",
   "def": "Proxy in front of servers that forwards client requests to upstreams and can cache (nginx, Varnish)."
  },
  {
   "term": "L4 vs L7 load balancer",
   "def": "L4 balances on IP and port; L7 understands the application protocol and can route on Host header, path or cookies."
  },
  {
   "term": "Connection-pooling proxy",
   "def": "Proxy (e.g. RDS Proxy) that multiplexes many client connections over a small pool of upstream DB connections."
  },
  {
   "term": "VCL",
   "def": "Varnish Configuration Language, also used by Fastly's edge."
  }
 ],
 "mcqs": [
  {
   "q": "In a forking server, what does `fork()` return inside the child process?",
   "options": [
    "The child's own PID",
    "0",
    "The parent's PID",
    "-1"
   ],
   "answer": 1,
   "explanation": "fork() returns twice: 0 in the child and the child's PID in the parent, so each copy can tell which role it plays.",
   "distractors": "The child's PID goes to the parent; -1 only signals failure.",
   "source": "lecture",
   "id": "L03-m1"
  },
  {
   "q": "Which of these is NOT one of the reasons `select()` returns?",
   "options": [
    "A registered descriptor became readable",
    "A registered descriptor became writable",
    "The timeout expired",
    "The server process forked a new child"
   ],
   "answer": 3,
   "explanation": "select() returns when a watched descriptor is readable, writable or has an exceptional condition, or when the timeout expires.",
   "distractors": "Readable, writable and timeout are exactly the documented wake-up reasons; forking has nothing to do with the watched sets.",
   "source": "lecture",
   "id": "L03-m2"
  },
  {
   "q": "What is the default `FD_SETSIZE` that caps which descriptors a `select()` set can hold?",
   "options": [
    "1024",
    "256",
    "4096",
    "65535"
   ],
   "answer": 0,
   "explanation": "fd_set is a fixed bitmask with FD_SETSIZE = 1024 bits by default, so only descriptors 0..1023 fit; poll/epoll remove this cap.",
   "distractors": "65535 is the TCP port limit, not the select limit; 256 and 4096 are made-up values here.",
   "source": "lecture",
   "id": "L03-m3"
  },
  {
   "q": "A single-threaded select() echo server has 50 clients. One client's handler sleeps for 10 seconds. What happens?",
   "options": [
    "Only that client is delayed; the kernel preempts the handler and serves the others",
    "select() automatically times out the slow handler after its timeout",
    "All other clients wait, because the loop cannot return to select() until that handler finishes",
    "New connections queue up, but already-connected clients keep being served"
   ],
   "answer": 2,
   "explanation": "An event loop is cooperative: there is no scheduler inside the loop, so a slow handler blocks every other client, including already-connected ones.",
   "distractors": "Kernel preemption only switches between threads/processes, not between handlers inside one loop; select's timeout only bounds the wait inside select().",
   "source": "lecture",
   "id": "L03-m4"
  },
  {
   "q": "What does passing `NULL` as the timeout argument to `select()` mean?",
   "options": [
    "Return immediately (pure polling)",
    "Use the system default timeout of 30 seconds",
    "Block indefinitely until some descriptor is ready",
    "Fail with an invalid-argument error"
   ],
   "answer": 2,
   "explanation": "A NULL timeout pointer means wait forever; the lecture called this bad practice and said to always pass a timeout.",
   "distractors": "Immediate return requires a timeval set to zero, not NULL; there is no 30-second default.",
   "source": "lecture",
   "id": "L03-m5"
  },
  {
   "q": "How does a CGI program send its HTTP response back to the client?",
   "options": [
    "It writes to its standard output, and the web server reads that and relays it to the client",
    "It writes directly to the client socket passed in argv[1]",
    "It sets a RESPONSE_BODY environment variable",
    "It returns the body as its process exit status"
   ],
   "answer": 0,
   "explanation": "CGI mirrors a shell pipeline: request body on stdin, response on stdout, errors on stderr; the web server owns the actual socket.",
   "distractors": "The program never sees the socket, environment variables flow only into the program, and exit codes are small integers.",
   "source": "lecture",
   "id": "L03-m6"
  },
  {
   "q": "Under CGI, how does the script see the request's `User-Agent` header?",
   "options": [
    "As the environment variable USER_AGENT",
    "As argv[2]",
    "As the first line read from stdin",
    "As the environment variable HTTP_USER_AGENT"
   ],
   "answer": 3,
   "explanation": "CGI converts each request header to an environment variable named HTTP_ + the upper-cased header name (dashes become underscores).",
   "distractors": "Without the HTTP_ prefix it is not the CGI convention; stdin carries only the request body.",
   "source": "lecture",
   "id": "L03-m7"
  },
  {
   "q": "A CGI script prints `Hello` as its very first output, with no headers. What does the client typically get from Apache?",
   "options": [
    "200 OK with Content-Type: text/plain",
    "500 Internal Server Error, because the script's output must start with headers and a blank line",
    "404 Not Found",
    "200 OK, because Apache adds Content-Type: text/html automatically"
   ],
   "answer": 1,
   "explanation": "Apache parses the script's output as headers first; garbage instead of a Content-Type header means malformed headers, which is reported as a 500.",
   "distractors": "Apache does not invent headers for plain CGI, and the script was found, so 404 is wrong.",
   "source": "lecture",
   "id": "L03-m8"
  },
  {
   "q": "What is the main performance advantage of FastCGI (e.g. PHP-FPM) over classic CGI?",
   "options": [
    "The application process stays alive and serves many requests, avoiding fork+exec per request",
    "It encrypts traffic between web server and application",
    "It replaces HTTP between the browser and the web server",
    "It removes the CGI variable names like REQUEST_METHOD"
   ],
   "answer": 0,
   "explanation": "CGI pays a fixed fork+exec cost per request; FastCGI keeps a persistent process and talks to it over a socket.",
   "distractors": "FastCGI is unencrypted, sits only between web server and app, and still uses the CGI variable names.",
   "source": "lecture",
   "id": "L03-m9"
  },
  {
   "q": "How does FastCGI frame its data on the wire?",
   "options": [
    "CRLF-delimited text lines like HTTP/1.1 headers",
    "Fixed 512-byte blocks",
    "Records whose headers carry a content length; an empty record marks the end of a stream",
    "One JSON object per request"
   ],
   "answer": 2,
   "explanation": "FastCGI is length-prefixed: each record header states the content length, and a zero-length record is the end-of-stream delimiter.",
   "distractors": "CRLF lines are HTTP/1.1's style; FastCGI is binary and variable-length, not JSON or fixed blocks.",
   "source": "lecture",
   "id": "L03-m10"
  },
  {
   "q": "A service receives 1,000 requests/s and each takes 100 ms. Latency degrades to 300 ms while the arrival rate stays the same. On average, how many requests are in flight now?",
   "options": [
    "100",
    "1,000",
    "3,333",
    "300"
   ],
   "answer": 3,
   "explanation": "In-flight = rate x latency = 1000/s x 0.3 s = 300 (up from 100). Slower responses multiply memory, threads and descriptors in use.",
   "distractors": "100 is the old value; 1,000 confuses rate with concurrency; 3,333 divides instead of multiplying.",
   "source": "lecture",
   "id": "L03-m11"
  },
  {
   "q": "You must send `shop.example.com` and `blog.example.com` (same IP, same port 443) to different backend pools. What do you need?",
   "options": [
    "A layer-3 router",
    "A layer-7 load balancer that reads the Host header (or TLS SNI)",
    "A layer-4 load balancer that looks at IP and port",
    "A shorter DNS TTL"
   ],
   "answer": 1,
   "explanation": "Both names share IP and port, so only something that understands the application layer (Host header) can tell them apart; that need is what made HAProxy popular.",
   "distractors": "L3/L4 devices see identical IP/port tuples; DNS cannot help when both names resolve to the same IP.",
   "source": "lecture",
   "id": "L03-m12"
  },
  {
   "q": "Why did ISPs and colleges deploy forward caching proxies such as Squid in the early web?",
   "options": [
    "To hide their web servers' IP addresses from clients",
    "To terminate TLS on behalf of origin servers",
    "To load-balance traffic across origin servers",
    "To serve repeated content (especially images) from cache and save upstream bandwidth"
   ],
   "answer": 3,
   "explanation": "A forward proxy acts for clients: if a neighbour already downloaded an image, it is served locally, so the ISP does not pay for upstream transfer again.",
   "distractors": "Hiding servers, terminating TLS and balancing across origins are reverse-proxy jobs on the server side.",
   "source": "lecture",
   "id": "L03-m13"
  },
  {
   "q": "Which concurrency model did the lecture attribute to Varnish?",
   "options": [
    "A master process plus one epoll worker per CPU core",
    "An acceptor thread plus one worker thread per active connection",
    "A pre-forked pool of processes with one connection each",
    "A single-threaded select() loop"
   ],
   "answer": 1,
   "explanation": "Varnish dedicates a thread to each active connection, which is great for caching but can run out of threads or RAM sooner.",
   "distractors": "Master + epoll per core is nginx; pre-fork pool is classic Apache; single select loop is the toy echo server.",
   "source": "lecture",
   "id": "L03-m14"
  },
  {
   "q": "What does `sendfile()` save compared with `read()` followed by `write()` when serving a static file?",
   "options": [
    "Copying the file's bytes into user space and back into the kernel",
    "The TCP handshake for the connection",
    "Compressing the file before sending",
    "The need for any system call at all"
   ],
   "answer": 0,
   "explanation": "With read/write the data goes kernel -> user buffer -> kernel; sendfile lets the kernel move it from page cache to the socket directly.",
   "distractors": "It is still a system call, it does not compress, and the handshake happens regardless.",
   "source": "lecture",
   "id": "L03-m15"
  },
  {
   "q": "Why does Chrome run each tab as a separate process rather than a thread?",
   "options": [
    "Because processes use less memory than threads",
    "Because threads cannot render HTML",
    "So that one tab crashing or misbehaving cannot take down the others (isolation), at the cost of more memory",
    "Because processes avoid all context switches"
   ],
   "answer": 2,
   "explanation": "Forked processes are isolated from each other; Chrome accepts the RAM cost (often GBs) for that isolation.",
   "distractors": "Processes use more memory than threads and switching between them is costlier, not free.",
   "source": "lecture",
   "id": "L03-m16"
  },
  {
   "q": "What is the main job of a database connection-pooling proxy such as AWS RDS Proxy?",
   "options": [
    "Encrypt queries with TLS end to end",
    "Shard the database automatically",
    "Accept many client connections but use a small pool of upstream connections, so the DB spends its resources on queries",
    "Replace the database with an in-memory cache"
   ],
   "answer": 2,
   "explanation": "Every DB connection costs a descriptor and memory; the proxy multiplexes thousands of clients over few upstream connections (and may cache).",
   "distractors": "Encryption and sharding are separate concerns, and caching is only an add-on, not a replacement for the DB.",
   "source": "lecture",
   "id": "L03-m17"
  },
  {
   "q": "Python generators that `yield` control back are an example of which idea from the lecture?",
   "options": [
    "Cooperative multitasking",
    "Preemptive multitasking by the kernel",
    "Hardware interrupts",
    "Copy-on-write forking"
   ],
   "answer": 0,
   "explanation": "A generator voluntarily gives up the CPU; nothing forces it to, just like handlers in an event loop.",
   "distractors": "Preemption is imposed by the kernel scheduler, not volunteered by the task.",
   "source": "lecture",
   "id": "L03-m18"
  },
  {
   "q": "How does a Unix shell run a command such as `code` or `ls`?",
   "options": [
    "exec() the program directly in the shell process",
    "fork() a copy of itself, then exec() the new program in the child",
    "Create a new thread and load the program into it",
    "Register the program with select() and wait"
   ],
   "answer": 1,
   "explanation": "Fork + exec is how the shell (and CGI servers emulating it) start programs; the temporary copy is why it is wasteful.",
   "distractors": "Exec alone would replace the shell itself; threads cannot run a different executable.",
   "source": "lecture",
   "id": "L03-m19"
  }
 ],
 "short": [
  {
   "q": "Explain why fork-per-request stopped scaling and how a pre-forked worker pool (with event loops) fixes it.",
   "checks": [
    {
     "label": "fork copies the process (memory)",
     "patterns": [
      "cop(y|ies)",
      "memory",
      "\\bram\\b"
     ]
    },
    {
     "label": "cost paid on every request",
     "patterns": [
      "every request",
      "per.request",
      "each request"
     ]
    },
    {
     "label": "workers created in advance / pool",
     "patterns": [
      "pre.?fork",
      "in advance",
      "pool"
     ]
    },
    {
     "label": "workers reused for many requests / event loop",
     "patterns": [
      "reus",
      "many (requests|clients|connections)",
      "event loop",
      "select|epoll"
     ]
    }
   ],
   "modelAnswer": "fork() creates a full copy of the server process (stack, heap, descriptors), so fork-per-request pays process creation, memory and teardown on every request. That was fine at 1999 traffic but collapsed as concurrency grew (high latency, RAM exhaustion).\nA pre-forked worker pool creates N processes or threads in advance at startup, so nothing is forked on the hot path; the parent just monitors and respawns dead workers. Each worker is reused for many requests, and if each runs an event loop (select/epoll) it can serve many clients at once.",
   "explanation": "The examiner wants the cost of copying per request and the two fixes: do the work in advance (pool) and reuse workers via an event loop.",
   "id": "L03-s1"
  },
  {
   "q": "List the steps of one iteration of a select()-based echo server loop.",
   "checks": [
    {
     "label": "clear and register descriptors (FD_ZERO/FD_SET)",
     "patterns": [
      "fd_zero",
      "fd_set"
     ]
    },
    {
     "label": "call select with max fd + 1",
     "patterns": [
      "select\\(",
      "call select",
      "max.?fd"
     ]
    },
    {
     "label": "accept if the listening socket is ready",
     "patterns": [
      "accept"
     ]
    },
    {
     "label": "check each client with FD_ISSET and read/write",
     "patterns": [
      "fd_isset",
      "check each",
      "loop (through|over)"
     ]
    },
    {
     "label": "set is rebuilt every iteration",
     "patterns": [
      "rebuil",
      "every iteration",
      "each iteration",
      "again"
     ]
    }
   ],
   "modelAnswer": "1. FD_ZERO the read set, then FD_SET the listening socket and every connected client socket, tracking max_fd.\n2. Call select(max_fd + 1, &readfds, &writefds, NULL, &timeout); it blocks until something is readable/writable, errors, or the timeout fires.\n3. If FD_ISSET(listening socket), call accept() and add the new client descriptor to the client list.\n4. Loop over all clients and check each with FD_ISSET; for ready ones recv() the data and send() it back (or close on EOF).\n5. Go back to step 1: select modifies the set, so it is rebuilt every iteration.",
   "explanation": "A full answer covers registration, the select call, accepting new clients, the O(n) FD_ISSET scan, and rebuilding the set.",
   "id": "L03-s2"
  },
  {
   "q": "A server handles 2,000 requests/s with 50 ms latency. A database slowdown pushes latency to 500 ms. Calculate the in-flight requests before and after, and explain why this can crash the server.",
   "checks": [
    {
     "label": "100 in flight before",
     "patterns": [
      "\\b100\\b"
     ]
    },
    {
     "label": "1,000 in flight after",
     "patterns": [
      "1,?000 (in.flight|concurrent|requests)",
      "=\\s*1,?000\\b"
     ]
    },
    {
     "label": "uses rate x latency (Little's law)",
     "patterns": [
      "little",
      "rate\\s*[x\\*×]\\s*latency",
      "throughput\\s*[x\\*×]"
     ]
    },
    {
     "label": "more memory/threads/queue leads to spiral",
     "patterns": [
      "memory",
      "queue",
      "spiral",
      "feeds on itself"
     ]
    }
   ],
   "modelAnswer": "By Little's law, in-flight = rate x latency.\nBefore: 2000/s x 0.05 s = 100 concurrent requests.\nAfter: 2000/s x 0.5 s = 1,000 concurrent requests, ten times more.\nEach in-flight request holds a descriptor, buffers and possibly a worker thread, so memory and queue length grow tenfold. That makes the server slower still, which raises concurrency further: the situation feeds on itself until the server runs out of memory or workers and crashes.",
   "explanation": "Compute both values with rate x latency and explain the feedback loop between latency and resource use.",
   "id": "L03-s3"
  },
  {
   "q": "Compare CGI and FastCGI: how each passes the request to the program and why FastCGI is faster.",
   "checks": [
    {
     "label": "CGI forks/execs per request",
     "patterns": [
      "fork",
      "exec",
      "new process"
     ]
    },
    {
     "label": "CGI uses env vars + stdin/stdout",
     "patterns": [
      "environment",
      "env var"
     ]
    },
    {
     "label": "mentions stdin/stdout",
     "patterns": [
      "stdin|stdout|standard (in|out)put"
     ]
    },
    {
     "label": "FastCGI process is persistent",
     "patterns": [
      "persistent",
      "stays (alive|running)",
      "long.running",
      "keeps running"
     ]
    },
    {
     "label": "FastCGI uses records with length",
     "patterns": [
      "record",
      "length"
     ]
    }
   ],
   "modelAnswer": "CGI: for every request the web server does fork + exec of the script, passes headers and request info as environment variables (REQUEST_METHOD, QUERY_STRING, HTTP_USER_AGENT...), the body on stdin, and reads the response from stdout (errors from stderr to the log). The per-request process creation is a fixed latency cost.\nFastCGI keeps the same variable names but the application (e.g. PHP-FPM) is persistent: it keeps running and receives many requests over a socket as binary records, each with a header carrying the content length, with an empty record ending a stream. No fork per request makes it much faster.",
   "explanation": "Key contrast: per-request fork+exec with env vars/stdio vs a long-running process speaking length-prefixed records.",
   "id": "L03-s4"
  },
  {
   "q": "Name the four resource limits the lecture said you hit when scaling a server, with one line on each.",
   "checks": [
    {
     "label": "file descriptors",
     "patterns": [
      "file descriptor",
      "\\bfds?\\b"
     ]
    },
    {
     "label": "memory",
     "patterns": [
      "memory",
      "\\bram\\b"
     ]
    },
    {
     "label": "context switches",
     "patterns": [
      "context switch"
     ]
    },
    {
     "label": "queue / backlog / number of requests",
     "patterns": [
      "queue",
      "backlog",
      "number of (requests|connections)"
     ]
    }
   ],
   "modelAnswer": "1. File descriptors: every connection uses one; select caps at 1024 and processes have ulimit -n limits.\n2. Memory: each forked process is a full copy and each OS thread reserves a big stack (often 8 MB), so connections cost RAM.\n3. Context switches: switching processes/threads and every read/write crossing the user-kernel boundary costs CPU and copies (sendfile avoids some).\n4. The queue / listen backlog: only so many requests can wait; beyond that they are rejected, and a long queue means high latency.",
   "explanation": "All four limits named, each with a reason it bites.",
   "id": "L03-s5"
  },
  {
   "q": "Explain the difference between a forward proxy and a reverse proxy, with a real example of each, and say what L7 adds over L4 load balancing.",
   "checks": [
    {
     "label": "forward proxy acts for clients",
     "patterns": [
      "forward"
     ]
    },
    {
     "label": "reverse proxy acts for servers",
     "patterns": [
      "reverse"
     ]
    },
    {
     "label": "forward example (Squid / ISP / college)",
     "patterns": [
      "squid",
      "isp",
      "college"
     ]
    },
    {
     "label": "reverse example (nginx / Varnish / HAProxy)",
     "patterns": [
      "nginx",
      "varnish",
      "haproxy"
     ]
    },
    {
     "label": "L7 routes by Host header / path / cookie",
     "patterns": [
      "host header",
      "cookie",
      "path"
     ]
    }
   ],
   "modelAnswer": "A forward proxy sits on the client side and acts for clients: ISPs and colleges ran Squid caching proxies so repeated images were served from cache, saving upstream bandwidth. A reverse proxy sits in front of servers and acts for them: nginx or Varnish accept client connections, forward them to upstream servers, and can cache responses.\nAn L4 load balancer only sees IP and port; an L7 one (e.g. HAProxy) understands HTTP and can route by Host header, path or cookie, so many sites on one IP can go to different backends.",
   "explanation": "Who the proxy works for, a correct example of each, and the L4 vs L7 distinction.",
   "id": "L03-s6"
  }
 ],
 "subtitle": "",
 "quiz": [
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
  }
 ],
 "prev": {
  "num": 2,
  "file": "lecture-02.html"
 },
 "next": {
  "num": 4,
  "file": "lecture-04.html"
 }
};
