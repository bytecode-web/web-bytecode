import { app } from './app.js';
import { startNotificationWorker } from './workers/notificationWorker.js';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Bytecode API listening on port ${PORT}`);
  startNotificationWorker();
});
