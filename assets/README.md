# Assets

Artwork for the repository and for apps built with the library.

| Asset | Use |
| --- | --- |
| [banner-light.svg](banner-light.svg), [banner-dark.svg](banner-dark.svg) | Repository banners for light and dark themes |
| [social-preview.png](social-preview.png) ([source](social-preview.svg)) | 1280 × 640 card for the repository's social preview |
| [logo.svg](logo.svg), [logo-dark.svg](logo-dark.svg) | Horizontal logo for light and dark backgrounds |
| [mark.svg](mark.svg), [mark.png](mark.png) | Square mark: scalable, and 512 × 512 |
| [favicon.svg](favicon.svg), [favicon.ico](favicon.ico) | Browser icon: scalable, and a fallback holding 16, 32 and 48 px |
| [favicon-16.png](favicon-16.png), [favicon-32.png](favicon-32.png), [favicon-48.png](favicon-48.png) | Individual browser icon sizes |
| [apple-touch-icon.png](apple-touch-icon.png) | 180 × 180 home screen icon |
| `components-stamp-duty-*.png` | The ready-made `StampDutyCalculator` in its default, dark and restyled looks, used in the README |
| `demo-*-light.png`, `demo-*-dark.png` | Screenshots of the three calculators in the [demo app](../demo), used in the README |

The mark is a house with an equals sign. The green is `#1f5f5b`; on dark backgrounds use `#6fc3bb`.

The banners and logos set their text in the system's own fonts, so the lettering varies slightly
between platforms. The mark and icons contain no text.

To use the icons on a website, copy them into its public root and add:

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
```

The demo screenshots come from running `pnpm demo` and capturing each section in light and
dark mode. Retake them when the demo's look changes.
