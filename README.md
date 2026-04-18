[![Build](https://github.com/Retsumdk/json-schema-validator/workflows/CI/badge.svg)](https://github.com/Retsumdk/json-schema-validator/actions)
[![TypeScript](https://img.shields.io/badge/typescript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node.js-20-green?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

# JSON Schema Validator

[![CI](https://github.com/Retsumdk/json-schema-validator/workflows/CI/badge.svg)](https://github.com/Retsumdk/json-schema-validator/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Fast JSON Schema validation middleware. Validate API requests and responses against JSON Schema definitions with detailed error reporting.

## Features

- **High Performance** — Native JSON Schema draft-07/draft-2020-19 support
- **Detailed Errors** — Clear, actionable validation error messages
- **Custom Keywords** — Extend schema with custom validation logic
- **Async Validation** — Non-blocking validation for high-throughput APIs
- **Schema Caching** — Parse once, validate many times

## Installation

```bash
npm install json-schema-validator
```

## Quick Start

```typescript
import { Validator } from 'json-schema-validator';

const validator = new Validator();
const result = await validator.validate(data, schema);
```

## Related Repos

- [api-key-manager](https://github.com/Retsumdk/api-key-manager) — API key management with usage tracking
- [ai-response-validator](https://github.com/Retsumdk/ai-response-validator) — AI response validation
- [webhook-relay-service](https://github.com/Retsumdk/webhook-relay-service) — Webhook processing relay

## License

MIT License — see [LICENSE](LICENSE)
