# Pixel sprite format

Give your GitHub Actions logs a mascot. The pixel sprite format describes small pixel-art characters as plain JSON: a grid of characters, a legend that maps each character to an xterm-256 colour, and optional colour variants. The editor exports ANSI text built for the GitHub Actions log viewer, where ordinary terminal pixel art smears into stripes.

Draw a sprite in the browser, export it, and `cat` it from any workflow step. No install, no account, no build step.

<div class="cta-row"><a class="btn primary" href="../editor.html">Open the editor</a><a class="btn" href="tutorial.md">Draw your first sprite</a></div>

## Documentation

<ul class="paths">
<li><span class="kind">Tutorial</span><div><a href="tutorial.md">Draw your first sprite</a><p>Paint a sprite in the editor and print it in a GitHub Actions log, start to finish.</p></div></li>
<li><span class="kind">How-to guides</span><div><a href="how-to.md">Get a specific job done</a><p>Print in a workflow, add colour variants, store a symmetric sprite as half, validate a file.</p></div></li>
<li><span class="kind">Reference</span><div><a href="../spec/sprite-format.md">Sprite format v1</a><p>Every field, the grid and lighting rules, rendering targets and conformance.</p></div></li>
<li><span class="kind">Explanation</span><div><a href="explanation.md">Why it works this way</a><p>Why half-blocks smear in GitHub logs, and why the format uses characters, xterm-256 and fixed lighting.</p></div></li>
</ul>