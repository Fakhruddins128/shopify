const jwt = require("jsonwebtoken");
const config = require("../config");

function authJwt() {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || typeof header !== "string") {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    try {
      const payload = jwt.verify(token, config.jwt.secret, {
        algorithms: config.jwt.algorithms
      });
      req.user = payload;
      return next();
    } catch (err) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }
  };
}

module.exports = { authJwt };
