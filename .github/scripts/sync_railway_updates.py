#!/usr/bin/env python3
"""Sync official Railway Board and PIB Ministry of Railways releases into Railway Mitra."""
import base64
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse, parse_qs
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

import requests
from bs4 import BeautifulSoup

FEED_PATH = "features/updates/notices.json"
RB_SOURCE = "https://rb.indianrailways.gov.in/documents/press-release"
PIB_SOURCE = "https://www.pib.gov.in/AllRelease.aspx?lang=1&reg=3"
PIB_RSS_SOURCE = "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3&reg=48"
GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q=site%3Apib.gov.in+%22Ministry+of+Railways%22&hl=en-IN&gl=IN&ceid=IN%3Aen"
HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Accept": "application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8", "Accept-Language": "en-IN,en;q=0.9", "Referer": "https://www.pib.gov.in/"}
DATE_RE = re.compile(r"\b(\d{2})-(\d{2})-(\d{4})\b")
PIB_DATE_RE = re.compile(r"(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})", re.I)
MAX_ITEMS = 120


def category_for(title):
    t = title.lower()
    if any(x in t for x in ("recruit", "vacanc", "rrb", "exam", "answer key", "selection", "gdce", "ldce")):
        return "exam"
    if any(x in t for x in ("bonus", "allowance", "salary", "pay commission", "pension", "employee", "staff", "rbe", "dearness")):
        return "pay"
    if any(x in t for x in ("safety", "kavach", "accident", "rpf", "security", "maintenance", "track")):
        return "transfer"
    if any(x in t for x in ("train", "passenger", "station", "vande bharat", "express", "memu", "special service")):
        return "medical"
    if any(x in t for x in ("freight", "project", "corridor", "doubling", "electrification", "zone", "division")):
        return "zone"
    return "rbe"


def clean_title(value):
    return " ".join(value.replace("\xa0", " ").split()).strip(" :-|")


def extract_railway_board(html):
    soup = BeautifulSoup(html, "html.parser")
    records, seen = [], set()
    for link in soup.find_all("a"):
        label = clean_title(link.get_text(" ", strip=True)).lower()
        href = urljoin(RB_SOURCE, link.get("href", ""))
        parsed = urlparse(href)
        if label not in {"view", "download", "pdf"} or parsed.scheme != "https" or parsed.hostname != "rb.indianrailways.gov.in" or href in seen:
            continue
        node, best_text = link, ""
        for _ in range(7):
            if node is None:
                break
            text = clean_title(node.get_text(" ", strip=True))
            if DATE_RE.search(text):
                best_text = text
                break
            node = node.parent
        match = DATE_RE.search(best_text)
        if not match:
            continue
        title = best_text
        title = re.sub(r"\bTitle\s*:\s*", " ", title, flags=re.I)
        title = re.sub(r"\bDate\s*:\s*" + re.escape(match.group(0)), " ", title, flags=re.I)
        title = re.sub(r"\bType/Size\s*:\s*", " ", title, flags=re.I)
        title = re.sub(r"\bView\b|\bDownload\b|\bPDF\b", " ", title, flags=re.I)
        title = re.sub(r"\b\d+(?:\.\d+)?\s*(?:KB|MB)\b", " ", title, flags=re.I)
        title = clean_title(title)
        if not 12 <= len(title) <= 300:
            continue
        day, month, year = match.groups()
        published = f"{year}-{month}-{day}"
        try:
            datetime.strptime(published, "%Y-%m-%d")
        except ValueError:
            continue
        digest = hashlib.sha1((published + "|" + title + "|" + href).encode()).hexdigest()[:12]
        records.append(make_record("rb-auto-" + digest, title, published, href, "Railway Board"))
        seen.add(href)
    return records


