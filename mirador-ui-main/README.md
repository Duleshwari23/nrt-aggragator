# Mirador UI - iOS Widgets Dashboard

A React + TypeScript dashboard application featuring iOS-style draggable widgets for KPI monitoring, built with Vite and deployed via Docker.

## ✨ Features

- 📱 **iOS-style Widgets**: Draggable, resizable KPI cards with smooth animations
- 🎯 **Interactive Grid**: Long-press to enter edit mode, drag to reorder
- 🔄 **Real-time Data**: Live KPI updates with sparkline charts
- 🎨 **Modern UI**: Dark/light theme support with Tailwind CSS
- 🐳 **Docker Ready**: Multiple deployment options including unified container
- 🧪 **Mock API**: Built-in development server with realistic data

## 🚀 Quick Start

### Unified Container (Recommended)

Single container with frontend + mock API:

```bash
# Build and start everything
./unified.sh

# Access at http://localhost:3000
```

See [UNIFIED.md](./UNIFIED.md) for complete unified container documentation.

### Development Mode

```bash
# Install dependencies
pnpm install

# Start development server + mock API
pnpm dev:all

# Access at http://localhost:5173
```

### Docker Compose (Multi-container)

```bash
# Development with hot reload
pnpm compose:up:dev

# Production build
pnpm compose:up
```

## 📚 Documentation

- [UNIFIED.md](./UNIFIED.md) - Single container deployment guide
- [AGENTS.md](./AGENTS.md) - Docker testing requirements
- [DOCKER.md](./DOCKER.md) - Multi-container setup guide

## 🛠 Technology Stack

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
