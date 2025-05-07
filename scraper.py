import os, re, json, math, threading, smtplib, datetime as dt
from email.message import EmailMessage
from pathlib import Path

try:
    from zoneinfo import ZoneInfo          # Python 3.9+
except Exception:                          # zoneinfo or tzdata unavailable
    ZoneInfo = None

def utc_tz():
    try:
        return ZoneInfo("UTC") if ZoneInfo else dt.timezone.utc
    except Exception:
        return dt.timezone.utc

def dbg(msg: str):
    print(f"[{dt.datetime.now().isoformat(timespec='seconds')}] {msg}")

def haversine(lat1, lon1, lat2, lon2) -> float:
    R = 3958.8
    f1, f2 = math.radians(lat1), math.radians(lat2)
    d_f, d_l = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(d_f / 2) ** 2 + math.cos(f1) * math.cos(f2) * math.sin(d_l / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a)) * 5280        # feet

BASE = Path(__file__).parent
MAIN_PATH   = BASE / "main.txt"
SCRAPED_TXT = BASE / "scraped.txt"
PARKED_TXT  = BASE / "parked.txt"
LOC_TXT     = BASE / "location.txt"

with LOC_TXT.open(encoding="utf-8") as f:
    txt = re.sub(r"(\bname\b|\blat\b|\blng\b)\s*:", r'"\1":', f.read().strip())
    location_data = {r["name"].upper(): (r["lat"], r["lng"]) for r in json.loads("[" + txt.rstrip(",") + "]")}
dbg(f"Loaded {len(location_data)} location → coordinate mappings")

scraped = {ln.split(",")[0].lstrip('"').upper() for ln in SCRAPED_TXT.read_text("utf-8").splitlines()} if SCRAPED_TXT.exists() else set()
dbg(f"Loaded {len(scraped)} tickets already in scraped.txt")

parkers = []
if PARKED_TXT.exists():
    for ln in PARKED_TXT.read_text("utf-8").splitlines():
        email, full, loc, ts_end, hours, lat, lng = ln.split(",", 6)
        parkers.append(dict(email=email, full=full, loc_name=loc,
                            ts_end=dt.datetime.fromisoformat(ts_end),
                            hours=float(hours), lat=float(lat), lng=float(lng)))
dbg(f"Loaded {len(parkers)} active parker(s) from parked.txt")

import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core import exceptions as g_exceptions
dbg("Initialising Firebase…")
firebase_admin.initialize_app(credentials.Certificate("cred.json"))
db = firestore.client()
dbg("Firebase ready ✔")

GMAIL_USER = "taps.slug.tracker@gmail.com"
GMAIL_PW   = os.getenv("GMAIL_APP_PASSWORD")
if not GMAIL_PW:
    raise RuntimeError("Set env var GMAIL_APP_PASSWORD to your Gmail app password")


# ─────────────────────── fuzzy location lookup ────────────────────────
def get_coords(loc: str):
    """
    Return (lat, lng) for *loc* using:
      1) exact match in location_data
      2) numeric prefix match  (e.g. "127 WEST REMOTE" ↔ "LOT 127")
      3) numeric‑letter prefix (e.g. "120B UPPER…" ↔ "120A LOWER…")
    """
    key = loc.upper().strip()

    # 1 exact
    if key in location_data:
        return location_data[key]

    # 2/3 numeric or alphanumeric prefix
    m = re.match(r"\s*(\d+\w*)", key)        # captures 127, 120B, …
    if m:
        prefix = m.group(1)                  # → '127' or '120B'
        for name, coords in location_data.items():
            if name.startswith(prefix):
                return coords
    return None



# ───────────────────────────── e‑mail helper ───────────────────────────────
def send_alert(to_email: str, to_name: str,
               p_loc: str, t_loc: str, dist_ft: float) -> None:
    """
    Send “TAPS spotted” alert via Gmail (app‑password auth).

    Uses smtp.gmail.com:587 + STARTTLS – identical to your successful test.py.
    """
    msg = EmailMessage()
    msg["From"]    = GMAIL_USER
    msg["To"]      = to_email
    msg["Subject"] = "TAPS spotted near your car!"
    msg.set_content(
        f"Hey {to_name},\n\n"
        f"TAPS was just seen issuing a citation at {t_loc}.\n"
        f"They're roughly {int(dist_ft):,} ft from your car parked at {p_loc}.\n"
        "Keep an eye out!\n\n— TAPS Tracker"
    )

    # STARTTLS handshake (same as test.py)
    with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(GMAIL_USER, GMAIL_PW)
        smtp.send_message(msg)

    dbg(f"Alert email sent → {to_email}")


