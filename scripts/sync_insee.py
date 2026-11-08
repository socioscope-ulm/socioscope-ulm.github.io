#!/usr/bin/env python3
"""Synchronise uniquement les nouvelles années d'inflation annuelle INSEE.

Série officielle IDBANK 011814640 : variation de l'IPC en moyenne annuelle,
ensemble des ménages, France, ensemble. Aucune valeur historique n'est écrasée.
Sans donnée annuelle nouvelle, le JSON public n'est pas modifié.
"""
from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path
from urllib.request import Request, urlopen
from xml.etree import ElementTree

SERIES_ID = "011814640"
SERIES_PAGE = "https://www.insee.fr/fr/statistiques/serie/011814640"
XML_URL = "https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/" + SERIES_ID + "?startPeriod=2024"
DATA_PATH = Path(__file__).resolve().parents[1] / "public" / "insee-annual-inflation.json"


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def extract_observations(payload: bytes) -> dict[int, float]:
    root = ElementTree.fromstring(payload)
    result: dict[int, float] = {}
    for node in root.iter():
        if local_name(node.tag) != "Obs":
            continue
        period = node.attrib.get("TIME_PERIOD") or node.attrib.get("time")
        raw = node.attrib.get("OBS_VALUE")
        for child in node:
            if local_name(child.tag) in ("ObsDimension", "Time"):
                period = child.attrib.get("value", period)
            elif local_name(child.tag) == "ObsValue":
                raw = child.attrib.get("value", raw)
        if not period or not period.isdigit() or len(period) != 4 or not raw:
            continue
        year = int(period)
        try:
            value = float(raw.replace(",", "."))
        except ValueError:
            continue
        if not math.isfinite(value) or not (-20 <= value <= 35):
            raise ValueError(f"Taux annuel INSEE suspect : {year} = {raw}")
        result[year] = value

    # Point de contrôle publié dans la série INSEE base 2025.
    if 2025 not in result or abs(result[2025] - 0.9) > 0.15:
        raise ValueError("Série INSEE non reconnue : taux 2025 attendu voisin de 0,9 %")
    return result


def merge_snapshot(existing: dict, published: dict[int, float], current_year: int) -> tuple[dict, list[int]]:
    if existing.get("idbank") != SERIES_ID:
        raise ValueError("Identifiant INSEE du fichier local incorrect")
    previous = existing.get("values", [])
    if not isinstance(previous, list):
        raise ValueError("Format du fichier local incorrect")
    years = set()
    for item in previous:
        year = item.get("year")
        value = item.get("value")
        if not isinstance(year, int) or not isinstance(value, (float, int)) or year in years:
            raise ValueError("Années ou valeurs locales invalides")
        years.add(year)
    last = max(years) if years else 2024
    additions: list[int] = []
    new_values = list(previous)
    for year in sorted(published):
        if last < year < current_year:
            new_values.append({"year": year, "value": published[year]})
            additions.append(year)
    if not additions:
        return existing, []
    updated = dict(existing)
    updated["values"] = sorted(new_values, key=lambda item: item["year"])
    updated["lastImportedAt"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    return updated, additions


def run() -> None:
    if not DATA_PATH.exists():
        raise FileNotFoundError("Fichier de référence INSEE absent : " + str(DATA_PATH))
    original = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    req = Request(
        XML_URL,
        headers={"Accept": "application/xml", "User-Agent": "Socioscope-ULM-INSEE-Annual/1.0"},
    )
    with urlopen(req, timeout=35) as response:
        if response.status != 200:
            raise RuntimeError(f"Réponse INSEE inattendue : HTTP {response.status}")
        content = response.read(3_000_000)
    published = extract_observations(content)
    updated, additions = merge_snapshot(original, published, dt.datetime.now(dt.timezone.utc).year)
    if not additions:
        print("INSEE : aucune nouvelle année complète publiée, historique inchangé.")
        return
    DATA_PATH.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("INSEE : années ajoutées sans remplacer l'historique :", ", ".join(map(str, additions)))


if __name__ == "__main__":
    run()
