window.PAGE = {
 "num": 8,
 "title": "Building for failures",
 "summary": "The capstone session (recorded under 'Building for failures') designs a large-scale live system, starting with a cricket scorecard. It compares persistent connections (SSE, long polling, WebSockets, MQTT) with CDN-cached polling, covers the cost drivers (concurrency, fds, memory, CPU, egress) and edge techniques (ETag/304, request collapsing, prefetch, serve stale, negative caching), and argues for proven primitives like S3 + CDN. It then shows that video is the same problem: HLS master manifests, child manifests and segments each need their own polling and caching rules, plus buffering, ABR, QoS telemetry and an FFmpeg/MediaMTX live-streaming demo.",
 "notes": [
  {
   "heading": "The plan: design a scorecard first, then video",
   "body": "This final session (filed as \"Building for failures\") brings everything together to design a **large-scale video streaming system**. The instructor first designs a **live cricket scorecard**, because the problem is the same in a smaller form: many clients, a small file that changes often, CDNs, cost and failures. He then shows that video is \"just three kinds of files\" handled with the same ideas. He also squeezes in the cost and economics material here, in place of a full lecture.\n\n### Sizing the problem (warm-up quiz)\n- A cricket **ball** takes about **45 seconds** end to end (run-up, shot, ball returned). So a score can change at most about every 45 s, even with a fast bowler.\n- An **over** (6 balls) takes about **4-5 minutes**.\n- A detailed scorecard as **JSON** (scores and player stats, **no commentary**, which is the large part) is about **3 KB**.\n- Shrinking team or player names barely changes the size; **dropping commentary** is what makes it small."
  },
  {
   "heading": "Ways to deliver the scorecard to clients",
   "body": "| Mechanism | How it works | Notes |\n|---|---|---|\n| **Persistent TCP connection, custom protocol** | Client connects once; the server pushes each update framed as **type-length-value (TLV)** or with a delimiter | Your own binary protocol over sockets |\n| **Server-Sent Events (SSE)** | One long-lived HTTP response; the server writes a new event (the latest scorecard) on each ball | Server-to-client only |\n| **Long polling** | The client sends a request; the server holds it open until there is news, responds, and the client immediately asks again | Popular for early web chat rooms |\n| **WebSockets** | Starts as HTTP, then an `Upgrade` turns it into a full two-way channel | Either side can send any time; hardly HTTP after the upgrade |\n| **Pub/Sub, MQTT** | One publisher, many subscribers via a broker; MQTT is popular for IoT devices | |\n| **Polling** | Plain non-persistent HTTP GET every N seconds (e.g. 10-20 s), cacheable | Works with CDNs; the instructor's choice |\n\nAll the persistent options are ways of **delimiting messages** on a long-lived connection, built on top of TCP rather than being TCP features."
  },
  {
   "heading": "What drives the cost of persistent connections",
   "body": "To answer \"how many servers, how much money\", list the cost drivers:\n\n- **Users**: industry uses **DAU** (daily active users) and MAU. For cost, DAU matters more.\n- **Concurrent (simultaneous) connections**: the real driver for persistent connections. A large DAU with only 10,000 connected at once might fit on one server.\n- **File-descriptor limits per server**: each connection is an fd. The most the instructor has seen is about **3 million connections per server (WhatsApp)**; most systems run 10,000-20,000 per server. So you need **multiple servers (replicas)**.\n- **Memory per connection** (worse with a thread per connection). A poor design runs out of memory and needs more servers.\n- **CPU**: `epoll` / `select` must iterate over huge connection sets. You can have spare memory and still be **CPU-bound**, so choose instance types (CPU vs memory) on AWS/GCP to match.\n- **Bandwidth**: cloud providers charge **per byte sent (egress)** and sometimes received. This is why **compression** matters at scale.\n- **Length of the event**: an ODI holds connections much longer than a T20, so it costs more for a similar audience.\n- **Requests per second (RPS)**: mostly irrelevant for push-based persistent connections (the server just sends), but it matters for long polling and **dominates the cost of polling**."
  },
  {
   "heading": "Persistent connections vs polling: 'it depends'",
   "body": "With polling you no longer pay to keep connections open, but you pay for **RPS** and **connection setup** (TCP and TLS handshakes) on every request.\n\n- **Keeping** a connection open costs memory, fds and CPU.\n- **Creating** a connection again and again also costs (handshakes, CPU).\n- If updates are **very frequent** (every second, or IoT sensors streaming constantly), keep the connection open.\n- If you only need data every **5 seconds or more** (like a scorecard that changes every ~45 s), **non-persistent polling** starts to win, especially because it can be **cached on a CDN**.\n\nThe instructor's point: \"**it depends**\" is the honest senior-engineer answer, but you must be able to say *what* it depends on (update frequency, concurrency, RPS, cacheability)."
  },
  {
   "heading": "Adding a CDN for a file that changes often",
   "body": "Does a CDN help if the scorecard changes every ball? **Yes, if caching is effective**, even for a few seconds.\n\n- A CDN **without caching** just adds a hop and latency (earlier lectures measured this).\n- With even short caching, millions of client polls hit **edges**, and only a few requests reach the origin, so you need **fewer origin servers**.\n- **Egress from a CDN is usually cheaper than egress from your origin or cloud.** For example, **S3 + CloudFront together costs less than serving the same traffic from S3 directly**, even though you use two services.\n\nA typical read path:\n```\nAndroid / iOS / Web  ->  CDN edge  ->  (mid-tier)  ->  load balancer  ->  scorecard servers\n```"
  },
  {
   "heading": "The write side: getting one scorer's update to many servers",
   "body": "A scorer in the stadium updates the score from a dashboard. There are **many scorecard servers** behind the load balancer. The scorer **cannot** write through the load balancer, because only one server would get the update and the rest would serve stale data. The options discussed:\n\n1. **Database**: the scorer writes to a DB; all servers read from it.\n2. **Cache** (e.g. Redis): the same idea; \"a cache is just a faster DB\" here.\n3. **Queue / broker** (e.g. Kafka): the scorer publishes; every server subscribes. This is usually better than all servers querying a DB or cache when RPS or connection counts are huge.\n4. **\"Service ports\" fan-out** (the instructor's own name): each server exposes an update port and registers its IP:port with the scorer (like FTP's port negotiation), and the scorer **fans out** each update. A newly started server asks for the latest data.\n\n### The instructor's preference: reuse proven primitives\nAll of the above add a DB, queue or custom service just to ship **one small JSON file**. Instead:\n- **nginx** serves the file (it is an expert at static files and can cache in memory), and the scorer writes the file to **NFS** (Network File System, a shared file system) that all nginx boxes read.\n- **Beyond the lecture:** NFS dates from **1984** (Sun Microsystems), while **Kafka** came out of LinkedIn around **2010-2011**, so NFS has had decades more to mature. \"It's fancy to write a new service, but at scale fall back to proven primitives.\"\n\n### What he actually does: object storage + CDN\nThe scorer writes **one object** to **S3** (or Cloudflare **R2**, or GCS), and every client **polls that one file through the CDN**. No nginx fleet, no DB, no queue. Object stores are built for discrete object updates; their internal scaling and replication (including **S3 cross-region replication**) is someone else's mature, opaque problem."
  },
  {
   "heading": "Conditional requests: what If-None-Match / If-Modified-Since actually save",
   "body": "The client sends `If-Modified-Since: <date>` or `If-None-Match: \"<etag>\"`. If the file is unchanged, the server or CDN replies **304 Not Modified** with no body.\n\n- It saves **bytes** (bandwidth and money) between the **CDN and the client**: the unchanged scorecard is not resent.\n- It does **not** reduce the **number of requests**: clients still ask every interval.\n- Requests to the **origin (S3)** are reduced by **CDN caching**, independently of conditional headers.\n\n### Other cost and user-experience optimizations\n- **Increase the polling interval** (fewer requests).\n- **Minify** the JSON and **compress** it (gzip/Brotli).\n- **Protobuf** / binary encoding: send a byte instead of key names like `\"innings\"`.\n- **Send diffs**: the client says \"I'm on version N\", and the server sends only what changed. This is most effective on **persistent connections**, because the server already knows what the client has (how IoT sensors work). Most teams stop at compression.\n- Just \"updating only the changed fields\" in the stored file does not by itself save much: the file is still read as one opaque blob."
  },
  {
   "heading": "Why the CDN design is so effective: herds, prefetch, stale and negative caching",
   "body": "Benefits of putting the CDN in front of S3:\n- Fewer **origin reads** (both count and bytes).\n- Shorter **TCP/TLS round trips**: the edge is near the user (speed-of-light savings).\n- **Global distribution** comes for free.\n- **Thundering-herd mitigation**: millions of clients polling every 15-20 s hit **many edges**. The edges funnel into a few mid-tiers, and those send only a handful of requests to the origin.\n\n### Techniques at the edge\n- **Request collapsing** (coalescing): 100 simultaneous misses on one edge become **one** upstream request.\n- **Prefetch**: with a 20 s TTL, refresh the object at about 15 s, *before* it expires.\n- **Prefresh**: ignore the TTL and refresh every, say, 5 s. Because only edges (not millions of clients) do this, the upstream load is tiny, and the edges stay fresher than clients could keep themselves.\n- **Serve stale**: if the origin fetch fails, serve the last good copy rather than an error.\n- **Negative caching**: also cache **4xx/5xx** responses briefly (e.g. cache 2xx for 20 s and 5xx for 10 s). A 5xx from S3 means it is overloaded and scaling up, so do not keep hammering it. This acts as **a circuit breaker for the CDN**."
  },
  {
   "heading": "Video is three kinds of files: HLS master manifest, child manifest, segments",
   "body": "The two popular adaptive streaming protocols are **HLS** (Apple; text `.m3u8` playlists) and **MPEG-DASH** (an XML manifest, the **MPD**). The lecture uses HLS because it is easier to read. A good way to explore it is to open a Video.js demo and look for `.m3u8` in the Chrome Network tab.\n\n### 1. Master manifest (multivariant playlist)\nA text file, with lines separated by newlines, that lists the **child manifests**, one per rendition, with attributes such as **BANDWIDTH, CODECS and RESOLUTION**:\n```\n#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS=\"avc1.640028,mp4a.40.2\",RESOLUTION=1920x1080\n1080p/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720\n720p/index.m3u8\n```\n- 1080p (1920x1080) is FHD; the \"p\" number is the **height**.\n- You can have the **same resolution at different bitrates** (different file sizes and quality).\n- URLs can be **absolute** (full domain and path) or **relative** (resolved against the master manifest's URL).\n\n### 2. Child manifest (media playlist)\nLists the **segments** (chunks of a few seconds each):\n```\n#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:4.0,\nseg0.ts\n#EXTINF:4.0,\nseg1.ts\n#EXT-X-ENDLIST\n```\n- `EXT-X-TARGETDURATION` is the (maximum) segment length. Here it is 4 s; individual segments may be shorter.\n- **With `#EXT-X-ENDLIST` it is VOD; remove it and it is live.** That is essentially the only difference. (`PLAYLIST-TYPE:EVENT` is a live playlist that only grows.)\n\n### 3. Segments\nSmall, **independently playable** video files (e.g. `.ts`). If they are not DRM-protected you can download one and play it directly."
  },
  {
   "heading": "Polling and caching rules for each file type",
   "body": "Same system, three different treatments. Only **one** of them behaves like the scorecard.\n\n| File | Poll? | CDN / client cache | Why |\n|---|---|---|---|\n| **Master manifest** | **No** (unless you deliberately add or remove renditions at runtime, which the instructor says only Hotstar does) | **Long**: 24 h up to 365 days for VOD | Renditions rarely change. To switch CDN or codec, hand out a *different* master URL |\n| **Child manifest (live)** | **Yes**, about every target duration | **Short**: half the segment duration or less (e.g. 1-2 s for 4-5 s segments) | Updated every segment, and must keep the same URL, so it behaves like the scorecard |\n| **Segment** | **No**, already downloaded (except re-fetching the same segment in another rendition after a timeout) | **Effectively forever** (immutable) | Content never changes at a given URL |\n\n### Why cache the child manifest for at most half the segment duration?\nWith 5 s segments and a 5 s cache TTL, a client that hits the cache just before expiry (at 4.99 s) gets a copy that is already almost a segment old, and the next new entry appears only up to another segment later. In the worst case you are **about 10 s (two segments) stale**. Keeping the TTL at **half a segment or less** bounds the staleness.\n\n### Long caching needs URL discipline\nIf you cache something \"forever\", **any change must get a new URL**. Changing a VOD file without changing its URL is \"just bad software engineering\". The child manifest cannot use this trick, because clients keep re-requesting the *same* URL, so it gets short caching instead.\n\nEven a short child-manifest cache (1-2 s) gives the CDN benefits above (collapsing the RPS at the origin). S3 is a weak origin for such hot, rapidly-changing files, so they are better served from cache or memory."
  },
  {
   "heading": "Handling failures and buffering in the player",
   "body": "Intermittent failures (slow downloads, timeouts, DNS failures) use the previous lecture's toolkit: classify, retry with backoff and jitter, reattempt on another CDN, and **fall back to a lower rendition**. A good idea from a student that the instructor keeps recommending to his company: **switch to audio-only mode** when the network is terrible.\n\n### How much buffer?\n\"It depends.\" A flaky network needs a bigger buffer, but buffering too much has costs:\n- **Wasted bandwidth and money**: if the user closes the video, the last 15-20 s already downloaded is thrown away.\n- **More delay behind live**: friends on different devices see events at different times. **Android** devices often buffer more because their **decode time** is added to the bandwidth estimate, so iPhone and Apple TV users can be ahead.\n- The **distribution path** adds delay too: satellite TV (e.g. Tata Sky) needs an extra satellite hop, so it is behind cable (e.g. Hathway).\n\n### Timeouts for segments\nFor a 5 s segment, a common **segment download timeout is about half the segment duration** (or less). You could stretch it to about 4 s on a stable session, but a shorter timeout leaves time to **retry at a lower bitrate** before the buffer runs dry."
  },
  {
   "heading": "Adaptive bitrate (ABR): choosing the rendition",
   "body": "ABR decides which rendition (bitrate or resolution) to fetch next. It is the player's counterpart of TCP's BBR. Higher renditions have bigger segments in bytes, though not longer ones in seconds.\n\n### When to switch **down**\n- A segment **timed out** (or got 404/5xx): try the same segment at 720p instead of 1080p.\n- **Measured bandwidth** drops. Players measure it continuously, because every segment download is a measurement. Good players include **decode time** in the effective download time: slow decoding means you need more buffer.\n- The user picks a quality, or the **orientation** changes: a 1080p phone in portrait shows the video in a small area, so a lower resolution is enough.\n\n### Estimating bandwidth\n- The **starting bitrate** can depend on network type (Wi-Fi, 5G, 3G or 2G).\n- Use **several samples**: the **median of the last ~5**, or a **weighted average**. Do **not** rely on only the last sample, which would make quality jump like TCP's sawtooth.\n- Apply a **safety factor**: pick a rendition whose declared BANDWIDTH is below roughly **75-83%** of the measured bandwidth (the instructor cited 75% for Shaka Player and 83% for Android's player; both are Google projects with different defaults). **Beyond the lecture:** exact defaults vary by version and configuration.\n- Open-source players offer many estimation algorithms; there is no single right one.\n\n### When to switch **up** (business choices)\n- **Aggressive**: as soon as the last few measurements allow, fetch the next segment at the higher rendition. Some players even **discard the buffer** and rebuild it at the higher quality, to maximize time spent at the top bitrate (on the assumption that higher quality means people watch longer).\n- **Conservative**: use session history. If the session has been flaky, scale up slowly. The instructor's rule \"after 7 rebuffers in a session, never go to 1080p\" **backfired and had to be rolled back**, so simple rules can hurt."
  },
  {
   "heading": "Running real video at scale is more than a CDN",
   "body": "Students' summaries of large-scale video delivery: store the video in object storage, **transcode** it into a **bitrate ladder** (1080p, 720p, ...), split it into small segments, serve them from CDN edges close to users, and let the client pick a rendition with **ABR**. All correct. The instructor adds the real engineering work:\n\n- Choosing the **segment size** and the **bitrate ladder** (and the ratios between rungs).\n- **CDN topology**: how many CDNs, observing the traffic on each, and steering traffic by deciding **which master manifest URL each user gets**. You act as the load balancer without being in the request path.\n- Removing a top rung (e.g. 10 Mbps) when the total internet capacity is short.\n- **Buffer** policy.\n- **DRM, security and entitlements**: users who paid for 4K get 4K, and others do not.\n- **Telemetry**: players regularly **POST** measured bandwidth, bitrate, errors and rebuffers to the backend, so you can later debug \"bandwidth was high but we stayed at 720p\" or \"why didn't we switch down faster?\". These POSTs **cannot be cached** by a CDN.\n- **Video QoS** metrics: **playback failure rate** (at start or mid-play) and the **rebuffering** count or ratio (the player ran out of buffer)."
  },
  {
   "heading": "Demo: generating HLS with FFmpeg and a DIY live stream",
   "body": "### FFmpeg\n**FFmpeg** is one of the most important tools in the video industry. **Beyond the lecture:** \"FF\" stands for **\"Fast Forward\"** (MPEG is the Moving Picture Experts Group); in class a student's guess of \"fast Fourier\" was accepted, which is incorrect.\n\nThe demo used **Big Buck Bunny** (the free, open Blender film) and FFmpeg to produce 4-second HLS segments:\n```\nffmpeg -i big_buck_bunny.mp4 -c:v libx264 -c:a aac \\\n  -f hls -hls_time 4 -hls_playlist_type event index.m3u8\n```\n- **Single ladder**: one `index.m3u8` (no master) plus `.ts` segments, appearing as encoding progresses. The playlist uses **relative URLs**, `TARGETDURATION:4`, and type **EVENT** because it was run like a live stream. You can play it while it is still being generated.\n- **Multi ladder**: an output folder with a **master manifest** listing several resolutions, each with its own child `index.m3u8` that keeps refreshing.\n- The child playlist file is **rewritten as a whole** on each update rather than appended to, which the instructor calls a flaw in how video systems work. Combined with segments still propagating to the object store, this is why **live segment 404s happen and should be retried**.\n\n### DIY live streaming\n- **MediaMTX** (a media server; formerly *rtsp-simple-server*) accepts an **RTMP** input and serves **HLS**.\n- FFmpeg captures the laptop camera and pushes it to the RTMP URL.\n- A **Cloudflare Tunnel** exposes the local HLS port to the internet.\n- Viewers saw several seconds of latency, with audio and video slightly out of sync.\n- The first version of Facebook Live used a very similar FFmpeg-based setup, and many companies use **OBS + FFmpeg**. Nobody watching knows exactly how delayed a \"live\" stream is unless they measure it."
  },
  {
   "heading": "Quick revision",
   "body": "- A cricket ball takes about 45 s and an over about 4-5 min. A scorecard JSON without commentary is about 3 KB.\n- Push options: persistent TCP with TLV framing, SSE, long polling, WebSockets (HTTP Upgrade), Pub/Sub, MQTT. Pull option: polling.\n- Persistent-connection cost drivers: concurrent connections, fds (~10-20k typical, ~3M WhatsApp max), memory, CPU (epoll), egress bandwidth, event length (ODI > T20).\n- Polling cost is driven by RPS and connection setup. Very frequent updates favour persistent; every ~5 s or more favours polling.\n- A CDN helps a frequently-changing file only if it caches, even for a few seconds. CloudFront + S3 is cheaper than S3 alone.\n- Write-side fan-out: DB, cache, queue, service-port fan-out. The instructor prefers proven primitives: nginx + NFS, or simply S3/R2 + CDN.\n- ETag / If-Modified-Since: a 304 saves bytes between the CDN and the client, not requests. CDN caching saves origin requests.\n- Other savings: longer poll interval, minify, gzip/Brotli, protobuf, diffs (best on persistent connections).\n- CDN edge tricks: request collapsing, prefetch (before TTL expires), prefresh (fixed interval), serve stale, negative caching (5xx ~10 s).\n- HLS: master manifest (renditions with BANDWIDTH, RESOLUTION, CODECS), child manifest (segments, TARGETDURATION), segments (independently playable). DASH uses an XML MPD.\n- `#EXT-X-ENDLIST` present means VOD; absent means live.\n- Master: no polling, cache long. Live child: poll about every target duration, cache at most half a segment. Segments: never poll, cache forever, change the URL on change.\n- Segment timeout of about half the segment duration leaves time to retry at a lower bitrate.\n- Buffer too small means rebuffering; too large means wasted bytes and more delay behind live.\n- ABR: median or weighted average of recent samples, a ~75-83% safety factor, include decode time; aggressive vs conservative up-switching.\n- Video QoS: playback failure rate and rebuffering; telemetry POSTs cannot be cached.\n- FFmpeg = \"Fast Forward\" MPEG. MediaMTX takes RTMP in and serves HLS out."
  },
  {
   "heading": "Exam traps",
   "body": "- **ETag/304 does not reduce request count.** It reduces response bytes between the CDN and the client. Origin request reduction comes from **CDN caching**.\n- **RPS is not the main cost driver for push over persistent connections**: concurrency, fds, memory, CPU and bandwidth are. RPS dominates for **polling / long polling**.\n- **\"Does a CDN help a file that changes every few seconds?\"** Yes, if it caches even briefly. A CDN with no caching only adds a hop.\n- **The scorer cannot update through the load balancer**: only one replica would get the update.\n- **Do not poll the master manifest** and do not cache the live child manifest for a full segment duration (worst case about 2 segments stale). Cache at most half a segment.\n- **VOD vs live HLS** is the presence of `#EXT-X-ENDLIST` (and the playlist type), not a different file format.\n- **Caching forever requires immutable URLs**: changing content without changing the URL breaks clients.\n- **ABR should not react to only the last bandwidth sample** (sawtooth); use a median or weighted average plus a safety margin.\n- **A bigger buffer is not free**: it wastes bytes when users quit and increases live latency.\n- **WebSockets vs SSE**: WebSockets are bidirectional after an HTTP Upgrade; SSE is one-way, server to client.\n- **Negative caching (caching 5xx) is deliberate**: it protects an overloaded origin, like a circuit breaker.\n- **FFmpeg's FF means \"Fast Forward\"**, not Fourier."
  }
 ],
 "keyTerms": [
  {
   "term": "DAU / MAU",
   "def": "Daily / monthly active users; DAU matters more for capacity and cost estimates."
  },
  {
   "term": "Concurrent connections",
   "def": "Connections open at the same moment; the main sizing driver for persistent-connection designs."
  },
  {
   "term": "Server-Sent Events (SSE)",
   "def": "A long-lived HTTP response over which the server pushes events one way to the client."
  },
  {
   "term": "Long polling",
   "def": "The server holds a request open until data is available; the client immediately re-requests."
  },
  {
   "term": "WebSocket",
   "def": "A full-duplex channel created by upgrading an HTTP connection (Upgrade: websocket)."
  },
  {
   "term": "MQTT",
   "def": "A lightweight publish/subscribe protocol via a broker, popular for IoT devices."
  },
  {
   "term": "TLV framing",
   "def": "Type-length-value encoding used to delimit messages on a persistent byte stream."
  },
  {
   "term": "Fan-out",
   "def": "One writer pushing each update to many receivers (e.g. the scorer to every scorecard server)."
  },
  {
   "term": "NFS",
   "def": "Network File System: a decades-old shared file system that many servers can read."
  },
  {
   "term": "Egress cost",
   "def": "Cloud charge per byte sent out; CDN egress is usually cheaper than origin egress."
  },
  {
   "term": "304 Not Modified",
   "def": "Reply to a conditional GET (If-None-Match / If-Modified-Since) when content is unchanged; no body sent."
  },
  {
   "term": "Request collapsing",
   "def": "A cache merges many concurrent misses for one object into a single upstream request."
  },
  {
   "term": "Prefetch (refresh-ahead)",
   "def": "Refreshing a cached object shortly before its TTL expires (e.g. at 15 s of a 20 s TTL)."
  },
  {
   "term": "Prefresh",
   "def": "Refreshing a cached object on a fixed interval regardless of TTL (e.g. every 5 s)."
  },
  {
   "term": "Negative caching",
   "def": "Briefly caching error responses (4xx/5xx) so an overloaded origin is not hammered."
  },
  {
   "term": "HLS",
   "def": "HTTP Live Streaming: adaptive streaming using text .m3u8 playlists and media segments."
  },
  {
   "term": "MPEG-DASH / MPD",
   "def": "The other major adaptive streaming standard; its manifest is an XML Media Presentation Description."
  },
  {
   "term": "Master manifest",
   "def": "The top-level HLS playlist listing renditions (BANDWIDTH, RESOLUTION, CODECS) and their child playlists."
  },
  {
   "term": "Child (media) manifest",
   "def": "A playlist listing the segments of one rendition; refreshed repeatedly for live streams."
  },
  {
   "term": "EXT-X-TARGETDURATION",
   "def": "The maximum segment duration in a media playlist; also guides how often to reload a live playlist."
  },
  {
   "term": "EXT-X-ENDLIST",
   "def": "A tag marking the playlist complete (VOD); its absence means the stream is live."
  },
  {
   "term": "Segment",
   "def": "A short (2-10 s), independently playable chunk of video at one rendition."
  },
  {
   "term": "Bitrate ladder",
   "def": "The set of renditions (e.g. 1080p, 720p, 540p ...) a video is transcoded into."
  },
  {
   "term": "ABR",
   "def": "Adaptive bitrate: the player logic that picks which rendition to download next from measured bandwidth and buffer."
  },
  {
   "term": "Rebuffering",
   "def": "Playback stalls because the buffer ran out; a key video QoS metric."
  },
  {
   "term": "Playback failure rate",
   "def": "Percentage of plays that fail at start or mid-stream; a key video QoS metric."
  },
  {
   "term": "FFmpeg",
   "def": "The 'Fast Forward MPEG' toolkit for transcoding and packaging video (e.g. into HLS)."
  },
  {
   "term": "MediaMTX",
   "def": "A media server (formerly rtsp-simple-server) that can ingest RTMP and serve HLS."
  }
 ],
 "mcqs": [
  {
   "q": "A cricket ball takes about 45 s. Roughly how long is one over?",
   "options": [
    "About 45 seconds",
    "About 1.5 minutes",
    "About 15 minutes",
    "About 4-5 minutes"
   ],
   "answer": 3,
   "explanation": "6 balls x ~45 s is about 4.5 minutes, which the lecture rounds to 4-5 minutes.",
   "distractors": "45 s is a single ball; 1.5 and 15 minutes do not match 6 x 45 s.",
   "source": "lecture",
   "id": "L08-m1"
  },
  {
   "q": "A detailed cricket scorecard JSON is mostly scores and player stats. Which change shrinks it the most?",
   "options": [
    "Shortening team names",
    "Dropping ball-by-ball commentary",
    "Reducing the number of players listed as out",
    "Switching from HTTP/1.1 to HTTP/2"
   ],
   "answer": 1,
   "explanation": "Commentary is the large part; without it the scorecard is only about 3 KB. Name lengths and player counts barely matter.",
   "distractors": "Shorter names and fewer listed players are tiny savings; the HTTP version does not change the JSON size.",
   "source": "lecture",
   "id": "L08-m2"
  },
  {
   "q": "For push delivery over persistent connections, which factor is LEAST important for server count?",
   "options": [
    "Requests per second",
    "Memory per connection",
    "Concurrent connections",
    "Per-server file-descriptor limits"
   ],
   "answer": 0,
   "explanation": "With server push there are hardly any client requests, so RPS barely matters; concurrency, fds, memory, CPU and bandwidth drive the cost. RPS dominates for polling and long polling.",
   "distractors": "The other three directly limit how many connections one server can hold.",
   "source": "lecture",
   "id": "L08-m3"
  },
  {
   "q": "Why can an ODI cost more to serve than a T20 with a similar audience, under a persistent-connection design?",
   "options": [
    "ODI scorecards are much larger JSON files",
    "ODIs require WebSockets while T20s use SSE",
    "Connections stay open for far longer, so you hold servers and resources longer",
    "CDNs cannot cache ODI data"
   ],
   "answer": 2,
   "explanation": "Cost scales with connection-time: a 7-8 hour match keeps connections and servers busy far longer than a ~3 hour one.",
   "distractors": "The JSON size is similar, the protocol choice is independent, and caching is not format-dependent.",
   "source": "lecture",
   "id": "L08-m4"
  },
  {
   "q": "Which mechanism starts as an HTTP request and then becomes a full two-way channel where either side can send at any time?",
   "options": [
    "Server-Sent Events",
    "Long polling",
    "Conditional GET",
    "WebSockets"
   ],
   "answer": 3,
   "explanation": "WebSockets use an HTTP Upgrade handshake, then run a bidirectional framed protocol.",
   "distractors": "SSE is server-to-client only, long polling is repeated requests, and a conditional GET is a single request.",
   "source": "lecture",
   "id": "L08-m5"
  },
  {
   "q": "A scorer updates a score while 10 scorecard servers sit behind a load balancer. Why can't the scorer just POST the update through the load balancer?",
   "options": [
    "Load balancers block POST requests",
    "Only one replica would receive it; the others would keep serving stale data",
    "The update would be cached by the CDN",
    "TLS cannot be terminated at the load balancer"
   ],
   "answer": 1,
   "explanation": "A load balancer sends each request to one backend, so a write must be fanned out (DB, cache, queue, service ports, shared storage) to reach every replica.",
   "distractors": "LBs do forward POSTs, the CDN is on the read path, and TLS termination is irrelevant.",
   "source": "lecture",
   "id": "L08-m6"
  },
  {
   "q": "Which design for a live scorecard does the instructor actually prefer?",
   "options": [
    "Scorer writes one object to S3/R2; clients poll it through a CDN",
    "Scorer -> Kafka -> custom scorecard microservices -> clients via WebSockets",
    "Each client opens a TCP connection directly to the scorer's laptop",
    "Scorer writes to a SQL DB queried by every client"
   ],
   "answer": 0,
   "explanation": "Reuse mature primitives: object storage handles replication and scaling, the CDN handles distribution and herds. No custom servers, DB or queue for a 3 KB file.",
   "distractors": "The other designs add moving parts or cannot scale.",
   "source": "lecture",
   "id": "L08-m7"
  },
  {
   "q": "Clients poll a scorecard via a CDN using If-None-Match with an ETag. What does this mainly save?",
   "options": [
    "The number of requests from clients to the CDN",
    "The number of requests from the CDN to the S3 origin",
    "Bytes sent from the CDN to clients when the scorecard is unchanged (304 with no body)",
    "TCP handshakes between client and CDN"
   ],
   "answer": 2,
   "explanation": "A conditional request still happens every poll; if unchanged, the response is a bodiless 304, saving bandwidth. Origin requests are cut by CDN caching, not by ETags.",
   "distractors": "Request counts and handshakes are unchanged by conditional headers.",
   "source": "lecture",
   "id": "L08-m8"
  },
  {
   "q": "A CDN edge has a 20 s TTL for the scorecard and refreshes the object from origin at 15 s, before it expires. What is this called?",
   "options": [
    "Negative caching",
    "Serve stale",
    "Request collapsing",
    "Prefetch (refresh-ahead)"
   ],
   "answer": 3,
   "explanation": "Prefetch refreshes shortly before TTL expiry so users never hit an expired copy. Prefresh would ignore the TTL and refresh on a fixed interval.",
   "distractors": "Negative caching caches errors, collapsing merges concurrent misses, and serve-stale returns old copies on origin failure.",
   "source": "lecture",
   "id": "L08-m9"
  },
  {
   "q": "Why might a CDN be configured to cache 5xx responses from S3 for about 10 seconds?",
   "options": [
    "To hide bugs from monitoring",
    "A 5xx suggests the origin is overloaded; caching it stops edges hammering the origin while it recovers, like a circuit breaker",
    "Because 5xx responses are smaller",
    "HTTP requires caching 5xx responses"
   ],
   "answer": 1,
   "explanation": "Negative caching throttles upstream retries from every edge, giving the origin time to scale; the instructor calls it a circuit breaker for CDNs.",
   "distractors": "Hiding errors and size are not the goal, and HTTP does not mandate caching errors.",
   "source": "lecture",
   "id": "L08-m10"
  },
  {
   "q": "What distinguishes a VOD HLS media playlist from a live one?",
   "options": [
    "The presence of #EXT-X-ENDLIST (and PLAYLIST-TYPE VOD) means VOD; without it the playlist is live",
    "VOD uses .mpd files, live uses .m3u8",
    "Live playlists have no segments",
    "VOD playlists have no TARGETDURATION"
   ],
   "answer": 0,
   "explanation": "The playlist format is the same; ENDLIST says no more segments will be added, which makes it VOD.",
   "distractors": "MPD is DASH; live playlists do list segments; both have TARGETDURATION.",
   "source": "lecture",
   "id": "L08-m11"
  },
  {
   "q": "How should a player treat the HLS master manifest for a VOD title?",
   "options": [
    "Poll it every target duration",
    "Never cache it at all",
    "Fetch it once and cache it long (hours to a year); give out a new URL if renditions change",
    "Cache it for half a segment duration"
   ],
   "answer": 2,
   "explanation": "Renditions rarely change, so the master is fetched once and cached long. Changing a CDN or codec means handing out a different master URL.",
   "distractors": "Polling or short caching applies to the live child manifest.",
   "source": "lecture",
   "id": "L08-m12"
  },
  {
   "q": "Segments are 4 s long in a live stream. What is a sensible CDN cache TTL for the live child manifest?",
   "options": [
    "24 hours",
    "8 seconds",
    "It must never be cached",
    "About 2 seconds or less (half a segment or less)"
   ],
   "answer": 3,
   "explanation": "Cache at most half the segment duration to keep staleness bounded while still collapsing the origin RPS; a full-segment TTL can leave clients about two segments behind.",
   "distractors": "Long TTLs serve stale playlists, and no caching at all loses the CDN's benefits.",
   "source": "lecture",
   "id": "L08-m13"
  },
  {
   "q": "Why can video segments be cached essentially forever on a CDN?",
   "options": [
    "Segments are encrypted",
    "A segment URL's content never changes; if content changes, the URL changes",
    "CDNs ignore TTLs for .ts files",
    "Segments are smaller than manifests"
   ],
   "answer": 1,
   "explanation": "Immutable URLs make infinite caching safe. Changing VOD content without changing the URL is called bad engineering in the lecture.",
   "distractors": "Encryption, file size or CDN special cases are not the reason.",
   "source": "lecture",
   "id": "L08-m14"
  },
  {
   "q": "Segments are 5 s long. A common choice for the segment download timeout is:",
   "options": [
    "About 2.5 s (half the segment duration or less)",
    "Exactly 5 s",
    "30 s, the library default",
    "No timeout; let TCP decide"
   ],
   "answer": 0,
   "explanation": "A timeout of about half the segment duration leaves time to retry, usually at a lower bitrate, before the buffer runs out.",
   "distractors": "5 s or more leaves no time to recover; no timeout risks a stall.",
   "source": "lecture",
   "id": "L08-m15"
  },
  {
   "q": "Measured throughput samples over the last 5 segments are 8, 9, 2, 8, 9 Mbps. A player applies the median plus a 75% safety factor. Which rendition fits best?",
   "options": [
    "10 Mbps",
    "4.5 Mbps",
    "6 Mbps",
    "1.5 Mbps"
   ],
   "answer": 2,
   "explanation": "The median is 8 Mbps, and 75% of 8 is 6 Mbps, so pick the highest rendition at or below 6 Mbps. Using the median ignores the single 2 Mbps dip (avoiding sawtooth switching).",
   "distractors": "10 exceeds the budget, and 4.5 and 1.5 under-use it, as if reacting to the one outlier.",
   "source": "lecture",
   "id": "L08-m16"
  },
  {
   "q": "What is the main downside of buffering, say, 30 s of video when segments are 5 s?",
   "options": [
    "Rebuffering becomes more frequent",
    "ABR is disabled",
    "The master manifest must be re-downloaded",
    "Wasted bandwidth when users quit early, and more delay behind the live edge"
   ],
   "answer": 3,
   "explanation": "Large buffers protect against flakiness but waste already-downloaded bytes on exit and push viewers further behind live.",
   "distractors": "Bigger buffers reduce rebuffering; they do not affect the master manifest or disable ABR.",
   "source": "lecture",
   "id": "L08-m17"
  },
  {
   "q": "Why can't a CDN help with the player's playback telemetry (measured bandwidth, errors, rebuffers)?",
   "options": [
    "Telemetry uses UDP",
    "It consists of unique POST requests sent to the backend, which are not cacheable",
    "Telemetry is encrypted with DRM",
    "CDNs only serve video"
   ],
   "answer": 1,
   "explanation": "Each telemetry report is a distinct write (POST); caching does not apply, so the backend must scale for it directly.",
   "distractors": "It is ordinary HTTP, not UDP or DRM, and CDNs serve far more than video.",
   "source": "lecture",
   "id": "L08-m18"
  },
  {
   "q": "In the live-stream demo, which component took the camera's RTMP feed and served it as HLS?",
   "options": [
    "MediaMTX (formerly rtsp-simple-server)",
    "Nginx with NFS",
    "Cloudflare R2",
    "hls.js"
   ],
   "answer": 0,
   "explanation": "FFmpeg pushed the camera to MediaMTX over RTMP; MediaMTX produced HLS; a Cloudflare Tunnel exposed it publicly.",
   "distractors": "Nginx/NFS was the scorecard idea, R2 is object storage, and hls.js is a browser player.",
   "source": "lecture",
   "id": "L08-m19"
  }
 ],
 "short": [
  {
   "q": "List the main factors that determine the cost of delivering a live scorecard over persistent connections, and contrast them with polling.",
   "checks": [
    {
     "label": "Concurrent connections / users / DAU",
     "patterns": [
      "concurren",
      "simultaneous",
      "dau",
      "users"
     ]
    },
    {
     "label": "Memory and/or CPU per connection",
     "patterns": [
      "memory",
      "cpu",
      "epoll"
     ]
    },
    {
     "label": "Bandwidth / egress",
     "patterns": [
      "bandwidth",
      "egress",
      "bytes"
     ]
    },
    {
     "label": "File descriptors / servers needed",
     "patterns": [
      "file descriptor",
      "\\bfds?\\b",
      "servers",
      "replica"
     ]
    },
    {
     "label": "Polling driven by RPS / requests",
     "patterns": [
      "rps",
      "requests? per second"
     ]
    }
   ],
   "modelAnswer": "Persistent connections: (1) DAU and especially the number of concurrent connections; (2) per-server file-descriptor limits (typically 10-20k connections, about 3M at WhatsApp), which decide how many servers or replicas you need; (3) memory per connection; (4) CPU, since epoll/select must scan many connections; (5) egress bandwidth, charged per byte, so compress; (6) the length of the event (an ODI holds connections longer than a T20).\nPolling: no idle connections to hold, but every poll costs a request plus TCP/TLS setup, so requests per second (RPS) and the poll interval drive the cost. A CDN can absorb most of that RPS by caching.\nRule of thumb: updates every second favour persistent connections; updates every ~5 s or more favour cached polling.",
   "explanation": "The examiner wants concurrency, resources (fds, memory, CPU), bandwidth, and the RPS contrast for polling.",
   "id": "L08-s1"
  },
  {
   "q": "Explain why caching the live child manifest for a full segment duration is a bad idea, and what TTL to use instead.",
   "checks": [
    {
     "label": "Child manifest changes every segment",
     "patterns": [
      "every (segment|\\d+ ?s)",
      "changes",
      "updated"
     ]
    },
    {
     "label": "Stale / worst case ~2 segments behind",
     "patterns": [
      "stale",
      "two segments",
      "2 segments",
      "10 ?s",
      "double"
     ]
    },
    {
     "label": "Use half or less of segment duration",
     "patterns": [
      "half",
      "less than",
      "1-2 ?s",
      "2 ?s"
     ]
    }
   ],
   "modelAnswer": "In a live stream the child manifest is updated every segment (e.g. every 5 s) with the newest segment, at the same URL. If the CDN caches it for a full 5 s, a client that hits the cache just before expiry gets a copy that is already almost 5 s old, and the next update may only appear up to another segment later. Worst case it is about two segments (about 10 s) stale, causing late playback or buffer underruns.\nUse a TTL of half the segment duration or less (e.g. 2 s for 4-5 s segments). This bounds the staleness while still letting the CDN collapse millions of polls into a few origin requests.",
   "explanation": "Key reasoning: the TTL adds to the segment interval in the worst case, so keep the TTL at most half a segment.",
   "id": "L08-s2"
  },
  {
   "q": "Compare how an HLS player should poll and cache the master manifest, the child manifest and the segments.",
   "checks": [
    {
     "label": "Master: no poll, long cache",
     "patterns": [
      "master"
     ]
    },
    {
     "label": "Child: poll ~ target duration, short cache",
     "patterns": [
      "child",
      "media playlist"
     ]
    },
    {
     "label": "Segments: no poll, cache forever / immutable",
     "patterns": [
      "segment"
     ]
    },
    {
     "label": "Mentions target duration or half segment",
     "patterns": [
      "target ?duration",
      "half"
     ]
    },
    {
     "label": "Mentions immutable URL / change URL",
     "patterns": [
      "url",
      "immutable"
     ]
    }
   ],
   "modelAnswer": "Master manifest: lists the renditions (BANDWIDTH, RESOLUTION, CODECS). Fetch it once, do not poll it, and cache it long (24 h up to 365 days for VOD). If renditions, codec or CDN change, give out a different master URL.\nChild manifest: lists the segments. For live, poll it about every target duration and cache it only briefly (half the segment duration or less), because it changes at the same URL, just like the scorecard. A VOD child manifest (with ENDLIST) can be cached long.\nSegments: immutable chunks. Never poll them (except re-fetching the same segment at a lower rendition after a timeout), and cache them effectively forever; any content change must use a new URL.",
   "explanation": "Three file types get three treatments, and only the live child manifest behaves like the scorecard.",
   "id": "L08-s3"
  },
  {
   "q": "Describe how a simple ABR algorithm estimates bandwidth and decides to switch renditions down or up.",
   "checks": [
    {
     "label": "Measure throughput from segment downloads",
     "patterns": [
      "measur",
      "throughput",
      "download"
     ]
    },
    {
     "label": "Median / average of several samples, not last only",
     "patterns": [
      "median",
      "average",
      "several",
      "last (few|five|5)"
     ]
    },
    {
     "label": "Safety factor ~75-83%",
     "patterns": [
      "safety",
      "7\\d ?%",
      "8\\d ?%",
      "fraction"
     ]
    },
    {
     "label": "Down on timeout / low bandwidth",
     "patterns": [
      "down",
      "lower",
      "timeout"
     ]
    },
    {
     "label": "Up: aggressive vs conservative",
     "patterns": [
      "up",
      "aggressive",
      "conservative",
      "higher"
     ]
    }
   ],
   "modelAnswer": "Every segment download is a throughput measurement (bytes / time; good players add decode time). Do not trust only the last sample, which would cause sawtooth switching. Take the median or a weighted average of the last ~5 samples. Then apply a safety factor: choose the highest rendition whose declared BANDWIDTH is at most ~75-83% of the estimate. The starting bitrate can depend on network type (Wi-Fi, 5G, 3G).\nSwitch down when a segment times out (re-fetch it at 720p instead of 1080p), when the estimate drops, or when the screen is small (portrait). Switch up when the estimate stays above the next rung: aggressive players switch on the next segment (some even discard the buffer to rebuild at higher quality), while conservative players also consider session history (flaky sessions move up slowly).",
   "explanation": "Measurement, smoothing, safety margin and the down/up rules are the essentials.",
   "id": "L08-s4"
  },
  {
   "q": "Explain how putting a CDN in front of an S3 origin mitigates a thundering herd of millions of clients polling a scorecard, naming at least two edge techniques.",
   "checks": [
    {
     "label": "Many edges spread the load",
     "patterns": [
      "edge"
     ]
    },
    {
     "label": "Hierarchy / mid-tier funnels to few origin requests",
     "patterns": [
      "mid.?tier",
      "tier",
      "few( upstream)? requests",
      "origin"
     ]
    },
    {
     "label": "Request collapsing / coalescing",
     "patterns": [
      "collaps",
      "coalesc"
     ]
    },
    {
     "label": "Another: prefetch / prefresh / serve stale / negative caching",
     "patterns": [
      "prefetch",
      "prefresh",
      "stale",
      "negative"
     ]
    }
   ],
   "modelAnswer": "Millions of clients poll every 15-20 s, but they hit thousands of distributed CDN edges rather than one origin. Each edge serves from cache and, on a miss, uses request collapsing: hundreds of simultaneous requests for the same object become a single upstream fetch. Edges fetch from a few mid-tiers, which in turn send only a handful of requests to the S3 origin. So the origin sees a tiny, steady load.\nOther techniques: prefetch (refresh at ~15 s of a 20 s TTL) or prefresh (refresh every 5 s regardless of TTL) keep edges fresh without client-driven spikes; serve stale returns the last good copy if the origin fails; negative caching stores 5xx responses for ~10 s so edges do not hammer an overloaded origin.",
   "explanation": "Distribution across edges, the tiered hierarchy, collapsing, and one more technique.",
   "id": "L08-s5"
  },
  {
   "q": "Why does the instructor prefer S3 (or NFS + nginx) over a custom service with a DB or queue for distributing the scorecard?",
   "checks": [
    {
     "label": "Proven / mature primitives",
     "patterns": [
      "mature",
      "proven",
      "decades",
      "years"
     ]
    },
    {
     "label": "Fewer moving parts (no DB / queue / custom service)",
     "patterns": [
      "no (db|database|queue)",
      "fewer",
      "moving parts",
      "custom service",
      "without"
     ]
    },
    {
     "label": "Object storage handles replication / scaling",
     "patterns": [
      "replicat",
      "scal"
     ]
    },
    {
     "label": "CDN in front / cheaper",
     "patterns": [
      "cdn",
      "cheaper",
      "cost"
     ]
    }
   ],
   "modelAnswer": "The scorecard is a single ~3 KB file. Building a scorecard service plus a database, cache or Kafka queue plus fan-out ports adds many moving parts to deliver one file. Proven primitives already solve this: nginx is mature at serving and caching static files and NFS has existed since the 1980s (Kafka only since about 2010-2011). Better still, object storage like S3/R2/GCS is built for discrete object updates, and handles its own scaling and replication (even cross-region), so the scorer writes one object and there is nothing custom to run. Put a CDN in front: it absorbs the polling herd and is cheaper (CloudFront + S3 costs less than S3 alone).",
   "explanation": "Maturity, simplicity, delegated scaling/replication, and cost via the CDN.",
   "id": "L08-s6"
  },
  {
   "q": "A student says 'large-scale video is just: transcode, chunk and put it on a CDN'. What else must a real video platform engineer, according to the lecture?",
   "checks": [
    {
     "label": "Bitrate ladder / segment size choices",
     "patterns": [
      "ladder",
      "segment size",
      "bitrate"
     ]
    },
    {
     "label": "Multi-CDN / traffic steering via the manifest",
     "patterns": [
      "cdn",
      "steer",
      "manifest"
     ]
    },
    {
     "label": "DRM / entitlements / security",
     "patterns": [
      "drm",
      "entitle",
      "security",
      "4k"
     ]
    },
    {
     "label": "Telemetry / QoS (rebuffering, failure rate)",
     "patterns": [
      "telemetry",
      "qos",
      "rebuffer",
      "failure rate"
     ]
    }
   ],
   "modelAnswer": "Beyond transcoding and a CDN: choose the segment size and the bitrate ladder (and the ratios between rungs); design the CDN topology (how many CDNs, monitoring each one's traffic) and steer users by deciding which master manifest URL they receive, acting as a load balancer without being in the path; drop top rungs when internet capacity is short; tune the buffer and ABR; enforce DRM, security and entitlements (only 4K subscribers get 4K); design retries and fallbacks; and collect telemetry (POSTed measured bandwidth, bitrate, errors) to track video QoS metrics such as playback failure rate and rebuffering, which a CDN cannot cache.",
   "explanation": "The examiner wants the non-CDN engineering: ladder, multi-CDN steering, DRM, QoS telemetry.",
   "id": "L08-s7"
  }
 ],
 "subtitle": "What was actually taught: live scorecard and live video at scale (delivery options, caching, HLS, ABR, cost drivers)",
 "quiz": [],
 "prev": {
  "num": 7,
  "file": "lecture-07.html"
 },
 "next": null
};
