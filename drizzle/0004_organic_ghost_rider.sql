ALTER TABLE "webhooks" ALTER COLUMN "secret" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "secret_iv" varchar(24);--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "secret_auth_tag" varchar(32);--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "secret_key_version" integer;