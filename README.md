# Account Demolisher

A production-ready, open-source tool for cleanly and safely closing Stellar accounts. The Account Demolisher automates every step required to wind down a Stellar account: unwinding DeFi positions, removing trustlines and data entries, revoking extra signers, converting remaining assets, and merging the account to a destination wallet or exchange address.

## Overview

Stellar accounts accumulate reserves over time. Each trustline, open offer, data entry, and additional signer locks 0.5 XLM in the ledger reserve. Users who abandon accounts or consolidate wallets lose access to these reserves because the manual account-closure process is multi-step, technically involved, and inaccessible to most users. CEXes compound the problem further: none of the major exchanges support the `ACCOUNT_MERGE` operation, so the final 1 XLM base reserve is effectively frozen.

The Account Demolisher solves this by providing a guided, non-custodial, client-side-signed tool that handles the entire account wind-down process in a single interface. It extends the public-domain work of `stellar.expert/demolisher` with full Soroban support, DeFi protocol integration, and a production-grade UX designed for irreversible operations.

## Documentation Index

| Document | Description |
|---|---|
| [Technical Specification](docs/technical-specification.md) | Architecture, component design, transaction flow |
| [Requirements](docs/requirements.md) | Functional and non-functional requirements |
| [Security Model](docs/security-model.md) | Trust minimization, key handling, audit approach |
| [DeFi Protocol Integration](docs/defi-integration.md) | Blend, Aquarius, Soroswap, Phoenix Hub, FxDAO |
| [API Reference](docs/api-reference.md) | Backend service endpoints and data models |
| [UX Design](docs/ux-design.md) | User flows, confirmation screens, dry-run mode |
| [Test Strategy](docs/test-strategy.md) | Unit, integration, adversarial, and edge-case testing |
| [Delivery Plan](docs/delivery-plan.md) | Milestones, tranches, and acceptance criteria |
| [Dependency Services](docs/dependency-services.md) | OctoPos and Orion DeFi position API integration |

## Quick Start

Full setup and local development instructions are available in [docs/technical-specification.md](docs/technical-specification.md).

## License

Apache 2.0. This project builds upon the open-source work published at `stellar.expert/demolisher` by Orbit Lens.
