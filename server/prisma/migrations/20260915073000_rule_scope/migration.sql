-- 规则适用范围：ALL=所有合同，LABOR=劳动/用工类合同
ALTER TABLE "review_rules" ADD COLUMN "scope" VARCHAR(20) NOT NULL DEFAULT 'ALL';
