-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('FREE', 'PRO', 'ENT');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'USER', 'READONLY');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'PENDING');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "TraceStatus" AS ENUM ('RUNNING', 'OK', 'ERROR');

-- CreateEnum
CREATE TYPE "SpanType" AS ENUM ('LLM', 'TOOL', 'RETRIEVER');

-- CreateEnum
CREATE TYPE "EvalType" AS ENUM ('RISK_DETECT', 'RAG_RECALL', 'FAITHFULNESS');

-- CreateEnum
CREATE TYPE "EvalSource" AS ENUM ('MANUAL', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "EvalRunStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('LEGAL', 'TEMPLATE', 'GENERAL');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('UPLOADED', 'PARSING', 'READY', 'REVIEWING', 'WAITING_REVIEW', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClauseType" AS ENUM ('PARTIES', 'AMOUNT', 'TERM', 'BREACH', 'TERMINATION', 'GOVERNING_LAW', 'CONFIDENTIALITY', 'IP', 'OTHER');

-- CreateEnum
CREATE TYPE "ReviewTaskStatus" AS ENUM ('RUNNING', 'WAITING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('HIGH', 'MED', 'LOW');

-- CreateEnum
CREATE TYPE "RiskSource" AS ENUM ('RULE', 'AGENT', 'BOTH');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IGNORED', 'EDITED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "plan" "TenantPlan" NOT NULL DEFAULT 'FREE',
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "monthly_token_quota" INTEGER NOT NULL DEFAULT 500000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(100),
    "avatar" VARCHAR(500),
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "tenant_id" VARCHAR(50) NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(100),
    "dept" VARCHAR(100),
    "tech_level" VARCHAR(20),
    "primary_stack" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "current_goal" VARCHAR(500),
    "prefers_short" BOOLEAN NOT NULL DEFAULT false,
    "prefers_code" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_usage" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_cny" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quota_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL DEFAULT '新对话',
    "role" VARCHAR(50) NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT,
    "contract_id" TEXT,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "from_cache" BOOLEAN NOT NULL DEFAULT false,
    "feature" VARCHAR(50) NOT NULL DEFAULT 'chat',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traces" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "feature" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "TraceStatus" NOT NULL DEFAULT 'RUNNING',
    "model" VARCHAR(50),
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_cny" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spans" (
    "id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "type" "SpanType" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB,
    "output" JSONB,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_cny" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "spans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_cases" (
    "id" TEXT NOT NULL,
    "type" "EvalType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "input" JSONB NOT NULL,
    "expected" JSONB NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "EvalSource" NOT NULL DEFAULT 'MANUAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tenant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_runs" (
    "id" TEXT NOT NULL,
    "status" "EvalRunStatus" NOT NULL DEFAULT 'RUNNING',
    "summary" JSONB,
    "case_count" INTEGER NOT NULL DEFAULT 0,
    "pass_count" INTEGER NOT NULL DEFAULT 0,
    "commit_sha" VARCHAR(64),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "eval_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_results" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actual" JSONB,
    "judge_reason" TEXT,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "file_name" VARCHAR(300) NOT NULL,
    "doc_type" "DocType" NOT NULL DEFAULT 'GENERAL',
    "category" VARCHAR(50) NOT NULL DEFAULT '通用',
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "char_count" INTEGER NOT NULL DEFAULT 0,
    "preview" VARCHAR(500) NOT NULL,
    "tenant_id" TEXT,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "file_name" VARCHAR(300) NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'UPLOADED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "parse_error" TEXT,
    "fileType" VARCHAR(20) NOT NULL DEFAULT 'txt',
    "char_count" INTEGER NOT NULL DEFAULT 0,
    "clauses_count" INTEGER NOT NULL DEFAULT 0,
    "report_md" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clauses" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "index_no" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "clause_type" "ClauseType" NOT NULL DEFAULT 'OTHER',
    "metadata" JSONB,

    CONSTRAINT "clauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_tasks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "reviewer_id" TEXT,
    "status" "ReviewTaskStatus" NOT NULL DEFAULT 'RUNNING',
    "thread_id" VARCHAR(80) NOT NULL,
    "stats" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risks" (
    "id" TEXT NOT NULL,
    "review_task_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "clause_id" TEXT,
    "clause_title" VARCHAR(200),
    "quote" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "analysis" TEXT NOT NULL,
    "suggestion" TEXT,
    "legal_basis" TEXT,
    "refs" JSONB,
    "confidence" DOUBLE PRECISION,
    "detected_by" "RiskSource" NOT NULL DEFAULT 'AGENT',
    "rule_id" VARCHAR(50),
    "status" "RiskStatus" NOT NULL DEFAULT 'PENDING',
    "reviewer_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_rules" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MED',
    "category" VARCHAR(50) NOT NULL,
    "pattern" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prompt" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "resource_id" VARCHAR(100),
    "detail" JSONB,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "tenant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "desc" VARCHAR(500) NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "quota_usage_tenant_id_period_key" ON "quota_usage"("tenant_id", "period");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX "messages_session_id_idx" ON "messages"("session_id");

-- CreateIndex
CREATE INDEX "messages_user_id_idx" ON "messages"("user_id");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- CreateIndex
CREATE INDEX "traces_tenant_id_idx" ON "traces"("tenant_id");

-- CreateIndex
CREATE INDEX "traces_user_id_idx" ON "traces"("user_id");

-- CreateIndex
CREATE INDEX "traces_feature_idx" ON "traces"("feature");

-- CreateIndex
CREATE INDEX "traces_created_at_idx" ON "traces"("created_at");

-- CreateIndex
CREATE INDEX "spans_trace_id_idx" ON "spans"("trace_id");

-- CreateIndex
CREATE INDEX "spans_type_idx" ON "spans"("type");

-- CreateIndex
CREATE INDEX "eval_cases_type_active_idx" ON "eval_cases"("type", "active");

-- CreateIndex
CREATE INDEX "eval_results_run_id_idx" ON "eval_results"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "eval_results_run_id_case_id_key" ON "eval_results"("run_id", "case_id");

-- CreateIndex
CREATE INDEX "documents_tenant_id_idx" ON "documents"("tenant_id");

-- CreateIndex
CREATE INDEX "documents_doc_type_idx" ON "documents"("doc_type");

-- CreateIndex
CREATE INDEX "doc_chunks_document_id_idx" ON "doc_chunks"("document_id");

-- CreateIndex
CREATE INDEX "contracts_tenant_id_status_idx" ON "contracts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "clauses_contract_id_idx" ON "clauses"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "clauses_contract_id_index_no_key" ON "clauses"("contract_id", "index_no");

-- CreateIndex
CREATE UNIQUE INDEX "review_tasks_thread_id_key" ON "review_tasks"("thread_id");

-- CreateIndex
CREATE INDEX "review_tasks_tenant_id_status_idx" ON "review_tasks"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "review_tasks_contract_id_idx" ON "review_tasks"("contract_id");

-- CreateIndex
CREATE INDEX "risks_review_task_id_idx" ON "risks"("review_task_id");

-- CreateIndex
CREATE INDEX "risks_contract_id_idx" ON "risks"("contract_id");

-- CreateIndex
CREATE INDEX "risks_status_idx" ON "risks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "review_rules_code_key" ON "review_rules"("code");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_usage" ADD CONSTRAINT "quota_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traces" ADD CONSTRAINT "traces_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traces" ADD CONSTRAINT "traces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spans" ADD CONSTRAINT "spans_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "traces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "eval_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "eval_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_chunks" ADD CONSTRAINT "doc_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clauses" ADD CONSTRAINT "clauses_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_review_task_id_fkey" FOREIGN KEY ("review_task_id") REFERENCES "review_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_clause_id_fkey" FOREIGN KEY ("clause_id") REFERENCES "clauses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
