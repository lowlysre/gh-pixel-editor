# How-to guides

Short recipes for specific jobs. Each assumes a sprite is open in the [editor](../editor.html); the [tutorial](tutorial.md) covers getting there.

## Print a sprite in a GitHub Actions log

1. In the editor, choose **Export → ANSI for GitHub logs**.
2. Commit the `.ans` file.
3. Print it from any step after `actions/checkout`:

```yaml
- run: cat sprite.ans
```

Use the GitHub logs export, not **ANSI for terminals**: terminal output smears in the log viewer. [Why half-blocks smear](explanation.md#why-half-blocks-smear-in-github-logs) explains the difference.

## Add colour variants

A colour variant (a palette tier in the format) recolours the same sprite, for example a stronger enemy. A variant lists only the legend entries it changes; the rest come from the base colours.

1. Open **Colour variants** under the legend and select **Add variant**. The **Editing** menu switches to the new variant.
2. Pick a palette colour and click a swatch in the legend. A yellow dot on a letter marks entries this variant changes.
3. Select ↺ on an entry to drop the change and use the base colour again.

**Export → Sprite JSON** saves every variant. The other exports render the variant selected in **Editing**.

## Store a symmetric sprite as half

Open **Sprite settings** and check **Store as mirrored half**. The exported JSON sets `"mirror": true` and keeps only the left half of each row; renderers mirror it back.

The width must be even. If the canvas isn't symmetric, the **Problems** panel warns, because export discards the right half. Drawing with **Mirror** on keeps the canvas symmetric.

## Validate a sprite file

To check a file in the editor, choose **File → Open JSON…** or drop the file on the page. The editor rejects files that fail the schema and lists the reasons under **Problems**. It also checks rules the schema can't express, such as characters missing from the legend and eyes too short for GitHub output.

To check from a terminal or CI, validate against the published schema with any JSON Schema draft 2020-12 validator. With [check-jsonschema](https://github.com/python-jsonschema/check-jsonschema):

```sh
pipx run check-jsonschema --schemafile https://lowlysre.github.io/gh-pixel-editor/spec/sprite.schema.json sprite.json
```

## Tune the shading

**Sprite settings → Lighting** controls how shaded legend entries (ramps) are lit:

- **Dither** (default 0.9) sets how strongly a 2x2 checker pattern breaks up the gradient. 0 gives smooth bands.
- **Rim** (default 1.6) sets how many shades darker the outline pixels are. 0 turns the rim off.

The [lighting rules](../spec/sprite-format.md#lighting) give the exact formula.