from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

dbg("Launching headless Chrome…")
opts = webdriver.ChromeOptions()
opts.add_argument("--headless")
opts.add_argument("--disable-gpu")
opts.add_argument("--disable-logging")
opts.add_argument("--log-level=3")
driver = webdriver.Chrome(options=opts)
dbg("Chrome ready ✔")
WAIT, WAIT_REL = WebDriverWait(driver, 6), WebDriverWait(driver, 2)
BASE_URL = "https://ucsc.aimsparking.com/tickets/"
_stop, _snap_started = threading.Event(), False

def _snap_worker():
    while not _stop.is_set():
        try:
            fn = dt.datetime.now().strftime("screenshots/%Y%m%d_%H%M%S.png")
            driver.save_screenshot(fn)
        except Exception:
            pass
        _stop.wait(5)

def start_snaps():
    global _snap_started
    if not _snap_started:
        threading.Thread(target=_snap_worker, daemon=True).start()
        _snap_started = True

def save_ticket(tid: str, loc: str, when: str):
    if tid.upper() in scraped:
        return
    date, clock = when.split()[:2]
    m, d, y = map(int, date.split("/"))
    with SCRAPED_TXT.open("a", encoding="utf-8") as f:
        f.write(f'"{tid.upper()},{loc},{clock.replace(":","")},{m}/{d}/{y}",\n')
    scraped.add(tid.upper())
    dbg(f"Saved → scraped.txt : {tid},{loc}")

def _extract_ticket_meta():
    try:
        issue = driver.find_element(By.XPATH, "//p[strong[text()='Issue Date and Time:']]").text
        loc   = driver.find_element(By.XPATH, "//p[strong[text()='Location:']]").text
        return loc.replace("Location: ", ""), issue.replace("Issue Date and Time: ", "")
    except Exception:
        return None, None

def _process_related(done: set, plate: str, tkts: list):
    try:
        WAIT_REL.until(EC.presence_of_element_located(
            (By.XPATH, "//a[contains(@aria-label,'View ticket')]")))
    except TimeoutException:
        return

    while True:
        unseen = [(lbl.split("#")[1].strip().upper(), btn)
                  for btn in driver.find_elements(By.XPATH,
                             "//a[contains(@aria-label,'View ticket')]")
                  if "#" in (lbl := btn.get_attribute("aria-label"))
                  and (cid := lbl.split("#")[1].strip().upper()) not in done]
        if not unseen:
            break

        tid, btn = unseen[0]
        try:
            driver.execute_script("arguments[0].click();", btn)
            WAIT.until(EC.presence_of_element_located(
                (By.XPATH, "//h3[normalize-space()='Ticket Information']")))
            start_snaps()

            loc, when = _extract_ticket_meta()
            if loc and when:
                save_ticket(tid, loc, when)
                tkts.append({"citationNumber": tid,
                             "location": loc,
                             "issueDate": when})
                done.add(tid)

                # ⇢ proximity alert for related ticket
                coords = get_coords(loc)
                if coords:
                    t_lat, t_lng = coords
                    for p in parkers:
                        if dt.datetime.now(utc_tz()) > p["ts_end"]:
                            continue
                        dist_ft = haversine(t_lat, t_lng, p["lat"], p["lng"])
                        if dist_ft <= 528_000:
                            try:
                                send_alert(p["email"], p["full"],
                                           p["loc_name"], loc, dist_ft)
                            except Exception as e:
                                dbg(f"‼ email error → {p['email']}: {e}")

        except (TimeoutException, WebDriverException):
            pass
        finally:
            try:
                driver.back()
                WAIT.until(EC.presence_of_element_located(
                    (By.XPATH, "//a[contains(@aria-label,'View ticket')]")))
            except TimeoutException:
                break

