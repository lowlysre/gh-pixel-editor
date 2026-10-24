# Why it works this way

Background on the format's design choices. For the rules themselves, see the [reference](../spec/sprite-format.md).

## Why half-blocks smear in GitHub logs

Terminal pixel art usually packs two pixels into one text cell with the upper half block `▀`: the foreground colour paints the top pixel and the background colour paints the bottom one. In a terminal, the glyph fills the full line height, so the cell reads as two clean squares.

GitHub's log viewer draws the background across the full line height but the glyph in a shorter box. The background colour shows above and below the glyph, so each cell looks striped and the sprite smears.

The `solid` target avoids this. It gives each text cell one colour, emitting `▀` with foreground and background set to the same value, so it doesn't matter how tall the glyph is. The cost is vertical resolution: two pixel rows become one colour. When the two pixels differ, the format ranks them (eyes, then teeth, then mouth, then everything else), so a face's features survive.

The editor's **Compare outputs** section models this with a configurable line height and glyph ratio. GitHub's exact values haven't been measured, so the smear preview is an approximation.

## Why characters instead of colours

A sprite's grid holds characters, not colours. Each character names a region (body, eyes, mouth) and the legend assigns that region a colour or a ramp.

Naming regions makes three things possible:

- Palette tiers recolour a sprite by swapping legend entries, without touching the grid.
- Lighting shades a whole region along its ramp.
- The `solid` target ranks regions when two pixels share a cell.

It also keeps sprites readable and diffable as text.

## Why xterm-256 colours

Colours are indices into the xterm 256-colour palette, not RGB values. An index is one small number per legend entry, and the matching escape codes (`ESC[38;5;Nm`) work in GitHub's log viewer and common terminals. A fixed palette also means a sprite looks the same wherever it renders. Truecolor is not representable in v1.

## Why lighting is part of the format

Lighting could be left to each renderer. The format defines it exactly instead, down to half-to-even rounding, so the same JSON produces the same bytes in every conforming client. That makes conformance testable: a client either reproduces the reference output for the example sprites or it doesn't.