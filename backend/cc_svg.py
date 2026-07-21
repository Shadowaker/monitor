"""Normalizzazione SVG Common Core per /statistics/cc."""

import re

# Transform dei cerchi CC dentro mastery.svg (dopo il primo <g> mastery).
CC_CIRCLES_TRANSFORM = (
    0.7921379208564758,
    0.7952299118041992,
    1295.3709716796877,
    222.94834899902344,
)
CC_CIRCLES_LOCAL_VIEWBOX = (-208.3, -215.606, 910.244, 925.564)
CC_VIEWBOX_PADDING = 28


def compute_cc_only_viewbox(padding=CC_VIEWBOX_PADDING):
    a, d, e, f = CC_CIRCLES_TRANSFORM
    lx, ly, lw, lh = CC_CIRCLES_LOCAL_VIEWBOX
    x1 = a * lx + e
    y1 = d * ly + f
    x2 = a * (lx + lw) + e
    y2 = d * (ly + lh) + f
    x = min(x1, x2) - padding
    y = min(y1, y2) - padding
    w = abs(x2 - x1) + padding * 2
    h = abs(y2 - y1) + padding * 2
    return f"{x} {y} {w} {h}"


def extract_viewbox(raw_svg):
    match = re.search(r'viewBox="([^"]+)"', raw_svg)
    return match.group(1) if match else ""


def prepare_cc_svg(raw_svg, *, use_mastery_svg, mastery_fully_visible):
    if not raw_svg:
        return "", "", ""

    full_viewbox = extract_viewbox(raw_svg)
    cc_only_viewbox = compute_cc_only_viewbox() if use_mastery_svg else full_viewbox

    if not use_mastery_svg:
        active_viewbox = full_viewbox
    elif mastery_fully_visible:
        active_viewbox = full_viewbox
    else:
        active_viewbox = cc_only_viewbox

    svg = raw_svg
    svg = re.sub(r'\s+width="[^"]*"', "", svg, count=1)
    svg = re.sub(r'\s+height="[^"]*"', "", svg, count=1)

    if not re.search(r"preserveAspectRatio=", svg):
        svg = re.sub(
            r"<svg ",
            '<svg preserveAspectRatio="xMidYMid meet" ',
            svg,
            count=1,
        )

    svg = re.sub(
        r'viewBox="[^"]+"',
        f'viewBox="{active_viewbox}"',
        svg,
        count=1,
    )

    return svg, full_viewbox, cc_only_viewbox
