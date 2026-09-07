import { EventEmitter } from 'events';

class NotificationEmitter extends EventEmitter {}

export const notificationEmitter = new NotificationEmitter();

export const EVENTS = {
  NEW_NOTIFICATION: 'new_notification'
};
