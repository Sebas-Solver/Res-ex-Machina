CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" varchar(255),
	"payment_identifier" varchar(255),
	"method" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"content_hash" varchar(128) NOT NULL,
	"record_id" uuid,
	"amount_atomic" varchar(255),
	"decimals" varchar(10),
	"currency" varchar(50),
	"tx_hash" varchar(255),
	"receipt" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "idx_pa_payment_identifier" UNIQUE NULLS NOT DISTINCT("payment_identifier")
);
--> statement-breakpoint
DROP INDEX "idx_records_agent";--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "payment_attempt_id" uuid;--> statement-breakpoint
CREATE INDEX "idx_records_agent_lower" ON "records" USING btree (lower("agent_wallet"));--> statement-breakpoint
CREATE INDEX "idx_records_payment_attempt" ON "records" USING btree ("payment_attempt_id");