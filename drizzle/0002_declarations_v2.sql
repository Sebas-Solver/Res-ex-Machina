CREATE TABLE "declarations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"digest" varchar(66) NOT NULL,
	"agent" varchar(42) NOT NULL,
	"nonce" varchar(66) NOT NULL,
	"content_hash" varchar(66) NOT NULL,
	"declaration" jsonb NOT NULL,
	"signature" varchar(132) NOT NULL,
	"metadata" jsonb,
	"chain_id" integer NOT NULL,
	"contract" varchar(42) NOT NULL,
	"agent_id_scheme" smallint NOT NULL,
	"agent_id" varchar(66) NOT NULL,
	"state" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"anchor_tx_hash" varchar(66),
	"anchor_log_index" integer,
	"anchor_block" bigint,
	"anchor_block_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anchored_at" timestamp with time zone,
	CONSTRAINT "declarations_digest_unique" UNIQUE("digest"),
	CONSTRAINT "uq_declarations_agent_nonce" UNIQUE("agent","nonce"),
	CONSTRAINT "chk_declarations_state" CHECK ("declarations"."state" IN ('pending', 'anchoring', 'anchored', 'failed')),
	CONSTRAINT "chk_declarations_hex" CHECK ("declarations"."digest" ~ '^0x[0-9a-f]{64}$' AND "declarations"."agent" ~ '^0x[0-9a-f]{40}$')
);
--> statement-breakpoint
CREATE INDEX "idx_declarations_agent_created" ON "declarations" USING btree ("agent","created_at");--> statement-breakpoint
CREATE INDEX "idx_declarations_content_hash" ON "declarations" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "idx_declarations_state" ON "declarations" USING btree ("state");