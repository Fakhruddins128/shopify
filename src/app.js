const express = require("express");
const inventoryRouter = require("./routes/inventory");
const { requestContext } = require("./middleware/requestContext");
const { notFoundHandler } = require("./middleware/notFoundHandler");
const { errorHandler } = require("./middleware/errorHandler");

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext());

  app.get("/health", (req, res) => {
    res.status(200).json({ success: true, message: "OK" });
  });

  app.use("/api/v1/inventory", inventoryRouter);

  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}

module.exports = { createApp };
