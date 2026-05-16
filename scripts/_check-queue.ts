import { Queue } from 'bullmq';
import { redisConnectionConfig } from '../src/config/redis.js';

async function checkQueue() {
    const queue = new Queue('webhook_dispatch', { connection: redisConnectionConfig });
    const waiting = await queue.getWaitingCount();
    const delayed = await queue.getDelayedCount();
    const active = await queue.getActiveCount();
    const failed = await queue.getFailedCount();
    
    console.log(`webhook_dispatch queue status:`);
    console.log(`Waiting: ${waiting}`);
    console.log(`Delayed: ${delayed}`);
    console.log(`Active:  ${active}`);
    console.log(`Failed:  ${failed}`);
    process.exit(0);
}
checkQueue().catch(console.error);
