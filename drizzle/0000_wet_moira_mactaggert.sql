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
CREATE TABLE "records" (
	"record_id" uuid PRIMARY KEY NOT NULL,
	"content_hash" varchar(128) NOT NULL,
	"content_type" varchar(64),
	"visibility" varchar(32) DEFAULT 'proof_only' NOT NULL,
	"pog_bundle" jsonb NOT NULL,
	"nonce" varchar(64) NOT NULL,
	"agent_wallet" varchar(42) NOT NULL,
	"state" varchar(32) DEFAULT 'pending_anchor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"receipt_hash" varchar(128) NOT NULL,
	"tags" text[] DEFAULT '{}'::text[],
	"external_ref" text,
	"provenance_metadata" jsonb,
	"payment_attempt_id" uuid,
	"fee_amount" numeric(18, 8) NOT NULL,
	"fee_currency" varchar(8) NOT NULL,
	"fee_tx_hash" varchar(66),
	"fee_block" bigint,
	"fee_confirmed_at" timestamp with time zone,
	"anchor_tx_hash" varchar(66),
	"anchor_block" bigint,
	"anchor_chain_id" integer,
	"anchor_error_reason" text,
	"anchor_retries" integer DEFAULT 0 NOT NULL,
	"anchored_at" timestamp with time zone,
	CONSTRAINT "records_content_hash_unique" UNIQUE("content_hash"),
	CONSTRAINT "records_fee_tx_hash_unique" UNIQUE("fee_tx_hash"),
	CONSTRAINT "uq_wallet_nonce" UNIQUE("agent_wallet","nonce"),
	CONSTRAINT "chk_content_hash" CHECK ("records"."content_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "chk_state" CHECK ("records"."state" IN ('pending_anchor', 'anchored', 'anchor_failed')),
	CONSTRAINT "chk_visibility" CHECK ("records"."visibility" IN ('proof_only', 'input_hash_only', 'content_optional'))
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"webhook_id" uuid PRIMARY KEY NOT NULL,
	"agent_wallet" varchar(42) NOT NULL,
	"url" text NOT NULL,
	"secret_ciphertext" text,
	"secret_iv" varchar(24),
	"secret_auth_tag" varchar(32),
	"secret_key_version" integer,
	"events" text[] DEFAULT ARRAY['state_changed']::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_records_agent_lower" ON "records" USING btree (lower("agent_wallet"));--> statement-breakpoint
CREATE INDEX "idx_records_state" ON "records" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_records_created" ON "records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_records_fee_tx" ON "records" USING btree ("fee_tx_hash");--> statement-breakpoint
CREATE INDEX "idx_records_payment_attempt" ON "records" USING btree ("payment_attempt_id");--> statement-breakpoint
CREATE INDEX "idx_webhooks_wallet" ON "webhooks" USING btree ("agent_wallet");--> statement-breakpoint
CREATE INDEX "idx_webhooks_active" ON "webhooks" USING btree ("active");