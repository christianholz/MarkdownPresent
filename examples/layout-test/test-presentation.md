# Meeting Present

A compact test deck for every automatic layout.

Christian Holz · Local renderer test

## Heading with text

This slide has a level-two heading and ordinary Markdown content. It should use the standard full-width text layout.

- A short first point
- A second point with **bold text** and *emphasis*
  - A nested point that should retain its indentation
- Inline math remains part of the text flow: $E = mc^2$

---

This slide deliberately has no heading. Its text area should expand to the full slide, minus the normal margins.

The renderer should preserve paragraphs, **formatting**, and lists without reserving an empty heading region:

1. Full-width content
2. Natural vertical positioning
3. Automatic fitting when needed

## Heading, text, and one image

The heading spans the complete slide. This copy belongs in the left column, while the image occupies a generous right column.

![Single wide layout card](images/card-01.svg)

---

This slide also has one image, but no heading. The content and image columns should use the full available slide height.

The image remains contained rather than cropped.

![Image without a slide heading](images/card-02.svg)

## Heading with many images

All images should appear in one right-hand column, retain equal column width, and shrink vertically so that every image stays inside the slide. The text column should become wider as the image column becomes narrower.

![Layout card one](images/card-01.svg)
![Layout card two](images/card-02.svg)
![Layout card three](images/card-03.svg)
![Layout card four](images/card-04.svg)
![Layout card five](images/card-05.svg)
![Layout card six](images/card-06.svg)
![Layout card seven](images/card-07.svg)
![Layout card eight](images/card-08.svg)

## Dense text with many images

This final slide intentionally combines far too much prose with a crowded image column. It exercises the PowerPoint-style fitting behavior under pressure. The renderer should progressively reduce the type size until the content fits, while maintaining readable line spacing and keeping all eight images within the slide boundary.

The slide includes multiple content structures because real meeting material rarely consists of one tidy paragraph. A dense slide might combine context, findings, caveats, and follow-up actions in one place. The fitting algorithm must measure the complete rendered result rather than estimating length from a character count.

- **Context:** the presentation is rendered entirely in the browser.
- **Layout:** the image column becomes narrower as the image count increases.
- **Typography:** text begins at the standard size and shrinks only when necessary.
  - Nested bullets remain visibly subordinate.
  - Their indentation must survive font fitting.
- **Constraint:** neither text nor images should extend beyond the slide.

| Check | Expected result |
| --- | --- |
| Heading | Full width above both columns |
| Copy | Fits inside the left column |
| Images | Eight visible, equally wide slots |
| Overflow | No clipped content |

> This quotation adds one more block-level element to the height calculation.

The final sentence is deliberately present to make the fit tight and expose any off-by-one overflow behavior near the bottom edge.

![Dense card one](images/card-01.svg)
![Dense card two](images/card-02.svg)
![Dense card three](images/card-03.svg)
![Dense card four](images/card-04.svg)
![Dense card five](images/card-05.svg)
![Dense card six](images/card-06.svg)
![Dense card seven](images/card-07.svg)
![Dense card eight](images/card-08.svg)