def extract_pib_railway(html):
    soup = BeautifulSoup(html, "html.parser")
    records, seen = [], set()
    # PIB groups releases beneath an h3 ministry heading; the heading is a
    # sibling of the list, not necessarily an ancestor of each release link.
    heading = next((h for h in soup.find_all(["h2", "h3", "h4"])
                    if clean_title(h.get_text(" ", strip=True)).lower() == "ministry of railways"), None)
    if heading is None:
        raise RuntimeError("PIB page did not contain the Ministry of Railways section")
    for section in heading.next_siblings:
        if getattr(section, "name", None) in {"h2", "h3", "h4"}:
            break
        links = section.find_all("a", href=True) if getattr(section, "find_all", None) else []
        for link in links:
            href = urljoin(PIB_SOURCE, link["href"])
            parsed = urlparse(href)
            if parsed.hostname != "www.pib.gov.in" or "PressReleseDetail" not in parsed.path and "PressReleaseDetail" not in parsed.path:
                continue
            prid = parse_qs(parsed.query).get("PRID", [""])[0]
            title = clean_title(link.get_text(" ", strip=True))
            if not prid or len(title) < 12 or prid in seen:
                continue
            context = clean_title(link.parent.get_text(" ", strip=True))
            match = PIB_DATE_RE.search(context)
            if not match:
                # Date can be placed in a nearby wrapper rather than the link's immediate parent.
                parent = link.parent.parent
                context = clean_title(parent.get_text(" ", strip=True)) if parent else context
                match = PIB_DATE_RE.search(context)
            if not match:
                continue
            try:
                published = datetime.strptime(" ".join(match.groups()), "%d %b %Y").date().isoformat()
            except ValueError:
                continue
            records.append(make_record("pib-rail-" + prid, title, published, href, "Ministry of Railways / PIB"))
            seen.add(prid)
    # Fallback for PIB layout changes: require Ministry of Railways and a date
    # in the containing card, never accept another ministry's releases.
    if not records:
        for link in soup.find_all("a", href=True):
            href = urljoin(PIB_SOURCE, link["href"])
            parsed = urlparse(href)
            if parsed.hostname != "www.pib.gov.in" or "PressReleseDetailm.aspx" not in parsed.path:
                continue
            prid = parse_qs(parsed.query).get("PRID", [""])[0]
            title = clean_title(link.get_text(" ", strip=True))
            if not prid or len(title) < 12 or prid in seen:
                continue
            node, context = link, ""
            for _ in range(8):
                if node is None:
                    break
                context = clean_title(node.get_text(" ", strip=True))
                if "Ministry of Railways" in context and PIB_DATE_RE.search(context):
                    break
                node = node.parent
            match = PIB_DATE_RE.search(context)
            if "Ministry of Railways" not in context or not match:
                continue
            try:
                published = datetime.strptime(" ".join(match.groups()), "%d %b %Y").date().isoformat()
            except ValueError:
                continue
            records.append(make_record("pib-rail-" + prid, title, published, href, "Ministry of Railways / PIB"))
            seen.add(prid)
    if not records:
        raise RuntimeError("No dated Ministry of Railways releases parsed from PIB")
    return records

def extract_pib_rss(xml_text):
    """Parse PIB's official RSS feed and retain only Ministry of Railways releases."""
    soup = BeautifulSoup(xml_text, "html.parser")
    records, seen = [], set()
    for item in soup.find_all("item"):
        title = clean_title(item.title.get_text(" ", strip=True) if item.title else "")
        link = item.link.get_text(" ", strip=True) if item.link else ""
        description = clean_title(item.description.get_text(" ", strip=True) if item.description else "")
        combined = (title + " " + description).lower()
        if not any(term in combined for term in ("ministry of railways", "indian railways", "railway board")):
            continue
        parsed = urlparse(link)
        if parsed.hostname not in {"www.pib.gov.in", "pib.gov.in"}:
            continue
        query = parse_qs(parsed.query)
        prid = query.get("PRID", [""])[0]
        if not prid:
            continue
        date_text = ""
        for tag in ("pubdate", "published", "dc:date"):
            node = item.find(tag)
            if node:
                date_text = node.get_text(" ", strip=True)
                break
        published = None
        for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%d %b %Y", "%Y-%m-%d"):
            try:
                published = datetime.strptime(date_text.strip(), fmt).date().isoformat()
                break
            except (ValueError, TypeError):
                pass
        if not published:
            match = PIB_DATE_RE.search(description)
            if match:
                try:
                    published = datetime.strptime(" ".join(match.groups()), "%d %b %Y").date().isoformat()
                except ValueError:
                    pass
        if not published or len(title) < 12 or prid in seen:
            continue
        records.append(make_record("pib-rail-" + prid, title, published, link, "Ministry of Railways / PIB RSS"))
        seen.add(prid)
    if not records:
        raise RuntimeError("PIB RSS returned no identifiable dated Railway releases")
    return records


def extract_google_news_rss(xml_text):
    """Use Google News only as a discovery index; publish only original PIB URLs."""
    soup = BeautifulSoup(xml_text, "xml")
    records, seen = [], set()
    for item in soup.find_all("item"):
        title = clean_title(item.title.get_text(" ", strip=True) if item.title else "")
        link = item.link.get_text(" ", strip=True) if item.link else ""
        pubdate = item.pubDate.get_text(" ", strip=True) if item.pubDate else ""
        if "pib.gov.in" not in (title + " " + link).lower():
            continue
        match_url = re.search(r"https?://(?:www\\.)?pib\\.gov\\.in/[^\\s&<>]+", title + " " + link, re.I)
        if not match_url:
            continue
        original_url = match_url.group(0).rstrip(").,")
        parsed = urlparse(original_url)
        prid = parse_qs(parsed.query).get("PRID", [""])[0]
        if not prid or prid in seen:
            continue
        # A Google News item is only accepted when its headline explicitly identifies Railways.
        clean_headline = re.sub(r"\\s+-\\s+.*$", "", title)
        if not any(term in clean_headline.lower() for term in ("railway", "railways", "rail minister")):
            continue
        published = None
        try:
            published = datetime.strptime(pubdate, "%a, %d %b %Y %H:%M:%S %Z").date().isoformat()
        except ValueError:
            try:
                published = datetime.strptime(pubdate, "%a, %d %b %Y %H:%M:%S %z").date().isoformat()
            except ValueError:
                pass
        if not published or len(clean_headline) < 12:
            continue
        records.append(make_record("pib-rail-" + prid, clean_headline, published, original_url, "PIB official release (Google News discovery)"))
        seen.add(prid)
    if not records:
        raise RuntimeError("Google News discovery returned no directly verifiable PIB Railway releases")
    return records


