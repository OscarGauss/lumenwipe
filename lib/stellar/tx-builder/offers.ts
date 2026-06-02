import { TransactionBuilder, Operation, Asset, Account } from "@stellar/stellar-sdk";
import type { Network } from "@/config/networks";
import { NETWORK_PASSPHRASES } from "@/config/networks";
import { BASE_FEE_STROOPS, TX_TIMEOUT_SECONDS } from "@/config/constants";
import type { OpenOffer } from "@/types/account";
import { assetToSdkAsset } from "@/lib/utils/assets";

export function buildCancelOffersTx(
  sdkAccount: Account,
  offers: OpenOffer[],
  network: Network
): string {
  const passphrase = NETWORK_PASSPHRASES[network];

  const builder = new TransactionBuilder(sdkAccount, {
    fee: String(BASE_FEE_STROOPS * offers.length),
    networkPassphrase: passphrase,
  }).setTimeout(TX_TIMEOUT_SECONDS);

  for (const offer of offers) {
    const selling = assetToSdkAsset(offer.selling);
    const buying = assetToSdkAsset(offer.buying);

    // Setting amount to "0" cancels the offer
    builder.addOperation(
      Operation.manageSellOffer({
        selling,
        buying,
        amount: "0",
        price: offer.price || "1",
        offerId: offer.id,
      })
    );
  }

  return builder.build().toEnvelope().toXDR("base64");
}
