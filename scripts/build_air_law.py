"""Regenerate the question fieldsets in subjects/air-law.html from the JSON bank.

Usage: python3 scripts/build_air_law.py
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANK = ROOT / "data" / "010_air_law_question_bank.json"
PAGE = ROOT / "subjects" / "air-law.html"

e = lambda s: html.escape(str(s), quote=True)


def fieldset(n, q):
    ci = q["answer"]
    attrs = {
        "data-id": q["id"],
        "data-topic": q.get("topic", ""),
        "data-topic-name": q.get("topicName", ""),
        "data-difficulty": q.get("difficulty", ""),
        "data-lo": q.get("LO", ""),
    }
    out = [f'        <fieldset class="question" {" ".join(f"{k}=\"{e(v)}\"" for k, v in attrs.items())}>',
           f'          <legend>{e(q["question"])}</legend>',
           '          <div class="options">']
    for i, text in enumerate(q["options"]):
        l = "abcd"[i]
        out.append(f'            <input type="radio" name="q{n}" id="q{n}-{l}"{" data-correct" if i == ci else ""}>')
        out.append(f'            <label for="q{n}-{l}">{e(text)}</label>')
    out += ['          </div>',
            '          <div class="explanation">',
            '            <span class="result-banner right">Correct!</span>',
            '            <span class="result-banner wrong">Incorrect</span>',
            f'            <strong>Correct answer:</strong> {"ABCD"[ci]} &ndash; {e(q["options"][ci])}']
    if q.get("explanation_quick"):
        out.append(f'            <p class="exp-quick">{e(q["explanation_quick"])}</p>')
    out += [f'            <p class="exp-text">{e(q["explanation"])}</p>',
            '          </div>',
            '        </fieldset>']
    return "\n".join(out)


def main():
    qs = json.loads(BANK.read_text())
    for q in qs:
        assert len(q["options"]) == 4 and 0 <= q["answer"] < 4, q["id"]
    blocks = [fieldset(n, q) for n, q in enumerate(qs, 1)]
    page = PAGE.read_text()
    page, count = re.subn(r'(<form class="quiz">\n).*?(\n          <div class="quiz-actions">)',
                          lambda m: m.group(1) + "\n".join(blocks) + m.group(2), page, flags=re.S)
    assert count == 1
    PAGE.write_text(page)
    print(f"Wrote {len(qs)} questions to {PAGE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
