#!/usr/bin/env python3
"""Rebuild yearly overlays the browser cannot fetch live.

Live path (housing-live.js) fetches Zillow county CSVs + Census Reporter ACS
at runtime. This script only refreshes files with no small CORS API:
  VA PPSF = Redfin closed-sale median PPSF (~230 MB tracker → tiny CSV)
  VA FMR  = HUD FY2026 2BR schedule JSON
  Mumbai  = BMC 24-ward GeoJSON + compiled IGR ASR midpoint ₹/sq ft
va-housing.csv remains a ZHVI/ACS fallback if the live fetch fails.
"""
from __future__ import annotations

import csv
import gzip
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "data" / "housing"
TMP = Path("/tmp/housing")
SQM_TO_SQFT = 10.764

# HUD FY2026 2-bedroom FMR ($/month) keyed by 5-digit FIPS.
# Source: HUD FY 2026 Schedule of Metropolitan & Non-Metropolitan Fair Market Rents.
HUD_FMR_2BR = {
    # Blacksburg-Christiansburg-Radford HMFA
    "51121": 1271, "51750": 1271,
    # Charlottesville MSA
    "51003": 1824, "51065": 1824, "51079": 1824, "51125": 1824, "51540": 1824,
    # Culpeper HMFA
    "51047": 1423,
    # Floyd HMFA
    "51063": 1094,
    # Franklin County HMFA (not Franklin city)
    "51067": 944,
    # Giles HMFA
    "51071": 984,
    # Harrisonburg MSA
    "51165": 1322, "51660": 1322,
    # King and Queen HMFA
    "51097": 1250,
    # Kingsport-Bristol TN-VA MSA
    "51169": 1044, "51191": 1044, "51520": 1044,
    # Lynchburg MSA
    "51009": 1187, "51011": 1187, "51019": 1187, "51031": 1187, "51680": 1187,
    # Pulaski HMFA
    "51155": 921,
    # Rappahannock HMFA
    "51157": 1375,
    # Richmond HMFA
    "51007": 1655, "51036": 1655, "51041": 1655, "51053": 1655, "51075": 1655,
    "51085": 1655, "51087": 1655, "51101": 1655, "51127": 1655, "51145": 1655,
    "51149": 1655, "51183": 1655, "51570": 1655, "51670": 1655, "51730": 1655,
    "51760": 1655,
    # Roanoke HMFA
    "51023": 1254, "51045": 1254, "51161": 1254, "51770": 1254, "51775": 1254,
    # Staunton-Stuarts Draft MSA
    "51015": 1261, "51790": 1261, "51820": 1261,
    # Surry HMFA
    "51181": 1039,
    # Virginia Beach-Norfolk-Newport News HMFA
    "51073": 1713, "51093": 1713, "51095": 1713, "51115": 1713, "51199": 1713,
    "51550": 1713, "51650": 1713, "51700": 1713, "51710": 1713, "51735": 1713,
    "51740": 1713, "51800": 1713, "51810": 1713, "51830": 1713,
    # Warren HMFA
    "51187": 1315,
    # Washington-Arlington-Alexandria HMFA
    "51013": 2246, "51043": 2246, "51059": 2246, "51061": 2246, "51107": 2246,
    "51153": 2246, "51177": 2246, "51179": 2246, "51510": 2246, "51600": 2246,
    "51610": 2246, "51630": 2246, "51683": 2246, "51685": 2246,
    # Winchester MSA
    "51069": 1573, "51840": 1573,
    # Non-metropolitan counties and cities (2BR)
    "51001": 1054, "51005": 914, "51017": 977, "51021": 914, "51025": 914,
    "51027": 914, "51029": 959, "51033": 1246, "51035": 914, "51037": 914,
    "51049": 997, "51051": 914, "51057": 1113, "51077": 914, "51081": 1001,
    "51083": 914, "51089": 914, "51091": 914, "51099": 1469, "51103": 1052,
    "51105": 914, "51109": 1247, "51111": 914, "51113": 1066, "51117": 950,
    "51119": 1291, "51131": 949, "51133": 1309, "51135": 975, "51137": 1234,
    "51139": 924, "51141": 914, "51143": 914, "51147": 1094, "51159": 1157,
    "51163": 1005, "51167": 914, "51171": 1091, "51173": 914, "51175": 1051,
    "51185": 914, "51193": 1194, "51195": 914, "51197": 914,
    "51530": 1005, "51580": 914, "51590": 914, "51595": 1001, "51620": 1051,
    "51640": 914, "51678": 1005, "51690": 914, "51720": 914,
}


