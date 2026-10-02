// SPDX-License-Identifier: Apache-2.0
/* global process, console */
// Independent check of the rxm-pog-v2 vectors: rebuilds the EIP-712 encoding by hand.
// Usage: node spec/vectors/check.mjs spec/vectors/rxm-pog-v2.json
import { keccak256, toBytes, encodeAbiParameters, concat, recoverAddress } from 'viem';
import { readFileSync } from 'node:fs';
const v = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const d = v.domain, m = v.single.declaration;
const k = (s) => keccak256(toBytes(s));
const domTH = k('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
const ds = keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'bytes32'},{type:'uint256'},{type:'address'}],[domTH,k(d.name),k(d.version),BigInt(d.chainId),d.verifyingContract]));
const th = k('PoGDeclaration(address agent,bytes32 contentHash,bytes32 inputHash,string modelId,string runtimeId,uint8 processType,uint8 humanIntervention,uint16 pipelineSteps,uint64 declaredAt,bytes32 nonce,bytes32 metadataHash)');
const sh = keccak256(encodeAbiParameters(
  ['bytes32','address','bytes32','bytes32','bytes32','bytes32','uint8','uint8','uint16','uint64','bytes32','bytes32'].map(t=>({type:t})),
  [th,m.agent,m.contentHash,m.inputHash,k(m.modelId),k(m.runtimeId),m.processType,m.humanIntervention,m.pipelineSteps,BigInt(m.declaredAt),m.nonce,m.metadataHash]));
const digest = keccak256(concat(['0x1901', ds, sh]));
console.log('digest match:', digest === v.single.eip712Digest_proofHash);
const sig = '0x' + v.single.aux.slice(10);
console.log('signer match:', (await recoverAddress({ hash: digest, signature: sig })) === m.agent);
const s = BigInt('0x' + sig.slice(66, 130)); console.log('low-s:', s <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0n);
