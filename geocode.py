import csv, json, os, sys, time
import requests
from urllib.parse import quote_plus

API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    sys.exit("⚠️  Set GOOGLE_API_KEY in your shell first.")

IN_CSV  = "ucsclots.csv"
OUT_JSON = "ucsclots_google.json"
OUT_CSV  = "not_found.csv"

SEARCH_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"

def search_place(name, campus_hint="uc santa cruz ca"):
    """Return (lat,lng) or None."""
    query = f"{name}, {campus_hint}"
    params = {
        "input": query,
        "inputtype": "textquery",
        "fields": "geometry/location",
        "key": API_KEY,
    }
    r = requests.get(SEARCH_URL, params=params, timeout=10)
    if not r.ok:
        return None
    data = r.json()
    if data.get("candidates"):
        loc = data["candidates"][0]["geometry"]["location"]
        return float(loc["lat"]), float(loc["lng"])
    return None


def main():
    names = []
    with open(IN_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            names.append(row["name"])

    results, missing = [], []
    for i, name in enumerate(names, 1):
        loc = search_place(name)
        if loc:
            lat, lng = loc
            results.append(dict(name=name, lat=lat, lng=lng))
            print(f"{i}/{len(names)} ✔ {name}  →  {lat:.6f}, {lng:.6f}")
        else:
            print(f"{i}/{len(names)} ✖ {name} (not found)")
            missing.append(name)
        time.sleep(0.1)          # 10 req/s keeps you well inside quota

    # save outputs
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\n✅  Saved {len(results)} records to {OUT_JSON}")

    if missing:
        with open(OUT_CSV, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f); w.writerow(["name"]); w.writerows([[m] for m in missing])
        print(f"⚠️  {len(missing)} names not found → {OUT_CSV}")


if __name__ == "__main__":
    main()
