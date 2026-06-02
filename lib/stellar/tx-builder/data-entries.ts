import { TransactionBuilder, Operation, Account } from "@stellar/stellar-sdk";
import type { Network } from "@/config/networks";
import { NETWORK_PASSPHRASES } from "@/config/networks";
import { BASE_FEE_STROOPS, TX_TIMEOUT_SECONDS } from "@/config/constants";
import type { DataEntry } from "@/types/account";

export function buildRemoveDataEntriesTx(
  sdkAccount: Account,
  entries: DataEntry[],
  network: Network
): string {
  const passphrase = NETWORK_PASSPHRASES[network];

  const builder = new TransactionBuilder(sdkAccount, {
    fee: String(BASE_FEE_STROOPS * entries.length),
    networkPassphrase: passphrase,
  }).setTimeout(TX_TIMEOUT_SECONDS);

  for (const entry of entries) {
    // Setting value to null removes the data entry
    builder.addOperation(Operation.manageData({ name: entry.key, value: null }));
  }

  return builder.build().toEnvelope().toXDR("base64");
}
