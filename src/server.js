require("dotenv").config();

const { createApp } = require("./app");
const config = require("./config");

const app = createApp();

app.listen(config.port, () => {
  process.stdout.write(`Item Stock API listening on port ${config.port}\n`);
});
