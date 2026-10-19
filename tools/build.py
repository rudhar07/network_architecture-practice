#!/usr/bin/env python3
"""Build the Network Architecture revision site.

Inputs:   data/content/lecture-NN.json   notes, key terms, practice MCQs and written questions per lecture
          data/quiz/quiz-questions.json  the class quiz questions (optional), mapped to lectures
Outputs:  data/site.js, data/lecture-NN.js, data/quiz-N.js, lectures/*.html, quizzes/*.html, index.html

Run from the repo root:  python3 tools/build.py
Fails loudly on malformed content, or if a written answer's model answer doesn't pass its own checks.
"""
import glob
import hashlib
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAM_DATE = "23 Oct"
# The class schedule titles for lectures 7 and 8 differ from what was taught in those sessions.
SUBTITLES = {
    7: "What was actually taught: designing for failure (timeouts, retries, backoff and jitter, circuit breakers, fallbacks)",
    8: "What was actually taught: live scorecard and live video at scale (delivery options, caching, HLS, ABR, cost drivers)",
}
JS_UNSAFE = re.compile(r"\(\?<[=!]|\(\?[a-z]+\)")


def version(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:10]


def write_js(path, var, obj):
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"window.{var} = " + json.dumps(obj, ensure_ascii=False, indent=1) + ";\n")


def load_lectures(problems):
    lectures = []
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "content", "lecture-*.json"))):
        d = json.load(open(path, encoding="utf-8"))
        n = d["num"]
        tag = f"lecture {n}"
        if not d.get("notes"):
            problems.append(f"{tag}: no notes")
        for i, q in enumerate(d["mcqs"], 1):
            q["id"] = f"L{n:02d}-m{i}"
            if len(q["options"]) < 2 or not 0 <= q["answer"] < len(q["options"]):
                problems.append(f"{tag} MCQ {i}: bad options/answer")
        for i, q in enumerate(d["short"], 1):
            q["id"] = f"L{n:02d}-s{i}"
            for c in q["checks"]:
                pats = c.get("patterns") or []
                if not pats:
                    problems.append(f"{tag} short {i}: check '{c.get('label')}' has no patterns")
                for p in pats:
                    if JS_UNSAFE.search(p):
                        problems.append(f"{tag} short {i}: pattern not JS-safe: {p}")
                    try:
                        re.compile(p)
                    except re.error as e:
                        problems.append(f"{tag} short {i}: bad regex {p}: {e}")
                if not any(re.search(p, q["modelAnswer"], re.I) for p in pats):
                    problems.append(f"{tag} short {i}: model answer fails check '{c['label']}'")
        d["subtitle"] = SUBTITLES.get(n, "")
        lectures.append(d)
    return lectures


def load_quiz(lectures, problems):
    path = os.path.join(ROOT, "data", "quiz", "quiz-questions.json")
    if not os.path.exists(path):
        return []
    qs = json.load(open(path, encoding="utf-8"))
    headings = {l["num"]: {h["heading"] for h in l["notes"]} for l in lectures}
    for q in qs:
        q["id"] = f"Q{q['quiz']}-{q['qn']}"
        if not 0 <= q["answer"] < len(q["options"]):
            problems.append(f"{q['id']}: bad answer index")
        if q["lecture"] not in headings:
            problems.append(f"{q['id']}: unknown lecture {q['lecture']}")
        ref = q.get("lectureRef") or ""
        if ref and ref not in headings.get(q["lecture"], set()):
            problems.append(f"{q['id']}: lectureRef not found: {ref}")
    return qs


def slugify(s):
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Network Architecture Revision</title>
<meta name="description" content="{desc}">
<link rel="stylesheet" href="{up}assets/style.css?v={v_css}">
</head>
<body data-page="{page}">
<header class="top"><div class="wrap">
  <a class="brand" href="{up}index.html">Network Architecture <span>Revision</span></a>
  <div class="spacer"></div>
  <button class="theme-toggle" type="button">☾ Dark</button>
