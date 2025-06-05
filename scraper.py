#!/usr/bin/env python3
import os
import re
import json
import math
import threading
import smtplib
import subprocess
import time
import datetime as dt
from email.message import EmailMessage
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None

import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core import exceptions as g_exceptions

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def utc_tz():
    try:
        return ZoneInfo("UTC") if ZoneInfo else dt.timezone.utc
    except Exception:
        return dt.timezone.utc

def dbg(msg: str):
    print(f"[{dt.datetime.now().isoformat(timespec='seconds')}] {msg}")

def haversine(lat1, lon1, lat2, lon2) -> float:
    R = 3958.8  # miles
    f1, f2 = math.radians(lat1), math.radians(lat2)
    d_f, d_l = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(d_f / 2)**2 + math.cos(f1)*math.cos(f2)*math.sin(d_l / 2)**2
    return 2 * R * math.asin(math.sqrt(a)) * 5280  # feet

BASE        = Path(__file__).parent
MAIN_PATH   = BASE / "main.txt"
SCRAPED_TXT = BASE / "public" / "scraped.txt"
PARKED_TXT  = BASE / "parked.txt"
LOC_TXT     = BASE / "location.txt"

# load static campus‐location → coords
with LOC_TXT.open(encoding="utf-8") as f:
    txt = re.sub(r"(\bname\b|\blat\b|\blng\b)\s*:", r'"\1":', f.read().strip())
    location_data = {
        r["name"].upper(): (r["lat"], r["lng"])
        for r in json.loads("[" + txt.rstrip(",") + "]")
    }
dbg(f"Loaded {len(location_data)} location → coordinate mappings")

# tickets we've already appended to scraped.txt
if SCRAPED_TXT.exists():
    scraped = {
        ln.split(",")[0].lstrip('"').upper()
        for ln in SCRAPED_TXT.read_text("utf-8").splitlines()
    }
else:
    scraped = set()
dbg(f"Loaded {len(scraped)} tickets already in scraped.txt")

# load existing parkers from parked.txt
parkers = []
if PARKED_TXT.exists():
    for ln in PARKED_TXT.read_text("utf-8").splitlines():
        email, full, loc, ts_end, hours, lat, lng = ln.split(",", 6)
        parkers.append(dict(
            email    = email,
            full     = full,
            loc_name = loc,
            ts_end   = dt.datetime.fromisoformat(ts_end),
            hours    = float(hours),
            lat      = float(lat),
            lng      = float(lng),
        ))
dbg(f"Loaded {len(parkers)} active parker(s) from parked.txt")

dbg("Initialising Firebase…")
firebase_admin.initialize_app(credentials.Certificate("cred.json"))
db = firestore.client()
dbg("Firebase ready ✔")

GMAIL_USER = "taps.slug.tracker@gmail.com"
GMAIL_PW   = os.getenv("GMAIL_APP_PASSWORD")
if not GMAIL_PW:
    raise RuntimeError("Set env var GMAIL_APP_PASSWORD to your Gmail app password")

def get_coords(loc: str):
    key = loc.upper().strip()
    if key in location_data:
        return location_data[key]
    m = re.match(r"\s*(\d+\w*)", key)
    if m:
        prefix = m.group(1)
        for name, coords in location_data.items():
            if name.startswith(prefix):
                return coords
    return None

def send_alert(to_email: str, to_name: str, p_loc: str, t_loc: str, dist_ft: float):
    msg = EmailMessage()
    msg["From"]    = GMAIL_USER
    msg["To"]      = to_email
    msg["Subject"] = "TAPS spotted near your car!"
    msg.set_content(
        f"Hey {to_name},\n\n"
        f"TAPS was just seen issuing a citation at {t_loc}.\n"
        f"They're roughly {int(dist_ft):,} ft from your car parked at {p_loc}.\n"
        "Keep an eye out!\n\n— TAPS Tracker"
    )
    with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(GMAIL_USER, GMAIL_PW)
        smtp.send_message(msg)
    dbg(f"Alert email sent → {to_email}")

