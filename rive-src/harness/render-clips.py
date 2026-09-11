#!/usr/bin/env python3
"""Renders 20 s / 30 fps clips of every scene (dark + light) headless with the Rive CLI, then encodes mp4s.
Usage: render-clips.py [outdir]"""
import os, sys, subprocess, itertools
from concurrent.futures import ThreadPoolExecutor
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); RIVE=os.path.expanduser("~/.rive/bin/rive")
OUT=sys.argv[1] if len(sys.argv)>1 else os.path.join(ROOT,"harness","clips")
THEMES={"dark":("FFC8A55C","FF0A0A0A","0A0A0A"),"light":("FF9A7B3C","FFFAF7F2","FAF7F2")}
def data(accent,bg,surf): return [f"--data=artwork_color={accent}",f"--data=accentColor={accent}",f"--data=glow_color={accent}",f"--data=background_color={bg}",f"--data=mask_gradient_start=00{surf}",f"--data=mask_gradient_end=FF{surf}"]
scenes=[os.path.join(ROOT,"scenes",d) for d in sorted(os.listdir(os.path.join(ROOT,"scenes")))]+[os.path.join(ROOT,"today-clouds")]
def frame(job):
    d,name,mode,i=job; f=os.path.join(OUT,"frames",f"{name}-{mode}"); os.makedirs(f,exist_ok=True)
    subprocess.run([RIVE,d,f"--screenshot={f}/{i:05d}.png",f"--advance={i*2}",*data(*THEMES[mode]),"--quiet"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
jobs=[(d,os.path.basename(d).replace("today-",""),m,i) for d in scenes for m in THEMES for i in range(600)]
with ThreadPoolExecutor(6) as ex: list(ex.map(frame,jobs))
os.makedirs(os.path.join(OUT,"videos"),exist_ok=True)
for clip in sorted(os.listdir(os.path.join(OUT,"frames"))):
    mp4=os.path.join(OUT,"videos",clip+".mp4")
    subprocess.run(["ffmpeg","-y","-loglevel","error","-framerate","30","-pattern_type","glob","-i",os.path.join(OUT,"frames",clip,"*.png"),"-c:v","libx264","-pix_fmt","yuv420p","-crf","18","-movflags","+faststart",mp4],check=True); print(mp4)
