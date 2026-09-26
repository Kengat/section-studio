# Section Studio · Montjuïc

**Live:** https://kengat.github.io/section-studio/

An interactive drawing tool for one architectural section: section A-A′ of the retaining wall of the
Montjuïc cemetery (Carrer de la Mare de Déu de Port, Barcelona), made for the *As Found* sheet of the
**Cooling Parasites** brief (MBArch · The Contemporary Project · ETSAB).

The section is drawn stroke by stroke in a WebGL shader from a survey model: every brick, block and
rubble stone is its own unit. The temperature of every surface is computed live for the chosen time:

- **Weather:** real ERA5 hourly data for 2026 (Open-Meteo): air, sky, direct and diffuse sun, wind.
- **Sun:** direct sun and sky view, ray-traced on the model in Blender for every half hour of
  22 Sep 2026 (survey day) and 8 Jul 2026 (the hottest day of the summer, 38 °C).
- **Mass:** 1D transient heat conduction into each material (sandstone rubble, brick, granite setts,
  paving, soil), driven by the weather. Inside the cut you see the heat stored in the wall.
- **Person:** the figure on the footpath is a thermometer. Its colour and number are the mean radiant
  temperature, computed in the 2D section from the surfaces it sees and the sun.

Temperatures are modelled, not measured. Treat them as indicative (±3 °C): albedo and conductivity are
typical values from the literature.

## Use
- **Presets:** 34 visual languages. Click a thumbnail, then adjust anything in *Parameters*.
- **Time bar:** drag through a day and night, or press ▶ (Space).
- **Wheel** zooms, **drag** pans, **F** fits the sheet (A1 landscape, 1:30).
- **My variants:** save your settings as a preset in your browser, or exchange them as JSON.
- **Export:** A1 PNG at 150 or 300 dpi (rendered in tiles), or a WebM video of one day.

Needs a desktop browser with WebGL2 (Chrome, Edge, Firefox). The first load is about 45 MB.

## Run locally
```
python -m http.server 8000
```
Then open http://localhost:8000.
