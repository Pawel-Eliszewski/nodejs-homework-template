import mongoose from "mongoose";
import app from "./app.js";

const SRV_PORT = process.env.PORT;
const SRV_DB = process.env.DATABASE_URL;

const connection = mongoose.connect(SRV_DB, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

connection
  .then(() => {
    app.listen(SRV_PORT, () =>
      console.log(`Database connection successful on port ${SRV_PORT}`)
    );
  })
  .catch((err) => {
    console.log(`Server not running. Error message: ${err.message}`);
    process.exit(1);
  });
