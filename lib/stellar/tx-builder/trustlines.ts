import { TransactionBuilder, Operation, Account } from "@stellar/stellar-sdk";
import type { Network } from "@/config/networks";
import { NETWORK_PASSPHRASES } from "@/config/networks";
import { BASE_FEE_STROOPS, TX_TIMEOUT_SECONDS } from "@/config/constants";
import type { Trustline } from "@/types/account";
import { assetToSdkAsset } from "@/lib/utils/assets";

export function buildRemoveTrustlinesTx(
  sdkAccount: Account,
  trustlines: Trustline[],
  network: Network
): string {
  const passphrase = NETWORK_PASSPHRASES[network];

  const builder = new TransactionBuilder(sdkAccount, {
    fee: String(BASE_FEE_STROOPS * trustlines.length),
    networkPassphrase: passphrase,
  }).setTimeout(TX_TIMEOUT_SECONDS);

  for (const tl of trustlines) {
    const asset = assetToSdkAsset(tl.asset);
    // Setting limit to "0" removes the trustline
    builder.addOperation(Operation.changeTrust({ asset, limit: "0" }));
  }

  return builder.build().toEnvelope().toXDR("base64");
}
