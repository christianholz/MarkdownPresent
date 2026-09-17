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

In draw.io, choose **File → Embed → IFrame**, then paste the generated iframe into the Markdown file.

<iframe frameborder="0" style="width:100%;height:186px;" src="https://viewer.diagrams.net/?tags=%7B%7D&lightbox=1&highlight=0000ff&edit=_blank&layers=1&nav=1&title=MarkdownPresent%20example.drawio&dark=auto#R%3Cmxfile%3E%3Cdiagram%20name%3D%22Page-1%22%20id%3D%22w3MqD6hxhlkN2j2nXwhw%22%3E7VnbcpswEP0aP6bD3fZjbCdpO8nUM5lO26eOAhtQIhAjRGz69ZWMuMjG1%2FjSdvoUdNAKOHv2aK307HE8v2MojR5oAKRnGcG8Z096lmW6pi3%2BSKQokX4FhAwHalIDPOJfoEBDoTkOINMmckoJx6kO%2BjRJwOcahhijM33aMyX6U1MUwgrw6COyin7DAY9KdGD1G%2Fwj4DCqnmx6w%2FJOjKrJ6kuyCAV01oLsm549ZpTy8iqej4FI8ipeyrjbNXfrF2OQ8F0CwPkZvxSzz1%2Fu7kdf2TgcXc2cK69cBYIVFpplFZTRnPmwYS1XzeNFRZ5c9lENKeMRDWmCyE2DjhjNkwDkGxpi1My5pzQVoCnAF%2BC8UMJAOacCinhM1F3xlqz4ruIXgx9y8MGthpN5%2B%2BakqEZzzBdhH4aeqcZlpGd5atyEykE7cgoMx8CBKUwJE7EQ%2BAaGnDrtol6AihVYIeIYEMTxm54BpIQb1vPq0CnFIjeWoYqsrhVVYqZj6EuUmVNRjULERes1Gmihmz005K6XTCMFPdGzCHN4TNFCTzPhHHpSy%2Bg3RHIVrQBgHOatJ6xSGbVr0VM8zFqFq6BqFUunbpm5NvkabftytKGsGo6EQ6TyMo%2FJtc%2BpENdIfjIWbnSPnoBMaYY5pomY8kQ5p3FrwjXBobzB6RKXNOcEJzCu%2FdHoIrig%2BUEcd1BsL1HsuBrFw1NRPDiilTkXsTJlSboduZvN6ED729Gw%2Bu80rHcl1NnPV8wDfCUOxDihXHQYh6h%2FsNVgakepvNk4mcMYR9R%2F%2F7%2F%2BFzwML6n%2F%2Fvr8HWtffUDsVTSlyZRBBqo72HubtVaroN561TK2p5fB4FRVMDy9Z6QlV2ixE5%2FGNVzvbK6xU2PyZzZv3uBczZu9C0kX7N78iOGMY3SYHrf3cH3jTD2c6e3CtFhI%2FPyH7VJcpORTkuEAFIKytOTxGc%2FloLvU6hExYRTgN3EZ8sWcEnpi8uuWQAFpUw9IQIeBWnoCHPtcUt%2FJQMXHcZ3prkRknNFXIV0ia2GS0ERm7BkTsgQhJX5fPBFYR1XEOAg6WoyV1MUAHCehAAOc%2BXmWHerQXTuaubSjDfSSMPsnykhF%2F1H6uqq%2BLtPYVd3bXo1dfchTRhmeve1kR46WD2ggCa7laWCjOoHcYpmKffpBt1s75%2BkHq530H1DCMVr8yyrBXGMjZ5KCfUQpDP92JXjW1tPeLiVcONNi2Bz%2Bl2exzb9Q7Jvf%3C%2Fdiagram%3E%3C%2Fmxfile%3E"></iframe>
