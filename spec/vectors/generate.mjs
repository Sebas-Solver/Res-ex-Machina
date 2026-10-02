// SPDX-License-Identifier: Apache-2.0
/* global console */
// Generates the rxm-pog-v2 test vectors (spec/rxm-pog-v2.md §9).
// Usage: node spec/vectors/generate.mjs > spec/vectors/rxm-pog-v2.json
// The signing key is Hardhat/Anvil test account #0: PUBLIC, never use it with real funds.
import { createHash } from 'node:crypto';
import {
  hashTypedData, keccak256, toBytes, toHex, concat, encodeAbiParameters,
  recoverTypedDataAddress, encodeEventTopics, parseAbiItem,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const sha256 = (data) => '0x' + createHash('sha256').update(data).digest('hex');
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const account = privateKeyToAccount(TEST_KEY);

export const SELECTOR_SINGLE = keccak256(toBytes('rxm-pog-v2/single')).slice(0, 10);
export const SELECTOR_BATCH = keccak256(toBytes('rxm-pog-v2/batch')).slice(0, 10);

export const TYPES = {
  PoGDeclaration: [
    { name: 'agent', type: 'address' },
    { name: 'contentHash', type: 'bytes32' },
    { name: 'inputHash', type: 'bytes32' },
    { name: 'modelId', type: 'string' },
    { name: 'runtimeId', type: 'string' },
    { name: 'processType', type: 'uint8' },
    { name: 'humanIntervention', type: 'uint8' },
    { name: 'pipelineSteps', type: 'uint16' },
    { name: 'declaredAt', type: 'uint64' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'metadataHash', type: 'bytes32' },
  ],
};

const domain = {
  name: 'ResExMachina PoG',
  version: '2',
  chainId: 84532, // Base Sepolia
  verifyingContract: '0x0000000000000000000000000000000000008263', // placeholder for the vectors
};

const caip10AgentId = (chainId, addr) => keccak256(toBytes(`eip155:${chainId}:${addr.toLowerCase()}`));

// RFC 8785 (JCS) canonical form of the example metadata, written by hand: keys sorted, no whitespace.
const metadataJcs = '{"provenance":{"manifestHash":"sha256:5b1a0c6e0f5d3c8b2a4e1f7d9c0b8a6e4d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a","standard":"c2pa"},"tags":["demo","vector"]}';

const content = 'Hello from an AI agent.\n';
const input = 'Write a one-line greeting.';

const decl = {
  agent: account.address,
  contentHash: sha256(content),
  inputHash: sha256(input),
  modelId: 'anthropic:claude-opus-5-5',
  runtimeId: 'rxm-sdk-ts/0.2.0',
  processType: 0,
  humanIntervention: 1,
  pipelineSteps: 1,
  declaredAt: 1790899200n, // 2026-10-02T00:00:00Z
  nonce: keccak256(toBytes('rxm-pog-v2 vector nonce 1')),
  metadataHash: sha256(metadataJcs),
};

const digest = hashTypedData({ domain, types: TYPES, primaryType: 'PoGDeclaration', message: decl });
const signature = await account.signTypedData({ domain, types: TYPES, primaryType: 'PoGDeclaration', message: decl });
const recovered = await recoverTypedDataAddress({ domain, types: TYPES, primaryType: 'PoGDeclaration', message: decl, signature });
if (recovered !== account.address) throw new Error('signature does not recover');
const aux = concat([SELECTOR_SINGLE, signature]);

// Batch: three declarations (the one above plus two more nonces).
const leafOf = (d) => keccak256(concat(['0x00', d]));
const nodeOf = (a, b) => keccak256(concat(['0x01', ...(BigInt(a) < BigInt(b) ? [a, b] : [b, a])]));
const extra = [2, 3].map((i) => ({ ...decl, nonce: keccak256(toBytes(`rxm-pog-v2 vector nonce ${i}`)) }));
const digests = [digest, ...extra.map((m) => hashTypedData({ domain, types: TYPES, primaryType: 'PoGDeclaration', message: m }))];
let level = digests.map(leafOf);
while (level.length > 1) {
  const next = [];
  for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? nodeOf(level[i], level[i + 1]) : level[i]);
  level = next;
}
const root = level[0];

const topic0 = encodeEventTopics({
  abi: [parseAbiItem('event AnchorProof(uint8 agentIdScheme, bytes32 indexed agentId, bytes32 indexed proofHash, address indexed operator, bytes aux)')],
})[0];

console.log(JSON.stringify({
  warning: 'Test vectors only. The key is the public Hardhat/Anvil account #0.',
  erc8263_topic0: topic0,
  selectors: { single: SELECTOR_SINGLE, batch: SELECTOR_BATCH },
  domain,
  types: TYPES,
  single: {
    content, input, metadataJcs,
    declaration: { ...decl, declaredAt: decl.declaredAt.toString() },
    eip712Digest_proofHash: digest,
    signature,
    aux,
    agentIdScheme: 2,
    agentId: caip10AgentId(domain.chainId, account.address),
    caip10: `eip155:${domain.chainId}:${account.address.toLowerCase()}`,
    anchorCalldata_example: encodeAbiParameters(
      [{ type: 'uint8' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes' }],
      [2, caip10AgentId(domain.chainId, account.address), digest, aux],
    ),
  },
  batch: {
    leaves_eip712Digests: digests,
    merkleRoot_proofHash: root,
    agentIdScheme: 0,
    agentId: toHex(0n, { size: 32 }),
  },
}, null, 2));
