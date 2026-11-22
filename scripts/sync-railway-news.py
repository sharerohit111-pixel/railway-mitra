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


# Official Railway Board circular indexes. These are live directorate pages on
# rb.indianrailways.gov.in; rows are accepted only when they contain a dated
# item and a direct official attachment/detail link.
BOARD_INDEXES = [
    ("https://rb.indianrailways.gov.in/show-directorate/preview/3291", "Railway Board — E(NG)-II Circulars"),
    ("https://rb.indianrailways.gov.in/show-directorate/preview/1190", "Railway Board — Transfer Circulars"),
    ("https://rb.indianrailways.gov.in/show-directorate/preview/781", "Railway Board — MPP Circulars"),
    ("https://rb.indianrailways.gov.in/show-directorate/preview/1127", "Railway Board — E(SCT) Circulars"),
    ("https://rb.indianrailways.gov.in/show-directorate/preview/3443", "Railway Board — Training Circulars"),
    ("https://rb.indianrailways.gov.in/show-directorate/preview/895", "Railway Board — ERB-I Circulars"),
]
RRB_INDEXES = [
    ("https://rrb.indianrailways.gov.in/", "Railway Recruitment Boards — Central Portal"),
]
ZONAL_INDEXES = [
    ("https://cr.indianrailways.gov.in/", "Central Railway"),
    ("https://er.indianrailways.gov.in/", "Eastern Railway"),
    ("https://ecr.indianrailways.gov.in/", "East Central Railway"),
    ("https://eastcoastrail.indianrailways.gov.in/", "East Coast Railway"),
    ("https://nr.indianrailways.gov.in/", "Northern Railway"),
    ("https://ncr.indianrailways.gov.in/", "North Central Railway"),
    ("https://ner.indianrailways.gov.in/", "North Eastern Railway"),
    ("https://nfr.indianrailways.gov.in/", "Northeast Frontier Railway"),
    ("https://nwr.indianrailways.gov.in/", "North Western Railway"),
    ("https://sr.indianrailways.gov.in/", "Southern Railway"),
    ("https://scr.indianrailways.gov.in/", "South Central Railway"),
    ("https://ser.indianrailways.gov.in/", "South Eastern Railway"),
    ("https://secr.indianrailways.gov.in/", "South East Central Railway"),
    ("https://swr.indianrailways.gov.in/", "South Western Railway"),
    ("https://wr.indianrailways.gov.in/", "Western Railway"),
    ("https://wcr.indianrailways.gov.in/", "West Central Railway"),
    ("https://mtp.indianrailways.gov.in/", "Metro Railway Kolkata"),
]
MAX_AGE_DAYS = 365

class RowParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None
        self.active_link = None
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "tr":
            self.row = {"text": [], "links": [], "cells": []}
        elif self.row is not None and tag in ("td", "th"):
            self.cell = []
        elif self.row is not None and tag == "a" and attrs.get("href"):
            self.row["links"].append([attrs["href"], []])
            self.active_link = len(self.row["links"]) - 1
    def handle_data(self, data):
        if self.row is not None:
            value = data.strip()
            if value:
                self.row["text"].append(value)
                if self.cell is not None:
                    self.cell.append(value)
                if self.active_link is not None:
                    self.row["links"][self.active_link][1].append(value)
    def handle_endtag(self, tag):
        if tag == "a":
            self.active_link = None
        elif tag in ("td", "th"):
            if self.row is not None and self.cell:
                self.row["cells"].append(" ".join(self.cell))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None
            self.cell = None
            self.active_link = None