</div></header>
<main class="wrap">
{body}
  <p class="foot">Built from the class lectures and the two class quizzes for Network Architecture. Points marked <span class="beyond">Beyond the lecture</span> add standard theory that wasn't covered in class. Your answers are saved only in this browser.</p>
</main>
{scripts}
<script src="{up}assets/app.js?v={v_js}"></script>
</body>
</html>
"""

LECTURE_BODY = """  <div class="crumbs"><a href="../index.html">All lectures</a> / <span id="l-num"></span></div>
  <h1 id="l-title"></h1>
  <p class="sub" id="l-sub"></p>
  <div class="score-line"><span id="score"></span><button class="btn" id="reset" type="button">Reset this lecture</button></div>
  <nav class="section-nav" aria-label="Sections">
    <a class="btn" href="#sec-notes">📘 One-shot notes</a>
    <a class="btn" href="#sec-terms">Key terms</a>
    <a class="btn" href="#sec-quiz">Quiz Qs</a>
    <a class="btn" href="#sec-mcq">Practice MCQs</a>
    <a class="btn" href="#sec-short">Written answers</a>
  </nav>
  <h2 id="sec-notes">📘 One-shot notes</h2>
  <div class="toc" id="toc"></div>
  <div id="notes"></div>
  <h2 id="sec-terms">Key terms</h2>
  <div id="terms"></div>
  <h2 id="sec-quiz">Questions from the class quizzes</h2>
  <p class="sub">The real quiz questions that test this lecture, with the official answers. Pick an option to check yourself.</p>
  <div id="quiz"></div>
  <h2 id="sec-mcq">Practice MCQs</h2>
  <p class="sub">Exam-style questions on everything in this lecture: green if you're right, red if not, with an explanation either way.</p>
  <div id="mcqs"></div>
  <h2 id="sec-short">Written answers</h2>
  <p class="sub">Write your answer and press <b>Check answer</b>: it is green only when every key point is covered.</p>
  <div id="short"></div>
  <nav class="pager" id="pager" aria-label="Lecture navigation"></nav>
"""

QUIZ_BODY = """  <div class="crumbs"><a href="../index.html">All lectures</a> / Class quiz</div>
  <h1 id="l-title"></h1>
  <p class="sub">In the original order, with the official answers. Each question says which lecture to revise.</p>
  <div class="score-line"><span id="score"></span><button class="btn" id="reset" type="button">Reset this quiz</button></div>
  <div id="questions"></div>
  <nav class="pager"><a class="btn" href="../index.html">← All lectures</a></nav>
"""

INDEX_BODY = """  <h1>Network Architecture: End-term Revision</h1>
  <p class="sub">8 lectures, each with one-shot notes from the class transcript, key terms, the class quiz questions mapped to the lecture, practice MCQs and written questions. Progress is saved in this browser.</p>
  <div class="summary" id="summary"></div>
  <h2>Lectures</h2>
  <div class="grid" id="grid"></div>
  <h2>Class quizzes (original order)</h2>
  <div class="grid" id="quiz-grid"></div>
  <p style="margin-top:20px"><button class="btn" id="reset-all" type="button">Reset all progress</button></p>
