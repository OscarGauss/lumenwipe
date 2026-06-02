import { TransactionBuilder, Operation, Account } from "@stellar/stellar-sdk";
import type { Network } from "@/config/networks";
import { NETWORK_PASSPHRASES } from "@/config/networks";
import { BASE_FEE_STROOPS, TX_TIMEOUT_SECONDS } from "@/config/constants";
import type { AccountSigner } from "@/types/account";

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

  // Remove all non-master signers
  for (const signer of signers) {
    if (signer.key === masterKey) continue;
    builder.addOperation(
      Operation.setOptions({
        signer: { ed25519PublicKey: signer.key, weight: 0 },
      })
    );
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
