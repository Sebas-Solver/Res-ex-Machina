# Contracts

`RxMAnchor` is a minimal, stateless anchoring contract compatible with the [ERC-8263](https://github.com/ethereum/ERCs/pull/1748) draft: no owner, no storage, no fees, no upgrades. It checks the draft's canonical-form guards and emits one `AnchorProof` event per call. The meaning of an anchor (which hash, which signature) is defined by the [rxm-pog-v2 profile](../spec/rxm-pog-v2.md), not by the contract.

Because it is our own deployment that emits the event, the profile keeps working whether or not ERC-8263 is finalised.

## Build and test

Requires [Foundry](https://getfoundry.sh).

```bash
cd contracts
forge test                # unit tests, including fuzzing of reserved schemes
```

End to end on a local chain (deploy, sign, anchor through a relayer, verify with `@res-ex-machina/pog`):

```bash
anvil &                                          # local chain on :8545
forge build
cd ../packages/pog
RXM_E2E_RPC=http://127.0.0.1:8545 RXM_E2E_ARTIFACT=../../contracts/out/RxMAnchor.sol/RxMAnchor.json npm test
```

## Deploy

Use a Foundry keystore, never a raw private key on the command line:

```bash
cast wallet import rxm-deployer --interactive
forge script script/Deploy.s.sol --rpc-url <rpc> --account rxm-deployer --broadcast
```

Not deployed yet. Planned: Base Sepolia first, then Base.
