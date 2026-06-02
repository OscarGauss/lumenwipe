const RESULT_CODE_MESSAGES: Record<string, string> = {
  tx_bad_auth:
    "The transaction signature does not meet the account's authorization requirements. Make sure you're using the correct secret key.",
  tx_insufficient_fee: "The network fee was too low. Please retry.",
  tx_bad_seq: "Sequence number mismatch. Please retry - the account state has changed.",
  tx_no_account: "The source account does not exist on the network.",
  tx_insufficient_balance: "Insufficient XLM balance to cover the transaction fee and reserves.",
  tx_missing_operation: "The transaction has no operations.",
  op_no_trust: "This account does not have a trustline for the specified asset.",
  op_low_reserve:
    "Insufficient XLM balance to cover the minimum reserve requirement after this operation.",
  op_sell_no_issuer:
    "The asset issuer account no longer exists - sending balance back is not possible.",
  op_no_issuer: "The asset issuer account does not exist.",
  op_underfunded: "Insufficient balance for this operation.",
  op_bad_auth: "Insufficient authorization for this operation.",
  op_no_destination:
    "The destination account does not exist on this network. Make sure the destination address is funded before merging.",
  op_malformed: "The operation is malformed. Check that all parameters are valid.",
  op_already_exist:
    "The destination account already exists (AccountMerge cannot merge into itself).",
  op_not_authorized: "This account does not have authorization to perform this merge.",
  TIMEOUT: "The transaction was not confirmed within the timeout period. It is safe to retry.",
  ERROR: "The transaction was rejected by the network.",
  FAILED: "The transaction failed. Check individual operation results.",
};

export function translateRpcError(code: string, raw?: string): string {
  const message = RESULT_CODE_MESSAGES[code];
  if (message) return message;
  return `An unexpected error occurred (code: ${code}). ${raw ? `Details: ${raw}` : ""}`;
}

export class AccountNotFoundError extends Error {
  constructor(address: string) {
    super(`Account ${address} does not exist on this network.`);
    this.name = "AccountNotFoundError";
  }
}

export class TxTimeoutError extends Error {
  constructor() {
    super("Transaction confirmation timed out. It is safe to retry.");
    this.name = "TxTimeoutError";
  }
}

export class NoConversionPathError extends Error {
  constructor(asset: string) {
    super(
      `No conversion path found for ${asset}. You may need to send the balance back to the issuer.`
    );
    this.name = "NoConversionPathError";
  }
}
