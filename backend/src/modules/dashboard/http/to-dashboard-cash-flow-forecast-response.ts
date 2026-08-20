import type { CashFlowForecast, ForecastBucket } from '../../analytics/domain/types.js';
import type {
  DashboardCashFlowForecastResponse,
  DashboardForecastBucket,
} from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

export function toDashboardCashFlowForecastResponse(
  forecast: CashFlowForecast,
): DashboardCashFlowForecastResponse {
  return {
    today: serializeCivilDate(forecast.today),
    from: serializeCivilDate(forecast.from),
    to: serializeCivilDate(forecast.to),
    horizonDays: forecast.horizonDays,
    buckets: forecast.buckets.map(toBucket),
  };
}

function toBucket(bucket: ForecastBucket): DashboardForecastBucket {
  return {
    key: bucket.key,
    inflows: serializeDecimal(bucket.inflows),
    outflows: serializeDecimal(bucket.outflows),
    net: serializeDecimal(bucket.net),
  };
}
