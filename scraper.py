"""
scraper.py – Firestore first, then main.txt.
• Prints clear console banners when switching sources
• Silences Chromium noise (--disable-logging --log-level=3)
• Waits up to 2 s for related-ticket links (no skips)
• Prunes bad rows from main.txt
"""

import concurrent.futures
import datetime as dt
import os
import threading
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core import exceptions as g_exceptions
from selenium import webdriver
from selenium.common.exceptions import (
    StaleElementReferenceException,
    TimeoutException,
    WebDriverException,
)
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


def dbg(msg: str):
    print(f"[{dt.datetime.now().isoformat(timespec='seconds')}] {msg}")


# ───────────── main.txt helpers ─────────────
MAIN_PATH = Path("main.txt")


def load_main_file():
    rows = []
    if not MAIN_PATH.exists():
        dbg("No main.txt found – skipping file tickets")
        return rows

    with MAIN_PATH.open(encoding="utf-8") as f:
        for ln in f:
            if not (ln := ln.strip()):
                continue
            parts = [p.strip() for p in ln.split(",")]
            if len(parts) != 2:
                dbg(f"Malformed line in main.txt skipped: {ln!r}")
                continue
            rows.append(
                {
                    "ticket_number": parts[0].upper(),
                    "plate_number": parts[1],
                    "raw_line": ln,
                }
            )
    dbg(f"Loaded {len(rows)} main tickets from main.txt")
    return rows


def rewrite_main_file(valid_lines):
    tmp = MAIN_PATH.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        for line in valid_lines:
            f.write(line + "\n")
    tmp.replace(MAIN_PATH)
    dbg(f"Re‑wrote main.txt → kept {len(valid_lines)} valid rows")


# ───────────── Firebase ─────────────
dbg("Initialising Firebase…")
firebase_admin.initialize_app(credentials.Certificate("cred.json"))
db = firestore.client()
dbg("Firebase ready ✔")


def _fetch_docs(col):
    return [
        {"plate_number": d.get("licensePlate"), "ticket_number": d.get("citationNumber")}
        for d in db.collection(col).stream()
    ]


def fetch_citations(collection="bruh", timeout=15):
    dbg(f"Fetching Firestore collection '{collection}' (timeout {timeout}s)…")
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(_fetch_docs, collection)
        try:
            docs = fut.result(timeout=timeout)
            dbg(f"Fetched {len(docs)} docs ✔")
            return docs
        except (concurrent.futures.TimeoutError, g_exceptions.GoogleAPICallError) as e:
            dbg(f"‼ Firestore fetch failed: {e}")
            return []


# ───────────── Selenium ─────────────
dbg("Launching headless Chrome…")
opts = webdriver.ChromeOptions()
opts.add_argument("--headless")
opts.add_argument("--disable-gpu")
opts.add_argument("--disable-logging")
opts.add_argument("--log-level=3")
driver = webdriver.Chrome(options=opts)
dbg("Chrome ready ✔")

WAIT = WebDriverWait(driver, 6)
WAIT_RELATED = WebDriverWait(driver, 2)
BASE_URL = "https://ucsc.aimsparking.com/tickets/"

# silent screenshot thread
os.makedirs("screenshots", exist_ok=True)
_stop_snaps = threading.Event()
_snap_started = [False]


def _snap_worker():
    while not _stop_snaps.is_set():
        try:
            driver.save_screenshot(
                dt.datetime.now().strftime("screenshots/%Y%m%d_%H%M%S.png")
            )
        except Exception:
            pass
        _stop_snaps.wait(5)


def start_snaps():
    if not _snap_started[0]:
        threading.Thread(target=_snap_worker, daemon=True).start()
        _snap_started[0] = True


# ───────────── scraped.txt helpers ─────────────
SCRAPED = Path("scraped.txt")


def load_existing():
    if not SCRAPED.exists():
        return set()
    with SCRAPED.open(encoding="utf-8") as f:
        return {ln.split(",")[0].lstrip('"').upper() for ln in f if ln.strip()}


existing = load_existing()
dbg(f"Loaded {len(existing)} tickets already in scraped.txt")


