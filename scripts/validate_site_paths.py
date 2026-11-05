"""Statische Ressourcen muessen auch unter /alle-wege/ lokal aufloesbar sein."""
import re
from pathlib import Path
from urllib.parse import urlsplit

wurzel = Path(__file__).resolve().parents[1] / "dist"
muster = re.compile(
    r'''(?:\b(?:src|href)\s*=\s*|\bfrom\s+|\b(?:fetch|Worker)\(\s*)["']([^"']+)["']|url\(["']?([^\s)'"<>]+)'''
)
geprueft = 0
versionen = {}  # Ziel -> {Version: [Datei]}; ein Ziel braucht ueberall dieselbe ?v=
for datei in wurzel.iterdir():
    if datei.suffix not in {".html", ".js", ".css"}:
        continue
    for treffer in muster.finditer(datei.read_text()):
        link = next(x for x in treffer.groups() if x)
        teile = urlsplit(link)
        if teile.scheme or link.startswith("#"):
            continue
        assert not link.startswith("/"), (datei.name, "Absoluter Pfad", link)
        ziel = (datei.parent / teile.path).resolve()
        assert ziel.is_relative_to(wurzel), (datei.name, "Ausserhalb dist", link)
        assert ziel.exists(), (datei.name, "Fehlende Ressource", link)
        if teile.query.startswith("v="):
            versionen.setdefault(ziel.name, {}).setdefault(teile.query, []).append(datei.name)
        geprueft += 1
for ziel, v in versionen.items():
    assert len(v) == 1, (ziel, "Uneinheitliche Cache-Version", v)
print(f"{geprueft} lokale Referenzen funktionieren im Unterordner.")