def send_account_confirmation_email(to_email: str, to_name: str):
    msg = EmailMessage()
    msg["From"] = GMAIL_USER
    msg["To"] = to_email
    msg["Subject"] = "TAPS Tracker Account Verified!"
    msg.set_content(
        f"Hey {to_name},\n\n"
        "Congratulations on setting up your TAPS Tracker account!\n"
        "We have verified your account and you're all good to go.\n\n"
        "— TAPS Tracker"
    )
    with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(GMAIL_USER, GMAIL_PW)
        smtp.send_message(msg)
    dbg(f"Account confirmation email sent → {to_email}")

def send_ticket_notification_email(to_email: str, to_name: str, citation_number: str, date_str: str, location: str):
    msg = EmailMessage()
    msg["From"] = GMAIL_USER
    msg["To"] = to_email
    msg["Subject"] = "TAPS Tracker: You just got a ticket :("
    msg.set_content(
        f"Hey {to_name},\n\n"
        f"Unfortunately, your car just got ticketed recently at {location} (Citation: {citation_number}, Date: {date_str}).\n"
        "We hate to break it to you. Keep your head up and appeal it as soon as possible!!\n\n"
        "— TAPS Tracker"
    )
    with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(GMAIL_USER, GMAIL_PW)
        smtp.send_message(msg)
    dbg(f"Ticket notification email sent → {to_email}")

dbg("Launching headless Chrome…")
opts = webdriver.ChromeOptions()
opts.add_argument("--headless")
opts.add_argument("--disable-gpu")
opts.add_argument("--disable-logging")
opts.add_argument("--log-level=3")
driver = webdriver.Chrome(options=opts)
dbg("Chrome ready ✔")

WAIT     = WebDriverWait(driver, 6)
WAIT_REL = WebDriverWait(driver, 2)
BASE_URL = "https://ucsc.aimsparking.com/tickets/"
_stop    = threading.Event()

def save_ticket(tid: str, loc: str, when: str):
    if tid.upper() in scraped:
        return
    date, clock = when.split()[:2]
    # Check if time has AM/PM indicator
    if len(when.split()) > 2:
        am_pm = when.split()[2].upper()
        # Parse hours and minutes
        hours, minutes = map(int, clock.split(':'))
        # Convert to 24-hour format if PM
        if am_pm == 'PM' and hours < 12:
            hours += 12
        # Convert to 24-hour format if AM and hour is 12
        elif am_pm == 'AM' and hours == 12:
            hours = 0
        # Format to 24-hour time string
        clock = f"{hours:02d}{minutes:02d}"
    else:
        # If no AM/PM indicator, just remove the colon
        clock = clock.replace(":", "")
    
    m, d, y = map(int, date.split("/"))
    with SCRAPED_TXT.open("a", encoding="utf-8") as f:
        f.write(f'"{tid.upper()},{loc},{clock},{m}/{d}/{y}",\n')
    scraped.add(tid.upper())
    dbg(f"Saved → scraped.txt : {tid},{loc}")
    # Check if the ticket date is today and send notification
    today = dt.datetime.now(utc_tz()).date()
    ticket_date = dt.date(y, m, d)
    if ticket_date == today:
        # Find user(s) with this license plate in current_users
        try:
            users = db.collection("current_users").where("licensePlate", "==", tid).stream()
            for user_doc in users:
                user_data = user_doc.to_dict()
                send_ticket_notification_email(
                    user_data.get("email", ""),
                    user_data.get("fullName", "User"),
                    tid,
                    f"{m}/{d}/{y}",
                    loc
                )
        except Exception as e:
            dbg(f"‼ Failed to send ticket notification email: {e}")

def _extract_ticket_meta():
    try:
        issue = driver.find_element(
            By.XPATH,
            "//p[strong[text()='Issue Date and Time:']]"
        ).text
        loc   = driver.find_element(
            By.XPATH,
            "//p[strong[text()='Location:']]"
        ).text
        return loc.replace("Location: ", ""), issue.replace("Issue Date and Time: ", "")
    except:
        return None, None

