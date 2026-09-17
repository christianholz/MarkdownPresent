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

## Draw.io diagrams

In draw.io, choose **File → Embed → Notion**, then paste the generated URL on its own line in the Markdown file.

https://viewer.diagrams.net/?border=0&tags=%7B%7D&lightbox=1&highlight=0000ff&edit=_blank&layers=1&nav=1&title=MarkdownPresent%20example.drawio&dark=auto#R%3Cmxfile%3E%3Cdiagram%20name%3D%22Page-1%22%20id%3D%22w3MqD6hxhlkN2j2nXwhw%22%3E1VdLb6MwEP41HJF4NCQ9dtPHHrZSpRz27MIErDUMMiaE%2FfVrwIB5VE0pjbanwOd5zzeDY7j7%2BPzESRo9YwDMcKzgbLj3huPYG9uVPxVSNsi2BUJOAyXUAwf6FxRoKTSnAWQDQYHIBE2HoI9JAr4YYIRzLIZiR2RDrykJYQIcfMKm6G8aiKhBd862x38CDaPWs%2B3dNicxaYVVJllEAiw0yH0w3D1HFM1TfN4Dq4rX1qXRe3zjtAuMQyIuUYAgBDPPgJsJClnSWr0C37SnoAxz7iupWv%2FISQyqF4SHoMQ7s8r%2FE2AMgpdSjAMjgp6GrohqTdjJ9dHLB5XAfDLjOObCFmXbRI55EkClahnujyKiAg4pqXMqJG0lFolYurq35WOjfSIsV9oKAC7grHmYZhnpRPBU2wuNNQpqrbTMUKNxY61Tl0sqIsmYVo95zO58gVzmXSVIJfF%2FkVdgL5hRQTGRIq8oBMaawB2jYXUgcFQ5zAWjCey7UbTmyllivqiiMwV1RwW92QwKertCQeupqZltkjRdNjTavOnzouxdYVq0AC4dFHvBoMSBfNd8fbDBu3cnphuRcnj86QbLVpgph0yWhtS0X9TnjiB6l8dmr9DuLo4Vt%2BIRE3FQurPNfyb8j%2Fy%2BJS9NvsuWpjOlQLdIlRnXG3LAW4sDeqPME4Wi3aQfpcGUSDofGsv9t%2BsKfJgG9JVbYOpt9T2w8dbfA%2BO%2BfM87hbdb%2F06hz8J%2Fe6sgeUAh8WFRYd%2B%2FWmytT18t5Gt%2F2a%2FPtL9M7sM%2F%3C%2Fdiagram%3E%3C%2Fmxfile%3E
