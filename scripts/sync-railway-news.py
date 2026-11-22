#!/usr/bin/env python3
"""Sync verified Ministry of Railways releases from the official PIB release index."""
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FEED = ROOT / "features" / "updates" / "notices.json"
INDEX_URL = "https://www.pib.gov.in/AllRelease.aspx?MenuId=24&PMO=1&lang=1&reg=1"
UA = "RailwayMitraNewsBot/1.0 (+https://github.com/sharerohit111-pixel/railway-mitra)"
MAX_NEW = 25

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.skip += 1
    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self.skip:
            self.skip -= 1
        elif tag in ("p", "div", "br", "li", "h1", "h2", "h3"):
            self.parts.append(" ")
    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)
    def text(self):
        return re.sub(r"\s+", " ", html.unescape(" ".join(self.parts))).strip()

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError("HTTP status " + str(response.status) + " for " + url)
        return response.read().decode("utf-8", "replace")

def category_for(title, body):
    t = (title + " " + body[:2500]).lower()
    if any(x in t for x in ("dearness allowance", "pay commission", "salary", "pension", "gratuity", "leave", "allowance", "provident fund", "labour code", "staff", "employee")):
        return "pay"
    if any(x in t for x in ("recruitment", "rrb", "rrc", "examination", "exam", "gdce", "ldce", "result", "vacancy")):
        return "exam"
    if any(x in t for x in ("safety", "track maintenance", "track renewal", "signalling", "inspection", "derailment")):
        return "transfer"
    if any(x in t for x in ("train service", "train services", "vande bharat", "passenger", "station", "fare", "special train")):
        return "medical"
    if any(x in t for x in ("zone", "division", "project", "railway line", "electrification", "doubling")):
        return "zone"
    return "rbe"

def main():
    payload = json.loads(FEED.read_text(encoding="utf-8"))
    notices = payload.get("notices", [])
    known = {str(n.get("id")) for n in notices}
    index = get(INDEX_URL)
    links = re.findall(r'<a\b[^>]*href=["\']([^"\']*(?:PressReleseDetail|PressReleaseDetail|PressReleasePage)[^"\']*PRID=\d+[^"\']*)["\'][^>]*>(.*?)</a>', index, re.I | re.S)
    candidates = []
    seen = set()
    for href, raw_title in links:
        match = re.search(r"PRID=(\d+)", html.unescape(href), re.I)
        if not match:
            continue
        prid = match.group(1)
        if prid in seen or "pib-rail-" + prid in known:
            continue
        seen.add(prid)
        title_parser = TextExtractor()
        title_parser.feed(raw_title)
        title = title_parser.text()
        if len(title) < 12:
            continue
        url = urllib.parse.urljoin("https://www.pib.gov.in/", html.unescape(href).replace("&amp;", "&"))
        candidates.append((prid, title, url))
    added = 0
    for prid, listed_title, url in candidates:
        if added >= MAX_NEW:
            break
        try:
            page = get(url)
            parser = TextExtractor()
            parser.feed(page)
            body = parser.text()
            # A matching official PIB detail page must identify the issuing ministry.
            if not re.search(r"Ministry of Railways", body, re.I):
                continue
            date_match = re.search(r"Posted On:\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})", body, re.I)
            if not date_match:
                date_match = re.search(r"Posted On:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})", body, re.I)
            if not date_match:
                continue
            published = dt.datetime.strptime(date_match.group(1), "%d %b %Y").date().isoformat() if len(date_match.group(1).split()[1]) == 3 else dt.datetime.strptime(date_match.group(1), "%d %B %Y").date().isoformat()
            # Prefer the page's H1 title; the PIB index title is the safe fallback.
            h1 = re.search(r"<h1\b[^>]*>(.*?)</h1>", page, re.I | re.S)
            title = listed_title
            if h1:
                hp = TextExtractor()
                hp.feed(h1.group(1))
                if len(hp.text()) > 12:
                    title = hp.text()
            if "pib-rail-" + prid in known:
                continue
            # Use a short factual excerpt from the official page, not generated claims.
            posted_pos = body.find("Posted On:")
            excerpt = body[posted_pos + 10:posted_pos + 900] if posted_pos >= 0 else body[:900]
            excerpt = re.sub(r"^(?:\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*)?(?:by PIB [^.]*\s*)?", "", excerpt).strip()
            excerpt = excerpt[:650].rsplit(" ", 1)[0].strip()
            if len(excerpt) < 50:
                continue
            notices.append({
                "id": "pib-rail-" + prid,
                "category": category_for(title, excerpt),
                "verified": True,
                "publishedAt": published,
                "titleEn": title,
                "titleHi": "",
                "summaryEn": excerpt,
                "summaryHi": "",
                "sourceName": "Ministry of Railways / PIB",
                "sourceUrl": url,
                "keywords": "Indian Railways Ministry of Railways PIB official release " + title
            })
            known.add("pib-rail-" + prid)
            added += 1
            time.sleep(0.25)
        except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as exc:
            print("Skipping PIB item", prid, str(exc), file=sys.stderr)
            continue
    notices.sort(key=lambda n: str(n.get("publishedAt", "")), reverse=True)
    payload["notices"] = notices
    payload["updatedAt"] = dt.date.today().isoformat()
    payload["version"] = max(3, int(payload.get("version", 2)))
    FEED.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("PIB candidates:", len(candidates), "| new verified Railway releases:", added, "| total feed items:", len(notices))

if __name__ == "__main__":
    main()