"""


def main():
    problems = []
    lectures = load_lectures(problems)
    quiz = load_quiz(lectures, problems)
    if len(lectures) != 8:
        problems.append(f"expected 8 lectures, found {len(lectures)}")
    if problems:
        print("\n".join("PROBLEM: " + p for p in problems))
        sys.exit(f"{len(problems)} problem(s)")

    lec_by_num = {l["num"]: l for l in lectures}
    heading_slug = lambda n, h: f"lecture-{n:02d}.html#n-{slugify(h)}"
    for q in quiz:
        ref = q.get("lectureRef")
        q["ref"] = (f'<a href="../lectures/{heading_slug(q["lecture"], ref)}">Lecture {q["lecture"]}: {html.escape(ref)}</a>'
                    if ref else f'<a href="../lectures/lecture-{q["lecture"]:02d}.html">Lecture {q["lecture"]}</a>')

    os.makedirs(os.path.join(ROOT, "lectures"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "quizzes"), exist_ok=True)
    quiz_nums = sorted({q["quiz"] for q in quiz})
    site = {
        "examDate": EXAM_DATE,
        "lectures": [{
            "num": l["num"], "title": l["title"], "subtitle": l["subtitle"], "file": f"lecture-{l['num']:02d}.html",
            "ids": [q["id"] for q in quiz if q["lecture"] == l["num"]] + [q["id"] for q in l["mcqs"]] + [q["id"] for q in l["short"]],
            "counts": {"quiz": sum(q["lecture"] == l["num"] for q in quiz), "mcq": len(l["mcqs"]), "short": len(l["short"])},
        } for l in lectures],
        "quizzes": [{"num": z, "title": f"Quiz {z}", "file": f"quiz-{z}.html",
                     "ids": [q["id"] for q in quiz if q["quiz"] == z]} for z in quiz_nums],
    }
    write_js(os.path.join(ROOT, "data", "site.js"), "SITE", site)
    v = {"v_css": version(os.path.join(ROOT, "assets", "style.css")), "v_js": version(os.path.join(ROOT, "assets", "app.js")),
         "v_site": version(os.path.join(ROOT, "data", "site.js"))}

    for i, l in enumerate(lectures):
        n = l["num"]
        page = dict(l)
        page["quiz"] = sorted([q for q in quiz if q["lecture"] == n], key=lambda q: (q["quiz"], q["qn"]))
        page["prev"] = {"num": lectures[i - 1]["num"], "file": f"lecture-{lectures[i - 1]['num']:02d}.html"} if i else None
        page["next"] = {"num": lectures[i + 1]["num"], "file": f"lecture-{lectures[i + 1]['num']:02d}.html"} if i + 1 < len(lectures) else None
        data = os.path.join(ROOT, "data", f"lecture-{n:02d}.js")
        write_js(data, "PAGE", page)
        scripts = f'<script src="../data/site.js?v={v["v_site"]}"></script>\n<script src="../data/lecture-{n:02d}.js?v={version(data)}"></script>'
        with open(os.path.join(ROOT, "lectures", f"lecture-{n:02d}.html"), "w", encoding="utf-8") as f:
            f.write(PAGE.format(title=html.escape(f"Lecture {n}: {l['title']}"), desc=html.escape(l["summary"][:150]),
                                up="../", page="lecture", body=LECTURE_BODY, scripts=scripts, **v))
    for z in quiz_nums:
        data = os.path.join(ROOT, "data", f"quiz-{z}.js")
        write_js(data, "PAGE", {"title": f"Quiz {z}", "questions": sorted([q for q in quiz if q["quiz"] == z], key=lambda q: q["qn"])})
        scripts = f'<script src="../data/site.js?v={v["v_site"]}"></script>\n<script src="../data/quiz-{z}.js?v={version(data)}"></script>'
        with open(os.path.join(ROOT, "quizzes", f"quiz-{z}.html"), "w", encoding="utf-8") as f:
            f.write(PAGE.format(title=f"Quiz {z}", desc=f"Network Architecture quiz {z} with answers and explanations.",
                                up="../", page="quiz", body=QUIZ_BODY, scripts=scripts, **v))
    with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8") as f:
        f.write(PAGE.format(title="Home", desc="End-term revision for Network Architecture: notes, quiz questions and practice.",
                            up="", page="index", body=INDEX_BODY,
                            scripts=f'<script src="data/site.js?v={v["v_site"]}"></script>', **v))
    total = len(quiz) + sum(len(l["mcqs"]) + len(l["short"]) for l in lectures)
    print(f"built {len(lectures)} lectures, {len(quiz)} quiz questions, {total} questions in total; problems: 0")


if __name__ == "__main__":
    main()