def _process_related(done: set, plate: str, tkts: list):
    try:
        WAIT_REL.until(EC.presence_of_element_located(
            (By.XPATH, "//a[contains(@aria-label,'View ticket')]")
        ))
    except:
        return
    while True:
        unseen = []
        for a in driver.find_elements(
            By.XPATH, "//a[contains(@aria-label,'View ticket')]"
        ):
            lbl = a.get_attribute("aria-label")
            if "#" in lbl:
                cid = lbl.split("#")[1].strip().upper()
                if cid not in done:
                    unseen.append((cid, a))
        if not unseen:
            break
        tid, btn = unseen[0]
        try:
            driver.execute_script("arguments[0].click();", btn)
            WAIT.until(EC.presence_of_element_located(
                (By.XPATH, "//h3[normalize-space()='Ticket Information']")
            ))
            loc, when = _extract_ticket_meta()
            if loc and when:
                save_ticket(tid, loc, when)
                tkts.append({
                    "citationNumber": tid,
                    "location": loc,
                    "issueDate": when
                })
                done.add(tid)
                coords = get_coords(loc)
                if coords:
                    t_lat, t_lng = coords
                    for p in parkers:
                        if dt.datetime.now(utc_tz()) > p["ts_end"]:
                            continue
                        dist_ft = haversine(t_lat, t_lng, p["lat"], p["lng"])
                        if dist_ft <= 10_000:
                            try:
                                send_alert(
                                    p["email"], p["full"],
                                    p["loc_name"], loc, dist_ft
                                )
                            except Exception as e:
                                dbg(f"‼ email error → {p['email']}: {e}")
        except:
            pass
        finally:
            try:
                driver.back()
                WAIT.until(EC.presence_of_element_located(
                    (By.XPATH, "//a[contains(@aria-label,'View ticket')]")
                ))
            except:
                break

def process(plate: str, citation: str):
    tid = citation.upper()
    dbg(f"==== {tid} / {plate} ====")
    tickets_data = []
    done = {tid}
    try:
        driver.get(BASE_URL)
        WAIT.until(EC.presence_of_element_located((By.ID, "plate_vin"))).send_keys(plate)
        WAIT.until(EC.presence_of_element_located((By.ID, "ticket_number"))).send_keys(citation)
        WAIT.until(EC.element_to_be_clickable((By.ID, "search_ticket"))).click()
        WAIT.until(EC.presence_of_element_located(
            (By.XPATH, "//h3[normalize-space()='Ticket Information']")
        ))
        # collect related
        page_ids = {tid}
        for a in driver.find_elements(
            By.XPATH, "//a[contains(@aria-label,'View ticket')]"
        ):
            lbl = a.get_attribute("aria-label")
            if "#" in lbl:
                page_ids.add(lbl.split("#")[1].strip().upper())
        if page_ids.issubset(scraped):
            dbg(f"All {len(page_ids)} tickets already scraped – skipping details.")
            return True, []
        loc, when = _extract_ticket_meta()
        if loc and when:
            save_ticket(tid, loc, when)
            tickets_data.append({
                "citationNumber": tid,
                "location": loc,
                "issueDate": when
            })
            coords = get_coords(loc)
            if coords:
                t_lat, t_lng = coords
                for p in parkers:
                    if dt.datetime.now(utc_tz()) > p["ts_end"]:
                        continue
                    dist_ft = haversine(t_lat, t_lng, p["lat"], p["lng"])
                    if dist_ft <= 528_000:
                        try:
                            send_alert(
                                p["email"], p["full"],
                                p["loc_name"], loc, dist_ft
                            )
                        except Exception as e:
                            dbg(f"‼ email error → {p['email']}: {e}")
        _process_related(done, plate, tickets_data)
        return True, tickets_data

    except Exception as e:
        dbg(f"‼ Error processing {tid}: {e}")
        msg = str(e)
        # If Selenium aborted by navigation or we're already scraped, treat as success
        if "aborted by navigation" in msg or tid in scraped:
            return True, []
        return False, []


