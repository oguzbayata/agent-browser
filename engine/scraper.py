#!/usr/bin/env python3
"""Local, stdout-only search scraper. No Big Tech endpoints. JSON on stdout only."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from html import unescape
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlparse

USER_AGENT = os.environ.get(
    "AGENT_USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/138.0.7204.0 Safari/537.36",
)
TIMEOUT_SEC = 8
MAX_RESULTS = 1000
MAX_PAGES = 100
MAX_QUERY = 500
SEARCH_BUDGET_SEC = 70

SEARX_NODES = (
    "https://searx.tiekoetter.com",
    "https://search.sapti.me",
    "https://searx.be",
    "https://search.ononoki.org",
)


def eprint(message: str) -> None:
    sys.stderr.write(message + "\n")
    sys.stderr.flush()


def emit(payload) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


def proxies():
    raw = (os.environ.get("AGENT_PROXY") or "").strip()
    if not raw:
        return None
    return {"http": raw, "https": raw}


def unwrap_url(href: str, base: str = "") -> str:
    if not href:
        return ""
    href = unescape(href.strip())
    if href.startswith("//"):
        href = "https:" + href
    if base:
        href = urljoin(base, href)
    parsed = urlparse(href)
    if parsed.hostname and "duckduckgo.com" in parsed.hostname.lower():
        qs = parse_qs(parsed.query)
        target = (qs.get("uddg") or qs.get("u") or [""])[0]
        if target:
            return unquote(target)
    if parsed.scheme in {"http", "https"}:
        return href
    return ""


def clean_text(value: str) -> str:
    text = unescape(re.sub(r"\s+", " ", value or "")).strip()
    return text[:420]


def is_junk_url(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path or ""
    if "duckduckgo.com" in host and (path.startswith("/y.js") or "uddg=" in parsed.query and "ad_provider=" in parsed.query):
        return True
    if "bing.com" in host and "/aclick" in path:
        return True
    return False


def unique_results(items, acc=None):
    out = list(acc or [])
    seen = {item["url"] for item in out}
    for item in items:
        url = (item.get("url") or "").strip()
        title = clean_text(item.get("title") or "")
        if not url or not title or url in seen or is_junk_url(url):
            continue
        seen.add(url)
        out.append(
            {
                "title": title,
                "url": url,
                "snippet": clean_text(item.get("snippet") or ""),
            }
        )
        if len(out) >= MAX_RESULTS:
            break
    return out


def fetch(url: str, method: str = "GET", data=None):
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8,tr;q=0.6",
        "DNT": "1",
        "Upgrade-Insecure-Requests": "1",
    }
    proxy_map = proxies()
    try:
        import requests

        try:
            response = requests.request(
                method,
                url,
                headers=headers,
                data=data,
                timeout=TIMEOUT_SEC,
                proxies=proxy_map,
                allow_redirects=True,
            )
        except Exception as err:
            if proxy_map:
                eprint(f"proxy-failed:{err}")
                response = requests.request(
                    method,
                    url,
                    headers=headers,
                    data=data,
                    timeout=TIMEOUT_SEC,
                    proxies=None,
                    allow_redirects=True,
                )
            else:
                raise
        return response.status_code, response.text, response.headers.get("content-type", "")
    except ImportError:
        from urllib.request import ProxyHandler, Request, build_opener

        handlers = []
        if proxy_map:
            handlers.append(ProxyHandler(proxy_map))
        opener = build_opener(*handlers)
        body = None
        if data is not None:
            if isinstance(data, dict):
                body = "&".join(
                    f"{quote_plus(str(key))}={quote_plus(str(value))}" for key, value in data.items()
                ).encode("utf-8")
            else:
                body = str(data).encode("utf-8")
            headers = {**headers, "Content-Type": "application/x-www-form-urlencoded"}
        request = Request(url, data=body, headers=headers, method=method)
        with opener.open(request, timeout=TIMEOUT_SEC) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.getcode(), response.read().decode(charset, "replace"), response.headers.get("content-type", "")


def soupify(html: str):
    try:
        from bs4 import BeautifulSoup

        return BeautifulSoup(html, "html.parser")
    except ImportError:
        return None


def parse_ddg_html(html: str, base: str):
    soup = soupify(html)
    items = []
    if soup:
        for block in soup.select(".result"):
            link = block.select_one("a.result__a, a.result-link, h2 a")
            if not link:
                continue
            snippet = block.select_one(".result__snippet, .result-snippet, .result__snippet.js-result-snippet")
            items.append(
                {
                    "title": link.get_text(" ", strip=True),
                    "url": unwrap_url(link.get("href") or "", base),
                    "snippet": snippet.get_text(" ", strip=True) if snippet else "",
                }
            )
        if not items:
            for link in soup.select("a.result-link"):
                row = link.find_parent("tr")
                snippet = row.select_one(".result-snippet") if row else None
                items.append(
                    {
                        "title": link.get_text(" ", strip=True),
                        "url": unwrap_url(link.get("href") or "", base),
                        "snippet": snippet.get_text(" ", strip=True) if snippet else "",
                    }
                )
        return unique_results(items)

    for match in re.finditer(
        r'href="([^"]+)"[^>]*class="[^"]*result(?:__a|-link)[^"]*"[^>]*>(.*?)</a>',
        html,
        re.I | re.S,
    ):
        items.append(
            {
                "title": re.sub(r"<[^>]+>", " ", match.group(2)),
                "url": unwrap_url(match.group(1), base),
                "snippet": "",
            }
        )
    return unique_results(items)


def parse_searx_html(html: str, base: str):
    soup = soupify(html)
    items = []
    if soup:
        for article in soup.select("article.result, article, .result"):
            link = article.select_one("h3 a, a.url_wrapper, a.result-url, a")
            if not link:
                continue
            snippet = article.select_one("p.content, .content, p")
            items.append(
                {
                    "title": link.get_text(" ", strip=True),
                    "url": unwrap_url(link.get("href") or "", base),
                    "snippet": snippet.get_text(" ", strip=True) if snippet else "",
                }
            )
        return unique_results(items)
    return []


def looks_blocked(html: str) -> bool:
    sample = (html or "").lower()
    return "select all squares" in sample or "unfortunately, bots use duckduckgo" in sample


def search_duckduckgo(query: str, deadline: float):
    encoded = quote_plus(query)
    acc = []
    first_attempts = (
        ("POST", "https://html.duckduckgo.com/html/", {"q": query, "b": "", "kl": "wt-wt"}),
        ("GET", f"https://html.duckduckgo.com/html/?q={encoded}", None),
        ("GET", f"https://lite.duckduckgo.com/lite/?q={encoded}", None),
    )
    for method, url, data in first_attempts:
        if time.monotonic() >= deadline:
            return acc
        try:
            status, body, _ctype = fetch(url, method=method, data=data)
        except Exception as err:
            eprint(f"ddg-failed:{err}")
            continue
        if status >= 400 or not body or looks_blocked(body):
            eprint(f"ddg-blocked:{status}")
            continue
        acc = unique_results(parse_ddg_html(body, url), acc)
        if acc:
            break
    if not acc:
        return []

    for start in range(30, MAX_PAGES * 10, 30):
        if len(acc) >= MAX_RESULTS or time.monotonic() >= deadline:
            break
        page_url = f"https://html.duckduckgo.com/html/?q={encoded}&s={start}"
        try:
            status, body, _ctype = fetch(page_url)
        except Exception as err:
            eprint(f"ddg-page-failed:{start}:{err}")
            break
        if status >= 400 or not body or looks_blocked(body):
            break
        next_acc = unique_results(parse_ddg_html(body, page_url), acc)
        if len(next_acc) == len(acc):
            break
        acc = next_acc
    return acc


def searx_rows(data):
    items = []
    for row in data.get("results") or []:
        items.append(
            {
                "title": row.get("title") or "",
                "url": row.get("url") or row.get("pretty_url") or "",
                "snippet": row.get("content") or row.get("snippet") or "",
            }
        )
    return items


def search_searx(query: str, deadline: float, acc=None):
    encoded = quote_plus(query)
    out = list(acc or [])
    for node in SEARX_NODES:
        if len(out) >= MAX_RESULTS or time.monotonic() >= deadline:
            return out
        json_ok = False
        stale = 0
        for pageno in range(1, MAX_PAGES + 1):
            if len(out) >= MAX_RESULTS or time.monotonic() >= deadline:
                return out
            json_url = f"{node}/search?q={encoded}&format=json&language=all&pageno={pageno}"
            try:
                status, body, ctype = fetch(json_url)
                if status < 400 and body and (
                    "json" in (ctype or "").lower() or body.lstrip().startswith("{")
                ):
                    data = json.loads(body)
                    json_ok = True
                    next_out = unique_results(searx_rows(data), out)
                    if len(next_out) > len(out):
                        stale = 0
                        out = next_out
                        continue
                    stale += 1
                    if stale >= 2:
                        break
                    continue
            except Exception as err:
                eprint(f"searx-json-failed:{node}:{pageno}:{err}")

            if pageno == 1 and not json_ok:
                html_url = f"{node}/search?q={encoded}"
                try:
                    status, body, _ctype = fetch(html_url)
                    if status < 400 and body:
                        out = unique_results(parse_searx_html(body, node), out)
                except Exception as err:
                    eprint(f"searx-html-failed:{node}:{err}")
            break
    return out


def main() -> int:
    query = " ".join(sys.argv[1:]).strip()
    if not query:
        emit([])
        return 1
    query = query[:MAX_QUERY]

    deadline = time.monotonic() + SEARCH_BUDGET_SEC
    results = search_duckduckgo(query, deadline)
    if len(results) < MAX_RESULTS:
        results = search_searx(query, deadline, results)
    emit(results)
    return 0 if results else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as err:
        eprint(f"fatal:{err}")
        emit([])
        raise SystemExit(2)
