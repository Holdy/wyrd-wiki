# POI and folklore filing scheme

_Last updated 2026-10-22_

## Purpose

Two datasets are filed in the same way:

1. **POIs**: points of interest, each with a name and a lat/long, used for coordinate lookups.
2. **Stories**: folklore stories filed at settlement level or higher.

POIs and stories are not related to each other. They only share the filing scheme.

## Two parallel trees

Each dataset has its own directory tree, and both trees use the same directory and file layout.

```
poi/world/...
stories/world/...
```

## Directory hierarchy

```
world/
  _world
  {country}/
    _{country}
    {sub-country}/          e.g. a county
      _{sub-country}
      {settlement}          one file per city, town or village
```

- The directories are `world`, then country, then sub-country (for example a county).
- Under the lowest directory there is **one file per settlement** (city, town or village). It holds the entries for that place.
- Every directory also has a **`_{dirname}` file**, named after that directory (for example `uk/_uk` or `gwynedd/_gwynedd`). It holds entries that belong to the whole level rather than to one settlement, such as a river or a region-wide story.

## Coordinates

| Where | POIs | Stories |
| --- | --- | --- |
| Settlement file | name + lat/long | story + lat/long (can be plotted on a map) |
| `_{dirname}` file | not yet decided | no coordinates (cannot be plotted on a map) |

## Out of scope for now

- The contents and format of the files themselves.