def fips_of(state: str, county: str) -> str:
    return f"{int(state):02d}{int(county):03d}"


def load_zhvi() -> tuple[list[dict], str]:
    path = TMP / "zhvi_county.csv"
    with path.open() as f:
        rows = list(csv.DictReader(f))
    months = [c for c in rows[0].keys() if re.match(r"\d{4}-\d{2}-\d{2}", c)]
    latest = months[-1]
    out = []
    for row in rows:
        if row.get("State") != "VA":
            continue
        fips = fips_of(row["StateCodeFIPS"], row["MunicipalCodeFIPS"])
        val = row.get(latest) or ""
        out.append({
            "fips": fips,
            "name": row["RegionName"],
            "zhvi": float(val) if val else None,
        })
    return out, latest


def redfin_key(zhvi_name: str) -> list[str]:
    """Possible Redfin REGION values for a ZHVI county/city name."""
    base = zhvi_name
    cands = [f"{base}, VA"]
    if base.endswith(" City"):
        short = base[: -len(" City")]
        cands.append(f"{short}, VA")
        cands.append(f"{short} City County, VA")
    if " and " in base:
        cands.append(f"{base.replace(' and ', ' & ')}, VA")
    return cands


def load_redfin(zhvi_rows: list[dict]) -> tuple[dict, str]:
    wanted = {}
    for row in zhvi_rows:
        for cand in redfin_key(row["name"]):
            wanted[cand] = row["fips"]
    latest_period = ""
    by_fips: dict[str, tuple[str, float | None, float | None]] = {}
    with gzip.open(TMP / "redfin_county.tsv.gz", "rt") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            if row.get("STATE_CODE") != "VA":
                continue
            if row.get("PROPERTY_TYPE") != "All Residential":
                continue
            region = row["REGION"]
            fips = wanted.get(region)
            if not fips:
                continue
            period = row["PERIOD_END"]
            ppsf = row.get("MEDIAN_PPSF") or ""
            sale = row.get("MEDIAN_SALE_PRICE") or ""
            prev = by_fips.get(fips)
            if prev is None or period > prev[0]:
                by_fips[fips] = (
                    period,
                    float(ppsf) if ppsf else None,
                    float(sale) if sale else None,
                )
                if period > latest_period:
                    latest_period = period
    return by_fips, latest_period


def load_acs() -> tuple[dict, str]:
    path = TMP / "acs-censusreporter.json"
    data = json.loads(path.read_text())
    release = data.get("release", {}).get("name", "ACS 5-year")
    out = {}
    for geoid, tables in data.get("data", {}).items():
        fips = geoid.replace("05000US", "")
        rent = tables.get("B25064", {}).get("estimate", {}).get("B25064001")
        value = tables.get("B25077", {}).get("estimate", {}).get("B25077001")
        out[fips] = {"acs_rent": rent, "acs_value": value}
    return out, release


