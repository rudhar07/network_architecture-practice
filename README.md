# Network Architecture: End-term Revision

An interactive revision site for **Network Architecture**: 8 lectures, each with one-shot notes, key terms, the matching
class quiz questions, practice MCQs and written questions. **259 questions** in total.

**Live site:** https://rudhar07.github.io/network_architecture-practice/

| Lecture | Topic |
|---|---|
| 1 | Network programming 101 |
| 2 | Computer Networking Eagle Eye View |
| 3 | Server Side Considerations for scale |
| 4 | nginx deep dive |
| 5 | Evolution of HTTP |
| 6 | (Ab)using CDNs |
| 7 | Economics of cloud tech (taught: designing for failure, retries, backoff, circuit breakers, fallbacks) |
| 8 | Building for failures (taught: live scorecard and live video at scale) |

## What's on each lecture page

- **One-shot notes:** everything taught in the lecture, rebuilt from the class transcript and cleaned up, ending with
  *Quick revision* and *Exam traps*. Anything added beyond the lecture is tagged **Beyond the lecture**.
- **Key terms:** a quick glossary.
- **Class quiz questions:** the real quiz questions (Quiz 1: 25, Quiz 2: 23) placed in the lecture they test, with the
  official answers and an explanation, plus a link to the notes section to revise.
- **Practice MCQs:** green if right, red if wrong, with an explanation either way.
- **Written answers:** type an answer and press *Check answer*. You see which key points you covered, and it turns green
  only when all of them are there. A model answer is always available.

Both quizzes also have their own pages in the original order. Progress is saved in your browser (it survives closing the
tab), and answers are shared between a lecture page and the quiz pages. There's a dark mode.

## Structure

```
index.html                 home: lectures, quizzes, overall progress
lectures/lecture-NN.html   one page per lecture (generated)
quizzes/quiz-N.html        each class quiz in its original order (generated)
assets/style.css, app.js   styles and the app (notes renderer, checking, progress)
data/content/*.json        notes, key terms, practice questions per lecture
data/quiz/*.json           class quiz questions mapped to lectures
data/*.js                  generated page data
tools/build.py             regenerates pages and data, and validates everything
```

To rebuild after editing anything in `data/content/` or `data/quiz/`, run `python3 tools/build.py`. The build fails if
any content is malformed, or if a written question's model answer doesn't pass its own checks.

## Hosting

Repo → **Settings → Pages → Deploy from a branch → `main` / `(root)` → Save**. Plain static files, with `.nojekyll`.
