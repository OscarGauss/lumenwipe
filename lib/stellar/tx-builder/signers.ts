import { TransactionBuilder, Operation, Account, StrKey } from "@stellar/stellar-sdk";
import type { Network } from "@/config/networks";
import { NETWORK_PASSPHRASES } from "@/config/networks";
import { BASE_FEE_STROOPS, TX_TIMEOUT_SECONDS } from "@/config/constants";
import type { AccountSigner } from "@/types/account";

function signerRemovalOption(
  signer: AccountSigner
): Parameters<typeof Operation.setOptions>[0]["signer"] {
  if (signer.type === "ed25519_public_key") {
    return { ed25519PublicKey: signer.key, weight: 0 };
  }
  if (signer.type === "hash_x") {
    return { sha256Hash: StrKey.decodeSha256Hash(signer.key), weight: 0 };
  }
  if (signer.type === "preauth_tx") {
    return { preAuthTx: StrKey.decodePreAuthTx(signer.key), weight: 0 };
  }
  if (signer.type === "ed25519_signed_payload") {
    // The SDK's setOptions signer accepts the P... strkey directly for signed payload signers.
    // Per TASKS.md §8: if removal cannot be built for any reason, skip it - the signer is
    // automatically deleted at account merge anyway.
    return { ed25519SignedPayload: signer.key, weight: 0 };
  }
  return undefined;
}

export function buildNormalizeSignersTx(
  sdkAccount: Account,
  signers: AccountSigner[],
  network: Network
): string {
  const passphrase = NETWORK_PASSPHRASES[network];
  const masterKey = sdkAccount.accountId();

  const builder = new TransactionBuilder(sdkAccount, {
    fee: String(BASE_FEE_STROOPS * (signers.length + 1)),
    networkPassphrase: passphrase,
  }).setTimeout(TX_TIMEOUT_SECONDS);

  // Remove all non-master signers (ed25519, hash_x, and preauth_tx types)
  for (const signer of signers) {
    if (signer.key === masterKey) continue;
    const signerOpt = signerRemovalOption(signer);
    if (!signerOpt) continue;
    builder.addOperation(Operation.setOptions({ signer: signerOpt }));
  }

  // Reset thresholds to 0/1/1 (low/med/high) so master key alone is sufficient
  builder.addOperation(
    Operation.setOptions({
      lowThreshold: 0,
      medThreshold: 1,
      highThreshold: 1,
    })
  );

  return builder.build().toEnvelope().toXDR("base64");
}
