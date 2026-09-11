CREATE UNIQUE INDEX "one_primary_resume_per_user"
ON "Resume" ("userId")
WHERE "isPrimary" = true;