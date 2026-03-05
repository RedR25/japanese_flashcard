# src readme

## Module/Directory Purpose

- **Core responsibility**: Provide the frontend application entry, root UI, and the global styling needed to render and run a single-page React flashcard app for learning Hiragana and Katakana.
- **Business domain**: Client-side user interface for an educational flashcard application, including app bootstrapping, global Tailwind-based stylesheet injection, and utility CSS for 3D/flip visual patterns.
- **Separation rationale**: Files are grouped to keep the app entry and root component (`main.jsx` and `App.jsx`) together with their stylesheet concerns (`index.css` and `App.css`), separating bootstrap logic from styling and the main UI logic for easier maintenance and focused changes to either behavior or presentation.

## File Organization & Roles

| File | Role | Description |
|------|------|-------------|
| [App.css](App.css.md) | Utility | This CSS file provides a small set of utility classes to enable simple 3D transform and flip effects. It centralizes perspective, 3D preservation, backface visibility, and a 180-degree Y-rotation so HTML elements can be composed into card-flip or other 3D visual patterns. |
| [App.jsx](App.jsx.md) | Core Logic | This file implements a single-page React flashcard app for learning Hiragana and Katakana. It provides the main UI and logic (settings modal, shuffling, flashcard flip/answer flow, stats) to study characters in three modes and two study directions using components like SettingsModal, Flashcard, a... |
| [index.css](index.css.md) | Utility | This CSS entry file loads Tailwind layers and defines a small global reset for the application. It centralizes Tailwind base, component, and utility injection so the build pipeline can generate the final stylesheet, and it sets a consistent body margin and font stack for the app. |
| [main.jsx](main.jsx.md) | Entry Point | This file bootstraps the React application by locating the DOM mount node and rendering the root React component. It exists to attach the App component into the page and enable React StrictMode during development using `createRoot` and `StrictMode`. ```mermaid flowchart TD %% Source: src\\main. |

## Dependency Network

- **Internal Dependencies**:
  - `main.jsx` imports and renders the root component from `App.jsx` to mount the application.
  - `App.jsx` consumes global styles provided by `index.css` and presentation utilities defined in `App.css`.
- **External Dependencies**:
  - Consumes `react` and `react-dom` for component rendering and bootstrapping (`createRoot`, `StrictMode`).
  - Consumes `tailwind` (via the build pipeline) for utility-first CSS through the `index.css` layers.
  - Composes or imports UI parts referenced by the app logic (for example, `SettingsModal` and `Flashcard` as noted in `App.jsx`), which may live elsewhere in the codebase.
- **Dependents**:
  - The application's HTML entry and build process depend on `main.jsx` to mount the React app.
  - Higher-level app routing or pages rely on the root UI provided by `App.jsx` to present the flashcard experience.
  - The global stylesheet produced from `index.css` is relied on by all rendered components for consistent base styles.

## Integration Patterns

- Communication protocols:
  - `App.jsx` follows standard React component patterns: internal state, props, and callback props to coordinate UI interactions (settings, flips, stats).
  - `main.jsx` uses imperative bootstrapping (`createRoot`) to attach the root component to the DOM.
- Data flow in and out of this module:
  - User input and configuration flows into `App.jsx` (settings, study direction) and is managed in component state; UI updates and stats are derived and rendered by `App.jsx`.
  - Styling flows in from `index.css` (global Tailwind layers) and `App.css` (3D/flip utilities) to presentation layers rendered by `App.jsx`.
- Key interfaces exposed or consumed:
  - `App.jsx` is the primary UI component interface for the flashcard experience.
  - `main.jsx` is the bootstrap interface that the runtime calls to start the app.
  - `index.css` and `App.css` are the interfaces for global and utility styling consumed by components.

## Development Guidelines

- Where to add new features:
  - Add UI and behavior changes to `App.jsx` when they are part of the root flashcard experience (modes, study flows, settings, stats).
  - Add or adjust global CSS rules and Tailwind layer configuration in `index.css`.
  - Add or modify presentation utilities and 3D/flip effects in `App.css`.
  - Modify `main.jsx` only for changes to application bootstrapping, mount behavior, or development-only wrappers (for example, toggling `StrictMode`).
- Common modification patterns:
  - To change layout or base typography, update `index.css` so Tailwind-generated output remains consistent across the app.
  - To change card flip behavior or 3D visual effects, update `App.css` utility classes used by card components.
  - To add a new component consumed by the flashcard flow, create the component file (in an appropriate subdirectory), export it, and import it into `App.jsx`.
- Files to touch for specific changes:
  - UI/logic for study modes, shuffle, and stats: `App.jsx`
  - Global styling, Tailwind layer management: `index.css`
  - 3D transforms and flip utilities: `App.css`
  - Application mount or development wrappers: `main.jsx`