def make_record(record_id, title, published, url, source_name):
    return {
        "id": record_id,
        "category": category_for(title),
        "verified": True,
        "publishedAt": published,
        "titleEn": title,
        "titleHi": "रेल मंत्रालय की आधिकारिक सूचना",
        "summaryEn": "Official release published by the Ministry of Railways. Open the original PIB/Railway Board release for complete details and applicable dates.",
        "summaryHi": "रेल मंत्रालय द्वारा जारी आधिकारिक सूचना। पूरी जानकारी और लागू तिथियों के लिए मूल सरकारी विज्ञप्ति देखें।",
        "sourceName": source_name,
        "sourceUrl": url,
        "keywords": "Indian Railways Ministry of Railways Railway Board PIB official release"
    }


def main():
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY", "sharerohit111-pixel/railway-mitra")
    if not token:
        raise RuntimeError("GITHUB_TOKEN is required")

    session = requests.Session()
    session.headers.update(HEADERS)
    retry = Retry(total=1, connect=1, read=1, backoff_factor=1,
                  status_forcelist=(429, 500, 502, 503, 504),
                  allowed_methods=frozenset(["GET"]))
    session.mount("https://", HTTPAdapter(max_retries=retry))
    discovered = []
    errors = []
    for name, url, parser in (
        # PIB is the primary source because its Ministry of Railways section
        # remains reachable when the Railway Board host is intermittently down.
        ("PIB Ministry of Railways RSS", PIB_RSS_SOURCE, extract_pib_rss),
        ("PIB Railway releases discovery", GOOGLE_NEWS_RSS, extract_google_news_rss),
        ("PIB Ministry of Railways page", PIB_SOURCE, extract_pib_railway),
        ("Railway Board", RB_SOURCE, extract_railway_board),
    ):
        try:
            response = session.get(url, timeout=(8, 25))
            response.raise_for_status()
            items = parser(response.text)
            discovered.extend(items)
            print(f"{name}: parsed {len(items)} official releases")
        except Exception as exc:
            errors.append(f"{name}: {type(exc).__name__}: {exc}")
            print(f"WARNING - {name} source unavailable: {type(exc).__name__}: {exc}")

    if not discovered:
        raise RuntimeError("No official releases parsed from either source; refusing to overwrite the feed. " + "; ".join(errors))

    api = f"https://api.github.com/repos/{repo}/contents/{FEED_PATH}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    current = requests.get(api, headers=headers, timeout=30)
    current.raise_for_status()
    meta = current.json()
    payload = json.loads(base64.b64decode(meta["content"]).decode("utf-8"))
    existing = payload.get("notices", [])
    by_id = {item.get("id"): item for item in existing if isinstance(item, dict) and item.get("id")}
    by_url = {item.get("sourceUrl"): item for item in existing if isinstance(item, dict) and item.get("sourceUrl")}
    added = 0
    for item in discovered:
        if item["id"] not in by_id and item["sourceUrl"] not in by_url:
            existing.append(item)
            added += 1
    existing.sort(key=lambda item: item.get("publishedAt", ""), reverse=True)
    payload["version"] = max(2, int(payload.get("version", 1)))
    payload["updatedAt"] = datetime.now(timezone.utc).date().isoformat()
    payload["notices"] = existing[:MAX_ITEMS]
    if added == 0:
        print(f"No new official releases. Existing feed has {len(payload['notices'])} records; source checks completed.")
        return
    body = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    commit = {
        "message": f"chore(updates): sync {added} official Railway/PIB releases",
        "content": base64.b64encode(body.encode("utf-8")).decode("ascii"),
        "sha": meta["sha"],
        "branch": "main"
    }
    saved = requests.put(api, headers=headers, json=commit, timeout=30)
    if saved.status_code == 409:
        raise RuntimeError("Feed changed during sync; retry on next scheduled run")
    saved.raise_for_status()
    print(f"Published {added} new official releases; total feed records: {len(payload['notices'])}")


if __name__ == "__main__":
    main()
