import 'dotenv/config';
import { Queue } from 'bullmq';
import { redisConnectionConfig } from '../src/config/redis.js';

async function inspectQueue() {
    const isPurgeRequested = process.argv.includes('--purge-legacy');
    
    console.log(`Connecting to Redis at ${redisConnectionConfig.host || '127.0.0.1'}:${redisConnectionConfig.port || 6379}...`);
    const queue = new Queue('webhook_dispatch', { connection: redisConnectionConfig });
    
    try {
        const waiting = await queue.getWaitingCount();
        const delayed = await queue.getDelayedCount();
        const active = await queue.getActiveCount();
        const failed = await queue.getFailedCount();
        const paused = await queue.getJobCountByTypes('paused');
        
        console.log(`\nwebhook_dispatch queue:`);
        console.log(`waiting: ${waiting}`);
        console.log(`delayed: ${delayed}`);
        console.log(`active:  ${active}`);
        console.log(`failed:  ${failed}`);
        console.log(`paused:  ${paused}`);

        const total = waiting + delayed + active + failed + paused;
        
        let jobsWithSecretKey = 0;
        let jobsWithUrlKey = 0;
        let jobsWithCryptoMaterial = 0;
        let hasLegacyKeys = false;

        if (total > 0) {
            const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'failed', 'paused']);
            for (const job of jobs) {
                if (!job) continue;
                const keys = Object.keys(job.data || {});
                
                const hasSecret = keys.includes('secret');
                const hasUrl = keys.includes('url');
                const hasCrypto = keys.includes('secret_ciphertext') || keys.includes('secret_iv') || keys.includes('secret_auth_tag');
                
                if (hasSecret) jobsWithSecretKey++;
                if (hasUrl) jobsWithUrlKey++;
                if (hasCrypto) jobsWithCryptoMaterial++;
                
                if (hasSecret || hasUrl) {
                    hasLegacyKeys = true;
                }
            }
        }

        console.log(`\nlegacy job data:`);
        console.log(`jobs_with_secret_key: ${jobsWithSecretKey}`);
        console.log(`jobs_with_url_key: ${jobsWithUrlKey}`);
        console.log(`jobs_with_crypto_material: ${jobsWithCryptoMaterial}`);
        
        console.log('\nNo values printed.');

        if (hasLegacyKeys) {
            if (!isPurgeRequested) {
                console.log('\n[!] Legacy keys detected. Run with --purge-legacy to remove legacy jobs.');
                console.log('    Note: If there are active jobs, consider pausing the queue or stopping workers before purging.');
            } else {
                if (active > 0) {
                    console.warn('\n⚠️ WARNING: There are active jobs currently being processed.');
                    console.warn('Blindly purging while jobs are active may result in inconsistent state.');
                    console.warn('Please pause the queue or stop workers before purging.');
                }
                
                console.log('\n[!] --purge-legacy flag provided. Obliterating the webhook_dispatch queue entirely.');
                await queue.drain(true); // Stop taking new jobs during clean
                await queue.clean(0, 1000, 'wait');
                await queue.clean(0, 1000, 'active');
                await queue.clean(0, 1000, 'delayed');
                await queue.clean(0, 1000, 'failed');
                await queue.clean(0, 1000, 'paused');
                console.log('✅ Queue obliterated successfully.');
            }
        } else {
            console.log('\n✅ No legacy keys detected. Safe to start worker.');
        }

    } catch (e) {
        console.error("\n❌ Error inspecting queue:", e);
    } finally {
        await queue.close();
        process.exit(0);
    }
}

inspectQueue().catch(console.error);
