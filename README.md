# Flow Matching and Diffusion

Interactive visualizations for flow matching and diffusion models, used on
[mariogemoll.com/flow-matching](https://mariogemoll.com/flow-matching) and
[mariogemoll.com/diffusion](https://mariogemoll.com/diffusion).

The visualizations are written in TypeScript with React and render to HTML canvas / WebGL. Models
are trained and run in the browser with TensorFlow.js.

## Visualizations

- `brownian-motion` — sample paths of Brownian motion
- `vector-field` — showing how an object gets moved by a vector field
- `euler-method` / `euler-maruyama-method` — numerical integration of ODEs / SDEs
- `conditional/path`, `conditional/path-ode`, `conditional/path-ode-sde` — conditional probability
  paths and the ODEs/SDEs that generate them
- `marginal/path`, `marginal/path-ode`, `marginal/path-ode-sde` — the same for marginal paths
- `ensembles/flow-matching`, `ensembles/diffusion` — end-to-end training and sampling on the
  two-moons dataset

Each visualization is exported as a standalone module (see `package.json` `exports`) and mounted
into an element on a page. See `demo.html`, `flow-matching.html`, and `diffusion.html` for examples.

## Build

```sh
npm install
npm run build
npx serve
```

Then open `demo.html`, `flow-matching.html`, or `diffusion.html`.

For development:

```sh
npm run watch
```
