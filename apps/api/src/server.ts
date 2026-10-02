import { app } from './app.js';
import { startNotificationWorker } from './workers/notificationWorker.js';
import { startCronJobs } from './tasks/escalatePriorities.js';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Bytecode API listening on port ${PORT}`);
  startNotificationWorker();
  startCronJobs();
});