def parse_date(value):
    value = value.strip().replace(".", "-").replace("/", "-")
    for fmt in ("%d-%m-%Y", "%d-%b-%Y", "%d-%B-%Y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    return None

def board_category(title):
    t = title.lower()
    if any(x in t for x in ("allowance", "pay", "pension", "leave", "medical", "macp", "increment", "salary", "gratuity", "bonus", "provident fund")):
        return "pay"
    if any(x in t for x in ("recruitment", "examination", "exam", "gdce", "ldce", "vacancy", "selection", "result", "rrb", "rbe")):
        return "exam" if any(x in t for x in ("recruitment", "examination", "exam", "vacancy", "result", "rrb")) else "rbe"
    if any(x in t for x in ("transfer", "posting", "inter-railway", "mutual")):
        return "transfer"
    if any(x in t for x in ("safety", "track", "signal", "engineering", "maintenance", "bridge")):
        return "transfer"
    if any(x in t for x in ("train", "passenger", "station", "service", "timetable")):
        return "medical"
    if any(x in t for x in ("zone", "division", "project", "electrification", "doubling")):
        return "zone"
    return "rbe"

def sync_official_indexes(notices, known):
    added = 0
    cutoff = dt.date.today() - dt.timedelta(days=MAX_AGE_DAYS)
    for index_url, source_name in BOARD_INDEXES + RRB_INDEXES + ZONAL_INDEXES:
        try:
            page = get(index_url)
            parser = RowParser()
            parser.feed(page)
            for row in parser.rows:
                row_text = re.sub(r"\s+", " ", " ".join(row["text"])).strip()
                date_match = re.search(r"(?<!\d)(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}[- /](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[- /]\d{4}|\d{4}-\d{2}-\d{2})(?!\d)", row_text, re.I)
                if not date_match:
                    continue
                published_date = parse_date(date_match.group(1))
                if not published_date or published_date < cutoff or published_date > dt.date.today() + dt.timedelta(days=1):
                    continue
                if len(row["links"]) == 0:
                    continue
                # Prefer the subject cell; linked cells often contain only file numbers.
                subject_cells = []
                for cell_text in row.get("cells", []):
                    cell_text = re.sub(r"\s+", " ", cell_text).strip()
                    if len(cell_text) < 18 or re.search(r"\d{1,2}[./-]\d{1,2}[./-]\d{4}", cell_text):
                        continue
                    if re.match(r"^(?:RBE\s*No\.?|E\(|20\d{2}/|19\d{2}/)", cell_text, re.I):
                        continue
                    subject_cells.append(cell_text)
                link = max(row["links"], key=lambda item: len(" ".join(item[1])))
                linked_title = re.sub(r"\s+", " ", " ".join(link[1])).strip()
                title = max(subject_cells, key=len) if subject_cells else linked_title
                if len(title) < 12:
                    title = row_text
                if len(title) < 12:
                    continue
                url = urllib.parse.urljoin(index_url, html.unescape(link[0]))
                parsed = urllib.parse.urlparse(url)
                host = (parsed.hostname or "").lower()
                if not (host.endswith("indianrailways.gov.in") or host.endswith("railnet.gov.in") or host.endswith("gov.in")):
                    continue
                if not url.startswith("https://"):
                    continue
                stable = re.sub(r"[^a-z0-9]+", "-", (host + parsed.path + parsed.query).lower()).strip("-")
                notice_id = "rb-index-" + __import__("hashlib").sha256(stable.encode("utf-8")).hexdigest()[:18]
                if notice_id in known:
                    continue
                # Keep row text factual and compact; original order is the source of truth.
                summary = row_text[:550].rsplit(" ", 1)[0]
                if len(summary) < 35:
                    summary = title
                notices.append({
                    "id": notice_id,
                    "category": board_category(title),
                    "verified": True,
                    "publishedAt": published_date.isoformat(),
                    "titleEn": title[:240],
                    "titleHi": "",
                    "summaryEn": summary,
                    "summaryHi": "",
                    "sourceName": source_name,
                    "sourceUrl": url,
                    "keywords": "Indian Railways Railway Board official circular notice " + title
                })
                known.add(notice_id)
                added += 1
        except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as exc:
            print("Skipping official index", index_url, str(exc), file=sys.stderr)
    return added

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
                date_match = re.search(r"(?<!\d)(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}[- /](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[- /]\d{4}|\d{4}-\d{2}-\d{2})(?!\d)", row_text, re.I)
            if not date_match:
                date_match = re.search(r"(?<!\d)(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}[- /](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[- /]\d{4}|\d{4}-\d{2}-\d{2})(?!\d)", row_text, re.I)
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
    other_added = sync_official_indexes(notices, known)
    notices.sort(key=lambda n: str(n.get("publishedAt", "")), reverse=True)
    payload["notices"] = notices
    payload["updatedAt"] = dt.date.today().isoformat()
    payload["version"] = max(3, int(payload.get("version", 2)))
    FEED.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("PIB candidates:", len(candidates), "| new PIB releases:", added, "| new Railway Board/RRB/zonal index notices:", other_added, "| total feed items:", len(notices))

if __name__ == "__main__":
    main()
