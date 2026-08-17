WCeph v1 File Format Specification
===================================

WCeph Version 1 File Format |    |           
---------------|------------------
Version        | 1
File Extension | `.wceph`
File Format    | ZIP
ZIP Encoding   | UTF-8

## ZIP file structure
```
root
|__ index.json
|__ images
    |__ image1.png
    |__ image2.jpg
    |__ any_name.jpg  
```

## `index.json` File


The whole of the schema is declared, and commented, in `./format.ts` — that file
is the specification, and this section says only what a reader of a `.wceph`
needs before opening one.

### What one file is

**One patient's case, and nothing wider.** Every image the chart holds with its
type, its visit label, its capture date and its photographic-series position; the
landmarks plotted on each and the steps skipped; each film's mm/px calibration and
whether it was measured on that film or copied from another; every clinical entry
of every visit, with each version it has ever held, who wrote it and any re-filing;
and the patient's own details, including the measurements their trend board is
plotted on.

It carries **no** measurements or analysis results — those are recomputed from the
tracings and the scale on the way in — nothing about any other patient on the
device, and none of the device's own settings. It no longer carries a
superimposition either: that is a view built on screen from the films and tracings
in the file, and what used to be written under `superimposition.imageIds` was not
one — it was the active rail tile's image list, so a file exported with an
intraoral photograph open stated that photograph was superimposed.

### Reading an older file

Every field added since v1 was written is optional, and an importer must treat an
absent one as "not recorded" rather than as a default:

| Field | Added for | Absent means |
|---|---|---|
| `data[id].timepoint`, `.captureDate` | the records layer | the image is unfiled/undated |
| `data[id].photoView` | the photographic series | the photograph has no series position |
| `data[id].scaleSourceId` | scale propagation | the scale was measured on that film |
| `data[id].tracing.mode` | — | **normally absent**: this app no longer tracks one |
| `visitNotes` | the written half of the record | no visit has been written up |
| `patient` | the demographics round | the file says nothing about who the case is |
| `patient.trendPlot` | this round | the case is followed on the chart's default board |
| `superimposition` | — | **normally absent**: written by older versions only |

`tracing.mode` is the one that went the other way. It used to be *mandatory*, and
the store it is read from has held no mode for years — so the validator rejected
every file the exporter could produce (`INVALID_TRACING_MODE`) and no chart could
be exported at all. It is now optional in both directions: written only where a
mode is actually stored, and accepted where an older file states one.
