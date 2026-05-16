import { webhookQueue } from '../src/services/webhookDispatcher.js';
import { logger } from '../src/utils/logger.js';

/**
 * Inspection script for webhook_dispatch queue.
 * Safe, read-only script. Checks if any legacy jobs with plaintext 'url' or 'secret' are present.
 */

async function inspectQueue() {
    logger.info('🔍 Inspecting webhook_dispatch queue...');
    
    const statuses: ('waiting' | 'delayed' | 'failed' | 'active' | 'paused')[] = [
        'waiting', 'delayed', 'failed', 'active', 'paused'
    ];

    let legacy_job_count = 0;
    const legacy_job_ids_sample: string[] = [];
    let active_job_count = 0;

    for (const status of statuses) {
        const jobs = await webhookQueue.getJobs([status]);
        logger.info(`Status [${status}]: ${jobs.length} jobs found`);

        if (status === 'active') {
            active_job_count += jobs.length;
        }

        for (const job of jobs) {
            // Check for legacy format
            if (job.data && (typeof job.data.secret === 'string' || typeof job.data.url === 'string')) {
                legacy_job_count++;
                if (legacy_job_ids_sample.length < 5 && job.id) {
                    legacy_job_ids_sample.push(job.id);
                }
            }
        }
    }

    // Strictly formatted output for the operator
    console.log('\n--- INSPECTION RESULTS ---');
    console.log(`legacy_job_count: ${legacy_job_count}`);
    console.log(`legacy_job_ids_sample: [${legacy_job_ids_sample.join(', ')}]`);
    console.log('--------------------------\n');

    if (legacy_job_count > 0) {
        logger.warn('⚠️  Legacy jobs containing plaintext secret/url were found.');
        console.log('INSTRUCTIONS:');
        console.log('1. DO NOT start the webhook worker.');
        if (active_job_count > 0) {
            console.log('2. Stop all active workers / ensure no webhook worker is running before obliterating.');
        } else {
            console.log('2. Manually purge/obliterate the webhook_dispatch queue using BullMQ UI/CLI.');
        }
        console.log('3. Re-run this inspection script.');
        console.log('4. Continue only when legacy_job_count = 0.');
    } else {
        logger.info('✅ No legacy jobs found. Safe to start the webhook worker.');
    }

    // Close the connection explicitly
    await webhookQueue.close();
    process.exit(0);
}

inspectQueue().catch(err => {
    logger.error({ error: err.message }, '❌ Error inspecting queue');
    process.exit(1);
});
