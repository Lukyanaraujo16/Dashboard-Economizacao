export type DashboardOverviewMoneySnapshot = {
  readonly open: string;
  readonly overdue: string;
  readonly upcoming: string;
};

export type DashboardOverviewDelinquency = {
  readonly overdueUnpaid: string;
  readonly openUnpaid: string;
  readonly rate: string | null;
};

export type DashboardOverviewIntegration = {
  readonly status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  readonly lastSuccessfulSyncAt: string | null;
  readonly lastErrorCode: string | null;
};

export type DashboardOverviewResponse = {
  readonly today: string;
  readonly receivables: DashboardOverviewMoneySnapshot;
  readonly payables: DashboardOverviewMoneySnapshot;
  readonly delinquency: DashboardOverviewDelinquency;
  readonly integration: DashboardOverviewIntegration;
};
