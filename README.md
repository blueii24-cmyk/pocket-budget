# Pocket Budget

A pixel-art pocket-money budgeting app for planning monthly money, tracking expenses, and checking whether cart items are affordable.

## Live website

**[Open Pocket Budget](https://blueii24-cmyk.github.io/pocket-budget/)**

## Features

- Set monthly pocket money, bus fare, savings, and category budgets.
- Track expenses and see the remaining safe-to-spend amount.
- Add shopping items to a cart and check affordability in order.
- Move cart items into expenses when they are bought.
- Navigate between months; data is stored locally in the browser.
- Retro pixel-art interface with sound effects and animated helper bots.
- Responsive layout for desktop and mobile browsers.
- Reduced-motion support for accessibility.

## How to use

1. Open the [deployed website](https://blueii24-cmyk.github.io/pocket-budget/).
2. Press **Start**.
3. Open **Setup**, enter your monthly plan, and select **Save**.
4. Use **Dashboard** to log expenses and monitor your safe-to-spend balance.
5. Use **Cart** to test planned purchases before buying them.

No account or server is required. Your budget data stays in your browser's local storage.

## Project structure

```text
index.html                 App markup
style.css                  Main retro UI styles
app.js                     Budget calculations, storage, and interactions
bot_animation/
  bot-engine.js            Animated helper bot engine
  bot-animations.css       Bot animation and responsive styles
```

## Run locally

Because this is a static website, it can be opened directly through `index.html` or served with any local static file server. For example:

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Deployment

The `main` branch is deployed automatically through GitHub Pages:

<https://blueii24-cmyk.github.io/pocket-budget/>
