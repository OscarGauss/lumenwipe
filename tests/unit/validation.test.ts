import { test, expect } from "bun:test";
import { Keypair } from "@stellar/stellar-sdk";
import { isValidGAddress, isValidSecretKey, isValidMemo } from "@/lib/utils/validation";

const kp = Keypair.random();
const VALID_ADDRESS = kp.publicKey();
const VALID_SECRET = kp.secret();

test("isValidGAddress › valid G-address", () => {
  expect(isValidGAddress(VALID_ADDRESS)).toBe(true);
});

test("isValidGAddress › empty string rejected", () => {
  expect(isValidGAddress("")).toBe(false);
});

test("isValidGAddress › random string rejected", () => {
  expect(isValidGAddress("INVALID_ADDRESS")).toBe(false);
});

test("isValidGAddress › too short rejected", () => {
  expect(isValidGAddress("G" + "A".repeat(10))).toBe(false);
});

test("isValidGAddress › S-secret rejected as address", () => {
  expect(isValidGAddress(VALID_SECRET)).toBe(false);
});

test("isValidGAddress › M-address (muxed) rejected", () => {
  expect(isValidGAddress("MA7QYNF7SOWQ3GLR2BGMZEHXR7CPLRNHIHA6DKPQ7GFPQZS7YJLCBIZD")).toBe(false);
});

test("isValidSecretKey › valid S-key", () => {
  expect(isValidSecretKey(VALID_SECRET)).toBe(true);
});

test("isValidSecretKey › G-address rejected as secret", () => {
  expect(isValidSecretKey(VALID_ADDRESS)).toBe(false);
});

test("isValidSecretKey › empty string rejected", () => {
  expect(isValidSecretKey("")).toBe(false);
});

test("isValidSecretKey › random string rejected", () => {
  expect(isValidSecretKey("SINVALID")).toBe(false);
});

test("isValidMemo › text memo within 28 chars is valid", () => {
  expect(isValidMemo("hello", "text")).toBe(true);
});

test("isValidMemo › text memo at exactly 28 chars is valid", () => {
  expect(isValidMemo("a".repeat(28), "text")).toBe(true);
});

test("isValidMemo › text memo over 28 chars is invalid", () => {
  expect(isValidMemo("a".repeat(29), "text")).toBe(false);
});

test("isValidMemo › empty text memo is invalid", () => {
  expect(isValidMemo("", "text")).toBe(false);
});

test("isValidMemo › valid numeric ID memo", () => {
  expect(isValidMemo("12345678", "id")).toBe(true);
});

test("isValidMemo › non-numeric ID memo is invalid", () => {
  expect(isValidMemo("abc", "id")).toBe(false);
});

test("isValidMemo › ID memo with leading zeros is valid", () => {
  expect(isValidMemo("007", "id")).toBe(true);
});