def check_parked_users(col: str = "parked_users"):
    global parkers
    dbg("------ Checking parked_users collection ------")
    now_utc = dt.datetime.now(utc_tz())
    try:
        docs = list(db.collection(col).stream())
    except g_exceptions.PermissionDenied as e:
        dbg(f"‼ parked_users check skipped – permission denied: {e.message}")
        return

    existing = {(p["email"], p["loc_name"]) for p in parkers}
    active = []
    for doc in docs:
        d        = doc.to_dict() or {}
        email    = d.get("email", "").strip()
        full     = d.get("fullName", "").strip()
        loc      = d.get("location", "").strip()
        hours    = float(d.get("hours", 0) or 0)
        start_ts = d.get("start")
        if not (email and full and loc and start_ts and hours):
            continue

        start_dt = start_ts.replace(tzinfo=utc_tz())
        end_dt   = start_dt + dt.timedelta(hours=hours)
        if now_utc > end_dt:
            try:
                doc.reference.delete()
            except:
                pass
            continue

        # ── handle Current Location as a custom coord
        coords = None
        if loc.lower() == "current location":
            coord_map = d.get("coords") or {}
            lat = coord_map.get("lat")
            lng = coord_map.get("lng")
            if lat is None or lng is None:
                dbg(f"⚠ Missing coords for Current Location parker: {email}")
                continue
            coords = (lat, lng)
        else:
            coords = get_coords(loc)
            if not coords:
                dbg(f"⚠ Unknown location: {loc}")
                continue

        lat, lng = coords
        active.append(dict(
            email    = email,
            full     = full,
            loc_name = loc,
            ts_end   = end_dt,
            hours    = hours,
            lat      = lat,
            lng      = lng
        ))

    # rewrite parked.txt
    PARKED_TXT.write_text(
        "\n".join(
            f"{p['email']},{p['full']},{p['loc_name']},"
            f"{p['ts_end'].isoformat()},{p['hours']},{p['lat']},{p['lng']}"
            for p in active
        ) + ("\n" if active else ""),
        encoding="utf-8"
    )
    parkers = active
    dbg(f"Updated parked.txt → {len(parkers)} active parker(s)")
    dbg("------ parked_users check complete ------")





def precheck_new_users(col: str = "new_users"):
    dbg("------ Checking new_users for fresh submissions ------")
    try:
        docs = list(db.collection(col).stream())
    except g_exceptions.PermissionDenied as e:
        dbg(f"‼ new_users check skipped – permission denied: {e.message}")
        return

    now = dt.datetime.now(utc_tz())
    existing = set()
    if MAIN_PATH.exists():
        existing = {
            ln.strip().upper()
            for ln in MAIN_PATH.read_text("utf-8").splitlines()
            if ln.strip()
        }

    new_lines = []
    for doc in docs:
        d = doc.to_dict() or {}
        plate      = (d.get("licensePlate") or "").strip()
        citation   = (d.get("citationNumber") or "").strip().upper()
        timestamp  = d.get("timestamp")
        valid_flag = d.get("valid")

        ts = timestamp.replace(tzinfo=utc_tz()) if timestamp else now

        if valid_flag is False:
            age = (now - ts).total_seconds() / 86400
            if age > 3:
                doc.reference.delete()
                dbg(f"Removed expired invalid entry: {citation}")
            else:
                dbg(f"Ignoring recent invalid entry: {citation}")
            continue

        if not (plate and citation):
            age = (now - ts).total_seconds() / 86400
            if age > 3:
                doc.reference.delete()
                dbg(f"Removed malformed entry older than 3 days: {citation}")
            else:
                doc.reference.update({"valid": False})
                dbg(f"Marked entry invalid: {citation}")
            continue

        try:
            ok, tickets = process(plate, citation)
        except Exception as e:
            age = (now - ts).total_seconds() / 86400
            if age > 3:
                doc.reference.delete()
                dbg(f"Removed errored entry older than 3 days: {citation}")
            else:
                doc.reference.update({"valid": False})
                dbg(f"Marked entry invalid after error: {citation}")
            continue

        if ok and not tickets and citation in scraped:
            tickets = []
        elif not ok or not tickets:
            age = (now - ts).total_seconds() / 86400
            if age > 3:
                doc.reference.delete()
                dbg(f"Removed no-tickets entry older than 3 days: {citation}")
            else:
                doc.reference.update({"valid": False})
                dbg(f"Marked entry invalid (no tickets): {citation}")
            continue

        try:
            uid = (d.get("email") or plate or doc.id).upper()
            update_data = {
                "fullName":      d.get("fullName", ""),
                "email":         d.get("email", ""),
                "licensePlate":  plate,
                "lastUpdated":   firestore.SERVER_TIMESTAMP
            }
            if tickets:
                update_data["tickets"] = firestore.ArrayUnion(*tickets)
            db.collection("current_users").document(uid).set(update_data, merge=True)
            # Send confirmation email after promotion
            send_account_confirmation_email(d.get("email", ""), d.get("fullName", "User"))
        except Exception as e:
            dbg(f"‼ Firestore write failed for {citation}: {e}")
            continue

        line = f"{citation},{plate}"
        if line.upper() not in existing:
            new_lines.append(line)
            existing.add(line.upper())

        doc.reference.delete()
        dbg(f"Processed and removed new_users entry: {citation}")

    if new_lines:
        with MAIN_PATH.open("a", encoding="utf-8") as f:
            f.write("\n".join(new_lines) + "\n")
        dbg(f"Added {len(new_lines)} ticket(s) from new_users to main.txt")

    dbg("------ new_users check complete ------")




