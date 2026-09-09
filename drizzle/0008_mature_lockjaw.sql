ALTER TABLE "loan_payments" ADD COLUMN "kind" text DEFAULT 'repayment' NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "due_date" date;