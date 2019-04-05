import { Promise } from 'rsvp';
import { run } from '@ember/runloop';
import { DEBUG } from '@glimmer/env';
import { registerWaiter } from '@ember/test';
import { gte } from 'ember-compatibility-helpers';
import Ember from 'ember';
const APP_SCHEDULER_LABEL = 'ember-app-scheduler';
const APP_SCHEDULER_HAS_SETUP = '__APP_SCHEDULER_HAS_SETUP__';
let _whenRouteDidChange;
let _whenRoutePainted;
let _whenRoutePaintedScheduleFn;
let _whenRouteIdle;
let _whenRouteIdleScheduleFn;
let _activeScheduledTasks = 0;
let _capabilities;
export const USE_REQUEST_IDLE_CALLBACK = true;
export const SIMPLE_CALLBACK = callback => callback();
reset();
function getDefaultCapabilities() {
  return {
    requestAnimationFrameEnabled: typeof requestAnimationFrame === 'function',
    requestIdleCallbackEnabled: Ember.testing
      ? false
      : typeof requestIdleCallback === 'function',
  };
}
function getCapabilities() {
  return _capabilities || getDefaultCapabilities();
}
export function beginTransition() {
  _initScheduleFns();
  if (_whenRouteDidChange.isResolved) {
    _whenRouteDidChange = _defer(APP_SCHEDULER_LABEL);
    _whenRoutePainted = _whenRouteDidChange.promise.then(() =>
      _afterNextPaint(_whenRoutePaintedScheduleFn)
    );
    _whenRouteIdle = _whenRoutePainted.then(() =>
      _afterNextPaint(_whenRouteIdleScheduleFn)
    );
  }
}
export function endTransition() {
  _whenRouteDidChange.resolve();
}
export function setupRouter(router) {
  if (router[APP_SCHEDULER_HAS_SETUP]) {
    return;
  }
  router[APP_SCHEDULER_HAS_SETUP] = true;
  if (gte('3.6.0')) {
    router.on('routeWillChange', beginTransition);
    router.on('routeDidChange', endTransition);
  } else {
    router.on('willTransition', beginTransition);
    router.on('didTransition', endTransition);
  }
}
export function reset() {
  _whenRouteDidChange = _defer(APP_SCHEDULER_LABEL);
  _whenRoutePainted = _whenRouteDidChange.promise.then();
  _whenRouteIdle = _whenRoutePainted.then();
  _whenRouteDidChange.resolve();
  _activeScheduledTasks = 0;
}
/**
 * Top level promise that represents the entry point for deferred work.
 * Subsequent promises are chained off this promise, successively composing
 * them together to approximate when painting has occurred.
 *
 * @public
 */
export function didTransition() {
  return _whenRouteDidChange.promise;
}
/**
 * This promise, when resolved, approximates after the route is first painted.
 * This can be used to schedule work to occur that is lower priority than initial
 * work (content outside of the viewport, rendering non-critical content).
 *
 * @public
 */
export function whenRoutePainted() {
  return _whenRoutePainted;
}
/**
 * This promise, when resolved, approximates after content is painted.
 *
 * @public
 */
export function whenRouteIdle() {
  return _whenRouteIdle;
}
/**
 * Used for testing
 */
export function routeSettled() {
  return _whenRouteIdle;
}
export function _getScheduleFn(useRequestIdleCallback = false) {
  const {
    requestIdleCallbackEnabled,
    requestAnimationFrameEnabled,
  } = getCapabilities();
  if (useRequestIdleCallback && requestIdleCallbackEnabled) {
    return requestIdleCallback;
  } else if (requestAnimationFrameEnabled) {
    return requestAnimationFrame;
  } else {
    return SIMPLE_CALLBACK;
  }
}
export function _setCapabilities(newCapabilities = getDefaultCapabilities()) {
  _capabilities = newCapabilities;
  _initScheduleFns();
}
function _initScheduleFns() {
  _whenRoutePaintedScheduleFn = _getScheduleFn();
  _whenRouteIdleScheduleFn = _getScheduleFn(USE_REQUEST_IDLE_CALLBACK);
}
function _afterNextPaint(scheduleFn) {
  let promise = new Promise(resolve => {
    if (DEBUG) {
      _activeScheduledTasks++;
    }
    scheduleFn(() => {
      run.later(resolve, 0);
    });
  });
  if (DEBUG) {
    promise = promise.finally(() => {
      _activeScheduledTasks--;
    });
  }
  return promise;
}
if (DEBUG) {
  // wait until no active rafs
  registerWaiter(() => _activeScheduledTasks === 0);
}
function _defer(label) {
  let _isResolved = false;
  let _resolve;
  let _reject;
  const promise = new Promise((resolve, reject) => {
    _resolve = () => {
      _isResolved = true;
      resolve();
    };
    _reject = reject;
  }, label);
  return {
    promise,
    resolve: _resolve,
    reject: _reject,
    get isResolved() {
      return _isResolved;
    },
  };
}
