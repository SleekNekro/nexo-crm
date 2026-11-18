'use client';
import { useBusinessSettings } from '../hooks/use-business-settings';
import { phaseFor } from '../../domain/business-settings';
import type { Deal } from '../../domain/model';
export default function StageLabel({ deal }: { deal: Deal }) {
  return <>{phaseFor(deal, useBusinessSettings())?.label || deal.stage}</>;
}
