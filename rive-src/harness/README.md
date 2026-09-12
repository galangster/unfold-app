# Rive filmstrip harness

Deterministic frames of any Today ambience `.riv` with the app's theme colors applied through `ViewModel1`. This is how new scenes get audited against `rive-src/DESIGN-REFERENCE.md`.

1. `./setup.sh` (downloads the runtime, copies the app's `.riv` files into `riv/`).
2. `python3 server.py`, open `http://localhost:8799/film.html`.
3. In the console: `await film('today-clouds.riv','#C8A55C','#0A0A0A',[0.5,1,2,3,5,8,12,20]); await save('clouds-dark')`. Light mode: `film(file,'#9A7B3C','#FAF7F2',times)`. Strips land in `strips/`.

`film` steps the state machine at 1/60 s, so frames are exact and do not depend on the page being visible. The reference strips in `rive-src/reference/` were captured this way on 2026-09-11.
