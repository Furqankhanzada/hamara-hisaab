ALTER TABLE "accounts" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- backfill: accounts never recorded a creator; assign the household's oldest member
UPDATE "accounts" a SET "user_id" = (
  SELECT u."id" FROM "user" u
  WHERE u."household_id" = a."household_id"
  ORDER BY u."created_at" ASC LIMIT 1
) WHERE a."user_id" IS NULL;