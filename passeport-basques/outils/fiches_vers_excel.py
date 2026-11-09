#!/usr/bin/env python3
"""Réunit les fiches des visiteurs dans un classeur Excel.

Usage :
    python3 outils/fiches_vers_excel.py sauvegarde1.json sauvegarde2.json -o fiches.xlsx

Chaque fichier JSON est une « Sauvegarde complète » exportée depuis le mode
administrateur de l'application. Un même numéro de passeport n'apparaît qu'une
fois : si plusieurs fichiers le contiennent, la version qui a le plus d'étampes
est gardée.

Le classeur contient trois feuilles :
    Fiches      une ligne par visiteur
    Infolettre  seulement les visiteurs qui ont dit oui, avec leur courriel
    Attraits    nombre de visiteurs ayant étampé chaque attrait
"""
import argparse
import json
import sys
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ENTETES_FICHES = [
    ("Numéro de passeport", 20),
    ("Nom de famille", 22),
    ("Prénoms", 22),
    ("Sexe", 8),
    ("Lieu de résidence", 24),
    ("Date d'émission", 16),
    ("Courriel", 30),
    ("Infolettre", 12),
    ("Nombre d'étampes", 14),
    ("Attraits étampés", 48),
    ("Pistoles", 12),
    ("Avantages réclamés", 40),
]


def charger(chemin):
    with open(chemin, encoding="utf-8") as f:
        return json.load(f)


def pistoles(donnees):
    j = donnees["joueur"]
    ppe = donnees.get("settings", {}).get("pistolesParEtampe", 10)
    etampes = [k for k in j.get("etampes", {}) if any(a["id"] == k for a in donnees.get("attraits", []))]
    ajust = sum(a.get("montant", 0) for a in j.get("ajustements", []))
    return max(0, len(etampes) * ppe + ajust)


def fiche(donnees):
    j = donnees["joueur"]
    attraits = {a["id"]: a for a in donnees.get("attraits", [])}
    recos = {r["id"]: r for r in donnees.get("recompenses", [])}
    etampes = [k for k in j.get("etampes", {}) if k in attraits]
    noms = sorted(attraits[k]["nom"] for k in etampes)
    reclames = sorted(recos[k]["titre"] for k in j.get("reclamees", {}) if k in recos)
    infolettre = {"oui": "Oui", "non": "Non"}.get(j.get("infolettre", ""), "")
    return {
        "numero": j.get("numero", ""),
        "nom": j.get("nom", ""),
        "prenoms": j.get("prenoms", ""),
        "sexe": j.get("sexe", ""),
        "residence": j.get("residence", ""),
        "emission": j.get("emission", ""),
        "courriel": j.get("courriel", ""),
        "infolettre": infolettre,
        "nb_etampes": len(etampes),
        "attraits": etampes and ", ".join(noms) or "",
        "etampes_ids": etampes,
        "pistoles": pistoles(donnees),
        "reclames": ", ".join(reclames),
        "attraits_def": attraits,
    }


def fusionner(fichiers):
    par_numero = {}
    for chemin in fichiers:
        donnees = charger(chemin)
        f = fiche(donnees)
        if not f["numero"]:
            continue
        actuelle = par_numero.get(f["numero"])
        if actuelle is None or f["nb_etampes"] > actuelle["nb_etampes"]:
            par_numero[f["numero"]] = f
    return sorted(par_numero.values(), key=lambda f: (f["nom"].lower(), f["prenoms"].lower()))


def entete(feuille, titres):
    for i, (titre, largeur) in enumerate(titres, start=1):
        cellule = feuille.cell(row=1, column=i, value=titre)
        cellule.font = Font(bold=True, color="FFFFFF")
        cellule.fill = PatternFill("solid", fgColor="14213D")
        cellule.alignment = Alignment(vertical="center", wrap_text=True)
        feuille.column_dimensions[get_column_letter(i)].width = largeur
    feuille.freeze_panes = "A2"
    feuille.auto_filter.ref = f"A1:{get_column_letter(len(titres))}1"


def ecrire(fiches, sortie, attraits_ref):
    wb = Workbook()

    ws = wb.active
    ws.title = "Fiches"
    entete(ws, ENTETES_FICHES)
    for ligne, f in enumerate(fiches, start=2):
        valeurs = [
            f["numero"], f["nom"], f["prenoms"], f["sexe"], f["residence"], f["emission"],
            f["courriel"], f["infolettre"], f["nb_etampes"], f["attraits"], f["pistoles"], f["reclames"],
        ]
        for col, v in enumerate(valeurs, start=1):
            ws.cell(row=ligne, column=col, value=v)

    wi = wb.create_sheet("Infolettre")
    entete(wi, [("Nom de famille", 22), ("Prénoms", 22), ("Courriel", 32), ("Numéro de passeport", 20)])
    ligne = 2
    for f in fiches:
        if f["infolettre"] == "Oui" and f["courriel"]:
            for col, v in enumerate([f["nom"], f["prenoms"], f["courriel"], f["numero"]], start=1):
                wi.cell(row=ligne, column=col, value=v)
            ligne += 1

    wa = wb.create_sheet("Attraits")
    entete(wa, [("Attrait", 48), ("Visiteurs ayant étampé", 22)])
    for ligne, (nom, compte) in enumerate(attraits_ref, start=2):
        wa.cell(row=ligne, column=1, value=nom)
        wa.cell(row=ligne, column=2, value=compte)

    wb.save(sortie)


def compter_attraits(fiches_brutes, fiches):
    compte = {}
    for f in fiches:
        for nom in (f["attraits"].split(", ") if f["attraits"] else []):
            compte[nom] = compte.get(nom, 0) + 1
    return sorted(compte.items(), key=lambda x: (-x[1], x[0]))


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("sauvegardes", nargs="+", help="fichiers JSON exportés depuis l'application")
    p.add_argument("-o", "--sortie", default=f"fiches-passeport-{datetime.now():%Y-%m-%d}.xlsx")
    args = p.parse_args(argv)

    fiches = fusionner(args.sauvegardes)
    attraits_ref = compter_attraits(None, fiches)
    ecrire(fiches, args.sortie, attraits_ref)
    oui = sum(1 for f in fiches if f["infolettre"] == "Oui" and f["courriel"])
    print(f"{len(fiches)} fiche(s), {oui} inscrite(s) à l'infolettre -> {args.sortie}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
