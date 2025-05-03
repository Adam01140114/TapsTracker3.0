"""
scraper.py
---------------------------------------------------------------------
1. Move every ticket from Firestore ('bruh') to main.txt (if allowed),
   deleting the Firestore docs afterwards.
2. Scrape everything in main.txt.
3. Removes invalid rows from main.txt.
---------------------------------------------------------------------
"""

import concurrent.futures, datetime as dt, os, threading
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core import exceptions as g_exceptions
from selenium import webdriver
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException, WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


def dbg(m): print(f"[{dt.datetime.now().isoformat(timespec='seconds')}] {m}")


MAIN_PATH, SCRAPED = Path("main.txt"), Path("scraped.txt")
os.makedirs("screenshots", exist_ok=True)

# ── Firebase ────────────────────────────────────────────
dbg("Initialising Firebase…")
firebase_admin.initialize_app(credentials.Certificate("cred.json"))
db = firestore.client()
dbg("Firebase ready ✔")

# ── Transfer Firestore → main.txt ───────────────────────
def transfer_firestore_to_main(col="bruh"):
    dbg("------ Transferring Firestore tickets to main.txt ------")
    try:
        docs = list(db.collection(col).stream())
    except g_exceptions.PermissionDenied as e:
        dbg(f"‼ Firestore transfer skipped – permission denied: {e.message}")
        dbg("------ Starting main.txt tickets ------")
        return

    existing = {ln.strip().upper() for ln in MAIN_PATH.read_text(encoding="utf-8").splitlines()} if MAIN_PATH.exists() else set()
    new_lines, delete_refs = [], []

    for d in docs:
        data = d.to_dict() or {}
        t, p = (data.get("citationNumber") or "").strip().upper(), (data.get("licensePlate") or "").strip()
        if not (t and p): continue
        line = f"{t},{p}"
        if line.upper() not in existing:
            new_lines.append(line); existing.add(line.upper())
        delete_refs.append(d.reference)

    if new_lines:
        with MAIN_PATH.open("a", encoding="utf-8") as f:
            f.write("\n".join(new_lines) + "\n")

    for ref in delete_refs:
        try: ref.delete()
        except g_exceptions.PermissionDenied: pass

    dbg(f"Moved {len(new_lines)} new ticket(s) and attempted to delete {len(delete_refs)} doc(s)")
    dbg("------ Starting main.txt tickets ------")

transfer_firestore_to_main()

# ── Selenium setup ──────────────────────────────────────
dbg("Launching headless Chrome…")
opts = webdriver.ChromeOptions(); opts.add_argument("--headless"); opts.add_argument("--disable-gpu")
opts.add_argument("--disable-logging"); opts.add_argument("--log-level=3")
driver = webdriver.Chrome(options=opts)
dbg("Chrome ready ✔")

WAIT, WAIT_REL = WebDriverWait(driver, 6), WebDriverWait(driver, 2)
BASE_URL = "https://ucsc.aimsparking.com/tickets/"

_stop, _started = threading.Event(), [False]
def _snap_worker():
    while not _stop.is_set():
        try: driver.save_screenshot(dt.datetime.now().strftime("screenshots/%Y%m%d_%H%M%S.png"))
        except Exception: pass
        _stop.wait(5)
def start_snaps(): 
    if not _started[0]:
        threading.Thread(target=_snap_worker, daemon=True).start(); _started[0] = True

# ── scraped.txt cache ──────────────────────────────────
scraped = {ln.split(",")[0].lstrip('"').upper() for ln in SCRAPED.read_text(encoding="utf-8").splitlines()} if SCRAPED.exists() else set()
dbg(f"Loaded {len(scraped)} tickets already in scraped.txt")
def save_ticket(tid, loc, when):
    if tid.upper() in scraped: return
    date, t = when.split()[:2]; m, d, y = map(int, date.split("/"))
    with SCRAPED.open("a", encoding="utf-8") as f:
        f.write(f'"{tid.upper()},{loc},{t.replace(":","")},{m}/{d}/{y}",\n')
    scraped.add(tid.upper()); dbg(f"Saved → scraped.txt : {tid},{loc}")

# ── helpers ────────────────────────────────────────────
def extract(): 
    try:
        issue = driver.find_element(By.XPATH,"//p[strong[text()='Issue Date and Time:']]").text.replace("Issue Date and Time: ","")
        loc   = driver.find_element(By.XPATH,"//p[strong[text()='Location:']]").text.replace("Location: ","")
        return loc, issue
    except Exception: return None, None

def process_related(done:set):
    try: WAIT_REL.until(EC.presence_of_element_located((By.XPATH,"//a[contains(@aria-label,'View ticket')]")))
    except TimeoutException: return
    while True:
        unseen=[(l.split("#")[1].strip().upper(),b) for b in driver.find_elements(By.XPATH,"//a[contains(@aria-label,'View ticket')]")
                if "#" in (l:=b.get_attribute("aria-label")) and l.split("#")[1].strip().upper() not in done and l.split("#")[1].strip().upper() not in scraped]
        if not unseen: break
        tid,btn=unseen[0]
        try:
            driver.execute_script("arguments[0].click();",btn)
            WAIT.until(EC.presence_of_element_located((By.XPATH,"//h3[normalize-space()='Ticket Information']")))
            start_snaps()
            loc,when=extract()
            if loc and when: save_ticket(tid,loc,when); done.add(tid)
        except (TimeoutException,WebDriverException): pass
        finally:
            try: driver.back(); WAIT.until(EC.presence_of_element_located((By.XPATH,"//a[contains(@aria-label,'View ticket')]")))
            except TimeoutException: break

def process(plate,ticket):
    tid=ticket.upper(); dbg(f"==== {tid} / {plate} ===="); done={tid}
    try:
        driver.get(BASE_URL); start_snaps()
        WAIT.until(EC.presence_of_element_located((By.ID,"plate_vin"))).send_keys(plate)
        WAIT.until(EC.presence_of_element_located((By.ID,"ticket_number"))).send_keys(ticket)
        WAIT.until(EC.element_to_be_clickable((By.ID,"search_ticket"))).click()
        WAIT.until(EC.presence_of_element_located((By.XPATH,"//h3[normalize-space()='Ticket Information']")))
        loc,when=extract()
        if loc and when: save_ticket(tid,loc,when)
        process_related(done); return True
    except Exception as e: dbg(f"‼ Error processing {tid}: {e}"); return False

# ── rewrite helper (bug‑fix) ───────────────────────────
def rewrite_main_file(valid):
    tmp=MAIN_PATH.with_suffix(".tmp")
    with tmp.open("w",encoding="utf-8") as f:
        for ln in valid: f.write(ln+"\n")
    tmp.replace(MAIN_PATH); dbg(f"Re‑wrote main.txt → kept {len(valid)} valid rows")

# ── scrape main.txt ────────────────────────────────────
def scrape_main():
    if not MAIN_PATH.exists(): dbg("main.txt not found – nothing to scrape."); return
    rows=[ln.strip() for ln in MAIN_PATH.read_text(encoding="utf-8").splitlines() if ln.strip()]
    valid=[]
    for ln in rows:
        ticket,plate=[p.strip() for p in ln.split(",")]
        if process(plate,ticket): valid.append(ln)
        else: dbg(f"Removed invalid entry from main.txt: {ln}")
    rewrite_main_file(valid)

# ── run ────────────────────────────────────────────────
if __name__=="__main__":
    scrape_main()
    dbg("Done – shutting down"); _stop.set(); driver.quit(); dbg("Chrome closed ✔")
