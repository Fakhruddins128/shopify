function errorHandler() {
  return (err, req, res, next) => {
    const requestId = req && req.requestId ? req.requestId : undefined;

    if (requestId) {
      console.error(`[${requestId}]`, err);
    } else {
      console.error(err);
    }

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).json({ success: false, message: "Internal server error." });
  };
}

module.exports = { errorHandler };
