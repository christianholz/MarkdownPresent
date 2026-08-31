# MarkdownPresent feature tour

Markdown remains the complete source of the deck

## Overview

<!-- TOC -->

## Figures affect pagination

The renderer measures the actual figures before deciding where this section wraps.

- Related list items stay together where possible
- Continued slides repeat the relevant heading context
- Tables repeat their header rows
- A single orphaned item is strongly discouraged

![Observed behavior](images/card-01.svg)
![Participant reflection](images/card-06.svg)

## Grouped table headers

| Signal | ::2_ Observation | ::2_ Reflection |
| ^ | First round | Second round | First round | Second round |
| --- | --- | --- | --- | --- |
| Orientation | 42 s | 25 s | Uncertain | Clear |
| Recovery | Assisted | Unaided | Frustrating | Expected |
| Confidence | 2.8 / 5 | 4.1 / 5 | Mixed | Strong |

## Highlighted code

~~~python
signals = ["orientation", "recovery", "confidence"]
for signal in signals:
    compare_rounds(signal)
~~~

## Math remains local

Inline math such as $E = mc^2$ and display math use the bundled renderer.

$$\int_0^1 x^2\,dx = \frac{1}{3}$$
