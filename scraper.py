"""
scraper.py  –  Reads main tickets from main.txt first, then Firestore.
               Keeps earlier logic: screenshots, skips duplicates, etc.
"""

import concurrent.futures
import datetime as dt
import os
import threading
import time
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core import exceptions as g_exceptions

from selenium import webdriver
from selenium.common.exceptions import (
    StaleElementReferenceException,
    TimeoutException,
)
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


# ───────────────────── Debug helper ─────────────────────
def dbg(msg: str):
    print(f"[{dt.datetime.now().isoformat(timespec='seconds')}] {msg}")


# ───────────────────── Load main.txt ─────────────────────
def load_main_file(path: str = "main.txt") -> list[dict]:
    """
    Read comma‑separated ticket,plate rows from main.txt.
    Returns list[{"ticket_number": str, "plate_number": str}]
    """
    file_path = Path(path)
    if not file_path.exists():
        dbg(f"No {path} found – skipping file tickets")
        return []

    rows = []
    with file_path.open(encoding="utf-8") as f:
        for ln in f:
            ln = ln.strip()
            if not ln:
                continue
            parts = [p.strip() for p in ln.split(",")]
            if len(parts) != 2:
                dbg(f"Malformed line in {path} skipped: {ln!r}")
                continue
            ticket, plate = parts[0].upper(), parts[1]
            rows.append({"ticket_number": ticket, "plate_number": plate})
    dbg(f"Loaded {len(rows)} main tickets from {path}")
    return rows


# ───────────────────── Firebase setup ─────────────────────
dbg("Initialising Firebase…")
firebase_admin.initialize_app(credentials.Certificate("cred.json"))
db = firestore.client()
dbg("Firebase ready ✔")


def _fetch_docs(collection, limit):
    ref = db.collection(collection)
    if limit:
        ref = ref.limit(limit)
    return [
        {"plate_number": d.get("licensePlate"), "ticket_number": d.get("citationNumber")}
        for d in ref.stream()
    ]


def fetch_citations(collection="bruh", timeout=15):
    dbg(f"Fetching Firestore collection '{collection}' (timeout {timeout}s)…")
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(_fetch_docs, collection, None)
        try:
            docs = fut.result(timeout=timeout)
            dbg(f"Fetched {len(docs)} docs ✔")
            return docs
        except (concurrent.futures.TimeoutError, g_exceptions.GoogleAPICallError) as e:
            dbg(f"‼ Firestore fetch failed: {e}")
            return []


# ───────────────────── Selenium setup ─────────────────────
dbg("Launching headless Chrome…")
opts = webdriver.ChromeOptions()
opts.add_argument("--headless")
opts.add_argument("--disable-gpu")
driver = webdriver.Chrome(options=opts)
dbg("Chrome ready ✔")

WAIT = WebDriverWait(driver, 12)
BASE_URL = "https://ucsc.aimsparking.com/tickets/"

# ───────── screenshots (start after first nav) ─────────
os.makedirs("screenshots", exist_ok=True)
_stop_snaps = threading.Event()
_snap_started = [False]


def _snap_worker():
    while not _stop_snaps.is_set():
        fn = dt.datetime.now().strftime("screenshots/%Y%m%d_%H%M%S.png")
        try:
            driver.save_screenshot(fn)
            dbg(f"Screenshot → {fn}")
        except Exception as e:
            dbg(f"Screenshot error: {e}")
        _stop_snaps.wait(5)


def start_snaps():
    if not _snap_started[0]:
        threading.Thread(target=_snap_worker, daemon=True).start()
        _snap_started[0] = True


# ───────── scraped.txt helpers ─────────
SCRAPED = Path("scraped.txt")


def load_existing() -> set[str]:
    if not SCRAPED.exists():
        return set()
    with SCRAPED.open(encoding="utf-8") as f:
        rows = {
            line.lstrip('"').split(",")[0].upper() for line in f if line.strip()
        }
    dbg(f"Loaded {len(rows)} tickets already in scraped.txt")
    return rows


existing = load_existing()


def save_ticket(tid: str, loc: str, when: str):
    if tid.upper() in existing:
        return
    date_part, time_part = when.split()[:2]
    m, d, y = map(int, date_part.split("/"))
    time_clean = time_part.replace(":", "")
    line = f'"{tid},{loc},{time_clean},{m}/{d}/{y}",\n'
    with SCRAPED.open("a", encoding="utf-8") as f:
        f.write(line)
    existing.add(tid.upper())
    dbg(f"Saved → scraped.txt : {line.strip()}")


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


# ───────── scraping helpers ─────────
def _view_buttons():
    return driver.find_elements(By.XPATH, "//a[contains(@aria-label,'View ticket')]")


def process_related(processed: set[str]):
    while True:
        try:
            unseen = []
            for btn in _view_buttons():
                label = btn.get_attribute("aria-label")
                if "#" not in label:
                    continue
                tid = label.split("#")[1].strip().upper()
                if tid not in processed and tid not in existing:
                    unseen.append((tid, btn))

            if not unseen:
                break

            tid, btn = unseen[0]
            dbg(f"→ Related ticket {tid}")
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
        except (StaleElementReferenceException, TimeoutException):
            pass
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


def process_ticket(plate: str, ticket: str):
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

    except Exception as exc:
        dbg(f"‼ Error processing {tid}: {exc}")


# ───────── main ─────────
if __name__ == "__main__":
    # 1. main.txt tickets
    file_tickets = load_main_file()
    for row in file_tickets:
        process_ticket(row["plate_number"], row["ticket_number"])

    # 2. Firestore tickets (after file ones)
    fb_tickets = fetch_citations()
    for row in fb_tickets:
        process_ticket(row["plate_number"], row["ticket_number"])

    dbg("Done – shutting down")
    _stop_snaps.set()
    driver.quit()
    dbg("Chrome closed ✔")
