// One error class for all "expected" failures. The central error handler turns it into JSON.
class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
module.exports = { AppError };
