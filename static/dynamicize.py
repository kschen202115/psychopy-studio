"""
Converts static color values in svg icons into dynamic values which will change with the system theme.
"""

from pathlib import Path


# iterate through icons
for file in Path(__file__).parent.glob("**/*.svg"):
    # read file
    content = file.read_text("utf-8")
    # iterate through theme colors
    for static, dynamic in [
        ("rgb(255,255,255)", "var(--base)"),
        ("rgb(242,242,242)", "var(--mantle)"),
        ("rgb(228,228,228)", "var(--crust)"),
        ("rgb(214,214,214)", "var(--overlay)"),
        ("rgb(102,102,110)", "var(--outline)"),
        ("rgb(36,36,39)", "var(--text)"),
    ]:
        # make substitution
        content = content.replace(static, dynamic)
    # save file
    file.write_text(content, "utf-8")