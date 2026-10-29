import 'dotenv/config';
import app from './app.js';
import { connectToDatabase } from './config/database.js';

const port = Number(process.env.PORT) || 5000;

await connectToDatabase();

app.listen(port, () => {
  console.info(`TruthLens API listening on http://localhost:${port}`);
});