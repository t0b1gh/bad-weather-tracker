# Day Quality Tracker

## Project Overview

A single-page React app that classifies each of the last 365 days as "good" or "bad" for a given location based on user-adjustable weather thresholds. The goal is to provide a simple, visceral view of how the recent year went in terms of quality-of-life weather — particularly useful for understanding seasonal depression (SAD) patterns.

## Core Concept

- Fetch 365 days of actual (not averaged) historical weather data per city from the **Open-Meteo API** (free, no API key needed)
- All data is fetched once per city, then held in memory — slider interactions reclassify entirely client-side with zero additional API calls
- Multiple cities can be compared side by side

## Data Source

**Open-Meteo Historical Weather API**
- Docs: https://open-meteo.com/en/docs/historical-weather-api
- Archive endpoint: `https://archive-api.open-meteo.com/v1/archive`
- Also works via forecast endpoint with past dates: `https://api.open-meteo.com/v1/forecast`
- Daily variables needed: `sunshine_duration`, `daylight_duration`, `temperature_2m_max`, `precipitation_hours`
- Geocoding for city search: `https://geocoding-api.open-meteo.com/v1/search?name=...&count=6&language=en`
- No API key required. Free for non-commercial use.
- Note: archive data can lag ~2 days behind the current date.

## Existing Code

`day-quality.jsx` contains a working React implementation. It was built for the Claude.ai artifact sandbox (single-file React component with no build step). It works functionally but hits network errors in the sandbox — likely because the sandbox blocks external API calls. With Claude Code you can run this in a proper environment (e.g., Vite + React) where fetch calls work normally.

## Classification Logic

A day is "good" if ALL of these are met (thresholds set by the user via sliders):
- Sunshine hours ≥ slider value (derived from `sunshine_duration` which is in seconds, divide by 3600)
- Daylight hours ≥ slider value (derived from `daylight_duration` in seconds)
- Daily high temperature ≥ slider value (`temperature_2m_max` in °C)
- Precipitation hours ≤ slider value (`precipitation_hours`)

If any threshold is not met, the day is "bad". If data is missing, the day is neutral/grey.

## UI Structure

1. **Header** — title + brief explanation
2. **Sliders panel** — four sliders (min sunshine, min daylight, min temp, max rain hours) + preset buttons ("SAD-sensitive", "Outdoor lover", "Mild comfort")
3. **City search bar** — type to search via Open-Meteo geocoding, click to add
4. **Per-city cards**, each containing:
   - City name + overall % good days
   - **Dot strip** — one narrow rectangle per day, 365 in a row. Filled green = good, hollow red outline = bad. Month labels below. Hover shows tooltip with that day's exact values.
   - **Stat pills** — good days count, bad days count, longest bad streak, longest good streak
   - **Monthly bar chart** — % good days per month, color-coded (green > 60%, yellow 30-60%, red < 30%)
5. **Legend + data attribution footer**

## Design Direction

- Dark theme (deep navy/slate background)
- Compact, data-dense layout
- DM Sans + JetBrains Mono fonts
- Green (#22c55e) for good, red (#ef4444) for bad
- The dot strip is the hero element — it should make seasonal patterns instantly visible

## Key Behaviors

- Vienna is pre-loaded on startup
- Sliders update classification in real-time (no re-fetch)
- Cities can be removed (× button, hidden when only one city remains)
- Tooltip on hover over any dot shows date, sunshine, daylight, temp, rain, and good/bad status
- "Longest bad streak" counter is important for SAD context — it's the unbroken grey stretches that matter most

## Possible Improvements (optional, if time allows)

- Allow choosing the date range (e.g., last 2 years, specific year)
- Export/share functionality
- A "today" marker on the strip
- Responsive mobile layout (the strip could scroll horizontally)
- Dark/light theme toggle
