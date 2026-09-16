-- 规则命中后直接携带"修改建议 + 法律依据"，保证规则轨产出与 Agent 轨同构
ALTER TABLE "review_rules" ADD COLUMN "suggestion" TEXT;
ALTER TABLE "review_rules" ADD COLUMN "legal_basis" TEXT;