# ─────────────────────────── scrape one citation ───────────────────────────
def process(plate: str, citation: str):
    """
    Returns
    -------
    ok  : bool   – the (citation,plate) pair is valid (keep it in main.txt)
    data: list   – list of ticket‑dicts scraped this pass (may be empty)
    """
    tid = citation.upper()
    dbg(f"==== {tid} / {plate} ====")

    tickets_data, done = [], {tid}

    try:
        # submit the query ---------------------------------------------------
        driver.get(BASE_URL)
        start_snaps()
        WAIT.until(EC.presence_of_element_located((By.ID, "plate_vin"))).send_keys(plate)
        WAIT.until(EC.presence_of_element_located((By.ID, "ticket_number"))).send_keys(citation)
        WAIT.until(EC.element_to_be_clickable((By.ID, "search_ticket"))).click()
        WAIT.until(EC.presence_of_element_located(
            (By.XPATH, "//h3[normalize-space()='Ticket Information']")))

        # quick “already‑done?” check ---------------------------------------
        page_ids = {tid}
        page_ids.update(lbl.split("#")[1].strip().upper()
                        for a in driver.find_elements(By.XPATH,
                               "//a[contains(@aria-label,'View ticket')]")
                        if "#" in (lbl := a.get_attribute("aria-label")))

        if page_ids.issubset(scraped):
            dbg(f"All {len(page_ids)} tickets already scraped – skipping details.")
            return True, []          # ✅ valid combo, nothing new right now

        # current ticket meta -----------------------------------------------
        loc, when = _extract_ticket_meta()
        if loc and when:
            save_ticket(tid, loc, when)
            tickets_data.append({"citationNumber": tid,
                                 "location": loc,
                                 "issueDate": when})

            # proximity alert ----------------------------------------------
                    # current ticket meta -----------------------------------------------
        loc, when = _extract_ticket_meta()
        if loc and when:
            save_ticket(tid, loc, when)
            tickets_data.append({"citationNumber": tid,
                                 "location": loc,
                                 "issueDate": when})

            # ⇢ proximity alert  (uses fuzzy lookup)
            coords = get_coords(loc)         # ← changed line
            if coords:
                t_lat, t_lng = coords
                for p in parkers:
                    if dt.datetime.now(utc_tz()) > p["ts_end"]:
                        continue
                    dist_ft = haversine(t_lat, t_lng, p["lat"], p["lng"])
                    if dist_ft <= 528_000:   # 100 mi
                        try:
                            send_alert(p["email"], p["full"],
                                       p["loc_name"], loc, dist_ft)
                        except Exception as e:
                            dbg(f"‼ email error → {p['email']}: {e}")


        # related tickets ----------------------------------------------------
        _process_related(done, plate, tickets_data)

        return True, tickets_data      # keep row even if tickets_data == []

    except Exception as e:
        dbg(f"‼ Error processing {tid}: {e}")
        return False, []               # remove row – appears invalid


def check_parked_users(col: str = "parked_users"):
    """
    • Copy every *active* parker from Firestore → parked.txt (dedupe).  
    • Delete Firestore docs whose parking time has expired.  
    • ALSO prune those expired car‑owners from parked.txt.
    """
    global parkers                                         # we’ll rebuild it
    dbg("------ Checking parked_users collection ------")

    now_utc = dt.datetime.now(utc_tz())
    try:
        docs = list(db.collection(col).stream())
    except g_exceptions.PermissionDenied as e:
        dbg(f"‼ parked_users check skipped – permission denied: {e.message}")
        return

    existing = {(p["email"], p["loc_name"]) for p in parkers}
    new_lines, active_parkers = [], []                     # rebuild list fresh

    for doc in docs:
        d = doc.to_dict() or {}
        email   = d.get("email", "").strip()
        full    = d.get("fullName", "").strip()
        loc     = d.get("location", "").strip()
        hours   = float(d.get("hours", 0) or 0)
        start_ts = d.get("start")                          # Firestore TS

        if not (email and full and loc and start_ts and hours):
            continue

        # compute end‑time -------------------------------
        start_dt = start_ts.replace(tzinfo=utc_tz())
        end_dt   = start_dt + dt.timedelta(hours=hours)

        # expired → delete doc and skip writing to parked.txt
        if now_utc > end_dt:
            try:
                doc.reference.delete()
            except g_exceptions.PermissionDenied:
                pass
            continue

        # active –> keep in memory / parked.txt ----------
        coords = get_coords(loc)
        if not coords:
            dbg(f"⚠ Unknown location: {loc}")
            continue
        lat, lng = coords

        active_parkers.append(dict(email=email, full=full, loc_name=loc,
                                   ts_end=end_dt, hours=hours,
                                   lat=lat, lng=lng))

        if (email, loc) not in existing:                   # dedupe parked.txt
            new_lines.append(f"{email},{full},{loc},{end_dt.isoformat()},"
                             f"{hours},{lat},{lng}")
            existing.add((email, loc))

    # overwrite parked.txt with ONLY the active parkers
    PARKED_TXT.write_text(
        "\n".join(f"{p['email']},{p['full']},{p['loc_name']},"
                  f"{p['ts_end'].isoformat()},{p['hours']},{p['lat']},{p['lng']}"
                  for p in active_parkers) + ("\n" if active_parkers else ""),
        encoding="utf-8"
    )

    parkers = active_parkers                               # update global list
    dbg(f"Updated parked.txt → {len(parkers)} active parker(s)")
    dbg("------ parked_users check complete ------")


