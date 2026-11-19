export interface InvoiceRecord {
  id: string;
  clientId: string;
  amountCents: number;
  status: 'draft' | 'issued' | 'paid' | 'overdue' | 'void';
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  clientId: string;
  amountCents: number;
}

export interface ExpenseRecord {
  id: string;
  clientId: string | null;
  projectId: string | null;
  category: string;
  amountCents: number;
  isEstimate: boolean;
}

export interface UsageCostRecord {
  id: string;
  clientId: string | null;
  projectId: string | null;
  costUsd: number;
}

export interface FinancialSummary {
  totalInvoicedCents: number;
  totalCollectedCents: number;
  outstandingCents: number;
  actualExpenseCents: number;
  estimatedExpenseCents: number;
  aiUsageCostCents: number;
  totalActualCostCents: number;
  netActualProfitCents: number;
  profitMarginPercent: number | null;
}

export function calculateFinancialSummary(input: {
  invoices: readonly InvoiceRecord[];
  payments: readonly PaymentRecord[];
  expenses: readonly ExpenseRecord[];
  usageRecords: readonly UsageCostRecord[];
}): FinancialSummary {
  const totalInvoicedCents = input.invoices
    .filter((inv) => inv.status !== 'void' && inv.status !== 'draft')
    .reduce((sum, inv) => sum + inv.amountCents, 0);

  const totalCollectedCents = input.payments.reduce((sum, p) => sum + p.amountCents, 0);
  const outstandingCents = Math.max(0, totalInvoicedCents - totalCollectedCents);

  const actualExpenseCents = input.expenses
    .filter((e) => !e.isEstimate)
    .reduce((sum, e) => sum + e.amountCents, 0);

  const estimatedExpenseCents = input.expenses
    .filter((e) => e.isEstimate)
    .reduce((sum, e) => sum + e.amountCents, 0);

  const aiUsageCostCents = Math.round(
    input.usageRecords.reduce((sum, u) => sum + u.costUsd * 100, 0)
  );

  const totalActualCostCents = actualExpenseCents + aiUsageCostCents;
  const netActualProfitCents = totalCollectedCents - totalActualCostCents;
  const profitMarginPercent =
    totalCollectedCents > 0
      ? Math.round((netActualProfitCents / totalCollectedCents) * 10000) / 100
      : null;

  return {
    totalInvoicedCents,
    totalCollectedCents,
    outstandingCents,
    actualExpenseCents,
    estimatedExpenseCents,
    aiUsageCostCents,
    totalActualCostCents,
    netActualProfitCents,
    profitMarginPercent,
  };
}

// Documented rate card (USD per 1M tokens) for transparent cost accounting
const MODEL_RATE_CARD_PER_1M: Record<string, { input: number; output: number }> = {
  'gemini-4-hydrogen': { input: 0.15, output: 0.6 },
  'gemini-3.1-flash-lite': { input: 0.075, output: 0.3 },
  'gemini-4-neon': { input: 1.25, output: 5.0 },
  'gemini-4-carbon': { input: 2.5, output: 10.0 },
  'gemini-3.1-flash-lite-image': { input: 0.15, output: 30.0 },
  'gemini-nano-banana-2.1': { input: 0.5, output: 60.0 },
};

export function calculateAiUsageCostUsd(
  model: string,
  promptTokens: number,
  outputTokens: number
): { costUsd: number; rateCardFound: boolean } {
  const rate = MODEL_RATE_CARD_PER_1M[model];
  if (!rate) {
    return { costUsd: 0, rateCardFound: false };
  }
  const inputCost = (Math.max(0, promptTokens) / 1_000_000) * rate.input;
  const outputCost = (Math.max(0, outputTokens) / 1_000_000) * rate.output;
  return {
    costUsd: Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000,
    rateCardFound: true,
  };
}

export function formatCurrencyCents(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}
