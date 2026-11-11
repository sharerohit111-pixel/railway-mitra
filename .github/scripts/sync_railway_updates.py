#!/usr/bin/env python3
"""Sync official Railway Board press releases into Railway Mitra's public feed."""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

FEED_PATH = "features/updates/notices.json"
SOURCE = "https://rb.indianrailways.gov.in/documents/press-release"
HEADERS = {"User-Agent": "RailwayMitra-OfficialUpdatesBot/1.0 (+https://github.com/sharerohit111-pixel/railway-mitra)"}
DATE_RE = re.compile(r"\b(\d{2})-(\d{2})-(\d{4})\b")
MAX_ITEMS = 120


def category_for(title):
    t = title.lower()
    if any(x in t for x in ("recruit", "vacanc", "rrb", "exam", "answer key", "selection")):
        return "exam"
    if any(x in t for x in ("bonus", "allowance", "salary", "pay commission", "pension", "employee", "staff", "rbe")):
        return "pay"
    if any(x in t for x in ("safety", "kavach", "accident", "rpf", "security", "maintenance", "track")):
        return "transfer"
    if any(x in t for x in ("train", "passenger", "station", "vande bharat", "express", "memu", "special service")):
        return "medical"
    if any(x in t for x in ("freight", "project", "corridor", "doubling", "electrification", "zone", "division")):
        return "zone"
    return "rbe"


def extract_records(html):
    soup = BeautifulSoup(html, "html.parser")
    records = []
    seen = set()
    for link in soup.find_all("a"):
        label = " ".join(link.get_text(" ", strip=True).split()).lower()
        href = urljoin(SOURCE, link.get("href", ""))
        parsed = urlparse(href)
        if label not in {"view", "download", "pdf"}:
            continue
        if parsed.scheme != "https" or parsed.hostname != "rb.indianrailways.gov.in":
            continue
        if href in seen:
            continue
        node = link
        best_text = ""
        for _ in range(7):
            if node is None:
                break
            text = " ".join(node.get_text(" ", strip=True).split())
            if DATE_RE.search(text) and len(text) > len(best_text):
                best_text = text
            node = node.parent
        match = DATE_RE.search(best_text)
        if not match:
            continue
        # Remove labels, date and file-size text to recover the notice title.
        title = best_text
        title = re.sub(r"\bTitle\s*:\s*", " ", title, flags=re.I)
        title = re.sub(r"\bDate\s*:\s*" + re.escape(match.group(0)), " ", title, flags=re.I)
        title = re.sub(r"\bType/Size\s*:\s*", " ", title, flags=re.I)
        title = re.sub(r"\bView\b|\bDownload\b|\bPDF\b", " ", title, flags=re.I)
        title = re.sub(r"\b\d+(?:\.\d+)?\s*(?:KB|MB)\b", " ", title, flags=re.I)
        title = " ".join(title.split()).strip(" :-|")
        if not title or len(title) < 12 or len(title) > 300:
            continue
        day, month, year = match.groups()
        published = f"{year}-{month}-{day}"
        try:
            datetime.strptime(published, "%Y-%m-%d")
        except ValueError:
            continue
        digest = hashlib.sha1((published + "|" + title + "|" + href).encode()).hexdigest()[:12]
        records.append({
            "id": "rb-auto-" + digest,
            "category": category_for(title),
            "verified": True,
            "publishedAt": published,
            "titleEn": title,
            "titleHi": "रेलवे बोर्ड की आधिकारिक सूचना",
            "summaryEn": "Official Railway Board press release. Open the original release for complete details, applicable conditions and any deadlines.",
            "summaryHi": "यह रेलवे बोर्ड की आधिकारिक प्रेस विज्ञप्ति है। पूरी जानकारी, लागू शर्तों और अंतिम तिथि के लिए मूल विज्ञप्ति खोलें।",
            "sourceName": "Railway Board Press Release",
            "sourceUrl": href,
            "keywords": "Indian Railways Railway Board official press release"
        })
        seen.add(href)
    return records


def main():
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY", "sharerohit111-pixel/railway-mitra")
    if not token:
        raise RuntimeError("GITHUB_TOKEN is required")
    response = requests.get(SOURCE, headers=HEADERS, timeout=45)
    response.raise_for_status()
    discovered = extract_records(response.text)
    if not discovered:
        raise RuntimeError("No official notice records parsed; refusing to overwrite the feed")
    api = f"https://api.github.com/repos/{repo}/contents/{FEED_PATH}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    current = requests.get(api, headers=headers, timeout=30)
    current.raise_for_status()
    meta = current.json()
    import base64
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
    body = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if added == 0:
        print(f"No new official press releases. Existing feed has {len(existing)} records.")
        return
    commit = {
        "message": f"chore(updates): sync {added} official Railway Board releases",
        "content": base64.b64encode(body.encode("utf-8")).decode("ascii"),
        "sha": meta["sha"],
        "branch": "main"
    }
    saved = requests.put(api, headers=headers, json=commit, timeout=30)
    if saved.status_code == 409:
        raise RuntimeError("Feed changed during sync; retry on next scheduled run")
    saved.raise_for_status()
    print(f"Published {added} new official Railway Board press releases; total feed records: {len(payload['notices'])}")


if __name__ == "__main__":
    main()