def transfer_firestore_to_main(col: str = "bruh"):
    dbg("------ Transferring bruh → main.txt ------")
    try:
        docs = list(db.collection(col).stream())
    except g_exceptions.PermissionDenied as e:
        dbg(f"‼ transfer skipped – permission denied: {e.message}")
        return
    existing = {ln.strip().upper() for ln in MAIN_PATH.read_text("utf-8").splitlines()} if MAIN_PATH.exists() else set()
    new_lines = []
    for doc in docs:
        d = doc.to_dict() or {}
        t = (d.get("citationNumber") or "").strip().upper()
        p = (d.get("licensePlate") or "").strip()
        if not (t and p):
            doc.reference.delete()
            continue
        line = f"{t},{p}"
        if line.upper() not in existing:
            new_lines.append(line)
            existing.add(line.upper())
        doc.reference.delete()
    if new_lines:
        with MAIN_PATH.open("a", encoding="utf-8") as f:
            f.write("\n".join(new_lines) + "\n")
        dbg(f"Appended {len(new_lines)} new ticket(s) to main.txt")
    dbg("------ transfer complete ------")

def _rewrite_main(rows):
    tmp = MAIN_PATH.with_suffix(".tmp")
    tmp.write_text("\n".join(rows) + ("\n" if rows else ""))
    tmp.replace(MAIN_PATH)
    dbg(f"Re-wrote main.txt → kept {len(rows)} valid rows")

def scrape_main():
    if not MAIN_PATH.exists():
        dbg("main.txt not found – nothing to scrape.")
        return
    rows = [ln.strip() for ln in MAIN_PATH.read_text("utf-8").splitlines() if ln.strip()]
    valid = []
    for ln in rows:
        citation, plate = (p.strip() for p in ln.split(",", 1))
        ok, _ = process(plate, citation)
        # keep if it succeeded OR if we've already scraped that citation
        if ok or citation in scraped:
            valid.append(ln)
        else:
            dbg(f"Removed invalid entry from main.txt: {ln}")
    _rewrite_main(valid)


def run_cycle():
    check_parked_users()
    precheck_new_users()
    transfer_firestore_to_main()
    scrape_main()
    dbg("Done – scraping cycle complete")

    # pick the right CLI on Windows vs. others
    firebase_executable = "firebase.cmd" if os.name == "nt" else "firebase"
    dbg("Starting Firebase deploy…")
    try:
        result = subprocess.run(
            [firebase_executable, "deploy", "--only", "hosting"],
            check=True,
            capture_output=True,
            text=True
        )
        dbg(f"Firebase deploy succeeded:\n{result.stdout}")
    except subprocess.CalledProcessError as e:
        dbg(f"‼ Firebase deploy failed (exit {e.returncode}):\n{e.stderr}")

if __name__ == "__main__":
    while not _stop.is_set():
        run_cycle()
        for remaining in range(5, 0, -1):
            dbg(f"Next cycle starts in {remaining} second{'s' if remaining != 1 else ''}…")
            time.sleep(1)
        dbg("Here we go again baby!")

    driver.quit()
    dbg("Chrome closed ✔")

