// backend/src/services/nominatimQueue.js
import PQueue from "p-queue";

const MAX_QUEUE_SIZE = 15;

export const nominatimQueue = new PQueue({
  concurrency: 1,
  interval: 1000,
  intervalCap: 1
});

export function canEnqueue() {
  return nominatimQueue.size < MAX_QUEUE_SIZE;
}

export function getQueueStats() {
  return {
    size: nominatimQueue.size,
    pending: nominatimQueue.pending,
    maxSize: MAX_QUEUE_SIZE
  };
}