# -*- coding: utf-8 -*-
"""Split a DGIPR daily news fold (.docx) into individual releases.

The fold is one Word file holding every release the directorate issued that
day, one after another, separated by a line of zeros. Each Marathi release
opens with `वृत्त क्र. NNNN`; the translations that follow at the end of the
fold carry no number and are matched back to their Marathi original by hand.
"""
import json, re, sys
from docx import Document

SEP = re.compile(r"^0{4,}$")
NUM = re.compile(r"^वृत्त\s*क्र\.?\s*([0-9]+)")
DATELINE = re.compile(
    r"^(मुंबई|Mumbai|नागपूर|पुणे)\s*[,·]?\s*"
    r"(दि\.?|दिनांक|Date|September|Sept|सितंबर|सप्टेंबर)",
    re.IGNORECASE,
)
DEPT = re.compile(r"^\((.+?)\)$")
CREDIT = re.compile(r"^[^/]{1,40}/(विसंअ|स\.सं\.|सं\.|ज\.सं\.अ\.)")


def parse(path):
    doc = Document(path)
    paras = [(p.text.strip(), p.style.name) for p in doc.paragraphs]

    # Cut the fold into blocks: a block starts at a `वृत्त क्र.` line, or at the
    # first real line after a separator when the block carries no number.
    blocks, cur = [], []
    for text, style in paras:
        if not text:
            cur.append((text, style))
            continue
        if SEP.match(text):
            blocks.append(cur)
            cur = []
            continue
        if NUM.match(text) and any(t for t, _ in cur if NUM.match(t)):
            blocks.append(cur)
            cur = []
        cur.append((text, style))
    blocks.append(cur)

    out = []
    for block in blocks:
        lines = [(t, s) for t, s in block if t]
        if not lines:
            continue
        num = None
        # drop the previous block's credit line and the fold's own date line
        while lines and (
            CREDIT.match(lines[0][0])
            or lines[0][0].startswith("दि. ")
            or lines[0][0].startswith("ज.सं.अ.")
        ):
            lines.pop(0)
        if lines and NUM.match(lines[0][0]):
            num = NUM.match(lines[0][0]).group(1)
            lines.pop(0)
        if not lines:
            continue

        dept = None
        if DEPT.match(lines[0][0]):
            dept = DEPT.match(lines[0][0]).group(1)
            lines.pop(0)

        # where the body starts
        start = None
        for i, (t, s) in enumerate(lines):
            if DATELINE.match(t):
                start = i
                break
        if start is None:
            # no dateline (cabinet decisions): body is the first long paragraph
            for i, (t, s) in enumerate(lines):
                if i and len(t) > 200 and s != "List Paragraph":
                    start = i
                    break
        if start is None:
            start = min(1, len(lines) - 1)

        head, body = lines[:start], [t for t, s in lines[start:]]
        headline, attribution, bullets = [], [], []
        for t, s in head:
            if s == "List Paragraph" or t.startswith("•") or t.startswith("·"):
                bullets.append(t.lstrip("•· ").strip())
            elif re.match(r"^[-–—‑]", t):
                attribution.append(t)
            else:
                headline.append(t)
        # a trailing credit at the end of the body belongs to nobody
        while body and CREDIT.match(body[-1]):
            body.pop()
        out.append(
            {
                "num": num,
                "dept": dept,
                "headline": headline,
                "attribution": attribution,
                "bullets": bullets,
                "body": body,
            }
        )
    return out


if __name__ == "__main__":
    rows = parse(sys.argv[1])
    json.dump(rows, open(sys.argv[2], "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(len(rows), "blocks")
    for r in rows:
        print(
            r["num"] or "--",
            "|h", len(r["headline"]),
            "|a", len(r["attribution"]),
            "|b", len(r["bullets"]),
            "|body", len(r["body"]),
            "|", (r["headline"][0] if r["headline"] else "??")[:60],
        )
