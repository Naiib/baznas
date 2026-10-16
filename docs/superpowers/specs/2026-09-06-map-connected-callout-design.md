# Connected map callout

## Goal

When an Amil selects a Kecamatan on the penyaluran map, retain the camera position and reveal a clear, elegant relationship between the selected polygon and its decision data.

## Interaction

1. Selecting a polygon does not call `fitBounds`, change zoom, or pan the map.
2. The selected polygon uses the strongest fill and emerald outline; non-selected polygons remain visible but subdued.
3. A focus callout is displayed inside a safe, unoccupied region of the map.
4. An SVG connector starts at the callout edge and ends at the projected geographic center of the selected polygon. Its endpoint has a small pulse marker.
5. On selection change, the existing callout and connector leave softly, then the new connector draws and the updated callout rises into place.
6. The persistent right-hand detail card continues to update using its existing live region and entry transition.

## Layout

- Desktop: calculate a callout quadrant from the selected polygon’s projected screen coordinates. Prefer the opposing horizontal side and leave clearance for Mapbox zoom controls and the legend.
- The callout uses a compact, fixed-width card containing Kecamatan, current metric, mustahik count, top program, and a details action.
- The connector is a thin curved SVG path with an emerald gradient. It must never intercept the right panel or Mapbox controls.
- Mobile: omit the connector and use a bottom-aligned focus card to preserve map readability.

## Accessibility and motion

- The right panel remains the screen-reader live region; the visual connector is decorative and hidden from assistive technology.
- Respect `prefers-reduced-motion`: no travelling marker or draw animation.
- Keyboard focus stays on the existing interacting element; clicking a map polygon does not steal focus.

## Data and implementation boundaries

- `RealKecamatanMap` owns map projection, selected-polygon centroid, callout placement, and Mapbox layer styling.
- `PetaSebaranWorkspace` remains the source of selected Kecamatan and detailed decision data.
- No new service, API, or geospatial dataset is needed.

## Verification

- Unit test the position decision and selected/non-selected style behavior.
- Build with `next build`.
- Visually inspect the deployed page with the production Mapbox token and confirm the camera stays fixed while selection data changes.
