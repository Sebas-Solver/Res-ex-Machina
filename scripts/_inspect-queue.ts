import 'dotenv/config';
import { Queue } from 'bullmq';
import { redisConnectionConfig } from '../src/config/redis.js';

async function inspectQueue() {
    console.log(`Connecting to Redis at ${redisConnectionConfig.host || '127.0.0.1'}:${redisConnectionConfig.port || 6379}...`);
    const queue = new Queue('webhook_dispatch', { connection: redisConnectionConfig });
    
    try {
        const waiting = await queue.getWaitingCount();
        const delayed = await queue.getDelayedCount();
        const active = await queue.getActiveCount();
        const failed = await queue.getFailedCount();
        
        console.log(`\nQueue: webhook_dispatch`);
        console.log(`Waiting: ${waiting}`);
        console.log(`Delayed: ${delayed}`);
        console.log(`Active:  ${active}`);
        console.log(`Failed:  ${failed}`);

        const total = waiting + delayed + active + failed;
        
        let hasLegacyKeys = false;

        if (total > 0) {
            console.log('\nInspecting job data keys...');
            const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'failed']);
            for (const job of jobs) {
                if (!job) continue;
                const keys = Object.keys(job.data || {});
                if (keys.includes('secret') || keys.includes('url')) {
                    hasLegacyKeys = true;
                    console.log(`Job ${job.id} contains legacy keys: ${keys.filter(k => k === 'secret' || k === 'url').join(', ')}`);
                }
            }
        }

        if (hasLegacyKeys) {
            console.log('\n[!] Legacy keys found. Purging queue...');
            await queue.drain(true);
            await queue.clean(0, 1000, 'wait');
            await queue.clean(0, 1000, 'active');
            await queue.clean(0, 1000, 'delayed');
            await queue.clean(0, 1000, 'failed');
            console.log('Queue purged completely.');
        } else {
            console.log('\nNo legacy keys found or queue is empty.');
        }
    } catch (e) {
        console.error("Error inspecting queue:", e);
    } finally {
        await queue.close();
        process.exit(0);
    }
}

inspectQueue().catch(console.error);
