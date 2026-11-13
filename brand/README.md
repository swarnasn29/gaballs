# Gaballs brand

Name: **Gaballs**. The characters (gumball-headed, outlined, sticker style) come from `source/character.jpg`, the team's
own art. Everything in `out/` is rendered from code by `render.mjs`, so it can be changed and re-rendered:

```bash
cd app && cp ../brand/render.mjs scripts/__brand.mjs && sed -i "s#const here = path.dirname(fileURLToPath(import.meta.url));#const here = '../brand';#" scripts/__brand.mjs && node scripts/__brand.mjs; rm scripts/__brand.mjs
```

## Palette (baby blue)

Main blue is the blue gumball measured from the character art (`#AFDFF5`); the other gumball colours are small accents.

| Name | Hex | Use |
| --- | --- | --- |
| Sky | `#DDF0FF` | Page background |
| Baby blue | `#AFDFF5` | Main brand colour, tiles, highlights |
| Bubble | `#7CC4F2` | Secondary highlights |
| Ocean | `#2E78C7` | Wordmark fill, illustrations |
| UI blue | `#2667AD` | Site buttons, links and blue text (passes WCAG AA on white and on Sky) |
| Ink navy | `#1B3A63` | Text, outlines, sticker edges |
| Cloud | `#FFFFFF` | Cards, sticker borders |
| Mint / Lavender / Pink / Gold | `#ADEDC8` / `#C1A7E6` / `#F9C2DF` / `#FFE58A` | Gumball accents, tier colours |

## Type

- Headlines and wordmark: **Fredoka** 700 / 600 (Google Fonts), rounded and chunky.
- Body: **Nunito** 600 / 800 (Google Fonts).
- Wordmark style: Ocean fill, navy outline, white sticker edge, navy drop below.

## Files (`out/`)

| File | Size | Use |
| --- | --- | --- |
| `wordmark.png` | 1400×420, transparent | Logo on any background |
| `wordmark-on-sky.png` | 1400×420 | Logo on the sky colour |
| `icon-512.png` | 512×512, transparent corners | App icon, avatars |
| `icon-192.png`, `apple-icon-180.png`, `favicon-32.png`, `favicon-16.png`, `favicon.ico` | small | Site icons |
| `og-1200x630.png` | 1200×630 | Link preview (X, Telegram, Discord) |
| `x-banner-1500x500.png` | 1500×500 | X header / demo post image |

The site uses them through Next.js file conventions in `app/src/app/` (`favicon.ico`, `icon.png`, `apple-icon.png`,
`opengraph-image.png`, `twitter-image.png`).

## Still to make

The four tier characters (Common, Rare, Epic, Mythic) and a painted background, in the same style as the character
art. These need an image model (e.g. the free Gemini app); `source/` is where originals go.
