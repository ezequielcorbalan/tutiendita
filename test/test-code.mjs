// The tests' fixed claim code: used by the test build (scripts/test-build.mjs), the plugin of the Vitest
// "api" project and the tests that claim the store. Defined in the integration, which rejects it outside
// the test build.
export { TEST_CLAIM_CODE } from "../integrations/claim-code.mjs";
