import time
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

from selenium import webdriver
from selenium.common.exceptions import (
    StaleElementReferenceException,
    TimeoutException,
)
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


# ───────────────────────── Firebase ──────────────────────────
cred = credentials.Certificate("cred.json")  # service-account file
firebase_admin.initialize_app(cred)
db = firestore.client()


def fetch_citations_from_firestore(collection="bruh"):
    """
    Return a list of dicts with 'plate_number' and 'ticket_number'
    pulled from the given Firestore collection.
    """
    return [
        {
            "plate_number": doc.to_dict().get("licensePlate"),
            "ticket_number": doc.to_dict().get("citationNumber"),
        }
        for doc in db.collection(collection).stream()
    ]


# ───────────────────────── Selenium setup ──────────────────────────
options = webdriver.ChromeOptions()
options.add_argument("--headless")          # comment out to watch it run
options.add_argument("--disable-gpu")
driver = webdriver.Chrome(options=options)

WAIT = WebDriverWait(driver, 12)
BASE_URL = "https://ucsc.aimsparking.com/tickets/"


# ───────────────────────── Utilities ──────────────────────────
def save_valid_ticket(ticket_number: str, location: str, issue_date_time: str):
    """Append one cleaned record to scraped.txt in the required format."""
    try:
        date_part, time_part = issue_date_time.split()[:2]            # 'MM/DD/YYYY HH:MM'
        time_clean = time_part.replace(":", "")                       # 'HHMM'
        m, d, y = map(int, date_part.split("/"))
        line = f'"{ticket_number},{location},{time_clean},{m}/{d}/{y}",\n'
        Path("scraped.txt").write_text("", encoding="utf-8") if not Path("scraped.txt").exists() else None
        with open("scraped.txt", "a", encoding="utf-8") as f:
            f.write(line)
        print("Saved ticket to scraped.txt:", line.strip())
    except Exception as exc:
        print(f"Error saving ticket {ticket_number}: {exc}")


def extract_ticket_data():
    """Return (location, issue_date_time) or (None, None) on failure."""
    try:
        issue_date_time = (
            driver.find_element(By.XPATH, "//p[strong[text()='Issue Date and Time:']]")
            .text.replace("Issue Date and Time: ", "")
        )
        location = (
            driver.find_element(By.XPATH, "//p[strong[text()='Location:']]")
            .text.replace("Location: ", "")
        )
        return location, issue_date_time
    except Exception:
        return None, None


# ───────────────────────── Scraping helpers ──────────────────────────
def _current_view_buttons():
    """Return all <a> elements whose aria-label contains 'View ticket'."""
    return driver.find_elements(By.XPATH, "//a[contains(@aria-label,'View ticket')]")


def process_additional_tickets(processed: set):
    """
    Walk every 'View ticket' link on the page until no unseen tickets remain.
    Uses *processed* set so no ticket is handled twice.
    """
    while True:
        try:
            buttons = _current_view_buttons()
            # Build a list of (ticket_number, button_element) pairs not yet handled
            unseen = []
            for btn in buttons:
                try:
                    tid = (
                        btn.get_attribute("aria-label").split("#")[1].strip().upper()
                    )
                except Exception:
                    continue
                if tid not in processed:
                    unseen.append((tid, btn))

            if not unseen:
                break  # we're done

            ticket_number, button = unseen[0]

            # click safely via JavaScript (avoids intercept errors)
            driver.execute_script("arguments[0].click();", button)

            # wait for the panel that marks a ticket view
            WAIT.until(
                EC.presence_of_element_located(
                    (By.XPATH, "//h3[normalize-space()='Ticket Information']")
                )
            )

            # scrape
            location, issue_date_time = extract_ticket_data()
            if location and issue_date_time:
                save_valid_ticket(ticket_number, location, issue_date_time)
                processed.add(ticket_number)

        except (StaleElementReferenceException, TimeoutException):
            # page rebuilt underneath us → refresh list in next loop iteration
            pass
        finally:
            # always return to the list page before the next cycle
            try:
                driver.back()
                WAIT.until(
                    EC.presence_of_element_located(
                        (By.XPATH, "//a[contains(@aria-label,'View ticket')]")
                    )
                )
            except TimeoutException:
                break  # can't get back; leave the loop


def process_ticket(plate_number: str, ticket_number: str):
    """
    Scrape the main ticket (plate+ticket) and all its related tickets.
    """
    processed = {ticket_number.upper()}  # seed with the main ticket so we skip its duplicate

    try:
        driver.get(BASE_URL)

        WAIT.until(EC.presence_of_element_located((By.ID, "plate_vin"))).send_keys(
            plate_number
        )
        WAIT.until(EC.presence_of_element_located((By.ID, "ticket_number"))).send_keys(
            ticket_number
        )
        WAIT.until(EC.element_to_be_clickable((By.ID, "search_ticket"))).click()

        WAIT.until(
            EC.presence_of_element_located(
                (By.XPATH, "//h3[normalize-space()='Ticket Information']")
            )
        )

        location, issue_date_time = extract_ticket_data()
        if location and issue_date_time:
            save_valid_ticket(ticket_number, location, issue_date_time)

        # now walk the “related” links
        process_additional_tickets(processed)

    except Exception as exc:
        print(f"Error processing ticket {ticket_number}: {exc}")


# ───────────────────────── Main ──────────────────────────
if __name__ == "__main__":
    # wipe output each run
    Path("scraped.txt").write_text("", encoding="utf-8")

    citations = fetch_citations_from_firestore()
    print(f"Loaded {len(citations)} Firestore records")

    for row in citations:
        process_ticket(row["plate_number"], row["ticket_number"])

    driver.quit()
    print("Closed WebDriver – done.")
