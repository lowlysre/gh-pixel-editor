# Draw your first sprite

This tutorial paints a small sprite in the editor and prints it in a GitHub Actions log. It takes about ten minutes. You need a GitHub repository where you can add a workflow.

## 1. Start a blank sprite

1. Open the [editor](../editor.html).
2. Open **Sprite settings** at the bottom right and set **W** and **H** to 16.
3. Choose **File → New blank sprite**.
4. Replace the name at the top with `blob`. Names are lowercase letters, digits and hyphens.

## 2. Paint the body

1. Click `B` in the legend. `B` is the body: a ramp of six teal shades, dark to bright.
2. Select **Mirror** (or press `M`). Each stroke is copied to the other side of the blue centre line.
3. With **Pencil** (`P`), paint a rounded outline.
4. Switch to **Fill** (`F`) and click inside the outline.

The canvas shows the shaded result. Lighting picks a shade from the ramp for each pixel: brighter towards the top left, darker along the edges.

## 3. Add eyes

Select **Pencil** (`P`), then click `E` in the legend and paint two eyes. Make each eye two pixels tall, starting on an even row. The brighter horizontal grid lines mark where each pair of rows starts; hovering the canvas shows the row number.

Two pixel rows share one line of text in a log. An eye one pixel tall can lose that line to the body, and the **Problems** panel warns when this can happen.

## 4. Check the result

The **In a GitHub log** preview under the canvas shows the sprite as it prints in a log. The **Problems** panel lists anything to fix before exporting.

## 5. Export

1. Choose **Export → Sprite JSON** to save `blob.json`. This is the sprite itself; keep it with your code.
2. Choose **Export → ANSI for GitHub logs** to save `blob.ans`, the rendered text.

## 6. Print it in a workflow

Commit `blob.ans` to your repository and add this workflow as `.github/workflows/sprite.yml`:

```yaml
name: sprite
on: push
jobs:
  show:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: cat blob.ans
```

Push, open the workflow run, and expand the `cat blob.ans` step. The sprite prints in the log.

## Next steps

- [Add colour variants](how-to.md#add-colour-variants) to recolour the same sprite.
- Read the [format reference](../spec/sprite-format.md) for every field.