def write_va(zhvi_rows, zhvi_month, redfin, redfin_month, acs, acs_release):
    out_rows = []
    for row in sorted(zhvi_rows, key=lambda r: r["name"]):
        fips = row["fips"]
        rf = redfin.get(fips, (None, None, None))
        ac = acs.get(fips, {})
        out_rows.append({
            "fips": fips,
            "name": row["name"],
            "zhvi": "" if row["zhvi"] is None else round(row["zhvi"]),
            "ppsf": "" if rf[1] is None else round(rf[1], 2),
            "median_sale": "" if rf[2] is None else round(rf[2]),
            "fmr_2br": HUD_FMR_2BR.get(fips, ""),
            "acs_median_rent": "" if not ac.get("acs_rent") else int(ac["acs_rent"]),
            "acs_median_value": "" if not ac.get("acs_value") else int(ac["acs_value"]),
        })
    csv_path = OUT / "va-housing.csv"
    with csv_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        w.writerows(out_rows)

    ppsf_path = OUT / "va-ppsf.csv"
    with ppsf_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["fips", "name", "ppsf", "vintage"])
        w.writeheader()
        for row in out_rows:
            w.writerow({
                "fips": row["fips"],
                "name": row["name"],
                "ppsf": row["ppsf"],
                "vintage": redfin_month,
            })

    (OUT / "hud-fmr.json").write_text(json.dumps({
        "vintage": "FY2026",
        "unit": "usd_per_month_2br",
        "note": "HUD Fair Market Rent 2-bedroom. HUD USER xlsx is WAF-blocked; compiled from the official PDF schedule.",
        "byFips": HUD_FMR_2BR,
    }, indent=2) + "\n")

    geo = json.loads((TMP / "us-counties.geojson").read_text())
    keep = {r["fips"] for r in zhvi_rows}
    name_by = {r["fips"]: r["name"] for r in zhvi_rows}
    feats = []
    for ft in geo["features"]:
        fid = str(ft.get("id", "")).zfill(5)
        if fid not in keep:
            continue
        ft = dict(ft)
        ft["id"] = fid
        props = dict(ft.get("properties") or {})
        props["fips"] = fid
        props["name"] = name_by[fid]
        ft["properties"] = props
        feats.append(ft)
    (OUT / "va-counties.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": feats},
        separators=(",", ":"),
    ))
    missing_fmr = [r["fips"] for r in out_rows if r["fmr_2br"] == ""]
    missing_ppsf = [r["fips"] for r in out_rows if r["ppsf"] == ""]
    print(f"VA rows {len(out_rows)} geo {len(feats)} missing FMR {missing_fmr} missing PPSF {missing_ppsf}")
    return {
        "zhvi_month": zhvi_month,
        "redfin_month": redfin_month,
        "acs_release": acs_release,
        "hud_fmr": "FY2026",
        "n": len(out_rows),
    }


def asr_psf(sqm: float) -> int:
    return round(sqm / SQM_TO_SQFT)


# IGR Maharashtra ready reckoner (ASR) FY 2025-26, frozen for FY 2026-27.
# Residential ₹/sq m midpoints compiled from published zone tables
# (findcirclerate / 99acres / Magicbricks locality lists) then mapped to BMC wards.
MUMBAI_WARDS = [
    {"id": "A", "name": "A · Colaba / Fort", "places": "Colaba, Cuffe Parade, Navy Nagar", "asr_sqm": 592530},
    {"id": "B", "name": "B · Sandhurst Road", "places": "Dongri, Masjid, Sandhurst Road", "asr_sqm": 280000},
    {"id": "C", "name": "C · Marine Lines", "places": "Marine Lines, Kalbadevi, Girgaon", "asr_sqm": 515040},
    {"id": "D", "name": "D · Malabar Hill", "places": "Malabar Hill, Walkeshwar, Grant Road", "asr_sqm": 811340},
    {"id": "E", "name": "E · Byculla", "places": "Byculla, Mazgaon, Agripada", "asr_sqm": 210000},
    {"id": "F/S", "name": "F/S · Parel", "places": "Parel, Sewri, Lower Parel east", "asr_sqm": 332450},
    {"id": "F/N", "name": "F/N · Matunga", "places": "Matunga, Sion, Wadala", "asr_sqm": 210000},
    {"id": "G/S", "name": "G/S · Worli", "places": "Worli, Prabhadevi, Lower Parel west", "asr_sqm": 392270},
    {"id": "G/N", "name": "G/N · Dadar", "places": "Dadar, Mahim, Dharavi edge", "asr_sqm": 350000},
    {"id": "H/W", "name": "H/W · Bandra West", "places": "Bandra West, Khar West", "asr_sqm": 295500},
    {"id": "H/E", "name": "H/E · Bandra East", "places": "Bandra East, BKC, Santacruz East", "asr_sqm": 336810},
    {"id": "K/W", "name": "K/W · Andheri West", "places": "Andheri West, Versova, Juhu", "asr_sqm": 296690},
    {"id": "K/E", "name": "K/E · Andheri East", "places": "Andheri East, Marol, Chakala", "asr_sqm": 178800},
    {"id": "P/N", "name": "P/N · Goregaon", "places": "Goregaon East and West", "asr_sqm": 173110},
    {"id": "P/S", "name": "P/S · Malad", "places": "Malad East and West, Mindspace", "asr_sqm": 145000},
    {"id": "R/S", "name": "R/S · Kandivali", "places": "Kandivali East and West", "asr_sqm": 150000},
    {"id": "R/C", "name": "R/C · Borivali", "places": "Borivali East and West", "asr_sqm": 147250},
    {"id": "R/N", "name": "R/N · Dahisar", "places": "Dahisar East and West", "asr_sqm": 140010},
    {"id": "L", "name": "L · Kurla", "places": "Kurla, Nehru Nagar, Saki Naka edge", "asr_sqm": 125000},
    {"id": "M/E", "name": "M/E · M East", "places": "Govandi, Mankhurd, Chembur east", "asr_sqm": 144000},
    {"id": "M/W", "name": "M/W · Chembur", "places": "Chembur West, Tilak Nagar", "asr_sqm": 144000},
    {"id": "N", "name": "N · Ghatkopar", "places": "Ghatkopar, Vikhroli edge", "asr_sqm": 155000},
    {"id": "S", "name": "S · Bhandup", "places": "Bhandup, Kanjurmarg, Nahur", "asr_sqm": 125000},
    {"id": "T", "name": "T · Mulund", "places": "Mulund East and West", "asr_sqm": 142000},
]


