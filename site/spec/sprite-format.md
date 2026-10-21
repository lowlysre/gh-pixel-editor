# Sprite format (v1)

A sprite is one JSON file: a character grid, a legend that maps characters to
xterm-256 colours, and optional palette tiers. It is data only, so any client
can read it with a stock JSON parser. [`schema/sprite.schema.json`](../schema/sprite.schema.json)
is the contract; [`schema/examples/slime.json`](../schema/examples/slime.json) is a full example.

## Fields

| Field | Required | Meaning |
|---|---|---|
| `version` | yes | Always `1`. Clients reject other values. |
| `name` | yes | Lowercase kebab-case id. |
| `mirror` | no | `true`: `rows` is the left half and the right half is its mirror. |
| `rows` | yes | One character per pixel, no whitespace. `.` is transparent. A short row pads with its last character (before mirroring). |
| `legend` | yes | Character to colour. An integer is a flat colour. An array is a ramp, dark to bright, that the renderer lights. |
| `lighting` | no | `dither` (default 0.9) and `rim` (default 1.6). |
| `tiers` | no | Tier number to a partial legend. Entries listed replace the base legend; others are kept. |

Colours are xterm-256 indices (0-255). Truecolor is not representable.

## Grid rules

1. Apply `mirror`: pad each row to the widest row, append its reverse.
2. If the row count is odd, append one transparent row.
3. A character missing from the legend uses the `B` entry. A sprite without `B`
   must define every character it uses.

## Lighting

A ramp pixel at `(x, y)` in a grid of width `w` and height `h` gets a level in
`0..n-1` (`n` is the ramp length):

```
t     = 0.5 * (1 - x / w) + 0.5 * (1 - y / h)
level = t * (n - 1) + (bayer[y % 2][x % 2] - 0.5) * dither
level -= rim            if any 4-neighbour is transparent or off-grid (once)
level = clamp(round(level), 0, n - 1)
bayer = [[0.0, 0.5], [0.75, 0.25]]
```

Light comes from the top left, outer edges get a dark rim, and the 2x2 dither
turns the gradient into shading. A flat colour is drawn as-is (no lighting) at
the brightest shade level (5). Rounding is half to even (Python `round`).

## Reserved characters

| Char | Kind | Why it matters |
|---|---|---|
| `E` | eyes | Flat colour. Wins a shared cell in `solid` mode. |
| `T` | teeth | Wins over void and body in `solid` mode. |
| `M` | mouth/void | Dark region; loses to `E` and `T` in `solid` mode. |

Every other character is a plain region. `.` is always transparent.

## Rendering targets

| Target | Rule |
|---|---|
| `half` | Two pixels per text cell: `▀` with foreground (top) and background (bottom). |
| `solid` | Two pixels per cell, one colour each. Emit `▀` with foreground = background. When a cell holds two pixels, the winner is chosen by kind: `E`, `T`, `M`, plain. GitHub's log viewer smears two-colour cells, so use this there. |
| `square` | One text row per pixel row; each pixel is one or more block glyphs with foreground = background. |
| `plain` | No colour. Shade glyph by level (`░░▒▒▓█`), `@` for eyes, `v` for teeth, space for void. |
| `svg` | One `<rect>` per pixel (merge horizontal runs), `shape-rendering="crispEdges"`, colour from the xterm-256 table. |

Never draw a pixel as a bare space: log viewers drop the background of
whitespace-only text.

## Authoring for GitHub logs

- Draw eyes, teeth and mouths at least two pixels tall on even rows so they
  survive `solid` pairing.
- Keep a sprite's height even.
- Draw text as a label, not as pixels.

## Conformance

A client conforms when it validates against the schema and, for the example
sprites, reproduces the reference output of the Python renderer for each target
byte for byte. Unknown top-level fields are errors; unknown `version` is an error.
