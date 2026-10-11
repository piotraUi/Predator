# Składa paczkę ZIP do renderowania trailera na własnym komputerze: python3 make-pack.py
import os, shutil, zipfile
here = os.path.dirname(os.path.abspath(__file__))
pack = os.path.join(here, "pack", "predator-trailer")
shutil.rmtree(os.path.join(here, "pack"), ignore_errors=True)
os.makedirs(pack)
for f in ["predator.js", "trailer.html", "music.mjs", "render.mjs", "package.json", "zrob-trailer.bat", "zrob-trailer.sh", "CZYTAJ-MNIE.txt"]:
    shutil.copy(os.path.join(here, f), pack)
shutil.copytree(os.path.join(here, "assets"), os.path.join(pack, "assets"))
out = os.path.join(here, "..", "predator-trailer-pack.zip")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(pack):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.join("predator-trailer", os.path.relpath(full, pack)))
print(out, os.path.getsize(out) // 1024, "KB")