def write_mumbai():
    rows = []
    for w in MUMBAI_WARDS:
        psf = asr_psf(w["asr_sqm"])
        rows.append({
            "id": w["id"],
            "name": w["name"],
            "places": w["places"],
            "asr_sqm": w["asr_sqm"],
            "asr_psf": psf,
        })
    with (OUT / "mumbai-wards.csv").open("w", newline="") as f:
        wri = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wri.writeheader()
        wri.writerows(rows)

    geo = json.loads((TMP / "bmc_wards.geojson").read_text())
    by_id = {r["id"]: r for r in rows}
    feats = []
    for ft in geo["features"]:
        wid = str(ft["properties"].get("name"))
        row = by_id[wid]
        ft = dict(ft)
        props = dict(ft.get("properties") or {})
        props.update(row)
        ft["properties"] = props
        ft["id"] = wid
        feats.append(ft)
    (OUT / "mumbai-wards.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": feats},
        separators=(",", ":"),
    ))

    city = {
        "rbi_hpi_all_india": 115.9,
        "rbi_hpi_quarter": "Q4:2025-26",
        "rbi_hpi_base": "2022-23",
        "rbi_hpi_note": "All-India House Price Index from RBI press release 29 May 2026. City-level Mumbai/Thane series live on DBIE; not a public JSON API.",
        "rent_2bhk_inr": 64400,
        "rent_source": "Magicbricks Mumbai Rent Index, Jul–Sep 2024, average 2 BHK. Named research exception. Not mapped to wards.",
        "asr_vintage": "FY2025-26 rates held for FY2026-27 (0% revision)",
        "n_wards": len(rows),
    }
    (OUT / "mumbai-city.json").write_text(json.dumps(city, indent=2) + "\n")
    print(f"Mumbai wards {len(rows)}")
    return city


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    zhvi_rows, zhvi_month = load_zhvi()
    redfin, redfin_month = load_redfin(zhvi_rows)
    acs, acs_release = load_acs()
    va_meta = write_va(zhvi_rows, zhvi_month, redfin, redfin_month, acs, acs_release)
    mx_meta = write_mumbai()

    sources = json.loads((OUT / "sources.json").read_text())
    sources["vintages"] = {
        "zhvi": va_meta["zhvi_month"],
        "redfin_ppsf": va_meta["redfin_month"],
        "hud_fmr": va_meta["hud_fmr"],
        "acs": va_meta["acs_release"],
        "mumbai_asr": mx_meta["asr_vintage"],
        "rbi_hpi": mx_meta["rbi_hpi_quarter"],
        "mumbai_rent": "Magicbricks JAS 2024",
    }
    (OUT / "sources.json").write_text(json.dumps(sources, indent=2) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
