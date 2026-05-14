const {
  NKFE_PAYOUT_API_URL,
  NKFE_PAYOUT_API_KEY,
  NKFE_PAYOUT_TIMEOUT_MS,
  NKFE_TOKEN_DECIMALS,
  NKFE_PAYOUT_DECIMAL_FALLBACKS
} = require("../config/constants");

function toUnits(amount, decimals = NKFE_TOKEN_DECIMALS) {
  if (!Number.isInteger(Number(amount)) || Number(amount) < 0) {
    throw new Error("Amount must be a non-negative whole number.");
  }

  return BigInt(Number(amount)) * (10n ** BigInt(Number(decimals)));
}

function fromUnits(units, decimals = NKFE_TOKEN_DECIMALS) {
  return Number(units) / (10 ** Number(decimals));
}

function formatTokenAmount(units, decimals = NKFE_TOKEN_DECIMALS) {
  const unitValue = BigInt(units);
  const precision = Number(decimals);
  const divisor = 10n ** BigInt(precision);
  const whole = unitValue / divisor;
  const fraction = unitValue % divisor;

  if (!precision) return whole.toString();

  const fractionText = fraction.toString().padStart(precision, "0").replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

function convertUnitsForDecimals(units, sourceDecimals = NKFE_TOKEN_DECIMALS, payoutDecimals = sourceDecimals) {
  const unitValue = BigInt(units);
  const sourcePrecision = Number(sourceDecimals);
  const payoutPrecision = Number(payoutDecimals);

  if (payoutPrecision === sourcePrecision) return unitValue;
  if (payoutPrecision > sourcePrecision) return unitValue * (10n ** BigInt(payoutPrecision - sourcePrecision));
  return unitValue / (10n ** BigInt(sourcePrecision - payoutPrecision));
}

function formatPayoutAmount(units, sourceDecimals = NKFE_TOKEN_DECIMALS, payoutDecimals = sourceDecimals) {
  return formatTokenAmount(convertUnitsForDecimals(units, sourceDecimals, payoutDecimals), payoutDecimals);
}

function parsePercentToParts(feePercent) {
  const text = String(feePercent ?? 0).trim();
  if (!text || Number(text) <= 0) return { numerator: 0n, denominator: 1n };

  if (!text.includes(".")) return { numerator: BigInt(text), denominator: 1n };

  const [whole, fraction] = text.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole || "0") * denominator + BigInt(fraction || "0");
  return { numerator, denominator };
}

function calculateFeeUnits(grossUnits, feePercent) {
  const { numerator, denominator } = parsePercentToParts(feePercent);
  return (BigInt(grossUnits) * numerator) / denominator;
}

function getTransactionId(result) {
  return result?.txId || result?.transactionId || result?.tx_id || result?.transaction_id || null;
}

function getPayoutErrorMessage(result, fallback) {
  if (!result) return fallback;
  if (typeof result === "string") return result;

  const candidates = [
    result.message,
    result.error,
    result.code,
    result.reason,
    result.error?.message,
    result.error?.code,
    result.error?.error,
    result.error?.reason
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }

  return result.raw || fallback;
}

function isPrecisionMismatch(errorMessage) {
  const message = String(errorMessage || "").toLowerCase();
  return message.includes("amount mismatch") ||
    message.includes("amount_mismatch") ||
    message.includes("nkfe_amount_mismatch") ||
    message.includes("precision") ||
    message.includes("decimal") ||
    message.includes("decimals");
}

async function readJsonSafely(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function postPayout(payload, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { "content-type": "application/json" };
    if (NKFE_PAYOUT_API_KEY) headers.authorization = `Bearer ${NKFE_PAYOUT_API_KEY}`;

    const response = await fetch(NKFE_PAYOUT_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const result = await readJsonSafely(response);
    if (!response.ok || result?.success === false) {
      const error = new Error(getPayoutErrorMessage(result, `Payout API returned HTTP ${response.status}`));
      error.status = response.status;
      error.result = result;
      throw error;
    }

    return result || {};
  } finally {
    clearTimeout(timeout);
  }
}

async function executeNkfePayout({ withdrawalId, toWallet, netUnits, grossUnits, feeUnits, discordId }) {
  if (!NKFE_PAYOUT_API_URL) {
    throw new Error("NKFE payout API URL is not configured.");
  }

  const timeoutMs = Number(NKFE_PAYOUT_TIMEOUT_MS || 15000);
  const decimalsToTry = [NKFE_TOKEN_DECIMALS, ...NKFE_PAYOUT_DECIMAL_FALLBACKS]
    .map(Number)
    .filter((decimals, index, values) => Number.isInteger(decimals) && decimals >= 0 && values.indexOf(decimals) === index);

  let lastError = null;

  for (const decimals of decimalsToTry) {
    const payoutAmountUnits = convertUnitsForDecimals(netUnits, NKFE_TOKEN_DECIMALS, decimals);
    const payload = {
      toWallet,
      amountUnits: payoutAmountUnits.toString(),
      amount: formatTokenAmount(payoutAmountUnits, decimals),
      tokenIdentifier: "NKFE",
      memo: `GetRight Games NKFE Withdrawal #${withdrawalId}`,
      metadata: {
        withdrawalId,
        discordId,
        grossUnits: BigInt(grossUnits).toString(),
        feeUnits: BigInt(feeUnits).toString(),
        canonicalNetUnits: BigInt(netUnits).toString(),
        payoutAmountUnits: payoutAmountUnits.toString(),
        source: "getright_games_raid",
        payoutDecimals: decimals
      }
    };

    try {
      const result = await postPayout(payload, timeoutMs);
      return { result, transactionId: getTransactionId(result), payoutDecimals: decimals, payoutAmountUnits: payoutAmountUnits.toString() };
    } catch (error) {
      lastError = error;
      if (!isPrecisionMismatch(error.message)) break;
    }
  }

  throw lastError || new Error("Payout API request failed.");
}

module.exports = {
  toUnits,
  fromUnits,
  formatTokenAmount,
  convertUnitsForDecimals,
  formatPayoutAmount,
  calculateFeeUnits,
  executeNkfePayout
};