def precheck_new_users(col: str = "new_users"):
    dbg("------ Checking new_users for fresh submissions ------")
    try: docs = list(db.collection(col).stream())
    except g_exceptions.PermissionDenied as e:
        dbg(f"‼ new_users check skipped – permission denied: {e.message}"); return
    existing = {ln.strip().upper() for ln in MAIN_PATH.read_text("utf-8").splitlines()} if MAIN_PATH.exists() else set()
    new_lines = []
    for doc in docs:
        d = doc.to_dict() or {}
        plate, citation = (d.get("licensePlate") or "").strip(), (d.get("citationNumber") or "").strip()
        email, full = (d.get("email") or "").strip(), (d.get("fullName") or "").strip()
        if not (plate and citation):
            doc.reference.delete(); continue
        _, tickets = process(plate, citation)
        uid = email or plate
        db.collection("current_users").document(uid).set({
            "fullName": full, "email": email, "licensePlate": plate,
            "tickets": firestore.ArrayUnion(tickets),
            "lastUpdated": firestore.SERVER_TIMESTAMP,
        }, merge=True)
        line = f"{citation.upper()},{plate}"
        if line.upper() not in existing:
            new_lines.append(line); existing.add(line.upper())
        doc.reference.delete()
    if new_lines:
        with MAIN_PATH.open("a", encoding="utf-8") as f: f.write("\n".join(new_lines) + "\n")
        dbg(f"Added {len(new_lines)} ticket(s) from new_users to main.txt")
    dbg("------ new_users check complete ------")

def transfer_firestore_to_main(col: str = "bruh"):
    dbg("------ Transferring bruh → main.txt ------")
    try: docs = list(db.collection(col).stream())
    except g_exceptions.PermissionDenied as e:
        dbg(f"‼ transfer skipped – permission denied: {e.message}"); return
    existing = {ln.strip().upper() for ln in MAIN_PATH.read_text("utf-8").splitlines()} if MAIN_PATH.exists() else set()
    new_lines = []
    for doc in docs:
        d = doc.to_dict() or {}
        t = (d.get("citationNumber") or "").strip().upper()
        p = (d.get("licensePlate") or "").strip()
        if not (t and p): doc.reference.delete(); continue
        line = f"{t},{p}"
        if line.upper() not in existing:
            new_lines.append(line); existing.add(line.upper())
        doc.reference.delete()
    if new_lines:
        with MAIN_PATH.open("a", encoding="utf-8") as f: f.write("\n".join(new_lines) + "\n")
        dbg(f"Appended {len(new_lines)} new ticket(s) to main.txt")
    dbg("------ transfer complete ------")

def _rewrite_main(rows):
    tmp = MAIN_PATH.with_suffix(".tmp")
    tmp.write_text("\n".join(rows) + ("\n" if rows else ""))
    tmp.replace(MAIN_PATH)
    dbg(f"Re‑wrote main.txt → kept {len(rows)} valid rows")

def scrape_main():
    if not MAIN_PATH.exists():
        dbg("main.txt not found – nothing to scrape."); return
    rows = [ln.strip() for ln in MAIN_PATH.read_text("utf-8").splitlines() if ln.strip()]
    valid = []
    for ln in rows:
        citation, plate = (p.strip() for p in ln.split(",", 1))
        ok, _ = process(plate, citation)
        if ok: valid.append(ln)
        else: dbg(f"Removed invalid entry from main.txt: {ln}")
    _rewrite_main(valid)

if __name__ == "__main__":
    check_parked_users()
    precheck_new_users()
    transfer_firestore_to_main()
    scrape_main()
    dbg("Done – shutting down")
    _stop.set(); driver.quit()
    dbg("Chrome closed ✔")
