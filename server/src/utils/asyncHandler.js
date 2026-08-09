'use strict';
/* Express 4 does not catch a rejected promise from a handler: the request
   simply hangs. Every async controller is wrapped in this, so a rejection
   reaches the error middleware like any thrown error would. */
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
