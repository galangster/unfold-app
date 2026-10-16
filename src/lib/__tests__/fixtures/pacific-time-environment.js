/**
 * A Jest environment that runs one test file on a reader's clock in Los
 * Angeles, whatever zone the machine or CI runs in. A test cannot pin the
 * zone itself: process.env inside a test is a copy, so setting TZ there
 * changes nothing. This environment sets the worker's own TZ before the file
 * loads and puts it back after, so the next file in the worker keeps its zone.
 *
 * Use it with a docblock at the top of a test file:
 *   @jest-environment ./src/lib/__tests__/fixtures/pacific-time-environment.js
 */

'use strict';

const ReactNativeEnvironment = require('@react-native/jest-preset/jest/react-native-env.js');

module.exports = class PacificTimeEnvironment extends ReactNativeEnvironment {
  async setup() {
    this.previousTimeZone = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    await super.setup();
  }

  async teardown() {
    if (this.previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = this.previousTimeZone;
    await super.teardown();
  }
};