def save_ticket(tid: str, loc: str, when: str):
    up = tid.upper()
    if up in existing:
        return
    date_part, time_part = when.split()[:2]
    m, d, y = map(int, date_part.split("/"))
    line = f'"{up},{loc},{time_part.replace(":","")},{m}/{d}/{y}",\n'
    with SCRAPED.open("a", encoding="utf-8") as f:
        f.write(line)
    existing.add(up)
    dbg(f"Saved → scraped.txt : {line.strip()}")


# ───────────── scraping helpers ─────────────
def extract_data():
    try:
        issue = driver.find_element(
            By.XPATH, "//p[strong[text()='Issue Date and Time:']]"
        ).text.replace("Issue Date and Time: ", "")
        loc = driver.find_element(
            By.XPATH, "//p[strong[text()='Location:']]"
        ).text.replace("Location: ", "")
        return loc, issue
    except Exception:
        return None, None


def _view_buttons():
    return driver.find_elements(By.XPATH, "//a[contains(@aria-label,'View ticket')]")


def process_related(processed: set[str]):
    # wait briefly for related list
    try:
        WAIT_RELATED.until(
            EC.presence_of_element_located(
                (By.XPATH, "//a[contains(@aria-label,'View ticket')]")
            )
        )
    except TimeoutException:
        return

    while True:
        unseen = [
            (
                label.split("#")[1].strip().upper(),
                btn,
            )
            for btn in _view_buttons()
            if (label := btn.get_attribute("aria-label")) and "#" in label
            if label.split("#")[1].strip().upper() not in processed
            if label.split("#")[1].strip().upper() not in existing
        ]
        if not unseen:
            break

        tid, btn = unseen[0]
        try:
            driver.execute_script("arguments[0].click();", btn)
            WAIT.until(
                EC.presence_of_element_located(
                    (By.XPATH, "//h3[normalize-space()='Ticket Information']")
                )
            )
            start_snaps()

            loc, when = extract_data()
            if loc and when:
                save_ticket(tid, loc, when)
                processed.add(tid)
        except (StaleElementReferenceException, TimeoutException, WebDriverException):
            continue
        finally:
            try:
                driver.back()
                WAIT.until(
                    EC.presence_of_element_located(
                        (By.XPATH, "//a[contains(@aria-label,'View ticket')]")
                    )
                )
            except TimeoutException:
                break


def process_ticket(plate: str, ticket: str) -> bool:
    tid = ticket.upper()
    dbg(f"==== {tid} / {plate} ====")
    processed = {tid}
    try:
        driver.get(BASE_URL)
        start_snaps()

        WAIT.until(EC.presence_of_element_located((By.ID, "plate_vin"))).send_keys(plate)
        WAIT.until(EC.presence_of_element_located((By.ID, "ticket_number"))).send_keys(
            ticket
        )
        WAIT.until(EC.element_to_be_clickable((By.ID, "search_ticket"))).click()

        WAIT.until(
            EC.presence_of_element_located(
                (By.XPATH, "//h3[normalize-space()='Ticket Information']")
            )
        )

        loc, when = extract_data()
        if loc and when:
            save_ticket(tid, loc, when)

        process_related(processed)
        return True
    except Exception as exc:
        dbg(f"‼ Error processing {tid}: {exc}")
        return False


# ───────────── main workflow ─────────────
if __name__ == "__main__":
    # 1️⃣  Firestore tickets
    dbg("------ Starting Firestore tickets ------")
    for row in fetch_citations():
        process_ticket(row["plate_number"], row["ticket_number"])

    # 2️⃣  main.txt tickets
    dbg("------ Starting main.txt tickets ------")
    main_rows = load_main_file()
    valid_lines = []
    for row in main_rows:
        if process_ticket(row["plate_number"], row["ticket_number"]):
            valid_lines.append(row["raw_line"])
        else:
            dbg(f"Removed invalid entry from main.txt: {row['raw_line']}")

    if MAIN_PATH.exists():
        rewrite_main_file(valid_lines)

    dbg("Done – shutting down")
    _stop_snaps.set()
    driver.quit()
    dbg("Chrome closed ✔")
