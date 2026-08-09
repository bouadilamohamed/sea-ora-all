'use strict';
/* An error a controller may throw and the error handler may show to a
   visitor. Anything that is NOT an HttpError is treated as a bug and answered
   with a flat 500, so a stack trace or a database message never reaches the
   browser. */
class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.expose = true;
    if (extra) Object.assign(this, extra);
  }
}

const badRequest = (m, extra) => new HttpError(400, m || 'Requête invalide.', extra);
const unauthorized = (m, extra) => new HttpError(401, m || 'Non autorisé.', extra);
const forbidden = (m, extra) => new HttpError(403, m || 'Interdit.', extra);
const notFound = (m, extra) => new HttpError(404, m || 'Introuvable', extra);
const conflict = (m, extra) => new HttpError(409, m || 'Conflit.', extra);
const tooMany = (m, extra) => new HttpError(429, m || 'Trop de tentatives. Réessayez dans quelques minutes.', extra);
const unavailable = (m, extra) => new HttpError(503, m || 'Service indisponible.', extra);

module.exports = {
  HttpError, badRequest, unauthorized, forbidden, notFound, conflict, tooMany, unavailable
};
