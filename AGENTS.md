# Repository Guidelines

## Project Structure & Module Organization
This bot targets a Node.js + TypeScript stack. Place production modules in `src/` and keep folders scoped by domain (`src/services`, `src/integrations`, `src/lib`). Shared DTOs go in `src/types`. Tests live in `tests/` mirroring the `src/` layout; put fixtures under `tests/fixtures`. Store operational docs or ADRs in `docs/` and scripts for one-off tasks in `scripts/`.

## Build, Test, and Development Commands
`npm install` installs dependencies against Node 20 LTS. `npm run build` should compile TypeScript via `tsc --project tsconfig.json`. `npm run dev` runs the local bot with hot reload (`ts-node-dev src/index.ts`). `npm run lint` executes ESLint + Prettier; fix failures before committing.

## Coding Style & Naming Conventions
Use Prettier with 2-space indentation, single quotes, and trailing commas where valid. ESLint should extend `eslint-config-airbnb-base` with TypeScript support; keep lines ≤120 characters. Name files kebab-case (`price-comparison.service.ts`), classes/interfaces PascalCase, and exported constants SCREAMING_SNAKE_CASE. Never commit `.env*`; provide samples in `.env.example`.

## Testing Guidelines
Write tests with Vitest (or Jest if preferred) and suffix files with `*.spec.ts`. Place integration suites under `tests/integration` and mock partner APIs with MSW or Nock. Aim for ≥80% statement coverage; run `npm run test -- --coverage` before pushing. Include regression tests whenever touching pricing logic or quote calculations.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat:`, `fix:`, `refactor:`) and reference the relevant issue ID (`feat: add swap quote caching #42`). Squash commits locally to keep history clean. Pull requests must list behavior changes, validation steps, and any configuration updates; attach screenshots or CLI transcripts when output changes. Request at least one reviewer familiar with the affected integration before merging.

## Security & Configuration Tips
Store API keys in the secrets manager and load them via environment variables. Document required env vars in `docs/configuration.md` and keep staging credentials rotated monthly. Validate every external payload at the module boundary to avoid propagating malformed partner data.
