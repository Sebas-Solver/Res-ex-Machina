CREATE TABLE "webhooks" (
	"webhook_id" uuid PRIMARY KEY NOT NULL,
	"agent_wallet" varchar(42) NOT NULL,
	"url" text NOT NULL,
	"secret" varchar(128) NOT NULL,
	"events" text[] DEFAULT ARRAY['state_changed']::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "provenance_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "fee_block" bigint;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "fee_confirmed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_webhooks_wallet" ON "webhooks" USING btree ("agent_wallet");--> statement-breakpoint
CREATE INDEX "idx_webhooks_active" ON "webhooks" USING btree ("active");