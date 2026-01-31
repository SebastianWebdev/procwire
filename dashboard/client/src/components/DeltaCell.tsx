/**
 * Colored delta display cell for comparison tables.
 */

import { Badge } from "@mantine/core";
import { IconArrowUp, IconArrowDown, IconMinus } from "@tabler/icons-react";

interface DeltaCellProps {
  value: number;
  percent: number;
  higherIsBetter: boolean;
  unit?: string;
}

function DeltaCell({
  percent,
  higherIsBetter,
}: DeltaCellProps) {
  // Determine if this is an improvement
  const isImprovement = higherIsBetter ? percent > 0 : percent < 0;
  const isRegression = higherIsBetter ? percent < -10 : percent > 10;
  const isUnchanged = Math.abs(percent) < 1;

  if (isUnchanged) {
    return (
      <Badge color="gray" variant="light" leftSection={<IconMinus size={12} />}>
        ~0%
      </Badge>
    );
  }

  const Icon = percent > 0 ? IconArrowUp : IconArrowDown;
  const color = isRegression ? "red" : isImprovement ? "green" : "gray";
  const sign = percent > 0 ? "+" : "";

  return (
    <Badge color={color} variant="light" leftSection={<Icon size={12} />}>
      {sign}
      {percent.toFixed(1)}%
    </Badge>
  );
}

export default DeltaCell;
